# Reporte seguridad y test · agregar-directorio-publico

Auditoría de la superficie de **lectura pública** (home, listado por categoría, ficha, 404, seed de demo) sobre el diff completo contra `main` (`git diff main` + los archivos sin seguimiento de `git status`), la spec (13 requirements / 54 scenarios en `specs/`), y los reportes previos `a-ui.md` y `b-dev.md`.

**Veredicto (tras la iteración 2 del dev): limpio.** Sin hallazgos críticos ni altos → pasa al validador.

Estado al cierre de la **iteración 2** (el dev corrigió M2 y M4; re-verificados por mí contra el código real, ver §6):

- **Críticos: 0**
- **Altos: 0**
- **Medios: 3 abiertos** (M1 `fotoUrl` sin validar al render · M3 el registro no avisa que el WhatsApp queda público · M5 barrido masivo del directorio sin fricción) · **2 cerrados** (M2, M4)
- **Bajos: 5 abiertos** (B1–B4 de la iteración 1 + B5 nuevo, derivado de la corrección de M2)

Cierre de la iteración 2: `npm test` **431/431 en verde** (353 al llegar la etapa C + 53 adversariales míos de la iteración 1 + 17 del dev + 8 adversariales míos de la iteración 2), `npm run lint` limpio, `npm run build` limpio. No toqué git ni `src/generated/`; no corregí ningún defecto (solo escribí tests).

> Historial: al cierre de la **iteración 1** el veredicto ya fue limpio, con 0 críticos, 0 altos, 5 medios y 4 bajos, y `npm test` 406/406.

---

## 1. Hallazgos

### Medios

#### M1 · `fotoUrl` es el único dato de usuario que llega al render sin pasar por ninguna validación

`src/lib/directorio.ts:60` (y `:35`, `:93`) selecciona `fotoUrl` y lo entrega tal cual a `src/components/directorio/marcador-foto.tsx:19-28`, que lo mete en `<Image src={fotoUrl}>`. El resto de lo que el negocio escribe y se pinta como URL sí tiene guardián (`obtenerPaginaRegistrada` en `src/lib/enlaces.ts:68-85` exige `http(s)` interpretable); `fotoUrl` no tiene ninguno.

Comprobado renderizando el componente con valores hostiles:

| `fotoUrl` guardado | Lo que se sirve |
| --- | --- |
| `data:image/svg+xml,<svg onload=alert(1)>` | `<img src="data:image/svg+xml,&lt;svg onload=alert(1)&gt;">` — se pinta el `data:` inline en la página pública |
| `https://evil.example/pixel.png` | `<img srcSet="/_next/image?url=https%3A%2F%2Fevil.example%2Fpixel.png…">` |
| `javascript:alert(1)` | `/_next/image?url=javascript%3Aalert(1)…` |

No es explotable hoy: ninguna ruta escribe la columna (el formulario de T-003 ni siquiera la lee y E1-3 está fuera de alcance), y `/_next/image` con host externo responde **400** porque `next.config.ts` no declara `remotePatterns` (verificado contra `next start`), así que tampoco hay proxy de imágenes abierto. El problema es que la invariante "todo dato de usuario que se pinta pasa por un validador" queda incompleta justo en el campo que E1-3 y el panel E3 van a empezar a escribir. **Corrección sugerida (dev):** validar esquema/origen de `fotoUrl` en el mismo lugar que la página registrada, y no pintar la imagen si no pasa.

#### M2 · ~~El botón "Llamar" publica el `telefonoFijo` en un `tel:` sin normalizar nunca el número~~ · **CERRADO en la iteración 2** (re-verificado, §6)

`src/components/directorio/botones-contacto.tsx:62-66` arma `href={`tel:${telefonoFijo}`}` con el valor crudo de la base. En el registro, `telefonoFijo` solo tiene cota de longitud (`src/lib/registro/validacion.ts:170` + `src/lib/registro/textos.ts:30`, 20 caracteres): **no se valida que sean dígitos**. Escenario: un registrante escribe en "teléfono fijo" `"><script>alert(1)</script>` o una secuencia de marcación (`*21*5512345678#`, desvío de llamadas), pasa la validación, el admin publica la ficha y el directorio pinta un botón "Llamar" que marca eso.

