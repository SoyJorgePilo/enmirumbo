/**
 * Transiciones de estado del panel (spec `revision-admin`, requirements
 * "Aprobar asigna giros, normaliza la colonia, marca el origen y publica la
 * ficha", "Rechazar exige motivo…" y "Una transición solo se aplica sobre un
 * registro que sigue en revisión"; design.md §5 y §9).
 *
 * Dos reglas que sostienen todo lo demás:
 *
 * 1. **La escritura va CONDICIONADA al estado** (`updateMany` con
 *    `estado: en_revision` en el `where`). Leer primero y escribir después
 *    deja una ventana en la que dos pestañas del admin se pisan la
 *    resolución. Si la escritura no afecta ninguna fila, la transición no
 *    aplicaba: es el caso "ya resuelto".
 * 2. **La cota de 0 a 3 giros y la colonia obligatoria se validan AQUÍ**, no
 *    en el formulario: el panel funciona sin JavaScript, así que el navegador
 *    no puede sostener ninguna regla (design.md §9).
 *
 * Ningún dato capturado por el negocio se toca al aprobar o rechazar, y nada
 * de lo que pasa por aquí se escribe en el log.
 */
import {
  ESTADO_NEGOCIO_DEFAULT,
  ESTADO_NEGOCIO_PUBLICADO,
  ESTADO_NEGOCIO_RECHAZADO,
  type OrigenNegocio,
} from "@/lib/negocio";

/** Máximo de giros que el admin puede asignar al aprobar (PRD §6.3). */
export const LIMITE_GIROS = 3;

/**
 * Cota del motivo del rechazo. Lo escribe el admin, así que no es entrada
 * hostil, pero un textarea sin cota es una columna sin cota: el motivo viaja
 * después dentro de un mensaje de WhatsApp, donde 500 caracteres ya son
 * muchísimo.
 */
export const LIMITE_MOTIVO_RECHAZO = 500;

/**
 * Cota del motivo de la despublicación. La misma que la del rechazo, y por la
 * misma razón: también viaja dentro de un mensaje de WhatsApp al negocio.
 */
export const LIMITE_MOTIVO_DESPUBLICACION = LIMITE_MOTIVO_RECHAZO;

export type DatosAprobacion = {
  girosIds: number[];
  /** Colonia del catálogo elegida por el admin, o `null` si no eligió. */
  coloniaId: number | null;
  origen: OrigenNegocio;
};

/** Lo que le puede pasar a cualquier transición, aprobando o rechazando. */
type FalloDeTransicion =
  /** Otra pestaña (o el mismo botón dos veces) ya lo resolvió. */
  | { resultado: "ya-resuelto" }
  /** Ese identificador no existe. */
  | { resultado: "no-encontrado" };

export type ResultadoAprobacion =
  | { resultado: "aprobado" }
  | FalloDeTransicion
  | { resultado: "error"; error: "giros" | "colonia" };

export type ResultadoRechazo =
  | { resultado: "rechazado" }
  | FalloDeTransicion
  | { resultado: "error"; error: "motivo" };

export type ResultadoDespublicacion =
  | { resultado: "despublicada" }
  /** Ya no estaba publicada: otra pestaña la bajó, o nunca llegó a publicarse. */
  | { resultado: "ya-no-publicada" }
  | { resultado: "no-encontrado" }
  /** `motivo`: no escribió nada. `longitud`: se pasó de la cota (no se recorta). */
  | { resultado: "error"; error: "motivo" | "longitud" };

export type ResultadoBorrado =
  | { resultado: "borrado" }
  /** Ese identificador ya no existe: el borrado es idempotente, no lanza. */
  | { resultado: "ya-no-existe" };

