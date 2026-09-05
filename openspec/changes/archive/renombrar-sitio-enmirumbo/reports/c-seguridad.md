# Etapa C (seguridad y tests adversariales) — renombrar-sitio-enmirumbo (T-019)

**Rama:** `feature/renombrar-sitio-enmirumbo` (worktree `.claude/worktrees/wt-t019`)
**Base de pruebas:** `prisma dev --name t019`, puerto **51238** (la del worktree, no 51214)
**Entradas:** `proposal.md`, `design.md`, `tasks.md`, los cinco deltas de spec,
`reports/b-dev.md` y `git diff main` completo.

## Dictamen

**PASA con hallazgos MEDIO** (ninguno crítico ni alto → no bloquea el pase al
validador). La mecánica de la versión 2 del aviso está bien construida y lo
verifiqué de forma independiente, no leyendo el reporte del dev. Lo que falla no
es el producto: son **dos pruebas adversariales de T-012 que este change dejó
mudas** en el archivo más relevante para lo que estrena, y que el mapa
scenario→prueba de la etapa B ni siquiera menciona. Quedan restituidas por mi
suite nueva y hay que corregirlas en su sitio.

| Severidad | Cantidad |
|---|---|
| Crítico | 0 |
| Alto | 0 |
| Medio | 3 |
| Bajo | 4 |

---

## 1. Verificación independiente de la mecánica de la versión (lo que se pidió auditar)

### 1.1 Huella ↔ versión: las dos anclas son honestas

No me creí ninguna de las dos huellas. Extraje de `main` (pre-rebrand)
`src/lib/legales/textos.ts`, `src/lib/legales/version.ts` y
`src/lib/registro/textos.ts` a un directorio aparte y **recalculé la huella del
texto que se publicaba antes del cambio**, con el mismo algoritmo declarado en la
spec (SHA-256 sobre las piezas unidas por `\u0000`):

```
VERSION_AVISO en main: "1"   piezas: 54
huella recalculada:    08ce983c2ce4f4733e42aca21cf7c01f75b3a6cc78c72fdb8055c8bc61062d5f
```

Es **exactamente** el renglón anclado de la `1`, que la rama no tocó
(`git show main:tests/aviso-version.test.ts:60` idéntico a
`tests/aviso-version.test.ts:60`). La evidencia de la `1` está intacta y, además,
es verdadera: ampara el texto que de verdad estuvo publicado.

El mismo cálculo sobre el texto de la rama da:

```
VERSION_AVISO en la rama: "2"   piezas: 54
huella recalculada:       1f3349078d0a1e938d2e46794c67f1fc1a976a85e9e2b5d0eb55ad6e79657ee0
```

que es el renglón anclado de la `2` (`tests/aviso-version.test.ts:68`).
**Las dos anclas corresponden al texto que dicen amparar.** El correo
`contacto@enmirumbo.com` viaja dentro de esa huella (probado: sustituirlo cambia
la huella), así que cambiar el buzón publicado costará otra versión, como manda
el requirement ADDED.

### 1.2 El guardián de huella muerde (probado por mutación)

Cambié una frase del aviso integral (`src/lib/legales/textos.ts:295`, sección
"Con quién compartimos tus datos") sin tocar `VERSION_AVISO`:

```
El texto del aviso de privacidad cambió sin estrenar versión: la huella de la
versión "2" ya no es la anclada. Sube VERSION_AVISO … Huella del texto de hoy:
85e1d3e2…
```

Tres casos en rojo, mensaje accionable. Revertido. **Muerde.**

### 1.3 El guardián de marca muerde (probado por mutación sobre `src/` real)

El dev lo prueba contra un `src/` de mentira en un temporal, que es lo correcto.
Yo lo probé además contra el árbol de verdad, que es lo que el CI va a mirar:

- `src/components/header.tsx:21` → `"NecesitoUno"` ⇒ **rojo**, con
  `src/components/header.tsx:21 — apareció la marca anterior`.