XSS **no** hay (probado: React escapa el atributo, se sirve `href="tel:&quot;&gt;&lt;script&gt;alert(&quot;xss-tel&quot;)&lt;/script&gt;"` y ninguna etiqueta abierta queda con manejador de eventos). Lo que queda es un botón de contacto que marca lo que el negocio quiera y, sobre todo, una incoherencia con la regla que el propio `design.md` §4 fijó para el otro canal: *"antes que servir un `wa.me` roto, la tarjeta y la ficha no pintan el botón"* (`construirEnlaceWhatsapp` devuelve `null` si el número no se normaliza). El fijo no tiene ese trato. **Corrección sugerida (dev):** pasar el fijo por una normalización de dígitos (o reutilizar el criterio de `whatsapp`) y omitir "Llamar" si no queda un número marcable.

#### M3 · El registro nunca le dice al negocio que su WhatsApp va a quedar publicado (LFPDPPP)

Este change es el que empieza a publicar de verdad el número de un tercero en una página pública e indexable. El consentimiento que se recabó en T-003 no lo menciona: `src/lib/registro/textos.ts:66-67` dice *"usa los datos que escribes aquí solo para revisar tu negocio, contactarte por WhatsApp y publicar tu ficha en el directorio"* y aclara lo del domicilio, pero no que **el número de WhatsApp y el teléfono fijo quedan visibles para cualquiera**; la etiqueta del campo es solo "Tu WhatsApp (10 dígitos)" (`src/components/registro/formulario-registro.tsx:178`). Para la LFPDPPP la finalidad "publicación del dato de contacto" debería ser explícita antes de la casilla. Es copy, no código, y toca la capacidad `registro-negocio`: **ticket propio** (encaja con los legales de E6), no un parche aquí.

#### M4 · ~~La guarda de producción del seed de demo mira el entorno, no la base~~ · **CERRADO en la iteración 2** (re-verificado, §6)

`prisma/seed-demo.ts:208-210`: `esEntornoDeProduccion` solo revisa `NODE_ENV` y `VERCEL_ENV`. Escenario concreto: alguien corre desde su máquina `DATABASE_URL=<base de producción> npm run db:seed:demo` (en local `NODE_ENV` no vale `production` y `VERCEL_ENV` no existe) y quedan 12 negocios de mentira **publicados** en el directorio real; además, el `upsert` por WhatsApp (`:270-279`) pisaría cualquier ficha real que tuviera uno de esos números. Lo mismo con `VERCEL_ENV=preview` apuntando a la base de producción, o con `NODE_ENV=Production` (la comparación es exacta y sensible a mayúsculas).

Cumple literalmente el scenario de la spec ("no debe ejecutarse en un entorno de producción"), así que no lo cuento como defecto de spec. **Sugerencia (dev, barata):** exigir además que `DATABASE_URL` empiece con `file:` (ADR-001: en dev siempre es SQLite local) o pedir una confirmación explícita.

#### M5 · El directorio no tiene ninguna fricción contra el barrido masivo de datos de terceros (señalado, no implementado)

El listado pinta el `wa.me` de cada negocio publicado (requisito del PRD §6.2: WhatsApp sin clics extra), así que **ocho GET —uno por categoría— bastan para cosechar nombre + colonia + número de todos los negocios verificados**. No hay `robots.txt` (es de E5), ni límite por IP en lectura (`src/lib/registro/limite-ip.ts` solo cubre el alta del formulario), ni ninguna otra fricción. Son datos personales de terceros y el repo es público, así que lo dejo señalado como superficie de abuso para un ticket (E5/E7); **no lo implemento porque no hay spec que lo pida** y porque la exposición del número es, literalmente, el producto.

### Bajos

