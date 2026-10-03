# Diseño: migrar-panel-admin-base-astro (Fase 5a)

Base: los design de 2a (`migrar-lectura-publica-astro`: §5, cabeceras y middleware; §9, diff), 2b (`migrar-directorio-publico-astro`: §1, `NoEncontradoDinamico`), 3a (`migrar-formularios-publicos-astro`: §1 origen, §2 tabla de Actions y PRG, §3 cabeceras y cookies, §5 IP), 3b-1 (`migrar-registro-astro`: §4 `src/lib` sin Next, §5 O1) y 3b-2 (`migrar-verificacion-sms-astro`: §2.3 compuerta y destinos cerrados). No se reabren.

Código leído:
- `src/app/admin/{layout,page}.tsx`, `accion-acceso.ts`, `accion-salir.ts`, `cola/page.tsx`, `negocios/page.tsx`, `[...resto]/page.tsx`, `foto/[clave]/[variante]/route.ts`, `registros/[id]/{page,accion-aprobar}.ts(x)`;
- `src/lib/admin/{guarda,sesion,acceso,config,textos}.ts`, `src/lib/cupos/compartido.ts`, `src/lib/seguridad/csp.ts`;
- `src/components/admin/*` (los que reciben `action`);
- `src/middleware.ts`, `src/astro/{acciones,cabeceras,metadatos}.ts`, `src/layouts/DocumentoBase.astro`, `src/pages/envio-rechazado.astro`, `src/astro/componentes/NoEncontradoDinamico.astro`, `astro.config.mjs`;
- los guardianes `tests/admin-acceso.test.ts:307-380` y `tests/admin-adversarial.test.ts:603-693`.

## 0. Inventario de 5a

| Pieza (Next) | APIs de Next | En Astro (5a) |
|---|---|---|
| `admin/layout.tsx` | `metadata.referrer = "strict-origin"` | `src/layouts/DocumentoPanel.astro` (§5) |
| `admin/page.tsx` | `searchParams`, `redirect()` con sesión, `metadata` (`title`, `noindex, nofollow`), `<form action={entrarAlPanel}>` | `src/pages/admin/index.astro` (`prerender = false`) |
| `admin/accion-acceso.ts` | `"use server"`, `headers()`, `cookies()`, `redirect()` | Action `entrar` + `src/astro/panel/acceso.ts` + `ejecutarAcceso` (§2.3) |
| `admin/accion-salir.ts` | `cookies()`, `redirect()` | Action `salir` + `ejecutarSalida` |
| `admin/cola/page.tsx` | `requerirSesionAdmin()`, `metadata`, `BotonSalir action={fn}` | `src/pages/admin/cola.astro` |
| `admin/negocios/page.tsx` | `requerirSesionAdmin()`, `searchParams`, `metadata` | `src/pages/admin/negocios.astro` |
| `admin/[...resto]/page.tsx` | `notFound()` dentro del layout del panel | `src/pages/admin/[...resto].astro` (§1.4) |
| `src/lib/admin/guarda.ts` | `next/headers`, `next/navigation` | sin uso desde Astro; dos cuerpos delegan (§2.3) |

Los nueve componentes de la cola y del listado ya son React puro sin `next/link` (andamio, Fase 1). Solo `BotonSalir` recibe una Server Action.

## 1. Guarda de sesión por construcción

### 1.1 Lo que responde Next hoy (medido en la tarea 2 contra `main` `8d514f5`; `tests/fixtures/next-5a/respuestas.json`)

| Petición | Sin sesión | Con sesión |
|---|---|---|
| `GET /admin`, panel configurado | 200, formulario de acceso | **307 medido** a `/admin/cola`, `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` (también `HEAD`) |
| `GET /admin`, sin configurar | 200, "El panel no está disponible por ahora." y sin campo | igual: con el panel sin configurar, ninguna cookie es sesión (`haySesionValida`) |
| `GET /admin/cola`, `GET /admin/negocios?…` | **307 medido** a `/admin` sin parámetros, con el mismo `Cache-Control` (también `HEAD`) | 200 |
| Action del panel que llama a la guarda | **303 medido** a `/admin` (`aprobar` sin cookie), `Cache-Control: no-cache, no-store, max-age=0, must-revalidate` | ejecuta |
| `entrar` | sin guarda (es la puerta) | sin guarda |
| `salir` | **sin guarda**: borra la cookie y 303 a `/admin?salida=1` | igual |
| `GET /admin/<lo que no existe>` | **404**, sin leer la cookie | **404** |
| `POST /admin/cola` sin `Next-Action` (también `PUT`, `DELETE` y `?_action=` cualquiera) | **307 medido** a `/admin` (Next pinta la página y su guarda redirige) | **200 medido**: pinta la pantalla |
| `/admin/foto/…` (5b) | 404 idéntica a la pública | foto, `no-store` |

