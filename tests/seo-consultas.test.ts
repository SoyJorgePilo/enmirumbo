import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { sembrarNegociosDemo } from "../prisma/seed-demo";
import type { PrismaClient } from "../src/generated/prisma/client";
import { crearClientePrueba } from "./db";
import { sembrarNegociosSeo } from "./seo-fixtures";

// El cliente de la aplicación apunta a la misma base de prueba, pero envuelto
// en un contador de consultas: así se puede afirmar que el sitemap se arma con
// un número FIJO y pequeño de lecturas (tasks.md #6), no una por combinación.
const consultas: string[] = [];
vi.mock("../src/lib/prisma", async () => {
  const { crearClientePrueba: crear } = await import("./db");
  const real = crear();
  const contado = new Proxy(real, {
    get(objetivo, modelo: string) {
      const valor = Reflect.get(objetivo, modelo);
      if (!valor || typeof valor !== "object" || modelo.startsWith("$")) return valor;
      return new Proxy(valor, {
        get(delegado, metodo: string) {
          const fn = Reflect.get(delegado, metodo);
          if (typeof fn !== "function") return fn;
          return (...args: unknown[]) => {
            consultas.push(`${modelo}.${metodo}`);
            return fn.apply(delegado, args);
          };
        },
      });
    },
  });
  return { obtenerPrisma: () => contado };
});

import {
  obtenerCatalogosDeLaRaiz,
  obtenerColoniasConNegociosPublicadosDeGiro,
  obtenerDatosDelSitemap,
  obtenerGirosDeNegocioPublicado,
  obtenerNegociosPublicados,
  obtenerNegociosPublicadosPorGiro,
} from "../src/lib/directorio";

// Spec: directorio-publico · requirements "Página indexable por giro en la
// raíz…", "Página indexable por giro y colonia" y "Desde la ficha se llega a
// las páginas de sus giros"; layout-base · "El sitio publica un sitemap.xml
// que se actualiza solo" (tasks.md #5 y #6).

let prisma: PrismaClient;
let idPorWhatsapp: Record<string, string> = {};

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

describe("directorio · catálogos de la raíz (tasks #5)", () => {
  it("trae los tres catálogos con nombre y slug", async () => {
    const catalogos = await obtenerCatalogosDeLaRaiz();
    expect(catalogos.categorias).toHaveLength(8);
    expect(catalogos.giros).toHaveLength(49);
    expect(catalogos.colonias).toHaveLength(21);
    expect(catalogos.giros).toContainEqual({ nombre: "Plomería", slug: "plomeria" });
  });
});

describe("directorio · negocios publicados por giro (tasks #5)", () => {
  // Scenario: página de un giro con negocios + el giro manda, no la categoría
  it("trae todos los publicados con ese giro, sin importar su categoría", async () => {
    const plomeria = await obtenerNegociosPublicadosPorGiro("plomeria");
    expect(plomeria.map((n) => n.nombre)).toEqual([
      "Destapes El Chorrito Ficticio", // talleres, el más reciente
      "Plomería de Haciendas (ficticia)",
      "Plomería Hermanos Rosales (ficticio)", // servicios del hogar
    ]);
  });

  // Scenario: un negocio sin ese giro no aparece
  it("no arrastra negocios de otros giros aunque la palabra esté en su nombre", async () => {
    const electricidad = await obtenerNegociosPublicadosPorGiro("electricidad");
    expect(electricidad).toEqual([]);
    const plomeria = await obtenerNegociosPublicadosPorGiro("plomeria");
    expect(plomeria.map((n) => n.nombre)).not.toContain(
      "Electricidad Rápida JR (ficticio)",
    );
  });

  // Scenario: el giro deportivo aterriza la búsqueda del PRD §6.5
  it("el club de futbol aparece en su giro aunque su categoría sea deporte", async () => {
    const futbol = await obtenerNegociosPublicadosPorGiro("futbol");
    expect(futbol.map((n) => n.nombre)).toEqual([
      "Academia de Futbol Halcones (ficticia)",
    ]);
  });

  // Scenario: solo lo publicado, también aquí
  it("un negocio en revisión con giros asignados nunca vuelve", async () => {
    const plomeria = await obtenerNegociosPublicadosPorGiro("plomeria");
    expect(plomeria.map((n) => n.nombre)).not.toContain(
      "Plomería Fantasma en Revisión (ficticia)",
    );
    const enHuicalco = await obtenerNegociosPublicadosPorGiro("plomeria", "huicalco");
    expect(enHuicalco.map((n) => n.nombre)).toEqual([
      "Plomería Hermanos Rosales (ficticio)",
    ]);
  });

  // Scenario: el filtro es real
  it("con colonia solo trae los de esa colonia", async () => {
    const enAtempa = await obtenerNegociosPublicadosPorGiro("plomeria", "atempa");
    expect(enAtempa.map((n) => n.nombre)).toEqual(["Destapes El Chorrito Ficticio"]);
  });

  it("un giro sin negocios devuelve lista vacía, no un error", async () => {
    expect(await obtenerNegociosPublicadosPorGiro("box")).toEqual([]);
    expect(await obtenerNegociosPublicadosPorGiro("box", "huicalco")).toEqual([]);
    expect(await obtenerNegociosPublicadosPorGiro("giro-que-no-existe")).toEqual([]);
  });

  it("devuelve los mismos campos públicos que el listado por categoría", async () => {
    const [porGiro] = await obtenerNegociosPublicadosPorGiro("plomeria", "huicalco");
    const [porCategoria] = await obtenerNegociosPublicados(
      "servicios-del-hogar",
      "huicalco",
    );
    expect(Object.keys(porGiro).sort()).toEqual(Object.keys(porCategoria).sort());
    for (const campo of ["estado", "origen", "registradoEn", "tokenGestionHash"]) {
      expect(Object.keys(porGiro), campo).not.toContain(campo);
    }
  });
});

