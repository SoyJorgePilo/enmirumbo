# Reporte dev — agregar-boton-reportar

Etapa B (lógica de servidor + integración de lo que dejó `a-ui`). Las 19 tareas
de `tasks.md` quedan marcadas; la 18 va marcada como **parcial** (ver §6).

> **Iteraciones 2, 3 y 4: los 7 hallazgos están corregidos.** Ver **§7** (A1,
> A2, M1, M2, B1 de la etapa C), **§8** (M3 de la etapa C) y **§9** (M1 de la
> etapa D, más O11 y O12). Es lo que hay que leer primero si vienes de
> `c-seguridad.md` o de `d-validacion.md`.

Gates al cierre de la iteración 4: `npm run lint`, `npx tsc --noEmit`,
`npm run build` y `npm test` en verde — **58 archivos, 1 614 pruebas**, ninguna
saltada y **ningún `expected fail`** (los 4 `it.fails` de la primera pasada de
la etapa C y los 3 de la segunda están volteados). La iteración 3 cerró con
1 604; la 2, con 1 587; la 1, con 57 archivos y 1 495; antes de empezar, 1 296
con 3 en rojo (los que `a-ui` dejó anotados).

## 1. Qué se construyó

### Modelo (tarea 1)

- `prisma/schema.prisma`: modelo `Reporte` (`id`, `negocioId`, `motivo`,
  `comentario?`, `estado` default `pendiente`, `creadoEn`, `atendidoEn?`,
  índice `[negocioId, estado]`, FK con `onDelete: Cascade`) y el lado
  `reportes Reporte[]` en `Negocio`.
- `prisma/migrations/20260904143957_agrega_tabla_reporte/migration.sql`:
  generada con `--create-only` y luego editada a mano para meterle los dos
  CHECK (`motivo` y `estado`), que no son expresables en el schema de Prisma.
  **Verificado el riesgo de `design.md` §4**: el SQL solo hace `CREATE TABLE
  "Reporte"` + `CREATE INDEX`; no toca `Negocio` ni por `ALTER` ni por
  redefinición, así que los CHECK de `estado`/`origen` del negocio siguen
  vivos. Hay un test que lo comprueba leyendo el SQL y otro que aplica la
  migración sobre una base con negocios en los tres estados y luego intenta
  meter un `estado`/`origen` inválido (la base los rechaza).

### Dominio del reporte (tareas 2–5)

- `src/lib/reportes/estados.ts` (**nuevo, no estaba en tasks.md**):
  `ESTADOS_REPORTE`, `ESTADO_REPORTE_PENDIENTE`, `ESTADO_REPORTE_ATENDIDO`.
  Hacía falta un lugar único para los literales del CHECK de estado, igual que
  `src/lib/negocio.ts` hace con los del negocio; meterlos en `motivos.ts`
  habría mezclado dos vocabularios distintos.
- `src/lib/reportes/limite.ts`: cupo propio de 3/hora construido con
  `crearCupoPorIp` (mapa aparte del de altas) y
  `TOPE_REPORTES_PENDIENTES_POR_NEGOCIO = 10`.
- `src/lib/reportes/crear.ts`: `crearReporte(prisma, entrada)` con resultado
  discriminado `creado | descartado-silencioso | no-encontrado | cupo-agotado |
  error(motivo|comentario|servidor)`.

  **Orden de las defensas** (decisión, ver §4; ajustado en la iteración 2, §7):
  honeypot → motivo → comentario → negocio publicado → cupo por IP (comprobar
  y apartar de un tirón) → alta con el tope DENTRO de la sentencia.

- `src/lib/reportes/motivos.ts` y `textos.ts` los dejó `a-ui` y se usan tal
  cual; aquí solo se les escribieron las suites.

### Superficie pública (tareas 7–9)

- `src/app/negocio/[ficha]/reportar/accion.ts` **sustituye** a `accion-mock.ts`
  (borrado). Delgada, como la del registro: lee el envío, saca la IP con
  `ipDeEncabezados(await headers())`, llama a `crearReporte` y redirige.
- `page.tsx` y `gracias/page.tsx` de `a-ui` se quedaron como estaban; solo
  cambió el `.bind` de la acción.

### Panel (tareas 11–14)

- `src/lib/admin/reportes.ts` **nuevo**: `obtenerNegociosReportados`,
  `obtenerReportesPendientesDeNegocio`, `marcarReporteAtendido` y los dos tipos
  (`NegocioReportadoColaItem`, `ReportePendienteDetalle`) con **exactamente la
  forma que pidió `a-ui`**, así que sus tres componentes no cambiaron ni una
  línea de JSX (solo el `import` del tipo).
- `src/app/admin/registros/[id]/accion-marcar-reporte-atendido.ts` (sin
  `-mock`), con la guarda de sesión que ya venía.
- **Borrado `src/lib/mock/agregar-boton-reportar.ts`** y con él la dependencia
  de `obtenerDatosDelSitemap` que `a-ui` había tenido que meter para no romper
  el invariante de `estado: publicado`. La consulta real agrupa sobre la tabla
  `Reporte` y no vuelve a nombrar ese estado en ningún `where`, así que el
  invariante de `tests/directorio-consultas.test.ts` sigue intacto sin trucos.

## 2. Mapa scenario → test

Todos los archivos están en `tests/`. "Requirement" abrevia el del delta
correspondiente.

### `modelo-datos`

| Scenario | Test |
| --- | --- |
| reporte recién creado | `modelo-reporte.test.ts` › "un reporte recién creado queda pendiente…" |
| reporte con comentario | `modelo-reporte.test.ts` › "el comentario se guarda tal cual…" |
| motivo fuera del conjunto | `modelo-reporte.test.ts` › "la base rechaza un motivo que no está en la lista cerrada" |
| estado fuera del conjunto | `modelo-reporte.test.ts` › "la base rechaza un estado distinto…" |
| atender un reporte | `modelo-reporte.test.ts` › "un negocio con tres pendientes y uno atendido…" |
| conteo y lista de pendientes por negocio | mismo test + `reportes-consultas.test.ts` › "lista solo los que tienen pendientes…" |
| nada del reportante en el esquema | `modelo-reporte.test.ts` › "sus columnas son exactamente las siete…" y `reportes-privacidad.test.ts` › "ninguna columna del modelo huele a identidad…" |
| migración sobre una base con datos | `modelo-reporte.test.ts` › "crea la tabla sobre una base con negocios, sin tocar ni una fila" (+ "no redefine la tabla Negocio…") |
| hard delete de un negocio con reportes | `modelo-reporte.test.ts` › "borrar el negocio se lleva sus reportes…" |

