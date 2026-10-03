/**
 * Metadatos del documento en Astro (change `migrar-lectura-publica-astro`,
 * design.md §3; spec `plataforma-astro`, requirement "Los metadatos de cada
 * página son los mismos que emitía Next").
 *
 * Las páginas siguen armando sus metadatos con `src/lib/seo/` (la misma forma
 * de objeto que `Metadata` de Next). Este módulo reproduce SOLO la parte de la
 * resolución de Next que el sitio usa, sin generalizar:
 *
 * - fusión superficial por clave entre el layout y la página: un `openGraph`
 *   de la página reemplaza al del layout entero;
 * - plantilla `%s — EnMiRumbo` para títulos de página y `title.default` si la
 *   página no declara uno;
 * - `og:title`/`og:description` y la tarjeta `twitter:*` heredados del título,
 *   la descripción y `openGraph` (`postProcessMetadata` de Next);
 * - la imagen de la convención de archivo (`/opengraph-image?<versión>` con
 *   tipo, medidas y texto alternativo) cuando nadie declaró `images`;
 * - canónica, robots, `noindex` en toda 404, `charset`, `viewport` e icono;
 * - `referrer` (Fase 4, change `migrar-enlace-gestion-astro`, design.md
 *   §1.2): la `<meta name="referrer">` que Next pinta para un `metadata.referrer`,
 *   en su posición (después de la descripción y antes de `robots`). Solo la
 *   declara el tronco de gestión.
 *
 * La verdad es lo que emite la build de Next: `tests/astro-metadatos.test.ts`
 * compara contra `<head>` capturados de ella.
 */
import { RUTA_IMAGEN_DE_MARCA, type metadataDelSitio } from "@/lib/seo/metadata";

import {
  ALT_IMAGEN_DE_MARCA,
  TAMANO_IMAGEN_DE_MARCA,
  TIPO_IMAGEN_DE_MARCA,
} from "./imagen-de-marca/datos";

/** La forma de objeto que producen `src/lib/seo/` y las páginas. */
export type MetadatosDePagina = ReturnType<typeof metadataDelSitio>;

export type Etiqueta =
  | { etiqueta: "title"; texto: string }
  | { etiqueta: "meta" | "link"; atributos: Record<string, string> };

export type OpcionesDeResolucion = {
  /** Metadatos del layout raíz (`metadataDelSitio()`). */
  sitio: MetadatosDePagina;
  /** Metadatos propios de la página, si declara alguno. */
  pagina?: MetadatosDePagina;
  /** Respuesta 404: Next agrega `robots noindex` por su cuenta. */
  noEncontrado?: boolean;
  /** Versión de la imagen de marca (hash del PNG generado). */
  versionImagenDeMarca: string;
  /** Versión del icono (hash de `public/favicon.ico`). */
  versionIcono: string;
};

type Titulo = MetadatosDePagina["title"];
type Robots = MetadatosDePagina["robots"];
type ImagenOg = { url: string; ancho?: number; alto?: number; tipo?: string; alt?: string };

function tituloResuelto(sitio: Titulo, pagina: Titulo): string | undefined {
  const plantilla = sitio && typeof sitio === "object" && "template" in sitio ? sitio.template : undefined;
  const porDefecto = sitio && typeof sitio === "object" && "default" in sitio ? sitio.default : undefined;
  if (typeof pagina === "string") return plantilla ? plantilla.replace("%s", pagina) : pagina;
  if (pagina && typeof pagina === "object" && "absolute" in pagina) return pagina.absolute;
  if (typeof sitio === "string") return sitio;
  return porDefecto ?? undefined;
}

function contenidoDeRobots(robots: Robots): string | undefined {
  if (!robots) return undefined;
  if (typeof robots === "string") return robots;
  const partes: string[] = [];
  if (robots.index === true) partes.push("index");
  if (robots.index === false) partes.push("noindex");
  if (robots.follow === true) partes.push("follow");
  if (robots.follow === false) partes.push("nofollow");
  return partes.length ? partes.join(", ") : undefined;
}

function urlComoTexto(valor: unknown): string | undefined {
  if (typeof valor === "string") return valor;
  if (valor instanceof URL) return valor.toString();
  return undefined;
}

/** Las imágenes declaradas a mano, como las acepta `openGraph.images`. */
function imagenesDeclaradas(imagenes: unknown): ImagenOg[] {
  const lista = Array.isArray(imagenes) ? imagenes : [imagenes];
  return lista.flatMap((imagen): ImagenOg[] => {
    const directa = urlComoTexto(imagen);
    if (directa) return [{ url: directa }];
    if (imagen && typeof imagen === "object" && "url" in imagen) {
      const url = urlComoTexto((imagen as { url: unknown }).url);
      if (!url) return [];
      const i = imagen as { width?: number; height?: number; type?: string; alt?: string };
      return [{ url, ancho: i.width, alto: i.height, tipo: i.type, alt: i.alt }];
    }
    return [];
  });
}

const meta = (atributos: Record<string, string>): Etiqueta => ({ etiqueta: "meta", atributos });
const prop = (property: string, content: string) => meta({ property, content });
const nombre = (name: string, content: string) => meta({ name, content });

