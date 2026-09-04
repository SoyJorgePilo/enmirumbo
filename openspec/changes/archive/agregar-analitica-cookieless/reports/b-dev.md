# Etapa B (dev) — `agregar-analitica-cookieless`

**Ticket:** `docs/tickets/T-010-analitica.md` · **Rama:** `feature/agregar-analitica-cookieless` (árbol principal)
**Etapa A (ui):** saltada con justificación del orquestador (sin superficie visual nueva). Confirmado al implementar: **no hizo falta UI real**. Cero pantallas nuevas, cero texto nuevo para el vecino, cero banner. Lo único que se ve en el HTML son atributos `data-*` invisibles y una etiqueta `<script>` sin representación visual.

**Gates:** `npm run lint` ✅ · `npm run build` ✅ (exit 0) · `npm test` ✅ **42 archivos / 1064 tests** (antes: 36 / 975 → +6 archivos, +89 casos).

> **Iteración 2 (tras la auditoría de la etapa C): §8 al final de este reporte.** Ahí están los cinco hallazgos atendidos, las mediciones que los respaldan y los gates actualizados (**43 archivos / 1 110 tests**, con los 30 casos adversariales de la etapa C en verde). Las secciones 1-7 son de la primera iteración y se conservan tal cual; donde algo quedó corregido, se dice.

---

## 1. Tareas (25 de tasks.md)

Las 24 primeras están hechas y marcadas `- [x]`. La 25 queda abierta a propósito: son los pasos humanos posteriores al merge (crear la cuenta, pegar las variables, verificar el filtrado de bots y los límites del plan). No bloquea el PR — de eso trata el fail-safe.

| # | Tarea | Resultado |
|---|---|---|
| 1-2 | Config fail-safe | `tests/analitica-config.test.ts` (rojo → verde) + `src/lib/analitica/config.ts` |
| 3-4 | Componente del script | `tests/analitica-script.test.ts` + `src/components/analitica/script-analitica.tsx` |
| 5 | Dos helpers de tests entienden grupos de rutas | `tests/layout.test.ts` (`rutaDePagina`) y `tests/directorio-consultas.test.ts` (`segmentosDeUrlDe`), verde ANTES de mover nada |
| 6 | Mudanza de 7 carpetas a `src/app/(publico)/` | Lista de rutas del build idéntica (ver §4) |
| 7 | `src/app/(publico)/layout.tsx` | Server Component de 6 líneas: `{children}` + `<ScriptAnalitica />` |
| 8 | Exclusión de `/admin` | `tests/analitica-exclusion-admin.test.ts` |
| 9-10 | Contrato de eventos | `tests/analitica-eventos.test.ts` + `src/lib/analitica/eventos.ts` |
| 11-12 | `categoriaSlug` en la proyección | `tests/directorio-consultas.test.ts` + `src/lib/directorio.ts` |
| 13-16 | Eventos en tarjeta y ficha | `tests/analitica-directorio.test.ts` + `tarjeta-negocio.tsx`, `botones-contacto.tsx` y sus tres páginas |
| 17-18 | Adversarial de privacidad | `tests/analitica-privacidad.test.ts` |
| 19 | Registro sin instrumentar | `tests/registro-pagina.test.ts` (describe nuevo) |
| 20-21 | `.env.example` | Bloque nuevo + su test en `tests/analitica-config.test.ts` |
| 22 | ADR-005 | De "propuesta" a **aceptada el 2026-09-03, ejecutada en E7 (T-010)** |
| 23-24 | Cierre | Verificación manual con servidor levantado (§5) + los tres gates |

Ninguna tarea resultó mal planteada; no hubo que corregir tasks.md (solo se anotó en la 25 que es del humano).

---

## 2. Mapa scenario → test

### `layout-base` (ADDED)

**Requirement: La medición cookieless se carga solo si está configurada…**

| Scenario | Verificación |
|---|---|
| sin variables configuradas no se carga nada | `analitica-config` ("devuelve null sin ninguna de las dos variables, y sin avisar nada"), `analitica-script` ("sin configuración no pinta absolutamente nada"), `analitica-privacidad` ("la página %s no trae script externo ni el dominio del proveedor", 8 páginas públicas) + verificación manual §5 |
| con las dos variables se carga el script del proveedor | `analitica-config` ("devuelve src e identificador…"), `analitica-script` ("con configuración pinta exactamente un script diferido del proveedor"), `analitica-exclusion-admin` ("el layout del grupo público pinta el script…") + manual §5 |
| configuración a medias | `analitica-config` (8 casos: solo una variable, espacios, `http:`, relativa, `javascript:`, no-URL) + "avisa UNA sola vez por proceso" + "la advertencia no repite el valor configurado"; `analitica-script` ("con la configuración a medias tampoco pinta nada") |
| nunca hay banner de cookies | `analitica-privacidad` ("ninguna página pública muestra banner ni interruptor de cookies") |

**Requirement: El panel del admin queda fuera de la medición**

| Scenario | Verificación |
|---|---|
| el panel no carga el script | `analitica-exclusion-admin` (5 pantallas del panel renderizadas CON la medición configurada: acceso, cola, detalle, aprobado, rechazado) + manual §5 (`/admin` → 0 menciones) |
| una página pública nueva sí queda medida | `analitica-exclusion-admin` ("ninguna página del panel vive dentro del grupo (publico)", "el script se renderiza desde un único archivo", "el layout raíz no sabe nada de la medición" + el panel no tiene `layout.tsx` propio) |

