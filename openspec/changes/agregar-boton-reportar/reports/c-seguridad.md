# Etapa C (seguridad y pruebas adversariales) — agregar-boton-reportar

**Ticket:** `docs/tickets/T-011-boton-reportar.md` · **Rama:** `feature/agregar-boton-reportar` (worktree `.claude/worktrees/wt-t011`)
**Entrada:** spec completa (4 deltas), `reports/a-ui.md`, `reports/b-dev.md` (incluida su §7 de iteración 2) y el árbol sin commitear.
**Git:** no se tocó. Solo se agregó `tests/reportes-seguridad-adversarial.test.ts`.

> ## Estado tras la iteración 3 del dev — ÚLTIMA (re-verificado sobre el código real)
>
> **Hallazgos restantes: 0 críticos · 0 altos · 0 medios.** Los 6 hallazgos de las tres iteraciones (A1, A2, M1, M2, B1, M3) quedan **corregidos y verificados de forma independiente**: los dos altos reproduciendo las carreras contra un servidor real, y M3 relanzando mis payloads originales —más variantes nuevas— contra un **build de producción** (`next build` + `next start`), que es donde lo encontré.
>
> **Veredicto: LIMPIO. Pasa al validador.**
>
> Quedan **12 observaciones de severidad baja**, ninguna bloqueante. Dos son nuevas de esta iteración (O11 y O12) y **ninguna es explotable**; O11 sí exige una corrección de *documentación*, porque `b-dev.md` §8 afirma un "404 uniforme ante bounds manipulados" que no se cumple para cuatro formas de argumento, y el validador va a leer esa frase.
>
> **Gates al cierre:** `npm test` → **58 archivos, 1 609 pruebas en verde, cero `expected fail`** · `npm run lint` limpio · `npx tsc --noEmit` limpio · `npm run build` ✓ · más `next start` sobre el build de producción, donde se comprobó M3.
>
> **Histórico:** iteración 1 → 2 altos + 3 medios, NO PASA (1 556 verdes + 4 `expected fail`). Iteración 2 → altos y medios corregidos, 1 medio nuevo (M3), PASA con recomendación (1 591 + 3). Iteración 3 → M3 corregido, 0 hallazgos.

---

## 1. Re-verificación de la iteración 2 (carreras, honeypot, cookie, autorización)

No me fié del reporte del dev: reproduje las dos carreras yo, con peticiones HTTP reales contra un servidor levantado en el puerto 3500 (`next dev`) y contra el build de producción en el 3501 (`next start`), con una base SQLite propia (`prisma/verif-c.db`, borrada al terminar) y `REGISTRO_ENCABEZADO_IP=x-forwarded-for`. Los POST replican el `multipart/form-data` real de una Server Action con argumentos ligados.

### A1 (era alto) — ✅ CORREGIDO

`crearReporte` ya no hace `count` → `await` → `create`: la condición del tope viaja **dentro** del `INSERT … SELECT … WHERE (SELECT COUNT(*) …) < 10` (`src/lib/reportes/crear.ts:172-179`), una sola sentencia que SQLite ejecuta bajo su bloqueo de escritura, y se decide por filas afectadas.

**Mi reproducción, servidor real, 14 POST simultáneos cada uno desde una IP distinta** (para que el cupo por IP no ayude):

```
a /gracias: 14 · con error: 0 · status únicos: [303]
FILAS_TRAS_A1 = 10 (el tope es 10) · ids únicos: 10
comentarios: ["a1-0","a1-1","a1-2","a1-3","a1-4","a1-5","a1-6","a1-7","a1-8","a1-9"]
```

**Exactamente 10 filas**, y —esto importa tanto como el número— **los 14 recibieron la confirmación normal**: la corrección no reintrodujo un canal que delate el tope. Los `id` son UUID v4 (`0c90c63c-dedc-4ef1-98f4-297eca5f61e0`), aleatorios y sin nada del reportante.

### A2 (era alto) — ✅ CORREGIDO

`apartarCupoDeReportes` (`src/lib/reportes/limite.ts:68-75`) pregunta y aparta en una sola función síncrona, sin `await` entre medias.

**Mi reproducción, servidor real, 8 POST simultáneos desde la misma IP:**

```
a /gracias: 3 · con error=cupo: 5 · otros: 0
FILAS_TRAS_A2 = 3 · estados: ["pendiente"] · atendidoEn nulos: true
```

