import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { sembrarNegociosDemo } from "../prisma/seed-demo";
import DestinoPage from "../src/app/[destino]/page";
import FichaNegocioPage from "../src/app/negocio/[ficha]/page";
import type { PrismaClient } from "../src/generated/prisma/client";
import { construirSegmentoFicha } from "../src/lib/ficha-url";
import { crearClientePrueba } from "./db";
import { sembrarNegociosSeo } from "./seo-fixtures";

// Spec: directorio-publico · requirements "Listado por categoría en URL limpia
// con el slug del catálogo" (MODIFIED), "Página indexable por giro en la
// raíz…", "Página indexable por giro y colonia", "Las páginas de giro sin
// negocios publicados no se indexan ni se enlazan, pero tampoco son 404" y
// "Desde la ficha se llega a las páginas de sus giros" (tasks.md #7 a #12).

const raiz = join(__dirname, "..");
const normalizado = (html: string) => html.replace(/\s+/g, " ");

let prisma: PrismaClient;
let idPorWhatsapp: Record<string, string> = {};

async function renderDestino(destino: string, colonia?: string): Promise<string> {
  const elemento = await DestinoPage({
    params: Promise.resolve({ destino }),
    searchParams: Promise.resolve(colonia === undefined ? {} : { colonia }),
  });
  return renderToStaticMarkup(createElement(() => elemento));
}

async function renderFicha(whatsapp: string, nombre: string): Promise<string> {
  const elemento = await FichaNegocioPage({
    params: Promise.resolve({
      ficha: construirSegmentoFicha(nombre, idPorWhatsapp[whatsapp]),
    }),
    searchParams: Promise.resolve({}),
  });
  return renderToStaticMarkup(createElement(() => elemento));
}

/** Digest del 404 de Next (`NEXT_HTTP_ERROR_FALLBACK;404`) o `null`. */
async function digestDe(promesa: Promise<unknown>): Promise<string | null> {
  try {
    await promesa;
    return null;
  } catch (error) {
    const digest = (error as { digest?: unknown }).digest;
    return typeof digest === "string" ? digest : null;
  }
}

const nombresDeTarjeta = (html: string) =>
  [...html.matchAll(/<h3[^>]*><a[^>]*>([^<]+)<\/a>/g)].map((m) => m[1]);

beforeAll(async () => {
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
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: "7719995" } } });
  await prisma.$disconnect();
});

describe("directorio-publico · el renombrado de la ruta no rompe ninguna URL (tasks #7)", () => {
  // Scenario: las URLs de categoría publicadas siguen siendo las mismas
  it.each([
    ["restaurantes-y-fondas", "Restaurantes y fondas en Tizayuca"],
    ["servicios-del-hogar", "Servicios del hogar en Tizayuca"],
    ["belleza", "Belleza en Tizayuca"],
    ["salud", "Salud en Tizayuca"],
    ["abarrotes-y-comercio", "Abarrotes y comercio en Tizayuca"],
    ["talleres", "Talleres en Tizayuca"],
    ["clubes-y-escuelas-deportivas", "Clubes y escuelas deportivas en Tizayuca"],
    ["otro", "Otro en Tizayuca"],
  ])("/%s sigue respondiendo su listado con el mismo encabezado", async (slug, h1) => {
    const html = await renderDestino(slug);
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(normalizado(html)).toContain(h1);
  });

  // Scenario: la ruta dinámica no tapa las rutas propias del sitio
  it("el listado por categoría conserva su filtro por colonia con ?colonia=", async () => {
    const html = await renderDestino("servicios-del-hogar", "atempa");
    expect(nombresDeTarjeta(html)).toEqual(["Electricidad Rápida JR (ficticio)"]);
    expect(html).toContain('href="/servicios-del-hogar?colonia=huicalco"');
  });

  // Scenario: categoría sin negocios publicados todavía
  it("la categoría vacía conserva su literal y su invitación", async () => {
    const html = await renderDestino("otro");
    expect(normalizado(html)).toContain(
      "Todavía no hay negocios publicados en esta categoría.",
    );
    expect(html).toContain('href="/registro"');
  });
});

