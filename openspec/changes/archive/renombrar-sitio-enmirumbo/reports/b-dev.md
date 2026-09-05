# Etapa B (dev) — renombrar-sitio-enmirumbo (T-019)

**Rama:** `feature/renombrar-sitio-enmirumbo` (worktree `.claude/worktrees/wt-t019`)
**Base:** `origin/main` tal cual — **T-014 NO estaba mergeado** cuando arrancó esta etapa.
**Etapa A (ui):** no hubo. El change no crea pantallas; cambia literales.

## 1. Censo de arranque (tarea 0.1, replanteada)

La tarea pedía rebasar sobre `main` con T-014 ya dentro. No se pudo: T-014 sigue por
mergear (instrucción del orquestador: no integrar nada suyo). El censo se corrió igual
sobre la base real, y **el barrido posterior al merge de T-014 lo hace la etapa D con el
guardián de la tarea 6.1** — que es exactamente la red que design.md §4 previó para no
depender de que alguien se acuerde de mirar.

Censo inicial de `NecesitoUno`/`necesitouno` (sin distinguir mayúsculas), **excluyendo
la historia** (`docs/devlog/`, `docs/decisiones/`, tickets cerrados,
`openspec/changes/archive/`, `docs/metricas-pipeline.md`):

| Superficie | Archivos | Notas |
|---|---|---|
| `src/` | 12 archivos, 27 líneas | header, footer, OG, globals.css, layout, buscar, admin, `seo/metadata`, `admin/textos`, `enlaces`, `legales/textos`, `registro/textos`, `prisma.ts` |
| `tests/` | 32 archivos | 11 fijaban el literal de marca; el resto usaba `necesitouno.example` / `necesitouno` como dominio y base **ficticios** |
| Infra | `.env.example`, `.github/workflows/ci.yml`, `package.json` | `SITIO_URL` de ejemplo y nombre de la base local/CI |
| Docs vivos | README, PRD (6), CLAUDE.md, `openspec/project.md`, despliegue (12), estrategia (5), backlog, proceso, revision-visual-pendiente | |
| `prisma/` | 0 | confirmado: el esquema, las migraciones y los seeds no contienen la marca |

Literales nuevos que T-014 sumará (no tocados aquí, para la etapa D): mensaje de
publicación con enlace de gestión, "Perdí mi enlace", avisos de edición aprobada/rechazada
y las pantallas nuevas del panel (design.md §4).

## 2. Mapa scenario → prueba

### `layout-base`

| Scenario | Prueba |
|---|---|
| header con el wordmark | `tests/layout.test.ts` · "el header lleva el wordmark \"EnMiRumbo\" y ya NO el posicionamiento \"Tizayuca\"" |
| el posicionamiento hiperlocal sigue visible fuera del header | `tests/layout.test.ts` · "el footer identifica al sitio como \"EnMiRumbo\", sin la localidad pegada" + los casos ya existentes del `h1` de la home |
| la línea de cierre del footer no cambió con el rebrand | `tests/layout.test.ts` · "la línea de cierre del footer sigue palabra por palabra como estaba" |
| footer con los enlaces legales y sin enlaces muertos | `tests/layout.test.ts` · describe "footer sin enlaces muertos" (sin cambios) |
| los enlaces del footer se pueden tocar en el celular | `tests/layout.test.ts` · "áreas táctiles ≥44px" (sin cambios) |
| documento en español de México con metadata | `tests/layout.test.ts` · "el documento declara lang es-MX" (sin cambios) |
| la home conserva el título del sitio | `tests/seo-metadata.test.ts` · "declara el título del sitio como default y la plantilla con la marca"; `tests/layout.test.ts` · "título y descripción son los literales aprobados" |
| una página con título propio lleva la marca al final | mismas dos (plantilla `%s — EnMiRumbo`) |
| la ficha compartida por WhatsApp llega con la marca nueva | **parcialmente automatizado.** El texto alternativo y la identidad de la vista previa: `tests/seo-artefactos.test.ts` · "declara tamaño, tipo y texto alternativo en español"; `tests/marca-guardian.test.ts` cubre que ningún literal de `src/` (incluido `opengraph-image.tsx`) traiga la marca vieja ni la compuesta. **El wordmark DIBUJADO —que "Tizayuca" se lea como línea de contexto debajo y no como apellido— no está automatizado y queda declarado como verificación de ojo humano** (§5): comprobarlo exigiría rasterizar la `ImageResponse` y compararla, que no vale lo que cuesta |
| URL base declarada / producción sin URL pública | `tests/seo-metadata.test.ts` (sin cambios) |
| sin JS de cliente en el layout / el único script es el de la medición | `tests/layout.test.ts`, `tests/analitica-*.test.ts` (sin cambios) |
| **un literal nuevo trae la marca vieja** | `tests/marca-guardian.test.ts` · "el código de las superficies del sitio está limpio" + mutación "un literal con la marca prohibida deja la verificación en rojo" (casos `NecesitoUno` y `necesitouno.mx`) |
| **alguien vuelve a pegarle la localidad a la marca** | `tests/marca-guardian.test.ts` · misma mutación, caso `EnMiRumbo Tizayuca` |
| **las páginas legales tampoco la nombran en su metadata** | `tests/marca-guardian.test.ts` · describe "las páginas legales y el panel usan la marca vigente en su metadata" (8 literales: título/nombre del sitio, aviso, términos, buscador, panel) |
| **la historia del repositorio se queda como está** | `tests/marca-guardian.test.ts` · "los devlogs, los ADR y los changes archivados siguen nombrando la marca anterior, y el guardián pasa igual" |

