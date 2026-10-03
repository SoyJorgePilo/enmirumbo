# Etapa D · validación: migrar-tareas-programadas-astro (T-027, mitad 6a)

Worktree `enmirumbo-f6a`, rama `feature/astro-tareas-programadas`, apilada sobre `origin/feature/astro-verificacion-sms` (`a4d560e`, no se movió: no hubo que fusionar). Todo re-verificado por mí desde limpio (`.vercel`, `dist`, `.astro` y la caché de Vitest borrados).

## Veredicto

**APROBADO.** 0 críticos, 0 altos, 0 medios. Una corrección mía de 1 línea (B2) y 3 notas bajas. PR en borrador apilado sobre #38.

## Hallazgos propios

- **V1 · bajo · arnés, corregido.** `scripts/sembrar-tareas.mjs:175-177`: el `consultar` manda cada `Date` como `toISOString()`. Las columnas son `timestamp` sin zona y `pg` serializaba en la hora local, con edades corridas 6 h en CST (B2 de C). Ahora va en UTC, como Prisma. Las suites, el diff y la sonda se corrieron con el arreglo.
- **V2 · bajo · preexistente, candidato a ticket.** `tests/admin-listado-paginas.test.ts:561` exige `not.toContain("xyz")` sobre un HTML que trae ids cuid aleatorios. En la corrida PG falló porque un id traía `…xloxyzy3` (azar ~0.2 % por corrida). Al repetir el archivo solo: 51/51. No es de este change.
- **V3 · nota para el preview/corte.** Intenté repetir el `vercel build` de C (v62.2.0 del caché de `npx`, sin red, en una copia del árbol) y no pude: con `next` aún en `dependencies` y `next.config.ts` presente, el CLI eligió `@vercel/next` ("Detected Next.js version: 16.3.8") aunque la copia declaraba `framework: "astro"`, y falló al no hallar `.next`. **No pude confirmar por mi cuenta la fusión de `crons`**: queda como evidencia de C más la verificación humana del panel. Que el preview construya como Astro ya es preexistente desde la Fase 1 y se cierra con el retiro de Next en 6b. Lo dejo en la lista humana del PR.
- **B1 (C) confirmado.** `compararPaso6a` acepta cualquier estado de Astro en `otro-metodo`. Mi mutación `POST = GET` (abajo) la reprobaron la sesión `puerta` (estado final) y `-puerta` ("otros métodos == firma del 404 malo"). No hace falta más.
- **B3 (C)** `TRACE` tumba el emulador (`scripts/servir-salida-vercel.mjs:106`). Es infraestructura de pruebas: queda como nota.
- **B4 (C), decidido: sin prueba permanente.** El requirement exige que el `grep` de imports de `src/app/api/tareas` en `tests/` salga vacío, y `src/app/` se borra en 6b. Lo reproduje una vez: corrí las 4 suites **anteriores** (`git show HEAD:tests/…`, sin re-apuntar) contra las rutas de Next del árbol, con la función ya mudada: **142/142**. Después borré las copias.

## Compuertas (mías)

| | Resultado |
|---|---|
| `npm run lint` | 0 problemas (también después de V1) |
| `npm run typecheck` | 0 errores, 0 avisos |
| `npm run build` con `DATABASE_URL` a `127.0.0.1:1` | completo |
| CI en orden, **PostgreSQL 16 real desechable** (`pgd6a`, :55461): `migrate deploy` → `db:seed` → `npm test` | 175 archivos; 4442 pasan, 2 expected fail, **1 falla = V2** (preexistente, verde al repetirla) |
| `prisma dev --name d6aval` → `npm test` | **175 archivos, 4437 pasan, 2 expected fail, 6 saltadas** (concurrencias preexistentes de PGlite), 0 fallas |
| Base tras la suite PG | `Negocio` 0, `IntentoDeCupo` 0, `Reporte` 0; sin directorios `tareas-*`/`d6asonda-*` en `tmpdir`; en `.fotos-test` quedan solo las 2 fotos preexistentes de `seo-*` (hallazgo 5 de B, ninguna `f6a…`) |

`_render.func`, medido por mí tras el build limpio: **0 archivos bajo `node_modules/next/`**, 483 archivos y 30 972 KB. Con la mutación de `next/navigation` en `secreto.ts` vuelven los archivos de `next/dist/client/components/…` (el antes de 62 lo trae B, y con esta mutación lo repite C).

