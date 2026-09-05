/**
 * Metadata del sitio y de cada página (spec `layout-base`, requirement
 * "Server Component con documento en es-MX y metadata base"; spec
 * `directorio-publico`, requirement "Título y descripción propios en cada
 * página del directorio, con su canónica"). design.md §5 y §7.
 *
 * Todo lo que necesita una URL absoluta pasa por `urlSitio`: si no hay URL
 * pública declarada (producción mal configurada) NO se emite nada absoluto,
 * en vez de publicar direcciones a `localhost`.
 */
import type { Metadata } from "next";

import { urlDeFoto } from "@/lib/fotos/url";
import { type EntornoSitio, urlAbsoluta, urlSitio } from "@/lib/sitio";

/**
 * Título del sitio: el de la home y el de cualquier página sin uno propio.
 *
 * Rebrand T-019: la geografía sigue aquí —una vez, en el descriptor "en
 * Tizayuca"—, lo que desapareció es la localidad pegada al nombre. El SEO
 * local no depende de que la palabra salga dos veces.
 */
export const TITULO_DEL_SITIO =
  "EnMiRumbo — Encuentra negocios y servicios en Tizayuca";

export const DESCRIPCION_DEL_SITIO =
  "Encuentra negocios, servicios y deporte en Tizayuca y contáctalos directo por WhatsApp. Registro gratis para negocios locales.";

/** Marca corta, la que va al final del título de cada página. */
export const NOMBRE_DEL_SITIO = "EnMiRumbo";

/**
 * Un resultado de búsqueda dice primero de qué es la página y después de
 * quién: "Plomería en Huicalco, Tizayuca — EnMiRumbo".
 */
export const PLANTILLA_DE_TITULO = `%s — ${NOMBRE_DEL_SITIO}`;

/**
 * Ruta de la imagen de marca del sitio, la que genera
 * `src/app/opengraph-image.tsx` con la convención de App Router. La ficha la
 * declara explícitamente cuando el negocio no tiene foto: al declarar su
 * propio `openGraph`, una página deja de heredar la imagen del layout.
 */
export const RUTA_IMAGEN_DE_MARCA = "/opengraph-image";

/**
 * La imagen de marca como lista de Open Graph, o lista vacía si no hay URL
 * pública declarada (iteración 2, hallazgo M1 de la etapa C).
 *
 * La lista vacía **no es un descuido**: mientras exista
 * `src/app/opengraph-image.tsx`, Next le pega esa imagen a cualquier nivel de
 * metadata que no declare `images` propias y, sin `metadataBase`, la resuelve
 * contra `http://localhost:3000`
 * (`node_modules/next/dist/lib/metadata/resolvers/resolve-url.js`). Declarar
 * la lista —vacía o absoluta— es lo único que corta ese camino, y por eso lo
 * hacen los DOS niveles raíz de metadata del sitio: el layout y la 404.
 */
export function imagenesDeMarca(env: EntornoSitio = process.env): string[] {
  const absoluta = urlAbsoluta(RUTA_IMAGEN_DE_MARCA, env);
  return absoluta ? [absoluta] : [];
}

/**
 * Metadata base del documento (la del layout raíz). Es lo que heredan todas
 * las páginas: idioma de la vista previa, nombre del sitio, plantilla de
 * título y la base con la que se resuelven las URLs absolutas.
 */
export function metadataDelSitio(env: EntornoSitio = process.env): Metadata {
  const base = urlSitio(env);
  return {
    ...(base ? { metadataBase: new URL(base) } : {}),
    title: { default: TITULO_DEL_SITIO, template: PLANTILLA_DE_TITULO },
    description: DESCRIPCION_DEL_SITIO,
    openGraph: {
      type: "website",
      siteName: NOMBRE_DEL_SITIO,
      locale: "es_MX",
      // Sin URL pública declarada NO se ofrece imagen: la convención de
      // archivo la resolvería contra `http://localhost:3000`, que es
      // exactamente lo que no se quiere publicar (design.md §5). Con URL
      // declarada no se toca `images` y la imagen de marca se hereda sola.
      ...(base ? {} : { images: [] }),
    },
  };
}

/**
 * Bloque `alternates` con la canónica absoluta de una ruta, o `undefined`
 * cuando no hay URL pública: mejor sin canónica que con una a `localhost`.
 */
export function canonicaDe(
  ruta: string,
  env: EntornoSitio = process.env,
): Metadata["alternates"] {
  const absoluta = urlAbsoluta(ruta, env);
  return absoluta ? { canonical: absoluta } : undefined;
}

/** Instrucción de no indexar (pero sí seguir los enlaces) de lo vacío. */
export const NOINDEX_CON_ENLACES: Metadata["robots"] = {
  index: false,
  follow: true,
};

/**
 * Imagen de la vista previa: la foto del negocio si la tiene y, si no, la
 * imagen de marca del sitio — ninguna ficha se comparte sin imagen. Lista
 * vacía cuando no hay URL pública declarada.
 *
 * Recibe la **referencia interna** de la foto (`Negocio.fotoClave`), no una
 * dirección: la URL la construye `urlDeFoto` a partir de la clave que generó
 * el servidor, y cualquier otra cosa guardada en esa columna —una URL
 * externa, un `data:`, una ruta con `..`— devuelve `null` y cae en la imagen
 * de marca. Eso cierra el hallazgo **M3 de T-009** ("`fotoUrl` sin lista
 * blanca de dominio para `og:image`") sin lista blanca que mantener: nada de
 * fuera puede llegar a `og:image`, porque la dirección no se lee, se arma.
 */
export function imagenesDeLaFicha(
  fotoClave: string | null,
  env: EntornoSitio = process.env,
): string[] {
  const ruta = urlDeFoto(fotoClave, "ficha");
  if (!ruta) return imagenesDeMarca(env);
  const absoluta = urlAbsoluta(ruta, env);
  return absoluta ? [absoluta] : [];
}
