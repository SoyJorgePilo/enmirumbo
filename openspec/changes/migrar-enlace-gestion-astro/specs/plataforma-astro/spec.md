# Delta: plataforma-astro

> Fase 4 de ADR-013 (T-025). `/editar/[token]`, su confirmación y la Action `editar` pasan a servirse con Astro. **El contrato no cambia:** lo fijan los requirements del enlace de gestión de `registro-negocio` ("El enlace de gestión abre la ficha en modo edición…", "Un token que no es exactamente el vigente…", "Enviar la edición no toca la ficha pública…", "La edición pasa por las mismas validaciones…", "Mandar cambios cuando ya hay otros esperando…", "Anti-abuso del envío de ediciones…"), los de `layout-base` sobre la medición y el referente, y los de `despliegue` sobre cabeceras. Este delta se monta sobre los de 2a, 2b, 3a, 3b-1 y 3b-2. En los scenarios, `T` es un token válido de 43 caracteres generado en la prueba.

## ADDED Requirements

### Requirement: La pantalla de edición y su confirmación responden desde Astro el mismo HTML que Next

`/editar/<token>`, con un token vigente de una ficha publicada, DEBE responder 200 con lo mismo que la versión Next para la misma ficha y el mismo entorno:

- "Edita tu ficha" como único `h1` y como título;
- "Cambia lo que necesites y lo revisamos antes de publicarlo. Mientras tanto tu ficha sigue como está.";
- si la ficha tiene una edición pendiente, "Ojo: ya tienes cambios esperando revisión. Si mandas otros, estos reemplazan a los anteriores." y el formulario con lo que el dueño mandó la última vez; si no, con lo publicado;
- el formulario del registro con sus etiquetas, ayudas y reglas, sin el campo de foto, sin la casilla "Dejar mi ficha sin foto" y sin la casilla de consentimiento;
- "Tus datos siguen protegidos por el mismo aviso de privacidad que aceptaste al registrarte." con "Lee el aviso de privacidad completo" hacia `/aviso-de-privacidad`;
- el botón "Enviar cambios";
- la instrucción de no indexar ni seguir enlaces.

`/editar/<token>/gracias` DEBE responder 200, sin consultar la base y sin ningún `<form>`, con "¡Gracias! Ya recibimos tus cambios. Los revisamos y en cuanto los aprobemos tu ficha se actualiza. Mientras tanto sigue publicada como está." y "Volver al inicio" hacia `/`, con la instrucción de no indexar ni seguir enlaces.

El formulario DEBE postear de forma nativa a la Action `editar` de su misma ruta, sin campos ocultos. Contra Next, el diff DEBE aceptar solo las normalizaciones ya declaradas (las de formulario de 3a y las 2 a 4 de `NORMALIZACIONES_REGISTRO` de 3b-1), con su salida impresa.

#### Scenario: pantalla igual a la de hoy

- **WHEN** se abre `/editar/T` de una ficha publicada, de una con edición pendiente y de una con colonia "Otra" sin normalizar, con y sin medición y con y sin `SITIO_URL`, y `/editar/T/gracias`
- **THEN** el diff contra Next no reporta diferencias fuera de las normalizaciones declaradas, la de colonia "Otra" trae elegida "Otra" con su texto libre, y la de la pendiente trae el aviso y lo que el dueño mandó

#### Scenario: un campo de más sale como diferencia

- **WHEN** se inyecta a mano un campo oculto o un atributo `data-` en el formulario de la edición de Astro
- **THEN** el diff lo reporta como diferencia (y se revierte)

### Requirement: Un enlace que no resuelve responde la misma 404, sin delatar el motivo

