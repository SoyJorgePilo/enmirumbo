# Etapa C (seguridad y pruebas) — `agregar-analitica-cookieless`

**Ticket:** `docs/tickets/T-010-analitica.md` · **Rama:** `feature/agregar-analitica-cookieless` (árbol principal)
**Entradas:** `proposal.md` (con las 3 dudas resueltas), `design.md`, los 3 deltas de spec, `reports/b-dev.md` y `git diff main` + no rastreados.

> **ESTADO FINAL tras la iteración 3 (2026-09-04): LIMPIO — pasa al validador.**
>
> **0 críticos · 0 altos · 0 medios · 1 observación menor no bloqueante (O-2, redacción de un scenario).**
>
> Los seis hallazgos de las dos rondas (A-1, A-2, M-1…M-4) están **cerrados y re-verificados de primera mano**: §8 la ronda 1, §9 la ronda 2 y la cadena completa medida contra el tracker real.

---

## Iteración 1 (2026-09-03) — hallazgos originales

**Veredicto de la iteración 1: BLOQUEA el pase al validador.** 0 críticos · **1 alto** · 4 medios. *(Los cinco quedaron cerrados en la iteración 2; se conservan por trazabilidad.)*

| Severidad | # | Hallazgos | Estado |
|---|---|---|---|
| Crítico | 0 | — | — |
| **Alto** | **1** | A-1 · el `referrer` lleva `/admin/registros/<id>` al proveedor | **cerrado** (§8) |
| Medio | 4 | M-1 (404 con nodo `<script>` del proveedor en el DOM), M-2 (`document.title` es un tercer canal no declarado), M-3 (modelo de confianza sin CSP y sin dejar la deuda por escrito), M-4 (el tracker secuestra el clic de "Llamar") | **cerrados** (§8) |

**Etapa A (ui) saltada: confirmado que era correcto.** El diff no estrena ninguna pantalla, ningún texto para el vecino, ningún banner y ningún cambio visual: `tarjeta-negocio.tsx` y `botones-contacto.tsx` solo suman atributos `data-*` invisibles (ninguna clase, ningún nodo nuevo) y lo único que se agrega al documento es una etiqueta `<script>` sin representación visual. La mudanza a `(publico)` no cambió una sola URL (lista de rutas del build idéntica, verificada abajo).

---

## 1. Cómo se auditó

Además de la lectura del diff, se montó un banco de pruebas para responder con hechos y no con lecturas de documentación:

1. **Tracker real del proveedor descargado** (`https://cloud.umami.is/script.js`, 4 717 bytes, 2026-09-04) y leído entero. De ahí salen A-1, M-2 y M-4: es el único modo de saber **qué manda** el script que este change inyecta.
2. **Proveedor falso en TLS**: servidor HTTPS local con certificado propio que sirve el tracker real y captura los `POST /api/send`, con Chrome apuntado ahí (`--host-resolver-rules`, `--ignore-certificate-errors`). Así se leyó el **payload literal** que sale del navegador.
3. **Navegador de verdad** (Chrome headless, `--dump-dom`) contra `next start` con y sin variables, para ver el DOM **después de hidratar** — que es donde el HTML servido deja de contar la historia completa.
4. Build desde cero (`.next/` borrado, como avisó el dev) con y sin configuración.

**Payload capturado en `/buscar?q=quiero abogado por mi divorcio`:**

```json
{"type":"event","payload":{"website":"1111…","screen":"800x600","language":"es-419",
 "title":"NecesitoUno Tizayuca — Encuentra negocios y servicios en Tizayuca",
 "hostname":"localhost","url":"http://localhost:3000/buscar","referrer":""}}
```

**La cadena de consulta NO viaja: confirmado con el dato en la mano**, no solo con el atributo en el HTML. El requisito de privacidad que no se negociaba se cumple.

---

## 2. Hallazgos

### A-1 · ALTO — El `referrer` entrega al proveedor las URLs de `/admin/registros/<id>`

**Dónde:** `src/components/header.tsx:12-20` y `src/components/footer.tsx:17-28` (enlaces a rutas públicas presentes en TODA pantalla del panel, porque los pinta `src/app/layout.tsx:17-21`), contra `src/app/(publico)/layout.tsx:20-27` (el tronco que sí mide).

**Qué pasa.** La exclusión de `/admin` se diseñó como "por construcción" y así funciona **para la etiqueta `<script>`** (verificado: `/admin` y `/admin/cola` sirven 0 menciones al proveedor). Pero el evento que el tracker manda en cada carga incluye un campo `referrer`, y el tracker trata especial a los referentes del mismo origen: en vez de descartarlos, **los manda como ruta**.

Código del tracker vigente (`cloud.umami.is/script.js`, capturado hoy):

```js
C=()=>({ website:S, screen:R, language:n, title:c.title, hostname:h, url:Y,
         referrer:(t=Z, t===p || t?.startsWith(p+"/") ? t.slice(p.length) : t) })
// Z = B(document.referrer); p = location.origin  →  mismo origen ⇒ se envía "/la/ruta"
```

**Escenario concreto de fuga.** El admin está en `/admin/registros/cmtm9nn07…` revisando el registro de una persona. Abre el sitio público en otra pestaña con el clic de siempre —Cmd/clic central/"Abrir en pestaña nueva"— sobre el logo del encabezado o sobre "Aviso de privacidad" del pie, que están en esa misma pantalla y **no llevan `rel="noreferrer"`**. Esa navegación sí es de documento (Next no la intercepta con modificadores; y sin JS hidratado, `<Link>` es un `<a>` normal), así que la página pública carga con `document.referrer = https://sitio/admin/registros/cmtm9nn07…` y el tracker manda al proveedor `referrer: "/admin/registros/cmtm9nn07…"`.

