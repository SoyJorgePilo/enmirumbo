# Etapa B (dev) — `agregar-aviso-diario-pendientes` (T-020)

Rama `feature/agregar-aviso-diario-pendientes`, worktree `.claude/worktrees/wt-t020`,
base local propia (`npx prisma dev --name t020`, puerto 51246). Sin etapa A: no hay
pantallas nuevas.

> **Segunda vuelta (después de la etapa C).** Este reporte incluye ya el cierre de
> los dos hallazgos medios de `reports/c-seguridad.md` y del bajo barato. El detalle
> está en la sección **"Vuelta 2"**, al final; lo de arriba describe el estado final.

## Gates (vuelta 2, tras cerrar MEDIO-1, MEDIO-2 y BAJO-1)

| Gate | Resultado |
|---|---|
| `npm run lint` | **verde**, 0 errores 0 avisos |
| `npm run build` | **verde** |
| `npm test` | 3358 pasan, 2 saltadas, **2 rojas**: `[A1]` y `[A2]` de `tests/reportes-seguridad-adversarial.test.ts`, que son exactamente las dos conocidas y aceptadas de la corrida de referencia (carreras contra PGlite, sin relación con este change). Las tres suites del aviso —111 pruebas entre las dos mías y la adversarial de la etapa C— en verde. |

*Nota de entorno, importante para el validador:* el servidor local
`prisma dev --name t020` se degradó **dos veces** durante la vuelta 2 —una cambiando de
puerto solo, otra dejando de aceptar conexiones nuevas del cliente de la aplicación—, y
produjo corridas con 19 y con 7 rojas de `Connection terminated unexpectedly` que **no
eran del código**: con el servidor recién levantado, las mismas suites pasan tres veces
seguidas. En esta máquina hay varios `prisma dev` de otros worktrees compitiendo por
puertos y por el bloqueo de arranque. **Si algo así aparece, es eso: `npx prisma dev
stop t020`, volver a levantarlo, comprobar el puerto que imprime y fijarlo en el `.env`
del worktree.** El resultado de arriba se confirmó en **dos corridas completas
consecutivas idénticas** con el servidor sano.

Sin dependencias nuevas (`package.json` intacto), sin migraciones ni cambios de
esquema, ningún archivo nuevo declara `"use client"`, ninguna dirección de correo
real en el repo (hay un guardián automático para eso, ver abajo).

## Qué se construyó

**Puerto de correo** — `src/lib/correo/`
- `puerto.ts`: una operación (`mandar`) con `MensajeAviso` (asunto, texto,
  remitente visible, clave del día) y `ResultadoEnvio` (`mandado` |
  `no-configurado` | `fallido`). A quién y desde dónde NO viajan en el mensaje:
  son configuración y el adaptador los trae dentro.
- `configuracion.ts`: lector fail-safe de las **cuatro** variables
  (`RESEND_API_KEY`, `AVISOS_CORREO_REMITENTE`, `AVISOS_CORREO_DESTINO` y
  `SITIO_URL`), `faltantesDeCorreo()` como única fuente de verdad de "qué falta"
  y `avisarCorreoSinConfigurarUnaVez()` (patrón de `avisarSinSecretoDeTareasUnaVez`).
  Ningún valor por defecto de ninguna clase.
- `resend.ts`: adaptador con `fetch`, `Idempotency-Key`, `AbortController` a
  5 s (`MS_LIMITE_ENVIO_CORREO`) y traducción de respuestas.
- `correo.ts`: la fábrica —Resend con configuración completa, adaptador nulo sin
  ella—, misma forma que `almacenDeFotos`.

