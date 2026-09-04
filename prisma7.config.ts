// Configuración de Prisma 7.
//
// PostgreSQL en todos los entornos (ADR-004, ejecutado en T-013): el mismo
// dialecto en la laptop, en las pruebas, en el CI y en Supabase.
// Carga .env con el loader nativo de Node (sin dependencia de dotenv).
import { defineConfig } from "prisma/config";

import {
  URL_BASE_LOCAL_POR_DEFECTO,
  URL_SOMBRA_LOCAL_POR_DEFECTO,
} from "./src/lib/base-local";

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
    // Sin .env (clon recién hecho): la base local de `npm run db:local`.
    url: process.env["DATABASE_URL"] ?? URL_BASE_LOCAL_POR_DEFECTO,
    // `prisma migrate dev` necesita una base "sombra" donde reconstruir el
    // esquema desde cero para detectar drift. `npx prisma dev` levanta una en
    // el puerto siguiente al de la base; en un Postgres cualquiera se declara
    // con DIRECT_URL/SHADOW_DATABASE_URL (ver docs/despliegue.md).
    // `migrate deploy` —lo que corre el CI y producción— no la usa.
    shadowDatabaseUrl:
      process.env["SHADOW_DATABASE_URL"] ??
      (process.env["DATABASE_URL"] ? undefined : URL_SOMBRA_LOCAL_POR_DEFECTO),
  },
});
