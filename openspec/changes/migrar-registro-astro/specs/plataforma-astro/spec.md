# Delta: plataforma-astro

> Fase 3b-1 de ADR-013 (T-024). `/registro` (con su Action `registrar`) y `/registro/gracias` pasan a servirse con Astro. **El contrato no cambia:** lo fijan los requirements de `registro-negocio` (formulario, validación, foto, unicidad y reenvío, consentimiento y versión, anti-abuso, estados, sin JS, buscador, embudo y privacidad de la medición) y los de la verificación por SMS que tocan el registro (`agregar-verificacion-sms-tras-bandera`, sin archivar). Este delta se monta sobre los de 2a, 2b y 3a y da por hechos su middleware, la regla de origen, la tabla de Actions, el PRG, el diff, el arnés y sus guardianes. `/registro/verificar` es de 3b-2.

## ADDED Requirements

### Requirement: La página de registro responde desde Astro el mismo HTML que Next

`/registro` DEBE responder, con la misma base y el mismo entorno, lo mismo que la versión Next, dentro del tronco público medido. Eso incluye:

- el estado y el texto por landmark;
- "Registra tu negocio gratis" como único `h1`;
- la frase "Llena este formulario en un par de minutos, sin cuenta ni contraseña. En cuanto lo revisemos, te contactamos por WhatsApp.";
- los 12 controles con sus etiquetas, ayudas y ejemplos literales de `registro-negocio`;
- las 8 categorías y las 21 colonias leídas de la base, más "Otra";
- el honeypot, el aviso simplificado con su versión y su campo oculto `avisoVersion`;
- la casilla de consentimiento sin marcar, "Dejar mi ficha sin foto" y "Registrar mi negocio".

La página NO DEBE llevar islas (`astro-island`) ni el runtime de React. Su único JavaScript propio DEBE ser un módulo de `/_astro/` de 5 KB o menos con gzip, y ninguna otra página DEBE ganar JavaScript propio.

Contra Next, el diff DEBE aceptar solo estas diferencias, listadas de forma explícita y con su salida impresa:

1. los atributos `action`, `method` y `enctype` del `<form>`, siempre que las dos versiones posteen en multipart a `/registro`;
2. los campos ocultos `$ACTION_…` de Next (Astro NO DEBE agregar campos ocultos salvo `avisoVersion` y el honeypot, que ya existen);
3. la etiqueta `<script type="module">` del módulo propio;
4. el atributo `data-ejemplos` del `<select>` de categoría;
5. en las respuestas con errores, `autofocus` en el primer campo con error.

#### Scenario: formulario igual al de hoy

- **WHEN** con la base semilla se abre `/registro` con y sin medición, y con y sin `SITIO_URL`
- **THEN** el diff no reporta diferencias fuera de las cinco normalizaciones, y la salida dice dónde aplicó cada una

#### Scenario: sin isla y con poco JavaScript

- **WHEN** se revisa el HTML de `/registro` en la salida construida
- **THEN** no hay `astro-island`, `modulepreload` del runtime de React ni más de un `<script>` propio, y ese módulo pesa 5 KB o menos con gzip

#### Scenario: un campo de más sale como diferencia

- **WHEN** se inyecta a mano un campo oculto extra o un atributo `data-` distinto en el formulario de Astro
- **THEN** el diff lo reporta como diferencia (y se revierte)

#### Scenario: base caída al abrir el formulario

- **WHEN** se pide `/registro` con la base inalcanzable
- **THEN** responde 500 con "Algo falló de nuestro lado", las cuatro cabeceras y sin ningún detalle técnico

### Requirement: El envío del registro sin JavaScript se comporta igual que en Next

La Action `registrar` DEBE delegar en `src/lib/` sin lógica nueva:

- la IP, con `ipDeEncabezados(request.headers)` (nunca `clientAddress`);
- el envío, con `procesarRegistro`;
- la verificación, con `dependenciasDeVerificacion` y `pedirCodigoParaFicha`;
- la cookie de paso, con `firmarPaso` y `opcionesCookiePaso`.

Cada desenlace DEBE producir lo mismo que Next en un envío nativo:

