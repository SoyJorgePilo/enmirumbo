# Etapa B · dev — explorar-migracion-astro (T-021)

No hubo etapa UI (`a-ui.md` no existe): spike sin diseño de producto.

## Resumen

Mini-app Astro 7 aislada en `spikes/astro/` que implementa los cinco puntos del spike. Todo lo verificable en local está verificado contra la salida real de `astro build` (`.vercel/output/`), servida por un emulador mínimo del Build Output API. **No hay preview de Vercel ni base desechable** (paso humano), así que el reporte de veredicto queda sin go/no-go y la tarea 12 no se toca.

## Tareas

| # | Estado | Nota |
|---|---|---|
| 1 | [x] | `spikes` en `exclude` de tsconfig y en `globalIgnores` de ESLint. Ver "Raíz" abajo |
| 2 | [x] | `npm run build` del spike en verde (`prisma generate && astro build`) |
| 3 | [~] | `.env.example` + `prisma/semilla.sql`; falta crear proyecto de Vercel y base Supabase |
| 4 | [~] | cabeceras capturadas en local (emulado); falta preview |
| 5 | [~] | consola de Chrome vacía en local; falta preview |
| 6 | [x] | Action `reportar` (`accept: 'form'`), PRG por middleware, literal de error, `strict-origin` |
| 7 | [~] | Chrome 154 JS apagado en local pasa; Firefox no instalado; falta preview |
| 8 | [~] | 200 / 307 ×3 / 503 sin secreto, en local; falta preview HTTPS |
| 9 | [~] | certificado en `_render.func/certs/`; errores visibles; falta `verify-full` real |
| 10 | [~] | 0 JS propio; Lighthouse local 100 (indicativo); falta corrida comparada |
| 11 | [~] | `docs/decisiones/ADR-013-spike.md` sin go/no-go |
| 12 | [ ] | no aplica aún |

## Mapa scenario → prueba / verificación

| Scenario | Cómo |
|---|---|
| el spike tiene su propio preview | **pendiente humano** (ADR-013-spike §Pendiente 1) |
| la app no se entera del spike | `npm run lint` raíz 0; `npm run build` raíz 0; `tsc -p . --listFilesOnly \| grep -c /spikes/` = 0; `eslint spikes/...` → "File ignored"; vitest raíz solo incluye `tests/**` |
| nada sensible en el repo | diff: solo `tsconfig.json`, `eslint.config.mjs`, `spikes/`, docs. Sin `.env`; `spikes/astro/.gitignore` propio (el de la raíz ancla `/node_modules` y `.vercel` a la raíz); negocios de la semilla ficticios |
| envío válido sin JS | Chrome headless JS apagado (puppeteer-core en scratchpad, fuera del repo) + registro del emulador (`REGISTRO=1`): POST → 303 → GET `/reportar/gracias` |
| recargar no reenvía | recarga = GET; contador de la instancia sigue en 1 |
| error de validación sin JS | `tests/reporte.test.ts` + Chrome: vuelve a `/reportar` con "⚠ Dinos qué pasa con este negocio"; URL sin texto |
| sin Origin nulo ni 500 | Chrome: `Origin: http://localhost:4321`. curl `Origin: null` → 403 (no 500). Firefox y preview: pendiente |
| la cookie se emite con sus atributos | curl: `HttpOnly; Secure; SameSite=Lax`, valor `<caducidad>.<HMAC>` |
| con cookie válida abre / sin cookie 307 / alterada 307 | `tests/sesion.test.ts` + curl contra el emulador |
| sin secreto, falla a la vista | `tests/sesion.test.ts` (`secretoDeSesion`) + curl: 303 sin `spike_sesion`, `/acceso` 503 con aviso |
| cabeceras en todas las respuestas | `tests/cabeceras.test.ts`, `tests/cabeceras-estaticas.test.ts` + curl (tabla en ADR-013-spike §3). Excepción: 403 de `checkOrigin` |
| la CSP no lleva nonce | `tests/cabeceras.test.ts` |
| componente React sin violaciones | Chrome con JS: consola vacía en `/componente-react` (local) |
| la página muestra datos de la base desechable | base local con `semilla.sql`: 200 con 3 negocios ficticios. Supabase: pendiente |
| el certificado viaja con la función | inspección de `.vercel/output/functions/_render.func/certs/supabase-root-2021-ca.crt` |
| sin verificación, no hay datos | `tests/base.test.ts` + 4 casos con el emulador → 503 sin datos |
| cero JS propio | HTML servido sin `<script>`/`modulepreload`/`astro-island`; Chrome solo pide documento + CSS |
| Lighthouse no baja | local 100 (indicativo). Comparación con producción: pendiente |
| un veredicto por punto / un punto falla / todos pasan | ADR-013-spike.md con columnas local/preview; sin go/no-go hasta el preview |

Spike: `cd spikes/astro && npm test` → 5 archivos, 24 pruebas en verde (escritas antes del código; se vieron fallar).

## Raíz

