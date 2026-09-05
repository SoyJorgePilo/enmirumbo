/**
 * Cuántas cosas esperan en la cola del panel, por tipo (spec `revision-admin`,
 * requirement "Un aviso al día por correo cuando hay pendientes…").
 *
 * **No hay ni una regla nueva aquí.** Los tres conteos salen de las mismas dos
 * funciones que arman las dos secciones de la cola —`obtenerColaDeRevision` y
 * `obtenerNegociosReportados`—, y por eso el correo no puede decir 4 mientras
 * el panel muestra 5. Escribir consultas "parecidas" es el camino corto para
 * que el admin deje de creerle al correo (design.md §6).
 *
 * De ahí salen dos consecuencias que la spec fija y que no son un descuido:
 *
 * - Un negocio que ya está en la cola por sí mismo y además tiene una edición
 *   esperando cuenta UNA vez y con el tipo con el que aparece en el panel: es
 *   la deduplicación que ya hace la cola.
 * - Los reportes se cuentan POR REPORTE, no por negocio, y no se le restan al
 *   alta del mismo negocio: revisar su ficha y atender su reporte son dos
 *   trabajos distintos, y la cola los pinta en dos secciones.
 *
 * Este módulo lee nombres y colonias porque las funciones de la cola los
 * traen, pero NO los devuelve, no los registra y no salen de aquí: lo único
 * que cruza esta frontera son números.
 */
import { obtenerColaDeRevision, type ClientePanel } from "@/lib/admin/consultas";
import { obtenerNegociosReportados, type ClienteReportesPanel } from "@/lib/admin/reportes";

/** Lo que el correo dice, y lo único que sale de aquí. */
export type ConteoPendientes = {
  altas: number;
  ediciones: number;
  reportes: number;
  /** La suma de los tres: los renglones que el admin va a tener que tocar. */
  total: number;
};

export type ClienteAviso = ClientePanel & ClienteReportesPanel;

/**
 * Las dos lecturas van UNA DETRÁS DE OTRA, no en paralelo.
 *
 * `obtenerColaDeRevision` ya lanza por dentro dos consultas a la vez, así que
 * pedirlas también en paralelo aquí abría hasta tres conexiones a la vez para
 * una tarea que corre una vez al día y a la que nadie está esperando. Contra el
 * servidor local de desarrollo —que multiplexa TODAS las conexiones sobre una
 * sola sesión de PostgreSQL (ver `tests/db.ts`)— eso se nota: la tarea empezaba
 * a fallar de forma intermitente con "Connection terminated unexpectedly". En
 * serie no se pierde nada medible y el aviso deja de competir consigo mismo.
 */
export async function contarPendientes(prisma: ClienteAviso): Promise<ConteoPendientes> {
  const cola = await obtenerColaDeRevision(prisma);
  const reportados = await obtenerNegociosReportados(prisma);

  const altas = cola.filter((renglon) => renglon.tipo === "alta").length;
  const ediciones = cola.filter((renglon) => renglon.tipo === "edicion").length;
  const reportes = reportados.reduce((suma, negocio) => suma + negocio.totalPendientes, 0);

  return { altas, ediciones, reportes, total: altas + ediciones + reportes };
}
