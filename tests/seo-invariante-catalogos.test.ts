import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import type { PrismaClient } from "../src/generated/prisma/client";
import type { CatalogosDeLaRaiz } from "../src/lib/seo/rutas";
import { problemasDeAmbiguedadDeCatalogos } from "../src/lib/seo/invariante-catalogos";
import { crearClientePrueba } from "./db";

// Spec: modelo-datos · requirement "Los slugs de los tres catálogos no
// producen URLs ambiguas en la raíz" (tasks.md #4, design.md §2).

let prisma: PrismaClient;
let sembrados: CatalogosDeLaRaiz;

beforeAll(async () => {
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  const [categorias, giros, colonias] = await Promise.all([
    prisma.categoria.findMany({ select: { nombre: true, slug: true } }),
    prisma.giro.findMany({ select: { nombre: true, slug: true } }),
    prisma.colonia.findMany({ select: { nombre: true, slug: true } }),
  ]);
  sembrados = { categorias, giros, colonias };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("modelo-datos · los catálogos no producen URLs ambiguas (tasks #4)", () => {
  // Scenario: los catálogos de hoy son inequívocos
  it("los 8 + 49 + 21 slugs sembrados pasan la verificación", () => {
    expect(sembrados.categorias).toHaveLength(8);
    expect(sembrados.giros).toHaveLength(49);
    expect(sembrados.colonias).toHaveLength(21);
    expect(problemasDeAmbiguedadDeCatalogos(sembrados)).toEqual([]);
  });

  // Scenario: un giro que se llama como una categoría
  it("un giro con el slug de una categoría falla y nombra el slug", () => {
    const problemas = problemasDeAmbiguedadDeCatalogos({
      ...sembrados,
      giros: [...sembrados.giros, { nombre: "Talleres", slug: "talleres" }],
    });
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toContain("talleres");
  });

  it("una colonia con el slug de una categoría también falla", () => {
    const problemas = problemasDeAmbiguedadDeCatalogos({
      ...sembrados,
      colonias: [...sembrados.colonias, { nombre: "Salud", slug: "salud" }],
    });
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toContain("salud");
  });

  // Scenario: un giro que taparía una ruta propia
  it.each([
    ["giros", "buscar"],
    ["colonias", "registro"],
    ["categorias", "admin"],
  ] as const)("un slug de %s que es segmento reservado (%s) falla", (catalogo, slug) => {
    const problemas = problemasDeAmbiguedadDeCatalogos({
      ...sembrados,
      [catalogo]: [...sembrados[catalogo], { nombre: "Inventado", slug }],
    });
    expect(problemas.length).toBeGreaterThanOrEqual(1);
    expect(problemas.join(" ")).toContain(slug);
  });

  // Scenario: un compuesto con dos lecturas
  it("un compuesto con dos lecturas falla y nombra las dos", () => {
    const problemas = problemasDeAmbiguedadDeCatalogos({
      categorias: [],
      giros: [
        { nombre: "Uno", slug: "a" },
        { nombre: "Dos", slug: "a-b" },
      ],
      colonias: [
        { nombre: "Tres", slug: "b-c" },
        { nombre: "Cuatro", slug: "c" },
      ],
    });
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toContain("a-b-c");
    expect(problemas[0]).toContain("a + b-c");
    expect(problemas[0]).toContain("a-b + c");
  });

  // Requirement: "ningún slug compuesto «giro»-«colonia» coincide con un slug
  // de categoría ni con un slug de giro"
  it("un compuesto que tapa una categoría o un giro falla", () => {
    const contraCategoria = problemasDeAmbiguedadDeCatalogos({
      categorias: [{ nombre: "Ropa usada", slug: "ropa-usada" }],
      giros: [{ nombre: "Ropa", slug: "ropa" }],
      colonias: [{ nombre: "Usada", slug: "usada" }],
    });
    expect(contraCategoria).toHaveLength(1);
    expect(contraCategoria[0]).toContain("ropa-usada");

    const contraGiro = problemasDeAmbiguedadDeCatalogos({
      categorias: [],
      giros: [
        { nombre: "Ropa", slug: "ropa" },
        { nombre: "Ropa usada", slug: "ropa-usada" },
      ],
      colonias: [{ nombre: "Usada", slug: "usada" }],
    });
    expect(contraGiro).toHaveLength(1);
    expect(contraGiro[0]).toContain("ropa-usada");
  });

  it("un slug que no tiene la forma de un slug de catálogo también se señala", () => {
    const problemas = problemasDeAmbiguedadDeCatalogos({
      ...sembrados,
      giros: [...sembrados.giros, { nombre: "Con Mayúsculas", slug: "Con_Raro" }],
    });
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toContain("Con_Raro");
  });
});
