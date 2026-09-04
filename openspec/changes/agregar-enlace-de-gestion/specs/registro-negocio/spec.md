# Delta de spec: registro-negocio

## ADDED Requirements

### Requirement: El enlace de gestión abre la ficha en modo edición con el mismo formulario prellenado

El enlace de gestión (PRD §6.4) DEBE abrir, en la ruta `/editar/<token>`, **el mismo formulario del registro** con los datos actuales de la ficha ya puestos: nada de un formulario aparte ni de una lógica paralela. Los campos, sus etiquetas literales, sus ejemplos por categoría y sus reglas son exactamente los del registro. La pantalla DEBE encabezarse con el texto literal "Edita tu ficha", acompañarse de la frase literal "Cambia lo que necesites y lo revisamos antes de publicarlo. Mientras tanto tu ficha sigue como está." y enviarse con un botón que diga literalmente "Enviar cambios".

La edición NO DEBE volver a pedir el consentimiento: el bloque con el checkbox del registro NO DEBE aparecer, porque el consentimiento se dio al registrarse y la constancia (`consintioAvisoEn`) sigue vigente (PRD §8). En su lugar DEBE mostrarse la nota literal "Tus datos siguen protegidos por el mismo aviso de privacidad que aceptaste al registrarte." con el enlace "Lee el aviso de privacidad completo" hacia `/aviso-de-privacidad`. La página DEBE ser correcta en un viewport de 390px, con áreas táctiles de al menos 44px, y DEBE funcionar con el JavaScript de cliente deshabilitado, igual que el registro.

#### Scenario: el dueño abre su enlace

- **WHEN** el dueño de "Plomería Güicho" abre su enlace de gestión en el celular
- **THEN** ve "Edita tu ficha", la frase "Cambia lo que necesites y lo revisamos antes de publicarlo. Mientras tanto tu ficha sigue como está.", el formulario con su nombre, su categoría, su WhatsApp, su colonia y sus opcionales ya puestos tal como están publicados, y el botón "Enviar cambios"

#### Scenario: la edición no vuelve a pedir consentimiento

- **WHEN** el dueño recorre el formulario de edición hasta abajo
- **THEN** no hay ningún checkbox de consentimiento, lee "Tus datos siguen protegidos por el mismo aviso de privacidad que aceptaste al registrarte." y encuentra el enlace "Lee el aviso de privacidad completo"

#### Scenario: negocio con colonia "Otra" sin normalizar

- **WHEN** abre su enlace un negocio publicado que registró su colonia como "Otra" y el admin todavía no la normalizó
- **THEN** el formulario aparece con la opción "Otra" elegida y su texto libre ya escrito, sin perderlo ni inventarle una colonia del catálogo

#### Scenario: la edición funciona sin JavaScript

- **WHEN** el dueño abre su enlace y manda sus cambios con el JavaScript de cliente deshabilitado
- **THEN** el envío se procesa igual en el servidor y ve la confirmación o los errores por campo, según corresponda

### Requirement: Un token que no es exactamente el vigente no abre nada ni delata nada

El enlace DEBE resolverse buscando la **huella** del token recibido, comparada en tiempo constante (`design.md` §3). Un token inexistente, uno que ya fue invalidado al regenerar, uno alterado en un carácter, uno de un negocio que ya no está publicado y una ruta sin token DEBEN responder **exactamente la misma página 404 en español y el mismo código 404** que cualquier URL que no existe: nada en la respuesta —ni el texto, ni un encabezado, ni el tiempo de respuesta apreciable— DEBE permitir distinguir "este enlace no existe" de "este enlace existe pero ya no sirve".

Como el token viaja en la URL, el sistema DEBE cerrarle las tres fugas conocidas (`design.md` §4): la página de edición y su confirmación DEBEN declarar `noindex, nofollow`, DEBEN declarar que no se manda `Referer` a ningún destino y NO DEBEN abrir enlaces externos; ninguna página pública del sitio DEBE enlazar a una URL de edición; y el token NO DEBE escribirse nunca en el log del servidor, ni completo ni recortado, ni en el camino feliz ni al fallar.

#### Scenario: token inventado

- **WHEN** alguien abre `/editar/` con una cadena inventada
- **THEN** ve la página 404 en español del sitio, con código 404, sin ninguna pista de si ese enlace existió alguna vez

#### Scenario: token invalidado por una regeneración

- **WHEN** el dueño abre el enlace que tenía guardado después de que el admin generó uno nuevo
- **THEN** ve exactamente la misma página 404 que con un token inventado, y su ficha pública sigue publicada sin cambios

#### Scenario: token de un negocio que no está publicado

- **WHEN** se abre el enlace de un negocio que ya no está en estado `publicado`
- **THEN** responde 404, igual que un enlace inventado

