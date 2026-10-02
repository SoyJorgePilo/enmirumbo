/**
 * Spec `plataforma-astro` (change `migrar-lectura-publica-astro`, T-023),
 * requirement "El HTML servido no difiere del de Next" → scenario "el script
 * sí ve una diferencia". tasks.md #4.
 *
 * El script completo (`scripts/diff-html.mjs`) necesita las dos builds y no
 * corre en el CI (design.md §9); lo que sí corre aquí es su núcleo: el
 * normalizador que quita el ruido de cada marco y el comparador.
 */
import { describe, expect, it } from "vitest";

import {
  compararRespuestas,
  extraerPagina,
  limpiarHtml,
  NORMALIZACIONES_404_DINAMICA,
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
