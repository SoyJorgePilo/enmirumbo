# Diseño: migrar-enlace-gestion-astro (Fase 4)

Base: los design de 3a (§1 origen, §2 tabla y PRG, §3 cabeceras y cookies, §5 IP, §6 tope del cuerpo), 3b-1 (§1 A2 y el contrato del módulo, §2 componentes, §3 `repintar`, §5 O1, §8 diff) y 3b-2 (§2 la 404 dinámica, §3 destinos cerrados). No se reabren.

Código leído: `src/app/(gestion)/{layout.tsx, editar/[token]/page.tsx, editar/[token]/accion.ts, editar/[token]/gracias/page.tsx}`, `src/components/gestion/aviso-privacidad-vigente.tsx`, `src/components/registro/{cuerpo-formulario-registro,formulario-registro,formulario-registro-nativo}.tsx`, `src/lib/gestion/{token,consultas,procesar-edicion,ediciones,campos,limite-ip,textos}.ts`, `src/lib/seguridad/csp.ts`, `src/middleware.ts`, `src/astro/{acciones,cabeceras,registro,registro-cliente,metadatos}.ts`, `src/layouts/*`, `src/pages/{registro,registro/verificar,envio-rechazado,500}.astro`, `NoEncontradoDinamico.astro`, `tests/astro-seguridad-adversarial.test.ts` y `tests/analitica-exclusion-admin.test.ts`.

## 0. Inventario

| Pieza (Next) | APIs de Next | En Astro (Fase 4) |
|---|---|---|
| `(gestion)/layout.tsx` | `metadata.referrer: "strict-origin"` (es una `<meta>`, no una cabecera); no pinta `ScriptAnalitica` | `src/layouts/TroncoGestion.astro` + la regla de cabecera del middleware (§1) |
| `editar/[token]/page.tsx` | `force-dynamic`, `params`, `notFound()`, `metadata` (`title`, `noindex, nofollow`), `FormularioRegistro` (cliente) con la Action ligada por `.bind(null, token)` | `src/pages/editar/[token].astro` + `cargarEdicion` en `src/astro/editar.ts` |
| `editar/[token]/accion.ts` | `"use server"`, `headers()`, `notFound()`, `redirect()` | Action `editar` + `src/astro/editar.ts` + tabla y PRG del middleware |
| `editar/[token]/gracias/page.tsx` | `metadata` (`noindex, nofollow`), `next/link` | `src/pages/editar/[token]/gracias.astro` (`prerender = false`, sin base) |
| `src/lib/gestion/*` | **ninguna** (`grep 'from "next/' src/lib/gestion` vacío) | sin cambios |

## 1. El grupo `(gestion)` y la política de referente

### 1.1 Lo que hace hoy Next

- `metadata.referrer` de un layout **no es una cabecera**: Next la pinta como `<meta name="referrer" content="strict-origin">` en el `<head>` de cada pantalla del grupo. Las respuestas siguen llevando la cabecera global `Referrer-Policy: strict-origin-when-cross-origin` de `next.config.ts` (`cabecerasDeSeguridad()`). La `<meta>` manda sobre la cabecera para **ese documento** (`csp.ts`, comentario de `POLITICA_DE_REFERENTE`). La tarea 2 lo confirma con los fixtures.
- La `<meta>` no cubre:
  - **el 303** a la confirmación: al seguir una redirección, el navegador recalcula el `Referer` con la política de la respuesta de redirección (Fetch, "set request's referrer policy on redirect"), y esa es la global. La petición a `/editar/<token>/gracias` sale con la URL completa de la edición como referente del mismo origen. Va al propio sitio, a una pantalla sin medición: no es una fuga a terceros, pero es una copia más del token en el log de acceso;
  - **la 404 de un token que no resuelve:** Next responde su documento de error (`__next_error__`), que la tarea 2 mide para ver si trae la `<meta>`. Si no la trae, sus enlaces (encabezado y pie) mandan la ruta completa con la política global a páginas **medidas**, y el tracker reenvía los referentes del mismo origen como ruta (`layout-base`). Para un token inventado o regenerado no importa, pero el de una ficha **despublicada** vuelve a servir si se republica.

### 1.2 Decisión: `<meta>` en el tronco y cabecera en el middleware, por ruta pedida

