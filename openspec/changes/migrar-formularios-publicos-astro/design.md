# Diseño: migrar-formularios-publicos-astro

Base: los design de `migrar-lectura-publica-astro` (§5, cabeceras y middleware; §9, diff) y de `migrar-directorio-publico-astro` (§1, la 404 dinámica con la alternativa B). No se reabren. Las secciones marcadas **(3b)** dejan resueltas decisiones del siguiente change y aquí no se implementan.

Código leído para decidir: Astro 7.3.5 y `@astrojs/vercel` 11.0.11 (versiones del spike). Las rutas citadas son de `node_modules/`.

## 0. Inventario: qué API de Next usa cada pieza

| Pieza (Next) | APIs de Next | En Astro |
|---|---|---|
| `negocio/[ficha]/reportar/page.tsx` | `metadata` (`noindex, nofollow`), `cookies()`, `notFound()`, `searchParams`, `next/link`, Server Action ligada con `.bind(null, negocio.id)` | `src/pages/negocio/[ficha]/reportar.astro` (3a) |
| `negocio/[ficha]/reportar/accion.ts` | `"use server"`, `headers()`, `cookies()`, `notFound()`, `redirect()` | Action `reportar` + PRG en el middleware (3a) |
| `negocio/[ficha]/reportar/gracias/page.tsx` | `metadata`, `params`, `next/link` | `src/pages/negocio/[ficha]/reportar/gracias.astro` (3a) |
| **(3b)** `registro/page.tsx`, `registro/accion.ts` | `force-dynamic`, `headers()`, `cookies()`, `redirect()`, `useActionState`/`useFormStatus` en `FormularioRegistro`/`BotonEnviar` | §4 |
| **(3b)** `registro/gracias/page.tsx` | `searchParams` (`?verificado=1`, `?agotado=1`) | página dinámica sin JS |
| **(3b)** `registro/verificar/*` | `notFound()` tras la bandera, `cookies()`, dos Server Actions, y `src/lib/verificacion/acciones.ts` con `next/headers` y `next/navigation` | §7 |

## 1. El 403 de `checkOrigin`: se apaga y la regla pasa al middleware

**Por qué no se puede envolver.** El 403 de Astro sale de tres sitios, y en ninguno lo ve nuestro middleware:

- `core/middleware/load.js:12-14`: con `checkOrigin` activo, el middleware de origen se pone **delante** del nuestro (`internalMiddlewares.unshift(createOriginCheckMiddleware())`). Cuando rechaza, no llama a `next()`, así que `onRequest` nunca corre.
- `core/pages/handler.js:70` y `actions/handler.js:16`: la misma comprobación se repite al pintar la página y al ejecutar la Action.
- `core/app/origin-check.js:24`: la respuesta es `new Response("Cross-site POST form submissions are forbidden", { status: 403 })`, texto plano en inglés, sin cabeceras.

No hay ningún gancho para cambiar su cuerpo ni sus cabeceras. La documentación de la opción (`types/public/config.d.ts:581-623`) ofrece una sola salida: `checkOrigin: false` y hacer la comprobación uno mismo.

**Decisión: `security.checkOrigin: false` y la regla de Next en `src/astro/origen.ts`, que llama el middleware.**

**Qué compara Next hoy** (`next/dist/server/app-render/action-handler.js:351-370` y `:427-491`; `next.config.ts` no declara `allowedOrigins`):

| Caso | Next (Server Action) | Astro con `checkOrigin` | **Esta regla** |
|---|---|---|---|
| Sin `Origin` | procede (solo deja un aviso en el log) | 403 en inglés | **procede** |
| `Origin: null` | `originHost = "null"`, no coincide → lanza → **500** | 403 en inglés | **403 propio** |
| `Origin` malformado | `new URL()` lanza → **500** | 403 en inglés | **403 propio** |
| `Origin` con host distinto de `X-Forwarded-Host` (su primer valor) o, si no viene, de `Host` | lanza → **500** | 403 en inglés (compara contra `url.origin`) | **403 propio** |
| `Origin` con el mismo host | procede | procede | **procede** |

