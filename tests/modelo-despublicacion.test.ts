import { readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { PrismaClient } from "../src/generated/prisma/client";
import { borrarNegocio } from "../src/lib/admin/transiciones";
import { almacenDeFotos } from "../src/lib/fotos/almacen";
import { generarClaveFoto, VARIANTES_FOTO } from "../src/lib/fotos/clave";
import { crearClientePrueba } from "./db";

// Spec: modelo-datos (delta `agregar-despublicar-y-borrado-arco`) ·
// Requirements "El negocio guarda el rastro de su despublicación" y "Borrado
// definitivo de un negocio (operación ARCO)" (tasks.md #1 y #2).
//
// Datos 100% ficticios (repo público + LFPDPPP): serie de pruebas 771999 7xxx.

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const carpetaMigraciones = path.join(raiz, "prisma/migrations");
const PREFIJO = "7719997";

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

describe("modelo-datos · migración de despublicadoEn y motivoDespublicacion", () => {
  // Scenario: migración sobre una base con datos
  it("se aplica sobre una base con negocios en los tres estados sin perder filas ni CHECKs", async () => {
    const archivo = path.join(raiz, "prisma/test-migracion-despublicacion.db");
    rmSync(archivo, { force: true });
    const db = new PrismaClient({
      adapter: new PrismaBetterSqlite3({
        url: "file:./prisma/test-migracion-despublicacion.db",
      }),
    });
    const ejecutar = (instruccion: string) => db.$executeRawUnsafe(instruccion);

    try {
      const [inicial, ...posteriores] = migracionesEnOrden();

      // Base "vieja": solo la migración inicial, con datos ya dentro.
      for (const instruccion of sentencias(inicial)) await ejecutar(instruccion);
      await ejecutar(
        `INSERT INTO "Categoria" ("nombre", "slug") VALUES ('Talleres', 'talleres')`,
      );
      for (const [id, nombre, whatsapp, estado] of [
        ["viejo-publicado-2", "Taller Ficticio Uno", `${PREFIJO}001`, "publicado"],
        ["viejo-revision-2", "Taller Ficticio Dos", `${PREFIJO}002`, "en_revision"],
        ["viejo-rechazado-2", "Taller Ficticio Tres", `${PREFIJO}003`, "rechazado"],
      ]) {
        await ejecutar(
          `INSERT INTO "Negocio" ("id","nombre","categoriaId","whatsapp","consintioAvisoEn","estado","registradoEn")
           VALUES ('${id}','${nombre}',1,'${whatsapp}','2026-08-01 10:00:00','${estado}','2026-08-01 10:00:00')`,
        );
      }

      // Y ahora todas las migraciones posteriores, incluida la de este change.
      for (const migracion of posteriores) {
        for (const instruccion of sentencias(migracion)) await ejecutar(instruccion);
      }

      const filas = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
        'SELECT "id","nombre","estado","despublicadoEn","motivoDespublicacion" FROM "Negocio" ORDER BY "id"',
      );

      expect(filas).toHaveLength(3);
      expect(filas.map((fila) => fila.estado).sort()).toEqual([
        "en_revision",
        "publicado",
        "rechazado",
      ]);
      // Los dos campos nuevos quedan nulos en todas las filas que ya existían.
      for (const fila of filas) {
        expect(fila.despublicadoEn).toBeNull();
        expect(fila.motivoDespublicacion).toBeNull();
      }

      // Los CHECK de estado y origen siguen vigentes después de migrar.
      await expect(
        ejecutar(
          `UPDATE "Negocio" SET "estado" = 'inventado' WHERE "id" = 'viejo-publicado-2'`,
        ),
      ).rejects.toThrow();
      await expect(
        ejecutar(
          `UPDATE "Negocio" SET "origen" = 'inventado' WHERE "id" = 'viejo-publicado-2'`,
        ),
      ).rejects.toThrow();
    } finally {
      await db.$disconnect();
      rmSync(archivo, { force: true });
      rmSync(`${archivo}-journal`, { force: true });
    }
  });

  it("la migración de este change solo agrega columnas, no redefine ninguna tabla", () => {
    const nueva = migracionesEnOrden().find((carpeta) =>
      sql(carpeta).includes("despublicadoEn"),
    );
    expect(nueva, "falta la migración de despublicadoEn").toBeDefined();

    const instrucciones = sentencias(nueva!);
    for (const instruccion of instrucciones) {
      expect(instruccion.toUpperCase()).toMatch(/^ALTER TABLE "NEGOCIO" ADD COLUMN/);
    }
    expect(instrucciones.join(" ")).toContain("despublicadoEn");
    expect(instrucciones.join(" ")).toContain("motivoDespublicacion");
  });
});