**Requirement: La medición no lleva datos personales ni el texto que escribe la gente**

| Scenario | Verificación |
|---|---|
| propiedades de un evento | `analitica-eventos` ("devuelve el nombre del evento y exactamente dos propiedades"), `analitica-privacidad` ("las únicas propiedades que existen son categoria y colonia") |
| negocio con colonia "Otra" sin normalizar | `analitica-eventos` (7 casos: nulo, vacío, espacios, texto libre, acentos, signos), `analitica-directorio` ("la ficha de un negocio con colonia libre manda colonia=otra"), `analitica-privacidad` ("la colonia de texto libre viaja como 'otra' y su texto no sale") |
| lo que escribe el vecino no viaja | `analitica-script` ("pide al tracker excluir la cadena de consulta"): `data-exclude-search="true"`. **Confirmado contra la documentación viva de Umami** (ver §3) |
| ningún dato del negocio dentro de un atributo | `analitica-privacidad` (adversarial sobre listado, resultados y ficha de un negocio sembrado con nombre, WhatsApp, teléfono, dirección, horario, "¿Qué ofreces?", página y colonia "Otra" con referencias de domicilio; se prueban también trozos: "panteón", "Sauces", "llave") + "ningún valor de propiedad tiene espacios, acentos ni signos" |

**Requirement: Un solo script diferido y cero JavaScript propio de cliente**

| Scenario | Verificación |
|---|---|
| un solo script y diferido | `analitica-script` ("exactamente una etiqueta", `defer`, sin código en línea, sin scripts encadenados ni gestor de etiquetas) + manual §5 |
| los atributos no ejecutan nada por sí solos | `analitica-privacidad` ("los botones conservan href, pestaña nueva y rel aunque no haya medición"), `analitica-directorio` ("los atributos no cambian el href ni el resto del botón") |
| sin componentes de cliente | `analitica-script` ("ningún archivo nuevo de la analítica declara la directiva ni usa `next/script`") + el guardián global de `tests/layout.test.ts` que recorre TODO `src/` menos el registro (los archivos nuevos entraron solos a esa vigilancia) |

**Requirement: Los conteos excluyen bots y crawlers**

| Scenario | Verificación |
|---|---|
| un crawler que no ejecuta JavaScript | Se sigue del anterior: la única medición es el script del navegador. Test de apoyo: `analitica-privacidad` ("ver una ficha no escribe nada en la base") |
| el servidor no lleva contadores | `analitica-privacidad` (mismo test: `publicadoEn`/`registradoEn` idénticos antes y después de servir la ficha) |

**Requirement: `.env.example` explica la analítica y el paso que le toca al humano**

| Scenario | Verificación |
|---|---|
| el humano sabe qué hacer | `analitica-config` (3 tests: las dos variables + enlace + valor típico; "no son secretos" + redesplegar + "el sitio corre igual" + filtrado de bots; y que **ninguna línea de asignación está sin comentar**) |

**Requirement MODIFIED: Server Component con documento en es-MX y metadata base**

| Scenario | Verificación |
|---|---|
| documento en español de México con metadata | `tests/layout.test.ts` (existente, sin cambios) |
| sin JS de cliente en el layout | `tests/layout.test.ts` (existente; el layout del grupo entra solo a la lista) |
| el único script es el de la medición | `analitica-exclusion-admin` ("el layout del grupo público pinta el script…" + "no repinta el documento") y `analitica-privacidad` (sin configuración, cero externos) + manual §5 |

### `directorio-publico`

| Scenario | Verificación |
|---|---|
| el clic desde la tarjeta se mide con su categoría y su colonia | `analitica-directorio` ("el botón de WhatsApp de la tarjeta declara whatsapp-tarjeta con sus dos slugs") |
| en la página de resultados manda la categoría del negocio | `analitica-directorio` ("en los resultados cada tarjeta manda la categoría de SU negocio": exige más de una categoría distinta en la misma página) + `directorio-consultas` ("en los resultados de búsqueda cada negocio trae la suya") |
| el botón se comporta igual sin medición | `analitica-directorio` ("los atributos no cambian el href ni el resto del botón") |
| los tres contactos de la ficha se miden por separado | `analitica-directorio` ("WhatsApp, Llamar y Cómo llegar llevan su evento con categoria y colonia") |
| el enlace a la página registrada no se mide | `analitica-directorio` ("el enlace a la página del negocio no lleva ningún atributo de evento") |
| los eventos de la ficha se distinguen de los de la tarjeta | `analitica-eventos` ("el WhatsApp de la tarjeta y el de la ficha son eventos distintos") |
| negocio sin teléfono ni dirección | `analitica-directorio` ("los botones que no aplican siguen sin renderizarse (ni su evento)") |
| abrir una ficha cuenta como vista / la ficha no agrega instrumentación | `analitica-directorio` ("no hay evento de vista ni contador propio en la ficha"). La vista en sí la cuenta el proveedor: **no automatizable** aquí, se verificará en el panel (paso humano 25) |
| Los scenarios previos de tarjeta y ficha (contenido, "A domicilio", accesibilidad, Maps, dominio real) | Suites existentes intactas y en verde |

### `registro-negocio` (ADDED)

