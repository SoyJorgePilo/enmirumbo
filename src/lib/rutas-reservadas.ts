/**
 * Segmentos de la raíz que son rutas propias del sitio y por lo tanto NO
 * pueden ser el slug de una categoría (design.md §1 del change
 * `agregar-directorio-publico`).
 *
 * El listado por categoría vive en la raíz (`/servicios-del-hogar`, no
 * `/categoria/servicios-del-hogar`) porque esa es la URL que se comparte por
 * WhatsApp y la que E5-1 va a extender. En Next.js el segmento estático le
 * gana al dinámico, así que `/registro` seguirá abriendo el formulario aunque
 * exista `[categoria]`; el riesgo es el contrario: que una categoría del
 * catálogo se llame como una ruta propia y su listado quede inalcanzable
 * para siempre. La lista incluye a propósito rutas que todavía no existen
 * pero que ya se sabe que llegan (panel E3, buscador E2-4, edición E8,
 * legales E6): reservar un nombre es gratis, migrar URLs publicadas no.
 *
 * `tests/directorio-consultas.test.ts` falla si un slug del catálogo toca
 * esta lista, o si aparece en `src/app` una ruta —carpeta O archivo— que no
 * está aquí.
 */
export const SEGMENTOS_RESERVADOS = [
  "registro", // formulario público (T-003)
  "negocio", // fichas: /negocio/<slug>-<id>
  "admin", // panel de verificación (E3)
  "buscar", // buscador (E2-4)
  "editar", // edición con enlace de gestión (E8)
  "api", // route handlers
  "aviso-de-privacidad", // legales (E6)
  "terminos", // legales (E6)
  // Rutas que Next publica desde un ARCHIVO de `src/app`, no desde una
  // carpeta (change `agregar-seo-local`; observación O1 de la etapa C). Un
  // slug del catálogo no puede llevar punto, así que hoy ninguno podría
  // chocar con `robots.txt`, `sitemap.xml` ni `favicon.ico`; se reservan
  // igual porque el guardián de `tests/directorio-consultas.test.ts` exige
  // que TODA ruta servida esté en esta lista, y porque `opengraph-image` sí
  // tiene forma de slug.
  "robots.txt", // src/app/robots.ts
  "sitemap.xml", // src/app/sitemap.ts
  "opengraph-image", // src/app/opengraph-image.tsx
  "favicon.ico", // src/app/favicon.ico
] as const;

/** ¿Este slug taparía (o quedaría tapado por) una ruta propia del sitio? */
export function esSegmentoReservado(slug: string): boolean {
  const normalizado = slug.trim().toLowerCase();
  return (SEGMENTOS_RESERVADOS as readonly string[]).includes(normalizado);
}