### `paginas-legales`

| Scenario | Prueba |
|---|---|
| el dueño abre el aviso de privacidad / la versión que se muestra es la vigente | `tests/legales-paginas.test.ts` (derivan de `VERSION_AVISO`, no del número escrito a mano) |
| el texto publicado es el aprobado (aviso y términos) | `tests/legales-paginas.test.ts` · "/aviso-de-privacidad dice exactamente lo que aprobó la spec" y su gemela de `/terminos` |
| **el aviso nombra al sitio con la marca vigente** | `tests/legales-paginas.test.ts` · "el aviso presenta al sitio con el descriptor y después lo llama por su nombre" |
| **los términos nombran al sitio con la marca vigente** | `tests/legales-paginas.test.ts` · "los términos abren con el descriptor y siguen con la marca sola" |
| (regla de marca, refuerzo) | "en %s no queda ni la marca anterior ni la forma compuesta" y "el descriptor aparece una sola vez en cada documento: es la primera mención" |
| la versión vigente es `2` | `tests/aviso-version.test.ts` · "la versión vigente es una cadena no vacía y hoy vale 2" |
| una sola fuente de la versión | `tests/aviso-version.test.ts` · "el identificador solo se escribe una vez" (deriva el patrón de `VERSION_AVISO`) |
| alguien edita el aviso y no sube la versión | `tests/aviso-version.test.ts` · prueba por mutación (7 casos) |
| se estrena versión junto con el texto | "subiendo la versión y anclando la huella nueva vuelve a pasar" (ahora usa la `3` como siguiente) |
| versión sin huella | "subir la versión sin anclar su huella también falla" |
| el guardián no se pisa con los placeholders / retirar la marca de borrador estrena versión | mutaciones ya existentes (sin cambios) |
| **la mecánica completa, bajo ataque** (campo oculto hostil, homóglifos de la versión, reaceptación fabricada, evasión de la huella, escape en el panel) | **`tests/aviso-version-seguridad-adversarial.test.ts`** — la suite adversarial de la infraestructura de evidencia legal, **664 líneas**. Este mapa la omitía en la primera vuelta y esa omisión fue la causa directa de MEDIO-1 y MEDIO-2 (dos casos suyos se quedaron mudos al estrenar la `2`); ver §8 |
| (idem, añadida por la etapa C) | `tests/rebrand-seguridad-adversarial.test.ts` — 61 casos: huella de la `1` como evidencia, la `2` recalculada aparte, orden de versiones con 12 disfraces, reaceptación contra la base, rendijas del guardián de marca, correo y datos del responsable, mensajes de WhatsApp con nombres hostiles |
| **la huella de la versión 1 sobrevive al rebrand** | `tests/aviso-version.test.ts` · "la tabla tiene dos renglones y el de la versión 1 es el de siempre" |
| **una constancia vieja no se reescribe** | `tests/admin-paginas.test.ts` · "una constancia de antes del rebrand sigue mostrando la versión 1" |
| **el formulario abierto antes del despliegue no se guarda a ciegas** | `tests/registro-accion.test.ts` · caso `["la versión anterior al rebrand", "1"]`; `tests/registro-validacion.test.ts` · `it.each(["", "0", "1", "3", …])` |
| **el rebrand no le pide nada al negocio ya publicado** | **automatizado en dos tramos** (era "por razonamiento"; MEDIO-3 de la etapa C): (1) *no hay migración* → `tests/aviso-version.test.ts` · "ninguna migración reescribe las constancias ya guardadas" (ningún `UPDATE`/`INSERT INTO`/`DELETE FROM`/`COPY` a principio de sentencia en `prisma/migrations/`, y este change no agregó ninguna); (2) *un reenvío no le toca la constancia a una ficha publicada* → `tests/rebrand-seguridad-adversarial.test.ts` · "un envío contra una ficha publicada no le actualiza la constancia al rebrand" (contra la base). Lo que queda por razonamiento —y ya estaba probado— es que no existe emisor automático de mensajes (PRD §6.6) |
| el domicilio del responsable todavía no existe | `tests/legales-paginas.test.ts` · "los datos que faltan se leen entre corchetes" (ya sin el correo) |
| **el correo ya no es un placeholder** | `tests/legales-paginas.test.ts` · "el correo del directorio se publica completo, sin corchetes ni nota de pendiente" (las tres apariciones) + `tests/legales-textos.test.ts` · "los cinco datos que solo puede dar el humano están en la lista" |
| marca de borrador visible | `tests/legales-paginas.test.ts` (sin cambios) |
| **publicar el correo no retira la marca de borrador** | `tests/legales-paginas.test.ts` · "con el correo ya publicado, las dos páginas siguen en borrador" |
| los pendientes son verificables | `tests/legales-paginas.test.ts` y `tests/legales-textos.test.ts` (enmendados: el correo del directorio se descuenta antes de buscar direcciones inventadas) |
| los pendientes operativos / ARCO acotado / purga / el texto no cambia por automatismos | `tests/legales-textos.test.ts` (sin cambios) |
| deslinde de la operación / alcance del sello | `tests/legales-paginas.test.ts` (con la marca nueva dentro) |

