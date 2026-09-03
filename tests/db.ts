import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

import { PrismaClient } from "../src/generated/prisma/client";

/** Cliente Prisma contra la base SQLite de prueba (DATABASE_URL de vitest.config.ts). */
export function crearClientePrueba(): PrismaClient {
  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? "file:./prisma/test.db",
  });
  return new PrismaClient({ adapter });
}
