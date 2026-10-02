# Etapa B · dev — agregar-andamio-astro (T-022)

No hubo etapa UI (`a-ui.md` no existe): el change no dibuja pantallas.

## Resumen

Astro 7.3.5 en la raíz (`output: 'server'`, `@astrojs/vercel` 11 con el certificado en la función, `@astrojs/react` 7, Tailwind por el `postcss.config.mjs` existente). `npm run build` = `astro build` y construye sin ninguna página ni base. Vitest envuelto con `getViteConfig` y capaz de pintar `.astro`. Capa `Link`/`Imagen` con paridad exacta contra Next, ya usada en los 20 componentes (solo cambió la línea de import). ESLint sin `eslint-config-next`. CI con paso de tipos. Next queda inerte (`src/app/`, `next.config.ts` y `next` intactos).

## Línea base y resultado de `npm test`

| | Archivos | Pruebas |
|---|---|---|
| Antes (HEAD, base local `prisma dev`) | 110 (109 pasan, 1 falla) | 3244 pasan, 2 fallan ([A1]/[A2]), 2 saltadas |
| Después | 112 (111 pasan, 1 falla) | 3253 pasan (3244 + 9 nuevas), 2 fallan ([A1]/[A2]), 2 saltadas |

Las únicas rojas son [A1]/[A2] de `reportes-seguridad-adversarial` (carreras contra el cupo en `prisma dev`, preexistentes). Ninguna aserción existente cambió; `tests/` solo suma `compat-paridad.test.ts`, `plataforma-astro-humo.test.ts` y `fixtures/humo-react.astro`.

## Tareas

| # | Estado | Nota |
|---|---|---|
| 1 | [x] | `eslint-plugin-astro@^1.7.0` (2.x/3.x exigen ESLint 10). Plugins de lint en las mayores que ya traía `eslint-config-next`. `npm ci` limpio |
| 2 | [x] | `.gitignore`: `/dist/`, `/.astro/`. Tras build, `git status` sin generados |
| 3 | [x] | `astro.config.mjs`; `tsconfig.json` + `.astro/types.d.ts`, `exclude: dist`. `astro sync` limpio |
| 4 | [x] | Corregida en tasks.md: `typecheck` = `next typegen && astro check`; `start` eliminado |
| 5 | [x] | Build sin base en verde, sin páginas; no hubo que crear la 404 |
| 6 | [x] | `getViteConfig` conserva alias, include, `fileParallelism`, env, globalSetup y `.env` |
| 7 | [x] | Prueba primero (roja por fixture ausente), luego fixture |
| 8–9 | [x] | Paridad en rojo (módulo ausente) → capa → verde |
| 10 | [x] | 19 `Link` + 1 `Imagen as Image`; verificación por imports (ver correcciones) |
| 11 | [x] | 43 archivos con `react-dom/server` (no 41), todos verdes salvo [A1]/[A2] |
| 12 | [x] | 0 problemas; hook condicional y `<img>` sin `alt` reprueban |
| 13 | [~] | `ci.yml` hecho y reproducido en local; falta ver el CI del PR hacia `migracion-astro` |
| 14 | [x] | lint, typecheck, build y test en verde (salvo [A1]/[A2]); nada en `src/lib`, `src/app`, `openspec/specs`, `vercel.json`, `prisma/`, `spikes/` |
| 15 | [ ] | PR: lo abre el validador hacia `migracion-astro` y lo enlaza en T-022 |

## Mapa scenario → prueba / verificación

