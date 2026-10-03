# Etapa B · dev — migrar-verificacion-sms-astro (T-024, Fase 3b-2)

Sin etapa UI. Worktree `enmirumbo-3b2`, rama `feature/astro-verificacion-sms` (sobre `696210d`; **no incluye** `8093bf7`, el fix V1 de 3b-1: lo trae el rebase). Decisiones del fundador aplicadas: pantalla nativa pura con PRG, sin JS; 404 `NoEncontradoDinamico`; SMS real NO probado (todo con `tests/fixtures/twilio-falso.mjs`); `Cache-Control` distinto frente a `/a/b/c` aceptado.

## Resumen

`/registro/verificar` y las Actions `confirmar`/`reenviar` corren en Astro tras la bandera, con compuerta antes del manejador. **Cero líneas en `src/lib/`, `src/app/` y `src/middleware.ts`.** Diff contra Next de `origin/main` (`8d514f5`) con el falso en los dos lados: **cero diferencias en A, B y C, encendida (11 rutas + 26 secuencias, 2 ACEPTADA por origen ajeno/`null`) y apagada (4 rutas)**. Suite: PG 16 real 167 archivos, 4330 pasan, 2 expected fail; PGlite 4325 pasan, 2 xfail, 5 saltadas.

## Línea base (tarea 1)

