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
import { createHash } from "node:crypto";

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

/**
 * Atributos en minúsculas, sin los que solo usa el runtime de Next:
 * `data-precedence` y el `id="__next_error__"` con el que Next marca su
 * documento de error (ruido del marco desde 2a, design.md §1 punto 6 de
 * `migrar-directorio-publico-astro`).
 */
function atributos(nodo) {
  return Object.fromEntries(
    Object.entries(nodo.attributes)
      .map(([clave, valor]) => [clave.toLowerCase(), valor])
      .filter(([clave, valor]) => clave !== "data-precedence" && !(clave === "id" && valor === "__next_error__")),
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
  return firmaSinAtributos(nodo, []);
}

/** La firma de atributos sin los nombrados (solo la usa la 404 dinámica). */
function firmaSinAtributos(nodo, sinEstos) {
  const attrs = atributos(nodo);
  return Object.keys(attrs)
    .filter((clave) => !sinEstos.includes(clave))
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
    atributosHtmlSinIdioma: htmlNodo ? firmaSinAtributos(htmlNodo, ["lang", "class"]) : null,
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

/**
 * Las ÚNICAS diferencias aceptadas entre el documento de error de Next y la
 * 404 dinámica de Astro (alternativa B; design.md §1, punto 6 del change
 * `migrar-directorio-publico-astro`). Se aplican solo si quien llama marca la
 * ruta como 404 dinámica (pasando `referencia404`) y las DOS versiones
 * responden 404. Cualquier otra diferencia se reporta. No se agregan
 * entradas: una cuarta diferencia se reporta, no se normaliza.
 */
export const NORMALIZACIONES_404_DINAMICA = Object.freeze([
  {
    id: "cuerpo-contra-a-b-c",
    descripcion: "el <body> de Astro se compara contra el que Next pinta en /a/b/c, no contra el vacío del documento de error",
  },
  {
    id: "hoja-de-estilos",
    descripcion: "se ignora el <link rel=\"stylesheet\"> del <head> de Astro (el documento de error de Next no lo trae)",
  },
  {
    id: "lang-y-class-del-html",
    descripcion: "se ignoran lang y class del <html> (el documento de error de Next no trae los del layout)",
  },
]);

/** Aplica las tres normalizaciones; devuelve las páginas ya ajustadas. */
function normalizar404Dinamica(next, astro, referencia, aplicadas) {
  const cuerpo = extraerPagina(referencia);
  const n = {
    ...next,
    atributosBody: cuerpo.atributosBody,
    texto: cuerpo.texto,
    enlaces: cuerpo.enlaces,
    secuencia: cuerpo.secuencia,
  };
  aplicadas.push(NORMALIZACIONES_404_DINAMICA[0].id);
  const a = { ...astro, enlacesDelHead: astro.enlacesDelHead.filter((e) => !/(^| )rel=stylesheet( |$)/.test(e)) };
  if (a.enlacesDelHead.length !== astro.enlacesDelHead.length) aplicadas.push(NORMALIZACIONES_404_DINAMICA[1].id);
  if (n.lang !== a.lang || n.atributosHtml !== a.atributosHtml) {
    aplicadas.push(NORMALIZACIONES_404_DINAMICA[2].id);
    n.lang = null;
    a.lang = null;
    n.atributosHtml = n.atributosHtmlSinIdioma;
    a.atributosHtml = a.atributosHtmlSinIdioma;
  }
  return [n, a];
}

/**
 * Las ÚNICAS diferencias aceptadas en el formulario de reporte entre Next y
 * Astro (change `migrar-formularios-publicos-astro`, design.md §4; spec
 * `plataforma-astro`, requirement "La página de reporte responde desde Astro
 * el mismo HTML que Next"). Se aplican solo si quien llama marca la ruta como
 * formulario (pasando `formulario: { urlPagina }`). Todo lo demás del
 * formulario —etiquetas, radios, textarea, honeypot, botón— se sigue
 * comparando, y Astro NO puede agregar campos ocultos: uno de más sale como
 * diferencia. No se agregan entradas.
 */
export const NORMALIZACIONES_FORMULARIO = Object.freeze([
  {
    id: "atributos-del-form",
    descripcion: "se ignoran action, method y enctype del <form>, solo si los dos hacen POST a la misma ruta",
  },
  {
    id: "campos-action-de-next",
    descripcion: "se quitan del formulario de Next sus <input type=\"hidden\" name=\"$ACTION_…\">",
  },
]);

function atributoSinMayusculas(nodo, nombre) {
  const entrada = Object.entries(nodo.attributes).find(([clave]) => clave.toLowerCase() === nombre);
  return entrada ? entrada[1] : undefined;
}

function quitarAtributo(nodo, nombre) {
  for (const clave of Object.keys(nodo.attributes)) {
    if (clave.toLowerCase() === nombre) nodo.removeAttribute(clave);
  }
}

/**
 * Aplica `NORMALIZACIONES_FORMULARIO` a los dos documentos. Devuelve los HTML
 * ya ajustados y las diferencias que impiden aplicarlas (otro número de
 * formularios, otro método u otra ruta de destino).
 *
 * @param {string} htmlNext
 * @param {string} htmlAstro
 * @param {string} urlPagina URL con la que se pidió la página (resuelve los `action` relativos).
 * @param {string[]} aplicadas Aquí se anotan los `id` que se aplicaron.
 */
export function normalizarFormulario(htmlNext, htmlAstro, urlPagina, aplicadas) {
  const opciones = { comment: true, blockTextElements: { script: true, style: true } };
  const raizNext = parse(htmlNext, opciones);
  const raizAstro = parse(htmlAstro, opciones);
  const formsNext = raizNext.querySelectorAll("form");
  const formsAstro = raizAstro.querySelectorAll("form");
  const diferencias = [];
  if (formsNext.length !== formsAstro.length) {
    diferencias.push(`formularios: ${formsNext.length} en Next ≠ ${formsAstro.length} en Astro`);
  }
  formsNext.forEach((formNext, i) => {
    const formAstro = formsAstro[i];
    if (!formAstro) return;
    const destino = (form) => ({
      metodo: (atributoSinMayusculas(form, "method") ?? "get").toUpperCase(),
      ruta: new URL(atributoSinMayusculas(form, "action") || urlPagina, urlPagina).pathname,
    });
    const dn = destino(formNext);
    const da = destino(formAstro);
    if (dn.metodo === "POST" && da.metodo === "POST" && dn.ruta === da.ruta) {
      for (const form of [formNext, formAstro]) for (const a of ["action", "method", "enctype"]) quitarAtributo(form, a);
      aplicadas.push(NORMALIZACIONES_FORMULARIO[0].id);
    } else {
      diferencias.push(`formulario #${i}: Next hace ${dn.metodo} a ${dn.ruta} y Astro ${da.metodo} a ${da.ruta}`);
    }
    const ocultosNext = formNext
      .querySelectorAll("input")
      .filter((n) => (atributoSinMayusculas(n, "type") ?? "").toLowerCase() === "hidden" && (atributoSinMayusculas(n, "name") ?? "").startsWith("$ACTION_"));
    for (const nodo of ocultosNext) nodo.remove();
    if (ocultosNext.length) aplicadas.push(NORMALIZACIONES_FORMULARIO[1].id);
  });
  return { next: raizNext.toString(), astro: raizAstro.toString(), diferencias };
}

/**
 * Las ÚNICAS diferencias aceptadas en `/registro` entre Next y Astro (change
 * `migrar-registro-astro`, design.md §8; spec `plataforma-astro`, requirement
 * "La página de registro responde desde Astro el mismo HTML que Next"). Se
 * aplican solo si quien llama marca la ruta como registro (pasando
 * `registro: { urlPagina, repintada }`). Las dos primeras son las de 3a; las
 * otras tres solo quitan cosas del lado de Astro, y solo si son exactamente
 * las esperadas. Todo lo demás se compara: un oculto de más, otro atributo
 * `data-`, un segundo script o un `autofocus` fuera de lugar salen como
 * diferencia. No se agregan entradas.
 */
export const NORMALIZACIONES_REGISTRO = Object.freeze([
  NORMALIZACIONES_FORMULARIO[0],
  NORMALIZACIONES_FORMULARIO[1],
  {
    id: "script-de-la-mejora",
    descripcion: 'se quita el ÚNICO <script type="module" src="/_astro/…"> de Astro (la mejora progresiva, design.md §1.3)',
  },
  {
    id: "data-ejemplos",
    descripcion: 'se quita el atributo data-ejemplos del <select id="categoriaId"> de Astro (la tabla de ejemplos de la mejora)',
  },
  {
    id: "autofocus-del-primer-error",
    descripcion: "en las respuestas re-pintadas, se quita el autofocus de Astro si está en UN solo campo y ese campo tiene aria-invalid=true",
  },
]);

/**
 * Aplica `NORMALIZACIONES_REGISTRO`. Devuelve los HTML ajustados y las
 * diferencias que impiden aplicar las del formulario.
 *
 * @param {string} htmlNext
 * @param {string} htmlAstro
 * @param {{ urlPagina: string, aplicadas: string[], repintada?: boolean }} opciones
 */
export function normalizarRegistro(htmlNext, htmlAstro, { urlPagina, aplicadas, repintada = false }) {
  const n = normalizarFormulario(htmlNext, htmlAstro, urlPagina, aplicadas);
  const raiz = parse(n.astro, { comment: true, blockTextElements: { script: true, style: true } });
  const propios = raiz.querySelectorAll("script").filter((nodo) => !esJsonLd(nodo) && !/umami/.test(atributoSinMayusculas(nodo, "src") ?? ""));
  const script = propios[0];
  if (
    propios.length === 1 &&
    (atributoSinMayusculas(script, "type") ?? "").toLowerCase() === "module" &&
    /^\/_astro\/[\w.-]+\.js$/.test(atributoSinMayusculas(script, "src") ?? "") &&
    script.rawText.trim() === ""
  ) {
    script.remove();
    aplicadas.push(NORMALIZACIONES_REGISTRO[2].id);
  }
  const categoria = raiz.querySelector("select#categoriaId");
  if (categoria && atributoSinMayusculas(categoria, "data-ejemplos") !== undefined) {
    quitarAtributo(categoria, "data-ejemplos");
    aplicadas.push(NORMALIZACIONES_REGISTRO[3].id);
  }
  if (repintada) {
    const conFoco = raiz.querySelectorAll("[autofocus]");
    if (conFoco.length === 1 && atributoSinMayusculas(conFoco[0], "aria-invalid") === "true") {
      quitarAtributo(conFoco[0], "autofocus");
      aplicadas.push(NORMALIZACIONES_REGISTRO[4].id);
    }
  }
  return { next: n.next, astro: raiz.toString(), diferencias: n.diferencias };
}

/**
 * Los `value` numéricos de las opciones de categoría y colonia del formulario
 * de registro, cambiados por `cat:<texto de la opción>` (change
 * `migrar-registro-astro`). Los ids son autoincrementales y dependen de la
 * base: así un fixture de Next se compara contra una base de pruebas con otros
 * ids, sin dejar de comparar QUÉ opción está elegida. Toca solo esos dos
 * `<select>`; no es una normalización de paridad (se aplica igual a los dos
 * lados).
 *
 * @param {string} html
 */
export function idsDeCatalogoPorNombre(html) {
  return html.replace(/(<select[^>]*\bid="(?:categoriaId|coloniaId)"[^>]*>)([\s\S]*?)(<\/select>)/g, (_, abre, opciones, cierra) =>
    abre + opciones.replace(/<option([^>]*?)\bvalue="(\d+)"([^>]*)>([^<]*)<\/option>/g, (_m, antes, _id, despues, texto) => `<option${antes}value="cat:${texto.trim()}"${despues}>${texto}</option>`) + cierra,
  );
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

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
 * @param {{dinamica?: boolean, referencia404?: string, aplicadas?: string[], formulario?: {urlPagina: string, aplicadas: string[]}, registro?: {urlPagina: string, aplicadas: string[], repintada?: boolean}}} [opciones]
 *   `dinamica`: también se exige el mismo `Cache-Control`. `referencia404`: la
 *   ruta es una 404 dinámica; el HTML de Next en `/a/b/c` contra el que se
 *   compara el `<body>`. `aplicadas`: aquí se anotan las normalizaciones de
 *   `NORMALIZACIONES_404_DINAMICA` que se aplicaron. `formulario`: la ruta
 *   pinta el formulario de reporte; se aplican `NORMALIZACIONES_FORMULARIO` y
 *   se anotan en `formulario.aplicadas`. `registro`: la ruta es `/registro`
 *   (o su respuesta re-pintada, con `repintada`); se aplican
 *   `NORMALIZACIONES_REGISTRO` y se anotan en `registro.aplicadas`.
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
  // Una redirección (p. ej. al almacén de fotos) nunca es paridad.
  if (hn.location !== ha.location) d.push(`cabecera location: «${hn.location}» ≠ «${ha.location}»`);
  const tipoNext = (hn["content-type"] ?? "").toLowerCase();
  const tipoAstro = (ha["content-type"] ?? "").toLowerCase();
  if (tipoNext !== tipoAstro) d.push(`content-type: «${tipoNext}» ≠ «${tipoAstro}»`);
  if (opciones.dinamica && hn["cache-control"] !== ha["cache-control"]) {
    d.push(`cache-control: «${hn["cache-control"]}» ≠ «${ha["cache-control"]}»`);
  }

  if (tipoNext.startsWith("text/html")) {
    let htmlNext = String(next.cuerpo);
    let htmlAstro = String(astro.cuerpo);
    if (opciones.formulario) {
      const n = normalizarFormulario(htmlNext, htmlAstro, opciones.formulario.urlPagina, opciones.formulario.aplicadas);
      htmlNext = n.next;
      htmlAstro = n.astro;
      d.push(...n.diferencias);
    } else if (opciones.registro) {
      const n = normalizarRegistro(htmlNext, htmlAstro, opciones.registro);
      htmlNext = n.next;
      htmlAstro = n.astro;
      d.push(...n.diferencias);
    }
    let pn = extraerPagina(htmlNext);
    let pa = extraerPagina(htmlAstro);
    if (opciones.referencia404 && next.status === 404 && astro.status === 404) {
      [pn, pa] = normalizar404Dinamica(pn, pa, opciones.referencia404, opciones.aplicadas ?? []);
    }
    d.push(...compararPaginas(pn, pa));
  } else if (tipoNext.startsWith("image/") && !tipoNext.startsWith("image/png")) {
    // Fotos: los mismos bytes (hash) y el mismo tamaño declarado.
    if (hn["content-length"] !== ha["content-length"]) {
      d.push(`content-length: «${hn["content-length"]}» ≠ «${ha["content-length"]}»`);
    }
    if (sha256(next.cuerpo) !== sha256(astro.cuerpo)) d.push(`hash del cuerpo: ${sha256(next.cuerpo)} ≠ ${sha256(astro.cuerpo)}`);
  } else if (tipoNext.startsWith("image/png")) {
    const a = medidasPng(next.cuerpo);
    const b = medidasPng(astro.cuerpo);
    if (JSON.stringify(a) !== JSON.stringify(b)) d.push(`medidas del PNG: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
  } else if (String(next.cuerpo) !== String(astro.cuerpo)) {
    d.push(`cuerpo distinto:\n--- Next\n${next.cuerpo}\n--- Astro\n${astro.cuerpo}`);
  }

  return d.map((x) => `${ruta} · ${x}`);
}