### `directorio-publico`

| Scenario | Test |
| --- | --- |
| la ficha ofrece reportar sin robarle el lugar a WhatsApp | `reportes-pagina.test.ts` › "enlaza al formulario de ESE negocio, al final de la ficha" + "no usa el verde de acción…" |
| tocar el control abre el formulario de reporte | mismo test (enlace) y `layout.test.ts` › "la ficha enlaza al reporte de ESE negocio…" |
| etiqueta accesible con el nombre del negocio | `reportes-pagina.test.ts` › "su etiqueta accesible nombra al negocio" |
| reportar no está en las tarjetas | `reportes-pagina.test.ts` › "ninguna tarjeta del listado ni de resultados…" |
| formulario de reporte completo | `reportes-pagina.test.ts` › "trae el encabezado, el nombre, la frase…" |
| el reporte funciona sin JavaScript | `reportes-pagina.test.ts` › "ningún archivo nuevo del reporte declara use client" (+ el POST manual de §5) |
| reportar un negocio que no está publicado | `reportes-pagina.test.ts` › "en revisión / rechazado / id que no existe responde 404…" y `reportes-adversarial.test.ts` › "un envío contra … responde el mismo 404, sin fila" |
| la página de reporte no se indexa | `reportes-pagina.test.ts` › "la página y su confirmación declaran noindex" + `buscador-pagina.test.ts` (lista exhaustiva) |
| envío sin elegir motivo | `reportes-pagina.test.ts` › "sin motivo vuelve al formulario con el error, y el comentario por cookie" + "conserva el comentario que ya se había escrito, leído de la cookie" (§7, M2) |
| motivo fuera de la lista | `reportes-crear.test.ts` (5 formas) y `reportes-adversarial.test.ts` (9 formas) |
| comentario demasiado largo | `reportes-crear.test.ts` › "un comentario de 301 caracteres no guarda nada" |
| comentario que parece marcado | `reportes-crear.test.ts` › "guarda el comentario tal cual…" + `admin-reportes-paginas.test.ts` › "un comentario con etiquetas se pinta como texto…" |
| comentario de puros espacios | `reportes-crear.test.ts` › "un comentario de puros espacios queda como sin comentario" |
| reporte enviado | `reportes-pagina.test.ts` › "un envío válido guarda el reporte y manda a la confirmación" |
| la confirmación no cuenta nada del negocio | `reportes-pagina.test.ts` › "no dice cuántos reportes tiene el negocio…" |
| recargar la confirmación no duplica | `reportes-pagina.test.ts` › "muestra el mensaje, vuelve a la ficha y no crea ningún reporte" (la pantalla no tiene `<form>`) |
| bot que llena el honeypot | `reportes-pagina.test.ts` › "el honeypot lleno manda a la MISMA confirmación…" + `reportes-adversarial.test.ts` › "honeypot y tope … responden EXACTAMENTE como un reporte bueno" |
| cupo por IP agotado | `reportes-pagina.test.ts` › "el cuarto envío de la hora vuelve con el error de cupo" |
| sin encabezado de IP declarado | `reportes-adversarial.test.ts` › "sin la variable declarada el cupo no opera, pero las otras dos defensas sí" |
| el cupo de reportes no consume el de altas | `reportes-limite.test.ts` › los dos tests de "contador propio" |
| negocio con el tope de pendientes alcanzado | `reportes-pagina.test.ts` › "con el tope alcanzado se ve la confirmación de siempre…" y `reportes-adversarial.test.ts` › "el tope no se puede rebasar…" |
| el honeypot no molesta a las personas | **verificación manual** (§5): un POST sin `sitio_web` se procesa normal; el campo es `tabIndex={-1}` + `aria-hidden` (componente reutilizado, ya cubierto por `registro-pagina.test.ts`) |
| el formulario no pide datos del reportante | `reportes-pagina.test.ts` › "sus únicos campos son motivo, comentario y el campo trampa" |
| nada del reportante queda guardado | `reportes-privacidad.test.ts` › "un reporte recién creado solo trae negocio, motivo…" |
| la IP no se persiste ni se registra | `reportes-privacidad.test.ts` › "ni la IP ni el comentario llegan al log del servidor" |
| la ficha reportada sigue igual | `reportes-privacidad.test.ts` › "la ficha se ve exactamente igual antes y después…" |
| nada de auto-despublicar | `reportes-privacidad.test.ts` › "con el tope de pendientes el negocio sigue publicado y en su mismo lugar" |
| sin rastro de reportes en el HTML público | `reportes-privacidad.test.ts` › "la ficha / el listado / la página de resultados no trae conteos…" |
| reportar queda fuera del bloque de contacto | `reportes-pagina.test.ts` › "enlaza al formulario de ESE negocio, al final de la ficha" (posición vs. el `wa.me`) |
| sin JS de cliente nuevo | `reportes-pagina.test.ts` › "ningún archivo nuevo del reporte declara use client" |
| celular a 390px | **parcial**: automatizado el área táctil (`reportes-pagina.test.ts` › "cada control tocable reserva al menos 44px"); el ancho real, a ojo (§6) |
| navegación sin JavaScript | **verificación manual** (§5): POST `multipart/form-data` real → 303 + `Location` |

### `revision-admin`