### `registro-negocio`

| Scenario | Prueba |
|---|---|
| **el aviso simplificado nombra al sitio con la marca vigente** | `tests/registro-pagina.test.ts` · literal completo de `TEXTO_AVISO_PRIVACIDAD` |
| la versión está a la vista antes de aceptar | `tests/registro-pagina.test.ts` (deriva de `VERSION_AVISO` → hoy "versión 2") |
| aviso visible sin salir del formulario / advertencia de lo público / enlace al integral / sin checkbox no hay envío / constancia | sin cambios |

### `revision-admin`

| Scenario | Prueba |
|---|---|
| abrir la conversación de verificación | `tests/admin-textos.test.ts` · "verificación, con el nombre del negocio interpolado" (literal completo con descriptor) |
| aviso de publicación | `tests/admin-textos.test.ts` · "aviso de publicación, con el nombre y el link de la ficha" |
| aviso de rechazo por WhatsApp | `tests/admin-textos.test.ts` · "aviso de rechazo, con el nombre y el motivo" |
| aviso de despublicación | `tests/admin-textos.test.ts` + `tests/admin-despublicar-borrado.test.ts` (literal completo) |
| **se recorren todos los mensajes del panel** | `tests/admin-textos.test.ts` · describe "ningún mensaje del panel usa la marca anterior" (los cuatro) + "solo el de primer contacto lleva el descriptor geográfico" |
| número que no se puede interpretar / sin enlace de gestión / la pantalla no se abre sobre un alta nueva | sin cambios |

### `directorio-publico`

| Scenario | Prueba |
|---|---|
| **el vecino escribe desde una tarjeta del listado** | `tests/directorio-enlaces.test.ts` · "usa el mensaje prellenado aprobado, tal cual" |
| **el vecino escribe desde la ficha (mismo mensaje)** | `tests/directorio-enlaces.test.ts` · "las superficies del directorio arman el enlace con la única función que lo sabe" (las tres superficies usan `construirEnlaceWhatsapp` y ninguna se escribe su propio literal) |
| (el mensaje no lleva datos del vecino) | `tests/directorio-enlaces.test.ts` · "el mensaje no lleva ningún dato del vecino" |

