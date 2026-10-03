# Etapa B · dev — migrar-tareas-programadas-astro (T-027, mitad 6a)

Sin etapa UI. Worktree `enmirumbo-f6a`, rama `feature/astro-tareas-programadas` (`da5fc74`), sin commits. Decisiones del fundador aplicadas: otros métodos → 404 vacío; excepción en `src/app/` (mudanza sin cambios y una línea de import por ruta); horario de los crons sin tocar; `Cache-Control` y `HEAD` medidos en Next de `main`.

## Resumen

Las dos tareas responden desde Astro con la misma ruta y la puerta como primera sentencia. `secreto.ts` ya no importa Next y `_render.func` pasó de **62 archivos de `next` a 0**. El diff contra Next de `origin/main` (`8d514f5`) dio **0 diferencias en 15 sesiones y 89 pasos**, con el estado de la base, del almacén, del log y del correo incluido. Solo se aplicó la excepción aprobada (12 pasos). Suite: **PG 16 real, en el orden del CI: 174 archivos, 4436 pasan, 2 expected fail**. **PGlite: 4432 pasan, 6 saltadas preexistentes.** Cero cambios en `src/middleware.ts`, `src/astro/{acciones,origen,cabeceras}.ts`, `src/components/`, `vercel.json`, `astro.config.mjs`, `next.config.ts`, `prisma/`, `openspec/specs/`, `spikes/`, `docs/despliegue.md` y `package*.json`.

## Medido en Next de `main` (tarea 1)

`git archive origin/main`, luego `next build` y `next start` con `NODE_ENV=development` (para que el almacén sea el disco de `FOTOS_DIR`) y el Resend falso por `NODE_OPTIONS=--import`. Los fixtures están en `tests/fixtures/next-6a/` (15 sesiones, 136 KB, sin rutas de la máquina ni secretos; lo vigila `tests/diff-html-6a.test.ts`).

- **JSON (200/500):** sin `Cache-Control`. Trae las cuatro de seguridad, `content-type: application/json; charset=utf-8`, `x-robots-tag` y `vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch`. **Astro no manda ningún `Cache-Control`**, igual que Next.
- **404 de `notFound()`:** 0 bytes, sin `content-type`, sin `cache-control`. Solo las cuatro de seguridad más esa misma `vary`.
- **`HEAD` con el secreto correcto:** ejecuta la tarea (el log sale dos veces) y no trae cuerpo. Astro hace lo mismo con `export const HEAD = GET`.
- **`POST`/`PUT`/`PATCH`/`DELETE`:** 405 sin cuerpo. **`OPTIONS`:** 204 con `allow: GET, HEAD, OPTIONS`.
- **Barra final:** 308 a la ruta sin barra. **`/api/tareas/inventada`:** la 404 HTML (10 906 B).
- **Foto inventada:** el mismo 404 más `cache-control: no-store`.

## `_render.func` (tareas 1 y 13)

| | Antes | Después |
|---|---|---|
| Archivos bajo `node_modules/next/` | 62 (404 KB) | **0** |
| Tamaño (`du -sk`) | 31 372 KB | 30 980 KB |
| Archivos totales | 545 | 483 |
| Módulos que importan `next/*` | 1 (`dist/server/virtual_astro_middleware.mjs` → `next/navigation.js`) | 0 |

`grep "next/dist"`, tal como lo trae design §2.3, también encuentra `chunks/DocumentoBase_*.mjs`, pero ahí es solo un **comentario**. Por eso el guardián busca importaciones (`from`/`import(`/`require(`), y el patrón tiene su propia prueba. No hay `.nft.json` en la salida. **`.vercel/output/config.json` no trae `crons`**: `@astrojs/vercel` no los copia. `vercel.json` no se tocó (design §1.4); queda por confirmar en el preview.

## Diff contra Next (tarea 12)

```
DATABASE_URL=<base ficticia> npx tsx scripts/diff-html.mjs --solo-6a <next-main>   → exit 0
75 "igual" · 12 ACEPTADA · 2 anotadas
ACEPTADA (otro método): POST/PUT/PATCH/DELETE ×2 rutas (405→404 vacío), OPTIONS ×2 (204→404 vacío),
  POST de otro origen (405→403 del middleware), POST ?_action=reportar (405→404 de la tabla de Actions)
`Vary: rsc, next-router-…` de Next, no replicada en Astro, 74 pasos.
Anotadas (6b): barra final en las dos rutas: Next 308 → sin barra / Astro 404 (el vacío de la puerta).
Cero diferencias en 15 sesiones y 89 pasos (estado de la base y del almacén incluido).
```

