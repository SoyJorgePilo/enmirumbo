import type { APIRoute } from "astro";
import { pngBase64 } from "virtual:enmirumbo/imagen-de-marca-png";

/**
 * Imagen de marca para la vista previa al compartir, en su dirección de
 * siempre (spec `plataforma-astro`, requirement "La imagen de marca se sirve
 * en la misma dirección y no se renderiza por petición"; design.md §6).
 *
 * Prerenderizada: el PNG se genera AL CONSTRUIR (`satori` + `resvg`, en
 * `src/astro/integraciones/imagen-de-marca.ts`) desde el árbol revisable de
 * `src/astro/imagen-de-marca/arbol.tsx`, y sale a la CDN como archivo
 * estático. Ningún dato de una petición llega al generador y la función del
 * servidor no lo incluye. El `Content-Type` del archivo (que no tiene
 * extensión) lo declara la integración de la CDN.
 */
export const prerender = true;

export const GET: APIRoute = () =>
  new Response(Buffer.from(pngBase64, "base64"), { headers: { "Content-Type": "image/png" } });
