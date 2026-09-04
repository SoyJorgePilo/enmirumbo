import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

try {
  // `npm test` no lee .env solo: sin esto, quien tenga su base local en otro
  // puerto correría la suite contra la de por defecto sin enterarse. Lo que
  // quede en `process.env` lo heredan los workers, así que `DATABASE_URL` no
  // se declara abajo: la ponen el `.env`, el CI, o el default local de
  // `src/lib/base-local.ts` cuando no hay ninguna.
  process.loadEnvFile();
} catch {
  // Sin .env (clon recién hecho o CI): se usa lo que traiga el entorno.
}

export default defineConfig({
  resolve: {
    // Mismo alias que tsconfig.json ("@/*" → "./src/*").
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Los tests comparten la base PostgreSQL de prueba: sin paralelismo entre
    // archivos (change `preparar-deploy-produccion`, design.md §5).
    fileParallelism: false,
    env: {
      // Las fotos de las pruebas caen en su propio directorio, fuera del
      // repositorio versionado y separado del `.fotos/` de desarrollo
      // (`tests/global-setup.ts` lo borra antes de cada corrida).
      FOTOS_DIR: "./.fotos-test",
    },
    globalSetup: "./tests/global-setup.ts",
  },
});
