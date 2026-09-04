# Etapa B (dev) — versionar-aviso-privacidad

**Worktree:** `.claude/worktrees/wt-t012` · rama `feature/versionar-aviso-privacidad`
**Gates:** `npm run lint` ✅ (0 problemas) · `npm run build` ✅ · `npm test` ✅ **61 archivos / 1607 tests**
**Etapa A (ui):** saltada con justificación del orquestador. Confirmo que no había UI nueva: la superficie visual son tres líneas de texto y un `<input type="hidden">` dentro de componentes existentes. No apareció ninguna pantalla nueva ni ningún estado visual sin cubrir.
**Git:** no toqué git (solo el validador commitea). `.env` local creado desde `.env.example` (gitignored); `prisma/dev.db` recreado, migrado y sembrado.

---

## 1. Tareas completadas

Las 28 tareas de `tasks.md` quedaron en `- [x]`, más dos tareas nuevas (29 y 30) por el encargo adicional del orquestador. Dos tareas llevan nota o corrección **escrita en el propio `tasks.md`** (§4 de este reporte las explica): la #23 (formato de fecha del panel) y la #25 (qué se puede sembrar sin mentir).

### Archivos nuevos

| Archivo | Qué es |
|---|---|
| `src/lib/legales/version.ts` | `VERSION_AVISO` (fuente única) + `contenidoVersionadoDelAviso()`, que arma en orden de lectura las tres piezas que la versión identifica |
| `prisma/migrations/20260905120000_agrega_version_del_aviso_consentido/` | Las tres columnas nulables sin default |
| `tests/aviso-version.test.ts` | **El guardián**: tabla `versión → huella`, la comprobación y su prueba por mutación |
| `tests/modelo-version-aviso.test.ts` | Migración sobre base con datos + persistencia de la constancia y la reaceptación |

### Archivos modificados (producción)

`prisma/schema.prisma`, `prisma/seed-demo.ts`, `src/lib/legales/textos.ts`, `src/lib/registro/textos.ts`, `src/lib/registro/validacion.ts`, `src/lib/registro/procesar.ts`, `src/lib/admin/consultas.ts`, `src/components/legales/documento-legal.tsx`, `src/components/registro/aviso-consentimiento.tsx`, `src/components/admin/detalle-registro.tsx`, `src/app/aviso-de-privacidad/page.tsx`.

`src/lib/directorio.ts` **no se tocó**: la proyección pública es una lista explícita y los tres campos nuevos no entran (hay test adversarial que lo vigila con valores realmente guardados).

---

## 2. Mapa scenario → test

### `paginas-legales`

| Scenario | Dónde se verifica |
|---|---|
| una sola fuente de la versión | `tests/aviso-version.test.ts` › "el identificador solo se escribe una vez": recorre TODO `src/` y falla si alguien escribe "versión N" a mano o vuelve a declarar el literal |
| la versión de arranque | `tests/aviso-version.test.ts` › "la versión vigente es una cadena no vacía y hoy vale 1" |
| alguien edita el aviso y no sube la versión | `tests/aviso-version.test.ts` › "cambiar %s sin subir la versión deja la verificación en rojo" (5 casos por mutación: simplificado, casilla, párrafo del integral, fecha de última actualización, placeholder completado) |
| se estrena versión junto con el texto | `tests/aviso-version.test.ts` › "subiendo la versión y anclando la huella nueva vuelve a pasar" (comprueba además que la huella de la `1` queda tal cual y la tabla queda con dos entradas) |
| versión sin huella | `tests/aviso-version.test.ts` › "subir la versión sin anclar su huella también falla" + "una versión vieja tampoco pasa" |
| el guardián no se pisa con los placeholders | `tests/aviso-version.test.ts` › caso "un placeholder completado por el humano" de la prueba por mutación |
| el dueño abre el aviso de privacidad | `tests/legales-paginas.test.ts` › "encabeza con el h1 y la línea de versión y última actualización con su fecha" + el bloque literal completo ("dice exactamente lo que aprobó la spec") |
| la versión que se muestra es la vigente | `tests/legales-paginas.test.ts` › "la versión sale del literal del módulo, no escrita a mano en la página" |
| jerarquía de encabezados del aviso | `tests/legales-paginas.test.ts` › "tiene un solo h1, sus secciones son h2…" (sin cambios: la línea de versión es un `<p>`) |
| el aviso enlaza a los términos | `tests/legales-paginas.test.ts` › "cierra con el enlace…" (sin cambios) |
| **la foto está en la lista de datos que se recogen** (enmienda) | `tests/legales-paginas.test.ts` › "(2) qué datos recogemos: obligatorios y opcionales del formulario" |
| — (regresión) `/terminos` no se versiona | `tests/legales-paginas.test.ts` › "/terminos conserva su línea de última actualización, sin versión" |

