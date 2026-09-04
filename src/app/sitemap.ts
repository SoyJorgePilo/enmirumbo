import type { MetadataRoute } from "next";

import { obtenerDatosDelSitemap } from "@/lib/directorio";
import { construirSegmentoFicha } from "@/lib/ficha-url";
import { avisarSinUrlSitioUnaVez, urlSitio } from "@/lib/sitio";

/**
 * `sitemap.xml` del sitio, con la convención de App Router de esta versión de
 * Next (`app/sitemap.ts`; ver `node_modules/next/dist/docs/.../sitemap.md`).
 * Spec `layout-base`, requirement "El sitio publica un `sitemap.xml` que se
 * actualiza solo".
 *
 * Incluye la home, el registro, las 8 categorías, **cada giro y cada par
 * giro+colonia con al menos un negocio publicado** y la ficha de cada negocio
 * publicado con su fecha de publicación. Se arma de la base en cada petición,
 * sin ningún paso manual: publicar un negocio nuevo con un giro que hasta
 * entonces no tenía ninguno mete su página al sitemap sin que nadie edite un
 * archivo.
 *
 * Las 8 categorías van aunque estén vacías —son la navegación fija del sitio
 * y su estado vacío invita a registrarse—; lo que se excluye por vacío son
 * las combinaciones de giro y colonia, que son más de mil y sí producirían
 * thin content (design.md §3).
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = urlSitio();
  if (!base) {
    // Producción sin URL pública: documento válido y vacío antes que publicar
    // direcciones a `localhost` que Google intentaría rastrear. Queda
    // constancia en el log una sola vez por proceso (design.md §5).
    avisarSinUrlSitioUnaVez();
    return [];
  }

  const { categorias, giros, pares, fichas } = await obtenerDatosDelSitemap();

  return [
    { url: base },
    { url: `${base}/registro` },
    ...categorias.map((categoria) => ({ url: `${base}/${categoria.slug}` })),
    ...giros.map((giro) => ({ url: `${base}/${giro}` })),
    ...pares.map((par) => ({
      url: `${base}/${par.giroSlug}-${par.coloniaSlug}`,
    })),
    ...fichas.map((ficha) => ({
      url: `${base}/negocio/${construirSegmentoFicha(ficha.nombre, ficha.id)}`,
      ...(ficha.publicadoEn ? { lastModified: ficha.publicadoEn } : {}),
    })),
  ];
}
