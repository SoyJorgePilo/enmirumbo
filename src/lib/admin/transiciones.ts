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

/** Lo poco que estas transiciones necesitan de Prisma (facilita probarlas). */
export type ClienteTransiciones = {
  negocio: {
    findUnique(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<{ count: number }>;
    update(args: unknown): Promise<unknown>;
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
  // quien ganó la escritura condicionada, así que esta segunda escritura ya
  // no compite con nadie.
  await prisma.negocio.update({
    where: { id },
    data: { giros: { set: girosUnicos.map((giroId) => ({ id: giroId })) } },
  });

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