**Por qué es alto.** El requirement "El panel del admin queda fuera de la medición" no dice solo "no cargues el script": dice que las URLs del panel **apuntan a un registro concreto de una persona y no tienen por qué llegar a un tercero (PRD §8, LFPDPPP)**. Ese identificador queda almacenado en el proveedor, fuera de nuestro control y de nuestro aviso de privacidad, y llega ahí por el uso normal del panel. El canal `referrer` no se consideró en ningún punto de la spec, el design ni el reporte del dev.

**Verificado / inferido.** Verificado: el campo `referrer` existe en el payload real; el código del tracker que reenvía los referentes del mismo origen como ruta; que las tres anclas a rutas públicas están en el HTML servido de `/admin` sin `rel`. Inferido (comportamiento estándar del navegador, no reproducido con clic automatizado): que una navegación de documento del mismo origen puebla `document.referrer`.

**Arreglo sugerido (lo decide el dev).** Lo más pequeño y robusto es cortar el referente **en origen**, en el panel: `export const metadata: Metadata = { referrer: "no-referrer" }` en las pantallas de `/admin` (como mínimo las de `registros/[id]`), que emite `<meta name="referrer" content="no-referrer">` y cubre cualquier salida futura, no solo estos tres enlaces. Alternativa/complemento: `rel="noreferrer"` en los enlaces del encabezado y el pie, y `Referrer-Policy` para `/admin/*` cuando E0-3 defina cabeceras. **Ojo:** si se resuelve con un `src/app/admin/layout.tsx`, hay que reescribir la aserción de `tests/analitica-exclusion-admin.test.ts:178` (hoy exige que el panel **no tenga** layout propio) para que exija lo que de verdad importa: que ese layout no renderice `ScriptAnalitica`.

---

### M-1 · MEDIO — La 404 sí termina con un `<script>` del proveedor en el DOM (hoy inerte)

**Dónde:** `src/app/(publico)/layout.tsx:20-27` + `src/app/not-found.tsx` (fuera del grupo, por diseño). Es el punto que el dev pidió mirar con ojos frescos (§5 de `b-dev.md`). **Dictamen: el dev tiene razón en lo que importa (no se mide, no sale ninguna petición), pero se queda corto en el diagnóstico.**

Medido con Chrome contra `next start`, en una URL que primero encaja con `/[categoria]` o `/negocio/[ficha]` y luego llama a `notFound()`:

| Observación | Resultado |
|---|---|
| HTML servido | 0 etiquetas `<script>` del proveedor (coincide con el dev) |
| Carga serializada de React | sí menciona `src` e identificador del sitio (coincide con el dev) |
| **DOM después de hidratar** | **sí aparece un `<script defer src="https://…/script.js" data-website-id=… data-exclude-search="true">` real, insertado dentro de `<main>`** |
| Peticiones al proveedor (proveedor falso en TLS, 20 s de presupuesto) | **cero**: el nodo no se ejecuta |
| `POST /api/send` | **ninguno**: la 404 no se mide |

**Lectura.** Lo que se filtra en la carga serializada es información pública por diseño (la URL del script y el identificador del sitio viajan en cada página pública): **no es fuga**. Lo relevante es lo otro: "la 404 no se mide" **no es hoy una propiedad de nuestro código**, sino de cómo React 19.2.8 inserta ese nodo sin ejecutarlo. Nada en la suite lo vigila, así que una subida de React o de Next puede convertir el efecto lateral aceptado en medición real de las 404 sin que nadie se entere — y ahí sí hay un matiz de privacidad: `/negocio/<slug-con-el-nombre>-<id>` responde 404 cuando el negocio **no está publicado** (en revisión, rechazado o, con T-015, borrado por ARCO), y esa URL empezaría a llegar al proveedor. La duda #1 de la aprobación autorizó las URL de fichas **públicas**, no las de las que no lo son.

**Sugerencia:** dejarlo escrito en la spec/design como lo que es (dependencia del comportamiento de React, no invariante propia) y anclarlo con una prueba de HTML servido; o, si se quiere invariante de verdad, el plan B del `design.md` §1 (el script en cada `page.tsx` público) hace que una página que llama a `notFound()` no pinte nada por definición.

---

### M-2 · MEDIO — `document.title` es un tercer canal de datos hacia el proveedor, no declarado en la spec

**Dónde:** contrato del tracker (payload capturado arriba: `"title":"NecesitoUno Tizayuca — …"`), frente a `specs/layout-base/spec.md:45` ("Ninguna otra propiedad DEBE viajar… NO DEBEN viajar nunca el nombre del negocio…").

La spec razona sobre dos canales, las **propiedades del evento** y la **URL** (con `data-exclude-search` para la cadena de consulta). El tracker manda además el **título del documento** en cada envío. Hoy es inocuo y así se verificó: la ficha y `/buscar` no exportan metadata propia, de modo que el título es el estático del layout raíz en las dos.

**Escenario concreto.** El change `agregar-seo-local` (T-009) está en vuelo y su propósito declarado es dar "título, descripción y canónica propios en cada página del directorio". Dos consecuencias que hoy nadie vigila:

