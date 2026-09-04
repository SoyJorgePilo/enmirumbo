import { readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { PrismaClient } from "../src/generated/prisma/client";
import { VERSION_AVISO } from "../src/lib/legales/version";
import { crearClientePrueba } from "./db";

// Spec: modelo-datos (change `versionar-aviso-privacidad`) · Requirement "La
// constancia del consentimiento guarda contra qué versión del aviso se dio":
// las tres columnas nuevas, su migración sobre una base con datos y la regla
// de que versión y timestamp viajan juntos (tasks.md #11 y #12).
//
// Mismo molde que `tests/modelo-rechazo.test.ts`, que es el otro caso de
// "columnas nuevas sobre una base que ya tiene filas".
//
// Datos 100% ficticios (repo público + LFPDPPP): números 771000 8xxx.

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const carpetaMigraciones = path.join(raiz, "prisma/migrations");

/** Carpetas de migración en el orden en que Prisma las aplica (por nombre). */
function migracionesEnOrden(): string[] {
  return readdirSync(carpetaMigraciones, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory())
    .map((entrada) => entrada.name)
    .sort();
}

/** Cada sentencia de un archivo de migración, sin comentarios ni vacíos. */
function sentencias(migracion: string): string[] {
  return readFileSync(path.join(carpetaMigraciones, migracion, "migration.sql"), "utf8")
    .split("\n")
    .filter((linea) => !linea.trimStart().startsWith("--"))
    .join("\n")
    .split(";")
    .map((sentencia) => sentencia.trim())
    .filter((sentencia) => sentencia !== "");
}

const COLUMNAS_NUEVAS = [
  "consintioAvisoVersion",
  "reconsintioAvisoEn",
  "reconsintioAvisoVersion",
] as const;

/** La migración de este change, buscada por nombre y no por posición. */
function migracionDeLaVersion(): string {
  const encontrada = migracionesEnOrden().find((nombre) =>
    nombre.includes("version_del_aviso"),
  );
  expect(encontrada, "falta la migración de la versión del aviso").toBeDefined();
  return encontrada!;
}

describe("modelo-datos · migración de la versión del consentimiento", () => {
  // Scenario: fichas anteriores al versionado
  it("se aplica sobre una base con negocios en los tres estados y las deja nulas", async () => {
    const archivo = path.join(raiz, "prisma/test-migracion-version-aviso.db");
    rmSync(archivo, { force: true });
    const db = new PrismaClient({
      adapter: new PrismaBetterSqlite3({
        url: "file:./prisma/test-migracion-version-aviso.db",
      }),
    });
    const ejecutar = (instruccion: string) => db.$executeRawUnsafe(instruccion);

    try {
      const laNueva = migracionDeLaVersion();
      const anteriores = migracionesEnOrden().filter((nombre) => nombre !== laNueva);
      expect(anteriores.length).toBeGreaterThanOrEqual(1);

      // Base "vieja": todo lo anterior a este change, con datos ya dentro.
      for (const migracion of anteriores) {
        for (const instruccion of sentencias(migracion)) await ejecutar(instruccion);
      }
      await ejecutar(
        `INSERT INTO "Categoria" ("nombre", "slug") VALUES ('Talleres', 'talleres')`,
      );
      for (const [id, nombre, whatsapp, estado] of [
        ["viejo-publicado", "Taller Ficticio Uno", "7710008001", "publicado"],
        ["viejo-revision", "Taller Ficticio Dos", "7710008002", "en_revision"],
        ["viejo-rechazado", "Taller Ficticio Tres", "7710008003", "rechazado"],
      ]) {
        await ejecutar(
          `INSERT INTO "Negocio" ("id","nombre","categoriaId","whatsapp","consintioAvisoEn","estado","registradoEn")
           VALUES ('${id}','${nombre}',1,'${whatsapp}','2026-08-01 10:00:00','${estado}','2026-08-01 10:00:00')`,
        );
      }

      // Y ahora la migración de este change, sobre esa base con datos.
      for (const instruccion of sentencias(laNueva)) await ejecutar(instruccion);

      const filas = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT "id","nombre","whatsapp","estado","consintioAvisoEn","consintioAvisoVersion","reconsintioAvisoEn","reconsintioAvisoVersion" FROM "Negocio" ORDER BY "id"`,
      );

      // Todas las filas siguen ahí, con sus datos intactos.
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
      for (const fila of filas) {
        expect(fila.consintioAvisoEn).not.toBeNull();
        // Nada de versión de relleno: nulo significa "no consta".
        for (const columna of COLUMNAS_NUEVAS) {
          expect(fila[columna], `${fila.id} · ${columna}`).toBeNull();
        }
      }
    } finally {
      await db.$disconnect();
      rmSync(archivo, { force: true });
      rmSync(`${archivo}-journal`, { force: true });
    }
  });

  it("las tres columnas son nulables y ninguna trae valor por defecto", () => {
    const sql = readFileSync(
      path.join(carpetaMigraciones, migracionDeLaVersion(), "migration.sql"),
      "utf8",
    );
    for (const columna of COLUMNAS_NUEVAS) {
      const linea = sql.split("\n").find((l) => l.includes(`"${columna}"`));
      expect(linea, columna).toBeDefined();
      expect(linea, columna).not.toMatch(/NOT NULL|DEFAULT/i);
    }
  });
});

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
