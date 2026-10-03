# Diseño: migrar-verificacion-sms-astro (Fase 3b-2)

Base: los design de 3a (`migrar-formularios-publicos-astro`: §1 origen, §2 tabla de Actions y PRG, §3 cabeceras y cookies, §5 IP) y de 3b-1 (`migrar-registro-astro`: §4 `acciones.ts` sin Next, §5 O1, §7 Twilio falso, §8 diff). No se reabren. Este documento **cierra** dos puntos que ellos dejaron abiertos:

- el §7 de 3a, sobre la ruta apagada. Ya lo había corregido el §8 de 3b-1, y aquí se decide con evidencia (§2);
- la observación 5 de c-seguridad de 3b-1 y el candidato 7 de d-validacion de 3b-1: el `GET` del módulo (§10).

Código leído: `src/app/(publico)/registro/verificar/{page,accion-confirmar,accion-reenviar}.ts(x)`, `src/components/registro/formulario-verificar-codigo.tsx`, `src/lib/verificacion/{acciones,config,flujo,limites,paso,proveedor-twilio,textos}.ts`, `src/astro/{acciones,registro}.ts`, `src/middleware.ts`, `src/pages/{404,envio-rechazado,registro,registro/gracias}.astro`, `src/astro/componentes/NoEncontradoDinamico.astro`, `tests/fixtures/twilio-falso.mjs`.

## 0. Inventario

| Pieza (Next) | APIs de Next | En Astro (3b-2) |
|---|---|---|
| `registro/verificar/page.tsx` | `force-dynamic`, `cookies()`, `notFound()`, `searchParams`, `metadata` (`noindex, nofollow`) | `src/pages/registro/verificar.astro` (`prerender = false`) + `cargarPantalla` en `src/astro/verificar.ts` |
| `verificar/accion-confirmar.ts` | `"use server"`, `headers()`, `cookies()`, traduce `DestinoVerificacion` a `redirect`/`notFound` | Action `confirmar` + `src/astro/verificar.ts` + tabla y PRG del middleware |
| `verificar/accion-reenviar.ts` | igual | Action `reenviar` |
| `FormularioVerificarCodigo` | dos `<form action={función}>` y `Link` de compatibilidad, **sin hooks** | el mismo componente, con `action` de texto (§1.3) |
| `src/lib/verificacion/acciones.ts` | ya sin Next (3b-1 §4) | sin cambios |
| `registro/gracias` | — | ya en Astro (3b-1), sin cambios |

## 1. Decisión clave: cómo se pinta la pantalla

**Criterio del fundador:** sin JS, igual que hoy; con JS, sin regresión de UX.

### 1.1 Lo que hace hoy Next (código leído; la tarea 2 lo mide)

- **Sin JS:** cada botón es un POST nativo. El desenlace es un 303: a `?error=<código>`, a `?errorReenvio=<código>`, a la pantalla limpia o a gracias. El `GET` siguiente pinta el error con `role="alert"` junto al campo. El campo vuelve **vacío** (no hay `defaultValue`), sin foco y sin "Enviando...". Recargar repite un `GET` y no gasta nada.
- **Con JS:** React manda la Server Action por `fetch` y el `redirect` se vuelve una navegación del enrutador a la misma URL `?error=…`. No se recarga el documento, pero la URL cambia igual. El campo vuelve vacío, sin foco y sin "Enviando..." (el componente no usa `useFormStatus`). Umami cuenta la navegación como una vista de `/registro/verificar` (`data-exclude-search`). Para todo esto se cargan los ~180 KB con gzip del runtime de Next (orden medido en `/registro` por 3b-1).
- **T-016 manda sobre la pantalla** (requirement "El embudo…", scenario "la pantalla del código no agrega eventos"): "NO DEBE agregar ningún evento propio **ni ningún JavaScript**". Además el código de 6 dígitos es el único dato: no hay lista de campos que se pierdan al recargar, como sí pasaba en el registro.

### 1.2 Opciones

