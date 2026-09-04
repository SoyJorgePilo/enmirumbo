import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

const raiz = path.dirname(new URL(import.meta.url).pathname);
const dbPrueba = path.resolve(raiz, "../prisma/test.db");
const fotosPrueba = path.resolve(raiz, "../.fotos-test");

/**
 * Antes de la corrida: base SQLite de prueba desde cero, aplicando las
 * migraciones reales (scenario "base desde cero" de la spec modelo-datos), y
 * almacén de fotos vacío (`FOTOS_DIR` de `vitest.config.mts`), para que
 * ninguna prueba dependa de archivos de una corrida anterior.
 */
export default function setup() {
  rmSync(dbPrueba, { force: true });
  rmSync(`${dbPrueba}-journal`, { force: true });
  rmSync(fotosPrueba, { force: true, recursive: true });
  execSync("npx prisma migrate deploy", {
    cwd: path.resolve(raiz, ".."),
    env: { ...process.env, DATABASE_URL: "file:./prisma/test.db" },
    stdio: "pipe",
  });
}