- **éxito o campo trampa lleno:** 303 a `/registro/gracias`;
- **error de validación, cupo por IP, duplicado, desfase de la versión del aviso, foto rechazada, cupo de fotos ocupado o falla al guardar:** 200, con la página `/registro` vuelta a pintar en la misma respuesta (sin PRG). Esa página trae:
  - el mensaje literal de `registro-negocio` junto a su campo;
  - todos los valores capturados, salvo la casilla de consentimiento y la foto;
  - "Tu foto no se quedó guardada: vuelve a elegirla antes de enviar." si el envío traía foto y el error no era de la foto;
  - el foco en el primer campo con error;
- **cuerpo de más de 6 MiB:** 200 con el formulario y "Esa foto pesa más de 5 MB. Sube una más ligera." junto al campo de foto, sin escribir nada y sin 500;
- **cualquier otra falla de Astro antes del manejador** (cuerpo que no es formulario, falla interna): 200 con el formulario y "No pudimos guardar tu registro. Vuelve a intentarlo en un momento.", sin escribir nada.

Los campos que pretendan fijar el estado, el origen, la constancia, la versión guardada, la referencia de la foto, el texto de búsqueda, la verificación o el destino (`estado`, `origen`, `fotoClave`, `nombreNormalizado`, `numeroVerificadoEn`, `$ACTION_…`, `destino`) DEBEN ignorarse. El log NO DEBE contener la IP, el número, el nombre ni ningún otro dato capturado. La Action DEBE correr solo desde `/registro` y solo por envío de formulario.

#### Scenario: alta sin JS

- **WHEN** el arnés abre `/registro` sin JavaScript, llena los cinco obligatorios y envía
- **THEN** la cadena es 200 → POST 303 → 200 con "¡Gracias! Tu negocio está en revisión. Te contactaremos por WhatsApp para confirmar tus datos antes de publicarlo.", el `Origin` enviado es el del sitio, no hay 500 y la base tiene una ficha `en_revision`, `organico`, con la constancia y la versión vigentes que puso el servidor

#### Scenario: errores con lo capturado

- **WHEN** se envía sin JS con el WhatsApp de 8 dígitos, "¿Qué ofreces?" de 250 caracteres, una foto válida y los demás campos llenos
- **THEN** responde 200 en la misma ruta con "Revisa tu número de WhatsApp: deben ser 10 dígitos", "Deja esto en 200 caracteres o menos" y "Tu foto no se quedó guardada: vuelve a elegirla antes de enviar.", cada uno junto a su campo, con los demás valores repoblados, la casilla sin marcar, `autofocus` en el WhatsApp, ninguna ficha nueva y ningún archivo guardado

#### Scenario: mismos desenlaces que Next

- **WHEN** el arnés manda los mismos envíos sin JS contra Next de `main` y contra Astro: éxito sin foto, éxito con foto, formulario vacío, Facebook `javascript:alert(1)`, teléfono fijo con letras, categoría fuera del catálogo, honeypot, cuarto envío de la IP, número con ficha publicada, número con ficha en revisión, reenvío de una ficha rechazada, versión del aviso desfasada y campos extra de autopublicación
- **THEN** cada par coincide en la cadena de estados, la ruta del `Location`, los mensajes por campo, los valores repoblados y lo que queda en la base, y las únicas diferencias de HTML son las normalizaciones listadas

#### Scenario: reenvío tras rechazo con foto

- **WHEN** una ficha rechazada con foto, cuya constancia es de la versión `1`, se reenvía sin JS con una foto nueva cuando la vigente es la `2`
- **THEN** la ficha vuelve a `en_revision` con los datos nuevos, la constancia original intacta y la reaceptación de la `2`, los archivos de la foto anterior se borran y el dueño ve la pantalla de gracias de siempre

#### Scenario: cuerpo desmedido

- **WHEN** llega a `/registro?_action=registrar` un envío de 7 MiB, con `Content-Length` y sin él
- **THEN** responde 200 con el formulario y "Esa foto pesa más de 5 MB. Sube una más ligera.", sin 500, sin ficha y sin archivos

#### Scenario: la Action fuera de su ruta

- **WHEN** llega un registro válido como `POST /?_action=registrar`, como `POST /negocio/<ficha publicada>/reportar?_action=registrar` o como `POST /_actions/registrar` (como formulario y como JSON)
- **THEN** ninguno crea una ficha ni guarda un archivo, y los tres responden igual que una dirección inexistente

#### Scenario: el cupo por IP se lee del encabezado declarado

