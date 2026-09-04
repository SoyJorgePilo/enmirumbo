/**
 * Procesamiento de un envío del formulario público de registro
 * (spec `registro-negocio`). Es el corazón de la Server Action, separado de
 * ella para poder probarlo sin un request de Next.js: la acción
 * (`src/app/registro/accion.ts`) solo saca la IP de los encabezados, llama
 * aquí y redirige.
 *
 * Orden de las defensas (PRD §8 y design.md §4-§5):
 *   1. campo trampa (honeypot) → se finge éxito sin guardar;
 *   2. cupo de la IP;
 *   3. validación y normalización de todo campo;
 *   4. una sola ficha por número (consulta previa + constraint de la base),
 *      con una excepción: si esa ficha está `rechazado`, el envío no es un
 *      duplicado sino una corrección, y actualiza la ficha existente
 *      (design.md §6 del change `agregar-panel-admin`);
 *   4.5 procesar y guardar la foto (change `agregar-foto-negocio`, design.md
 *      §5): hasta aquí no se ha abierto ni un byte de imagen, así que un bot
 *      —campo trampa, IP sin cupo— o un duplicado nunca cuestan CPU de
 *      imagen ni dejan archivos;
 *   5. alta con estado, origen y constancia de consentimiento puestos aquí.
 *
 * La base es la que manda y el almacén es lo que se compensa: si la escritura
 * no se concreta, la clave recién guardada se borra (nada de huérfanos).
 *
 * Ningún dato capturado (número, nombre, dirección) se escribe en el log:
 * solo eventos y conteos (design.md §7).
 */

import { datosDeBusqueda } from "@/lib/busqueda";
import { almacenDeFotos, type AlmacenFotos } from "@/lib/fotos/almacen";
import { generarClaveFoto } from "@/lib/fotos/clave";
import { procesarFoto } from "@/lib/fotos/procesar";
import {
  ESTADO_NEGOCIO_DEFAULT,
  ESTADO_NEGOCIO_RECHAZADO,
  ORIGEN_NEGOCIO_DEFAULT,
} from "@/lib/negocio";

import { ipBloqueada, registrarAlta } from "./limite-ip";
import {
  AVISO_FOTO_NO_GUARDADA,
  MENSAJES_ERROR_FOTO,
  MENSAJES_ERROR_REGISTRO,
} from "./textos";
import type { ErroresFormularioRegistro, EstadoAccionRegistro } from "./tipos";
import {
  leerEnvioRegistro,
  recortarParaEco,
  validarRegistro,
} from "./validacion";

