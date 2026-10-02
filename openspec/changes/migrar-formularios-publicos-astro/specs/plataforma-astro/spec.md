# Delta: plataforma-astro

> Fase 3a de ADR-013 (T-024). `/negocio/[ficha]/reportar` con su envío y `/negocio/[ficha]/reportar/gracias` pasan a servirse con Astro, y quedan fijadas las piezas que heredará el registro (3b): la regla de origen, el PRG, las Actions atadas a su ruta, la IP de los cupos y el límite del cuerpo. **El contrato no cambia.** Lo siguen fijando los requirements de `directorio-publico` sobre el reporte (formulario, validación, confirmación, anti-abuso, privacidad y "un reporte no cambia nada de lo público") y los de `despliegue` sobre cabeceras. Hay una sola excepción, aceptada por el ticket: un envío de otro origen ya no termina en el 500 de Next, sino en una página 403 en español. Este delta se monta sobre los de 2a y 2b y da por hechos su middleware, su diff, sus guardianes y la 404 dinámica.

## ADDED Requirements

### Requirement: Los envíos de otro origen se rechazan en español, con las cuatro cabeceras y sin 500

Toda petición con un método que no sea `GET`, `HEAD` ni `OPTIONS` a una ruta servida por la función DEBE pasar por la misma regla que hoy aplica Next a las Server Actions:

- **Procede** si no trae `Origin`, o si el host de su `Origin` es igual al primer valor de `X-Forwarded-Host` o, cuando ese encabezado no viene, al de `Host`.
- **Se rechaza** con `Origin: null`, con un `Origin` que no se puede interpretar o con un host distinto. No hay lista de orígenes permitidos.

Un envío rechazado NO DEBE ejecutar ninguna Action ni escribir nada, y DEBE responder:

- código 403;
- el documento base del sitio (header y footer) con el encabezado "No pudimos recibir tu envío", la frase "Vuelve a abrir la página e inténtalo otra vez." y un único enlace "Ir al inicio" hacia `/`;
- la instrucción de no indexar;
- sin el script de la medición, aunque esté configurada, y con el motivo de la exclusión escrito;
- las cuatro cabeceras de `cabecerasDeSeguridad()` y el `Cache-Control` del HTML dinámico.

La respuesta NO DEBE contener el `Origin`, el host, la ruta ni nada de lo enviado, ningún texto en inglés ni ningún rastro del marco. La comprobación de origen propia de Astro (`security.checkOrigin`) DEBE estar apagada, porque su 403 sale antes del middleware, en inglés y sin cabeceras. Ninguna respuesta del sitio DEBE volver a salir así.

#### Scenario: envío ajeno

- **WHEN** llega a `/negocio/<ficha publicada>/reportar?_action=reportar` un POST de formulario válido con `Origin: https://ajeno.example`
- **THEN** responde 403 con "No pudimos recibir tu envío", "Vuelve a abrir la página e inténtalo otra vez." y "Ir al inicio", con las cuatro cabeceras, sin medición y sin `ajeno.example` en el cuerpo, y la base no gana ningún reporte

#### Scenario: `Origin: null` ya no es un 500

- **WHEN** el mismo envío llega con `Origin: null` o con un `Origin` malformado
- **THEN** responde el mismo 403 en español, byte a byte igual al del origen ajeno salvo la fecha, y nunca un 500

#### Scenario: el host detrás del proxy

- **WHEN** el envío trae `Origin: https://enmirumbo.example`, `Host: interno.vercel` y `X-Forwarded-Host: enmirumbo.example, otro.example`
- **THEN** procede, porque se compara contra el primer valor de `X-Forwarded-Host`; y con `X-Forwarded-Host: otro.example` responde el 403

#### Scenario: sin `Origin` procede como en Next

- **WHEN** llega un POST sin `Origin` a `/api/foto/<clave>/ficha`, y otro sin `Origin` con un reporte válido a la ruta de la Action
- **THEN** el primero responde 405 con las cuatro cabeceras y el segundo se procesa como un envío normal, igual que en Next

#### Scenario: la brecha conocida queda cerrada

- **WHEN** se corre la suite
- **THEN** las pruebas que estaban marcadas como "[T-024]" (el 403 sin cabeceras y el POST sin `Origin`) pasan como pruebas normales y ninguna respuesta del sitio contiene "Cross-site"

### Requirement: Cada Action corre solo por envío de formulario y solo desde su ruta

