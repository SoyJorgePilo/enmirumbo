# Delta: plataforma-astro

> Fase 5a de ADR-013 (T-026). El acceso al panel, la sesión, la guarda, la cola, el listado "Todos los negocios" y la 404 del comodín pasan a servirse con Astro. **El contrato no cambia.** Lo fijan `revision-admin`, `layout-base` ("El panel del admin y el modo edición quedan fuera de la medición") y `despliegue` ("Toda respuesta del sitio lleva las cabeceras de seguridad básicas"). Este delta se monta sobre los de 2a, 2b, 3a, 3b-1 y 3b-2, y da por hechos su middleware, la regla de origen, la tabla de Actions, el PRG, la 404 dinámica, el diff, el arnés y sus guardianes.

## ADDED Requirements

### Requirement: Toda ruta del panel exige sesión por construcción, no por lista

El sitio DEBE decidir el acceso a cada petición del panel según la ruta que va a pintar, con una tabla cerrada de políticas:

- la pantalla de acceso `/admin` se abre sin sesión;
- toda dirección del panel que no corresponde a ninguna pantalla responde 404, con sesión y sin ella, sin leer la cookie;
- todo lo demás bajo `/admin` exige sesión válida, **incluida cualquier ruta que se agregue mañana sin darla de alta en la tabla**.

Sin sesión válida, una pantalla del panel DEBE responder la misma redirección que hoy responde Next (medida), hacia `/admin` sin parámetros, y una Action del panel la redirección de un envío hacia `/admin`. Ninguna de las dos DEBE leer la base, leer el cuerpo del envío, ejecutar la Action ni traer en el HTML, en las cabeceras o en la URL un nombre, un WhatsApp, un conteo o un identificador de registro.

La redirección de una pantalla sin sesión DEBE coincidir con la de Next en estado, `Location`, `Cache-Control` y cookies. Su cuerpo es la única diferencia aceptada: Next manda su documento de error y Astro la manda sin cuerpo.

Las únicas Actions que corren sin sesión son "entrar" en `/admin` y "Salir" en la cola, como hoy. Una cookie con la firma alterada, firmada con otro secreto, vencida, con una caducidad no canónica o presentada con el panel sin configurar DEBE tratarse igual que no traer cookie. Ninguna ruta del panel DEBE prerenderizarse. La verificación automática DEBE enumerar las rutas reales de la salida construida y fallar si alguna ruta bajo `/admin` no tiene política escrita en la tabla.

#### Scenario: pantallas sin sesión

- **WHEN** sin cookie se piden `GET` y `HEAD` de `/admin/cola`, `/admin/negocios` y `/admin/negocios?estado=publicado&pagina=2`, con la base sembrada
- **THEN** cada una responde la redirección medida en Next hacia `/admin`, sin `Set-Cookie` y sin ningún nombre, WhatsApp, colonia, conteo ni identificador sembrado en la respuesta

#### Scenario: cookies que no son sesión

- **WHEN** se pide `/admin/cola` con una cookie `nu_panel` con la firma alterada en un carácter, firmada con otro secreto, vencida hace un segundo, con la caducidad escrita con ceros a la izquierda, y con una cookie bien firmada pero con el servidor sin `PANEL_CONTRASENA`
- **THEN** las cinco respuestas son la misma redirección hacia `/admin`, y la del panel sin configurar lleva a "El panel no está disponible por ahora."

#### Scenario: una ruta nueva sin dar de alta

- **WHEN** se agrega una página `src/pages/admin/nueva.astro` sin entrada en la tabla de políticas y se construye el sitio
- **THEN** la verificación automática falla nombrando esa ruta, y servida sin sesión responde la redirección hacia `/admin`, no su contenido

#### Scenario: una Action del panel sin sesión no lee nada

- **WHEN** sin sesión llega `POST /admin/cola?_action=inventada` con 7 MiB por trozos
- **THEN** responde la redirección de envío hacia `/admin`, el cuerpo no se lee ni una vez y ninguna Action se ejecuta

#### Scenario: lo que no existe no exige sesión

- **WHEN** se piden `/admin/x`, `/admin/a/b/c` y `/admin/registros/<id>/loquesea`, con sesión y sin ella
- **THEN** las seis respuestas son la 404 del panel, idénticas salvo la fecha, y ninguna lee la cookie

### Requirement: La pantalla de acceso responde desde Astro el mismo HTML que Next

`/admin` DEBE responder, con el mismo entorno, lo mismo que la versión Next:

- con el panel configurado y sin sesión: "Panel de revisión" como único `h1` y un formulario con el campo "Contraseña" (contraseña, requerido, `autocomplete="current-password"`, con su etiqueta asociada) y el botón "Entrar";
- con `?error=incorrecta`, "Contraseña incorrecta." con `role="alert"` junto al campo, y el campo marcado como inválido y descrito por ese mensaje;
- con `?error=intentos`, "Demasiados intentos. Espera unos minutos y vuelve a intentar.";
- con `?salida=1`, "Cerraste sesión." con `role="status"`;
- sin contraseña, sin secreto o con un secreto de menos de 32 caracteres: "El panel no está disponible por ahora." y **ningún campo**. El detalle de qué falta va solo al log, una sola vez por proceso;
- con sesión válida, la redirección medida en Next hacia `/admin/cola`.

Los parámetros se DEBEN leer como los lee Next, con lista cerrada: un parámetro repetido no vale, y cualquier otro valor se ignora y no se refleja. La pantalla DEBE llevar el título del panel, `noindex, nofollow`, el `<meta name="referrer" content="strict-origin">` y ningún `<script>`, isla ni runtime de React. El formulario DEBE postear de forma nativa a su Action en esta misma ruta. Contra Next, el diff DEBE aceptar solo las dos normalizaciones de formulario de 3a, con su salida impresa, y Astro NO DEBE agregar campos ocultos.

#### Scenario: los estados del acceso iguales a hoy

- **WHEN** se abre `/admin` sin configurar, sin secreto, con un secreto de 31 caracteres, configurado sin sesión, con `?error=incorrecta`, `?error=intentos`, `?error=x`, `?error=x&error=intentos` y `?salida=1`
- **THEN** el diff contra Next no reporta diferencias fuera de las dos normalizaciones de formulario, y `?error=x&error=intentos` no pinta ningún mensaje

#### Scenario: el panel sin configurar no ofrece dónde escribir

- **WHEN** el servidor corre sin `PANEL_CONTRASENA` y alguien abre `/admin` diez veces
- **THEN** ve "El panel no está disponible por ahora." sin ningún campo, la respuesta no dice qué variable falta y el log del servidor lo dice una sola vez

### Requirement: Entrar y salir sin JavaScript se comportan igual que en Next

La Action "entrar" DEBE seguir el orden de hoy, sin lógica nueva:

1. sin configuración, ir a `/admin` sin apartar nada;
2. **apartar el intento antes de comparar**;
3. con el margen agotado, ir a `/admin?error=intentos` aunque la contraseña sea correcta;
4. con la contraseña equivocada, ir a `/admin?error=incorrecta`;
5. al acertar, poner la cookie de sesión e ir a `/admin/cola`.

"Salir" DEBE borrar la cookie con los mismos atributos con los que se creó e ir a `/admin?salida=1`. Cada destino es un 303 a una ruta de esa lista cerrada. La cookie `nu_panel` DEBE conservar:

- el valor `<caducidad>.<firma HMAC-SHA256>` con el mismo secreto (`PANEL_SESION_SECRETO`), de modo que una cookie emitida por una versión vale en la otra;
- `HttpOnly`, `SameSite=Lax`, `Path=/admin`, `Max-Age=28800` y `Secure` en HTTPS.

El `Set-Cookie` DEBE llegar al navegador tras pasar por el middleware. La contraseña, la que se intentó, el valor de la cookie y la IP NO DEBEN aparecer en el log, en la URL ni en ninguna cabecera.

Una Action del acceso que Astro no pudo leer (cuerpo de más de 6 MiB, cuerpo que no es formulario) DEBE ir a `/admin` sin apartar intento, sin comparar y sin tocar la cookie. Recargar cualquier pantalla de destino NO DEBE repetir la Action.

#### Scenario: recorrido completo sin JS

- **WHEN** con el JavaScript apagado el admin abre `/admin`, escribe una contraseña equivocada, luego la correcta, llega a "Registros por revisar", toca "Salir" y después vuelve atrás en el navegador
- **THEN** la cadena es 200 → 303 → 200 con "Contraseña incorrecta." → 303 → 200 de la cola → 303 → 200 con "Cerraste sesión.", el `Origin` de los envíos es el del sitio, no hay 500, y volver atrás pide la cola sin cookie y recibe la redirección al acceso

#### Scenario: mismos desenlaces y misma cookie que Next

- **WHEN** el arnés manda contra Next de `main` y contra Astro la contraseña correcta, una equivocada, una vacía, una de 10 000 caracteres, el envío sin configuración, salir con sesión y salir sin sesión
- **THEN** cada par coincide en la cadena de estados, la ruta del `Location`, los atributos de `Set-Cookie` y las filas de intentos, y la cookie que emite Astro abre la cola de Next y la de Next abre la de Astro

