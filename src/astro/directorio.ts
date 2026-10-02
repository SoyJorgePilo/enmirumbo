/**
 * Lo que leen de la base las páginas del directorio en Astro (change
 * `migrar-directorio-publico-astro`): `/[destino]`, `/negocio/[ficha]` y
 * `/buscar`. Cada función decide QUÉ es la URL y trae lo que la página pinta,
 * incluidos sus metadatos (lo que eran los `generateMetadata` de Next) y la
 * foto que se precarga. Las páginas `.astro` solo pintan.
 *
 * Ninguna arma consultas propias: todo sale de `src/lib/directorio.ts`, que
 * aplica `estado: publicado` por construcción.
 */
import type { MetadatosDePagina } from "@/astro/metadatos";
import { metadatosDeDestino, metadatosDeFicha } from "@/astro/metadatos-directorio";
import { recortarConsulta } from "@/astro/buscar";
import type { ListadoCategoriaProps } from "@/components/directorio/listado-categoria";
import type { ListadoGiroProps } from "@/components/directorio/listado-giro";
import { terminosDeBusqueda } from "@/lib/busqueda";
import {
  type CategoriaCatalogo,
  type GiroCatalogo,
  type NegocioFicha,
  type NegocioListado,
  buscarNegociosPublicados,
  contarNegociosPublicadosPorGiro,
  listarCategorias,
  obtenerColoniaPorSlug,
  obtenerColoniasConNegociosPublicados,
  obtenerColoniasConNegociosPublicadosDeGiro,
  obtenerGirosDeNegocioPublicado,
  obtenerNegocioPublicado,
  obtenerNegociosPublicados,
  obtenerNegociosPublicadosPorGiro,
} from "@/lib/directorio";
import { construirSegmentoFicha, extraerIdDeSegmentoFicha } from "@/lib/ficha-url";
import { urlDeFoto } from "@/lib/fotos/url";
import { resolverDestinoDeLaRaiz } from "@/lib/seo/destino";

/** Lo desconocido o no publicado: la página pinta la 404 dinámica. */
export type NoEncontrado = { tipo: "no-encontrado" };

export type CargaDeDestino =
  | NoEncontrado
  | {
      tipo: "categoria";
      metadatos: MetadatosDePagina;
      precargaImagen: string | null;
      listado: ListadoCategoriaProps;
    }
  | {
      tipo: "giro";
      metadatos: MetadatosDePagina;
      precargaImagen: string | null;
      giro: ListadoGiroProps;
    };

/** La foto de la primera tarjeta, que es la única prioritaria (y precargada). */
const precargaDeLista = (negocios: NegocioListado[]) => urlDeFoto(negocios[0]?.fotoClave, "tarjeta");

/**
 * `/[destino]`: categoría → giro → giro+colonia, en ese orden
 * (`resolverDestinoDeLaRaiz`). Si no resuelve, no hace ninguna otra consulta.
 *
 * `?colonia=`: un slug que no está en el catálogo se ignora, sin 404. Repetida
 * (`?colonia=a&colonia=b`) también se ignora: Next la recibía como arreglo y
 * solo filtraba con una cadena (medido en la build de `main`; desviación de
 * letra documentada en `reports/b-dev.md`).
 */
