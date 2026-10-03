/**
 * Spec `plataforma-astro` (change `migrar-lectura-publica-astro`, T-023),
 * requirement "El HTML servido no difiere del de Next" → scenario "el script
 * sí ve una diferencia". tasks.md #4.
 *
 * El script completo (`scripts/diff-html.mjs`) necesita las dos builds y no
 * corre en el CI (design.md §9); lo que sí corre aquí es su núcleo: el
 * normalizador que quita el ruido de cada marco y el comparador.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  compararRespuestas,
  extraerPagina,
  limpiarHtml,
  NORMALIZACIONES_404_DINAMICA,
  NORMALIZACIONES_FORMULARIO,
  NORMALIZACIONES_REGISTRO,
  DIFERENCIAS_ACEPTADAS_GESTION,
  sinDiferenciasAceptadasDeGestion,
} from "../scripts/diff-html/nucleo.mjs";

const CSP = "default-src 'self'";
const SEGURIDAD = {
  "content-security-policy": CSP,
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
};

/** Página como la emite Next: runtime, hashes y comentarios de React. */
const HTML_NEXT = `<!DOCTYPE html><html lang="es-MX" class="h-full antialiased"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><link rel="stylesheet" href="/_next/static/chunks/3f5b5-78t_xnc.css" data-precedence="next"/><link rel="preload" as="script" fetchPriority="low" href="/_next/static/chunks/0ncih.js"/><script src="/_next/static/chunks/44-1ce.js" async=""></script><title>Inicio — EnMiRumbo</title><meta name="description" content="Desc &amp; más"/><meta property="og:image" content="https://sitio.example/opengraph-image?adeb393b705944f5"/><link rel="canonical" href="https://sitio.example/"/><link rel="icon" href="/favicon.ico?favicon.2vob68tjqpejf.ico" sizes="256x256" type="image/x-icon"/><script src="/_next/static/chunks/0cz1.js" noModule=""></script></head><body class="flex"><div hidden=""><!--$--><!--/$--></div><header class="h"><a class="l" href="/">EnMiRumbo</a></header><main class="m"><h1 class="t">Hola<!-- --> vecino</h1><script type="application/ld+json">{"@type":"LocalBusiness","name":"Ficticio"}</script><a class="b" href="/registro">Registra</a><!--$--><!--/$--></main><footer class="f"><p>Pie</p></footer><script src="/_next/static/chunks/0ncih.js" id="_R_" async=""></script><script>(self.__next_f=self.__next_f||[]).push([0])</script></body></html>`;

/** La misma página como la emitiría Astro: otro orden de atributos y otros hashes. */
const HTML_ASTRO = `<!DOCTYPE html><html lang="es-MX" class="h-full antialiased"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Inicio — EnMiRumbo</title><meta name="description" content="Desc &amp; más"><meta property="og:image" content="https://sitio.example/opengraph-image?0123456789abcdef"><link rel="canonical" href="https://sitio.example/"><link rel="icon" href="/favicon.ico?f00ba4" sizes="256x256" type="image/x-icon"><link rel="stylesheet" href="/_astro/terminos.Bx1y2z.css"></head><body class="flex"><header class="h"><a href="/" class="l">EnMiRumbo</a></header><main class="m"><h1 class="t">Hola vecino</h1><script type="application/ld+json">{"name":"Ficticio","@type":"LocalBusiness"}</script><a href="/registro" class="b">Registra</a></main><footer class="f"><p>Pie</p></footer></body></html>`;

function respuesta(cuerpo: string, extra: Record<string, string> = {}) {
  return {
    status: 200,
    headers: { ...SEGURIDAD, "content-type": "text/html; charset=utf-8", ...extra },
    cuerpo,
  };
}

const comparar = (astro: string, cabeceras: Record<string, string> = {}, next = HTML_NEXT) =>
  compararRespuestas("/prueba", respuesta(next), respuesta(astro, cabeceras));

