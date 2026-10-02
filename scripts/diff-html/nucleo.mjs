/**
 * Núcleo del diff de HTML Next vs. Astro (change `migrar-lectura-publica-astro`,
 * design.md §9). Funciones puras: las usa `scripts/diff-html.mjs` y las prueba
 * `tests/diff-html.test.ts`.
 *
 * NORMALIZA lo que es propio de cada marco y no le llega al vecino como
 * contenido: el runtime de Next (scripts, precargas, `self.__next_f`,
 * `noModule`, el `<div hidden>` de sus fronteras de metadatos), los
 * comentarios de React, los hashes de las hojas de estilo y el `?<hash>` de la
 * imagen y del icono (se exige que exista, no su valor). Los bloques JSON-LD
 * NO se quitan: son datos.
 *
 * COMPARA estado, las cuatro cabeceras de seguridad, `Content-Type`,
 * `Cache-Control` (solo en rutas dinámicas), cabeceras que anuncien el marco
 * (en la respuesta de Astro), `<html lang>`, `<title>`, el conjunto de
 * `<meta>` y de `<link>` del head, los JSON-LD parseados, el texto visible por
 * landmark, los enlaces y la secuencia de elementos con sus atributos dentro
 * de `<body>`.
 */
import { parse } from "node-html-parser";

export const CABECERAS_DE_SEGURIDAD = [
  "content-security-policy",
  "x-content-type-options",
  "x-frame-options",
  "referrer-policy",
];

/** Cabeceras que delatan el marco. Solo se exigen ausentes en la versión Astro. */
const CABECERA_DEL_MARCO = /^(x-powered-by|x-nextjs-|x-astro|x-middleware-)/i;

const RUNTIME_SCRIPT = /\/_next\/|__next_f|__next_/;