Si la medición contradice una celda "esperado", manda lo medido. El dev lo anota en `reports/b-dev.md` antes de implementar.

### 1.2 Decisión: una tabla cerrada de políticas por patrón de ruta, con falla cerrada

`src/astro/panel/guardia.ts` exporta `POLITICAS_DEL_PANEL`, congelada:

| `routePattern` | Política | Qué hace el middleware sin sesión |
|---|---|---|
| `/admin` | `acceso` | deja pasar: la página decide (fail-safe, formulario o 307 a la cola si hay sesión). Solo admite la Action `entrar` |
| `/admin/[...resto]` | `no-existe` | deja pasar **sin leer la cookie**: la página pinta la 404 del panel, con o sin sesión |
| `/admin/cola` | `exige-sesion` | redirige a `/admin`. Excepción única: la Action `salir` |
| `/admin/negocios` | `exige-sesion` | redirige a `/admin` |
| cualquier otro patrón que empiece con `/admin/` | **`exige-sesion` por omisión** | redirige a `/admin` |

- **Se clasifica por `contexto.routePattern`**, el patrón que Astro **va a pintar**, no por el texto de la URL. Así no hay variantes de escritura (`%61dmin`, `//admin`, mayúsculas, barra final) que esquiven la regla: si Astro va a pintar una página del panel, la regla aplica. Si no casa con ninguna página del panel, Astro no la pinta.
- **Excepciones de Action, lista cerrada de dos pares** `(routePattern, nombre)`: `("/admin", "entrar")` y `("/admin/cola", "salir")`. `salir` queda exenta por paridad: Next no la guarda (duda 3). Cualquier otra Action en una ruta `exige-sesion` sin sesión **no se ejecuta ni se lee su cuerpo**: la guarda corre antes que la tabla de Actions.
- **Falla cerrada:** un patrón nuevo bajo `/admin` que nadie dio de alta exige sesión. Además, la prueba del §1.5 falla hasta que se le asigne una política explícita.
- **Lo prerenderizado no pasa por el middleware** (en Vercel lo sirve la CDN). Por eso un guardián exige que ningún archivo de `src/pages/admin/` declare `prerender = true`, y que ningún patrón de la integración de la CDN alcance `/admin` (la prueba de 2a ya lo comprueba; se mantiene).
- **Sesión:** `haySesionValida(contexto.cookies.get(NOMBRE_COOKIE_SESION)?.value, process.env, new Date())`, el mismo módulo puro de hoy (§2). Sin panel configurado siempre es `false`.

### 1.3 La respuesta sin sesión

- `GET` y `HEAD` a una ruta `exige-sesion`: el estado medido (307) con `Location: /admin`, **sin parámetros** (nada de `?destino=` ni identificadores), **sin cuerpo**, sin `Set-Cookie` y con las cabeceras del §5. Next manda ese 307 con su documento de error (sin datos); Astro, sin cuerpo. Estado, `Location`, `Cache-Control` y cookies son iguales: es diferencia aceptada (decisión 5 del fundador, §7).
- `POST ?_action=<cualquiera salvo la exención>` a una ruta `exige-sesion`: 303 a `/admin` (lo que hace hoy la guarda dentro de una Server Action), sin llamar a `action.handler()` y sin leer el cuerpo. Una ráfaga de envíos grandes sin sesión no ocupa memoria.
- Cualquier otro método a una ruta `exige-sesion`: lo que mida Next en la tarea 2, nunca un 200 con datos.
- **Orden en el middleware:**
  1. `isPrerendered`;
  2. la segunda pasada de `envioRechazado`;
  3. la regla de origen (403);
  4. **la guarda del panel**;
  5. `atenderAcciones`;
  6. la página;
  7. la cabecera de referente del panel (§5);
  8. `prepararRespuesta`.

  Un envío de otro origen a `/admin/cola` responde el 403 sin mirar la sesión, como en 3a. La pasada por `/500` (O1 de 3b-1) tiene `routePattern === "/500"` y no entra a la guarda: ahí no se ejecuta nada.