1. **`TroncoGestion.astro`** envuelve a `DocumentoBase` **sin** `ScriptAnalitica`, con su comentario `// fuera de la medición: <motivo>` en el *frontmatter*, y pide a `DocumentoBase` la etiqueta `referrer: "strict-origin"`. `resolverMetadatos` (`src/astro/metadatos.ts`) gana el campo `referrer` y lo pinta en la posición en la que lo pinta Next (la mide el diff; no hace falta normalizarla). Así el HTML de las dos pantallas es el de Next, y la política vive en el tronco como pide `layout-base` ("DEBE vivir en el tronco de cada uno de esos grupos").
2. **Cabecera.** `prepararRespuesta` recibe la ruta **pedida** (`contexto.url.pathname`, que el middleware lee **antes** de `atender`, porque el 403 y "como dirección inexistente" son reescrituras a `/envio-rechazado` y el 500 pasa por `/500`). Si la ruta empieza con `PREFIJO_DE_GESTION = "/editar/"`:
   - la cabecera `Referrer-Policy` se **fija** en `strict-origin`, **pisando** cualquier valor que ya traiga la respuesta. Ni una página, ni Astro, ni una reescritura pueden debilitarla;
   - las otras tres cabeceras siguen la regla de siempre ("no pisar una que ya venga").

   Fuera de ese prefijo, nada cambia: la global y la regla de 2a. Es el candidato 7 de 3b-2 resuelto **solo** para este grupo y solo para esta cabecera (el resto queda como candidato).
3. **Por qué un prefijo y no una lista de rutas.** El prefijo es el de la carpeta `src/pages/editar/`, que es la del tronco. Un guardián exige que:
   - toda página de `src/pages/editar/` pinte `TroncoGestion` o `NoEncontradoDinamico`, nunca `TroncoPublico` ni `ScriptAnalitica` (amplía `paginasPrivadasMedidas`);
   - `PREFIJO_DE_GESTION` sea exactamente `/` + el nombre de esa carpeta + `/`.

   Una pantalla nueva del enlace nace cubierta por estar en esa carpeta, igual que en Next por estar en el grupo.
4. **Valor:** `strict-origin`, no `no-referrer`. `no-referrer` hace que el navegador mande `Origin: null` en los POST de navegación, y la regla de origen de 3a responde el 403 a `Origin: null`: el envío sin JS se rompería igual que en Next (allí con un 500). `same-origin` dejaría pasar la ruta a las páginas del propio sitio. Una prueba sobre la build exige que un POST con `Origin` del sitio y `Referer` solo del origen (lo que manda `strict-origin`) llegue al 303.

**Qué cubre cada capa:**

| Respuesta bajo `/editar/` | `<meta>` | Cabecera |
|---|---|---|
| 200 de la edición y de la confirmación; 200 re-pintado | sí | `strict-origin` |
| 404 de un token que no resuelve (`GET`, `HEAD`, `POST`) | no (el cuerpo es `NoEncontradoDinamico`, byte a byte el de `/loquesea`) | `strict-origin` |
| 303 a la confirmación | — | `strict-origin` |
| 403 de otro origen, 500 de una falla | no | `strict-origin` |

La 404 difiere de `/loquesea` en esa cabecera y en el `Cache-Control` de la función. Entre los motivos del enlace (inventado, alterado, regenerado, no publicado, borrado, sin forma de token) es **idéntica** salvo `Date`. Duda 1.

## 2. Fuera de la medición, por estructura

- **Ninguna pantalla del enlace pinta la medición:** la edición y su confirmación usan `TroncoGestion` (sin `ScriptAnalitica`), y la 404 usa `NoEncontradoDinamico` (ya sin medición). El `pathname` es el secreto, así que `data-exclude-search` no serviría.
- **Guardianes:**
  - el estático de 2a (`paginasPrivadasMedidas`, `tests/astro-seguridad-adversarial.test.ts`) ya cubre `src/pages/editar`, y se amplía a los componentes que esas páginas importan desde `src/layouts/` (que `TroncoGestion` no importe `ScriptAnalitica` ni `TroncoPublico`);
  - `EXCLUSIONES_DE_ASTRO` (`tests/analitica-exclusion-admin.test.ts`) suma `src/layouts/TroncoGestion.astro` con su porqué;
  - sobre la build, con la medición configurada, ni la edición, ni el re-pintado, ni la confirmación, ni la 404 del enlace contienen el script del proveedor, su dominio ni un `data-umami-*`;
  - **mutación:** cambiar `TroncoGestion` por `TroncoPublico` en la página hace fallar los dos guardianes.