Un token inventado, uno alterado en un carácter, uno invalidado por una regeneración, uno de una ficha en `en_revision`, `rechazado` o despublicada, uno de una ficha borrada, un segmento sin forma de token y `/editar/` DEBEN responder la 404 de no encontrado de las rutas dinámicas (`NoEncontradoDinamico`), sin medición. Para cada forma de petición (`GET`/`HEAD`, `POST ?_action=editar` con un envío válido y `POST` sin `?_action=`), todas esas respuestas DEBEN ser idénticas entre sí salvo la fecha, en estado, cuerpo y cabeceras, y su cuerpo DEBE ser byte a byte el de `/loquesea`. Ninguna DEBE escribir en la base, poner cookies ni responder 500. La página DEBE resolver el token antes de mirar el resultado de la Action, de modo que un envío nunca pinte el formulario de un enlace que no resuelve.

#### Scenario: los motivos no se distinguen

- **WHEN** se piden `GET /editar/<x>` y `POST /editar/<x>?_action=editar` con un envío válido, para cada uno de los motivos (inventado, alterado, regenerado, ficha en revisión, rechazada, despublicada, borrada, `abc`, 100 caracteres, `%00`, `..%2F`)
- **THEN** todos los `GET` son 404 idénticos entre sí salvo la fecha y con el cuerpo de `/loquesea`, todos los `POST` también, ninguno es 500, ninguno trae `Set-Cookie` y la base no gana ninguna edición

#### Scenario: el token regenerado deja de abrir y la ficha sigue igual

- **WHEN** se regenera el enlace de una ficha y se abre el anterior, y después el nuevo
- **THEN** el anterior responde la 404 de no encontrado y el nuevo la pantalla de edición, y la ficha pública no cambió

### Requirement: El envío de la edición sin JavaScript se comporta igual que en Next

La Action `editar` DEBE delegar sin lógica nueva en `procesarEdicion`, con el token tomado del segmento de la ruta y la IP de `ipDeEncabezados` (nunca `clientAddress`). Sus desenlaces DEBEN ser:

| Envío | Respuesta | Base |
|---|---|---|
| válido | 303 a `/editar/T/gracias` | una edición pendiente; la ficha publicada sin cambios |
| válido con una pendiente previa | 303 a `/editar/T/gracias` | la anterior deja de estar pendiente y la nueva ocupa su lugar |
| campo trampa lleno | 303 a `/editar/T/gracias` | nada |
| WhatsApp de 9 dígitos | 200 con "Revisa tu número de WhatsApp: deben ser 10 dígitos" junto al campo y lo demás intacto | nada |
| WhatsApp de otra ficha | 200 con "Ese número ya está en otra ficha del directorio." junto al campo | nada |
| cuarto envío válido en la hora desde la misma IP | 200 con "Ya recibimos varios cambios desde aquí. Espera un rato y vuelve a intentar." | nada |
| el guardado falla | 200 con "No pudimos guardar tus cambios. Vuelve a intentarlo en un momento." y los datos en el formulario | nada; la ficha sin cambios |
| la base caída | 500 "Algo falló de nuestro lado" | nada |

El único destino de un 303 DEBE ser exactamente `/editar/<el mismo token>/gracias`, y solo si el segmento tiene forma de token; cualquier otro desenlace de destino DEBE tratarse como no encontrado. El destino NO DEBE depender del `Referer`. Los errores DEBEN volver a pintarse en el mismo 200, sin PRG y sin guardar lo capturado en ningún lado. Recargar la confirmación NO DEBE crear otra edición.

Un envío NO DEBE poder fijar ni cambiar estado, origen, giros, fecha de publicación, fecha de registro, constancia del consentimiento (fecha, versión y reaceptación), foto, huella del enlace, coordenadas, marca de verificación ni el negocio al que pertenece. Un archivo de foto en el envío NO DEBE procesarse ni guardarse. Dos envíos casi simultáneos del mismo enlace DEBEN dejar exactamente una edición pendiente y ningún error técnico.

#### Scenario: recorrido completo sin JS

- **WHEN** sin JavaScript el dueño abre `/editar/T`, cambia su horario y su dirección y toca "Enviar cambios"
- **THEN** la cadena es 200 → 303 → 200 con "¡Gracias! Ya recibimos tus cambios. Los revisamos y en cuanto los aprobemos tu ficha se actualiza. Mientras tanto sigue publicada como está.", el `Origin` del envío es el del sitio, queda una edición pendiente, la ficha pública muestra el horario y la dirección de antes, y recargar la confirmación dos veces no crea otra