### `modelo-datos`

| Scenario | Dónde se verifica |
|---|---|
| alta con su versión | `tests/modelo-version-aviso.test.ts` › "persiste y recupera la constancia con su versión, sin reaceptación"; end-to-end en `tests/registro-accion.test.ts` › "sella la versión vigente del aviso junto a la fecha" |
| la versión no viaja sola | `tests/modelo-version-aviso.test.ts` › "ninguna ficha guardada tiene fecha sin versión de reaceptación (ni al revés)"; y en los datos sembrados, `tests/seed-demo.test.ts` › "siembra la versión vigente…" |
| reaceptación de una versión más nueva | `tests/modelo-version-aviso.test.ts` › "guarda la reaceptación sin tocar la constancia original" |
| fichas anteriores al versionado | `tests/modelo-version-aviso.test.ts` › "se aplica sobre una base con negocios en los tres estados y las deja nulas" (replay real de las migraciones sobre una base con filas) + "las tres columnas son nulables y ninguna trae valor por defecto" |
| el seed de demostración siembra la versión | `tests/seed-demo.test.ts` › "siembra la versión vigente en las constancias y deja un caso con reaceptación" (ver corrección §4.2) |
| la versión aceptada es un dato interno | `tests/directorio-adversarial.test.ts` › "la versión del consentimiento y la reaceptación no salen a la superficie pública"; `tests/legales-adversarial.test.ts` › "lo que el aviso llama 'lo que nunca se publica'…" |

### `registro-negocio`

| Scenario | Dónde se verifica |
|---|---|
| el aviso cambió a media captura | `tests/registro-accion.test.ts` › "con %s en el campo de versión no guarda nada y pide releer el aviso" (4 casos) + `tests/registro-validacion.test.ts` › "con la versión del aviso %j no valida…" |
| reintento después del cambio | `tests/registro-accion.test.ts` › "cuando el dueño relee y vuelve a mandar con la versión vigente, se guarda" |
| versión inventada en el envío | mismos casos + `tests/registro-adversarial.test.ts` › "ninguna versión hostil consigue guardar una constancia con esa versión" (8 payloads) |
| la versión guardada la pone el servidor | `tests/registro-accion.test.ts` › "la versión que se guarda es la del servidor, no la que traiga el envío" |
| la versión está a la vista antes de aceptar | `tests/registro-pagina.test.ts` › "dice qué versión del aviso se está aceptando, antes de la casilla" + "la versión no le pide nada al dueño: no es un control del formulario" |
| constancia del consentimiento | `tests/registro-accion.test.ts` › "sella la versión vigente del aviso junto a la fecha, sin reaceptación" |
| la constancia no se sustituye en el reenvío | `tests/registro-reenvio.test.ts` › "con la MISMA versión vigente no toca la constancia ni anota reaceptación" |
| reenvío contra una versión nueva del aviso | `tests/registro-reenvio.test.ts` › "con una versión DISTINTA anota la reaceptación y deja intacta la constancia" + "un reenvío posterior sobrescribe la reaceptación, nunca la constancia" |
| reenvío de una ficha anterior al versionado | `tests/registro-reenvio.test.ts` › "una ficha SIN versión registrada sigue sin ella, y se anota la reaceptación" |
| el reenvío no se autopublica (versión a modo) | `tests/registro-reenvio.test.ts` › "un reenvío no puede fijar la versión de su constancia ni la de la reaceptación" |
| el servidor devuelve errores por campo (mensaje nuevo) | `tests/registro-validacion.test.ts` › el literal se compara carácter por carácter en `tests/registro-accion.test.ts` |
| no se pierde lo capturado | `tests/registro-accion.test.ts` (valores en el eco) + `tests/registro-pagina.test.ts` › "el desfase de versión se pinta junto a la casilla, con el aviso nuevo a la vista" (casilla desmarcada, aviso nuevo y campo oculto ya actualizado) |