- **La regla:** se toma el host de `new URL(origin).host`. Se compara contra el primer valor de `X-Forwarded-Host` o, si no viene, contra `Host`, igual que `parseHostHeader`. Solo se compara el host, no el esquema, también igual que Next. No se agrega ninguna lista de orígenes permitidos.
- **El alcance es el de Astro, no el de Next:** se revisa todo método que no sea `GET`, `HEAD` ni `OPTIONS` en rutas por función, sea Action o no. Es más ancho que Next, que solo revisa Actions, y así no se pierde la protección que ya daba Astro en 2a y 2b. La única diferencia observable contra Next es un POST de otro origen a una ruta sin Action (`/`, `/api/foto/…`): Next responde la página o el 405, y aquí responde el 403. No escribe nada en ninguno de los dos casos.
- **POST sin `Origin`:** procede, como en Next y como pide el `it.fails` "[T-024] POST sin Origin responde como Next (405 con las cuatro)". Los navegadores actuales siempre mandan `Origin` en un POST de formulario, así que la falta de `Origin` es un cliente hecho a mano, que no puede llevar las cookies de otra persona. No abre una vía de CSRF. **Duda 2** para el humano: si se prefiere el rechazo de Astro.
- **El `Referrer-Policy` que mordió dos veces (T-010, T-014)** solo produce `Origin: null` cuando la página del formulario declara `no-referrer`. Las de este change heredan `strict-origin-when-cross-origin`, que conserva el `Origin`. El guardián de referente por ruta sigue igual.

**La respuesta 403.** Es un documento completo en español dentro de `DocumentoBase` (header y footer), con:

- estado 403 y `noindex`;
- sin medición, con su comentario `// fuera de la medición: <motivo>` (es una respuesta a un envío, no una visita);
- las cuatro cabeceras y `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`;
- **ningún dato de la petición**: ni el `Origin`, ni el host, ni la ruta, ni lo que se envió.

Textos propuestos (**duda 1**: no existían, porque hoy Next responde un 500):

- `h1`: "No pudimos recibir tu envío"
- párrafo: "Vuelve a abrir la página e inténtalo otra vez."
- un único enlace: "Ir al inicio", hacia `/`

**Mecanismo sugerido para pintarla.** El dev lo mide y lo reporta si no funciona:

1. El middleware pone `context.locals.envioRechazado = true` y hace `context.rewrite()` hacia una página dinámica propia.
2. Esa página, si no trae la marca, responde igual que una dirección inexistente (`/a/b/c`), así que la URL no existe para nadie más.
3. La marca no la puede poner el cliente: el adaptador solo acepta `locals` por cabecera con el secreto del middleware (`@astrojs/vercel/dist/serverless/entrypoint.js:46-51`).
4. El middleware fija el 403 sobre la respuesta reescrita.
5. Si la página publica un segmento, ese segmento entra a `SEGMENTOS_RESERVADOS`.

Si `rewrite` no sirve con POST, el dev lo reporta antes de buscar otra vía. Lo que no se negocia es el contrato: español, documento base, las cuatro cabeceras y ningún 500.

**Orden en el middleware:**

1. Regla de origen. Si el envío es ajeno, 403 y no corre nada más.
2. Tabla de Actions (§2).
3. Ejecutar la Action y responder el PRG.
4. `next()`.
5. `prepararRespuesta` para todo lo que sale, incluido el 403.

## 2. PRG sin `Referer`: destinos fijos que arma el servidor