describe("directorio-publico · página de giro (tasks #8 y #9)", () => {
  let htmlPlomeria = "";

  beforeAll(async () => {
    htmlPlomeria = await renderDestino("plomeria");
  });

  // Scenario: página de un giro con negocios + el giro manda, no la categoría
  it("encabeza con la frase del giro y lista los publicados de cualquier categoría", () => {
    expect(htmlPlomeria.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(normalizado(htmlPlomeria)).toContain("Plomería en Tizayuca");
    expect(nombresDeTarjeta(htmlPlomeria)).toEqual([
      "Destapes El Chorrito Ficticio", // categoría Talleres
      "Plomería de Haciendas (ficticia)",
      "Plomería Hermanos Rosales (ficticio)", // categoría Servicios del hogar
    ]);
  });

  it("usa la misma tarjeta del listado, con su botón de WhatsApp", () => {
    expect(htmlPlomeria.match(/<article[\s>]/g)).toHaveLength(3);
    expect(htmlPlomeria).toContain("https://wa.me/527719995001?text=");
    expect(htmlPlomeria).toContain(
      'aria-label="Enviar WhatsApp a Plomería Hermanos Rosales (ficticio)"',
    );
    expect(htmlPlomeria).toContain(
      `href="/negocio/${construirSegmentoFicha("Plomería Hermanos Rosales (ficticio)", idPorWhatsapp["7719995001"])}"`,
    );
  });

  // Scenario: el giro deportivo aterriza la búsqueda que pide el PRD §6.5
  it("el giro deportivo usa su frase curada, no el nombre del catálogo", async () => {
    const html = await renderDestino("futbol");
    expect(normalizado(html)).toContain("Clases de futbol en Tizayuca");
    expect(normalizado(html)).not.toContain("Futbol en Tizayuca<");
    expect(nombresDeTarjeta(html)).toEqual(["Academia de Futbol Halcones (ficticia)"]);
  });

  // Scenario: un negocio sin ese giro no aparece
  it("no aparece un negocio que trae la palabra pero no el giro", async () => {
    const html = await renderDestino("electricidad");
    expect(html).not.toContain("Electricidad Rápida JR (ficticio)");
  });

  // Scenario: solo lo publicado, también aquí
  it("ningún dato de un negocio en revisión con giros está en la respuesta", () => {
    expect(htmlPlomeria).not.toContain("Plomería Fantasma en Revisión (ficticia)");
    expect(htmlPlomeria).not.toContain("7719995021");
    expect(htmlPlomeria).not.toContain(idPorWhatsapp["7719995021"]);
  });

  // Scenario: la navegación por colonia lleva a URLs propias
  it("ofrece 'Todas las colonias' y solo colonias con negocios de ese giro", () => {
    expect(htmlPlomeria).toContain("Todas las colonias");
    expect(htmlPlomeria).toContain('href="/plomeria-huicalco"');
    expect(htmlPlomeria).toContain('href="/plomeria-atempa"');
    expect(htmlPlomeria).toContain('href="/plomeria-haciendas-de-tizayuca"');
    expect(htmlPlomeria).not.toContain("nacozari");
    // URLs propias, no parámetros de consulta
    expect(htmlPlomeria).not.toContain("?colonia=");
    // Sin JS: son enlaces, no un <select>
    expect(htmlPlomeria).not.toMatch(/<select|onchange/i);
  });
});

describe("directorio-publico · página de giro y colonia (tasks #10)", () => {
  // Scenario: página de giro y colonia con negocios + el filtro es real
  it("encabeza con giro, colonia y Tizayuca, y solo lista esa colonia", async () => {
    const html = await renderDestino("plomeria-huicalco");
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(normalizado(html)).toContain("Plomería en Huicalco, Tizayuca");
    expect(nombresDeTarjeta(html)).toEqual(["Plomería Hermanos Rosales (ficticio)"]);
    expect(html).not.toContain("Destapes El Chorrito Ficticio");
  });

  // Scenario: la colonia que ya dice Tizayuca no lo repite
  it("la colonia que ya dice Tizayuca no lo repite", async () => {
    const html = await renderDestino("plomeria-haciendas-de-tizayuca");
    expect(normalizado(html)).toContain("Plomería en Haciendas de Tizayuca");
    expect(normalizado(html)).not.toContain("Haciendas de Tizayuca, Tizayuca");
    expect(nombresDeTarjeta(html)).toEqual(["Plomería de Haciendas (ficticia)"]);
  });

  // Scenario: volver al giro completo
  it("marca la colonia activa y 'Todas las colonias' vuelve al giro", async () => {
    const html = await renderDestino("plomeria-huicalco");
    const enlaces = [...html.matchAll(/<a [^>]*>/g)].map((m) => m[0]);
    const activa = enlaces.find((a) => a.includes('href="/plomeria-huicalco"'));
    const otra = enlaces.find((a) => a.includes('href="/plomeria-atempa"'));
    const todas = enlaces.find((a) => a.includes('href="/plomeria"'));
    expect(activa).toContain('aria-current="true"');
    expect(otra).not.toContain("aria-current");
    expect(todas).toBeDefined();
    expect(todas).not.toContain("aria-current");
  });

  // Scenario: compuesto que no existe + slug que no está en ningún catálogo
  it.each([
    "plomeros-baratos",
    "plomeria-colonia-inventada",
    "loquesea-huicalco",
    "plomeria-huicalco-otra-cosa",
  ])("%s responde 404", async (slug) => {
    expect(await digestDe(renderDestino(slug))).toBe("NEXT_HTTP_ERROR_FALLBACK;404");
  });
});

describe("directorio-publico · lo vacío responde 200 con estado útil (tasks #11)", () => {
  // Scenario: giro del catálogo que todavía no tiene negocios
  it("un giro sin negocios no es 404: encabeza igual e invita a registrarse", async () => {
    const html = await renderDestino("box");
    expect(normalizado(html)).toContain("Clases de box en Tizayuca");
    expect(normalizado(html)).toContain(
      "Todavía no hay negocios publicados de esto en Tizayuca.",
    );
    expect(normalizado(html)).toContain("Registra tu negocio gratis");
    expect(html).toContain('href="/registro"');
    expect(html).not.toMatch(/<article[\s>]/);
  });

  // Scenario: combinación de giro y colonia sin negocios
  it("una combinación sin negocios ofrece volver al giro completo", async () => {
    const html = await renderDestino("box-huicalco");
    expect(normalizado(html)).toContain("Clases de box en Huicalco, Tizayuca");
    expect(normalizado(html)).toContain(
      "Todavía no hay negocios publicados de esto en esta colonia.",
    );
    expect(normalizado(html)).toContain("Ver todas las colonias");
    expect(html).toContain('href="/box"');
    expect(html).not.toMatch(/<article[\s>]/);
  });

  // Scenario: lo vacío tampoco se enlaza
  it("una página de giro no enlaza colonias sin negocios publicados", async () => {
    const html = await renderDestino("natacion");
    expect(html).toContain('href="/natacion-fuentes-de-tizayuca"');
    const enlacesDeGiro = [...html.matchAll(/href="\/natacion[^"]*"/g)].map((m) => m[0]);
    expect(enlacesDeGiro.sort()).toEqual([
      'href="/natacion"',
      'href="/natacion-fuentes-de-tizayuca"',
    ]);
  });
});

describe("directorio-publico · la ficha enlaza sus giros (tasks #12)", () => {
  // Scenario: ficha con giros asignados
  it("muestra el giro asignado como enlace a su página", async () => {
    const html = await renderFicha("7719995001", "Plomería Hermanos Rosales (ficticio)");
    expect(html).toContain('href="/plomeria"');
    expect(normalizado(html)).toContain(">Plomería</a>");
  });

  it("presenta el giro con su frase curada", async () => {
    const html = await renderFicha("7719995004", "Fonda Doña Cuquita (ficticia)");
    expect(html).toContain('href="/fonda-comida-corrida"');
    expect(normalizado(html)).toContain("Fondas y comida corrida");
  });

  // Scenario: ficha sin giros
  it("un negocio sin giros no deja ninguna sección vacía", async () => {
    const html = await renderFicha("7719995002", "Electricidad Rápida JR (ficticio)");
    expect(html).not.toContain("Lo que hace");
    expect(html).not.toMatch(/<nav[\s>]/);
    expect(html).not.toContain("<ul></ul>");
  });

  // Scenario: los enlaces de giro nunca llevan a una página vacía
  it("el giro que enlaza la ficha tiene al menos a ese negocio publicado", async () => {
    const html = await renderDestino("plomeria");
    expect(html).toContain("Plomería Hermanos Rosales (ficticio)");
  });
});

describe("directorio-publico · Server Components sin JS de cliente (tasks #9 a #12)", () => {
  // Scenario: sin JS de cliente nuevo
  it('ningún archivo nuevo del directorio declara "use client"', () => {
    const archivos = [
      join(raiz, "src/app/[destino]/page.tsx"),
      join(raiz, "src/app/negocio/[ficha]/page.tsx"),
      ...readdirSync(join(raiz, "src/components/directorio")).map((nombre) =>
        join(raiz, "src/components/directorio", nombre),
      ),
      ...readdirSync(join(raiz, "src/lib/seo")).map((nombre) =>
        join(raiz, "src/lib/seo", nombre),
      ),
    ];
    for (const ruta of archivos) {
      expect(readFileSync(ruta, "utf8"), ruta).not.toMatch(/["']use client["']/);
    }
  });

  // Scenario: celular a 390px (lo automatizable: área táctil reservada)
  it("lo tocable de las páginas nuevas reserva al menos 44px", () => {
    const navegacion = readFileSync(
      join(raiz, "src/components/directorio/navegacion-colonias.tsx"),
      "utf8",
    );
    const giro = readFileSync(
      join(raiz, "src/components/directorio/listado-giro.tsx"),
      "utf8",
    );
    const ficha = readFileSync(join(raiz, "src/app/negocio/[ficha]/page.tsx"), "utf8");
    expect(navegacion).toMatch(/\bmin-h-11\b/);
    expect(giro).toMatch(/\bmin-h-11\b|CLASE_BOTON_PRIMARIO/);
    expect(ficha).toMatch(/\bmin-h-11\b/);
  });
});
