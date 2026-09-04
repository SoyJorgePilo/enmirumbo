# Reporte seguridad-test — `agregar-buscador`

Etapa C. Auditoría del diff (`git diff` + no rastreados sobre `feature/agregar-buscador`) y suite adversarial nueva sobre lo que el camino feliz y la etapa B no cubrieron.

**Gates en el worktree:** `npm run lint` ✅ · `npm test` ✅ **620 pruebas, 22 archivos, 0 fallas** (571 antes de esta etapa) · `npm run build` ✅ (`/buscar` sale como ruta dinámica `ƒ`). No toqué git ni código de producción: solo agregué `tests/buscador-seguridad-adversarial.test.ts` y este reporte.

## Veredicto

**Limpio: 0 críticos, 0 altos.** Pasa al validador. Quedan **4 hallazgos MEDIO** y **2 BAJO** para el dev / la conversación del PR; ninguno bloquea.

| Severidad | Cantidad |
| --- | --- |
| Crítico | 0 |
| Alto | 0 |
| Medio | 4 (M-1 … M-4) |
| Bajo | 2 (B-1, B-2) |

---

## Hallazgos MEDIO

### M-1 · El eco de `?q` no sanea caracteres de control ni marcas bidi

**Dónde:** `src/app/buscar/page.tsx:46-53` (`recortarConsulta`), reflejado en `:94` y `:113` (el `h1`) y en `:96` y `:115` (`<Buscador valorInicial=…>` → `src/components/directorio/buscador.tsx:43`).

**Qué pasa.** `recortarConsulta` solo hace `trim()` y `slice(0, 80)`. Todo lo demás de la consulta vuelve al HTML tal cual. Verificado **contra el servidor de verdad**, no solo en `renderToStaticMarkup`:

```
curl "http://localhost:3100/buscar?q=plomero%00%E2%80%AEzz"   → HTTP 200
h1:    26 71 75 6f 74 3b 70 6c 6f 6d 65 72 6f 00 e2 80 ae 7a 7a   ("plomero" 0x00 U+202E "zz")
input: value="plomero<0x00><U+202E>zz"
```

React escapa `< > " &` (confirmado: `<img src=x onerror=alert(1)>` sale como `&lt;img …&gt;`, y las comillas no se salen del atributo), así que **no hay XSS**. Lo que sí hay:

- **Byte NUL crudo (0x00) en el cuerpo de la respuesta.** No rompe el parser del navegador (el tokenizer HTML lo sustituye por U+FFFD), pero es una respuesta no conforme: WAFs, proxies, escáneres de contenido y pipelines de log tratan el NUL como fin de cadena o como payload sospechoso.
- **Spoofing visual del encabezado.** `U+202E` (RIGHT-TO-LEFT OVERRIDE) llega íntegro al nodo de texto del `h1`. Escenario concreto: alguien difunde por WhatsApp `https://…/buscar?q=<RLO>otxet%20odaregnaxe` y la página del directorio sirve un `Resultados para "…"` que se lee al revés, con el dominio legítimo en la barra. Impacto bajo hoy (la página no pide nada al usuario), pero es texto controlado por un tercero renderizado como encabezado de la marca.
- **Pareja suplente partida.** El corte de 80 es por unidades UTF-16: `?q=<79 caracteres>🎉…` deja un `\uD83C` suelto en el `h1` y dentro del `value` que el vecino reenvía al corregir su búsqueda.

**Contexto de spec.** El requirement "Página de resultados…" exige que la consulta "se muestre como texto, nunca se interprete como marcado" — eso se cumple. Esto es endurecimiento, no incumplimiento; por eso es MEDIO y no bloquea.

**Arreglo sugerido:** en `recortarConsulta`, borrar `Cc`/`Cf` (`.replace(/[\p{Cc}\p{Cf}]/gu, "")`) antes del corte y cortar por puntos de código (`[...texto].slice(0, 80).join("")`).

**Tests pin añadidos:** `HALLAZGO M-1 (pin): hoy los controles y el marcador RTL vuelven crudos en el eco` y `HALLAZGO M-1 (pin): el recorte de 80 puede partir un emoji…`. Fijan el estado actual con el comentario de que **deben invertirse** cuando se sanee, y de paso blindan lo que sí está garantizado (sigue siendo texto, un solo `h1`).

### M-2 · `terminosDeBusqueda` recorta a 60 **antes** de quitar el relleno

**Dónde:** `src/lib/busqueda.ts:67-71`.

