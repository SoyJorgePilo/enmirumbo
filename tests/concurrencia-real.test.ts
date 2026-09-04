import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import type { PrismaClient } from "../src/generated/prisma/client";
import { ESTADO_REPORTE_PENDIENTE } from "../src/lib/reportes/estados";
import { TOPE_REPORTES_PENDIENTES_POR_NEGOCIO } from "../src/lib/reportes/limite";
import { crearClientePrueba, urlDeLaBaseDePrueba } from "./db";

/**
 * Concurrencia DE VERDAD: dos conexiones distintas, dos transacciones abiertas
 * a la vez, contra la misma fila.
 *
 * Iteración 2 del change `preparar-deploy-produccion`, hallazgos A3 y M7 de la
 * etapa C. El resto de la suite no puede probar esto y hay que decirlo en voz
 * alta: sus clientes abren UNA conexión (`tests/db.ts`), así que un
 * `Promise.all` queda serializado por el pool y pasa aunque el invariante esté
 * roto. Fue justo lo que dejó pasar A3.
 *
 * POR QUÉ AQUÍ SE USA `pg` A PELO Y NO PRISMA: lo que se prueba es el
 * mecanismo de la base —que el cerrojo consultivo de transacción serializa el
 * `INSERT` condicionado del tope de reportes—, no el código que lo llama. Con
 * dos clientes de Prisma no se puede forzar el entrelazado exacto (A empieza,
 * B empieza, A confirma, B confirma) que rompe READ COMMITTED.
 *
 * DÓNDE CORRE: contra un PostgreSQL con backends independientes. El servidor
 * local de `npx prisma dev` (PGlite) multiplexa TODAS las conexiones sobre un
 * solo backend —dos clientes devuelven el mismo `pg_backend_pid()`—, así que
 * ahí no hay dos transacciones que entrelazar y estas pruebas SE SALTAN, con
 * el motivo escrito en la consola. En el CI, con el servicio `postgres:17`,
 * corren de verdad. La comprobación de si se puede o no es la primera prueba
 * del archivo, para que "se saltó todo" nunca pase inadvertido.
 *
 * Datos 100% ficticios (repo público + LFPDPPP): serie 771999 5xxx.
 */

const PREFIJO = "7719995";

/** ¿Este servidor da conexiones con backends independientes? */
async function hayBackendsIndependientes(): Promise<boolean> {
  const a = new pg.Client({ connectionString: urlDeLaBaseDePrueba() });
  const b = new pg.Client({ connectionString: urlDeLaBaseDePrueba() });
  try {
    await a.connect();
    await b.connect();
    const pidA = (await a.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    const pidB = (await b.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    return pidA !== pidB;
  } catch {
    return false;
  } finally {
    await a.end().catch(() => {});
    await b.end().catch(() => {});
  }
}

const backendsIndependientes = await hayBackendsIndependientes();

if (!backendsIndependientes) {
  console.warn(
    "[concurrencia] la base de esta corrida multiplexa todas las conexiones sobre un solo backend " +
      "(es lo que hace `npx prisma dev`): las pruebas de carrera real se saltan aquí y corren en el CI, " +
      "contra el servicio postgres:17. Ver docs/despliegue.md §2.",
  );
}

let prisma: PrismaClient;
let categoriaId: number;

beforeAll(async () => {
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (
    await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })
  ).id;
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
});

afterAll(async () => {
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
  await prisma.$disconnect();
});