describe("directorio · colonias con negocios de un giro (tasks #5)", () => {
  // Scenario: la navegación por colonia lleva a URLs propias
  it("solo ofrece colonias con al menos un negocio publicado de ese giro", async () => {
    const colonias = await obtenerColoniasConNegociosPublicadosDeGiro("plomeria");
    expect(colonias.map((c) => c.slug)).toEqual([
      "huicalco",
      "atempa",
      "haciendas-de-tizayuca",
    ]);
  });

  it("un giro sin negocios no ofrece ninguna colonia", async () => {
    expect(await obtenerColoniasConNegociosPublicadosDeGiro("box")).toEqual([]);
  });

  it("la colonia de un negocio en revisión no se ofrece", async () => {
    const colonias = await obtenerColoniasConNegociosPublicadosDeGiro("natacion");
    expect(colonias.map((c) => c.slug)).toEqual(["fuentes-de-tizayuca"]);
  });
});

describe("directorio · giros de un negocio publicado (tasks #5)", () => {
  // Scenario: ficha con giros asignados / ficha sin giros
  it("trae los giros del negocio publicado y nada para el que no tiene", async () => {
    expect(
      await obtenerGirosDeNegocioPublicado(idPorWhatsapp["7719995001"]),
    ).toEqual([{ nombre: "Plomería", slug: "plomeria" }]);
    expect(
      await obtenerGirosDeNegocioPublicado(idPorWhatsapp["7719995002"]),
    ).toEqual([]);
  });

  it("un negocio no publicado no entrega sus giros", async () => {
    expect(
      await obtenerGirosDeNegocioPublicado(idPorWhatsapp["7719995021"]),
    ).toEqual([]);
    expect(await obtenerGirosDeNegocioPublicado("no-existe-este-id")).toEqual([]);
  });
});

describe("directorio · datos del sitemap (tasks #6)", () => {
  it("trae las 8 categorías, los giros y pares con contenido y las fichas publicadas", async () => {
    const datos = await obtenerDatosDelSitemap();

    expect(datos.categorias.map((c) => c.slug)).toContain("servicios-del-hogar");
    expect(datos.categorias).toHaveLength(8);

    expect(datos.giros.sort()).toEqual(
      ["fonda-comida-corrida", "futbol", "natacion", "panaderia", "plomeria"].sort(),
    );

    expect(datos.pares).toContainEqual({
      giroSlug: "plomeria",
      coloniaSlug: "huicalco",
    });
    expect(datos.pares).toContainEqual({
      giroSlug: "futbol",
      coloniaSlug: "nuevo-tizayuca",
    });
    // Sin repetidos y sin combinaciones vacías
    expect(new Set(datos.pares.map((p) => `${p.giroSlug}-${p.coloniaSlug}`)).size).toBe(
      datos.pares.length,
    );
    expect(datos.pares).not.toContainEqual({
      giroSlug: "box",
      coloniaSlug: "huicalco",
    });
  });

  // Scenario: nada de lo que no está publicado
  it("un negocio en revisión o rechazado no aporta ficha ni par", async () => {
    const datos = await obtenerDatosDelSitemap();
    const idsPublicados = datos.fichas.map((f) => f.id);
    expect(idsPublicados).not.toContain(idPorWhatsapp["7719995021"]); // en revisión
    expect(idsPublicados).not.toContain(idPorWhatsapp["7719995011"]);
    expect(idsPublicados).not.toContain(idPorWhatsapp["7719995012"]); // rechazado
    // El único negocio con giro "plomeria" en Huicalco publicado es el del
    // seed; el que está en revisión ocupa la misma combinación y no la aporta.
    expect(
      datos.pares.filter(
        (p) => p.giroSlug === "plomeria" && p.coloniaSlug === "huicalco",
      ),
    ).toHaveLength(1);
  });

  // Scenario: fecha de la ficha
  it("cada ficha trae su nombre y su fecha de publicación", async () => {
    const datos = await obtenerDatosDelSitemap();
    const plomeria = datos.fichas.find(
      (f) => f.id === idPorWhatsapp["7719995001"],
    );
    expect(plomeria?.nombre).toBe("Plomería Hermanos Rosales (ficticio)");
    expect(plomeria?.publicadoEn?.toISOString()).toBe("2026-08-01T10:00:00.000Z");
  });

  it("se arma con un número fijo de consultas, no una por combinación", async () => {
    consultas.length = 0;
    await obtenerDatosDelSitemap();
    expect(consultas.length).toBeLessThanOrEqual(3);
    expect(consultas.length).toBeGreaterThan(0);
  });
});