describe("diff-html · normalizador", () => {
  it("quita el runtime de Next: scripts, precargas, noModule y el div oculto", () => {
    const limpio = limpiarHtml(HTML_NEXT);
    expect(limpio).not.toContain("/_next/static/chunks/0ncih.js");
    expect(limpio).not.toContain("__next_f");
    expect(limpio).not.toContain("noModule");
    expect(limpio).not.toContain('rel="preload"');
    expect(limpio).not.toContain("<div hidden");
    expect(limpio).not.toContain("<!--");
  });

  it("conserva los bloques JSON-LD (son datos, no runtime)", () => {
    expect(limpiarHtml(HTML_NEXT)).toContain("application/ld+json");
  });

  it("quita los hashes de la imagen, del icono y de las hojas de estilo", () => {
    const next = extraerPagina(HTML_NEXT);
    const astro = extraerPagina(HTML_ASTRO);
    expect(next.metas).toContain("content=https://sitio.example/opengraph-image?<hash> property=og:image");
    expect(astro.metas).toEqual(next.metas);
    expect(astro.enlacesDelHead).toEqual(next.enlacesDelHead);
  });

  it("exige que el parámetro de versión de la imagen exista, no su valor", () => {
    const sinVersion = HTML_ASTRO.replace("opengraph-image?0123456789abcdef", "opengraph-image");
    expect(comparar(sinVersion).join("\n")).toContain("og:image");
  });

  it("dos páginas equivalentes no tienen diferencias", () => {
    expect(comparar(HTML_ASTRO)).toEqual([]);
  });
});

describe("diff-html · el script sí ve una diferencia", () => {
  it("un enlace faltante", () => {
    const diferencias = comparar(HTML_ASTRO.replace('<a href="/registro" class="b">Registra</a>', ""));
    expect(diferencias.length).toBeGreaterThan(0);
    expect(diferencias.join("\n")).toContain("/registro");
    expect(diferencias.every((d) => d.startsWith("/prueba"))).toBe(true);
  });

  it("un enlace repetido que pierde una de sus apariciones", () => {
    const doble = HTML_NEXT.replace("<p>Pie</p>", '<p>Pie</p><a href="/registro">Registra</a>');
    const astroDoble = HTML_ASTRO.replace("<p>Pie</p>", '<p>Pie</p><a href="/registro">Otro</a>');
    const diferencias = compararRespuestas("/prueba", respuesta(doble), respuesta(astroDoble));
    expect(diferencias.join("\n")).toContain("texto de <footer>");
    const sinElSegundo = compararRespuestas("/prueba", respuesta(doble), respuesta(HTML_ASTRO));
    expect(sinElSegundo.join("\n")).toContain("enlace: falta en Astro → /registro");
  });

  it("un enlace con otro destino o con target", () => {
    expect(comparar(HTML_ASTRO.replace('href="/registro"', 'href="/registro" target="_blank"'))).not.toEqual([]);
  });

  it("una <meta> cambiada", () => {
    const diferencias = comparar(HTML_ASTRO.replace("Desc &amp; más", "Otra descripción"));
    expect(diferencias.join("\n")).toContain("description");
  });

  it("una <meta> de más (p. ej. robots noindex)", () => {
    const diferencias = comparar(HTML_ASTRO.replace("<title>", '<meta name="robots" content="noindex"><title>'));
    expect(diferencias.join("\n")).toContain("robots");
  });

  it("un JSON-LD distinto", () => {
    const diferencias = comparar(HTML_ASTRO.replace('"name":"Ficticio"', '"name":"Otro"'));
    expect(diferencias.join("\n")).toContain("JSON-LD");
  });

  it("una cabecera de seguridad ausente", () => {
    const sinMarco = respuesta(HTML_ASTRO);
    delete (sinMarco.headers as Record<string, string>)["x-frame-options"];
    const diferencias = compararRespuestas("/prueba", respuesta(HTML_NEXT), sinMarco);
    expect(diferencias.join("\n")).toContain("x-frame-options");
  });

  it("una cabecera que anuncia el marco", () => {
    expect(comparar(HTML_ASTRO, { "x-powered-by": "Astro" }).join("\n")).toContain("x-powered-by");
  });

  it("otro estado HTTP", () => {
    const diferencias = compararRespuestas("/prueba", respuesta(HTML_NEXT), {
      ...respuesta(HTML_ASTRO),
      status: 404,
    });
    expect(diferencias.join("\n")).toContain("estado");
  });

  it("otro texto visible", () => {
    expect(comparar(HTML_ASTRO.replace("<p>Pie</p>", "<p>Pie distinto</p>")).join("\n")).toContain("footer");
  });

  it("otra clase en un elemento", () => {
    expect(comparar(HTML_ASTRO.replace('class="t"', 'class="t u"'))).not.toEqual([]);
  });

  it("otro idioma o otro título", () => {
    expect(comparar(HTML_ASTRO.replace('lang="es-MX"', 'lang="en"')).join("\n")).toContain("lang");
    expect(comparar(HTML_ASTRO.replace("<title>Inicio", "<title>Portada")).join("\n")).toContain("título");
  });

  it("Cache-Control distinto en una ruta dinámica", () => {
    const next = respuesta(HTML_NEXT, { "cache-control": "private, no-store" });
    const astro = respuesta(HTML_ASTRO, { "cache-control": "public, max-age=60" });
    expect(compararRespuestas("/prueba", next, astro, { dinamica: true }).join("\n")).toContain("cache-control");
    expect(compararRespuestas("/prueba", next, astro, { dinamica: false })).toEqual([]);
  });

  it("cuerpos de texto distintos (robots.txt)", () => {
    const texto = (cuerpo: string) => ({
      status: 200,
      headers: { ...SEGURIDAD, "content-type": "text/plain" },
      cuerpo,
    });
    expect(compararRespuestas("/robots.txt", texto("User-Agent: *\n"), texto("User-Agent: *\n"))).toEqual([]);
    expect(compararRespuestas("/robots.txt", texto("User-Agent: *\n"), texto("User-Agent: x\n"))).not.toEqual([]);
  });
});