## 3. Decisiones técnicas

1. **El guardián vive en `tests/marca-guardian.test.ts` y su ámbito es `src/`, punto.**
   Recorre todos los archivos (no solo `.ts`/`.tsx`: también `globals.css`), salta
   `src/generated` (cliente de Prisma) y reporta **archivo y línea**. Se prueba por
   mutación contra un `src/` de mentira en un directorio temporal: si se probara con una
   copia de la lógica no probaría nada. La historia queda fuera **y el propio guardián lo
   comprueba**: un caso verifica que devlogs, ADR y changes archivados siguen diciendo
   "NecesitoUno" (si dejaran de decirlo, alguien reescribió la historia) y que aun así la
   verificación pasa.
2. **`TITULO_PANEL` es nuevo** (`src/app/admin/page.tsx`). El título del panel estaba
   escrito dentro del objeto `metadata`; se extrajo a una constante exportada para que el
   guardián lo lea sin adivinarlo. Cero cambio de comportamiento.
3. **`CORREO_DEL_DIRECTORIO`** sustituye a `CORREO_ARCO_PLACEHOLDER` y
   `CORREO_CONTACTO_PLACEHOLDER`, que desaparecen. `PLACEHOLDERS_LEGALES` pasa de siete a
   **cinco** y `HAY_PLACEHOLDERS_PENDIENTES` sigue en `true` sin tocar nada: la marca de
   borrador se queda sola, que es lo que la spec pide.
4. **Orden de operaciones respetado** (design.md §1): primero todos los literales del
   aviso, del simplificado y de la casilla y la sustitución de los correos; después
   `VERSION_AVISO = "2"`; al final la huella que imprimió el fallo. La huella de la `1` no
   se tocó — **es el primer caso real en que esa regla se aplica**, porque su texto ya no
   se publica y aun así sigue amparando las constancias que la citan.
   Huella anclada de la `2`: `1f3349078d0a1e938d2e46794c67f1fc1a976a85e9e2b5d0eb55ad6e79657ee0`.
5. **Tres pruebas existentes usaban la `2` como "versión que no es la de hoy"** y dejaron
   de decir la verdad al estrenarla: en `aviso-version` la siguiente pasa a ser la `3`, y
   en `registro-validacion` la `2` sale de la lista de versiones desfasadas y entran la
   `1` (la real, la del formulario abierto antes del despliegue) y la `3`.
6. **Los dominios ficticios de las pruebas también se renombraron**
   (`necesitouno.example` → `enmirumbo.example`, bases `necesitouno` → `enmirumbo`). No es
   superficie servida, pero la tarea 10.1 pide que la marca vieja solo quede en la
   historia, y el repo es público. **Se dejaron intactas** las líneas que usan el patrón
   `/necesitouno/i` como aserción: son las que comprueban que la marca vieja no está.
7. **La imagen Open Graph pasa de fila a columna.** Antes el wordmark y "Tizayuca" iban en
   la misma línea con `alignItems: baseline` y se leían como un nombre compuesto — justo el
   patrón descartado. Ahora "Tizayuca" va debajo, a 44px contra los 84 del wordmark.
8. **Ninguna dependencia nueva.** Ninguna abstracción de marca configurable (design.md §3):
   los literales se cambian donde están y `NOMBRE_DEL_SITIO` se sigue usando solo donde ya
   se usaba.
9. **Versión del PRD:** se agregó la entrada "Cambios v1.0 (2026-09-04)" al registro de
   cambios, pero **no se tocó la línea `**Versión:** 0.8`** de la cabecera — v0.9 tampoco
   la tocó, y mover la versión del PRD es del fundador, no de esta etapa.

## 4. Lectura en voz alta de las tres primeras menciones (tarea 4.4)

Antes de anclar la huella, las tres frases donde el descriptor puede sonar forzado:

- **Aviso:** "…qué datos nos das cuando registras tu negocio en EnMiRumbo, el directorio de
  negocios de Tizayuca, para qué los usamos…". Se lee bien; el inciso queda entre comas y
  no obliga a releer. La frase ya tenía esa cadencia con el nombre viejo.
