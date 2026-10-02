import type { APIRoute } from "astro";

import { type EntradaDelSitemap, serializarSitemap } from "@/astro/artefactos";
import { CACHE_DE_ARTEFACTO_DINAMICO } from "@/astro/cabeceras";
import { obtenerDatosDelSitemap } from "@/lib/directorio";
import { construirSegmentoFicha } from "@/lib/ficha-url";
import { avisarSinUrlSitioUnaVez, urlSitio } from "@/lib/sitio";

/**
 * `sitemap.xml` del sitio (spec `layout-base`, requirement "El sitio publica
 * un `sitemap.xml` que se actualiza solo"; spec `plataforma-astro`,
 * "`robots.txt` y `sitemap.xml` responden igual que en Next"). Lo que era
 * `src/app/sitemap.ts`.
 *
 * La home, el registro, las 8 categorías, cada giro y cada par giro+colonia
 * con al menos un negocio publicado, y la ficha de cada negocio publicado con
 * su fecha de publicación. Se arma de la base EN CADA PETICIÓN: publicar un
 * negocio con un giro nuevo mete su página sin reconstruir nada.
 *
 * Las 8 categorías van aunque estén vacías (navegación fija); lo que se
 * excluye por vacío son las combinaciones de giro y colonia (thin content).
 */
export async function entradasDelSitemap(): Promise<EntradaDelSitemap[]> {
  const base = urlSitio();
  if (!base) {
    // Producción sin URL pública: documento válido y vacío antes que publicar
    // direcciones a `localhost`. Constancia en el log una vez por proceso.
    avisarSinUrlSitioUnaVez();
    return [];
  }

  const { categorias, giros, pares, fichas } = await obtenerDatosDelSitemap();

  return [
    { url: base },
    { url: `${base}/registro` },
    ...categorias.map((categoria) => ({ url: `${base}/${categoria.slug}` })),
    ...giros.map((giro) => ({ url: `${base}/${giro}` })),
    ...pares.map((par) => ({ url: `${base}/${par.giroSlug}-${par.coloniaSlug}` })),
    ...fichas.map((ficha) => ({
      url: `${base}/negocio/${construirSegmentoFicha(ficha.nombre, ficha.id)}`,
      ...(ficha.publicadoEn ? { lastModified: ficha.publicadoEn } : {}),
    })),
  ];
}

export const GET: APIRoute = async () =>
  new Response(serializarSitemap(await entradasDelSitemap()), {
    headers: { "Content-Type": "application/xml", "Cache-Control": CACHE_DE_ARTEFACTO_DINAMICO },
  });
