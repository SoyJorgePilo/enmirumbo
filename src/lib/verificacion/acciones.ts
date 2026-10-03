/**
 * Lo que hacen las dos acciones de `/registro/verificar`: leer la cookie de
 * paso, llamar al flujo y decidir a dónde va el dueño (spec
 * `registro-negocio` de T-016, tasks.md #11 y #12).
 *
 * Vive aquí y NO en el archivo `"use server"` a propósito: en un módulo con
 * esa directiva, **todo lo exportado se convierte en un endpoint** al que el
 * navegador puede llamar con los argumentos que quiera. Estas funciones
 * reciben sus dependencias —prisma, proveedor, configuración— por parámetro
 * para poder probarlas, y eso es justo lo que no debe ser un endpoint. Los
 * archivos `accion-*.ts` de la ruta son envolturas de pocas líneas que arman
 * las dependencias del entorno y llaman aquí.
 *
 * SIN NEXT (change `migrar-registro-astro`, design.md §4): las cabeceras y el
 * almacén de cookies llegan por parámetro, y en vez de lanzar
 * `redirect()`/`notFound()` se DEVUELVE un destino cerrado
 * (`DestinoVerificacion`) que traduce quien sirve la petición: los
 * envoltorios de Next con `redirect`/`notFound`, y Astro con su 303 o su 404.
 * La lógica, los destinos, los códigos de error, el borrado de la cookie y el
 * orden son los de antes.
 *
 * Todo es POST → 303 → GET, el patrón sin JavaScript que ya usan el panel y
 * el formulario de reporte: recargar cualquier pantalla no repite ninguna
 * acción ni cuesta un SMS.
 *
 * Sin cookie de paso válida las dos acciones responden "no encontrado",
 * igual que la página: no se confirma si ese registro existe.
 */

import { ipDeEncabezados } from "@/lib/registro/limite-ip";
import { obtenerPrisma } from "@/lib/prisma";

import { leerConfiguracionVerificacion } from "./config";
import {
  confirmarCodigo,
  reenviarCodigo,
  type ClienteVerificacion,
  type ContextoVerificacion,
} from "./flujo";
import { COOKIE_PASO, leerPaso, opcionesCookiePaso } from "./paso";
import { proveedorDeVerificacion } from "./proveedor";

/** Todo lo que las acciones necesitan de fuera. */
export type DependenciasVerificacion = {
  prisma: ClienteVerificacion;
  contexto: ContextoVerificacion;
  /** ¿El sitio se está sirviendo por HTTPS? (atributo `Secure` de la cookie). */
  esHttps: boolean;
};

/** A dónde se vuelve con un error del código, y a dónde se sale. */
const RUTA_VERIFICAR = "/registro/verificar";
const RUTA_GRACIAS = "/registro/gracias";

/** A dónde va el dueño: una ruta del sitio (303) o la página de no encontrado. */
export type DestinoVerificacion = { tipo: "redirigir"; ruta: string } | { tipo: "no-encontrado" };

const redirigir = (ruta: string): DestinoVerificacion => ({ tipo: "redirigir", ruta });
const NO_ENCONTRADO: DestinoVerificacion = { tipo: "no-encontrado" };

/**
 * Las dependencias reales, armadas del entorno y de las cabeceras de la
 * petición. Devuelve `null` con la capacidad apagada o mal configurada:
 * entonces las acciones responden como cualquier dirección inventada del
 * sitio.
 */
export async function dependenciasDeVerificacion(
  encabezados: Headers,
): Promise<DependenciasVerificacion | null> {
  const configuracion = leerConfiguracionVerificacion();
  if (!configuracion) return null;

  const protocolo = encabezados.get("x-forwarded-proto")?.split(",")[0]?.trim();

  const prisma = obtenerPrisma();
  return {
    prisma,
    contexto: {
      proveedor: await proveedorDeVerificacion(configuracion),
      // El mismo Prisma, visto por el almacén compartido de cupos: ahí viven
      // los topes por registro desde el hallazgo [C-2].
      cupos: prisma,
      secreto: configuracion.secreto,
      topeDiario: configuracion.topeDiario,
      ip: ipDeEncabezados(encabezados),
    },
    esHttps:
      protocolo === "https" ||
      process.env.NODE_ENV === "production" ||
      process.env.VERCEL_ENV === "production",
  };
}

/**
 * Lo poco que estas funciones necesitan del almacén de cookies: lo cumplen
 * `cookies()` de Next y `Astro.cookies` adaptado.
 */