- **Términos:** "Estas son las reglas de EnMiRumbo, el directorio de negocios de Tizayuca,
  para los negocios que se registran y para los vecinos que los buscan.". Aquí van dos
  incisos seguidos ("…de Tizayuca, para los negocios…") y es lo más apretado de los tres;
  aun así el original ya decía "…de NecesitoUno Tizayuca, para los negocios…", así que la
  pausa es la misma y el sentido no se pierde.
- **Verificación (WhatsApp):** "Hola, te escribo de EnMiRumbo, el directorio de negocios de
  Tizayuca. Recibimos el registro de «X»…". **Mejora**: el texto anterior decía "el
  directorio de negocios del municipio", que era más vago; nombrar Tizayuca en el primer
  contacto con un negocio local es exactamente lo que hace creíble el mensaje.

## 5. Verificaciones manuales pendientes o hechas a ojo

| Qué | Estado |
|---|---|
| **Tarea 4.5 — el buzón `contacto@enmirumbo.com` recibe de verdad** | **PENDIENTE DEL FUNDADOR.** Esta etapa no puede confirmarlo. El texto legal ya lo publica, así que **el sitio no debe desplegarse hasta que el reenvío esté activado en el registrador**. Se dejó como paso obligatorio en la prueba de humo (`docs/despliegue.md` §9, punto 8-bis) y la tarea sigue sin marcar |
| **Tarea 10.2 — revisión visual a 390px** | **PENDIENTE** (no hay navegador en este entorno). Razonamiento previo: "EnMiRumbo" tiene **9 caracteres contra 11** del anterior, con exactamente el mismo estilo (`text-xl font-bold tracking-tight`) dentro de un `max-w-3xl px-4`, así que no puede desbordar donde el anterior no desbordaba. Lo que sí conviene mirar con ojo humano es el **ritmo tipográfico de las dos mayúsculas internas** (`M`, `R`), que es una decisión de gusto y no de layout |
| **Wordmark DIBUJADO en la imagen Open Graph** (scenario "la ficha compartida por WhatsApp llega con la marca nueva") | **PENDIENTE DE OJO HUMANO, declarado.** Automatizado: el `alt`, el tamaño, el tipo, la ausencia de hexadecimales sueltos y la ausencia de marca vieja/compuesta en el literal. **No automatizado a propósito:** que "Tizayuca" se *lea* como línea de contexto debajo del wordmark y no como apellido. Comprobarlo exige rasterizar la `ImageResponse` y comparar píxeles —una dependencia nueva y una prueba frágil— para verificar una decisión tipográfica. Se mira abriendo `/opengraph-image` una vez, junto con la tarea 10.2 |

## 6. Gates

| Gate | Resultado |
|---|---|
| `npm run lint` | **verde**, sin salida |
| `npm run build` | **verde**, compilación limpia, sin advertencias nuevas |
| `npm test` | **2768 pasan · 1 falla · 2 omitidas (98 archivos)** tras la segunda vuelta (eran 2704 antes de la etapa C y de los arreglos de §8). La única falla es `[A1]` de `tests/reportes-seguridad-adversarial.test.ts`, **preexistente y no determinista**: en la corrida de partida —antes de tocar nada— fallaban `[A1]` y `[A2]`; corriendo ese archivo solo falló `[A2]`; a la etapa C le pasaron las dos. Son carreras del motor local y van verdes en CI |

Base de pruebas propia: `prisma dev --name t019`, puerto **51238** (no se usó 51214 ni las
bases de T-014/T-016/T-018/tls). `DATABASE_URL` en el `.env` del worktree (ignorado por git).

## 7. Censo final (tarea 10.1)

La marca anterior **solo** aparece en:

- la historia, intacta: `docs/devlog/`, `docs/decisiones/`, tickets cerrados,
  `openspec/changes/archive/`, `docs/metricas-pipeline.md` (`git status` no toca ninguna
  de esas rutas — tarea 9.7 confirmada);
- `.claude/agents/*.md`, **fuera de alcance por decisión del orquestador**;
- los propios deltas de este change y `openspec/specs/*`, que **consolida la etapa de
  cierre** tras el merge, no esta;
- el registro de cambios v0.7 del PRD y la nota de rebrand v1.0 que la cita para decir que
  se retiró;
- la instrucción de migración de `docs/despliegue.md` (`prisma dev stop necesitouno`);
- las pruebas que comprueban que la marca vieja **no** está (`not.toMatch(/necesitouno/i)`)
  y el guardián, que la lleva dentro por definición.