| Scenario | Test |
| --- | --- |
| cola con negocios reportados | `admin-reportes-paginas.test.ts` › "encabeza con el conteo y lista cada negocio…" |
| sin reportes pendientes no hay sección | `admin-reportes-paginas.test.ts` › "sin ningún pendiente la sección entera desaparece" |
| los reportes no se mezclan con los registros por revisar | `admin-reportes-paginas.test.ts` › "un negocio publicado con reportes no entra a 'Registros por revisar'" |
| "Ver reportes" abre el detalle del negocio | `admin-reportes-paginas.test.ts` › "encabeza con el conteo…" (enlaces) + `layout.test.ts` (la ruta existe) |
| detalle con reportes | `admin-reportes-paginas.test.ts` › "los lista del más antiguo al más reciente…" |
| comentario con marcado | `admin-reportes-paginas.test.ts` › "un comentario con etiquetas se pinta como texto…" |
| negocio sin reportes | `admin-reportes-paginas.test.ts` › "un negocio publicado sin reportes / un registro en revisión no muestra la sección" |
| los reportes no salen del panel | `reportes-privacidad.test.ts` › los tres HTML públicos + "ninguna superficie pública importa el módulo de reportes del panel" |
| atender un reporte | `admin-reportes-paginas.test.ts` › "confirma en el detalle, saca ese reporte y deja los demás" |
| el último reporte atendido saca al negocio de la sección | `admin-reportes-paginas.test.ts` › "atendidos todos los reportes de un negocio…" y `reportes-consultas.test.ts` › "atendido el único pendiente…" |
| atender no cambia el negocio | `admin-reportes-paginas.test.ts` y `reportes-consultas.test.ts` › "el negocio queda intacto…" |
| doble marcado | `admin-reportes-paginas.test.ts` y `reportes-consultas.test.ts` › "la segunda vez … no pisa la fecha" |
| reporte inexistente | `admin-reportes-paginas.test.ts` › "un identificador de reporte inventado no cambia nada ni filtra datos" |
| cola sin sesión (sin conteos) | `admin-adversarial.test.ts` §10 › "la cola no revela ni el nombre del reportado ni su conteo" |
| detalle de un registro sin sesión (sin reportes) | `admin-adversarial.test.ts` §10 › "el detalle no revela el motivo ni el comentario" |
| atender un reporte sin sesión | `admin-adversarial.test.ts` §10 › "marcar como atendido sin sesión no escribe nada…" |
| ninguna transición desde lo público | `admin-adversarial.test.ts` §10 › "ninguna superficie pública sabe marcar reportes como atendidos" + `reportes-adversarial.test.ts` › "los campos del ciclo interno … se ignoran" |
| revisar desde el celular | **parcial**: `admin-reportes-paginas.test.ts` › "cada botón de atender reserva al menos 44px" y "una palabra larguísima no se sale de la pantalla"; el resto, a ojo (§6) |
| el panel funciona sin JavaScript | cubierto por el patrón POST→redirect→GET, probado en `admin-reportes-paginas.test.ts` (la acción se invoca directo, sin cliente) |
| sin JS de cliente propio | `layout.test.ts` › "ningún archivo de la capacidad layout-base declara use client" (los archivos nuevos del panel entran solos a esa lista por exclusión) |

### `registro-negocio`

| Scenario | Test |
| --- | --- |
| los cupos no se comparten entre superficies | `reportes-limite.test.ts` › "agotar el cupo de reportes no impide registrar…" y "agotar el cupo de altas no impide reportar…" (+ `registro-limite-ip.test.ts` sigue verde sin tocarse) |

## 3. Los 3 rojos que dejó la etapa A

1. `tests/layout.test.ts` (whitelist de rutas): `rutaInternaExiste` ahora
   resuelve `/negocio/<segmento>/reportar` y `.../gracias` contra negocios
   publicados de verdad, y **solo esas dos**: `/reportarr`,
   `/reportar/enviado` y una ficha inexistente siguen contando como enlace
   roto (hay casos negativos que lo fijan). Además la suite renderiza las dos
   páginas nuevas y revisa sus enlaces.
2. `tests/buscador-pagina.test.ts` (lista exhaustiva de páginas `noindex`): la
   lista blanca pasa de una ruta a tres, y se le agregó la vuelta —que cada
   excepción **sí** declare el `noindex`—, para que la lista no sea un permiso
   en blanco.
3. `tests/admin-paginas.test.ts` (snapshot de la cola): **se arregló solo** al
   quitar el mock. Con la tabla real, las fixtures de esa suite no tienen
   reportes, así que la sección no se pinta y el test vuelve a decir lo que
   decía. No hizo falta tocarlo; la sección nueva tiene su propia suite
   (`admin-reportes-paginas.test.ts`), que es lo que sugería el pendiente 5 de
   `a-ui`.

## 4. Decisiones técnicas

1. **Las consultas del panel viven en `src/lib/admin/reportes.ts`, no en
   `src/lib/reportes/`.** La tarea 6 dejaba elegir. Son lecturas que solo
   pueden ocurrir tras `requerirSesionAdmin()` y que devuelven texto capturado
   por terceros; ponerlas junto a `consultas.ts` mantiene la regla que ya
   existe ("este módulo no lo importa ninguna página pública") en un solo
   lugar, y hay un test que la hace cumplir.
2. **Orden de las defensas.** El honeypot va **primero**, antes de validar
   nada y antes de tocar la base: un bot que llena la trampa y además manda un
   motivo inventado tiene que ver la confirmación, no el error de motivo (si
   no, el orden mismo delata la trampa). El cupo por IP va **antes** de
   consultar el negocio para no convertir el cupo en un oráculo de existencia,
   y el `registrarReporteEnCupo` va **después** de confirmar que la ficha
   existe y está publicada: igual que en el registro, solo gasta cupo el envío
   que llegó a intentar algo real.