- **WHEN** con `REGISTRO_ENCABEZADO_IP=x-forwarded-for` llegan cuatro registros válidos en la hora con `x-forwarded-for: <distinto cada vez>, 203.0.113.7`
- **THEN** el cuarto vuelve con "Ya recibimos varios registros desde aquí. Espera un rato y vuelve a intentar.", y agotar ese cupo no impide enviar un reporte desde la misma IP

#### Scenario: carrera por el mismo número sobre la build

- **WHEN** contra la salida construida y con PostgreSQL llegan dos registros simultáneos con el mismo WhatsApp, cada uno con foto
- **THEN** queda una sola ficha, el otro envío ve el mensaje de número ya registrado, no hay 500 y no queda ningún archivo huérfano

### Requirement: Con JavaScript, el registro conserva la experiencia de hoy sin isla de React

Cuando el JavaScript de cliente carga, el módulo propio de `/registro` DEBE hacer exactamente esto, y nada más:

1. poner en "¿Qué ofreces?" el ejemplo de la categoría elegida, al cambiarla, al cargar la página y después de cada envío con error, sin borrar lo escrito;
2. al enviar, deshabilitar el botón con "Enviando..." y mandar el formulario por `fetch` a la dirección de su atributo `action`, con su `FormData` y las cookies del propio sitio;
3. si la respuesta termina en `/registro/gracias` o `/registro/verificar` del mismo origen, navegar a esa ruta;
4. si la respuesta es la página con el formulario de registro, reemplazar el formulario por el de la respuesta y enfocar su primer campo con error, sin recargar y sin cambiar la URL ni el historial;
5. ante cualquier otra respuesta o una falla de red, dejar el formulario como estaba, con todo lo capturado, mostrar arriba "No pudimos guardar tu registro. Vuelve a intentarlo en un momento." y reactivar el botón, sin reenviar nada por su cuenta.

El módulo NO DEBE:

- navegar a ninguna otra ruta ni a otro origen;
- pedir nada a otra dirección;
- tocar el campo de foto (ni vista previa, ni recorte, ni compresión);
- medir nada;
- usar almacenamiento del navegador.

Si el navegador no tiene `fetch`, `FormData` o `DOMParser`, el envío DEBE ser el nativo. Con JS, un envío con errores NO DEBE generar una vista nueva de `/registro` en la medición.

#### Scenario: errores en el sitio

- **WHEN** con JS el dueño envía el formulario con el WhatsApp mal y una foto elegida
- **THEN** ve "Revisa tu número de WhatsApp: deben ser 10 dígitos" junto al campo, con el foco en él, sus demás datos en su lugar, el campo de foto vacío con "Tu foto no se quedó guardada: vuelve a elegirla antes de enviar.", la URL sigue siendo `/registro` y la página no se recargó

#### Scenario: enviando y éxito

- **WHEN** con JS el dueño envía el formulario correcto
- **THEN** el botón muestra "Enviando..." y queda deshabilitado mientras espera, y después llega a `/registro/gracias` con el mensaje de siempre y una sola ficha nueva

#### Scenario: destinos fuera de la lista

- **WHEN** la respuesta al envío termina en `https://evil.example/registro/gracias`, en `//evil.example`, en `/negocios` o es un 500, un 403 o un 413 de la plataforma
- **THEN** el módulo no navega, conserva lo capturado y muestra "No pudimos guardar tu registro. Vuelve a intentarlo en un momento."

#### Scenario: sin las APIs del navegador

- **WHEN** el navegador no tiene `fetch` o `DOMParser`
- **THEN** el envío es el nativo y el desenlace es el del envío sin JS

#### Scenario: la medición no cuenta los errores

- **WHEN** con JS y la medición configurada, el dueño se equivoca dos veces y luego registra su negocio
- **THEN** hay una sola carga de `/registro` y una de `/registro/gracias`, y ningún evento extra

### Requirement: La foto se procesa en la función de Astro igual que en Next

La salida construida DEBE contener `sharp` con su binario de plataforma dentro de la función, y DEBE aplicar sin cambios las reglas de foto de `registro-negocio`:

- la validación por contenido (JPG, PNG o WebP de hasta 5 MB y 40 MP; sin SVG ni archivos disfrazados);
- el orden de las defensas (sin procesar imagen ante el honeypot, el cupo o un campo inválido);
- un solo archivo por ficha;
- el tope de fotos abiertas a la vez, que rechaza al instante;
- las dos variantes comprimidas y sin metadatos;
- la referencia que genera el servidor;
- ningún archivo huérfano.