- **El patrón de la documentación de Astro no sirve.** Ese ejemplo vuelve al formulario con `context.redirect(Referer)`, y con `strict-origin` el `Referer` es solo el origen, así que se cae en la portada (ADR-013-spike, costo 1b). Tampoco serviría con la política global: el `Referer` lo escribe quien envía.
- **Tabla de Actions** (`src/astro/acciones.ts`), con una entrada por Action: el nombre, el patrón de ruta del que se permite (`/negocio/[ficha]/reportar` en 3a) y cómo se traduce su resultado a un destino.
  - **Solo desde su ruta y solo por formulario.** En el middleware, `getActionContext(context)` da `action.calledFrom` y `action.name` (`actions/runtime/server.js:82-155`). Una Action que llega por `rpc` (`/_actions/<lo que sea>`, `routePattern === ACTION_RPC_ROUTE_PATTERN`), o desde una ruta que no es la suya (por ejemplo, `POST /?_action=reportar` o `POST /negocio/<…>?_action=reportar`), **no se ejecuta**. Se responde igual que una dirección inexistente, sin escribir nada.
  - **La Action valida además su propio `routePattern`, como defensa en profundidad.** Sin esto, Astro ejecuta solo cualquier `?_action=` en cualquier ruta (`core/routing/handler.js:23-31`).
  - Como ninguna Action se llama desde JavaScript del navegador, cerrar la vía RPC no quita nada.
- **Los destinos de reportar** se arman con `construirSegmentoFicha(negocio.nombre, negocio.id)` usando lo que devolvió la base, igual que hoy:
  - **creado, honeypot o tope alcanzado:** `303` a `/negocio/<seg>/reportar/gracias`;
  - **error de motivo o de comentario, cupo o servidor:** `303` a `/negocio/<seg>/reportar?error=<motivo|comentario|cupo|servidor>`;
  - **identificador inservible o negocio no publicado:** el mismo documento 404 que un `GET` a esa URL (`NoEncontradoDinamico`), sin `Set-Cookie` ni escritura. El mecanismo sugerido es fijar el resultado con `setActionResult` y seguir con `next()`. La página vuelve a comprobar la ficha y pinta la 404, y así no se ejecuta la Action dos veces (`actionResultAlreadySet`).
- **El destino nunca sale del envío:** ni del `Referer`, ni de un campo `destino`, ni del `Origin`. Antes de responder, el middleware exige que el destino empiece con `/` y no con `//`. Esto ya lo garantiza el constructor, pero se comprueba como defensa. El estado `303` es el mismo que manda Next al redirigir desde una Server Action en un envío sin JS, y se mide en la tarea 2.
- **CSP:** `form-action 'self'` también se aplica a las redirecciones de un envío. Los destinos son rutas del propio sitio, así que la política no los corta.
- **Recargar** la confirmación no reenvía nada, porque ahí no hay `<form>`. Recargar el formulario con `?error=` es un `GET` y tampoco ejecuta nada.

## 3. Cabeceras, `Referrer-Policy` y cookies en POST, 303, 403 y 404

- **Las cuatro cabeceras** salen en el 200 del formulario, en el 303, en el 403, en la 404 de una ficha no publicada (`GET` y `POST`) y en la respuesta "como dirección inexistente" de la tabla de Actions. Las pone `prepararRespuesta`, que no pisa una cabecera que ya venga.
- **`Referrer-Policy`:** la global, `strict-origin-when-cross-origin`, en todas, igual que Next. Ninguna pantalla de este change necesita una más estricta, porque la URL del formulario lleva el nombre de una ficha **publicada**, que ya es pública. La regla de 2a se conserva: si una respuesta ya trae su política, el middleware no la cambia.
- **`Cache-Control`:**
  - en el 303, el mismo que Next (que fija `no-cache, no-store, max-age=0, must-revalidate` al atender una Action; se mide);
  - en el 403 y en las páginas, el del HTML dinámico.
- **Cookies que sobreviven al middleware.** Astro asocia las cookies al objeto `Response` con un símbolo (`core/cookies/response.js:5-12`). La rama de copia de `prepararRespuesta` (`new Response(body, respuesta)`, para cabeceras inmutables como las de `Response.redirect`) puede perder ese símbolo, y con él el `Set-Cookie` del borrador. Por eso:
  - el 303 se arma con cabeceras mutables (`new Response(null, { status: 303, headers: { Location } })`), no con `Response.redirect`;
  - una prueba exige que el `Set-Cookie` del borrador llegue al cliente en la salida construida;
  - si la copia es inevitable, se copian también las cookies.