- `src/components/header.tsx:21` → `"EnMiRumbo Tizayuca"` ⇒ **rojo**, con
  `— apareció la forma compuesta "EnMiRumbo Tizayuca"`.

Revertido en los dos casos (`diff` contra copia previa: idéntico).

Su ámbito (`src/`) excluye la historia sin dejar hoyos **de producto**; las dos
rendijas que sí quedan están en BAJO-1 y ya tienen prueba propia.

### 1.4 Reaceptación solo-hacia-adelante

`versionAvisoEsPosterior` compara por orden, no por desigualdad, y
`procesar.ts:359-364` escribe la reaceptación **dentro del mismo `updateMany`
condicionado a `estado = rechazado`**, así que solo se anota si el reenvío
prospera. Verificado contra la base (no por lectura):

- ficha rechazada con `consintioAvisoVersion = "1"` + reenvío con la `2` vigente
  ⇒ la constancia original **no se pisa** (versión `1`, fecha original) y la
  reaceptación se anota aparte como `2` con la hora del servidor;
- ficha con constancia `3` (rollback del despliegue) ⇒ **no** se anota nada;
- ficha `publicado` con constancia `1` + envío perfecto de un tercero que conoce
  el número ⇒ rebota como duplicado, **cero escrituras** de evidencia;
- alta nueva con `consintioAvisoVersion=1` y `reconsintioAvisoVersion=99` en el
  POST ⇒ se sella la vigente del servidor y la reaceptación queda nula.

`consintioAvisoVersion` **nunca retrocede**: en el reenvío no está en `datos` y
no se escribe; en el alta la fija el servidor.