#### Scenario: el token no se va en el Referer

- **WHEN** el dueño toca, desde la página de edición, el enlace al aviso de privacidad
- **THEN** la petición al destino no lleva la URL de edición en el encabezado `Referer`

#### Scenario: la página de edición no se indexa ni se enlaza

- **WHEN** se revisan la respuesta de la página de edición, la de su confirmación y todas las páginas públicas del sitio
- **THEN** las dos primeras declaran `noindex, nofollow` y ninguna página pública enlaza a `/editar/...` ni menciona un token

#### Scenario: el token no aparece en el log

- **WHEN** se revisan los mensajes que el servidor escribe al abrir un enlace válido, al abrir uno inválido y al fallar un envío de cambios
- **THEN** ninguno contiene el token, ni completo ni recortado

### Requirement: Enviar la edición no toca la ficha pública: crea una revisión pendiente

Un envío válido del formulario de edición NO DEBE modificar ni un dato de la ficha publicada. DEBE crear una **edición pendiente** con lo que el dueño capturó, que entra a la cola del admin (capacidad `revision-admin`), y llevar al dueño a una pantalla de confirmación con el texto literal "¡Gracias! Ya recibimos tus cambios. Los revisamos y en cuanto los aprobemos tu ficha se actualiza. Mientras tanto sigue publicada como está." Mientras la edición espera, el directorio DEBE seguir mostrando exactamente la versión publicada. Recargar la pantalla de confirmación NO DEBE mandar los cambios otra vez. Si el guardado falla por un problema del servidor, el dueño DEBE ver el texto literal "No pudimos guardar tus cambios. Vuelve a intentarlo en un momento." con sus datos aún en el formulario y sin ningún detalle técnico del error.

#### Scenario: los cambios entran a revisión y la ficha no se mueve

- **WHEN** el dueño de "Estética Lupita" cambia su horario y su dirección y toca "Enviar cambios"
- **THEN** ve "¡Gracias! Ya recibimos tus cambios. Los revisamos y en cuanto los aprobemos tu ficha se actualiza. Mientras tanto sigue publicada como está.", queda una edición pendiente esperando revisión, y su ficha pública sigue mostrando el horario y la dirección de antes

#### Scenario: el listado y la búsqueda tampoco se enteran

- **WHEN** un negocio con una edición pendiente que le cambia el nombre aparece en el listado de su categoría y en una búsqueda
- **THEN** en los dos lugares se muestra el nombre publicado, no el propuesto

#### Scenario: recargar la confirmación

- **WHEN** el dueño recarga la pantalla de confirmación o vuelve a ella
- **THEN** no se crea ninguna edición adicional

#### Scenario: falla al guardar los cambios

- **WHEN** el guardado de la edición falla por un problema del servidor o de la base de datos
- **THEN** el dueño ve "No pudimos guardar tus cambios. Vuelve a intentarlo en un momento." con sus datos aún en el formulario, y la ficha publicada no cambia

### Requirement: La edición pasa por las mismas validaciones del registro y no puede fijar lo que no le toca

El servidor DEBE validar y normalizar la edición con **las mismas reglas y los mismos mensajes literales** que el registro: obligatorios no vacíos, categoría y colonia del catálogo, WhatsApp normalizado a 10 dígitos, "¿Qué ofreces?" en 200 caracteres o menos, link de la página solo con `http://` o `https://`, colonia "Otra" con texto libre obligatorio, y todo campo de texto libre acotado. Los errores DEBEN mostrarse junto a su campo y el formulario DEBE conservar lo que el dueño ya había capturado.

Si el WhatsApp propuesto ya tiene otra ficha en el directorio, el envío DEBE rechazarse con el texto literal "Ese número ya está en otra ficha del directorio." junto a ese campo (la comprobación se repite al aplicar la edición, ver `revision-admin`). Un envío de edición NO DEBE poder alterar el estado, el origen, los giros, la fecha de publicación, la fecha de registro, la constancia del consentimiento ni la huella del enlace de gestión: esos valores no son editables y cualquier campo extra que los pretenda fijar DEBE ignorarse. Un token NO DEBE poder editar a otro negocio que el suyo.

#### Scenario: WhatsApp inválido en la edición

- **WHEN** el dueño borra un dígito de su WhatsApp y manda los cambios
- **THEN** no se guarda ninguna edición y ve "Revisa tu número de WhatsApp: deben ser 10 dígitos" junto a ese campo, con el resto de lo que escribió intacto

#### Scenario: WhatsApp que ya tiene otra ficha

- **WHEN** el dueño propone un número que ya está publicado en otra ficha del directorio
- **THEN** no se guarda ninguna edición y ve "Ese número ya está en otra ficha del directorio." junto a ese campo