- **Atributos del borrador:**
  - Iguales a Next: `HttpOnly`, `SameSite=Lax`, `Path=/negocio/<seg>/reportar`, `Max-Age=120` y `Secure` en HTTPS.
  - El borrado se hace con `Max-Age=0`.
  - Se comparan sin distinguir mayúsculas en el nombre del atributo.
  - La regla de HTTPS (`x-forwarded-proto` o producción) se copia tal cual de `accion.ts`.

## 4. El formulario con JS y sin JS

**Reportar (3a): formulario HTML nativo, sin isla.**

- Hoy ya es un formulario resuelto por el servidor, sin `useActionState`, con los errores por `?error=` y el borrador por cookie.
- En Astro, `FormularioReporte` se pinta en el servidor sin directiva `client:`, con `action={actions.reportar}`, que se convierte en `"?_action=reportar"` (`actions/runtime/client.js:194-195`). Desde `/negocio/<seg>/reportar?error=…` el envío va a `/negocio/<seg>/reportar?_action=reportar`, y con eso la ruta casa con la tabla del §2.
- **Cambio mínimo en `src/components/` (excepción justificada).** El prop `action` hoy es una función, y Astro necesita una URL (ADR-013-spike, costo 3b). El tipo se amplía a `string | ((formData: FormData) => void | Promise<void>)` y se pone `method="post"` solo cuando `action` es una URL. Con una función, React ya fija el método, y ponerlo a mano le arrancaría un aviso. No cambia ningún otro marcado y Next sigue compilando. `git diff src/components/` tiene que mostrar solo eso.
- **Sin el identificador en el formulario.** Next lo serializa en `$ACTION_1:0` como campo oculto en claro (hallazgo M3). En Astro sale del segmento de la URL con `extraerIdDeSegmentoFicha`. Si el envío trae `negocioId`, `$ACTION_*` o `destino`, esos campos se ignoran.
- **Diff:** se aceptan como normalizaciones explícitas (`NORMALIZACIONES_FORMULARIO`, exactamente dos) los atributos `action`, `method` y `enctype` del `<form>`, comparados por su efecto (los dos son POST a la misma ruta), y los `<input type="hidden" name="$ACTION_…">` de Next. Todo lo demás del formulario se compara y el script imprime dónde aplicó cada normalización.

**(3b) Registro: formulario HTML nativo con re-render del error, más un `<script>` acotado.** Opciones evaluadas:

- **A. Isla `client:load` + `useActionState(withState(actions.registrar))`** (`@astrojs/react/dist/actions.js`):
  - **Ventaja:** conserva la UX de hoy con JS.
  - **Costo 1:** con JS, React llama la Action por RPC (`/_actions/registrar`), lo que reabre la vía que el §2 cierra.
  - **Costo 2:** el éxito ya no es un 303, así que el componente tendría que navegar a mano a gracias o a verificar, que es lógica nueva de cliente.
  - **Costo 3:** el estado anterior viaja de ida y vuelta en `_astroActionState`, un JSON que controla el cliente.
  - **Costo 4:** se carga el runtime de React (~191 KB) en `/registro`.
