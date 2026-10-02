# Tareas: agregar-andamio-astro

Rama base: `migracion-astro`. Orden por dependencia; cada tarea se comprueba sola. Antes de empezar, anotar el resultado de `npm test` (archivos y pruebas que pasan) como línea base.

## Dependencias y configuración

- [x] 1. **Dependencias.** Agregar `astro`, `@astrojs/vercel`, `@astrojs/react`, `@astrojs/check` (versiones mayores del spike: Astro 7, adaptador 11, React 7) y, para el lint, `typescript-eslint`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`, `eslint-plugin-astro`. No quitar `next` ni `eslint-config-next`. Comprobar: `npm ci` limpio y `npm test` igual a la línea base.
   - *Corrección:* `eslint-plugin-astro` 2.x y 3.x exigen ESLint 10, y el repo (y `eslint-plugin-react` 7) siguen en ESLint 9: se usa `eslint-plugin-astro@^1.7.0`. Los demás plugins quedan en las mayores que ya traía `eslint-config-next`.
- [x] 2. **Archivos generados fuera del repo.** `.gitignore` con `/dist/` y `/.astro/` (`.vercel` ya está). Comprobar: tras un build, `git status` no muestra nada generado.
- [x] 3. **`astro.config.mjs`** según `design.md` §6 (`output: 'server'`, `@astrojs/vercel` con `includeFiles` del certificado de `certs/`, `@astrojs/react`, sin optimizador de imágenes), y `tsconfig.json` con los tipos de Astro (`.astro/types.d.ts`) sin quitar lo de Next; excluir `dist`. Comprobar: `npx astro sync` sin errores.
- [x] 4. **Scripts.** `dev`, `build`, `start` pasan a Astro (`astro dev`, `astro build`, `astro preview`); nuevo `typecheck` (`astro check`, más `tsc --noEmit` si `astro check` no cubre `src/app/`). Ningún script invoca `next`. Comprobar: `npm run typecheck` en verde y que un error de tipos puesto a propósito en `src/app/` lo reprueba (revertir).
   - *Corrección:* `astro check` sí cubre `.ts`/`.tsx` (todo el `tsconfig`), pero sin `next-env.d.ts` ni `.next/types` —que no existen en un clon limpio ni en el CI— `src/app/` no tipa (`PageProps`, `LayoutProps`, `RouteContext` son globales generados por Next). `typecheck` queda como `next typegen && astro check`: `next typegen` solo genera tipos, no construye ni compila rutas (lo que design.md §1 prohíbe es `next build`/`next dev`), y es lo que la doc de Next recomienda para tipar en CI. Se va en el corte (T-027) junto con `src/app/`. "Ningún script invoca `next`" queda como "ningún script construye ni sirve con `next`".
   - *Corrección:* `start` se quita en vez de pasar a `astro preview`: `@astrojs/vercel` no trae servidor de vista previa ("Preview server process exited before becoming ready") y nada del repo usa `npm start` (Vercel no lo llama). Servir la salida de Vercel en local queda como propuesta (b-dev.md).
- [x] 5. **Build sin base.** `DATABASE_URL=postgresql://nadie:nadie@127.0.0.1:1/ninguna npm run build` en verde; no aparece `.next/`; ninguna ruta de `.vercel/output/` sale de `src/app/`; el certificado está dentro de la función en `.vercel/output/functions/`. Si Astro exige al menos una ruta para construir, detenerse y reportarlo: este change no agrega páginas.
   - Astro construye sin ninguna ruta (solo avisa `Missing pages directory: src/pages`): no hizo falta la 404.

## Pruebas

- [x] 6. **Vitest con Astro.** Envolver `vitest.config.mts` con `getViteConfig` conservando alias, `include`, `fileParallelism`, `env`, `globalSetup` y carga de `.env` (`design.md` §4). Comprobar: `npm test` igual a la línea base.
- [x] 7. **Humo de React sin JS** (prueba primero, verla fallar): fixture `.astro` en `tests/` que usa un componente de `src/components/` sin directiva `client:`, renderizado con la Container API; el HTML trae el marcado y no trae `<script`, `modulepreload` ni `astro-island`.

