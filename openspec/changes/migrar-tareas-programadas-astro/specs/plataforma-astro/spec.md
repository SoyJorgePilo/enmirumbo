# Delta: plataforma-astro

> Fase 6, mitad 6a, de ADR-013 (T-027). Las dos tareas programadas (`/api/tareas/purgar-rechazados` y `/api/tareas/barrer-fotos-huerfanas`) pasan a servirse con Astro, y `src/lib/tareas/secreto.ts` deja de depender de Next. **El contrato no cambia.** Lo fijan los requirements de `despliegue` y `modelo-datos` sobre la purga, el barrido, el 404 de las tareas y los cupos, y los del aviso diario de `agregar-aviso-diario-pendientes` (T-020, sin archivar). Este delta se monta sobre los de 2a, 2b, 3a, 3b-1 y 3b-2, y da por hechos su middleware, cabeceras, regla de origen, tabla de Actions, emulador, `tests/salida-astro.ts`, `tests/limpieza.ts`, diff y guardianes. **Sin MODIFIED.**

## ADDED Requirements

### Requirement: Las tareas programadas responden desde Astro lo mismo que Next

Con el secreto correcto, `GET /api/tareas/purgar-rechazados` y `GET /api/tareas/barrer-fotos-huerfanas` DEBEN responder desde la salida construida lo mismo que los Route Handlers de Next para el mismo estado de la base, del almacén y del proveedor de correo:

- el mismo estado;
- el mismo cuerpo JSON byte a byte, solo con conteos y el estado del aviso, sin ninguna clave de foto ni ningún dato de nadie;
- `Content-Type: application/json; charset=utf-8`, `X-Robots-Tag: noindex, nofollow`, las cuatro cabeceras de `cabecerasDeSeguridad()` y el `Cache-Control` que manda Next (medido, no supuesto);
- las mismas líneas en el log.

La ruta pública y la declaración en `vercel.json` (`17 13 * * *` la purga y `47 9 * * *` el barrido, dos en total) NO DEBEN cambiar. `HEAD` DEBE comportarse como `GET`, igual que en Next, sin cuerpo.

Se conservan estas reglas:

- **La purga borra los archivos antes que la fila.** Un registro cuya foto no se pudo borrar sigue en la base, cuenta en `fallidos` y la respuesta es 500.
- **Las dos tareas son idempotentes.** La segunda corrida sobre el mismo estado responde con ceros y no falla.
- **El aviso y la purga no se arrastran.** Si la purga falla, el aviso se intenta igual y la respuesta es 500 con `{"error":"No se pudo completar la purga.","aviso":…}`. Si el aviso falla, lo purgado queda purgado y la respuesta es 500. Si el aviso está `sin-configurar`, la respuesta es 200.
- **El barrido que se detiene no responde éxito.** Una salvaguarda que lo detiene da 500, deja "DETENIDO" en el log como error y no borra ningún archivo.
- **El barrido no borra fotos de negocios vivos.** Las fotos de fichas publicadas, en revisión o rechazadas que aún no se purgan se quedan. Las huérfanas recién escritas quedan en periodo de gracia.

#### Scenario: la purga del día, como en Next

- **WHEN** con la base sembrada con dos rechazados de 91 días (uno con foto), uno de 89 días, uno rechazado sin fecha de rechazo, un registro en revisión y una marca de cupo caducada, y con el Resend falso aceptando, se pide `GET /api/tareas/purgar-rechazados` con `Authorization: Bearer <secreto>` a la salida construida y, con el mismo estado inicial, a Next
- **THEN** las dos responden 200 con el mismo cuerpo byte a byte (`{"eliminados":2,"fallidos":0,"cuposLimpiados":1,"aviso":"mandado"}`) y las mismas cabeceras salvo la fecha; el de 89 días y el que no tiene fecha siguen en la base, los dos archivos de la foto purgada ya no están, y el log dice "[purga] eliminados 2 registros rechazados con 90 días o más"

