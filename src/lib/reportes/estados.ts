/**
 * Valores válidos de `Reporte.estado` (spec `modelo-datos`, requirement "El
 * modelo `Reporte`…").
 *
 * Mismo patrón que `src/lib/negocio.ts` con `estado`/`origen`: la base no tiene
 * enums (ADR-001), así que en la base es una columna TEXT con CHECK (ver la
 * migración `agrega_tabla_reporte`) y estas constantes son la única fuente de
 * esos literales en el código.
 *
 * Módulo puro: sin acceso a datos, sin Prisma.
 */

export const ESTADOS_REPORTE = ["pendiente", "atendido"] as const;
export type EstadoReporte = (typeof ESTADOS_REPORTE)[number];

/** Estado con el que nace todo reporte del formulario público. */
export const ESTADO_REPORTE_PENDIENTE: EstadoReporte = "pendiente";
/** Estado al que lo lleva el admin desde el panel, con su fecha. */
export const ESTADO_REPORTE_ATENDIDO: EstadoReporte = "atendido";