Una Action DEBE ejecutarse únicamente cuando llega como envío de formulario (`?_action=<nombre>`) a la ruta que tiene asignada en una tabla explícita. En 3a la tabla tiene una sola entrada: `reportar` → `/negocio/[ficha]/reportar`. Cualquier otra forma de pedirla DEBE responder exactamente igual que una dirección que no existe (`/a/b/c`), sin ejecutar nada ni escribir en la base:

- la vía RPC `/_actions/<nombre>`, exista o no ese nombre;
- una Action pedida desde otra ruta;
- un nombre que no está en la tabla.

La Action DEBE además comprobar por sí misma que se le llama desde su ruta.

#### Scenario: RPC cerrado

- **WHEN** llegan con `Origin` propio `POST /_actions/reportar` (como formulario y como JSON) y `POST /_actions/inventada`
- **THEN** las tres respuestas son iguales entre sí y a la de `/a/b/c` en estado, cuerpo y cabeceras salvo la fecha, y no se crea ningún reporte

#### Scenario: Action desde una ruta ajena

- **WHEN** llega un reporte válido como `POST /?_action=reportar` o como `POST /negocio/<ficha publicada>?_action=reportar`
- **THEN** no se crea ningún reporte y la respuesta no es un 500

### Requirement: Los formularios siguen el patrón POST → 303 → GET con destinos que arma el servidor

Tras ejecutar una Action, el sitio DEBE responder `303` con un `Location` que sea una ruta del propio sitio (empieza con `/` y no con `//`), construida por el servidor con lo que devolvió la base. NUNCA DEBE salir del `Referer`, del `Origin` ni de ningún campo del envío. El destino DEBE ser el mismo con cualquier `Referer` o sin él. Recargar la pantalla de destino NO DEBE ejecutar la Action otra vez.

#### Scenario: el `Referer` no decide nada

- **WHEN** se manda el mismo reporte válido con `Referer` de la propia página, con `Referer` solo del origen (como lo deja `strict-origin`), con `Referer: https://evil.example/` y sin `Referer`
- **THEN** los cuatro responden 303 con el mismo `Location`, `/negocio/<segmento actual>/reportar/gracias`

#### Scenario: recargar no reenvía

- **WHEN** el vecino llega a la confirmación tras el 303 y la recarga dos veces
- **THEN** la base tiene un solo reporte nuevo

### Requirement: La página de reporte responde desde Astro el mismo HTML que Next

`/negocio/[ficha]/reportar` DEBE responder, para la misma base y el mismo entorno, lo mismo que la versión Next, dentro del tronco público medido y sin `<script>` propio, `modulepreload` ni islas. Eso incluye:

- el estado y el texto por landmark;
- "Reportar este negocio" como único `h1`, el nombre del negocio y "Dinos qué pasa y lo revisamos. No te pedimos ningún dato tuyo.";
- las cuatro opciones de "¿Qué pasa?" sin ninguna marcada, "¿Nos quieres contar más? (opcional)" con "Máximo 300 caracteres.", el honeypot y "Enviar reporte";
- "Volver a la ficha" hacia la ficha con el segmento actual;
- la instrucción de no indexar ni seguir enlaces;
- un enlace viejo con el nombre anterior también abre el formulario.

Con `?error=` DEBE pintar el mismo mensaje que hoy, y un código fuera de la lista DEBE ignorarse:

- `motivo`: "Dinos qué pasa con este negocio";
- `comentario`: "El comentario es muy largo (máximo 300 caracteres)";
- `cupo`: "Ya recibimos varios reportes desde aquí. Espera un rato y vuelve a intentar.";
- `servidor`: "No pudimos enviar tu reporte. Vuelve a intentarlo en un momento.".

El comentario previo DEBE volver desde la cookie de borrador, escapado dentro del campo, y un borrador que no escribió el servidor DEBE dejar el campo vacío.

Si el negocio no existe, no está publicado o el segmento no trae un identificador que sirva, DEBE responder la 404 dinámica de 2b (`NoEncontradoDinamico`): byte a byte igual a la de la ficha no publicada, sin medición, sin `Set-Cookie` y sin ningún dato del negocio.

Contra Next, el diff DEBE aceptar solo dos diferencias en el formulario, listadas de forma explícita y con su salida impresa:

1. los atributos `action`, `method` y `enctype` del `<form>`, siempre que las dos versiones posteen a la misma ruta;
2. los campos ocultos `$ACTION_…` de Next. Astro NO DEBE agregar campos ocultos.

#### Scenario: formulario igual al de hoy

- **WHEN** con la base semilla se abren el formulario de una ficha publicada, el mismo con cada uno de los cuatro `?error=`, con `?error=inventado` y con un segmento de nombre viejo
- **THEN** el diff no reporta diferencias fuera de las dos normalizaciones del formulario, y la salida dice dónde aplicó cada una

