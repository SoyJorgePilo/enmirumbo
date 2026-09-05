import { execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { clavesForaneasHacia, consultarConPg, restriccionesCheck } from "./catalogo-db";
import { ESQUEMA_MIGRACION, cerrarConexionCruda, crearConexionCruda, urlDeEsquema } from "./db";

/**
 * Spec `modelo-datos` · Requirements "Migración inicial y seed reproducibles"
 * y "Estado de revisión, origen y timestamps del ciclo de vida"; spec
 * `despliegue` · Requirement "Un solo dialecto de base de datos en todos los
 * entornos" (change `preparar-deploy-produccion`, tasks #2 y #3).
 *
 * Aquí se ejercita el ÁRBOL DE MIGRACIONES tal cual, sobre un esquema vacío y
 * desechable: se aplica con `prisma migrate deploy` —el mismo comando que
 * corre en Supabase— y se le pregunta a la base, no al archivo, qué quedó.
 *
 * Antes esto vivía repartido en cuatro archivos (`modelo-rechazo`,
 * `modelo-despublicacion`, `modelo-reporte`, `modelo-version-aviso`), cada uno
 * replicando a mano "las migraciones viejas, luego la nueva" para demostrar
 * que agregar columnas no borraba los CHECK. Ese peligro era de SQLite, cuya
 * redefinición de tabla se los llevaba; el árbol se rehízo consolidado en
 * PostgreSQL (design.md §4) y lo que hay que seguir vigilando es el
 * RESULTADO: que las cuatro constraints escritas a mano estén vivas después
 * de aplicar todo, y que las columnas del ciclo de vida sigan naciendo nulas.
 *
 * Datos 100% ficticios (repo público + LFPDPPP).
 */

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const carpetaMigraciones = path.join(raiz, "prisma/migrations");

/** Carpetas de migración en el orden en que Prisma las aplica (por nombre). */
function migracionesEnOrden(): string[] {
  return readdirSync(carpetaMigraciones, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory())
    .map((entrada) => entrada.name)
    .sort();
}

function sqlDe(migracion: string): string {
  return readFileSync(path.join(carpetaMigraciones, migracion, "migration.sql"), "utf8");
}

/** Las cinco constraints que Prisma no sabe escribir y mantenemos a mano. */
const CHECKS_A_MANO = {
  Negocio: {
    Negocio_estado_check: ["en_revision", "publicado", "rechazado"],
    Negocio_origen_check: ["siembra", "organico"],
  },
  Reporte: {
    Reporte_motivo_check: ["cerrado", "no_real", "datos_incorrectos", "inapropiado"],
    Reporte_estado_check: ["pendiente", "atendido"],
  },
  // Change `agregar-enlace-de-gestion` (T-014).
  EdicionPendiente: {
    EdicionPendiente_estado_check: ["pendiente", "aplicada", "descartada"],
  },
} as const;

let db: pg.Client;
const ejecutar = (instruccion: string, valores: unknown[] = []) =>
  db.query(instruccion, valores);

describe("modelo-datos · el árbol de migraciones aplicado de verdad", () => {
  beforeAll(async () => {
    // El árbol completo, con el mismo comando del despliegue, sobre el esquema
    // vacío que dejó `tests/global-setup.ts`.
    execSync("npx prisma migrate deploy", {
      cwd: raiz,
      env: { ...process.env, DATABASE_URL: urlDeEsquema(ESQUEMA_MIGRACION) },
      stdio: "pipe",
    });
    db = await crearConexionCruda(ESQUEMA_MIGRACION);
  }, 120_000);

  afterAll(async () => {
    if (db) await cerrarConexionCruda(db);
  });

  // Spec `despliegue` · Scenario: no hay dos dialectos que mantener
  it("es un solo árbol y su dialecto declarado es PostgreSQL", () => {
    const candado = readFileSync(
      path.join(carpetaMigraciones, "migration_lock.toml"),
      "utf8",
    );
    expect(candado).toMatch(/provider\s*=\s*"postgresql"/);

    const esquema = readFileSync(path.join(raiz, "prisma/schema.prisma"), "utf8");
    expect(esquema).toMatch(/provider\s*=\s*"postgresql"/);
    expect(esquema).not.toMatch(/provider\s*=\s*"sqlite"/);
  });

  // Spec `modelo-datos` · Scenario: base desde cero
  it("deja todas las tablas del modelo sobre una base vacía", async () => {
    const { rows } = await ejecutar(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = $1 AND table_type = 'BASE TABLE'
        ORDER BY table_name`,
      [ESQUEMA_MIGRACION],
    );
    expect(rows.map((fila) => fila.table_name)).toEqual([
      "Categoria",
      "Colonia",
      // Snapshot de los cambios que un negocio manda desde su enlace de
      // gestión (change `agregar-enlace-de-gestion`, T-014).
      "EdicionPendiente",
      "Giro",
      // Cupos anti-abuso compartidos (iteración 2, hallazgo A4 de la etapa C).
      "IntentoDeCupo",
      "Negocio",
      "Reporte",
      "_GiroToNegocio",
      "_prisma_migrations",
    ]);
  });

  /**
   * Spec `modelo-datos` (delta de `agregar-enlace-de-gestion`) · Scenario "una
   * sola pendiente por negocio". Prisma no expresa un índice único PARCIAL, así
   * que va a mano en la migración; esta prueba se lo pregunta al catálogo, no
   * al archivo.
   */
  it("el índice único parcial de una-pendiente-por-negocio existe en la base", async () => {
    const { rows } = await ejecutar(
      `SELECT indexdef FROM pg_indexes
        WHERE schemaname = $1 AND tablename = 'EdicionPendiente'
          AND indexname = 'EdicionPendiente_una_pendiente_por_negocio'`,
      [ESQUEMA_MIGRACION],
    );
    expect(rows).toHaveLength(1);
    const definicion = String(rows[0].indexdef);
    expect(definicion).toMatch(/CREATE UNIQUE INDEX/i);
    expect(definicion).toContain(`"negocioId"`);
    expect(definicion).toMatch(/WHERE .*'pendiente'/);
  });

  // Spec `modelo-datos` · Scenario: la base no guarda el token
  it("la columna del token en claro desapareció y quedó su huella, única", async () => {
    const { rows } = await ejecutar(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'Negocio'
          AND column_name LIKE 'tokenGestion%'`,
      [ESQUEMA_MIGRACION],
    );
    expect(rows.map((fila) => fila.column_name).sort()).toEqual([
      "tokenGestionCreadoEn",
      "tokenGestionHash",
    ]);

    const indices = await ejecutar(
      `SELECT indexname FROM pg_indexes
        WHERE schemaname = $1 AND tablename = 'Negocio'
          AND indexdef ILIKE '%tokenGestionHash%' AND indexdef ILIKE '%UNIQUE%'`,
      [ESQUEMA_MIGRACION],
    );
    expect(indices.rows).toHaveLength(1);
  });

  // Spec `modelo-datos` · Scenario: las constraints sobreviven a todo el árbol
  it("las cuatro constraints escritas a mano siguen vivas al final del árbol", async () => {
    for (const [tabla, esperadas] of Object.entries(CHECKS_A_MANO)) {
      const declaradas = await restriccionesCheck(consultarConPg(db), tabla);
      const porNombre = new Map(declaradas.map((c) => [c.nombre, c.definicion]));
      for (const [nombre, valores] of Object.entries(esperadas)) {
        const definicion = porNombre.get(nombre);
        expect(definicion, `${tabla}: falta ${nombre}`).toBeDefined();
        for (const valor of valores) {
          expect(definicion, `${nombre} sin '${valor}'`).toContain(`'${valor}'`);
        }
      }
    }
  });

  it("ninguna migración del árbol borra esas constraints", () => {
    const nombres = Object.values(CHECKS_A_MANO).flatMap((tabla) => Object.keys(tabla));
    for (const migracion of migracionesEnOrden()) {
      const cuerpo = sqlDe(migracion);
      for (const nombre of nombres) {
        expect(
          cuerpo,
          `${migracion} borra ${nombre}: los CHECK escritos a mano no se tiran`,
        ).not.toMatch(new RegExp(`DROP\\s+CONSTRAINT\\s+"?${nombre}"?`, "i"));
      }
    }
  });

  // Spec `modelo-datos` · Scenario: valores fuera del conjunto
  describe("la base rechaza un valor fuera del conjunto", () => {
    beforeAll(async () => {
      await ejecutar(
        `INSERT INTO "Categoria" ("nombre", "slug") VALUES ('Talleres', 'talleres')
         ON CONFLICT DO NOTHING`,
      );
    });

    const altaCruda = (columnas: string, valores: unknown[]) =>
      ejecutar(
        `INSERT INTO "Negocio" ("id","nombre","categoriaId","whatsapp","consintioAvisoEn","registradoEn",${columnas})
         VALUES ($1,$2,(SELECT "id" FROM "Categoria" WHERE "slug" = 'talleres'),$3,NOW(),NOW(),${valores
           .map((_, indice) => `$${indice + 4}`)
           .join(",")})`,
        [
          `crudo-${Math.random().toString(36).slice(2)}`,
          "Taller Ficticio de Prueba",
          `7719${Math.floor(Math.random() * 1_000_000)}`,
          ...valores,
        ],
      );

    it.each([
      ["estado inventado", '"estado"', ["inventado"]],
      ["estado con otra caja", '"estado"', ["PUBLICADO"]],
      ["estado con espacio", '"estado"', ["publicado "]],
      ["origen inventado", '"origen"', ["inventado"]],
      ["origen vacío", '"origen"', [""]],
    ])("rechaza un %s", async (_caso, columnas, valores) => {
      await expect(altaCruda(columnas, valores)).rejects.toThrow();
    });

    it("acepta los tres estados y los dos orígenes válidos", async () => {
      for (const estado of ["en_revision", "publicado", "rechazado"]) {
        await expect(altaCruda('"estado"', [estado])).resolves.toBeDefined();
      }
      for (const origen of ["siembra", "organico"]) {
        await expect(altaCruda('"origen"', [origen])).resolves.toBeDefined();
      }
    });

    it.each([
      ["motivo inventado", "inventado", "pendiente"],
      ["motivo del vocabulario del estado", "pendiente", "pendiente"],
      ["estado inventado", "cerrado", "borrado"],
      ["estado del vocabulario del negocio", "cerrado", "publicado"],
    ])("rechaza en Reporte un %s", async (_caso, motivo, estado) => {
      const negocio = await ejecutar(`SELECT "id" FROM "Negocio" LIMIT 1`);
      await expect(
        ejecutar(
          `INSERT INTO "Reporte" ("id","negocioId","motivo","estado","creadoEn")
           VALUES ($1,$2,$3,$4,NOW())`,
          [
            `crudo-${Math.random().toString(36).slice(2)}`,
            negocio.rows[0].id,
            motivo,
            estado,
          ],
        ),
      ).rejects.toThrow();
    });
  });

  // Spec `modelo-datos` · Scenarios "negocio recién creado",
  // "migración sobre una base con datos" y "fichas anteriores al versionado":
  // una fila escrita SIN las columnas que fueron llegando después nace con
  // todas ellas nulas, que es lo que garantiza que migrar no invente datos.
  it("una fila que solo escribe lo del modelo original deja nulo todo lo demás", async () => {
    await ejecutar(
      `INSERT INTO "Categoria" ("nombre", "slug") VALUES ('Talleres', 'talleres')
       ON CONFLICT DO NOTHING`,
    );
    await ejecutar(
      `INSERT INTO "Negocio" ("id","nombre","categoriaId","whatsapp","consintioAvisoEn","estado","registradoEn")
       VALUES ('viejo-sin-columnas-nuevas','Taller Ficticio Antiguo',
               (SELECT "id" FROM "Categoria" WHERE "slug" = 'talleres'),
               '7719990001', TIMESTAMP '2026-08-01 10:00:00', 'publicado',
               TIMESTAMP '2026-08-01 10:00:00')`,
    );

    const { rows } = await ejecutar(
      `SELECT "rechazadoEn","motivoRechazo","despublicadoEn","motivoDespublicacion",
              "consintioAvisoVersion","reconsintioAvisoEn","reconsintioAvisoVersion",
              "publicadoEn","fotoClave","tokenGestionHash","tokenGestionCreadoEn",
              "nombreNormalizado","queOfrecesNormalizado","origen"
         FROM "Negocio" WHERE "id" = 'viejo-sin-columnas-nuevas'`,
    );
    const fila = rows[0];
    for (const columna of [
      "rechazadoEn",
      "motivoRechazo",
      "despublicadoEn",
      "motivoDespublicacion",
      "consintioAvisoVersion",
      "reconsintioAvisoEn",
      "reconsintioAvisoVersion",
      "publicadoEn",
      "fotoClave",
      "tokenGestionHash",
      "tokenGestionCreadoEn",
    ]) {
      expect(fila[columna], columna).toBeNull();
    }
    // Las dos del buscador no son nulables: nacen en blanco y las rellena
    // `npm run db:backfill:busqueda` (change `agregar-buscador`).
    expect(fila.nombreNormalizado).toBe("");
    expect(fila.queOfrecesNormalizado).toBe("");
    // Y el origen cae en su default, no en un valor inventado.
    expect(fila.origen).toBe("organico");
  });

  // Spec `modelo-datos` · Scenario: la constancia y su versión son inseparables
  it("las columnas de la versión del aviso son nulables y sin valor por defecto", async () => {
    const { rows } = await ejecutar(
      `SELECT column_name, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'Negocio'
          AND column_name IN ('consintioAvisoVersion','reconsintioAvisoEn','reconsintioAvisoVersion')`,
      [ESQUEMA_MIGRACION],
    );
    expect(rows).toHaveLength(3);
    for (const fila of rows) {
      expect(fila.is_nullable, fila.column_name).toBe("YES");
      expect(fila.column_default, fila.column_name).toBeNull();
    }
  });

  // Spec `modelo-datos` · Scenario: ninguna relación bloquea el borrado
  it("toda clave foránea hacia Negocio borra en cascada", async () => {
    const claves = await clavesForaneasHacia(consultarConPg(db), "Negocio");
    expect(claves.map((clave) => `${clave.tabla}.${clave.columna}`).sort()).toEqual([
      // Change `agregar-enlace-de-gestion`: una edición guarda los mismos
      // datos personales que la ficha, así que un borrado ARCO que la dejara
      // atrás no sería un borrado.
      "EdicionPendiente.negocioId",
      "Reporte.negocioId",
      "_GiroToNegocio.B",
    ]);
    for (const clave of claves) {
      expect(clave.alBorrar, `${clave.tabla}.${clave.columna}`).toBe("CASCADE");
    }
  });
});