export type AlmacenCookies = {
  get(nombre: string): { value: string } | undefined;
  set(nombre: string, valor: string, opciones: Record<string, unknown>): void;
};

/**
 * Borra la cookie de paso. Se llama cuando ya no hay pantalla del código a la
 * que volver: se confirmó, o se acabaron los intentos o los reenvíos.
 */
function borrarPaso(almacen: AlmacenCookies, dependencias: DependenciasVerificacion): void {
  almacen.set(COOKIE_PASO, "", {
    ...opcionesCookiePaso(dependencias.esHttps),
    maxAge: 0,
  });
}

/** "Confirmar mi número". */
export async function ejecutarConfirmacion(
  formData: FormData,
  dependencias: DependenciasVerificacion | null,
  almacen: AlmacenCookies,
): Promise<DestinoVerificacion> {
  if (!dependencias) return NO_ENCONTRADO;
  const paso = leerPaso(
    almacen.get(COOKIE_PASO)?.value,
    dependencias.contexto.secreto,
    dependencias.contexto.ahora,
  );
  if (!paso) return NO_ENCONTRADO;

  // Lo que llega del formulario es tan hostil como cualquier entrada: un
  // `File` colado en el campo `codigo` no es una cadena y no se le manda a
  // nadie.
  const enviado = formData.get("codigo");
  const codigo = typeof enviado === "string" ? enviado.trim() : "";

  const { resultado } = await confirmarCodigo(
    dependencias.prisma,
    paso,
    codigo,
    dependencias.contexto,
  );

  if (resultado === "confirmado") {
    borrarPaso(almacen, dependencias);
    // `verificado=1` es una bandera de PRESENTACIÓN: sin dato personal, sin
    // identificador y sin el código.
    return redirigir(`${RUTA_GRACIAS}?verificado=1`);
  }

  // Una credencial de paso de una ficha que ya no existe no se distingue de
  // una inválida: mismo 404, sin decir si ese registro existe.
  if (resultado === "sin-ficha") return NO_ENCONTRADO;

  // Se acabaron los 5 códigos de este registro. El conteo lo lleva el servidor
  // (hallazgo [C-2]), así que ya no hay cookie que rebobinar para revivirlos.
  if (resultado === "agotado") {
    borrarPaso(almacen, dependencias);
    return redirigir(`${RUTA_GRACIAS}?agotado=1`);
  }

  // La cookie no se reescribe: ya no lleva contadores, así que no tiene nada
  // que actualizar. Sigue viva hasta sus 15 minutos.
  return redirigir(`${RUTA_VERIFICAR}?error=${ERROR_EN_LA_URL[resultado]}`);
}

/**
 * Los desenlaces, traducidos al código cerrado que viaja por la URL. Nunca el
 * código, el número ni el identificador de la ficha, y nada del proveedor: la
 * pantalla convierte esto en el literal en español que corresponde.
 */
const ERROR_EN_LA_URL = {
  incompleto: "incompleto",
  "no-coincide": "no-coincide",
  vencido: "vencido",
  "error-proveedor": "proveedor",
} as const;

/** "Reenviar el código". */
export async function ejecutarReenvio(
  dependencias: DependenciasVerificacion | null,
  almacen: AlmacenCookies,
): Promise<DestinoVerificacion> {
  if (!dependencias) return NO_ENCONTRADO;
  const paso = leerPaso(
    almacen.get(COOKIE_PASO)?.value,
    dependencias.contexto.secreto,
    dependencias.contexto.ahora,
  );
  if (!paso) return NO_ENCONTRADO;

  const resultado = await reenviarCodigo(dependencias.prisma, paso, dependencias.contexto);

  if (resultado.resultado === "enviado") {
    // Nada que reescribir en la cookie: el reenvío ya quedó apuntado en el
    // servidor. Se vuelve a la pantalla, limpia.
    return redirigir(RUTA_VERIFICAR);
  }

  if (resultado.resultado === "sin-ficha") return NO_ENCONTRADO;

  // Se acabaron los 2 reenvíos: mismo destino y mismo mensaje que agotar los 5
  // intentos de código (requirement "Al agotarse cualquiera de los dos…").
  if (resultado.resultado === "agotado") {
    borrarPaso(almacen, dependencias);
    return redirigir(`${RUTA_GRACIAS}?agotado=1`);
  }

  return redirigir(`${RUTA_VERIFICAR}?errorReenvio=${resultado.resultado}`);
}