- **B1 · `obtenerPaginaRegistrada` devuelve el `href` crudo** (`src/lib/enlaces.ts:84`: `{ href: url, … }`, no `interpretada.href`). Con datos del formulario da igual (T-003 ya guarda `url.href` normalizada), pero una fila escrita por el panel E3 o por siembra puede dejar cosas como `HTTPS://EVIL.EXAMPLE/X` o un host con tabuladores/saltos de línea. **No hay engaño posible**: verifiqué con 6 variantes que el dominio mostrado y el host real del `href` siempre coinciden, incluido `https://facebook.com@evil.example/x` → muestra `evil.example` (hay test). Es endurecimiento: devolver la URL ya normalizada.
- **B2 · El dominio mostrado puede traer caracteres invisibles.** El parser de URL no rechaza `U+200B` ni el guion suave dentro del host: `https://facebook.com<U+200B>.evil.example` se muestra como `facebook.com.evil.example`. El host real sigue siendo visible (no alcanza para hacerlo pasar por Facebook) y el homógrafo cirílico sí se delata en punycode (`xn--facbook-9gg.com`, como quería design.md §4). Sugerencia: quitar los invisibles al pintar el dominio.
- **B3 · Amplificación barata.** Con `force-dynamic`, **cualquier** URL de un segmento (exista o no) dispara una consulta a la base antes del 404, y `?colonia=` se consulta sin cota de longitud (probado con 10 000 caracteres, responde bien). Hoy, con SQLite local y el volumen del arranque, es irrelevante; queda anotado por si el sitio se expone a tráfico hostil.
- **B4 · `console.*` nuevos:** solo dos, en `prisma/seed-demo.ts:305` y `:309`, dentro del bloque de ejecución directa del CLI de desarrollo. Sin datos personales (los del seed son ficticios). El `console.error(..., error)` podría imprimir una fila ficticia si Prisma falla; aceptable.

---

## 2. Scenarios sin test detectados (revisión del mapa de `b-dev.md`)

Recorrí los 54 scenarios del mapa contra los archivos de test. **Uno automatizable estaba sin automatizar:**

- **`directorio-publico` · "navegación sin JavaScript"** (fila 38 del mapa): estaba verificado solo a mano con `curl` sobre `next start`. Sí es automatizable y lo automaticé (3 tests en el bloque *"el recorrido completo funciona sin JavaScript de cliente"*): ninguna página del directorio sirve `<form>`, `<button>`, `<input>`, `<select>` ni manejadores `on*`, y el recorrido home → categoría → filtro por colonia → ficha → `wa.me` se arma tomando cada destino del HTML del paso anterior.

Los demás huecos del mapa no son hallazgos:

- **"celular a 390px"** (fila 37): parcialmente automatizado (áreas táctiles y `break-words`); el resto necesita un navegador y está correctamente marcado como pendiente del humano del PR.
- Todo lo demás tiene test real y verifiqué que el test citado existe y prueba lo que dice.

---

## 3. Tests adversariales añadidos

**`tests/directorio-adversarial.test.ts` — 53 tests, todos en verde.** Datos 100 % ficticios en la serie reservada `7719997xxx` (exclusiva de este archivo, se borra en el `afterAll`).

| Bloque | Qué ataca | Resultado |
| --- | --- | --- |
| XSS almacenado | 6 payloads guardados en `nombre`, `queOfreces`, `direccion`, `horario`, `coloniaOtra` y `telefonoFijo` (script, `img onerror`, `svg onload`, `iframe`, rotura de atributo) renderizados en listado y ficha | **Pasa.** Ningún payload sobrevive en crudo, ninguna etiqueta abierta del HTML lleva `on*=`, el `aria-label` del botón de WhatsApp no se rompe |
| Enlaces salientes | `javascript:`, `java\nscript:`, `data:`, `vbscript:`, `file:`, `//host`, cadena que no es URL → no se pintan; `https://facebook.com@evil.example`, `https://user:pass@…`, IP decimal, punycode → se pintan mostrando el host real | **Pasa.** El dominio mostrado siempre coincide con el host del `href` |
| Inyección en el mapa | `direccion` con `&api=1&hl=zz#frag` y comillas | **Pasa.** Todo queda dentro del parámetro `query`; el `href` solo tiene `api` y `query` |
| Fuga de datos de terceros | Negocio `en_revision` con `tokenGestion`, teléfono y dirección poblados + negocio `rechazado` que conserva `publicadoEn` (el estado que deja la transición publicado → rechazado de E3) | **Pasa.** Ninguno de sus datos aparece en los 8 listados; `tokenGestion` tampoco aparece en la ficha de un publicado que sí lo tiene guardado (el hueco que `b-dev.md` dejó anotado) |
| Indistinguibilidad | 4 formas de pedir una ficha invisible (inexistente, `en_revision` con y sin parte legible, `rechazado`) | **Pasa.** Mismo digest 404 en las cuatro |
| Estados ilegales | `UPDATE` crudo a `estado = 'publicado '` y `'PUBLICADO'` | **Pasa.** El CHECK de la migración los rechaza: no hay cuarto estado publicable |
| Slugs hostiles de categoría | 15 casos: traversal relativo/codificado/crudo, byte nulo, espacio final, mayúsculas, homógrafo cirílico, ancho cero, `%`, `' OR '1'='1`, etiqueta HTML, rutas reservadas (`registro`, `admin`), 5 000 caracteres, vacío | **Pasa.** 404 en todos, sin filtrar nada; `%` y `' OR '1'='1` no arrastran negocios de otras categorías |
| Rutas reservadas | `esSegmentoReservado(slugify(…))` con "Registro", "REGISTRO", "Regístro", " registro " | **Pasa.** La normalización no deja colar una categoría que tape una ruta propia |
| Filtro `?colonia` hostil | Payload de script, parámetro repetido (array), vacío, 10 000 caracteres, y una colonia "Otra" de texto libre que imita el nombre de una del catálogo | **Pasa.** No se refleja nada, no rompe, y la colonia impostora no se cuela en el filtro `?colonia=huicalco` |
| Segmentos de ficha hostiles | Prefijo legible con `<script>`, colisión de nombres idénticos, nombre sin letras latinas, `-`, `---`, vacío, traversal, byte nulo, id con sufijo, id en mayúsculas, id + 4 000 caracteres | **Pasa.** La parte legible nunca se refleja; cada id resuelve exactamente a su negocio; todo lo demás 404 |
| Número de terceros | Dónde aparece el WhatsApp y el fijo en el HTML | **Pasa.** El WhatsApp solo dentro de `wa.me/52…`; el fijo nunca como texto visible |
| Recorrido sin JS | Home, listado, listado filtrado y ficha | **Pasa.** Cero controles con JavaScript; cada paso es un `<a href>` del servidor |
| Seed de demo | Marca de invención en el nombre de los 12 negocios, ausencia de `tokenGestion`/coordenadas/foto, páginas `https` interpretables | **Pasa** |

