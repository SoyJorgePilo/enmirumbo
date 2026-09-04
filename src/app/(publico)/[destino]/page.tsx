import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ListadoCategoria } from "@/components/directorio/listado-categoria";
import { ListadoGiro } from "@/components/directorio/listado-giro";
import {
  contarNegociosPublicadosPorGiro,
  obtenerColoniaPorSlug,
  obtenerColoniasConNegociosPublicados,
  obtenerColoniasConNegociosPublicadosDeGiro,
  obtenerNegociosPublicados,
  obtenerNegociosPublicadosPorGiro,
} from "@/lib/directorio";
import { resolverDestinoDeLaRaiz } from "@/lib/seo/destino";
import { fraseDeGiro } from "@/lib/seo/frases-giro";
import { NOINDEX_CON_ENLACES, canonicaDe } from "@/lib/seo/metadata";
import {
  descripcionCategoria,
  descripcionGiro,
  descripcionGiroColonia,
  encabezadoCategoria,
  encabezadoGiro,
  encabezadoGiroColonia,
} from "@/lib/seo/titulos";

/**
 * Las TRES páginas de la raíz del sitio en un solo segmento dinámico
 * (design.md §1 del change `agregar-seo-local`):
 *
 * - `/servicios-del-hogar` → listado por categoría (lo de siempre, intacto);
 * - `/plomeria` → página del giro;
 * - `/plomeria-huicalco` → página de giro y colonia;
 * - cualquier otra cosa → 404 en español, sin sugerir parecidos.
 *
 * La carpeta se llama `[destino]` y no `[categoria]` porque en App Router no
 * pueden coexistir dos segmentos dinámicos con nombres distintos en el mismo
 * nivel; **renombrarla no cambia ninguna URL**: `/servicios-del-hogar` se
 * sigue sirviendo exactamente igual. El orden de resolución es parte de la
 * spec: la categoría gana siempre, para que nada de lo que se agregue a los
 * otros catálogos pueda secuestrar una URL ya publicada.
 *
 * Las rutas propias del sitio (`/registro`, `/negocio/…`, `/buscar`,
 * `/admin`) le ganan al segmento dinámico por regla de Next, y
 * `src/lib/rutas-reservadas.ts` impide el riesgo contrario (que un slug del
 * catálogo quede inalcanzable).
 *
 * Lee la base en cada request (`force-dynamic`): el contenido depende de lo
 * que el admin publique y en CI no hay base al construir.
 */
export const dynamic = "force-dynamic";

/**
 * Título, descripción y canónica de cada uno de los tres tipos de página
 * (spec `directorio-publico`, requirement "Título y descripción propios en
 * cada página del directorio, con su canónica").
 *
 * Dos decisiones que la spec fija:
 *
 * - el listado por categoría CON `?colonia=` canoniza al listado sin filtro,
 *   para no competir con las páginas de giro+colonia ni duplicar contenido;
 * - una página de giro o de giro+colonia SIN negocios publicados pide que no
 *   se la indexe (pero sí que se sigan sus enlaces): existe y responde 200
 *   con un estado vacío útil, nunca un 404 confuso, y no entra al sitemap
 *   (design.md §3, nada de thin content). La instrucción vive en una sola
 *   constante, `NOINDEX_CON_ENLACES`, y ninguna página la escribe a mano.
 */
export async function generateMetadata({
  params,
}: PageProps<"/[destino]">): Promise<Metadata> {
  const { destino } = await params;
  const resuelto = await resolverDestinoDeLaRaiz(destino);

  if (resuelto.tipo === "desconocido") return {};

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
  const ruta = colonia
    ? `/${resuelto.giro.slug}-${colonia.slug}`
    : `/${resuelto.giro.slug}`;
  const conNegocios =
    (await contarNegociosPublicadosPorGiro(resuelto.giro.slug, colonia?.slug)) > 0;

  return {
    title: colonia
      ? encabezadoGiroColonia(frase, colonia.nombre)
      : encabezadoGiro(frase),
    description: colonia
      ? descripcionGiroColonia(frase, colonia.nombre)
      : descripcionGiro(frase),
    alternates: canonicaDe(ruta),
    ...(conNegocios ? {} : { robots: NOINDEX_CON_ENLACES }),
  };
}

export default async function DestinoDeLaRaizPage({
  params,
  searchParams,
}: PageProps<"/[destino]">) {
  const { destino } = await params;
  const resuelto = await resolverDestinoDeLaRaiz(destino);

  if (resuelto.tipo === "desconocido") notFound();

  if (resuelto.tipo === "categoria") {
    const { categoria } = resuelto;
    const { colonia: coloniaParam } = await searchParams;

    // "Colonia desconocida en la URL" (scenario): un slug que no está en el
    // catálogo de colonias se ignora, sin 404 y sin romper la página.
    const coloniaParamTexto =
      typeof coloniaParam === "string" ? coloniaParam : undefined;
    const coloniaDelCatalogo = coloniaParamTexto
      ? await obtenerColoniaPorSlug(coloniaParamTexto)
      : null;
    const coloniaFiltro = coloniaDelCatalogo?.slug;

    const [negocios, coloniasConNegocios] = await Promise.all([
      obtenerNegociosPublicados(categoria.slug, coloniaFiltro),
      obtenerColoniasConNegociosPublicados(categoria.slug),
    ]);

    return (
      <ListadoCategoria
        categoria={categoria}
        coloniaFiltro={coloniaFiltro}
        negocios={negocios}
        coloniasConNegocios={coloniasConNegocios}
      />
    );
  }

  const colonia = resuelto.tipo === "giro-colonia" ? resuelto.colonia : null;
  const [negocios, coloniasConNegocios] = await Promise.all([
    obtenerNegociosPublicadosPorGiro(resuelto.giro.slug, colonia?.slug),
    obtenerColoniasConNegociosPublicadosDeGiro(resuelto.giro.slug),
  ]);

  return (
    <ListadoGiro
      giro={resuelto.giro}
      colonia={colonia}
      negocios={negocios}
      coloniasConNegocios={coloniasConNegocios}
    />
  );
}