La forma compuesta "EnMiRumbo Tizayuca" no aparece en ninguna superficie: solo en los
deltas del change, en la nota del PRD que la prohíbe y en el guardián que la persigue.

## 8. Segunda vuelta: los tres MEDIO de la etapa C, cerrados

La auditoría dictaminó **PASA** (0 críticos, 0 altos). Los tres MEDIO eran higiene de
pruebas y quedan cerrados aquí. **Ninguno tocó código de producto:** el único archivo de
`src/` que se abrió en esta vuelta fue para revertir una mutación de prueba.

### MEDIO-1 — la regresión del rollback estaba muda

`tests/aviso-version-seguridad-adversarial.test.ts` sembraba la constancia con `"2"`
escrito a mano, de cuando la vigente era la `1`. Al estrenar la `2`, esa siembra pasó a
ser **la vigente misma**, así que `versionAvisoEsPosterior` salía siempre por la rama de
"iguales" y nunca por la de "posterior" — que es exactamente la que arregló el hallazgo
MEDIO-3 de T-012. El caso seguía verde sin ejercitar nada.

Ahora la constancia se deriva: `VERSION_POSTERIOR` = vigente + 1. El caso además **fija su
propia premisa** antes de sembrar (`versionAvisoEsPosterior(constancia, vigente) === true`
y el recíproco `false`), de modo que si algún día dejara de describir un rollback se
pondría en rojo en vez de callarse.

**Verificado por mutación, no por lectura.** Reintroduje el bug original en
`src/lib/legales/version.ts:78` (`>` → `!==`):

```
tests/aviso-version-seguridad-adversarial.test.ts → 1 fallo:
  "tras un rollback, la vigente más VIEJA que la constancia no deja reaceptación"
```

Antes de este arreglo esa misma mutación dejaba la suite **verde** (así lo documentó la
etapa C). Mutación revertida; `git diff src/lib/legales/version.ts` vuelve a mostrar solo
los 9 renglones de comentario del rebrand.

### MEDIO-2 — los homóglifos disfrazaban una versión que ya no era la vigente

La tabla estaba anclada a `"1"` (`"１"`, `"1\u200b"`, `"¹"`, `"%31"`, `'{"version":"1"}'`…).
Con la vigente en `"2"` el caso pasaba por la vía trivial y dejó de cubrir el ataque que le
da nombre: colar algo que *se parece* a lo que el dueño tuvo enfrente.

Ahora la tabla la construye `disfracesDeLaVigente(VERSION_AVISO)`, que transforma la
versión vigente dígito a dígito (`conAlfabeto` con los alfabetos de ancho completo y de
exponentes, `percentEncoded`). Añadidas dos redes para que no vuelva a degradarse en
silencio:

- cada caso asegura `disfraz !== VERSION_AVISO` **antes** de atacar — si un disfraz
  coincidiera con la vigente, el `it` estaría probando el camino feliz;
- un caso nuevo, "los disfraces se derivan de la versión vigente, no de un número escrito
  a mano", comprueba que las tres transformaciones dependientes del dígito **cambian** con
  la versión (si no cambiaran, "derivarlas" sería decorativo) y fija `%32`/`%31`.

**Los invisibles van como secuencias de escape** (`\u200b`, `\u0000`, `\uff10…`, `\u2070…`): un homóglifo pegado tal cual no se ve en el diff, y lo que no se ve no se
revisa. Al pasar por el editor se habían colado literales; se reescribieron a escapes.

### MEDIO-3 — el mapa scenario→prueba

- §2 (`paginas-legales`) gana **dos renglones**: `tests/aviso-version-seguridad-adversarial.test.ts`
  —con la nota de que omitirlo fue la causa directa de MEDIO-1 y MEDIO-2— y
  `tests/rebrand-seguridad-adversarial.test.ts` de la etapa C.
- Scenario **"el rebrand no le pide nada al negocio ya publicado"**: pasó de "por
  razonamiento" a **automatizado en sus dos tramos**. El que faltaba —*no hay migración*—
  es nuevo: `tests/aviso-version.test.ts` · "ninguna migración reescribe las constancias ya
  guardadas" recorre `prisma/migrations/` y falla ante cualquier `UPDATE`, `INSERT INTO`,
  `DELETE FROM` o `COPY` **a principio de sentencia** (anclado así a propósito: `ON UPDATE
  CASCADE` y `ON DELETE CASCADE` son definición de esquema, no escritura de datos, y las
  migraciones están llenas de ellas), y además fija que este change no agregó ninguna
  migración. Es la red contra un backfill que reescribiera constancias de la `1` a la `2`:
  evidencia legal falseada con la firma del titular encima.