#### Scenario: el identificador ya no viaja en el formulario

- **WHEN** se revisa el HTML del formulario de Astro
- **THEN** no hay ningún campo oculto salvo el honeypot, y el identificador del negocio solo aparece en la URL

#### Scenario: reporte de una ficha no publicada

- **WHEN** se pide el formulario de una ficha en revisión, de una rechazada, de una despublicada, de un identificador inexistente y de `/negocio/sin-identificador/reportar`
- **THEN** las cinco responden 404 con "No encontramos esta página", con cuerpos idénticos byte a byte entre sí y a la 404 de la ficha no publicada, sin medición, sin `Set-Cookie` y sin el nombre ni el identificador

#### Scenario: borrador hostil

- **WHEN** se abre el formulario con `?error=motivo` y una cookie de borrador con `</textarea><script>` codificado, y otra con basura
- **THEN** el primero aparece escapado como texto dentro del campo, el segundo deja el campo vacío, y ninguno rompe la página

### Requirement: El envío del reporte se comporta igual que en Next

La Action `reportar` DEBE delegar en `src/lib/` sin lógica nueva:

- el identificador se lee del segmento de la ruta con `extraerIdDeSegmentoFicha`;
- el negocio, con `obtenerNegocioPublicado`;
- el alta, con `crearReporte`;
- la ruta de vuelta, con `construirSegmentoFicha` y los datos de la base;
- el borrador, con `codificarBorrador` y `opcionesCookieBorrador`;
- la IP, con `ipDeEncabezados`.

Cada desenlace DEBE producir lo mismo que hoy:

- **creado, honeypot lleno o tope de pendientes alcanzado:** 303 a la confirmación y la cookie de borrador borrada;
- **motivo ausente, vacío, repetido o fuera de la lista, comentario de más de 300 caracteres, cupo agotado o falla del servidor:** 303 al formulario con solo el código del error en la URL, y la cookie de borrador con el comentario acotado, `HttpOnly`, `SameSite=Lax`, `Secure` en HTTPS, `Path` a la ruta del formulario de esa ficha y vida de 120 segundos;
- **identificador inservible o negocio no publicado al enviar:** la 404 dinámica, sin cookie y sin escritura.

Los campos que pretendan fijar el negocio, el destino o atributos de la cookie (`negocioId`, `$ACTION_…`, `destino`, valores con `;` o saltos de línea) DEBEN ignorarse. Un cuerpo de más de 6 MiB NO DEBE escribir nada ni responder 500: DEBE volver al formulario con el error `servidor`. La IP, el comentario y los datos del negocio NO DEBEN aparecer en el log.

#### Scenario: reporte enviado

- **WHEN** el vecino elige "Ya cerró" y toca "Enviar reporte"
- **THEN** recibe 303 a `/negocio/<segmento actual>/reportar/gracias` con el borrador borrado (`Max-Age=0`), y la base tiene un reporte `pendiente` con ese motivo, sin comentario y sin ningún dato del reportante

#### Scenario: error con comentario conservado fuera de la URL

- **WHEN** el vecino envía sin motivo y con el comentario "hablé con la dueña"
- **THEN** recibe 303 a `/negocio/<segmento>/reportar?error=motivo`, el comentario no aparece en el `Location`, la cookie trae los atributos de la spec, y al seguir el 303 ve "Dinos qué pasa con este negocio" con su comentario en el campo

#### Scenario: honeypot, tope y cupo

- **WHEN** llegan un envío con el campo trampa lleno, uno sobre una ficha con 10 pendientes y un cuarto envío en la hora desde la misma IP declarada
- **THEN** los dos primeros reciben la misma confirmación sin escribir nada, y el tercero vuelve con "Ya recibimos varios reportes desde aquí. Espera un rato y vuelve a intentar."

#### Scenario: campos que intentan dictar el destino

- **WHEN** un envío válido trae además `negocioId=<otro id>`, `$ACTION_1:0=["otro"]`, `destino=https://evil.example` y `destino=//evil.example`
- **THEN** el reporte se apunta a la ficha de la URL, el `Location` es su confirmación y ninguna cookie sale con otro `Path` ni dominio

#### Scenario: identificador inservible al enviar

- **WHEN** se envía un reporte válido a `/negocio/sin-identificador/reportar?_action=reportar` y a la ruta de una ficha en revisión
- **THEN** los dos responden la misma 404 dinámica que un `GET` a esa URL, sin `Set-Cookie`, sin escritura y sin 500