Las fotos de prueba DEBEN generarse en la propia prueba: el repositorio NO DEBE llevar fotos reales.

#### Scenario: foto real con GPS

- **WHEN** contra la salida construida se registra sin JS un negocio con un JPEG de 3 MB que trae EXIF con coordenadas GPS, modelo y fecha
- **THEN** la ficha queda con una clave generada por el servidor y dos variantes WebP dentro de sus tamaños, ninguna con metadatos, y el original no se guarda en ninguna parte

#### Scenario: fotos que no pasan

- **WHEN** se envía un HTML llamado `foto.jpg`, un SVG, un PNG de 100 MP y un envío con el campo trampa lleno y una foto de 5 MB
- **THEN** los tres primeros vuelven con "No pudimos leer esa foto. Sube una imagen JPG, PNG o WebP." y el cuarto llega a la pantalla de gracias, sin ficha, sin archivos y sin haber abierto ninguna imagen

#### Scenario: muchas fotos a la vez

- **WHEN** llegan a la salida construida, al mismo tiempo, más envíos con foto de los que el servidor abre a la vez
- **THEN** los que caben se registran, el resto recibe al instante "Estamos recibiendo muchas fotos, intenta de nuevo en un momento" con lo capturado, y no queda ningún archivo sin ficha

### Requirement: La pantalla de gracias responde desde Astro igual que en Next

`/registro/gracias` DEBE responder 200 dentro del tronco público medido, sin JavaScript propio, sin consultar la base y sin ningún `<form>`, con:

- "¡Gracias! Tu negocio está en revisión. Te contactaremos por WhatsApp para confirmar tus datos antes de publicarlo." como `h1`;
- "Volver al inicio" hacia `/`.

Con `?verificado=1` DEBE agregar arriba "¡Listo! Ya confirmamos tu número.", y con `?agotado=1`, "Ya lo intentaste varias veces. No te preocupes: tu registro está en revisión y te vamos a contactar por WhatsApp.", leyendo solo el primer valor de cada parámetro. Cualquier otro valor DEBE ignorarse. Recargarla NO DEBE crear ni marcar nada.

#### Scenario: gracias igual a la de hoy

- **WHEN** se abre `/registro/gracias` sin parámetros, con `?verificado=1`, con `?agotado=1`, con los dos, con `?verificado=x` y con `?verificado=1&verificado=0`
- **THEN** el diff contra Next no reporta diferencias en ninguno de los seis casos

#### Scenario: recarga sin efectos

- **WHEN** el dueño llega a gracias tras el 303 y la recarga dos veces
- **THEN** la base tiene una sola ficha nueva y ninguna marca de verificación

### Requirement: Con la bandera encendida, el registro llega a la verificación igual que en Next

Con la verificación por SMS completamente configurada, un registro válido DEBE guardar la ficha **antes** de pedir el código. Pedido el código con éxito, DEBE responder 303 a `/registro/verificar` con la cookie de paso firmada (`HttpOnly`, `SameSite=Lax`, `Path=/registro/verificar`, vida de 15 minutos y `Secure` en HTTPS). Si el código no sale, sea por un error del proveedor, una espera agotada, un número rechazado, el tope diario o el cupo, DEBE responder 303 a `/registro/gracias` sin cookie. Un reenvío de una ficha ya verificada, un duplicado o un honeypot NO DEBEN pedir código.

Con la capacidad apagada o a medias, NO DEBE salir ninguna petición al proveedor, NO DEBE escribirse ninguna fila de cupos de verificación y el HTML de `/registro` y `/registro/gracias` DEBE ser idéntico al de sin variables del proveedor.

Estas pruebas DEBEN correr sobre la salida construida contra un proveedor simulado que vive solo en las pruebas, y cualquier petición a otro host externo DEBE hacerlas fallar. Ningún archivo de `src/` ni de la build DEBE referirse a ese simulador.

#### Scenario: código pedido

- **WHEN** con la bandera encendida y el proveedor simulado en `enviado` se envía un registro válido
- **THEN** responde 303 a `/registro/verificar` con la cookie de paso y sus atributos, la ficha ya está en `en_revision` sin verificar, y el simulador recibió una sola petición de envío para `+52` y el número de 10 dígitos

#### Scenario: el SMS no sale