describe("modelo-datos · rastro de la despublicación en el cliente Prisma", () => {
  let prisma: PrismaClient;
  let categoriaId: number;

  beforeAll(async () => {
    prisma = crearClientePrueba();
    await seedCatalogos(prisma);
    categoriaId = (
      await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })
    ).id;
  });

  afterAll(async () => {
    await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
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

  // Scenario: negocio que nunca se ha despublicado
  it("un negocio recién creado y publicado trae los dos campos nulos", async () => {
    const creado = await alta(`${PREFIJO}101`);
    expect(creado.despublicadoEn).toBeNull();
    expect(creado.motivoDespublicacion).toBeNull();

    const publicado = await prisma.negocio.update({
      where: { id: creado.id },
      data: { estado: "publicado", publicadoEn: new Date() },
    });
    expect(publicado.despublicadoEn).toBeNull();
    expect(publicado.motivoDespublicacion).toBeNull();
  });

  // Scenario: despublicación con fecha y motivo
  it("guarda fecha y motivo, y el negocio conserva todos sus demás datos", async () => {
    const creado = await alta(`${PREFIJO}102`);
    const cuando = new Date("2026-09-02T12:00:00.000Z");

    await prisma.negocio.update({
      where: { id: creado.id },
      data: {
        estado: "en_revision",
        despublicadoEn: cuando,
        motivoDespublicacion: "El negocio cerró",
      },
    });

    const leido = await prisma.negocio.findUniqueOrThrow({ where: { id: creado.id } });
    expect(leido.despublicadoEn?.toISOString()).toBe(cuando.toISOString());
    expect(leido.motivoDespublicacion).toBe("El negocio cerró");
    expect(leido.nombre).toBe("Negocio Ficticio de Prueba");
    expect(leido.whatsapp).toBe(`${PREFIJO}102`);
  });
});