| Scenario | Verificación |
|---|---|
| sin instrumentación en el botón | `registro-pagina` ("el botón 'Enviar' no lleva ningún atributo de evento" + "ninguna de las dos pantallas del registro instrumenta nada", que también revisa el código fuente de las 6 superficies del registro) |
| las URLs del registro no llevan datos | `registro-pagina` ("las dos pantallas viven en URLs sin parámetros": el formulario no arma `/registro?…` y la acción redirige a `/registro/gracias` fijo) |
| registro exitoso / envío con errores no cuenta como conversión | Se siguen de que el embudo son vistas de página: el error se muestra en la MISMA URL `/registro` (ya cubierto por los tests existentes de POST-Redirect-GET y de errores por campo) y no hay evento de "enviado" que mandar. **Conteo real: verificación humana en el panel** (tarea 25) |
| un envío bloqueado por el honeypot | No automatizable del lado del proveedor (depende de que el bot ejecute JS). El conteo contable de altas sigue saliendo de la base; documentado en la spec |

---

## 3. Decisiones técnicas

1. **`data-exclude-search` sigue existiendo — confirmado, no hizo falta el plan B.** Consultado el 2026-09-03 contra `https://umami.is/docs/tracker-configuration` (documentación viva, no memoria): el atributo aparece con el valor `"true"`, junto a `data-exclude-hash`, `data-do-not-track` y `data-before-send`. También se confirmó en `https://umami.is/docs/track-events` la forma `data-umami-event` / `data-umami-event-*`. La confirmación quedó anotada con fecha y URL en el comentario de `script-analitica.tsx`, y hay un test que exige que esa nota siga ahí.
2. **Etiqueta `<script>` a secas, no `next/script`.** `next/script` es un componente de cliente: importarlo habría sumado bundle propio para cargar un script de terceros. Un `<script defer src>` en un Server Component no cuesta un byte de JavaScript nuestro. Efecto: la etiqueta queda dentro de `<main>` (React solo iza los `async`), lo cual es HTML válido y no cambia el comportamiento de `defer`.
3. **El módulo de configuración arma su propio objeto de entorno** con las dos expresiones literales `process.env.NEXT_PUBLIC_…` y acepta un entorno por parámetro. Así se cumple la exigencia de Next (sustitución textual en el build) **y** los tests son puros, sin ensuciar `process.env`.
4. **Una sola regla de saneado para las dos propiedades:** slug limpio (`^[a-z0-9-]+$`) o `otra`. La spec solo exige el `otra` para la colonia, pero aplicar la misma regla a `categoria` sale gratis y convierte "no se filtra texto libre" en una propiedad del código en vez de una confianza en la fuente de datos.
5. **Sin dependencias nuevas, sin migración de base.** El único cambio de datos es leer una columna que ya existía (`categoria.slug`).
6. **La proyección pública creció con `categoriaSlug`, y eso tocó tres guardianes existentes** que vigilan que la ficha pública no crezca a espaldas del aviso de privacidad. Se actualizaron a conciencia, no por conveniencia: el aviso ya enumera "la categoría" entre los datos públicos desde E6, así que `categoriaSlug` entró al mapa `CAMPO_PUBLICO_DECLARADO` (declarado), **no** a la lista de excepciones.
7. **Los helpers de tests atraviesan los grupos de rutas en vez de saltárselos.** `segmentosDeUrlDe` recursa dentro de `(publico)` y devuelve `terminos`, `registro`, `negocio`…: si se hubieran ignorado las carpetas de grupo sin más, la comprobación de segmentos reservados habría dejado de mirar las rutas públicas justo después de mudarlas.

---

## 4. La mudanza a `(publico)`: qué se movió y qué no

Movidos sin tocar su contenido: `page.tsx`, `[categoria]/`, `negocio/`, `buscar/`, `registro/`, `aviso-de-privacidad/`, `terminos/`.
Se quedaron fuera: `layout.tsx` (html, body, header, footer, metadata), `not-found.tsx`, `globals.css`, `favicon.ico` y `admin/`.

**Lista de rutas del build, antes y después: idéntica.** `/`, `/_not-found`, `/[categoria]`, `/admin`, `/admin/cola`, `/admin/registros/[id]`, `/admin/registros/[id]/{aprobado,rechazado,ya-resuelto}`, `/aviso-de-privacidad`, `/buscar`, `/negocio/[ficha]`, `/registro`, `/registro/gracias`, `/terminos`. Ninguna URL cambió y no se necesita ninguna redirección.

Se actualizaron las rutas de importación en 13 suites y 3 comentarios de `src/`, más el alias `@/app/(publico)/registro/accion` del formulario. **Aviso para quien reconstruya:** hay que borrar `.next/` después de mover carpetas de rutas — los tipos generados quedan viejos y el build falla con `Cannot find module '../../../src/app/…'` hasta que se limpian.

---

## 5. Verificación manual (lo que no se puede automatizar en Vitest)

Servidor real (`next start`, puerto 3000), primero **con** las dos variables (valores de mentira) y luego **sin** ellas:

| Ruta | Con variables | Sin variables |
|---|---|---|
| `/`, `/servicios-del-hogar`, `/buscar?q=plomeria`, `/registro`, `/registro/gracias`, `/terminos` | 1 `<script defer src="https://cloud.umami.is/script.js" data-website-id="…" data-exclude-search="true">` | **0 scripts externos**, 0 menciones al dominio |
| `/admin`, `/admin/cola` | **0 menciones al proveedor** (ni en el HTML ni en la carga de React) | 0 |
| 404 (`/a/b/c`, `/negocio/nada-xyz`, `/pagina-que-no-existe`) | **0 etiquetas `<script>` del proveedor** (efecto lateral aceptado en el diseño: la 404 no se mide) | 0 |