- **El módulo de mejora no mide** (contrato de 3b-1) y no hace ninguna petición fuera de `form.action`.
- **Ningún log propio:** el pegamento no escribe nada con la ruta, los parámetros ni el cuerpo; `src/lib/gestion` ya solo escribe el tipo de evento.

## 3. El token en la URL: los canales, uno por uno

| Canal | Regla | Cómo se prueba sobre la build |
|---|---|---|
| `Referer` | §1 | cabecera en todas las respuestas bajo `/editar/`, `<meta>` en las 200; preview humano con DevTools |
| Enlaces salientes | las pantallas solo enlazan a `/aviso-de-privacidad`, `/` y lo del encabezado y el pie; ningún `href` lleva el token ni sale del sitio | el HTML (200, re-pintado, confirmación y 404) no contiene `T` |
| Metadatos | sin `canonical`, sin `og:url`, sin JSON-LD; el `title` es "Edita tu ficha" (sin nombre del negocio) | ídem, y el diff contra Next |
| `sitemap.xml` y `robots.txt` | no listan `/editar` (spec `layout-base`) | guardián existente, sin cambios |
| Cabeceras de la respuesta | ninguna lleva `T`, **salvo** el `Location` del 303, que es exactamente `/editar/T/gracias` (igual que Next: es la ruta que el navegador ya tiene) | recorrido de todas las cabeceras de cada respuesta del arnés |
| Formulario | `action="?_action=editar"` (relativo); sin campo oculto con el token. Next lo lleva cifrado en `$ACTION_…`; Astro lo toma del segmento de la ruta | HTML sin `T`; un `token` o `negocioId` en el cuerpo se ignora |
| URL tras un error sin JS | `/editar/T?_action=editar`: el token sigue solo en la ruta, sin copia en la consulta. El PRG del éxito no lo copia a otro lado | arnés |
| Log de la función | ningún mensaje propio lo contiene; **lo que escriba el marco se mide** | se capturan `stdout` y `stderr` del emulador al abrir un enlace válido, uno inválido, enviar bien, enviar con errores, con el guardado fallando y con la base caída (500). Se busca `T` y sus primeros 8 caracteres |
| Eco de errores | el re-pintado solo devuelve lo que el dueño capturó; el 403, el 500 y la 404 no leen la petición | HTML sin `T` |
| Caché | `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` (el del HTML dinámico) en las 200 y el GET de la 404; `CACHE_DE_ACCION` en el 303 y en la respuesta a un POST, como en 3a | se compara contra Next en la tarea 2 |

- **`noindex, nofollow`:** en la edición y en la confirmación, como en Next; la 404 trae el `noindex` de la 404.
- **La confirmación en Next** no es `force-dynamic` y no lee nada. Si la tarea 2 mide que Next la manda con caché compartida (`s-maxage`), Astro la manda **sin** caché compartida: es más estricto y evita copias de rutas con token en la CDN. Se anota como diferencia aceptada; no se copia la caché de Next.
- **Log del marco (duda 3):** si Astro o el adaptador escriben la ruta en el log al pintar el 500, el dev lo reporta con la línea exacta antes de mitigar nada. Lo que sí se exige ya es que nuestro código no lo haga.

## 4. Cómo se pinta el formulario de edición

**Criterio del fundador (A2 de 3b-1):** sin JS, igual que hoy; con JS, sin regresión de UX.

### 4.1 Sin JS

- `FormularioRegistroNativo` tal cual, sin tocar `src/components/`:
  - `action={actions.editar.toString()}`, que da `"?_action=editar"` y, desde `/editar/T`, se resuelve a `/editar/T?_action=editar`;
  - `modo="edicion"` (sin foto ni casilla "Dejar mi ficha sin foto"), `aviso={<AvisoPrivacidadVigente />}`, `textoBoton="Enviar cambios"`;
  - `estado`: el del envío con error (`Astro.getActionResult`) o, al abrir, `{ errores: {}, valores: edicion.valores }`.
- **`multipart/form-data`** como en Next (React lo fija en una `action` de función). Astro lo acepta con `accept: 'form'`.
- **Lo que gana sin JS:** `autofocus` en el primer campo con error, igual que el registro (Next sin JS no enfoca).

### 4.2 Con JS: el mismo módulo, configurado

`src/astro/registro-cliente.ts` pasa de tener sus rutas y su texto fijos a recibir una configuración. La de `/registro` reproduce exactamente lo de hoy, y sus pruebas no cambian:

```ts
type ConfigDelFormulario = {
  rutaDelFormulario: string;            // "/registro" | location.pathname de la edición
  rutasDeExito: readonly string[];      // ["/registro/gracias", "/registro/verificar"] | [`${ruta}/gracias`]
  textoErrorGeneral: string;            // MENSAJES_ERROR_REGISTRO.servidor | ERROR_GUARDAR_EDICION
  ejemploAlCargar: boolean;             // true en /registro; false en edición (§4.3)
  alNoEncontrado: "error" | "recargar"; // "error" en /registro; "recargar" en edición (duda 2)
};
```

- **La ruta de la edición sale del propio documento** (`new URL(form.action).pathname` sin la consulta). El módulo la usa solo para comparar la URL final del `fetch`, que es del mismo origen, y para navegar ahí. No la manda a ningún otro lado. Navega solo a `${ruta}/gracias`; cualquier otro destino es "error".
- **Respuesta 404:** con `alNoEncontrado: "recargar"`, `location.assign(rutaDelFormulario)`, un `GET` sin efectos que pinta la 404 (lo mismo que sin JS). Duda 2.
- **Peso:** una sola prueba sobre la build mide, **por página**, el JS que referencian `/registro` y `/editar/T` (con gzip), y falla por encima de 5 KB. Ninguna otra página gana `<script>`.
- **El texto del error general viaja en el módulo de la página** (importa `ERROR_GUARDAR_EDICION` de `src/lib/gestion/textos.ts`, un módulo puro), no en un atributo `data-` que habría que normalizar.

### 4.3 Paridad fina con Next con JS (medida en la tarea 2 y en el preview)

| Comportamiento | Next con JS | Astro con JS |
|---|---|---|
| Ejemplo de "¿Qué ofreces?" al abrir con una categoría prellenada | el genérico (el estado de categoría arranca en `""`) | el genérico: `ejemploAlCargar: false`. El de la categoría aparece solo tras un `change` |
| Tras un error | los valores, el foco y "Enviando..." como en el registro | igual; el ejemplo se re-aplica solo si hubo un `change` antes |
| Éxito | navegación del enrutador a `/editar/T/gracias` | `location.assign("/editar/T/gracias")` |
| Falla del servidor (500) o de red | "No pudimos guardar tus cambios…" o el error del marco | "No pudimos guardar tus cambios. Vuelve a intentarlo en un momento." con lo capturado, sin reenviar |
| Medición | ninguna | ninguna |

### 4.4 Si el módulo no sirviera tal cual

Si la generalización hiciera crecer el módulo de `/registro` o le cambiara una sola prueba, la alternativa es un segundo punto de entrada (`gestion-cliente.ts`) que importe las mismas funciones puras. El tope de 5 KB es por página en los dos casos.

## 5. La Action `editar`

- **Tabla:** `editar → "/editar/[token]"`. Por RPC, desde otra ruta (`/`, `/editar/T/gracias`, `/registro`) o con otro nombre, responde como dirección inexistente. La Action comprueba además su propio `routePattern`.
- **Regla de origen:** la de 3a, sin cambios. `Origin` ajeno, `null` o malformado: el 403 en español, ahora con `strict-origin` (§1). Sin `Origin`, procede.
- **El token:** `contexto.params.token`. Nunca del cuerpo, del `Referer` ni de la consulta. Un `token`, `negocioId` o `$ACTION_*` en el cuerpo se ignora (no se leen: `procesarEdicion` solo lee los campos del registro con `leerEnvioRegistro`).
- **Pegamento** (`src/astro/editar.ts`), copiado de `accion.ts`: `ipDeEncabezados(request.headers)` (nunca `clientAddress`; el guardián de 3a cubre el archivo) → `procesarEdicion(token, formData, { prisma, ip })` → resultado cerrado:
  - `{ exito: true }` → `redirigir` a `/editar/${token}/gracias`, **solo si** `pareceToken(token)`; si no, `no-encontrado`. Un formulario real nunca tiene otro segmento, porque la página no se pinta sin un token válido; el honeypot con un segmento hostil (`/editar/%2F%2Fevil.example`) no puede armar un `Location` raro;
  - `{ noEncontrado: true }` → `no-encontrado`;
  - `{ estado }` → `repintar`.
