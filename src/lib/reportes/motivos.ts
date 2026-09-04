/**
 * Motivos de reporte: lista cerrada, SIN opción "Otro" (spec
 * `directorio-publico`, requirement "Mini-formulario de reporte...";
 * design.md §4 — decisión resuelta al aprobar: "Literales: aprobados
 * 'Reportar este negocio', los motivos coloquiales, y SIN opción 'Otro'").
 *
 * Los valores (`cerrado`, `no_real`, ...) son los que se guardan en la base
 * (columna de texto con CHECK, ADR-001: SQLite no tiene enums) y son
 * ESTABLES: cambiar la etiqueta que ve el vecino no obliga a migrar datos.
 * Mismo patrón que `src/lib/negocio.ts` con `estado`/`origen`.
 *
 * Módulo puro: sin acceso a datos, sin Prisma. `crearReporte` (tasks.md #5,
 * del dev) es quien decide qué hacer con un motivo inválido; aquí solo vive
 * el conjunto y la validación de forma.
 */

export const MOTIVOS_REPORTE = [
  "cerrado",
  "no_real",
  "datos_incorrectos",
  "inapropiado",
] as const;

export type MotivoReporte = (typeof MOTIVOS_REPORTE)[number];

/**
 * Etiqueta visible de cada motivo, en el mismo orden en que aparecen en el
 * formulario y se repiten en el panel (spec: "la misma etiqueta que vio el
 * vecino"). Literales exactos de la spec, carácter por carácter.
 */
export const ETIQUETA_MOTIVO_REPORTE: Record<MotivoReporte, string> = {
  cerrado: "Ya cerró",
  no_real: "No es real",
  datos_incorrectos: "Los datos están mal",
  inapropiado: "Contenido ofensivo o inapropiado",
};

/**
 * ¿Este valor (tal como llega de un `FormData`, sin garantías de forma) es
 * uno de los cuatro motivos válidos? Cubre los casos adversariales del
 * ticket: `undefined`, cadena vacía, un motivo inventado y un arreglo (varios
 * `motivo` repetidos en el envío).
 */
export function esMotivoReporteValido(valor: unknown): valor is MotivoReporte {
  return (
    typeof valor === "string" &&
    (MOTIVOS_REPORTE as readonly string[]).includes(valor)
  );
}
