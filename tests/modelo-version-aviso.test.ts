import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { PrismaClient } from "../src/generated/prisma/client";
import { VERSION_AVISO } from "../src/lib/legales/version";
import { crearClientePrueba } from "./db";

// Spec: modelo-datos (change `versionar-aviso-privacidad`) · Requirement "La
// constancia del consentimiento guarda contra qué versión del aviso se dio":
// las tres columnas nuevas y la regla de que versión y timestamp viajan
// juntos (tasks.md #11 y #12).
//
// Lo que ANTES probaba este archivo replicando migraciones a mano —que las
// tres columnas nacen nulas y sin default sobre filas que ya existían— vive
// ahora en `tests/modelo-migraciones.test.ts`, contra el árbol consolidado en
// PostgreSQL (change `preparar-deploy-produccion`, design.md §4).
//
// Datos 100% ficticios (repo público + LFPDPPP): números 771000 8xxx.

describe("modelo-datos · la constancia y la reaceptación en el cliente Prisma", () => {
  let prisma: PrismaClient;
  let categoriaId: number;

  beforeAll(async () => {
    prisma = crearClientePrueba();
    await seedCatalogos(prisma);
    categoriaId = (
      await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })
    ).id;
    await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: "7710008" } } });
  });

  afterAll(async () => {
    await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: "7710008" } } });
    await prisma.$disconnect();
  });

  const alta = (whatsapp: string, datos: Record<string, unknown> = {}) =>
    prisma.negocio.create({
      data: {
        nombre: "Negocio Ficticio de Prueba",
        categoriaId,
        whatsapp,
        consintioAvisoEn: new Date("2026-09-01T10:00:00.000Z"),
        ...datos,
      },
    });

  // Scenario: alta con su versión
  it("persiste y recupera la constancia con su versión, sin reaceptación", async () => {
    const creado = await alta("7710008101", { consintioAvisoVersion: VERSION_AVISO });

    const leido = await prisma.negocio.findUniqueOrThrow({ where: { id: creado.id } });
    expect(leido.consintioAvisoEn.toISOString()).toBe("2026-09-01T10:00:00.000Z");
    expect(leido.consintioAvisoVersion).toBe(VERSION_AVISO);
    expect(leido.reconsintioAvisoEn).toBeNull();
    expect(leido.reconsintioAvisoVersion).toBeNull();
  });

  // Scenario: reaceptación de una versión más nueva
  it("guarda la reaceptación sin tocar la constancia original", async () => {
    const creado = await alta("7710008102", { consintioAvisoVersion: "1" });
    const cuando = new Date("2026-10-05T18:30:00.000Z");

    await prisma.negocio.update({
      where: { id: creado.id },
      data: { reconsintioAvisoEn: cuando, reconsintioAvisoVersion: "2" },
    });

    const leido = await prisma.negocio.findUniqueOrThrow({ where: { id: creado.id } });
    expect(leido.consintioAvisoEn.toISOString()).toBe("2026-09-01T10:00:00.000Z");
    expect(leido.consintioAvisoVersion).toBe("1");
    expect(leido.reconsintioAvisoEn?.toISOString()).toBe(cuando.toISOString());
    expect(leido.reconsintioAvisoVersion).toBe("2");
  });

  // Scenario: fichas anteriores al versionado (a nivel de cliente Prisma)
  it("una ficha anterior al versionado se queda sin versión, no con una inventada", async () => {
    const creado = await alta("7710008103");

    const leido = await prisma.negocio.findUniqueOrThrow({ where: { id: creado.id } });
    expect(leido.consintioAvisoVersion).toBeNull();
    expect(leido.reconsintioAvisoEn).toBeNull();
    expect(leido.reconsintioAvisoVersion).toBeNull();
  });

  // Scenario: la versión no viaja sola
  it("ninguna ficha guardada tiene fecha sin versión de reaceptación (ni al revés)", async () => {
    await alta("7710008104", {
      consintioAvisoVersion: "1",
      reconsintioAvisoEn: new Date("2026-10-06T09:00:00.000Z"),
      reconsintioAvisoVersion: "2",
    });

    const todos = await prisma.negocio.findMany({
      select: {
        id: true,
        consintioAvisoEn: true,
        consintioAvisoVersion: true,
        reconsintioAvisoEn: true,
        reconsintioAvisoVersion: true,
      },
    });
    expect(todos.length).toBeGreaterThan(0);
    for (const ficha of todos) {
      expect(ficha.consintioAvisoEn, ficha.id).toBeInstanceOf(Date);
      expect(
        (ficha.reconsintioAvisoEn === null) === (ficha.reconsintioAvisoVersion === null),
        `${ficha.id}: la reaceptación tiene que viajar completa o no estar`,
      ).toBe(true);
    }
  });
});