| Scenario | Cómo |
|---|---|
| build sin base | `DATABASE_URL=postgresql://nadie:nadie@127.0.0.1:1/ninguna npm run build` → exit 0, deja `.vercel/output/`. Nada importa la base (no hay páginas). En CI: paso "Build sin base de datos" |
| el build no es el de Next | Con `.next/` borrado, el build no lo crea. `config.json` solo tiene rutas internas de Astro (`/_astro`, `/_server-islands`, `/_image`, `/404`, comodín 404 → `_render`); `grep -r src/app dist .vercel/output` vacío. `static/` lleva los SVG de `public/` (no son rutas de `src/app/`) |
| el certificado viaja con la función | `.vercel/output/functions/_render.func/certs/supabase-root-2021-ca.crt`, handler `dist/server/entry.mjs` en la misma raíz → `sslrootcert=certs/...` resuelve |
| componente React sin JS | `tests/plataforma-astro-humo.test.ts` (Container API + `SelloVerificado`). Probado por mutación: con `client:load` la prueba se pone roja |
| las pruebas pueden pintar Astro | mismo archivo, caso "las pruebas pintan un .astro" |
| ningún componente importa Next | `grep -rnE "(from\|import) ['\"]next/(link\|image)['\"]" src/components` vacío |
| el enlace se pinta igual | `tests/compat-paridad.test.ts`: header, tarjeta y `aria-current`/`aria-label`, HTML idéntico a `next/link` |
| la foto se pinta igual | mismo archivo: con y sin prioridad y otro `className`, HTML idéntico a `next/image`; `lazy` en la no prioritaria, ningún `/_next/image`. **`fetchpriority`: ver hallazgo 1** |
| las pruebas de render no se enteran | `npx vitest run` de los 43 archivos: 42 verdes + [A1] intermitente; `git diff tests/` vacío para existentes |
| la misma suite, en verde | tabla de arriba |
| sin la configuración de Next | `eslint.config.mjs` no importa `eslint-config-next`; `--print-config` comparado antes/después: solo faltan `@next/next/*` |
| un hook mal usado reprueba | archivo temporal con `useState` en un `if` → `react-hooks/rules-of-hooks` error, exit 1 (borrado) |
| una imagen sin alt reprueba | archivo temporal con `<img>` sin `alt` → `jsx-a11y/alt-text` error, exit 1 (borrado) |
| PR a la rama de la migración | **pendiente**: CI real del PR. Secuencia lint → tipos → build sin base reproducida en local desde cero |
| un error de tipos reprueba | `src/app/zz-error-temporal.ts` con `const x: number = "texto"` → `npm run typecheck` exit 1 (borrado) |
| el diff no toca producto | `git status`: nada en `src/lib`, `src/app`, `openspec/specs`, `vercel.json`, `prisma/`, `spikes/`; `src/components` = 20 líneas de import + `compat/` nuevo |
| producción no se entera | rama desde `migracion-astro`; el PR debe apuntar ahí (validador) |

## Decisiones técnicas

- **`typecheck` con `next typegen`.** `astro check` cubre todo el `tsconfig` (`.astro`, `.ts`, `.tsx`), pero en un clon limpio `src/app/` no tipa: `PageProps`, `LayoutProps` y `RouteContext` son globales que genera Next (20 errores sin `.next/types`). `next typegen` solo genera tipos (2.5 s), no construye ni compila rutas; es lo que la doc de Next (`06-cli/next.md`) recomienda para CI. Se retira con `src/app/` en T-027. Efecto: tras `typecheck` existe `.next/types/` (el build no crea `.next/`).
- **Sin `start`.** `@astrojs/vercel` no implementa `astro preview`. Nada lo usaba.
- **`passthroughImageService`.** Astro inyecta `/_image` en toda salida `server` (no se puede quitar sin trucos); con este servicio no transforma, y sin `image.domains` no trae imágenes externas. El adaptador queda con `imageService` apagado (su default).
- **`Imagen` no pinta precarga propia.** La `<link rel="preload" as="image">` de la foto prioritaria la emite React 19 al pintar en servidor un `<img>` no diferido; ponerla a mano la duplicaba. Basta con omitir `loading`. `sizes` se acepta y no se pinta (Next tampoco con `unoptimized`).
- **`Link` sin `default export`**: los componentes cambian a `import { Link } from "@/components/compat/link"`; `MarcadorFoto` usa `import { Imagen as Image }` para no tocar su JSX.
- **ESLint**: mismas reglas efectivas que con Next salvo `@next/next/*` (comparadas con `--print-config` en un `.tsx` de componente y en una prueba). `eslint-plugin-import` declarado directo (ya venía en el árbol) para conservar `import/no-anonymous-default-export`. `jsx-a11y/alt-text` sube a `error` (más duro). Parser: el de `typescript-eslint` para todo (Next usaba Babel para `.js/.mjs`); sin diferencias en el resultado.
- **Node del CI en 22**: Astro pide `>=22.12.0`, `setup-node@v5` con `22` toma la última 22.x.
- **Prueba de humo**: la aserción del `<main>` no cierra en `>` porque en Vitest (modo dev) Astro anota `data-astro-source-*`.