```ts
const normalizada = normalizarTexto(consultaCruda.slice(0, LONGITUD_MAXIMA_CONSULTA));
```

El `slice` se aplica a la cadena cruda, no a la recortada. Consecuencia medida:

| Consulta | Términos |
| --- | --- |
| `"cerrajero"` | `["cerra"]` |
| `" "×52 + "cerrajero"` | `["cerra"]` |
| `" "×60 + "cerrajero"` | `[]` |
| `"."×64 + "cerrajero"` | `[]` |
| `"🎉"×30 + "cerrajero"` | `[]` |

Con 58 o más caracteres no alfanuméricos al principio (espacios, puntuación, emojis, otro alfabeto) el término real se descarta y `/buscar` contesta **"¿Qué estás buscando?"** aunque el vecino sí escribió algo buscable. Es el requirement "Consulta vacía y términos hostiles acotados, sin error" fallando en el sentido contrario al que se probó: no es que una consulta hostil devuelva de más, es que una consulta legítima con relleno hostil devuelve de menos, sin decir por qué.

**Arreglo sugerido:** `consultaCruda.trim().slice(0, LONGITUD_MAXIMA_CONSULTA)` — conserva intacta la cota que motivó el `slice` (no normalizar 100 000 caracteres, decisión 3 de `b-dev.md`).

**Test pin añadido:** `HALLAZGO M-2 (pin): el recorte de 60 se aplica ANTES de quitar el relleno`.

### M-3 · El tope de 4 términos se toma por orden de aparición, y luego se exigen todos

**Dónde:** `src/lib/busqueda.ts:73-78` (`filter(len ≥ 2)` → `slice(0, 4)` → raíces) combinado con el `AND` de `src/lib/directorio.ts:180`.

`terminosDeBusqueda("quien me arregla la cerrajeria")` → `["quien", "me", "arreg", "la"]`. La única palabra útil queda fuera de la cuota, y como los cuatro se exigen con `AND`, el resultado es **cero**. Lo mismo con `"de la el en plomero"`. Es exactamente el vecino del PRD §7 escribiendo con prisa desde el celular, y el estado sin resultados le ofrece categorías sin explicarle que su palabra ni se buscó.

Conforme a la letra de la spec ("se limita el número de términos que se buscan" + "varias palabras se exigen todas", ambas aprobadas), por eso lo reporto y no lo llamo defecto de spec: es una decisión que conviene revisar antes del merge. Opciones baratas: ordenar los términos por longitud antes del `slice`, subir el mínimo de término a 3, o listar muletillas. Nótese que el mínimo actual de 2 caracteres es justo lo que deja pasar `de`, `la`, `el`, `en`, `me`.

**Test pin añadido:** `HALLAZGO M-3 (pin): el tope de 4 términos se toma por orden, no por utilidad`.

### M-4 · `/buscar` es superficie pública sin protección contra flooding (señalado, no implementado)

**Dónde:** `src/app/buscar/page.tsx` → `src/lib/directorio.ts:171` (`buscarNegociosPublicados`).

El registro sí tiene cupo por IP (`src/lib/registro/limite-ip.ts`, 3 altas por hora). La búsqueda no tiene nada. Cada request ejecuta un `findMany` con hasta 4 grupos `OR` de `LIKE '%raiz%'` sobre `Negocio` más un `EXISTS` sobre `giros`; ninguno de esos predicados puede usar un índice (un B-tree no sirve para `contains`, como anota la deuda 2 de `b-dev.md`), y el adaptador es `better-sqlite3`, que es **síncrono**: cada consulta bloquea el event loop del proceso mientras dura. Un bucle de `curl` sobre `/buscar?q=de+de+de+de` desde una sola máquina degrada todo el sitio, no solo la búsqueda. Los estados de consulta vacía y sin resultados además pegan a `listarCategorias()`.

Hoy, con decenas de fichas, el costo por consulta es despreciable; lo dejo señalado para que no se descubra cuando la siembra del PRD §9 haga crecer la tabla. **No lo implemento: no hay spec ni ticket** (mi encargo es señalar). Propuesta para backlog: cupo por IP reutilizando `limite-ip.ts`, o `Cache-Control` para consultas repetidas.

---

## Hallazgos BAJO

### B-1 · El script de relleno no tiene la guarda de producción que sí tiene el seed

