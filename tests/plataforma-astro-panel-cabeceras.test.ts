/**
 * Spec `plataforma-astro` (change `migrar-panel-admin-base-astro`, Fase 5a;
 * tasks.md #6), requirement "Toda respuesta del panel lleva sus cabeceras, su
 * política de referente estricta, no se guarda en caché y no se mide", sobre
 * la SALIDA SERVIDA:
 *
 * - 200, 303, 307, 403, 404 (el comodín y una Action pedida desde otra ruta)
 *   y 500 bajo `/admin`: las cuatro cabeceras, `Referrer-Policy:
 *   strict-origin` (decisión 1 del fundador: la global no la anula) y un
 *   `Cache-Control` con `no-store`;
 * - cada documento del panel con su `<meta name="referrer">` y `noindex`;
 * - con la medición configurada, ningún script del proveedor ni atributo de
 *   evento; `/admin*` fuera del sitemap.
 *
 * Todo ficticio.
 */
import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { enviarFormulario } from "../scripts/enviar-formulario.mjs";
import { VARIABLE_CONTRASENA, VARIABLE_SECRETO_SESION } from "../src/lib/admin/config";
import { VARIABLE_SRC, VARIABLE_WEBSITE_ID } from "../src/lib/analitica/config";
import { cabecerasDeSeguridad } from "../src/lib/seguridad/csp";
import type { PrismaClient } from "../src/generated/prisma/client";
import { crearClientePrueba } from "./db";
import { borrarIntentos, cookieDeSesion } from "./panel-astro";
import { type Emulador, construirSiHaceFalta, levantarEmulador } from "./salida-astro";

const CONTRASENA = `clave-ficticia-${randomBytes(6).toString("hex")}`;
const SECRETO = randomBytes(32).toString("hex");
const MEDICION = { [VARIABLE_SRC]: "https://cloud.umami.is/script.js", [VARIABLE_WEBSITE_ID]: "00000000-0000-4000-8000-000000000000" };
const PANEL = {
  [VARIABLE_CONTRASENA]: CONTRASENA,
  [VARIABLE_SECRETO_SESION]: SECRETO,
  REGISTRO_ENCABEZADO_IP: "x-forwarded-for",
  SITIO_URL: "https://enmirumbo.example",
  ...MEDICION,
};
const IP = "192.0.2.240";

let prisma: PrismaClient;
let astro: Emulador;
let sinBase: Emulador;
const sesion = () => cookieDeSesion("vigente", SECRETO);

beforeAll(async () => {
  construirSiHaceFalta();
  prisma = crearClientePrueba();
  [astro, sinBase] = await Promise.all([
    levantarEmulador(PANEL),
    levantarEmulador({ ...PANEL, DATABASE_URL: "postgresql://nadie:nadie@127.0.0.1:1/ninguna" }),
  ]);
}, 300_000);

afterAll(async () => {
  astro?.detener();
  sinBase?.detener();
  await borrarIntentos(prisma, [IP], SECRETO);
  await prisma.$disconnect();
});

/** Las cuatro cabeceras, con la de referente del panel, `no-store` y nada que anuncie el marco. */
function cabecerasDelPanel(h: Headers, etiqueta: string) {
  for (const { key, value } of cabecerasDeSeguridad()) {
    expect(h.get(key), `${etiqueta} · ${key}`).toBe(key.toLowerCase() === "referrer-policy" ? "strict-origin" : value);
  }
  expect(h.get("cache-control"), etiqueta).toContain("no-store");
  expect(h.get("x-powered-by"), etiqueta).toBeNull();
}

const postear = (e: Emulador, ruta: string, extra: Record<string, string> = {}, cuerpo = "a=1") =>
  e.pedir(ruta, { method: "POST", body: cuerpo, headers: { origin: e.base, "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": IP, ...extra } });

