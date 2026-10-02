/**
 * Spec `plataforma-astro` (change `migrar-directorio-publico-astro`, T-023,
 * Fase 2b), requirement "Las 404 de las rutas dinámicas muestran la página de
 * no encontrado sin medirse" (alternativa B, design.md §1) y el MODIFIED "La
 * 404 responde igual que en Next" (`/no-existe`). tasks.md #3.
 *
 * Contra la SALIDA SERVIDA (build real + emulador del Build Output API), para
 * los ocho casos: tres slugs de la raíz y cinco fichas (inexistente, en
 * revisión, rechazada, despublicada y sin identificador).
 *
 * Los negocios son ficticios y llevan marcadores únicos en el nombre, la
 * colonia y el WhatsApp: si alguno aparece en una respuesta, se filtró.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { extraerPagina, limpiarHtml } from "../scripts/diff-html/nucleo.mjs";
import type { PrismaClient } from "../src/generated/prisma/client";
import { cabecerasDeSeguridad } from "../src/lib/seguridad/csp";
import { VARIABLE_SRC, VARIABLE_WEBSITE_ID } from "../src/lib/analitica/config";
import { crearClientePrueba } from "./db";
import { type Emulador, construirSiHaceFalta, levantarEmulador } from "./salida-astro";

const raiz = join(__dirname, "..");
const fixtures = join(raiz, "tests/fixtures/next-2b");
const URL_PUBLICA = "https://enmirumbo.example";
const SRC = "https://cloud.umami.is/script.js";

// Marcadores únicos, todos ficticios (serie de pruebas 7719996xxx).
const MARCADORES = {
  revision: { nombre: "Marcadorrevision Zq7 Ficticio", colonia: "Colonia Marcadorcolrev Xw9", whatsapp: "7719996101" },
  rechazado: { nombre: "Marcadorrechazo Kp3 Ficticio", colonia: "Colonia Marcadorcolrech Yt2", whatsapp: "7719996102" },
  despublicado: { nombre: "Marcadordespub Vb8 Ficticio", colonia: "Colonia Marcadorcoldesp Hn4", whatsapp: "7719996103" },
} as const;

let prisma: PrismaClient;
const ids: Record<keyof typeof MARCADORES, string> = { revision: "", rechazado: "", despublicado: "" };
let conSitio: Emulador;
let sinSitio: Emulador;

/** Las ocho URLs del scenario, con lo que NO puede aparecer en cada una. */
function casos(): Array<{ ruta: string; prohibido: string[] }> {
  const ficha = (clave: keyof typeof MARCADORES) => ({
    ruta: `/negocio/x-${ids[clave]}`,
    prohibido: [ids[clave], MARCADORES[clave].nombre, MARCADORES[clave].colonia, MARCADORES[clave].whatsapp],
  });
  return [
    { ruta: "/loquesea", prohibido: ["loquesea"] },
    { ruta: "/no-existe", prohibido: ["no-existe"] },
    { ruta: "/plomeria-colonia-inventada", prohibido: ["colonia-inventada", "Plomería"] },
    { ruta: "/negocio/x-cnoexiste0000000000000000", prohibido: ["cnoexiste0000000000000000"] },
    ficha("revision"),
    ficha("rechazado"),
    ficha("despublicado"),
    { ruta: "/negocio/sin-identificador", prohibido: ["sin-identificador"] },
  ];
}

beforeAll(async () => {
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  const categoria = await prisma.categoria.findFirstOrThrow({ where: { slug: "belleza" } });
  const estados = { revision: "en_revision", rechazado: "rechazado", despublicado: "en_revision" } as const;
  for (const clave of Object.keys(MARCADORES) as Array<keyof typeof MARCADORES>) {
    const m = MARCADORES[clave];
    await prisma.negocio.deleteMany({ where: { whatsapp: m.whatsapp } });
    const creado = await prisma.negocio.create({
      data: {
        nombre: m.nombre,
        categoriaId: categoria.id,
        coloniaOtra: m.colonia,
        whatsapp: m.whatsapp,
        estado: estados[clave],
        consintioAvisoEn: new Date("2026-08-01T10:00:00.000Z"),
        ...(clave === "despublicado"
          ? { publicadoEn: new Date("2026-08-02T10:00:00.000Z"), despublicadoEn: new Date("2026-09-01T10:00:00.000Z") }
          : {}),
      },
    });
    ids[clave] = creado.id;
  }
  construirSiHaceFalta();
  conSitio = await levantarEmulador({ SITIO_URL: URL_PUBLICA, [VARIABLE_SRC]: SRC, [VARIABLE_WEBSITE_ID]: "00000000-0000-4000-8000-000000000000" });
  sinSitio = await levantarEmulador({ SITIO_URL: undefined });
}, 240_000);