- Scenario **"la ficha compartida por WhatsApp llega con la marca nueva"**: declarado
  explícitamente como **parcialmente automatizado**, con el wordmark dibujado como
  verificación de ojo humano y la razón de no automatizarlo escrita (§5).

### BAJO-4 (el barato) — ticket abierto con la marca vieja

`docs/tickets/T-017-localidad-configurable.md` decía "la marca NecesitoUno" y
"NecesitoUno Pachuca". Es un ticket **abierto** que describe trabajo futuro, no historia
fechada, y el repo es público. Actualizado: la marca es EnMiRumbo y el ejemplo de segunda
instancia pasa a usar el **descriptor** ("EnMiRumbo, el directorio de negocios de
Pachuca"), que es justo la regla que T-019 fija y que T-017 tendrá que respetar.

### Los otros bajos, y por qué no se tocan aquí

- **BAJO-1** (el guardián no mira `prisma/` ni `public/`): la etapa C ya lo dejó fijado por
  prueba y ella misma lo declara fuera de alcance de este change. Sumarlos a
  `RAICES_VIGILADAS` es la propuesta, y sigue en §9.
- **BAJO-2** (el guardián de huella solo protege el renglón vigente): mitigado por la
  prueba de la etapa C, que fija el renglón de la `1` sin mirar el largo de la tabla.
- **BAJO-3** (deriva de base con `main`): es del validador — rebasar y **rehacer el censo
  de `docs/` a mano**, porque el guardián no mira `docs/` y no lo caza ninguna prueba.

## 9. Deuda y propuestas fuera de alcance

1. **El barrido post-merge de T-014** (design.md §4) queda para la etapa D: correr la suite
   sobre `main` con T-014 dentro y dejar que `tests/marca-guardian.test.ts` liste lo que
   falte. En particular hay que revisar **el mensaje de aviso de publicación** —si T-014 lo
   reescribió para incluir el enlace de gestión, manda su texto y solo se sustituye la
   marca— y **el mensaje de "Perdí mi enlace"**, que casi seguro se presenta con el nombre
   del sitio.
2. **El guardián no alcanza `docs/` ni `openspec/specs/`.** Se acotó a `src/` como manda la
   spec. Consecuencia real: un devlog futuro puede escribir "EnMiRumbo Tizayuca" sin que
   nadie lo note. Propuesta (fuera de alcance): extender **solo la regla de la forma
   compuesta** —no la de la marca vieja— a `docs/` cuando la historia deje de ser un
   problema, porque la compuesta nunca fue correcta y no hay documento fechado que la
   ampare.
3. **`TITULO_BUSCAR` y `TITULO_PANEL` siguen escritos a mano** en vez de colgar de
   `PLANTILLA_DE_TITULO`. No se centralizó a propósito: `/buscar` tiene el título estático
   por el hallazgo M-2 de analítica y el panel no vive bajo el layout público. Si T-017
   parametriza la marca, esos dos son los que hay que mirar primero.
4. **La geografía sigue escrita a mano en quince literales** (T-017). Cada uno de los que
   este change tocó es uno que T-017 volverá a tocar, y la tentación de centralizar estaba
   a la vista; no se hizo, por lo que dice design.md §3.
5. **El buzón `contacto@enmirumbo.com` ya está publicado en el texto legal versionado.**
   Si el fundador decidiera cambiar de dirección, **cuesta otra versión del aviso** (la
   `3`). Vale la pena que la dirección sea la definitiva antes del despliegue.
6. **La `1` del aviso queda huérfana de texto.** Su huella sigue anclada, pero el texto que
   hashea ya no vive en el repo. Hoy no hace falta —la huella basta como prueba— pero si
   algún día hay que exhibir *qué decía* la versión `1`, la respuesta está en el historial
   de git y en ningún otro lado. Propuesta (fuera de alcance): valorar si el proyecto
   necesita un archivo de textos legales retirados antes de la revisión legal (E6-3).
