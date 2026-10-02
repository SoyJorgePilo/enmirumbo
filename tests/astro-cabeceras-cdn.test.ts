/**
 * Spec `plataforma-astro` (change `migrar-lectura-publica-astro`, T-023),
 * requirement "Las cabeceras de seguridad son idénticas en respuestas
 * dinámicas, prerenderizadas, 404 y estáticas": la parte que va a
 * `.vercel/output/config.json` para lo que sirve la CDN sin pasar por la
 * función. tasks.md #10; design.md §5.
 *
 * Aquí, la transformación pura de la tabla de rutas. Sobre el `config.json`
 * construido de verdad y servido por el emulador: `plataforma-astro-build`.
 */
import { describe, expect, it } from "vitest";

import { rutasConCabecerasEnLaCdn } from "../src/astro/integraciones/cabeceras-en-la-cdn";
import { cabecerasDeSeguridad } from "../src/lib/seguridad/csp";

const SEGURIDAD = Object.fromEntries(cabecerasDeSeguridad().map(({ key, value }) => [key, value]));

/** Forma de la tabla que escribe `@astrojs/vercel` (recortada). */
const TABLA = [
  { src: "^/_astro(?:/(.*))$", headers: { "cache-control": "public, max-age=31536000, immutable" }, continue: true },
  { handle: "filesystem" },
  { src: "^/robots\\.txt/?$", dest: "_render" },
  { src: "^/$", dest: "_render" },
  { src: "/.*", dest: "/404.html", status: 404 },
];

const ARCHIVOS = [
  "404.html",
  "aviso-de-privacidad/index.html",
  "terminos/index.html",
  "opengraph-image",
  "favicon.ico",
  "_astro/terminos.Bx1y2z.css",
];

type Ruta = { src?: string; dest?: string; status?: number; headers?: Record<string, string>; handle?: string; continue?: boolean };

const resultado = () => rutasConCabecerasEnLaCdn(TABLA, ARCHIVOS) as Ruta[];

/** Las cabeceras que la tabla le daría a `ruta` antes del filesystem, más las del destino. */
function cabecerasPara(ruta: string): Record<string, string> {
  const tabla = resultado();
  const indice = tabla.findIndex((r) => r.handle === "filesystem");
  const cabeceras: Record<string, string> = {};
  for (const r of tabla.slice(0, indice)) {
    if (r.headers && r.src && new RegExp(r.src).test(ruta)) Object.assign(cabeceras, r.headers);
  }
  return cabeceras;
}

describe("plataforma-astro · cabeceras en la CDN", () => {
  it("cada estático (página prerenderizada, imagen, icono, hoja de /_astro/) lleva las cuatro", () => {
    for (const ruta of ["/aviso-de-privacidad", "/aviso-de-privacidad/", "/terminos", "/opengraph-image", "/favicon.ico", "/_astro/terminos.Bx1y2z.css", "/404.html"]) {
      expect(cabecerasPara(ruta), ruta).toMatchObject(SEGURIDAD);
    }
  });

  it("la imagen de marca, que no tiene extensión, se sirve como image/png", () => {
    expect(cabecerasPara("/opengraph-image")["Content-Type"]).toBe("image/png");
    expect(cabecerasPara("/terminos")["Content-Type"]).toBeUndefined();
  });

  it("la 404 de cualquier URL desconocida lleva las cuatro en su propia ruta", () => {
    const comodin = resultado().find((r) => r.dest === "/404.html");
    expect(comodin?.status).toBe(404);
    expect(comodin?.headers).toMatchObject(SEGURIDAD);
  });

  it("no toca rutas de la función: no puede pisar una política más estricta", () => {
    expect(cabecerasPara("/")).toEqual({});
    expect(cabecerasPara("/robots.txt")).toEqual({});
    expect(cabecerasPara("/admin/negocios")).toEqual({});
    const funcion = resultado().filter((r) => r.dest === "_render");
    for (const r of funcion) expect(r.headers).toBeUndefined();
  });

  // Fase 2b (change `migrar-directorio-publico-astro`): con `/[destino]` en
  // la función, su ruta `^/([^/]+?)/?$` también atrapa `/opengraph-image/` y
  // `/404`. Astro las reconoce como rutas PRERENDERIZADAS y responde sin pasar
  // por el middleware, así que salían sin las cuatro (lo vio
  // `astro-seguridad-adversarial`). Esas variantes llevan las cuatro desde la
  // CDN, sin el tipo de la imagen (lo que salga ahí no es la imagen).
  it("la barra final de un estático sin extensión, y /404, llevan las cuatro (sin el tipo de la imagen)", () => {
    for (const ruta of ["/opengraph-image/", "/404", "/404/"]) {
      expect(cabecerasPara(ruta), ruta).toEqual(SEGURIDAD);
    }
    expect(cabecerasPara("/favicon.ico/")).toEqual({});
  });

  it("los patrones no se escapan de su archivo", () => {
    expect(cabecerasPara("/terminosx")).toEqual({});
    expect(cabecerasPara("/opengraph-imageX")).toEqual({});
    expect(cabecerasPara("/aviso-de-privacidad/otra")).toEqual({});
  });

  it("conserva la tabla del adaptador y su orden", () => {
    const tabla = resultado();
    expect(tabla[0]).toEqual(TABLA[0]);
    expect(tabla.slice(tabla.findIndex((r) => r.handle === "filesystem")).map((r) => r.dest ?? r.handle)).toEqual([
      "filesystem",
      "_render",
      "_render",
      "/404.html",
    ]);
  });

  it("si el adaptador cambia de forma, falla en vez de publicar sin cabeceras", () => {
    expect(() => rutasConCabecerasEnLaCdn([{ src: "^/$", dest: "_render" }], ARCHIVOS)).toThrow(/filesystem/);
    expect(() => rutasConCabecerasEnLaCdn([{ handle: "filesystem" }], ARCHIVOS)).toThrow(/404/);
  });
});
