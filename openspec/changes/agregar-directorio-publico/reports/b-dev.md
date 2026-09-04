# Reporte dev · agregar-directorio-publico

Lógica del directorio conectada a Prisma: la capa de UI que dejó a-ui ya no usa mocks (el archivo `src/lib/mock/agregar-directorio-publico.ts` quedó **eliminado**). Las 20 tareas de `tasks.md` están en `[x]` con su nota de cierre.

`npm run lint`, `npm run build` y `npm test` en verde. **353 tests en 15 archivos** (antes de este change: 306 en 11).

## Archivos

**Nuevos (código):**

- `src/lib/rutas-reservadas.ts` — segmentos de la raíz que ninguna categoría puede tapar (tarea 1).
- `src/lib/directorio.ts` — único módulo que lee negocios para mostrarlos (tarea 2).
- `src/lib/ficha-url.ts` — `construirSegmentoFicha` / `extraerIdDeSegmentoFicha` (tarea 3).
- `src/lib/enlaces.ts` — WhatsApp, Google Maps y página registrada (tarea 4).
- `prisma/seed-demo.ts` + script `db:seed:demo` en `package.json` (tarea 5).

**Nuevos (tests):** `tests/directorio-consultas.test.ts`, `tests/directorio-enlaces.test.ts`, `tests/directorio-paginas.test.ts`, `tests/seed-demo.test.ts`.

**Modificados:** `src/app/page.tsx`, `src/app/[categoria]/page.tsx`, `src/app/negocio/[ficha]/page.tsx` (conectadas a Prisma), `src/components/directorio/tarjeta-negocio.tsx` y `botones-contacto.tsx` (props nulables + `break-words`), `src/lib/negocio.ts` (constante `ESTADO_NEGOCIO_PUBLICADO`), `tests/layout.test.ts`, `README.md` (los dos comandos de seed), `openspec/changes/.../tasks.md`.

**Eliminado:** `src/lib/mock/agregar-directorio-publico.ts`.

Sin dependencias nuevas, sin migración, sin tocar `src/generated/` ni git.

## Mapa scenario → verificación

### Capacidad `directorio-publico`