### `revision-admin`

| Scenario | Dónde se verifica |
|---|---|
| detalle completo | `tests/admin-paginas.test.ts` › "muestra la constancia como fecha y, entre paréntesis, la versión aceptada"; proyección en `tests/admin-consultas.test.ts` › "trae la versión de la constancia y la reaceptación cuando existen" |
| registro anterior al versionado | `tests/admin-paginas.test.ts` › "una ficha sin versión registrada lo dice, en vez de inventar una" |
| registro que aceptó una versión más nueva | `tests/admin-paginas.test.ts` › "muestra la reaceptación aparte, sin tocar la constancia original" |
| los datos personales no salen del panel | `tests/directorio-adversarial.test.ts` y `tests/legales-adversarial.test.ts` (páginas públicas) + `tests/registro-adversarial.test.ts` › "el campo de versión no viaja de vuelta al formulario ni al log" |

### Verificado a mano (no automatizable)

Servidor de desarrollo en el **puerto 3600** (`next dev`), base de dev migrada y con el seed de demostración corrido:

1. `GET /aviso-de-privacidad` → `Versión 1 · Última actualización: [FECHA DE PUBLICACIÓN]` en la línea de arriba.
2. `GET /registro` → "Estás aceptando la versión 1 del aviso de privacidad." y, en el HTML servido, `<input type="hidden" name="avisoVersion" value="1"/>` (viaja sin JavaScript).
3. Panel con sesión válida (cookie `nu_panel` forjada con `crearValorDeSesion` y credenciales ficticias de prueba):
   - ficha sembrada normal → `Consentimiento del aviso de privacidad: 31 jul 2026, … (versión 1)`, sin línea de reaceptación;
   - barbería (ficha anterior al versionado) → `… (versión no registrada)` **y** `Aceptó una versión más nueva del aviso: 05 ago 2026, … (versión 1)`.
4. **Prueba de mutación del guardián a mano:** al aplicar la enmienda del aviso (§3), la suite se puso roja sola con el mensaje "El texto del aviso de privacidad cambió sin estrenar versión… Huella del texto de hoy: <sha256>". Es el comportamiento que el ticket pedía forzar, comprobado sobre un cambio real y no simulado.

---

## 3. Encargo adicional del orquestador (enmienda del aviso)

**Qué se cambió:** la viñeta de datos opcionales de la sección "Qué datos recogemos" pasa a ser
"Opcionales: qué ofreces, si haces entregas o vas a domicilio, teléfono fijo, dirección o referencias, horario, el link de tu Facebook **y, si la subes, una foto de tu negocio**."

- Queda declarado en `openspec/changes/versionar-aviso-privacidad/specs/paginas-legales/spec.md` como **MODIFIED Requirement "Texto completo del aviso de privacidad integral"**, con el bloque literal completo, la nota "Enmienda aprobada durante la implementación de T-012", el texto anterior de la viñeta y un scenario nuevo.
- No toqué el párrafo de la foto de la sección "Qué queda público y qué no" (el del PR exprés en vuelo).
- Tests de literales actualizados: `tests/legales-paginas.test.ts` (bloque aprobado + aserción del elemento (2) de la LFPDPPP).

