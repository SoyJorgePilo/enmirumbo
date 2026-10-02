/**
 * Spec `plataforma-astro` (change `migrar-formularios-publicos-astro`, T-024,
 * Fase 3a), requirement "Los envíos de otro origen se rechazan en español,
 * con las cuatro cabeceras y sin 500". tasks.md #4.
 *
 * Contra la SALIDA SERVIDA (build real + emulador del Build Output API), con
 * la medición configurada para ver que el 403 no la trae. Recorre una ruta de
 * página (`/`), un endpoint (`/api/foto/…`) y la Action de reportar.
 *
 * Todo ficticio: WhatsApp 77199973xx, dominios `.example`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import type { PrismaClient } from "../src/generated/prisma/client";
import { VARIABLE_SRC, VARIABLE_WEBSITE_ID } from "../src/lib/analitica/config";
import { construirSegmentoFicha } from "../src/lib/ficha-url";
import { cabecerasDeSeguridad } from "../src/lib/seguridad/csp";
import { crearClientePrueba } from "./db";
import { borrarNegociosSembrados } from "./limpieza";
import { type Emulador, construirSiHaceFalta, levantarEmulador } from "./salida-astro";

const URL_PUBLICA = "https://enmirumbo.example";
const WHATSAPP = ["7719997301"];
const NOMBRE = "Lavandería Ficticia Burbujas Origen";
const CACHE_DINAMICO = "private, no-cache, no-store, max-age=0, must-revalidate";
const FOTO = "/api/foto/0123456789abcdef0123456789abcdef/ficha";

let prisma: PrismaClient;
let emulador: Emulador;
let idPublicado = "";

const ruta = () => `/negocio/${construirSegmentoFicha(NOMBRE, idPublicado)}/reportar`;
const accion = () => `${ruta()}?_action=reportar`;
const cuantos = () => prisma.reporte.count({ where: { negocioId: idPublicado } });

function post(destino: string, cabeceras: Record<string, string>, cuerpo = "motivo=cerrado") {
  return emulador.pedir(destino, {
    method: "POST",
    body: cuerpo,
    headers: { "content-type": "application/x-www-form-urlencoded", ...cabeceras },
  });
}

function lasCuatro(r: Response, etiqueta: string) {
  for (const { key, value } of cabecerasDeSeguridad()) expect(r.headers.get(key), `${etiqueta} · ${key}`).toBe(value);
  expect(r.headers.get("x-powered-by"), etiqueta).toBeNull();
}

/** Lo que se exige de TODO 403 de origen. */
async function es403EnEspanol(r: Response, etiqueta: string, prohibidos: string[]): Promise<string> {
  expect(r.status, etiqueta).toBe(403);
  lasCuatro(r, etiqueta);
  expect(r.headers.get("referrer-policy"), etiqueta).toBe("strict-origin-when-cross-origin");
  expect(r.headers.get("cache-control"), etiqueta).toBe(CACHE_DINAMICO);
  expect(r.headers.get("content-type"), etiqueta).toBe("text/html; charset=utf-8");
  const html = await r.text();
  expect(html, etiqueta).toContain('<html lang="es-MX"');
  expect(html, etiqueta).toContain("No pudimos recibir tu envío");
  expect(html, etiqueta).toContain("Vuelve a abrir la página e inténtalo otra vez.");
  expect(html.match(/>Ir al inicio</g), etiqueta).toHaveLength(1);
  expect(html, etiqueta).toMatch(/<a[^>]*href="\/"[^>]*>Ir al inicio<\/a>/);
  expect(html, etiqueta).toMatch(/<meta name="robots" content="noindex/);
  // Sin medición, aunque está configurada.
  expect(html, etiqueta).not.toMatch(/umami|data-website-id/i);
  // Sin eco de la petición ni rastro del marco.
  for (const p of ["Cross-site", "forbidden", "Forbidden", "Astro", "127.0.0.1", ruta(), idPublicado, "motivo=", "cerrado", ...prohibidos]) {
    expect(html, `${etiqueta} · ${p}`).not.toContain(p);
  }
  return html;
}

beforeAll(async () => {
  construirSiHaceFalta();
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  await borrarNegociosSembrados(prisma, WHATSAPP);
  const categoriaId = (await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })).id;
  idPublicado = (
    await prisma.negocio.create({
      data: { nombre: NOMBRE, categoriaId, whatsapp: WHATSAPP[0], estado: "publicado", publicadoEn: new Date(), consintioAvisoEn: new Date() },
    })
  ).id;
  emulador = await levantarEmulador({
    SITIO_URL: URL_PUBLICA,
    [VARIABLE_SRC]: "https://cloud.umami.is/script.js",
    [VARIABLE_WEBSITE_ID]: "00000000-0000-0000-0000-000000000000",
  });
}, 300_000);

afterAll(async () => {
  emulador?.detener();
  await borrarNegociosSembrados(prisma, WHATSAPP);
  await prisma.$disconnect();
});