- **Tamaño del bundle de cliente idéntico** con y sin configuración: `.next/static` = 676 KB y 13 archivos en ambos casos. El script del proveedor no entra al bundle, es una etiqueta en el HTML.
- **Archivos con `"use client"` en todo `src/`: siguen siendo dos**, los dos del formulario de registro (`formulario-registro.tsx`, `boton-enviar.tsx`). Ninguno nuevo.
- **Sin JavaScript, las páginas están completas**: el HTML servido del listado trae las 3 tarjetas con su `h1`, su enlace a la ficha y su botón `wa.me` con los tres atributos de evento (`whatsapp-tarjeta` + `categoria` + `colonia`), y la home trae su contenido íntegro.
- Detalle observado, sin consecuencia: en una URL que **primero encaja** con `/[categoria]` o `/negocio/[ficha]` y luego llama a `notFound()`, la carga serializada de React menciona el `src` del proveedor (el layout del grupo se evaluó antes de que el 404 tomara el control), pero **no se emite ninguna etiqueta `<script>`**: el navegador no pide nada. Vale la pena que la etapa C lo mire con ojos frescos. **→ Lo miró (M-1) y este párrafo se quedaba corto: corregido en la iteración 2, §8.**

---

## 6. Deuda y propuestas fuera de alcance

Nada de esto se construyó; queda anotado:

1. **CSP con el dominio del proveedor** (fuera de alcance declarado): hoy el sitio no manda `Content-Security-Policy`. Cuando E0-3 (T-013) defina hosting y cabeceras, la lista de `script-src` tiene que incluir `https://cloud.umami.is` o el script no cargará. Vale la pena que T-013 lo tenga escrito.
2. **La página 404 no se mide.** Efecto lateral aceptado en el diseño. Si algún día interesa saber cuántos enlaces rotos llegan (útil cuando se compartan URLs por WhatsApp), habría que sacarla del hueco: es otro ticket.
3. **`data-do-not-track`** (respetar la señal del navegador): opción de una línea en el mismo componente. Es decisión de producto, no de este ticket.
4. **Analítica de términos buscados.** Excluir la cadena de consulta la apaga de raíz, y saber "qué busca la gente y no encuentra" es de lo más valioso para la siembra del PRD §9. La forma limpia sería un evento propio con la consulta **normalizada y acotada** (o solo el número de resultados), con su propia conversación de privacidad. Ticket aparte.
5. **Vista propia de métricas (E7-2)** y **"altas aprobadas" como evento**: fuera de alcance por proposal. El número de altas sale de la base con una consulta del panel.
6. **Sugerencia de proceso:** hoy nada impide que una página pública nueva se cree por error fuera de `src/app/(publico)/` y quede sin medir. El test estructural vigila lo contrario (que `/admin` no entre al grupo). Un caso extra —"toda carpeta de página que no sea `admin` vive dentro del grupo"— cerraría el círculo; no lo agregué porque la spec no lo pide y decidirlo toca a quien defina si habrá más rutas fuera del grupo (por ejemplo `api/`).
7. **El ticket T-010 conserva sus criterios de aceptación sin marcar.** No los toqué para no chocar con los agentes que están editando tickets vecinos en el mismo árbol; los seis criterios están cubiertos por los tests y verificaciones de arriba.

---

## 7. Archivos

**Nuevos**

- `src/lib/analitica/config.ts`, `src/lib/analitica/eventos.ts`
- `src/components/analitica/script-analitica.tsx`
- `src/app/(publico)/layout.tsx`
- `tests/analitica-config.test.ts`, `tests/analitica-script.test.ts`, `tests/analitica-exclusion-admin.test.ts`, `tests/analitica-eventos.test.ts`, `tests/analitica-directorio.test.ts`, `tests/analitica-privacidad.test.ts`

**Movidos (sin cambio de contenido salvo lo indicado)**

- `src/app/{page.tsx,[categoria],negocio,buscar,registro,aviso-de-privacidad,terminos}` → `src/app/(publico)/…` (en `[categoria]/page.tsx`, `buscar/page.tsx` y `negocio/[ficha]/page.tsx` se agregaron las props de slugs)

**Modificados**

- `src/lib/directorio.ts` (`categoriaSlug` en la proyección), `src/components/directorio/tarjeta-negocio.tsx`, `src/components/directorio/botones-contacto.tsx`, `src/components/registro/formulario-registro.tsx` (alias del import), comentarios de `src/lib/legales/textos.ts` y `src/lib/registro/procesar.ts`
- `.env.example`, `docs/decisiones/ADR-005-analitica.md`
- Tests: `layout.test.ts`, `directorio-consultas.test.ts`, `registro-pagina.test.ts`, `legales-adversarial.test.ts`, `busqueda-consultas.test.ts`, `buscador-seguridad-adversarial.test.ts` y 8 suites más solo por rutas de importación

---

## 8. Iteración 2 — respuesta a la auditoría (`reports/c-seguridad.md`)

