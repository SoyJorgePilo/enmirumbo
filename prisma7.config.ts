// Configuración de Prisma 7 (ADR-001: Prisma + SQLite en dev).
// Carga .env con el loader nativo de Node (sin dependencia de dotenv).
import { defineConfig } from "prisma/config";

try {
  process.loadEnvFile();
} catch {
  // Sin .env (p. ej. en CI con DATABASE_URL ya definida): no es error.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Sin .env (clon recién hecho): base de dev por default, como en .env.
    url: process.env["DATABASE_URL"] ?? "file:./prisma/dev.db",
  },
});