## Dependencias nuevas

`astro`, `@astrojs/vercel`, `@astrojs/react` (deps); `@astrojs/check`, `typescript-eslint`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`, `eslint-plugin-import`, `eslint-plugin-astro@1` (dev). Todas pedidas por la spec salvo `eslint-plugin-import` (justificado arriba; ya estaba instalado transitivamente).

## Hallazgos y propuestas (fuera de alcance)

1. **Corrección de spec necesaria (`plataforma-astro`, requirement "Los componentes no dependen de Next…", scenario "la foto se pinta igual").** Pide a la vez "los dos `<img>` llevan los mismos atributos" y "la prioritaria con `fetchpriority="high"`". `next/image` 16.3.3 con `fill` + `unoptimized` + `priority` **no** pinta `fetchpriority` (verificado en `get-img-props.js` y en el render): quita `loading` y React antepone `<link rel="preload" as="image">`. Implementé la paridad (que además cumple "ningún atributo visible cambia"). Antes de archivar, corregir la letra vía `/spec`: o quitar `fetchpriority` del requirement y del scenario, o decidir aparte agregarlo (sería un cambio de HTML respecto a producción).
2. **Tercera prueba intermitente preexistente**: `tests/admin-listado-paginas.test.ts` "un estado con inyección se ve igual que 'Todos'" afirma `not.toContain("xyz")` sobre un HTML que lleva IDs `cuid()` (base36) en los `href`; un ID con "xyz" la tumba. Le pasó 1 vez en 4 corridas completas; aislada pasó 3/3. No la causa este change. Propuesta: ticket aparte para acotar la aserción.
3. **`astro dev` en Astro 7 queda como demonio** (`npx astro dev stop` para detenerlo). Conviene anotarlo en `docs/despliegue.md` en la fase que lo documente.
4. **Servir la salida de Vercel en local** (antes `next start`): sin `astro preview`, la verificación manual de fases 2–5 necesitará `vercel dev` o el emulador del spike (`spikes/astro/scripts/servidor-local.mjs`).
5. **Letra desfasada** de `despliegue` ("`next build` DEBE completarse sin base"): el CI ya lo exige para `astro build`; enmienda pendiente según proposal.md.
6. Siguen abiertos: aviso de Node 26 local vs. 24 de Vercel (`engines`), `/_astro/client.*.js` emitido aunque nadie lo cargue, y la deuda de `modoTlsDeclarado` en `src/lib/base-datos/conexion.ts`.

## Cómo reproducir

```
npm run db:local                       # otra terminal
npm ci && npm run lint && npm run typecheck
DATABASE_URL=postgresql://nadie:nadie@127.0.0.1:1/ninguna npm run build
ls .vercel/output/functions/_render.func/certs/
npm test
```

## Correcciones tras c-seguridad (Medios 1–3)

- **M1 `/_image`:** Astro la inyecta sin opción en toda salida `server` (`create-manifest.js:529`). Su manejador pasa a `src/astro/imagen-cerrada.ts` (fuera de `src/lib/`, que la spec deja intacto) (404, sin relevo, sin caché) vía `image.endpoint.entrypoint`, y `sinRutaDeImagen` (en `astro.config.mjs`) la quita de `.vercel/output/config.json` filtrando el hook `astro:routes:resolved` del adaptador (truena el build si el hook desaparece). Ya no se empaqueta `endpoint/generic.js`. Comentario del config corregido.
- **M2:** `overrides: { "@vercel/routing-utils": { "path-to-regexp": "^6.3.0" } }` → 6.3.0 en el lock. `npm audit`: 10 → 7, los mismos 7 de la línea base (sin nuevos).
- **M3 + M1:** `tests/plataforma-astro-build.test.ts` corre `astro build` (≈2 s, sin base) y prueba: `.next/` sin cambios, ninguna ruta de `src/app/`, certificado en la función idéntico al del repo, `/_image` fuera de la tabla de Vercel, handler construido responde 404 a `/_image?href=/admin/negocios` con cookie sin `fetch` ni caché pública, y ningún `next/link`/`next/image` en `src/components/`. Rojo antes (4 fallas de `/_image`), verde después.
- Cierre: lint 0, typecheck 0 errores, build sin base Complete, `npm test` 113/114 archivos (solo [A1] preexistente).
