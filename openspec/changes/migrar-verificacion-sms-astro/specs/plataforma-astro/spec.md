# Delta: plataforma-astro

> Fase 3b-2 de ADR-013 (T-024). `/registro/verificar` y sus Actions `confirmar` y `reenviar` pasan a servirse con Astro. **El contrato no cambia.** Lo fijan los requirements de la verificación por SMS de `agregar-verificacion-sms-tras-bandera` (T-016, sin archivar), los de `registro-negocio` y `revision-admin` que tocan la verificación, y los de `despliegue` sobre cabeceras. Este delta se monta sobre los de 2a, 2b, 3a y 3b-1, y da por hechos su middleware, la regla de origen, la tabla de Actions, el PRG, la 404 dinámica, el diff, el arnés, el Twilio falso y sus guardianes.

## ADDED Requirements

### Requirement: Con la verificación apagada, `/registro/verificar` responde como una dirección que no existe

Mientras la capacidad esté apagada o a medias, `/registro/verificar` DEBE responder, con cualquier método y con cualquier `?_action=` o sin él, la 404 de no encontrado de las rutas dinámicas (`NoEncontradoDinamico`). Esto incluye la falta de variables, las credenciales sin bandera, la bandera con un valor distinto de `1` y la bandera sin secreto o con un secreto de menos de 32 caracteres. La respuesta lleva estado 404, sin medición, con `noindex`, las cuatro cabeceras de `cabecerasDeSeguridad()`, la política de referente global y ningún `<script>` propio.

Su cuerpo DEBE ser byte a byte igual al de `/loquesea` y, cuando la build y la ejecución comparten entorno, al de `/a/b/c`. La única diferencia aceptada frente a `/a/b/c`, que sirve la CDN, es el `Cache-Control` de la respuesta de la función.

Con la capacidad apagada, una petición a esa ruta NO DEBE:

- leer la cookie de paso;
- leer el cuerpo del envío;
- consultar ni escribir la base (ni fichas ni filas de cupos);
- construir el adaptador del proveedor ni pedirle nada;
- poner ni borrar ninguna cookie.

NO DEBE usarse `new Response(null, { status: 404 })`, que deja una 404 vacía.

#### Scenario: apagada en las tres configuraciones

- **WHEN** la salida construida corre sin variables de la verificación, con las tres credenciales y sin bandera, y con `VERIFICACION_SMS_ACTIVA=1` y un secreto de 20 caracteres, y en cada caso se pide `GET /registro/verificar`
- **THEN** las tres respuestas son 404 con "No encontramos esta página", idénticas entre sí y a `/loquesea` salvo la fecha, sin medición, sin `Set-Cookie` y sin `<script>` propio

#### Scenario: una cookie bien firmada no abre nada con la bandera apagada

- **WHEN** con las credenciales y el secreto puestos pero sin bandera llegan `GET /registro/verificar`, `POST /registro/verificar?_action=confirmar` con `codigo=123456` y `POST /registro/verificar?_action=reenviar`, todos con una cookie `nu_paso` válida firmada con ese secreto para una ficha en revisión
- **THEN** los tres responden 404 de no encontrado, el simulador del proveedor no recibe ninguna petición, la base no gana ninguna fila de cupos, la ficha no cambia y ninguna respuesta trae `Set-Cookie`

#### Scenario: el cuerpo no se lee con la bandera apagada

- **WHEN** con la bandera apagada llega `POST /registro/verificar?_action=confirmar` con un cuerpo de 200 MB por trozos y sin `Content-Length`
- **THEN** responde la misma 404 que el envío normal, sin 500, el cuerpo no se lee ni una vez y la memoria del proceso no sube

#### Scenario: igual a una dirección inventada

- **WHEN** con la build y la ejecución compartiendo `SITIO_URL` se piden `/registro/verificar`, `/registro/loquesea` y `/a/b/c`
- **THEN** los tres responden 404 con el mismo cuerpo byte a byte, y las cabeceras solo difieren en el `Cache-Control` de la respuesta de la función

### Requirement: Con la verificación encendida, la pantalla "Confirma tu número" responde desde Astro el mismo HTML que Next

Con la capacidad completamente configurada y una cookie de paso válida, `/registro/verificar` DEBE responder 200 dentro del tronco público medido, con lo mismo que la versión Next para la misma cookie y el mismo entorno:

- "Confirma tu número" como único `h1`;
- "Te mandamos un código por SMS al número que termina en <4 dígitos>. Escríbelo aquí y confirmamos que ese WhatsApp es tuyo.", con los últimos cuatro dígitos tomados de la cookie;
- "Tu negocio ya quedó registrado y está en revisión. Esto solo nos ahorra un paso.";
- el campo "Código de 6 dígitos" con su etiqueta asociada, teclado numérico, `autocomplete="one-time-code"` y `maxlength="6"`;
- el botón "Confirmar mi número", en su propio formulario;
- "Reenviar el código", en otro formulario;
- el enlace "Mejor luego, mi registro ya quedó" hacia `/registro/gracias`;
- la instrucción de no indexar ni seguir enlaces.

Con `?error=` DEBE pintar junto al campo el mensaje de hoy, leyendo solo el primer valor e ignorando cualquier otro:

- `incompleto`: "Escribe los 6 dígitos que te llegaron por SMS.";
- `no-coincide`: "Ese código no es. Revísalo y vuelve a escribirlo.";
- `vencido`: "Ese código ya venció. Pide uno nuevo.";
- `proveedor`: "No pudimos confirmar tu número en este momento. No te preocupes: tu registro está en revisión y te vamos a contactar por WhatsApp.".

Con `?errorReenvio=` DEBE pintar, con la misma regla:

- `espera-reenvio`: "Espera un momento para pedir otro código.";
- `cupo`: "Ya pedimos varios códigos desde aquí. Espera un rato y vuelve a intentar.".

La pantalla NO DEBE llevar islas, runtime de React ni ningún `<script>` propio, ni aparecer en el sitemap. Cada formulario DEBE postear de forma nativa a su Action en esta misma ruta. El número completo, el identificador de la ficha y el código NO DEBEN aparecer en el HTML, en un `Location` ni en el log. Contra Next, el diff DEBE aceptar en sus dos formularios solo las dos normalizaciones de formulario de 3a (los atributos `action`, `method` y `enctype`, comparados por su efecto, y los ocultos `$ACTION_…` de Next), con su salida impresa. Astro NO DEBE agregar campos ocultos.

#### Scenario: pantalla igual a la de hoy

- **WHEN** con la bandera encendida, el Twilio falso y la misma cookie firmada se abre `/registro/verificar` sin parámetros, con cada uno de los cuatro `?error=`, con `?error=x`, con cada uno de los dos `?errorReenvio=`, con `?error=no-coincide&errorReenvio=cupo` y con `?error=x&error=vencido`, con y sin medición y con y sin `SITIO_URL`
- **THEN** el diff contra Next no reporta diferencias fuera de las dos normalizaciones de formulario, y la salida dice dónde aplicó cada una

#### Scenario: sin JavaScript y sin datos de más

- **WHEN** se revisa el HTML de la pantalla en la salida construida
- **THEN** no hay `astro-island`, ni `modulepreload`, ni `<script>` propio, ni campos ocultos; aparecen los cuatro últimos dígitos y no aparecen los diez dígitos, `+52…` ni el identificador de la ficha

#### Scenario: un campo de más sale como diferencia

- **WHEN** se inyecta a mano un campo oculto o un atributo `data-` en un formulario de la pantalla de Astro
- **THEN** el diff lo reporta como diferencia (y se revierte)

### Requirement: Sin una credencial de paso válida, la pantalla y sus envíos no dicen nada

Con la capacidad encendida, la pantalla y sus dos Actions DEBEN responder la 404 de no encontrado, sin decir si el registro existe ni si la capacidad está encendida, en estos casos:

- la cookie de paso falta, viene alterada, viene firmada con otro secreto, está malformada o caducó (15 minutos);
- la Action `confirmar` o `reenviar` desemboca en "no encontrado" (la ficha de la credencial ya no existe), aunque la cookie sea válida;
- Astro no pudo leer el envío (cuerpo de más de 6 MiB, cuerpo que no es formulario o falla interna antes del manejador).

Para cada forma de petición (`GET`/`HEAD`, `POST ?_action=confirmar`, `POST ?_action=reenviar` y `POST` sin `?_action=`), la respuesta DEBE ser idéntica salvo la fecha a la de la misma petición con la capacidad apagada, en estado, cuerpo y cabeceras. Ninguno de esos casos DEBE:

- gastar intentos, reenvíos ni turnos de envío;
- pedir nada al proveedor;
- escribir en la base;
- poner o borrar cookies;
- responder 500.

Igual que en Next, un `GET` con una cookie válida cuya ficha se borró sigue pintando la pantalla, porque la página no consulta la base.

#### Scenario: los motivos no se distinguen

- **WHEN** con la bandera encendida se piden `GET /registro/verificar` y `POST /registro/verificar?_action=confirmar` con `codigo=123456` sin cookie, con la firma alterada en un carácter, firmada con otro secreto, con contenido que no es JSON y caducada hace un segundo, y lo mismo con la bandera apagada
- **THEN** todos los `GET` son idénticos entre sí salvo la fecha, todos los `POST` también, ninguno trae `Set-Cookie`, el simulador no recibe peticiones y la base no gana filas

#### Scenario: credencial de una ficha borrada

- **WHEN** con una cookie válida cuya ficha ya no existe se envía `POST /registro/verificar?_action=confirmar` con un código de 6 dígitos y `POST …?_action=reenviar`
- **THEN** los dos responden la misma 404 que sin cookie, sin pedir nada al proveedor y sin escribir nada

#### Scenario: un envío que Astro no pudo leer

- **WHEN** con la bandera encendida y una cookie válida llegan a `?_action=confirmar` un cuerpo de 7 MiB (con `Content-Length` y sin él), un JSON y un `text/plain`
- **THEN** los tres responden la 404 de no encontrado, sin 500, sin pedir nada al proveedor y sin gastar intentos

### Requirement: Confirmar y reenviar el código sin JavaScript se comportan igual que en Next

Las Actions `confirmar` y `reenviar` DEBEN delegar en `src/lib/` sin lógica nueva:

- las dependencias, con `dependenciasDeVerificacion(request.headers)`. La IP sale de ahí, con `ipDeEncabezados`, nunca con `clientAddress`;
- el desenlace, con `ejecutarConfirmacion` y `ejecutarReenvio`, pasando las cookies de Astro como almacén.

El destino que devuelven DEBE obedecerse solo si está en esta lista cerrada:

- `/registro/gracias?verificado=1` y `/registro/gracias?agotado=1`;
- `/registro/verificar`;
- `/registro/verificar?error=` con `incompleto`, `no-coincide`, `vencido` o `proveedor`;
- `/registro/verificar?errorReenvio=` con `espera-reenvio` o `cupo`.

Cualquier otro destino DEBE tratarse como "no encontrado". Cada desenlace DEBE producir lo mismo que Next en un envío nativo:

| Envío | Respuesta | Cookie | Proveedor y base |
|---|---|---|---|
| código correcto | 303 a `/registro/gracias?verificado=1` | borrada (valor vacío, `Max-Age=0`, mismo `Path`, `HttpOnly`, `SameSite=Lax` y `Secure` en HTTPS) | una comprobación; la ficha gana su fecha de verificación |
| campo vacío, de 4 dígitos, con letras, de 7 dígitos o con un archivo | 303 a `?error=incompleto` | intacta | ninguna petición; ningún intento gastado |
| código que no coincide | 303 a `?error=no-coincide` | intacta | un intento gastado |
| código vencido | 303 a `?error=vencido` | intacta | un intento gastado |
| proveedor caído o que no contesta | 303 a `?error=proveedor` | intacta | ningún intento gastado |
| quinto código equivocado | 303 a `/registro/gracias?agotado=1` | borrada | ya no se pide nada más para esa ficha |
| reenvío antes de 60 s | 303 a `?errorReenvio=espera-reenvio` | intacta | ningún SMS; ningún reenvío gastado |
| reenvío permitido | 303 a `/registro/verificar` | intacta | un SMS; un reenvío gastado |
| tercer reenvío | 303 a `/registro/gracias?agotado=1` | borrada | ningún SMS |
| reenvío con el cupo por IP agotado | 303 a `?errorReenvio=cupo` | intacta | ningún SMS |