**Exactamente 3.** Comprobé además que el reordenamiento (ahora el cupo se aparta *después* de resolver el negocio) no reabre la carrera —el `await` queda antes de la comprobación, no entre comprobar y apartar— y que **conserva la propiedad anti-sondeo**: reportar fichas inexistentes sigue sin gastarle cupo a nadie, así que el cupo no se convierte en oráculo de qué fichas existen.

### M1 (era medio) — ✅ CORREGIDO

`entrada.trampa.trim() !== ""` (`crear.ts:111`), igual que el honeypot de altas. **Servidor real:**

```
sitio_web=" "  -> gracias      sitio_web="\t" -> gracias      sitio_web="\n" -> gracias
sitio_web="http://spam.example" -> gracias
FILAS: 3 ["m1-un espacio","m1-tabulador","m1-salto de linea"]
```

Los tres envíos con espacios en blanco **sí se guardan**; el que trae contenido de bot se descarta y sigue viendo la misma confirmación. Es justo lo que pedía el hallazgo.

### M2 (era medio) — ✅ CORREGIDO, y la cookie no abre vectores nuevos

En la URL solo queda el código del error. **Servidor real**, envío sin motivo con un comentario que simula datos de terceros:

```
Location: /negocio/verificacion-ficticia-c-…/reportar?error=motivo
¿la URL contiene el texto? false
Set-Cookie: nu_reporte_borrador=Y2Vycm8gaGFjZSBtZXNlcyw…; Path=/negocio/verificacion-ficticia-c-…/reportar;
            Expires=…; Max-Age=120; Secure; HttpOnly; SameSite=lax
```

La coordinación pidió cuatro comprobaciones concretas sobre la cookie. Las cuatro, contra el servidor real:

1. **¿Se puede inflar hasta encabezados gigantes?** No. La cota la pone el servidor antes de codificar: un comentario de **500 000 caracteres** produce un `Set-Cookie` de **578 bytes**. Con 150 emojis (300 unidades UTF-16, el peor caso multibyte) son 978 bytes, y el par sustituto no se parte por la mitad (`codificarBorrador` tira la mitad suelta; verificado que vuelven los 150 emojis íntegros). Un cliente puede mandarse a sí mismo una cookie enorme, pero eso lo corta Node con un `431` antes de llegar a la aplicación: es autolesión, no un vector.
2. **¿Se puede inyectar contenido que el prellenado pinte sin escapar?** No. Probé siete valores hostiles; el `<textarea>` los devuelve escapados y nunca se rompe:

   | Cookie | Dentro del `<textarea>` | ¿`<script>` crudo? |
   | --- | --- | --- |
   | base64 de `</textarea><script>alert(document.domain)</script>` | `&lt;/textarea&gt;&lt;script&gt;…` | no |
   | base64 de `"><img src=x onerror=alert(1)>` | `&quot;&gt;&lt;img …&gt;` | no |
   | `no-es-base64-!!!@@@` / vacía / 5 000 caracteres | vacío | no |

   Los valores que no son base64url interpretable dejan el formulario **vacío, no roto** (`decodificarBorrador` valida con `/^[A-Za-z0-9_-]{1,4096}$/` y recorta a 300 tras decodificar).
3. **¿Fija datos de otro usuario tras compartir equipo? ¿120 s es razonable?** Sí existe un residuo, y es aceptable: en los 120 segundos siguientes, otra persona que abra **el formulario de esa misma ficha en ese mismo navegador** ve el borrador anterior. Está acotado por las tres decisiones correctas (`httpOnly` —ni un script lo lee—, `Max-Age=120` y `Path` de esa ficha), se borra en el envío bueno (verificado: `Max-Age=0`), y **es estrictamente mejor que el mecanismo anterior**, donde el texto quedaba en el historial del navegador para siempre y en el log del proxy. 120 s es lo que tarda alguien en corregir un error del formulario; no lo discuto. Queda como observación O9, no como hallazgo.
4. **¿El `Path` acota de verdad?** Sí, con un matiz. El valor es la ruta del formulario de esa ficha, así que la cookie no se manda a `/`, ni a `/admin`, ni a `/registro`, ni al formulario de otro negocio. El matiz (O8): el emparejamiento de `Path` es por prefijo de segmentos, así que **también se manda a `/reportar/gracias`**, que no la lee. Es sobre-alcance cosmético, no una fuga. **Pero el valor del `Path` es manipulable — ver M3.**