**El aviso** — `src/lib/avisos/`
- `pendientes.ts`: `contarPendientes()` **reutiliza `obtenerColaDeRevision` y
  `obtenerNegociosReportados`**; no hay ni una consulta nueva. Altas y ediciones
  salen del `tipo` de cada renglón de la cola (así la deduplicación "un negocio,
  un renglón" es la misma), los reportes de la suma de `totalPendientes`.
- `dia.ts`: `Intl.DateTimeFormat` sobre `America/Mexico_City` y
  `enmirumbo-pendientes-<AAAA-MM-DD>`.
- `textos.ts`: asunto y cuerpo literales, líneas en cero omitidas.
- `aviso.ts`: `avisarPendientes()` → `EstadoAviso`. Orden: configuración →
  conteos → envío. Sin configuración ni siquiera se leen datos personales.

**Enganche** — `src/app/api/tareas/purgar-rechazados/route.ts`: el aviso se
intenta **después** de la purga y **fuera de su `try`**, así que se intenta
también cuando la purga revienta. El cuerpo suma `aviso`; `fallido` responde 500,
`sin-configurar` responde 200.

**Configuración y documentación:** `vercel.json` (`17 9` → `17 13`),
`docs/despliegue.md` §3.2 (tres filas nuevas + párrafo del fail-safe), §6 (hora
nueva con su porqué, §6.1 entera: qué manda, tabla de estados, idempotencia,
verificación del dominio en Resend paso a paso y qué mirar si el correo no
llega) y §9 (paso 11-bis de la prueba de humo), `.env.example`.

## Mapa scenario → prueba

### spec `revision-admin` — "Un aviso al día por correo…"

| Scenario | Prueba |
|---|---|
| hay pendientes de los tres tipos | `aviso-pendientes` › "cuenta altas nuevas, ediciones y reportes por separado" + "sale un correo con los conteos y el enlace al panel" |
| el panel está al día | `aviso-pendientes` › "con la cola vacía no cuenta nada" + "con la cola vacía no se manda nada y queda dicho en el log" |
| solo hay reportes sin atender | `aviso-pendientes` › "un solo reporte sin atender basta para que el correo salga" |
| los conteos dicen lo mismo que la cola | `aviso-pendientes` › "un en_revision con edición pendiente cuenta UNA vez, como la cola" (compara contra `obtenerColaDeRevision`) |
| un negocio que espera revisión y además tiene reportes | `aviso-pendientes` › "los reportes se cuentan por reporte y no le restan nada al alta" |
| dos disparos el mismo día | `aviso-pendientes-tarea` › "dos disparos seguidos mandan un solo correo, con la misma clave"; y en la vuelta 2, `aviso-pendientes` › "un 409 DESPUÉS de un envío aceptado con esa clave es 'ya salió el de hoy'" + "un 409 en frío es un fallo…" |
| dos disparos del mismo día de Tizayuca que en UTC son días distintos | `aviso-pendientes` › "dos disparos del mismo día local comparten clave aunque cambie el día UTC" (+ "dos días locales distintos NO comparten clave") |
| reintento después de un envío que no salió | `aviso-pendientes` › "un envío que el proveedor no aceptó no gasta el día" y `aviso-pendientes-tarea` › "un envío que no salió no gasta el día…" |

### spec `revision-admin` — "El correo dice cuántos hay, nunca quiénes son"

| Scenario | Prueba |
|---|---|
| el correo de un día con los tres tipos | `aviso-pendientes` › "con 2 altas, 1 edición y 2 reportes" (cuerpo completo carácter por carácter) |
| un día con un solo pendiente | `aviso-pendientes` › "con un solo pendiente el asunto va en singular y sobra toda línea en cero" |
| un día en el que solo hay reportes | `aviso-pendientes` › "con tres reportes y nada más" |
| el correo no trae datos de nadie | `aviso-pendientes` › "ni el asunto, ni el cuerpo, ni el enlace traen datos de ningún negocio" (siembra ficha completa + reporte con comentario) |
| el log del envío tampoco los trae | `aviso-pendientes` › "el log del envío no nombra a ningún negocio ni al buzón completo" + "un error del proveedor es un envío fallido, y el log no filtra nada" |
| el enlace lleva al panel de verdad | `aviso-pendientes` › "con las cuatro puestas, la configuración trae el enlace del panel" y las 15 variantes de "un SITIO_URL de %s deja el aviso apagado…" (vuelta 2, MEDIO-2) — **más verificación manual** en `docs/despliegue.md` §9 paso 11-bis (tocar el enlace desde el celular no lo puede hacer una suite) |
| (remitente "EnMiRumbo") | `aviso-pendientes` › "manda un texto plano con la clave del día en su cabecera" (`from: "EnMiRumbo <…>"`) + "el remitente se presenta como EnMiRumbo…" |

### spec `despliegue` — "El aviso diario viaja en la tarea que ya existe"

| Scenario | Prueba |
|---|---|
| la tarea corre y el aviso sale | `aviso-pendientes-tarea` › "purga bien + aviso bien → 200 con los conteos y el estado del aviso" |
| el envío falla y la purga no se ve arrastrada | `aviso-pendientes-tarea` › "purga bien + aviso fallido → la purga borró igual, y la respuesta NO es de éxito" |
| el proveedor no contesta | `aviso-pendientes` › "si el proveedor no contesta, corta por su cuenta y cuenta como fallido" (reloj falso, prueba el corte) + `aviso-pendientes-tarea` › "si el proveedor deja la petición colgada, la tarea corta y responde error" (prueba la respuesta) |
| la purga no se completa y el aviso sí sale | `aviso-pendientes-tarea` › "purga incompleta + aviso bien → el correo sale igual…" (+ el cuarto cruce, "purga incompleta + aviso fallido") |
| la hora a la que llega el correo | `despliegue` › "la tarea que lleva el aviso corre a las 13:17 UTC, ~07:17 en Tizayuca" + "el documento dice a qué hora sale el correo y por qué a esa" |
| alguien encuentra la ruta | `aviso-pendientes-tarea` › "tarea · sin el secreto no se manda ningún correo" (3 casos + sin `CRON_SECRET`), y el guardián de `tareas-programadas` sobre el 404 sigue en pie |

### spec `despliegue` — "Sin la configuración del correo…"

| Scenario | Prueba |
|---|---|
| nada configurado | `aviso-pendientes` › "sin ninguna variable, nombra las cuatro que faltan" + `aviso-pendientes-tarea` › "sin la configuración del correo la tarea responde con normalidad" |
| proveedor configurado y buzón destino sin configurar | `aviso-pendientes` › "con proveedor y remitente pero sin destino…" + `aviso-pendientes-tarea` › "con proveedor y remitente pero sin destino responde igual que sin nada configurado" |
| sin `SITIO_URL` no sale un correo con un enlace roto | `aviso-pendientes` › "sin SITIO_URL no hay configuración…" + "un SITIO_URL a localhost tampoco vale…" |
| el aviso del log no se repite | `aviso-pendientes` › "el log lo dice UNA sola vez por proceso, no una por corrida" |
| las variables nuevas están documentadas | `despliegue` › "las tres variables del correo salen en el documento con su descripción" (y el barrido que ya existía las exige por leerlas el código) |
| el buzón del directorio no vive en el repositorio | `despliegue` › "ninguna dirección de correo de verdad quedó en el repo" (barre `src/`, `prisma/`, `.env.example` y las dos suites nuevas; solo tolera `.invalid`/`.example` del RFC 2606) |

### spec `despliegue` — "La purga se dispara sola" (MODIFIED)

| Scenario | Prueba |
|---|---|
| la tarea programada corre | `purga-rechazados` › "con el secreto correcto purga y responde solo el conteo" (**ajustada**: ahora exige el juego de claves exacto, `aviso` incluido, en vez de un `toMatchObject` laxo) |
| la respuesta dice si el correo del día salió | `aviso-pendientes-tarea` › "purga bien + aviso bien…" y "con la cola vacía el aviso queda como 'sin pendientes'…" |
| los demás (404, sin secreto, programación declarada) | sin cambios, siguen en `purga-rechazados` y `despliegue` |

## La duda técnica que la spec encargó: la idempotencia de Resend

Verificado contra la documentación pública
(`https://resend.com/docs/dashboard/emails/idempotency-keys.md`, leída el 2026-09-04):

1. **La ventana cubre 24 h — confirmado y literal.** *"Resend checks whether an
   email with the same idempotency key has already been sent in the last 24
   hours"* y *"Idempotency keys are kept in the system for 24 hours"*. La clave
   admite hasta 256 caracteres (la nuestra mide ~34) y la cabecera es
   `Idempotency-Key` en `POST /emails`. Que la ventana sea deslizante y no un día
   natural da igual: la clave lleva la fecha dentro, así que dos días seguidos
   usan claves distintas.

2. **Un envío que el proveedor no llegó a aceptar no gasta el día — confirmado
   para el caso que importa, con un matiz honesto.** Un fallo de red, un
   `AbortError` nuestro o un 5xx no completan la petición: la documentación
   presenta exactamente ese caso como el uso para el que existe la clave
   (*"safe to retry requests… you can make the same request and our API will
   give the same response"*). Lo que la documentación **no** dice es si una
   respuesta de error del propio Resend (por ejemplo 403 por dominio sin
   verificar) queda cacheada bajo esa clave. En el peor caso el reintento
   devolvería el mismo error — que es la misma situación de configuración rota,
   así que no se pierde nada respecto a no reintentar. Es el riesgo que la
   propuesta ya asumía. **No hizo falta ninguna tabla nueva y `modelo-datos`
   sigue intacto.**

3. **Hallazgo que sí cambió la implementación (y que conviene leer):** con la
   misma clave y un **cuerpo distinto**, Resend NO descarta en silencio —
   responde **`409 invalid_idempotent_request`**—. Y nuestro cuerpo cambia dentro
   del mismo día en cuanto entra un pendiente nuevo (los conteos son otros). O
   sea: el segundo disparo de un día movido cae siempre en el 409, no en el
   "descarte silencioso" que el design imaginaba. El efecto observable es el que
   la spec pide —**no llega un segundo correo**— pero si el adaptador tratara ese
   409 como fallo, la tarea respondería 500 en un día que salió perfecto y el
   operador aprendería a ignorar los 500. Por eso el adaptador **traduce
   `409` a `mandado`** (vale para las dos variantes: `invalid_idempotent_request`
   y `concurrent_idempotent_requests`, que significa que hay otro envío con esa
   clave en vuelo). Está documentado en el encabezado de `src/lib/correo/resend.ts`
   y probado en `aviso-pendientes` › "un 409 del proveedor es 'ya salió el de
   hoy', no un error", y el proveedor de mentiras de las dos suites emula esa
   mecánica (200 la primera vez con esa clave, 409 después).

## Decisiones técnicas tomadas

1. **Sin memoria local del envío, a propósito.** No hay bandera de proceso ni
   marca en base: la única memoria es la del proveedor. Es lo que hace que "un
   envío fallido no gasta el día" salga gratis (el siguiente disparo simplemente
   vuelve a intentar) y lo que mantiene `modelo-datos` sin tocar.
2. **`SITIO_URL` cuenta como cuarta variable del correo, y `localhost` no vale
   ni en desarrollo.** `urlSitio()` cae a `http://localhost:3000` fuera de
   producción a propósito para el resto del sitio; para el aviso eso sería un
   enlace inservible en el celular del admin, así que la configuración lo
   rechaza explícitamente. Es la lectura estricta del scenario.
3. **El límite de espera son 5 s.** "Unos pocos segundos" de la spec, con el
   presupuesto de la función (10 s en Hobby) repartido a favor de la purga, que
   es la dueña de la tarea. Constante exportada y con prueba de cota.
4. **Contar los pendientes puede fallar y eso es `fallido`.** Si la base se cae
   al contar, no se sabe si había algo que avisar: se registra con `[aviso]` y se
   responde 500. Fallar a la vista es lo que hace el resto del proyecto; la spec
   no cubre este caso explícitamente.
5. **El adaptador nulo no escribe en el log.** La constancia "una sola vez por
   proceso" vive en un solo sitio (`avisarPendientes` → `avisarCorreoSinConfigurarUnaVez`);
   si el adaptador también avisara, habría dos caminos para la misma línea.
6. **`contarPendientes` lee de más y devuelve de menos.** Reutilizar las
   funciones de la cola trae a memoria nombres y colonias que el aviso no
   necesita. Se aceptó porque la alternativa —consultas propias "parecidas"— es
   justo lo que el design prohíbe: el día que la cola cambie de criterio, el
   correo cambia con ella. Nada de eso sale del módulo (hay prueba de
   privacidad del contenido y del log).
7. **La prueba de "purga incompleta" no finge un error.** Provoca el fallo real
   —una ficha rechazada con foto y el almacén sin configurar en un despliegue de
   verdad— en vez de espiar el módulo de la purga, que en ESM no se deja espiar
   sin `vi.mock` y ataría la prueba a la implementación.
8. **Corrección a `tasks.md` 5.3** (anotada en el propio archivo): la
   comprobación de "sin secreto no se manda correo" no cabe en
   `tests/tareas-programadas.test.ts`, que prueba la puerta del **barrido de
   fotos** —tarea que no lleva aviso encima—. Vive en
   `tests/aviso-pendientes-tarea.test.ts`.

## Deuda y propuestas fuera de alcance

- **Paso humano bloqueante antes del merge (duda abierta 1 de la propuesta):**
  verificar `enmirumbo.com` en Resend con los DNS de Namecheap. Hasta que exista,
  el fail-safe hace lo correcto (no manda, lo dice en el log, la purga sigue) pero
  el aviso **no opera**, y el paso 11-bis de la prueba de humo no se puede cerrar.
  Los pasos están escritos en `docs/despliegue.md` §6.1.
- **El estado `mandado` miente un poco en el caso 409:** dice "el correo de hoy
  ya está" cuando en realidad lo mandó un disparo anterior. Distinguirlo pedía un
  quinto estado (`ya-mandado`) que la spec no contempla; queda la línea de log
  del adaptador, que sí lo distingue. Propuesta para un change futuro si el
  operador lo echa de menos.
- **Ninguna alerta cuando el aviso lleva días fallando.** Un 500 diario solo se
  ve en la pantalla de crons del hosting. Ya está declarado fuera de alcance en
  la propuesta ("alertas de salud del sistema por correo"); ahora que existe el
  puerto de correo, ese change costaría poco.
- **El conteo de atrasados (>48 h) sigue fuera**, como fija la propuesta. Con
  `contarAtrasados` ya en `admin/consultas.ts`, sumarlo al asunto serían tres
  líneas — pero es alcance nuevo y no se tocó.
- **Si el aviso llega a necesitar hora propia**, extraerlo a
  `/api/tareas/avisar-pendientes` es mover una función y agregar un cron (y pasar
  a plan Pro, o dispararlo desde fuera). Nada de la spec cambia salvo dónde se
  dispara; `avisarPendientes` ya es independiente de la ruta.

---

# Vuelta 2 — cierre de los hallazgos de la etapa C

Encargo del orquestador: cerrar **MEDIO-2** y **MEDIO-1** de `reports/c-seguridad.md`
antes del validador, más el bajo barato (**BAJO-1**). Los tres quedan cerrados.

## MEDIO-2 — el guardián de "localhost no vale" solo cubría el literal · CERRADO

`src/lib/correo/configuracion.ts` comparaba `origen === URL_SITIO_LOCAL`, o sea contra
la cadena `http://localhost:3000` y nada más. Ahora hay una función exportada,
`esHostAlcanzableDesdeFuera(hostname)`, y `urlDelPanel` la usa sobre el `hostname` de
la URL ya normalizada. Rechaza:

- `localhost` a secas y en cualquier puerto, en mayúsculas o minúsculas;
- `::1`, `::` y el IPv6 entre corchetes (`[::1]`);
- loopback `127.0.0.0/8`, "esta red" `0.0.0.0/8`, link-local `169.254.0.0/16` y las
  tres privadas de IPv4 (`10/8`, `172.16/12`, `192.168/16`);
- IPv6 privadas `fc00::/7` y de enlace local `fe80::/10`;
- sufijos que solo existen dentro de una red: `.localhost`, `.local`, `.internal`,
  `.home`, `.lan`;
- nombres sin ningún punto (`http://mi-laptop:3000`), que no pueden ser públicos.

**Por qué no se reutilizó `esBaseLocal` de `src/lib/base-datos/conexion.ts`** (la
sugerencia del encargo, y lo miré): responde otra pregunta —"¿esta cadena de conexión
de PostgreSQL apunta a una base de juguete?"—, interpreta `?host=` y sockets Unix que
aquí no existen, y su lista de hosts locales **se queda corta para esto**: una IP
privada no es "base local" para ella y aquí sí tiene que apagar el aviso. Compartir la
función acoplaría dos criterios que deben poder cambiar por separado; queda dicho en el
comentario de la función nueva.

**Pruebas:** `aviso-pendientes` › "un SITIO_URL de %s deja el aviso apagado…" con las
**15 variantes** de la tabla del auditor y algunas más, y su contraparte "un dominio
público de verdad sí vale, con o sin puerto" (incluida una IP pública), para que el
arreglo no se pase de listo y apague un despliegue legítimo. También documentado en
`docs/despliegue.md` §3.2.

## MEDIO-1 — el 409 podía mentir en verde · CERRADO (veredicto y mecánica)

**Veredicto: el escenario del auditor es POSIBLE y mi redacción anterior era
demasiado optimista.** La documentación de errores del proveedor
(`resend.com/docs/api-reference/errors`) define `invalid_idempotent_request` así:

> *"This idempotency key **has been used** with this HTTP method and endpoint within
> the last 24 hours, but the request body was modified and doesn't match the original
> request."*

**Usada por una PETICIÓN, no por un envío aceptado.** No hay ninguna frase en la
documentación que diga que un rechazo libere la clave, así que no se puede demostrar
que el escenario sea imposible — y en seguridad la carga de la prueba va al revés.
Lo que sí sigue siendo cierto de mi investigación de la vuelta 1 es la parte que
escribí con cuidado: un intento que **nunca llegó a completarse** (red caída, nuestro
propio `AbortController`) no puede haber consumido nada. El error estaba en extender
esa certeza a los rechazos del proveedor.

**Mecánica nueva** (`src/lib/correo/resend.ts`), que cumple "doble disparo → un
correo" sin falsos verdes:

| Situación | Antes | Ahora |
|---|---|---|
| 409 y este proceso YA vio un envío aceptado con esa misma clave | `mandado` | `mandado` (sin duda: lo vimos salir) |
| 409 "en frío" (este proceso no vio salir nada) | `mandado` → **200 falso** | **`fallido` → 500**, con una línea `[aviso]` que explica qué mirar |

La memoria es una sola variable de proceso (`claveConEnvioAceptado`) con su
`reiniciarMemoriaDeEnviosDeCorreo()` para pruebas. **No sustituye a la idempotencia
del proveedor** —en serverless cada instancia tiene la suya y lo normal es no saber
nada—: solo añade certeza cuando la hay, y en frío se elige el rojo.

**Por qué NO la otra opción del encargo (reintentar en frío con clave sufijada):**
porque el caso frío más frecuente no es el roto, es el bueno —el cron mandó el correo
a las 07:17 y alguien redispara la tarea a mediodía con otros conteos, ya en otra
instancia—. Con clave sufijada eso mandaría un **segundo correo el mismo día**, que es
justo lo que el requirement prohíbe y lo que la clave existe para evitar. El falso
rojo, en cambio, solo aparece en un **segundo** disparo del día (el cron dispara una
vez), le cuesta al operador una mirada al panel de Resend, y a cambio el día
realmente roto se ve.

**Qué cambia para el operador:** `docs/despliegue.md` §6.1 explica el caso, dice que
`"aviso":"fallido"` con un `409` en el log significa "esta petición no mandó nada, y
puede que hoy no haya salido ninguna", y manda a *Resend → Emails* a comprobarlo.

**Pruebas:** `aviso-pendientes` › "un 409 en frío es un fallo…", "un 409 DESPUÉS de un
envío aceptado con esa clave es 'ya salió el de hoy'" y "el envío aceptado de AYER no
tapa el 409 de hoy"; `aviso-pendientes-tarea` › "un 409 en frío NO se responde en
verde…" (500 + `aviso: "fallido"`). Las dos pruebas de la etapa C que dependían del
409 —"veinte disparos seguidos" y "un pendiente nuevo a media tarde"— **siguen en
verde sin tocarlas**, porque en ellas el primer disparo sí es un 200 en el mismo
proceso.

## BAJO-1 — el cuerpo de la respuesta nunca se drenaba · CERRADO

`void respuesta.body?.cancel().catch(() => {})` justo después del `fetch`. Se cancela
**sin leerlo**, que es lo que la etapa C pidió conservar: el cuerpo de un 422 de Resend
devuelve el destinatario, el remitente y el texto del correo. Además de la prueba de
que se cancela, hay un **guardián de fuente** que falla si alguien mete un
`respuesta.json()`/`.text()`/… "para mejorar el mensaje de error".

## Extra encontrado al leer la documentación del proveedor (no pedido)

Resend **bloquea con un 403 (código 1010) toda petición sin cabecera `User-Agent`**,
antes de que llegue a su API (`resend.com/docs/knowledge-base/403-error-1010`). Se
comprobó empíricamente que el `fetch` de este Node (v24) manda `user-agent: node` por
su cuenta, así que **no había ningún fallo**; aun así el adaptador ahora manda un
`User-Agent` explícito. Motivo: si un runtime dejara de ponerlo, el aviso fallaría
**todos los días solo en producción** y el motivo no se entendería desde el log.
Una línea, con prueba.

## Un arreglo que salió de investigar esas rojas

`contarPendientes` pedía sus dos lecturas con `Promise.all`, y `obtenerColaDeRevision`
ya lanza por dentro otras dos a la vez: hasta **tres conexiones simultáneas** para una
tarea que corre una vez al día y a la que nadie está esperando. Contra el servidor
local —que multiplexa todas las conexiones sobre una sola sesión de PostgreSQL, como
explica `tests/db.ts`— eso es justo el patrón que lo hace toser. Ahora las dos van
**en serie**, con el porqué escrito en el módulo. No cambia ningún comportamiento
observable, no hay scenario que dependa de ello y en producción (pooler de Supabase)
la diferencia es inmedible; lo que quita es presión gratuita sobre la base.

## Otros cambios de esta vuelta

- `tests/aviso-pendientes-adversarial.test.ts` (archivo de la etapa C): **un arreglo de
  tipos, cero cambios de comportamiento.** El array de encabezados hostiles se infería
  como una unión con `{}` y `npm run build` fallaba el type-check (`TS2345`); ahora está
  anotado `Record<string, string>[]`. Las nueve variantes y sus aserciones son las
  mismas.
- `docs/despliegue.md`: §3.2 (host público exigido), §6.1 (tabla de estados corregida y
  el bloque nuevo del 409).

## Lo que sigue abierto (sin cambios respecto a la vuelta 1)

- **Paso humano bloqueante:** verificar `enmirumbo.com` en Resend antes del merge, o el
  paso 11-bis de la prueba de humo no se puede cerrar.
- **BAJO-2 (sin límite de tasa en la ruta) y BAJO-3 (`contarPendientes` lee de más):**
  señalados por la etapa C y aceptados; ninguno se toca sin spec.
- **El quinto estado `ya-mandado`** sigue necesitando spec. Con el 409 partido en dos,
  la ambigüedad ya no produce falsos verdes, así que deja de ser urgente.