#### Scenario: mismos desenlaces que Next

- **WHEN** el arnés manda contra Next de `main` y contra Astro cada fila de la tabla, más un envío con `Referer: https://evil.example/` y otro sin `Referer`
- **THEN** cada par coincide en la cadena de estados, la ruta del `Location`, los mensajes junto a cada campo, los valores conservados y lo que queda en la base

#### Scenario: campos que no le tocan

- **WHEN** un envío válido trae además `estado=publicado`, `origen=siembra`, `giros`, `publicadoEn`, `registradoEn`, `consintioAvisoEn`, `consintioAvisoVersion`, `consentimiento`, `versionAviso`, `fotoClave`, `tokenGestionHash`, `numeroVerificadoEn`, `latitud`, `negocioId` de otra ficha, `token` de otra ficha y un archivo `foto`
- **THEN** la pendiente es de la ficha de `T` y solo trae los campos capturables, ninguna columna de ninguna ficha cambió, la otra ficha no tiene pendiente y el almacén de fotos no recibió ninguna escritura

#### Scenario: dos envíos casi simultáneos

- **WHEN** contra la salida construida y con PostgreSQL llegan cinco envíos válidos simultáneos con el mismo `T` desde IPs distintas
- **THEN** queda exactamente una edición pendiente de esa ficha, los cinco responden 303 a la confirmación y ninguno es 500

#### Scenario: el cupo es propio y se lee del encabezado declarado

- **WHEN** con `REGISTRO_ENCABEZADO_IP=x-forwarded-for` llegan cuatro envíos válidos en la hora con `x-forwarded-for: <distinto cada vez>, 203.0.113.7`, y después un registro y un reporte desde esa IP
- **THEN** el cuarto vuelve con "Ya recibimos varios cambios desde aquí. Espera un rato y vuelve a intentar." sin guardar nada, y el registro y el reporte se procesan con normalidad

#### Scenario: el guardado falla

- **WHEN** en la base de prueba la escritura de ediciones falla y el dueño manda un envío válido
- **THEN** ve "No pudimos guardar tus cambios. Vuelve a intentarlo en un momento." con sus datos en el formulario, sin detalle técnico, y la ficha publicada no cambia

### Requirement: Con JavaScript, la edición conserva la experiencia de hoy sin isla de React

Con JavaScript, la pantalla de edición DEBE usar el mismo módulo propio que `/registro`, configurado para su ruta, y hacer exactamente esto:

1. al cambiar la categoría, poner en "¿Qué ofreces?" el ejemplo de la categoría elegida; al abrir, el ejemplo es el genérico, como hoy;
2. al enviar, deshabilitar el botón con "Enviando..." y mandar el formulario por `fetch` a la dirección de su atributo `action`;
3. si la respuesta termina en `/editar/<el mismo token>/gracias` del mismo origen, navegar ahí;
4. si la respuesta es la página con el formulario, reemplazarlo y enfocar el primer campo con error, sin recargar ni cambiar la URL;
5. si la respuesta es la 404 de no encontrado, cargar la misma dirección de la pantalla;
6. ante cualquier otra respuesta o falla de red, dejar todo lo capturado, mostrar arriba "No pudimos guardar tus cambios. Vuelve a intentarlo en un momento." y reactivar el botón, sin reenviar nada.

El módulo NO DEBE navegar a otra ruta ni a otro origen, pedir nada a otra dirección, medir nada ni usar almacenamiento del navegador. El JavaScript propio que carga cada una de las dos páginas con formulario (`/registro` y `/editar/T`) NO DEBE pasar de 5 KB con gzip. `/registro` NO DEBE cambiar de comportamiento.

#### Scenario: errores en el sitio

- **WHEN** con JS el dueño borra un dígito de su WhatsApp y toca "Enviar cambios"
- **THEN** ve "Revisa tu número de WhatsApp: deben ser 10 dígitos" junto al campo, con el foco en él y lo demás en su lugar, y la URL sigue siendo `/editar/T` sin recargar