/** Lo único que este módulo necesita de Prisma (facilita probarlo). */
export type ClienteRegistro = {
  categoria: { findMany(): Promise<Array<{ id: number }>> };
  colonia: { findMany(): Promise<Array<{ id: number }>> };
  negocio: {
    findUnique(args: {
      where: { whatsapp: string };
      select: { id: true; estado: true; fotoClave: true };
    }): Promise<{ id: string; estado: string; fotoClave: string | null } | null>;
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
    updateMany(args: {
      where: { id: string; estado: string };
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
    count(args: { where: { registradoEn: { gte: Date } } }): Promise<number>;
  };
};

export type ContextoRegistro = {
  prisma: ClienteRegistro;
  /** IP del cliente según los encabezados de reenvío; `null` si no hay. */
  ip: string | null;
  /** Momento del envío; se inyecta en pruebas. */
  ahora?: Date;
  /** Altas diarias a partir de las cuales se deja una alerta en el log. */
  umbralAltasDiarias?: number;
  /** Dónde caen los archivos de la foto; se inyecta en pruebas (ADR-006). */
  almacen?: AlmacenFotos;
};

export type ResultadoRegistro =
  | { exito: true }
  | { exito: false; estado: EstadoAccionRegistro };

/** Umbral por defecto de altas en un día antes de sospechar (PRD §8). */
const UMBRAL_ALTAS_DIARIAS_DEFAULT = 30;

function umbralConfigurado(contexto: ContextoRegistro): number {
  if (typeof contexto.umbralAltasDiarias === "number") {
    return contexto.umbralAltasDiarias;
  }
  const delEntorno = Number(process.env.REGISTRO_UMBRAL_ALTAS_DIARIAS);
  return Number.isFinite(delEntorno) && delEntorno > 0
    ? delEntorno
    : UMBRAL_ALTAS_DIARIAS_DEFAULT;
}

/** Choque con la constraint de unicidad de Prisma. */
function esNumeroDuplicado(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/** Identificación del fallo apta para el log: nunca datos del negocio. */
function resumenDeError(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    return `código ${String((error as { code?: unknown }).code)}`;
  }
  return error instanceof Error ? error.name : "desconocido";
}

function inicioDelDia(ahora: Date): Date {
  const inicio = new Date(ahora);
  inicio.setHours(0, 0, 0, 0);
  return inicio;
}

/**
 * Alerta al admin del PRD §8, versión MVP: una advertencia en el log del
 * servidor cuando las altas del día pasan del umbral. No bloquea a nadie; el
 * canal de aviso real llega con el panel (E3).
 */
async function avisarSiHayDemasiadasAltas(
  contexto: ContextoRegistro,
  ahora: Date,
): Promise<void> {
  const umbral = umbralConfigurado(contexto);
  try {
    const altasDeHoy = await contexto.prisma.negocio.count({
      where: { registradoEn: { gte: inicioDelDia(ahora) } },
    });
    if (altasDeHoy > umbral) {
      console.warn(
        `[registro] alerta: ${altasDeHoy} altas hoy superan el umbral de ${umbral}; revisa la cola por si es abuso.`,
      );
    }
  } catch (error) {
    // El conteo es solo para la alerta: si falla, el alta ya se guardó.
    console.warn(`[registro] no se pudo contar las altas del día: ${resumenDeError(error)}`);
  }
}

/**
 * Borra una clave sin dejar que el fallo del almacén tape el resultado que el
 * dueño va a ver: si no se pudo limpiar, queda en el log y ya.
 */
async function limpiarClave(almacen: AlmacenFotos, clave: string | null): Promise<void> {
  if (!clave) return;
  try {
    await almacen.borrar(clave);
  } catch (error) {
    console.error(
      `[registro] quedó una foto sin dueño en el almacén: ${resumenDeError(error)}`,
    );
  }
}

export async function procesarRegistro(
  formData: FormData,
  contexto: ContextoRegistro,
): Promise<ResultadoRegistro> {
  const ahora = contexto.ahora ?? new Date();
  const almacen = contexto.almacen ?? almacenDeFotos();
  const { campos, consentimiento, trampa, foto, quitarFoto } =
    leerEnvioRegistro(formData);
  // Lo que vuelve al formulario va truncado a la cota de cada campo: nunca se
  // le devuelve al cliente un payload gigante que él mismo mandó (MEDIO 3).
  //
  // Y si el envío traía foto, se avisa que hay que volver a elegirla: ningún
  // navegador repuebla un campo de archivo, y en el servidor no queda nada
  // guardado de un envío rechazado (spec `registro-negocio`, scenario "hay que
  // volver a elegir la foto"). El aviso no pisa un mensaje de la foto misma.
  const rechazo = (errores: ErroresFormularioRegistro): ResultadoRegistro => ({
    exito: false,
    estado: {
      errores:
        foto && !errores.foto ? { ...errores, foto: AVISO_FOTO_NO_GUARDADA } : errores,
      valores: recortarParaEco(campos),
    },
  });

  // 1. Campo trampa: se finge el mismo éxito que un envío legítimo para no
  //    delatar la trampa a quien la llenó. No se guarda nada.
  if (trampa !== "") {
    console.warn("[registro] envío descartado: campo trampa lleno");
    return { exito: true };
  }

  // 2. Cupo de la IP (3 altas por hora, design.md §4).
  if (ipBloqueada(contexto.ip, ahora)) {
    console.warn("[registro] envío rechazado: cupo por IP agotado");
    return rechazo({ general: MENSAJES_ERROR_REGISTRO.limiteIp });
  }

  // 3. Validación y normalización contra las listas cerradas de la base.
  let categorias: Array<{ id: number }>;
  let colonias: Array<{ id: number }>;
  try {
    [categorias, colonias] = await Promise.all([
      contexto.prisma.categoria.findMany(),
      contexto.prisma.colonia.findMany(),
    ]);
  } catch (error) {
    console.error(`[registro] no se pudieron leer los catálogos: ${resumenDeError(error)}`);
    return rechazo({ general: MENSAJES_ERROR_REGISTRO.servidor });
  }

  const validacion = validarRegistro({
    campos,
    consentimiento,
    categorias,
    colonias,
    foto,
  });
  if (!validacion.ok) return rechazo(validacion.errores);
  const datos = validacion.datos;

  // Solo los envíos que llegan a intentar un alta gastan cupo: así una errata
  // se puede corregir sin quedarse sin intentos, y el barrido de números
  // (design.md §5) sí queda acotado, porque necesita envíos válidos.
  registrarAlta(contexto.ip, ahora);

  // 4. Una sola ficha por número (PRD §6.1), ya normalizado a 10 dígitos.
  //    Excepción: una ficha `rechazado` puede corregir y volver a enviar
  //    (PRD §6.3), y entonces se actualiza esa misma fila.
  let existente: { id: string; estado: string; fotoClave: string | null } | null;
  try {
    existente = await contexto.prisma.negocio.findUnique({
      where: { whatsapp: datos.whatsapp },
      select: { id: true, estado: true, fotoClave: true },
    });
  } catch (error) {
    console.error(`[registro] falló la consulta de duplicado: ${resumenDeError(error)}`);
    return rechazo({ general: MENSAJES_ERROR_REGISTRO.servidor });
  }

  if (existente && existente.estado !== ESTADO_NEGOCIO_RECHAZADO) {
    return rechazo({ whatsapp: MENSAJES_ERROR_REGISTRO.whatsappDuplicado });
  }

  // 4.5 Procesar y guardar la foto (design.md §5). Recién aquí se abre la
  //     imagen: el campo trampa, el cupo por IP, la validación de campos y el
  //     duplicado ya quedaron atrás, así que ningún envío bloqueado por esas
  //     defensas le cuesta al servidor un byte de procesamiento de imagen ni
  //     deja un archivo. La clave la genera el servidor y es nueva cada vez.
  let claveNueva: string | null = null;
  if (foto) {
    let procesada;
    try {
      procesada = await procesarFoto(Buffer.from(await foto.arrayBuffer()));
    } catch (error) {
      console.error(`[registro] no se pudo leer la foto del envío: ${resumenDeError(error)}`);
      return rechazo({ foto: MENSAJES_ERROR_FOTO.errorProcesamiento });
    }
    if (!procesada.ok) {
      return rechazo({ foto: MENSAJES_ERROR_FOTO[procesada.motivo] });
    }

    claveNueva = generarClaveFoto();
    try {
      await almacen.guardar(claveNueva, "tarjeta", procesada.variantes.tarjeta);
      await almacen.guardar(claveNueva, "ficha", procesada.variantes.ficha);
    } catch (error) {
      console.error(`[registro] no se pudo guardar la foto: ${resumenDeError(error)}`);
      // Puede haber quedado una de las dos variantes escrita: se limpia.
      await limpiarClave(almacen, claveNueva);
      return rechazo({ foto: MENSAJES_ERROR_FOTO.errorProcesamiento });
    }
  }

  // Qué se escribe en la columna de la foto:
  //   - hay archivo nuevo → la clave nueva (reemplaza a la anterior);
  //   - casilla "Dejar mi ficha sin foto" marcada → `null`;
  //   - ni una cosa ni la otra → la columna NO se toca.
  // Elegir archivo gana sobre marcar la casilla: subir una foto es la acción
  // deliberada, y así un descuido con la casilla no borra lo que se acaba de
  // elegir. En un alta la distinción no importa (no hay foto anterior).
  const cambiaFoto = claveNueva !== null || quitarFoto;
  const columnaFoto = cambiaFoto ? { fotoClave: claveNueva } : {};

  if (existente) {
    // 4b. Reenvío tras un rechazo (design.md §6 de agregar-panel-admin).
    //
    // Se pisan los datos con los del envío nuevo y se limpia el rastro del
    // rechazo: si no, la purga de rechazados a los 90 días se llevaría un
    // registro que ya está otra vez en la cola. `registradoEn` también se
    // reinicia, porque es el reloj del indicador de 48 horas del panel: si no,
    // todo reenvío entraría a la cola ya marcado como atrasado.
    //
    // Lo que NO se toca por construcción: `origen`, los giros, `tokenGestion`
    // y `publicadoEn` no están en `datos` (los fija el servidor, ver
    // `DatosNegocioValidados`), así que un envío no puede autopublicarse.
    //
    // `consintioAvisoEn` TAMPOCO se toca (hallazgo MEDIO 4 de la etapa C, que
    // corrige lo que decía design.md §6): es la constancia LFPDPPP de que el
    // titular consintió el aviso (PRD §8), y este formulario es anónimo —
    // quien reenvía puede no ser el dueño. Pisarla sustituiría la evidencia
    // del titular por una atribuible a un tercero. El envío nuevo sí exige el
    // checkbox (lo valida `validarRegistro`, si no, no se llega hasta aquí),
    // así que la ficha nunca queda sin consentimiento: se conserva el más
    // antiguo, que es el que prueba el consentimiento original.
    //
    // Al dueño no se le dice nada del rechazo anterior: ve la misma pantalla
    // de gracias que cualquier registro nuevo. El formulario es anónimo y
    // cualquiera podría escribir un número ajeno.
    //
    // La escritura va CONDICIONADA a que la ficha siga rechazada (design.md
    // §5, hallazgo MEDIO 2 de la etapa C): entre la consulta de arriba y esta
    // línea el admin pudo haberla resuelto desde el panel, y un `update` por
    // id la regresaría a la cola pisando esa resolución. Si no afecta ninguna
    // fila, ya no era un reenvío: es el duplicado de siempre.
    let afectadas: number;
    try {
      const escritura = await contexto.prisma.negocio.updateMany({
        where: { id: existente.id, estado: ESTADO_NEGOCIO_RECHAZADO },
        data: {
          ...datos,
          // El reenvío pisa nombre y "¿qué ofreces?": el texto normalizado
          // del buscador se recalcula con ellos, o la ficha reenviada se
          // seguiría encontrando por el contenido del envío rechazado.
          ...datosDeBusqueda(datos.nombre, datos.queOfreces),
          ...columnaFoto,
          registradoEn: ahora,
          estado: ESTADO_NEGOCIO_DEFAULT,
          rechazadoEn: null,
          motivoRechazo: null,
        },
      });
      afectadas = escritura.count;
    } catch (error) {
      console.error(`[registro] no se pudo guardar el reenvío: ${resumenDeError(error)}`);
      await limpiarClave(almacen, claveNueva);
      return rechazo({ general: MENSAJES_ERROR_REGISTRO.servidor });
    }

    if (afectadas === 0) {
      // El admin resolvió la ficha entre la consulta y la escritura: su foto
      // anterior tiene que quedar intacta y la recién guardada, borrada. Por
      // eso el borrado de la anterior va DESPUÉS de saber que la escritura
      // afectó una fila, y nunca antes (design.md §5).
      await limpiarClave(almacen, claveNueva);
      return rechazo({ whatsapp: MENSAJES_ERROR_REGISTRO.whatsappDuplicado });
    }

    // La foto anterior ya no está en ninguna ficha: sus archivos se borran de
    // verdad, no solo se desvinculan (PRD §8; spec `registro-negocio`,
    // requirement "El reenvío tras un rechazo permite cambiar o quitar la
    // foto").
    if (cambiaFoto && existente.fotoClave && existente.fotoClave !== claveNueva) {
      await limpiarClave(almacen, existente.fotoClave);
    }

    await avisarSiHayDemasiadasAltas(contexto, ahora);
    return { exito: true };
  }

  // 5. Alta. El estado, el origen, la constancia del consentimiento y el
  //    texto normalizado del buscador los fija el servidor: nada de esto
  //    puede venir del cliente. `datos` solo trae los campos que
  //    `validarRegistro` construyó uno por uno, así que un envío con
  //    `nombreNormalizado=...` no llega hasta aquí (spec registro-negocio,
  //    "El alta deja la ficha lista para el buscador").
  try {
    await contexto.prisma.negocio.create({
      data: {
        ...datos,
        ...datosDeBusqueda(datos.nombre, datos.queOfreces),
        // La referencia de la foto la pone AQUÍ el servidor, igual que el
        // estado, el origen y la constancia del consentimiento: `datos` nunca
        // la trae, así que ningún campo del cliente puede fijarla.
        fotoClave: claveNueva,
        consintioAvisoEn: ahora,
        estado: ESTADO_NEGOCIO_DEFAULT,
        origen: ORIGEN_NEGOCIO_DEFAULT,
      },
    });
  } catch (error) {
    // El alta no se concretó: la foto recién escrita se borra (nada de
    // huérfanos, spec `registro-negocio`).
    await limpiarClave(almacen, claveNueva);
    // La verdad de la unicidad la sostiene la constraint: si dos envíos
    // simultáneos pasaron la consulta previa, el segundo llega aquí y ve el
    // mismo mensaje de siempre, no un error técnico (design.md §5).
    if (esNumeroDuplicado(error)) {
      return rechazo({ whatsapp: MENSAJES_ERROR_REGISTRO.whatsappDuplicado });
    }
    console.error(`[registro] no se pudo guardar el alta: ${resumenDeError(error)}`);
    return rechazo({ general: MENSAJES_ERROR_REGISTRO.servidor });
  }

  await avisarSiHayDemasiadasAltas(contexto, ahora);

  return { exito: true };
}