- **Destino cerrado:** la entrada de la tabla gana un validador por entrada (`destinoValido(ruta, contexto)`): el destino tiene que ser **exactamente** `/editar/${contexto.params.token}/gracias` con un token con forma. Si no, `no-encontrado`. Va además por `destinoSeguro`.
- **`no-encontrado`:** el camino de 3a/3b-2 (`setActionResult(NOT_FOUND)`, `pintarSinReleerElCuerpo`, `CACHE_DE_ACCION`). La página **siempre** resuelve primero el token, y pinta la 404 si no resuelve o si el resultado es `NOT_FOUND`.
- **`repintar`:** el camino de 3b-1. `esEstadoDeRegistro` valida la forma.
- **`trasFallar`** (un `ActionError` de Astro: cuerpo de más de 6 MiB o que no es formulario): `repintar` con `{ general: ERROR_GUARDAR_EDICION }` y valores vacíos, sin leer la base. Si el token no resuelve, la página pinta la 404 igual. El formulario real no lo produce: no tiene campo de archivo y sus `maxlength` suman unos pocos KB.
- **Una falla que lanza** (la página con la base caída): la 500 por O1. Con la base caída, `procesarEdicion` devuelve `ERROR_GUARDAR_EDICION` sin lanzar, la página lanza al resolver el token y se responde la 500, igual que Next sin JS.
- **¿Acepta foto?** No. El modo edición no pinta el campo y `procesarEdicion` no llama a `procesarFoto`. Un archivo `foto` fabricado en el cuerpo se lee hasta el tope de 6 MiB (es el tope del sitio, como en Next con `bodySizeLimit: "6mb"`) y se descarta: ni `sharp`, ni almacén, ni `fotoClave`. La prueba usa el almacén falso de 3b-1 y exige cero escrituras.
- **Lo que no se puede editar:** `CAMPOS_PROHIBIDOS_EN_EDICION` (`estado`, `origen`, `giros`, `publicadoEn`, `registradoEn`, `consintioAvisoEn`/`Version`, `reconsintio…`, `fotoClave`, `tokenGestionHash`/`CreadoEn`, `latitud`/`longitud`, `numeroVerificadoEn`) y `negocioId`. `guardarEdicion` escribe `...datos`, que es exactamente `DatosNegocioValidados` (los 11 campos de `CAMPOS_EDITABLES`). La prueba compara la fila de `Negocio` antes y después de un envío con todos esos campos fabricados: idéntica.
- **Constancia del consentimiento (M-3/M-4 de T-012):** la edición no pinta la casilla, valida con `consentimiento: true` y la versión vigente **sin escribirlas**, y no toca `consintioAvisoEn`, su versión ni la reaceptación. Un `consentimiento` o `versionAviso` fabricados no cambian nada: no se reescribe lo aceptado ni se convierte a quien edita en autor de una nueva constancia.
- **Una sola pendiente y la carrera:** sin cambios en `guardarEdicion` (cierra la anterior y crea la nueva en una transacción; ante `P2002` del índice único parcial `WHERE estado = 'pendiente'`, reintenta una vez). Sobre la build y con PostgreSQL: cinco envíos simultáneos del mismo token (desde IPs distintas, para no chocar con el cupo) terminan en **una** pendiente, con el contenido de uno de ellos, cinco 303 y ningún 500. En PGlite se salta con aviso.

## 6. La edición del WhatsApp y la verificación por SMS

- **Hoy (código leído):**
  - el envío de la edición solo guarda la pendiente: no pide código, no toca `numeroVerificadoEn` ni la cookie `nu_paso`, y no consulta la configuración de la verificación;
  - la marca se **limpia al aplicar** la edición en el panel, dentro de la transacción y solo si el número cambia (`aplicarEdicion`, hallazgo [C-1] de T-016);
  - volver a pedir código tras el cambio de número está fuera de alcance desde T-016.
- **La migración lo conserva tal cual.** Con la bandera encendida y el Twilio falso, un envío de edición que cambia el número:
  - no hace ninguna petición al proveedor y no pone ninguna cookie;
  - deja `numeroVerificadoEn` igual en la ficha;
  - deja una pendiente que, aplicada con `aplicarEdicion` (la función que usa el panel, que sigue en Next hasta la Fase 5), limpia la marca, y que un cambio de horario no la limpia.
- **Relación con `/registro/verificar`:** ninguna. La cookie `nu_paso` tiene `Path=/registro/verificar` y no llega a `/editar/`, y una `nu_paso` fabricada en un envío de edición se ignora.