describe("origen · envío ajeno", () => {
  it("un reporte válido con Origin ajeno: 403 en español, las cuatro, sin medición, sin eco y sin fila", async () => {
    const r = await post(accion(), { origin: "https://ajeno.example" });
    await es403EnEspanol(r, "ajeno", ["ajeno.example"]);
    expect(await cuantos()).toBe(0);
  });

  it("Origin null y malformado: el MISMO 403, byte a byte, nunca un 500", async () => {
    const referencia = await (await post(accion(), { origin: "https://ajeno.example" })).text();
    for (const origin of ["null", "no es una url", "https://"]) {
      const r = await post(accion(), { origin });
      const html = await es403EnEspanol(r, `Origin ${origin}`, []);
      expect(html, origin).toBe(referencia);
    }
    expect(await cuantos()).toBe(0);
  });

  it("la regla cubre una página, un endpoint y la Action: Origin propio procede, null/malformado/ajeno no", async () => {
    for (const destino of ["/", FOTO, accion()]) {
      for (const origin of ["null", "::::", "https://ajeno.example"]) {
        await es403EnEspanol(await post(destino, { origin }), `${destino} ${origin}`, ["ajeno.example"]);
      }
      const propio = await post(destino, { origin: emulador.base });
      expect(propio.status, `${destino} propio`).not.toBe(403);
      expect(propio.status, `${destino} propio`).toBeLessThan(500);
      lasCuatro(propio, `${destino} propio`);
    }
    // La única que se procesó fue la de la Action con Origin propio.
    expect(await cuantos()).toBe(1);
    await prisma.reporte.deleteMany({ where: { negocioId: idPublicado } });
  });
});

describe("origen · el host detrás del proxy", () => {
  it("se compara contra el PRIMER valor de X-Forwarded-Host, no contra Host", async () => {
    const r = await post(accion(), {
      origin: URL_PUBLICA,
      "x-forwarded-host": "enmirumbo.example, otro.example",
    });
    expect(r.status).toBe(303);
    expect(await cuantos()).toBe(1);
    await prisma.reporte.deleteMany({ where: { negocioId: idPublicado } });
  });

  it("con X-Forwarded-Host distinto del Origin: 403 sin eco de ninguno de los dos", async () => {
    const r = await post(accion(), { origin: URL_PUBLICA, "x-forwarded-host": "otro.example" });
    await es403EnEspanol(r, "x-forwarded-host distinto", ["otro.example"]);
    expect(await cuantos()).toBe(0);
  });
});

describe("origen · sin Origin procede como en Next", () => {
  it("POST sin Origin al endpoint de fotos: 405 con las cuatro", async () => {
    const r = await emulador.pedir(FOTO, { method: "POST" });
    expect(r.status).toBe(405);
    lasCuatro(r, "POST sin Origin a fotos");
  });

  it("un reporte válido sin Origin se procesa como un envío normal", async () => {
    const r = await post(accion(), {});
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe(`${ruta()}/gracias`);
    expect(await cuantos()).toBe(1);
    await prisma.reporte.deleteMany({ where: { negocioId: idPublicado } });
  });
});

describe("origen · la página del 403 no existe para nadie más", () => {
  it("GET y POST propio a /envio-rechazado responden la 404 de un slug que no existe (sin la marca no hay 403)", async () => {
    const referencia = await emulador.pedir("/loquesea");
    const cuerpoReferencia = await referencia.text();
    for (const r of [await emulador.pedir("/envio-rechazado"), await post("/envio-rechazado", { origin: emulador.base })]) {
      expect(r.status).toBe(404);
      const html = await r.text();
      expect(html).toBe(cuerpoReferencia);
      expect(html).not.toContain("No pudimos recibir tu envío");
      lasCuatro(r, "/envio-rechazado");
    }
  });

  it("la marca no se puede fijar desde la petición: x-astro-locals no abre el 403 en español", async () => {
    const r = await emulador.pedir("/envio-rechazado", { headers: { "x-astro-locals": JSON.stringify({ envioRechazado: true }) } });
    expect(await r.text()).not.toContain("No pudimos recibir tu envío");
  });
});

describe("origen · la brecha conocida queda cerrada", () => {
  it("ninguna respuesta de este recorrido trae 'Cross-site' ni sale sin las cuatro", async () => {
    for (const [destino, cabeceras] of [
      ["/", { origin: "https://ajeno.example" }],
      [FOTO, {}],
      [FOTO, { origin: "https://ajeno.example" }],
      ["/a/b/c", { origin: "https://ajeno.example" }],
      [accion(), { origin: "null" }],
    ] as const) {
      const r = await post(destino, cabeceras);
      lasCuatro(r, `${destino}`);
      expect(await r.text(), destino).not.toContain("Cross-site");
    }
    expect(await cuantos()).toBe(0);
  });

  it("el registro del servidor no guarda el Origin ajeno ni el cuerpo del envío", () => {
    expect(emulador.registro()).not.toContain("ajeno.example");
    expect(emulador.registro()).not.toContain("motivo=cerrado");
  });
});