#### Scenario: campos que no le tocan

- **WHEN** un envío de edición incluye campos extra como estado `publicado`, origen `siembra`, giros, fecha de publicación, fecha de consentimiento o un token de gestión
- **THEN** esos valores se ignoran por completo: la edición guarda solo campos capturables y, al aplicarse, el negocio conserva su estado, su origen, sus giros, su fecha de publicación, su constancia de consentimiento y su enlace

#### Scenario: un token solo edita su propia ficha

- **WHEN** un envío llega con el token de un negocio y el identificador de otro
- **THEN** no se guarda nada para el segundo negocio y la respuesta no revela ningún dato suyo

#### Scenario: la edición deja la ficha lista para el buscador

- **WHEN** se aplica una edición que cambia el nombre a "Plomería Güicho" y las palabras clave a "destape de drenajes"
- **THEN** las versiones normalizadas de búsqueda del negocio quedan recalculadas por el servidor, de modo que un vecino que busca "plomeria" lo encuentra

### Requirement: Mandar cambios cuando ya hay otros esperando reemplaza a los anteriores

Un negocio DEBE poder tener **una sola edición esperando revisión**. Si el dueño abre su enlace cuando ya tiene cambios pendientes, el formulario DEBE prellenarse con **lo que él mandó la última vez** (no con lo publicado, para que no tenga que volver a capturarlo) y DEBE avisarle arriba con el texto literal "Ojo: ya tienes cambios esperando revisión. Si mandas otros, estos reemplazan a los anteriores." Al enviar, la edición anterior DEBE dejar de estar pendiente y la nueva DEBE ocupar su lugar, con su espera contada desde este envío. En ningún momento DEBEN quedar dos ediciones pendientes del mismo negocio, ni siquiera si dos envíos llegan casi al mismo tiempo.

#### Scenario: aviso al abrir con cambios pendientes

- **WHEN** el dueño abre su enlace un día después de haber mandado cambios que el admin todavía no revisa
- **THEN** ve "Ojo: ya tienes cambios esperando revisión. Si mandas otros, estos reemplazan a los anteriores." y el formulario trae lo que él mandó la última vez, no lo que está publicado

#### Scenario: los cambios nuevos sustituyen a los viejos

- **WHEN** el dueño manda un segundo juego de cambios
- **THEN** el admin ve una sola edición de ese negocio en la cola, con el contenido del segundo envío y con su espera contada desde ese momento

#### Scenario: dos envíos casi simultáneos

- **WHEN** dos envíos de edición del mismo negocio llegan casi al mismo tiempo
- **THEN** queda exactamente una edición pendiente y el dueño no ve un error técnico

### Requirement: Anti-abuso del envío de ediciones, con cupo propio

El envío de ediciones DEBE protegerse sin captcha y sin fricción (PRD §8), con: un campo trampa (honeypot) invisible para las personas y un límite de 3 envíos de edición por hora y por IP, contado en un **contador propio**, separado del de altas del registro y del de intentos de acceso al panel —agotar uno no DEBE consumir los otros—. Al bloquear un envío NO DEBE guardarse ni modificarse nada. Cuando se agota el cupo, el dueño DEBE ver el texto literal "Ya recibimos varios cambios desde aquí. Espera un rato y vuelve a intentar."

#### Scenario: límite por IP

- **WHEN** desde la misma IP llega un cuarto envío de edición dentro de la misma hora
- **THEN** el envío se rechaza sin guardar nada y quien envió ve "Ya recibimos varios cambios desde aquí. Espera un rato y vuelve a intentar."

#### Scenario: el campo trampa

- **WHEN** un envío de edición llega con el campo trampa lleno
- **THEN** no se guarda ninguna edición y quien envió ve la misma confirmación que un envío legítimo

#### Scenario: los cupos no se estorban

- **WHEN** un dueño agota su cupo de ediciones y desde esa misma IP alguien registra un negocio nuevo
- **THEN** el registro se procesa con normalidad, porque los contadores son independientes

## MODIFIED Requirements

### Requirement: Una sola ficha por número de WhatsApp

Si el WhatsApp normalizado ya tiene ficha en estado `en_revision` o `publicado`, el registro DEBE rechazarse y el formulario DEBE decirlo con el texto literal "Este número ya tiene una ficha registrada. Si es tu negocio, no hace falta registrarlo otra vez: te vamos a pasar por WhatsApp el enlace para editarlo." Ese mensaje ya es cierto de punta a punta: el enlace de gestión existe (PRD §6.4), el admin lo manda al aprobar y la ficha pública ofrece el botón "Perdí mi enlace" para pedirlo de nuevo (capacidad `directorio-publico`). El formulario de registro sigue **sin** llevar botón ni enlace hacia el modo edición: pedir el enlace es una conversación con el admin, no un botón en un formulario anónimo.

