/**
 * Spec `plataforma-astro` (change `migrar-lectura-publica-astro`, T-023):
 *
 * - requirement "Las cabeceras de seguridad son idénticas en respuestas
 *   dinámicas, prerenderizadas, 404 y estáticas": la parte que pone el
 *   middleware (lo que pasa por la función). Scenarios "una política más
 *   estricta no se pisa" y "lo dinámico no se guarda en cachés compartidas".
 * - requirement "Las páginas públicas se arman con un documento base y un
 *   tronco medido…": scenario "los avisos de arranque no inundan el log".
 *
 * tasks.md #8; design.md §5.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { cabecerasDeSeguridad } from "../src/lib/seguridad/csp";

type Middleware = (contexto: unknown, siguiente: () => Promise<Response>) => Promise<Response>;

async function cargarMiddleware(): Promise<Middleware> {
  const modulo = await import("../src/middleware");
  return modulo.onRequest as unknown as Middleware;
}

// Desde 3a (change `migrar-formularios-publicos-astro`) el middleware lee
// también la petición (método y `Origin`), `locals` y el patrón de la ruta:
// el contexto falso los trae como los trae Astro, con un GET.
const contexto = (ruta = "/") => ({
  isPrerendered: false,
  url: new URL(`https://sitio.example${ruta}`),
  request: new Request(`https://sitio.example${ruta}`),
  locals: {},
  routePattern: ruta,
});

async function pasar(respuesta: Response, ruta = "/"): Promise<Response> {
  const onRequest = await cargarMiddleware();
  return onRequest(contexto(ruta), async () => respuesta);
}

const html = (init: ResponseInit = {}) =>
  new Response("<!DOCTYPE html><html></html>", {
    ...init,
    headers: { "content-type": "text/html", ...(init.headers as Record<string, string>) },
  });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("plataforma-astro · el middleware pone las cuatro cabeceras", () => {
  it("con los mismos valores que cabecerasDeSeguridad()", async () => {
    const respuesta = await pasar(html());
    for (const { key, value } of cabecerasDeSeguridad()) {
      expect(respuesta.headers.get(key), key).toBe(value);
    }
  });

  it("también en endpoints de texto, 404 y redirecciones", async () => {
    const casos = [
      new Response("User-Agent: *\n", { headers: { "content-type": "text/plain" } }),
      new Response(null, { status: 404 }),
      Response.redirect("https://sitio.example/", 307), // cabeceras inmutables
    ];
    for (const caso of casos) {
      const respuesta = await pasar(caso);
      expect(respuesta.status).toBe(caso.status);
      for (const { key, value } of cabecerasDeSeguridad()) {
        expect(respuesta.headers.get(key), `${caso.status} ${key}`).toBe(value);
      }
    }
  });

  it("una política de referente más estricta no se pisa", async () => {
    const respuesta = await pasar(html({ headers: { "Referrer-Policy": "strict-origin" } }));
    expect(respuesta.headers.get("referrer-policy")).toBe("strict-origin");
    expect(respuesta.headers.get("content-security-policy")).not.toBeNull();
  });

  it("no anuncia el marco", async () => {
    const respuesta = await pasar(html({ headers: { "X-Powered-By": "Astro" } }));
    expect(respuesta.headers.get("x-powered-by")).toBeNull();
    for (const nombre of respuesta.headers.keys()) expect(nombre).not.toMatch(/^x-(astro|nextjs)/);
  });
});

// Fase 4 (change `migrar-enlace-gestion-astro`, design.md §1.2; tasks.md #9):
// toda respuesta cuya ruta PEDIDA empiece con `/editar/` sale con
// `Referrer-Policy: strict-origin`, aunque traiga otra; fuera, nada cambia.
describe("plataforma-astro · Fase 4: la política de referente del grupo de gestión", () => {
  it("bajo /editar/ fija strict-origin en 200, 303, 403, 404 y 500, pisando lo que traiga", async () => {
    const casos = [
      html(),
      html({ status: 404 }),
      html({ status: 403 }),
      html({ status: 500 }),
      new Response(null, { status: 303, headers: { Location: "/editar/x/gracias" } }),
      html({ headers: { "Referrer-Policy": "unsafe-url" } }),
      html({ headers: { "Referrer-Policy": "strict-origin-when-cross-origin" } }),
      Response.redirect("https://sitio.example/editar/x/gracias", 303), // cabeceras inmutables
    ];
    for (const caso of casos) {
      const respuesta = await pasar(caso, "/editar/token-ficticio");
      expect(respuesta.headers.get("referrer-policy"), String(caso.status)).toBe("strict-origin");
      expect(respuesta.status).toBe(caso.status);
    }
    expect((await pasar(html(), "/editar/token-ficticio/gracias")).headers.get("referrer-policy")).toBe("strict-origin");
    expect((await pasar(html(), "/editar/")).headers.get("referrer-policy")).toBe("strict-origin");
  });

  it("las otras tres cabeceras siguen la regla de siempre (no se pisa una que ya venga)", async () => {
    const propia = "default-src 'none'";
    const respuesta = await pasar(html({ headers: { "Content-Security-Policy": propia } }), "/editar/token-ficticio");
    expect(respuesta.headers.get("content-security-policy")).toBe(propia);
    const global = Object.fromEntries(cabecerasDeSeguridad().map(({ key, value }) => [key.toLowerCase(), value]));
    expect(respuesta.headers.get("x-frame-options")).toBe(global["x-frame-options"]);
    expect(respuesta.headers.get("x-content-type-options")).toBe(global["x-content-type-options"]);
  });

  it("fuera de /editar/ la política es la global y una más estricta no se pisa", async () => {
    const global = cabecerasDeSeguridad().find(({ key }) => key.toLowerCase() === "referrer-policy")!.value;
    for (const ruta of ["/", "/loquesea", "/editar", "/editarx/y", "/registro", "/negocio/editar/x"]) {
      expect((await pasar(html(), ruta)).headers.get("referrer-policy"), ruta).toBe(global);
    }
    expect((await pasar(html({ headers: { "Referrer-Policy": "no-referrer" } }), "/")).headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("decide la ruta PEDIDA (url), no el patrón al que se reescribió (403 y 404 pasan por /envio-rechazado)", async () => {
    const onRequest = await cargarMiddleware();
    const reescrito = { ...contexto("/editar/token-ficticio"), routePattern: "/envio-rechazado" };
    const respuesta = await onRequest(reescrito, async () => html({ status: 404 }));
    expect(respuesta.headers.get("referrer-policy")).toBe("strict-origin");
  });

  it("el prefijo es exactamente / + la carpeta de las pantallas del enlace + /", async () => {
    const { PREFIJO_DE_GESTION } = await import("../src/astro/cabeceras");
    const { existsSync, statSync } = await import("node:fs");
    const carpeta = new URL(`../src/pages${PREFIJO_DE_GESTION}`, import.meta.url);
    expect(PREFIJO_DE_GESTION).toBe("/editar/");
    expect(existsSync(carpeta) && statSync(carpeta).isDirectory()).toBe(true);
  });

  it("prepararRespuesta recibe la ruta pedida", async () => {
    const { prepararRespuesta } = await import("../src/astro/cabeceras");
    expect(prepararRespuesta(html(), "/editar/x").headers.get("referrer-policy")).toBe("strict-origin");
    expect(prepararRespuesta(html(), "/x").headers.get("referrer-policy")).not.toBe("strict-origin");
  });
});

describe("plataforma-astro · lo dinámico no se guarda en cachés compartidas", () => {
  it("el HTML dinámico lleva el mismo Cache-Control que manda Next con force-dynamic", async () => {
    const respuesta = await pasar(html());
    expect(respuesta.headers.get("cache-control")).toBe(
      "private, no-cache, no-store, max-age=0, must-revalidate",
    );
  });

  it("el HTML dinámico declara su juego de caracteres, como en Next", async () => {
    expect((await pasar(html())).headers.get("content-type")).toBe("text/html; charset=utf-8");
    const conCharset = html({ headers: { "content-type": "text/html; charset=utf-8" } });
    expect((await pasar(conCharset)).headers.get("content-type")).toBe("text/html; charset=utf-8");
  });

  it("un endpoint que fija su propio Cache-Control lo conserva", async () => {
    const propio = new Response("x", {
      headers: { "content-type": "text/plain", "cache-control": "public, max-age=0, must-revalidate" },
    });
    expect((await pasar(propio)).headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
  });

  it("una página prerenderizada pasa intacta (sus cabeceras las pone la CDN)", async () => {
    const onRequest = await cargarMiddleware();
    const original = html();
    const respuesta = await onRequest({ ...contexto(), isPrerendered: true }, async () => original);
    expect(respuesta.headers.get("cache-control")).toBeNull();
  });
});

describe("plataforma-astro · los avisos de arranque no inundan el log", () => {
  it("producción sin SITIO_URL: diez peticiones, un solo aviso, ninguna falla", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITIO_URL", "");
    const avisos = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { reiniciarAvisoDeUrlSitio } = await import("../src/lib/sitio");
    reiniciarAvisoDeUrlSitio();

    const onRequest = await cargarMiddleware();
    for (const ruta of ["/", "/terminos", "/robots.txt", "/sitemap.xml", "/a", "/b", "/c", "/d", "/e", "/f"]) {
      const respuesta = await onRequest(contexto(ruta), async () => html());
      expect(respuesta.status, ruta).toBe(200);
    }
    const deUrl = avisos.mock.calls.filter(([mensaje]) => String(mensaje).includes("falta SITIO_URL"));
    expect(deUrl).toHaveLength(1);
  });

  it("los cuatro avisos viven en el tronco del módulo, no en el manejador", async () => {
    const { readFileSync } = await import("node:fs");
    const fuente = readFileSync(new URL("../src/middleware.ts", import.meta.url), "utf8");
    const tronco = fuente.slice(0, fuente.indexOf("export const onRequest"));
    for (const aviso of [
      "avisarSinUrlSitioUnaVez()",
      "avisarSinBaseDeDatosUnaVez()",
      "avisarSinSecretoDeTareasUnaVez()",
      "avisarSinAlmacenDeFotosUnaVez()",
    ]) {
      expect(tronco, aviso).toContain(aviso);
    }
  });
});
