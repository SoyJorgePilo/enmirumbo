/**
 * Metadatos de las páginas del directorio en Astro (change
 * `migrar-directorio-publico-astro`, tasks.md #9 y #10): lo que eran los
 * `generateMetadata` de `src/app/(publico)/[destino]/page.tsx` y de
 * `src/app/(publico)/negocio/[ficha]/page.tsx`, sin cambios. Los textos siguen
 * saliendo de `src/lib/seo/`.
 *
 * Viven aquí y no en `src/astro/metadatos.ts` a propósito: ese módulo lo usa
 * `DocumentoBase`, y por él pasan las páginas PRERENDERIZADAS; estas funciones
 * dependen de tipos de `@/lib/directorio`, y el guardián de `despliegue` exige
 * que ninguna prerenderizada llegue al acceso a datos ni por un tipo.
 *
 * Lo desconocido y lo no publicado no declaran nada: esas URLs pintan la 404
 * dinámica, que trae sus propios metadatos constantes
 * (`NoEncontradoDinamico.astro`).
 */
import type { MetadatosDePagina } from "@/astro/metadatos";
import type { NegocioFicha } from "@/lib/directorio";
import { construirSegmentoFicha } from "@/lib/ficha-url";
import type { DestinoRaiz } from "@/lib/seo/destino";
import { fraseDeGiro } from "@/lib/seo/frases-giro";
import { NOINDEX_CON_ENLACES, NOMBRE_DEL_SITIO, canonicaDe, imagenesDeLaFicha } from "@/lib/seo/metadata";
import {
  descripcionCategoria,
  descripcionFicha,
  descripcionGiro,
  descripcionGiroColonia,
  encabezadoCategoria,
  encabezadoGiro,
  encabezadoGiroColonia,
  tituloFicha,
} from "@/lib/seo/titulos";
import { urlAbsoluta } from "@/lib/sitio";

/**
 * Título, descripción y canónica de la categoría, el giro y el giro+colonia
 * (spec `directorio-publico`, requirement "Título y descripción propios en
 * cada página del directorio, con su canónica").
 *
 * - El listado por categoría CON `?colonia=` canoniza al listado sin filtro.
 * - Una página de giro o de giro+colonia SIN negocios publicados pide no
 *   indexarse, permitiendo seguir sus enlaces (`NOINDEX_CON_ENLACES`).
 */
export function metadatosDeDestino(
  resuelto: Exclude<DestinoRaiz, { tipo: "desconocido" }>,
  conNegocios: boolean,
): MetadatosDePagina {
  if (resuelto.tipo === "categoria") {
    const { categoria } = resuelto;
    return {
      title: encabezadoCategoria(categoria.nombre),
      description: descripcionCategoria(categoria.nombre),
      alternates: canonicaDe(`/${categoria.slug}`),
    };
  }
  const frase = fraseDeGiro(resuelto.giro);
  const colonia = resuelto.tipo === "giro-colonia" ? resuelto.colonia : null;
  const ruta = colonia ? `/${resuelto.giro.slug}-${colonia.slug}` : `/${resuelto.giro.slug}`;
  return {
    title: colonia ? encabezadoGiroColonia(frase, colonia.nombre) : encabezadoGiro(frase),
    description: colonia ? descripcionGiroColonia(frase, colonia.nombre) : descripcionGiro(frase),
    alternates: canonicaDe(ruta),
    ...(conNegocios ? {} : { robots: NOINDEX_CON_ENLACES }),
  };
}

/**
 * Título, descripción, canónica y vista previa de una ficha PUBLICADA (spec
 * `directorio-publico`, "Título y descripción propios…" y "La ficha se ve
 * bien al compartirla…"). La canónica es siempre el segmento con el nombre
 * actual; la imagen es su foto (por `urlDeFoto`, nunca una dirección
 * guardada) o la de marca; nunca su WhatsApp ni su teléfono.
 */
export function metadatosDeFicha(negocio: NegocioFicha): MetadatosDePagina {
  const ruta = `/negocio/${construirSegmentoFicha(negocio.nombre, negocio.id)}`;
  const titulo = tituloFicha(negocio.nombre, negocio.coloniaNombre);
  const descripcion = descripcionFicha(negocio);
  const url = urlAbsoluta(ruta);
  return {
    title: titulo,
    description: descripcion,
    alternates: canonicaDe(ruta),
    openGraph: {
      type: "article",
      title: titulo,
      description: descripcion,
      siteName: NOMBRE_DEL_SITIO,
      locale: "es_MX",
      ...(url ? { url } : {}),
      images: imagenesDeLaFicha(negocio.fotoClave),
    },
  };
}