/** Lo poco que estas transiciones necesitan de Prisma (facilita probarlas). */
export type ClienteTransiciones = {
  negocio: {
    findUnique(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<{ count: number }>;
    update(args: unknown): Promise<unknown>;
    deleteMany(args: unknown): Promise<{ count: number }>;
  };
  giro: { findMany(args: unknown): Promise<Array<{ id: number }>> };
  colonia: { findUnique(args: unknown): Promise<unknown> };
};

/**
 * ¿Este número puede ser el id de una fila de catálogo? Los catálogos son
 * autoincrementales y pequeños (8 categorías, 21 colonias, 49 giros), así que
 * cualquier cosa que no sea un entero positivo y seguro es entrada hostil.
 *
 * La cota de magnitud importa (hallazgo MEDIO 1 de la etapa C): un id que no
 * cabe en el entero de 64 bits de la columna hace que Prisma LANCE en vez de
 * devolver "no existe", y esa excepción, dentro de una Server Action, es un
 * 500. La comprobación vive también en el borde (`accion-aprobar.ts`); aquí se
 * repite para que ningún otro llamador de este módulo pueda saltársela.
 */
function esIdDeCatalogo(id: number): boolean {
  return Number.isSafeInteger(id) && id > 0;
}

/**
 * Código de Prisma para "la operación dependía de un registro que no existe"
 * (el que lanza `update` cuando su `where` no encuentra fila). No se importa
 * ningún tipo del cliente generado a propósito: este módulo recibe un cliente
 * estructural para poder probarse, y el error llega como `unknown`.
 */
const CODIGO_PRISMA_REGISTRO_INEXISTENTE = "P2025";

function esRegistroInexistente(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === CODIGO_PRISMA_REGISTRO_INEXISTENTE
  );
}

type EstadoActual = {
  estado: string;
  coloniaId: number | null;
  coloniaOtra: string | null;
} | null;

async function leerEstadoActual(
  prisma: ClienteTransiciones,
  id: string,
): Promise<EstadoActual> {
  if (!id) return null;
  return (await prisma.negocio.findUnique({
    where: { id },
    select: { estado: true, coloniaId: true, coloniaOtra: true },
  })) as EstadoActual;
}

/**
 * Aprueba y publica: asigna hasta 3 giros del catálogo (o ninguno), normaliza
 * la colonia cuando el negocio la escribió como "Otra", marca el origen y
 * deja la ficha en `publicado` con su fecha.
 */
