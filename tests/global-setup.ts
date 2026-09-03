import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

const raiz = path.dirname(new URL(import.meta.url).pathname);
const dbPrueba = path.resolve(raiz, "../prisma/test.db");

/**
 * Antes de la corrida: base SQLite de prueba desde cero, aplicando la
 * migración inicial real (scenario "base desde cero" de la spec modelo-datos).
 */
export default function setup() {
  rmSync(dbPrueba, { force: true });
  rmSync(`${dbPrueba}-journal`, { force: true });
  execSync("npx prisma migrate deploy", {
    cwd: path.resolve(raiz, ".."),
    env: { ...process.env, DATABASE_URL: "file:./prisma/test.db" },
    stdio: "pipe",
  });
}