#### Scenario: cuerpo desmedido

- **WHEN** llega a la ruta de una ficha publicada un envío de reporte de 7 MiB, con `Content-Length` y sin él
- **THEN** no se escribe nada, no hay 500 y la respuesta es el 303 al formulario con `?error=servidor`

### Requirement: La confirmación del reporte responde igual que en Next

`/negocio/[ficha]/reportar/gracias` DEBE responder 200, dentro del tronco público medido y sin JS propio, con:

- "¡Gracias por avisarnos! Vamos a revisar este negocio." como `h1`;
- "Volver a la ficha" hacia `/negocio/<segmento pedido>`;
- la instrucción de no indexar ni seguir enlaces.

DEBE hacerlo sin consultar la base, así que la respuesta no confirma ni niega el estado del negocio. El segmento pedido DEBE salir escapado en el `href`.

#### Scenario: confirmación igual a la de hoy

- **WHEN** se abre la confirmación de una ficha publicada y la de un segmento inventado
- **THEN** el diff no reporta diferencias y las dos responden 200 con el mismo texto

#### Scenario: segmento hostil

- **WHEN** se abre la confirmación con un segmento que trae `"><script>` codificado
- **THEN** el valor sale escapado dentro del `href`, sin etiquetas nuevas, igual que en Next

### Requirement: Los cupos por IP se leen del encabezado declarado, nunca de la IP que deduce el marco

Las Actions DEBEN obtener la IP del cupo con `ipDeEncabezados(request.headers)`, que lee el último valor del encabezado declarado en `REGISTRO_ENCABEZADO_IP`, exige forma de IP y no aplica cupo sin esa variable. NO DEBEN usar `clientAddress` de Astro, que en el adaptador de Vercel toma el primer valor de `x-forwarded-for`. Las dos cotas del reporte DEBEN seguir sin ventana de carrera sobre la salida construida.

#### Scenario: el primer valor no evade el cupo

- **WHEN** con `REGISTRO_ENCABEZADO_IP=x-forwarded-for` llegan cuatro reportes válidos en la hora con `x-forwarded-for: <distinto cada vez>, 203.0.113.7`
- **THEN** el cuarto vuelve con el mensaje de cupo agotado

#### Scenario: nadie usa `clientAddress`

- **WHEN** se recorren `src/actions/`, `src/middleware.ts`, `src/pages/` y `src/astro/`
- **THEN** ningún archivo menciona `clientAddress`, y si alguien lo agrega la verificación falla nombrando el archivo

#### Scenario: concurrencia sobre la build

- **WHEN** contra la salida construida y con PostgreSQL llegan catorce reportes simultáneos sobre una ficha, cada uno desde una IP declarada distinta, y ocho simultáneos desde una misma IP sobre otra
- **THEN** la primera queda con exactamente 10 pendientes y la segunda con exactamente 3, todos reciben el 303 que les toca y ninguno recibe un 500

### Requirement: Las respuestas de los formularios llevan sus cabeceras y conservan sus cookies

El 200 del formulario y de la confirmación, el 303 de cada desenlace, el 403 de origen, la 404 dinámica (`GET` y `POST`) y la respuesta "como dirección inexistente" de la tabla de Actions DEBEN llevar:

- las cuatro cabeceras de `cabecerasDeSeguridad()` con sus valores actuales;
- la política de referente global;
- ninguna cabecera que anuncie el marco;
- el `Cache-Control` que manda Next para esa misma respuesta.

El `Set-Cookie` del borrador DEBE llegar al cliente en el 303, con los atributos de la spec, después de pasar por el middleware.

#### Scenario: cabeceras en todo el recorrido

- **WHEN** se piden a la salida real del build el formulario, un envío que termina en 303 con borrador, uno que termina en 303 a la confirmación, la confirmación, el 403 de origen y la 404 de una ficha no publicada por `GET` y por `POST`
- **THEN** todas traen las cuatro cabeceras y `strict-origin-when-cross-origin`, ninguna trae `X-Powered-By`, el `Cache-Control` coincide con el de Next y el 303 con error trae el `Set-Cookie` del borrador

### Requirement: El envío sin JavaScript funciona contra la salida construida

DEBE existir un arnés que envíe formularios como un navegador sin JavaScript contra la salida real del build, servida por `scripts/servir-salida-vercel.mjs`:

1. lee el `<form>` del HTML servido;
2. manda todos sus campos con el método, el destino y la codificación que declara;
3. pone el `Origin` y el `Referer` que pondría un navegador con la política de la página;
4. sigue el 303 a mano.