Los campos que pretendan fijar la ficha, la verificación o el destino (`negocioId`, `numeroVerificadoEn`, `verificado`, `destino`, `$ACTION_…`) DEBEN ignorarse. El destino DEBE ser el mismo con cualquier `Referer` o sin él. Recargar la pantalla de destino NO DEBE repetir la Action ni costar un SMS. El 303 DEBE conservar el `Set-Cookie` del borrado tras pasar por el middleware. Estas pruebas DEBEN correr sobre la salida construida contra el proveedor simulado de 3b-1, sin red y sin credenciales reales.

#### Scenario: recorrido completo sin JS

- **WHEN** con la bandera encendida y el simulador en `enviado,approved` el arnés abre `/registro`, envía un registro válido, sigue el 303 a `/registro/verificar`, escribe `123456`, toca "Confirmar mi número" y sigue el 303
- **THEN** la cadena es 200 → 303 → 200 → 303 → 200 con "¡Listo! Ya confirmamos tu número." arriba de "¡Gracias! Tu negocio está en revisión. Te contactaremos por WhatsApp para confirmar tus datos antes de publicarlo.", el `Origin` de los dos envíos es el del sitio, no hay 500, la ficha sigue en `en_revision` con su fecha de verificación, y un `GET /registro/verificar` posterior responde la 404 porque la cookie se borró

#### Scenario: mismos desenlaces que Next

- **WHEN** el arnés manda contra Next de `main` y contra Astro, los dos con el simulador, cada fila de la tabla de desenlaces, más un código equivocado seguido del correcto, el código correcto con campos extra de verificación y un envío con `Referer: https://evil.example/`
- **THEN** cada par coincide en la cadena de estados, la ruta del `Location`, los atributos de `Set-Cookie`, las peticiones que recibió el simulador y lo que queda en la base

#### Scenario: equivocarse y volver a intentar

- **WHEN** el dueño escribe un código que no coincide y, al ver "Ese código no es. Revísalo y vuelve a escribirlo.", recarga la página dos veces y luego escribe el correcto
- **THEN** las recargas no gastan intentos ni llaman al proveedor, y el código correcto lo lleva a gracias con la línea de confirmación

#### Scenario: nada sensible en la URL ni en el log

- **WHEN** se recorre un registro con equivocación, reenvío y confirmación, otro que agota los intentos y otro con el proveedor caído
- **THEN** las únicas rutas son `/registro`, `/registro/verificar` y `/registro/gracias` con los parámetros de la lista, y ni el log ni ninguna cabecera contienen el código, el número completo, el identificador de la ficha ni ninguna credencial

### Requirement: Los topes del canal de SMS y su atomicidad se conservan sobre la salida construida

La salida construida DEBE aplicar sin cambios los topes de T-016, con la misma atomicidad que hoy:

- 5 códigos por registro, contados en el servidor, de modo que reusar una cookie vieja no los revive;
- 2 reenvíos por registro, apartados de forma atómica;
- 60 s entre un SMS y el siguiente del mismo registro, también atómico;
- 3 códigos por IP y hora, con su propio contador en la memoria del proceso: agotarlo no bloquea un registro ni un reporte de la misma IP, y no aplica sin `REGISTRO_ENCABEZADO_IP`;
- el tope diario por proceso, que al alcanzarse deja de pedir códigos y deja una sola alerta en el log.

La IP DEBE salir del último valor del encabezado declarado: rotar el primer valor de `x-forwarded-for` no da más cupo.

#### Scenario: reusar la primera cookie no revive intentos

- **WHEN** el dueño guarda su primera cookie de paso, falla el código cinco veces (el quinto lo manda a gracias con "Ya lo intentaste varias veces. No te preocupes: tu registro está en revisión y te vamos a contactar por WhatsApp.") y vuelve a enviar un código con la cookie guardada
- **THEN** recibe 303 a `/registro/gracias?agotado=1` y el simulador no recibe ninguna comprobación más

#### Scenario: ráfaga de reenvíos

- **WHEN** contra la salida construida y con PostgreSQL, ya vencida la espera de 60 s, llegan seis "Reenviar el código" simultáneos con la misma cookie
- **THEN** el simulador recibe exactamente una petición de envío, se gasta un solo reenvío, los demás reciben "Espera un momento para pedir otro código." y ninguno recibe un 500

#### Scenario: cupo por IP de los códigos

