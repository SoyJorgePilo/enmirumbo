import { readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { PrismaClient } from "../src/generated/prisma/client";
import { crearClientePrueba } from "./db";

// Spec: modelo-datos (MODIFIED por agregar-panel-admin) · Requirement "Estado
// de revisión, origen y timestamps del ciclo de vida": los campos nuevos
// `rechazadoEn` y `motivoRechazo`, su migración sobre una base con datos y su
// limpieza al volver a revisión.
//
// Datos 100% ficticios (repo público + LFPDPPP): números 771000 9xxx.

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const carpetaMigraciones = path.join(raiz, "prisma/migrations");

/** Carpetas de migración en el orden en que Prisma las aplica (por nombre). */
function migracionesEnOrden(): string[] {
  return readdirSync(carpetaMigraciones, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory())
    .map((entrada) => entrada.name)
    .sort();
}

function sql(migracion: string): string {
  return readFileSync(path.join(carpetaMigraciones, migracion, "migration.sql"), "utf8");
}

/** Cada sentencia de un archivo de migración, sin comentarios ni vacíos. */
function sentencias(migracion: string): string[] {
  return sql(migracion)
    .split(";")
    .map((sentencia) =>
      sentencia
        .split("\n")
        .filter((linea) => !linea.trimStart().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter((sentencia) => sentencia !== "");
}

describe("modelo-datos · migración de rechazadoEn y motivoRechazo", () => {
  // Scenario: migración sobre una base con datos
  it("se aplica sobre una base con negocios en los tres estados sin perder filas", async () => {
    const archivo = path.join(raiz, "prisma/test-migracion-rechazo.db");
    rmSync(archivo, { force: true });
    const db = new PrismaClient({
      adapter: new PrismaBetterSqlite3({ url: "file:./prisma/test-migracion-rechazo.db" }),
    });
    const ejecutar = (instruccion: string) => db.$executeRawUnsafe(instruccion);

    try {
      const [inicial, ...posteriores] = migracionesEnOrden();
      expect(posteriores.length).toBeGreaterThanOrEqual(1);

      // Base "vieja": solo la migración inicial, con datos ya dentro.
      for (const instruccion of sentencias(inicial)) await ejecutar(instruccion);
      await ejecutar(
        `INSERT INTO "Categoria" ("nombre", "slug") VALUES ('Talleres', 'talleres')`,
      );
      for (const [id, nombre, whatsapp, estado] of [
        ["viejo-publicado", "Taller Ficticio Uno", "7710009001", "publicado"],
        ["viejo-revision", "Taller Ficticio Dos", "7710009002", "en_revision"],
        ["viejo-rechazado", "Taller Ficticio Tres", "7710009003", "rechazado"],
      ]) {
        await ejecutar(
          `INSERT INTO "Negocio" ("id","nombre","categoriaId","whatsapp","consintioAvisoEn","estado","registradoEn")
           VALUES ('${id}','${nombre}',1,'${whatsapp}','2026-08-01 10:00:00','${estado}','2026-08-01 10:00:00')`,
        );
      }

      // Y ahora la migración nueva, sobre esa base que ya tiene datos.
      for (const migracion of posteriores) {
        for (const instruccion of sentencias(migracion)) await ejecutar(instruccion);
      }

      const filas = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
        'SELECT "id","nombre","whatsapp","estado","rechazadoEn","motivoRechazo" FROM "Negocio" ORDER BY "id"',
      );

      expect(filas).toHaveLength(3);
      expect(filas.map((fila) => fila.estado)).toEqual([
        "publicado",
        "rechazado",
        "en_revision",
      ]);
      expect(filas.map((fila) => fila.nombre)).toEqual([
        "Taller Ficticio Uno",
        "Taller Ficticio Tres",
        "Taller Ficticio Dos",
      ]);
      // Los dos campos nuevos quedan nulos en todas las filas que ya existían.
      for (const fila of filas) {
        expect(fila.rechazadoEn).toBeNull();
        expect(fila.motivoRechazo).toBeNull();
      }
    } finally {
      await db.$disconnect();
      rmSync(archivo, { force: true });
      rmSync(`${archivo}-journal`, { force: true });
    }
  });
});

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
