# Etapa B · dev — migrar-panel-admin-base-astro (T-026, Fase 5a)

Sin etapa UI. Worktree `enmirumbo-f5`, rama `feature/astro-panel-admin` (sobre `7b4514f`). Decisiones del fundador aplicadas: `Referrer-Policy: strict-origin` por middleware en todo `/admin`; 5a apilada; "Salir" sin sesión = paridad; "Revisar"/"Ver detalle" dan la 404 del panel hasta 5b/5d.

## Resumen

`/admin`, `/admin/cola`, `/admin/negocios` y `/admin/[...resto]` en Astro, con guarda por tabla cerrada en el middleware y Actions `entrar`/`salir`. **Diff en vivo contra Next de `main` (`8d514f5`): 0 diferencias** en 52 rutas/estados + 13 envíos, con 2 ACEPTADAS. Suite: **PG 16 real 175 archivos, 4436 pasan, 2 xfail, 0 saltadas**; **PGlite 4428 pasan, 2 xfail, 8 saltadas** (concurrencia; 2 son mías). En `src/lib/` solo `peticion.ts`, `entrar.ts` (nuevos) y `guarda.ts` (import + cuerpo de `sirviendoPorHttps`); en `src/app/` solo los dos envoltorios; en `src/components/` solo `boton-salir.tsx`.

## Línea base (tarea 1)

- HEAD sobre PG 16 real: 168 archivos, 4351 pasan, 2 xfail.
- Pruebas que importan/leen piezas de 5a de Next, `expect(` HEAD→ahora, **sin `skip`/`only`/`todo` nuevos**:
  - sujeto 5a: `admin-acceso` 55→68 · `admin-listado-paginas` 119→120 · `admin-listado-seguridad-adversarial` 61→64 · `admin-paginas` 90→92 · `layout` 184→185 · `analitica-exclusion-admin` 64→75 · `admin-adversarial` 176→181 · `admin-reportes-paginas` 69→69 · `marca-guardian` 17→18 · `iteracion2-seguridad-adversarial` 53→54 · `despliegue` 66→67;
  - tocadas por la tabla de 6 Actions / rutas nuevas: `reportar-accion` 43→43 · `registrar-accion` 57→57 · `verificar-accion` 52→54 · `reportes-privacidad` 30→31 · `astro-metadatos` 19→25 · `plataforma-astro-cupos` 20→23;
  - **lista de excepciones** (solo usan `ColaAdminPage` de Next para comprobar 5b–5d): `gestion-panel` 143, `admin-despublicar-borrado` 108. La fija y la vigila `plataforma-astro-panel-guardia.test.ts` ("solo las pruebas de la lista…").
- `grep -rnE '(from|import\()\s*"[./]*src/app/admin/(page|accion-acceso|accion-salir|layout|negocios/page|\[\.\.\.resto\]/page)"' tests/`: **vacío**. `cola/page` solo en las dos excepciones.

## Medido en Next (tarea 2; `tests/fixtures/next-5a/respuestas.json`, design.md §1.1 actualizado)

- Pantalla sin sesión (`GET`/`HEAD`/`POST` sin `Next-Action`/`PUT`/`DELETE`, cookie alterada/otro secreto/vencida/no canónica/16 dígitos, panel sin configurar): **307** a `/admin`, `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`, cuerpo = documento de error (`text/html`, sin datos).
- Action guardada sin sesión (`aprobar`, form leído con sesión y mandado sin cookie): **303** a `/admin`, `CACHE_DE_ACCION`.
- `/admin` con sesión: 307 a `/admin/cola`. Comodín: 404 `__next_error__` con `noindex` (sin `nofollow`) y `<meta name="referrer">` **después del `<title>` y la descripción, antes de `robots`**. Título del panel duplicado ("— EnMiRumbo — EnMiRumbo"): se conserva.
- Cookie: `Path=/admin; Expires; Max-Age=28800; Secure; HttpOnly; SameSite=lax` (salir: `Max-Age=0`, sin `Expires`). Con sesión, Next pinta el listado ante cualquier método.

## Tareas