- **WHEN** el simulador responde error, rechaza el número o no contesta dentro de la espera acotada
- **THEN** el dueño recibe 303 a `/registro/gracias` sin cookie, la ficha queda guardada sin verificar y la respuesta no trae ningún detalle del proveedor

#### Scenario: apagada no habla con nadie

- **WHEN** la salida construida corre sin variables, con las credenciales y sin bandera, o con la bandera y sin secreto, y se envía un registro válido
- **THEN** el simulador no recibe ninguna petición, no hay cookie de paso, el destino es `/registro/gracias` y el HTML de `/registro` y de gracias es idéntico en los tres casos

### Requirement: Una falla del servidor durante un envío responde la página de error, no la de no encontrado

Cuando una Action o la página que la atiende lanzan (por ejemplo, con la base caída), la respuesta DEBE ser la página 500 "Algo falló de nuestro lado", con las cuatro cabeceras y el `Cache-Control` del HTML dinámico, sin escribir nada. En la pasada de la página de error, el middleware NO DEBE ejecutar ninguna Action ni permitir que Astro la ejecute.

#### Scenario: base caída al enviar

- **WHEN** con la base inalcanzable llegan un reporte válido a la ruta de reportar de una ficha y un registro válido a `/registro?_action=registrar`
- **THEN** los dos responden 500 con "Algo falló de nuestro lado" y las cuatro cabeceras, ninguno responde la 404 y no se escribe nada

#### Scenario: la página de error no ejecuta Actions

- **WHEN** llega `POST /500?_action=registrar` con un registro válido
- **THEN** no se crea ninguna ficha ni ningún archivo

### Requirement: La mitad 3b-1 no pierde dureza ni altera producto

Las pruebas que hoy importan `src/app/(publico)/registro/page`, `src/app/(publico)/registro/gracias/page` o `src/lib/verificacion/acciones` con `next/*` simulado DEBEN pasar a probar Astro o la nueva firma, cada archivo con el mismo número de aserciones o más y sin `skip` nuevos. Las importaciones de `src/app/(publico)/registro/verificar/` quedan para 3b-2.

Este change NO DEBE modificar:

- `vercel.json`, `prisma/`, `next.config.ts`, `openspec/specs/` ni `spikes/`;
- `src/lib/`, salvo `src/lib/verificacion/acciones.ts` y las firmas de `design.md` §4;
- `src/app/`, salvo los envoltorios `registro/accion.ts`, `registro/verificar/accion-confirmar.ts` y `registro/verificar/accion-reenviar.ts`;
- `src/components/`, salvo `formulario-registro.tsx`, `boton-enviar.tsx` y los tres archivos nuevos de `design.md` §2;
- `astro.config.mjs`, salvo, si se mide necesario, la línea que incluye `sharp` en la función.

El HTML que pinta `FormularioRegistro` (el de Next y del modo edición) NO DEBE cambiar. Su PR DEBE apuntar a `migracion-astro`.

#### Scenario: misma dureza

- **WHEN** se compara cada archivo de pruebas re-apuntado contra su versión anterior
- **THEN** tiene al menos las mismas aserciones, todas en verde, ningún `skip` nuevo, y el `grep` de imports de `src/app/(publico)/registro` en `tests/` solo encuentra `verificar/`

#### Scenario: el diff no toca producto

- **WHEN** se revisa el diff del change
- **THEN** solo cambian las rutas permitidas, ningún texto de UI cambia y las pruebas de render de `FormularioRegistro` pasan sin tocarlas

## MODIFIED Requirements

> Los tres requirements siguientes los introdujeron 2b y 3a, todavía sin archivar. Este bloque se aplica al archivar 3b-1, después de 3a.

### Requirement: Cada Action corre solo por envío de formulario y solo desde su ruta

Una Action DEBE ejecutarse únicamente cuando llega como envío de formulario (`?_action=<nombre>`) a la ruta que tiene asignada en una tabla explícita. Hoy la tabla tiene dos entradas: `reportar` → `/negocio/[ficha]/reportar` y `registrar` → `/registro`. Cualquier otra forma de pedirla DEBE responder exactamente igual que una dirección que no existe (`/a/b/c`), sin ejecutar nada ni escribir en la base:

- la vía RPC `/_actions/<nombre>`, exista o no ese nombre;
- una Action pedida desde otra ruta;
- un nombre que no está en la tabla.

La Action DEBE además comprobar por sí misma que se le llama desde su ruta. Un envío por `fetch` a la misma dirección del formulario es un envío de formulario y pasa por las mismas reglas.

