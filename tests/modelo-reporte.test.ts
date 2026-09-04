import { readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { PrismaClient } from "../src/generated/prisma/client";
import { crearClientePrueba } from "./db";

// Spec: modelo-datos (delta del change `agregar-boton-reportar`) · Requirement
// "El modelo `Reporte` guarda el aviso de un vecino sobre una ficha, sin
// ningún dato de quien lo envía" y el MODIFIED del borrado ARCO (tasks.md #1).
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

function sql(migracion: string): string {
  return readFileSync(path.join(carpetaMigraciones, migracion, "migration.sql"), "utf8");
}

/** Cada sentencia de un archivo de migración, sin comentarios ni vacíos. */
function sentencias(migracion: string): string[] {
  return sql(migracion)
    .split("\n")
    .filter((linea) => !linea.trimStart().startsWith("--"))
    .join("\n")
    .split(";")
    .map((sentencia) => sentencia.trim())
    .filter((sentencia) => sentencia !== "");
}

/** La migración que estrena la tabla de reportes (la última por nombre). */
function migracionDeReportes(): string {
  const conReporte = migracionesEnOrden().filter((migracion) =>
    /CREATE TABLE\s+"Reporte"/.test(sql(migracion)),
  );
  expect(conReporte).toHaveLength(1);
  return conReporte[0];
}

describe("modelo-datos · migración de la tabla Reporte", () => {
  // Scenario: migración sobre una base con datos
  it("crea la tabla sobre una base con negocios, sin tocar ni una fila", async () => {
    const archivo = path.join(raiz, "prisma/test-migracion-reporte.db");
    rmSync(archivo, { force: true });
    const db = new PrismaClient({
      adapter: new PrismaBetterSqlite3({ url: "file:./prisma/test-migracion-reporte.db" }),
    });
    const ejecutar = (instruccion: string) => db.$executeRawUnsafe(instruccion);

    try {
      const migraciones = migracionesEnOrden();
      const nueva = migracionDeReportes();
      const anteriores = migraciones.slice(0, migraciones.indexOf(nueva));
      expect(anteriores.length).toBeGreaterThanOrEqual(3);

      // Base "vieja": todo lo anterior al change, con datos ya dentro.
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

      // Y ahora la migración de reportes, sobre esa base que ya tiene datos.
      for (const instruccion of sentencias(nueva)) await ejecutar(instruccion);

      const negocios = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
        'SELECT "id","nombre","estado" FROM "Negocio" ORDER BY "id"',
      );
      expect(negocios).toHaveLength(3);
      expect(negocios.map((fila) => fila.estado)).toEqual([
        "publicado",
        "rechazado",
        "en_revision",
      ]);

      const reportes = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
        'SELECT COUNT(*) AS total FROM "Reporte"',
      );
      expect(Number(reportes[0].total)).toBe(0);

      // Los CHECK del negocio siguen vigentes después de la migración nueva
      // (design.md §4: la redefinición de tabla de SQLite ya los borró una vez).
      await expect(
        ejecutar(
          `INSERT INTO "Negocio" ("id","nombre","categoriaId","whatsapp","consintioAvisoEn","estado","registradoEn")
           VALUES ('estado-malo','Taller Ficticio Cuatro',1,'7710008004','2026-08-01 10:00:00','borrado','2026-08-01 10:00:00')`,
        ),
      ).rejects.toThrow();
      await expect(
        ejecutar(
          `INSERT INTO "Negocio" ("id","nombre","categoriaId","whatsapp","consintioAvisoEn","estado","origen","registradoEn")
           VALUES ('origen-malo','Taller Ficticio Cinco',1,'7710008005','2026-08-01 10:00:00','publicado','regalado','2026-08-01 10:00:00')`,
        ),
      ).rejects.toThrow();
    } finally {
      await db.$disconnect();
      rmSync(archivo, { force: true });
      rmSync(`${archivo}-journal`, { force: true });
    }
  });

  it("no redefine la tabla Negocio: solo crea tabla e índice nuevos", () => {
    const cuerpo = sql(migracionDeReportes());
    // La redefinición que Prisma genera para SQLite se reconoce por estas
    // huellas; ninguna debe aparecer (perdería los CHECK del negocio).
    expect(cuerpo).not.toMatch(/DROP TABLE\s+"Negocio"/);
    expect(cuerpo).not.toMatch(/ALTER TABLE\s+"Negocio"/);
    expect(cuerpo).not.toMatch(/new_Negocio/);
    expect(cuerpo).toMatch(/CREATE TABLE\s+"Reporte"/);
  });

  it("hace cumplir en la base los cuatro motivos y los dos estados", () => {
    const cuerpo = sql(migracionDeReportes());
    for (const motivo of ["cerrado", "no_real", "datos_incorrectos", "inapropiado"]) {
      expect(cuerpo).toContain(`'${motivo}'`);
    }
    expect(cuerpo).toMatch(/CHECK\s*\(\s*"motivo"\s+IN/);
    expect(cuerpo).toMatch(/CHECK\s*\(\s*"estado"\s+IN/);
  });
});

describe("modelo-datos · la tabla Reporte en el cliente Prisma", () => {
  let prisma: PrismaClient;
  let categoriaId: number;
  let negocioId = "";

  const alta = async (whatsapp: string) =>
    (
      await prisma.negocio.create({
        data: {
          nombre: "Negocio Ficticio Reportado",
          categoriaId,
          whatsapp,
          consintioAvisoEn: new Date(),
          estado: "publicado",
          publicadoEn: new Date(),
        },
      })
    ).id;

  beforeAll(async () => {
    prisma = crearClientePrueba();
    await seedCatalogos(prisma);
    categoriaId = (
      await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })
    ).id;
    await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: "7710008" } } });
    negocioId = await alta("7710008101");
  });

  afterAll(async () => {
    await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: "7710008" } } });
    await prisma.$disconnect();
  });

  // Scenario: nada del reportante en el esquema
  it("sus columnas son exactamente las siete de la spec, ninguna del reportante", async () => {
    const columnas = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      'PRAGMA table_info("Reporte")',
    );
    expect(columnas.map((columna) => columna.name).sort()).toEqual(
      [
        "atendidoEn",
        "comentario",
        "creadoEn",
        "estado",
        "id",
        "motivo",
        "negocioId",
      ].sort(),
    );
    // Y ninguna que huela a identidad de quien reportó.
    for (const columna of columnas) {
      expect(columna.name).not.toMatch(/ip|hash|huella|nombre|contacto|correo|telefono/i);
    }
  });

  // Scenario: reporte recién creado
  it("un reporte recién creado queda pendiente, con fecha y sin comentario", async () => {
    const creado = await prisma.reporte.create({
      data: { negocioId, motivo: "cerrado" },
    });
    expect(creado.motivo).toBe("cerrado");
    expect(creado.comentario).toBeNull();
    expect(creado.estado).toBe("pendiente");
    expect(creado.creadoEn).toBeInstanceOf(Date);
    expect(creado.atendidoEn).toBeNull();
    await prisma.reporte.delete({ where: { id: creado.id } });
  });

  // Scenario: reporte con comentario
  it("el comentario se guarda tal cual y se recupera sin alteraciones", async () => {
    const texto = "<b>ya cerró</b> & se cambiaron, según el vecino de al lado";
    const creado = await prisma.reporte.create({
      data: { negocioId, motivo: "cerrado", comentario: texto },
    });
    const leido = await prisma.reporte.findUniqueOrThrow({ where: { id: creado.id } });
    expect(leido.comentario).toBe(texto);
    await prisma.reporte.delete({ where: { id: creado.id } });
  });

  // Scenario: motivo fuera del conjunto
  it("la base rechaza un motivo que no está en la lista cerrada", async () => {
    await expect(
      prisma.reporte.create({ data: { negocioId, motivo: "porque si" } }),
    ).rejects.toThrow();
  });

  // Scenario: estado fuera del conjunto
  it("la base rechaza un estado distinto de pendiente o atendido", async () => {
    await expect(
      prisma.reporte.create({ data: { negocioId, motivo: "cerrado", estado: "borrado" } }),
    ).rejects.toThrow();
  });

  // Scenario: atender un reporte + Scenario: conteo y lista de pendientes
  it("un negocio con tres pendientes y uno atendido cuenta 3, del más antiguo al más reciente", async () => {
    const otroId = await alta("7710008102");
    const base = new Date("2026-09-01T10:00:00.000Z").getTime();
    const horas = (n: number) => new Date(base + n * 60 * 60 * 1000);

    await prisma.reporte.createMany({
      data: [
        { negocioId: otroId, motivo: "cerrado", creadoEn: horas(0) },
        { negocioId: otroId, motivo: "no_real", creadoEn: horas(2) },
        { negocioId: otroId, motivo: "datos_incorrectos", creadoEn: horas(1) },
      ],
    });
    const atendido = await prisma.reporte.create({
      data: { negocioId: otroId, motivo: "inapropiado", creadoEn: horas(3) },
    });

    const cuando = new Date("2026-09-02T10:00:00.000Z");
    await prisma.reporte.update({
      where: { id: atendido.id },
      data: { estado: "atendido", atendidoEn: cuando },
    });
    const releido = await prisma.reporte.findUniqueOrThrow({ where: { id: atendido.id } });
    expect(releido.estado).toBe("atendido");
    expect(releido.atendidoEn?.toISOString()).toBe(cuando.toISOString());

    expect(
      await prisma.reporte.count({ where: { negocioId: otroId, estado: "pendiente" } }),
    ).toBe(3);

    const pendientes = await prisma.reporte.findMany({
      where: { negocioId: otroId, estado: "pendiente" },
      orderBy: { creadoEn: "asc" },
    });
    expect(pendientes.map((reporte) => reporte.motivo)).toEqual([
      "cerrado",
      "datos_incorrectos",
      "no_real",
    ]);
  });

  // Scenario: hard delete de un negocio con reportes (MODIFIED, operación ARCO)
  it("borrar el negocio se lleva sus reportes pendientes y atendidos", async () => {
    const condenadoId = await alta("7710008103");
    const uno = await prisma.reporte.create({
      data: { negocioId: condenadoId, motivo: "cerrado" },
    });
    const dos = await prisma.reporte.create({
      data: {
        negocioId: condenadoId,
        motivo: "no_real",
        estado: "atendido",
        atendidoEn: new Date(),
      },
    });

    await prisma.negocio.delete({ where: { id: condenadoId } });

    expect(await prisma.negocio.findUnique({ where: { id: condenadoId } })).toBeNull();
    expect(await prisma.reporte.findUnique({ where: { id: uno.id } })).toBeNull();
    expect(await prisma.reporte.findUnique({ where: { id: dos.id } })).toBeNull();
    expect(await prisma.reporte.count({ where: { negocioId: condenadoId } })).toBe(0);
  });
});
