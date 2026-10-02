# Fusión de `origin/main` (T-016 SMS, T-020 aviso diario) en `migracion-astro`

Rama `chore/fusionar-main-en-migracion`, `git merge --no-commit` de `8d514f5`. Criterio: lo ya migrado
(Home, legales, 404, directorio, ficha, buscador) se pinta con Astro (`pintarPagina`, `tests/paginas-directorio.ts`);
lo que sigue en Next (`/registro/gracias`, `/registro/verificar`, sus acciones) conserva la versión de `main`.
Sin commit: todo resuelto y en el índice, sin rutas `U`.

## Conflictos (4 guardianes)

| Archivo | Resolución | `expect(` rama / main / fusión |
|---|---|---|
| `tests/analitica-privacidad.test.ts` | Gracias: llamada async con `searchParams` de main (T-016). Aviso y términos: `pintarPagina` de la rama. | 22 / 22 / 22 |
| `tests/buscador-pagina.test.ts` | Unión de las dos listas de no indexables: `500.astro` y `src/astro/buscar.ts` (rama) + `registro/verificar/page.tsx` (main). Siguen los recorridos de `src/app` + `src/pages` y el mínimo de 4 `.astro`. | 60 / 59 / 60 |
| `tests/layout.test.ts` | Imports: se queda solo `RegistroVerificarPage` de main; Home, Términos y 404 vienen de `src/pages/*.astro` (rama). El cuerpo se fusionó solo: `htmlVerificar`, `/registro/verificar` en rutas y su revisión de enlaces. | 158 / 140 / 159 |
| `tests/responsivo-guardian.test.ts` | Imports de las dos: Gracias y Verificar de Next, más las variables de `verificacion/config`, `paso` y `peticion`; Home, legales y 404 de Astro, más `pintarBuscar/Destino/Ficha`. Cuerpo: las 6 pantallas nuevas de main (3 de gracias y 3 de verificar) junto a las pantallas de Astro de la rama. | 20 / 20 / 20 (+6 pantallas medidas) |

## Fusionados sin conflicto pero rotos en el sentido (los ajusté para no dejar huecos)

- `tests/verificacion-seguridad-adversarial.test.ts` (de main): pintaba la ficha con la página de Next
  `negocio/[ficha]/page`, que ya no es la que se sirve. Ahora usa `pintarFicha(...)`, comprueba `status === 200` y
  revisa el **documento completo** (cabeza, metadatos y JSON-LD incluidos). Es más estricta: 94 → 95 `expect(`.
- `tests/verificacion-modelo.test.ts` ("la marca no sale a lo público"): solo recorría `src/app/(publico)` y
  `src/app/sitemap.ts`. Ahora recorre también `src/pages`, `src/layouts` y `src/astro`, y revisa archivos `.astro`.
  Hoy no hay ninguna mención ahí.
- `tests/verificacion-failsafe.test.ts` ("la ruta nueva no entra al sitemap"): revisaba solo el sitemap de Next.
  Ahora revisa también `src/pages/sitemap.xml.ts`, que es el que se sirve, con las mismas dos aserciones.
- **Código de producción, 1 línea (para que lo veas):** `src/components/registro/formulario-verificar-codigo.tsx`,
  que llegó de main, importaba `next/link`. Eso tumbaba el guardián de la rama
  `plataforma-astro-build › no aparece next/link ni next/image en src/components/`. Lo cambié por
  `import { Link } from "@/components/compat/link"`, el mismo reemplazo que T-022 hizo en los otros 20 componentes,
  con paridad de HTML comprobada en `compat-paridad`. No cambian ni la conducta ni el marcado. Lo considero parte de
  resolver la fusión, no código nuevo. Si no lo quieres así, se revierte con esa sola línea y el guardián vuelve a
  quedar en rojo.
- Revisados y sin nada que tocar:
  - `despliegue` y `verificacion-despliegue`: las variables nuevas de `.env.example` y `docs/despliegue.md` se
    fusionaron limpias y pasan.
  - `vercel.json`: el cron de la purga queda en `17 13 * * *`, el de main.
  - `analitica-exclusion-admin` y `directorio-*`: pasan.
  - `aviso-pendientes-*`: siguen importando la ruta de Next `api/tareas/purgar-rechazados`. Es correcto, esa ruta no
    se ha migrado.
  - Las rutas de Next que llegaron de main (verificar, gracias, acciones) siguen inertes en el build de Astro, como
    el resto de Next en esta rama (Fase 3).

## Compuertas

- `npm run lint`: 0 errores.
- `npm run typecheck` (`next typegen && astro check`): 0 errores, 0 advertencias (396 archivos, 9 hints preexistentes de `toThrowError`).
- `npm run build` sin `DATABASE_URL` ni `.env`: `Complete!`, salida 0. Lo corrí antes y después del cambio del componente.
- `npm test` con una base propia `prisma dev --name fusionf3` (puerto 51290), **detenida al terminar**:
  - 1.ª corrida: 1 roja, el guardián de `next/link` de arriba.
  - 2.ª corrida, ya con todo: **142/142 archivos, 3976 pasan, 3 fallos esperados, 2 saltadas, 0 rojas**.
  - Las intermitentes [A1]/[A2] no aparecieron en esta corrida.
- Nota del worktree: no tenía `node_modules`. Corrí `npm ci` con el lockfile sin cambios (los scripts de instalación
  no se ejecutaron por `allowScripts`) y `npx prisma generate`. Ninguno de los dos cambia archivos versionados.

## Pendiente para el validador

Revisar y commitear la fusión. Ningún guardián quedó más laxo: donde cambió la forma de pintar, el `expect(` sigue
siendo igual o más estricto.