export async function cargarDestino(slug: string, consulta: URLSearchParams): Promise<CargaDeDestino> {
  const resuelto = await resolverDestinoDeLaRaiz(slug);
  if (resuelto.tipo === "desconocido") return { tipo: "no-encontrado" };

  if (resuelto.tipo === "categoria") {
    const { categoria } = resuelto;
    const valores = consulta.getAll("colonia");
    const coloniaParam = valores.length === 1 ? valores[0] : null;
    const coloniaDelCatalogo = coloniaParam ? await obtenerColoniaPorSlug(coloniaParam) : null;
    const coloniaFiltro = coloniaDelCatalogo?.slug;
    const [negocios, coloniasConNegocios] = await Promise.all([
      obtenerNegociosPublicados(categoria.slug, coloniaFiltro),
      obtenerColoniasConNegociosPublicados(categoria.slug),
    ]);
    return {
      tipo: "categoria",
      metadatos: metadatosDeDestino(resuelto, true),
      precargaImagen: precargaDeLista(negocios),
      listado: { categoria, coloniaFiltro, negocios, coloniasConNegocios },
    };
  }

  const colonia = resuelto.tipo === "giro-colonia" ? resuelto.colonia : null;
  const [conteo, negocios, coloniasConNegocios] = await Promise.all([
    contarNegociosPublicadosPorGiro(resuelto.giro.slug, colonia?.slug),
    obtenerNegociosPublicadosPorGiro(resuelto.giro.slug, colonia?.slug),
    obtenerColoniasConNegociosPublicadosDeGiro(resuelto.giro.slug),
  ]);
  return {
    tipo: "giro",
    metadatos: metadatosDeDestino(resuelto, conteo > 0),
    precargaImagen: precargaDeLista(negocios),
    giro: { giro: resuelto.giro, colonia, negocios, coloniasConNegocios },
  };
}

export type CargaDeFicha =
  | NoEncontrado
  | {
      tipo: "ficha";
      negocio: NegocioFicha;
      giros: GiroCatalogo[];
      /** `/negocio/<nombre actual>-<id>`: la canónica y la base de sus sub-rutas. */
      ruta: string;
      metadatos: MetadatosDePagina;
      /** La foto de la ficha (variante `ficha`) si lo guardado es una clave del servidor. */
      precargaImagen: string | null;
    };

/**
 * `/negocio/[ficha]`: el identificador es lo que sigue al ÚLTIMO guion. Lo que
 * no existe y lo que no está publicado (en revisión, rechazado, despublicado o
 * borrado) devuelven lo MISMO, antes de cualquier otra consulta.
 */
export async function cargarFicha(segmento: string): Promise<CargaDeFicha> {
  const id = extraerIdDeSegmentoFicha(segmento);
  const negocio = id ? await obtenerNegocioPublicado(id) : null;
  if (!negocio) return { tipo: "no-encontrado" };
  const giros = await obtenerGirosDeNegocioPublicado(negocio.id);
  return {
    tipo: "ficha",
    negocio,
    giros,
    ruta: `/negocio/${construirSegmentoFicha(negocio.nombre, negocio.id)}`,
    metadatos: metadatosDeFicha(negocio),
    precargaImagen: urlDeFoto(negocio.fotoClave, "ficha"),
  };
}

export type CargaDeBusqueda =
  | { tipo: "sin-consulta"; categorias: CategoriaCatalogo[] }
  | { tipo: "sin-resultados"; consulta: ReturnType<typeof recortarConsulta>; categorias: CategoriaCatalogo[] }
  | {
      tipo: "resultados";
      consulta: ReturnType<typeof recortarConsulta>;
      resultados: NegocioListado[];
      precargaImagen: string | null;
    };

/**
 * `/buscar`: `?q` repetido usa el primer valor (`get`), como Next. Sin ningún
 * término buscable no se buscan negocios.
 */
export async function cargarBusqueda(consulta: URLSearchParams): Promise<CargaDeBusqueda> {
  const consultaCruda = consulta.get("q") ?? "";
  if (terminosDeBusqueda(consultaCruda).length === 0) {
    return { tipo: "sin-consulta", categorias: await listarCategorias() };
  }
  const recortada = recortarConsulta(consultaCruda);
  const resultados = await buscarNegociosPublicados(consultaCruda);
  if (resultados.length === 0) {
    return { tipo: "sin-resultados", consulta: recortada, categorias: await listarCategorias() };
  }
  return { tipo: "resultados", consulta: recortada, resultados, precargaImagen: precargaDeLista(resultados) };
}