`prisma/backfill-busqueda.ts:94-113` lee `DATABASE_URL` y hace `update` sobre todas las filas de la base a la que apunte, sin confirmación. `prisma/seed-demo.ts:238-263` sí tiene guarda explícita (`NODE_ENV`/`VERCEL_ENV` normalizados, y además inspección de la URL). Es BAJO porque el relleno no es destructivo —recalcula columnas derivadas a partir de la misma fila, y es idempotente—, pero son dos scripts de `prisma/` con el mismo perfil de riesgo y criterios distintos. Nota menor: actualiza fila por fila sin transacción; interrumpirlo deja el relleno a medias (mitigado porque se puede repetir).

### B-2 · `id` literal en el buscador

`src/components/directorio/buscador.tsx:34` y `:41` fijan `htmlFor`/`id="buscador-q"`. Hoy hay una sola instancia por página y funciona. El día que el buscador entre al header (fuera de alcance de este change, pero listado como candidato en `proposal.md`) habrá dos elementos con el mismo `id` y la `<label>` apuntará al equivocado. Accesibilidad, no seguridad; se resuelve con `useId` o con un prop `idCampo`.

---

## Verificaciones que pasaron

Los encargos explícitos de esta etapa, y cómo quedaron:

1. **Inyección en el `contains` de Prisma.** Lo que llega al `where` cumple `/^[a-z0-9]{1,5}$/` por construcción. Añadí un test que **inspecciona los argumentos reales** que recibe Prisma (espía sobre `negocio.findMany`) y exige que ningún `contains` lleve `%`, `_`, `\` ni comillas, para `%cerraj%`, `_cerraj_`, `cerraj' OR '1'='1` y `cerraj\%`. Sin SQL crudo en `src/` ni `prisma/`: el único `$queryRawUnsafe` del repo está en `src/generated/`, que es código del cliente de Prisma.
2. **`%%%` no devuelve todo ni revienta.** Se trata como consulta vacía (estado "¿Qué estás buscando?") sin tocar la base. Cubierto por la etapa B y reforzado aquí.
3. **XSS reflejado en el `value` y en "Resultados para".** Escapado correcto, verificado en el HTML **servido** (`curl`), no solo en `renderToStaticMarkup`. Sin `dangerouslySetInnerHTML` en todo el repo. Añadí además: ningún `href` de la página de resultados usa un esquema distinto de `/`, `http(s):`, `tel:`, `mailto:` o `#`.
4. **Dato hostil ya guardado que llega a la página nueva** (lo que la etapa B no atacó: ella ataca la consulta, no la ficha). Sembré un negocio publicado con marcado en el nombre y en la colonia "Otra", teléfono con secuencia de desvío, dirección y `tokenGestion`. Resultado: nada crea etiquetas, el `href` de la ficha cumple `^/negocio/[a-z0-9-]+$` y el de WhatsApp `^https://wa\.me/52\d{10}\?text=`.
5. **La búsqueda jamás devuelve no publicados ni campos internos.** Verificado con dos **transiciones ilegales** que el panel de T-005 podría producir: `rechazado` con `publicadoEn` puesto y `en_revision` con `publicadoEn` puesto. Ninguno aparece, y ni su nombre, ni su WhatsApp, ni su teléfono, ni su dirección, ni su token están en el HTML. Complementado con un test de contrato: las llaves de cada resultado son exactamente las 7 públicas, y el `select` que llega a Prisma no pide `nombreNormalizado`, `queOfrecesNormalizado`, `tokenGestion` ni `estado`, mientras el `where` sí trae `estado: "publicado"`. Además, la búsqueda **no funciona como oráculo**: la respuesta a un término que solo coincide con la ficha oculta es idéntica, carácter por carácter, a la de un término inexistente.
6. **Mass assignment de las columnas normalizadas.** Doble defensa correcta: `validarRegistro` construye `datos` campo por campo (`src/lib/registro/validacion.ts:240-251`) y `procesarRegistro` esparce `datosDeBusqueda(...)` **después** de `...datos` (`src/lib/registro/procesar.ts:186-190`). Probé el alta extremo a extremo con `estado=publicado`, `origen=siembra`, `publicadoEn`, `tokenGestion`, `id`, `nombreNormalizado` y `queOfrecesNormalizado` inyectados en el `FormData`: la ficha queda `en_revision`/`organico`, sin token, sin fecha, con su propio id, con el normalizado calculado — y **no aparece en el buscador** por ninguno de los seis términos inyectados.
7. **La migración a mano preserva los `CHECK`** (el punto que `b-dev.md` pidió revisar en el PR). Apliqué las dos migraciones sobre una base vacía (`prisma migrate deploy` contra un archivo nuevo) y volqué el esquema: siguen ahí `CHECK ("estado" IN ('en_revision','publicado','rechazado'))` y `CHECK ("origen" IN ('siembra','organico'))`, más las dos FK y los dos índices únicos; `prisma migrate status` no reporta drift. Para que no dependa de que alguien vuelva a mirar el `.schema`, lo fijé con 11 tests de comportamiento (7 estados y 4 orígenes inválidos que la base debe rechazar, incluidos `"Publicado"`, `"publicado "`, `"publicado' OR '1'='1"` y `""`) más una comprobación de que ningún intento se coló a la tabla. **La decisión del dev de escribir el SQL a mano es correcta y está bien fundada.**
8. **Relleno idempotente.** El test del dev compara la tabla entera antes/después. Le añadí la red estructural que faltaba: **todo** archivo de `src/` y `prisma/` que hace `negocio.create|update|upsert|createMany|updateMany` tiene que importar `datosDeBusqueda`. Hoy son exactamente tres (`registro/procesar.ts`, `seed-demo.ts`, `backfill-busqueda.ts`) y los tres cumplen; el día que T-005 o E8 agreguen un cuarto camino de escritura, la suite lo señala.
9. **Eco truncado del `?q` (hallazgo del dev): cerrado y acotado con medida exacta.** Frontera en 80: con 80 caracteres no hay recorte ni "…", con 81 el `h1` lleva 80 + "…" y el `value` lleva 80 sin "…". Y la respuesta a 5 000 caracteres no es más larga que la de 80 (±4 bytes): la amplificación que reportaba el hallazgo MEDIO 3 de T-003 no volvió. Pendiente solo lo de M-1 (qué caracteres, no cuántos).
10. **DoS barato y regex catastrófica.** Las dos regex de la normalización (`/[̀-ͯ]/g` en `texto.ts:13` y `/[^a-z0-9]+/g` en `busqueda.ts:56`) son lineales, sin alternancia ni cuantificadores anidados: no hay backtracking explosivo. Probé 7 consultas caras (60 000 caracteres, 6 000 repeticiones de un término, 2 000 términos distintos, 4 000 comodines, 20 000 marcas combinantes sueltas tipo "zalgo", 20 000 emojis, un término con 5 000 espacios): todas producen ≤4 términos de ≤5 letras `[a-z0-9]` y como mucho **una** consulta a la base. El costo residual por request es el de M-4.
11. **Secretos y `.env.example`.** El change no introduce ninguna variable de entorno nueva; `.env.example` sin cambios, nada hardcodeado, ningún `console` nuevo registra la consulta del vecino.
12. **LFPDPPP.** Ningún dato real en el diff. Los fixtures nuevos del dev y los míos usan series de WhatsApp ficticias y disjuntas (`7719993xxx` etapa B, `7719994xxx` datos, `7719996xxx` este archivo, `7719998xxx` consultas, `771999500x` seed), nombres marcados "ficticio/ficticia/Inventada", IPs de TEST-NET-3 (`203.0.113.x`) y dominios `example.mx`. `prisma/seed-demo.ts` no agrega negocios nuevos: solo giros del catálogo y el acento de "Fútbol".
13. **Tests preexistentes tocados: no hay debilitamiento encubierto.** Revisé los tres. `tests/directorio-adversarial.test.ts:665` afloja la prohibición de `<form>` —que es justo la cláusula que el delta de `directorio-publico` deroga— pero compensa exigiendo `action` interno + `method` en todo formulario y prohibiendo controles fuera de formularios; los dos de `tests/directorio-paginas.test.ts` quedan estrictamente más fuertes que antes. `tests/layout.test.ts` extiende la revisión de destinos a `action`, con caso negativo.