**Gates tras la iteración:** `npm run lint` ✅ · `npm run build` ✅ (exit 0, lista de rutas idéntica) · `npm test` ✅ **43 archivos / 1 110 pruebas**, con los **30 casos adversariales de la etapa C en verde** (la etapa C dejó 43 / 1 094; +16 casos míos).

Los cinco hallazgos están atendidos. Tres se cerraron con código, uno con documentación que sobrevive al merge y el de la 404 con un diagnóstico corregido y las invariantes que sí son nuestras ancladas en tests.

**Cómo se midió esta iteración.** Se rehízo el banco de la etapa C, sin dar nada por bueno de segunda mano: el tracker real descargado y leído (`cloud.umami.is/script.js`, 4 717 bytes), un proveedor falso local —HTTP para medir tiempos y **HTTPS con `--host-resolver-rules`** para interceptar `cloud.umami.is` y `gateway.umami.is`— y Chrome headless. Todo lo que sigue son mediciones propias.

### A-1 (ALTO) · El referente ya no sale del panel — **cerrado**

- **Arreglo:** `src/app/admin/layout.tsx` nuevo, con `export const metadata: Metadata = { referrer: "no-referrer" }`. Se eligió el mecanismo de metadata de Next (no `rel="noreferrer"` enlace por enlace) porque es **por construcción**: cubre las salidas que existen hoy y las que alguien agregue mañana al encabezado o al pie, sin que nadie tenga que acordarse. El layout no renderiza nada más (`{children}` pelado) y no toca datos.
- **Verificado en el HTML SERVIDO de las seis pantallas**, con `next start` y una cookie de sesión firmada por el módulo real del panel:

  | Pantalla | Respuesta | `<meta name="referrer" content="no-referrer">` en `<head>` |
  |---|---|---|
  | `/admin` (sin sesión, pantalla de acceso) | 200 | sí |
  | `/admin` (con sesión, redirige a la cola) | 307 | sí |
  | `/admin/cola` | 200 | sí |
  | `/admin/registros/<id>` | 200 | sí |
  | `/admin/registros/<id>/aprobado` | 200 | sí |
  | `/admin/registros/<id>/rechazado` | 200 | sí |
  | `/admin/registros/<id>/ya-resuelto` | 200 | sí |
  | `/`, `/servicios-del-hogar` (públicas) | 200 | **no** — la política es del panel, no del sitio |

- **Efecto comprobado en un navegador real** (Chrome, dos páginas del mismo origen, la primera enlazando a la segunda, con y sin la etiqueta):
  - **sin** la meta → la segunda página recibe `document.referrer = http://localhost:4601/`, que es exactamente lo que el tracker reenviaría como ruta;
  - **con** la meta → `document.referrer` **vacío**. El canal queda cerrado.
- **Tests (5 casos nuevos en `tests/analitica-exclusion-admin.test.ts`):** la política del layout; la etiqueta que Next emite para **cada una de las seis pantallas** (aplicando su regla de herencia: un campo que la página no define lo hereda del layout, `node_modules/next/dist/docs/…/generate-metadata.md`); que ninguna pantalla puede rebajar la política (ni por metadata ni en el código, con la lista de valores permisivos prohibida); y que lo público **no** hereda esta política. La comprobación fila-por-fila del HTML servido es la tabla de arriba: montar `next start` dentro de Vitest habría hecho la suite lenta y frágil.
- **Efecto lateral:** el panel estrenó layout, así que se actualizó la aserción que la etapa C señaló (`tests/analitica-exclusion-admin.test.ts`, "el panel no tiene layout propio") por la que de verdad importa —que ese layout no cuele medición, comprobado también renderizándolo— y se agregó `src/app/admin/layout.tsx` a las excepciones de los dos guardianes de la guarda de sesión (`tests/admin-acceso.test.ts`, `tests/admin-adversarial.test.ts`), con el motivo escrito: no renderiza contenido ni accede a datos. De paso, el test de excepciones ahora también prohíbe `prisma.` en ellas.

### M-2 · El título de `/buscar` ya no puede llevar lo que escribe el vecino — **cerrado**

- **Arreglo:** `/buscar` declara un título **estático explícito**, `TITULO_BUSCAR = "Buscar — NecesitoUno Tizayuca"`, con el porqué escrito al lado. Antes la protección era pasiva ("esta página no tiene título propio, hereda el del layout"), que es justo lo que T-009 rompería sin enterarse; ahora quien le ponga metadata dinámica tiene que borrar un comentario que le explica que `/buscar` es `noindex` —un título dinámico no le aporta SEO— y que el término saldría al proveedor.
- **Verificado servido:** `/buscar?q=quiero abogado` → `<title>Buscar — NecesitoUno Tizayuca</title>`, mientras el `h1` sigue devolviéndole al vecino su consulta (que no viaja a ningún lado).
- **Test:** el guardián de la etapa C se hizo más fuerte en vez de romperse: además de prohibir `generateMetadata`, exige el título literal y que el valor no dependa de la consulta.
- **Interacción con T-009, para el merge:** si `agregar-seo-local` toca `src/app/(publico)/buscar/page.tsx`, esta excepción tiene que sobrevivir. Está escrita en tres lugares que su autor va a ver: el comentario del archivo, el test que falla, y ADR-005.
- **Lo que no hice, y propongo:** el requirement de privacidad de `specs/layout-base/spec.md` sigue nombrando dos canales (propiedades y URL) cuando el tracker manda **tres**. Editar la spec aprobada no es mío; la enmienda que propongo, para quien la apruebe, es agregar al requirement "La medición no lleva datos personales ni el texto que escribe la gente": *"El proveedor recibe además el TÍTULO del documento y el REFERENTE de la página. Ningún título de página pública DEBE contener texto escrito por un visitante, y las pantallas del panel DEBEN declarar `no-referrer`."* La sustancia ya está en ADR-005 y en los tests.

