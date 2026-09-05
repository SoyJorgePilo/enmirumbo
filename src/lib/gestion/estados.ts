/**
 * Valores válidos de `EdicionPendiente.estado` (change
 * `agregar-enlace-de-gestion`, spec `modelo-datos`).
 *
 * Texto con CHECK en la migración, no un enum del motor: mismo criterio que
 * `src/lib/negocio.ts` y `src/lib/reportes/estados.ts`. Estas constantes son
 * la única fuente de esos literales en el código.
 */

export const ESTADOS_EDICION = ["pendiente", "aplicada", "descartada"] as const;
export type EstadoEdicion = (typeof ESTADOS_EDICION)[number];

/** Esperando revisión del admin: el único que aparece en la cola. */
export const ESTADO_EDICION_PENDIENTE: EstadoEdicion = "pendiente";
/** El admin la aplicó a la ficha publicada. */
export const ESTADO_EDICION_APLICADA: EstadoEdicion = "aplicada";
/** El admin la descartó con motivo, o el negocio la reemplazó por otra. */
export const ESTADO_EDICION_DESCARTADA: EstadoEdicion = "descartada";