afterAll(async () => {
  conSitio?.detener();
  sinSitio?.detener();
  await prisma?.negocio.deleteMany({ where: { whatsapp: { in: Object.values(MARCADORES).map((m) => m.whatsapp) } } });
  await prisma?.$disconnect();
});

const enlacesDe = (html: string) =>
  [...html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g)].map((m) => [m[1], m[2]]);
const mainDe = (html: string) => /<main[^>]*>([\s\S]*)<\/main>/.exec(html)?.[1] ?? "";
const cabezaDe = (html: string) => /<head>([\s\S]*?)<\/head>/.exec(html)?.[1] ?? "";

/** Título, `<meta>` y `<link>` del head, sin la hoja de estilos (normalización 2). */
function conjuntoDelHead(head: string) {
  const { titulo, metas, enlacesDelHead } = extraerPagina(`<html><head>${head}</head><body></body></html>`);
  return { titulo, metas, enlaces: enlacesDelHead.filter((e: string) => !e.includes("stylesheet")) };
}

/** Lo comparable del `<body>`: atributos, texto por landmark, enlaces y secuencia. */
function cuerpoComparable(body: string) {
  const { atributosBody, texto, enlaces, secuencia } = extraerPagina(`<html><head></head>${body}</html>`);
  return { atributosBody, texto, enlaces, secuencia };
}

describe("404 dinámica · contenido visible, estado y noindex", () => {
  it("las ocho responden 404 con la página de no encontrado dentro del header y el footer", async () => {
    for (const { ruta } of casos()) {
      const r = await conSitio.pedir(ruta);
      expect(r.status, ruta).toBe(404);
      const html = await r.text();
      const main = mainDe(html);
      expect(main, ruta).toMatch(/<h1[^>]*>No encontramos esta página<\/h1>/);
      expect(main, ruta).toContain("A lo mejor el negocio ya no está publicado o la dirección quedó mal escrita.");
      expect(enlacesDe(main), ruta).toEqual([["/", "Ir al inicio"]]);
      expect(html.indexOf("<header"), ruta).toBeLessThan(html.indexOf("<main"));
      expect(html.indexOf("</main>"), ruta).toBeLessThan(html.indexOf("<footer"));
    }
  });

  it("el <body> es el mismo que Next pinta como 404 en /a/b/c", async () => {
    // El fixture se guardó con un salto de línea entre etiquetas para leerse; se quita.
    const referencia = readFileSync(join(fixtures, "con-sitio-url/cuerpo-404-global.html"), "utf8").replace(/>\n</g, "><");
    for (const { ruta } of casos()) {
      const body = /<body[\s\S]*<\/body>/.exec(limpiarHtml(await (await conSitio.pedir(ruta)).text()))?.[0] ?? "";
      expect(cuerpoComparable(body), ruta).toEqual(cuerpoComparable(referencia));
    }
  });

  for (const [variante, emulador] of [
    ["con-sitio-url", () => conSitio],
    ["sin-sitio-url", () => sinSitio],
  ] as const) {
    it(`${variante}: <title>, <meta> y canónica iguales a los de Next, con noindex`, async () => {
      const fixture = readFileSync(join(fixtures, variante, "404-dinamica-slug.html"), "utf8");
      const esperado = conjuntoDelHead(cabezaDe(fixture));
      expect(esperado.metas).toContain("content=noindex name=robots");
      for (const { ruta } of casos()) {
        const head = cabezaDe(await (await emulador().pedir(ruta)).text());
        expect(conjuntoDelHead(head), ruta).toEqual(esperado);
      }
    });
  }

  it("la ficha en revisión de Next tiene el mismo documento que la del slug (la referencia es una sola)", () => {
    for (const variante of ["con-sitio-url", "sin-sitio-url"]) {
      expect(readFileSync(join(fixtures, variante, "404-dinamica-ficha-en-revision.html"), "utf8")).toBe(
        readFileSync(join(fixtures, variante, "404-dinamica-slug.html"), "utf8"),
      );
    }
  });
});