### 1.4 El comodín `/admin/[...resto]`

- **Responde la 404 de no encontrado dentro de `DocumentoPanel`**: el cuerpo de `NoEncontrado`, `noindex` (sin `nofollow`, como Next), el `<meta name="referrer" content="strict-origin">` del panel, sin medición y con estado 404. **No lee la cookie, ni la base, ni la petición**, y responde igual con sesión y sin ella (requisito O-1 de `agregar-analitica-cookieless`).
- **No se reusa `NoEncontradoDinamico` tal cual**, porque no lleva el `<meta>` del panel. Se arma `NoEncontradoDelPanel.astro` con los mismos metadatos de la 404 global más el `referrer`.
- **Contra Next:** si `notFound()` en el panel responde el documento de error vacío (`__next_error__`), se comparan con las tres `NORMALIZACIONES_404_DINAMICA` de 2b, sin agregar ninguna. El `<meta name="referrer">` se compara aparte y **tiene que estar en los dos**.
- **Mientras 5b y 5d no lleguen,** el comodín atrapa también `/admin/registros/<id>` y `/admin/ediciones/<id>` (proposal, "Estado intermedio").

### 1.5 Pruebas que hacen de la guarda una propiedad del código

1. **Enumeración de rutas de la build** (`tests/plataforma-astro-panel-guardia.test.ts`):
   - lee los patrones reales de la salida construida, con el manifiesto del servidor o con un gancho de integración que los vuelque, del mismo tipo que el filtro de rutas que ya usa `astro.config.mjs:39`;
   - falla si un patrón que empieza con `/admin` no está en `POLITICAS_DEL_PANEL`, y si la tabla tiene una entrada sin ruta (lista vieja);
   - mutación: un fixture `src/pages/admin/nueva.astro` hace fallar la prueba y, servido, responde la redirección sin sesión (falla cerrada).
2. **Recorrido sin sesión sobre la build:** cada ruta `exige-sesion` con `GET`, `HEAD` y `POST ?_action=entrar|salir|inventada` responde lo del §1.3, y el cuerpo no tiene nombres, WhatsApp, conteos ni identificadores sembrados. Se repite con:
   - cookie ausente;
   - firma alterada en un carácter;
   - firmada con otro secreto;
   - caducidad vencida por un segundo;
   - caducidad no canónica (`0001…`) y de 16 dígitos;
   - panel sin contraseña, sin secreto o con un secreto de 31 caracteres, aunque traiga una cookie bien firmada.
3. **Las Actions del panel:** toda entrada de `ACCIONES` cuya ruta empiece con `/admin` queda detrás de la guarda, salvo los dos pares de la exención. La prueba los enumera desde la tabla.
4. **Disciplina por archivo** (adaptación de `admin-adversarial` §5 y de `admin-acceso` "toda ruta… invocan la guarda"):
   - cada `.astro` de `src/pages/admin/` y cada pegamento de Action del panel llaman a `exigirSesionAdmin(contexto)` antes del primer acceso de `ACCESOS_A_DATOS` (la misma lista);
   - las excepciones son `index.astro` (acceso), `[...resto].astro`, `entrar` y `salir`, y ninguna toca datos;
   - `exigirSesionAdmin` relee la cookie: **no confía en `locals`**.

## 2. La cookie de sesión en Astro, con la misma firma y el mismo secreto

### 2.1 Lectura y escritura