- `npm run lint` 0 · `npm run build` 0 · `npm test`: 3244 pasan, **2 fallan de forma intermitente** (`tests/reportes-seguridad-adversarial.test.ts` [A1]/[A2], carreras contra el cupo). Experimento controlado: con `tsconfig.json`/`eslint.config.mjs` de `HEAD` fallan 1–2 de 90 en 4/4 corridas; con el cambio, igual. Preexistente, ligado a la base local de `prisma dev` bajo concurrencia; no lo causa este change. El CI (Postgres de servicio) dirá si también ahí.
- Tuve que correr `npm ci` en la raíz (no había `node_modules`); no cambia `package.json` ni el lock.

## Decisiones técnicas

- **PRG en el middleware con rutas fijas**, no con `Referer` como en la doc de Astro: con `strict-origin` el `Referer` es solo el origen.
- **Aviso de error por cookie de un solo uso con código cerrado** (`motivo`|`comentario`): ni la URL ni la cookie llevan texto del vecino. Las sesiones de Astro en Vercel piden un driver externo; no se configuró.
- **Sesión propia en `src/lib/sesion.ts`** con el mismo formato que `src/lib/admin/sesion.ts`, en vez de importarlo: el real arrastra la configuración del panel (contraseña, `SITIO_URL`) y el alias `@/`.
- **Imports en solo lectura de la raíz** solo de módulos sin dependencias npm (`csp.ts`, `reportes/motivos.ts`, `reportes/textos.ts`, dos componentes sin imports): en Vercel con Root Directory `spikes/astro` no existe el `node_modules` de la raíz.
- **Integración `cabeceras-en-la-cdn`** para las páginas prerenderizadas (el adaptador solo propaga la CSP de `security.csp`). Lee `build.client` porque la copia a `.vercel/output/static` ocurre después de su hook; truena si el `config.json` no existe.
- **404 por petición** (`prerender = false`) para que lleve las cabeceras del middleware.
- **Tabla propia `spike_negocio` creada por SQL**, sin migraciones ni `db push`: así la semilla no puede tocar ninguna otra tabla de la base a la que se apunte.
- **Contra `localhost` no se exige TLS** (misma regla que `src/lib/base-datos/conexion.ts`); remota exige `verify-full` + `sslrootcert` existente; `?host=`/`?hostaddr=` se rechazan.
- **Copia del certificado público** en `spikes/astro/certs/` (CA pública de Supabase): `includeFiles` fuera de la raíz del proyecto de Vercel deja rutas frágiles.
- **Copia de los tokens de `globals.css`** en `src/estilos.css`: el `@import "tailwindcss"` del original se resolvería contra el `node_modules` de la raíz.

## Dependencias (solo en `spikes/astro/package.json`)

`astro`, `@astrojs/vercel`, `@astrojs/react`, `react`, `react-dom` (andamio de la spec); `@prisma/client`, `@prisma/adapter-pg`, `pg`, `prisma` (punto 4, mismas versiones que la app); `tailwindcss` + `@tailwindcss/vite` (CSS real para que Lighthouse sea comparable con la portada); `vitest`, `typescript`, `@types/*`. Ninguna en la raíz.

## Hallazgos para ADR-013 (fuera de alcance, propuestas)

1. **`checkOrigin` de Astro responde 403 en inglés y sin cabeceras de seguridad** antes del middleware. Fase 3 debe decidir si lo reemplaza por una comprobación en middleware.
2. **ADR-013 subestima el acoplamiento de `src/components/`**: 20/44 importan `next/link` o `next/image` y 9 reciben Server Actions como prop. La premisa "React puro, 41 pruebas sobreviven" necesita revisarse antes de aceptar el ADR.
3. El build emite `/_astro/client.*.js` (191 KB, runtime de React para islas) aunque no se cargue.
4. Aviso de Vercel: Node local 26 vs. runtime 24; fijar `engines` en las fases reales.

## Cómo reproducir en local

```
npm run db:local                                   # raíz, otra terminal
cd spikes/astro && npm ci && npm test && npm run build
DATABASE_URL='postgresql://postgres:postgres@localhost:51214/template1?sslmode=disable' npm run db:semilla
REGISTRO=1 SPIKE_SESION_SECRETO=$(openssl rand -base64 32) DATABASE_URL='…igual…' npm run servir:local
```
Pasos del preview: `docs/decisiones/ADR-013-spike.md` §Pendiente humano.

**Corrección M1 (c-seguridad.md):** `revisarConexion` (`spikes/astro/src/lib/base.ts`) ahora rechaza con `no-interpretable` cualquier `sslmode` o `sslrootcert` repetido, porque `pg` usa el último valor y la guarda leía el primero.
TDD: el `it.fails("M1: …")` de `spikes/astro/tests/adversarial-seguridad.test.ts` pasó a `it` normal (se vio rojo antes del arreglo) y se le añadieron los casos "repetido con el mismo valor" y "`sslrootcert` repetido".
Resultado: `cd spikes/astro && npx vitest run` → 6 archivos, 42 pasan, 0 fallos esperados; `tsc --noEmit` limpio.
Cambio mínimo y solo dentro de `spikes/astro/`; no se tocó `src/`.
Deuda: `src/lib/base-datos/conexion.ts` (`modoTlsDeclarado`, l. 62-65) usa el mismo criterio de "primera coincidencia"; va a un ticket aparte.
