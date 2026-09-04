import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mismo alias que tsconfig.json ("@/*" → "./src/*").
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Los tests comparten una base SQLite de prueba: sin paralelismo entre archivos.
    fileParallelism: false,
    env: {
      DATABASE_URL: "file:./prisma/test.db",
      // Las fotos de las pruebas caen en su propio directorio, fuera del
      // repositorio versionado y separado del `.fotos/` de desarrollo
      // (`tests/global-setup.ts` lo borra antes de cada corrida).
      FOTOS_DIR: "./.fotos-test",
    },
    globalSetup: "./tests/global-setup.ts",
  },
});