## Scenarios sin test

Recorrí los 4 deltas de spec (`directorio-publico`, `modelo-datos`, `registro-negocio`, `layout-base`) contra el mapa scenario→test de `b-dev.md`: **todos los scenarios automatizables tienen test**. No encontré ninguno huérfano.

El único punto sin cobertura sigue siendo el que ya declararon a-ui y b-dev: **la revisión visual real a 390 / 768 / 1280 px (tasks #17)**. No hay navegador en este entorno, así que tampoco la puedo cerrar yo; queda para ojos humanos en el PR. Lo que sí está verificado por estructura: `min-h-11` en campo y botón del buscador, `min-h-16` en los botones de categoría, `break-words` en los encabezados y el recorte de 80 que evita que una consulta larga desborde el `h1`.

Nota relacionada: el scenario "nunca contra producción" de `modelo-datos` lo cubre `tests/seed-demo.test.ts` para el seed, pero esa guarda **no aplica** al script nuevo de relleno (hallazgo B-1).

## Tests adversariales añadidos

Archivo nuevo: **`tests/buscador-seguridad-adversarial.test.ts` — 49 pruebas, todas en verde.** Datos 100 % ficticios, serie `7719996xxx`, borrada en el `afterAll`.

| Bloque | Pruebas | Qué ataca |
| --- | --- | --- |
| Ficha hostil ya guardada en los resultados | 5 | marcado en nombre y colonia, esquema de todos los `href`, forma del enlace de WhatsApp y de la ficha, fuga de campos internos (token, fijo, dirección, "¿Qué ofreces?") |
| La proyección de la búsqueda no crece | 2 | contrato exacto de llaves del resultado; `select` y `where` reales que recibe Prisma |
| Transiciones de estado ilegales | 15 | `rechazado`/`en_revision` con `publicadoEn` puesto; `publicado` sin fecha; 11 estados y orígenes inválidos que los `CHECK` de la migración deben rechazar |
| El buscador no es oráculo | 2 | respuesta idéntica para un término que solo coincide con una ficha oculta |
| Mass assignment desde el formulario público | 1 | alta con `estado`/`origen`/`publicadoEn`/`tokenGestion`/`id`/columnas normalizadas inyectados, y su ausencia posterior en el buscador |
| Lo que llega a la base está acotado | 13 | 7 consultas caras (hasta 60 000 caracteres, 2 000 términos, zalgo, emojis), conteo de consultas a la base, comodines y comillas en el `where`, término de un carácter, **pin M-2**, **pin M-3** |
| El eco de `?q` está acotado y sigue siendo texto | 6 | frontera exacta 80/81, no crecimiento con 5 000 caracteres, relleno de espacios, **pin M-1** ×2 |
| La normalización compartida no abrió huecos | 4 | NFC vs NFD en `slugify` y en `datosDeBusqueda`, negocio guardado en NFD encontrado escribiendo en NFC, regresión de `slugify` tras mudar `quitarAcentos` a `texto.ts`, URLs de ficha sin colisión |
| Ningún camino de escritura se salta `datosDeBusqueda` | 1 | barrido estructural de `src/` y `prisma/` |

Los tres tests marcados `HALLAZGO M-n (pin)` **documentan el comportamiento actual a propósito**, con el comentario de que deben invertirse cuando se corrija el hallazgo correspondiente; no son garantías deseadas. Cada uno afirma además lo que sí debe seguir siendo cierto pase lo que pase (sigue siendo texto, un solo `h1`, no lista el directorio, no truena).

---

# Iteración 2 — reverificación de la etapa C

Re-auditoría de las correcciones que el dev reporta en `b-dev.md` › "Iteración 2" (M-1, M-2, M-3, B-1), más los dos puntos que el orquestador pidió mirar con lupa: el residuo de `U+202E` en el payload RSC y si la lista de muletillas debilita la búsqueda.

**Gates:** `npm run lint` ✅ · `npm test` ✅ **661 pruebas, 22 archivos, 0 fallas** (642 al cerrar la iteración 2 del dev; +19 míos) · `npm run build` ✅. No toqué git ni código de producción.

## Estado de los hallazgos

| # | Estado | Nota |
| --- | --- | --- |
| M-1 | **Cerrado** | Verificado contra el servidor real: 0 bytes NUL y 0 `U+202E` en el eco renderizado |
| M-2 | **Cerrado** | Con una cota que ahora es implícita, ver abajo |
| M-3 | **Cerrado a medias** → se reabre como **residuo (MEDIO)** | El arreglo cubre el enunciado de la pregunta, no las demás palabras |
| M-4 | Abierto por decisión (deuda a backlog) | Sin cambios; el arreglo de M-2 no lo empeora de orden |
| B-1 | **Cerrado** | La asimetría con el seed me convence, ver abajo |
| B-2 | Abierto por decisión (deuda a backlog) | Sin cambios |
| **B-3** | **Nuevo (BAJO)** | Dos archivos de test son binarios para git |

**Conteo tras la iteración 2: 0 críticos, 0 altos, 1 medio reabierto (residuo de M-3) + 1 medio en deuda aceptada (M-4), 2 bajos (B-2, B-3 nuevo).**

## M-1 · Cerrado. El residuo del payload RSC es **inocuo** (veredicto pedido)

El eco renderizado quedó limpio. Verificado contra `next dev`, contando bytes sobre la respuesta cruda:

```
/buscar?q=plomero%00%E2%80%AEzz  → HTTP 200
bytes 0x00 en toda la respuesta: 0      (antes: presentes en h1 y en value)
h1:     Resultados para &quot;plomero zz&quot;
value:  plomero zz
```

El `U+202E` sobrevive **una sola vez**, exactamente donde el dev lo reporta: la clave del árbol de rutas del payload RSC que Next inlina en un `<script>`, en el offset 12 469 de 21 368 de la respuesta.

**Veredicto: inocuo, no es hallazgo.** Cuatro razones, la tercera verificada con ataque:

1. **No es texto renderizado.** Está dentro de un elemento `<script>`, donde el navegador no aplica el algoritmo bidi de Unicode. El impacto que tenía M-1 —el `h1` servido desde el dominio legítimo leyéndose al revés— desaparece por completo. (El otro uso conocido de estas marcas, "Trojan Source" / CVE-2021-42574, ataca la revisión humana de código fuente; este payload lo genera la máquina y no lo lee nadie.)
2. **El NUL sí se fue del todo.** El serializador lo escapa como `\u0000`, así que el problema real de M-1 —byte crudo en el cuerpo, respuesta no conforme para WAFs y pipelines de log— está cerrado, no desplazado. Conté 0 bytes 0x00 en toda la respuesta.
3. **No puede salirse de su literal ni del `<script>`,** que es la única forma de que esto fuera explotable. Lo ataqué con 9 vectores contra el servidor real y en test: `</script><script>alert(1)</script>`, `</ScRiPt >`, `<!-->`, `]]></script>`, U+2028, U+2029, comilla + barra invertida, comilla simple y entidad ya escapada. Todos HTTP 200; Next escapa `<` como `<` y los terminadores de línea de JavaScript como ` `/` `; el número de `</script>` de la respuesta sigue siendo exactamente el de los 17 scripts legítimos, y en ninguna respuesta aparece un `alert(n)` fuera de una cadena.
4. **No está en el alcance de la página.** Lo produce Next al serializar los `searchParams` que recibe del framework, aguas arriba de `recortarConsulta`. Sanearlo exigiría normalizar la URL misma (un redirect), que ni la spec pide ni conviene: rompería el "se usa el primer valor" y añadiría un salto de red al Flujo B.

Lo único que hacía falta era **fijar la condición 3**, porque es la que convierte el residuo en inocuo y no depende de nosotros: si una versión futura de Next dejara de escapar `<` o los terminadores de línea de JavaScript, ahí habría un XSS. Queda cubierto por el bloque de tests nuevo `el eco no puede salirse de su literal ni del script` (10 pruebas).

## M-2 · Cerrado, con una cota que ahora es implícita

El arreglo (`normalizarTexto(cruda).slice(0, 60)`) es correcto y no reintroduce nada: el relleno desaparece antes de gastar la cuota, y lo que llega a la base sigue siendo como mucho 4 raíces de 5 caracteres `[a-z0-9]` (lo verifico inspeccionando los argumentos reales de Prisma).

Confirmo la medición del dev y la extiendo al peor caso que él no midió —texto acentuado, que obliga a descomponer en NFD y cuesta ~10× más que ASCII—:

| Entrada | ms/llamada |
| --- | --- |
| 16 000 `a` | 0.032 |
| 16 000 `é` (peor caso NFD) | **0.362** |
| 16 000 emojis | 0.069 |
| 1 000 000 `a` | 1.759 |
| 1 000 000 `é` | 22.276 |

**Lo que cambió y conviene dejar por escrito:** al caer el recorte previo, el tamaño de entrada ya no lo acota la aplicación sino Node. Lo medí contra el servidor: `?q=` de 16 000 caracteres → 200; de 20 000 → **431**; de 100 000 → **431**. Es decir, el peor caso alcanzable por HTTP es la fila de 0.362 ms, del mismo orden que antes, y la fila de 22 ms es inalcanzable. **La decisión del dev es correcta.** Pero la cota pasó a depender de `--max-http-header-size` de Node: si alguien lo sube, o si mañana hay un proxy delante con otro límite, el techo se mueve sin que nada en este repo lo diga. Lo anoto **dentro de M-4** (es el mismo tema: coste por request de una ruta pública sin cupo), no como hallazgo aparte.

## M-3 · Cerrado a medias — se reabre como **residuo (MEDIO)**

El mecanismo elegido es mejor que las tres alternativas que yo había sugerido, y el razonamiento del dev es correcto: ordenar por longitud o subir el mínimo a 3 no resolvían el caso. Las dos propiedades que él invoca las verifiqué y se sostienen:

- quitar una muletilla solo puede devolver **más** (se deja de exigir una condición);
- si todo es muletilla, se usan tal cual, así que **la lista de términos nunca queda vacía** por este camino y la página nunca pasa a listar el directorio (tests: `quitar muletillas nunca puede vaciar la lista de términos` y `una consulta de puras muletillas sigue sin devolver el directorio entero`).

Y lo que el orquestador pidió comprobar, comprobado:

- `"quien me arregla la cerrajeria"` → `["cerra"]` → **sí encuentra al cerrajero** (mismos resultados que `"cerrajeria"` sola).
- `"futbol infantil"` → `["futbo","infan"]` → **sigue exigiendo las dos**. También verifiqué que `"veterinario espacial"` → `["veter","espac"]` sigue exigiendo ambas, que es de lo que depende el scenario "búsqueda sin coincidencias" de la spec: si el arreglo hubiera descartado "espacial", ese scenario se habría roto en silencio.

**Pero el arreglo cubre una clase y deja otra, más probable en este producto.** La lista descarta el *enunciado de la pregunta*; el `AND` se sigue aplicando a cualquier otra palabra que el negocio no tenga por qué haber escrito. Medido con las fixtures reales:

| Consulta | Términos | Resultados |
| --- | --- | --- |
| `cerrajeria` | `["cerra"]` | 3 |
| `quien me arregla la cerrajeria` | `["cerra"]` | 3 ✅ (arreglado) |
| **`cerrajeria en Tizayuca`** | `["cerra","tizay"]` | **0** |
| **`plomero en Huicalco`** | `["plome","huica"]` | **0** |
| **`plomero barato`** | `["plome","barat"]` | **0** |
| **`doctor 24 horas`** | `["docto","24","horas"]` | **0** |
| **`tacos cerca de mi casa`** | `["tacos","casa"]` | **0** |
| **`necesito un plomero urgente hoy`** | `["plome","urgen","hoy"]` | **0** |

El caso que más me preocupa es el primero: **el nombre del municipio**. El producto se llama NecesitoUno **Tizayuca**, el `h1` de la home lo dice y el dominio lo dice; que un vecino escriba "cerrajería en Tizayuca" y reciba cero es lo primero que va a pasar en una demo. Los toponímicos son además la palabra con **menos** poder discriminante posible aquí —todo el directorio es Tizayuca—, así que encajan en el propio criterio del dev ("describe la pregunta, no al negocio") y añadirlos a la lista sería coherente y barato. Lo de la colonia (`Huicalco`) es distinto: `proposal.md` deja "búsqueda por colonia como término" explícitamente fuera de alcance, y eso está bien; pero "fuera de alcance" debería significar "no filtra por colonia", no "devuelve cero".

**Por qué es MEDIO y no bloquea:** el comportamiento es **conforme a la spec** (requirement "varias palabras se exigen todas", aprobado en la duda 3 de la propuesta), no tiene ninguna implicación de seguridad ni de privacidad, y la mitigación que la spec sí exige está puesta y verificada: la página no truena, dice "No encontramos negocios para…" y ofrece las 8 categorías como salida. Es una decisión de producto, no un defecto que yo pueda declarar. La dejo escrita con datos para que se tome a sabiendas, porque la lista de muletillas da la sensación de haber cerrado el tema y solo cerró la mitad.

Test pin añadido: `RESIDUO M-3 (pin): una palabra con contenido que el negocio no escribió sigue devolviendo cero`, que además comprueba que la salida por categorías está puesta.

## B-1 · Cerrado. La asimetría con el seed **me convence**

`prisma/guardas-entorno.ts` comparte lo que tenía que compartirse (cómo se reconoce un entorno peligroso) y deja la política en cada script, que es la separación correcta.

Sobre la diferencia deliberada —`BACKFILL_PERMITIR=1` sí abre producción, `SEED_DEMO_PERMITIR=1` no—: **es la decisión correcta y está bien argumentada.** Sembrar negocios de mentira en producción no tiene caso de uso legítimo, así que ahí la puerta debe estar tapiada. Rellenar sí lo tiene: es literalmente la operación que hay que correr una vez en producción después de aplicar la migración, o las fichas que ya existían quedan invisibles en el buscador. Una guarda sin escape habría sido una trampa operativa que el operador acabaría sorteando editando el script —peor que no tenerla—. Y el riesgo residual es mínimo: el relleno es idempotente y no destructivo (recalcula columnas derivadas a partir de la misma fila, sin tocar ningún otro campo), así que el peor caso de correrlo contra la base equivocada es no hacer nada. Verifiqué también que el permiso se evalúa **antes** que las dos comprobaciones —que es lo que lo hace un escape real y no un adorno— y que sin él la ejecución directa sale con código 1 sin escribir.

Sin objeciones.

## B-3 · NUEVO (BAJO) · Dos archivos de test son **binarios para git**

`tests/buscador-adversarial.test.ts` (4 bytes de control crudos, líneas 90-91) y `tests/busqueda.test.ts` (2 bytes, línea 82) tienen caracteres de control **literales** en el código fuente (`0x00`, `0x01`, `0x02`, `0x03`, `0x1b`) en vez de secuencias de escape. Consecuencia comprobada:

```
$ git diff --stat
 tests/buscador-adversarial.test.ts | Bin 0 -> 9647 bytes
 tests/busqueda.test.ts             | Bin 0 -> 10102 bytes
```

Git los clasifica como **binarios**: en el PR aparecerán como "Binary file differs" y **el revisor humano no podrá leerlos**. Dado que aprobar el PR es uno de los dos puntos de control humanos que `CLAUDE.md` dice que no se saltan nunca, dejar sin revisar dos suites de seguridad es justo lo que no conviene. Además `grep`, `git blame` y los diffs futuros quedan ciegos sobre esos archivos.

Arreglo trivial y sin cambio de comportamiento: usar las secuencias de escape de TypeScript (`"\u0000"`, `"\u001b"`, …) en vez del carácter literal. **Mi propio archivo tenía uno** (un NUL en la lista de consultas caras) y ya lo corregí: `tests/buscador-seguridad-adversarial.test.ts` vuelve a ser texto para git. Los otros dos son del dev y no los toco.

## Tests añadidos en esta iteración

Sobre `tests/buscador-seguridad-adversarial.test.ts`, que pasa de 49 a **78 pruebas, todas en verde**. Los 3 pins de la etapa C quedaron correctamente **invertidos** por el dev (verificado: ahora afirman `not.toMatch(/[\p{Cc}\p{Cf}]/u)` sobre `h1` y `value`, y comprueban las parejas suplentes en las dos direcciones, alta y baja); no los volví a tocar.

| Bloque nuevo | Pruebas | Qué fija |
| --- | --- | --- |
| `el eco no puede salirse de su literal ni del script` | 10 | los 9 vectores de fuga del payload RSC (cierre de `<script>`, mayúsculas, comentario HTML, CDATA, U+2028, U+2029, comillas, barra invertida, entidad) — es la condición de la que depende que el residuo de `U+202E` sea inocuo |
| `las muletillas no debilitan la búsqueda` | 5 | frase enunciada = palabra sola; palabras con contenido siguen exigiéndose todas; la lista de términos nunca queda vacía; puras muletillas no devuelven el directorio; **residuo M-3 (pin)**; y que las muletillas no son atajo a fichas sin publicar |
| `el arreglo de M-2 no aflojó la cota real` | 3 | 5 rellenos hostiles ya no se comen la consulta **pero tampoco cuelan más términos**; el tope de 60 se aplica al texto normalizado; el coste del peor caso alcanzable (16 KB acentuados) con techo de 20 ms |

## Veredicto de la iteración 2

**Limpio: 0 críticos, 0 altos.** Pasa al validador.

M-1, M-2 y B-1 quedan cerrados y verificados de forma independiente (no me apoyé en los tests del dev: medí bytes sobre respuestas reales, apliqué las migraciones desde cero y ataqué el payload RSC con 9 vectores). El residuo de `U+202E` es **inocuo** y queda documentado con la condición que lo mantiene inocuo fijada en tests. Queda un **residuo de M-3 (MEDIO, producto, conforme a spec)**, las dos deudas que el orquestador ya decidió mandar a backlog (M-4, B-2) y un **B-3 nuevo** de higiene que conviene arreglar antes del PR porque afecta a la revisión humana.