| # | Scenario | Verificación |
|---|---|---|
| 1 | las ocho categorías visibles | `tests/directorio-paginas.test.ts` › "muestra la categoría %s del catálogo" (8 casos, contra el catálogo de la base) |
| 2 | tocar una categoría lleva a su listado | íd. › "el botón de Servicios del hogar lleva a /servicios-del-hogar" + `curl` 200 |
| 3 | sin controles muertos en la home | íd. › "no hay buscador ni ningún otro control sin destino" (`<input\|<form\|<select\|<button` ausentes) |
| 4 | el bloque de deporte al mismo nivel | íd. › "el bloque de deporte trae su título, su frase y su entrada" + "los dos bloques usan el mismo nivel de encabezado (h2)" |
| 5 | el bloque lleva al listado de deporte | íd. › "lleva al mismo listado que el botón de la categoría" (dos hrefs idénticos) |
| 6 | listado de una categoría con negocios | íd. › "encabeza con '<Categoría> en Tizayuca' y trae una tarjeta por negocio" |
| 7 | categoría inexistente | íd. › "un slug que no está en el catálogo responde 404" (digest `NEXT_HTTP_ERROR_FALLBACK;404`) + `curl` 404 en `/plomeros-baratos` |
| 8 | categoría sin negocios publicados | íd. › "una categoría vacía invita a registrarse" (`/otro`) |
| 9 | la ruta dinámica no tapa rutas propias | `tests/directorio-consultas.test.ts` › "ningún slug del catálogo coincide con un segmento reservado" y "las rutas propias que ya existen en src/app están declaradas" + `curl` 200 en `/registro` |
| 10 | negocio en revisión no aparece | `tests/directorio-consultas.test.ts` › "los negocios en revisión y rechazados no vuelven en ningún listado"; en HTML, `tests/directorio-paginas.test.ts` (la categoría Belleza no trae el nombre) |
| 11 | negocio rechazado no aparece | íd. (mismo test, caso `talleres`) |
| 12 | ficha de un negocio no publicado | `tests/directorio-paginas.test.ts` › "un negocio inexistente y uno sin publicar dan exactamente el mismo 404" (compara los tres digests) + `curl`: 404 y cero apariciones del nombre en la respuesta |
| 13 | filtrar por una colonia | íd. › "con filtro solo salen los negocios de esa colonia y la opción se ve activa" (`aria-current`) |
| 14 | quitar el filtro | íd. › "'Todas las colonias' apunta al listado sin parámetro" |
| 15 | solo colonias con negocios | íd. › "ofrece 'Todas las colonias' y solo colonias con negocios publicados"; a nivel de consulta, `tests/directorio-consultas.test.ts` › "el filtro de colonias no cuenta negocios sin publicar" |
| 16 | filtro sin resultados en esa colonia | íd. › "un filtro sin resultados explica y ofrece quitar el filtro" |
| 17 | colonia desconocida en la URL | íd. › "una colonia inventada se ignora y muestra el listado completo" |
| 18 | publicado con colonia "Otra" | íd. › "un publicado con colonia 'Otra' se lista con su texto libre" + `tests/directorio-consultas.test.ts` › "un publicado con colonia 'Otra' aparece sin filtro" |
| 19 | contenido de la tarjeta | íd. › "cada tarjeta trae marcador de foto, nombre, colonia, WhatsApp y enlace a la ficha" |
| 20 | "A domicilio" solo cuando aplica | íd. › "la etiqueta 'A domicilio' aparece solo en los negocios que la registraron" (2 de 3 tarjetas) |
| 21 | WhatsApp directo desde la tarjeta | íd. › "el botón de WhatsApp sale a wa.me y dice a qué negocio le escribe" |
| 22 | la tarjeta lleva a la ficha | íd. (href `/negocio/<slug>-<id>` presente) + `curl` 200 sobre el href servido |
| 23 | etiqueta accesible del botón | íd. (`aria-label="Enviar WhatsApp a <negocio>"`) |
| 24 | ficha completa | íd. › "muestra nombre, sello, qué ofrece, colonia, dirección y horario" |
| 25 | ficha con solo lo obligatorio | íd. › "la ficha mínima no deja secciones vacías ni etiquetas sin contenido" |
| 26 | ficha inexistente | íd. › "un negocio inexistente y uno sin publicar dan el mismo 404" + `curl` 404 |
| 27 | enlace viejo tras cambio de nombre | íd. › "una URL con la parte legible vieja sigue abriendo la ficha" + `tests/directorio-enlaces.test.ts` (ida y vuelta del segmento) |
| 28 | WhatsApp como acción principal | íd. › "'Enviar WhatsApp' es el único botón con el verde de acción" (una sola aparición de `bg-accion` en la ficha) |
| 29 | botones que dependen de lo registrado | íd. › "muestra 'Llamar' y 'Cómo llegar' solo cuando el negocio los registró" |
| 30 | negocio sin teléfono ni dirección | íd. (mismo test, ficha mínima sin `tel:` ni "Cómo llegar") |
| 31 | "Cómo llegar" abre el mapa | `tests/directorio-enlaces.test.ts` › "busca la referencia con su colonia y Tizayuca, Hidalgo" + `tests/directorio-paginas.test.ts` › "las referencias se muestran tal como las escribió el negocio" (query codificada en el HTML) |
| 32 | la página registrada no promete Facebook | `tests/directorio-paginas.test.ts` › "el enlace a la página registrada muestra su dominio real" (y `not.toContain("Facebook")`) + `tests/directorio-enlaces.test.ts` (punycode, no-URL, esquema ejecutable) |
| 33 | negocio sin dirección capturada | íd. › "un negocio que solo registró colonia no muestra ninguna otra ubicación" |
| 34 | negocio con referencias capturadas | íd. › "las referencias se muestran tal como las escribió el negocio" |
| 35 | sin datos internos en la respuesta | íd. › "ni el listado ni la ficha traen estado, origen, fechas internas ni token" + `tests/directorio-consultas.test.ts` › "ni el listado ni la ficha traen los datos internos" (la proyección ni siquiera los lee) + `grep` sobre el HTML servido: 0 apariciones |
| 36 | sin JS de cliente nuevo | íd. › "ningún archivo del directorio declara 'use client'" (9 archivos) + el barrido general de `tests/layout.test.ts` (scenario 11) |
| 37 | celular a 390px | Parcial automatizado: "todo lo tocable del directorio reserva al menos 44px" y "el texto que captura el negocio se parte en vez de desbordar". **Manual pendiente de ojos humanos**: ver "Verificación manual" abajo |
| 38 | navegación sin JavaScript | Manual con `curl` sobre `next start`: home → categoría → `?colonia=` → ficha → `wa.me`, todos enlaces del servidor; ningún archivo nuevo manda JS de cliente (scenario 36) |

