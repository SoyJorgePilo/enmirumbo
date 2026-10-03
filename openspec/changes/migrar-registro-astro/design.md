# Diseño: migrar-registro-astro (Fase 3b-1)

Base: los design de 3a (`migrar-formularios-publicos-astro`, §1 origen, §2 tabla de Actions y PRG, §3 cabeceras y cookies, §5 IP, §6 tope del cuerpo), 2a y 2b, que no se reabren. Este documento **sustituye** dos secciones de 3a:

- la recomendación "(3b) B" de su §4, que se reemplaza por la §1 de aquí;
- el mecanismo `new Response(null, { status: 404 })` de su §7, que b-dev de 3a midió y que deja una 404 vacía (ver la §8 de aquí).

Código leído: Astro 7.3.5 (`node_modules/astro/dist/actions/runtime/server.js:82-180`), `src/astro/acciones.ts`, `src/middleware.ts`, `src/app/(publico)/registro/*`, `src/components/registro/*`, `src/lib/registro/procesar.ts`, `src/lib/verificacion/{acciones,config,paso,proveedor,proveedor-twilio}.ts` y `src/lib/seguridad/csp.ts`.

## 0. Inventario

| Pieza (Next) | APIs de Next | En Astro (3b-1) |
|---|---|---|
| `registro/page.tsx` | `force-dynamic` y Prisma para los catálogos | `src/pages/registro.astro` (`prerender = false`) |
| `registro/accion.ts` | `"use server"`, `headers()`, `cookies()`, `redirect()` | Action `registrar` + `src/astro/registro.ts` + tabla y PRG del middleware |
| `FormularioRegistro` / `BotonEnviar` | `"use client"`, `useActionState`, `useFormStatus`, `useEffect` (foco), `useState` (ejemplo) | `FormularioRegistroNativo` (sin hooks) + un `<script>` de mejora progresiva (§1, §2) |
| `registro/gracias/page.tsx` | `searchParams` (async desde T-016) y `next/link` | `src/pages/registro/gracias.astro` (`prerender = false`, sin base de datos) |
| `src/lib/verificacion/acciones.ts` | `next/headers`, `next/navigation` | firmas con cabeceras y cookies por parámetro y destino cerrado (§4) |
| `registro/verificar/*` | (3b-2) | (3b-2) |

## 1. Decisión clave: cómo se pinta el formulario con JavaScript

**Criterio del fundador:** sin JS, igual que hoy; con JS, sin regresión de UX.

**Lo que hace hoy Next, medido en el código:**

- **Con JS:** React manda el envío por `fetch`. El error se pinta en el sitio, sin recargar y con la URL `/registro`. `useEffect` enfoca el primer campo con error, los valores vuelven por `defaultValue` desde el estado y el campo de archivo queda vacío (React reinicia el formulario tras la acción). "Enviando..." deshabilita el botón. El éxito es una navegación del enrutador a `/registro/gracias`, que Umami cuenta como una vista. **Un error no genera ninguna vista nueva de `/registro`.**
- **Sin JS:** un POST a `/registro` (con campos `$ACTION_*`) y un 200 que vuelve a pintar la página con errores y valores, **sin foco**. El éxito es un 303 a `/registro/gracias`. Recargar tras el error vuelve a mandar el POST.

### 1.1 Opciones evaluadas