1–16 `[x]`. 17 `[~]` (todo hecho salvo la fila de métricas, que lleva el veredicto del validador). 18 `[~]` humano. 19 `[ ]` validador. Correcciones escritas en tasks.md: #3 (la "página nueva" como mutación, no como prueba permanente), #6 (404 sin `nofollow`), #8 (envoltorios ya no se importan).

## Rojo antes del código

- Unitarias (`admin-acceso`, `panel-acceso-astro`, `admin-boton-salir`, `astro-metadatos`, la parte sin build de la guarda): módulos inexistentes, `method` ausente, sin `referrer`.
- Sobre la build: 26 de 34 fallaban por la ruta inexistente; 8 pasaban ya porque afirman ausencias (RPC cerrado, 403 de origen, sitemap sin `/admin`, política global fuera del panel, `?error=x&error=intentos` sin mensaje, nada se escribe).

## Mapa scenario → prueba

| Scenario (delta `plataforma-astro` 5a) | Prueba |
|---|---|
| Pantallas sin sesión; cookies que no son sesión; ruta nueva; Action sin sesión no lee nada (7 MiB, sonda de lecturas); lo que no existe no exige sesión | `plataforma-astro-panel-guardia` |
| Estados del acceso iguales a hoy; panel sin configurar (log una vez) | `plataforma-astro-panel-acceso` + `admin-acceso` + diff |
| Recorrido completo sin JS; mismos desenlaces y misma cookie que Next; nada sensible; envío ilegible | `plataforma-astro-panel-acceso` (+ cruce de cookies en vivo, abajo) |
| Ráfaga; dos instancias; ventana; sin encabezado de IP (+ base caída) | `plataforma-astro-panel-intentos` (las dos primeras, solo PG real) |
| Cabeceras en cada forma de respuesta; el panel no se mide | `plataforma-astro-panel-cabeceras`, `analitica-exclusion-admin`, `astro-seguridad-adversarial` |
| Salir del panel no entrega la ruta | `<meta>`+cabecera probados; el referente real en navegador → tarea 18 (humano) |
| Cola igual; listado igual; el HTML no crece (30 vs 500); nada se escribe | `plataforma-astro-panel-cola-listado` + diff |
| Misma dureza; el diff no toca producto | conteos de arriba, `git diff --stat`, `admin-boton-salir` (byte a byte contra `tests/fixtures/boton-salir-head/`) |
| MODIFIED tabla de Actions (RPC, ruta ajena, guarda antes de la tabla) | `plataforma-astro-panel-acceso`, `plataforma-astro-panel-guardia`, `panel-acceso-astro`, `*-accion` |
| revision-admin MODIFIED "sin JS de cliente propio" | `plataforma-astro-panel-guardia` (`use client` y `client:`), `admin-listado-paginas` |

## Decisiones técnicas

- `src/astro/panel/guardia.ts:35` tabla congelada; `:60` `politicaDe` con falla cerrada; `:111` la guarda: `acceso`/`no-existe`/no-panel pasan **sin leer la cookie**; Action presente (de `getActionContext`, sin leer el cuerpo) → 303, si no → 307.
- `src/middleware.ts:60` guarda tras el origen y antes de `atenderAcciones`; `:47` `conReferenteDelPanel` antes de `prepararRespuesta` (ruta decodificada, minúsculas, barras colapsadas; respeta `strict-origin`/`no-referrer` ya puestas, `guardia.ts:149`).
- `src/lib/admin/entrar.ts:32` cuerpo de `entrarAlPanel` en el mismo orden y con los mismos logs; aparta en `:64` antes de comparar. `guarda.ts:54` delega en `esPeticionHttps`.
- `src/astro/acciones.ts:112-113` `entrar`/`salir` con `DESTINOS_DEL_ACCESO` y `trasFallar` → `/admin`; `src/astro/panel/acceso.ts:73` destino fuera de la lista → `/admin`.
- `src/astro/metadatos.ts:150` `referrer` en la posición medida. `src/layouts/DocumentoPanel.astro:43-44` fija robots y referente (la página no los puede cambiar).
- `src/astro/panel/parametros.ts`: parámetros como `searchParams` de Next (repetido = arreglo = inválido). Desviación del design §4 ("primer valor"): con "primer valor", `?error=intentos&error=x` pintaba un mensaje que Next no pinta.
- Redirecciones sin cuerpo y con `Cache-Control` explícito (`guardia.ts:88`), porque `prepararRespuesta` solo lo pone en `text/html`.
- Pruebas: siembra determinista con ids fijos (`tests/panel-astro.ts`, WhatsApp 77199951xx–56xx) para que fixtures y build pinten lo mismo; `tests/panel-paginas.ts` abre las páginas de Astro con la sesión simulada de siempre.