- **WHEN** con `REGISTRO_ENCABEZADO_IP=x-forwarded-for` se piden desde la misma IP declarada (con el primer valor distinto cada vez) tres códigos en una hora y luego se toca "Reenviar el código" con la espera vencida
- **THEN** ese reenvío responde "Ya pedimos varios códigos desde aquí. Espera un rato y vuelve a intentar." sin SMS, y un registro y un reporte desde esa IP se procesan con su propio contador

#### Scenario: tope diario

- **WHEN** la salida construida corre con `VERIFICACION_SMS_TOPE_DIARIO=2` y llegan tres registros válidos y luego un reenvío con la espera vencida
- **THEN** solo los dos primeros reciben SMS y llegan a la pantalla del código, el tercero va a gracias con su ficha guardada, el reenvío responde "Espera un momento para pedir otro código." sin SMS, y el log tiene una sola alerta del tope sin ningún número

### Requirement: Confirmar desde Astro deja la marca que el panel muestra, sin publicar nada

Una confirmación correcta servida por Astro DEBE escribir en la ficha solo su fecha de verificación. Todas las demás columnas DEBEN quedar iguales: estado `en_revision`, origen, constancia y espera en la cola. Una segunda confirmación NO DEBE cambiar esa fecha. La ficha NO DEBE aparecer en ninguna página pública ni en el sitemap de la build.

El panel (todavía en Next hasta la Fase 5) DEBE leer esa ficha con sus consultas de siempre y mostrar:

- "Número verificado por SMS" en su renglón de la cola, con el mismo orden;
- "Número verificado por SMS el <fecha>" junto al WhatsApp en el detalle;
- el botón "Escribirle por WhatsApp" y las acciones de aprobar y rechazar de siempre.

La verificación NO DEBE sustituir la aprobación humana.

#### Scenario: la marca llega al panel

- **WHEN** una ficha confirma su código por la salida construida y se lee con las consultas de la cola y del detalle del panel
- **THEN** la cola la muestra en su lugar de siempre con "Número verificado por SMS", el detalle muestra "Número verificado por SMS el <fecha>" con "Escribirle por WhatsApp" y los formularios de aprobar y rechazar completos, y la ficha sigue en `en_revision`

#### Scenario: solo cambia la fecha

- **WHEN** se compara la fila de la ficha antes y después de confirmar dos veces
- **THEN** la única columna distinta es la fecha de verificación, igual a la de la primera confirmación

### Requirement: Pedir la pantalla del código no tiene efectos

Cualquier `GET` o `HEAD` a `/registro/verificar`, con o sin cookie, con la bandera encendida o apagada, NO DEBE:

- escribir en la base;
- pedir nada al proveedor;
- gastar intentos, reenvíos ni turnos de envío;
- poner ni borrar cookies.

Repetido, DEBE devolver el mismo cuerpo. En particular, el `GET` que hace el módulo de mejora progresiva de `/registro` al seguir el 303 antes de navegar NO DEBE consumir nada. Con la bandera encendida, ese módulo DEBE terminar en la pantalla del código.

#### Scenario: el módulo de `/registro` sigue el 303 sin gastar nada

- **WHEN** con la bandera encendida y el simulador en `enviado` se registra un negocio y se piden tres veces `GET /registro/verificar` con la cookie del 303
- **THEN** las tres responden 200 con el mismo cuerpo, sin `Set-Cookie`, el simulador recibió una sola petición (la del registro) y las filas de `Negocio` y de cupos no cambian entre la primera y la última

#### Scenario: con JS, el registro llega a la pantalla del código

- **WHEN** en el DOM de pruebas, con las respuestas reales de la build capturadas con la bandera encendida, el dueño envía un registro válido con JavaScript
- **THEN** el módulo navega a `/registro/verificar` y no hace ninguna otra petición

### Requirement: La mitad 3b-2 no pierde dureza ni altera producto

Las pruebas que hoy importan `src/app/(publico)/registro/verificar/` o usan `/registro/verificar` como ejemplo de ruta inexistente DEBEN pasar a probar Astro, con el mismo número de aserciones o más por archivo y sin `skip` nuevos. Al terminar, el `grep` de imports de `src/app/(publico)/registro` en `tests/` DEBE salir vacío. Siguen vigentes los guardianes de la regla de origen, de `clientAddress`, de enlaces, de `noindex`, del sitemap y de exclusión de la medición; ninguno se afloja, y los dos primeros cubren los archivos nuevos.

