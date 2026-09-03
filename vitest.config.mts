import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Los tests comparten una base SQLite de prueba: sin paralelismo entre archivos.
    fileParallelism: false,
    env: {
      DATABASE_URL: "file:./prisma/test.db",
    },
    globalSetup: "./tests/global-setup.ts",
  },
});
