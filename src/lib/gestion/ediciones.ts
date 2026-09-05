/**
 * Las ediciones pendientes: guardar (reemplazando la anterior), aplicar y
 * descartar (change `agregar-enlace-de-gestion`, design.md §1 y §2; ticket
 * T-014, tasks.md #12, #14, #16, #21, #22 y #23).
 *
 * Tres reglas que sostienen todo lo demás:
 *
 * 1. **Guardar una edición no toca la ficha.** El snapshot vive en su propia
 *    tabla, así que la consulta pública no cambia ni una línea y ninguna
 *    edición pendiente se puede filtrar a lo público por accidente.
 * 2. **Una sola pendiente por negocio.** Lo garantiza el índice único parcial
 *    de la migración; el código, además, cierra la anterior y crea la nueva en
 *    la misma transacción. Si dos envíos casi simultáneos chocan con el
 *    índice, se reintenta una vez: el dueño ve su confirmación, no un error.
 * 3. **Aplicar y descartar van CONDICIONADOS a la edición exacta** que el
 *    admin tenía enfrente (`updateMany` con `id` + `estado: 'pendiente'`).
 *    Leer y después escribir dejaría la ventana en la que el admin aplica
 *    cambios que el dueño ya sustituyó.
 *
 * Aplicar copia por LISTA BLANCA (`src/lib/gestion/campos.ts`): el estado, el
 * origen, los giros, las fechas, la constancia del consentimiento y el enlace
 * quedan intactos aunque alguien logre escribir basura en la fila.
 *
 * Nada de lo que pasa por aquí —ni un nombre, ni un número, ni un token— se
 * escribe en el log: solo el tipo de fallo.
 */
import { datosDeBusqueda } from "@/lib/busqueda";
import { ESTADO_NEGOCIO_PUBLICADO } from "@/lib/negocio";
import type { DatosNegocioValidados } from "@/lib/registro/tipos";
import { sinBytesNulos } from "@/lib/texto";

import { CAMPOS_EDITABLES } from "./campos";
import {
  ESTADO_EDICION_APLICADA,
  ESTADO_EDICION_DESCARTADA,
  ESTADO_EDICION_PENDIENTE,
} from "./estados";

/**
 * Cota del motivo del descarte. La misma que la de la despublicación y por la
 * misma razón: el texto no se queda en la base, viaja dentro del WhatsApp que
 * el admin le manda al negocio.
 */
export const LIMITE_MOTIVO_DESCARTE = 500;

/** Lo que una edición guarda: exactamente los campos capturables. */
export type DatosEdicion = DatosNegocioValidados;