// ── Fase 2b (change `migrar-directorio-publico-astro`, design.md §1, punto 6) ──
//
// La 404 de las rutas dinámicas: Next manda un documento de error con el
// `<body>` vacío (lo pinta su JS) y Astro pinta la página de no encontrado
// desde el servidor (alternativa B). El diff acepta SOLO tres diferencias, en
// una lista explícita, y solo cuando las dos versiones responden 404 en una
// URL de la lista de 404 dinámicas.

/** El documento de error de Next (`notFound()` dentro de una ruta dinámica). */
const ERROR_NEXT = `<!DOCTYPE html><html id="__next_error__"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><link rel="preload" as="script" fetchPriority="low" href="/_next/static/chunks/0ncih.js"/><meta name="robots" content="noindex"/><title>EnMiRumbo</title><link rel="icon" href="/favicon.ico?favicon.2vob68tjqpejf.ico" sizes="256x256" type="image/x-icon"/></head><body><script src="/_next/static/chunks/0ncih.js" async=""></script><script>(self.__next_f=self.__next_f||[]).push([0])</script></body></html>`;

/** Lo que Next pinta como 404 en `/a/b/c` (la referencia del `<body>`). */
const GLOBAL_NEXT = `<!DOCTYPE html><html lang="es-MX" class="h-full antialiased"><head><meta charSet="utf-8"/><link rel="stylesheet" href="/_next/static/chunks/3f5b5-78t_xnc.css" data-precedence="next"/><meta name="robots" content="noindex"/><title>EnMiRumbo</title></head><body class="flex"><header class="h"><a class="l" href="/">EnMiRumbo</a></header><main class="m"><section class="s"><h1 class="t">No encontramos esta página</h1><a class="i" href="/">Ir al inicio</a></section></main><footer class="f"><p>Pie</p></footer></body></html>`;

/** La 404 dinámica de Astro: la página de no encontrado dentro del documento base. */
const DINAMICA_ASTRO = `<!DOCTYPE html><html lang="es-MX" class="h-full antialiased"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>EnMiRumbo</title><link rel="icon" href="/favicon.ico?f00ba4" sizes="256x256" type="image/x-icon"><link rel="stylesheet" href="/_astro/index.Bx1y2z.css"></head><body class="flex"><header class="h"><a href="/" class="l">EnMiRumbo</a></header><main class="m"><section class="s"><h1 class="t">No encontramos esta página</h1><a href="/" class="i">Ir al inicio</a></section></main><footer class="f"><p>Pie</p></footer></body></html>`;

const r404 = (cuerpo: string, extra: Record<string, string> = {}) => ({
  ...respuesta(cuerpo, { "cache-control": "private, no-cache, no-store, max-age=0, must-revalidate", ...extra }),
  status: 404,
});

