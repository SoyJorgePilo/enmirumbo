import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import type { PrismaClient } from "../src/generated/prisma/client";
import { crearClientePrueba } from "./db";

// Spec modelo-datos · Requirements "Catálogos ... con slug estable"
// y "Migración inicial y seed reproducibles"
describe("seed de catálogos", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = crearClientePrueba();
    await seedCatalogos(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Scenario: catálogos poblados por el seed / base desde cero
  it("puebla 8 categorías, 21 colonias y 49 giros, cada uno con slug", async () => {
    expect(await prisma.categoria.count()).toBe(8);
    expect(await prisma.colonia.count()).toBe(21);
    expect(await prisma.giro.count()).toBe(49);

    const sinSlug = [
      ...(await prisma.categoria.findMany({ where: { slug: "" } })),
      ...(await prisma.colonia.findMany({ where: { slug: "" } })),
      ...(await prisma.giro.findMany({ where: { slug: "" } })),
    ];
    expect(sinSlug).toHaveLength(0);
  });

  // Scenario: slug apto para URL
  it('"Plomería" y "Haciendas de Tizayuca" tienen slugs limpios', async () => {
    const plomeria = await prisma.giro.findUnique({ where: { slug: "plomeria" } });
    expect(plomeria?.nombre).toBe("Plomería");

    const haciendas = await prisma.colonia.findUnique({
      where: { slug: "haciendas-de-tizayuca" },
    });
    expect(haciendas?.nombre).toBe("Haciendas de Tizayuca");
  });

  it("todos los slugs son minúsculas sin acentos ni espacios", async () => {
    const slugs = [
      ...(await prisma.categoria.findMany()).map((c) => c.slug),
      ...(await prisma.colonia.findMany()).map((c) => c.slug),
      ...(await prisma.giro.findMany()).map((g) => g.slug),
    ];
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  // Scenarios: slugs estables entre corridas / seed idempotente
  it("volver a correr el seed no cambia slugs ni duplica entradas", async () => {
    const antes = {
      categorias: (await prisma.categoria.findMany({ orderBy: { id: "asc" } })).map(
        (c) => c.slug,
      ),
      colonias: (await prisma.colonia.findMany({ orderBy: { id: "asc" } })).map(
        (c) => c.slug,
      ),
      giros: (await prisma.giro.findMany({ orderBy: { id: "asc" } })).map((g) => g.slug),
    };

    await seedCatalogos(prisma);

    const despues = {
      categorias: (await prisma.categoria.findMany({ orderBy: { id: "asc" } })).map(
        (c) => c.slug,
      ),
      colonias: (await prisma.colonia.findMany({ orderBy: { id: "asc" } })).map(
        (c) => c.slug,
      ),
      giros: (await prisma.giro.findMany({ orderBy: { id: "asc" } })).map((g) => g.slug),
    };

    expect(despues).toEqual(antes);
    expect(despues.categorias).toHaveLength(8);
    expect(despues.colonias).toHaveLength(21);
    expect(despues.giros).toHaveLength(49);
  });
});