## Mutaciones (todas revertidas, con `cmp` contra la copia)

- Comparar antes de apartar, con el acierto sin gastar intento → 7 fallas (ráfaga, dos procesos, ventana, base caída, 3 de `admin-acceso`). Una primera versión que solo reordenaba sobrevivió: era equivalente.
- Guarda después de `atenderAcciones` → fallan "7 MiB sin leer" y "la guarda va antes de la tabla".
- Destino fuera de la lista obedecido → 2 fallas en `panel-acceso-astro`.
- `src/pages/admin/nueva.astro` real + build → la enumeración nombra `/admin/nueva`; servida sin sesión: 307 a `/admin`, sin el contenido.
- `client:load` en `cola.astro` → falla el guardián de hidratación. Sin el motivo en `DocumentoPanel` → falla la lista exacta de exclusiones.
- Oculto + `data-` inyectados en el formulario de acceso → 6 rutas DISTINTA en el diff.

## Diff y envíos contra Next (tarea 15)

Next `main` (4 procesos: configurado, sin configurar, sin secreto, secreto de 31) y la salida de Astro (los mismos 4), base PG 16 `f5adiff`, mismo secreto ficticio. `npx tsx scripts/diff-html.mjs <next> <astro> --solo-5a --sin-configurar … --sin-secreto … --secreto-corto …`:

```
52 rutas/estados igual (acceso ×6 + 3 sin configurar, 307 con sesión, cola vacía/sembrada, listado vacío + 13 de 60,
  comodín ×6, 15 formas sin sesión, 5 cookies inválidas) · 13 envíos igual (cadena, Location, Set-Cookie, intentos, "atrás")
ACEPTADA Referrer-Policy bajo /admin: 31 respuestas · ACEPTADA cuerpo de la redirección (Next documento de error, Astro vacío): 21
NORMALIZACIONES_FORMULARIO: atributos-del-form 8, campos-action-de-next 8 (acceso ×6, cola ×2)
NORMALIZACIONES_404_DINAMICA: 3 c/u en las 6 del comodín · Cero diferencias en el panel (5a), fuera de las aceptadas.
```

Cruce en vivo: la cookie de Astro abre la cola de Next (200) y la de Next la de Astro (200).

## Desviaciones y hallazgos

1. **404 del comodín sin `nofollow`.** La spec dice `noindex, nofollow` en cada documento, incluida la 404; Next manda solo `noindex` y el diff solo admite las 3 normalizaciones de 2b. Manda lo medido (design §1.1). Si se quiere `nofollow`, es una diferencia nueva que tiene que aceptar el humano.
2. **Segunda diferencia aceptada no declarada en design §7:** el cuerpo del 307 sin sesión (Next manda su documento de error, Astro nada). Estado, `Location`, `Cache-Control` y cookies son iguales.
3. **`/admin/cola//` (y cualquier `/<ruta>//` del sitio):** Astro responde un 301 propio ANTES del middleware, sin las cuatro cabeceras. Preexistente, mismo tipo que el candidato del `Forbidden` sin cabeceras. `/%61dmin/…` y `/ADMIN/…` caen en la 404 estática de la CDN (no pintan nada del panel).
4. Envoltorios de Next: ya no hay pruebas de comportamiento porque la spec pide el `grep` vacío. Quedan cubiertos por lectura de su cuerpo y por `typecheck`.
5. Con sesión, `POST`/`PUT`/`DELETE` sin Action a `/admin/negocios` pintan el listado, como Next. Por eso "ninguna respuesta trae datos" se prueba sin sesión y con envío de Action.
6. `analitica-exclusion-admin`: las pantallas de 5b que siguen en Next ya no se cotejan con el layout de Next (no se importa). Su política la hereda del layout de Next, que en esta rama no se sirve.