| | **A1 · isla `client:load` + `useActionState(withState(actions.registrar))`** | **A2 · formulario nativo + un `<script>` de mejora progresiva (recomendada)** | **B · formulario nativo con recarga completa al error** |
|---|---|---|---|
| Sin JS | Igual que hoy | Igual que hoy, y además con foco (`autofocus` del servidor) | Igual que hoy, y además con foco |
| Con JS: error | En el sitio | En el sitio: `fetch` a la misma dirección del formulario, se reemplaza el `<form>` por el de la respuesta y se enfoca | **Recarga completa** a `/registro?_action=registrar` |
| Vistas de `/registro` en Umami por error | 0 (igual que hoy) | 0 (igual que hoy) | **+1 por cada error**: infla el denominador de "% de registros completados sin ayuda" (PRD §10; spec `registro-negocio`, "El embudo del registro…") |
| URL tras el error, con JS | `/registro` | `/registro` | `/registro?_action=registrar` |
| JS en `/registro` | Runtime de React para islas: **191 KB sin comprimir** (medido en el spike, `ADR-013-spike.md` §5), ~60 KB con gzip (estimado) + el componente | Un módulo de unos cientos de líneas, con tope de **5 KB con gzip** fijado en prueba (tarea 9). Se mide contra el JS que hoy carga Next en `/registro` (tarea 1) | Solo el ejemplo y "Enviando..." (~1 KB) |
| Lighthouse y la meta de <2 s en 4G | Riesgo: hidratar 12 campos con React suma TBT en gama media | Módulo diferido sin hidratación, TBT ~0 | Igual que A2 al cargar; cada error **vuelve a bajar el documento** en 4G |
| Seguridad | **Reabre la vía RPC** `/_actions/registrar`, que 3a cerró en la CDN y en el middleware. El estado previo viaja en `_astroActionState`, que controla el cliente | La vía RPC sigue cerrada: el `fetch` es un envío de formulario (`?_action=` → `calledFrom: "form"`, `server.js:150-152`) que pasa por la regla de origen, la tabla y el tope de 6 MiB, igual que sin JS. El HTML insertado es la respuesta del propio servidor, con su mismo escape; los `<script>` que trae un `DOMParser` no se ejecutan | Igual que A2, sin código de cliente nuevo |
| Complejidad | Alta: el éxito ya no es un 303 y hay que navegar a mano, `aviso` y `honeypot` pasan como slots de Astro, y hay riesgo de que la hidratación no coincida | Media: una función pura de decisión (probada en Node) más unas 40 líneas de DOM | Baja |
| Fase 4 (`/editar/[token]`) | Hereda la isla | Reutiliza el componente nativo y el mismo script | Reutiliza el componente nativo |

### 1.2 Recomendación: A2

- **No hay regresión de UX con JS:** errores en el sitio, sin recarga, con la URL `/registro`, foco, valores, aviso de la foto, "Enviando..." y ejemplo dinámico.
- **No sesga la medición:** como hoy, un error no cuenta como vista.
- **Sin JS queda igual o mejor,** porque gana el foco que la spec ya exigía ("obligatorios vacíos": "con el foco puesto en el primero").
- **Es la opción más ligera con JS:** sin el runtime de React, **menos JS que hoy en `/registro`** (se mide en la tarea 1).
- **Cero superficie nueva de servidor.**

B se descarta por las cuatro regresiones de la tabla: la vista de más en el embudo, la recarga en 4G, la URL con `?_action=` y la posición perdida. A1 se descarta por reabrir la vía RPC y por el peso.

**Si el humano prefiriera B,** habría que enmendar por `/spec` dos requirements de `registro-negocio`:

- "Ningún dato del formulario viaja a la medición" (la URL de los errores);
- "El embudo del registro se mide con las vistas de sus dos pantallas" (un error suma una vista de `/registro`; el scenario "envío con errores no cuenta como conversión" se mantiene, pero el denominador se infla).

Además se perdería la parte "sin recargar la página" del scenario "el ejemplo cambia al cambiar de categoría", aplicada a un envío con error. Lo demás de este change no cambia: B es A2 sin el bloque de `fetch` del script.

### 1.3 El contrato del script (A2)

Un solo `<script>` en `src/pages/registro.astro`, que Astro procesa y empaqueta en `/_astro/*.js` (CSP: `script-src 'self'`). Las decisiones viven en `src/astro/registro-cliente.ts`, como funciones puras. El DOM es una capa delgada. Tiene que cumplir esto:

1. **Solo actúa si el navegador tiene `fetch`, `FormData` y `DOMParser`.** Si falta alguno, no intercepta nada y el envío es el nativo.
2. **Ejemplo dinámico.** Al cambiar la categoría, al cargar y después de cada reemplazo del formulario, el `placeholder` de "¿Qué ofreces?" es el de la categoría elegida. La tabla id → ejemplo la calcula el servidor con `ejemploParaCategoriaElegida` y viaja en **un solo atributo** `data-ejemplos` del `<select id="categoriaId">` (normalización explícita del diff, §8). Sin JS se ve el genérico, como hoy.
3. **Al enviar:**
   - se previene el envío nativo;
   - el botón queda `disabled` con "Enviando..." (el literal de hoy);
   - se hace un `fetch(form.action, { method: "POST", body: new FormData(form) })`, a la **misma dirección** del atributo `action`, con las cookies del propio sitio y siguiendo redirecciones.
4. **Lo que se hace con la respuesta** lo decide `decidirTrasEnvio(respuesta)`, una función pura:
   - **Redirigida a `/registro/gracias` o a `/registro/verificar`, del mismo origen:** `location.assign(<esa ruta>)`. Cualquier otro destino se trata como respuesta inesperada. El `fetch` ya pidió esa página una vez, lo que es inocuo: las dos son `GET` sin efectos, y la cookie de paso ya quedó puesta por el 303.
   - **200 con un documento que trae el formulario de registro:** el `<form>` actual se reemplaza por el de la respuesta y se enfoca el campo con `autofocus` (el primero con error). La URL y el historial no cambian.
   - **Cualquier otra cosa** (500, 403, 404, el 413 de la plataforma, un documento sin formulario, una falla de red): el formulario se queda **tal cual**, con lo capturado (incluida la foto elegida). Arriba se muestra el error general que ya existe, "No pudimos guardar tu registro. Vuelve a intentarlo en un momento.", con el mismo marcado de `MensajeError` (`id="general-error"`, `role="alert"`), y el botón vuelve a su estado normal. **No reenvía nada por su cuenta.** Es lo que hoy ve quien tiene JS cuando la Server Action falla, salvo que hoy Next a veces muestra su error genérico.
5. **No mide nada,** no toca el campo de foto (sin vista previa, recorte ni compresión), no lee ni escribe almacenamiento del navegador, no agrega cabeceras propias y no hace ninguna otra petición.

### 1.4 Cómo se prueba

- **Funciones puras de `registro-cliente.ts`** (Node): cada desenlace de la tabla de arriba, incluidos el destino ajeno (`https://evil.example/registro/gracias`), una ruta del sitio fuera de la lista y un redirect a `//evil.example`.
- **DOM:** una prueba con `happy-dom` como entorno de Vitest **solo en ese archivo** (`// @vitest-environment happy-dom`), que carga el HTML real de la build y el módulo del script, con un `fetch` falso que responde con las respuestas reales capturadas. Cubre: error en el sitio sin cambiar `location`, foco, valores, foto vacía con su aviso, "Enviando...", ejemplo y respuesta inesperada. **Es una devDependency nueva (duda 3).** Si no se aprueba, la prueba del DOM se cambia por el paso humano de la tarea 19 (Chrome y Firefox con JS) y la cobertura automática queda solo en las funciones puras.
- **Peso:** una prueba sobre la build mide el `.js` que referencia `/registro`, con gzip, y falla por encima de 5 KB. Otra exige que ninguna página fuera de `/registro` gane `<script>` propio.
- **Preview (humano):** Chrome y Firefox con JS, comprobando en Umami una sola vista de `/registro` tras dos errores y un éxito, y el Lighthouse móvil de `/registro`.

## 2. Componentes: una variante sin hooks que reutiliza la Fase 4

Se separa **qué se pinta** de **cómo se envía**:

- **`cuerpo-formulario-registro.tsx`** (nuevo, sin `"use client"` y sin hooks): todo lo que hoy está entre `<form>` y `</form>` en `formulario-registro.tsx`, movido sin cambios de marcado. Props:
  - `categorias`, `colonias`, `honeypot`, `aviso`, `estado`, `modo`;
  - `ejemplo` (el `placeholder`);
  - `alCambiarCategoria?` (solo lo usa la variante de cliente; React no lo pinta en el HTML);
  - `campoConFoco?` (solo la variante nativa; pone `autoFocus` en ese campo);
  - `boton` (un nodo).
  - Exporta `ORDEN_CAMPOS_PARA_FOCO` y `primerCampoConError`. `formulario-registro.tsx` los reexporta para no romper sus importadores.
