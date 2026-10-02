import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { sembrarNegociosDemo } from "../prisma/seed-demo";
// `robots.txt`, `sitemap.xml` y la imagen de marca ya se sirven con Astro
// (change `migrar-lectura-publica-astro`, tasks.md #15). `reglasDeRobots` y
// `entradasDelSitemap` son los mismos objetos que devolvían `src/app/robots.ts`
// y `src/app/sitemap.ts`; además se prueba lo que el endpoint responde.
import {
  ALT_IMAGEN_DE_MARCA as altImagenDeMarca,
  TAMANO_IMAGEN_DE_MARCA as tamanoImagenDeMarca,
  TIPO_IMAGEN_DE_MARCA as tipoImagenDeMarca,
} from "../src/astro/imagen-de-marca/datos";
import * as endpointRobots from "../src/pages/robots.txt";
import { reglasDeRobots as robots } from "../src/pages/robots.txt";
import * as endpointSitemap from "../src/pages/sitemap.xml";
import { entradasDelSitemap as sitemap } from "../src/pages/sitemap.xml";
import { pedirEndpoint } from "./astro-paginas";
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
    const fuente = readFileSync(join(raiz, "src/astro/imagen-de-marca/arbol.tsx"), "utf8");
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

// Spec `plataforma-astro` (change `migrar-lectura-publica-astro`), requirement
// "`robots.txt` y `sitemap.xml` responden igual que en Next": el cuerpo y el
// tipo de contenido que da la build de Next de `main` (capturados con la base
// semilla; el diff completo está en `reports/b-dev.md`).
describe("plataforma-astro · robots.txt y sitemap.xml responden igual que en Next", () => {
  it("robots igual al de hoy: mismo cuerpo, texto plano y sin caché compartida larga", async () => {
    const respuesta = await pedirEndpoint(endpointRobots, "/robots.txt");
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("content-type")).toBe("text/plain");
    expect(respuesta.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
    expect(await respuesta.text()).toBe(
      "User-Agent: *\nAllow: /\nDisallow: /admin\nDisallow: /buscar\nDisallow: /registro/gracias\n\n" +
        `Sitemap: ${URL_SITIO}/sitemap.xml\n`,
    );
  });

  it("robots sin URL pública: sin línea de sitemap ni dirección local", async () => {
    delete process.env[VARIABLE_URL_SITIO];
    vi.stubEnv("NODE_ENV", "production");
    try {
      const cuerpo = await (await pedirEndpoint(endpointRobots, "/robots.txt")).text();
      expect(cuerpo).not.toContain("Sitemap:");
      expect(cuerpo).not.toContain("localhost");
      expect(cuerpo.endsWith("Disallow: /registro/gracias\n\n")).toBe(true);
    } finally {
      vi.unstubAllEnvs();
      process.env[VARIABLE_URL_SITIO] = URL_SITIO;
    }
  });

  it("sitemap: XML con cada URL y su fecha, como lo serializaba Next", async () => {
    const respuesta = await pedirEndpoint(endpointSitemap, "/sitemap.xml");
    expect(respuesta.headers.get("content-type")).toBe("application/xml");
    expect(respuesta.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
    const xml = await respuesta.text();
    expect(xml.startsWith(
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n',
    )).toBe(true);
    expect(xml.endsWith("</urlset>\n")).toBe(true);
    const entradas = await sitemap();
    const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual(entradas.map((e) => e.url));
    const segmento = construirSegmentoFicha("Plomería Hermanos Rosales (ficticio)", idPorWhatsapp["7719995001"]);
    expect(xml).toContain(
      `<url>\n<loc>${URL_SITIO}/negocio/${segmento}</loc>\n<lastmod>2026-08-01T10:00:00.000Z</lastmod>\n</url>\n`,
    );
  });

  it("el sitemap se sigue armando por petición: un giro nuevo aparece sin reconstruir", async () => {
    const pedir = async () => (await pedirEndpoint(endpointSitemap, "/sitemap.xml")).text();
    expect(await pedir()).not.toContain(`${URL_SITIO}/veterinaria<`);
    const categoria = await prisma.categoria.findUniqueOrThrow({ where: { slug: "salud" } });
    const colonia = await prisma.colonia.findUniqueOrThrow({ where: { slug: "atempa" } });
    const giro = await prisma.giro.findFirst({ where: { slug: "veterinaria" } });
    expect(giro, "el catálogo de giros trae veterinaria").not.toBeNull();
    const nuevo = await prisma.negocio.create({
      data: {
        nombre: "Veterinaria Patitas Inventada",
        categoriaId: categoria.id,
        coloniaId: colonia.id,
        whatsapp: "7719995041",
        estado: "publicado",
        origen: "siembra",
        publicadoEn: new Date("2026-08-26T10:00:00.000Z"),
        consintioAvisoEn: new Date("2026-07-31T10:00:00.000Z"),
        giros: { connect: [{ slug: "veterinaria" }] },
      },
    });
    const despues = await pedir();
    expect(despues).toContain(`<loc>${URL_SITIO}/veterinaria</loc>`);
    expect(despues).toContain(`<loc>${URL_SITIO}/negocio/${construirSegmentoFicha(nuevo.nombre, nuevo.id)}</loc>`);
  });

  it("sitemap sin URL pública: documento XML válido sin ninguna URL", async () => {
    delete process.env[VARIABLE_URL_SITIO];
    vi.stubEnv("NODE_ENV", "production");
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const xml = await (await pedirEndpoint(endpointSitemap, "/sitemap.xml")).text();
      expect(xml).toBe(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n',
      );
    } finally {
      aviso.mockRestore();
      vi.unstubAllEnvs();
      reiniciarAvisoDeUrlSitio();
      process.env[VARIABLE_URL_SITIO] = URL_SITIO;
    }
  });
});

