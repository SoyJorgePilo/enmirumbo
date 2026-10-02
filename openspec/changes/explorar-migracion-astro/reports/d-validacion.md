# Etapa D · validador — explorar-migracion-astro (T-021)

**Veredicto: APROBADO con pendientes humanos declarados.** El código del spike y el aislamiento de la app están completos y verificados en local; los scenarios que exigen infraestructura humana (preview de Vercel, Supabase desechable, Firefox, `verify-full` real, Lighthouse comparado) siguen abiertos y están declarados con honestidad en `tasks.md` (`[~]`), en `ADR-013-spike.md` ("sin evidencia aún") y en el PR. **Este PR no cierra T-021 ni decide ADR-013**: no hay recomendación go/no-go y la tarea 12 sigue `[ ]`.

## 1. Spec (scenario → verificación propia)

| Requirement | Estado | Cómo lo verifiqué |
|---|---|---|
| Aislado de la app | cumple (salvo el preview) | `git diff main --stat`: fuera de `spikes/` solo `tsconfig.json` (`exclude`), `eslint.config.mjs` (`globalIgnores`) y docs. Sin cambios en `src/`, `package*.json` raíz, `.github/`, `vercel.json`. Vitest raíz: `include: tests/**`. Lint y build raíz en verde |
| Formulario sin JS | cumple en local; Firefox/preview pendiente | curl: POST válido → 303 `/reportar/gracias` con `Referrer-Policy: strict-origin`; sin motivo → 303 `/reportar` y cookie con código cerrado; `Origin: null` → 403 (no 500). Lectura de `middleware.ts`, `actions/index.ts`, `reporte.ts`, `reportar.astro` |
| Sesión firmada | cumple en local; HTTPS real pendiente | curl: `Set-Cookie … HttpOnly; Secure; SameSite=Lax`; cookie válida 200, alterada 307, sin cookie 307 → `/acceso`. Lectura de `sesion.ts` (HMAC, `timingSafeEqual`, secreto ≥ 32) |
| Cabeceras y CSP | cumple en local con costo (403 de `checkOrigin`) | curl a `/estatica` (prerenderizada): las cuatro cabeceras idénticas a `cabecerasDeSeguridad()`, CSP sin `nonce-`. `cabeceras.ts` importa la función real de `src/lib/seguridad/csp.ts` |
| PostgreSQL con TLS verificado | cumple en lo verificable; `verify-full` real pendiente | Build: `.vercel/output/functions/_render.func/certs/supabase-root-2021-ca.crt` presente. `/negocios` → 200 con 3 negocios ficticios tras la semilla; sin tabla → 503 visible. `base.ts` rechaza `sslmode`/`sslrootcert` repetidos (M1 corregido) y `?host=`/`?hostaddr=` |
| Rendimiento | 0 JS propio verificado; Lighthouse comparado pendiente | `/negocios` sin ningún `<script>` |
| Reporte de veredicto | parcial, declarado | `ADR-013-spike.md` separa "Local (emulado)" de "Preview (lo que cuenta)"; la columna que cuenta dice "sin evidencia aún" en los 5 puntos; estado "incompleto — sin recomendación go/no-go". **No contiene veredictos sin evidencia.** ADR-013 sigue en `propuesta` |

## 2. Ticket

Ningún criterio de aceptación se marca: todos mencionan el preview o la recomendación go/no-go. El ticket pasa a `en-review` con los criterios sin marcar; el cierre real de T-021 requiere el paso humano y una segunda entrega.

## 3. Alcance

Sin scope creep. `scripts/servidor-local.mjs` (emulador del Build Output API) es herramienta de verificación del propio spike. ADR-013, backlog E9 y fila del índice de decisiones: autorizados (documentos de decisión).

## 4. tasks.md

`[x]` 1, 2, 6 verificados por mí. `[~]` 3-5, 7-11 coinciden con lo que falta de verdad. `[ ]` 12 correcto (no aplica sin veredicto de preview).

## 5. Seguridad

- c-seguridad: 0 crítico, 0 alto. M1 corregido (lo verifiqué en `base.ts:35` y en la prueba, que ya no es `it.fails`). M2 (403 de `checkOrigin` sin cabeceras y en inglés) registrado como costo 1a en ADR-013-spike.
- Escaneo propio del diff y de los archivos nuevos: solo URLs de ejemplo (`USUARIO:CLAVE@HOST`, `postgres:postgres@localhost`, `db.ejemplo.test`); sin JWT, tokens ni claves privadas. Certificado: CA pública, sin `PRIVATE KEY`, igual byte a byte a `certs/` de la raíz (ya versionado). Semilla: 3 negocios ficticios sin teléfono.
- `git check-ignore`: `spikes/astro/{node_modules,dist,.vercel,.astro,src/generated}` y `.env*` ignorados; no entran al commit.

## 6. Compuertas mecánicas (ejecutadas por mí)

| Gate | Resultado |
|---|---|
| `npm run lint` (raíz) | 0 |
| `npm run build` (raíz) | 0 |
| `npm test` (raíz, `db:local` arriba) | 3245 pasan, 2 omitidas, 1 falla: [A2] de `tests/reportes-seguridad-adversarial.test.ts` |
| Preexistente A1/A2 | **Confirmado de forma independiente**: worktree limpio de `main` (ee772ad), mismo archivo 5 veces → 1-2 fallas de [A1]/[A2] en cada corrida. No lo causa este change |
| Spike `npx vitest run` | 6 archivos, 42 pasan |
| Spike `tsc --noEmit` | 0 |
| Spike `npm run build` | 0; certificado dentro de `_render.func/certs/` |

`main` no tiene commits nuevos respecto a la rama (fusión no-op).

## 7. Convenciones

UI en español mexicano (`lang="es-MX"`, literales reusados de `src/lib/reportes/`). Sin `any` fuera de `src/generated/` (ignorado). Dependencias nuevas solo en `spikes/astro/package.json` y justificadas por la spec.

## Observaciones (bajo, no bloquean)

1. La cookie del aviso guarda `error.message` arbitrario: un POST sin `FormData` deja "This action only accepts FormData." (ya era la obs. 4 de c-seguridad). Sin impacto (la lectura solo acepta los dos códigos).
2. La URL local documentada apunta a `template1`: `db:semilla` crea `spike_negocio` en la plantilla y cualquier base nueva creada desde ella la heredaría. Borré la tabla al terminar mi muestreo. Usar otra base para el spike en local.
3. Deuda fuera del diff: `src/lib/base-datos/conexion.ts:62-65` (`modoTlsDeclarado`) lee el primer `sslmode` mientras `pg` usa el último (mismo hueco que M1). Va a ticket aparte.
4. Fila de `docs/metricas-pipeline.md`: no la agregó ninguna etapa; le toca al orquestador.

## Pendiente humano (bloquea el cierre de T-021)

Los pasos 1-8 de `docs/decisiones/ADR-013-spike.md` §Pendiente humano: preview en un proyecto de Vercel aparte, Supabase desechable, Firefox, `verify-full` real, Lighthouse comparado con producción, y luego veredicto go/no-go y tarea 12.

**Recordatorio:** el CI de GitHub Actions debe quedar en verde en el PR; esta validación local no lo sustituye. El merge lo hace un humano.