function comparar404(astro = DINAMICA_ASTRO, extraAstro: Record<string, string> = {}, opciones: { es404Dinamica?: boolean } = { es404Dinamica: true }) {
  const aplicadas: string[] = [];
  const diferencias = compararRespuestas("/loquesea", r404(ERROR_NEXT), r404(astro, extraAstro), {
    dinamica: true,
    ...(opciones.es404Dinamica ? { referencia404: GLOBAL_NEXT, aplicadas } : {}),
  });
  return { diferencias, aplicadas };
}

describe("diff-html · normalizaciones de la 404 dinámica (lista explícita)", () => {
  it("la lista tiene exactamente las tres entradas del design", () => {
    expect(NORMALIZACIONES_404_DINAMICA.map((n: { id: string }) => n.id)).toEqual([
      "cuerpo-contra-a-b-c",
      "hoja-de-estilos",
      "lang-y-class-del-html",
    ]);
  });

  it("con las tres normalizaciones, la 404 dinámica de Astro sale igual y dice cuáles aplicó", () => {
    const { diferencias, aplicadas } = comparar404();
    expect(diferencias).toEqual([]);
    expect(aplicadas).toEqual(["cuerpo-contra-a-b-c", "hoja-de-estilos", "lang-y-class-del-html"]);
  });

  it("sin marcarla como 404 dinámica, las mismas respuestas sí difieren", () => {
    expect(comparar404(DINAMICA_ASTRO, {}, { es404Dinamica: false }).diferencias).not.toEqual([]);
  });

  it("no se aplica si alguna de las dos no responde 404", () => {
    const aplicadas: string[] = [];
    const diferencias = compararRespuestas("/loquesea", r404(ERROR_NEXT), { ...r404(DINAMICA_ASTRO), status: 200 }, {
      dinamica: true,
      referencia404: GLOBAL_NEXT,
      aplicadas,
    });
    expect(diferencias.join("\n")).toContain("estado");
    expect(aplicadas).toEqual([]);
  });

  it("el <body> se compara contra el de /a/b/c: otro texto reprueba", () => {
    const { diferencias } = comparar404(DINAMICA_ASTRO.replace("No encontramos esta página", "Página no encontrada"));
    expect(diferencias.join("\n")).toContain("texto de <main>");
  });

  it("un <meta> de más reprueba", () => {
    const { diferencias } = comparar404(DINAMICA_ASTRO.replace("<title>", '<meta name="description" content="x"><title>'));
    expect(diferencias.join("\n")).toContain("description");
  });

  it("otro Cache-Control reprueba", () => {
    const { diferencias } = comparar404(DINAMICA_ASTRO, { "cache-control": "public, max-age=3600" });
    expect(diferencias.join("\n")).toContain("cache-control");
  });

  it("el script de la medición reprueba", () => {
    const conMedicion = DINAMICA_ASTRO.replace(
      "</section>",
      '</section><script defer src="https://cloud.umami.is/script.js" data-website-id="x"></script>',
    );
    expect(comparar404(conMedicion).diferencias.join("\n")).toContain("secuencia");
  });

  it("solo se ignora la hoja de estilos: otro <link> en el head reprueba", () => {
    const { diferencias } = comparar404(DINAMICA_ASTRO.replace("<title>", '<link rel="canonical" href="https://sitio.example/loquesea"><title>'));
    expect(diferencias.join("\n")).toContain("canonical");
  });

  it("solo se ignoran lang y class del <html>: otro atributo reprueba", () => {
    const { diferencias } = comparar404(DINAMICA_ASTRO.replace('<html lang="es-MX"', '<html data-x="1" lang="es-MX"'));
    expect(diferencias.join("\n")).toContain("<html>");
  });
});