- **`boton-enviar-vista.tsx`** (nuevo, sin hooks): `BotonEnviarVista({ texto, enviando })`, con el marcado exacto del botón de hoy. `BotonEnviar` (cliente) queda en `const { pending } = useFormStatus(); return <BotonEnviarVista texto={texto} enviando={pending} />`.
  - La prueba que hoy ancla `disabled={pending}` y `pending ? "Enviando..."` en el fuente de `boton-enviar.tsx` se re-apunta a `boton-enviar-vista.tsx`, sin perder aserciones.
- **`FormularioRegistro`** (cliente, el de Next y `/editar/[token]`): `<form action={accionFormulario}>` + cuerpo + `BotonEnviar`. **Su HTML no cambia:** las pruebas de render actuales siguen en verde sin tocarlas.
- **`formulario-registro-nativo.tsx`** (nuevo, sin hooks): `<form method="post" enctype="multipart/form-data" action={action}>` + cuerpo + `BotonEnviarVista` + `campoConFoco = primerCampoConError(estado.errores)`. Recibe `action: string`. La Fase 4 lo usa con el `action` de su propia Action.
- **`git diff src/components/`** debe mostrar solo los dos archivos que cambian (`formulario-registro.tsx` y `boton-enviar.tsx`) y los tres nuevos. `aviso-consentimiento.tsx`, `campo-honeypot.tsx` y `formulario-verificar-codigo.tsx` no cambian.

## 3. La Action `registrar`, el middleware y el error sin PRG

- **Tabla** (`src/astro/acciones.ts`): `registrar → "/registro"`. Pedida por RPC, desde otra ruta o desde `/registro` con otro nombre, responde como dirección inexistente, como en 3a. La Action comprueba además su propio `routePattern`.
- **Resultado cerrado** (`src/astro/registro.ts`): `{ tipo: "redirigir", ruta: "/registro/gracias" | "/registro/verificar" } | { tipo: "repintar", estado: EstadoAccionRegistro } | { tipo: "fuera-de-ruta" }`. El tipo de resultado de la tabla se amplía con `repintar`, y `esResultado` valida su forma antes de obedecerla: un objeto con `errores` y `valores` de cadenas.
- **`repintar`:** el middleware fija `setActionResult("registrar", serializeActionResult({ data: estado }))` y sigue con `siguiente()`. La página lee `Astro.getActionResult(actions.registrar)` y pinta el formulario con ese estado, **en la misma respuesta al POST** (200). Esto se mide contra Next en la tarea 2, como el `Cache-Control` de esa respuesta. No hay PRG en el error, igual que en Next, así que no hace falta almacén de sesión (costo 1c) ni cookie de borrador: los valores capturados (que traen el WhatsApp) no se guardan en ningún lado.
- **Éxito:**
  - 303 a `/registro/gracias`;
  - con la bandera encendida y el código pedido, la cookie de paso (`firmarPaso`, `opcionesCookiePaso(esHttps)`, puesta con `contexto.cookies.set`) y 303 a `/registro/verificar`.
  - El campo trampa da el mismo 303 a gracias que un envío legítimo.
  - El 303 se arma mutable, como en 3a, para que el adaptador conserve el `Set-Cookie`.
- **`trasFallar` del registro, sin leer la base** (a diferencia de reportar):
  - `CONTENT_TOO_LARGE`: `repintar` con `{ errores: { foto: MENSAJES_ERROR_FOTO.demasiadoGrande }, valores: VALORES_VACIOS_REGISTRO }`, el literal "Esa foto pesa más de 5 MB. Sube una más ligera.". Los valores se pierden porque Astro corta sin leer el cuerpo. Next, en ese caso, responde un error del marco.
  - Cualquier otro `ActionError`: `repintar` con `{ errores: { general: MENSAJES_ERROR_REGISTRO.servidor }, valores: VALORES_VACIOS_REGISTRO }`.