### Capacidad `layout-base`

| # | Scenario | Verificación |
|---|---|---|
| 39 | home dentro del layout | `tests/layout.test.ts` › "saluda con los textos literales de la spec" |
| 40 | la home ya no anuncia el directorio | íd. › "ya no anuncia que el directorio viene después" |
| 41 | entrada al registro desde la home | íd. › "la home enlaza a /registro con el texto literal…" y "usa el verde de acción y reserva al menos 44px" |
| 42 | jerarquía de encabezados | íd. › "el layout arma header/main/footer y la home tiene un h1 con secciones h2" (1 `h1`, 3 `h2`, sin `h3`-`h6`) y "el listado y la ficha también tienen un solo h1" |
| 43 | sin rastros de la plantilla | íd. › "no queda nada de create-next-app en src/" (ya existía, ahora barre también los archivos nuevos) |
| 44 | URL desconocida (404) | íd. › "trae los tres textos literales y vive dentro del layout" + `tests/directorio-paginas.test.ts` + `curl` 404 en `/loquesea` |
| 45 | la 404 no es página en inglés ni volcado | íd. › "no muestra detalles técnicos y su único enlace es la home" |
| 46 | enlace interno a ruta inexistente | íd. › "señala un enlace inventado, uno externo sin rel y un tel: con pestaña nueva" (la función de revisión se prueba a sí misma en negativo) |
| 47 | enlaces a rutas dinámicas | íd. › "la home, el listado (con y sin filtro), la ficha y la 404 solo enlazan a lo que existe" (los destinos dinámicos se resuelven contra el catálogo y contra los ids publicados) |
| 48 | enlaces externos protegidos | íd. › "los externos de la ficha abren en pestaña nueva y con rel de protección" |
| 49 | enlace de llamada | íd. › "el botón 'Llamar' usa tel: y no abre pestaña nueva" |

### Capacidad `modelo-datos`

| # | Scenario | Verificación |
|---|---|---|
| 50 | sembrar negocios de demostración | `tests/seed-demo.test.ts` › "siembra los negocios ficticios que el directorio necesita probar" (categorías ≥4 incluida deporte, colonias ≥4, con y sin domicilio, todos los opcionales vs. solo obligatorios, colonia "Otra", `en_revision`, `rechazado`) |
| 51 | el seed de catálogos no crea negocios | íd. › "`db:seed` deja los catálogos poblados y la tabla de negocios vacía" (base propia recién migrada, para que ningún otro archivo de test la contamine) |
| 52 | seed de demostración idempotente | íd. › "correrlo dos veces no cambia el número de negocios" + corrida real doble contra `prisma/dev.db` |
| 53 | datos ficticios y nada real | íd. › "todos los WhatsApp son de la serie de pruebas 771999xxxx" + revisión manual del archivo (abajo) |
| 54 | nunca contra producción | íd. › "en producción no siembra nada y lo dice" (`NODE_ENV` y `VERCEL_ENV`) |

