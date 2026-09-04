import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

import pg from "pg";

import {
  ESQUEMAS_DE_LA_SUITE,
  ESQUEMA_PRUEBAS,
  urlDeEsquema,
  urlDeLaBaseDePrueba,
} from "./esquemas";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const fotosPrueba = path.join(raiz, ".fotos-test");

/**
 * Antes de la corrida: la base PostgreSQL de prueba desde cero —cada esquema
 * borrado y vuelto a crear, con las migraciones reales aplicadas (scenario
 * "base desde cero" de la spec `modelo-datos`)— y el almacén de fotos vacío
 * (`FOTOS_DIR` de `vitest.config.mts`), para que ninguna prueba dependa de
 * nada que dejó una corrida anterior.
 *
 * El motor es el mismo que el de producción (ADR-004): lo que aquí pasa en
 * verde es el dialecto que corre en Supabase, no una aproximación.
 *
 * OJO: esto REINICIA la base local de desarrollo (ver `tests/esquemas.ts`).
 * Los catálogos vuelven con `npm run db:seed` y los negocios ficticios con
 * `npm run db:seed:demo`.
 */
export default async function setup() {
  rmSync(fotosPrueba, { force: true, recursive: true });

  const cliente = new pg.Client({ connectionString: urlDeLaBaseDePrueba() });
  try {
    await cliente.connect();
  } catch (error) {
    throw new Error(
      `No se pudo conectar a la base de pruebas (${urlDeLaBaseDePrueba()}).\n` +
        "¿Levantaste la base local? Es un solo comando, en otra terminal: npm run db:local\n" +
        `Detalle: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    for (const esquema of ESQUEMAS_DE_LA_SUITE) {
      await cliente.query(`DROP SCHEMA IF EXISTS "${esquema}" CASCADE`);
      await cliente.query(`CREATE SCHEMA "${esquema}"`);
    }
    // El servidor local comparte la sesión entre conexiones: el DROP de
    // `public` deja el `search_path` apuntando a un esquema que ya no existe.
    await cliente.query(`SET search_path TO "${ESQUEMA_PRUEBAS}"`);
  } finally {
    await cliente.end();
  }

  // Solo el esquema compartido estrena el árbol aplicado. Los otros dos los
  // levantan las pruebas que los usan, que es justo lo que están probando.
  execSync("npx prisma migrate deploy", {
    cwd: raiz,
    env: { ...process.env, DATABASE_URL: urlDeEsquema(ESQUEMA_PRUEBAS) },
    stdio: "pipe",
  });
}