## 4. Verificación en el servidor real (lo que los tests unitarios no ven)

`next build` + `next start` sobre una base de auditoría desechable (creada, sembrada y **borrada** al terminar; no quedó nada en el árbol ni en `prisma/dev.db`), con un negocio `en_revision` y un publicado a los que les puse `tokenGestion` a mano:

- **Payload RSC incluido:** 0 apariciones de `tokenGestion`, `consintioAvisoEn`, `registradoEn`, `publicadoEn`, `en_revision`, `rechazado`, `siembra`, `organico` ni de los datos del negocio oculto en el HTML servido de home, listado y ficha. La única aparición de "publicado" es la frase de la 404 en la frontera de `not-found` (lo que `b-dev.md` ya explicaba).
- **404 indistinguible de verdad:** la ficha de un `en_revision` y la de un id inexistente devuelven el mismo código y **el mismo cuerpo byte a byte**, con encabezados idénticos (`Cache-Control: private, no-cache, no-store…`, sin ningún encabezado que delate el caso).
- **Códigos:** `/` `/servicios-del-hogar` `?colonia=huicalco` `?colonia=inventada` `/belleza` `/registro` → 200; `/plomeros-baratos` `/loquesea` `/negocio` `/Registro` `/SERVICIOS-DEL-HOGAR` `/..%2f..%2fetc%2fpasswd` `/servicios%2Fdel%2Fhogar` y una URL de 2 000 caracteres → 404.
- **Reflejo del `?colonia`:** el valor solo aparece URL-codificado dentro del payload de router de Next (comportamiento del framework). Probé cuatro intentos de romper ese JSON (`"}]);alert(1)//`, `</script><script>…`, comilla suelta): 0 escapes, el listado sale completo y sin filtro.
- **`/_next/image` con host externo → 400** (sin `remotePatterns`, no hay proxy de imágenes abierto).

## 5. Lo que revisé y salió limpio

- **Inyección:** cero `dangerouslySetInnerHTML` en todo `src/`; cero SQL crudo con entrada de usuario (los únicos `$queryRaw` viven en tests, con literales); todas las lecturas son Prisma parametrizado.
- **Autorización:** este change no agrega rutas de admin ni consume el enlace de gestión; `tokenGestion` no se selecciona en ninguna consulta (`src/lib/directorio.ts:55-72`) y el test de "un solo archivo filtra por estado" sigue siendo la salvaguarda correcta.
- **Exposición de campos:** la proyección pública deja fuera `estado`, `origen`, `registradoEn`, `consintioAvisoEn`, `tokenGestion`, `latitud` y `longitud`. Lo que se publica de ubicación es la colonia y el texto que el propio negocio escribió, como manda el PRD §8.
- **Secretos:** el diff no agrega ninguna variable de entorno nueva; `.env.example` sigue cubriendo lo que hay; nada hardcodeado; `.env` y `prisma/*.db` siguen ignorados.
- **Datos personales en el repo:** el seed de demo es 100 % ficticio (nombres con marca de invención, `771999xxxx`, `771777xxxx`, direcciones inventadas, sin fotos) y ahora hay test que lo vigila. Los datos de mis tests también.