describe("modelo-datos · toda relación hacia Negocio borra en cascada", () => {
  let prisma: PrismaClient;
  let categoriaId: number;
  let girosIds: number[];

  beforeAll(async () => {
    prisma = crearClientePrueba();
    await seedCatalogos(prisma);
    categoriaId = (
      await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })
    ).id;
    girosIds = (await prisma.giro.findMany({ orderBy: { id: "asc" }, take: 3 })).map(
      (giro) => giro.id,
    );
  });

  afterAll(async () => {
    await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
    await prisma.$disconnect();
  });

  /**
   * Invariante del modelo (requirement "Borrado definitivo de un negocio"):
   * el arrastre lo garantiza el esquema, no la acción que borra. Este test
   * recorre TODAS las claves foráneas de TODAS las tablas de la base y exige
   * cascada en las que apuntan a `Negocio`, de modo que una tabla nueva que
   * alguien agregue después sin cascada rompa aquí y no en producción.
   *
   * Excepción declarada: nadie. Ni siquiera un dato de un tercero (el reporte
   * de un vecino) puede bloquear un borrado ARCO.
   */
  // Scenario: ninguna relación bloquea el borrado
  it("ninguna clave foránea hacia Negocio se declara sin ON DELETE CASCADE", async () => {
    const tablas = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '_prisma_migrations'`,
    );
    expect(tablas.length).toBeGreaterThan(0);

    const hacia: string[] = [];
    for (const { name } of tablas) {
      const claves = await prisma.$queryRawUnsafe<
        Array<{ table: string; on_delete: string; from: string }>
      >(`PRAGMA foreign_key_list("${name}")`);
      for (const clave of claves) {
        if (clave.table !== "Negocio") continue;
        hacia.push(`${name}.${clave.from}`);
        expect(
          clave.on_delete.toUpperCase(),
          `${name}.${clave.from} apunta a Negocio sin cascada`,
        ).toBe("CASCADE");
      }
    }

    // Hoy solo existe la relación implícita con los giros; si algún día hay
    // reportes (T-011) o ediciones pendientes (T-014), entran solas a esta
    // revisión.
    expect(hacia).toContain("_GiroToNegocio.B");
  });

  // Scenario: hard delete
  it("borrar un negocio con giros se lleva sus vínculos y no deja filas huérfanas", async () => {
    const creado = await prisma.negocio.create({
      data: {
        nombre: "Taller Ficticio Con Giros",
        categoriaId,
        whatsapp: `${PREFIJO}201`,
        consintioAvisoEn: new Date(),
        estado: "publicado",
        publicadoEn: new Date(),
        giros: { connect: girosIds.map((id) => ({ id })) },
      },
      include: { giros: true },
    });
    expect(creado.giros).toHaveLength(3);

    const { count } = await prisma.negocio.deleteMany({ where: { id: creado.id } });
    expect(count).toBe(1);

    expect(await prisma.negocio.findUnique({ where: { id: creado.id } })).toBeNull();
    const vinculos = await prisma.$queryRawUnsafe<Array<{ B: string }>>(
      `SELECT "B" FROM "_GiroToNegocio" WHERE "B" = ?`,
      creado.id,
    );
    expect(vinculos).toEqual([]);
    // Los giros del catálogo siguen ahí: se borra el vínculo, no el catálogo.
    expect(await prisma.giro.count({ where: { id: { in: girosIds } } })).toBe(3);
  });

  /**
   * Punto de integración con T-008 (foto del negocio subida al sitio), que
   * mergeó a `main` mientras este change estaba en el pipeline: ahora
   * `Negocio` sí guarda la clave de un archivo propio, así que la rama viva de
   * este test es la segunda.
   *
   * El disparador es agnóstico al nombre de la columna (hallazgo BAJO 2 de la
   * etapa C: anclarlo a `fotoClave` era adivinar, y si mañana se agrega una
   * `fotoRuta` el test tiene que volver a sonar). Y se revisa el CAMINO del
   * borrado completo —`borrarNegocio` delega en `borrarNegocioDefinitivamente`,
   * en `src/lib/negocio.ts`—, no un solo archivo, porque lo que el requirement
   * exige es que el archivo desaparezca, no dónde está escrita la llamada.
   */
  // Scenario: la foto también se va
  it("si el modelo estrena archivos de foto, el borrado tiene que arrastrarlos", () => {
    const schema = readFileSync(path.join(raiz, "prisma/schema.prisma"), "utf8");
    const transiciones = readFileSync(
      path.join(raiz, "src/lib/admin/transiciones.ts"),
      "utf8",
    );
    const negocio = readFileSync(path.join(raiz, "src/lib/negocio.ts"), "utf8");
    const caminoDelBorrado = `${transiciones}\n${negocio}`;

    const camposDeFoto = [...schema.matchAll(/^\s*(foto\w*)\s+\w/gm)]
      .map((encontrado) => encontrado[1])
      .filter((campo) => campo !== "fotoUrl");
    if (camposDeFoto.length === 0) {
      // Sin columna de archivo propio no hay nada que borrar del disco; el
      // punto de integración queda documentado en el código del borrado.
      expect(transiciones).toContain("T-008");
      return;
    }

    // `borrarNegocio` no puede borrar por su cuenta: delega en el único hard
    // delete del proyecto, para que no haya dos caminos y uno se olvide.
    expect(transiciones).toContain("borrarNegocioDefinitivamente");
    for (const campo of camposDeFoto) {
      expect(
        caminoDelBorrado,
        `el modelo guarda archivos de foto (\`${campo}\`): el borrado definitivo debe eliminarlos`,
      ).toContain(campo);
    }
    expect(negocio).toContain("almacen.borrar");
  });

  /**
   * Y la comprobación de verdad, con archivos en el disco: el meta-test de
   * arriba solo lee código.
   */
  // Scenario: la foto también se va
  it("borrar desde el panel se lleva TODAS las variantes del archivo de la foto", async () => {
    const almacen = almacenDeFotos();
    const clave = generarClaveFoto();
    for (const variante of VARIANTES_FOTO) {
      await almacen.guardar(clave, variante, Buffer.from("bytes de mentiras"));
    }

    const creado = await prisma.negocio.create({
      data: {
        nombre: "Taller Ficticio Con Foto",
        categoriaId,
        whatsapp: `${PREFIJO}202`,
        consintioAvisoEn: new Date(),
        estado: "publicado",
        publicadoEn: new Date(),
        fotoClave: clave,
        giros: { connect: girosIds.map((id) => ({ id })) },
      },
    });

    // Control: antes del borrado los archivos sí están.
    for (const variante of VARIANTES_FOTO) {
      expect(await almacen.leer(clave, variante), variante).not.toBeNull();
    }

    expect(await borrarNegocio(prisma, creado.id)).toEqual({ resultado: "borrado" });

    expect(await prisma.negocio.findUnique({ where: { id: creado.id } })).toBeNull();
    for (const variante of VARIANTES_FOTO) {
      expect(await almacen.leer(clave, variante), variante).toBeNull();
    }
  });

  // Scenario: borrado con el archivo ya ausente (spec `modelo-datos`)
  it("borrar una ficha cuya foto ya no está en el almacén se completa igual", async () => {
    const clave = generarClaveFoto(); // nunca se escribió ningún archivo
    const creado = await prisma.negocio.create({
      data: {
        nombre: "Taller Ficticio Sin Archivos",
        categoriaId,
        whatsapp: `${PREFIJO}203`,
        consintioAvisoEn: new Date(),
        fotoClave: clave,
      },
    });

    expect(await borrarNegocio(prisma, creado.id)).toEqual({ resultado: "borrado" });
    expect(await prisma.negocio.findUnique({ where: { id: creado.id } })).toBeNull();
    // Y el segundo intento sigue siendo idempotente con foto de por medio.
    expect(await borrarNegocio(prisma, creado.id)).toEqual({ resultado: "ya-no-existe" });
  });

  it("borrar una ficha sin foto no toca el almacén", async () => {
    const creado = await prisma.negocio.create({
      data: {
        nombre: "Taller Ficticio Sin Foto",
        categoriaId,
        whatsapp: `${PREFIJO}204`,
        consintioAvisoEn: new Date(),
      },
    });

    let borradas = 0;
    const almacenEspia = {
      guardar: async () => {},
      leer: async () => null,
      borrar: async () => {
        borradas += 1;
      },
    };

    expect(await borrarNegocio(prisma, creado.id, almacenEspia)).toEqual({
      resultado: "borrado",
    });
    expect(borradas).toBe(0);
  });

  it("el disparador de ese test reconoce una columna de foto con cualquier nombre", () => {
    // Sin esta comprobación, el test de arriba podría quedarse verde para
    // siempre por un regex que no encuentra nada (hallazgo BAJO 2).
    const camposDe = (schema: string) =>
      [...schema.matchAll(/^\s*(foto\w*)\s+\w/gm)]
        .map((encontrado) => encontrado[1])
        .filter((campo) => campo !== "fotoUrl");

    expect(camposDe("  fotoUrl            String?")).toEqual([]);
    for (const nombre of ["fotoClave", "fotoRuta", "fotoBlobKey", "fotoStorage"]) {
      expect(camposDe(`  ${nombre}  String?`), nombre).toEqual([nombre]);
    }
  });
});