- **Leer:** `contexto.cookies.get("nu_panel")?.value` → `haySesionValida(valor, process.env, ahora)`. Es el mismo `sesion.ts` de hoy (HMAC-SHA256 de `v1.<caducidad>` con `PANEL_SESION_SECRETO`, `timingSafeEqual`, caducidad canónica). Astro decodifica con `decodeURIComponent`, como Next. El valor (`<dígitos>.<base64url>`) no tiene caracteres que cambien al codificar.
- **Escribir (entrar):** `cookies.set("nu_panel", crearValorDeSesion(secreto), opcionesCookieSesion(esHttps))`, con exactamente `httpOnly`, `sameSite: "lax"`, `path: "/admin"`, `maxAge: 28800` y `secure`. No se agrega ninguna opción.
- **Borrar (salir):** `cookies.set("nu_panel", "", { ...opcionesCookieSesion(esHttps), maxAge: 0 })`. Es el mismo `set` que hace Next, no `cookies.delete`, para que los atributos (`Path` en particular) casen y el navegador la reemplace.
- **El `Set-Cookie` sobrevive al 303:** el PRG se arma mutable (`respuestaDeRedireccion`, 3a §3). Se compara contra Next sin distinguir mayúsculas en el nombre del atributo: `HttpOnly`, `SameSite=Lax`, `Path=/admin`, `Max-Age=28800` (o `0` al borrar) y `Secure` en HTTPS. Si Next agrega `Expires`, se anota como medido.
- **Pruebas:** las cookies se firman en la prueba con `crearValorDeSesion(secretoDePrueba, ahora)` y el mismo `PANEL_SESION_SECRETO` en Next y en Astro. Una cookie emitida por Astro abre el panel de Next y al revés (mismo formato).

### 2.2 HTTPS

La regla de hoy (`guarda.ts:50-58`) es `x-forwarded-proto` (primer valor) igual a `https`, o `NODE_ENV`/`VERCEL_ENV` en `production`. Se lleva tal cual a un módulo puro (§2.3). Ya existe una copia propia en `src/astro/reportar.ts:130`; no se toca y no se agrega una tercera.

### 2.3 `src/lib/`: las únicas líneas autorizadas

| Archivo | Hoy | Después |
|---|---|---|
| **nuevo** `src/lib/admin/peticion.ts` | — | `esPeticionHttps(encabezados: Pick<Headers, "get">, env = process.env): boolean`, con el cuerpo de `sirviendoPorHttps`. `export type AlmacenCookiesPanel = { get(nombre): { value: string } \| undefined; set(nombre, valor, opciones): void }`, que cumplen `cookies()` de Next y `Astro.cookies` |
| **nuevo** `src/lib/admin/entrar.ts` | — | `ejecutarAcceso(formData, encabezados, almacen, env = process.env, ahora = new Date()): Promise<DestinoAcceso>` y `ejecutarSalida(encabezados, almacen): DestinoAcceso`. `type DestinoAcceso = { tipo: "redirigir"; ruta: "/admin" \| "/admin?error=incorrecta" \| "/admin?error=intentos" \| "/admin/cola" \| "/admin?salida=1" }` |
| `src/lib/admin/guarda.ts:50-58` | `sirviendoPorHttps()` lee `headers()` y aplica la regla | `return esPeticionHttps(await headers());`. **Misma firma** |
| `src/lib/admin/guarda.ts` (resto) | `haySesionAdmin`, `requerirSesionAdmin`, `RUTA_*` | sin cambios. Siguen importando `next/*` hasta T-027, porque los usan las pantallas de 5b a 5d que aún viven en Next |
| `sesion.ts`, `acceso.ts`, `config.ts`, `cupos/compartido.ts`, `registro/limite-ip.ts` | — | **ninguna línea** |

- **`ejecutarAcceso` es el cuerpo de `entrarAlPanel`, en el mismo orden**, con cada `redirect(x)` cambiado por `return { tipo: "redirigir", ruta: x }`:
  1. `leerConfiguracionPanel`; si falta, `console.warn` con el motivo y `/admin`;
  2. `ipDeEncabezados(encabezados)` y `avisarSiElLimiteDeAccesoNoAplica`;
  3. `apartarIntentoDeAcceso`; si no queda margen, la línea fija del log y `?error=intentos`;
  4. `contrasenaCorrecta`; si falla, la línea fija del log y `?error=incorrecta`;
  5. `almacen.set(…)` y `/admin/cola`.

  Las líneas del log no cambian ni ganan datos.
