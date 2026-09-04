/**
 * Consultas y transición de los reportes en el panel (spec `revision-admin`,
 * requirements "La cola avisa qué negocios tienen reportes sin atender", "El
 * detalle del negocio lista sus reportes sin atender" y "Marcar un reporte
 * como atendido, una sola vez").
 *
 * Vive junto a `consultas.ts` y sigue sus mismas reglas: recibe el cliente
 * Prisma como parámetro (para poder probarse contra la base de prueba), es el
 * único que lee reportes para el panel y ninguna página pública lo importa —
 * toda pantalla que lo use pasa antes por `requerirSesionAdmin()`. Nada de lo
 * que lee se escribe en el log.
 *
 * Los reportes no traen ningún dato del reportante, así que aquí no hay nada
 * que ocultar ni que recortar: lo único capturado por un tercero es el
 * comentario, que se devuelve tal cual y lo escapa el JSX al pintarlo
 * (design.md §5).
 */
import { ETIQUETA_MOTIVO_REPORTE, type MotivoReporte } from "@/lib/reportes/motivos";
import {
  ESTADO_REPORTE_ATENDIDO,
  ESTADO_REPORTE_PENDIENTE,
} from "@/lib/reportes/estados";

import { tieneByteNulo } from "@/lib/texto";

import { textoEspera } from "./consultas";

/** Renglón de la sección "Negocios reportados" de la cola. */
export type NegocioReportadoColaItem = {
  id: string;
  nombre: string;
  totalPendientes: number;
};

/** Reporte pendiente tal como lo pinta el detalle, ya listo para leerse. */
export type ReportePendienteDetalle = {
  id: string;
  /** La etiqueta que vio el vecino ("Ya cerró"), no el valor de la base. */
  motivoEtiqueta: string;
  /** Desde cuándo espera, en la misma forma en palabras que usa la cola. */
  esperaTexto: string;
  comentario: string | null;
};

/** Lo poco que estas consultas necesitan de Prisma (facilita probarlas). */
export type ClienteReportesPanel = {
  reporte: {
    findMany(args: unknown): Promise<unknown[]>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
};

type FilaPendiente = {
  id: string;
  negocioId: string;
  motivo: string;
  comentario: string | null;
  creadoEn: Date;
  negocio: { nombre: string };
};

/**
 * Negocios con al menos un reporte pendiente, del que lleva más tiempo con un
 * reporte sin atender al más reciente.
 *
 * Una sola consulta ordenada por fecha y el agrupado en memoria: los reportes
 * pendientes están acotados por el tope de 10 por negocio (design.md §3), así
 * que no hay volumen que justifique un `groupBy` con una segunda consulta
 * para los nombres. El orden de la sección sale gratis del orden de la
 * consulta: el primer pendiente que aparece de cada negocio es el más antiguo.
 */
export async function obtenerNegociosReportados(
  prisma: ClienteReportesPanel,
): Promise<NegocioReportadoColaItem[]> {
  // Solo lo que la cola pinta: el negocio y su nombre. El motivo y el
  // comentario NO se traen (observación 4 de la etapa C): son texto capturado
  // por terceros y esta pantalla no los muestra; leerlos para tirarlos es lo
  // contrario del mínimo dato que el resto del change respeta.
  const filas = (await prisma.reporte.findMany({
    where: { estado: ESTADO_REPORTE_PENDIENTE },
    orderBy: [{ creadoEn: "asc" }, { id: "asc" }],
    select: {
      negocioId: true,
      negocio: { select: { nombre: true } },
    },
  })) as Array<Pick<FilaPendiente, "negocioId" | "negocio">>;

  const porNegocio = new Map<string, NegocioReportadoColaItem>();
  for (const fila of filas) {
    const acumulado = porNegocio.get(fila.negocioId);
    if (acumulado) acumulado.totalPendientes += 1;
    else {
      porNegocio.set(fila.negocioId, {
        id: fila.negocioId,
        nombre: fila.negocio.nombre,
        totalPendientes: 1,
      });
    }
  }

  return [...porNegocio.values()];
}

/**
 * Reportes sin atender de un negocio, del más antiguo al más reciente, ya
 * listos para pintar. El "ahora" se inyecta para poder probar el texto de
 * espera sin depender del reloj, igual que en la cola.
 */
export async function obtenerReportesPendientesDeNegocio(
  prisma: ClienteReportesPanel,
  negocioId: string,
  ahora: Date = new Date(),
): Promise<ReportePendienteDetalle[]> {
  if (!negocioId) return [];

  const filas = (await prisma.reporte.findMany({
    where: { negocioId, estado: ESTADO_REPORTE_PENDIENTE },
    orderBy: [{ creadoEn: "asc" }, { id: "asc" }],
    select: { id: true, motivo: true, comentario: true, creadoEn: true },
  })) as Array<Pick<FilaPendiente, "id" | "motivo" | "comentario" | "creadoEn">>;

  return filas.map((fila) => ({
    id: fila.id,
    motivoEtiqueta: ETIQUETA_MOTIVO_REPORTE[fila.motivo as MotivoReporte],
    esperaTexto: textoEspera(fila.creadoEn, ahora),
    comentario: fila.comentario,
  }));
}

/**
 * Marca un reporte como atendido. La escritura va CONDICIONADA al estado
 * (`updateMany` con `estado: pendiente` en el `where`), mismo patrón que las
 * transiciones del negocio: si no afecta ninguna fila, o el reporte ya estaba
 * atendido —y conserva su fecha original— o ese identificador no existe. Los
 * dos casos responden igual, así que la respuesta no sirve para averiguar si
 * un reporte existe.
 *
 * Cuando la acción viene del detalle de un negocio (que es el único sitio
 * desde donde se puede tocar este botón), se pasa también su `negocioId` y la
 * escritura queda condicionada a que el reporte sea de ESE negocio: un
 * identificador de reporte cambiado a mano no puede marcar como atendido algo
 * que esa pantalla nunca mostró, dejándolo "revisado" sin que nadie lo haya
 * leído y sacándolo de la cola (hallazgo B1 de la etapa C). No cambia ninguna
 * respuesta observable: el `count === 0` ya se responde como `"ya-atendido"`.
 *
 * No toca el negocio: atender es solo la constancia de que el admin ya lo vio.
 */
export async function marcarReporteAtendido(
  prisma: ClienteReportesPanel,
  reporteId: string,
  ahora: Date = new Date(),
  negocioId?: string,
): Promise<"atendido" | "ya-atendido"> {
  // Un identificador vacío, o con un byte nulo, no puede ser el de ningún
  // reporte: se responde como cualquier otro que no existe, sin tocar la base
  // (que además, en PostgreSQL, rechazaría el byte nulo con un error del
  // motor en vez de con "no encontré nada").
  if (!reporteId || tieneByteNulo(reporteId)) return "ya-atendido";

  const { count } = await prisma.reporte.updateMany({
    where: {
      id: reporteId,
      estado: ESTADO_REPORTE_PENDIENTE,
      ...(negocioId ? { negocioId } : {}),
    },
    data: { estado: ESTADO_REPORTE_ATENDIDO, atendidoEn: ahora },
  });

  return count === 0 ? "ya-atendido" : "atendido";
}
