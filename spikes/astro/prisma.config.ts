import { defineConfig } from "prisma/config";

try {
  process.loadEnvFile();
} catch {
  // Sin .env: se usa lo que traiga el entorno (en Vercel, sus variables).
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url: process.env["DATABASE_URL"] ?? "" },
});