| | **N · nativo puro + PRG (recomendada)** | **R · nativo + repintar desde la Action (sin PRG en el error)** | **M · N + un módulo de mejora (como A2 de 3b-1)** |
|---|---|---|---|
| Sin JS | Igual que hoy: 303 a `?error=`, sin foco | El error llega en el 200 del POST; la URL queda `/registro/verificar?_action=confirmar` | Igual que N |
| Recargar tras un error | Un `GET`: no gasta nada (igual que hoy) | **Vuelve a mandar el POST**: si el código estaba mal, gasta otro de los 5 intentos y otra petición al proveedor. Con `reenviar`, otro turno de envío. Rompe "recargar cualquier pantalla no repite ninguna acción ni cuesta un SMS" (`acciones.ts`, T-016) | Igual que N |
| Con JS: error | Recarga completa de un documento chico (HTML + CSS en caché), con la misma URL y el mismo mensaje que hoy | Recarga y URL con `?_action=` | En el sitio, sin recargar |
| Vistas en la medición | Una por pantalla, igual que hoy | Igual | Igual |
| JS en la pantalla | **0** | 0 | Un módulo propio. **Incumple T-016** ("ningún JavaScript"): exige enmendarlo |
| Lo que sí cambia con JS frente a hoy | Navegación completa en lugar de navegación del enrutador. Lo que ve el dueño es igual: URL, mensaje, campo vacío, sin foco y sin indicador | — | — |
| Superficie de servidor | La de 3a: PRG con destinos fijos | Hay que fijar el resultado y pintar en el POST (el camino `repintar` del registro) | Igual que N, más el `fetch` |

### 1.3 Recomendación: N

- **No hay regresión observable con JS.** Ninguna de las cosas que el registro tenía que conservar existe aquí: valores capturados, foco, aviso de la foto, "Enviando...", ejemplo dinámico. En Next el campo ya vuelve vacío y sin foco. Lo único que cambia es la mecánica (documento nuevo en vez de RSC), y se compensa con 0 KB de JS frente a ~180 KB.
- **R se descarta** porque convierte la recarga en un gasto: de intentos, de turnos de envío y de dinero.
- **M se descarta** porque T-016 lo prohíbe, y lo que mejoraría (no recargar 6 dígitos) no compensa una enmienda.
- **Componente:** `FormularioVerificarCodigo` ya es un componente de servidor sin hooks. Solo cambian dos tipos y el `method`, el mismo cambio que 3a hizo en `FormularioReporte`:
  - `accionConfirmar` y `accionReenviar` pasan a `string | ((formData: FormData) => void | Promise<void>)`;
  - cada `<form>` lleva `method="post"` solo cuando su `action` es texto.
  - Con funciones (Next), el HTML no cambia. `Link` de compatibilidad ya pinta un `<a>` igual en los dos marcos.
- **Página:**
  - `action={actions.confirmar.toString()}` y `action={actions.reenviar.toString()}`, que se vuelven `"?_action=confirmar"` y `"?_action=reenviar"`;
  - desde `/registro/verificar?error=…`, el navegador los resuelve a `/registro/verificar?_action=…`;
  - sin `enctype`, el envío es `application/x-www-form-urlencoded`, que Astro acepta con `accept: 'form'`. El dev lo mide (tarea 9).
- **Si el humano prefiriera M (duda 3):** se enmienda por `/spec` el scenario de T-016 y se reutiliza el contrato de A2 de 3b-1, acotado a dos `fetch` y a la lista cerrada de destinos del §3. No se especifica aquí.

## 2. La bandera apagada: la ruta no existe

### 2.1 Mecanismos evaluados

