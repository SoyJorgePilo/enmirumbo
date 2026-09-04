/**
 * Cliente Prisma de la aplicación (design.md §6 del change
 * `agregar-formulario-registro`). Hasta ahora solo existía el de pruebas
 * (`tests/db.ts`).
 *
 * Instancia única y perezosa: se crea en la primera consulta, no al importar
 * el módulo (así `next build` no abre la base para prerenderizar), y se
 * guarda en `globalThis` fuera de producción para que la recarga en caliente
 * de `next dev` no abra una conexión nueva por render.
 */
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

import { PrismaClient } from "@/generated/prisma/client";

const almacenGlobal = globalThis as typeof globalThis & {
  prismaNecesitoUno?: PrismaClient;
};

/** Cliente compartido; ADR-001: SQLite por adaptador better-sqlite3. */
export function obtenerPrisma(): PrismaClient {
  if (!almacenGlobal.prismaNecesitoUno) {
    const adapter = new PrismaBetterSqlite3({
      url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
    });
    almacenGlobal.prismaNecesitoUno = new PrismaClient({ adapter });
  }
  return almacenGlobal.prismaNecesitoUno;
}