- **IP:** `ipDeEncabezados(contexto.request.headers)`, nunca `clientAddress` (el guardián de 3a cubre los archivos nuevos).
- **Pegamento copiado tal cual** de `accion.ts`: el orden de `procesarRegistro` → `dependenciasDeVerificacion` → `pedirCodigoParaFicha` → cookie. La regla de HTTPS se toma de `dependencias.esHttps`.

## 4. `src/lib/`: las únicas líneas autorizadas

**Solo `src/lib/verificacion/acciones.ts`.** Ningún otro archivo de `src/lib/` cambia.

| Hoy | Después |
|---|---|
| `import { cookies, headers } from "next/headers"` y `import { notFound, redirect } from "next/navigation"` | Se quitan. |
| `dependenciasDeVerificacion(): Promise<…>` lee `headers()` | `dependenciasDeVerificacion(encabezados: Headers): Promise<DependenciasVerificacion \| null>`, el mismo cuerpo y la misma regla de `x-forwarded-proto` |
| `ejecutarConfirmacion(formData, dependencias): Promise<void>` lanza `redirect`/`notFound` | `ejecutarConfirmacion(formData, dependencias, almacen: AlmacenCookies): Promise<DestinoVerificacion>` |
| `ejecutarReenvio(dependencias): Promise<void>` | `ejecutarReenvio(dependencias, almacen): Promise<DestinoVerificacion>` |
| `type AlmacenCookies` (interno) | Se exporta, con la misma forma (`get`/`set`), que cumplen tanto `cookies()` de Next como `Astro.cookies` adaptado |
| — | `export type DestinoVerificacion = { tipo: "redirigir"; ruta: string } \| { tipo: "no-encontrado" }` |

- **Cada `notFound()` pasa a `return { tipo: "no-encontrado" }`,** y cada `redirect(x)`, a `return { tipo: "redirigir", ruta: x }`. Los destinos, los códigos de error, el borrado de la cookie y el orden no cambian.
- **`tests/verificacion-acciones.test.ts` y `tests/verificacion-seguridad-adversarial.test.ts`** dejan de simular `next/headers`/`next/navigation` y comprueban el destino devuelto, con el mismo número de aserciones o más.
- **Envoltorios de Next (excepción en `src/app/`, para que `npm run typecheck` siga en verde hasta T-027):**
  - `registro/accion.ts`: `dependenciasDeVerificacion(await headers())`;
  - `verificar/accion-confirmar.ts` y `accion-reenviar.ts`: llaman con `await headers()` y `await cookies()`, y traducen `DestinoVerificacion` a `redirect`/`notFound`.
  - Cada uno sigue siendo un envoltorio de pocas líneas. **Ningún otro archivo de `src/app/` cambia.**

## 5. O1: una falla del servidor en un envío responde la 500

**Causa** (d-validacion de 3a): cuando una página o una Action lanza, Astro pinta `/500` pasando otra vez por el middleware con la **misma** petición `POST …?_action=…`. La tabla la ve como "Action pedida desde otra ruta" (`routePattern === "/500"`) y responde la 404.

**Decisión:** al principio de `atenderAcciones`, si `contexto.routePattern === "/500"`, el middleware:

1. si hay una Action en la petición, fija `setActionResult(<nombre>, serializeActionResult({ error: new ActionError({ code: "INTERNAL_SERVER_ERROR" }) }))`, para que Astro **tampoco** la ejecute por su cuenta al pintar (`actionResultAlreadySet`);
2. sigue con `siguiente()`.

Con eso, un `POST /500?_action=registrar` tecleado a mano tampoco ejecuta nada (y la propia Action rechaza un `routePattern` ajeno).

**Pruebas sobre la build, con `DATABASE_URL` hacia `127.0.0.1:1`:**

- un `POST` válido a la ruta de reportar y otro a `/registro?_action=registrar` responden **500** con "Algo falló de nuestro lado", las cuatro cabeceras, el `Cache-Control` dinámico y sin escribir nada;
- un `POST /500?_action=registrar` no escribe nada.