Este change NO DEBE modificar:

- `src/lib/`, `src/app/` ni `src/middleware.ts`;
- `astro.config.mjs`, `vercel.json`, `next.config.ts`, `prisma/`, `openspec/specs/` ni `spikes/`;
- `src/components/`, salvo el tipo de las dos `action` y el `method` de `FormularioVerificarCodigo`, cuyo HTML con funciones (Next) NO DEBE cambiar.

Ningún texto de UI cambia. Ningún archivo de `src/` ni de la build DEBE referirse al simulador del proveedor. Su PR DEBE apuntar a `migracion-astro` y abrirse después de mergear el de 3b-1.

#### Scenario: misma dureza

- **WHEN** se compara cada archivo de pruebas re-apuntado contra su versión anterior
- **THEN** tiene al menos las mismas aserciones, todas en verde, ningún `skip` nuevo, y el `grep` de imports de `src/app/(publico)/registro` en `tests/` sale vacío

#### Scenario: el diff no toca producto

- **WHEN** se revisa el diff del change
- **THEN** `src/lib/`, `src/app/` y `src/middleware.ts` no cambian, en `src/components/` solo cambian los tipos y el `method` de `FormularioVerificarCodigo`, y la prueba de render de ese componente con funciones da el mismo HTML que antes

## MODIFIED Requirements

> Requirement introducido por 3a y modificado por 3b-1, los dos sin archivar. Este bloque se aplica al archivar 3b-2, después de 3b-1.

### Requirement: Cada Action corre solo por envío de formulario y solo desde su ruta

Una Action DEBE ejecutarse únicamente cuando llega como envío de formulario (`?_action=<nombre>`) a la ruta que tiene asignada en una tabla explícita. Hoy la tabla tiene cuatro entradas:

- `reportar` → `/negocio/[ficha]/reportar`;
- `registrar` → `/registro`;
- `confirmar` → `/registro/verificar`;
- `reenviar` → `/registro/verificar`.

Cualquier otra forma de pedirla DEBE responder exactamente igual que una dirección que no existe (`/a/b/c`), sin ejecutar nada ni escribir en la base:

- la vía RPC `/_actions/<nombre>`, exista o no ese nombre;
- una Action pedida desde otra ruta;
- un nombre que no está en la tabla.

Una entrada PUEDE declarar una compuerta, que se evalúa antes de ejecutar el manejador. `confirmar` y `reenviar` la tienen: la capacidad de verificación encendida. Con la compuerta cerrada, la Action NO DEBE ejecutarse ni leer el cuerpo, y la respuesta DEBE ser la misma que su desenlace "no encontrado". La Action DEBE además comprobar por sí misma que se le llama desde su ruta. Un envío por `fetch` a la misma dirección del formulario es un envío de formulario y pasa por las mismas reglas.

#### Scenario: RPC cerrado

- **WHEN** llegan con `Origin` propio `POST /_actions/reportar`, `POST /_actions/registrar`, `POST /_actions/confirmar` y `POST /_actions/reenviar` (como formulario y como JSON) y `POST /_actions/inventada`
- **THEN** todas las respuestas son iguales entre sí y a la de `/a/b/c` en estado, cuerpo y cabeceras salvo la fecha, y no se crea ningún reporte, ficha, archivo ni fila de cupos, ni sale ninguna petición al proveedor

#### Scenario: Action desde una ruta ajena

- **WHEN** llegan un reporte válido como `POST /?_action=reportar`, un registro válido como `POST /?_action=registrar`, y un código válido, con una cookie de paso válida, como `POST /registro?_action=confirmar`, `POST /registro/gracias?_action=confirmar` y `POST /?_action=reenviar`
- **THEN** no se crea nada, no se gasta ningún intento ni reenvío, el simulador no recibe peticiones y ninguna respuesta es un 500

#### Scenario: la compuerta va antes del manejador

- **WHEN** con la capacidad apagada llega `POST /registro/verificar?_action=confirmar` con una cookie de paso firmada con el secreto configurado
- **THEN** el manejador no corre, el cuerpo no se lee y la respuesta es idéntica a la de la capacidad encendida sin cookie