| Mecanismo | Resultado | Evidencia |
|---|---|---|
| (a) La página devuelve `new Response(null, { status: 404 })` (el §7 de 3a) | **404 vacía** | b-dev de 3a: Astro pide la 404 prerenderizada a `http://localhost` (`core/errors/default-handler.js`) y responde sin cuerpo |
| (b) `contexto.rewrite("/404")` | Mismo problema que (a): `404.astro` es `prerender = true`, así que vive en la CDN y no en la función | `src/pages/404.astro:18`; el dev lo confirma en una línea de la tarea 1 |
| (c) Sacar la ruta de la tabla de Vercel según la bandera | Igual a la CDN, pero la bandera pasaría a leerse **al construir**: apagarla exigiría reconstruir, y la build dependería de un secreto de ejecución | `astro.config.mjs` (`RUTAS_FUERA_DE_LA_TABLA`, estático); `config.ts` lee `process.env` por petición |
| **(d) `NoEncontradoDinamico` (recomendado)** | 404 con el mismo documento que la 404 global | 3a, d-validacion "(a)": byte a byte igual a `/a/b/c` cuando la build y la ejecución comparten entorno (como en Vercel), y **siempre** igual a `/loquesea`. Es lo que ya responden la ficha no publicada, `/envio-rechazado` sin marca y la Action pedida desde otra ruta |

### 2.2 Qué responde exactamente, y por qué basta

- **Cuerpo y estado:** `NoEncontradoDinamico`, 404, sin medición, `noindex`, las cuatro cabeceras y la política de referente global.
- **La única diferencia con `/a/b/c` es una cabecera.** `/a/b/c` sale de la CDN (el `404.html` estático) y `/registro/verificar` sale de la función. Por eso la segunda trae el `Cache-Control` del HTML dinámico (`private, no-cache, no-store, max-age=0, must-revalidate`) o, en un POST de Action, el de una Action (`CACHE_DE_ACCION`). Es la misma diferencia que 3a aceptó para "una Action pedida desde otra ruta" (b-dev de 3a: "más estricto que el de la CDN"). **Duda 2.**
- **Por qué basta:**
  - **No delata la bandera.** La respuesta con la bandera apagada es idéntica, byte a byte salvo `Date`, a la de la bandera encendida sin cookie, que es lo que vería cualquiera que no acaba de registrarse. Eso es lo que protege el requirement rey.
  - **Next hoy está más lejos:** `notFound()` en una página `force-dynamic` responde su documento de error (`<html id="__next_error__">`, `<body>` vacío; 2b, design §1), que ni siquiera iguala el cuerpo de su propio `/a/b/c`. En el diff contra Next, la ruta apagada entra a la lista de 404 dinámicas y usa las tres `NORMALIZACIONES_404_DINAMICA` de 2b, sin agregar ninguna.

### 2.3 Dónde vive la compuerta (dos lugares, en este orden)

1. **En la tabla de Actions** (`src/astro/acciones.ts`). Cada entrada puede declarar `puedeCorrer(): boolean`, y la de `confirmar` y `reenviar` es `verificacionEncendida`. El orden en `atenderAcciones`:
   1. pasada por `/500` (O1);
   2. RPC: como dirección inexistente;
   3. nombre, `calledFrom` y ruta contra la tabla (si no casan, como inexistente: **no depende de la bandera**);
   4. **`puedeCorrer()` falso → `no-encontrado` sin llamar a `action.handler()`.** Así no se lee el cuerpo, no se lee la cookie, no se consulta la base y no se construye el proveedor;
   5. ejecutar y resolver.
2. **En la página**, **antes** de leer la cookie: `leerConfiguracionVerificacion()`. Si es `null`, se responde 404 con `NoEncontradoDinamico` y `return` (el mismo orden que la página de Next).

**Un solo camino de "no encontrado" por forma de petición.** Para que nada distinga los motivos, en `POST ?_action=confirmar|reenviar` todos estos resultados se tratan igual que el `no-encontrado` de reportar (3a §2: `setActionResult(NOT_FOUND)`, `pintarSinReleerElCuerpo`, `conCacheDeAccion`), y la página pinta la 404:

- la compuerta;
- `DestinoVerificacion` `no-encontrado` (sin cookie, cookie inválida, ficha borrada);
- `trasFallar` (§3).

**La página pinta la 404 si el resultado de la Action es `NOT_FOUND`, aunque la cookie sea válida.** Eso cubre la ficha borrada. Sin esto se pintaría la pantalla, porque la cookie sigue firmada.