### B1 (era medio) — ✅ CORREGIDO

`marcarReporteAtendido` compone `negocioId` en el `where` del `updateMany` (`src/lib/admin/reportes.ts:154-159`) y la acción del panel siempre lo pasa. Verificado que **no cambia ninguna respuesta observable**: un reporte ajeno responde `?reporte=ya-atendido`, igual que un id inventado, así que sigue sin ser un oráculo de existencia; y el reporte propio se sigue atendiendo.

### Observación 4 — ✅ atendida

`obtenerNegociosReportados` ya no trae `motivo` ni `comentario`.

---

## 2. M3 — ✅ CORREGIDO y re-verificado contra el build de producción

**El arreglo:** la acción ya no recibe `hrefFicha`. El único argumento ligado es `negocioId`, y la ruta se reconstruye en el servidor con lo que devuelve la base (`accion.ts:109-111`). El docstring mentiroso está corregido y ahora cita los docs de la versión.

**Mi re-verificación**, con una base propia y `next build` + `next start` (puerto 3502). Los campos ocultos que sirve producción ya solo llevan el identificador:

```
<input type="hidden" name="$ACTION_0:1" value="[&quot;cmtn5gbeo0000pgo93grocpwe&quot;]"/>
```

Relancé **mis payloads originales** y les añadí variantes que antes no había probado — 13 manipulaciones en total:

| Bound manipulado | Antes (iteración 2) | Ahora |
| --- | --- | --- |
| segundo argumento `https://evil.example` | `303` → sitio ajeno | **404**, sin `Location`, sin cookie |
| segundo argumento `//evil.example` | `303` → sitio ajeno | **404** |
| id sustituido por `https://evil.example` | `303` → sitio ajeno | **404** |
| id sustituido por `//evil.example` | `303` → sitio ajeno | **404** |
| id `= /x; Path=/` | `Set-Cookie … Path=/x; Path=/` | **404** |
| id con `\r\n` (inyección de encabezado) | `500` | **404** |
| bound vacío `[]` | `500` | **404** |
| id de ficha **no publicada** | 404 | **404** |
| tres argumentos | — | **404** |
| **control legítimo** | — | `303` a `/negocio/<seg>/reportar/gracias`, cookie con `Path=/negocio/<seg>/reportar; Max-Age=120; Secure; HttpOnly; SameSite=lax` |

**En la base quedó una sola fila: la del control.** Ninguna manipulación escribió nada.

**Caminos al `Location`/`Set-Cookie` que no pasen por `slugify` — lo que se me pidió buscar.** Encontré uno y lo documento como O12: `construirSegmentoFicha` slugifica el **nombre** pero interpola el **id** tal cual. Lo comprobé metiendo con SQL crudo un negocio publicado cuyo id es `evil/../x; Path=/`:

```
Location:   /negocio/ficticia-id-raro-evil/../x; Path=//reportar?error=motivo
Set-Cookie: … Path=/negocio/ficticia-id-raro-evil/../x; Path=//reportar; …
```

Es decir: la garantía "la ruta solo puede ser `[a-z0-9-]`" se sostiene **por el nombre, no por el id**. No es un hallazgo porque **ningún camino de cliente lo alcanza**: nada en `src/` fija ids de Negocio a mano —los pone `@default(cuid())`— y llegar ahí exige escribir en la base, momento en el que el atacante ya tiene todo. Pero la dependencia estaba implícita y ahora está escrita y probada (O12).

En cambio, el **nombre** hostil sí está bien atado. Con un negocio llamado `Ficticia <script>alert(1)</script>; Path=/ comillas`:

```
Location: /negocio/ficticia-script-alert-1-script-path-comillas-<id>/reportar?error=motivo
```

Forma limpia, verificada contra `^/negocio/[a-z0-9-]+/reportar(\?error=[a-z]+)?$`.

**El 404 es uniforme, sin oráculo.** Comparé seis respuestas byte a byte, incluida la distinción que más importa (ficha que existe pero no está publicada vs. ficha que no existe):