### M-1 · La 404: diagnóstico corregido y medido de nuevo — **documentado y anclado**

Mi §5 decía "el navegador no pide nada" y se quedaba en el HTML servido. Es verdad pero incompleto, y la parte que faltaba es la importante. Medido otra vez, por mí, en la iteración 2:

| Observación (URL que encaja con `/[categoria]` y luego hace `notFound()`) | Resultado |
|---|---|
| HTML servido | 0 etiquetas `<script>` del proveedor |
| **DOM hidratado** (Chrome `--dump-dom`) | **sí aparece** `<script defer src="https://cloud.umami.is/script.js" data-website-id=… data-exclude-search="true">` |
| Peticiones, con `cloud.umami.is` y `gateway.umami.is` apuntados a un proveedor falso en TLS | **cero** en la 404 · **tres** en una página pública normal (`GET /script.js`, `OPTIONS` y `POST /api/send`), que es el control que valida el banco |

**Corrección del diagnóstico:** que la 404 no se mida **no es una propiedad de nuestro código**. El nodo llega al DOM porque el layout del grupo se evaluó antes de que el 404 tomara el control, y no se ejecuta por cómo React trata un `<script src>` que aparece al hidratar. Es una dependencia de versión, no una invariante nuestra.

**Cierre real evaluado y descartado, con la razón:** las dos formas de convertirlo en invariante propia cuestan más de lo que arreglan. (a) Poner un `not-found.tsx` **dentro** del grupo mueve la frontera al revés: haría que las 404 **sí** se midan, y entre ellas las de fichas **no publicadas** (`/negocio/<slug-con-el-nombre>-<id>` de un registro en revisión, rechazado o borrado por ARCO), que es justo lo que la duda #1 de la aprobación **no** autorizó. (b) El plan B del `design.md` §1 (el script en cada `page.tsx`) sí lo cierra por definición, pero cambia la decisión aprobada y **debilita la exclusión de `/admin`**, que es el riesgo grande: la cambia de estructural a vigilada. No vale la pena pagar eso por un efecto que hoy no manda un solo byte.

**Lo que sí se ancló (3 casos nuevos):** la 404 vive fuera del grupo; **no existe ningún `not-found.tsx` dentro de `(publico)`** —la lista de `not-found` del proyecto tiene que ser exactamente `["/src/app/not-found.tsx"]`, así que el escenario peligroso (a) rompe la suite—; y un **canario de versiones** que fija `next@16.3.3` y `react-dom@19.2.8` con el mensaje "vuelve a medir la 404 (M-1)", para que una subida obligue a repetir la medición en vez de convertir el efecto lateral en medición real sin que nadie se entere. El procedimiento está en este mismo reporte.

### M-3 · Modelo de confianza y CSP: fuera del reporte, a archivos que sobreviven — **cerrado**

- **`.env.example`** (que ya vivía en el repo y no se archiva) documenta ahora los **dos** dominios y por qué son dos: el script se descarga de `https://cloud.umami.is` y **los datos van a `https://gateway.umami.is/api/send`**. Lo confirmé yo con el proveedor falso: la petición `POST` llega a `gateway`, no a `cloud`. Con una CSP que liste solo el primero, la medición se rompería en silencio (el script carga, ningún evento llega).
- **`docs/decisiones/ADR-005-analitica.md`** suma tres secciones: el **modelo de confianza** que se está aceptando (JavaScript de terceros en todas las páginas públicas, `/registro` incluida; sin lista blanca ni SRI, y por qué SRI no aplica a un tracker mutable), la **CSP como requisito de T-013** con las dos directivas y el complemento de `Referrer-Policy` para `/admin/*` a nivel de cabecera, y la nota de que endurecer el `src` a una lista blanca de dominio **es decisión de spec** porque cambia el contrato de la variable (hoy permite migrar de proveedor o autohospedar sin tocar código).
- **Tests:** dos casos nuevos exigen que ambos archivos lo digan (los dos dominios, las dos directivas, el ticket que hereda la deuda y los tres canales del tracker). Si alguien borra la nota, la suite falla.
- **Lo que NO hice, a propósito, y necesita al orquestador:** no toqué `docs/tickets/T-013-preparacion-deploy.md` ni `openspec/changes/preparar-deploy-produccion/`, que son de otro change con un agente trabajando en paralelo. **La deuda de CSP tiene que entrar en los criterios de aceptación de T-013**, y como no puedo escribirla ahí sin pisar a otro agente, la dejé en ADR-005 (que T-013 ya cita) y la señalo aquí para que el orquestador la traslade.

### M-4 · "Llamar" ya no espera al proveedor — **cerrado, con la medición que lo justifica**

**Medido** (tracker real, proveedor falso con 3 s de latencia, Chrome; reloj del servidor, que es el que no miente):

| Variante | ¿El tracker cancela el clic? | Del clic a la navegación |
|---|---|---|
| Evento en el `<a href="tel:">` (como estaba) | **sí**, `defaultPrevented=true` | **3.0 s** (4 421 ms → 7 435 ms) |
| Evento en una envoltura que no es enlace | **no**, `defaultPrevented=false` | inmediata: la navegación es la acción por omisión del navegador |

