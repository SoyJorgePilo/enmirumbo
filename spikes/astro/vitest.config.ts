import { defineConfig } from "vitest/config";

// Pruebas propias del spike (T-021). No entran a la suite de la raíz, que solo
// incluye `tests/**` de la raíz; estas viven en `spikes/astro/tests/`.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