Cada lado tiene su propio proceso por sesión, con el mismo `FOTOS_DIR` temporal, el mismo secreto aleatorio (nunca se escribe en disco) y la base resembrada antes de cada sesión. Se comparan estado, cuerpo byte a byte, cabeceras (sin `date`, `connection`, `keep-alive`, `transfer-encoding`, `content-length` ni `x-vercel-*`), líneas del log, lo que recibió el Resend falso y, al final, la base y el almacén.

## Mapa scenario → prueba

| Scenario (delta `plataforma-astro`, 6a) | Prueba |
|---|---|
| La purga del día; segunda corrida; foto que no se borra; purga no completa; aviso falla; sin correo | `plataforma-astro-tareas` (contra fixtures, más aserciones literales) |
| Barrido normal; barrido detenido; `HEAD` como `GET` | idem (sesiones `barrido`, `barrido-detenido`, `purga`/`barrido` `HEAD`) |
| Un escáner prueba secretos; sin secreto o de espacios; igual que el 404 de fotos | `plataforma-astro-tareas-puerta`; unitarias de los 11 casos en `astro-tareas` |
| La puerta va antes de la base y los archivos | `-puerta`: estado intacto y el correo vacío; una "base" tarpit local que cuenta conexiones (0 con secreto malo, 2 s de cota; con el secreto, sí conecta); puerto cerrado (`base-caida`) |
| POST con el secreto; POST de otro origen o con Action | `-puerta` (iguales a `POST /` ajeno y a `POST /?_action=inventada`) |
| El cron de Vercel; `?_action=` en un GET | `plataforma-astro-tareas` (UA `vercel-cron/1.0`, sin `Origin`), sesiones `puerta`/`purga` |
| Falta el secreto en producción (una sola vez, 10 rutas) | `-puerta` (producción sin secreto: 1; con secreto o en desarrollo: 0) |
| El correo no lleva datos de nadie; nada sale a la red | `plataforma-astro-tareas` (con `SUPABASE_*` en la terminal) y `resend-falso` |
| La función sin Next; las rutas de Next siguen igual hasta 6b | `plataforma-astro-sin-next`; las 8 pruebas viejas corridas contra Next tras la mudanza (319/319) antes de re-apuntarlas |
| Misma dureza; el diff no toca producto | conteos de abajo, `git diff --stat`, guardianes de `-sin-next` |
| Preview (`curl`, lista de crons) | Manual, humano (tarea 14) |

**TDD:** ROJO visto antes del código en `resend-falso` (falta el módulo), `-tareas` (27/28, 404), `-puerta` (7/11), `-sin-next` (6/6: 62 archivos y archivos inexistentes) y `astro-tareas` (falta el módulo). Hice una mutación: puerta abierta sin secreto, y 8 pruebas re-apuntadas fallan en 4 archivos. `diff-html-6a` se escribió **después** del comparador (es infraestructura de la prueba, no código de producto).

## Re-apuntadas (tarea 7): `expect(` antes → después

`tareas-programadas` 15→20 · `purga-rechazados` 53→53 · `aviso-pendientes-tarea` 52→53 · `aviso-pendientes-adversarial` 128→130 · `despliegue` 66→70 · `buscador-pagina` 60→60. No hay `skip`/`only`/`todo` nuevos. El `grep` de **imports** de `src/app/api/tareas` en `tests/` sale vacío. Quedan tres **rutas en texto** a propósito, hasta 6b:

- `buscador-pagina.test.ts:304-305`: la lista blanca de `noindex`, porque el guardián todavía recorre `src/app/` y esas rutas de Next siguen diciendo `noindex`. Se agregaron las dos de `src/pages/`.
- `despliegue.test.ts:486`: comprueba que `avisar-pendientes` no exista en Next. Se agregó la misma comprobación en `src/pages/`.

## Decisiones técnicas

- `src/astro/tareas.ts:32`: `tareaAutorizada` no usa `===` ni `startsWith` (el vacío se descarta con `!secreto`) y delega en `secretoDeTareaCorrecto`. `respuestaDeTareaNoExistente()` es `new Response(null, {status: 404})`, sin cabeceras: las cuatro las pone el middleware.
- Endpoints (`src/pages/api/tareas/*.ts`): el cuerpo es el de Next línea por línea. La primera sentencia del `GET` es la puerta (lo vigila un guardián con una expresión regular). `HEAD = GET`; `ALL` devuelve el 404 vacío. Astro resuelve `mod[method] ?? mod.ALL`, así que sin un `HEAD` explícito `HEAD` caería en `ALL` (`node_modules/astro/dist/runtime/server/endpoint.js:8`).
- `src/lib/tareas/secreto.ts`: se quitaron el import y el bloque de las líneas 21-49, y se agregó una frase en la cabecera. Las cuatro firmas quedan idénticas (las fija un guardián). El bloque se movió **byte a byte** a `src/app/api/tareas/no-existe.ts:37`. Cada ruta de Next cambia una línea de import, más una línea en blanco entre grupos, que es el estilo del repo (`+2 −1`).
- **Resend falso** (`tests/fixtures/resend-falso.mjs`): con `aceptado` recuerda la clave del día y responde 409 a la segunda petición con la misma clave, como el proveedor. Así se ve "segunda corrida: un solo envío aceptado". Al instalarse escribe `[resend-falso] instalado`, y el helper falla si no ve esa línea.
- **Arnés compartido:** `scripts/diff-html/tareas-6a.mjs` (sesiones, entornos, comparador) y `scripts/sembrar-tareas.mjs` (fichas `77199966xx`, claves `f6a…` fijas, marcas `f6a-tareas:`). Lo usan el diff y las pruebas, así que Next y Astro reciben exactamente lo mismo. Cada sesión levanta un proceso nuevo, porque la memoria de "envío aceptado" es por proceso.
- **Arranque perezoso:** Next carga su configuración, y Astro su middleware con los avisos de arranque, en la **primera** petición. Los dos lados hacen una petición de calentamiento que no toca nada antes de empezar a contar el log.