#### Scenario: destinos fuera de la lista

- **WHEN** la respuesta al envío termina en `/editar/<otro token>/gracias`, en `/registro/gracias`, en `https://evil.example/editar/T/gracias` o es un 500 o un 403
- **THEN** el módulo no navega, conserva lo capturado y muestra "No pudimos guardar tus cambios. Vuelve a intentarlo en un momento."

#### Scenario: el registro no cambia

- **WHEN** se corren las pruebas puras y del DOM del módulo de `/registro`
- **THEN** pasan sin tocarlas, y el diff de `/registro` no cambia

### Requirement: El token del enlace no sale por ningún canal

En la salida construida, para cualquier respuesta a `GET`, `HEAD` o `POST` bajo `/editar/` (200, re-pintado, 303, 404, 403 y 500):

- el token NO DEBE aparecer en el HTML, ni completo ni sus primeros 8 caracteres: ni en enlaces, ni en el `action` del formulario, ni en campos ocultos, ni en metadatos, `canonical`, `og:url` o JSON-LD;
- ninguna cabecera DEBE contenerlo, salvo el `Location` del 303, que DEBE ser exactamente `/editar/T/gracias`;
- `sitemap.xml` y `robots.txt` NO DEBEN mencionar `/editar`;
- las pantallas de 200 DEBEN declarar `noindex, nofollow`, y ninguna respuesta bajo `/editar/` DEBE permitir caché compartida;
- tras un error sin JS, la dirección DEBE ser `/editar/T` o `/editar/T?_action=editar`, sin otra copia del token;
- ningún mensaje que escriba la función al log DEBE contenerlo.

#### Scenario: nada lleva el token

- **WHEN** el arnés recorre con `T` la apertura, un envío con errores, un envío válido, la confirmación, un envío de otro origen, un guardado que falla y uno con la base caída, capturando cuerpos, cabeceras y la salida del emulador
- **THEN** `T` y su prefijo de 8 caracteres solo aparecen en las URLs pedidas y en el `Location` del 303, y en ningún cuerpo, otra cabecera ni línea del log

#### Scenario: un eco inyectado se detecta

- **WHEN** se agrega a mano un atributo con el token a la pantalla de edición de Astro
- **THEN** la prueba de no-fuga falla (y se revierte)

### Requirement: Las pantallas del enlace llevan su política de referente y quedan fuera de la medición

Toda respuesta de la función cuya ruta pedida empiece con `/editar/` DEBE llevar la cabecera `Referrer-Policy: strict-origin`, puesta por el middleware después de todo lo demás, aunque la respuesta traiga otra. Las pantallas de 200 DEBEN además declarar `<meta name="referrer" content="strict-origin">` en el lugar donde la pone Next. Fuera de `/editar/`, la política sigue siendo la global y la regla de no pisar una cabecera presente no cambia. La política NO DEBE anular el `Origin` de los envíos: un envío con el `Origin` del sitio y el `Referer` reducido al origen DEBE prosperar.

Ninguna pantalla del enlace (edición, re-pintado, confirmación ni su 404) DEBE cargar el script de medición, su dominio ni atributos de eventos, aunque la medición esté configurada. La exclusión DEBE ser estructural: las páginas de `src/pages/editar/` se arman con el tronco de gestión o con la 404 dinámica, nunca con el tronco medido, y el tronco de gestión dice por escrito por qué no mide.

#### Scenario: la cabecera en cada forma de respuesta

- **WHEN** se piden `GET /editar/T`, `GET /editar/T/gracias`, `GET /editar/<inventado>`, un envío válido (303), un envío con errores (200), un envío de otro origen (403) y uno con la base caída (500)
- **THEN** todas traen `Referrer-Policy: strict-origin`, las 200 traen además la `<meta>`, y `/` y `/loquesea` siguen con la política global

#### Scenario: el aviso de privacidad no recibe la ruta