## Decisiones técnicas

1. **Un solo lugar filtra por estado.** `src/lib/directorio.ts` aplica `ESTADO_NEGOCIO_PUBLICADO` en las cuatro funciones y selecciona campo por campo. Se agregó la constante a `src/lib/negocio.ts` para no dejar el literal suelto (design.md §5). Un test recorre `src/` y falla si aparece otro archivo filtrando por estado: la invariante está vigilada, no confiada a la disciplina.
2. **404 idéntico para "no existe" y "no publicado".** `obtenerNegocioPublicado` devuelve `null` en ambos casos y la página llama `notFound()` sin distinguir; el test compara los `digest` de los tres casos (inexistente, `en_revision`, `rechazado`) y exige que sean el mismo.
3. **`obtenerColoniaPorSlug` (no estaba en tasks.md).** La spec pide dos comportamientos distintos: colonia del catálogo sin resultados → mensaje "No encontramos negocios de esta categoría en esa colonia."; colonia inventada en la URL → se ignora el filtro. Sin consultar el catálogo de colonias no se pueden distinguir. Es una función de 6 líneas, no una capa nueva.
4. **`construirEnlaceWhatsapp` devuelve `null` cuando el número no se puede normalizar.** Es el caso de una fila de siembra escrita a mano (design.md §4 lo anticipa). Antes que servir un `wa.me` roto, la tarjeta y la ficha no pintan el botón; por eso `hrefWhatsapp` pasó a `string | null` en los dos componentes de a-ui. Con datos que pasaron por el formulario (T-003 normaliza) nunca ocurre.
5. **`coloniaNombre` nulable.** El esquema permite `coloniaId` y `coloniaOtra` nulos a la vez; en vez de imprimir un párrafo vacío, no se pinta la línea.
6. **Segmentos reservados con vista al futuro.** La lista incluye rutas que aún no existen (`admin`, `buscar`, `editar`, `api`, legales). El test exige, además, que toda carpeta de ruta de `src/app` esté en la lista: si mañana alguien crea `src/app/buscar/` y olvidó reservarla, la suite avisa.
7. **Serie de WhatsApp `77199950xx` para el seed de demo.** Cumple el `771999xxxx` que pide la spec y no choca con los números que ya usan `tests/adversarial.test.ts` (`7719990001`…) ni las suites del registro, que borran por prefijo.
8. **`tests/seed-demo.test.ts` usa su propia base.** El scenario "el seed de catálogos no crea negocios" no se puede afirmar sobre la base compartida por 15 archivos de test; el archivo crea `prisma/test-seed-demo.db` con `prisma migrate deploy`, la usa y la borra.
9. **Revisión de enlaces sobre el HTML servido, no sobre el código fuente.** La lista blanca vieja solo veía `href="…"` literales, y las rutas dinámicas se arman con template literals. `problemasDeEnlaces()` recorre los `<a>` del HTML renderizado (home, listado con y sin filtro, ficha, 404, footer) y resuelve cada destino contra el catálogo y contra los negocios publicados; los externos exigen `target="_blank"` + `rel="noopener noreferrer"` y `tel:` exige lo contrario. La función se prueba en negativo con un href inventado, un externo sin `rel` y un `tel:` con pestaña.
10. **Textos en un solo nodo.** `{categoria.nombre} en Tizayuca` servía `Servicios del hogar<!-- --> en Tizayuca` (marcador de React). Se cambió a una plantilla única, igual que "Ver su página (dominio)": el encabezado del listado es lo que ve un buscador y lo que alguien copia y pega.
11. **`break-words` / `break-all` en todo lo que escribe el negocio.** El nombre admite 80 caracteres y el dominio hasta 300: una sola palabra larga sacaba la tarjeta de un viewport de 390px. Es la parte automatizable del scenario "sin scroll horizontal".

## Verificación manual (lo no automatizable)

Con `npm run db:seed && npm run db:seed:demo` sobre `prisma/dev.db` y `next build && next start -p 3111`:

