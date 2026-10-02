/**
 * Los literales del correo de pendientes (spec `revision-admin`, requirement
 * "El correo dice cuántos hay, nunca quiénes son").
 *
 * Contenido aprobado, no copy libre: `tests/aviso-pendientes.test.ts` lo
 * compara carácter por carácter contra la spec, igual que
 * `src/lib/admin/textos.ts`. Módulo puro: sin datos, sin entorno, sin reloj.
 *
 * REGLA DE MARCA (rebrand T-019): "EnMiRumbo" a secas, nunca la marca anterior
 * ni la forma compuesta con la localidad.
 *
 * Lo único variable son NÚMEROS y el enlace al panel. Nada de lo que llega
 * aquí puede identificar a un negocio, a un vecino ni a un reporte: el correo
 * viaja por servidores de un tercero y se queda guardado en un buzón (PRD §8,
 * LFPDPPP).
 */
import type { ConteoPendientes } from "./pendientes";

/** Cómo se presenta el remitente en la bandeja. */
export const NOMBRE_REMITENTE_AVISO = "EnMiRumbo";

/** El asunto, con la suma de los tres tipos. */
export function asuntoDelAviso(total: number): string {
  return total === 1
    ? "EnMiRumbo: 1 pendiente por revisar"
    : `EnMiRumbo: ${total} pendientes por revisar`;
}

/**
 * El cuerpo, en texto plano.
 *
 * Solo aparecen las líneas de los tipos que tienen al menos uno, siempre en
 * ese orden: un día sin ediciones no lleva "Ediciones: 0", porque un cero es
 * ruido que el ojo tiene que descartar todas las mañanas.
 */
export function cuerpoDelAviso(conteo: ConteoPendientes, urlPanel: string): string {
  const lineas = [
    ["Altas nuevas", conteo.altas],
    ["Ediciones", conteo.ediciones],
    ["Reportes sin atender", conteo.reportes],
  ]
    .filter(([, cuantos]) => (cuantos as number) > 0)
    .map(([rotulo, cuantos]) => `${rotulo}: ${cuantos}`);

  return [
    "Hay pendientes en la cola de EnMiRumbo:",
    "",
    ...lineas,
    "",
    `Entra al panel: ${urlPanel}`,
    "",
    "Acuérdate: la meta es contestarle a cada negocio en menos de 48 horas.",
    "",
    "Este aviso lo manda solo el sistema, una vez al día y nada más cuando hay algo esperando.",
  ].join("\n");
}