function etiquetasDeImagen(prefijo: "og" | "twitter", imagen: ImagenOg): Etiqueta[] {
  const crear = prefijo === "og" ? prop : nombre;
  const salida = [crear(`${prefijo}:image`, imagen.url)];
  // Mismo orden que Next: og → tipo, ancho, alto, alt; twitter → alt, tipo, ancho, alto.
  const tipo = imagen.tipo ? [crear(`${prefijo}:image:type`, imagen.tipo)] : [];
  const ancho = imagen.ancho ? [crear(`${prefijo}:image:width`, String(imagen.ancho))] : [];
  const alto = imagen.alto ? [crear(`${prefijo}:image:height`, String(imagen.alto))] : [];
  const alt = imagen.alt ? [crear(`${prefijo}:image:alt`, imagen.alt)] : [];
  return prefijo === "og"
    ? [...salida, ...tipo, ...ancho, ...alto, ...alt]
    : [...salida, ...alt, ...tipo, ...ancho, ...alto];
}

/** Las etiquetas del `<head>`, en el orden en que las pinta Next. */
export function resolverMetadatos(opciones: OpcionesDeResolucion): Etiqueta[] {
  const { sitio, pagina = {}, noEncontrado = false } = opciones;
  const titulo = tituloResuelto(sitio.title, pagina.title);
  const descripcion = pagina.description ?? sitio.description ?? undefined;
  const robots = contenidoDeRobots(pagina.robots ?? sitio.robots);
  const canonica = urlComoTexto((pagina.alternates ?? sitio.alternates)?.canonical);
  const base = pagina.metadataBase ?? sitio.metadataBase;
  const og = pagina.openGraph ?? sitio.openGraph;

  let imagenes: ImagenOg[] = [];
  if (og && "images" in og && og.images !== undefined) {
    imagenes = imagenesDeclaradas(og.images);
  } else if (base) {
    // Convención de archivo: la imagen de marca, con versión para que las
    // aplicaciones de mensajería refresquen la vista previa al cambiarla.
    imagenes = [
      {
        url: `${new URL(RUTA_IMAGEN_DE_MARCA, base).toString()}?${opciones.versionImagenDeMarca}`,
        tipo: TIPO_IMAGEN_DE_MARCA,
        ancho: TAMANO_IMAGEN_DE_MARCA.width,
        alto: TAMANO_IMAGEN_DE_MARCA.height,
        alt: ALT_IMAGEN_DE_MARCA,
      },
    ];
  }

  const etiquetas: Etiqueta[] = [
    meta({ charset: "utf-8" }),
    nombre("viewport", "width=device-width, initial-scale=1"),
  ];
  if (noEncontrado) etiquetas.push(nombre("robots", "noindex"));
  if (titulo) etiquetas.push({ etiqueta: "title", texto: titulo });
  if (descripcion) etiquetas.push(nombre("description", descripcion));
  const referente = pagina.referrer ?? sitio.referrer;
  if (typeof referente === "string" && referente) etiquetas.push(nombre("referrer", referente));
  if (robots) etiquetas.push(nombre("robots", robots));
  if (canonica) etiquetas.push({ etiqueta: "link", atributos: { rel: "canonical", href: canonica } });

  if (og) {
    const ogTitulo = tituloResuelto(undefined, og.title) ?? titulo;
    const ogDescripcion = og.description ?? descripcion;
    if (ogTitulo) etiquetas.push(prop("og:title", ogTitulo));
    if (ogDescripcion) etiquetas.push(prop("og:description", ogDescripcion));
    const ogUrl = urlComoTexto(og.url);
    if (ogUrl) etiquetas.push(prop("og:url", ogUrl));
    if (og.siteName) etiquetas.push(prop("og:site_name", og.siteName));
    if (og.locale) etiquetas.push(prop("og:locale", og.locale));
    for (const imagen of imagenes) etiquetas.push(...etiquetasDeImagen("og", imagen));
    const tipo = (og as { type?: unknown }).type;
    if (typeof tipo === "string" && tipo) etiquetas.push(prop("og:type", tipo));

    etiquetas.push(nombre("twitter:card", imagenes.length ? "summary_large_image" : "summary"));
    if (ogTitulo) etiquetas.push(nombre("twitter:title", ogTitulo));
    if (ogDescripcion) etiquetas.push(nombre("twitter:description", ogDescripcion));
    for (const imagen of imagenes) etiquetas.push(...etiquetasDeImagen("twitter", imagen));
  }

  etiquetas.push({
    etiqueta: "link",
    atributos: {
      rel: "icon",
      href: `/favicon.ico?${opciones.versionIcono}`,
      sizes: "256x256",
      type: "image/x-icon",
    },
  });
  return etiquetas;
}

function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Las etiquetas como HTML. Lo usan las pruebas; las páginas las pintan con el
 * escape de Astro (`DocumentoBase.astro`).
 */
export function etiquetasAHtml(etiquetas: Etiqueta[]): string {
  return etiquetas
    .map((e) => {
      if (e.etiqueta === "title") return `<title>${escapar(e.texto)}</title>`;
      const attrs = Object.entries(e.atributos)
        .map(([k, v]) => `${k}="${escapar(v)}"`)
        .join(" ");
      return `<${e.etiqueta} ${attrs}>`;
    })
    .join("");
}