- HEAD sobre PostgreSQL 16 real: 161 archivos, 4266 pasan, 2 expected fail. `grep "from \"next/" src/lib/verificacion`: vacío.
- `rewrite("/404")` **no** da una 404 vacía: da **500** "Algo falló de nuestro lado" (la función no reescribe a la 404 prerenderizada). Descartado igual (nota en tasks.md).
- Archivos re-apuntados (`expect(` HEAD→ahora, sin `skip`/`only`/`todo` nuevos):
  `verificacion-failsafe` 40→42 · `layout` 178→184 · `responsivo-guardian` 20→20 · `buscador-pagina` 60→60 · `directorio-astro-seguridad-adversarial` 96→96 · `analitica-privacidad` 23→24 · `analitica-exclusion-admin` 64→64 · `reportar-accion` 43→43 · `registrar-accion` 57→57 · `registro-mejora-dom` 64→70 · `arnes-formulario` 47→54 · `diff-html` 69→75 · `twilio-falso` 22→26. `plataforma-astro-registro-bandera` 40→40 (sin cambios: no tenía la aserción de `/a/b/c` que cita tasks.md #13).
- `grep` de imports de `src/app/(publico)/registro` en `tests/`: vacío. Quedan dos rutas en listas (no imports): `buscador-pagina.test.ts:317` (la página de Next sigue existiendo hasta T-027 y pide `noindex`) y `layout.test.ts:979` (exclusión, preexistente).
- **JS de `/registro/verificar` en Next:** 8 archivos, 576 172 B, **176 945 B con gzip -9**. En Astro: **0** (ningún `<script>`).

## Tareas

1–13, 15 y 16 `[x]`. 14 `[~]` (ver abajo). 17 `[~]` (humano). 18 `[ ]` (PR del validador). En tasks.md dejé tres notas de corrección (#1 `rewrite`, #10 qué prueba detecta la mutación, #13 la aserción inexistente) y el estado de #14.

## Rojo antes del código (TDD)

- #4 (`plataforma-astro-verificar-apagada`): 5 fallaban (la ruta salía de la CDN: sin `Cache-Control` de la función y cuerpos sin comparar), 3 pasaban ya (la CDN no lee el cuerpo). Siguen en verde con la ruta creada.
- #5: 7 fallaban por la ruta inexistente; 5 pasaban (la tabla §2.3 y el RPC daban todos la misma 404 de la CDN).
- #6 y #7 (topes, panel, `GET` sin efectos, DOM): todas en rojo por la ruta inexistente.
- `registro-formulario-verificar` y `verificar-accion`: rojo por el componente sin `method` y el módulo inexistente.

## Mapa scenario → prueba

| Scenario (delta `plataforma-astro`, 3b-2) | Prueba |
|---|---|
| Apagada en las tres configuraciones; cookie bien firmada; cuerpo de 200 MB; igual a dirección inventada | `plataforma-astro-verificar-apagada` |
| Compuerta antes del manejador (MODIFIED) | idem ("cuerpo a medio llegar": responde sin esperar el resto) + `verificar-accion` (`puedeCorrer`) |
| Pantalla igual a la de hoy (9 pantallas, con y sin `SITIO_URL`) | `plataforma-astro-verificar` contra `tests/fixtures/next-3b2` (2+2 normalizaciones por pantalla) |
| Sin JS y sin datos de más | `plataforma-astro-verificar`, `analitica-privacidad`, `verificacion-failsafe` |
| Un campo de más sale como diferencia | `diff-html` (oculto, `data-`, otra ruta, sobre el fixture real) |
| Los motivos no se distinguen; ficha borrada; envío ilegible | `plataforma-astro-verificar` (byte a byte por fila contra la apagada) + `verificar-accion` |
| Recorrido completo; mismos desenlaces que Next; equivocarse y recargar; nada sensible | `plataforma-astro-verificar` (26 secuencias contra los fixtures de Next) |
| Reusar la primera cookie; ráfaga (PG real); cupo por IP; tope diario | `plataforma-astro-verificar-topes` |
| La marca llega al panel; solo cambia la fecha | `plataforma-astro-verificar-panel` (panel de Next pintado con la fila) |
| El módulo de `/registro` sigue el 303 sin gastar; con JS llega a la pantalla | `plataforma-astro-verificar-panel` (3 GET + HEAD), `registro-mejora-dom` (respuestas reales encendida) |
| Misma dureza; el diff no toca producto | conteos de arriba, `git diff --stat`, `registro-formulario-verificar` (HTML con funciones = HEAD, 8 combinaciones) |
| RPC cerrado; Action desde ruta ajena (MODIFIED) | `plataforma-astro-verificar` |
| Preview, Firefox/Chrome sin JS, Lighthouse, SMS real | Manual (tarea 17); el SMS real NO por decisión del fundador |

## Decisiones técnicas

- **Compuerta:** `src/astro/acciones.ts:213` evalúa `puedeCorrer()` antes de `action.handler()`; cerrada, sigue el mismo camino que el "no encontrado" de reportar (`setActionResult(NOT_FOUND)`, `pintarSinReleerElCuerpo`, `CACHE_DE_ACCION`). Mutación (compuerta tras el manejador) → falla "la compuerta va antes del manejador".
- **Lista cerrada en dos capas:** `destinoDeVerificar` (`src/astro/verificar.ts:97`) y `destinos` por entrada en `resolverAccion` (`acciones.ts:153`), que devuelve `no-encontrado` (no `fuera-de-ruta`) como pide la spec. Mutación (obedecer cualquier destino) → falla `verificar-accion`.
- **`trasFallar` → `no-encontrado`** sin leer la base (`acciones.ts:89`).
- **Página** (`src/pages/registro/verificar.astro`): `cargarPantalla` lee configuración → resultado de la Action → cookie, en ese orden (`verificar.ts:145`); la configuración apagada nunca llama a `cookies.get` (probado con un frasco que cuenta lecturas).
- **Componente:** `method="post"` solo con texto (`formulario-verificar-codigo.tsx:38`). Con funciones el HTML es idéntico byte a byte al de HEAD (fixture `tests/fixtures/formulario-verificar-head/`, capturado antes del cambio).
- **Twilio falso:** al comprobar suma `error` (503) y `tarda` (`tests/fixtures/twilio-falso.mjs`). En Next la precarga funciona: la petición a `verify.twilio.com` llega al falso (comprobado antes de capturar).
- **Arnés:** `boton` (elige uno de dos `<form>`), `cookieDelEnvio`, `Frasco.valor`, `secuenciasDe3b2` y `recorrerSecuencia3b2` (`scripts/enviar-formulario.mjs`); ayudantes de cookies y de envejecer la espera en `tests/verificar-astro.ts` (lo usan las pruebas y `diff-html --capturar-3b2`).
- **Serie ficticia:** secuencias en `77199984xx` (la `77199982xx` ya la usa `registrar-accion`).
- **Ninguna normalización nueva.** En la apagada, `HEAD` se compara sin la 404 dinámica (no hay cuerpo).

## Diff y envíos contra Next (tarea 14)

Next de `origin/main` `8d514f5` (builds A/B/C en el scratchpad, extraído con `git archive`) y la salida de Astro (A/B/C), misma base PG 16 (`fix3b2`: seed + demo), el falso en los dos procesos y el mismo secreto.

```
npx tsx scripts/diff-html.mjs <next> <astro> --datos d.json --solo-3b2 --verificacion encendida|apagada
A/B/C encendida: Cero diferencias en 11 rutas · envíos 3b-2: 24 iguales + 2 ACEPTADA (origen ajeno/null: 500 / 403)
A/B/C apagada:   Cero diferencias en 4 rutas (GET, HEAD, POST ?_action=confirmar, POST)
NORMALIZACIONES_FORMULARIO: atributos-del-form 20, campos-action-de-next 20 (10 pantallas × 2 formularios)
NORMALIZACIONES_404_DINAMICA: 3 c/u (encendida: /registro/verificar sin cookie; apagada: GET y los dos POST)
```

**No corrido:** las rutas de 2a, 2b, 3a y 3b-1 contra Next (piden los datos de 2b y el Storage falso de 3b-1). Sus pruebas con fixtures siguen en verde; el diff completo queda para el validador.

## Desviaciones y hallazgos

1. **Ficha borrada + reenvío escribe dos filas de cupos** (espera y reenvío) antes de descubrir que la ficha no existe (`src/lib/verificacion/flujo.ts`, `reenviarCodigo`). La spec dice "sin escribir nada". Es preexistente e igual en Next (fixture `ficha-borrada`: `reenvios: 1`). Como no se toca `src/lib/`, la prueba fija el comportamiento real y responde la misma 404. Además, con la espera de 60 s activa, ese reenvío responde `?errorReenvio=espera-reenvio` y no 404 (igual que Next). Candidato a ticket.
2. **`Cache-Control` del `POST ?_action=confirmar` apagado frente a Next:** Astro manda el de una Action (`no-cache, no-store…`, el mismo con la bandera encendida y sin cookie); Next manda `private, no-cache…` (y con la bandera encendida su Server Action manda el otro, así que Next sí lo distingue). En el diff ese `POST` no exige `Cache-Control`. Es una variante de la diferencia aceptada (decisión 2 del fundador); la anoto para el archivado.
3. Las cabeceras de transporte (`connection`/`keep-alive`) cambian si el servidor no leyó todo el cuerpo (7 MiB): se excluyen al comparar, junto con `Date`.
4. **Doble toque sin JS** en "Confirmar mi número": gasta dos intentos si el código está mal (fuera de alcance por proposal, igual que Next).

## Compuertas (tarea 15)

- `npm run lint`: 0. `npm run typecheck`: 434 archivos, 0 errores. `npm run build` sin base: completa.
- `npm test` en el orden del CI, sin caché: **PG 16 real** (`v3b2dev`) 167 archivos, 4330 pasan, 2 xfail, 0 saltadas (corre la ráfaga). **PGlite** (`prisma dev v3b2pglite`) 167 archivos, 4325 pasan, 2 xfail, 5 saltadas (2 preexistentes, 2 concurrencias de 3b-1 y la ráfaga, con aviso).
- Al final: 0 negocios, 0 reportes y 0 fotos en las dos bases. En PG queda 1 fila de `IntentoDeCupo` fechada el 2026-09-03 (preexistente, reloj fijo; ya la vio 3b-1). En PGlite, 0.
- `git diff --stat`: cero líneas en `src/lib/`, `src/app/`, `src/middleware.ts`, `astro.config.mjs`, `vercel.json`, `next.config.ts`, `prisma/`, `openspec/specs/`, `spikes/` y `package*.json`. En `src/components/` solo `formulario-verificar-codigo.tsx`.
- Bases `v3b2dev`/`fix3b2` (clúster PG 16 del scratchpad) y `v3b2pglite`, Next y emuladores: detenidos.

## Pendientes humanos

- **Tarea 17 (preview):** bandera apagada en Chrome y Firefox sin JS (`/registro/verificar` = "No encontramos esta página"; `curl` frente a `/a/b/c` y `/loquesea`; `POST ?_action=confirmar` = la misma 404) y Lighthouse móvil de la pantalla. El SMS real y "la cookie del 303 que sigue el `fetch`" en un navegador real solo si el fundador lo decide.
- **Tarea 18:** rebase sobre `migracion-astro` tras mergear #37 (trae `8093bf7`) y PR; CI en verde.
- **Diff completo (2a–3b-1) contra Next** en el validador.

## Corrección de M2 y de la obs. 6 (c-seguridad.md)
- **M2, la causa:** el emulador responde y cierra con cuerpo sin leer, así que su sistema manda un RST. Node a veces atiende primero el EPIPE de la escritura pendiente, destruye el socket y nunca lee la respuesta que ya había llegado; el ayudante ignoraba el EPIPE y esperaba un `drain` eterno. Lo medí con una sonda: 8 de 80 colgados en paralelo, y el servidor sí escribió las 80 respuestas.
- **M2, el arreglo:** `tests/postear-por-trozos.ts` es el ayudante único, que ahora usan `postearComoNavegador` (verificar), `enviar200Mb` (apagada) y `enviarPorTrozos` (`registro-astro-cuerpo-una-vez`, de 3b-1; eran todos los usos de `drain`). La espera de `drain` también se suelta con la respuesta o con el cierre. Una conexión cerrada sin respuesta se reintenta como una petición idéntica, hasta 10 veces. Cada intento tiene un tope de 15 s con un mensaje claro. No cambió ninguna aserción: las que cuentan llamadas, lecturas o intentos cubren también los reintentos.
- **Obs. 6, la causa:** `tests/aviso-pendientes.test.ts` (T-020, preexistente) no tenía `afterAll` y dejaba su último negocio (`7719987160`). La reproduje corriendo ese archivo y luego `tareas-programadas`: falla con "expected 1 to be +0" en la línea 137. Le agregué `afterAll` (borra su prefijo y desconecta). Ningún archivo de 3b-1 ni de 3b-2 deja negocios: lo medí con una sonda por archivo en 6 corridas completas.
- **Tercer intermitente encontrado:** `EADDRINUSE` al levantar el emulador (el puerto se suelta antes de que el hijo lo tome). `tests/salida-astro.ts` ahora reintenta solo ese caso con otro puerto, y mata al hijo si no arranca en 30 s.
- **Verificación:** 2000 envíos de 7 MiB, 8 a la vez, con 0 fallas (se absorbieron entre 30 y 40 % de pérdidas). Los 3 archivos afectados, 30 veces seguidas: 30/30 en PG 16. `npm test` completo 5 veces seguidas en bases nuevas (3 sin caché, en el orden del CI): 4350 pasan y 0 fugas. En PGlite (`m2drenaje3b2`), 5 de 5. Lint, typecheck y build en verde. Las bases quedaron detenidas.