#### Scenario: RPC cerrado

- **WHEN** llegan con `Origin` propio `POST /_actions/reportar` y `POST /_actions/registrar` (como formulario y como JSON) y `POST /_actions/inventada`
- **THEN** todas las respuestas son iguales entre sí y a la de `/a/b/c` en estado, cuerpo y cabeceras salvo la fecha, y no se crea ningún reporte, ficha ni archivo

#### Scenario: Action desde una ruta ajena

- **WHEN** llega un reporte válido como `POST /?_action=reportar` o `POST /negocio/<ficha publicada>?_action=reportar`, o un registro válido como `POST /?_action=registrar` o `POST /negocio/<ficha publicada>/reportar?_action=registrar`
- **THEN** no se crea ningún reporte ni ninguna ficha y la respuesta no es un 500

### Requirement: Los formularios siguen el patrón POST → 303 → GET con destinos que arma el servidor

Tras ejecutar una Action cuyo desenlace lleva a otra pantalla, el sitio DEBE responder `303` con un `Location` que sea una ruta del propio sitio (empieza con `/` y no con `//`), construida por el servidor con lo que devolvió la base o con un destino fijo de la tabla. NUNCA DEBE salir del `Referer`, del `Origin` ni de ningún campo del envío. El destino DEBE ser el mismo con cualquier `Referer` o sin él. Recargar la pantalla de destino NO DEBE ejecutar la Action otra vez.

La única excepción es el error del registro: igual que en Next, la respuesta al envío vuelve a pintar `/registro` en el mismo 200, con los errores y los valores capturados, sin PRG y sin guardar esos valores en ningún lado.

#### Scenario: el `Referer` no decide nada

- **WHEN** se manda el mismo reporte válido, o el mismo registro válido, con `Referer` de la propia página, con `Referer` solo del origen (como lo deja `strict-origin`), con `Referer: https://evil.example/` y sin `Referer`
- **THEN** los cuatro responden 303 con el mismo `Location` (`/negocio/<segmento actual>/reportar/gracias` para el reporte, `/registro/gracias` para el registro)

#### Scenario: recargar no reenvía

- **WHEN** el vecino llega a la confirmación del reporte, o el dueño a la pantalla de gracias del registro, tras el 303, y la recarga dos veces
- **THEN** la base tiene un solo reporte o una sola ficha nueva

#### Scenario: el error del registro no pasa por un 303

- **WHEN** se envía un registro con errores
- **THEN** la respuesta es 200 con el formulario y sus errores en la misma ruta, sin `Location` y sin `Set-Cookie` con datos capturados

### Requirement: El sitemap, los enlaces y las rutas reservadas resuelven en Astro

Toda URL que publica `sitemap.xml`, y todo enlace interno o destino de formulario que pintan la home, los listados, la ficha, `/buscar`, el formulario de reporte y su confirmación, `/registro` y `/registro/gracias`, DEBEN responder 200 en la build de Astro. La lista de excepciones por fase de la verificación de enlaces DEBE quedar vacía. La verificación de enlaces DEBE reconocer como rutas dinámicas declaradas las de `src/pages/`. `"404"` y `"500"` DEBEN estar en los segmentos reservados, y ningún slug de los catálogos DEBE coincidir con un segmento que publique `src/pages/`.

#### Scenario: el sitemap no lleva a un 404

- **WHEN** con la base semilla se piden a la build de Astro todas las URLs de su `sitemap.xml`
- **THEN** cada una responde 200, `/registro` incluida

#### Scenario: sin excepciones de fase

- **WHEN** el guardián de enlaces recorre la home, la ficha, el formulario de reporte, `/registro` y `/registro/gracias`
- **THEN** "Registra tu negocio gratis", el destino del formulario de registro, "Volver al inicio" y los enlaces del aviso resuelven a rutas de Astro, la lista de excepciones está vacía, y cualquier `href` a una ruta que no existe hace fallar el guardián

#### Scenario: el buscador envía a una ruta que existe

- **WHEN** se envía el buscador de la home sin JavaScript
- **THEN** llega a `/buscar?q=…` de Astro con sus resultados

#### Scenario: un slug "404" reprueba

- **WHEN** un catálogo de prueba trae una categoría o un giro con slug `404` o `500`
- **THEN** la verificación de rutas reservadas falla