- **Envoltorios de Next** (excepción en `src/app/`, como en 3b-1, para que `typecheck` siga en verde hasta T-027): `accion-acceso.ts` llama a `redirect((await ejecutarAcceso(formData, await headers(), await cookies())).ruta)`, y lo mismo `accion-salir.ts`. Ningún otro archivo de `src/app/` cambia.
- **Pruebas:** `tests/admin-acceso.test.ts` deja de simular `next/headers`/`next/navigation` para la lógica y comprueba el destino devuelto, con el mismo número de aserciones o más. Ninguna prueba importa los envoltorios (la spec pide vacío el `grep` de imports de `accion-acceso` y `accion-salir`): se vigilan leyendo su código y con `typecheck` (decisión 6 del fundador).

## 3. El límite de intentos y su llave de IP

- **Nada de la lógica cambia.** `apartarIntentoDeAcceso` sigue igual:
  - 5 intentos por ventana de 10 minutos;
  - apartado **antes** de comparar;
  - cuenta también los aciertos;
  - una transacción con `pg_advisory_xact_lock(hashtext(clave))`, borrado de lo vencido, conteo y alta;
  - llave = HMAC de la IP con el secreto del panel; nunca la IP en claro;
  - respaldo en memoria caliente, que solo manda si la base falla (con un aviso en el log por proceso).

  Así se cerró A4 de T-013: el límite en memoria por instancia serverless dejaba tantos intentos como instancias.
- **IP:** `ipDeEncabezados(contexto.request.headers)` dentro de `ejecutarAcceso`, es decir, el **último** valor del encabezado declarado en `REGISTRO_ENCABEZADO_IP`, con forma validada. **Nunca `clientAddress`**, que en el adaptador de Vercel toma el primero (3a §5). El guardián de `clientAddress` cubre los archivos nuevos (`src/astro/panel/`, `src/pages/admin/`).
- **Pruebas sobre la build con PostgreSQL** (en PGlite se saltan con aviso, como en 3a):
  - **ráfaga:** 20 `entrar` simultáneos de la misma IP declarada, rotando el primer valor de `x-forwarded-for`, entre equivocados y correctos. Resultado: exactamente 5 filas de `IntentoDeCupo` para esa llave, a lo sumo 5 comparaciones, el resto `?error=intentos` y **ningún `Set-Cookie` después del quinto**, aunque la contraseña sea correcta;
  - **dos procesos:** dos servidores de la misma build contra la misma base, 3 intentos en cada uno. El 6.º, en cualquiera, responde `?error=intentos`. Esa es la prueba de A4;
  - **sin `REGISTRO_ENCABEZADO_IP`:** no hay límite y queda un solo aviso `[panel] sin IP atribuible…` por proceso;
  - **ventana:** con las filas envejecidas 10 minutos en la base (sin tocar el reloj de `src/lib/`), se vuelve a entrar;
  - **base caída al contar:** el respaldo en memoria sigue limitando (5 por proceso) y queda un `console.error` sin la IP.

## 4. Login sin enumeración y sin JavaScript

- **Formulario nativo:** `<form method="post" action="?_action=entrar">` con el campo `contrasena` (`type="password"`, `required`, `autocomplete="current-password"`, su `<label for>`, `aria-invalid` y `aria-describedby` con error) y el botón "Entrar". El marcado es el de `admin/page.tsx`, escrito en `index.astro`. Sin isla, sin `<script>`.
- **Destinos cerrados** (`DESTINOS_DEL_ACCESO` en la entrada de la tabla, como en 3b-2): `/admin`, `/admin?error=incorrecta`, `/admin?error=intentos`, `/admin/cola` y `/admin?salida=1`. Cualquier otro destino se trata como `/admin`. Ninguno lleva datos.
- **Sin enumeración:**
  - hay una sola credencial, así que no hay usuarios que adivinar;
  - la respuesta a una contraseña equivocada es la misma con cualquier longitud y contenido, y la comparación va por hash y en tiempo constante;
  - con el margen agotado, la contraseña correcta responde igual que una equivocada (`?error=intentos`);
  - sin configuración, el destino es `/admin` sin decir qué falta (el detalle va solo al log, una vez por proceso);
  - la cookie no se pone en ningún camino que no sea el acierto con margen.