describe("diff-html · respuestas binarias (fotos)", () => {
  const foto = (bytes: number[], extra: Record<string, string> = {}) => ({
    status: 200,
    headers: { ...SEGURIDAD, "content-type": "image/webp", "content-length": String(bytes.length), "cache-control": "private, max-age=3600", ...extra },
    cuerpo: new Uint8Array(bytes),
  });

  it("los mismos bytes no tienen diferencias", () => {
    expect(compararRespuestas("/api/foto/x/ficha", foto([1, 2, 3]), foto([1, 2, 3]), { dinamica: true })).toEqual([]);
  });

  it("otros bytes, otro tamaño u otra caché reprueban", () => {
    const d = compararRespuestas("/api/foto/x/ficha", foto([1, 2, 3]), foto([1, 2, 4]), { dinamica: true });
    expect(d.join("\n")).toContain("hash");
    const t = compararRespuestas("/api/foto/x/ficha", foto([1, 2, 3]), foto([1, 2, 3], { "content-length": "4" }), { dinamica: true });
    expect(t.join("\n")).toContain("content-length");
    const c = compararRespuestas("/api/foto/x/ficha", foto([1, 2, 3]), foto([1, 2, 3], { "cache-control": "public" }), { dinamica: true });
    expect(c.join("\n")).toContain("cache-control");
  });

  it("una cabecera Location en Astro reprueba", () => {
    const d = compararRespuestas("/api/foto/x/ficha", foto([1]), foto([1], { location: "https://bucket.example/x" }), { dinamica: true });
    expect(d.join("\n")).toContain("location");
  });
});

// ── Change `migrar-formularios-publicos-astro` (3a, design.md §4) ──────────
// El formulario de reporte: exactamente dos normalizaciones, impresas, y todo
// lo demás del formulario se sigue comparando.

const DOC = (form: string) =>
  `<!DOCTYPE html><html lang="es-MX"><head><title>T</title></head><body><main><h1>Reportar</h1>${form}</main></body></html>`;
const CAMPOS = `<input type="text" name="sitio_web"><input type="radio" name="motivo" value="cerrado">Ya cerró<textarea name="comentario"></textarea><button type="submit">Enviar reporte</button>`;
const FORM_NEXT = `<form class="f" action="" encType="multipart/form-data" method="POST"><input type="hidden" name="$ACTION_REF_1"><input type="hidden" name="$ACTION_1:0" value="{}"><input type="hidden" name="$ACTION_1:1" value="[&quot;c1&quot;]">${CAMPOS}</form>`;
const FORM_ASTRO = `<form class="f" action="?_action=reportar" method="post">${CAMPOS}</form>`;
const URL_FORM = "https://enmirumbo.example/negocio/x-c1/reportar?error=motivo";

describe("diff · normalizaciones del formulario (3a)", () => {
  it("son exactamente dos, con id y descripción", () => {
    expect(NORMALIZACIONES_FORMULARIO.map((n) => n.id)).toEqual(["atributos-del-form", "campos-action-de-next"]);
    expect(Object.isFrozen(NORMALIZACIONES_FORMULARIO)).toBe(true);
  });

  it("el formulario de Next y el nativo de Astro salen iguales, y se anota dónde se aplicó cada una", () => {
    const aplicadas: string[] = [];
    const d = compararRespuestas("/f", respuesta(DOC(FORM_NEXT)), respuesta(DOC(FORM_ASTRO)), { formulario: { urlPagina: URL_FORM, aplicadas } });
    expect(d).toEqual([]);
    expect(aplicadas).toEqual(["atributos-del-form", "campos-action-de-next"]);
  });

  it("sin marcar la ruta como formulario, las mismas páginas SÍ difieren", () => {
    expect(compararRespuestas("/f", respuesta(DOC(FORM_NEXT)), respuesta(DOC(FORM_ASTRO))).length).toBeGreaterThan(0);
  });

  it("un campo oculto de más en Astro se reporta", () => {
    const conExtra = FORM_ASTRO.replace(CAMPOS, `<input type="hidden" name="negocioId" value="c1">${CAMPOS}`);
    const d = compararRespuestas("/f", respuesta(DOC(FORM_NEXT)), respuesta(DOC(conExtra)), { formulario: { urlPagina: URL_FORM, aplicadas: [] } });
    expect(d.join("\n")).toContain("negocioId");
  });

  it("un oculto $ACTION_ en Astro NO se quita (la normalización es solo de Next)", () => {
    const conAction = FORM_ASTRO.replace(CAMPOS, `<input type="hidden" name="$ACTION_1:1" value="x">${CAMPOS}`);
    const d = compararRespuestas("/f", respuesta(DOC(FORM_NEXT)), respuesta(DOC(conAction)), { formulario: { urlPagina: URL_FORM, aplicadas: [] } });
    expect(d.join("\n")).toContain("$ACTION_1:1");
  });

  it("si Astro postea a otra ruta o con otro método, se reporta y no se normaliza", () => {
    const otraRuta = FORM_ASTRO.replace('action="?_action=reportar"', 'action="/otra?_action=reportar"');
    const d1 = compararRespuestas("/f", respuesta(DOC(FORM_NEXT)), respuesta(DOC(otraRuta)), { formulario: { urlPagina: URL_FORM, aplicadas: [] } });
    expect(d1.join("\n")).toMatch(/Next hace POST a \/negocio\/x-c1\/reportar y Astro POST a \/otra/);
    const porGet = FORM_ASTRO.replace('method="post"', 'method="get"');
    const d2 = compararRespuestas("/f", respuesta(DOC(FORM_NEXT)), respuesta(DOC(porGet)), { formulario: { urlPagina: URL_FORM, aplicadas: [] } });
    expect(d2.join("\n")).toContain("Astro GET");
  });

  it("un cambio en el cuerpo del formulario (etiqueta, radio, botón) se sigue reportando", () => {
    for (const [antes, despues] of [["Ya cerró", "Cerró"], ['value="cerrado"', 'value="cerrado" checked'], ["Enviar reporte", "Enviar"]]) {
      const cambiado = FORM_ASTRO.replace(antes, despues);
      const d = compararRespuestas("/f", respuesta(DOC(FORM_NEXT)), respuesta(DOC(cambiado)), { formulario: { urlPagina: URL_FORM, aplicadas: [] } });
      expect(d.length, despues).toBeGreaterThan(0);
    }
  });
});

