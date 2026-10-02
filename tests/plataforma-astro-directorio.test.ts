/**
 * Spec `plataforma-astro` (change `migrar-directorio-publico-astro`, T-023,
 * Fase 2b), las páginas del directorio pintadas con la Container API:
 *
 * - "La foto prioritaria se precarga igual que en Next" (tasks.md #6): la
 *   medición de dónde deja React la precarga dentro de Astro, y la precarga
 *   del `<head>` de la ficha, del listado y de `/buscar`.
 * - "Metadatos y datos estructurados del directorio iguales a los de Next":
 *   el `<head>` de una ficha con foto, de un giro vacío y de `/buscar`, contra
 *   los capturados de la build de Next de `main` (`tests/fixtures/next-2b/`),
 *   con y sin `SITIO_URL`.
 * - "Cabeceras y JavaScript de las rutas de 2b iguales a las de Next": cero JS
 *   propio.
 *
 * Lo servido (estado, cabeceras, 404 dinámica, fotos) vive en las pruebas
 * sobre la salida construida.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { sembrarNegociosDemo } from "../prisma/seed-demo";
import { extraerPagina } from "../scripts/diff-html/nucleo.mjs";
import Destino from "../src/pages/[destino].astro";
import Buscar from "../src/pages/buscar.astro";
import Ficha from "../src/pages/negocio/[ficha].astro";
import type { PrismaClient } from "../src/generated/prisma/client";
import { VARIABLE_SRC, VARIABLE_WEBSITE_ID } from "../src/lib/analitica/config";
import { construirSegmentoFicha } from "../src/lib/ficha-url";
import { generarClaveFoto } from "../src/lib/fotos/clave";
import { cabezaDe, pintarPagina, pintarRespuesta } from "./astro-paginas";
import { crearClientePrueba } from "./db";
import PrecargaFoto from "./fixtures/precarga-foto.astro";

const raiz = join(__dirname, "..");
const fixtures = join(raiz, "tests/fixtures/next-2b");
const URL_PUBLICA = "https://enmirumbo.example";
const SRC = "https://cloud.umami.is/script.js";

let prisma: PrismaClient;
let academia: { id: string; nombre: string; fotoClave: string | null };

// Doce negocios ficticios con foto en un giro propio (serie 7719996 3xx).
const WHATSAPP_DOCE = Array.from({ length: 12 }, (_, i) => `77199963${String(i).padStart(2, "0")}`);

beforeAll(async () => {
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  await sembrarNegociosDemo(prisma, { NODE_ENV: "test" });
  academia = await prisma.negocio.findFirstOrThrow({
    where: { nombre: { startsWith: "Academia de Futbol Halcones" } },
    select: { id: true, nombre: true, fotoClave: true },
  });
  const categoria = await prisma.categoria.findFirstOrThrow({ where: { slug: "talleres" } });
  await prisma.negocio.deleteMany({ where: { whatsapp: { in: WHATSAPP_DOCE } } });
  for (const [i, whatsapp] of WHATSAPP_DOCE.entries()) {
    await prisma.negocio.create({
      data: {
        nombre: `Vulcanizadora Doce ${i} (ficticia)`,
        categoriaId: categoria.id,
        whatsapp,
        estado: "publicado",
        consintioAvisoEn: new Date("2026-08-01T10:00:00.000Z"),
        publicadoEn: new Date(Date.UTC(2026, 7, 1 + i)),
        fotoClave: generarClaveFoto(),
        giros: { connect: [{ slug: "vulcanizadora" }] },
      },
    });
  }
});

afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  vi.unstubAllEnvs();
  await prisma?.negocio.deleteMany({ where: { whatsapp: { in: WHATSAPP_DOCE } } });
  await prisma?.$disconnect();
});

const precargas = (html: string) => [...html.matchAll(/<link\b[^>]*rel="preload"[^>]*>/g)].map((m) => m[0]);
const imagenes = (html: string) => [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
const scripts = (html: string) => [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);

/** El fixture tal como lo emitió Next, con `<id>`/`<clave>` sustituidos. */
function fixture(variante: string, nombre: string, sustituciones: Record<string, string> = {}): string {
  let texto = readFileSync(join(fixtures, variante, nombre), "utf8").replace(/>\n</g, "><");
  for (const [marcador, valor] of Object.entries(sustituciones)) texto = texto.replaceAll(marcador, valor);
  return texto;
}

