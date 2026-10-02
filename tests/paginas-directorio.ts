/**
 * Las páginas del directorio en Astro, para las pruebas que antes importaban
 * `src/app/(publico)/[destino]`, `negocio/[ficha]/page` y `buscar` (change
 * `migrar-directorio-publico-astro`, tasks.md #15).
 *
 * - `pintarDestino`, `pintarFicha` y `pintarBuscar` pintan la página REAL con
 *   la Container API y devuelven el estado, el documento y lo que hay dentro
 *   de `<main>` (lo que pintaba la página de Next; en las 200, más el script
 *   de la medición si está configurada).
 * - `metadataDestino` y `metadataFicha` devuelven los metadatos que la página
 *   le pasa al documento (lo que devolvía `generateMetadata`), o `{}` cuando
 *   la URL responde la 404 dinámica, igual que antes.
 */
import { cargarDestino, cargarFicha } from "../src/astro/directorio";
import type { MetadatosDePagina } from "../src/astro/metadatos";
import Destino from "../src/pages/[destino].astro";
import Buscar from "../src/pages/buscar.astro";
import Ficha from "../src/pages/negocio/[ficha].astro";
import { contenidoDelMain, pintarRespuesta } from "./astro-paginas";

export type ParametrosDeConsulta = Record<string, string | string[] | undefined>;

/** La cadena de consulta, con los valores repetidos como llegarían en la URL. */
export function cadenaDeConsulta(parametros: ParametrosDeConsulta = {}): string {
  const consulta = new URLSearchParams();
  for (const [clave, valor] of Object.entries(parametros)) {
    if (valor === undefined) continue;
    for (const v of Array.isArray(valor) ? valor : [valor]) consulta.append(clave, v);
  }
  const texto = consulta.toString();
  return texto ? `?${texto}` : "";
}

export type PaginaPintada = {
  status: number;
  /** El documento completo. */
  documento: string;
  /** Lo que hay dentro de `<main>`. */
  main: string;
};

async function pintar(
  pagina: Parameters<typeof pintarRespuesta>[0],
  ruta: string,
  params?: Record<string, string>,
): Promise<PaginaPintada> {
  const { status, html } = await pintarRespuesta(pagina, { ruta, ...(params ? { params } : {}) });
  return { status, documento: html, main: contenidoDelMain(html) };
}

/** `/[destino]` con su consulta (`?colonia=`). */
export function pintarDestino(destino: string, consulta: ParametrosDeConsulta = {}): Promise<PaginaPintada> {
  return pintar(Destino, `/${encodeURIComponent(destino)}${cadenaDeConsulta(consulta)}`, { destino });
}

/** `/negocio/[ficha]`. */
export function pintarFicha(segmento: string): Promise<PaginaPintada> {
  return pintar(Ficha, `/negocio/${encodeURIComponent(segmento)}`, { ficha: segmento });
}

/** `/buscar` con su consulta (`?q=`). */
export function pintarBuscar(consulta: ParametrosDeConsulta = {}): Promise<PaginaPintada> {
  return pintar(Buscar, `/buscar${cadenaDeConsulta(consulta)}`);
}

type PropsDeRuta<P> = { params: Promise<P>; searchParams?: Promise<ParametrosDeConsulta> };

/** Los metadatos de `/[destino]` (lo que devolvía su `generateMetadata`). */
export async function metadataDestino(props: PropsDeRuta<{ destino: string }>): Promise<MetadatosDePagina> {
  const { destino } = await props.params;
  const consulta = new URLSearchParams(cadenaDeConsulta((await props.searchParams) ?? {}).slice(1));
  const carga = await cargarDestino(destino, consulta);
  return carga.tipo === "no-encontrado" ? {} : carga.metadatos;
}

/** Los metadatos de `/negocio/[ficha]` (lo que devolvía su `generateMetadata`). */
export async function metadataFicha(props: PropsDeRuta<{ ficha: string }>): Promise<MetadatosDePagina> {
  const { ficha } = await props.params;
  const carga = await cargarFicha(ficha);
  return carga.tipo === "no-encontrado" ? {} : carga.metadatos;
}

/** Lo que hay en `<main>` de una página que DEBE responder 200 (si no, lanza, como el `notFound()` de antes). */
async function mainDe(pintada: Promise<PaginaPintada>, ruta: string): Promise<string> {
  const { status, main } = await pintada;
  if (status !== 200) throw new Error(`${ruta} respondió ${status}`);
  return main;
}

export const mainDeDestino = (destino: string, consulta: ParametrosDeConsulta = {}) =>
  mainDe(pintarDestino(destino, consulta), `/${destino}`);

export const mainDeFicha = (segmento: string) => mainDe(pintarFicha(segmento), `/negocio/${segmento}`);

export const mainDeBuscar = (consulta: ParametrosDeConsulta = {}) => mainDe(pintarBuscar(consulta), "/buscar");

/**
 * La ruta pública de fotos de Astro (`src/pages/api/foto/[clave]/[variante].ts`)
 * con la firma de un manejador de Next (`(peticion, { params })`), la misma que
 * sigue teniendo la ruta del panel (`/admin/foto/…`, Fase 5): así las pruebas
 * que comparan las dos respuestas siguen comparándolas.
 */
export async function fotoPublica(
  peticion: Request,
  contexto: { params: Promise<{ clave: string; variante: string }> },
): Promise<Response> {
  const { GET } = await import("../src/pages/api/foto/[clave]/[variante]");
  const params = await contexto.params;
  return GET({ request: peticion, url: new URL(peticion.url), params } as never);
}