| Forma | Bandera apagada | Encendida, sin credencial válida | Encendida, ficha borrada |
|---|---|---|---|
| `GET` / `HEAD` | página → 404 (antes de la cookie) | página → 404 (cookie inválida) | **página → 200** con la pantalla, igual que Next (la página no consulta la base) |
| `POST ?_action=confirmar` o `reenviar` | compuerta → 404 de Action | Action → `no-encontrado` → 404 de Action | Action → `sin-ficha` → 404 de Action |
| `POST ?_action=<otro>` | tabla → como inexistente | igual | igual |
| `POST` sin `?_action=` | página → 404 | página → 404 | página → 200 |

Cada columna es idéntica a las demás en la misma fila, salvo la ficha borrada en `GET`, que es la paridad con Next. Ninguna celda lee el cuerpo con la bandera apagada.

## 3. Candado de Actions por ruta y destinos

- **Tabla:** `confirmar → "/registro/verificar"` y `reenviar → "/registro/verificar"`, con `puedeCorrer: verificacionEncendida`.
  - La vía RPC `/_actions/confirmar` ya es la 404 de la CDN (fuera de la tabla de Vercel desde 3a).
  - Desde otra ruta, con otro nombre o sin `calledFrom === "form"`: como dirección inexistente.
  - Cada Action comprueba además su propio `routePattern`, como en 3a y 3b-1.
- **Regla de origen:** la de 3a, sin cambios. Con `Origin` ajeno, `null` o malformado, responde el 403 en español sin ejecutar nada. Sin `Origin`, procede.
- **Destinos: lista cerrada.** `src/astro/verificar.ts` traduce `DestinoVerificacion` a `{ tipo: "redirigir", ruta }` solo si `ruta` está en `DESTINOS_DE_VERIFICAR`, que son exactamente:
  - `/registro/gracias?verificado=1` y `/registro/gracias?agotado=1`;
  - `/registro/verificar`;
  - `/registro/verificar?error=` con `incompleto`, `no-coincide`, `vencido` o `proveedor`;
  - `/registro/verificar?errorReenvio=` con `espera-reenvio` o `cupo`.

  Cualquier otra ruta se trata como `no-encontrado`. Es defensa en profundidad: hoy `src/lib/` no puede devolver otra cosa. `esResultado` de la tabla la vuelve a validar con `destinoSeguro`.
- **`trasFallar`** (un `ActionError` de Astro: cuerpo de más de 6 MiB, cuerpo que no es formulario, falla interna): `no-encontrado`, sin leer la base. Next responde en ese caso un error del marco (413 o 500). Con el destino 404:
  - una petición fabricada a mano no distingue la bandera (si respondiera un 303, lo haría);
  - nada se consume;
  - no hay 500.

  El formulario real (6 dígitos) no puede producirlo.
- **PRG:** el 303 se arma mutable (`respuestaDeRedireccion`, 3a §3) para que el adaptador conserve el `Set-Cookie` del borrado. El `Referer` no decide nada.

## 4. La cookie de paso en Astro

- **Adaptador** (`src/astro/verificar.ts`): `almacenDe(contexto.cookies): AlmacenCookies`.
  - `get(nombre)` → `cookies.get(nombre)` (un `AstroCookie` con `.value`).
  - `set(nombre, valor, opciones)` → `cookies.set(nombre, valor, opciones)`, pasando `httpOnly`, `sameSite: "lax"`, `path`, `maxAge` (en segundos, como en Next) y `secure` tal como los arma `opcionesCookiePaso`. No se agrega ninguna opción.
- **Atributos que se comparan contra Next** (sin distinguir mayúsculas en el nombre del atributo):
  - al ponerla (3b-1, sin cambios): `HttpOnly`, `SameSite=Lax`, `Path=/registro/verificar`, `Max-Age=900` y `Secure` en HTTPS;
  - al borrarla (confirmado, intentos agotados, reenvíos agotados): valor vacío, `Max-Age=0` y los mismos `Path`, `HttpOnly`, `SameSite` y `Secure`.
  - Con un `Path` distinto, el navegador no la borraría. Por eso la prueba sigue el 303 con un frasco de cookies y comprueba que el siguiente `GET` ya no la manda.
