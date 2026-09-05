/**
 * La credencial de paso de la pantalla "Confirma tu número": una cookie
 * FIRMADA por el servidor (spec `registro-negocio` de T-016; design.md §3).
 *
 * Por qué una cookie y no la URL ni un campo del formulario:
 *
 * - **En la URL** el identificador del negocio quedaría en el historial del
 *   teléfono y en el log de acceso de cualquier proxy, y —peor— quien
 *   consiguiera un identificador podría abrir esa pantalla y quemar los
 *   intentos de una ficha ajena.
 * - **Como campo del formulario** volvería como el cliente quiera: es el mismo
 *   hallazgo que obligó a reconstruir la ruta de la ficha en el formulario de
 *   reporte en vez de ligarla a la acción.
 *
 * Formato `<contenido en base64url>.<firma>`, con HMAC-SHA256 hecho con
 * `VERIFICACION_SMS_SECRETO` —un secreto PROPIO, no el del panel ni el token
 * del proveedor (design.md §3)—. Se compara en tiempo constante, igual que la
 * sesión del panel.
 *
 * Qué guarda: SOLO el identificador del negocio y los CUATRO ÚLTIMOS dígitos
 * del número (para pintar la explicación sin guardar el número entero). Qué NO
 * guarda: el número completo, ningún código —lo genera, lo caduca y lo compara
 * el proveedor (ADR-011)— y, desde el hallazgo [C-2] de la etapa C, **ningún
 * contador**.
 *
 * POR QUÉ NINGÚN CONTADOR (la corrección de [C-2]): los intentos, los reenvíos
 * y la marca del último envío vivían aquí dentro. La firma impide FABRICAR una
 * cookie, pero no impide REUSAR la que el propio servidor emitió: guardando la
 * primera (`intentos: 0`, `reenvios: 0`) y reenviándola siempre, los tres
 * contadores se rebobinaban, y con `REGISTRO_ENCABEZADO_IP` sin declarar eso
 * bastaba para consumir el tope diario global entero desde un solo registro.
 * Ahora los tres topes se cuentan en el servidor
 * (`limites.ts`, sobre el almacén compartido ya auditado), así que esta cookie
 * es solo una CREDENCIAL DE PASO —dice de qué ficha se trata— y rebobinarla no
 * consigue absolutamente nada.
 *
 * Caducidad de 15 minutos: holgada frente a la del código del proveedor (10
 * minutos por defecto en Verify) y corta frente a un celular compartido. Es la
 * MISMA ventana que la de los topes por registro, y viene de allá para que las
 * dos no se puedan separar por descuido.
 *
 * Módulo puro (`node:crypto` y nada más): no lee cookies ni redirige.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import { VENTANA_TOPES_POR_REGISTRO_MS } from "./limites";

/** Nombre neutro, con el mismo prefijo que las demás: no anuncia qué guarda. */
export const COOKIE_PASO = "nu_paso";

/** La cookie no viaja a ninguna otra ruta del sitio. */
export const RUTA_COOKIE_PASO = "/registro/verificar";

/** 15 minutos (design.md §3), la misma ventana que los topes por registro. */
export const DURACION_PASO_MS = VENTANA_TOPES_POR_REGISTRO_MS;

/** Versión del formato; entra en el HMAC para poder rotarlo sin ambigüedad. */
const VERSION_FORMATO = "v1";

export type PasoVerificacion = {
  negocioId: string;
  /** Los últimos 4 dígitos del WhatsApp — nunca el número completo. */
  ultimosCuatroDigitos: string;
  /** Cuándo se creó la credencial, para la caducidad. */
  creadaEnMs: number;
};

/** Los cuatro últimos dígitos del número, o lo que haya si es más corto. */
export function ultimosCuatroDigitos(numero: string): string {
  return numero.slice(-4);
}

export function crearPasoInicial(
  negocioId: string,
  numero: string,
  ahora: Date = new Date(),
): PasoVerificacion {
  return {
    negocioId,
    ultimosCuatroDigitos: ultimosCuatroDigitos(numero),
    creadaEnMs: ahora.getTime(),
  };
}

function firma(contenido: string, secreto: string): string {
  return createHmac("sha256", secreto)
    .update(`${VERSION_FORMATO}.${contenido}`)
    .digest("base64url");
}

/** Comparación en tiempo constante, igual que la sesión del panel. */
function firmasIguales(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/** El valor de la cookie para este paso. */
export function firmarPaso(paso: PasoVerificacion, secreto: string): string {
  const contenido = Buffer.from(JSON.stringify(paso), "utf8").toString("base64url");
  return `${contenido}.${firma(contenido, secreto)}`;
}

/** ¿Este objeto tiene de verdad la forma de un paso? */
function tieneForma(datos: unknown): datos is PasoVerificacion {
  if (typeof datos !== "object" || datos === null) return false;
  const paso = datos as Record<string, unknown>;
  return (
    typeof paso.negocioId === "string" &&
    paso.negocioId !== "" &&
    typeof paso.ultimosCuatroDigitos === "string" &&
    typeof paso.creadaEnMs === "number"
  );
}

/**
 * El paso que trae esta cookie, o `null`.
 *
 * Cualquier fallo —sin cookie, firma alterada, firmada con otro secreto,
 * formato raro, caducada— se trata IGUAL y devuelve `null`: la respuesta nunca
 * distingue el motivo, y quien está afuera no se entera de si ese registro
 * existe (requirement "la pantalla no se abre de a gratis").
 */
export function leerPaso(
  valor: string | null | undefined,
  secreto: string,
  ahora: Date = new Date(),
): PasoVerificacion | null {
  if (!valor) return null;

  const partes = valor.split(".");
  if (partes.length !== 2) return null;
  const [contenido, firmaRecibida] = partes;
  if (!firmasIguales(firma(contenido, secreto), firmaRecibida)) return null;

  let datos: unknown;
  try {
    datos = JSON.parse(Buffer.from(contenido, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!tieneForma(datos)) return null;

  if (ahora.getTime() - datos.creadaEnMs >= DURACION_PASO_MS) return null;
  return datos;
}

/**
 * Atributos de la cookie. `Path` acotado a la pantalla del código: no viaja a
 * ninguna otra ruta del sitio, ni siquiera a `/registro`.
 */
export function opcionesCookiePaso(esHttps: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: RUTA_COOKIE_PASO,
    maxAge: DURACION_PASO_MS / 1000,
    secure: esHttps,
  };
}