// ── 3b-1 (change `migrar-registro-astro`, design.md §8; tasks.md #14) ────────

const CAMPOS_REGISTRO = `<input type="text" name="sitio_web"><select id="categoriaId" name="categoriaId"><option value="">Elige</option><option value="2">Hogar</option></select><input type="tel" id="whatsapp" name="whatsapp" aria-invalid="true" value="12"><p id="whatsapp-error">⚠ Revisa</p><button type="submit">Registrar mi negocio</button>`;
const REG_NEXT = `<form class="f" action="" encType="multipart/form-data" method="POST"><input type="hidden" name="$ACTION_REF_1"><input type="hidden" name="$ACTION_1:0" value="{}">${CAMPOS_REGISTRO}</form>`;
const conEjemplos = (campos: string) => campos.replace('<select id="categoriaId" name="categoriaId">', '<select id="categoriaId" name="categoriaId" data-ejemplos="{&quot;2&quot;:&quot;ej&quot;}">');
const REG_ASTRO = `<form class="f" action="?_action=registrar" encType="multipart/form-data" method="post">${conEjemplos(CAMPOS_REGISTRO).replace('aria-invalid="true"', 'aria-invalid="true" autofocus=""')}</form><script type="module" src="/_astro/registro.astro_astro_type_script_index_0_lang.Ab12.js"></script>`;
const URL_REG = "https://enmirumbo.example/registro";
const reg = (aplicadas: string[], repintada = true) => ({ registro: { urlPagina: URL_REG, aplicadas, repintada } });