3. **`no-encontrado` responde con `notFound()`, no con un redirect.** La spec
   pide "el mismo 404 que una ficha inexistente"; `notFound()` en una Server
   Action está soportado en esta versión de Next (`node_modules/next/dist/docs/
   01-app/03-api-reference/04-functions/not-found.md`: "can be invoked in
   Server Components, Server Functions, and Route Handlers") y da exactamente
   la misma pantalla y el mismo código que la ficha.
4. **El eco del comentario se recorta a 300 caracteres.** El mock devolvía el
   comentario crudo en la URL del redirect; con 200 000 caracteres eso es una
   URL de 200 KB que el propio cliente eligió. Se sigue el precedente de
   `recortarParaEco` del registro: vuelve recortado a la cota del campo, que
   además le enseña al vecino qué parte sí cabía.
5. **`motivo` se lee con `getAll`, no con `get`.** Un grupo de radios manda un
   solo valor; dos `motivo` en el mismo envío no son un formulario, son un POST
   manipulado, y quedarse con el primero sería adivinar la intención. Se
   descarta el envío entero con el error de motivo.
6. **El conteo de la cola se resuelve con una consulta y agrupado en memoria**,
   no con `groupBy` + una segunda consulta para los nombres: los pendientes
   están acotados por el tope de 10 por negocio, así que el volumen es
   irrelevante y el orden de la sección sale gratis del `orderBy` de la
   consulta.
7. **`marcarReporteAtendido` responde `"ya-atendido"` también para un id que no
   existe.** Es el mismo `count === 0` y no hay razón para distinguirlos hacia
   afuera: si se distinguieran, la respuesta sería un oráculo de existencia de
   reportes.

## 5. Verificado a mano (lo no automatizable)

Con `npm run dev` en el puerto 3500 y la base de desarrollo con el seed de
demostración:

- Ficha de un negocio publicado → trae "Reportar este negocio"; `/reportar` →
  200 con los cuatro motivos; `/negocio/no-existe-xyz/reportar` → **404**;
  `/reportar/gracias` → 200 con la confirmación.
- **POST real de la Server Action** (`multipart/form-data` con los campos
  `$ACTION_REF_1` / `$ACTION_1:0` / `$ACTION_1:1` que genera Next para una
  acción con argumentos ligados, como documentó `a-ui`):
  - motivo válido + comentario → `303` a `.../reportar/gracias`;
  - sin motivo → `303` a `.../reportar?error=motivo&comentario=hola`;
  - honeypot lleno → `303` a `.../reportar/gracias` (idéntico al bueno).
  Consultando la base después: **una sola fila**, la del envío bueno, con
  `estado=pendiente`, `atendidoEn=null` y el comentario tal cual. La fila de
  prueba se borró al terminar.
- Base desde cero: `prisma migrate deploy` + `npm run db:seed` +
  `npm run db:seed:demo` sin error, y `prisma migrate status` sin drift.
- El panel con sesión real está cubierto por las suites automáticas (firman la
  cookie con el mismo módulo que producción y escriben en la base de prueba),
  así que no se creó ningún `.env` con secretos para probarlo a mano.

## 6. Pendientes y deuda

1. **Revisión visual con ojos a 390 / 768 / 1280 px (tarea 18).** Automatizado
   lo que se podía (área táctil ≥44px de cada control nuevo, `break-words` en
   el nombre del negocio y en el comentario del reporte, contraste AA ya
   cubierto porque no hay tokens de color nuevos). Falta mirar de verdad las
   cinco pantallas del enunciado; no hay pipeline de capturas en este entorno.
   **Para el PR.**
2. **El cupo por IP sigue en memoria del proceso**, como el de altas: se
   reinicia con el proceso y no se comparte entre instancias. Es la misma deuda
   provisional a sabiendas que ya existía (E0-3), ahora con un mapa más.
3. **Sin `REGISTRO_ENCABEZADO_IP` configurado, la única defensa que queda es
   el honeypot y el tope de 10 por negocio.** Es lo que la spec decidió y está
   probado, pero conviene tenerlo presente al desplegar: con el encabezado sin
   declarar, un atacante con paciencia puede llenar 10 reportes en cada ficha
   publicada. No es grave (el admin los atiende y la ficha vuelve a admitir),
   pero es ruido real en la cola.
4. **No hay historial de reportes atendidos** ni forma de ver desde el panel
   que un negocio ya tuvo reportes resueltos: al atender el último, el negocio
   desaparece de "Negocios reportados" sin dejar rastro visible. Está fuera de
   alcance por proposal, pero es lo primero que va a pedir quien opere el
   panel.
5. **Propuesta fuera de alcance — `prisma/seed-demo.ts` sin reportes.** El
   proposal lo deja fuera y así queda: hoy, para ver las dos secciones nuevas
   del panel en desarrollo, hay que crear los reportes a mano contra la base.
   Es el "chore de una línea" que menciona el proposal; sugiero hacerlo junto
   con T-015, que es cuando el admin va a necesitar el flujo completo.
6. **Propuesta fuera de alcance — el tope de 10 no distingue motivos.** Diez
   reportes de "Contenido ofensivo" y diez de "Ya cerró" pesan igual y se
   topan igual. Si el volumen crece, un tope por motivo daría mejor señal; hoy
   no hay datos para decidirlo.
7. **Nota para el validador:** los tres archivos de mock de la etapa A
   (`src/lib/mock/agregar-boton-reportar.ts`,
   `src/app/negocio/[ficha]/reportar/accion-mock.ts`,
   `src/app/admin/registros/[id]/accion-marcar-reporte-atendido-mock.ts`) se
   borraron del árbol. Nunca llegaron a git —la etapa A no commitea—, así que
   no aparecen como borrados en `git status`: simplemente ya no existen y la
   carpeta `src/lib/mock/` desapareció con ellos. Si algo los vuelve a
   nombrar, es un residuo.

---

## 7. Iteración 2 — corrección de los hallazgos de la etapa C

La etapa C bloqueó con **2 altos y 3 medios**. Los cinco están corregidos, cada
uno con la prueba que lo fija. Nada de esto cambió la spec: son las mismas
promesas, ahora cumplidas también cuando las peticiones llegan juntas.

### A1 (alto) · El tope de 10 pendientes ahora es atómico

**Antes:** `count` → `await` → `create`. Node cede el turno en cada `await`, así
que catorce envíos simultáneos leían los mismos "0 pendientes" y escribían los
catorce. El tope no era un techo, era una sugerencia — y es la ÚNICA defensa de
volumen que queda en un despliegue sin `REGISTRO_ENCABEZADO_IP`, que es el
estado de fábrica.

**Ahora** (`src/lib/reportes/crear.ts`): no hay `count` previo. La condición
viaja **dentro** del alta, en una sola sentencia que SQLite ejecuta
atómicamente, con parámetros ligados (`$executeRaw`, plantilla etiquetada — no
la variante `Unsafe`):

```
INSERT INTO "Reporte" (…)
SELECT ${id}, ${negocioId}, ${motivo}, ${comentario}, ${estado}, ${ahora}, NULL
WHERE (SELECT COUNT(*) FROM "Reporte"
       WHERE "negocioId" = ${negocioId} AND "estado" = ${pendiente}) < ${10}
```

Se mira cuántas filas escribió: `1` es `creado`, `0` es "el negocio ya estaba en
el tope" → **`descartado-silencioso`**, es decir, la confirmación NORMAL sin
fila, como pide la spec. Un fallo real de la base sigue saliendo por el
`catch` como error de guardado; los dos caminos no se confunden y hay un test
para cada uno.

Dos consecuencias que conviene tener escritas:

- **El `id` lo genera la aplicación** (`randomUUID` de `node:crypto`): el
  `@default(cuid())` del schema lo pone el cliente de Prisma, y un `INSERT`
  directo no pasa por ahí. Es aleatorio y no lleva ni un dato del reportante.
  Las filas creadas por `prisma.reporte.create` (seeds, fixtures) siguen
  teniendo cuid: conviven sin problema, nadie interpreta el formato del id.
- **`ClienteReportes` ahora pide `$executeRaw`** en vez de `reporte.count`/
  `reporte.create`. Es el mismo cuidado que ya se tuvo con `ClienteTransiciones`:
  el tipo estructural pide exactamente lo que el módulo usa, ni más.

**Pruebas:** `tests/reportes-crear.test.ts` › "catorce altas simultáneas… dejan
exactamente el tope" (10 creados + 4 descartes silenciosos) y
`tests/reportes-seguridad-adversarial.test.ts` › los dos casos `[A1]`.

### A2 (alto) · El cupo de 3/hora por IP se comprueba y se aparta sin ceder el turno

**Antes:** `cupoDeReportesAgotado(...)` → dos `await` → `registrarReporteEnCupo(...)`.
Ocho envíos simultáneos de la misma IP leían el contador antes de que ninguno
lo moviera, y pasaban los ocho.

**Ahora:** `apartarCupoDeReportes(ip, ahora)` (`src/lib/reportes/limite.ts`)
pregunta y aparta **en una sola función síncrona**, sin un solo `await` entre
las dos operaciones. Como JavaScript no interrumpe un bloque síncrono, la
primera petición que entra aparta y las demás ya ven el contador movido. Es el
mismo aprendizaje del semáforo: comprobar y apartar son un solo acto.

`cupoDeReportesAgotado` y `registrarReporteEnCupo` siguen exportados pero con la
documentación cambiada: son consulta de solo lectura y utilidad de pruebas.
**El servidor solo debe pedir cupo con `apartarCupoDeReportes`.**

El orden se conservó: el cupo se aparta DESPUÉS de comprobar que el negocio
existe y está publicado, así que sondear fichas inexistentes sigue sin gastarle
el cupo a nadie (observación 3 de la etapa C, que la etapa C prefería en ese
lado). Eso no reabre la carrera: el `await` está antes de la comprobación, no
entre comprobar y apartar.

**Pruebas:** `tests/reportes-limite.test.ts` › bloque "apartar cupo es comprobar
y apartar de un tirón" (5 casos), `tests/reportes-crear.test.ts` › "ocho altas
simultáneas desde la misma IP solo gastan el cupo de tres" y "cada IP conserva
su cupo aunque lleguen todas a la vez", y los dos casos `[A2]` de la suite de la
etapa C.

### M1 (medio) · El honeypot compara sin espacios

`crearReporte` evalúa `entrada.trampa.trim() !== ""`, igual que el honeypot de
altas (`texto()` de `src/lib/registro/validacion.ts` recorta antes de mirar).
Un espacio de un autocompletado ya no tira el aviso de una persona —que además
veía la confirmación de éxito y nunca se enteraba—; un bot que llena
formularios escribe algo, no un espacio, y ese sí se descarta.

**Pruebas:** `tests/reportes-crear.test.ts` › bloque "el campo trampa se compara
sin espacios" (3 casos que entran + 2 que se descartan) y los casos `[M1]` de la
etapa C.

### M2 (medio) · El comentario ya no viaja en la query string

**Antes:** el eco volvía en `?comentario=…`, y `path + query` es justo lo que
cualquier nginx, Cloudflare o balanceador escribe en su log de acceso sin que
nadie se lo pida, además de quedarse en el historial de un teléfono que se
comparte.

**Ahora:** en la URL solo viaja el **código** del error (`?error=motivo`, un
valor de una lista cerrada del propio servidor). Lo que el vecino escribió
vuelve en una cookie de borrador (`src/lib/reportes/borrador.ts`):

- `httpOnly` (no se lee desde el navegador), `SameSite=Lax`, `secure` cuando se
  sirve por HTTPS —misma regla que la cookie del panel—;
- `Path` acotado a la ruta del formulario de ESE negocio: no se manda en
  ninguna otra petición del sitio;
- `Max-Age=120`: se evapora sola, que es lo que se quiere de un texto que no se
  llegó a enviar;
- valor en **base64url del UTF-8**, para no meter comas, comillas ni acentos
  crudos en un `Set-Cookie` y no depender de cómo codifique cada capa;
- se **borra** en el envío bueno, para que el siguiente reporte de esa persona
  no salga con el comentario del anterior ya puesto.

**Por qué una cookie y no `useActionState`,** que es como el registro conserva
lo capturado: ese hook exige que el formulario sea Client Component, y la spec
de ESTA página lo prohíbe explícitamente ("la página de reporte con su
confirmación DEBEN ser Server Components y NO DEBEN agregar JavaScript de
cliente propio"), con un test que lo vigila. La cookie consigue exactamente lo
que pedía el hallazgo —el texto fuera de la URL y de los logs, conservado para
el vecino— sin una línea de JavaScript y sin tocar el patrón
POST→redirect→GET, así que recargar sigue sin reenviar nada.

El borrador se guarda recortado a los 300 caracteres de la cota **sin partir un
emoji a la mitad** (se tira la mitad de par suelta antes de codificar), y lo que
llega en la cookie se trata como entrada hostil: cualquier valor que no sea
base64url interpretable deja el formulario vacío, no roto.

**Pruebas:** `tests/reportes-pagina.test.ts` › "sin motivo vuelve al formulario
con el error, y el comentario por cookie", "el comentario ya NO se lee de la
URL…", "un comentario larguísimo no vuelve por la URL ni entero ni recortado",
"el borrador se guarda sin partir un emoji a la mitad"; y en la suite de la
etapa C, "el comentario NUNCA viaja en la URL" (3 casos), "una cookie de
borrador manipulada deja el formulario vacío, no roto" (5 valores) y "un envío
que sí se guarda borra el borrador anterior".

### B1 (medio) · Atender un reporte exige que sea del negocio del detalle

`marcarReporteAtendido` acepta ahora un `negocioId` opcional que entra al
`where` del `updateMany`, y la Server Action del panel se lo pasa siempre. Un
identificador de reporte cambiado a mano ya no puede marcar como atendido algo
que esa pantalla nunca mostró. **No cambia ninguna respuesta observable**: el
`count === 0` ya se respondía como `"ya-atendido"`, así que sigue sin distinguir
"es de otro negocio" de "no existe".

El parámetro va al final (`(prisma, reporteId, ahora?, negocioId?)`) a propósito:
mantiene compatible la firma que ya usaban las suites de las etapas B y C.

**Pruebas:** `tests/reportes-consultas.test.ts` › tres casos nuevos (ajeno, propio
y negocio inventado) y los dos casos `[B1]` de la etapa C.

### Observación 4, de paso

`obtenerNegociosReportados` ya no trae `motivo` ni `comentario`: la cola solo
pinta el negocio y su conteo, y leer texto capturado por terceros para tirarlo
era lo contrario del mínimo dato que respeta el resto del change.

**No se tocaron** las otras seis observaciones. La 1 (`robots.txt` sin las rutas
nuevas) queda como **propuesta**: el `noindex` que pide la spec sí está en las
dos páginas, y `robots.ts` tiene su propia suite de artefactos SEO; sumar dos
rutas ahí es un chore de un renglón que prefiero no colar en este change sin
pedirlo la spec.

### Qué pruebas de la etapa C se tocaron y por qué

La etapa C dejó **61 casos verdes + 4 `it.fails`**, y advirtió que cada `it.fails`
venía con un caso "hoy…" que **fija el comportamiento defectuoso** para que el
hallazgo no se perdiera. Al corregir los defectos, esos cuatro compañeros tenían
que cambiar por construcción: afirmaban justo lo que ya no pasa. Se tocaron
**nueve casos, no se borró ninguno** y el archivo pasó de 65 a **72 pruebas**:

| Caso de la etapa C | Qué se hizo |
| --- | --- |
| `it.fails` `[A1]`, `[A2]`, `[M1]`, `[B1]` | Se les quitó el `.fails`: ahora pasan de verdad |
| "[A1] hoy 14 simultáneos escriben las 14 filas" | Reescrito: entran **exactamente 10** y los 4 sobrantes ven la confirmación normal |
| "[A2] hoy 8 simultáneos no bloquean ni uno" | Reescrito: entran **3** y los otros 5 ven `error=cupo` |
| "[M1] hoy un espacio descarta el reporte" | Reescrito en tres casos: espacios/tabulador **no** descartan; contenido de verdad sí |
| "[B1] hoy un reporte de otro negocio se atiende" | Reescrito: responde `?reporte=ya-atendido`, el ajeno sigue `pendiente` y el propio se sigue pudiendo atender |
| "el eco del comentario vuelve escapado" | Adaptado al mecanismo nuevo: el borrador con `<script>` vuelve escapado desde la **cookie**, no desde la URL |

Los otros 57 casos de esa suite siguen exactamente igual y en verde.

### Verificado a mano en el servidor real (puerto 3500, `REGISTRO_ENCABEZADO_IP` declarada)

Con POST `multipart/form-data` reales contra `next dev`:

- **M2:** un envío sin motivo responde `303` a `…/reportar?error=motivo` —sin
  rastro del comentario— y un `Set-Cookie: nu_reporte_borrador=<base64url>;
  Path=/negocio/<segmento>/reportar; Max-Age=120; HttpOnly; SameSite=lax`. El
  GET siguiente con esa cookie devuelve el `<textarea>` **con el texto puesto**;
  sin la cookie, vacío.
- **M1:** con `sitio_web=" "` el reporte **sí** se guarda.
- **A2:** ocho POST **simultáneos** desde la misma IP → 3 a `/gracias` y 5 con
  `?error=cupo`; en la base, 3 filas.
- **A1:** catorce POST **simultáneos**, cada uno desde una IP distinta (para que
  el cupo por IP no ayude) → la tabla se queda en **exactamente 10 filas**, con
  10 ids distintos, y los sobrantes recibieron la confirmación de siempre.
- El log del servidor no contiene ni el comentario, ni "borrador", ni el nombre
  del dato de prueba: cero ocurrencias.

Las filas de prueba se borraron al terminar y el servidor quedó apagado.

---

## 8. Iteración 3 — M3: la ruta de la ficha la reconstruye el servidor

Última iteración. La re-auditoría aprobó las correcciones de la iteración 2 y
abrió un hallazgo medio propio, con tres `expected fail` esperándome. Está
cerrado.

### El defecto

`reportarNegocio(negocioId, hrefFicha, formData)` recibía la ruta de la ficha
como **argumento ligado con `.bind`**, y el docstring de la acción afirmaba que
esos argumentos "los fija el servidor al pintar el formulario, no el envío".

**Era falso, y el comentario era la peor parte del defecto.** Next serializa los
argumentos de `.bind` como campos ocultos del formulario (`$ACTION_x:1`), en
claro y sin firmar; el cifrado que documenta esta versión cubre las variables
capturadas por un **closure**, no los argumentos ligados, y los propios docs
recuerdan que hay que tratar toda Server Action como alcanzable por un POST
directo (`node_modules/next/dist/docs/01-app/02-guides/data-security.md`). Lo
comprobé en el HTML de un build de producción, no solo en `next dev`.

Esa cadena, que nadie validaba, llegaba a dos sinks: el `Location` del
`redirect` (**redirect abierto** desde un endpoint público sin autenticación) y
el atributo `Path` del `Set-Cookie` del borrador (un `;` partía el atributo y
colaba otro `Path` más ancho, **desactivando justo el acotamiento que introdujo
la corrección de M2**). Lo único que lo contenía era el cotejo `Origin`/`Host`
del framework: un control real, pero que no aparecía en ningún razonamiento del
diseño y que se desactiva solo con configurar mal `serverActions.allowedOrigins`
o con un CDN que reescriba el `Origin` — y este proyecto va a tener un proxy
delante.

### El arreglo

**No se recibe `hrefFicha`.** El único argumento ligado es `negocioId`, y la
ruta se reconstruye en el servidor con el mismo constructor que usa todo el
directorio:

```ts
const negocio = await obtenerNegocioPublicado(negocioId);
if (!negocio) notFound();
const rutaFormulario =
  `/negocio/${construirSegmentoFicha(negocio.nombre, negocio.id)}/reportar`;
```

Tres detalles que sostienen la corrección:

1. **La ruta se arma con lo que devolvió la base** (`negocio.nombre`,
   `negocio.id`), no con el `negocioId` del envío. Si ese identificador no
   corresponde a una ficha publicada, el camino termina en el mismo 404 de
   siempre antes de construir nada.
2. **`construirSegmentoFicha` slugifica el nombre** (`slugify` deja solo
   `[a-z0-9-]`), así que la ruta únicamente puede ser
   `/negocio/<slug>-<id>/reportar`: ni esquema, ni `//`, ni `;`, ni salto de
   línea. Los dos sinks quedan alimentados por un valor que el cliente no toca.
3. **`crearReporte` conserva su propia comprobación de negocio publicado.** Es
   redundante a propósito: es un módulo que se puede llamar desde otro sitio y
   no delega su invariante en quien lo llame. Sus pruebas unitarias siguen
   cubriéndola.

**El docstring mentiroso está corregido** y dice ahora lo contrario, con la cita
de los docs: lo que llega por `.bind` es entrada del cliente.

### Un 500 que apareció al arreglarlo, y también está cerrado

Con la firma de dos parámetros, un POST que mande **más** argumentos ligados de
los que la acción declara (el campo oculto es un arreglo en claro) deja en
`formData` lo que quiera el cliente. Antes de cerrarlo, eso reventaba en el
primer `formData.get` con un **500** (`TypeError: a.get is not a function`,
visto en el log del build de producción). Ahora:

```ts
if (!(formData instanceof FormData)) notFound();
```

Un envío que no trae el formulario responde el mismo 404 que cualquier otro
envío inservible, sin escribir nada y sin error del servidor. Cubre también el
caso contrario (arreglo ligado vacío, donde `formData` llega `undefined`).

### Verificado contra el build de producción (`next build` + `next start`, 3501)

Es donde la etapa C reprodujo M3, así que ahí se comprueba la corrección. Los
campos ocultos del formulario servido ya solo llevan el identificador:

```
<input type="hidden" name="$ACTION_0:1" value="[&quot;cmtn1hhx…&quot;]"/>
```

Y los cuatro POST manipulados (con `--form-string`, para que el `;` llegue
íntegro y no lo parta `curl`):

| Envío manipulado | Antes | Ahora |
| --- | --- | --- |
| Bound con un segundo argumento `https://evil.example` | `303 Location: https://evil.example/…` | **404**, sin fila |
| Bound con el id cambiado por `https://evil.example` | `303` al sitio ajeno | **404**, sin fila |
| Bound con el id `"/x; Path=/"` | `Set-Cookie … Path=/x; Path=/;` | **404**, sin fila |
| Bound vacío (sin argumentos) | `500` | **404**, sin fila |
| **Control legítimo** | — | `303 Location: /negocio/<seg>/reportar/gracias` y `Set-Cookie … Path=/negocio/<seg>/reportar; Max-Age=0; Secure; HttpOnly; SameSite=lax` |

En la base quedaron **solo las filas del control**; ninguno de los ataques
escribió nada. El log del servidor de producción no volvió a registrar ni un
`TypeError` ni la cadena `evil`. Las filas de prueba se borraron y el servidor
se apagó al terminar.

### Pruebas

**Los 3 `expected fail` de la etapa C están volteados** y su bloque 8 quedó
reescrito para el mecanismo nuevo: como la acción ya no acepta una ruta, los
casos mandan el destino hostil por los campos que un atacante probaría
(`hrefFicha`, `href`, `next`, `redirect`, `returnTo`, `callbackUrl` y el propio
`$ACTION_1:1`) y comprueban que ninguno mueve nada. El archivo pasa de 76
verdes + 3 `expected fail` a **83 verdes, sin ninguno esperado en rojo**:

| Caso de la etapa C | Qué se hizo |
| --- | --- |
| `it.fails` "la redirección debería quedarse en el sitio…" (×2) | Sustituidos por un `it.each` de **5 destinos hostiles** (con esquema, sin esquema, con salto de línea, con atributos de cookie y vacío): el destino es siempre `/negocio/<seg>/reportar/gracias` |
| `it.fails` "el `Path` de la cookie debería ser la ruta real" | Sin `.fails`: el `Path` coincide con la ruta real y no contiene `;` |
| "hoy el destino sale del sitio" | Reescrito: el destino es la ruta de ESE negocio, sin `evil`, y con la forma `^/negocio/[a-z0-9-]+/reportar/gracias$` |
| "hoy el `Path` lo elige quien envía" | Reescrito: ningún campo del envío mete atributos (`Path=/`, `Domain=`, `SameSite=None`) en el `Set-Cookie` |
| "un `negocioId` cambiado a mano… 404" y "un comentario gigantesco…" | Solo se les quitó el argumento que ya no existe |
| **nuevo** | Un negocio cuyo **nombre** lleva `<script>`, `;`, comillas y `\` produce igualmente una ruta `^/negocio/[a-z0-9-]+/…$`: la reconstrucción no depende de que el nombre sea manso |

En mis propias suites (`tests/reportes-pagina.test.ts`) añadí la red del dev:
que la página **liga un solo argumento** (`reportarNegocio.bind(null, negocio.id)`,
comprobado sobre el código fuente), que los campos del envío no mueven ni el
destino ni el `Path` de la cookie, y los tres casos del envío que no es un
`FormData`.

### Observación 10 de la etapa C, cerrada por otro camino

`negocioId` sigue siendo el **cuarto parámetro opcional** de
`marcarReporteAtendido`: hacerlo obligatorio cambiaría la firma que usan una
docena de casos verdes de las etapas B y C, y la instrucción era no tocarlos.
Lo que preocupaba a la etapa C —"una guarda de autorización que desaparece sola
si alguien olvida un argumento"— queda cubierto con una prueba estática en
`tests/admin-adversarial.test.ts`: **toda llamada a `marcarReporteAtendido` en
`src/` tiene que pasar el negocio**. Comprobado con una mutación (quitar el
argumento en la acción del panel pone el test en rojo).

Las demás observaciones (1, 2, 3, 5, 6, 7, 8, 9) siguen como estaban y ninguna
bloquea; la 1 (`robots.txt`) sigue siendo una propuesta para un chore aparte.

### Gates al cierre de la iteración 3

`npm run lint` limpio · `npx tsc --noEmit` limpio · `npm run build` ✓ ·
`npm test` → **58 archivos, 1 604 pruebas en verde, cero `expected fail`**.

---

## 9. Iteración 4 — M1 de la etapa D, más O11 y O12

El validador devolvió el change con **un medio bloqueante**: una cláusula
normativa de `revision-admin` sin implementar en una de sus dos ramas. Está
cerrada, junto con las dos correcciones editoriales que ya venían autorizadas.

### M1 (medio, bloqueante) · Atender el ÚLTIMO reporte no confirmaba nada

**El defecto.** El aviso "Reporte atendido." / "Este reporte ya lo habías
atendido." se pintaba **dentro** de `<ReportesPendientesNegocio>`, y esa sección
solo se renderiza si quedan pendientes. Al marcar el único reporte de un
negocio, la lista quedaba vacía, la sección entera desaparecía **y el aviso con
ella**: la pantalla de destino del `redirect` no decía nada. El requirement no
admite esa salvedad ("Tras marcarlo, el panel DEBE confirmar con el texto
literal…"), y es la rama más frecuente: casi todos los negocios reportados
tendrán un solo reporte.

Es, además, el peor momento para callarse: la sección desaparece a la vez, así
que el admin no tiene forma de distinguir "ya quedó" de "se perdió mi toque".

**El arreglo.** El aviso sale del componente y lo pinta el detalle a partir de
`?reporte=`, **exista o no la sección**:

```tsx
{avisoDeReporte && (
  <p role="status" className="text-sm font-semibold text-tinta">
    {avisoDeReporte === "atendido" ? MENSAJE_REPORTE_ATENDIDO : MENSAJE_REPORTE_YA_ATENDIDO}
  </p>
)}
```

Va **antes** de la sección de pendientes, así que cuando sí quedan reportes el
aviso se lee en el mismo lugar de siempre. La validación del valor no cambia:
solo `atendido` y `ya-atendido` pintan algo, y cualquier otra cosa en la URL
—que la escribe quien quiera— no pinta nada (hay un test que lo fija desde la
iteración 1). La prop `mensaje` desaparece de
`ReportesPendientesNegocio`, y su docstring explica por qué el aviso no vive
ahí, para que nadie lo devuelva "a su sitio natural" sin leer esto.

**Pruebas (los dos que pidió el validador, más uno):**

- `tests/admin-reportes-paginas.test.ts` › "atender el ÚNICO pendiente confirma,
  aunque la sección ya no aparezca": `303` a `?reporte=atendido`, el detalle
  trae "Reporte atendido.", **no** trae ni la sección ni el botón, y no quedan
  pendientes.
- › "el doble marcado del ÚNICO pendiente avisa y conserva la fecha original":
  `303` a `?reporte=ya-atendido`, el detalle trae el literal del doble marcado y
  la fecha de la primera vez no se mueve.
- › "sin ningún reporte, el detalle sigue confirmando lo que dice la URL": la
  rama extrema (un negocio que nunca tuvo reportes), para que el aviso no vuelva
  a depender de que haya datos que pintar.

Comprobado con una mutación (volver a condicionar el aviso a
`reportesPendientes.length > 0`): los tres casos se ponen en rojo.

**Reproducción del escenario del validador, contra el build de producción**
(`next build` + `next start` en el 3502, sesión firmada con el secreto de
prueba, negocio del seed con UN reporte pendiente):

```
POST  (Marcar como atendido, único pendiente)
  → 303  Location: /admin/registros/<id>?reporte=atendido
GET   /admin/registros/<id>?reporte=atendido
  → 200 · "Reporte atendido."        PRESENTE   ← antes: AUSENTE
        · "Reportes sin atender"     AUSENTE (correcto: ya no queda nada)
        · "Marcar como atendido"     AUSENTE
POST  de nuevo el mismo reporte
  → 303  Location: /admin/registros/<id>?reporte=ya-atendido
GET   /admin/registros/<id>?reporte=ya-atendido
  → 200 · "Este reporte ya lo habías atendido."  PRESENTE   ← antes: AUSENTE
```

En la base, el reporte quedó `atendido` con la fecha de la **primera** vez.

### O11 · `negocioId` que no es texto ahora responde 404, no 500

`src/app/negocio/[ficha]/reportar/accion.ts` comprueba
`typeof negocioId !== "string"` junto a la guarda de `formData`. Un bound
manipulado como `[null]`, `[12345]`, `[{…}]`, `["x","y"]` o `[]` recibe el mismo
404 uniforme que cualquier otro envío inservible, en vez de reventar más abajo
en la consulta a la base. No filtraba nada ni escribía nada —eso ya estaba
fijado—, pero dejaba que un anónimo llenara el log de trazas de Prisma a
voluntad, y hacía falsa la frase "404 uniforme" de la §8.

Verificado contra el build de producción: las cinco formas devuelven **404**, y
el log del servidor no registra ni un `TypeError` ni un
`PrismaClientValidationError`.

**El test `[O11]` de la etapa C queda invertido**, como pedía el validador:
conserva sus dos aserciones que importan (cero filas, cero cookies) y ahora
exige el `notFound()`; se le añadieron dos formas más (`undefined` y un
booleano). Pasa de "hoy revienta" a "responde 404, sin fila y sin cookie".

### O12 · La dependencia del id-cuid, escrita donde vive

`construirSegmentoFicha` (`src/lib/ficha-url.ts`) lleva ahora en su docstring
que **slugifica el nombre pero interpola el `id` tal cual**, así que la garantía
"la ruta solo puede ser `[a-z0-9-]`" —de la que depende la corrección de M3 y el
`Path` de la cookie— se apoya en que todo id de `Negocio` sea un cuid. El test
`[O12]` ya vigilaba el invariante contra la base; ahora la razón está en el
código, no solo en una prueba.

### Gates al cierre de la iteración 4

`npm run lint` limpio · `npx tsc --noEmit` limpio · `npm run build` ✓ ·
`npm test` → **58 archivos, 1 614 pruebas en verde, cero `expected fail`**
(iteración 3: 1 604). Sin dependencias nuevas y sin tocar git.

Sigue pendiente para el humano lo mismo que anotó el validador: la revisión
visual a 390/768/1280 px, el CI en verde en el PR y el merge.