- **B. Recomendada:**
  - `FormularioRegistro` se pinta en el servidor sin `client:`. Postea de forma nativa a `?_action=registrar` con `method="post"` y `enctype="multipart/form-data"`.
  - **Con error,** la respuesta al POST vuelve a pintar `/registro` con `Astro.getActionResult(actions.registrar)` como `estadoInicial`: errores por campo y valores capturados, salvo foto y consentimiento. Es lo mismo que hace hoy Next sin JS ("la respuesta re-renderiza la página con los errores por campo"). No hay PRG en el error, igual que hoy, así que no hace falta almacén de sesión (ADR-013-spike, costo 1c).
  - **Con éxito,** 303 a `/registro/gracias` o a `/registro/verificar`.
  - **El foco** en el primer campo con error lo pone el servidor con `autofocus`, que funciona sin JS (hoy, sin JS, no hay foco).
  - **El ejemplo dinámico y "Enviando..."** quedan en un `<script>` de Astro empaquetado en `/_astro/*.js`, que la CSP admite por `'self'`. Reutiliza `ejemploParaCategoriaElegida` y es exactamente el JS que permite la spec ("JS acotado al campo del ejemplo").
  - **La única diferencia con JS frente a hoy** es que el error llega con una navegación completa en vez de en el sitio. Se acepta como no-regresión: el contenido, los valores conservados, el foco y el aviso son iguales, y quien no tiene JS queda igual o mejor.
  - `FormularioRegistro` y `BotonEnviar` necesitan una variante sin `useActionState`/`useFormStatus`, porque `useActionState` con una URL no se puede usar y una función se pintaría como `action="javascript:…"`. El modo edición de la Fase 4 (`/editar/<token>`) usa el mismo componente, así que 3b debe dejar las dos variantes con el mismo marcado. **Duda 3** para el humano.

## 5. Cupos e IP detrás del proxy

- **Hoy:** el registro, el reporte, la verificación y el panel leen la IP con `ipDeEncabezados(encabezados, process.env.REGISTRO_ENCABEZADO_IP)` (`src/lib/registro/limite-ip.ts:213-233`):
  - solo del encabezado declarado (en Vercel, `x-forwarded-for`, según la spec `despliegue`);
  - de él, el **último** valor;
  - con forma de IP validada;
  - sin la variable, no hay cupo.

  Es la corrección del hallazgo ALTO 1, el alto histórico con `x-forwarded-for`.
- **Astro ofrece `context.clientAddress`, y no se usa.** En el adaptador de Vercel sale de `getClientIpAddress(request)` (`@astrojs/vercel/dist/serverless/entrypoint.js:61`), que toma el **primer** valor de `x-forwarded-for` (`@astrojs/internal-helpers/dist/request.js:1-17`). Si algún salto agrega en lugar de sobrescribir, ese primer valor lo elige el atacante, que es justo la falla que se corrigió.
- **Decisión:** las Actions leen la IP con `ipDeEncabezados(context.request.headers)`, sin cambios en `src/lib/`. Un guardián falla si `clientAddress` aparece en `src/actions/`, `src/middleware.ts`, `src/pages/` o `src/astro/`.
- **Pruebas sobre la salida construida:**
  - variar el primer valor de `x-forwarded-for` en cada envío no evade el cupo (la llave es el último);
  - un último valor sin forma de IP deja la petición sin cupo, como hoy;
  - sin la variable, no hay cupo.
- **Preview (humano):** confirmar que Vercel sobrescribe `x-forwarded-for` (cuatro reportes con un `x-forwarded-for` falso distinto deben agotar el cupo igual).
- **Atomicidad:** `crearReporte` no cambia (cupo en memoria apartado sin ceder turno, y alta condicionada con cerrojo consultivo). La prueba de "catorce simultáneos sobre una ficha y ocho desde una IP" corre contra la salida construida con PostgreSQL. En serverless el cupo en memoria es por instancia, igual que hoy con Next (`docs/despliegue.md` §3.5). La migración no lo empeora.

## 6. Tamaño máximo del cuerpo