#### Scenario: segunda corrida del mismo día

- **WHEN** se repite la misma petición sobre el estado que dejó la primera
- **THEN** responde 200 con `"eliminados":0` y `"fallidos":0`, el Resend falso no registra un segundo envío aceptado, y la respuesta es la misma que da Next en su segunda corrida

#### Scenario: un registro cuya foto no se puede borrar

- **WHEN** un rechazado de 91 días tiene una variante de foto que el almacén no puede borrar, y otro sin foto también cumplió el plazo
- **THEN** la respuesta es 500 con `"eliminados":1,"fallidos":1`, el registro de la foto sigue en la base, el otro ya no está, y el log trae el error sin ningún id, nombre ni clave

#### Scenario: la purga no se completa y el aviso sí sale

- **WHEN** la purga no se puede completar (la consulta de los rechazados falla) y el correo está configurado
- **THEN** la respuesta es 500 con `{"error":"No se pudo completar la purga.","aviso":…}`, el aviso se intentó, y la respuesta es idéntica a la de Next en el mismo caso

#### Scenario: el aviso falla y lo purgado se queda purgado

- **WHEN** el Resend falso responde con `error`, había un rechazado de 91 días y hay un registro en revisión
- **THEN** el rechazado ya no está, la respuesta es 500 con `"aviso":"fallido"` y el log dice que el aviso de hoy no salió, sin el buzón ni la credencial

#### Scenario: sin configuración de correo

- **WHEN** la salida construida corre sin `RESEND_API_KEY` y se dispara la purga dos veces
- **THEN** las dos responden 200 con `"aviso":"sin-configurar"`, el Resend falso no recibe nada, y el log dice una sola vez qué variable falta

#### Scenario: el barrido normal

- **WHEN** con un negocio publicado con foto, uno en revisión con foto, una foto huérfana de hace una hora y otra recién escrita, se pide `GET /api/tareas/barrer-fotos-huerfanas` con el secreto
- **THEN** responde 200 con `barrido`, `revisadas`, `huerfanas`, `borradas`, `enPeriodoDeGracia`, `ignoradas` y `noBorrables` en ese orden y con los mismos valores que Next; solo la huérfana vieja se borra, las fotos de los dos negocios conservan sus dos variantes y la recién escrita sigue ahí

#### Scenario: el barrido detenido no es éxito

- **WHEN** la base no tiene ningún negocio y el almacén tiene una foto huérfana
- **THEN** la respuesta es 500 con `"barrido":false`, el log trae "DETENIDO" como error, la foto sigue en el almacén, y la respuesta es la misma que la de Next

#### Scenario: `HEAD` como `GET`

- **WHEN** se pide `HEAD` a cada ruta con el secreto correcto y luego sin él
- **THEN** cada respuesta tiene el mismo estado y las mismas cabeceras que la de Next para el mismo `HEAD`, sin cuerpo

### Requirement: Sin el secreto correcto, las tareas programadas no existen

Antes de cualquier otra cosa (construir el cliente de la base, leer el almacén de fotos, leer la configuración del correo o llamar al proveedor), cada ruta de tarea DEBE comprobar el encabezado `Authorization` contra `CRON_SECRET`, leído en esa misma petición. La comparación DEBE ser de tiempo constante (`secretoDeTareaCorrecto`, sin cambios). Si no coincide, o si `CRON_SECRET` falta o es de puros espacios, la respuesta DEBE ser el 404 vacío y la ruta NO DEBE hacer nada más.

El 404 vacío lleva:

- estado 404, cuerpo de 0 bytes y ningún `Content-Type`;
- ningún `X-Robots-Tag` ni `Cache-Control` propio;
- las cuatro cabeceras de seguridad;
- ninguna otra cabecera que no mande también el 404 equivalente de Next.

DEBE ser idéntico, salvo la fecha:

- entre todos los casos de secreto malo y entre las dos rutas;
- al que emite Next para los mismos casos;
- al 404 de la ruta de fotos con una clave inventada, salvo el `Cache-Control: no-store` que es propio de esa ruta.

Frente a una dirección inexistente, la diferencia DEBE ser la misma que en Next.

#### Scenario: un escáner prueba secretos

- **WHEN** con `CRON_SECRET` configurado se piden las dos rutas con `GET` y con `HEAD` en estos casos: sin `Authorization`, con un secreto equivocado de la misma longitud, con el secreto truncado en un carácter, con un carácter de más, sin `Bearer`, con `bearer`, con dos espacios tras `Bearer`, con `Basic …` y con `Authorization` vacío
- **THEN** todas las respuestas son 404, sin cuerpo y sin `Content-Type`, idénticas entre sí y al 404 que Next da en los mismos casos, y ninguna línea `[purga]`, `[fotos]` ni `[aviso]` aparece en el log

#### Scenario: sin secreto configurado

- **WHEN** la salida construida corre sin `CRON_SECRET`, o con `CRON_SECRET` de puros espacios, y llega el secreto que antes era válido
- **THEN** la respuesta es el mismo 404 vacío y no se purga ni se barre nada

#### Scenario: la puerta va antes de la base y de los archivos

- **WHEN** con un rechazado de 91 días con foto, una huérfana vieja y una marca de cupo caducada en la base de pruebas, llegan todos los casos de secreto malo; y aparte, con `DATABASE_URL` apuntando a un puerto cerrado, llegan los mismos casos
- **THEN** en el primer caso la fila, los dos archivos de su foto, la huérfana y la marca siguen ahí, y el Resend falso no recibió nada; en el segundo, las respuestas son el 404 vacío sin ningún error de conexión en el log, mientras que con el secreto correcto la purga sí responde 500

#### Scenario: igual que el 404 de las fotos

- **WHEN** se comparan el 404 de una tarea con secreto malo y el de `/api/foto/<32 ceros>/ficha`
- **THEN** coinciden en estado, cuerpo vacío, ausencia de `Content-Type` y las cuatro cabeceras de seguridad; la única diferencia es el `Cache-Control: no-store` de la foto

### Requirement: Un método que no es GET ni HEAD no dispara ninguna tarea

`POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS` y cualquier otro método a una ruta de tarea NO DEBEN ejecutar la tarea, con secreto o sin él, ni leer la base, el almacén o la configuración del correo. Según por dónde entre, la respuesta DEBE ser una de estas, ninguna con estado 500:

- un `POST` de otro origen: la página 403 en español que el middleware da a cualquier envío ajeno del sitio;
- un `POST` con `?_action=`: la 404 de no encontrado que da la tabla de Actions en cualquier ruta ajena;
- cualquier otro caso: el 404 vacío de la puerta, sin mirar el secreto.

Esta es la única diferencia aceptada contra Next, que responde 405 o 204. El diff la lista de forma explícita y dice en qué peticiones la aplicó.

#### Scenario: un POST con el secreto correcto

- **WHEN** con un rechazado de 91 días en la base llegan con `Authorization: Bearer <secreto>` y `Origin` propio `POST`, `PUT`, `DELETE` y `OPTIONS` a las dos rutas
- **THEN** las ocho respuestas son el 404 vacío de la puerta, idéntico al del secreto equivocado, el rechazado sigue en la base y el Resend falso no recibió nada

#### Scenario: un POST de otro origen o con una Action

- **WHEN** llegan `POST /api/tareas/purgar-rechazados` con `Origin: https://evil.example` y `POST /api/tareas/purgar-rechazados?_action=reportar` con `Origin` propio, los dos con el secreto correcto
- **THEN** el primero recibe la misma página 403 que el mismo envío a `/` y el segundo la misma 404 que `POST /?_action=inventada`; la tarea no corre en ninguno y ninguno es un 500

### Requirement: El middleware no se interpone en el disparo de una tarea

