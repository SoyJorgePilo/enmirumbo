import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Cliente Prisma generado (no se commitea ni se lintéa):
    "src/generated/**",
    // Andamiaje del pipeline de agentes: definiciones, comandos y worktrees
    // temporales (que traen su propio `.next/` compilado dentro). Nada de eso
    // es código del producto; el ignore de `.next/**` de arriba solo alcanza
    // al de la raíz.
    ".claude/**",
  ]),
]);

export default eslintConfig;