## Compuertas (tarea 17)

- `npm run lint` 0 · `npm run typecheck` 451 archivos, 0 errores · `npm run build` sin base y sin `SITIO_URL`: completa.
- `npm test` sin caché (orden del CI), base nueva cada vez: PG 16 `f5asuite1` (7 fallas de guardianes, corregidas) y `f5asuite2` **175/175, 4436 + 2 xfail**; PGlite `f5apglite` **175/175, 4428 + 2 xfail + 8 saltadas** (6 preexistentes y mis 2 de concurrencia, con aviso).
- Al terminar: 0 negocios, 0 reportes, 0 `IntentoDeCupo`. En `.fotos-test` queda 1 foto huérfana de archivos preexistentes que no toqué (`foto-concurrencia`, `registro-foto`, `fotos-ruta-salida`, `seed-demo`, medido uno por uno). Las pruebas de 5a no crean fotos.
- PG 16 (`f5a/pg`, puerto 55471), `prisma dev f5apglite`, 4 Next y 4 emuladores: detenidos.

## Pendientes humanos

- **Tarea 18 (preview):**
  - Chrome **y** Firefox sin JS: `/admin` → equivocada → correcta → cola → "Todos los negocios" con filtro y página → "Salir" → "atrás".
  - Seis intentos.
  - `curl -sD -` de `/admin`, `/admin/cola` sin cookie, el 303 de entrar y `/admin/x`.
  - `x-forwarded-for` falso rotado (no más de 5).
  - Lighthouse móvil de `/admin/cola`.
  - El referente real al salir por el logo.
- Decidir las desviaciones 1 y 2 (aceptar o pedir cambio).
- Tarea 19: PR borrador apilado sobre `feature/astro-verificacion-sms`, y CI.

## Corrección M1 y O6 (tras c-seguridad)
- **M1** `tests/admin-adversarial.test.ts` (§5): el guardián vuelve a recorrer TODO `src/app/admin/` (raíz, `cola/`, `negocios/`) con la lista de excepciones de antes, que ahora además deben NO tocar datos; en Astro recorre `src/pages/admin/` (exige `const x = exigirSesionAdmin(…); if (x) return x;` antes del primer acceso) y `src/astro/panel/` (sin acceso a datos). `ACCESOS_A_DATOS` suma `"prisma."`. ROJO comprobado con la mutación del revisor + 2 de Astro (0 fallas antes, 2 después); 8 casos nuevos la fijan en árboles desechables (`mkdtemp`). `expect(` 181→189, ninguno perdido; mutaciones en sitio revertidas y verificadas con `cmp`.
- **O6, causa:** `astro build` vacía `.vercel/output` (`emptyDir`, `@astrojs/vercel/dist/index.js:230`) y la reescribe: un emulador vivo da 500 al cargar un trozo diferido (`ERR_MODULE_NOT_FOUND`) y uno que arranca a media reconstrucción sale con código 1 (repro: 47/56 arranques durante un build). En una sola corrida secuencial no hay dos builds a la vez: pasa con un segundo proceso en el mismo árbol (otro `vitest`, `npm run build` a mano). Los logs del CI disponibles no traen el caso, así que no está confirmado que sea la causa allí.
- **O6, arreglo (solo pruebas):** `tests/salida-astro.ts` da a cada emulador una copia propia de la salida con enlaces duros (`.vercel/salidas-de-pruebas/`, se borra al detenerlo; quien pasa `SALIDA_VERCEL` conserva la suya). `scripts/servir-salida-vercel.mjs`: `new Request` va dentro del `try`, así que `TRACE` ya no tumba el proceso. Prueba: `tests/salida-astro-emulador.test.ts` (2 casos, ROJO→verde).
- **Pendiente:** queda una carrera entre procesos: dos `construirSiHaceFalta` a la vez, o una copia hecha a media reconstrucción. Arreglarla pide un candado entre procesos. Ticket propuesto: "candado de build de la salida de pruebas".
- **Compuertas:** lint 0; typecheck 453 archivos, 0 errores; build sin base OK; suite en el orden del CI (PG 16 `f5m1suite`) con 177/177 archivos, 4479 pasan y 2 xfail. PG detenido y sin emuladores vivos.