El disparo del programador de tareas (`GET`, sin `Origin`, con `Authorization: Bearer …`) DEBE llegar al endpoint sin que la regla de origen ni la tabla de Actions lo detengan ni lo reescriban. Su respuesta DEBE salir con las cuatro cabeceras de seguridad, sin que el middleware pise el `Content-Type`, el `X-Robots-Tag` ni el `Cache-Control` que pone el endpoint, y sin agregar el `Cache-Control` del HTML dinámico. Un `GET` con `?_action=` en la consulta DEBE tratarse como un `GET` normal, sujeto a su puerta.

Sin `CRON_SECRET` en producción, la salida construida DEBE dejarlo en el log **una sola vez por proceso**, al arrancar, con el mensaje de hoy ("[tareas] falta CRON_SECRET: las tareas programadas NO se pueden disparar…"). Fuera de producción, o con el secreto puesto, NO DEBE decir nada.

#### Scenario: el cron de Vercel

- **WHEN** se pide `GET /api/tareas/barrer-fotos-huerfanas` con `User-Agent: vercel-cron/1.0`, el secreto correcto y sin `Origin`
- **THEN** la respuesta es la del barrido, con las cuatro cabeceras de seguridad, el `Content-Type` JSON y el `X-Robots-Tag` del endpoint, y sin el `Cache-Control` del HTML dinámico

#### Scenario: `?_action=` en un GET

- **WHEN** se pide `GET /api/tareas/purgar-rechazados?_action=reportar`, primero con el secreto correcto y luego sin él
- **THEN** la primera corre la purga y responde lo mismo que sin la consulta; la segunda es el 404 vacío; ninguna es la 404 de la tabla de Actions

#### Scenario: falta el secreto en producción

- **WHEN** la salida construida arranca con `NODE_ENV=production` y sin `CRON_SECRET`, y recibe diez peticiones a distintas rutas
- **THEN** el log contiene una sola vez "[tareas] falta CRON_SECRET"; con `CRON_SECRET` puesto, o sin `NODE_ENV=production` ni `VERCEL_ENV=production`, no aparece

### Requirement: El aviso diario servido por Astro no lleva datos de nadie y sus pruebas no tocan servicios reales

El correo que manda la purga desde Astro DEBE ser el de hoy: los mismos conteos, el mismo asunto y texto, el único enlace a `<SITIO_URL>/admin`, la misma `Idempotency-Key` del día de Tizayuca y el mismo `User-Agent`. NO DEBE llevar el nombre, el WhatsApp, la colonia, la oferta, el motivo de rechazo ni el identificador de ningún negocio.

Las pruebas de las tareas NO DEBEN tocar Resend, el almacenamiento del proveedor, Twilio ni ninguna otra dirección externa, ni usar un buzón real. El proveedor de correo DEBE simularse con un Resend falso que intercepte `fetch` sin cambiar `src/lib/` y que lance ante cualquier otro host externo. Los buzones DEBEN ser de `@ejemplo.invalid`. Ningún archivo de `src/` ni de la build DEBE mencionar el simulador.

#### Scenario: el correo no lleva datos de ningún negocio

- **WHEN** con tres registros en revisión de nombres y WhatsApp ficticios conocidos se dispara la purga con el Resend falso aceptando
- **THEN** el registro del simulador tiene un solo envío a `admin@ejemplo.invalid`, cuyo asunto y texto no contienen ninguno de esos nombres, números ni identificadores, traen el conteo de pendientes y el enlace a `https://enmirumbo.example/admin`, y son iguales a los que manda Next para la misma base

#### Scenario: nada sale a la red

- **WHEN** corren todas las pruebas de las tareas con las variables del almacenamiento del proveedor presentes en la terminal
- **THEN** el emulador arranca sin ellas, ninguna petición sale a un host que no sea local, y el registro del Resend falso no contiene el valor de `RESEND_API_KEY`

### Requirement: `next` ya no viaja en la función de Astro