- **Hoy:** Next acepta hasta 6 MB en las Server Actions (`next.config.ts`, `serverActions.bodySizeLimit: "6mb"`), para que una foto de hasta 5 MB llegue a la validación propia.
- **Astro:** `security.actionBodySizeLimit` vale **1 MiB** de fábrica (`core/config/schemas/defaults.js:47`). Al pasarse, la Action devuelve `ActionError` `CONTENT_TOO_LARGE`, que no es un 500 (`actions/runtime/server.js:156-179`). Si viene `Content-Length`, el corte se hace sin leer el cuerpo. Si no viene, se lee hasta el límite.
- **Decisión:**
  - **3a:** `security.actionBodySizeLimit: 6 * 1024 * 1024`, por paridad con Next, porque el límite es por sitio y no por Action. Si un reporte se pasa, se trata como error `servidor` y vuelve al formulario con "No pudimos enviar tu reporte. Vuelve a intentarlo en un momento.", sin escribir nada. Hoy Next responde un error genérico; esto es una mejora sin copy nuevo.
    - Ese `ActionError` sale **antes** del manejador de la Action (que nunca corre), así que el destino lo arma la entrada de la tabla del §2 con la misma lectura de la base. Si la ficha no está publicada, la respuesta es la 404 dinámica.
  - **3b:** el registro mapea `CONTENT_TOO_LARGE` al error de foto "Esa foto pesa más de 5 MB. Sube una más ligera.", como hoy.
- **Vercel (preexistente):** las funciones aceptan como máximo **4.5 MB** de cuerpo, y por encima responde la plataforma con su 413, antes de la función: en inglés y sin las cuatro cabeceras. Con Next pasa hoy igual, así que la migración ni lo arregla ni lo empeora. Va a "Fuera de este change" como candidato en `main`. El preview de 3b lo mide.

## 7. (3b) La verificación por SMS con la bandera apagada

- Con la capacidad apagada o mal configurada, `/registro/verificar` responde **lo mismo que una dirección inexistente con la misma forma** (`/registro/loquesea`), en `GET`, en `POST` y con `?_action=…`: el mismo estado, el mismo cuerpo y las mismas cabeceras salvo `Date`.
- El mecanismo es que la página devuelva `new Response(null, { status: 404 })` **antes** de leer la cookie. Astro reencamina eso a la 404 global (`core/routing/handler.js:126-128`), que es la misma que recibe `/registro/loquesea`. No se usa `NoEncontradoDinamico`, porque eso la distinguiría de una ruta que no casa.
- Las Actions `confirmar` y `reenviar`, con la bandera apagada, ni siquiera llegan a ejecutarse: la tabla del §2 las ata a `/registro/verificar`, y su página corta antes. `/_actions/confirmar` responde como cualquier `/_actions/<inventado>`.
- **Sin JS:** las dos acciones siguen siendo formularios nativos, sin ningún `<script>`.
- `src/lib/verificacion/acciones.ts` deja de importar `next/headers` y `next/navigation`. Recibe las cabeceras y las cookies por parámetro y devuelve un destino (`{ tipo: "redirigir" | "no-encontrado" }`) en vez de lanzar `redirect`/`notFound`. La lógica no cambia y sus pruebas conservan las aserciones.

## 8. Riesgos

| Riesgo | Mitigación |
|---|---|
| Apagar `checkOrigin` deja una ruta sin comprobación si el middleware no corre (lo prerenderizado). | Lo prerenderizado no ejecuta Actions (`actions/handler.js:9`) y la CDN no acepta POST. La prueba de origen recorre una ruta de página, un endpoint y la Action. |
| El 403 se pinta con un mecanismo frágil (`rewrite` en POST). | Lo que exige el contrato es el comportamiento y el dev mide el mecanismo (§1). Si falla, se reporta antes de improvisar otro. |
| El `Set-Cookie` del borrador se pierde al copiar la respuesta. | El 303 se arma mutable y una prueba lo fija sobre la build (§3). |
| Una Action se ejecuta desde otra ruta o por RPC. | La tabla del middleware y la comprobación de `routePattern` dentro de la Action. Hay pruebas con `POST /?_action=reportar`, `POST /negocio/<seg>?_action=reportar` y `POST /_actions/reportar` que exigen cero filas nuevas (§2). |
| La llave del cupo la elige el atacante. | `ipDeEncabezados` sin cambios, un guardián contra `clientAddress` y la prueba que rota el primer valor (§5). |
| Las normalizaciones del formulario esconden una diferencia real. | Son una lista explícita de dos, que se imprime. El cuerpo del formulario (etiquetas, radios, textarea, honeypot, botón) se sigue comparando. |