## Capa de compatibilidad

- [x] 8. **Pruebas de paridad** (primero, en rojo): `Link` vs `next/link` con las props del header y de una tarjeta; `Imagen` vs `next/image` con las props de `MarcadorFoto`, con y sin prioridad. Comparan el HTML de servidor.
   - *Hallazgo:* `next/image` 16.3.3 **no** pinta `fetchpriority="high"` en la imagen prioritaria (`fill` + `unoptimized`): solo quita `loading="lazy"`, y React 19 antepone una precarga `<link rel="preload" as="image">`. La capa sigue a Next (paridad exacta, "ningún atributo cambia"); la letra del scenario "la foto se pinta igual" que pide `fetchpriority` necesita corrección vía `/spec` (b-dev.md).
- [x] 9. **Implementar** `src/components/compat/link.tsx` (`Link`) e `imagen.tsx` (`Imagen`) hasta que las pruebas de la tarea 8 pasen.
- [x] 10. **Cambiar los imports** en los 20 componentes (19 de `next/link`, 1 de `next/image`). Comprobar: `grep -rE "next/(link|image)" src/components` vacío, y el diff de esos archivos es solo la línea de `import`.
   - *Corrección:* el `grep` literal no puede quedar vacío sin tocar comentarios (`filtros-listado-negocios.tsx` l. 32 y `marcador-foto.tsx` l. 64 mencionan `next/link`/`next/image`, y la propia capa los nombra en su documentación). La comprobación es sobre imports: `grep -rnE "(from|import) ['\"]next/(link|image)['\"]" src/components` vacío. El requirement habla de importar.
- [x] 11. **Pruebas de render.** Correr los 41 archivos que usan `react-dom/server`: todos en verde, y `git diff` de `tests/` sin cambios en archivos existentes.
   - `git ls-files tests | xargs grep -l react-dom/server` da 43 archivos (no 41): los 43 en verde salvo [A1]/[A2] preexistentes.

## Lint y CI

- [x] 12. **ESLint sin Next** (`design.md` §5): configuración plana con TypeScript, React, hooks, jsx-a11y y `.astro`; conservar los `globalIgnores` actuales y sumar `dist/**`, `.astro/**`, `.vercel/**`. Comprobar: `npm run lint` con 0 errores; un hook dentro de un `if` y un `<img>` sin `alt` puestos a propósito lo reprueban (revertir).
   - `jsx-a11y/alt-text` sube de `warn` a `error` para que el `<img>` sin `alt` repruebe; `import/no-anonymous-default-export` se conserva con `eslint-plugin-import` (ya venía con `eslint-config-next`), para que solo se pierdan las `@next/next/*` (design.md §5).
- [~] 13. **CI.** En `.github/workflows/ci.yml`: lint → tipos (`npm run typecheck`) → build sin base (Astro) → migraciones → seed → `npm test`. Si Astro exige una versión de Node mayor que la del CI, subir `node-version` a 24 (runtime de Vercel). Comprobar: el CI del PR hacia `migracion-astro` en verde.
   - Hecho el `ci.yml` (paso nuevo "Revisar tipos"); Node 22 basta (Astro pide `>=22.12.0` y `setup-node` toma la última 22.x). Secuencia reproducida en local desde cero (sin `.astro/`, `.next/`, `next-env.d.ts`, `dist/`, `.vercel/`). **Pendiente:** abrir el PR hacia `migracion-astro` y ver el CI en verde (lo hace el validador).

## Cierre

- [x] 14. **Suite completa y diff.** `npm run lint`, `npm run typecheck`, `npm run build` y `npm test` en verde; `npm test` con los mismos archivos que la línea base más los nuevos. `git diff --stat` y `git status --untracked-files=all` sin cambios en `src/lib/` (el manejador de `/_image` vive en `src/astro/imagen-cerrada.ts`), `src/app/`, `openspec/specs/`, `vercel.json`, `prisma/` ni `spikes/`.
- [ ] 15. **PR hacia `migracion-astro`** (nunca `main`), enlazado en el ticket T-022.
