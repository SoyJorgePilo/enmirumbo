/**
 * Valores válidos de `Negocio.estado` y `Negocio.origen`.
 *
 * SQLite no soporta enums (ADR-001): en la base son columnas TEXT con
 * constraint CHECK (ver la migración inicial). Estas constantes son la única
 * fuente de esos literales en el código — formulario, panel y seeds deben
 * importarlas de aquí, sin strings mágicos.
 */
export const ESTADOS_NEGOCIO = ["en_revision", "publicado", "rechazado"] as const;
export type EstadoNegocio = (typeof ESTADOS_NEGOCIO)[number];

export const ORIGENES_NEGOCIO = ["siembra", "organico"] as const;
export type OrigenNegocio = (typeof ORIGENES_NEGOCIO)[number];

export const ESTADO_NEGOCIO_DEFAULT: EstadoNegocio = "en_revision";
/** Único estado que el directorio público puede mostrar (PRD §6.3 y §8). */
export const ESTADO_NEGOCIO_PUBLICADO: EstadoNegocio = "publicado";
export const ORIGEN_NEGOCIO_DEFAULT: OrigenNegocio = "organico";