- **WHEN** en el preview el dueño abre su enlace y toca "Lee el aviso de privacidad completo"
- **THEN** la petición a `/aviso-de-privacidad` lleva como `Referer` solo el origen del sitio, y Umami no registra ninguna ruta con el token

#### Scenario: un tronco medido en gestión reprueba

- **WHEN** se cambia a mano el tronco de una página de `src/pages/editar/` por el tronco medido, o se le agrega el script de medición
- **THEN** el guardián estático y el de la build fallan (y se revierte)

### Requirement: Editar el WhatsApp no toca la verificación por SMS

Con la verificación encendida, un envío de edición que cambia el WhatsApp NO DEBE pedir ningún código al proveedor, poner ni leer la cookie de paso, ni cambiar la marca de verificación de la ficha. La edición pendiente que deja Astro, aplicada con la función que usa el panel, DEBE limpiar la marca solo si el número cambia, como hoy.

#### Scenario: cambio de número con la bandera encendida

- **WHEN** con la bandera encendida y el Twilio falso, el dueño de una ficha publicada con número verificado manda desde su enlace un número nuevo, y otro dueño manda solo un horario nuevo
- **THEN** el simulador no recibe ninguna petición, ninguna respuesta trae `Set-Cookie`, las dos fichas conservan su marca, y al aplicar las dos pendientes con `aplicarEdicion` solo la primera queda sin marca

### Requirement: La Fase 4 no pierde dureza ni altera producto

Las pruebas que hoy importan `src/app/(gestion)/` DEBEN pasar a probar Astro, con el mismo número de aserciones o más por archivo y sin `skip` nuevos. Al terminar, el `grep` de imports de `src/app/(gestion)` en `tests/` DEBE salir vacío. Siguen vigentes, y cubren los archivos nuevos, los guardianes de la regla de origen, de `clientAddress`, de enlaces, de `noindex`, del sitemap y de la medición.

Este change NO DEBE modificar:

- `src/lib/`, `src/app/` ni `src/components/`;
- `src/middleware.ts`, salvo pasar la ruta pedida a la preparación de la respuesta;
- `astro.config.mjs`, `vercel.json`, `next.config.ts`, `prisma/`, `openspec/specs/` ni `spikes/`.

Ningún texto de UI cambia. Su PR DEBE abrirse como borrador apilado sobre el de 3b-2 y apuntar a `migracion-astro` al rebasarse.

#### Scenario: misma dureza

- **WHEN** se compara cada archivo de pruebas re-apuntado contra su versión anterior
- **THEN** tiene al menos las mismas aserciones, todas en verde, ningún `skip` nuevo, y el `grep` de imports de `src/app/(gestion)` en `tests/` sale vacío

#### Scenario: el diff no toca producto

- **WHEN** se revisa el diff del change
- **THEN** `src/lib/`, `src/app/` y `src/components/` no cambian, y en `src/middleware.ts` solo cambia la línea que pasa la ruta pedida

## MODIFIED Requirements

> Requirements introducidos por 3a y modificados por 3b-1 y 3b-2, todos sin archivar. Este bloque se aplica al archivar la Fase 4, después de 3b-2.

### Requirement: Cada Action corre solo por envío de formulario y solo desde su ruta

Una Action DEBE ejecutarse únicamente cuando llega como envío de formulario (`?_action=<nombre>`) a la ruta que tiene asignada en una tabla explícita. Hoy la tabla tiene cinco entradas:

- `reportar` → `/negocio/[ficha]/reportar`;
- `registrar` → `/registro`;
- `confirmar` → `/registro/verificar`;
- `reenviar` → `/registro/verificar`;
- `editar` → `/editar/[token]`.

Cualquier otra forma de pedirla DEBE responder exactamente igual que una dirección que no existe (`/a/b/c`), sin ejecutar nada ni escribir en la base:

- la vía RPC `/_actions/<nombre>`, exista o no ese nombre;
- una Action pedida desde otra ruta;
- un nombre que no está en la tabla.