- **Cuándo NO se pone cookie:** en ningún `GET` ni `HEAD`, en ningún 404, en ningún error con vuelta a la pantalla (la cookie no se reescribe: `acciones.ts`, "no lleva contadores") y nunca con la bandera apagada.
- **Manipulación:** `leerPaso` ya trata igual la cookie ausente, la firma alterada, otro secreto, el formato raro, el JSON sin forma y la caducada (≥ 15 min). La migración solo tiene que no distinguirlas en la respuesta (§2.3). Las cookies de prueba se firman en la prueba con `firmarPaso` y un secreto generado, y una caducada se arma con `creadaEnMs` de hace 15 minutos.

## 5. `searchParams`: en la pantalla y en gracias

- **Pantalla:** `cargarPantalla(url, cookies)` lee `url.searchParams.get("error")` y `get("errorReenvio")`, que toman el **primer** valor, igual que `primeraCadena` de Next. Las listas cerradas son las de `page.tsx`. Cualquier otro valor se ignora y no se refleja en el HTML.
- **Gracias:** ya está en Astro (3b-1) y lee `?verificado=1` y `?agotado=1` con la misma regla. 3b-2 no la toca: solo comprueba sobre la build que los destinos de `confirmar` y `reenviar` la pintan como Next.
- **Medición:** la pantalla vive en `TroncoPublico` (se mide como hoy), con `data-exclude-search`. A la medición llega solo `/registro/verificar`, nunca `?error=`.

## 6. Límites, atomicidad y "por proceso"

Nada cambia, porque todo vive en `src/lib/`, que no se toca. Lo que la migración tiene que probar sobre la build:

| Tope | Dónde vive | Atomicidad | Prueba sobre la build |
|---|---|---|---|
| 5 códigos por registro | base (`IntentoDeCupo`, HMAC del id) | comprobar y apuntar **no** son atómicos (deliberado, `limites.ts`) | 5 equivocados en serie → el 5.º va a `gracias?agotado=1` y borra la cookie. **Reusar la primera cookie** ([C-2]) → `agotado` sin llamar al proveedor |
| 2 reenvíos | base | atómico (transacción con cerrojo) | ráfaga de 6 reenvíos con la espera vencida → **exactamente 1** petición `/Verifications` y 1 reenvío gastado |
| 60 s entre SMS | base | atómico | reenvío inmediato tras el registro → `?errorReenvio=espera-reenvio` y 0 peticiones |
| 3 códigos por IP y hora | **memoria del proceso** | síncrono, sin ceder turno | con `REGISTRO_ENCABEZADO_IP=x-forwarded-for`: el 4.º pedido de la misma IP (primer valor rotado) da `?errorReenvio=cupo`. Agotarlo no bloquea un registro ni un reporte de esa IP. Sin la variable, no aplica |
| tope diario | **memoria del proceso** | síncrono | con `VERIFICACION_SMS_TOPE_DIARIO=2`: el 3.er registro va a gracias sin SMS, un reenvío da `?errorReenvio=espera-reenvio` (el mismo mapeo de hoy, `no-se-pudo`) y queda **una** alerta en el log por proceso |

- **Esperar 60 s en las pruebas:** no se duerme ni se toca el reloj de `src/lib/`. Las filas de `IntentoDeCupo` del registro de prueba se **envejecen** en la base y el emulador sigue con su reloj real.
- **Concurrencia:** solo con PostgreSQL real (backends independientes). En PGlite se salta con aviso, como en 3a y 3b-1.
- **Por proceso:** el emulador es un solo proceso, como una instancia de Vercel. La advertencia de costo por N instancias ya está en `docs/despliegue.md`, y aquí no cambia.

## 7. Enmascarado del número y nada sensible