En la segunda variante el evento llega **igual de completo** — payload capturado: `{"name":"llamar","data":{"categoria":"salud","colonia":"huicalco"}}` — y con `keepalive`, así que sobrevive al cambio de app hacia el marcador del teléfono.

**Decisión: mitigar, no sacrificar la métrica.** El PRD §9 pide medir el clic a "Llamar" y quitarlo habría sido pagar la factura con producto. La causa es acotada y conocida: el tracker solo secuestra el clic cuando el elemento con el evento es un `<a>` **con `href` y sin pestaña nueva**; de los cuatro botones instrumentados, "Llamar" es el único así (los otros tres abren pestaña nueva y el tracker no los toca). El evento de "Llamar" pasa a una envoltura `<span className="contents">`: el DOM cambia, el diseño no (`display: contents` hace que la envoltura no exista para el layout, verificado en el CSS generado y en el HTML servido), y el modo de fallo es benigno — si el tracker cambiara su forma de buscar el evento, se dejaría de registrar el clic, nunca se rompería el botón.

**Test:** un caso nuevo prohíbe la forma peligrosa en toda la ficha — *"ningún enlace instrumentado puede retrasar una navegación"*: si un `<a>` lleva `data-umami-event` y no abre pestaña nueva, la suite falla con el enlace en el mensaje. Es la regla, no el caso particular, y protege a los botones que E5/E8 agreguen. Además se comprueba que la envoltura sigue declarando `llamar` con sus dos slugs y que el `tel:` sigue **sin** `target` (scenario del enlace de llamada, intacto).

### Archivos de la iteración 2

- **Nuevo:** `src/app/admin/layout.tsx`.
- **Modificados (código):** `src/app/(publico)/buscar/page.tsx` (título estático), `src/components/directorio/botones-contacto.tsx` (envoltura de "Llamar").
- **Modificados (docs):** `.env.example`, `docs/decisiones/ADR-005-analitica.md`, `openspec/changes/agregar-analitica-cookieless/tasks.md` (tareas 26-30).
- **Modificados (tests):** `tests/analitica-exclusion-admin.test.ts` (+11 casos: referente, 404, layout del panel), `tests/analitica-config.test.ts` (+2: `.env.example` y ADR), `tests/analitica-directorio.test.ts` (+1 y ajuste de "Llamar"), `tests/analitica-adversarial.test.ts` (guardián del título, reforzado), `tests/admin-acceso.test.ts` y `tests/admin-adversarial.test.ts` (excepción del layout del panel, justificada).

### Lo que sigue abierto (para el validador)

1. **Enmienda de spec propuesta** (M-2): nombrar el título y el referente como canales en el requirement de privacidad. Redacción exacta arriba; la decisión es del humano que aprobó la spec.
2. **La deuda de CSP tiene que aterrizar en T-013** (M-3): está escrita en ADR-005 y `.env.example`, pero no en el ticket ni en el change de despliegue, que son de otro agente.
3. **Paso humano 25** (sin cambios): crear la cuenta, pegar variables, verificar filtrado de bots y límites del plan. Se le suma un punto: **tocar "Llamar" en un celular real** con la cuenta conectada y confirmar que marca de inmediato.

---

## 9. Iteración 3 — A-2 (el arreglo que rompía el panel sin JavaScript)

**Gates:** `npm run lint` ✅ · `npm run build` ✅ (exit 0) · `npm test` ✅ **43 archivos / 1 113 pruebas**, con los **30 adversariales de la etapa C en verde**.

La re-auditoría tenía razón y el defecto era mío: cerrar el referente con `no-referrer` cerraba A-1, pero de paso hacía que el navegador mandara `Origin: null` en los POST de navegación, y Next aborta toda Server Action cuyo `Origin` no case con el host. El panel respondía **500 justo en el camino sin JavaScript**, que es un requirement aprobado suyo y el flujo central del MVP (aprobar un negocio desde un celular con la red mala). Corrección quirúrgica: **cambiar el valor, no el mecanismo** — `strict-origin`.

### Por qué `strict-origin` cierra A-1 igual y no causa A-2 — medido, no razonado

Matriz propia (Chrome headless, página en `/panel/registros/abc123` que hace un POST **nativo** de formulario y luego navega por enlace a otra página del mismo origen):

| Política del documento | `Origin` del POST nativo | `Referer` de la navegación | `document.referrer` que leería el tracker |
|---|---|---|---|
| *(ninguna)* | real | `…/panel/registros/abc123` | `…/panel/registros/abc123` ← **la fuga A-1** |
| `no-referrer` (iteración 2) | **`null`** ← **A-2** | *(sin cabecera)* | vacío |
| **`strict-origin`** (ahora) | **real** | **`http://localhost:4602/`** | **`http://localhost:4602/`** |

Con `strict-origin` **la ruta no sale**: el tracker, que reenvía los referentes del mismo origen como ruta, mandaría `/` y nunca `/admin/registros/<id>`. Y el `Origin` sobrevive, que es lo único que Next necesita. `same-origin` quedó descartado por lo que ya decía la auditoría y confirmé en la matriz: deja pasar la ruta completa entre páginas propias, que es exactamente nuestra fuga.

### La cadena completa, contra el servidor real

