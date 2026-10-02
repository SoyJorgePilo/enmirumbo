# Etapa D · validación — agregar-andamio-astro (T-022)

**Veredicto: aprobado** (revalidación). En la primera validación hubo un rechazo: el change creaba `src/lib/astro/imagen-cerrada.ts`. Eso ya está corregido. El manejador vive ahora en `src/astro/imagen-cerrada.ts` y `src/lib/` no tiene diff ni archivos nuevos. Volví a correr todas las compuertas desde limpio.

Ruta completa. Etapa A saltada (no hay pantallas). Rama `feature/agregar-andamio-astro` sobre `migracion-astro` (`20e6460`). El PR va hacia `migracion-astro`, nunca hacia `main`.

## Hallazgos

Ninguno bloqueante.

- **Corregido (era el Medio de la primera vuelta):** `git status --untracked-files=all -- src/lib` sale vacío y `git diff -- src/lib` también. `astro.config.mjs:63` apunta a `./src/astro/imagen-cerrada.ts`, y `b-dev.md` y `tasks.md:41` ya lo dicen así. El Bajo de `tasks.md` (tarea 14) queda resuelto con el mismo cambio.

### Pendientes conocidos (no bloquean; quedan declarados en el PR)

- **Tareas 13 `[~]` y 15 `[ ]`:** la 13 necesita ver el CI del PR en verde. La 15 es el propio PR.
- **Contradicción `fetchpriority`:** el scenario "la foto se pinta igual" pide `fetchpriority="high"`, pero `next/image` 16.3.3 no lo emite y la capa sigue a Next para conservar la paridad exacta. Se corrige con `/spec`.
- **Enmiendas de `proposal.md`, también por `/spec`:**
  - letra de `despliegue` ("`next build` DEBE completarse sin base");
  - requirements de `layout-base`, `directorio-publico`, `paginas-legales` y `revision-admin` para T-023/T-026.
- **Deuda:** la prueba `admin-listado-paginas` es intermitente porque depende del orden de IDs cuid. En esta corrida pasó.
- **`next` en `main`:** tenía un aviso crítico. Se atiende aparte, en otro PR; no entra en este change.
- **Ticket:** dice "41 archivos de render", pero son 43. Lo anoté en el criterio.

## Compuertas (corridas por mí)

Antes de empezar borré `.next/`, `.astro/`, `dist/`, `.vercel/` y `next-env.d.ts`.

| Gate | Resultado |
|---|---|
| `npm run lint` | exit 0, 0 problemas |
| `npm run typecheck` | 328 archivos, 0 errores, 0 avisos (45 hints) |
| `DATABASE_URL=postgresql://nadie:nadie@127.0.0.1:1/ninguna npm run build`, desde limpio | exit 0, "Complete!", **no crea `.next/`** (el `.next/types` que aparece después de typecheck sale de `next typegen`, no del build: lo comprobé reconstruyendo en limpio) |
| `npm test` | **114/114 archivos, 3289 pasan, 2 saltadas, 0 fallan** |

Para `npm test` usé una base propia: `prisma dev --name reval022`, puertos 51229-51232. Es distinta de `enmirumbo` (51213-51216) y de las otras corridas. Antes de la suite corrí `db:migrar` y `db:seed`, y al terminar la detuve y la borré.

## Verificado

1. **`/_image` cerrado en el build real.** Llamé a `default.fetch` de `.vercel/output/functions/_render.func/dist/server/entry.mjs` con `fetch` interceptado y una cookie de admin ficticia. `/_image?href=/admin/negocios`, `/_image?href=/api/foto/x&w=10`, `/_image/` y `/no-existe` responden 404, sin `cache-control` y con 0 relevos `fetch`. En `config.json` solo hay `/_astro`, `/_server-islands`, `/404` y el comodín 404: no aparece `/_image` ni nada de `src/app/`.
2. **Certificado.** `_render.func/certs/supabase-root-2021-ca.crt` es igual byte a byte al del repo (`cmp`).
3. **Alcance.** `src/app`, `src/lib`, `openspec/specs`, `vercel.json`, `prisma/`, `next.config.ts` y `spikes/` no tienen diff.
   - `src/components/`: 20 archivos con exactamente una línea de `import` cambiada cada uno (19 `Link`, 1 `Imagen as Image`), más `compat/` nuevo.
   - `tests/`: solo hay archivos nuevos.
   - El único archivo nuevo fuera de lo anterior es `src/astro/imagen-cerrada.ts`: un `GET` que responde 404, sin otra lógica. Respecto a la primera validación, el conjunto de archivos no cambió salvo ese movimiento.
4. **Spec.** Los scenarios ya estaban cubiertos en la primera vuelta y ahora también lo está "el diff no toca producto". El de `fetchpriority` se cubre según el comportamiento de Next; su letra queda pendiente de `/spec`.
5. **Seguridad.** El reporte C tiene 0 críticos y 0 altos, y sus Medios 1-3 están corregidos. Barrí el diff y los archivos nuevos: no hay secretos, teléfonos, nombres reales ni URLs de base, salvo `nadie:nadie@127.0.0.1:1`. `dist/`, `.astro/` y `.vercel/` están ignorados. En el CI no hay `pull_request_target` ni secretos nuevos. Queda como sugerencia de C, no bloqueante: declarar `permissions: { contents: read }`.
6. **Convenciones.** No hay `any` en los archivos nuevos ni texto de UI nuevo. Las dependencias son las de la tarea 1, más `eslint-plugin-import`, que está justificada.

**Recordatorio:** el CI de GitHub Actions tiene que quedar en verde en el PR, y mi validación local no lo sustituye. El merge a `migracion-astro` lo hace un humano.