```
ficha EN REVISION (existe, no publicada)   status=404 bytes=4768 hash=1605866735 setCookie=0
id inexistente con forma de cuid           status=404 bytes=4768 hash=1605866735 setCookie=0
id vacío                                   status=404 bytes=4768 hash=1605866735 setCookie=0
id = https://evil.example                  status=404 bytes=4768 hash=1605866735 setCookie=0
bound vacío                                status=404 bytes=4768 hash=1605866735 setCookie=0
dos argumentos                             status=404 bytes=4768 hash=1605866735 setCookie=0
  → los seis IDÉNTICOS byte a byte, y ninguno pone cookie
```

**Lo que no se cumple: el "404 uniforme" no cubre cuatro formas de bound (O11).** La guarda nueva es `!(formData instanceof FormData)`, que atrapa el caso de *más* argumentos de los declarados, pero **no comprueba el tipo de `negocioId`**. Un bound `[null]`, `[12345]`, `[{…}]` o que no sea un arreglo pasa la guarda y revienta abajo, en la consulta:

```
bound con null    -> 500      bound con numero  -> 500
bound con objeto  -> 500      bound no es arreglo -> 500
```

Comprobé lo que importa: **el cuerpo del 500 no filtra nada** (`Internal Server Error` en `text/plain`, sin rastro de Prisma, SQL ni stack), no escribe ninguna fila y no pone ninguna cookie. Lo que sí ocurre es que el log del servidor recibe el volcado completo del error de Prisma —con la forma del `select` de `Negocio`— y un anónimo puede provocarlo a voluntad. Por eso es observación baja y no hallazgo: sin fuga, sin escritura, sin control saltado, y el 500 no distingue nada que el atacante no controle ya. Pero **`b-dev.md` §8 afirma "404 uniforme ante bounds manipulados"**, y eso hay que corregirlo o cerrarlo con un `typeof negocioId !== "string"` de una línea.

## 3. Observaciones (severidad baja, ninguna bloquea)

Las siete de la iteración 1 siguen en pie salvo la 4, ya atendida. Se suman tres de la iteración 2.

1. **`robots.txt` no excluye las rutas nuevas**, a diferencia de `/registro/gracias`, que es el mismo tipo de pantalla. El `noindex` que pide la spec sí está en las dos. El dev lo deja como propuesta; me parece bien.
2. **`/negocio/<cualquier-cosa>/reportar/gracias` responde 200** sin consultar nada. Deliberado y correcto para no delatar existencia.
3. **Sondear fichas no publicadas es gratis** (no gasta cupo). Contrapartida deliberada de no convertir el cupo en oráculo; sigue siendo el lado bueno.
4. ~~Sobre-lectura en la cola~~ — **corregida en la iteración 2.**
5. **El eco recortado no acota los bytes, solo los caracteres.** Ya no aplica a la URL (M2), pero sí a la cookie: 978 bytes con emojis. Muy por debajo de cualquier límite.
6. **La cota de 300 cuenta unidades UTF-16.** Coincide con `maxLength`, así que cliente y servidor no se contradicen.
7. **Cada honeypot y cada cupo agotado emiten un `console.warn`.** Sin contenido del reporte, pero inflables a voluntad.
8. **(nueva) La cookie de borrador también viaja a `/reportar/gracias`**, por el emparejamiento de `Path` por prefijo. Esa página no la lee. Sobre-alcance cosmético.
9. **(nueva) Residuo de dispositivo compartido:** durante 120 s, otra persona en el mismo navegador y la misma ficha ve el borrador anterior. Acotado por `httpOnly` + `Max-Age=120` + `Path`, borrado en el envío bueno, y mejor que el mecanismo anterior. Aceptable.
10. **`negocioId` es un parámetro opcional de `marcarReporteAtendido`.** La iteración 3 lo cerró por otro camino, y me parece bien: en vez de cambiar la firma que usan una docena de casos verdes, añadió una prueba estática en `tests/admin-adversarial.test.ts` que exige que **toda** llamada en `src/` pase el negocio, y la validó con una mutación. La guarda ya no puede desaparecer en silencio.
11. **(nueva, iteración 3) Un `negocioId` que no es texto da 500, no el 404 uniforme.** `[null]`, `[12345]`, `[{…}]` y un bound que no sea arreglo pasan la guarda `instanceof FormData` y revientan en la consulta. **Sin fuga** (el cuerpo es `Internal Server Error` a secas), **sin escritura** y **sin cookie**; lo único real es que un anónimo puede llenar el log de trazas de Prisma. Se cierra con `typeof negocioId !== "string"` → `notFound()`. Lo que sí conviene corregir en cualquier caso es la frase de `b-dev.md` §8, que afirma un 404 uniforme que no cubre estos cuatro casos.
12. **(nueva, iteración 3) `construirSegmentoFicha` slugifica el nombre pero no el `id`.** La ruta que alimenta el `Location` y el `Path` de la cookie solo es `[a-z0-9-]` porque todo id de Negocio es un cuid. Hoy lo es y ningún camino de cliente puede cambiarlo (los pone `@default(cuid())`), así que no hay nada explotable; pero la garantía que enuncian el docstring y `b-dev.md` §8 es más fuerte que lo que el código asegura. Queda fijado en una prueba (`[O12]`) que se pondrá en rojo el día que alguien permita elegir un id.