export async function aprobarRegistro(
  prisma: ClienteTransiciones,
  id: string,
  datos: DatosAprobacion,
  ahora: Date = new Date(),
): Promise<ResultadoAprobacion> {
  const actual = await leerEstadoActual(prisma, id);
  if (!actual) return { resultado: "no-encontrado" };
  if (actual.estado !== ESTADO_NEGOCIO_DEFAULT) return { resultado: "ya-resuelto" };

  // Giros: de 0 a 3, y todos del catálogo (un POST directo puede mandar ids
  // inventados, o repetidos para colarse por debajo de la cota).
  const girosUnicos = [...new Set(datos.girosIds)];
  if (girosUnicos.length > LIMITE_GIROS || !girosUnicos.every(esIdDeCatalogo)) {
    return { resultado: "error", error: "giros" };
  }
  if (girosUnicos.length > 0) {
    const delCatalogo = await prisma.giro.findMany({
      where: { id: { in: girosUnicos } },
      select: { id: true },
    });
    if (delCatalogo.length !== girosUnicos.length) {
      return { resultado: "error", error: "giros" };
    }
  }

  // Colonia: obligatoria solo cuando sigue pendiente de normalizar.
  const coloniaPendiente =
    actual.coloniaId === null && (actual.coloniaOtra ?? "").trim() !== "";
  if (coloniaPendiente && datos.coloniaId === null) {
    return { resultado: "error", error: "colonia" };
  }
  if (datos.coloniaId !== null && !esIdDeCatalogo(datos.coloniaId)) {
    return { resultado: "error", error: "colonia" };
  }
  if (datos.coloniaId !== null) {
    const existe = await prisma.colonia.findUnique({
      where: { id: datos.coloniaId },
      select: { id: true },
    });
    if (!existe) return { resultado: "error", error: "colonia" };
  }

  // Escritura condicionada: si otra pestaña ya resolvió, `count` es 0 y aquí
  // no se sobrescribe nada (design.md §5). `coloniaOtra` se conserva: la
  // colonia se normaliza, no se borra lo que el negocio escribió.
  const { count } = await prisma.negocio.updateMany({
    where: { id, estado: ESTADO_NEGOCIO_DEFAULT },
    data: {
      estado: ESTADO_NEGOCIO_PUBLICADO,
      publicadoEn: ahora,
      origen: datos.origen,
      ...(datos.coloniaId !== null ? { coloniaId: datos.coloniaId } : {}),
    },
  });
  if (count === 0) return { resultado: "ya-resuelto" };

  // Los giros son una relación: no caben en el `updateMany`. Solo llega aquí
  // quien ganó la escritura condicionada, así que esta segunda escritura ya no
  // compite con ninguna otra TRANSICIÓN…
  //
  // …pero sí con el borrado definitivo, que desde el change
  // `agregar-despublicar-y-borrado-arco` puede hacer desaparecer la fila entre
  // las dos escrituras (hallazgo MEDIO 1 de la etapa C: el admin aprueba en una
  // pestaña y atiende una solicitud ARCO en la otra). Un `update` sobre una fila
  // que ya no existe LANZA P2025, y una excepción dentro de una Server Action es
  // un 500 — exactamente lo que `borrarNegocio` evita usando `deleteMany` en vez
  // de `delete` (design.md §5).
  //
  // No hay nada que reparar: la fila ya no existe y el borrado se lleva sus
  // vínculos con giros por cascada, así que esta escritura perdió su objeto. Se
  // responde "no encontrado", que es lo que de verdad pasó, y el panel devuelve
  // al admin a la cola con su mensaje normal. Cualquier otro error de Prisma se
  // vuelve a lanzar: silenciarlos todos escondería fallas reales de la base.
  try {
    await prisma.negocio.update({
      where: { id },
      data: { giros: { set: girosUnicos.map((giroId) => ({ id: giroId })) } },
    });
  } catch (error) {
    if (!esRegistroInexistente(error)) throw error;
    return { resultado: "no-encontrado" };
  }

  return { resultado: "aprobado" };
}

/** Rechaza con motivo obligatorio, guardando la fecha que habilita la purga. */
export async function rechazarRegistro(
  prisma: ClienteTransiciones,
  id: string,
  motivo: string,
  ahora: Date = new Date(),
): Promise<ResultadoRechazo> {
  const actual = await leerEstadoActual(prisma, id);
  if (!actual) return { resultado: "no-encontrado" };
  if (actual.estado !== ESTADO_NEGOCIO_DEFAULT) return { resultado: "ya-resuelto" };

  const motivoLimpio = motivo.trim().slice(0, LIMITE_MOTIVO_RECHAZO);
  if (motivoLimpio === "") return { resultado: "error", error: "motivo" };

  const { count } = await prisma.negocio.updateMany({
    where: { id, estado: ESTADO_NEGOCIO_DEFAULT },
    data: {
      estado: ESTADO_NEGOCIO_RECHAZADO,
      rechazadoEn: ahora,
      motivoRechazo: motivoLimpio,
    },
  });

  return count === 0 ? { resultado: "ya-resuelto" } : { resultado: "rechazado" };
}