Para el registro con la base caída, la cadena es esta: `procesarRegistro` devuelve el error `servidor` sin lanzar, la página vuelve a pintar y, al leer los catálogos, lanza. El resultado es la 500, igual que Next sin JS. Con JS, la mejora progresiva recibe ese 500 y muestra "No pudimos guardar tu registro…" con los datos en el formulario (§1.3, paso 4), que es lo mismo que ve hoy quien tiene JS.

## 6. La foto en la función de Astro

- **Sin cambios de lógica:** `procesarRegistro` → `procesarFoto` (`sharp`) → `almacen.guardar` → compensación. El semáforo de dos fotos a la vez vive en memoria, por instancia, igual que en Next.
- **Riesgo nuevo de empaquetado:** hasta 2b, ninguna ruta de Astro cargaba `sharp`. El adaptador de Vercel tiene que copiar `sharp` y su binario de plataforma a `.vercel/output/functions/_render.func/node_modules/`.
  - Una prueba sobre la build lo exige, y otra sube una foto real y comprueba las dos variantes.
  - Si el trazado no lo incluye, el dev lo declara en `astro.config.mjs` (`includeFiles` o el equivalente que mida) y lo reporta. **Es la única línea de `astro.config.mjs` que puede cambiar.**
  - El binario de Linux solo lo confirma el preview (tarea 19).
- **Tope de 6 MiB:** ya está en `astro.config.mjs` desde 3a. Ver §3 para `CONTENT_TOO_LARGE`. El límite de 4.5 MB de Vercel queda fuera (proposal).
- **La foto de prueba** se genera en la prueba con `sharp`: un JPEG de 3 a 4 MB con EXIF que trae GPS, modelo y fecha, más un PNG de 100 MP, un SVG y un HTML con extensión `.jpg`. **No se commitea ninguna foto real.**

## 7. La bandera encendida contra un Twilio falso

- **Requisito:** probar sobre la **salida construida** que, con la bandera encendida, el registro pide el código y deja la cookie de paso, y que con la bandera apagada no sale ninguna petición. Todo sin red, sin credenciales reales y sin cambiar `src/lib/`. **Se descarta** agregar una variable que cambie la URL base del proveedor: sería una superficie en producción capaz de mandar las credenciales a otro host.
- **Mecanismo:** `tests/fixtures/twilio-falso.mjs`, cargado con `node --import tests/fixtures/twilio-falso.mjs scripts/servir-salida-vercel.mjs`. El emulador importa la función en su mismo proceso (`servir-salida-vercel.mjs:36`). La precarga envuelve `globalThis.fetch` así:
  - `https://verify.twilio.com/v2/Services/<sid>/Verifications` y `/VerificationCheck` responden según un guion leído de `TWILIO_FALSO_GUION`:
    - `enviado`;
    - `rechazado` (400);
    - `error` (503);
    - `tarda` (no responde: se prueba la espera acotada de `ESPERA_MAXIMA_MS`);
    - para la comprobación: `approved`, `pending` y 404.
  - **Cualquier otro host externo lanza.** Así se demuestra que no hay red.
  - Cada llamada se apunta (ruta y parámetros) en un archivo temporal que leen las pruebas. Los números son de la serie ficticia `771999xxxx`.
  - El adaptador real (`crearProveedorTwilio`) toma `fetch` del global al construirse en cada petición, así que la precarga lo intercepta sin tocarlo.
- **Credenciales de prueba:** valores ficticios (`ACtest…`), y el secreto de 32 o más caracteres se genera en la prueba. Nada se commitea.
- **Guardián:** ningún archivo de `src/` menciona `twilio-falso` ni `TWILIO_FALSO_GUION`, y la build no contiene esas cadenas.
- **Uso en 3b-1:**
  - **encendida:** `enviado` → 303 a `/registro/verificar` con `nu_paso` (`HttpOnly`, `SameSite=Lax`, `Path=/registro/verificar`, `Max-Age=900`, `Secure` en HTTPS) y una sola llamada a `/Verifications` con `To=+52771999…`. Con `error` o `tarda`, 303 a gracias sin cookie, y la ficha guardada.
  - **reenvío de una ficha ya verificada:** 303 a gracias y cero llamadas.
  - **duplicado:** el mensaje de duplicado y cero llamadas.
  - **apagada** (sin variables, o con credenciales y sin bandera): cero llamadas y cero filas de cupos de verificación.
  - **3b-2** reutiliza la misma precarga.