- **`trasFallar`** (un `ActionError` de Astro: cuerpo de más de 6 MiB, cuerpo que no es formulario o falla antes del manejador), para `entrar` y para `salir`: 303 a `/admin`, **sin apartar intento, sin comparar y sin tocar la cookie**. Next responde ahí un error del marco. Es una diferencia aceptada, como en 3b-2 §3. El formulario real no puede producirlo.
- **Pantalla:** `?error=` y `?salida=` (y en el listado `?estado=` y `?pagina=`) se leen como los lee Next en `searchParams`: **un parámetro repetido llega como arreglo y no vale**, con las listas cerradas de `page.tsx` (`incorrecta`, `intentos`; `salida === "1"`). Cualquier otro valor se ignora y no se refleja. Leer el primer valor pintaría un mensaje que Next no pinta (`?error=intentos&error=x`) (decisión 7 del fundador).
- **Con JS:** Next manda la Server Action por `fetch` y navega con el enrutador. Astro recarga un documento chico. Lo que ve el admin es igual: URL, mensaje, campo vacío. Son 0 KB de JS frente al runtime de Next. Es el mismo criterio que 3b-2 §1.3.
- **`salir`:** `BotonSalir` con `action={actions.salir.toString()}` (`"?_action=salir"`) desde `/admin/cola`. 303 a `/admin?salida=1` con la cookie borrada. Después, "atrás" en el navegador pide `/admin/cola` sin cookie y recibe la redirección: con `no-store` (§5) no hay copia en caché que mostrar.

## 5. Cabeceras, referente, caché, no indexación y medición

- **Las cuatro cabeceras** de `cabecerasDeSeguridad()` en toda respuesta de la función: 200, 303, 307, 403, 404 y 500. Las pone `prepararRespuesta`, que no pisa una cabecera que ya venga.
- **`Referrer-Policy: strict-origin`:**
  - en el middleware, **antes** de `prepararRespuesta`, a toda respuesta cuya ruta (el `pathname` decodificado y en minúsculas, sobre-inclusivo a propósito) sea `/admin` o empiece con `/admin/`;
  - como la regla de 2a es no pisar, la global ya no la sobrescribe;
  - cubre por construcción las respuestas sin documento del panel: los 307 y 303, el 403 de origen y la 404 de una Action pedida desde otra ruta, que se pinta con `/envio-rechazado` y no lleva el `<meta>`;
  - **por qué `strict-origin` y no otro valor** (`admin/layout.tsx`): oculta la ruta (`/admin/registros/<id>`) sin hacer que el navegador mande `Origin: null` en los POST, lo que con `no-referrer` rompía los formularios sin JS (T-010, T-014). `same-origin` no sirve, porque la fuga es del mismo origen;
  - es diferencia contra Next (duda 1): allá la cabecera es la global y el `<meta>` la endurece.
- **`<meta name="referrer" content="strict-origin">`** en el `<head>` de cada pantalla del panel, incluida la 404 del comodín, por `DocumentoPanel.astro`. `src/astro/metadatos.ts` gana `referrer` en `MetadatosDePagina`, y su posición en el `<head>` es la que mida el fixture de Next.
- **`DocumentoPanel.astro`** envuelve a `DocumentoBase` (mismo header, footer y hoja de estilos que el layout raíz de Next) con:
  - `robots: { index: false, follow: false }` por omisión en las pantallas; la 404 del comodín lleva solo `noindex`, como Next (decisión 4 del fundador; agregar `nofollow` sería una diferencia nueva);
  - `referrer: "strict-origin"`;
  - el comentario `// fuera de la medición: <motivo>`.

  No puede llevar `TroncoPublico` ni `ScriptAnalitica`: el guardián de 2a sobre `src/pages/admin/**` ya lo prohíbe, incluso declarando motivo. La lista exacta de exclusiones de `analitica-exclusion-admin` suma `DocumentoPanel.astro` y `NoEncontradoDelPanel.astro`.
- **Caché:**
  - 200 y 404 de las pantallas: `private, no-cache, no-store, max-age=0, must-revalidate` (`CACHE_DE_HTML_DINAMICO`, el de Next);
  - 303: `CACHE_DE_ACCION`;
  - 307: el que mida Next, que tiene que incluir `no-store`; si no lo incluye, se reporta antes de decidir.

  **Ninguna respuesta bajo `/admin` sale sin `no-store`.** Nada del panel se prerenderiza ni lo sirve la CDN.
