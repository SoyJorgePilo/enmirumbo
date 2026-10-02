/**
 * Serializadores de `robots.txt` y `sitemap.xml` (change
 * `migrar-lectura-publica-astro`; spec `plataforma-astro`, requirement
 * "`robots.txt` y `sitemap.xml` responden igual que en Next").
 *
 * Next convertía los objetos de `app/robots.ts` y `app/sitemap.ts` en texto
 * con `resolveRobots` y `resolveSitemap`
 * (`next/dist/build/webpack/loaders/metadata/resolve-route-data.js`). Aquí se
 * reproduce SOLO lo que el sitio usa (una regla, `allow`, `disallow`,
 * `sitemap`; entradas con `url` y `lastModified`), byte por byte, para que el
 * cuerpo sea el mismo. Las URLs salen de slugs y de `urlSitio`, que no llevan
 * caracteres que haya que escapar en XML; Next tampoco las escapaba.
 */

export type ReglasDeRobots = {
  rules: { userAgent: string; allow: string; disallow: string[] };
  sitemap?: string;
};

export type EntradaDelSitemap = { url: string; lastModified?: Date };

export function serializarRobots({ rules, sitemap }: ReglasDeRobots): string {
  let contenido = `User-Agent: ${rules.userAgent}\n`;
  contenido += `Allow: ${rules.allow}\n`;
  for (const ruta of rules.disallow) contenido += `Disallow: ${ruta}\n`;
  contenido += "\n";
  if (sitemap) contenido += `Sitemap: ${sitemap}\n`;
  return contenido;
}

export function serializarSitemap(entradas: EntradaDelSitemap[]): string {
  let contenido = '<?xml version="1.0" encoding="UTF-8"?>\n';
  contenido += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  for (const entrada of entradas) {
    contenido += "<url>\n";
    contenido += `<loc>${entrada.url}</loc>\n`;
    if (entrada.lastModified) contenido += `<lastmod>${entrada.lastModified.toISOString()}</lastmod>\n`;
    contenido += "</url>\n";
  }
  contenido += "</urlset>\n";
  return contenido;
}