Si la ficha de ese número está en estado `rechazado`, el envío NO DEBE tratarse como duplicado: el negocio "puede corregir y volver a enviar" (PRD §6.3). En ese caso el sistema DEBE actualizar esa misma ficha con los datos del nuevo envío, regresarla a `en_revision`, dejar nulos la fecha y el motivo del rechazo anterior (si no, la purga de rechazados a los 90 días se llevaría un registro que ya está otra vez en la cola) y reiniciar el reloj de la espera, de modo que el indicador de 48 horas del panel cuente desde el reenvío. La constancia del consentimiento (`consintioAvisoEn`) es la única excepción: NO DEBE sustituirse en el reenvío, porque es la evidencia LFPDPPP del titular y un formulario anónimo podría estar siendo reenviado por un tercero; el checkbox de consentimiento sigue siendo obligatorio en cada envío. El dueño DEBE ver la misma pantalla de gracias que un registro nuevo. El sistema NO DEBE revelarle en ningún momento que su ficha estaba rechazada ni el motivo del rechazo: ese dato solo vive dentro del panel, y el formulario público es anónimo (cualquiera podría escribir un número ajeno). El reenvío sigue siendo un envío del formulario público: DEBE pasar por las mismas validaciones, por el campo trampa y por el límite de envíos por IP, y NO DEBE poder alterar el origen, los giros, la huella del enlace de gestión ni la fecha de publicación de la ficha.

#### Scenario: número con ficha publicada

- **WHEN** el dueño envía un WhatsApp que ya tiene ficha publicada
- **THEN** no se crea un segundo negocio ni se toca la ficha existente, y ve el mensaje "Este número ya tiene una ficha registrada. Si es tu negocio, no hace falta registrarlo otra vez: te vamos a pasar por WhatsApp el enlace para editarlo." junto al campo de WhatsApp

#### Scenario: número con ficha en revisión

- **WHEN** el dueño envía un WhatsApp cuya ficha sigue esperando revisión
- **THEN** ve el mismo mensaje de número ya registrado y su ficha en cola no cambia

#### Scenario: el registro no entrega enlaces de gestión

- **WHEN** el dueño ve el mensaje de número ya registrado
- **THEN** no aparece ningún enlace de edición ni ningún botón que lleve a uno: solo el texto

#### Scenario: reenvío tras un rechazo

- **WHEN** un negocio cuya ficha fue rechazada corrige sus datos y vuelve a enviar el formulario con el mismo número
- **THEN** ve la pantalla de gracias con el mensaje "¡Gracias! Tu negocio está en revisión. Te contactaremos por WhatsApp para confirmar tus datos antes de publicarlo.", su ficha queda con los datos nuevos en estado `en_revision`, sin fecha ni motivo de rechazo, y vuelve a aparecer en la cola del panel como recién llegada

#### Scenario: la constancia del consentimiento no se sustituye en el reenvío

- **WHEN** una ficha rechazada se reenvía con el checkbox de consentimiento marcado
- **THEN** el reenvío se acepta y la ficha conserva la fecha de consentimiento del registro original, sin sobrescribirla con la del reenvío

#### Scenario: el formulario no delata el rechazo

- **WHEN** alguien envía el formulario con un número cuya ficha estaba rechazada
- **THEN** en ningún momento ve el motivo del rechazo ni ningún dato de la ficha anterior

#### Scenario: el reenvío no se autopublica

- **WHEN** un reenvío incluye campos extra como estado `publicado`, origen `siembra`, giros o fecha de publicación
- **THEN** esos valores se ignoran y la ficha queda en `en_revision`, con el origen que ya tenía, sin giros nuevos y sin fecha de publicación

#### Scenario: el reenvío pasa por las mismas defensas

- **WHEN** un reenvío llega con el campo trampa lleno, con la IP sin cupo o con un campo inválido
- **THEN** se trata exactamente igual que cualquier otro envío del formulario y la ficha rechazada no cambia

#### Scenario: duplicado escrito con otro formato

- **WHEN** un negocio ya publicado como "7711234567" se intenta registrar de nuevo como "+52 771 123 4567"
- **THEN** el sistema lo detecta como el mismo número y muestra el mismo mensaje, sin crear una segunda ficha

#### Scenario: carrera entre dos envíos simultáneos

- **WHEN** dos envíos con el mismo número llegan casi al mismo tiempo y el segundo choca con la unicidad de la base de datos
- **THEN** el usuario del segundo envío ve el mensaje de número ya registrado, no un error técnico
