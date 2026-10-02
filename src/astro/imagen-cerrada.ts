import type { APIRoute } from "astro";

/**
 * Reemplazo del endpoint `/_image` de Astro (`image.endpoint.entrypoint` en
 * `astro.config.mjs`). Astro lo inyecta en toda salida `server` sin opción para
 * quitarlo, y el suyo reenvía rutas del mismo sitio con la cookie de quien pide
 * y marca la respuesta como caché pública de un año (Medio 1 de
 * `openspec/changes/agregar-andamio-astro/reports/c-seguridad.md`).
 *
 * El sitio no usa el optimizador de Astro (las fotos salen de `/api/foto/…`
 * ya en su tamaño final), así que aquí no hay nada que servir: responde como
 * una ruta que no existe.
 */
export const GET: APIRoute = () => new Response(null, { status: 404 });
