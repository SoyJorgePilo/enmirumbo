import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { sembrarNegociosDemo } from "../prisma/seed-demo";
import robots from "../src/app/robots";
import sitemap from "../src/app/sitemap";
import {
  alt as altImagenDeMarca,
  contentType as tipoImagenDeMarca,
  size as tamanoImagenDeMarca,
} from "../src/app/opengraph-image";
import type { PrismaClient } from "../src/generated/prisma/client";
import { construirSegmentoFicha } from "../src/lib/ficha-url";
import { COLORES_MARCA } from "../src/lib/colores-marca";
import { VARIABLE_URL_SITIO, reiniciarAvisoDeUrlSitio } from "../src/lib/sitio";
import { crearClientePrueba } from "./db";
import { sembrarNegociosSeo } from "./seo-fixtures";

// Spec: layout-base · requirements "El sitio publica un `robots.txt` que
// permite lo público y excluye lo que no toca" y "El sitio publica un
// `sitemap.xml` que se actualiza solo" (tasks.md #17, #19 y #20).

const raiz = join(__dirname, "..");
const URL_SITIO = "https://enmirumbo.example";

let prisma: PrismaClient;
let idPorWhatsapp: Record<string, string> = {};

beforeAll(async () => {
  process.env[VARIABLE_URL_SITIO] = URL_SITIO;
  prisma = crearClientePrueba();
  await prisma.negocio.deleteMany();
  await seedCatalogos(prisma);
  await sembrarNegociosDemo(prisma, { NODE_ENV: "test" });
  await sembrarNegociosSeo(prisma);
  const negocios = await prisma.negocio.findMany({
    select: { id: true, whatsapp: true },
  });
  idPorWhatsapp = Object.fromEntries(negocios.map((n) => [n.whatsapp, n.id]));
});

afterAll(async () => {
  delete process.env[VARIABLE_URL_SITIO];
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: "7719995" } } });
  await prisma.$disconnect();
});

describe("layout-base · robots.txt (tasks #19)", () => {
  // Scenario: lo público se puede rastrear
  it("permite el sitio y no bloquea la home, los listados, los giros ni las fichas", () => {
    const reglas = robots().rules;
    expect(Array.isArray(reglas)).toBe(false);
    const regla = reglas as { userAgent?: string; allow?: string; disallow?: string[] };
    expect(regla.userAgent).toBe("*");
    expect(regla.allow).toBe("/");
    for (const publica of ["/", "/servicios-del-hogar", "/plomeria", "/negocio"]) {
      expect(regla.disallow, publica).not.toContain(publica);
    }
  });

  // Scenario: el panel y los resultados quedan fuera
  it("excluye /admin, /buscar y /registro/gracias", () => {
    const regla = robots().rules as { disallow?: string[] };
    expect(regla.disallow).toEqual(["/admin", "/buscar", "/registro/gracias"]);
  });

  // Scenario: no se anuncian rutas secretas
  it("no menciona rutas que el sitio todavía no sirve, ni el enlace de gestión", () => {
    const serializado = JSON.stringify(robots());
    expect(serializado).not.toContain("/editar");
    expect(serializado).not.toContain("token");
  });

  // Scenario: el sitemap se anuncia con URL absoluta
  it("anuncia el sitemap con URL absoluta", () => {
    expect(robots().sitemap).toBe(`${URL_SITIO}/sitemap.xml`);
  });

  it("sin URL pública en producción, omite la línea del sitemap en vez de apuntar a localhost", () => {
    delete process.env[VARIABLE_URL_SITIO];
    const anterior = process.env.NODE_ENV;
    vi.stubEnv("NODE_ENV", "production");
    try {
      const salida = robots();
      expect(salida.sitemap).toBeUndefined();
      expect(JSON.stringify(salida)).not.toContain("localhost");
    } finally {
      vi.stubEnv("NODE_ENV", anterior ?? "test");
      vi.unstubAllEnvs();
      process.env[VARIABLE_URL_SITIO] = URL_SITIO;
    }
  });
});