describe("diff · normalizaciones del registro (3b-1)", () => {
  it("son exactamente cinco, con id y descripción", () => {
    expect(NORMALIZACIONES_REGISTRO.map((n) => n.id)).toEqual([
      "atributos-del-form",
      "campos-action-de-next",
      "script-de-la-mejora",
      "data-ejemplos",
      "autofocus-del-primer-error",
    ]);
    expect(NORMALIZACIONES_REGISTRO.every((n) => n.descripcion.length > 20)).toBe(true);
    expect(Object.isFrozen(NORMALIZACIONES_REGISTRO)).toBe(true);
  });

  it("el formulario de Next y el nativo de Astro salen iguales, y se anota dónde se aplicó cada una", () => {
    const aplicadas: string[] = [];
    expect(compararRespuestas("/registro", respuesta(DOC(REG_NEXT)), respuesta(DOC(REG_ASTRO)), reg(aplicadas))).toEqual([]);
    expect(aplicadas).toEqual(NORMALIZACIONES_REGISTRO.map((n) => n.id));
  });

  it("autofocus solo se normaliza en las respuestas re-pintadas", () => {
    const d = compararRespuestas("/registro", respuesta(DOC(REG_NEXT)), respuesta(DOC(REG_ASTRO)), reg([], false));
    expect(d.join("\n")).toContain("autofocus");
  });

  it("sin marcar la ruta como registro, las mismas páginas SÍ difieren", () => {
    expect(compararRespuestas("/registro", respuesta(DOC(REG_NEXT)), respuesta(DOC(REG_ASTRO))).length).toBeGreaterThan(0);
  });

  it("un oculto de más, otro atributo data- o un data-ejemplos fuera del select de categoría se reportan", () => {
    const casos = [
      REG_ASTRO.replace('<input type="text" name="sitio_web">', '<input type="hidden" name="estado" value="publicado"><input type="text" name="sitio_web">'),
      REG_ASTRO.replace('data-ejemplos=', 'data-otro="x" data-ejemplos='),
      REG_ASTRO.replace('<button type="submit">', '<button type="submit" data-ejemplos="x">'),
    ];
    for (const caso of casos) {
      const d = compararRespuestas("/registro", respuesta(DOC(REG_NEXT)), respuesta(DOC(caso)), reg([]));
      expect(d.length, caso.slice(0, 80)).toBeGreaterThan(0);
    }
  });

  it("un segundo <script>, uno en línea o uno de fuera de /_astro/ se reportan", () => {
    const casos = [
      REG_ASTRO + '<script type="module" src="/_astro/otro.Ab12.js"></script>',
      REG_ASTRO.replace(/<script[^>]*><\/script>/, '<script type="module">alert(1)</script>'),
      REG_ASTRO.replace("/_astro/registro", "https://evil.example/registro"),
    ];
    for (const caso of casos) {
      const d = compararRespuestas("/registro", respuesta(DOC(REG_NEXT)), respuesta(DOC(caso)), reg([]));
      expect(d.length, caso.slice(-120)).toBeGreaterThan(0);
    }
  });

  it("autofocus en dos campos, o en uno sin error, se reporta", () => {
    const dos = REG_ASTRO.replace('<input type="text" name="sitio_web">', '<input type="text" name="sitio_web" autofocus="">');
    const sinError = REG_ASTRO.replace('aria-invalid="true" autofocus=""', 'aria-invalid="false" autofocus=""');
    for (const caso of [dos, sinError]) {
      const d = compararRespuestas("/registro", respuesta(DOC(REG_NEXT.replace('aria-invalid="true"', 'aria-invalid="false"'))), respuesta(DOC(caso)), reg([]));
      expect(d.length).toBeGreaterThan(0);
    }
  });
});

// ── 3b-2 (change `migrar-verificacion-sms-astro`, design.md §12; tasks.md #12) ─