## Diff contra Next de `origin/main` (`8d514f5`)

`git archive` en el scratchpad, `npm ci` y `next build` **sin** `SITIO_URL` (igual que la build de las pruebas), con base ficticia propia (`d6adiff`).

```
DATABASE_URL=…/d6adiff npx tsx scripts/diff-html.mjs --solo-6a <next-main>   → exit 0
75 igual · 12 ACEPTADA (otro método: 10 × 405/204→404 vacío; POST ajeno 405→403; POST ?_action 405→404) · 2 anotadas (barra final: Next 308 / Astro 404 sin secreto)
`Vary: rsc, next-router-…` de Next no replicada: 74 pasos (aprobado: anuncia el marco)
Cero diferencias en 15 sesiones y 89 pasos (estado de la base y del almacén incluido).
```

Mi primera corrida, con Next construido **con** `SITIO_URL`, dio 4 diferencias en la 404 HTML de `/api/tareas/inventada` (`og:image`/`twitter:card`). Era una asimetría de mi montaje, no del producto: con las dos builds sin `SITIO_URL` sale en 0.

**Diff completo 2a+2b+3a+3b-1+3b-2 en vivo: no corrido.** Pide el Storage falso HTTPS, el Twilio falso, los datos de 2b y las builds A/B/C de los dos lados (el montaje de la d-validacion de 3b-2). Este change no toca ninguna de esas rutas: lo único compartido es `secreto.ts`, que importa el middleware. Sus suites de paridad contra fixtures de Next están en verde en las dos bases, sobre la build de este árbol.

## Reproducciones propias (sonda temporal con `fetch` crudo; Next de `main` contra la salida de Astro, base `d6aprobe` y Resend falso; borrada)