- Códigos de respuesta: `/` 200, `/servicios-del-hogar` 200, `?colonia=atempa` 200, `?colonia=inventada` 200, `/otro` 200, `/registro` 200, `/plomeros-baratos` **404**, `/negocio/no-existe-xxx` **404**, `/loquesea` **404**, ficha de un negocio `en_revision` **404** (y `grep` del nombre del negocio en esa respuesta: 0).
- Flujo completo sin JavaScript (solo `curl`): home → `/servicios-del-hogar` → `?colonia=atempa` → ficha tomada del href servido → `https://wa.me/52…?text=Hola%2C%20te%20vi%20en%20NecesitoUno%20Tizayuca…`.
- Literales carácter por carácter contra el HTML servido: los 8 textos de la home, los 2 estados vacíos del listado, "Todas las colonias" / "Ver todas las colonias", "Negocio verificado", "A domicilio", "Enviar WhatsApp", "Llamar", "Cómo llegar" y los 3 de la 404. Todos exactos.
- Privacidad sobre el HTML servido de listado y ficha: 0 apariciones de `tokenGestion`, `consintioAvisoEn`, `registradoEn`, `en_revision`, `organico`, `siembra`.
- Seed de demo: dos corridas seguidas, mismo conteo (12) y el aviso "negocios de MENTIRA" en la salida.
- Datos ficticios: los 12 negocios llevan marca explícita de invención en el nombre ("(ficticio)", "de Mentiras", "Imaginario", "Inventada"), colonias del catálogo pero direcciones genéricas ("Calle Inventada 12", "referencia inventada"), y ningún nombre corresponde a un negocio real de Tizayuca.

**Lo que queda para el humano del PR (necesita navegador):** ver la home, un listado con y sin filtro, una ficha completa, una ficha mínima y la 404 a 390px, 768px y 1280px. Lo revisado por estructura: el contenedor del layout es `max-w-3xl` con `px-4 sm:px-6` (sin anchos fijos en ningún archivo nuevo), la parrilla de categorías es `grid-cols-2 sm:grid-cols-3`, los filtros son `flex-wrap`, todo lo tocable reserva `min-h-11` (44px) o `min-h-16`, y el único `bg-accion` de la ficha es "Enviar WhatsApp".

## Notas para la etapa de seguridad/test

- El `not-found` global viaja en el payload RSC de **todas** las páginas (comportamiento de Next: la frontera de not-found se envía para la navegación en cliente). No es visible ni afecta el `<main>` servido, pero explica por qué un `grep` de "No encontramos esta página" da 1 en cualquier página.
- `tests/directorio-consultas.test.ts`, `tests/directorio-paginas.test.ts` y `tests/layout.test.ts` borran los negocios de la base de prueba en su `beforeAll` y limpian su prefijo en `afterAll`; `fileParallelism: false` sigue siendo necesario.
- El seed de demo corre con `origen: "siembra"` y `tokenGestion` nulo. Si se quiere probar que el token nunca sale al HTML con datos reales, hay que poblarlo a mano; el test de privacidad ya cubre los otros cuatro campos y la consulta no lo selecciona.

## Deuda y propuestas fuera de alcance