describe("diff · la pantalla del código (3b-2), sin normalizaciones nuevas", () => {
  const NEXT_VERIFICAR = readFileSync(join(__dirname, "fixtures/next-3b2/con-sitio-url/verificar.html"), "utf8");
  const URL_VERIFICAR = "https://enmirumbo.example/registro/verificar?error=vencido";
  /** La misma página, con los dos formularios como los pinta Astro: nativos, sin ocultos. */
  const ASTRO_VERIFICAR = NEXT_VERIFICAR.replace(/\n<input type="hidden" name="\$ACTION_ID_[^"]+">/g, "")
    .replace('action="" encType="multipart/form-data" method="POST">\n<div', 'action="?_action=confirmar" method="post">\n<div')
    .replace('action="" encType="multipart/form-data" method="POST">', 'action="?_action=reenviar" method="post">');
  const comparar = (astro: string, aplicadas: string[] = []) =>
    compararRespuestas("/registro/verificar", respuesta(NEXT_VERIFICAR), respuesta(astro), { formulario: { urlPagina: URL_VERIFICAR, aplicadas } });

  it("los dos formularios salen iguales con las dos normalizaciones de 3a, aplicadas en cada uno", () => {
    expect(ASTRO_VERIFICAR).toContain('action="?_action=reenviar"');
    const aplicadas: string[] = [];
    expect(comparar(ASTRO_VERIFICAR, aplicadas)).toEqual([]);
    expect(aplicadas).toEqual(["atributos-del-form", "campos-action-de-next", "atributos-del-form", "campos-action-de-next"]);
  });

  it("un oculto de más o un atributo data- en un formulario de Astro salen como diferencia", () => {
    const conOculto = ASTRO_VERIFICAR.replace('<button type="submit" class="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border', '<input type="hidden" name="negocioId" value="c1"><button type="submit" class="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border');
    expect(comparar(conOculto).join("\n")).toContain("negocioId");
    const conData = ASTRO_VERIFICAR.replace('action="?_action=confirmar" method="post"', 'action="?_action=confirmar" method="post" data-astro-reload');
    expect(comparar(conData).join("\n")).toContain("data-astro-reload");
  });

  it("si un formulario de Astro postea a otra ruta, se reporta", () => {
    const otraRuta = ASTRO_VERIFICAR.replace('action="?_action=reenviar"', 'action="/registro?_action=reenviar"');
    expect(comparar(otraRuta).join("\n")).toMatch(/formulario #1: Next hace POST a \/registro\/verificar y Astro POST a \/registro/);
  });
});

// Fase 4 (change `migrar-enlace-gestion-astro`, design.md §9): ninguna
// normalización nueva; dos DIFERENCIAS ACEPTADAS que se reconocen por su texto
// exacto y se imprimen. Cualquier variante sigue saliendo como diferencia.
describe("diff · Fase 4: las diferencias aceptadas del enlace de gestión", () => {
  const NEXT_EDICION = readFileSync(join(__dirname, "fixtures/next-4/con-sitio-url/editar-publicada.html"), "utf8");

  it("la cabecera strict-origin bajo /editar/ y la <meta> de la 404 de Next: aceptadas y anotadas", () => {
    const aceptadas: string[] = [];
    const diferencias = compararRespuestas("/editar/<T>", respuesta(HTML_NEXT), respuesta(HTML_ASTRO, { "referrer-policy": "strict-origin" }));
    expect(diferencias.length).toBeGreaterThan(0);
    expect(sinDiferenciasAceptadasDeGestion(diferencias, aceptadas)).toEqual([]);
    expect(aceptadas).toEqual(["cabecera-referrer-policy"]);
    const conMeta = HTML_NEXT.replace("<title>", '<meta name="referrer" content="strict-origin"/><title>');
    const deLa404: string[] = [];
    expect(sinDiferenciasAceptadasDeGestion(compararRespuestas("/editar/x", respuesta(conMeta), respuesta(HTML_ASTRO)), deLa404)).toEqual([]);
    expect(deLa404).toEqual(["meta-referrer-en-la-404"]);
    expect(DIFERENCIAS_ACEPTADAS_GESTION.map((d: { id: string }) => d.id)).toEqual(["cabecera-referrer-policy", "meta-referrer-en-la-404"]);
  });

  it("otra política, otra cabecera, la meta de sobra en Astro o con otro valor: siguen siendo diferencias", () => {
    const casos = [
      compararRespuestas("/editar/<T>", respuesta(HTML_NEXT), respuesta(HTML_ASTRO, { "referrer-policy": "no-referrer" })),
      compararRespuestas("/editar/<T>", respuesta(HTML_NEXT), respuesta(HTML_ASTRO, { "referrer-policy": "strict-origin", "x-frame-options": "SAMEORIGIN" })),
      compararRespuestas("/editar/<T>", respuesta(HTML_NEXT), respuesta(HTML_ASTRO.replace("<title>", '<meta name="referrer" content="strict-origin"><title>'))),
      compararRespuestas("/editar/<T>", respuesta(HTML_NEXT.replace("<title>", '<meta name="referrer" content="origin"/><title>')), respuesta(HTML_ASTRO)),
    ];
    for (const diferencias of casos) expect(sinDiferenciasAceptadasDeGestion(diferencias, []).length).toBeGreaterThan(0);
  });

  it("la pantalla de edición de Next: un oculto con el token o un data- en Astro salen como diferencia (no hay normalización nueva)", () => {
    const urlPagina = "https://enmirumbo.example/editar/%3CT%3E";
    const astro = NEXT_EDICION.replace(/\n<input type="hidden" name="\$ACTION_[^>]*>/g, "");
    const base = compararRespuestas("/editar/<T>", respuesta(NEXT_EDICION), respuesta(astro), { registro: { urlPagina, aplicadas: [] } });
    const conToken = compararRespuestas("/editar/<T>", respuesta(NEXT_EDICION), respuesta(astro.replace('id="whatsapp"', 'id="whatsapp" data-token="<T>"')), { registro: { urlPagina, aplicadas: [] } });
    expect(conToken.length).toBeGreaterThan(base.length);
    expect(conToken.join("\n")).toContain("data-token");
  });
});