/** Título, `<meta>` y `<link>` (sin la hoja de estilos, propia de cada marco). */
function conjuntoDelHead(head: string) {
  const { titulo, metas, enlacesDelHead } = extraerPagina(`<html><head>${head}</head><body></body></html>`);
  return { titulo, metas, enlaces: enlacesDelHead.filter((e: string) => !e.includes("stylesheet")) };
}

describe("precarga · lo que hace React dentro de Astro (medición, tasks.md #6)", () => {
  it("React pinta la foto prioritaria sin loading y NO emite la precarga: la pone el documento", async () => {
    const html = await pintarPagina(PrecargaFoto);
    expect(precargas(html)).toEqual([]);
    const [prioritaria, diferida] = imagenes(html);
    expect(prioritaria).toContain('src="/api/foto/0123456789abcdef0123456789abcdef/ficha"');
    expect(prioritaria).not.toContain("loading=");
    expect(diferida).toContain('loading="lazy"');
  });
});

describe("precarga · la misma que Next, en el <head>", () => {
  it("ficha con foto: una sola precarga hacia /api/foto/<clave>/ficha, en el head y después del viewport", async () => {
    const segmento = construirSegmentoFicha(academia.nombre, academia.id);
    const html = await pintarPagina(Ficha, { ruta: `/negocio/${segmento}`, params: { ficha: segmento } });
    const esperada = `<link rel="preload" as="image" href="/api/foto/${academia.fotoClave}/ficha">`;
    expect(precargas(html)).toEqual([esperada]);
    const head = cabezaDe(html);
    expect(head).toContain(esperada);
    expect(head.indexOf(esperada)).toBeGreaterThan(head.indexOf('name="viewport"'));
    // La foto de la ficha va sin `loading` y en su variante `ficha`.
    const [foto] = imagenes(html);
    expect(foto).toContain(`src="/api/foto/${academia.fotoClave}/ficha"`);
    expect(foto).not.toContain("loading=");
  });

  it("ficha sin foto: ninguna precarga", async () => {
    const plomeria = await prisma.negocio.findFirstOrThrow({ where: { nombre: { startsWith: "Plomería Hermanos" } } });
    const segmento = construirSegmentoFicha(plomeria.nombre, plomeria.id);
    const html = await pintarPagina(Ficha, { ruta: `/negocio/${segmento}`, params: { ficha: segmento } });
    expect(precargas(html)).toEqual([]);
    expect(imagenes(html)).toEqual([]);
  });

  it("listado con doce negocios con foto: solo la primera sin loading y precargada; todas de la variante tarjeta", async () => {
    const html = await pintarPagina(Destino, { ruta: "/vulcanizadora", params: { destino: "vulcanizadora" } });
    const fotos = imagenes(html);
    expect(fotos).toHaveLength(12);
    expect(fotos.every((f) => /src="\/api\/foto\/[0-9a-f]{32}\/tarjeta"/.test(f))).toBe(true);
    expect(fotos.filter((f) => !f.includes('loading="lazy"'))).toEqual([fotos[0]]);
    const primera = /src="([^"]+)"/.exec(fotos[0])![1];
    expect(precargas(html)).toEqual([`<link rel="preload" as="image" href="${primera}">`]);
    expect(html).not.toContain("/ficha\"");
  });

  it("listado cuya primera tarjeta no tiene foto: ninguna precarga (como Next)", async () => {
    const html = await pintarPagina(Destino, { ruta: "/clubes-y-escuelas-deportivas", params: { destino: "clubes-y-escuelas-deportivas" } });
    expect(precargas(html)).toEqual([]);
  });

  it("/buscar cuya primera tarjeta tiene foto: la precarga de su variante tarjeta", async () => {
    const html = await pintarPagina(Buscar, { ruta: "/buscar?q=futbol" });
    expect(precargas(html)).toEqual([`<link rel="preload" as="image" href="/api/foto/${academia.fotoClave}/tarjeta">`]);
  });
});