1. **Copy "Ver su página (dominio.com)"** (heredado de a-ui): no hay literal en la spec; se mantiene tal cual. Si el humano prefiere otro texto, es un cambio de una línea.
2. **La ficha no muestra la categoría del negocio** y el módulo tampoco la lee: la spec no la pide. Cuando llegue E5-1 (páginas por giro) va a hacer falta, junto con migas de pan.
3. **Metadata por página** (título y descripción de listado y ficha): fuera de alcance por spec, es de `seo-local` (E5). Hoy heredan la del layout, así que dos listados comparten `<title>`; conviene que E5 llegue pronto.
4. **`publicadoEn` no se llena solo.** El seed de demo pone fechas fijas, pero nada en el código escribe `publicadoEn` al publicar: eso lo hará el panel (E3). Si un negocio se publica a mano en la base sin esa fecha, queda al final del listado (SQLite ordena los nulos al final en `desc`). Vale la pena que E3 lo fije siempre.
5. **Sin paginación ni conteo de resultados** en el listado: coherente con la propuesta. Cuando una categoría pase de una pantalla larga habrá que retomarlo.
6. **Propuesta menor:** el filtro de colonias se pinta completo aunque la categoría tenga muchas; con 21 colonias y una categoría muy poblada, la fila de pills puede volverse larga en 390px. Hoy no pasa (ninguna categoría tiene más de 3 colonias con publicados); si pasa, es un ticket de UI.
7. **`README.md`** ganó dos líneas con los comandos de seed. No estaba en la spec; sin eso, quien clona ve un directorio vacío y no sabe por qué.

---

# Iteración 2 · correcciones de la etapa C (M2 y M4)

La etapa C aprobó con veredicto limpio y dejó 5 medios. Por instrucción del coordinador se corrigen **solo M2 y M4** (los que viven en archivos de este change). **M1, M3, M5 y los cuatro bajos quedan sin tocar**, para ticket propio.

`npm run lint`, `npm run build` y `npm test` en verde: **423 tests en 16 archivos** (406 al cierre de la etapa C + 17 nuevos), incluidos los **53 adversariales de `tests/directorio-adversarial.test.ts`**.

## M2 · El `tel:` se armaba con el valor crudo de la base

**Qué se hizo.** Se aplica al fijo el mismo criterio que ya tenía el WhatsApp:

- `src/lib/enlaces.ts` · nueva `construirEnlaceTelefono(telefono)`: normaliza a los 10 dígitos nacionales reutilizando `normalizarWhatsapp` (misma regla mexicana: descarta espacios, guiones, paréntesis y el `+`, y quita el prefijo `52`/`521` cuando al hacerlo quedan 10) y devuelve `tel:+52<10 dígitos>`, o `null` si no da 10.
- `src/components/directorio/botones-contacto.tsx` · la prop `telefonoFijo` pasó a `hrefLlamar` (href ya armado, como `hrefWhatsapp` y `hrefComoLlegar`): el componente ya no concatena nada dentro de un `href`.
- `src/app/negocio/[ficha]/page.tsx` · calcula `hrefLlamar`; si el negocio registró algo en "teléfono fijo" pero no es marcable, la ficha lo muestra como dato ("Teléfono: <lo que escribió>", escapado por React) y **no** pinta el botón "Llamar". Así no se pierde lo que el negocio registró (un fijo con extensión, por ejemplo) y nadie marca una secuencia de desvío.

**Formato del enlace:** se pasó de `tel:7717775009` a `tel:+527717775009` (E.164). Ahora que el número está normalizado, la forma internacional es la que marca bien desde cualquier red; la spec no fija el formato.

**Tests nuevos (5):**

| Test | Qué fija |
|---|---|
| `tests/directorio-enlaces.test.ts` › "normaliza el fijo a los 10 dígitos nacionales, venga como venga" | 7 formatos de entrada → el mismo `tel:+52…` |
| íd. › "un fijo que no da 10 dígitos no genera enlace" | vacío, 9 y 11 dígitos, texto, `800 TELMEX`, `*21*5512345678#` (desvío de llamadas), payload XSS, número con extensión → `null` |
| íd. › "el enlace nunca lleva nada fuera de los dígitos normalizados" | ni `#`, ni `*`, ni paréntesis, ni espacios dentro del `href` |
| `tests/directorio-paginas.test.ts` › "un fijo guardado con formato feo se marca igual, ya normalizado" | fixture `+52 (771) 777-5013` → `href="tel:+527717775013"` con su botón |
| íd. › "un fijo que no se puede marcar se muestra como texto, sin botón 'Llamar'" | fixture `771 777 5014 ext. 12` → sin `tel:`, sin botón, y el texto capturado visible |

