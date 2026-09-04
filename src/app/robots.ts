import type { MetadataRoute } from "next";

import { urlAbsoluta } from "@/lib/sitio";

/**
 * `robots.txt` del sitio, con la convención de App Router de esta versión de
 * Next (`app/robots.ts`; ver `node_modules/next/dist/docs/.../robots.md`).
 * Spec `layout-base`, requirement "El sitio publica un `robots.txt` que
 * permite lo público y excluye lo que no toca"; design.md §8.
 *
 * Se excluyen `/admin` (el panel de revisión, que además pide por su cuenta
 * que no se le indexe ni se sigan sus enlaces), `/buscar` (URLs con consulta:
 * contenido duplicado infinito; conserva su propia instrucción de no
 * indexarse a propósito, porque un rastreador que no puede leer la página
 * tampoco lee esa instrucción, y una URL enlazada desde fuera podría
 * indexarse solo por su dirección) y `/registro/gracias` (la pantalla de
 * confirmación, que no le aporta nada a un buscador).
 *
 * NO se listan rutas que todavía no existen —en particular la de los enlaces
 * de gestión de E8—: anunciar en un archivo público la ruta de un enlace
 * secreto es peor que no excluirla.
 *
 * Esto es una petición a los rastreadores que se portan bien, NO una defensa
 * contra la cosecha masiva del directorio (hallazgo M5 de T-004): esa sigue
 * siendo deuda de E5-5/E0-3.
 *
 * Dinámico porque la línea del sitemap depende del entorno (`SITIO_URL`).
 */
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const sitemap = urlAbsoluta("/sitemap.xml");

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/buscar", "/registro/gracias"],
    },
    // Sin URL pública declarada se omite la línea entera, antes que anunciar
    // un sitemap en `localhost` (design.md §5).
    ...(sitemap ? { sitemap } : {}),
  };
}