---

## 6. Iteración 2 · re-verificación de las correcciones del dev (M2 y M4)

El dev corrigió **solo M2 y M4** por instrucción del orquestador (detalle en la "Iteración 2" de `b-dev.md`). Revisé el código real, no el reporte, y re-corrí todo.

### M2 — cerrado, y cerrado en el lugar correcto

- `src/lib/enlaces.ts:52-58` · `construirEnlaceTelefono` normaliza con `normalizarWhatsapp` (que hace `replace(/\D/g,"")` y exige 10 dígitos nacionales) y devuelve `tel:+52<10 dígitos>` o `null`. Por construcción **la salida no puede contener ningún carácter que venga de la base**: ni `*`, ni `#`, ni espacios, ni HTML. El agujero se cierra en el origen, no con escapado.
- `src/components/directorio/botones-contacto.tsx:62-66` · ya no concatena: recibe `hrefLlamar` armado. Verifiqué que **los tres `href` del componente son expresiones simples** (`hrefWhatsapp`, `hrefLlamar`, `hrefComoLlegar`, `pagina.href`), sin una sola plantilla — y lo dejé como test para que no vuelva a entrar una concatenación.
- `src/app/negocio/[ficha]/page.tsx:42-49,88-93` · si el fijo no es marcable, no hay botón y el texto capturado se muestra como dato ("Teléfono: …", escapado por React).
- **Runtime** (`next start` + fixtures ficticias): `+52 (771) 999-8010` → `href="tel:+527719998010"` con su botón; `*21*5512345678#` → **0** anclas `tel:`, **0** botones "Llamar".

**Los dos tests míos que el dev reescribió son más estrictos, no más laxos** — revisados línea por línea:

| Test | Antes (etapa C, iteración 1) | Ahora | Veredicto |
|---|---|---|---|
| "el teléfono hostil…" | exigía **1** ancla `tel:` con el payload escapado dentro (fijaba el comportamiento defectuoso: escapado, pero marcable) | exige **0** anclas `tel:`, payload escapado como texto y crudo ausente | Más estricto; la intención original (que el payload no salga del atributo) queda cubierta con creces |
| "el teléfono fijo no se imprime como texto" | `>Llamar</a>` presente + número no impreso | sin botón (el fijo de esta ficha no es marcable) + el fijo del negocio `en_revision` no se filtra | Correcto: la mitad de "acción, no número" se mudó a `tests/directorio-paginas.test.ts:365-369`, que sigue existiendo y usa un fijo válido. **Verificado que esa cobertura existe de verdad**, no solo en el reporte |

Ninguna intención se diluyó y ningún test se borró.

### M4 — cerrado, y falla cerrada

- `prisma/seed-demo.ts:248-262` · `motivoParaNoSembrar` comprueba **primero** producción y **después** la localidad de la base, así que `SEED_DEMO_PERMITIR=1` no puede abrir producción por orden de evaluación. `apuntaABaseLocal` acepta solo `file:` (o `DATABASE_URL` ausente), con `trim().toLowerCase()`.
- Probé el **CLI real**, no solo la función: `DATABASE_URL=postgresql://… npm run db:seed:demo` → mensaje que nombra `DATABASE_URL` y `SEED_DEMO_PERMITIR=1`, **nada escrito, exit 1**; `DATABASE_URL=postgres://… SEED_DEMO_PERMITIR=1 NODE_ENV=production` → mensaje de producción, **exit 1**. Sin archivos basura en el árbol.
- `.env.example` documenta `SEED_DEMO_PERMITIR` y aclara que nunca sirve contra producción (el requisito de "variables nuevas documentadas" se cumple).

### Hallazgo nuevo de la iteración 2

#### B5 · (bajo) El fijo no marcable ahora se imprime como texto y el sitio no desactiva la autodetección de teléfonos