1. si `/buscar` estrena el patrón habitual `Resultados para «q» — NecesitoUno`, **el texto libre del vecino sale al proveedor por el título**, con `data-exclude-search` puesto y todo: la protección que la duda #3 consideró innegociable queda evitada por completo;
2. si la ficha estrena `«Negocio» — NecesitoUno`, el nombre del negocio empieza a viajar como `title` (más discutible: la duda #1 ya autorizó el nombre dentro de la URL pública, pero es una decisión que se tomaría sin tomarla).

**Añadido en esta etapa:** un guardián sobre `/buscar` (`tests/analitica-adversarial.test.ts`, caso "la consulta tampoco se cuela por el título de la página") que falla si esa página deja de tener metadata estática. **Falta lo de la spec:** declarar el `title` como canal (junto a URL y propiedades) en el requirement de privacidad y en el ADR-005, para que la próxima persona que toque metadata sepa a dónde va ese texto.

---

### M-3 · MEDIO — Modelo de confianza del script de terceros: sin lista blanca, sin CSP, y la deuda no queda escrita en ningún lado que se lea

**Dónde:** `src/lib/analitica/config.ts:52-58` (`esSrcValido` solo exige `protocol === "https:"`), `src/components/analitica/script-analitica.tsx:37-44`.

La validación es correcta en lo que rechaza —se probó `http:`, `javascript:` (con y sin mayúsculas y espacios), `data:` (texto y base64), `blob:`, `file:`, `ftp:`, protocolo relativo `//`, ruta relativa, `../..`, `https://` a secas y basura sin esquema: **todos rechazados y sin romper la página**— pero **acepta cualquier dominio**. Y como no hay CSP (declarado fuera de alcance) ni SRI posible sobre un tracker mutable, el modelo de confianza real es: *quien controle la variable de despliegue, o el dominio configurado, ejecuta JavaScript arbitrario en todas las páginas públicas*, **incluida `/registro`** (verificado: sirve el script), que es exactamente la pantalla donde el vecino teclea nombre y WhatsApp. Escenario: compromiso del proveedor (o de la variable en el panel de hosting) ⇒ captura de los datos del formulario antes del `submit`, sin tocar nuestro repo y sin dejar rastro en el servidor. No es un defecto de implementación —es la consecuencia inherente de ADR-005— pero **la única mitigación planeada vive hoy en `reports/b-dev.md` §6, un archivo que se archiva al mergear**: `grep -rn "CSP\|Content-Security" docs/ openspec/changes/preparar-deploy-produccion/` devuelve **cero coincidencias**.

Dos precisiones para cuando se escriba esa CSP, porque la nota del dev se queda corta y llevaría a una medición rota en silencio:

- el tracker **no manda los datos al dominio del `src`**: hace `POST` a `https://gateway.umami.is/api/send` (`K = (host-url || "https://gateway.umami.is") + "/api/send"`, verificado también con el proveedor falso). La política necesita `script-src https://cloud.umami.is` **y** `connect-src https://gateway.umami.is`;
- ninguno de los dos dominios está documentado como destino de datos en `.env.example` (solo aparece el del script).

**Sugerencia (no implementar sin spec):** escribir el modelo de confianza y la exigencia de CSP en `docs/decisiones/ADR-005-analitica.md` —archivo que este change ya modifica— y como criterio de T-013/`preparar-deploy-produccion`. Endurecer el `src` a una lista blanca de dominio es barato y consistente con el resto del módulo, pero cambia el contrato de la variable: es decisión de spec.

---

### M-4 · MEDIO — Con la medición encendida, el tracker secuestra el clic de "Llamar" y aplaza la llamada

**Dónde:** `src/components/directorio/botones-contacto.tsx:84-89` (el ancla de "Llamar" no lleva `target="_blank"`, a diferencia de las de WhatsApp y "Cómo llegar").

El tracker no se limita a escuchar: para un `<a>` con `data-umami-event` que **no** abre en pestaña nueva hace `preventDefault()`, manda el evento y solo después navega:

```js
i = target==="_blank" || ctrlKey || shiftKey || metaKey || button===1;
if (!i) e.preventDefault();
return t(a).finally(() => { if (!i) location.href = href });
```

De los cuatro botones instrumentados, tres abren en pestaña nueva y quedan intactos; **"Llamar" (`tel:`) es el único que cae en la rama que espera**. Efecto: con la medición configurada, la llamada no se marca hasta que se resuelve el `fetch` a `gateway.umami.is` —en 4G malo, el escenario que fija el presupuesto del PRD §8, eso es un botón que "no hace nada" durante segundos; con un bloqueador el `fetch` falla rápido y el `.finally` navega igual, pero con un filtro que traga los paquetes la espera es larga—. Contradice de frente el comentario del propio código ("el botón se comporta igual con o sin medición configurada", `src/lib/analitica/eventos.ts:64-66`); el scenario de la spec no se viola porque está redactado *sin* medición, que es justo el caso que no descubre esto.

**Sugerencia:** decidirlo a la vista en vez de por omisión — documentar la consecuencia en el design/ADR y verificarla en el paso humano 25 (tocar "Llamar" en un celular real con la cuenta conectada). No se propone tocar el marcado sin spec.

---

## 3. Lo que se verificó y está bien

- **Fail-safe:** sin variables, cero `<script>`, cero menciones al proveedor y cero peticiones externas en las 8 páginas públicas y en la 404 (verificado con servidor real y en pruebas). Con configuración a medias tampoco pinta nada y avisa una sola vez, **sin repetir el valor** (probado con un `src` que llevaba un `token=` en la consulta: no aparece en el log).
- **`?q=` no sale del sitio:** confirmado en el payload real, no solo por el atributo. `data-exclude-search` existe y funciona (`j=w("exclude-search")==="true"`), y además la exclusión se aplica **también al referente** (`Z=B(document.referrer)`), así que ir de `/buscar?q=…` a una ficha tampoco filtra la consulta por esa vía. Buen hallazgo del dev, confirmado contra el código y no contra la documentación.
- **`/admin` no sirve el script** en ninguna de sus pantallas (HTML servido y DOM hidratado): la exclusión estructural funciona **para el script** (ver A-1 para el otro canal).
- **Peso:** `.next/static` **idéntico con y sin configuración** — 676 KB, 15 archivos en ambos casos — y **cero coincidencias de `umami` o del dominio configurado dentro del bundle de cliente** en las dos variantes: el `src` vive solo en el HTML del servidor. Sin `"use client"` nuevos.
- **Contrato de eventos:** solo `categoria` y `colonia`, siempre `^[a-z0-9-]+$`, con `otra` como única salida para lo que no es slug del catálogo. Sin SQL crudo, sin `dangerouslySetInnerHTML`, sin URL externas nuevas. La proyección creció con `categoriaSlug` y los tres guardianes de privacidad se actualizaron **declarando** el campo (el aviso ya enumera la categoría), no exceptuándolo: correcto.
- **Datos personales:** ningún dato real en código, seeds ni pruebas; `.env.example` sin valores pegados; el aviso del log nombra variables, no valores.
- **Abuso:** el change no abre ninguna superficie de entrada nueva (ni endpoint ni formulario), así que no suma exposición a spam/flooding. Sí suma una **dependencia de salida** hacia dos dominios de terceros en cada carga pública; eso es M-3.

---

## 4. Scenarios sin prueba detectados

| Spec · scenario | Situación | Qué se hizo |
|---|---|---|
| `layout-base` · "una página pública nueva sí queda medida" | **Hueco real.** El mapa del dev lo cubre con pruebas de la dirección contraria (que `/admin` no entre al grupo); ninguna verificaba que **toda** página pública viva dentro del tronco que mide — que es lo que el scenario promete. Es justo la deuda que el propio dev anotó (§6.6) y no cerró. | Cubierto en esta etapa: "toda página del sitio vive o en el grupo (publico) o en /admin" |
| `layout-base` · "lo que escribe el vecino no viaja" | Cubierto solo por la presencia del atributo en el marcado; el efecto real (que la URL enviada no lleve `?q=`) no era verificable en Vitest | Verificado fuera de la suite con el proveedor falso (§1) y anclado por el lado del sitio con el guardián del título (M-2) |
| `layout-base` · "un crawler que no ejecuta JavaScript" / `directorio-publico` · "abrir una ficha cuenta como vista" / `registro-negocio` · "registro exitoso" y "honeypot" | No automatizables aquí (dependen del proveedor). Correctamente delegados al paso humano 25 | Sin acción; se ratifica la delegación |

---

## 5. Pruebas adversariales añadidas

**Archivo nuevo: `tests/analitica-adversarial.test.ts` — 30 casos, todos en verde.** Datos ficticios con serie propia (`7719890`), borrados al terminar. Es el único archivo que esta etapa escribió: no se tocó código de producción.

| Bloque | Casos | Qué ataca |
|---|---|---|
| El `src` hostil | 13 esquemas rechazados (`data:` texto y base64, `blob:`, `file:`, `ftp:`, `javascript:` con mayúsculas y con espacios, `//` relativo al protocolo, `/script.js`, `../../`, `https://` pelado, salto de línea entre esquema y host…) + `..` normalizado + el aviso que no repite el valor | Que un valor raro de despliegue cargue algo o rompa la página |
| Inyección por la etiqueta | `src` con `"></script><script>alert(1)</script>`, identificador con `" onload="` | Que el atributo se pueda romper: React escapa, la etiqueta sigue siendo una y los atributos son exactamente cuatro |
| Texto libre disfrazado de slug | Colonia "Otra" escrita **como slug del catálogo** (`haciendas-de-tizayuca`); nombre de negocio con guiones y **con su propio WhatsApp dentro** | Que un saneado "por forma" deje pasar lo que solo el cableado impide: la propiedad vale `otra` en los tres HTML (listado, resultados, ficha) y ni el nombre, ni el número, ni el id aparecen en ningún atributo |
| Negocio sin publicar | `en_revision` y `rechazado` sembrados en la misma categoría | Que un estado no público aporte un atributo de medición o aparezca en resultados |
| Props hostiles a la tarjeta | `categoriaSlug='"><script>alert(1)</script>'`, colonia con acentos/emoji/espacios | Saneado a nivel de componente, no solo de función pura |
| `/buscar` con consulta hostil | Comillas, marcado, un teléfono, unicode y `U+202E`, renderizado **dentro del tronco público con la medición encendida** | Un solo script, con `data-exclude-search="true"`, y ni un trozo de la consulta en atributos de medición |
| El título como canal | Guardián de metadata estática en `/buscar` | M-2: que un título dinámico filtre `?q=` pese a `data-exclude-search` |
| Frontera de la medición | Toda página en `(publico)` o en `admin`; la 404 fuera del grupo; sin config el tronco no deja rastro | El scenario sin prueba de §4 y el efecto lateral aceptado |

---

## 6. Gates

| Gate | Resultado |
|---|---|
| `npm run lint` | limpio |
| `npm test` | **43 archivos / 1 094 pruebas en verde** (antes de esta etapa: 42 / 1 064 → +1 archivo, +30 casos) |
| `npm run build` | exit 0, `.next/` borrado antes (aviso del dev). Lista de rutas idéntica a la de `main`: ninguna URL cambió |

Verificación extra con `next start` en el puerto 3000, con y sin variables, y con Chrome headless contra un proveedor falso en TLS (§1). Sin commits, sin tocar `src/generated/`, `.claude/worktrees/` ni archivos de otros changes.

---

## 7. Qué falta para pasar al validador

1. **A-1 (alto, bloqueante):** cortar el referente del panel. Decisión y arreglo del dev.
2. **M-1 a M-4 (medios, no bloqueantes por sí solos):** de los cuatro, los dos que conviene no dejar pasar porque se vuelven caros después son **M-2** (declarar el `title` como canal antes de que T-009 estrene metadata; el guardián ya está puesto, pero la spec sigue sin decirlo) y **M-3** (mover la deuda de CSP a un archivo que sobreviva al merge — ADR-005 y T-013 — con los **dos** dominios, `script-src` y `connect-src`).

---

# 8. Re-auditoría de la iteración 2 (2026-09-04)

**Entradas:** `reports/b-dev.md` §8, la enmienda aprobada en `specs/layout-base/spec.md` y el código nuevo (`src/app/admin/layout.tsx`, `src/app/(publico)/buscar/page.tsx`, `src/components/directorio/botones-contacto.tsx`).

**Veredicto: sigue bloqueado.** Los cinco hallazgos anteriores están cerrados y verificados de primera mano —no se dio por bueno nada del reporte del dev—, pero el arreglo de A-1 introdujo un defecto funcional que rompe un requirement ya aprobado de otra capability.

| Severidad | # | Hallazgo |
|---|---|---|
| Crítico | 0 | — |
| **Alto** | **1** | **A-2 · `referrer: "no-referrer"` en el panel rompe los formularios del panel sin JavaScript (HTTP 500)** |
| Medio | 0 | — |
| Menor | 1 | O-1 · las 404 de rutas `/admin/*` que no encajan con ninguna ruta no llevan la política |

## 8.1 A-2 · ALTO (nuevo) — el arreglo del referente rompe las Server Actions del panel sin JavaScript

**Dónde:** `src/app/admin/layout.tsx:30-32` (`metadata = { referrer: "no-referrer" }`), contra `openspec/specs/revision-admin/spec.md:285` — requirement **ya aprobado** "El panel se opera desde el celular y sin JavaScript de cliente innecesario": *"sus formularios DEBEN funcionar sin JavaScript de cliente, igual que el registro público"*, scenario **"el panel funciona sin JavaScript"**.

**La cadena, medida entera:**

1. Un documento con `<meta name="referrer" content="no-referrer">` no solo deja de mandar `Referer`: por la regla de Fetch ("append a request Origin header", paso 3), en un **POST de navegación** el navegador manda **`Origin: null`**. Medido en Chrome con dos páginas idénticas salvo la etiqueta:

   | Política del documento | `Origin` del POST de formulario | `Referer` |
   |---|---|---|
   | *(ninguna)* | `https://…` | ruta completa |
   | **`no-referrer`** (lo implementado) | **`null`** | — |
   | `origin` | `https://…` | solo el origen, **sin ruta** |
   | `strict-origin` | `https://…` | solo el origen, **sin ruta** |
   | `same-origin` | `https://…` | **ruta completa** (no sirve: la fuga de A-1 es del mismo origen) |

2. Next aborta cualquier Server Action cuyo `Origin` no coincida con el host. Reproducido contra el servidor real (`next start`, formulario de acceso del panel, mismo cuerpo `multipart/form-data`):

   | Cabecera | Respuesta |
   |---|---|
   | `Origin: http://localhost:3000` | **303** + `Set-Cookie: nu_panel=…` (entra al panel) |
   | `Origin: null` | **500** |

   Log del servidor: `` `x-forwarded-host` header with value `localhost:3000` does not match `origin` header with value `null` from a forwarded Server Actions request. Aborting the action. `` → `Error: Invalid Server Actions request.`

3. Las pantallas del panel **no tienen ningún componente de cliente** (es un requirement suyo): sus formularios son HTML puro con Server Actions. Con el runtime de React hidratado, el envío va por `fetch`, y ahí el `Origin` **sí** sobrevive a `no-referrer` (medido aparte: `fetch` conserva el origen y solo pierde el `Referer`), así que el panel funciona en el camino normal. **Sin JavaScript —o antes de que hidrate— el envío es un POST nativo y devuelve 500.**

**Escenario concreto.** El admin abre el panel en su celular con el JavaScript deshabilitado, o con una conexión 4G mala que aún no terminó de traer los ~7 chunks: teclea la contraseña, envía y recibe una pantalla de error 500 sin explicación. Lo mismo al aprobar o rechazar un registro. El panel es el único camino para publicar un negocio: es el flujo central del MVP y el escenario "el panel funciona sin JavaScript" es un requirement aprobado, no una preferencia.

**Arreglo sugerido (lo decide el dev): cambiar el valor, no el mecanismo.** `origin` o `strict-origin` cierran A-1 igual de bien —el referente pierde la ruta, que es lo único que había que ocultar: el tracker recibiría `/` en vez de `/admin/registros/<id>`— y **conservan el `Origin`**, así que las Server Actions siguen funcionando con y sin JavaScript. `strict-origin` es el más conservador (además no manda referente al bajar de https a http). Lo que **no** conviene: `same-origin` (no tapa nada: nuestra fuga es del mismo origen) ni `experimental.serverActions.allowedOrigins: ["null"]`, que debilitaría la protección CSRF de todo el sitio para tapar un síntoma.

**Tres sitios que hay que tocar junto con el valor**, o el arreglo se revierte solo:

1. `tests/analitica-exclusion-admin.test.ts:257-258` — hoy exige literalmente `referrer: "no-referrer"` y **prohíbe** cualquier cadena que contenga `origin`, es decir, prohíbe justo los dos únicos valores que cierran la fuga sin romper el panel. La lista de "valores permisivos" tiene que dejar de tratar a `origin`/`strict-origin` como permisivos (no lo son para esta amenaza: ocultan la ruta) y seguir prohibiendo `unsafe-url`, `no-referrer-when-downgrade` y `same-origin`.
2. `openspec/changes/agregar-analitica-cookieless/specs/layout-base/spec.md:50` — la enmienda dice "DEBEN declarar la política `no-referrer`". Al cambiar el valor hay que reescribir la regla por su intención: *la política del panel DEBE impedir que la RUTA salga como referente y NO DEBE anular el `Origin` de los envíos de formulario*.
3. `docs/decisiones/ADR-005-analitica.md:48` — dice que el complemento de `Referrer-Policy` para `/admin/*` "hoy se resuelve con `no-referrer`". Si T-013 copia ese valor a una cabecera, reintroduce este 500 en producción, y a nivel de cabecera es más fácil que se aplique de más.

**Prueba de regresión pendiente (para el dev, cuando fije el valor):** no dejé un caso en rojo a propósito, para no ensuciar la suite del árbol compartido. Lo que hay que anclar es la invariante, no la cadena: *la política del panel oculta la ruta y conserva el `Origin`*, es decir, pertenece a `{origin, strict-origin}` y nunca es `no-referrer`, con el motivo escrito al lado (Server Actions sin JS). La verificación de extremo a extremo (POST nativo con `Origin: null` → 500) no es automatizable en Vitest; queda como paso humano del §25: **entrar al panel con el JavaScript deshabilitado**.

## 8.2 Cierre verificado de los cinco hallazgos de la iteración 1

Nada de esto se dio por bueno leyendo `b-dev.md`: se volvió a medir.

| # | Arreglo | Cómo lo verifiqué yo | Estado |
|---|---|---|---|
| **A-1** | `metadata.referrer` en el layout nuevo del panel | `<meta name="referrer" content="no-referrer">` presente en el HTML servido de `/admin` y `/admin/cola` (con cookie de sesión firmada por el módulo real) y **ausente** en `/`, `/buscar`, `/terminos`: la política es del panel, no del sitio. La herencia de metadata se ve en la carga de React de `/admin/cola`, que declara su propio título y `robots` y **aun así** emite la meta del layout. En navegador: un documento con esa política no manda `Referer` (matriz de §8.1). **El canal queda cerrado** — al precio de A-2 | **cerrado** |
| **M-2** | Título estático en `/buscar` | `/buscar?q=quiero%20abogado` servido → `<title>Buscar — NecesitoUno Tizayuca</title>`, mientras el `h1` sigue devolviéndole la consulta al vecino. El guardián que dejé en `tests/analitica-adversarial.test.ts` fue **reforzado, no debilitado** (ahora exige el título literal y que no dependa de la consulta) y sigue en verde | **cerrado** |
| **M-1** | Diagnóstico corregido + 3 anclas | Las tres anclas son las correctas y son nuestras: la 404 fuera del grupo, **ningún `not-found.tsx` dentro de `(publico)`** (que es el escenario peligroso de verdad) y el canario de versiones `next@16.3.3`/`react-dom@19.2.8` con el mensaje "vuelve a medir la 404". El descarte de las dos alternativas está bien razonado: meter un `not-found.tsx` en el grupo haría que se midieran las URLs de fichas **no publicadas**, que es peor que el efecto que arregla | **cerrado** |
| **M-3** | Modelo de confianza y CSP en `.env.example` y ADR-005 | Ambos archivos lo dicen, con **los dos dominios** y las dos directivas (`script-src cloud.umami.is`, `connect-src gateway.umami.is`) y el aviso de que con una sola la medición se rompe en silencio. Sobrevive al archivado del change. Queda el traslado a T-013, que es del orquestador (ver §8.3) | **cerrado** |
| **M-4** | Evento de "Llamar" en una envoltura `<span class="contents">` | **Medido de nuevo por mi cuenta** con el tracker real y un proveedor falso en TLS, sobre el marcado exactamente como lo sirve la ficha: <br>· envoltura → `defaultPrevented=false` **y** el evento llega completo: `{"name":"llamar","data":{"categoria":"servicios-del-hogar","colonia":"atempa"}}` <br>· evento en el `<a>` (como estaba) → `defaultPrevented=true` <br>Es decir: la llamada ya no espera al proveedor **y** la métrica del PRD §9 se conserva. El `tel:` sigue sin `target` y el diseño no cambia (`display: contents`) | **cerrado** |

## 8.3 La enmienda de spec describe lo implementado (con una salvedad)

Revisada línea por línea contra el código: la enmienda del requirement de privacidad (canales **título** y **referente**) y la del requirement del script (**regla de envoltura** para enlaces que no abren pestaña nueva) describen **exactamente** lo que hay en el árbol, y sus 5 scenarios nuevos son verificables y están cubiertos por tests salvo los dos que dependen del proveedor. Coinciden con el arreglo real:

- "la página de resultados DEBE declarar un título estático" ↔ `TITULO_BUSCAR` en `buscar/page.tsx` ✔
- "el evento DEBE declararse en un elemento envolvente que no sea un enlace" ↔ `<span className="contents">` ✔ (y el test que prohíbe la forma peligrosa en toda la ficha es la regla, no el caso)
- "la política DEBE vivir en el tronco del panel, no en cada enlace" ↔ `src/app/admin/layout.tsx` ✔

**Salvedad (deriva de A-2):** la enmienda fija el **valor** `no-referrer` en vez de la **intención**. Escrita así, la spec obliga al defecto de A-2. Hay que reescribir ese punto como se indica en §8.1.

## 8.4 Observación menor

**O-1 · las 404 de `/admin/*` sin ruta que las reciba no llevan la política.** Medido: `/admin/registros/<id>` inexistente → 404 **con** la meta (la ruta encaja y el layout corre), pero `/admin/registros/<id>/loquesea` o `/admin/cola/algo` → 404 **sin** la meta, y esa URL sí contiene un identificador de registro. Alcance real muy chico: el panel nunca genera esas URLs (todos sus enlaces encajan con una ruta), así que hace falta un enlace roto tecleado o pegado a mano. La cabecera `Referrer-Policy` para `/admin/*` que ya está anotada como complemento en ADR-005 lo cubre de raíz — con el valor corregido de A-2. No bloquea.

## 8.5 Gates de la re-auditoría

| Gate | Resultado |
|---|---|
| `npm run lint` | limpio |
| `npm test` | **43 archivos / 1 110 pruebas en verde**, incluidos mis **30 casos adversariales** (sin tocarlos: el dev reforzó el guardián del título y sigue pasando) |
| `npm run build` | exit 0, `.next/` borrado antes; lista de rutas idéntica |

Verificaciones fuera de la suite: servidor real con y sin variables; cookie de sesión firmada con el módulo real del panel; matriz de políticas de referente en Chrome; POST de Server Action con `Origin` correcto y con `Origin: null`; tracker real contra proveedor falso en TLS para los dos marcados del botón "Llamar". Sin commits; los únicos archivos que escribí siguen siendo `tests/analitica-adversarial.test.ts` y este reporte.

## 8.6 Qué faltaba para pasar al validador (resuelto en la iteración 3, §9)

1. **A-2 (alto, bloqueante):** cambiar el valor de la política del panel a `origin` o `strict-origin` y alinear los tres sitios de §8.1 (test, enmienda de spec y ADR-005). → **hecho: `strict-origin`** (§9).
2. **Traslado de la deuda de CSP a T-013** (era M-3, ahora del orquestador): ADR-005 y `.env.example` la documentan, pero el ticket de despliegue sigue sin criterio de aceptación. Al escribirlo, incluir el valor correcto de `Referrer-Policy` para `/admin/*`.
3. **Paso humano 25**, con dos puntos nuevos: tocar "Llamar" en un celular real, y **entrar al panel con el JavaScript deshabilitado** (la comprobación de A-2 que ninguna suite puede hacer).

---

# 9. Re-auditoría de la iteración 3 (2026-09-04) — cierre

**Entradas:** `src/app/admin/layout.tsx` (política `strict-origin`), `src/app/admin/[...resto]/page.tsx` (comodín del panel), la enmienda del delta reescrita por intención, ADR-005 y los tests nuevos.

**Veredicto: LIMPIO. 0 críticos · 0 altos · 0 medios.** Queda una observación menor de redacción (O-2), que no bloquea.

## 9.1 La cadena completa, medida de punta a punta

No se dio por bueno nada del reporte del dev: se volvió a montar el banco (servidor real con la base de prueba sembrada, cookie de sesión obtenida **iniciando sesión de verdad**, proveedor falso en TLS con el tracker real y Chrome).

**1. El POST nativo —el camino sin JavaScript— vuelve a funcionar.** Formulario de acceso del panel enviado como lo envía un navegador sin hidratar (`multipart/form-data` + el `$ACTION_ID` del HTML servido), con el `Origin` que Chrome manda bajo `strict-origin`:

| Envío | Respuesta |
|---|---|
| `Origin: http://localhost:3000` (lo que manda el navegador con la política actual) | **303 + `Set-Cookie: nu_panel=…` + `Location: /admin/cola`** |

Con esa cookie se recorrieron las pantallas reales del panel: `/admin/cola` **200**, `/admin/registros/<id>` **200** (con el nombre del registro sembrado). El 500 de la iteración 2 ya no es alcanzable: solo lo producía `Origin: null`, y `Origin: null` solo lo produce `no-referrer`, valor que hoy no está en el código y que **ningún archivo del panel puede reintroducir sin romper la suite** (`POLITICAS_PROHIBIDAS`).

**2. Panel → público: lo que recibe el proveedor, en el dato mismo.** Reproducción end-to-end con el tracker real: una página con la ruta `/admin/registros/cmtn4jh6y000aoto9cc9byr0d` navega a una página medida, y se captura el envío al proveedor.

| Política del documento del panel | `referrer` que recibe el proveedor |
|---|---|
| *(ninguna — el estado previo a este change)* | **`/admin/registros/cmtn4jh6y000aoto9cc9byr0d`** ← la fuga A-1, reproducida |
| **`strict-origin`** (lo implementado) | **`/`** — sin ruta, sin identificador |

Y en el mismo navegador, con la misma política, el `Origin` de un POST de formulario llega **intacto** (`https://…`), mientras que con `no-referrer` llega `null`. Las dos condiciones de la invariante se cumplen a la vez: **A-1 cerrado sin reabrir A-2.**

**3. La política cubre todo el panel y nada del sitio público.** HTML servido, con y sin sesión:

| Ruta | Respuesta | `<meta name="referrer">` |
|---|---|---|
| `/admin`, `/admin/cola`, `/admin/registros/<id>`, `.../aprobado`, `.../rechazado`, `.../ya-resuelto` | 200 / 307 | **`strict-origin`** en las seis |
| `/admin/registros/<id>/loquesea`, `/admin/cola/algo`, `/admin/salir-inventado`, `/admin/registros/<id-inventado>` | 404 | **`strict-origin`** — O-1 cerrado |
| `/`, `/buscar?q=algo`, `/terminos`, 404 pública | 200 / 404 | **ninguna** — la política es del panel, no del sitio |

**4. El comodín no rompió nada ni delata nada.** `/admin/cola` y `/admin/registros/<id>` siguen sirviendo sus pantallas (el segmento concreto le gana al comodín, verificado con las URLs reales, no solo por la regla de Next); el comodín responde el 404 normal del sitio ("No encontramos esta página"), **igual con sesión y sin ella**, y **igual para un id que existe y uno inventado** (`404` en ambos): no es un oráculo de enumeración. Solo llama a `notFound()`: no lee la base ni pide sesión, y los dos guardianes del panel lo aceptan como excepción **con el motivo escrito y comprobando que no toca Prisma ni las consultas del panel**.

## 9.2 Los cuatro sitios alineados

| Sitio | Revisado |
|---|---|
| `src/app/admin/layout.tsx` | Declara `strict-origin` y explica **por qué el valor no es intercambiable** (los tres párrafos: qué había que ocultar, qué rompía `no-referrer`, por qué `same-origin` no sirve) y que la cabecera del hosting debe llevar el mismo valor ✔ |
| `tests/analitica-exclusion-admin.test.ts` | Ancla la **invariante**, no la cadena: `POLITICAS_ACEPTABLES = {strict-origin, origin}` y `POLITICAS_PROHIBIDAS` con el motivo de cada una; comprueba las seis pantallas, que ninguna pueda rebajar la política por su cuenta, que el motivo siga escrito en el código, que lo público no la herede y que el comodín exista y sea el único del proyecto ✔ |
| `specs/layout-base/spec.md` (enmienda) | Reescrita **por intención**: "una política que impida que la ruta salga como referente" + "NO DEBE anular el `Origin` de los envíos de formulario", citando el requirement de `revision-admin` que lo obliga, y descartando `no-referrer` y `same-origin` con su razón ✔ |
| `docs/decisiones/ADR-005-analitica.md` | El complemento de `Referrer-Policy` para T-013 lleva ahora el valor y la advertencia de que a nivel de cabecera es más fácil aplicarla de más ✔ |

**La enmienda describe lo implementado**, scenario por scenario: título estático en `/buscar` ✔, envoltura para enlaces que no abren pestaña nueva ✔, política en el tronco del panel ✔, la URL inexistente del panel bajo la política ✔ (scenario nuevo, que es exactamente O-1), y "cerrar el referente no puede romper el panel sin JavaScript" ✔ — este último es el scenario que faltaba y que convierte A-2 en regresión vigilada.

## 9.3 O-2 · Observación menor (no bloquea)

El scenario "el admin sale del panel hacia el sitio público" dice **"la página pública no recibe referente"**. Con `strict-origin` sí recibe uno: el origen pelado, que el proveedor guarda como `/` (medido arriba). La regla que está tres párrafos más arriba es correcta y precisa —lo que se prohíbe es la **ruta**—, pero el THEN, leído solo, describe `no-referrer`, que es justo el valor que rompió el panel. Sugerencia de redacción, para que nadie "corrija" el código hacia el defecto: *"…la página pública recibe como mucho el origen del sitio, nunca la ruta del panel, así que el proveedor no llega a saber de qué registro venía la visita"*. Es una línea de spec; no cambia código ni tests.

## 9.4 Gates

| Gate | Resultado |
|---|---|
| `npm run lint` | limpio |
| `npm test` | **43 archivos / 1 113 pruebas en verde**, con mis **30 casos adversariales** intactos y pasando |
| `npm run build` | exit 0, `.next/` borrado antes; la lista de rutas suma `/admin/[...resto]` y no cambia ninguna URL pública |

Fuera de la suite: servidor real contra la base de prueba sembrada, inicio de sesión real, recorrido de las seis pantallas del panel y de las cuatro familias de URL inexistentes, matriz de políticas de referente en Chrome y captura del envío real al proveedor en los dos escenarios. Sin commits; los únicos archivos que escribí en las tres rondas siguen siendo `tests/analitica-adversarial.test.ts` y este reporte.

## 9.5 Cierre

**El change pasa al validador.** Lo que queda no es de esta etapa:

1. **O-2** (una línea de redacción en el delta), a criterio de quien cierre.
2. **Traslado de la deuda de CSP a los criterios de T-013** (del orquestador): ADR-005 y `.env.example` ya la documentan con los dos dominios, las dos directivas y el valor correcto de `Referrer-Policy`.
3. **Paso humano 25**, con los dos puntos que agregó esta auditoría: tocar "Llamar" en un celular real y **entrar al panel con el JavaScript deshabilitado**.