El mismo arnés corre contra Next de `main` para comparar cada desenlace: la cadena de estados, el `Location`, los atributos de las cookies y el HTML final. El recorrido ficha → reportar → enviar → confirmación DEBE completarse sin JavaScript.

#### Scenario: recorrido completo sin JS

- **WHEN** el arnés abre una ficha publicada, sigue "Reportar este negocio", elige "Ya cerró" y envía
- **THEN** la cadena es 200 → POST 303 → 200 con "¡Gracias por avisarnos! Vamos a revisar este negocio.", el `Origin` enviado es el del sitio, no hay 500 y hay un solo reporte nuevo

#### Scenario: mismo desenlace que Next

- **WHEN** el arnés corre los mismos envíos contra Next de `main` y contra Astro (éxito, sin motivo, comentario largo, honeypot, cupo, tope e identificador inexistente)
- **THEN** cada par coincide en estados, ruta del `Location` y atributos de las cookies, y la única diferencia aceptada es el 500 de Next frente al 403 de Astro en los envíos de origen ajeno

### Requirement: La mitad 3a no pierde dureza ni altera producto

Las pruebas que hoy importan `src/app/(publico)/negocio/[ficha]/reportar` DEBEN pasar a probar las rutas y la Action de Astro, cada archivo con el mismo número de aserciones o más y sin `skip` nuevos. El guardián de enlaces DEBE dejar de exceptuar `/negocio/<…>/reportar`. Este change NO DEBE modificar:

- `src/app/`, `vercel.json`, `prisma/`, `openspec/specs/` ni `spikes/`;
- `src/lib/`, salvo agregar a `SEGMENTOS_RESERVADOS` el segmento de la página 403, si se crea uno;
- `src/components/`, salvo el tipo de `action` y el `method` de `FormularioReporte`.

Su PR DEBE apuntar a `migracion-astro`, nunca a `main`.

#### Scenario: misma dureza

- **WHEN** se compara cada archivo de pruebas re-apuntado contra su versión anterior
- **THEN** tiene al menos las mismas aserciones, todas en verde contra Astro, y ningún `skip` nuevo; y un `grep` de imports de `src/app/(publico)/negocio/[ficha]/reportar` en `tests/` sale vacío

#### Scenario: el diff no toca producto

- **WHEN** se revisa el diff del change
- **THEN** en `src/components/` solo cambia la firma de `FormularioReporte` y su `method`, en `src/lib/` a lo más una línea de rutas reservadas, y no hay cambios en las demás rutas prohibidas

## MODIFIED Requirements

> Requirement introducido por `migrar-directorio-publico-astro` (2b), todavía sin archivar. Este bloque se aplica al archivar 3a, después de 2b. Con reportar en Astro, `/negocio/<…>/reportar` deja de ser una excepción de la Fase 3.

### Requirement: El sitemap, los enlaces y las rutas reservadas resuelven en Astro

Toda URL que publica `sitemap.xml` y todo enlace interno o destino de formulario que pintan la home, los listados, la ficha, `/buscar`, el formulario de reporte y su confirmación DEBEN responder 200 en la build de Astro. Los enlaces a `/registro` esperan a la Fase 3b: la verificación los acepta como la única excepción explícita por fase y el HTML que los pinta no cambia. La verificación de enlaces DEBE reconocer como rutas dinámicas declaradas las de `src/pages/`. `"404"` y `"500"` DEBEN estar en los segmentos reservados, y ningún slug de los catálogos DEBE coincidir con un segmento que publique `src/pages/`.

#### Scenario: el sitemap no lleva a un 404

- **WHEN** con la base semilla se piden a la build de Astro todas las URLs de su `sitemap.xml`
- **THEN** cada una responde 200, salvo `/registro`, que se sirve en la Fase 3b

#### Scenario: `/registro` es la única excepción

- **WHEN** el guardián de enlaces recorre la ficha, el formulario de reporte y su confirmación
- **THEN** "Reportar este negocio", "Volver a la ficha" y el destino del formulario resuelven a rutas de Astro, solo `/registro` está en la lista de excepciones, y cualquier otro `href` a una ruta que no existe hace fallar el guardián

#### Scenario: el buscador envía a una ruta que existe

- **WHEN** se envía el buscador de la home sin JavaScript
- **THEN** llega a `/buscar?q=…` de Astro con sus resultados

#### Scenario: un slug "404" reprueba

- **WHEN** un catálogo de prueba trae una categoría o un giro con slug `404` o `500`
- **THEN** la verificación de rutas reservadas falla
