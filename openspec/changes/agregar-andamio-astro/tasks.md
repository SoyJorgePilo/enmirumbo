# Tareas: agregar-andamio-astro

Rama base: `migracion-astro`. Orden por dependencia; cada tarea se comprueba sola. Antes de empezar, anotar el resultado de `npm test` (archivos y pruebas que pasan) como línea base.

## Dependencias y configuración

- [ ] 1. **Dependencias.** Agregar `astro`, `@astrojs/vercel`, `@astrojs/react`, `@astrojs/check` (versiones mayores del spike: Astro 7, adaptador 11, React 7) y, para el lint, `typescript-eslint`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`, `eslint-plugin-astro`. No quitar `next` ni `eslint-config-next`. Comprobar: `npm ci` limpio y `npm test` igual a la línea base.
- [ ] 2. **Archivos generados fuera del repo.** `.gitignore` con `/dist/` y `/.astro/` (`.vercel` ya está). Comprobar: tras un build, `git status` no muestra nada generado.
- [ ] 3. **`astro.config.mjs`** según `design.md` §6 (`output: 'server'`, `@astrojs/vercel` con `includeFiles` del certificado de `certs/`, `@astrojs/react`, sin optimizador de imágenes), y `tsconfig.json` con los tipos de Astro (`.astro/types.d.ts`) sin quitar lo de Next; excluir `dist`. Comprobar: `npx astro sync` sin errores.
- [ ] 4. **Scripts.** `dev`, `build`, `start` pasan a Astro (`astro dev`, `astro build`, `astro preview`); nuevo `typecheck` (`astro check`, más `tsc --noEmit` si `astro check` no cubre `src/app/`). Ningún script invoca `next`. Comprobar: `npm run typecheck` en verde y que un error de tipos puesto a propósito en `src/app/` lo reprueba (revertir).
- [ ] 5. **Build sin base.** `DATABASE_URL=postgresql://nadie:nadie@127.0.0.1:1/ninguna npm run build` en verde; no aparece `.next/`; ninguna ruta de `.vercel/output/` sale de `src/app/`; el certificado está dentro de la función en `.vercel/output/functions/`. Si Astro exige al menos una ruta para construir, detenerse y reportarlo: este change no agrega páginas.

## Pruebas

- [ ] 6. **Vitest con Astro.** Envolver `vitest.config.mts` con `getViteConfig` conservando alias, `include`, `fileParallelism`, `env`, `globalSetup` y carga de `.env` (`design.md` §4). Comprobar: `npm test` igual a la línea base.
- [ ] 7. **Humo de React sin JS** (prueba primero, verla fallar): fixture `.astro` en `tests/` que usa un componente de `src/components/` sin directiva `client:`, renderizado con la Container API; el HTML trae el marcado y no trae `<script`, `modulepreload` ni `astro-island`.

## Capa de compatibilidad

- [ ] 8. **Pruebas de paridad** (primero, en rojo): `Link` vs `next/link` con las props del header y de una tarjeta; `Imagen` vs `next/image` con las props de `MarcadorFoto`, con y sin prioridad. Comparan el HTML de servidor.
- [ ] 9. **Implementar** `src/components/compat/link.tsx` (`Link`) e `imagen.tsx` (`Imagen`) hasta que las pruebas de la tarea 8 pasen.
- [ ] 10. **Cambiar los imports** en los 20 componentes (19 de `next/link`, 1 de `next/image`). Comprobar: `grep -rE "next/(link|image)" src/components` vacío, y el diff de esos archivos es solo la línea de `import`.
- [ ] 11. **Pruebas de render.** Correr los 41 archivos que usan `react-dom/server`: todos en verde, y `git diff` de `tests/` sin cambios en archivos existentes.

## Lint y CI

- [ ] 12. **ESLint sin Next** (`design.md` §5): configuración plana con TypeScript, React, hooks, jsx-a11y y `.astro`; conservar los `globalIgnores` actuales y sumar `dist/**`, `.astro/**`, `.vercel/**`. Comprobar: `npm run lint` con 0 errores; un hook dentro de un `if` y un `<img>` sin `alt` puestos a propósito lo reprueban (revertir).
- [ ] 13. **CI.** En `.github/workflows/ci.yml`: lint → tipos (`npm run typecheck`) → build sin base (Astro) → migraciones → seed → `npm test`. Si Astro exige una versión de Node mayor que la del CI, subir `node-version` a 24 (runtime de Vercel). Comprobar: el CI del PR hacia `migracion-astro` en verde.

## Cierre

- [ ] 14. **Suite completa y diff.** `npm run lint`, `npm run typecheck`, `npm run build` y `npm test` en verde; `npm test` con los mismos archivos que la línea base más los nuevos. `git diff --stat` sin cambios en `src/lib/`, `src/app/`, `openspec/specs/`, `vercel.json`, `prisma/` ni `spikes/`.
- [ ] 15. **PR hacia `migracion-astro`** (nunca `main`), enlazado en el ticket T-022.