describe("layout-base · sitemap.xml (tasks #20)", () => {
  // Scenario: el sitemap trae lo publicado
  it("trae la home, el registro, las 8 categorías, los giros y pares con contenido y las fichas", async () => {
    const urls = (await sitemap()).map((entrada) => entrada.url);

    expect(urls).toContain(URL_SITIO);
    expect(urls).toContain(`${URL_SITIO}/registro`);
    for (const slug of [
      "restaurantes-y-fondas",
      "servicios-del-hogar",
      "belleza",
      "salud",
      "abarrotes-y-comercio",
      "talleres",
      "clubes-y-escuelas-deportivas",
      "otro",
    ]) {
      expect(urls, slug).toContain(`${URL_SITIO}/${slug}`);
    }

    expect(urls).toContain(`${URL_SITIO}/plomeria`);
    expect(urls).toContain(`${URL_SITIO}/futbol`);
    expect(urls).toContain(`${URL_SITIO}/plomeria-huicalco`);
    expect(urls).toContain(`${URL_SITIO}/futbol-nuevo-tizayuca`);
    expect(urls).toContain(
      `${URL_SITIO}/negocio/${construirSegmentoFicha("Plomería Hermanos Rosales (ficticio)", idPorWhatsapp["7719995001"])}`,
    );

    // Sin URLs repetidas
    expect(new Set(urls).size).toBe(urls.length);
  });

  // Scenario: nada de lo que no está publicado
  it("no trae negocios sin publicar ni combinaciones que solo ellos ocupan", async () => {
    const entradas = await sitemap();
    const serializado = JSON.stringify(entradas);
    expect(serializado).not.toContain(idPorWhatsapp["7719995011"]); // en revisión
    expect(serializado).not.toContain(idPorWhatsapp["7719995012"]); // rechazado
    expect(serializado).not.toContain(idPorWhatsapp["7719995021"]); // plomería en revisión
    expect(serializado).not.toContain("7719995");
  });

  // Scenario: sin páginas privadas ni de búsqueda + combinaciones vacías
  it("no trae /admin, /buscar, /registro/gracias ni giros o pares sin negocios", async () => {
    const urls = (await sitemap()).map((entrada) => entrada.url);
    for (const fuera of [
      `${URL_SITIO}/admin`,
      `${URL_SITIO}/buscar`,
      `${URL_SITIO}/registro/gracias`,
      `${URL_SITIO}/box`,
      `${URL_SITIO}/box-huicalco`,
      `${URL_SITIO}/plomeria-nacozari`,
    ]) {
      expect(urls, fuera).not.toContain(fuera);
    }
    expect(urls.some((url) => url.includes("?"))).toBe(false);
  });

  // Scenario: fecha de la ficha
  it("la ficha declara como última modificación su fecha de publicación", async () => {
    const segmento = construirSegmentoFicha(
      "Plomería Hermanos Rosales (ficticio)",
      idPorWhatsapp["7719995001"],
    );
    const entrada = (await sitemap()).find(
      (e) => e.url === `${URL_SITIO}/negocio/${segmento}`,
    );
    expect(new Date(entrada!.lastModified as Date).toISOString()).toBe(
      "2026-08-01T10:00:00.000Z",
    );
  });

  // Scenario: se actualiza sin que nadie lo toque
  it("publicar un negocio nuevo con un giro sin páginas lo suma sin editar nada", async () => {
    const antes = (await sitemap()).map((e) => e.url);
    expect(antes).not.toContain(`${URL_SITIO}/dentista`);

    const categoria = await prisma.categoria.findUniqueOrThrow({
      where: { slug: "salud" },
    });
    const colonia = await prisma.colonia.findUniqueOrThrow({
      where: { slug: "atempa" },
    });
    const nuevo = await prisma.negocio.create({
      data: {
        nombre: "Dentista Sonrisa Inventada",
        categoriaId: categoria.id,
        coloniaId: colonia.id,
        whatsapp: "7719995040",
        estado: "publicado",
        origen: "siembra",
        publicadoEn: new Date("2026-08-25T10:00:00.000Z"),
        consintioAvisoEn: new Date("2026-07-31T10:00:00.000Z"),
        giros: { connect: [{ slug: "dentista" }] },
      },
    });

    const despues = (await sitemap()).map((e) => e.url);
    expect(despues).toContain(`${URL_SITIO}/dentista`);
    expect(despues).toContain(`${URL_SITIO}/dentista-atempa`);
    expect(despues).toContain(
      `${URL_SITIO}/negocio/${construirSegmentoFicha(nuevo.nombre, nuevo.id)}`,
    );
  });

  it("en producción sin URL pública responde un documento vacío, nunca localhost", async () => {
    delete process.env[VARIABLE_URL_SITIO];
    vi.stubEnv("NODE_ENV", "production");
    reiniciarAvisoDeUrlSitio();
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await sitemap()).toEqual([]);
      expect(aviso).toHaveBeenCalledTimes(1);
      expect(String(aviso.mock.calls[0][0])).toContain(VARIABLE_URL_SITIO);
      // Y no vuelve a avisar: una vez por proceso, nunca por petición.
      await sitemap();
      expect(aviso).toHaveBeenCalledTimes(1);
    } finally {
      aviso.mockRestore();
      vi.unstubAllEnvs();
      reiniciarAvisoDeUrlSitio();
      process.env[VARIABLE_URL_SITIO] = URL_SITIO;
    }
  });
});

describe("layout-base · imagen de marca para compartir (tasks #17)", () => {
  // Scenario "la ficha compartida por WhatsApp llega con la marca nueva"
  // (rebrand T-019): la vista previa es la superficie que más lejos viaja.
  it("declara tamaño, tipo y texto alternativo en español", () => {
    expect(tamanoImagenDeMarca).toEqual({ width: 1200, height: 630 });
    expect(tipoImagenDeMarca).toBe("image/png");
    expect(altImagenDeMarca).toBe(
      "EnMiRumbo: encuentra negocios y servicios de Tizayuca y contáctalos por WhatsApp",
    );
    expect(altImagenDeMarca).not.toMatch(/necesitouno/i);
    expect(altImagenDeMarca).not.toMatch(/EnMiRumbo\s+Tizayuca/i);
  });

  it("no mete hexadecimales sueltos en un componente: usa los tokens de la marca", () => {
    const fuente = readFileSync(join(raiz, "src/app/opengraph-image.tsx"), "utf8");
    expect(fuente).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(fuente).toContain("COLORES_MARCA");
  });

  it("los colores de la marca son exactamente los tokens de globals.css", () => {
    const css = readFileSync(join(raiz, "src/app/globals.css"), "utf8");
    const tokens = Object.fromEntries(
      [...css.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [
        m[1],
        m[2].toLowerCase(),
      ]),
    );
    for (const [nombre, valor] of Object.entries(COLORES_MARCA)) {
      expect(tokens[nombre], nombre).toBe(valor.toLowerCase());
    }
  });
});