**Decisión sobre la versión (la parte interesante).** Se **volvió a anclar la huella de la versión `1`** en lugar de estrenar la `2`. Razón: la `1` la estrena *este mismo change* y todavía no ampara ninguna constancia —la columna `consintioAvisoVersion` no existe en ninguna base desplegada—, así que re-anclar no reescribe la evidencia de nadie; estrenar una `2` afirmaría que existió una `1` publicada que nunca salió del branch. La regla y su única excepción ("vale solo mientras el change no se mergea; después, cambiar el texto es estrenar versión") quedan escritas en la cabecera de `HUELLAS_POR_VERSION`, que es donde el próximo humano que vea la suite en rojo va a leerlas.

**Tensión que queda a la vista (no la resuelvo yo):** la sección "Qué datos recogemos" ya nombra la foto, mientras "Qué queda público y qué no" sigue diciendo "Hoy el formulario todavía no pide fotos". Eso lo corrige el PR exprés; cuando se fusione, el guardián volverá a saltar y habrá que decidir versión (ver §5).

---

## 4. Decisiones técnicas

**4.1 · `version.ts` importa a `textos.ts`, nunca al revés.** El módulo de la versión conoce el texto (lo necesita para hashearlo); el texto no conoce la versión (design.md §1). Consecuencia práctica: el literal "Estás aceptando la versión N…" vive en `src/lib/registro/textos.ts` como **función** `textoVersionAceptada(version)` y quien pinta le pasa `VERSION_AVISO`. Si `textos.ts` importara la versión, el ciclo `version.ts → registro/textos.ts → version.ts` reventaría en tiempo de carga según quién se importe primero (TDZ). La fuente sigue siendo única: hay un test que recorre `src/` y falla si alguien escribe la versión a mano en otro lado.

**4.2 · El guardián vive en el test, la función también.** La tabla `versión → huella`, la función de huella y la comprobación están las tres en `tests/aviso-version.test.ts`: no hay lógica de verificación en `src/` que nadie de producción use. Lo único que expone `version.ts` es `contenidoVersionadoDelAviso(piezas?)`, cuyo parámetro opcional existe exclusivamente para la prueba por mutación (tarea 5): permite pasar un **doble del módulo de textos** y comprobar que el guardián salta de verdad, no una copia suya.

**4.3 · La huella se calcula sobre el contenido publicado**, unido con `\u0000` (un separador imposible en el texto, para que mover una frase de un bloque a otro no dé la misma huella). Quedan fuera: la propia versión (si entrara, subirla cambiaría la huella y el guardián no probaría nada) y los `href` (son navegación, no contenido legal; los vigila `tests/legales-adversarial.test.ts`).

**4.4 · La línea de versión se antepone al pintar.** `DocumentoLegalView` recibe una prop opcional `version`; solo la página del aviso se la pasa. Así `AVISO_PRIVACIDAD.ultimaActualizacion` no cambia y el bloque literal de la spec sigue siendo el mismo. **Toqué un test adversarial existente** (`tests/legales-adversarial.test.ts` › "la marca no depende de una prop que quien pinte pueda apagar"), cuyo regex exigía que el componente recibiera *solo* `documento`: lo ajusté para que exija exactamente `{ documento, version }` con `version?: string`, conservando —y explicando— su intención original (no puede existir una prop que apague la marca de borrador, y agregar cualquier otra prop vuelve a poner el caso en rojo).

**4.5 · La comparación de versiones vive en `validarRegistro`,** antes de cualquier consulta a la base: es comparar dos cadenas. El desfase **gana** sobre "Marca la casilla para poder registrar tu negocio": de nada sirve pedir la casilla si el texto que la persona tenía enfrente ya no es el vigente. Efecto lateral aceptado y probado: un POST crudo sin el campo (un bot, o `curl`) recibe el mensaje del aviso que cambió en vez del de la casilla; un navegador nunca cae ahí, porque el campo oculto viaja en el HTML.

**4.6 · Espacios alrededor de la versión: se recortan,** como en cualquier otro campo (`leerEnvioRegistro` ya hacía `trim`). No abre nada: el valor sigue teniendo que ser exactamente la versión vigente después del recorte, y lo que se guarda es siempre la del servidor. Está documentado con un caso propio en `tests/registro-adversarial.test.ts`.