## Desviaciones y hallazgos

1. **`Vary` de Next no replicada.** design §3.2 dice que si se mide una `Vary`, se replica. Pero la que se midió nombra al enrutador de Next (`next-router-*`), y la spec de 2a prohíbe cabeceras que anuncien el marco. La foto de 2b ya salía sin ella. El diff la descuenta **solo** si es exactamente ese valor y Astro no manda ninguna, y lo cuenta (74). **Decisión para el humano**; replicarla sería una línea en `respuestaDeTareaNoExistente` y en los endpoints.
2. **design §5.2 suponía mal el emulador** (corregido en tasks.md #3): con `NODE_ENV=production`, `esProduccion` elige el almacén "sin configurar". Las instancias corren con `NODE_ENV=development` y `sin-almacen` usa `VERCEL_ENV=production`.
3. **Limpieza:** no pasa por `tests/limpieza.ts` (Prisma). La hace `limpiarTareas` en el `finally` de cada corrida y en el `afterAll` (anotado en tasks.md #3). La paridad borra antes las marcas de cupo **ya caducadas** de otros archivos, que la purga se llevaría igual, para que `cuposLimpiados` sea determinista.
4. **`barrido-detenido` y `aviso-sin-pendientes` en la suite** dependen de que la base compartida esté vacía. Si otro archivo deja una ficha, el sembrador lanza con un mensaje claro: la misma dependencia que ya tenía `tareas-programadas`.
5. **Preexistente:** al terminar la suite quedan 2 fotos demo en `.fotos-test`, de `seo-jsonld`/`seo-adversarial` (su `afterAll` borra solo el prefijo `7719995`). Depende del orden y es ajeno a este change. La base queda con 0 negocios, 0 reportes y 0 cupos en PG y en PGlite.
6. **Barra final en Astro:** la ruta se resuelve igual (`trailingSlash` por defecto), así que con el secreto correcto **ejecutaría la tarea** donde Next redirige con 308. Sin el secreto da el 404 vacío. Es para 6b (`trailingSlash`).

## Compuertas (tarea 14, parte local)

En el orden del CI, sin `.vercel` y sin caché de Vitest, sobre PostgreSQL 16 real (`f6aci`): `npm run lint` 0 problemas · `npm run typecheck` 447 archivos, 0 errores · `npm run build` sin base: completo · `migrate deploy` + `db:seed` · `npm test` **174 archivos, 4436 pasan, 2 expected fail**. Una segunda corrida (`f6aci2`) dio lo mismo. PGlite (`prisma dev f6apglite`): 4432 pasan, 6 saltadas (concurrencias preexistentes). [A1]/[A2] no aparecieron. El clúster PG 16 del scratchpad y `f6apglite` están **detenidos**; Next y los emuladores, también.

## Pendientes humanos

- **Tarea 14, preview:** `curl -sD -` a las dos rutas (secreto correcto, equivocado, sin encabezado), `POST` con el secreto, y **captura de la lista de crons del panel**. Hay que confirmarla porque `config.json` no trae `crons`. Si el panel no las lista, la corrección se decide entonces (design §1.4). La primera corrida real en *Observability → Crons* es un paso del corte (6b, decisión 3).
- **Decidir sobre la `Vary`** (desviación 1).
- **Validador:** la fila de `docs/metricas-pipeline.md`, el PR en borrador (tarea 15) y el diff completo de 2a–3b-2.

## Propuestas fuera de alcance

- La comparación del secreto revela su longitud (`secreto.ts:38`): candidato a ticket (ya anotado en la propuesta).
- `seo-jsonld`/`seo-adversarial`: limpiar las fotos demo en su `afterAll` (hallazgo 5).