## 8. Diff de HTML y normalizaciones

**Rutas de 3b-1:**

- `/registro`, con y sin medición y con y sin `SITIO_URL`;
- `/registro/gracias` con `?verificado=1`, `?agotado=1`, los dos juntos, `?verificado=x` y nada;
- las respuestas re-pintadas de los envíos con error (del arnés, contra Next sin JS).

**`NORMALIZACIONES_REGISTRO` son exactamente estas, cada una impresa con el lugar donde se aplicó:**

1. **Las de 3a:** los atributos `action`/`method`/`enctype` del `<form>`, comparados por su efecto (POST multipart a `/registro`), y los ocultos `$ACTION_*` de Next.
2. **El `<script type="module" src="/_astro/…">`** de la mejora progresiva, en `/registro`. Del lado de Next se comparan aparte los scripts que ya normaliza 2a.
3. **El atributo `data-ejemplos`** del `<select id="categoriaId">`.
4. **`autofocus`** en el primer campo con error, solo en las respuestas re-pintadas.

Todo lo demás se compara: etiquetas, opciones, ayudas, aviso, versión, honeypot, mensajes, valores repoblados y botón. Un oculto de más o un atributo `data-` distinto salen como diferencia.

**Para 3b-2 (no se implementa aquí):** con la bandera apagada, `/registro/verificar` debe responder `NoEncontradoDinamico` con estado 404, **antes** de leer la cookie. Tiene que ser byte a byte igual a `/loquesea` y a `/a/b/c` cuando la build y la ejecución comparten entorno, e igual con la bandera encendida y sin cookie. No vale `new Response(null, { status: 404 })`: según b-dev de 3a, Astro pide la 404 prerenderizada a `http://localhost` y responde vacía.

## 9. La URL sin JS: `/registro?_action=registrar`

**Qué cambia:** sin JS, el navegador queda en `/registro?_action=registrar` tras un error, y Next lo dejaba en `/registro`. El parámetro no trae ningún dato del dueño, y sin JS no corre la medición (el tracker es JS, con `data-exclude-search="true"`). Con JS (A2), la URL no cambia.

**Alternativa evaluada:** que el `<form>` postee a `/registro` y que el middleware reescriba (`context.rewrite(new Request(…?_action=registrar))`). Se descarta porque:

- crea un camino de Actions distinto del de 3a (una Action sin `_action` en la URL);
- obliga a duplicar en el middleware el tope de 6 MiB;
- abre la pregunta de qué ejecuta un POST a `/registro` sin parámetro.

**Recomendado:** aceptar la diferencia con la enmienda MODIFIED de `registro-negocio` ("Ningún dato del formulario viaja a la medición"). **Duda 2** para el humano.

## 10. Riesgos

| Riesgo | Mitigación |
|---|---|
| El script crece y se vuelve una "isla casera" | Tope de 5 KB con gzip en prueba. Las decisiones son puras y la capa del DOM es mínima. La lista cerrada de lo que hace está en el requirement |
| Reemplazar el `<form>` pierde algo que React conservaba | La prueba del DOM compara el formulario reemplazado con el que pinta el servidor para el mismo estado. El campo de foto queda vacío también en Next, porque React reinicia el formulario |
| Una respuesta inesperada deja al dueño sin saber qué pasó | Error general existente, datos intactos y sin reenvío automático (§1.3, paso 4) |
| `sharp` no viaja en la función | Prueba sobre la salida y foto real en la build. El binario de Linux se confirma en el preview |
| La rama encendida se prueba solo con unidades | Twilio falso sobre la build (§7) |
| La bandera se enciende en un preview antes de 3b-2 | Queda escrito en proposal.md y en el ticket. Con la bandera apagada no cambia nada |
| Las pruebas re-apuntadas pierden dureza | Conteo de `expect(` por archivo, igual o mayor, y ningún `skip` nuevo |
