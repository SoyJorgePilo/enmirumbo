import type { APIRoute } from "astro";

import { type ReglasDeRobots, serializarRobots } from "@/astro/artefactos";
import { CACHE_DE_ARTEFACTO_DINAMICO } from "@/astro/cabeceras";
import { urlAbsoluta } from "@/lib/sitio";

/**
 * `robots.txt` del sitio (spec `layout-base`, requirement "El sitio publica un
 * `robots.txt` que permite lo público y excluye lo que no toca"; spec
 * `plataforma-astro`, "`robots.txt` y `sitemap.xml` responden igual que en
 * Next"). Lo que era `src/app/robots.ts`.
 *
 * Se excluyen `/admin` (el panel), `/buscar` (URLs con consulta: contenido
 * duplicado infinito) y `/registro/gracias` (la confirmación). NO se listan
 * rutas que todavía no existen —en particular la de los enlaces de gestión—:
 * anunciar en un archivo público la ruta de un enlace secreto es peor que no
 * excluirla. Es una petición a los rastreadores que se portan bien, no una
 * defensa contra la cosecha del directorio.
 *
 * Por petición, porque la línea del sitemap depende del entorno (`SITIO_URL`).
 */
export function reglasDeRobots(): ReglasDeRobots {
  const sitemap = urlAbsoluta("/sitemap.xml");
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/buscar", "/registro/gracias"],
    },
    // Sin URL pública declarada se omite la línea entera, antes que anunciar
    // un sitemap en `localhost`.
    ...(sitemap ? { sitemap } : {}),
  };
}

export const GET: APIRoute = () =>
  new Response(serializarRobots(reglasDeRobots()), {
    headers: { "Content-Type": "text/plain", "Cache-Control": CACHE_DE_ARTEFACTO_DINAMICO },
  });