#### Scenario: nada sensible fuera de su lugar

- **WHEN** se recorren un acceso exitoso, uno fallido y uno bloqueado y se revisan el log, las URLs y las cabeceras
- **THEN** ninguno contiene la contraseña configurada, la intentada, el valor de la cookie ni la IP

#### Scenario: un envío que Astro no pudo leer

- **WHEN** llegan a `/admin?_action=entrar` un cuerpo de 7 MiB, un JSON con la contraseña correcta y un `text/plain`
- **THEN** los tres van a `/admin` sin `Set-Cookie`, sin 500 y sin ninguna fila de intentos nueva

### Requirement: El límite de intentos de acceso conserva su atomicidad compartida entre instancias

La salida construida DEBE aplicar sin cambios el límite de hoy:

- 5 intentos por procedencia cada 10 minutos, contando aciertos y fallos;
- contados en la base y compartidos entre procesos (el arreglo del hallazgo A4 de T-013);
- apartados en una sola operación atómica antes de comparar;
- con la llave derivada de la IP y del secreto, sin guardar la IP en claro;
- con el contador en memoria solo como respaldo si la base no responde, avisado en el log.

La procedencia DEBE salir del último valor del encabezado declarado en `REGISTRO_ENCABEZADO_IP`, nunca de la dirección que deduce el marco. Sin esa variable, el límite no aplica y el log lo dice una sola vez por proceso.

#### Scenario: ráfaga contra el acceso

- **WHEN** contra la salida construida y con PostgreSQL llegan 20 envíos simultáneos de "entrar" desde la misma IP declarada, con el primer valor de `x-forwarded-for` distinto en cada uno, mezclando la contraseña correcta y equivocadas
- **THEN** quedan exactamente 5 intentos apartados para esa procedencia, a lo sumo 5 envíos llegan a comparar, los demás reciben "Demasiados intentos. Espera unos minutos y vuelve a intentar." y ninguno de ellos trae `Set-Cookie`

#### Scenario: dos instancias no duplican el margen

- **WHEN** dos procesos de la misma build, contra la misma base, reciben tres intentos equivocados cada uno desde la misma IP
- **THEN** el sexto, en cualquiera de los dos, responde "Demasiados intentos. Espera unos minutos y vuelve a intentar."

#### Scenario: la ventana vence

- **WHEN** tras agotar el margen pasan 10 minutos y el admin escribe la contraseña correcta
- **THEN** entra a la cola

#### Scenario: sin encabezado de IP declarado

- **WHEN** la build corre sin `REGISTRO_ENCABEZADO_IP` y llegan 8 intentos equivocados
- **THEN** ninguno se bloquea por el límite y el log tiene un solo aviso de que el límite del panel está inactivo, sin ninguna IP

### Requirement: Toda respuesta del panel lleva sus cabeceras, su política de referente estricta, no se guarda en caché y no se mide

Toda respuesta bajo `/admin` que sale de la función (200, 303, 307, 403, 404 y 500) DEBE llevar:

- las cuatro cabeceras de `cabecerasDeSeguridad()`, salvo la de referente;
- `Referrer-Policy: strict-origin`, sin que la global la anule;
- un `Cache-Control` que incluya `no-store`.

Cada documento del panel, incluida la 404 del comodín, DEBE declarar además `<meta name="referrer" content="strict-origin">`. Las pantallas DEBEN declarar `noindex, nofollow`, y la 404 del comodín solo `noindex`, igual que Next. NO DEBE cargar el script de medición ni ningún atributo de evento, aunque la medición esté configurada: la exclusión DEBE salir de la estructura (el documento del panel no es el tronco medido) y quedar escrita con su motivo. Ninguna ruta del panel DEBE aparecer en el sitemap ni estar enlazada desde lo público.

Frente a Next, la única diferencia de cabeceras aceptada es la cabecera de referente estricta bajo `/admin`, además de las ya aceptadas en 3a. (El cuerpo vacío de la redirección sin sesión no es de cabeceras y está declarado en el requirement de la guarda.)

#### Scenario: cabeceras en cada forma de respuesta

- **WHEN** se piden la pantalla de acceso, la cola con sesión, la cola sin sesión, el 303 de entrar, `/admin/x`, un envío a `/admin` con `Origin: https://evil.example/` y `POST /admin/cola?_action=reportar` con sesión
- **THEN** todas llevan las cuatro cabeceras con `Referrer-Policy: strict-origin` y un `Cache-Control` con `no-store`, y ninguna anuncia el marco

#### Scenario: salir del panel no entrega la ruta