- **Fuera del sitemap y sin enlaces desde lo público:** se mantienen los guardianes existentes y se suma `/admin*` al recorrido del sitemap construido.
- **Títulos:** los de Next tal como se sirven ("Panel de revisión — EnMiRumbo", "Registros por revisar — Panel de revisión", "Todos los negocios — Panel de revisión", con la plantilla del sitio si Next la aplica). `TITULO_PANEL` hoy se exporta desde `src/app/admin/page.tsx`. Se exporta además, con el mismo valor, desde `src/astro/panel/metadatos.ts` (no desde `src/lib/`), y `marca-guardian` lee el de Astro y comprueba que los dos coinciden mientras exista el de Next.

## 6. La regla de origen y el candado de Actions

- **Origen (3a §1), sin cambios:** todo `POST` a `/admin*` con `Origin` ajeno, `null` o malformado recibe el 403 en español sin ejecutar nada, sin mirar la sesión y sin apartar intentos. Sin `Origin`, procede. Además del anti-CSRF del `SameSite=Lax`, esto cierra el *login CSRF* (forzar a un navegador a entrar).
- **Tabla de Actions:** `entrar → "/admin"` y `salir → "/admin/cola"`, con sus destinos cerrados (§4). La vía RPC `/_actions/entrar` y `/_actions/salir` es la 404 de la CDN (fuera de la tabla de Vercel desde 3a). Desde otra ruta, con otro nombre o sin `calledFrom === "form"`, se trata como dirección inexistente: no se aparta intento ni se toca la cookie. Cada Action comprueba además su propio `routePattern`.
- **Interacción con la guarda:**
  - `POST /admin/negocios?_action=entrar` sin sesión: la guarda responde 303 a `/admin` sin ejecutar;
  - con sesión: la tabla lo responde como inexistente;
  - `POST /admin?_action=salir`: inexistente (salir solo vive en `/admin/cola`).

## 7. Diff de HTML contra Next, con sesión firmada a mano y sin ella

Es el método de T-005, T-015 y T-018 del desarrollo original: misma base sembrada con datos ficticios (serie `771999xxxx`), mismo `PANEL_CONTRASENA` y `PANEL_SESION_SECRETO` de prueba en las dos builds, y la cookie firmada en la prueba con `crearValorDeSesion`.

- **Rutas y estados:**
  - `/admin`: sin configurar, sin secreto, configurado sin sesión, `?error=incorrecta`, `?error=intentos`, `?error=x`, `?salida=1`, `?error=x&error=intentos`, y con sesión (307);
  - `/admin/cola`: vacía; con altas, ediciones, una despublicada, atrasadas (50 h) y al día (3 h); con y sin negocios reportados (1 y 3 reportes); con una ficha verificada por SMS;
  - `/admin/negocios`: vacío; 60 registros; `?estado=` con `publicado`, `rechazado`, `en_revision`, `xyz`, vacío y repetido; `?pagina=` con `2`, `99`, `0`, `-3`, `dos` y repetida;
  - `/admin/x`, `/admin/registros/<id>/loquesea` y `/admin/a/b/c`, con y sin sesión;
  - cada ruta `exige-sesion` sin sesión (estado y `Location`).
- **Tiempos relativos:** las siembras usan desfases lejos de los cortes (3 h, 50 h, 8 meses) y las dos capturas se hacen en el mismo minuto.
- **Normalizaciones: ninguna nueva.**
  - El formulario de acceso y `BotonSalir` usan las dos `NORMALIZACIONES_FORMULARIO` de 3a (atributos del `<form>` comparados por su efecto y los ocultos `$ACTION_*` de Next), con su salida impresa.
  - El comodín usa las tres `NORMALIZACIONES_404_DINAMICA` de 2b, solo si Next responde el documento de error.
  - Cualquier otra diferencia sale como diferencia y el dev la reporta sin normalizarla.
- **Cabeceras:** se comparan las cuatro, `Cache-Control`, `Content-Type` y los atributos de `Set-Cookie`. Diferencias aceptadas:
  - `Referrer-Policy` bajo `/admin` (§5, duda 1);
  - el cuerpo del 307 sin sesión: Next manda su documento de error, Astro va sin cuerpo; estado, `Location`, `Cache-Control` y cookies iguales (§1.3, decisión 5 del fundador);
  - origen ajeno o `null`: Next 500, Astro 403 (3a);
  - el `ActionError` del §4.