/** Quita el `?<hash>` de la imagen de marca, del icono y de las hojas de estilo. */
export function normalizarUrl(valor) {
  return valor
    .replace(/(\/opengraph-image)\?[^"'\s]+/g, "$1?<hash>")
    .replace(/(\/favicon\.ico)\?[^"'\s]+/g, "$1?<hash>");
}

function esJsonLd(nodo) {
  return (nodo.getAttribute("type") ?? "").toLowerCase() === "application/ld+json";
}

/** Atributos en minúsculas, sin los que solo usa el runtime de Next. */
function atributos(nodo) {
  return Object.fromEntries(
    Object.entries(nodo.attributes)
      .map(([clave, valor]) => [clave.toLowerCase(), valor])
      .filter(([clave]) => clave !== "data-precedence"),
  );
}

/** ¿Este nodo es runtime de un marco (no contenido)? */
function esRuntime(nodo) {
  const etiqueta = nodo.rawTagName?.toLowerCase();
  const attrs = atributos(nodo);
  if (etiqueta === "script") {
    if (esJsonLd(nodo)) return false;
    if ("nomodule" in attrs) return true;
    return RUNTIME_SCRIPT.test(attrs.src ?? "") || RUNTIME_SCRIPT.test(nodo.rawText);
  }
  if (etiqueta === "link") {
    const rel = (attrs.rel ?? "").toLowerCase();
    if (rel === "modulepreload") return true;
    if (rel === "preload" && /\/_next\//.test(attrs.href ?? "")) return true;
    if (rel === "preload" && attrs.as === "script") return true;
  }
  // La frontera de metadatos de Next: un div oculto que solo tenía comentarios.
  if (etiqueta === "div" && "hidden" in attrs && nodo.text.trim() === "" && nodo.childNodes.every((n) => n.nodeType !== 1)) {
    return true;
  }
  return false;
}

function quitarRuntime(nodo) {
  for (const hijo of [...nodo.childNodes]) {
    if (hijo.nodeType !== 1) continue;
    if (esRuntime(hijo)) hijo.remove();
    else quitarRuntime(hijo);
  }
}

function analizar(html) {
  const raiz = parse(html, { comment: false, blockTextElements: { script: true, style: true } });
  quitarRuntime(raiz);
  return raiz;
}

/** El HTML sin el ruido de los marcos (para inspección humana y pruebas). */
export function limpiarHtml(html) {
  return analizar(html).toString();
}

const espacios = (texto) => texto.replace(/\s+/g, " ").trim();

function firmaDeAtributos(nodo) {
  const attrs = atributos(nodo);
  // `id="__next_error__"` solo lo pone Next en su envoltorio de error.
  return Object.keys(attrs)
    .sort()
    .map((clave) => {
      let valor = clave === "class" ? attrs[clave].split(/\s+/).filter(Boolean).sort().join(" ") : attrs[clave];
      if (clave === "href" || clave === "content" || clave === "src") valor = normalizarUrl(valor);
      if (clave === "href" && /^\/(_next\/static|_astro)\/.+\.css$/.test(valor)) valor = "<css>";
      return valor === "" ? clave : `${clave}=${valor}`;
    })
    .join(" ");
}

/** Texto que ve el vecino: sin el contenido de `<script>` ni `<style>`. */
function textoVisible(nodo) {
  if (nodo.nodeType === 3) return nodo.text;
  const etiqueta = nodo.rawTagName?.toLowerCase();
  if (etiqueta === "script" || etiqueta === "style") return "";
  return nodo.childNodes.map(textoVisible).join("");
}

function textoDe(raiz, selector) {
  const nodo = raiz.querySelector(selector);
  return nodo ? espacios(textoVisible(nodo)) : null;
}

/** Lo que se compara de una página HTML, ya normalizado. */
export function extraerPagina(html) {
  const raiz = analizar(html);
  const htmlNodo = raiz.querySelector("html");
  const head = raiz.querySelector("head");
  const body = raiz.querySelector("body");

  const metas = (head?.querySelectorAll("meta") ?? []).map(firmaDeAtributos).sort();
  const enlacesDelHead = (head?.querySelectorAll("link") ?? []).map(firmaDeAtributos).sort();
  const jsonLd = raiz
    .querySelectorAll("script")
    .filter(esJsonLd)
    .map((nodo) => {
      try {
        return JSON.stringify(ordenarClaves(JSON.parse(nodo.rawText)));
      } catch {
        return `<JSON inválido> ${nodo.rawText}`;
      }
    });
  const enlaces = (body?.querySelectorAll("a") ?? []).map((a) => {
    const attrs = atributos(a);
    return [attrs.href ?? "", attrs.rel ?? "", attrs.target ?? ""].join(" | ");
  });
  const secuencia = (body?.querySelectorAll("*") ?? [])
    .filter((nodo) => !esJsonLd(nodo))
    .map((nodo) => `${nodo.rawTagName.toLowerCase()} ${firmaDeAtributos(nodo)}`.trim());

  return {
    lang: htmlNodo ? (atributos(htmlNodo).lang ?? null) : null,
    atributosHtml: htmlNodo ? firmaDeAtributos(htmlNodo) : null,
    atributosBody: body ? firmaDeAtributos(body) : null,
    titulo: textoDe(raiz, "title"),
    metas,
    enlacesDelHead,
    jsonLd,
    texto: {
      header: textoDe(raiz, "header"),
      main: textoDe(raiz, "main"),
      footer: textoDe(raiz, "footer"),
    },
    enlaces,
    secuencia,
  };
}

function ordenarClaves(valor) {
  if (Array.isArray(valor)) return valor.map(ordenarClaves);
  if (valor && typeof valor === "object") {
    return Object.fromEntries(Object.keys(valor).sort().map((k) => [k, ordenarClaves(valor[k])]));
  }
  return valor;
}

/** Diferencias entre dos listas como multiconjuntos (cuenta repeticiones). */
function compararListas(nombre, a, b) {
  const cuenta = (lista) => lista.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map());
  const ca = cuenta(a);
  const cb = cuenta(b);
  const salida = [];
  for (const [x, n] of ca) if ((cb.get(x) ?? 0) < n) salida.push(`${nombre}: falta en Astro → ${x}`);
  for (const [x, n] of cb) if ((ca.get(x) ?? 0) < n) salida.push(`${nombre}: sobra en Astro → ${x}`);
  if (salida.length === 0 && JSON.stringify(a) !== JSON.stringify(b)) {
    salida.push(`${nombre}: mismos elementos en otro orden`);
  }
  return salida;
}

function compararPaginas(next, astro) {
  const d = [];
  if (next.lang !== astro.lang) d.push(`lang: ${next.lang} ≠ ${astro.lang}`);
  if (next.atributosHtml !== astro.atributosHtml) d.push(`<html>: ${next.atributosHtml} ≠ ${astro.atributosHtml}`);
  if (next.atributosBody !== astro.atributosBody) d.push(`<body>: ${next.atributosBody} ≠ ${astro.atributosBody}`);
  if (next.titulo !== astro.titulo) d.push(`título: «${next.titulo}» ≠ «${astro.titulo}»`);
  // El orden de las etiquetas del head no se exige; el conjunto sí.
  d.push(...compararListas("<meta>", [...next.metas].sort(), [...astro.metas].sort()));
  d.push(...compararListas("<link> del head", [...next.enlacesDelHead].sort(), [...astro.enlacesDelHead].sort()));
  d.push(...compararListas("JSON-LD", next.jsonLd, astro.jsonLd));
  for (const landmark of ["header", "main", "footer"]) {
    if (next.texto[landmark] !== astro.texto[landmark]) {
      d.push(`texto de <${landmark}>: «${next.texto[landmark]}» ≠ «${astro.texto[landmark]}»`);
    }
  }
  d.push(...compararListas("enlace", next.enlaces, astro.enlaces));
  if (JSON.stringify(next.secuencia) !== JSON.stringify(astro.secuencia)) {
    const i = next.secuencia.findIndex((x, k) => x !== astro.secuencia[k]);
    const indice = i === -1 ? Math.min(next.secuencia.length, astro.secuencia.length) : i;
    d.push(
      `secuencia de elementos: primera diferencia en #${indice}: «${next.secuencia[indice] ?? "(fin)"}» ≠ «${astro.secuencia[indice] ?? "(fin)"}»`,
    );
  }
  return d;
}

function minusculas(cabeceras) {
  return Object.fromEntries(Object.entries(cabeceras).map(([k, v]) => [k.toLowerCase(), v]));
}

/** Ancho y alto de un PNG (cabecera IHDR), o `null` si no lo es. */
export function medidasPng(bytes) {
  const b = Buffer.from(bytes);
  if (b.length < 24 || b.toString("ascii", 1, 4) !== "PNG") return null;
  return { ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20) };
}

/**
 * Diferencias entre la respuesta de Next y la de Astro para `ruta`. Cada
 * diferencia empieza con la ruta. Lista vacía = iguales.
 *
 * @param {string} ruta
 * @param {{status: number, headers: Record<string,string>, cuerpo: string|Uint8Array}} next
 * @param {{status: number, headers: Record<string,string>, cuerpo: string|Uint8Array}} astro
 * @param {{dinamica?: boolean}} [opciones] `dinamica`: también se exige el mismo `Cache-Control`.
 */
export function compararRespuestas(ruta, next, astro, opciones = {}) {
  const d = [];
  const hn = minusculas(next.headers);
  const ha = minusculas(astro.headers);

  if (next.status !== astro.status) d.push(`estado: ${next.status} ≠ ${astro.status}`);
  for (const nombre of CABECERAS_DE_SEGURIDAD) {
    if (!ha[nombre]) d.push(`cabecera ${nombre}: falta en Astro`);
    else if (hn[nombre] !== ha[nombre]) d.push(`cabecera ${nombre}: «${hn[nombre]}» ≠ «${ha[nombre]}»`);
  }
  for (const nombre of Object.keys(ha)) {
    if (CABECERA_DEL_MARCO.test(nombre)) d.push(`cabecera ${nombre}: anuncia el marco en Astro`);
  }
  const tipoNext = (hn["content-type"] ?? "").toLowerCase();
  const tipoAstro = (ha["content-type"] ?? "").toLowerCase();
  if (tipoNext !== tipoAstro) d.push(`content-type: «${tipoNext}» ≠ «${tipoAstro}»`);
  if (opciones.dinamica && hn["cache-control"] !== ha["cache-control"]) {
    d.push(`cache-control: «${hn["cache-control"]}» ≠ «${ha["cache-control"]}»`);
  }

  if (tipoNext.startsWith("text/html")) {
    d.push(...compararPaginas(extraerPagina(String(next.cuerpo)), extraerPagina(String(astro.cuerpo))));
  } else if (tipoNext.startsWith("image/png")) {
    const a = medidasPng(next.cuerpo);
    const b = medidasPng(astro.cuerpo);
    if (JSON.stringify(a) !== JSON.stringify(b)) d.push(`medidas del PNG: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
  } else if (String(next.cuerpo) !== String(astro.cuerpo)) {
    d.push(`cuerpo distinto:\n--- Next\n${next.cuerpo}\n--- Astro\n${astro.cuerpo}`);
  }

  return d.map((x) => `${ruta} · ${x}`);
}