describe("metadatos · el <head> de Next, con y sin SITIO_URL", () => {
  for (const variante of ["con-sitio-url", "sin-sitio-url"] as const) {
    const entorno = () => {
      vi.stubEnv("NODE_ENV", "production");
      if (variante === "con-sitio-url") vi.stubEnv("SITIO_URL", URL_PUBLICA);
      else vi.stubEnv("SITIO_URL", "");
    };

    it(`${variante}: ficha con foto (incluida la precarga)`, async () => {
      entorno();
      const segmento = construirSegmentoFicha(academia.nombre, academia.id);
      const html = await pintarPagina(Ficha, { ruta: `/negocio/${segmento}`, params: { ficha: segmento } });
      const esperado = fixture(variante, "head-ficha-con-foto.html", { "<id>": academia.id, "<clave>": academia.fotoClave ?? "" });
      expect(conjuntoDelHead(cabezaDe(html))).toEqual(conjuntoDelHead(esperado));
      expect(cabezaDe(html)).not.toMatch(/localhost|7719995006|7717775006/);
    });

    it(`${variante}: giro vacío (noindex, follow)`, async () => {
      entorno();
      const html = await pintarPagina(Destino, { ruta: "/carpinteria", params: { destino: "carpinteria" } });
      expect(conjuntoDelHead(cabezaDe(html))).toEqual(conjuntoDelHead(fixture(variante, "head-giro-vacio.html")));
    });

    it(`${variante}: /buscar con su título estático y noindex, follow`, async () => {
      entorno();
      const html = await pintarPagina(Buscar, { ruta: "/buscar?q=plomero" });
      expect(conjuntoDelHead(cabezaDe(html))).toEqual(conjuntoDelHead(fixture(variante, "head-buscar.html")));
      expect(cabezaDe(html)).not.toContain("plomero");
    });
  }
});

describe("rutas dinámicas · lo desconocido responde 404 con la página de no encontrado", () => {
  it("slug, compuesto, ficha inexistente y sin identificador: 404 y el mismo documento", async () => {
    const casos = [
      [Destino, "/loquesea", { destino: "loquesea" }],
      [Destino, "/plomeria-colonia-inventada", { destino: "plomeria-colonia-inventada" }],
      [Ficha, "/negocio/x-cnoexiste0000000000000000", { ficha: "x-cnoexiste0000000000000000" }],
      [Ficha, "/negocio/sin-identificador", { ficha: "sin-identificador" }],
    ] as const;
    const documentos = [];
    for (const [pagina, ruta, params] of casos) {
      const { status, html } = await pintarRespuesta(pagina, { ruta, params });
      expect(status, ruta).toBe(404);
      expect(html, ruta).toContain("No encontramos esta página");
      documentos.push(html);
    }
    for (const otro of documentos.slice(1)) expect(otro).toBe(documentos[0]);
  });

  it("lo que existe responde 200", async () => {
    for (const [pagina, ruta, params] of [
      [Destino, "/servicios-del-hogar", { destino: "servicios-del-hogar" }],
      [Destino, "/plomeria", { destino: "plomeria" }],
      [Destino, "/box-huicalco", { destino: "box-huicalco" }],
    ] as const) {
      expect((await pintarRespuesta(pagina, { ruta, params })).status, ruta).toBe(200);
    }
  });
});

describe("cero JS propio · listado, ficha y /buscar sin la medición", () => {
  it("sin <script> salvo el JSON-LD de la ficha, sin modulepreload ni islas", async () => {
    const segmento = construirSegmentoFicha(academia.nombre, academia.id);
    const paginas = [
      await pintarPagina(Destino, { ruta: "/servicios-del-hogar", params: { destino: "servicios-del-hogar" } }),
      await pintarPagina(Ficha, { ruta: `/negocio/${segmento}`, params: { ficha: segmento } }),
      await pintarPagina(Buscar, { ruta: "/buscar?q=plomero" }),
    ];
    for (const html of paginas) {
      expect(scripts(html).filter((s) => !s.includes('type="application/ld+json"'))).toEqual([]);
      expect(html).not.toContain("modulepreload");
      expect(html).not.toContain("astro-island");
    }
    expect(scripts(paginas[1])).toEqual(['<script type="application/ld+json">']);
  });

  it("con la medición: una ficha lleva exactamente un script diferido del proveedor, además del JSON-LD", async () => {
    vi.stubEnv(VARIABLE_SRC, SRC);
    vi.stubEnv(VARIABLE_WEBSITE_ID, "00000000-0000-4000-8000-000000000000");
    const segmento = construirSegmentoFicha(academia.nombre, academia.id);
    const html = await pintarPagina(Ficha, { ruta: `/negocio/${segmento}`, params: { ficha: segmento } });
    expect(scripts(html).filter((s) => !s.includes("application/ld+json"))).toEqual([
      `<script defer="" src="${SRC}" data-website-id="00000000-0000-4000-8000-000000000000" data-exclude-search="true">`,
    ]);
  });
});