- **(a) Puerta.** Probé 10 formas en 2 rutas, con GET y HEAD (40 casos): ausente, vacío, `Bearer ` vacío, truncado, uno de más, `Basic`, `Token`, sin esquema, `bearer` y misma longitud. Todos dan un único 404: 0 bytes, sin `content-type`, igual al de Next salvo la `Vary`. Es igual a la foto inventada salvo `no-store`. `/a/b/c` es la 404 HTML en los dos, la misma asimetría que en Next. Sin `CRON_SECRET`, con `""` y con `"   "`, el secreto de antes da ese mismo 404. Al final: estado intacto, 0 correos y 0 líneas `[purga]/[fotos]/[aviso]`.
- **(a') Antes de la base:** lo prueba la mutación 1 (abajo); la base "tarpit" de `-puerta` lo detecta.
- **(b) Métodos.** HEAD con el secreto da 200 = Next, sin cuerpo, y ejecuta. POST/PUT/PATCH/DELETE/OPTIONS con el secreto dan el 404 de la puerta, contra Next `405×4, 204` por ruta, y no ejecutan.
- **(c) Purga, en UTC.** Quedan 89 d y 90 d − 5 min; se van 90 d + 5 min y 91 d (igual en Next). La segunda corrida da ceros.
  - Foto rota: 500 `{"eliminados":1,"fallidos":1,…}`; queda la ficha y solo la variante no borrable (los archivos van antes que la fila).
  - Barrido: los 8 archivos de los tres negocios vivos y la huérfana reciente siguen ahí; se va solo la vieja.
  - Aviso: un envío a `admin@ejemplo.invalid`, sin nombres, WhatsApp ni ids, y JSON igual al de Next.
  - Si el aviso falla, da 500 `aviso:"fallido"` y lo purgado se queda purgado. Con la base caída, 500 `{"error":"No se pudo completar la purga.","aviso":"fallido"}`. Sin `RESEND_API_KEY`, 200 `sin-configurar` y 0 llamadas.
- **(e)** En 9 casos con cuerpo, el JSON y las cabeceras son iguales a Next byte a byte (solo se excluyen `date`, transporte y `vary`).
- **(f)** Revisé el 404, el JSON 200/500, HEAD y POST: las cuatro de `cabecerasDeSeguridad()` van con su valor exacto. El JSON lleva `noindex, nofollow` y ningún `Cache-Control`.

## Guardianes y mutaciones (mías; todas revertidas y comprobadas con `cmp`)

1. `await obtenerPrisma().negocio.count()` antes de la puerta (purga). **4 rojas**: tarpit (60 s), `base-caida` contra Next, "purga no se completa" y la regex de "primera sentencia".
2. `export const POST = (c) => GET(c)` en la purga. **2 rojas**: `puerta` contra Next (estado final) y "POST… el 404 vacío de la puerta".
3. `import { notFound } from "next/navigation"` en `src/lib/tareas/secreto.ts`. **3 rojas** en `plataforma-astro-sin-next`: archivos de `next` en `_render.func`, "módulo importa next/*" y "secreto.ts no importa next".

Pruebas re-apuntadas, con `expect(` antes → después, según mi conteo: `tareas-programadas` 15→20 · `purga-rechazados` 53→53 · `aviso-pendientes-tarea` 52→53 · `aviso-pendientes-adversarial` 128→130 · `despliegue` 66→70 · `buscador-pagina` 60→60. 0 `skip/only/todo` nuevos. El `grep` de imports de `src/app/api/tareas` en `tests/` sale vacío. Leí el diff de cada una: ninguna es más laxa. Las de `NEXT_HTTP_ERROR_FALLBACK` pasan a 404 + cuerpo vacío + sin `content-type`, y `purga-rechazados` exige además **cero** cabeceras.

## Alcance (contra la base `a4d560e` y contra `origin/main`)

- `src/lib/`: solo `tareas/secreto.ts`. Contra `origin/main`, desde `secretoDeTareaCorrecto` hasta el final es idéntico (`diff` vacío). `respuestaDeTareaNoExistente` está byte a byte en `src/app/api/tareas/no-existe.ts:37`.
- `src/app/`: solo `api/tareas/no-existe.ts` y el import en las dos rutas (+2 −1 cada una). El cuerpo de los `GET` de Astro es el de Next línea por línea; solo cambia la puerta.
- Sin diff: `src/middleware.ts`, `src/astro/{acciones,origen,cabeceras}.ts`, `src/components/`, `vercel.json`, `astro.config.mjs`, `next.config.ts`, `prisma/`, `openspec/specs/`, `spikes/`, `docs/despliegue.md` y `package*.json` (sin dependencias nuevas).
- Sin `any`. No hay textos de UI. Los logs y los JSON no cambian.
- Secretos y datos: los fixtures no tienen rutas de la máquina ni secretos (el secreto es aleatorio y no se escribe). Los datos son ficticios: `77199966xx`, `@ejemplo.invalid`, `re_prueba_falsa`, `enmirumbo.example`. Ninguna prueba ni la sonda salió a la red.

## Para el humano (también en el PR)

- **Preview** (tarea 14):
  - `curl -sD -` a las dos rutas: con el secreto correcto, con uno equivocado y sin encabezado;
  - `POST` con el secreto: debe dar el 404 vacío;
  - que el build del preview sea Astro (V3);
  - que *Settings → Cron Jobs* liste las dos rutas con `17 13 * * *` y `47 9 * * *`;
  - que el despliegue **no** sea `--prebuilt`.
- **Corte 6b, paso explícito:** la primera corrida real en *Observability → Crons*, con su plan de reversa.
- **6b:** con la barra final (`/api/tareas/purgar-rechazados/`) y el secreto correcto, Astro **ejecuta** la tarea y Next da 308. Se resuelve con `trailingSlash`. La `Vary: rsc…` de Next no se replica (aprobado).

## Candidatos a ticket

- Que la comparación del secreto no revele la longitud (`secreto.ts:38`; propuesta).
- Que `seo-jsonld`/`seo-adversarial` borren sus fotos demo en `afterAll` (B5).
- V2: `admin-listado-paginas.test.ts:561` intermitente por ids cuid.
- B3: que el emulador no se caiga con `TRACE`.
- Los de fases previas que siguen abiertos: M1 de 3b-2 (una ficha borrada más un reenvío escriben cupos) y el `Cache-Control` del `POST ?_action=confirmar` apagado (3b-2, a las enmiendas de 6b).

El CI de GitHub Actions tiene que quedar en verde en el PR: esta validación local no lo sustituye. El merge lo hace un humano, y solo después de #37 y #38.