/**
 * Despublica una ficha que está en `publicado` y la regresa a la cola
 * (`en_revision`) con la fecha y el motivo de la bajada (spec
 * `agregar-despublicar-y-borrado-arco`, requirement "Despublicar una ficha
 * publicada, con motivo obligatorio y condicionada al estado").
 *
 * Despublicar NO destruye nada: los giros, la colonia, el origen, el rastro
 * del rechazo anterior y `publicadoEn` quedan como estaban. `publicadoEn` pasa
 * a significar "la última vez que estuvo publicada" (design.md §2): es el
 * único rastro de que la ficha estuvo en el directorio, y ninguna consulta
 * decide visibilidad con él —eso lo hace el estado—.
 *
 * Misma escritura condicionada que aprobar y rechazar, pero sobre `publicado`:
 * si otra pestaña ya la bajó, `count` es 0 y la primera despublicación se
 * conserva intacta.
 *
 * El motivo que se pasa de la cota se RECHAZA con error de formulario, no se
 * recorta (hallazgo BAJO 3 de la etapa C). Recortarlo en silencio es peor que
 * la cota: este texto no se queda en la base, viaja dentro del WhatsApp que el
 * admin le manda al negocio, así que el recorte llega como una frase cortada a
 * media palabra a un tercero. Es la diferencia con `rechazarRegistro`, que sí
 * recorta —comportamiento de T-005 que su propia spec fija y que este change no
 * toca; queda anotado como deuda compartida en el reporte—.
 */
export async function despublicarFicha(
  prisma: ClienteTransiciones,
  id: string,
  motivo: string,
  ahora: Date = new Date(),
): Promise<ResultadoDespublicacion> {
  const actual = await leerEstadoActual(prisma, id);
  if (!actual) return { resultado: "no-encontrado" };
  if (actual.estado !== ESTADO_NEGOCIO_PUBLICADO) return { resultado: "ya-no-publicada" };

  const motivoLimpio = motivo.trim();
  if (motivoLimpio === "") return { resultado: "error", error: "motivo" };
  // Se cuenta por puntos de código, no por unidades UTF-16: un motivo con
  // emojis no puede valer el doble de lo que se ve escrito en la pantalla.
  if ([...motivoLimpio].length > LIMITE_MOTIVO_DESPUBLICACION) {
    return { resultado: "error", error: "longitud" };
  }

  const { count } = await prisma.negocio.updateMany({
    where: { id, estado: ESTADO_NEGOCIO_PUBLICADO },
    data: {
      estado: ESTADO_NEGOCIO_DEFAULT,
      despublicadoEn: ahora,
      motivoDespublicacion: motivoLimpio,
    },
  });

  return count === 0
    ? { resultado: "ya-no-publicada" }
    : { resultado: "despublicada" };
}

/**
 * Borrado definitivo de un registro (operación ARCO, PRD §8): se lleva la fila
 * y todo lo que cuelga de ella, esté en el estado que esté.
 *
 * `deleteMany` y no `delete`: borrar dos veces (otra pestaña, un doble toque)
 * tiene que quedarse sin efecto, no lanzar — una excepción dentro de una
 * Server Action es un 500 (design.md §5).
 *
 * El arrastre de los vínculos con giros, de los reportes (T-011) y de
 * cualquier tabla que alguien agregue después lo garantiza el ESQUEMA con
 * `onDelete: Cascade`, no esta función: así una relación nueva sin cascada
 * rompe el invariante en `tests/modelo-despublicacion.test.ts` y no en
 * producción.
 *
 * Punto de integración pendiente con T-008 (foto del negocio subida al sitio,
 * sin mergear en esta rama): hoy `fotoUrl` es una URL externa que el sitio no
 * guarda, así que no hay ningún archivo propio que eliminar. En cuanto el
 * modelo estrene la clave del archivo, el borrado del archivo va AQUÍ, después
 * de que `deleteMany` confirme que la fila era nuestra; el test "si el modelo
 * estrena archivos de foto, el borrado tiene que arrastrarlos" lo exige.
 */
export async function borrarNegocio(
  prisma: ClienteTransiciones,
  id: string,
): Promise<ResultadoBorrado> {
  if (!id) return { resultado: "ya-no-existe" };

  const { count } = await prisma.negocio.deleteMany({ where: { id } });

  return count === 0 ? { resultado: "ya-no-existe" } : { resultado: "borrado" };
}