- **Envíos** con el arnés sin JS de 3a contra las dos builds: entrar bien, mal, con margen agotado, sin configurar, y salir con y sin sesión. Se compara la cadena de estados, el `Location`, el `Set-Cookie` y las filas de `IntentoDeCupo`.

## 8. Qué se retira de Next, y cuándo: solo en T-027

- **Se retira entonces** lo que 5a reemplaza:
  - `src/app/admin/layout.tsx`, `page.tsx`, `accion-acceso.ts`, `accion-salir.ts`;
  - `cola/page.tsx`, `negocios/page.tsx` y `[...resto]/page.tsx`;
  - de `src/lib/admin/guarda.ts`: `haySesionAdmin`, `requerirSesionAdmin` y `sirviendoPorHttps`, con sus imports de `next/*`, cuando 5b a 5d hayan dejado sin usuarios a esas funciones en `src/app/`.
- **No se retira:**
  - `src/lib/admin/peticion.ts` y `entrar.ts`;
  - los componentes (React puro, pintados por Astro). `BotonSalir.action` puede volver a ser solo `string`;
  - `src/lib/admin/{sesion,acceso,config}.ts`.
- **En 5a no se borra nada de `src/app/`.** Next sigue compilando y sirviendo su panel en su build hasta el corte.

## 9. Pruebas que hoy importan piezas de 5a desde `src/app/admin/`

- **Pasan a probar Astro**, con el mismo número de aserciones o más y sin `skip` nuevos:
  - `admin-acceso`;
  - `admin-listado-paginas`;
  - `admin-listado-seguridad-adversarial`;
  - de `admin-paginas`, `layout`, `analitica-exclusion-admin`, `admin-adversarial`, `admin-reportes-paginas` y `marca-guardian`, las partes cuyo sujeto es el acceso, la cola, el listado, el layout o el comodín;
  - `iteracion2-seguridad-adversarial:476` y `despliegue:578` (que leen `admin/layout.tsx`): pasan a leer `DocumentoPanel.astro` y la regla del middleware.
- **Se quedan, en una lista explícita de excepciones que 5b, 5c y 5d achican**, las pruebas cuyo sujeto es una pantalla posterior y que solo usan `ColaAdminPage` de Next como comprobación (`gestion-panel`, `admin-despublicar-borrado`, …).
- **Al terminar 5a,** el `grep` de imports de `src/app/admin/{page,accion-acceso,accion-salir,layout,negocios/page,[...resto]/page}` en `tests/` sale vacío, y el de `cola/page` solo aparece en los archivos de esa lista.

## 10. Riesgos

| Riesgo | Mitigación |
|---|---|
| Una ruta nueva del panel nace sin guarda | Falla cerrada en la tabla y la prueba de enumeración sobre la build (§1.5) |
| La guarda corre después de leer el cuerpo o de la Action | Va antes de `atenderAcciones`. Prueba: un `POST /admin/cola?_action=inventada` de 7 MiB *chunked* sin sesión responde la redirección y la sonda de lecturas de 3b-1 cuenta 0. Mutación: moverla después hace fallar la prueba |
| Se confía en `locals` en vez de la cookie | `exigirSesionAdmin` relee la cookie, y un guardián prohíbe leer `locals.sesion*` en `src/pages/admin/` |
| El `Set-Cookie` de entrar o salir se pierde en el 303 | PRG mutable (3a §3) y prueba con frasco de cookies: tras salir, el siguiente `GET /admin/cola` ya no manda la cookie |
| La llave del cupo la elige el atacante | `ipDeEncabezados`, guardián de `clientAddress` y la ráfaga que rota el primer valor (§3) |
| La política estricta se pierde en una respuesta sin `<meta>` | Cabecera en todo `/admin` desde el middleware (§5) y prueba sobre 200, 303, 307, 403, 404 y 500 |
| Conflicto con la Fase 4 en el middleware y en los metadatos | Nada compartido se asume. El que se mergee segundo rebasa (proposal) |