`src/lib/tareas/secreto.ts` NO DEBE importar nada de `next`. Sus exports `VARIABLE_SECRETO_TAREAS`, `secretoDeTareaCorrecto`, `avisarSinSecretoDeTareasUnaVez` y `reiniciarAvisoDeSecretoDeTareas` DEBEN conservar firma y comportamiento. `respuestaDeTareaNoExistente` DEBE salir de `src/lib/` sin cambios, a un módulo solo de Next que se retira en 6b.

Tras esto, la función de la salida construida (`.vercel/output/functions/_render.func/`) NO DEBE contener ningún archivo del paquete `next` (hoy son 62), ni ningún módulo que importe `next/*`. El tamaño de la función antes y después DEBE quedar registrado.

#### Scenario: la función sin Next

- **WHEN** se construye la salida y se recorre `_render.func`
- **THEN** no hay ningún archivo bajo `node_modules/next/` ni ningún módulo que importe `next/navigation` o `next/dist`, y el reporte de b-dev trae el antes (62 archivos) y el después (0) con el tamaño de la función

#### Scenario: las rutas de Next siguen igual hasta 6b

- **WHEN** se corren contra los Route Handlers de Next, antes de re-apuntarlas, las pruebas de la puerta que hoy los importan
- **THEN** pasan sin cambios, porque la función mudada lanza el mismo `notFound()`

### Requirement: La mitad 6a no pierde dureza ni altera producto

Las pruebas que hoy importan `src/app/api/tareas/` o leen sus archivos DEBEN pasar a probar los endpoints de Astro, con el mismo número de aserciones o más por archivo y sin `skip` nuevos. Al terminar, el `grep` de imports de `src/app/api/tareas` en `tests/` DEBE salir vacío. Esas pruebas son `tareas-programadas`, `purga-rechazados`, `aviso-pendientes-tarea`, `aviso-pendientes-adversarial`, `despliegue` y `buscador-pagina`.

Los guardianes siguen vigentes y ahora cubren los archivos nuevos:

- "cada ruta declarada en `vercel.json` existe de verdad", que ahora busca en `src/pages/`;
- "el aviso viaja encima de una tarea que ya existía, sin cron nuevo";
- "ninguna ruta de tareas fabrica un 404 propio", con el 404 en un solo lugar, `src/astro/tareas.ts`, y sin cabeceras propias;
- `noindex`;
- correos reales en el repo;
- exclusión de la medición.

Este change NO DEBE modificar:

- `src/lib/`, salvo las líneas de `src/lib/tareas/secreto.ts` listadas en `design.md` §2;
- `src/app/`, salvo el módulo nuevo `src/app/api/tareas/no-existe.ts` y una línea de import en cada una de las dos rutas de Next;
- `src/middleware.ts`, `src/astro/{acciones,origen,cabeceras}.ts` ni `src/components/`;
- `vercel.json`, salvo lo que exija `design.md` §1.4 tras medirlo;
- `astro.config.mjs`, `next.config.ts`, `prisma/`, `openspec/specs/`, `spikes/` ni `docs/despliegue.md`.

Ningún texto de log ni de JSON cambia. El PR DEBE abrirse como borrador apilado sobre `feature/astro-verificacion-sms` y rebasarse contra `migracion-astro` cuando se mergeen #37 y #38.

#### Scenario: misma dureza

- **WHEN** se compara cada archivo de pruebas re-apuntado contra su versión anterior
- **THEN** tiene al menos las mismas aserciones, todas en verde, ningún `skip` nuevo, y el `grep` de imports de `src/app/api/tareas` en `tests/` sale vacío

#### Scenario: el diff no toca producto

- **WHEN** se revisa el diff del change
- **THEN** en `src/lib/` solo cambian las líneas listadas de `secreto.ts`, en `src/app/` solo el módulo nuevo y las dos líneas de import, `vercel.json` sigue declarando las mismas dos rutas con los mismos horarios, y el diff contra Next no reporta diferencias fuera de la lista explícita