describe("panel · cabeceras en cada forma de respuesta", () => {
  it("200, 303, 307, 403, 404 y 500 bajo /admin", async () => {
    const entrar = await enviarFormulario({
      urlPagina: new URL("/admin", astro.base).toString(),
      elecciones: { contrasena: CONTRASENA },
      cabecerasExtra: { "x-forwarded-for": IP },
    });
    const casos: Array<[string, number, Response | { status: number; headers: Headers }]> = [
      ["acceso", 200, await astro.pedir("/admin")],
      ["cola con sesión", 200, await astro.pedir("/admin/cola", { headers: { cookie: sesion() } })],
      ["listado con sesión", 200, await astro.pedir("/admin/negocios?estado=xyz", { headers: { cookie: sesion() } })],
      ["303 de entrar", 303, { status: entrar.cadena[1].status, headers: entrar.cadena[1].cabeceras }],
      ["cola sin sesión", 307, await astro.pedir("/admin/cola")],
      ["acceso con sesión", 307, await astro.pedir("/admin", { headers: { cookie: sesion() } })],
      ["Action sin sesión", 303, await postear(astro, "/admin/negocios?_action=inventada")],
      ["origen ajeno", 403, await postear(astro, "/admin?_action=entrar", { origin: "https://evil.example/" })],
      ["origen null", 403, await postear(astro, "/admin/cola", { origin: "null" })],
      ["comodín", 404, await astro.pedir("/admin/x")],
      ["Action de otra ruta con sesión", 404, await postear(astro, "/admin/cola?_action=reportar", { cookie: sesion() }, "motivo=cerrado")],
      ["500 de la cola con la base caída", 500, await sinBase.pedir("/admin/cola", { headers: { cookie: sesion() } })],
    ];
    for (const [etiqueta, status, r] of casos) {
      expect(r.status, etiqueta).toBe(status);
      cabecerasDelPanel(r.headers, etiqueta);
    }
  });

  it("la cabecera estricta cubre la ruta escrita de otra forma (barra final, barras dobles)", async () => {
    // (`/admin/cola//` no llega al middleware: Astro responde antes su propio
    // 301 a `/admin/cola/`, sin cuerpo; hallazgo preexistente de todo el sitio,
    // anotado en b-dev.md.)
    for (const ruta of ["/admin/", "/admin/cola/", "/admin//cola"]) {
      const r = await astro.pedir(ruta);
      expect(r.headers.get("referrer-policy"), ruta).toBe("strict-origin");
      expect(r.headers.get("cache-control"), ruta).toContain("no-store");
    }
    // Codificada o en mayúsculas no casa con ninguna ruta: la responde la 404
    // estática de la CDN (no la función) y no pinta nada del panel.
    for (const ruta of ["/%61dmin/cola", "/ADMIN/cola"]) {
      const r = await astro.pedir(ruta, { headers: { cookie: sesion() } });
      expect(r.status, ruta).toBe(404);
      expect(await r.text(), ruta).not.toContain("Registros por revisar");
    }
  });

  it("fuera del panel la política sigue siendo la global", async () => {
    const r = await astro.pedir("/terminos");
    expect(r.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    const parecida = await astro.pedir("/administracion");
    expect(parecida.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });
});

describe("panel · documentos: referente, no indexación y sin medición", () => {
  const documentos: Array<[string, string, boolean]> = [
    ["acceso", "/admin", false],
    ["cola", "/admin/cola", true],
    ["listado", "/admin/negocios", true],
    ["comodín", "/admin/a/b/c", false],
    ["comodín con sesión", "/admin/registros/c5aficticio000000000000001/loquesea", true],
  ];

  it("cada documento declara el referente estricto y noindex, y no trae el script de medición aunque esté configurada", async () => {
    // Control: con la misma configuración, lo público sí mide.
    const portada = await (await astro.pedir("/")).text();
    expect(portada).toContain("cloud.umami.is/script.js");
    for (const [etiqueta, ruta, conSesion] of documentos) {
      const html = await (await astro.pedir(ruta, { headers: conSesion ? { cookie: sesion() } : {} })).text();
      expect(html, etiqueta).toContain('<meta name="referrer" content="strict-origin">');
      expect(html, etiqueta).toMatch(/<meta name="robots" content="noindex(, nofollow)?">/);
      expect(html, etiqueta).not.toContain("umami");
      expect(html, etiqueta).not.toMatch(/data-umami-event/);
      expect(html, etiqueta).not.toMatch(/<script(?![^>]*application\/ld\+json)[\s>]/);
    }
  });

  it("las pantallas del panel (no la 404) declaran noindex, nofollow", async () => {
    for (const [etiqueta, ruta, conSesion] of documentos.filter(([e]) => !e.startsWith("comodín"))) {
      const html = await (await astro.pedir(ruta, { headers: conSesion ? { cookie: sesion() } : {} })).text();
      expect(html, etiqueta).toContain('<meta name="robots" content="noindex, nofollow">');
    }
  });

  it("ninguna ruta del panel aparece en el sitemap", async () => {
    const sitemap = await (await astro.pedir("/sitemap.xml")).text();
    expect(sitemap).toContain("<urlset");
    expect(sitemap).not.toMatch(/\/admin/);
  });
});