Una entrada PUEDE declarar una compuerta, que se evalúa antes de ejecutar el manejador. `confirmar` y `reenviar` la tienen: la capacidad de verificación encendida. Con la compuerta cerrada, la Action NO DEBE ejecutarse ni leer el cuerpo, y la respuesta DEBE ser la misma que su desenlace "no encontrado". Una entrada PUEDE además validar su destino contra la ruta pedida: `editar` solo obedece `/editar/<el mismo token>/gracias`. La Action DEBE además comprobar por sí misma que se le llama desde su ruta. Un envío por `fetch` a la misma dirección del formulario es un envío de formulario y pasa por las mismas reglas.

#### Scenario: RPC cerrado

- **WHEN** llegan con `Origin` propio `POST /_actions/reportar`, `POST /_actions/registrar`, `POST /_actions/confirmar`, `POST /_actions/reenviar` y `POST /_actions/editar` (como formulario y como JSON) y `POST /_actions/inventada`
- **THEN** todas las respuestas son iguales entre sí y a la de `/a/b/c` en estado, cuerpo y cabeceras salvo la fecha, y no se crea ningún reporte, ficha, edición, archivo ni fila de cupos, ni sale ninguna petición al proveedor

#### Scenario: Action desde una ruta ajena

- **WHEN** llegan un reporte válido como `POST /?_action=reportar`, un registro válido como `POST /?_action=registrar`, un código válido con cookie de paso como `POST /registro?_action=confirmar`, y una edición válida con `T` como `POST /?_action=editar`, `POST /editar/T/gracias?_action=editar` y `POST /registro?_action=editar`
- **THEN** no se crea nada, no se gasta ningún intento ni cupo, el simulador no recibe peticiones y ninguna respuesta es un 500

#### Scenario: la compuerta va antes del manejador

- **WHEN** con la capacidad apagada llega `POST /registro/verificar?_action=confirmar` con una cookie de paso firmada con el secreto configurado
- **THEN** el manejador no corre, el cuerpo no se lee y la respuesta es idéntica a la de la capacidad encendida sin cookie

### Requirement: Los formularios siguen el patrón POST → 303 → GET con destinos que arma el servidor

Tras ejecutar una Action cuyo desenlace lleva a otra pantalla, el sitio DEBE responder `303` con un `Location` que sea una ruta del propio sitio (empieza con `/` y no con `//`), construida por el servidor con lo que devolvió la base, con un destino fijo de la tabla o, en la edición, con el segmento de la propia ruta pedida. NUNCA DEBE salir del `Referer`, del `Origin` ni de ningún campo del envío. El destino DEBE ser el mismo con cualquier `Referer` o sin él. Recargar la pantalla de destino NO DEBE ejecutar la Action otra vez.

Las únicas excepciones son el error del registro y el de la edición: igual que en Next, la respuesta al envío vuelve a pintar la misma página en el mismo 200, con los errores y los valores capturados, sin PRG y sin guardar esos valores en ningún lado.

#### Scenario: el `Referer` no decide nada

- **WHEN** se manda el mismo reporte válido, el mismo registro válido o la misma edición válida, con `Referer` de la propia página, con `Referer` solo del origen (como lo deja `strict-origin`), con `Referer: https://evil.example/` y sin `Referer`
- **THEN** los cuatro responden 303 con el mismo `Location` (`/negocio/<segmento actual>/reportar/gracias` para el reporte, `/registro/gracias` para el registro y `/editar/T/gracias` para la edición)

#### Scenario: recargar no reenvía

- **WHEN** el vecino llega a la confirmación del reporte, o el dueño a la de su registro o a la de su edición, tras el 303, y la recarga dos veces
- **THEN** la base tiene un solo reporte, una sola ficha nueva o una sola edición pendiente nueva

#### Scenario: el error del registro y el de la edición no pasan por un 303

- **WHEN** se envía un registro con errores, o una edición con errores
- **THEN** la respuesta es 200 con el formulario y sus errores en la misma ruta, sin `Location` y sin `Set-Cookie` con datos capturados