Con `next start` y el código final:

| Comprobación | Resultado |
|---|---|
| **Acceso al panel SIN JavaScript** (POST nativo del formulario, `multipart/form-data`, `Origin: http://localhost:3000`) | **303 See Other** + `Set-Cookie: nu_panel=…; Secure; HttpOnly; SameSite=lax` + `Location: /admin/cola` |
| El mismo POST con `Origin: null` (lo que provocaba `no-referrer`) | **500** — el defecto reproducido, y ahora imposible de disparar desde el panel |
| Las seis pantallas del panel (`/admin` sin y con sesión, cola, detalle, aprobado, rechazado, ya-resuelto) | `<meta name="referrer" content="strict-origin">` en el `<head>` de todas |
| Páginas públicas (`/`, `/salud`, `/buscar?q=x`, `/terminos`) | **cero** metas de referente: la política sigue siendo del panel, no del sitio |
| Lista de rutas del build | idéntica, más `/admin/[...resto]` (ver O-1) |

### Los cuatro sitios que fijaban el literal, alineados

1. **`src/app/admin/layout.tsx`** → `referrer: "strict-origin"`, con el porqué escrito al lado: qué hace cada valor, cuál rompe qué y que si esto se mueve a una cabecera tiene que ir el mismo valor.
2. **`tests/analitica-exclusion-admin.test.ts`** → la regla dejó de ser una cadena y pasó a ser la **invariante**: la política del panel pertenece a `{strict-origin, origin}` —las dos que ocultan la ruta **y** conservan el `Origin`— y nunca a `{no-referrer, same-origin, unsafe-url, no-referrer-when-downgrade}`, cada una con su motivo. Ninguna pantalla puede cambiarla por su cuenta (ni por metadata ni en el código). Un caso nuevo exige además que el layout **conserve escrito el motivo** (`Origin: null`, `Server Action`, `sin JavaScript`): sin eso, el siguiente que pase "endurece" el valor y reintroduce el 500.
3. **`openspec/changes/agregar-analitica-cookieless/specs/layout-base/spec.md`** → la enmienda ya no manda un valor: pide que la política **impida que la ruta salga como referente** y que **no anule el `Origin` de los envíos de formulario**, cita el requirement de `revision-admin` que estaba en juego, deja los valores como ejemplo (`strict-origin` implementado, `origin` válido) y explica por qué `no-referrer` y `same-origin` quedan descartados. Scenario nuevo: *"cerrar el referente no puede romper el panel sin JavaScript"*.
4. **`docs/decisiones/ADR-005-analitica.md`** → el complemento de `Referrer-Policy` para T-013 ya no dice `no-referrer`: dice `strict-origin`, con la advertencia de que **el valor no es intercambiable** y de que a nivel de cabecera es aún más delicado porque es fácil aplicarla de más. Era el riesgo más caro de los cuatro: T-013 copiando el valor roto a una cabecera de producción.

### O-1 — cerrado también (era barato)

Medido primero: `/admin/registros/<id>/loquesea`, `/admin/cola/algo` y `/admin/inventado` respondían 404 **sin** la política, porque no encajaban con ninguna ruta y el layout del panel no llegaba a correr; y esas URLs sí llevan el identificador de un registro.

Arreglo: `src/app/admin/[...resto]/page.tsx`, una ruta comodín que solo llama a `notFound()`. La respuesta es la misma que antes —**404 para cualquiera, con o sin sesión**, sin pintar nada— pero ahora la sirve una ruta que vive dentro del panel, así que hereda la política. Verificado en el servidor real: las tres URLs de arriba responden 404 **con** `strict-origin`.

No llama a la guarda de sesión, y está anotado por qué: no hay nada que proteger detrás de una ruta que no existe, y pedir sesión para decir "no existe" delataría más de lo que oculta. Entró a la lista de excepciones de los dos guardianes de la guarda (`tests/admin-acceso.test.ts`, `tests/admin-adversarial.test.ts`) con ese motivo, y la suite comprueba que no lee ni escribe nada, que responde 404 de verdad (no una pantalla 200 disfrazada) y que **es el único comodín del proyecto** — uno más arriba se comería el sitio entero. Scenario nuevo en la enmienda.

La cabecera `Referrer-Policy` de T-013 sigue siendo el cierre de raíz (cubre cualquier respuesta, incluidas las que no pasan por el layout); ahora, con el valor correcto anotado.

### Archivos de la iteración 3

- **Nuevo:** `src/app/admin/[...resto]/page.tsx` (O-1).
- **Modificados:** `src/app/admin/layout.tsx` (valor + porqué), `tests/analitica-exclusion-admin.test.ts` (invariante en vez de literal, motivo obligatorio, 2 casos de O-1), `tests/admin-acceso.test.ts` y `tests/admin-adversarial.test.ts` (excepción del comodín), `openspec/changes/agregar-analitica-cookieless/specs/layout-base/spec.md` (enmienda por intención + 2 scenarios), `docs/decisiones/ADR-005-analitica.md`.

### Para el paso humano 25

Se le suma el punto que ninguna suite puede cubrir y que esta iteración vuelve verificable: **entrar al panel con el JavaScript deshabilitado** y aprobar o rechazar un registro. Contra el servidor real ya está comprobado el equivalente exacto (POST nativo con `Origin` real → 303 y cookie de sesión), pero la confirmación en un navegador de verdad es del humano.