La corrección de M2 hace visible en la ficha lo que el negocio escribió en "teléfono fijo" cuando no es marcable (`src/app/negocio/[ficha]/page.tsx:88-93`). Verificado en el servidor real: la ficha muestra `Teléfono: *21*5512345678#` como texto, **sin** ancla. Dos apuntes:

1. `src/app/layout.tsx` no declara `<meta name="format-detection" content="telephone=no">`. Safari en iOS convierte por su cuenta en enlaces `tel:` el texto que le parece un teléfono, así que la secuencia podría volver a ser marcable **por el cliente**, no por nuestro HTML. Afecta igual a cualquier número que el negocio escriba en `queOfreces`, `direccion` u `horario` (ya pasaba antes de este change). Arreglo de una línea en el layout; lo dejo señalado, no lo implemento.
2. Es un elemento visible que la spec no enumera: el requirement de la ficha lista "qué ofrece, colonia, dirección o referencias, horario y A domicilio", y el de botones dice "los botones DEBEN mostrar la acción, no el número de teléfono como texto". Mostrar "Teléfono: …" no viola la letra (no es un botón) pero sí roza la intención. **Es una decisión de producto para el validador/humano del PR**, no un defecto de seguridad: el riesgo de contenido es marginal (el negocio ya controla 80+200+200+100 caracteres de texto libre en la misma ficha).

### Tests adversariales añadidos en la iteración 2 (8, todos en verde)

En `tests/directorio-adversarial.test.ts` (que pasó de 53 a 61 tests):

| Test | Qué fija |
|---|---|
| "todo href tel: servido es exactamente '+52' más diez dígitos" | Invariante **a nivel de render** sobre listado y fichas: el único `tel:` servido es `tel:+527719997107`; ninguna otra forma puede aparecer |
| "ningún valor guardado, por hostil que sea, produce otra forma de tel:" | 15 entradas (USSD `*21*…#`, `##002#`, `tel:` anidado, "800 TELMEX", extensión, XSS, dígitos árabes, byte nulo, 4 000 caracteres, salto de línea con encabezado inyectado, nulo/indefinido): o `null`, o la forma estricta |
| "el fijo no marcable se muestra como dato escapado…" | Sin `tel:`, sin botón, payload escapado y **fuera** de toda etiqueta abierta |
| "el componente de botones ya no concatena nada dentro de un href" | Todos los `href={…}` del componente son identificadores/accesos a propiedad: bloquea la regresión de volver a armar el esquema en el JSX |
| "una base remota se bloquea salvo con el permiso exacto '1'" | Fail-closed: `""`, `"0"`, `"true"`, `"yes"`, `"si"`, `"sí"`, `"01"`, `"11"`, `"on"` **no** habilitan; solo `1` (con espacios) |
| "el permiso explícito nunca abre la puerta de producción" | 4 combinaciones de producción (incluidas `" PRODUCTION "` y `"Production"`) con `SEED_DEMO_PERMITIR=1` → bloqueadas por producción |
| "otros esquemas remotos también se bloquean" | `postgres://`, `mysql://`, `prisma://`, `libsql://`, `https://`, con mayúsculas y espacios; `FILE:` local y `DATABASE_URL` ausente sí pasan |
| "bloqueada de verdad: contra una base remota no escribe ni una fila" | Comprobación de comportamiento (no solo de la función pura): el conteo de negocios no cambia |

### Estado final de los hallazgos

| Id | Severidad | Estado |
|---|---|---|
| M1 `fotoUrl` sin validar al render | Medio | **Abierto** (ticket; no explotable hoy) |
| M2 `tel:` con valor crudo | Medio | **Cerrado y re-verificado** |
| M3 el registro no avisa que el WhatsApp queda público | Medio | **Abierto** (ticket de copy, capacidad `registro-negocio` / E6) |
| M4 guarda del seed sin mirar la base | Medio | **Cerrado y re-verificado** |
| M5 barrido masivo sin fricción | Medio | **Abierto** (ticket E5/E7; sin spec) |
| B1 `href` crudo en `obtenerPaginaRegistrada` | Bajo | Abierto |
| B2 invisibles en el dominio mostrado | Bajo | Abierto |
| B3 consulta a la base en cualquier URL, `?colonia` sin cota | Bajo | Abierto |
| B4 `console.*` del CLI del seed | Bajo | Abierto (aceptable) |
| B5 fijo no marcable como texto + sin `format-detection` | Bajo | Abierto (nuevo, decisión de producto) |
