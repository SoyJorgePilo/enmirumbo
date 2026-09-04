import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { PrismaClient } from "../src/generated/prisma/client";
import { crearClientePrueba } from "./db";

// Spec: modelo-datos (MODIFIED por agregar-panel-admin) · Requirement "Estado
// de revisión, origen y timestamps del ciclo de vida": los campos
// `rechazadoEn` y `motivoRechazo` y su limpieza al volver a revisión.
//
// Lo que ANTES probaba este archivo replicando migraciones a mano —que los
// dos campos nacen nulos en las filas que ya existían— vive ahora en
// `tests/modelo-migraciones.test.ts`, contra el árbol consolidado en
// PostgreSQL (change `preparar-deploy-produccion`, design.md §4).
//
// Datos 100% ficticios (repo público + LFPDPPP): números 771000 9xxx.

describe("modelo-datos · rastro del rechazo en el cliente Prisma", () => {
  let prisma: PrismaClient;
  let categoriaId: number;

  beforeAll(async () => {
    prisma = crearClientePrueba();
    await seedCatalogos(prisma);
    categoriaId = (
      await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })
    ).id;
    await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: "7710009" } } });
  });

  afterAll(async () => {
    await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: "7710009" } } });
    await prisma.$disconnect();
  });

  const alta = (whatsapp: string) =>
    prisma.negocio.create({
      data: {
        nombre: "Negocio Ficticio de Prueba",
        categoriaId,
        whatsapp,
        consintioAvisoEn: new Date(),
      },
    });

  // Scenario: negocio recién creado
  it("un negocio recién creado trae rechazadoEn y motivoRechazo nulos", async () => {
    const creado = await alta("7710009101");
    expect(creado.rechazadoEn).toBeNull();
    expect(creado.motivoRechazo).toBeNull();
  });

  // Scenario: rechazo con fecha y motivo
  it("guarda fecha y motivo del rechazo, y el negocio sigue existiendo", async () => {
    const creado = await alta("7710009102");
    const cuando = new Date("2026-09-01T12:00:00.000Z");
    await prisma.negocio.update({
      where: { id: creado.id },
      data: {
        estado: "rechazado",
        rechazadoEn: cuando,
        motivoRechazo: "El número no contesta y no pudimos confirmar que el negocio exista",
      },
    });

    const leido = await prisma.negocio.findUniqueOrThrow({ where: { id: creado.id } });
    expect(leido.estado).toBe("rechazado");
    expect(leido.rechazadoEn?.toISOString()).toBe(cuando.toISOString());
    expect(leido.motivoRechazo).toBe(
      "El número no contesta y no pudimos confirmar que el negocio exista",
    );
  });

  // Scenario: el rastro del rechazo se limpia al volver a revisión
  it("al volver a en_revision los dos campos quedan nulos otra vez", async () => {
    const creado = await alta("7710009103");
    await prisma.negocio.update({
      where: { id: creado.id },
      data: {
        estado: "rechazado",
        rechazadoEn: new Date(),
        motivoRechazo: "Motivo ficticio",
      },
    });

    await prisma.negocio.update({
      where: { id: creado.id },
      data: { estado: "en_revision", rechazadoEn: null, motivoRechazo: null },
    });

    const leido = await prisma.negocio.findUniqueOrThrow({ where: { id: creado.id } });
    expect(leido.estado).toBe("en_revision");
    expect(leido.rechazadoEn).toBeNull();
    expect(leido.motivoRechazo).toBeNull();
  });
});