## 7. Cupos e IP

- La llave es `ipDeEncabezados(contexto.request.headers)`: el último valor del encabezado declarado en `REGISTRO_ENCABEZADO_IP`, nunca `clientAddress`.
- Contador propio (`limite-ip.ts` de gestión), en memoria por instancia como en Next. Se gasta solo cuando el envío pasa la validación.
- **Sobre la build:** el 4.º envío válido en la hora desde la misma IP (con el **primer** valor de `x-forwarded-for` rotado en cada uno) vuelve con "Ya recibimos varios cambios desde aquí. Espera un rato y vuelve a intentar." y no escribe nada; agotarlo no impide un registro ni un reporte desde esa IP; sin la variable no hay cupo.

## 8. `src/lib/` y envoltorios de `src/app/`: cero líneas

- **`src/lib/`:** ninguna línea. `src/lib/gestion/*` no importa `next/*` (lo comprueba la tarea 1), y lo que usa la Fase 4 (`obtenerFormularioDeEdicion`, `procesarEdicion`, `pareceToken`, textos) ya recibe todo por parámetro.
- **`src/app/`:** ninguna línea. La página y la Action de Next siguen compilando con lo que tienen.
- **`src/components/`:** ninguna línea. `FormularioRegistroNativo` ya admite `modo`, `aviso` y `textoBoton`.
- **`src/middleware.ts`:** solo pasar la ruta pedida a `prepararRespuesta` (§1.2).
- **Se quita en T-027:** `src/app/(gestion)/` completo.

## 9. Diff de HTML y normalizaciones

- **Rutas:**
  - `/editar/T` con: una ficha publicada; una con pendiente (aviso y valores de la pendiente); una con colonia "Otra" sin normalizar; cada caso con y sin medición y con y sin `SITIO_URL`;
  - la 404 con: un token inventado, uno alterado en un carácter, uno regenerado, uno de ficha `en_revision`, `rechazado` o despublicada, uno de una ficha borrada, `/editar/` y segmentos sin forma (`abc`, 100 caracteres, `%00`, `..%2F`);
  - `/editar/T/gracias` con un token válido y con uno inventado;
  - los re-pintados de los envíos con error.
- **Normalizaciones, ninguna nueva:**
  - las de formulario de 3a (`action`/`method`/`enctype` comparados por su efecto, y los ocultos `$ACTION_*` de Next, que en la edición llevan el token cifrado);
  - `NORMALIZACIONES_REGISTRO` 2 a 4 de 3b-1 (el `<script>` del módulo, `data-ejemplos` y `autofocus` en los re-pintados), ampliadas en alcance a `/editar/T`;
  - las tres `NORMALIZACIONES_404_DINAMICA` de 2b para la 404 del enlace.
- **Diferencias aceptadas** (se imprimen):
  - la de 3a (origen ajeno o `null`: Next 500, Astro 403);
  - el `ActionError` de §5 (Next: error del marco; Astro: re-pintado o 404);
  - la cabecera `Referrer-Policy: strict-origin` en las respuestas de `/editar/` (§1, duda 1);
  - el `Cache-Control` de la confirmación si Next la cachea (§3).

## 10. Riesgos

| Riesgo | Mitigación |
|---|---|
| Una respuesta bajo `/editar/` sale con la política global (una reescritura, el 500) | La cabecera la fija el middleware con la ruta **pedida**, después de todo. Prueba sobre cada forma de respuesta. Mutación: quitar la regla hace fallar la prueba |
| Alguien mete `TroncoPublico` en una pantalla del enlace | Dos guardianes (estático y sobre la build). Mutación |
| El token se cuela en el HTML, en una cabecera o en el log | Búsqueda de `T` y de su prefijo en todo lo que sale del emulador. Mutación: un `data-token` inyectado a mano hace fallar la prueba |
| La página pinta el formulario para un token inválido en un POST | La página resuelve el token antes de mirar el resultado de la Action. Mutación: invertir el orden falla |
| El módulo navega a otro lado con la ruta | Destinos derivados del propio `form.action` y comparados por igualdad; pruebas puras con destinos ajenos |
| La generalización del módulo cambia `/registro` | Sus pruebas puras y del DOM no se tocan y siguen en verde; el diff de `/registro` sin cambios |
| La carrera deja dos pendientes | Índice único parcial + reintento, sin cambios; prueba de ráfaga con PostgreSQL |
