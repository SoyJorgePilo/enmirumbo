import { defineConfig, globalIgnores } from "eslint/config";
import astro from "eslint-plugin-astro";
import importPlugin from "eslint-plugin-import";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

/**
 * ESLint sin `eslint-config-next` (ADR-013; change `agregar-andamio-astro`,
 * design.md §5). Reproduce las reglas que aplicaban `core-web-vitals` y
 * `typescript` de Next, menos las `@next/next/*`, que no aplican fuera de Next,
 * y suma las de `.astro`. `eslint-config-next` sigue en `devDependencies`, sin
 * usarse, hasta el corte (T-027).
 */
const eslintConfig = defineConfig([
  // TypeScript: las recomendadas, con las dos que Next bajaba a aviso.
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-unused-expressions": "warn",
    },
  },

  // React, hooks, accesibilidad e `import`: el mismo conjunto que
  // `core-web-vitals`.
  {
    files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    plugins: {
      import: importPlugin,
      react,
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
    },
    settings: { react: { version: "detect" } },
    rules: {
      "import/no-anonymous-default-export": "warn",
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/no-unknown-property": "off",
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react/jsx-no-target-blank": "off",
      "jsx-a11y/alt-text": [
        // `error` y no `warn` como en Next: una foto sin texto alternativo
        // reprueba el lint (spec `plataforma-astro`, "El lint no depende de
        // Next y no pierde dureza"). `Image` sigue siendo el nombre local de
        // `Imagen` en `MarcadorFoto`.
        "error",
        { elements: ["img"], img: ["Image", "Imagen"] },
      ],
      "jsx-a11y/aria-props": "warn",
      "jsx-a11y/aria-proptypes": "warn",
      "jsx-a11y/aria-unsupported-elements": "warn",
      "jsx-a11y/role-has-required-aria-props": "warn",
      "jsx-a11y/role-supports-aria-props": "warn",
    },
  },

  // Archivos `.astro` (las páginas de las fases siguientes).
  ...astro.configs["flat/recommended"],

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Salida y tipos generados de Astro y del adaptador de Vercel.
    "dist/**",
    ".astro/**",
    ".vercel/**",
    // Cliente Prisma generado (no se commitea ni se lintéa):
    "src/generated/**",
    // Andamiaje del pipeline de agentes: definiciones, comandos y worktrees
    // temporales (que traen su propio `.next/` compilado dentro). Nada de eso
    // es código del producto; el ignore de `.next/**` de arriba solo alcanza
    // al de la raíz.
    ".claude/**",
    // Spikes desechables con su propio marco y su propio package.json (T-021,
    // ADR-013): no son código de la app ni deben entrar a su lint.
    "spikes/**",
  ]),
]);

export default eslintConfig;