---

## 4. Scenarios sin prueba automatizada

Sin cambios respecto a la iteración 1. El único hueco real que detecté —"el honeypot no molesta a las personas", que `b-dev.md` marcaba como verificación manual siendo automatizable— quedó automatizado por mí y la iteración 2 lo amplió a cuatro casos. Las marcas de "manual/parcial" que quedan (390 px, "revisar desde el celular", "navegación sin JavaScript") están justificadas y anotadas para el PR.

---

## 5. Pruebas adversariales — estado final

**Archivo:** `tests/reportes-seguridad-adversarial.test.ts` — **88 casos, todos en verde, cero `expected fail`** (iteración 1: 61 + 4 · iteración 2: 76 + 3).

**Revisé el bloque 8 reescrito por el dev y no perdió intención: la ganó.** Mis tres `expected fail` estaban escritos contra un mecanismo que ya no existe (la acción ya no acepta una ruta), así que reescribirlos era lo correcto. Lo que quedó es más estricto que lo que yo había pedido:

| Lo que yo fijaba | Lo que fija ahora |
| --- | --- |
| `destino.startsWith("/negocio/")` | el destino es **exactamente** `/negocio/<seg>/reportar/gracias`, con `^/negocio/[a-z0-9-]+/…$` y sin `evil` |
| 2 destinos hostiles | **5** (con esquema, sin esquema, con `\r\n`, con atributos de cookie, vacío) **× 7 campos** que probaría un atacante (`hrefFicha`, `href`, `next`, `redirect`, `returnTo`, `callbackUrl` y el propio `$ACTION_1:1`) |
| el `Path` de la cookie debería ser la ruta real | el `Path` es la ruta real, casa con `[a-z0-9-]`, no contiene `;`, y ningún campo del envío mete `Path=/`, `Domain=` ni `SameSite=None` |
| — | **nuevo:** un negocio con nombre `<script> ; Path=/ "evil" \ 100%` produce igualmente una ruta limpia |

**Casos que añadí yo en esta iteración:**

- `[O11]` — cuatro formas de `negocioId` que no son texto: fija lo que de verdad importa (**cero filas, cero cookies**) y deja pinchado el comportamiento de hoy (`reventó === true`), de modo que el día que se añada la guarda de tipo el caso se pondrá en rojo y habrá que cambiarlo por la comprobación del 404.
- `[O12]` — deja escrito que `construirSegmentoFicha` sanea el nombre pero **no** el id, y fija el invariante del que depende la corrección: todo id de Negocio en la base casa con `^[a-z0-9]+$`.

Todos los datos siguen siendo ficticios (números `771999 0xx`, IPs de RFC 5737). La base de verificación (`prisma/verif-c3.db`) y el servidor de producción de prueba se borraron y apagaron al terminar; el árbol no tiene artefactos míos.

## 6. Para el dev

**Nada bloquea.** Queda una corrección de una línea y una de documentación, las dos opcionales:

1. **O11** — `if (typeof negocioId !== "string") notFound();` junto a la guarda de `formData`, y con eso el "404 uniforme" pasa a ser cierto para todas las formas de bound. Si se prefiere no tocar código, basta con matizar la frase de `b-dev.md` §8, para que el validador no lea una garantía más amplia de la que hay.
2. **O12** — una línea de comentario en `construirSegmentoFicha` (o en el docstring de la acción) diciendo que la limpieza de la ruta depende de que el id sea un cuid. La prueba `[O12]` ya lo vigila.

Las diez observaciones anteriores siguen como estaban; la 1 (`robots.txt`) sigue siendo un chore aparte, y me parece bien no colarlo en este change.
