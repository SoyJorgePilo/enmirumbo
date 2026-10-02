/**
 * Cabeceras de las respuestas en Astro (change `migrar-lectura-publica-astro`,
 * design.md §5). La fuente sigue siendo UNA: `cabecerasDeSeguridad()` de
 * `src/lib/seguridad/csp.ts`, la misma que usa `next.config.ts`.
 *
 * Dos caminos, porque en Vercel el middleware NO corre para lo que sirve la
 * CDN:
 *
 * - lo que sale de la función lo arregla `src/middleware.ts` con
 *   `prepararRespuesta`;
 * - lo prerenderizado, la 404 y los estáticos los cubre la integración
 *   `src/astro/integraciones/cabeceras-en-la-cdn.ts`, que escribe estas
 *   mismas cabeceras en `.vercel/output/config.json`.
 */
import { cabecerasDeSeguridad } from "../lib/seguridad/csp";

/**
 * El `Cache-Control` que manda Next a una página `force-dynamic` (medido en
 * la build de `main`): nada de lo dinámico se guarda en cachés compartidas.
 */
export const CACHE_DE_HTML_DINAMICO = "private, no-cache, no-store, max-age=0, must-revalidate";

/**
 * El que manda Next a `robots.txt` y `sitemap.xml` (`force-dynamic`, medido
 * en la build de `main`). Lo fijan los propios endpoints.
 */
export const CACHE_DE_ARTEFACTO_DINAMICO = "public, max-age=0, must-revalidate";

/** Cabeceras que anuncian el marco: no deben salir nunca. */
const CABECERAS_DEL_MARCO = ["x-powered-by"];

/** Las cuatro cabeceras como objeto `{ nombre: valor }`. */
export function cabecerasComoObjeto(): Record<string, string> {
  return Object.fromEntries(cabecerasDeSeguridad().map(({ key, value }) => [key, value]));
}

function ajustar(cabeceras: Headers): void {
  // Solo se pone una cabecera si la respuesta no la trae: así una ruta que
  // declare una política de referente más estricta no queda anulada por la
  // global (spec `despliegue`).
  for (const [nombre, valor] of Object.entries(cabecerasComoObjeto())) {
    if (!cabeceras.has(nombre)) cabeceras.set(nombre, valor);
  }
  const tipo = (cabeceras.get("content-type") ?? "").toLowerCase();
  if (tipo.startsWith("text/html")) {
    // Astro manda `text/html` a secas; Next, con el juego de caracteres.
    if (!tipo.includes("charset")) cabeceras.set("content-type", "text/html; charset=utf-8");
    if (!cabeceras.has("cache-control")) cabeceras.set("cache-control", CACHE_DE_HTML_DINAMICO);
  }
  for (const nombre of CABECERAS_DEL_MARCO) cabeceras.delete(nombre);
}

/**
 * La respuesta de la función con las cuatro cabeceras y el `Cache-Control`
 * del HTML dinámico. Si sus cabeceras son inmutables (p. ej.
 * `Response.redirect`), se copia en una nueva en vez de reventar con un 500.
 */
export function prepararRespuesta(respuesta: Response): Response {
  try {
    ajustar(respuesta.headers);
    return respuesta;
  } catch {
    const copia = new Response(respuesta.body, respuesta);
    ajustar(copia.headers);
    return copia;
  }
}