**Dos tests de la etapa C se actualizaron porque fijaban el comportamiento defectuoso** (no se borró ninguno; ambos quedaron más estrictos, y los 53 siguen en verde):

- `tests/directorio-adversarial.test.ts` › "el teléfono hostil se queda dentro de un `tel:` escapado…" → **"el teléfono hostil ya no se convierte en un enlace de marcado"**: antes exigía que existiera exactamente 1 ancla `tel:` con el payload escapado dentro; ahora exige **0** anclas `tel:`, que el payload siga escapado como texto y que el crudo no aparezca.
- íd. › "el teléfono fijo no se imprime como texto de la ficha" → **"un fijo no marcable no genera botón, y el fijo del negocio oculto no se filtra"**: la parte de "el fijo se muestra como acción, no como número" la cubre ahora `tests/directorio-paginas.test.ts` con un fijo válido; aquí, donde el fijo guardado es un payload, se exige lo contrario (sin botón) y se conserva la comprobación de que el teléfono del negocio `en_revision` no se filtra.

**Verificación manual:** `next start` + `curl` sobre la ficha de un negocio del seed → `href="tel:+527717775009"`.

## M4 · La guarda del seed de demo no miraba a qué base apunta

**Qué se hizo.** En `prisma/seed-demo.ts`:

- `EntornoSeedDemo` ahora incluye `DATABASE_URL` y `SEED_DEMO_PERMITIR`.
- `apuntaABaseLocal(env)`: solo `file:…` (o `DATABASE_URL` ausente, que cae en el default local de `prisma7.config.ts`) cuenta como base local — ADR-001 dice que en dev la base siempre es SQLite local, así que cualquier `postgresql://`, `postgres://`, `mysql://`, `prisma://`, `libsql://` o `https://` es remota.
- `motivoParaNoSembrar(env)`: única puerta de la guarda. Producción (por `NODE_ENV`/`VERCEL_ENV`) → no siembra. Base no local sin permiso → no siembra, con mensaje que dice qué hacer. `SEED_DEMO_PERMITIR=1` habilita una base remota de prueba, **pero nunca abre la puerta de producción** (el orden de las comprobaciones lo garantiza y hay test).
- La comparación de entorno pasó a ignorar mayúsculas y espacios (`" Production "` es producción): estaba señalado en el mismo hallazgo y es la misma función.
- `.env.example` documenta `SEED_DEMO_PERMITIR` y por qué existe.

**Tests nuevos (11)** en `tests/seed-demo.test.ts`, bloque "guarda por DATABASE_URL (hallazgo M4)": seis URLs remotas rechazadas (con mensaje que nombra `DATABASE_URL` y `SEED_DEMO_PERMITIR=1`, y conteo de negocios en 0), base SQLite local aceptada, sin `DATABASE_URL` aceptada, esquema en mayúsculas y con espacios aceptado, base remota con permiso explícito aceptada, permiso explícito + producción **rechazado**, y `NODE_ENV=" Production "` rechazado.

**Verificación manual:** `DATABASE_URL="postgresql://…" npm run db:seed:demo` → imprime el aviso, no crea nada y sale con código **1**; `DATABASE_URL="file:./prisma/dev.db" npm run db:seed:demo` → siembra los 12 y sale con **0**.

## Lo que NO se tocó (queda para tickets)

- **M1** (`fotoUrl` llega al render sin validar) — no explotable hoy (ninguna ruta escribe la columna y `/_next/image` responde 400 sin `remotePatterns`); es la invariante que E1-3 va a necesitar. Propuesta: validar esquema/origen en `src/lib/enlaces.ts`, junto a `obtenerPaginaRegistrada`, y no pintar la imagen si no pasa.
- **M3** (el registro no avisa que el WhatsApp queda público) — es copy de la capacidad `registro-negocio` y encaja con los legales de E6.
- **M5** (sin fricción contra el barrido masivo) — sin spec que lo pida; superficie para E5/E7.
- **B1–B4** — endurecimientos anotados en `c-seguridad.md`.