**4.7 · La reaceptación se escribe dentro del `updateMany` condicionado al estado `rechazado`** que ya existía, después de `...datos` (que nunca trae esas columnas). Si el admin resolvió la ficha entre la consulta y la escritura, no se afecta ninguna fila y tampoco se escribe reaceptación. La condición es `existente.consintioAvisoVersion !== VERSION_AVISO`, que cubre de un golpe los dos casos de la spec: versión distinta y versión ausente (ficha anterior al versionado).

**4.8 · Formato de la fecha en el panel** (nota en `tasks.md` #23): se usa el `FORMATO_FECHA` del propio panel ("03 sept 2026, 09:00"), no la escritura larga del ejemplo de la spec. La spec fija la **forma** —fecha + `(versión N)`, o `(versión no registrada)`— y el ejemplo ilustra la fecha; el formato del panel mantiene coherente la pantalla y conserva la **hora**, que en una constancia LFPDPPP es parte de la evidencia. Si el validador prefiere la escritura larga, es un cambio de una línea en `constanciaConVersion`.

**4.9 · Seed de demostración** (corrección en `tasks.md` #25): no se puede cumplir a la vez "todos con la versión vigente" y "uno con reaceptación" sin sembrar un dato falso, porque la reaceptación solo existe cuando la versión aceptada es **distinta** de la de la constancia y hoy solo hay una versión publicada. Se siembran 11 negocios con la versión vigente y uno (la barbería `en_revision`) como ficha anterior al versionado con su reaceptación — que es exactamente el caso que la spec de `registro-negocio` contempla, y le da al panel los dos casos que tiene que saber pintar. Además moví el par `consintioAvisoEn` + `consintioAvisoVersion` al bloque `datos` del `upsert` (antes la fecha solo se escribía al crear): así viajan juntos y una base de desarrollo sembrada antes de este change se rellena al volver a sembrar. Sigue siendo idempotente (la fecha es un literal fijo).

**4.10 · Migración renombrada.** Prisma la generó como `20260904150107_…`, que ordena **antes** de `20260905090000_renombra_foto_url_a_foto_clave` (la base trae una migración con fecha futura). La renombré a `20260905120000_agrega_version_del_aviso_consentido` para que sea la última por orden lexicográfico, que es el orden en que Prisma las aplica, y recreé la base de desarrollo desde cero. Aun así, el test de migración **no** depende de la posición: busca la migración por nombre.

**4.11 · Sin dependencias nuevas.** La huella usa `node:crypto`. Cero paquetes agregados.

**4.12 · Tests existentes tocados por la fuerza del cambio:** once suites construían `FormData` de registro sin el campo de versión y ahora habrían rebotado. Les agregué el campo en su constructor común (una línea + import), sin cambiar lo que cada una comprueba. Suites afectadas: `registro-accion`, `registro-adversarial`, `registro-reenvio`, `registro-foto`, `registro-validacion`, `busqueda-datos`, `buscador-seguridad-adversarial`, `admin-adversarial`, `foto-adversarial`, `foto-concurrencia`, `foto-seguridad-adversarial`, `foto-semaforo-adversarial`.

---

## 5. Deuda y propuestas fuera de alcance

1. **Conflicto de fusión anunciado con el PR exprés.** `src/lib/legales/textos.ts` cambia en los dos lados (ellos el párrafo de la foto en "Qué queda público", yo la viñeta de "Qué datos recogemos"). Cuando se fusionen, **el guardián se pondrá rojo** y habrá que decidir versión. Recomendación: si el merge ocurre **antes** de que T-012 llegue a `main`, volver a anclar la huella de la `1` (misma justificación del §3, la versión sigue sin publicarse); si ocurre después, estrenar la `2` y anclar su huella en un renglón nuevo. Quien lo haga solo tiene que copiar la huella que imprime el mensaje de fallo.
2. **La versión no se muestra en la ficha pública ni se le entrega al titular** (fuera de alcance por proposal). Cuando exista el flujo ARCO en el panel (E3-6), la constancia completa —fecha, versión y reaceptación— es lo que hay que poder exportar para responder un acceso.
3. **Re-solicitar el consentimiento a las fichas ya publicadas al estrenar versión `2`** sigue siendo decisión humana (E6-3). Hoy quedaría un directorio con constancias de la `1` mientras el aviso publica la `2`; el propio aviso ya promete avisar por WhatsApp los cambios importantes antes de aplicarlos, así que el procedimiento existe en el texto pero no en el código.
4. **Los términos y condiciones no se versionan** (fuera de alcance). Si alguna vez se aceptan con casilla, la infraestructura de este change se reusa casi tal cual: bastaría un segundo literal y una segunda tabla de huellas.
5. **Propuesta (fuera de spec, no la construí):** el guardián podría vigilar también que la `ultimaActualizacion` cambie cuando cambia la versión. Hoy son independientes: se puede estrenar versión y dejar la fecha vieja. Con el placeholder `[FECHA DE PUBLICACIÓN]` sin completar no tiene sentido todavía, pero conviene atarlo el día que E6-3 ponga la fecha real.
6. **Nota menor:** `tests/foto-adversarial.test.ts` contiene un byte NUL literal dentro de un nombre de archivo hostil (es dato de prueba, preexistente a este change). Hace que `grep` trate el archivo como binario; no afecta a la suite, pero explica por qué algunas búsquedas de texto lo ignoran.

---

## 6. Iteración 2 — correcciones de la etapa C

**Entrada:** `reports/c-seguridad.md` (0 críticos, 0 altos, 4 medios, 4 bajos; veredicto PASA).
**Gates al cierre de esta iteración:** `npm run lint` ✅ (0 problemas) · `npm run build` ✅ · `npm test` ✅ **62 archivos / 1644 tests**. Base recreada, seed corrido y panel comprobado a mano en el puerto 3600.
**Las 4 medias y las 4 bajas, atendidas:** 6 corregidas en código, 1 evaluada y documentada (BAJO-2), 1 sin cambio por estar ya justificada (BAJO-3).

### 6.1 · MEDIO-1 — la marca de borrador entra en la huella

`DocumentoLegalView` pinta `TEXTO_MARCA_BORRADOR` **dentro** del documento legal, debajo del `h1`: es parte de lo que el titular lee al consentir, y advierte de que el texto todavía no pasó la revisión legal. Quedaba fuera de la huella, así que vaciar `PLACEHOLDERS_LEGALES` retiraba esa advertencia de la página publicada sin estrenar versión y con la suite en verde. Hallazgo correcto.

- `PiezasDelAviso` gana `marcaBorrador: string | null`, que en las piezas vigentes vale `HAY_PLACEHOLDERS_PENDIENTES ? TEXTO_MARCA_BORRADOR : null`, y `contenidoVersionadoDelAviso` la inserta **en su lugar de lectura** (entre el `h1` y la línea de última actualización), no al final: la huella refleja el documento como se lee.
- Dos casos nuevos en la prueba por mutación: **quitar** la marca y **reescribirla** dejan la verificación en rojo.
- Un caso nuevo en `tests/aviso-version.test.ts` fija que la marca está en el contenido versionado y en esa posición.
- La CARACTERIZACIÓN de la etapa C quedó **volteada a REGRESIÓN** con su historia escrita, y además comprueba que quitar la marca cambia la huella.
- **Huella de la versión `1` vuelta a anclar** (`2b234583…`), por la misma excepción documentada: la `1` la estrena este change y todavía no ampara ninguna constancia. Es la segunda vez en el change; el comentario de `HUELLAS_POR_VERSION` lo dice explícitamente para que nadie lo lea como un permiso permanente.

**Lo que decidí NO meter en la huella, y por qué:** el título y la descripción de metadata (`TITULO_AVISO_PRIVACIDAD`, `DESCRIPCION_AVISO_PRIVACIDAD`), que la etapa C mencionó con el mismo criterio. No son el aviso: son cómo se anuncia la página en un buscador. Nadie consiente un `<title>`, y meterlos obligaría a estrenar versión del aviso legal por una mejora de SEO — que es justo el falso positivo que volvería al guardián ruido. Queda dicho aquí para que el validador lo confirme o lo revierta.

### 6.2 · MEDIO-2 — el guardián de fuente única no caduca al estrenar versión

El patrón llevaba el `1` escrito a mano: el día que la vigente fuera la `2`, el caso habría buscado un literal inexistente y habría pasado siempre. Ahora se deriva de `VERSION_AVISO` (con escape de metacaracteres, por si algún día la versión es `"2-legal"`) y el recorrido incluye `prisma/` además de `src/`, saltando `generated` y `migrations`. Confirmado con el escaneo en verde sobre los 40+ archivos de los dos árboles.

### 6.3 · MEDIO-3 — la reaceptación se decide por orden, no por desigualdad

`versionAvisoEsPosterior(vigente, anterior)` en `src/lib/legales/version.ts` es ahora la única pieza que sabe ordenar versiones. Compara enteros; lo que no es un entero (o es `null`) **no es comparable** y devuelve `false`.

- Rollback: constancia de la `2`, vigente la `1`, reenvío → **no se anota nada**. Antes se escribía una "reaceptación" de una versión más vieja que el panel rotulaba como más nueva.
- Una reaceptación ya anotada no se borra ni se pisa en ese caso: lo que ya es evidencia, se queda.
- Tests: dos casos nuevos en `tests/registro-reenvio.test.ts`, cuatro de unidad sobre la comparación (mayor/menor, igual, `null`/vacío, y siete formas de versión no ordenable), y la CARACTERIZACIÓN de la etapa C volteada a REGRESIÓN.

### 6.4 · MEDIO-4 — "sin versión" no es comparable, y el panel no sobre-atribuye

Dos correcciones, y son las que más me convencieron del reporte de la etapa C:

1. **No se fabrica evidencia sobre fichas anteriores al versionado.** Antes, `!==` hacía que *todas* las fichas existentes (ninguna tiene versión) estrenaran reaceptación en su primer reenvío. Como el formulario es anónimo, cualquiera que conociera el número podía dejar escrito un acto de consentimiento en la ficha de otro — exactamente lo que este change evita al no pisar la constancia original. Ahora "no consta" no se compara con nada: no se anota reaceptación y el panel sigue diciendo "versión no registrada". Test dedicado en la suite adversarial ("un tercero no fabrica evidencia reenviando una ficha sin versión registrada").
2. **La etiqueta describe el hecho, no al autor.** "Aceptó una versión más nueva del aviso" → **"El reenvío aceptó la versión N del aviso"**, con la fecha como valor. No dice quién lo hizo (no se sabe) y no afirma la dirección del cambio por su cuenta: eso ahora lo garantiza la regla de escritura.

**Enmiendas de spec marcadas** (las tres tocaban literal aprobado): `registro-negocio` (la regla de reaceptación + el scenario "reenvío de una ficha anterior al versionado", que cambia de resultado, + un scenario nuevo de rollback), `revision-admin` (la etiqueta y el formato de su valor) y `modelo-datos` ("distinta" → "posterior", y el scenario del seed). Cada una lleva su bloque `> **Enmienda aprobada durante la implementación de T-012**` con el texto anterior y el motivo.

**Efecto colateral en el seed, corregido:** mi caso de demostración era "ficha sin versión + reaceptación", que bajo la regla nueva es un estado **imposible**. Ahora el seed reparte los tres casos del panel en tres negocios: la mayoría con la versión vigente, la barbería `en_revision` como ficha anterior al versionado (sin versión y sin reaceptación) y el taller rechazado con la constancia de una versión anterior ficticia (`"0"`) y su reaceptación — que es la única forma de que ese caso exista mientras la vigente sea la primera versión publicada. Le puse fechas coherentes con su historia (registro, reenvío el 1 de agosto con la reaceptación y reloj de cola reiniciado, rechazo el 2), lo que pidió un `registradoEn` opcional en el seed. El test del seed comprueba ahora la coherencia con la propia función de comparación, no con un conteo a mano.

### 6.5 · Bajos

- **BAJO-1 (corregido).** `avisoVersion` entra en `LIMITES_LONGITUD` (20) y se recorta en el borde, dentro de `leerEnvioRegistro`, como cualquier otro campo. Truncar no puede convertir una cadena hostil en la vigente —seguiría teniendo que ser igual carácter por carácter—, así que la cota es paridad, no un parche de fuga. Test en `registro-validacion`.
- **BAJO-4 (corregido).** Salto de línea final en `tests/registro-adversarial.test.ts`.
- **BAJO-2 (evaluado → documentado, no implementado).** El `CHECK` de par nulo/no nulo no es una sentencia simple en SQLite: exige reconstruir `Negocio` (crear tabla nueva, copiar, borrar, renombrar, rehacer índices y claves foráneas). Y este repo tiene la política contraria **por escrito**: la migración `20260905090000_renombra_foto_url_a_foto_clave` evita a propósito la redefinición que Prisma genera para SQLite, porque perdería los `CHECK` de `estado` y `origen` que la migración inicial escribió a mano. Reconstruir la tabla principal —4 índices únicos, 2 claves foráneas y la relación m-n de giros— para blindar un invariante que hoy sostiene el único camino de escritura (las dos columnas se escriben en el mismo objeto literal, y hay tests que lo fijan) es más riesgo que defensa. Queda como deuda con nombre: si algún día se reconstruye la tabla por otro motivo, ese es el momento de meter el `CHECK` (y el de la constancia, del mismo tipo).
- **BAJO-3 (sin cambio).** Que el seed de demostración reescriba la constancia de sus 12 fichas ficticias es deliberado (§4.9): es lo que rellena la versión al volver a sembrar una base creada antes del versionado. `prisma/guardas-entorno.ts` impide correrlo contra producción o contra una base no local, y solo alcanza a números `771999xxxx`.

### 6.6 · Estado de los tests de la etapa C

Los **28 casos** de `tests/aviso-version-seguridad-adversarial.test.ts` en verde (eran 27; sumé uno de MEDIO-4). Las **dos CARACTERIZACIONES quedaron volteadas a REGRESIÓN**, con el hallazgo que las originó escrito encima, para que se lean como guardia y no como permiso:

| Antes (CARACTERIZACIÓN) | Ahora (REGRESIÓN) |
|---|---|
| "la marca de borrador se publica en el aviso pero queda fuera de la huella" | "la marca de borrador publicada entra en la huella del guardián" |
| "una constancia MÁS NUEVA que la vigente queda rotulada como reaceptación 'más nueva'" | "tras un rollback, la vigente más VIEJA que la constancia no deja reaceptación" |

No debilité ningún otro caso de la etapa C: los tres que tocaban la etiqueta del panel se actualizaron al literal nuevo conservando lo que comprobaban (escapado del HTML y ausencia de la línea cuando no hay reaceptación).

### 6.7 · Verificación manual de esta iteración (puerto 3600)

Base recreada y `db:seed:demo` corrido; panel con sesión válida y credenciales ficticias:

- Barbería (anterior al versionado): `Consentimiento del aviso de privacidad: 31 jul 2026, 04:00 a.m. (versión no registrada)` y **ninguna** línea de reaceptación.
- Taller Fantasma: `… (versión 0)` y `El reenvío aceptó la versión 1 del aviso: 01 ago 2026, 03:30 a.m.`
- `/aviso-de-privacidad` sigue mostrando `Versión 1 · Última actualización: …` y `/registro` sigue sirviendo `<input type="hidden" name="avisoVersion" value="1"/>` en el HTML.

### 6.8 · Deuda que sigue viva

Lo de §5 sigue en pie, con dos precisiones nuevas:

- El **conflicto de fusión con el PR exprés** ahora pondrá el guardián en rojo con más razón (la huella de la `1` ya se re-ancló dos veces). Quien lo resuelva sigue teniendo la regla escrita en el archivo del guardián: antes del merge, re-anclar; después, estrenar la `2`.
- El `CHECK` del par nulo/no nulo (BAJO-2) queda pendiente para el día que haya que reconstruir `Negocio` por otro motivo.