- **En pantalla** solo aparecen los cuatro últimos dígitos, que salen de la cookie (`paso.ultimosCuatroDigitos`), sin consultar la base. Es el literal de `textoExplicacionVerificar`.
- **Las pruebas buscan** el WhatsApp de 10 dígitos (y con `+52`), el identificador de la ficha y el código enviado en todo esto:
  - el HTML, los `Location`, los `Set-Cookie` (en claro; el valor firmado es base64url de un JSON con el id, como hoy) y las demás cabeceras;
  - el log del emulador durante una verificación exitosa, una fallida y una con el proveedor caído.

  Ninguno puede aparecer, salvo el id dentro del valor firmado de la cookie, que es lo de hoy.
- **El campo:** `inputmode="numeric"`, `autocomplete="one-time-code"`, `maxlength="6"`, con su `<label for>`. Se compara contra Next en el diff.

## 8. Twilio falso

- **Se reutiliza `tests/fixtures/twilio-falso.mjs`** (3b-1 §7), con su guion por archivo (`@archivo`) y el registro de llamadas.
- **Extensión (solo `tests/`):** al comprobar, el guion suma `error` (503) y `tarda` (no responde: corta a los 5 s de `ESPERA_MAXIMA_MS`). Los dos se traducen a `?error=proveedor` y no gastan intento.
- **En Next** se carga con `NODE_OPTIONS="--import <ruta>/tests/fixtures/twilio-falso.mjs" next start`. Next parcha `globalThis.fetch` al arrancar, y la precarga corre antes, así que el parche de Next envuelve al falso. **El dev comprueba en la tarea 2 que una petición a `verify.twilio.com` llega al falso en Next.** Si no llega, lo reporta antes de buscar otra vía. Lo encendido en Next se puede capturar entonces solo con las pantallas (`GET` con cookie), que no llaman al proveedor.
- **El guardián de 3b-1 sigue igual:** nada en `src/` ni en la build menciona el simulador.

## 9. La marca en el panel

- El panel (cola y detalle) sigue en Next hasta la Fase 5 y no se sirve desde Astro.
- 3b-2 comprueba que la fila que deja una confirmación por Astro es exactamente la que el panel ya sabe pintar:
  - **antes y después** de confirmar, toda columna de `Negocio` es igual salvo `numeroVerificadoEn`;
  - `estado` sigue en `en_revision` y la ficha no aparece en ninguna página pública ni en el sitemap de la build;
  - `obtenerColaDeRevision` y `obtenerRegistroParaPanel` (`src/lib/admin/consultas.ts`) devuelven la fecha;
  - los componentes del panel (`tarjeta-cola.tsx` y `detalle-registro.tsx`), pintados con esa fila, muestran "Número verificado por SMS" y "Número verificado por SMS el <fecha>", con "Escribirle por WhatsApp" y las acciones de siempre;
  - una segunda confirmación no pisa la fecha.
- Esto **no sustituye la aprobación humana**: ninguna transición cambia.

## 10. El `GET` sin efectos que hace el módulo de `/registro`

- Con la bandera encendida, `decidirTrasEnvio` (3b-1 §1.3) recibe el 303, el `fetch` lo sigue (`GET /registro/verificar`, con la cookie que acaba de poner el 303) y después hace `location.assign("/registro/verificar")`, que es un segundo `GET`.
- **Contrato:** cualquier número de `GET`/`HEAD` a la pantalla, con o sin cookie:
  - no escribe en la base (conteo de `Negocio` y de `IntentoDeCupo` igual);
  - no llama al proveedor (0 llamadas en el registro del falso);
  - no pone ni borra cookies (sin `Set-Cookie`);
  - devuelve el mismo cuerpo.

  La página solo lee la configuración, la cookie y la URL.
- **Pruebas:**
  - sobre la build, con el falso: registro encendido → seguir el 303 → `GET` ×3 → conteos sin cambio y cuerpos iguales;
  - en la prueba del DOM de 3b-1 (`happy-dom`), con las respuestas reales capturadas con la bandera encendida: el módulo llama a `location.assign("/registro/verificar")`.
  - Que el navegador guarde la cookie del 303 que sigue un `fetch` (para que el primer `GET` dé 200) se confirma en el preview (tarea 17).