describe("concurrencia real · el tope de reportes por negocio", () => {
  it("la suite sabe si esta base puede ejercitar carreras de verdad", async () => {
    // Guardián del guardián: si esta comprobación se rompiera y siempre
    // dijera "no", el archivo entero pasaría en verde sin probar nada.
    expect(typeof backendsIndependientes).toBe("boolean");
    if (!backendsIndependientes) {
      // En la base local el motivo tiene que ser ESE y no otro: una conexión
      // que simplemente falla también daría `false`.
      const cliente = new pg.Client({ connectionString: urlDeLaBaseDePrueba() });
      await cliente.connect();
      await cliente.end();
    }
  });

  /**
   * La carrera exacta que rompe READ COMMITTED sin cerrojo:
   *
   *   A: BEGIN                    B: BEGIN
   *   A: INSERT … WHERE count<10  B: INSERT … WHERE count<10   ← las dos ven 9
   *   A: COMMIT                   B: COMMIT                    ← quedan 11
   *
   * Con `pg_advisory_xact_lock(hashtext(negocioId))` antes del `INSERT`, B se
   * queda esperando en el cerrojo hasta que A confirma, y entonces su
   * sub-`SELECT` ya ve 10 y no inserta.
   */
  it.runIf(backendsIndependientes)(
    "con el cerrojo, dos transacciones simultáneas no pasan el tope",
    async () => {
      const negocio = await prisma.negocio.create({
        data: {
          nombre: "Fonda Ficticia de la Carrera",
          categoriaId,
          whatsapp: `${PREFIJO}001`,
          consintioAvisoEn: new Date(),
          estado: "publicado",
          publicadoEn: new Date(),
        },
      });

      // Se deja el negocio a UNO del tope: la siguiente inserción es la última
      // que debe entrar.
      for (let i = 0; i < TOPE_REPORTES_PENDIENTES_POR_NEGOCIO - 1; i += 1) {
        await prisma.reporte.create({
          data: { negocioId: negocio.id, motivo: "cerrado" },
        });
      }

      const a = new pg.Client({ connectionString: urlDeLaBaseDePrueba() });
      const b = new pg.Client({ connectionString: urlDeLaBaseDePrueba() });
      await a.connect();
      await b.connect();

      const alta = (cliente: pg.Client, id: string) =>
        cliente.query(
          `INSERT INTO "Reporte" ("id","negocioId","motivo","estado","creadoEn")
           SELECT $1, $2, 'cerrado', $3, NOW()
           WHERE (SELECT COUNT(*) FROM "Reporte" WHERE "negocioId" = $2 AND "estado" = $3) < $4`,
          [id, negocio.id, ESTADO_REPORTE_PENDIENTE, TOPE_REPORTES_PENDIENTES_POR_NEGOCIO],
        );
      const cerrojo = (cliente: pg.Client) =>
        cliente.query("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)", [negocio.id]);

      try {
        await a.query("BEGIN");
        await b.query("BEGIN");

        // A toma el cerrojo e inserta; B se queda esperando en el cerrojo.
        await cerrojo(a);
        const insertadoA = await alta(a, `carrera-a-${Date.now()}`);
        const esperaB = cerrojo(b).then(() => alta(b, `carrera-b-${Date.now()}`));

        await a.query("COMMIT");
        const insertadoB = await esperaB;
        await b.query("COMMIT");

        expect(insertadoA.rowCount).toBe(1);
        // B ya ve el tope alcanzado y no escribe: ESTA es la línea que
        // fallaría sin el cerrojo.
        expect(insertadoB.rowCount).toBe(0);
      } finally {
        await a.end().catch(() => {});
        await b.end().catch(() => {});
      }

      expect(
        await prisma.reporte.count({
          where: { negocioId: negocio.id, estado: ESTADO_REPORTE_PENDIENTE },
        }),
      ).toBe(TOPE_REPORTES_PENDIENTES_POR_NEGOCIO);
    },
    30_000,
  );

  /**
   * La otra mitad de la prueba, y la que le da valor: SIN el cerrojo, la misma
   * carrera sí pasa el tope. Si algún día esta prueba empezara a fallar,
   * significaría que la base cambió de comportamiento y que la de arriba dejó
   * de demostrar nada.
   */
  it.runIf(backendsIndependientes)(
    "CARACTERIZACIÓN: sin el cerrojo, la misma carrera SÍ pasa el tope",
    async () => {
      const negocio = await prisma.negocio.create({
        data: {
          nombre: "Fonda Ficticia sin Cerrojo",
          categoriaId,
          whatsapp: `${PREFIJO}002`,
          consintioAvisoEn: new Date(),
          estado: "publicado",
          publicadoEn: new Date(),
        },
      });
      for (let i = 0; i < TOPE_REPORTES_PENDIENTES_POR_NEGOCIO - 1; i += 1) {
        await prisma.reporte.create({
          data: { negocioId: negocio.id, motivo: "cerrado" },
        });
      }

      const a = new pg.Client({ connectionString: urlDeLaBaseDePrueba() });
      const b = new pg.Client({ connectionString: urlDeLaBaseDePrueba() });
      await a.connect();
      await b.connect();
      const alta = (cliente: pg.Client, id: string) =>
        cliente.query(
          `INSERT INTO "Reporte" ("id","negocioId","motivo","estado","creadoEn")
           SELECT $1, $2, 'cerrado', $3, NOW()
           WHERE (SELECT COUNT(*) FROM "Reporte" WHERE "negocioId" = $2 AND "estado" = $3) < $4`,
          [id, negocio.id, ESTADO_REPORTE_PENDIENTE, TOPE_REPORTES_PENDIENTES_POR_NEGOCIO],
        );

      try {
        await a.query("BEGIN");
        await b.query("BEGIN");
        const [ia, ib] = await Promise.all([
          alta(a, `sin-cerrojo-a-${Date.now()}`),
          alta(b, `sin-cerrojo-b-${Date.now()}`),
        ]);
        await a.query("COMMIT");
        await b.query("COMMIT");
        expect(ia.rowCount).toBe(1);
        expect(ib.rowCount).toBe(1); // las dos vieron 9 pendientes
      } finally {
        await a.end().catch(() => {});
        await b.end().catch(() => {});
      }

      expect(
        await prisma.reporte.count({
          where: { negocioId: negocio.id, estado: ESTADO_REPORTE_PENDIENTE },
        }),
      ).toBe(TOPE_REPORTES_PENDIENTES_POR_NEGOCIO + 1);
    },
    30_000,
  );
});