Los reenvíos con versión vieja se manejan como manda T-012: el formulario
abierto con la `1` que llega después del despliegue **no guarda nada** y devuelve
el literal exacto de la spec ("El aviso de privacidad cambió mientras llenabas
esto. Léelo otra vez y vuelve a marcar la casilla."), con lo capturado intacto.

### 1.5 `PLACEHOLDERS_LEGALES` 7 → 5, correo y datos del fundador

- La lista tiene **5** entradas, ninguna menciona correo
  (`src/lib/legales/textos.ts:64-70`); `HAY_PLACEHOLDERS_PENDIENTES` sigue en
  `true` y **la marca de borrador se sigue publicando en las dos páginas**
  (verificado sobre el HTML renderizado, no sobre la constante).
- `contacto@enmirumbo.com` aparece **exactamente 3 veces** en el contenido
  publicado: "Quién es responsable de tus datos", "Tus derechos ARCO" y "Si ves
  algo raro" de los términos. Ni una más.
- **Ningún dato del fundador se coló:** en el HTML servido de las dos páginas el
  único correo que aparece es ese (regex sobre todo el documento: 3 coincidencias,
  1 valor distinto); nombre, domicilio y WhatsApp del responsable siguen siendo
  placeholders visibles entre corchetes; y **no hay ninguna secuencia de 10
  dígitos** en el texto servido, que es como se vería un teléfono real publicado
  por descuido. Todo esto queda fijado por prueba, no por inspección.

### 1.6 Barrido de marca, mensajes y SEO

- Censo de `NecesitoUno`/`necesitouno` en todo el repo excluyendo historia: en
  superficie de producto, **cero**. Lo que queda son (a) el registro de cambios
  del PRD y la nota v1.0 que cita el nombre retirado, (b) la instrucción de
  migración `prisma dev stop necesitouno` de `docs/despliegue.md:80`, (c) las
  aserciones `not.toMatch(/necesitouno/i)` y el propio guardián, (d)
  `.claude/agents/*.md` (fuera de alcance por decisión del orquestador) y (e)
  `docs/tickets/T-017-*.md` (ver BAJO-4).
- Forma compuesta "EnMiRumbo Tizayuca": no existe en ninguna superficie servida;
  solo en los deltas, en la nota del PRD que la prohíbe y en el guardián.
- **Mensajes de WhatsApp bien formados:** los cuatro del panel y el del vecino
  pasan por `encodeURIComponent`. Con siete nombres de negocio hostiles dentro
  (`<script>`, `&text=…` para inyectar un parámetro, CRLF, comillas, marca RTL
  U+202E, 300 caracteres) el enlace sigue teniendo **un solo** parámetro `text`,
  cuyo valor decodifica al mensaje exacto, y el `href` no lleva `<`, `>`, `"`,
  espacio ni salto de línea sin codificar. El `¿` del mensaje del vecino viaja
  como `%C2%BF`.
- **SEO coherente y ninguna URL cambió:** `TITULO_DEL_SITIO`, `NOMBRE_DEL_SITIO`,
  `PLANTILLA_DE_TITULO` y `openGraph.siteName` cuelgan de la misma constante;
  el `alt` de la imagen de marca ya no nombra la marca anterior; la imagen pasó a
  columna para que "Tizayuca" no se lea como apellido. El `next build` lista
  exactamente las mismas rutas que `main`.
- **Sin construcciones riesgosas nuevas:** ninguna línea añadida a `src/` trae
  `$queryRaw`, `$executeRaw`, `dangerouslySetInnerHTML`, `innerHTML` ni `eval`.
  Ningún secreto nuevo; ninguna variable de entorno nueva que documentar
  (`.env.example` solo cambia el ejemplo de `SITIO_URL`).
- **Abuso:** este change no toca ninguna superficie de anti-spam. Los cupos del
  formulario público y del botón de reportar siguen como estaban (y siguen
  declarados como pendiente operativo en `PENDIENTES_OPERATIVOS_LEGALES`).

---

## 2. Hallazgos

### MEDIO-1 · Una prueba de regresión de seguridad de T-012 quedó muda con el rebrand

**Dónde:** `tests/aviso-version-seguridad-adversarial.test.ts:408-424`
(la siembra, en la línea **410**: `fichaPrevia(whatsapp, "rechazado", { version: "2" })`).

Ese caso es la regresión del **hallazgo MEDIO-3 de la etapa C de T-012**: probaba
que, tras un rollback del despliegue, una constancia **más nueva que la vigente**
no estrena reaceptación. Se sembraba con la `2` porque entonces la vigente era la
`1`. Desde este change la `2` **es** la vigente, así que
`versionAvisoEsPosterior("2", "2")` devuelve `false` por la rama de "iguales",
nunca por la de "posterior": la prueba sigue en verde sin ejercitar el rollback.

**Escenario concreto de la pérdida (comprobado, no supuesto).** Volví a introducir
el bug exacto que MEDIO-3 corrigió —`return nuevaEntera !== anteriorEntera` en
`src/lib/legales/version.ts:78`— y corrí las dos suites:

```
tests/aviso-version-seguridad-adversarial.test.ts   → VERDE (no detecta nada)
tests/rebrand-seguridad-adversarial.test.ts         → 2 fallos
```

Es decir: hoy, si alguien reintroduce ese bug, **la suite que existe para
impedirlo no se entera**. La consecuencia en producción sería evidencia legal que
miente: una ficha que consintió la `3`, tras revertir el despliegue a la `2`,
quedaría con `reconsintioAvisoVersion = "2"` y el panel rotularía "El reenvío
aceptó la versión 2 del aviso" — afirmando un avance de consentimiento que fue
hacia atrás.

**Qué tiene que hacer el dev:** sembrar esa ficha con una versión **posterior a la
vigente** —o derivarla de `VERSION_AVISO` para que no vuelva a caducar—, como hace
ahora `tests/rebrand-seguridad-adversarial.test.ts` (caso `7710019004`, versión
`"3"`). Mi prueba restituye la cobertura, pero el caso original debe dejar de
mentir en su archivo: si no, el próximo que lo lea creerá que está cubierto.

### MEDIO-2 · El `it.each` de homóglifos dejó de apuntar a la versión vigente

**Dónde:** `tests/aviso-version-seguridad-adversarial.test.ts:154-180`.

El caso se llama "una versión que solo se PARECE a la vigente (%s) no cuela" y sus
nueve entradas son homóglifos y disfraces de **`"1"`** (`"１"`, `"1\u200b"`,
`"¹"`, `"1\u0000"`, `"0x1"`, `'{"version":"1"}'`…). Con la vigente en `"2"`,
ninguno se parece ya a la vigente: el caso pasa por la vía trivial ("cualquier
cadena distinta se rechaza") y dejó de cubrir el ataque que le da nombre —que un
homóglifo se cuele como si fuera la versión que el dueño tuvo enfrente—.

No es explotable hoy (la comparación es igualdad estricta de cadenas), pero es
exactamente la clase de degradación silenciosa que el dev sí cazó en otros tres
archivos (`reports/b-dev.md` §5) y que aquí se le pasó.

**Qué tiene que hacer el dev:** reconstruir la tabla alrededor de `VERSION_AVISO`
—o derivarla de él— para que no haya que acordarse en la versión `3`. Cobertura
restituida mientras tanto: 12 disfraces de `"2"`, probados dos veces (contra
`versionAvisoEsPosterior` y contra la base, vía `procesarRegistro`).

### MEDIO-3 · El mapa scenario→prueba omite la suite adversarial de la mecánica que se estrena

**Dónde:** `reports/b-dev.md` §2, capacidad `paginas-legales`.

El mapa cita `aviso-version`, `legales-paginas`, `admin-paginas`,
`registro-accion` y `registro-validacion`, pero **no menciona ni una vez**
`tests/aviso-version-seguridad-adversarial.test.ts` (664 líneas, la suite
adversarial de la infraestructura de evidencia legal). Es la causa directa de
MEDIO-1 y MEDIO-2: el archivo no se revisó porque no estaba en la lista.

Además, dos scenarios del delta quedan sin prueba automatizada y conviene que
esté escrito:

- `paginas-legales` · **"el rebrand no le pide nada al negocio ya publicado"** —
  el dev lo declara "verificación por razonamiento". Es parcialmente automatizable
  (que no haya migración y que ningún reenvío toque fichas publicadas). Mi suite
  cubre el segundo tramo (`7710019005`); el primero sigue sin prueba.
- `layout-base` · **"la ficha compartida por WhatsApp llega con la marca nueva"** —
  el texto alternativo sí está probado; **el wordmark dibujado no** (tarea 1.3 lo
  deja "a ojo" y la revisión visual, tarea 10.2, sigue pendiente). No es
  automatizable barato; queda como verificación manual declarada.

### BAJO-1 · El guardián de marca no mira dos superficies que sí llegan al público

**Dónde:** `tests/marca-guardian.test.ts:37` (`RAICES_VIGILADAS = ["src"]`).

`prisma/` (los seeds, cuyo contenido se pinta como fichas del directorio) y
`public/` (servido tal cual) quedan fuera de su ámbito y **ninguna otra prueba los
miraba**. Hoy los dos están limpios; lo dejé fijado por prueba
(`tests/rebrand-seguridad-adversarial.test.ts`, describe "las rendijas del
guardián de marca"). Propuesta para cuando se retome (fuera de alcance de este
change): sumarlos a `RAICES_VIGILADAS`.

Rendija hermana, también cubierta ya por prueba: el guardián lee **literales**, no
lo renderizado, así que una interpolación (`${NOMBRE_DEL_SITIO} Tizayuca`)
produciría la forma compuesta en pantalla sin que ninguna línea la contenga. Hoy
no ocurre en ningún archivo de `src/`, y la prueba lo mantiene así.

### BAJO-2 · El guardián de huella solo protege el renglón vigente

**Dónde:** `tests/aviso-version.test.ts:88-101` (`revisarVersionYTexto` compara
únicamente la ÚLTIMA fila de la tabla).

Re-anclar en silencio la huella de una versión **ya publicada** no lo detecta el
guardián: hoy lo detecta un `expect` del propio archivo
(`tests/aviso-version.test.ts:268-272`), que además fija `toHaveLength(2)`. El día
que se estrene la `3` habrá que editar ese mismo `it` para cambiar la longitud, y
el renglón de la `1` queda al alcance del mismo gesto distraído — que es
justamente lo que la spec quiere impedir. Mitigado con una prueba nueva que fija
el renglón de la `1` carácter por carácter y **sin mirar el largo de la tabla**.

### BAJO-3 · La rama está sobre un `main` desactualizado y el rebase puede resucitar la marca vieja en `docs/`

`git merge-base HEAD main = 8cb8466`, pero `main` ya avanzó: `git diff main`
muestra como *borrados* `certs/supabase-root-2021-ca.crt`,
`tests/tls-certificado-supabase.test.ts`, `docs/vision-fase-2.md` y cambios de
`next.config.ts` que son de T-018 y **no** los tocó este change. Es deriva de
base, no una regresión.

Lo que sí es riesgo real para la etapa D: al rebasar, `docs/despliegue.md` y
`.env.example` traen la redacción de T-018, que en `main` todavía nombra la marca
anterior en **11 lugares** (`docs/despliegue.md` líneas 1, 42, 141, 238, 294, 299,
371, 522, 570, 571, 575 y `.env.example:167` de la versión de `main`). Esas
líneas **no las caza ninguna prueba**: el guardián de marca no mira `docs/` (y
BAJO-1 explica por qué está bien que no lo haga). El validador tiene que rehacer
el censo sobre `docs/` después del rebase, a mano.

### BAJO-4 · Un ticket abierto sigue nombrando la marca anterior

`docs/tickets/T-017-localidad-configurable.md:13,17` dice "la marca NecesitoUno" y
"NecesitoUno Pachuca". No es historia fechada —es un ticket **abierto**, que
describe trabajo futuro— y el repo es público. No es superficie de producto, así
que no bloquea; conviene resolverlo en `/rapido` o al abrir T-017.

---

## 3. Verificaciones que quedan pendientes del humano (no las puede cerrar esta etapa)

1. **Tarea 4.5 — el buzón `contacto@enmirumbo.com` tiene que recibir ANTES del
   despliegue.** El texto legal versionado ya lo publica como canal de contacto y
   de derechos ARCO. Publicar un canal ARCO que nadie atiende es un incumplimiento
   LFPDPPP con la firma del titular encima. El paso obligatorio está en la prueba
   de humo (`docs/despliegue.md` §9, punto 8-bis) y lo confirmé ahí. **Bloquea el
   despliegue, no el merge**, y debe decirlo el PR.
2. **Tarea 10.2 — revisión visual a 390px** del wordmark nuevo (no hay navegador
   en este entorno). No es asunto de seguridad.

---

## 4. Tests adversariales añadidos

**Archivo nuevo:** `tests/rebrand-seguridad-adversarial.test.ts` — **61 casos, los
61 en verde.** Datos 100% ficticios (serie de WhatsApp reservada `7710019xxx`,
nombres inventados, IP del rango de documentación RFC 5737). Sin caracteres
invisibles en el fuente: los homóglifos van como secuencias de escape para que se
lean en el diff.

| Bloque | Qué ataca | Casos |
|---|---|---|
| La huella de la 1 sigue siendo evidencia | el renglón anclado de la `1` fijado **sin** mirar el largo de la tabla (BAJO-2); la huella de la `1` no es la del texto de hoy; la tabla no migró a `src/` | 3 |
| La versión 2 corresponde al texto nuevo | huella de la vigente **recalculada aparte** contra el renglón anclado; la marca vive dentro del contenido versionado; cambiar el correo cambia la huella; retirar la marca de borrador también | 4 |
| La versión nunca retrocede | orden contra la vigente real (anterior / igual / posterior / no consta) + 12 disfraces de `"2"` (ancho completo, ZWSP, `²`, byte nulo, BOM, `02`, `2.0`, `v2`, `%32`, `0x2`, árabe-índigo, `2e0`) | 13 |
| Reaceptación hacia adelante **contra la base** | formulario abierto con la `1` enviado tras el despliegue; 11 disfraces de la vigente por el campo oculto; reenvío de constancia `1` → constancia intacta + reaceptación `2`; rollback (constancia `3`) → sin reaceptación; envío contra ficha **publicada** → duplicado sin escrituras; alta con mass assignment de las columnas de evidencia | 16 |
| Rendijas del guardián de marca | `prisma/` y `public/` limpios; nadie reconstruye la forma compuesta interpolando la constante de marca; **HTML servido** de las dos páginas legales, también con las etiquetas quitadas | 5 |
| El texto público no filtra datos del responsable | único correo publicado; placeholders del responsable intactos; **ninguna secuencia de 10 dígitos** en lo servido; marca de borrador con el correo ya dentro; el correo en sus tres lugares exactos | 5 |
| Mensajes de WhatsApp | 7 nombres de negocio hostiles × 4 mensajes del panel (un solo parámetro `text`, valor exacto, nada crudo en el `href`); descriptor solo en el primer contacto; mensaje del vecino codificado y sin datos suyos; 5 números malformados sin enlace inventado; número envuelto en markup | 15 |

**Pruebas por mutación que corrí yo (todas revertidas, árbol verificado idéntico):**

| Mutación | Resultado |
|---|---|
| Frase del aviso integral cambiada sin subir versión | `tests/aviso-version.test.ts` en rojo con el mensaje accionable ✔ |
| `"NecesitoUno"` en `src/components/header.tsx` | `tests/marca-guardian.test.ts` en rojo, con archivo:línea ✔ |
| `"EnMiRumbo Tizayuca"` en `src/components/header.tsx` | `tests/marca-guardian.test.ts` en rojo, con archivo:línea ✔ |
| `versionAvisoEsPosterior` de `>` a `!==` (bug MEDIO-3 de T-012) | `aviso-version-seguridad-adversarial` **VERDE** (MEDIO-1), suite nueva en rojo ✔ |

## 5. Gates

| Gate | Resultado |
|---|---|
| `npm test` | **98 archivos, 2767 pasan · 0 fallan · 2 omitidas.** Las `[A1]`/`[A2]` de `tests/reportes-seguridad-adversarial.test.ts` pasaron en esta corrida (son carreras del motor local; en una corrida previa falló solo `[A2]`) |
| `npm run lint` | **verde**, sin salida |
| `npm run build` | **verde**; el listado de rutas es idéntico al de `main` (ninguna URL cambió) |

## 6. Para la etapa D

1. Rebasar sobre `main` (T-018 dentro) y **rehacer el censo de `docs/` a mano**:
   BAJO-3 lista las 12 líneas que el rebase puede resucitar y que ninguna prueba
   caza.
2. Si T-014 mergeó, el guardián de `tests/marca-guardian.test.ts` lista lo que
   falte por sí solo — esa es la red que design.md §4 previó.
3. MEDIO-1 y MEDIO-2 son **del dev**: son dos pruebas que hay que arreglar en
   `tests/aviso-version-seguridad-adversarial.test.ts`, no código de producto.
4. El PR tiene que llevar: la nota de recrear la base local
   (`npm run db:local` + volver a sembrar, por el renombre `necesitouno` →
   `enmirumbo`) y el bloqueo de despliegue del buzón `contacto@enmirumbo.com`.