describe("404 dinámica · sin medición y sin datos", () => {
  it("con la medición configurada no aparece el script del proveedor ni ningún <script>", async () => {
    for (const { ruta } of casos()) {
      const html = await (await conSitio.pedir(ruta)).text();
      expect(html, ruta).not.toContain("<script");
      expect(html, ruta).not.toContain("umami");
      expect(html, ruta).not.toContain(SRC);
    }
  });

  it("el componente que la pinta declara por escrito por qué queda fuera de la medición", () => {
    const fuente = readFileSync(join(raiz, "src/astro/componentes/NoEncontradoDinamico.astro"), "utf8");
    expect(fuente).toMatch(/\/\/ fuera de la medición: \S.{20,}/);
    const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(codigo).toMatch(/<DocumentoBase\b/);
    expect(codigo).not.toMatch(/TroncoPublico|ScriptAnalitica/);
    // Sin props y sin leer la petición: no puede filtrar nada.
    expect(codigo).not.toMatch(/Astro\.(params|url|request|props)|interface Props/);
  });

  it("ni el nombre, ni la colonia, ni el WhatsApp, ni el identificador, ni el slug pedido", async () => {
    for (const { ruta, prohibido } of casos()) {
      const r = await conSitio.pedir(ruta);
      const html = await r.text();
      const cabeceras = JSON.stringify([...r.headers.entries()]);
      for (const dato of prohibido) {
        expect(html, `${ruta} · ${dato}`).not.toContain(dato);
        expect(cabeceras, `${ruta} · ${dato}`).not.toContain(dato);
      }
    }
  });
});

describe("404 dinámica · las ocho son indistinguibles", () => {
  it("cuerpos idénticos byte a byte y mismas cabeceras salvo la fecha", async () => {
    const respuestas = [];
    for (const { ruta } of casos()) {
      const r = await conSitio.pedir(ruta);
      const cabeceras = [...r.headers.entries()].filter(([nombre]) => nombre !== "date").sort();
      respuestas.push({ ruta, cuerpo: await r.text(), cabeceras });
    }
    const [primera, ...resto] = respuestas;
    for (const otra of resto) {
      expect(otra.cuerpo, `${otra.ruta} vs ${primera.ruta}`).toBe(primera.cuerpo);
      expect(otra.cabeceras, `${otra.ruta} vs ${primera.ruta}`).toEqual(primera.cabeceras);
    }
  });

  it("las cuatro de seguridad y el Cache-Control y tipo que manda Next", async () => {
    const next = JSON.parse(readFileSync(join(fixtures, "con-sitio-url/cabeceras.json"), "utf8"))["404DinamicaSlug"];
    for (const { ruta } of casos()) {
      const r = await conSitio.pedir(ruta);
      for (const { key, value } of cabecerasDeSeguridad()) expect(r.headers.get(key), `${ruta} · ${key}`).toBe(value);
      expect(r.headers.get("cache-control"), ruta).toBe(next["cache-control"]);
      expect(r.headers.get("content-type"), ruta).toBe(next["content-type"]);
      expect(r.headers.get("x-powered-by"), ruta).toBeNull();
    }
  });
});

describe("404 dinámica · sin rastros del marco", () => {
  it("no aparecen __next_error__, 'Next' ni 'Astro', ni una traza", async () => {
    for (const { ruta } of casos()) {
      const html = await (await conSitio.pedir(ruta)).text();
      expect(html, ruta).not.toContain("__next_error__");
      expect(html, ruta).not.toMatch(/\bNext\b|Next\.js|\bAstro\b/);
      const texto = html.replace(/<[^>]+>/g, " ");
      for (const prohibido of [/not found/i, /astro/i, /next\.?js/i, /error/i, /stack/i, /\bat\s+\S+\s+\(/]) {
        expect(texto, `${ruta} · ${prohibido}`).not.toMatch(prohibido);
      }
    }
  });
});