- **WHEN** desde una pantalla del panel o desde su 404 el admin toca el logo o un enlace legal del pie
- **THEN** el referente que recibe la página pública es solo el origen del sitio, sin `/admin/…`

#### Scenario: el panel no se mide

- **WHEN** con la medición configurada se abren el acceso, la cola, el listado y una 404 del panel
- **THEN** ninguna trae el script del proveedor ni atributos de evento, y la verificación automática falla si una página de `src/pages/admin/` usa el tronco medido o el documento del panel pierde su motivo escrito

### Requirement: La cola y "Todos los negocios" responden desde Astro el mismo HTML que Next

Con sesión válida, `/admin/cola` y `/admin/negocios` DEBEN responder, para la misma base y el mismo entorno, lo mismo que la versión Next. Eso incluye todos los literales, el orden, las etiquetas, los conteos, la paginación y los filtros de `revision-admin`:

- "Registros por revisar", "Alta nueva", "Edición", "Revisar", "Lleva más de 48 horas", "Ya estaba publicada, la despublicaste" y "No hay registros esperando. Todo al día.";
- "Negocios reportados" y "Ver reportes";
- "Ver todos los negocios" y "Salir";
- "Todos los negocios", "<n> negocios en esta lista", "Filtrar por estado", "Página 2 de 5", "Ver más antiguos", "Ver más nuevos", "Ver detalle" y "Volver a la cola".

Las dos pantallas DEBEN comprobar la sesión antes de leer la base, recortar en la consulta (25 renglones) y no llevar ningún `<script>` ni isla. El listado NO DEBE ofrecer ninguna acción de escritura. "Salir" DEBE ser un formulario nativo hacia su Action en la cola. Contra Next, el diff DEBE aceptar solo las normalizaciones de formulario de 3a en el botón "Salir".

#### Scenario: cola igual a la de hoy

- **WHEN** se abre la cola con la base vacía, y con dos altas, una edición, una ficha despublicada hace una hora con registro de hace ocho meses, una alta de 50 horas, una de 3 horas, una verificada por SMS y dos negocios reportados (con 3 y 1 reportes)
- **THEN** el diff contra Next no reporta diferencias fuera de las del botón "Salir"

#### Scenario: listado igual al de hoy

- **WHEN** se abre "Todos los negocios" con 60 registros y con `?estado=` en `publicado`, `rechazado`, `en_revision`, `xyz`, vacío y repetido, y con `?pagina=` en `2`, `99`, `0`, `-3`, `dos` y repetida
- **THEN** el diff contra Next no reporta diferencias, la página 99 no pinta ningún texto de lista vacía, y ningún renglón trae WhatsApp, teléfono, dirección, foto ni motivo

#### Scenario: el HTML no crece con la base

- **WHEN** se compara el listado con 30 registros contra el mismo con 500
- **THEN** los dos traen 25 renglones y un tamaño equivalente

#### Scenario: nada se escribe desde el listado

- **WHEN** llegan `POST`, `PUT` y `DELETE` a `/admin/negocios`, con sesión y sin ella, y con `?_action=entrar`, `?_action=salir` o `?_action=aprobar`
- **THEN** ningún registro cambia, no se aparta ningún intento y ninguna respuesta trae datos de un negocio

### Requirement: La mitad 5a no pierde dureza ni altera producto

Las pruebas cuyo sujeto es el acceso, la sesión, la guarda, el layout del panel, la cola, el listado o el comodín, y que hoy importan esas piezas de `src/app/admin/`, DEBEN pasar a probar Astro con el mismo número de aserciones o más por archivo y sin `skip` nuevos. Las que solo usan la cola de Next para comprobar una pantalla posterior quedan en una lista explícita de excepciones, que los changes siguientes de la fase achican. Siguen vigentes, y cubren los archivos nuevos:

- los guardianes de la regla de origen y de `clientAddress`;
- los de enlaces, `noindex`, sitemap y exclusión de la medición;
- la disciplina "la sesión se comprueba antes del primer acceso a datos".

Ninguno se afloja.

Este change NO DEBE modificar:

- de `src/lib/`, nada salvo dos módulos nuevos sin Next y el cuerpo de `sirviendoPorHttps`, con su firma pública intacta;
- de `src/app/`, nada salvo los envoltorios de entrar y salir;
- de `src/components/`, nada salvo el tipo de `action` y el `method` de `BotonSalir`, cuyo HTML con una función NO DEBE cambiar;
- `astro.config.mjs`, `vercel.json`, `next.config.ts`, `prisma/`, `openspec/specs/` ni `spikes/`.

