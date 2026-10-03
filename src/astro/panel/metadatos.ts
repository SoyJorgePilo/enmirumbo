/**
 * Títulos de las pantallas del panel en Astro (change
 * `migrar-panel-admin-base-astro`, design.md §5). Los mismos que la
 * `metadata` de las páginas de Next; pasan por la plantilla del sitio igual
 * que allá (por eso Next sirve "Panel de revisión — EnMiRumbo — EnMiRumbo":
 * se conserva por paridad, como el de las legales en 2a).
 *
 * El robots y el referente los fija `DocumentoPanel.astro`.
 */
import type { MetadatosDePagina } from "@/astro/metadatos";

/**
 * Título propio del acceso. Lo lee el guardián de la marca (T-019,
 * `tests/marca-guardian.test.ts`), que comprueba además que coincide con el
 * de Next mientras exista.
 */
export const TITULO_PANEL = "Panel de revisión — EnMiRumbo";

export const METADATOS_ACCESO: MetadatosDePagina = { title: TITULO_PANEL };
export const METADATOS_COLA: MetadatosDePagina = { title: "Registros por revisar — Panel de revisión" };
export const METADATOS_NEGOCIOS: MetadatosDePagina = { title: "Todos los negocios — Panel de revisión" };