/** Lo que hace falta DENTRO de una transacción. */
export type TransaccionEdiciones = {
  edicionPendiente: {
    create(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  negocio: {
    updateMany(args: unknown): Promise<{ count: number }>;
  };
};

/** Lo poco que este módulo necesita de Prisma (facilita probarlo). */
export type ClienteEdiciones = {
  edicionPendiente: {
    findUnique(args: unknown): Promise<unknown>;
    findFirst(args: unknown): Promise<unknown>;
    create(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  negocio: {
    findFirst(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  $transaction<T>(operacion: (tx: TransaccionEdiciones) => Promise<T>): Promise<T>;
};

/** Choque con una constraint de unicidad (aquí: la pendiente única). */
function esChoqueDeUnicidad(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
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

export type ResultadoGuardarEdicion =
  | { resultado: "guardada" }
  /** La base no se dejó escribir: el dueño ve el texto de "vuelve a intentar". */
  | { resultado: "error" };

/**
 * Guarda lo que el dueño mandó como la edición pendiente de su negocio,
 * cerrando la anterior si la había (requirement "Mandar cambios cuando ya hay
 * otros esperando reemplaza a los anteriores").
 *
 * La reemplazada queda `descartada` con su fecha y SIN motivo: un motivo es lo
 * que el admin escribe para avisarle al negocio, y aquí no hubo admin ni hay
 * nada que avisar. Esa ausencia es además lo que distingue, en la tabla, un
 * descarte del admin de un reemplazo del dueño.
 */
export async function guardarEdicion(
  prisma: ClienteEdiciones,
  negocioId: string,
  datos: DatosEdicion,
  ahora: Date = new Date(),
): Promise<ResultadoGuardarEdicion> {
  const escribir = () =>
    prisma.$transaction(async (tx) => {
      await tx.edicionPendiente.updateMany({
        where: { negocioId, estado: ESTADO_EDICION_PENDIENTE },
        data: { estado: ESTADO_EDICION_DESCARTADA, resueltaEn: ahora },
      });
      await tx.edicionPendiente.create({
        data: {
          negocioId,
          ...datos,
          estado: ESTADO_EDICION_PENDIENTE,
          creadaEn: ahora,
        },
      });
    });

  try {
    await escribir();
  } catch (error) {
    // Dos envíos casi simultáneos: el índice único parcial dejó pasar uno solo
    // (requirement "dos envíos casi simultáneos"). Se reintenta una vez: en el
    // segundo intento la pendiente del otro envío ya existe, se cierra y esta
    // ocupa su lugar. El dueño no ve un error técnico.
    if (!esChoqueDeUnicidad(error)) {
      console.error(`[gestion] no se pudo guardar la edición: ${resumenDeError(error)}`);
      return { resultado: "error" };
    }
    try {
      await escribir();
    } catch (segundo) {
      console.error(
        `[gestion] no se pudo guardar la edición ni al reintentar: ${resumenDeError(segundo)}`,
      );
      return { resultado: "error" };
    }
  }

  return { resultado: "guardada" };
}

/** Fila de una edición, con lo que el panel y el formulario necesitan. */
export type EdicionGuardada = DatosEdicion & {
  id: string;
  negocioId: string;
  estado: string;
  creadaEn: Date;
  resueltaEn: Date | null;
  motivoDescarte: string | null;
};

/** El `select` de Prisma con exactamente los campos editables y su ciclo. */
const SELECT_EDICION = {
  id: true,
  negocioId: true,
  estado: true,
  creadaEn: true,
  resueltaEn: true,
  motivoDescarte: true,
  ...Object.fromEntries(CAMPOS_EDITABLES.map((campo) => [campo, true])),
} as const;

/** La edición que este negocio tiene esperando revisión, o `null`. */
export async function obtenerEdicionPendiente(
  prisma: ClienteEdiciones,
  negocioId: string,
): Promise<EdicionGuardada | null> {
  if (!negocioId) return null;
  return (await prisma.edicionPendiente.findFirst({
    where: { negocioId, estado: ESTADO_EDICION_PENDIENTE },
    orderBy: { creadaEn: "desc" },
    select: SELECT_EDICION,
  })) as EdicionGuardada | null;
}

/** Una edición por su identificador, en el estado que sea. */
export async function obtenerEdicion(
  prisma: ClienteEdiciones,
  id: string,
): Promise<EdicionGuardada | null> {
  if (!id) return null;
  return (await prisma.edicionPendiente.findUnique({
    where: { id },
    select: SELECT_EDICION,
  })) as EdicionGuardada | null;
}

/** Lo que le puede pasar a una edición que ya no está pendiente. */
type FalloDeResolucion =
  /** El admin ya la había aplicado o descartado (doble clic, dos pestañas). */
  | { resultado: "ya-resuelta" }
  /** El negocio mandó otros cambios más nuevos que la sustituyeron. */
  | { resultado: "reemplazada" }
  /** Ese identificador no existe. */
  | { resultado: "no-encontrada" };

export type ResultadoAplicarEdicion =
  | { resultado: "aplicada"; negocioId: string; nombre: string; whatsapp: string }
  | FalloDeResolucion
  /** Entre que llegó y ahora, otra ficha se quedó con ese número. */
  | { resultado: "whatsapp-ocupado" }
  /**
   * La ficha dejó de estar publicada entre que el admin abrió la comparación
   * y tocó "Aplicar los cambios" (otra pestaña la despublicó, o la borraron).
   * **No se aplicó nada y la edición SIGUE PENDIENTE**, esperando a que la
   * ficha vuelva al directorio (hallazgo MEDIO 1 de la etapa C).
   */
  | { resultado: "ficha-no-publicada" }
  | { resultado: "error" };

/**
 * Aborta la transacción de aplicar porque la edición dejó de ser la pendiente
 * entre que se leyó y se escribió. Lanzar es lo que revierte la escritura que
 * ya se hizo sobre la ficha: no hay forma de "deshacerla" desde fuera.
 */
class EdicionYaNoPendiente extends Error {
  constructor() {
    super("la edición dejó de estar pendiente dentro de la transacción");
    this.name = "EdicionYaNoPendiente";
  }
}

/**
 * ¿Por qué esta edición ya no se puede resolver? Si el negocio tiene otra
 * pendiente más nueva, fue un reemplazo; si no, el admin ya la había resuelto.
 * Los dos casos tienen su propio literal en el panel.
 */
async function motivoDeNoResolver(
  prisma: ClienteEdiciones,
  edicion: EdicionGuardada,
): Promise<FalloDeResolucion> {
  const masNueva = await prisma.edicionPendiente.findFirst({
    where: {
      negocioId: edicion.negocioId,
      estado: ESTADO_EDICION_PENDIENTE,
      id: { not: edicion.id },
    },
    select: { id: true },
  });
  return masNueva ? { resultado: "reemplazada" } : { resultado: "ya-resuelta" };
}

/**
 * Aplica la edición a la ficha publicada: copia los campos editables, uno por
 * uno, y nada más (requirement "Aplicar la edición actualiza la ficha
 * publicada y solo eso"). Recalcula el texto normalizado del buscador con la
 * misma función que usa el registro, para que la ficha se siga encontrando por
 * lo que ahora dice.
 */
export async function aplicarEdicion(
  prisma: ClienteEdiciones,
  id: string,
  ahora: Date = new Date(),
): Promise<ResultadoAplicarEdicion> {
  const edicion = await obtenerEdicion(prisma, id);
  if (!edicion) return { resultado: "no-encontrada" };
  if (edicion.estado !== ESTADO_EDICION_PENDIENTE) {
    return motivoDeNoResolver(prisma, edicion);
  }

  // La unicidad del WhatsApp se comprueba también AQUÍ (design.md §5): entre
  // que el dueño mandó los cambios y este momento pudo publicarse otra ficha
  // con ese número. La segunda comprobación es la que manda.
  const ocupado = await prisma.negocio.findFirst({
    where: { whatsapp: edicion.whatsapp, id: { not: edicion.negocioId } },
    select: { id: true },
  });
  if (ocupado) return { resultado: "whatsapp-ocupado" };

  // Lista blanca explícita: se nombra cada campo, no se hace `spread` de la
  // fila. Lo que no esté en `CAMPOS_EDITABLES` no llega a la ficha.
  const columnas = {
    nombre: edicion.nombre,
    categoriaId: edicion.categoriaId,
    whatsapp: edicion.whatsapp,
    coloniaId: edicion.coloniaId,
    coloniaOtra: edicion.coloniaOtra,
    queOfreces: edicion.queOfreces,
    entregaADomicilio: edicion.entregaADomicilio,
    telefonoFijo: edicion.telefonoFijo,
    direccion: edicion.direccion,
    horario: edicion.horario,
    facebookUrl: edicion.facebookUrl,
    ...datosDeBusqueda(edicion.nombre, edicion.queOfreces),
  };

  // EL ORDEN IMPORTA, Y CAMBIÓ (hallazgo MEDIO 1 de la etapa C): **primero se
  // escribe la ficha**, condicionada a que siga publicada, y solo si esa
  // escritura afectó una fila se cierra la edición.
  //
  // Antes era al revés, y eso producía una mentira con acuse de recibo: si el
  // admin despublicaba en otra pestaña, la edición se marcaba `aplicada`, los
  // cambios del dueño se perdían para siempre —ya no estaban pendientes, no
  // reaparecían en la cola y no hay pantalla para recuperarlos— y el panel
  // decía "Listo, la ficha ya se actualizó" ofreciendo avisarle al negocio.
  //
  // Ahora una edición **solo se declara aplicada si de verdad llegó a la
  // ficha**. Si la ficha ya no está publicada, no se toca nada y la edición
  // sigue esperando: cuando el admin la vuelva a publicar, sus cambios siguen
  // ahí. Y si la edición dejó de ser la pendiente dentro de la transacción, se
  // lanza para REVERTIR la escritura de la ficha, que es la única forma de que
  // las dos condiciones se cumplan o ninguna.
  let desenlace: "aplicada" | "ficha-no-publicada";
  try {
    desenlace = await prisma.$transaction(async (tx) => {
      const fichaEscrita = await tx.negocio.updateMany({
        where: { id: edicion.negocioId, estado: ESTADO_NEGOCIO_PUBLICADO },
        data: columnas,
      });
      if (fichaEscrita.count === 0) return "ficha-no-publicada" as const;

      const cerrada = await tx.edicionPendiente.updateMany({
        where: { id, estado: ESTADO_EDICION_PENDIENTE },
        data: { estado: ESTADO_EDICION_APLICADA, resueltaEn: ahora },
      });
      if (cerrada.count === 0) throw new EdicionYaNoPendiente();

      return "aplicada" as const;
    });
  } catch (error) {
    if (error instanceof EdicionYaNoPendiente) {
      const fresca = await obtenerEdicion(prisma, id);
      return fresca ? motivoDeNoResolver(prisma, fresca) : { resultado: "no-encontrada" };
    }
    console.error(`[gestion] no se pudo aplicar la edición: ${resumenDeError(error)}`);
    return { resultado: "error" };
  }

  if (desenlace === "ficha-no-publicada") return { resultado: "ficha-no-publicada" };

  return {
    resultado: "aplicada",
    negocioId: edicion.negocioId,
    nombre: edicion.nombre,
    whatsapp: edicion.whatsapp,
  };
}

export type ResultadoDescartarEdicion =
  | { resultado: "descartada" }
  | FalloDeResolucion
  /** `motivo`: no escribió nada. `longitud`: se pasó de la cota (no se recorta). */
  | { resultado: "error"; error: "motivo" | "longitud" };

/**
 * Descarta la edición con motivo obligatorio (requirement "Descartar la
 * edición exige motivo, no toca la ficha y ofrece avisar por WhatsApp"). No
 * toca ni un dato de la ficha, ni su estado, ni su enlace: el negocio puede
 * corregir y volver a mandar cambios con el mismo enlace.
 */
export async function descartarEdicion(
  prisma: ClienteEdiciones,
  id: string,
  motivo: string,
  ahora: Date = new Date(),
): Promise<ResultadoDescartarEdicion> {
  // El byte nulo se cae aquí, en el borde: PostgreSQL no lo admite en una
  // columna de texto y la excepción sería un 500 en el panel.
  const motivoLimpio = sinBytesNulos(motivo).trim();
  if (motivoLimpio === "") return { resultado: "error", error: "motivo" };
  // Por puntos de código, no por unidades UTF-16: un motivo con emojis no
  // puede valer el doble de lo que se ve escrito.
  if ([...motivoLimpio].length > LIMITE_MOTIVO_DESCARTE) {
    return { resultado: "error", error: "longitud" };
  }

  const edicion = await obtenerEdicion(prisma, id);
  if (!edicion) return { resultado: "no-encontrada" };
  if (edicion.estado !== ESTADO_EDICION_PENDIENTE) {
    return motivoDeNoResolver(prisma, edicion);
  }

  const { count } = await prisma.edicionPendiente.updateMany({
    where: { id, estado: ESTADO_EDICION_PENDIENTE },
    data: {
      estado: ESTADO_EDICION_DESCARTADA,
      resueltaEn: ahora,
      motivoDescarte: motivoLimpio,
    },
  });

  if (count === 0) {
    const fresca = await obtenerEdicion(prisma, id);
    return fresca ? motivoDeNoResolver(prisma, fresca) : { resultado: "no-encontrada" };
  }

  return { resultado: "descartada" };
}