Ningún texto de UI cambia. Su PR DEBE apuntar, como borrador, a la rama de 3b-2, y rebasarse sobre `migracion-astro` cuando se mergeen las fases anteriores.

#### Scenario: misma dureza

- **WHEN** se compara cada archivo de pruebas re-apuntado contra su versión anterior
- **THEN** tiene al menos las mismas aserciones, todas en verde, ningún `skip` nuevo, y el `grep` de imports de `src/app/admin/{page,accion-acceso,accion-salir,layout,negocios/page,[...resto]/page}` en `tests/` sale vacío

#### Scenario: el diff no toca producto

- **WHEN** se revisa el diff del change
- **THEN** en `src/lib/` solo aparecen `peticion.ts`, `entrar.ts` y el cuerpo de `sirviendoPorHttps`; en `src/app/` solo los dos envoltorios; en `src/components/` solo `BotonSalir`, y su prueba de render con una función da el mismo HTML que antes

## MODIFIED Requirements

> Requirement introducido por 3a y modificado por 3b-1 y 3b-2, los tres sin archivar. Este bloque se aplica al archivar 5a, después de 3b-2.

### Requirement: Cada Action corre solo por envío de formulario y solo desde su ruta

Una Action DEBE ejecutarse únicamente cuando llega como envío de formulario (`?_action=<nombre>`) a la ruta que tiene asignada en una tabla explícita. Hoy la tabla tiene seis entradas:

- `reportar` → `/negocio/[ficha]/reportar`;
- `registrar` → `/registro`;
- `confirmar` → `/registro/verificar`;
- `reenviar` → `/registro/verificar`;
- `entrar` → `/admin`;
- `salir` → `/admin/cola`.

Cualquier otra forma de pedirla DEBE responder exactamente igual que una dirección que no existe (`/a/b/c`), sin ejecutar nada ni escribir en la base:

- la vía RPC `/_actions/<nombre>`, exista o no ese nombre;
- una Action pedida desde otra ruta;
- un nombre que no está en la tabla.

Una entrada PUEDE declarar una compuerta, que se evalúa antes de ejecutar el manejador. `confirmar` y `reenviar` la tienen: la capacidad de verificación encendida. Con la compuerta cerrada, la Action NO DEBE ejecutarse ni leer el cuerpo, y la respuesta DEBE ser la misma que su desenlace "no encontrado".

En las rutas del panel, la guarda de sesión DEBE correr **antes** que esta tabla. Sin sesión, solo `entrar` y `salir` pueden llegar a ella. La Action DEBE además comprobar por sí misma que se le llama desde su ruta. Un envío por `fetch` a la misma dirección del formulario es un envío de formulario y pasa por las mismas reglas.

#### Scenario: RPC cerrado

- **WHEN** llegan con `Origin` propio `POST /_actions/reportar`, `POST /_actions/registrar`, `POST /_actions/confirmar`, `POST /_actions/reenviar`, `POST /_actions/entrar` y `POST /_actions/salir` (como formulario y como JSON) y `POST /_actions/inventada`
- **THEN** todas las respuestas son iguales entre sí y a la de `/a/b/c` en estado, cuerpo y cabeceras salvo la fecha, y no se crea ningún reporte, ficha, archivo, fila de cupos ni cookie de sesión, ni sale ninguna petición al proveedor

#### Scenario: Action desde una ruta ajena

- **WHEN** llegan un reporte válido como `POST /?_action=reportar`, un registro válido como `POST /?_action=registrar`, un código válido, con una cookie de paso válida, como `POST /registro?_action=confirmar`, `POST /registro/gracias?_action=confirmar` y `POST /?_action=reenviar`, la contraseña correcta del panel como `POST /?_action=entrar` y `POST /admin/negocios?_action=entrar` con sesión, y `POST /admin?_action=salir` con sesión
- **THEN** no se crea nada, no se gasta ningún intento ni reenvío, no se aparta ningún intento de acceso, no se pone ni se borra ninguna cookie de sesión, el simulador no recibe peticiones y ninguna respuesta es un 500

#### Scenario: la compuerta va antes del manejador

- **WHEN** con la capacidad apagada llega `POST /registro/verificar?_action=confirmar` con una cookie de paso firmada con el secreto configurado
- **THEN** el manejador no corre, el cuerpo no se lee y la respuesta es idéntica a la de la capacidad encendida sin cookie

#### Scenario: la guarda del panel va antes de la tabla

- **WHEN** sin sesión llegan `POST /admin/cola?_action=entrar` con la contraseña correcta y `POST /admin/negocios?_action=salir`
- **THEN** los dos responden la redirección de envío hacia `/admin`, no se aparta ningún intento y no se pone ni se borra ninguna cookie
