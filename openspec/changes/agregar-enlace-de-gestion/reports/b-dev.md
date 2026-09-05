# Reporte dev — `agregar-enlace-de-gestion` (T-014)

Lógica completa sobre el árbol nuevo (PostgreSQL, post-#17/#18). Los mocks de
la etapa A están **retirados** (`src/lib/mock/` ya no existe): todo lo que la
UI dejaba pendiente de enchufar corre ahora contra la base.

**Gates (contra PostgreSQL):** `npm run lint` ✅ · `npm run build` ✅ ·
`npm test` ✅ **2811 pasando, 2 saltados, 102 archivos** (antes del change:
~2305). Detalle del entorno de pruebas en §7.

---

## 1. Qué se construyó

### Modelo y migración (tareas 1–4)

- `prisma/migrations/20260908000000_agrega_enlace_de_gestion/migration.sql`,
  **en dialecto PostgreSQL** sobre el árbol consolidado de T-013:
  - `DROP COLUMN "tokenGestion"` (estaba nula en todas las filas: nadie la
    escribía) + `tokenGestionHash TEXT` con índice único y
    `tokenGestionCreadoEn TIMESTAMP(3)`;
  - tabla `EdicionPendiente` con **una columna por campo capturable** y su
    ciclo propio, con las tres claves foráneas (`negocioId` en **CASCADE**,
    `categoriaId` RESTRICT, `coloniaId` SET NULL);
  - **escritas a mano**, con el mismo bloque de advertencia que la inicial:
    el `CHECK` de `estado` (`pendiente | aplicada | descartada`) y el
    **índice único parcial** `EdicionPendiente_una_pendiente_por_negocio`
    (`... ON ("negocioId") WHERE "estado" = 'pendiente'`), que Prisma no sabe
    expresar.
- El invariante de cascada que T-015 comprobaba con `PRAGMA` es hoy el
  `information_schema`/`pg_catalog` que dejó T-013: `clavesForaneasHacia` en
  `tests/modelo-migraciones.test.ts` ahora exige **tres** claves hacia
  `Negocio` y las tres en `CASCADE` (`EdicionPendiente.negocioId` es la
  nueva). Se le sumaron dos comprobaciones al catálogo: que el índice parcial
  existe con su `WHERE`, y que de `tokenGestion` solo quedan las dos columnas
  nuevas con su índice único.
- `src/lib/gestion/campos.ts` es **la lista única** de campos editables,
  atada al tipo con `satisfies ReadonlyArray<keyof DatosNegocioValidados>`:
  si el registro estrena un campo, **deja de compilar** hasta que se nombre
  aquí, y `tests/gestion-modelo.test.ts` compara la lista contra las columnas
  reales de la tabla (exhaustivo, ni una de más).

### El token (tareas 5–7)

`src/lib/gestion/token.ts`: 32 bytes de `crypto.randomBytes` en base64url,
huella SHA-256, comparación con `timingSafeEqual`, y la URL absoluta desde
`SITIO_URL`. La búsqueda va **por huella** (índice único), nunca comparando el
token contra filas. El módulo **no llama a `console` en ninguna rama** y hay un
test que lo vigila. `editar` ya estaba reservado en `rutas-reservadas.ts`
(tarea 7 venía hecha de T-001).

`generarEnlaceDeGestion()` devuelve `{ token, columnas }` a propósito: así
**ningún archivo del panel nombra `tokenGestionHash`** y el guardián de
`admin-adversarial` puede seguir prohibiéndolo (§4).

### Modo edición público (tareas 8–16)

- `src/lib/gestion/consultas.ts` resuelve el token y prellena; si hay una
  edición pendiente, prellena **con ella** y pinta el aviso.
- `src/lib/gestion/procesar-edicion.ts` es el corazón (hermano de
  `registro/procesar.ts`): honeypot → cupo propio → token → `validarRegistro`
  **tal cual** → unicidad del WhatsApp contra otra ficha → guardado.
- `src/lib/gestion/ediciones.ts` guarda reemplazando la anterior **en una
  transacción**, y reintenta una vez si choca con el índice parcial (dos
  envíos casi simultáneos).
- `src/lib/gestion/limite-ip.ts`: contador propio con `crearCupoPorIp`,
  independiente del de altas y del panel.
- La página y la acción quedaron como las dejó la etapa A, con la resolución
  real enchufada; el token viaja **ligado con `.bind`** (cuerpo del POST), no
  como parámetro de consulta.

### Panel (tareas 17–27)

- `obtenerColaDeRevision` mezcla altas y ediciones ordenadas por antigüedad de
  entrada. `tipo` y `hrefDetalle` son **parte de `RegistroColaItem`**, no props
  opcionales de la tarjeta: un renglón nuevo no puede olvidarse de decir qué es.
- `src/lib/admin/ediciones.ts` arma la comparación **al mirar**, campo contra
  campo, contra lo que la ficha dice hoy.
- Aplicar y descartar son escrituras **condicionadas al id + `pendiente`**; si
  no afectan filas, se distingue "reemplazada" (hay otra pendiente más nueva)
  de "ya resuelta". El aviso por `searchParams` ya solo **pinta** lo que decidió
  la escritura.
- Regenerar vive en `src/lib/gestion/enlace.ts`, condicionado a `publicado`.
- El detalle de una ficha publicada estrena la línea "Tiene enlace de gestión,
  generado el …" y el control "Generar un enlace nuevo".

### Ficha pública (tareas 28–30)

Sin cambios sobre lo que dejó la etapa A (ya estaba bien), más sus tests.

---

## 2. Decisiones técnicas que no estaban en la spec

### 2.1 El "sobre": cómo llega el enlace en claro a la pantalla que lo muestra

**El problema.** La base guarda la huella, no el token. El panel es
POST-Redirect-GET **sin JavaScript**, así que una Server Action no le puede
devolver un valor a la página. Y el enlace tiene que verse en dos pantallas
(`/aprobado` y `/regenerar-enlace/listo`).

**Lo que NO se hizo, y por qué:**

- **Pasarlo por la URL** (`?enlace=…`) mete el secreto en el historial, en los
  logs del proxy y —sobre todo— en el **`Referer` que el navegador manda al
  tocar el botón de WhatsApp**. Es exactamente la fuga que design.md §4 cierra
  del lado público: sería incoherente abrirla del lado del panel.
- **Guardarlo en la base** contradice el requirement entero.

**Lo que se hizo** (`src/lib/gestion/sobre.ts`): una cookie `httpOnly`,
`SameSite=Lax`, `Path=/admin`, `Secure` con el mismo criterio que la sesión, de
**120 segundos**, con valor `<negocioId>.<token>` (el enlace de un negocio no
se puede mostrar en la pantalla de otro).

**Limitación asumida, para el visto bueno del humano:** Next.js solo permite
BORRAR una cookie desde una Server Function o un Route Handler, **no al
renderizar una página** (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md`,
"Good to know"). Así que el "una sola vez" del requirement lo sostiene la
**caducidad**, no un borrado explícito: dentro de esos dos minutos, recargar la
confirmación vuelve a mostrar el mismo enlace **al mismo admin que acaba de
generarlo**; pasados, ya no aparece en ninguna pantalla y hay que generar otro.
Los scenarios "el enlace no se queda a la vista" y "el enlace se muestra una
sola vez" se cumplen (el detalle nunca lo muestra; sin sobre, `/listo` redirige
al detalle) y están probados.

### 2.2 Qué le pasa a la edición que el dueño reemplaza

Solo hay tres estados. La reemplazada queda **`descartada` con su fecha y SIN
motivo**: un motivo es lo que el admin escribe para avisarle al negocio, y aquí
no hubo admin ni hay nada que avisar. Esa ausencia además **distingue en la
tabla** un descarte del admin de un reemplazo del dueño, y la pantalla
`/descartada` exige las dos cosas (estado + motivo) antes de ofrecer el aviso
por WhatsApp: así no se anuncia un descarte que nadie hizo.

### 2.3 Dos literales de copy propuesto (sin literal en la spec)

- `MENSAJE_ERROR_AL_RESOLVER_EDICION` — "No se pudo hacer el cambio. Los
  cambios siguen esperando; vuelve a intentar en un momento." Para cuando la
  base no se deja escribir al aplicar. La spec no da literal para ese caso y
  dejarlo mudo era peor.
- `errorMotivoDescarteLargo` — **no es texto nuevo**: reexporta
  `errorMotivoDespublicarLargo`, que ya existía y dice exactamente lo que hace
  falta ("…así, completo, es como le va a llegar al negocio"). El motivo del
  descarte se **rechaza**, no se recorta, por la misma razón que el de la
  despublicación: viaja dentro de un WhatsApp a un tercero. Cota: 500.

### 2.4 La foto no se edita — decisión de la etapa A, ratificada

`design.md §5` menciona tres diferencias, pero el requirement **normativo** de
`revision-admin` enumera los campos que "Aplicar los cambios" copia y la foto
no está. Se priorizó el requirement enumerado. Queda como coordinación con
T-008 (§6).

### 2.5 El pin del mapa tampoco es editable

`design.md §1` menciona "dirección o referencias con su pin", pero el
formulario de registro **no captura `latitud`/`longitud`** (no existe ese campo
en T-003), así que no hay nada que editar. La lista canónica de campos
editables es `keyof DatosNegocioValidados`, y ahí no están. Anotado como
propuesta fuera de alcance (§6).

---

## 3. Mapa scenario → test

Todos los archivos nuevos están en `tests/`. Los scenarios de las cuatro
capacidades, uno por uno:

### `modelo-datos` → `tests/gestion-modelo.test.ts` y `tests/modelo-migraciones.test.ts`

| Scenario | Test |
|---|---|
| negocio recién registrado | `un negocio recién creado nace sin huella y sin fecha de generación` |
| la base no guarda el token | `la tabla Negocio ya no tiene ninguna columna de token en claro` + `la columna del token en claro desapareció y quedó su huella, única` (migraciones) |
| dos negocios no pueden compartir huella | `dos negocios no pueden compartir huella` |
| regenerar sustituye | `regenerar deja una sola huella, la nueva, con su fecha actualizada` |
| migración sobre una base con datos | `una fila que solo escribe lo del modelo original deja nulo todo lo demás` (migraciones, con `tokenGestionHash`/`tokenGestionCreadoEn` en la lista) |
| edición guardada sin tocar la ficha | `guardar una edición no mueve ni una columna del negocio` |
| una sola pendiente por negocio | `la base impide dos ediciones pendientes del mismo negocio` + `el índice único parcial de una-pendiente-por-negocio existe en la base` (migraciones) |
| estados fuera del conjunto | `rechaza un estado que no es pendiente, aplicada ni descartada` + `las cuatro constraints escritas a mano siguen vivas` (migraciones, ahora cinco) |
| una edición resuelta deja de bloquear | `una edición aplicada o descartada deja de ocupar el lugar de la pendiente` |
| la edición no puede cargar campos que no son editables | `sus columnas son las editables más las de su ciclo de vida, y ninguna prohibida` + `la lista de campos editables no incluye ningún campo prohibido` |
| hard delete | (ya cubierto) `toda clave foránea hacia Negocio borra en cascada` (migraciones) |
| el borrado se lleva las ediciones | `borrar un negocio con una pendiente y dos resueltas no deja rastro de sus datos` |
| el enlace de un negocio borrado no resuelve | mismo test (huella) + `el enlace de un negocio borrado no resuelve` (`gestion-edicion`) |

### `registro-negocio` → `tests/gestion-edicion.test.ts`, `tests/gestion-token.test.ts`, `tests/gestion-textos.test.ts`

| Scenario | Test |
|---|---|
| el dueño abre su enlace | `pinta el título, la frase, el botón y todos los campos ya puestos` |
| la edición no vuelve a pedir consentimiento | `no lleva checkbox de consentimiento y sí la nota del aviso vigente` |
| negocio con colonia "Otra" sin normalizar | `conserva la colonia 'Otra' con su texto libre, sin inventarle una del catálogo` |
| la edición funciona sin JavaScript | **verificación manual** (§5): el formulario es el mismo del registro, que ya lo cumple; en el HTML servido no hay ningún control que dependa de JS |
| token inventado | `un token inventado responde no encontrado` + `una cadena que ni siquiera tiene forma de token responde igual` |
| token invalidado por una regeneración | `el token anterior deja de abrir cuando se genera uno nuevo` |
| token de un negocio que no está publicado | `un token de una ficha en estado %s responde no encontrado` (los dos estados) |
| el token no se va en el Referer | `las dos pantallas declaran noindex, nofollow y no mandan Referer` + **manual**: `<meta name="referrer" content="no-referrer">` en el HTML servido |
| la página de edición no se indexa ni se enlaza | mismo test + `ninguna otra página del sitio quedó marcada como no indexable` (`buscador-pagina`) + `ninguna superficie pública contiene un valor propuesto` (comprueba que no hay `/editar/`) |
| el token no aparece en el log | `ni el camino feliz ni el de error escriben el token en el log` (espía de `console.*`, camino feliz + 404 + error de validación) y `el módulo del token no llama a console en ninguna rama`. **Ver el hallazgo A del §6.** |
| los cambios entran a revisión y la ficha no se mueve | `crea una edición pendiente y la ficha sigue exactamente igual` |
| el listado y la búsqueda tampoco se enteran | `ninguna superficie pública contiene un valor propuesto` y `la búsqueda no lo encuentra por lo propuesto y sí por lo publicado` (`gestion-privacidad`) |
| recargar la confirmación | `la confirmación dice el literal de la spec y no repite el envío` |
| falla al guardar los cambios | `ERROR_GUARDAR_EDICION` en `gestion-textos` + la rama de error de `procesarEdicion` (`guardarEdicion` → `{ resultado: "error" }`) |
| WhatsApp inválido en la edición | `un WhatsApp de menos de 10 dígitos rebota con su literal y no guarda nada` |
| WhatsApp que ya tiene otra ficha | `un número que ya está en otra ficha rebota con su literal` (+ `conservar su propio número no cuenta como duplicado`) |
| campos que no le tocan | `ignora estado, origen, giros, fechas, consentimiento y token del cliente` |
| un token solo edita su propia ficha | mismo test (el envío manda `negocioId` de otro y la edición se guarda contra el del token) |
| la edición deja la ficha lista para el buscador | `copia los campos editables y deja intacto todo lo demás` (`gestion-panel`: comprueba `nombreNormalizado`/`queOfrecesNormalizado`) |
| aviso al abrir con cambios pendientes | `el formulario se prellena con lo último que él mandó y lo avisa` |
| los cambios nuevos sustituyen a los viejos | `el segundo envío reemplaza al primero y reinicia su reloj` |
| dos envíos casi simultáneos | `dos envíos casi simultáneos dejan exactamente una pendiente, sin error técnico` + `un choque con el índice único se reintenta y el dueño ve su confirmación` |
| límite por IP | `el cuarto envío de la misma hora se rechaza con su literal` |
| el campo trampa | `un envío con el campo trampa lleno ve la misma confirmación y no guarda nada` |
| los cupos no se estorban | `agotar el cupo de ediciones no consume el de altas del registro` |
| (los seis scenarios del MODIFIED "Una sola ficha por número") | sin cambios: `tests/registro-reenvio.test.ts` sigue en verde |

### `revision-admin` → `tests/gestion-panel.test.ts` y `tests/gestion-textos.test.ts`

| Scenario | Test |
|---|---|
| cada aprobación estrena enlace | `dos aprobaciones distintas dejan dos huellas distintas` |
| el token no se puede adivinar | `son 256 bits de una fuente aleatoria criptográfica, distintos cada vez` + `no se deriva del nombre, del identificador, del número ni de la fecha` (`gestion-token`) |
| aprobar dos veces no cambia el enlace | `una aprobación repetida no genera un token nuevo` |
| el panel no muestra el enlace vigente | `el detalle de un publicado ofrece el control pero no el enlace` + `la huella del enlace de un registro no aparece en el HTML del panel` (`admin-adversarial`) |
| comparación campo por campo | `marca 'Cambió' solo en los campos distintos` |
| cambio de WhatsApp advertido | `advierte el cambio de WhatsApp y escribe al número NUEVO` |
| la marca se lee, no solo se ve | mismo test (la marca es el texto "Cambió", no una clase de color) |
| edición inexistente | `un identificador inventado responde no encontrado` |
| aplicar los cambios | `copia los campos editables y deja intacto todo lo demás` |
| aplicar no toca lo que no es editable | mismo test (estado, origen, giros, fechas, consentimiento y enlace, comparados antes/después) |
| aviso de que la ficha ya se actualizó | `la confirmación ofrece el aviso por WhatsApp con el link de la ficha` |
| el número propuesto se lo ganó otra ficha | `un número que ya tiene otra ficha no se aplica y la edición sigue pendiente` |
| la ficha editada se sigue encontrando | `copia los campos editables…` (texto normalizado) |
| descarte con motivo | `guarda el motivo y su fecha, y la ficha sigue idéntica` |
| descarte sin motivo | `sin motivo no cambia nada y muestra su literal` |
| aviso del descarte por WhatsApp | `la confirmación lee el motivo GUARDADO y arma el mensaje` |
| el enlace sigue sirviendo tras un descarte | `guarda el motivo y su fecha…` (comprueba que la huella no cambió) |
| doble aplicación | `la segunda aplicación no se aplica y dice 'ya los habías resuelto'` (+ `el doble descarte tampoco pisa el primer motivo`) |
| el negocio mandó otros mientras tanto | `una edición reemplazada no se aplica y lo dice con su propio literal` |
| recargar después de resolver | `la confirmación no confirma nada si la edición no está aplicada` + `una edición reemplazada por el dueño no se anuncia como descarte del admin` |
| regenerar invalida el anterior | `sobrescribe la huella y ofrece el mensaje con el enlace nuevo` + `el token anterior deja de abrir…` (`gestion-edicion`) |
| mandar el enlace nuevo | mismo test (mensaje `wa.me` codificado, carácter por carácter) |
| el enlace se muestra una sola vez | `sin el sobre, la pantalla del enlace ya no muestra nada y vuelve al detalle` + `el sobre de otro negocio no sirve para ver este enlace` |
| regenerar no toca la ficha ni la cola | `una edición pendiente sigue esperando después de regenerar` |
| orden de la cola mezclada | `las ordena por antigüedad de entrada, cada una con su tipo y su destino` |
| la edición lleva a su propio detalle | mismo test (`hrefDetalle`) + `la pantalla de la cola pinta las dos etiquetas y el indicador de atraso` |
| la cola solo trae lo pendiente | `las ediciones aplicadas y descartadas no aparecen` |
| un negocio publicado con edición pendiente | `un negocio publicado con edición aparece una sola vez, como Edición` |
| cola vacía | `sin altas ni ediciones muestra el literal de cola vacía` |
| registro atrasado / edición atrasada / dentro de la meta | `una edición de %i horas se marca atrasada: %s` (3, 47, 49 y 200 horas) |
| el reloj de la edición se reinicia al reemplazarla | `reemplazar una edición atrasada por otra nueva la saca del atraso` |
| el indicador se lee, no solo se ve | `la pantalla de la cola pinta las dos etiquetas y el indicador de atraso` |
| cola / detalle de un registro sin sesión | sin cambios (`admin-paginas`, `admin-acceso`) |
| detalle de una edición sin sesión | `sin sesión redirige al acceso sin pintar ni un dato` |
| aprobar sin sesión | `sin sesión no se publica ni se genera ningún enlace` |
| resolver una edición sin sesión | `sin sesión no se aplica nada` + `sin sesión no se guarda ningún motivo` |
| generar un enlace sin sesión | `sin sesión el enlace no cambia y no se devuelve ningún token` |
| ninguna transición desde lo público | `ninguna superficie pública contiene un valor propuesto` + los guardianes de `directorio-consultas` (§4) |
| aviso de publicación con los dos links | `la confirmación ofrece el mensaje con el link de la ficha y el de gestión` |
| los dos links abren lo que prometen | mismo test (el segundo es `${SITIO_URL}/editar/${token}` del sobre) + **manual** (§5) |
| el enlace no se queda a la vista | `sin el sobre, la confirmación sigue ofreciendo el aviso pero sin enlace` |
| revisar desde el celular / la comparación se lee en el celular | **manual + guardián parcial** (§5 y §6, hallazgo C) |
| el panel funciona sin JavaScript | **manual**: todas las pantallas nuevas son Server Components |
| sin JS de cliente propio | ninguno de los archivos nuevos declara `"use client"` (revisado; el único cliente sigue siendo `FormularioRegistro`) |

### `directorio-publico` → `tests/gestion-privacidad.test.ts` y `tests/gestion-textos.test.ts`

| Scenario | Test |
|---|---|
| pedir el enlace desde la ficha | `el mensaje al admin interpola el nombre y no promete que llegue solo` + **manual** (`wa.me` real en la ficha servida) |
| sin número de admin configurado | `gestion-privacidad` comprueba que la ficha se sirve completa **con y sin** `WHATSAPP_ADMIN`: la comparación de fichas neutraliza también el nombre codificado del `wa.me`, así que no depende del entorno (lo verifiqué con la variable puesta y sin ella) |
| el número del admin no vive en el repo | `.env.example no le asigna ningún valor y el código no le pone respaldo` |
| el control no compite con el contacto | **manual** (§5): "Enviar WhatsApp" sigue siendo el único botón con el verde de acción |
| solo en la ficha | ninguna tarjeta de listado lo pinta (el componente solo se usa en `negocio/[ficha]/page.tsx`) |
| la ficha sigue mostrando lo publicado | `ninguna superficie pública contiene un valor propuesto` |
| la búsqueda no encuentra lo propuesto | `la búsqueda no lo encuentra por lo propuesto y sí por lo publicado` |
| nada delata que hay cambios esperando | `la ficha con edición pendiente no se distingue de una sin ella` (compara el HTML **completo** de las dos fichas, neutralizando solo lo que legítimamente difiere) |
| sin datos internos en la respuesta | `la consulta pública no devuelve la huella del enlace ni nada de la edición` |
| (los scenarios del MODIFIED de los botones de contacto) | sin cambios: `directorio-paginas` y `directorio-enlaces` en verde |

---

## 4. Guardianes existentes: cuáles siguen mordiendo y cuál se enmendó

**Siguen mordiendo sin tocarlos:** sesión del panel (`admin-acceso`,
`admin-paginas`), responsivo (`responsivo-guardian`, **ampliado** con el modo
edición y `src/components/gestion/`), huella del aviso legal (**no se tocó ni
una línea de texto legal**, `legales-*` en verde), rutas reservadas, seed,
purga, fotos, SEO, analítica.

**Actualizados por necesidad (renombre de columna):** ~17 archivos de tests
cambiaron `tokenGestion` → `tokenGestionHash`. Todos siguen comprobando lo
mismo (que la columna no se filtra a lo público, que un envío no la puede
fijar, que el reenvío no la pisa).

**Enmendado a conciencia — `tests/admin-adversarial.test.ts`:**

La regla era la más simple posible: *ninguna* fuente del panel podía nombrar
`tokenGestion`. Era correcta mientras el enlace era terreno reservado; ahora el
panel **genera** enlaces (al aprobar y al regenerar) y el requirement le pide
además decir "tiene enlace y desde cuándo". La regla, tal cual, ya no se puede
cumplir. Lo que se conserva es la propiedad que de verdad importaba, **con más
precisión que antes**, en tres pruebas:

1. `ninguna pantalla ni acción del panel lee la huella del enlace de gestión` —
   ni `src/app/admin`, ni `src/components/admin`, ni `src/lib/admin` contienen
   `tokenGestionHash`. Es posible porque las dos escrituras viven en
   `src/lib/gestion/` y devuelven las columnas ya armadas.
2. `la fecha del enlace solo la nombran la consulta que la lee y el detalle que
   la pinta` — lista blanca de **dos** archivos, y se comprueba que los dos la
   nombran (no es un permiso en blanco).
3. `ninguna pantalla del panel arma una URL de edición` — el panel no conoce el
   token, así que no podría; queda escrito.

Más la prueba de comportamiento, reforzada: `la huella del enlace de un
registro no aparece en el HTML del panel` ahora comprueba también que no hay
ninguna `/editar/` y que **sí** aparece "Tiene enlace de gestión".

**Otros tres guardianes ajustados, cada uno con su porqué en el propio test:**

- `directorio-consultas` · "solo el directorio filtra por estado publicado y
  solo el panel lo escribe": pasa de 2 archivos a 4. Los dos nuevos
  (`gestion/ediciones.ts`, `gestion/enlace.ts`) usan el estado como
  **condición de escritura**, igual que `despublicarFicha`. Se añadieron
  aserciones que lo mantienen honesto: ninguno lo usa en un `find*`, cada uso
  está dentro de un `where` de escritura, y `token.ts` **no nombra el literal**
  (lo recibe como parámetro).
- `buscador-seguridad-adversarial` · "todo archivo que crea o actualiza un
  Negocio importa `datosDeBusqueda`": se exime `gestion/enlace.ts` con la
  misma cláusula que `admin/transiciones.ts` (se comprueba que **no** escribe
  `nombre` ni `queOfreces`). `gestion/ediciones.ts` **no** está exento: aplica
  una edición y recalcula.
- `buscador-pagina` · lista blanca de no indexables: entran `/editar/[token]` y
  su confirmación, con su porqué.
- `layout` · `rutaInternaExiste` acepta `/admin/registros/<id>/regenerar-enlace`
  (+ `/listo`), `/admin/ediciones/<id>` (+ `/aplicada`, `/descartada`) y
  `/editar/<token>` (+ `/gracias`), y **sigue** rechazando una sub-ruta
  inventada bajo cualquiera de ellas.
- `despliegue` · `WHATSAPP_ADMIN` documentada en `docs/despliegue.md` §3.2 con
  su fail-safe (el test falla si una variable del código no está en el doc).

---

## 5. Verificación manual (sitio servido en el puerto 3900)

Con `SITIO_URL=http://localhost:3900`, `WHATSAPP_ADMIN` puesto y un enlace real
generado contra un negocio del seed de demostración:

- `/editar/<token válido>` → **200** con "Edita tu ficha", la frase, "Enviar
  cambios", la nota del aviso, el nombre del negocio prellenado, **sin**
  `name="consentimiento"` y **sin** `type="file"`.
- Metadata servida: `<meta name="robots" content="noindex, nofollow">` y
  `<meta name="referrer" content="no-referrer">`.
- `/editar/<43 caracteres inventados>` → **404**; `/editar/hola` → **404**
  (mismo cuerpo, mismo código).
- Ficha pública → bloque "¿Es tu negocio?" + "Perdí mi enlace" con el `wa.me`
  del admin y el mensaje codificado correcto; **cero** apariciones de
  `/editar/` y de `tokenGestion` en el HTML.
- Panel con sesión: cola **200**, detalle **200** con "Tiene enlace de gestión,
  generado el 04 sep 2026, 05:12 p.m." y "Generar un enlace nuevo", **cero**
  `/editar/` en el detalle; `/regenerar-enlace` **200** con su advertencia;
  `/regenerar-enlace/listo` **sin sobre** → 307 al detalle.
- Sin sesión: `/admin/cola`, `/admin/ediciones/<id>` y
  `/admin/registros/<id>/regenerar-enlace` → **307** al acceso.

---

## 6. Hallazgos, deuda y propuestas fuera de alcance

### A. ALTO para la etapa de seguridad — el token SÍ queda en el log de acceso del runtime

`next dev` escribe la línea `GET /editar/<token> 200 in 54ms` en su log. **No
es nuestro código** (nuestros módulos no llaman a `console` con el token, y hay
tests que lo vigilan), es el logger de peticiones del framework — y en
producción el mismo papel lo hace el log de acceso de la plataforma, que
registra la ruta.

El requirement dice "el token NO DEBE escribirse nunca en el log del servidor".
Lo que se puede afirmar hoy es más acotado: **nuestro código no lo escribe**.
Que la ruta completa aparezca en el log de acceso es una consecuencia directa
del diseño aprobado (el secreto va en el *path*, design.md §4), no de la
implementación. Opciones, todas fuera de este change:

1. Asumirlo y acotar la retención/acceso de los logs en Vercel (decisión
   operativa, va a `docs/despliegue.md`).
2. Mover el secreto del *path* a un intercambio POST + cookie de sesión de
   edición (cambia la spec y el flujo "pega el enlace del WhatsApp").

**Lo dejo señalado para que la etapa de seguridad lo pese explícitamente y el
humano decida**, no lo resuelvo por mi cuenta porque cambiaría la spec.

### B. El "una sola vez" del enlace es por caducidad, no por borrado

Ver §2.1. Ventana de 120 s en la que recargar la confirmación vuelve a mostrar
el enlace al mismo admin. Es una limitación de Next.js (no se puede borrar una
cookie al renderizar), no una elección de comodidad. Alternativa si se quiere
cerrar del todo: un Route Handler `POST /admin/.../quemar-sobre` disparado por
el propio botón — pero exigiría JavaScript de cliente, que el panel prohíbe.

### C. Revisión visual del panel a 390px (tarea 32, parcial)

El guardián de colapso responsivo cubre **superficies públicas**; el modo
edición y su confirmación ya entraron. Las pantallas nuevas **del panel**
(detalle comparativo, confirmaciones, regenerar) quedan para inspección visual
de la etapa de seguridad/test y del humano del PR. La comparación se diseñó
apilada (no en dos columnas fijas) justo por eso.

### D. Deuda heredada que este change NO resuelve

- **El cupo de ediciones vive en la memoria del proceso**, con la misma
  limitación que el de altas (`src/lib/registro/limite-ip.ts`): se reinicia con
  el proceso, no se comparte entre instancias y depende de
  `REGISTRO_ENCABEZADO_IP`. Es un hallazgo declarado en la propuesta, no una
  omisión: moverlo a `IntentoDeCupo` obligaría a tocar el texto publicado del
  aviso de privacidad ("la IP no se guarda en la base").
- **El enlace viaja por WhatsApp**, que no es un canal secreto. Riesgo asumido
  del PRD §6.4; la mitigación es regenerar.

### E. Propuestas fuera de alcance (no construidas, anotadas)

- **El pin del mapa no es editable** porque el formulario de registro no lo
  captura (§2.5). Si algún día T-003 lo agrega, `CAMPOS_EDITABLES` deja de
  compilar y obliga a decidir.
- **La foto no se edita** (§2.4): cuando T-008 mergee, sumarla al modo edición
  es una tarea de ese change o un chore. Hoy `modo="edicion"` oculta el bloque.
- **Historial de ediciones**: la tabla conserva las resueltas por trazabilidad
  y no hay pantalla que las liste, como decidió la propuesta. `EdicionPendiente`
  crece sin poda; con el volumen municipal no es problema, pero conviene
  anotarlo junto a la purga de rechazados de los 90 días.
- **`aplicarEdicion` no avisa si la ficha dejó de estar publicada** entre que el
  admin abrió y aplicó: la edición se marca `aplicada` y la escritura sobre el
  negocio no afecta filas. Es el caso "el admin despublica en otra pestaña y
  aplica en esta"; el desenlace es seguro (la ficha no revive) pero el panel
  dice "Listo, la ficha ya se actualizó". No hay literal en la spec para ese
  caso; lo dejo señalado.

---

## 7. Entorno de pruebas: dos avisos para la siguiente etapa

1. **Este worktree usa su propia base local.** `npm run db:local` levanta
   **una sola** instancia (puerto 51214) que comparten todos los worktrees de
   la máquina, y `npm test` la **reinicia** en cada corrida: dos agentes
   probando a la vez se pisan la base (me pasó: la primera corrida completa se
   quedó colgada porque otro worktree estaba corriendo su suite). Levanté una
   instancia aparte con `npx prisma dev --name t014` y la declaré en `.env`
   (gitignored, con el porqué escrito dentro). **Si la siguiente etapa corre en
   otro worktree, que haga lo mismo.**
2. **`tests/reportes-seguridad-adversarial.test.ts` es intermitente en local**
   (dos tests de carrera: `[A1] de 14 simultáneos…` y `[A2] de 8 simultáneos…`).
   No es de este change —no toqué `src/lib/reportes/`, ni
   `reportar/accion.ts`, ni `src/lib/directorio.ts`— sino la limitación que
   `tests/db.ts` y `docs/despliegue.md` §2 ya documentan: el servidor local
   (PGlite) **multiplexa todas las conexiones sobre una sola sesión**, así que
   14 peticiones simultáneas con el pool de la aplicación (5 conexiones) se
   pisan el protocolo y una responde `bind message supplies N parameters…`.
   **Evidencia:** el mismo archivo pasa 90/90 contra otra instancia local y
   falla 5/5 contra otra; el CI usa `postgres:17` de verdad, donde cada
   conexión tiene su sesión. Los gates de arriba están medidos contra la
   instancia donde la suite completa da **102/102 archivos en verde**.
   Por eso mi propio test de "dos envíos casi simultáneos" ejercita
   `procesarEdicion` con **un solo cliente** (comentado en el test): las dos
   peticiones siguen solapándose de verdad, pero el desenlace lo decide el
   índice único parcial, no el ruido del protocolo.

3. **`.env` de este worktree** (gitignored) trae solo la dirección de la base,
   con un comentario que dice qué agregar para revisar el panel y el modo
   edición a mano en el 3900. **La suite pasa con esas variables puestas y sin
   ellas**: lo comprobé en las dos configuraciones, porque un test que solo
   pasa cuando falta una variable de entorno es un test que miente.

## 8. Nota de proceso (mía, para el validador)

En medio de la investigación de la intermitencia de §7.2 hice un `git stash` /
`git stash pop` para comparar contra la base. **No debí tocar git** y lo
revierto declarándolo: el árbol de trabajo quedó exactamente igual (todo
restaurado y verificado), pero el índice sí cambió en un punto —
`src/components/registro/formulario-registro.tsx` estaba marcado como `UU`
(resto del merge que resolvió el orquestador) y tras el `pop` figura como `M`
normal. **El contenido del archivo no cambió** (conserva `borde-control` del
lote 2 y las props `modo`/`accion`/`textoBoton`). No hubo commits.

## 9. Sin dependencias nuevas

Cero. Todo con `node:crypto`, Prisma y lo que ya tenía el repo.

---

# Iteración 2 — respuesta a la auditoría de seguridad

`reports/c-seguridad.md` dictaminó **NO PASA** con 1 ALTO y 3 medios. Los cinco
puntos que pidió el orquestador están cerrados, **más uno que encontré al
verificar el arreglo del ALTO** (§I2.6) y que rompía un requirement aprobado.

**Gates:** `npm run lint` ✅ · `npm run build` ✅ · `npm test` ✅ **2896
pasando, 2 saltados, 103 archivos** (auditoría: 2878 + 2 en rojo a propósito).
**Los dos tests `[A1]` están en verde**, y con ellos dos guardianes nuevos que
la auditoría no pidió pero que hacen falta (§I2.1).

## I2.1 · ALTO 1 — el token ya no viaja a un tercero por la analítica · CERRADO

**Qué se hizo.** La ruta de edición salió del grupo medido: de
`src/app/(publico)/editar/[token]/` a `src/app/(gestion)/editar/[token]/`, con
`src/app/(gestion)/layout.tsx` propio que **no** monta `<ScriptAnalitica />`.
Es el mismo mecanismo estructural con el que `/admin` quedó fuera de la
medición (design.md §1 de `agregar-analitica-cookieless`), y por eso no hace
falta que nadie recuerde nada: una pantalla nueva del enlace de gestión nace
excluida por vivir ahí.

**Lo que NO cambió, y está comprobado:**

- **Ni una URL.** Un grupo de rutas no es un segmento: `next build` sigue
  listando `ƒ /editar/[token]` y `ƒ /editar/[token]/gracias`.
- **Ni el marco visual.** El layout de `(publico)` solo añadía el script; el
  `<html>`, el `<body>`, el encabezado, el pie y el `<main>` con su ancho
  máximo viven en `src/app/layout.tsx`, de quien esta rama sigue heredando.
- **La medición del resto del sitio.** Hay un test nuevo que lo fija ("el
  layout que sí mide sigue midiendo"), porque "apagar la analítica entera"
  también habría puesto los `[A1]` en verde y habría sido una corrección falsa.

**Verificado sobre el sitio servido** (`curl` al 3900 con las variables de la
analítica puestas): la página de edición trae **cero** apariciones de `umami` y
ningún `<script src>` que no sea del propio `/_next/`.

**Sobre los dos tests que la auditoría dejó en rojo.** Los dos importaban la
página desde su ruta vieja y la envolvían **explícitamente** en `LayoutPublico`,
así que al mover la ruta no se habrían puesto verdes solos: se habrían roto por
"módulo no encontrado". Los reescribí conservando su intención y **subiendo la
exigencia**, porque la propiedad que importa no es dónde está el archivo:

1. `[A1] ningún layout que envuelve a %s inyecta la analítica` (×2, nuevo) —
   recorre la **cadena real de layouts** desde el archivo de la página hasta
   `src/app`, y comprueba que ninguno monta el tracker. Sigue mordiendo si
   mañana alguien mueve la ruta a un grupo medido, crea un layout intermedio
   con el script, o se lo agrega al de `(gestion)`. Comprueba además que la
   cadena existe, para que no pase por vacío.
2. Los dos originales, ahora contra el layout que de verdad envuelve la ruta.

Un ajuste de aserción que hay que declarar: el original exigía **ningún**
`<script>` en la pantalla de edición, y eso no se puede cumplir ni en el mundo
ideal — esa pantalla tiene un `<form>` con Server Action y React emite un script
**en línea** para reproducir el envío al renderizar fuera del runtime de Next.
Se cambió por lo mismo que ya afirma el guardián del panel: ningún
`<script src=…>` (que es lo que carga a un tercero), ni `umami`, ni
`data-website-id`. En la confirmación, que no tiene formulario, se conservó el
"ni un `<script>`".

**Dos guardianes existentes enmendados a conciencia** (los dos por la misma
causa: buscaban texto y confundían la EXPLICACIÓN con el defecto, porque los
layouts documentan por qué no montan el tracker):

- `analitica-exclusion-admin` › "el script se renderiza desde un único
  archivo": ahora mira el código **sin comentarios**. Lo que afirma es idéntico.
- `analitica-adversarial` › "toda página vive o en `(publico)` o en `/admin`":
  la frontera dejó de tener dos lados. Ahora es una **lista de raíces excluidas
  con su porqué escrito** (`/admin/` y `/(gestion)/`), más un test nuevo que
  comprueba que cada raíz excluida **lo está de verdad** (su layout no monta el
  script) y que sigue teniendo páginas — una lista con una excepción muerta
  deja de ser una excepción.

## I2.2 · MEDIO 1 — una edición ya no se declara aplicada si no se aplicó · CERRADO

**El orden dentro de la transacción se invirtió** (`src/lib/gestion/ediciones.ts`):
primero se escribe la ficha, condicionada a que siga publicada, y **solo si esa
escritura afectó una fila** se cierra la edición. Si no, se devuelve el
desenlace nuevo `ficha-no-publicada`, no se toca nada y **la edición sigue
`pendiente`**: los cambios del dueño no se pierden y vuelven a estar
disponibles en cuanto la ficha regrese al directorio.

La otra mitad del problema es la simétrica: si la edición deja de ser la
pendiente **dentro** de la transacción, ahora se lanza un error centinela
(`EdicionYaNoPendiente`) para **revertir** la escritura que ya se hizo sobre la
ficha. Es la única forma de que las dos condiciones se cumplan o ninguna; con
un `return` la ficha se habría quedado escrita y la edición sin cerrar.

**Literal nuevo** (la auditoría lo pedía explícitamente: "no hay literal en la
spec para ese caso: hace falta uno"), marcado como copy propuesto:

> `MENSAJE_EDICION_FICHA_NO_PUBLICADA` — "No se aplicó nada: esta ficha ya no
> está publicada. Los cambios siguen esperando; vuelve a publicarla y
> aplícalos."

Dice las tres cosas en orden: qué NO pasó, por qué, y que nada se perdió. La
acción redirige a `?errorAplicar=no-publicada` y el detalle lo pinta.

**Tests:** `si la ficha dejó de estar publicada no se aplica nada y la edición
sigue esperando` y `al volver a publicar la ficha, esos mismos cambios se pueden
aplicar` (`gestion-panel`). El `[M1]` de la auditoría, que toleraba las dos
formas, ahora entra por la rama corregida.

## I2.3 · MEDIO 1b — un negocio, un renglón · CERRADO

`obtenerColaDeRevision` **deduplica**: una edición no abre renglón si su negocio
ya está en la cola por sí mismo (está `en_revision` porque el admin lo
despublicó). Lo que el admin tiene enfrente entonces es la ficha bajada, y hasta
que no la vuelva a publicar esos cambios **no se pueden aplicar** (§I2.2), así
que mostrarlos era una cola que mentía sobre cuánto trabajo hay y que empujaba
al admin justo al callejón del M1.

La edición no se toca ni se pierde: sigue `pendiente` y reaparece con su reloj
intacto en cuanto la ficha vuelve al directorio (hay test de las dos mitades).

**Detalle de implementación que importa:** se deduplica contra las altas que la
misma consulta ya leyó, **sin nombrar ningún estado**. Así el filtro de
visibilidad del directorio sigue viviendo en un solo sitio y el guardián de
`tests/directorio-consultas.test.ts` no necesitó otra excepción — que era el
riesgo obvio de resolver esto con un `where: { negocio: { estado: publicado } }`.

## I2.4 · MEDIO 2 — `%00` responde 404, no 500 · CERRADO

`obtenerEdicionParaPanel` filtra el byte nulo en el borde con `tieneByteNulo`,
el mismo criterio (y el mismo comentario) que `extraerIdDeSegmentoFicha` en lo
público. **Y también `obtenerRegistroParaPanel`**, que tenía el mismo agujero
desde antes de este change: la auditoría lo señaló al mirar la superficie nueva
y dejar una de las dos puertas abierta habría sido peor que no haberlo mirado.

**Tests:** cinco identificadores hostiles en `/admin/ediciones/<id>` (byte nulo,
vacío, 100 KB, comillas de SQL) y uno en el detalle de un registro; todos
responden "no encontrado".

## I2.5 · MEDIO 3 — riesgo asumido, documentado · CERRADO (solo documentación)

`docs/despliegue.md` estrena **§8.1 "Los logs de ejecución y el enlace de
gestión — RIESGO ASUMIDO"**: qué pasa, por qué no se arregla en el código (las
tres alternativas revisadas y por qué ninguna cierra el hallazgo sin cambiar la
spec), y **las dos condiciones operativas de la decisión, que no son
opcionales**:

1. **No se configuran Log Drains en Vercel** — un drain convertiría un dato de
   vida corta, visible solo para el admin, en un depósito permanente de
   credenciales de gestión en manos de un tercero. Si algún día hace falta
   observabilidad, primero se resuelve cómo enmascarar `/editar/*`.
2. **El acceso al proyecto de Vercel se limita al admin, con 2FA.** La
   equivalencia que sostiene la decisión —"quien lee esos logs ya podía
   regenerar cualquier enlace desde el panel"— deja de ser cierta en cuanto se
   invite a alguien más, y eso obliga a volver a pesarlo.

Más la entrada 9 en §10 (deuda conocida del despliegue) y la nota en §8 de que
el modo edición no se mide y por qué. También se explica ahí por qué
`data-exclude-search="true"` no habría bastado.

## I2.6 · HALLAZGO PROPIO — el envío sin JavaScript respondía **500** · CORREGIDO

Esto no lo pidió nadie: salió de verificar el arreglo del ALTO 1 leyendo
`src/app/admin/layout.tsx`, que documenta un defecto idéntico que este repo ya
había pagado (hallazgo A-2 de la etapa C de `agregar-analitica-cookieless`).

**El defecto.** Las dos pantallas del modo edición declaraban
`referrer: "no-referrer"` (la letra de design.md §4). Con esa política el
navegador manda **`Origin: null`** en los POST de navegación, y Next aborta toda
Server Action cuyo `Origin` no case con el host. Es decir: **el formulario de
edición respondía 500 sin JavaScript de cliente**, que es exactamente el camino
que la spec tiene prometido —"la edición funciona sin JavaScript",
requirement aprobado de `registro-negocio`— y el del dueño que abre su enlace
desde un celular con mala red. Con JS hidratado el envío va por `fetch` y
sobrevive, así que el defecto no se ve por la vía normal.

**Medido con `curl` contra el sitio servido, antes y después:**

| Envío sin JS | Antes (`no-referrer`) | Después (`strict-origin`) |
|---|---|---|
| `Origin: null` (lo que mandaba el navegador) | **500** | (el navegador ya no manda `null`) |
| `Origin` correcto | 303 → `/gracias` | **303 → `/gracias`**, y la edición **queda guardada** |

**El arreglo** es la decisión que este repo ya ratificó para el panel, aplicada
a una situación idéntica: `referrer: "strict-origin"`, y **en el layout del
grupo** en vez de en cada página, para que cubra también las pantallas que se
agreguen. La fuga sigue cerrada: `strict-origin` manda solo el origen pelado
(`https://sitio/`), **nunca `/editar/<token>`**, así que el scenario "el token
no se va en el `Referer`" se cumple igual de bien; lo que no se cumple es la
letra del requirement ("no se manda `Referer` a ningún destino"), que en su
forma literal es incompatible con "la edición funciona sin JavaScript".

**Para el humano:** es la misma tensión que la spec del panel ya resolvió con
el mismo valor y por el mismo motivo, así que no estoy inventando un diseño;
pero **la letra de design.md §4 conviene enmendarla** al archivar el change, para
que diga "no se manda la RUTA en el `Referer`" y nadie vuelva a "endurecerlo".

**Guardián:** el modo edición entra al guardián que el repo ya tenía para el
panel (`analitica-exclusion-admin`), con sus mismas listas de políticas
aceptables y prohibidas —`no-referrer` está explícitamente entre las
prohibidas, con el motivo al lado— más un test de que el layout **deja escrito
el porqué**, para que el siguiente que pase no lo "endurezca" y vuelva a
romperlo.

## I2.7 · Lo que NO se tocó, y por qué

- **BAJO 1 (byte nulo en un campo de texto libre del envío).** El arreglo
  natural es `sinBytesNulos` en `leerEnvioRegistro`, pero ese módulo es el
  **borde compartido con el registro público**, cuya spec no es la de este
  change. No estaba entre lo asignado y el desenlace de hoy ya es seguro (no
  hay 500, no se filtra detalle técnico, la transacción revierte y la edición
  anterior queda intacta). **Queda como deuda declarada**, con su test ya
  escrito por la auditoría tolerando las dos formas.
- **Las cinco superficies de abuso señaladas** por la auditoría (§"Superficies
  de abuso"): son observaciones sin spec, ya declaradas. La 4 —
  `EdicionPendiente` crece sin poda, y es retención sin plazo declarado
  (LFPDPPP)— es la que conviene subir al backlog junto a la purga de los 90
  días; ya estaba en el §6.E de este reporte y la auditoría la confirma.