## 11. `src/lib/` y `src/app/`: cero líneas

- **`src/lib/`:** ninguna línea.
  - `acciones.ts` ya recibe las cabeceras y el almacén y devuelve `DestinoVerificacion` (3b-1 §4).
  - `config.ts`, `paso.ts`, `flujo.ts`, `limites.ts` y `proveedor-twilio.ts` no importan nada de Next (`grep "from \"next/" src/lib/verificacion` vacío, tarea 9 de 3b-1).
  - `verificacionEncendida` ya existe y se exporta.
- **`src/app/`:** ninguna línea. Los dos envoltorios de `verificar/` ya traducen el destino (3b-1). La página de Next sigue compilando con el componente ampliado, porque sus props aceptan la función de hoy.
- **`src/middleware.ts`:** ninguna línea. La compuerta entra por `atenderAcciones`.
- **Lo que se quita en T-027:** `src/app/(publico)/registro/verificar/{page.tsx,accion-confirmar.ts,accion-reenviar.ts}`. `formulario-verificar-codigo.tsx` se queda (React puro, pintado en el servidor por Astro). Al quitar Next, sus props pueden volver a ser solo `string`.

## 12. Diff de HTML y normalizaciones

- **Sin normalizaciones nuevas.**
  - La pantalla encendida usa las dos `NORMALIZACIONES_FORMULARIO` de 3a (`action`/`method`/`enctype` del `<form>`, comparados por su efecto, y los ocultos `$ACTION_*` de Next), ampliadas en alcance a `/registro/verificar`, en sus **dos** formularios.
  - La ruta apagada usa las tres `NORMALIZACIONES_404_DINAMICA` de 2b.
  - Una diferencia que no sea esas sale como diferencia, y el dev la reporta sin agregarla.
- **Rutas encendidas** (cookie firmada con el secreto de prueba, igual en las dos versiones):
  - sin parámetros;
  - `?error=` con cada uno de los 4 códigos y con `x`;
  - `?errorReenvio=` con los 2 códigos;
  - `?error=no-coincide&errorReenvio=cupo`;
  - `?error=x&error=vencido` (gana el primero: ninguno).
- **Rutas apagadas** (tres configuraciones: sin variables, credenciales sin bandera, bandera con secreto corto): `GET /registro/verificar` y `POST /registro/verificar?_action=confirmar`.
- **Envíos:** los del arnés (tarea 2) contra Next con el falso. Se comparan la cadena de estados, el `Location`, los atributos de `Set-Cookie`, las llamadas al falso y lo que queda en la base.
- **Diferencias aceptadas:**
  - la de 3a (origen ajeno o `null`: Next 500, Astro 403);
  - el `ActionError` del §3 (Next: error del marco; Astro: la 404);
  - el `Cache-Control` frente a la CDN (§2.2).

## 13. Riesgos

| Riesgo | Mitigación |
|---|---|
| La compuerta queda después de leer el cuerpo o la cookie | Va antes de `action.handler()` (§2.3). Prueba: con la bandera apagada, un POST de 7 MiB *chunked* responde la 404 sin que suba la memoria (la sonda de lecturas de 3b-1, `tests/fixtures/contar-lecturas.mjs`, cuenta 0). Mutación: moverla después del manejador hace fallar la prueba |
| Una respuesta delata la bandera o el motivo | Tabla del §2.3 como prueba: cada fila se compara byte a byte (salvo `Date`) entre sus columnas |
| El borrado de la cookie no llega o no casa el `Path` | Se sigue el 303 con un frasco de cookies, y el siguiente `GET` sin cookie da la 404 (§4) |
| Next no deja interceptar el `fetch` con la precarga | Se mide en la tarea 2 y se reporta (§8) |
| Ráfagas distintas a Next | Misma lógica de `src/lib/`. Las pruebas de ráfaga corren con PostgreSQL y fijan las cotas del §6 |
| Alguien enciende la bandera en `migracion-astro` antes del merge | Queda escrito en el ticket y en `despliegue.md` hasta el merge. La tarea 16 cambia esa línea solo en este PR |
