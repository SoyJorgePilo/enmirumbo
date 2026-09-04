# Delta: registro-negocio

## ADDED Requirements

### Requirement: Nadie consiente una versión del aviso que no tuvo enfrente

El formulario DEBE decirle al servidor con qué versión del aviso se pintó, y el servidor DEBE compararla con la versión vigente al procesar el envío. Si no coinciden —porque el aviso cambió entre que el dueño abrió el formulario y lo mandó, o porque el dato no llegó— el envío NO DEBE guardarse: el formulario DEBE volver a mostrarse con el aviso nuevo, con todo lo que el dueño ya había capturado, con la casilla de consentimiento desmarcada y con el mensaje literal "El aviso de privacidad cambió mientras llenabas esto. Léelo otra vez y vuelve a marcar la casilla." junto a la casilla.

La versión que se guarda DEBE ser siempre la que el servidor tiene vigente, nunca la que llegó en el envío: el dato del formulario solo sirve para detectar el desfase, igual que el estado, el origen y la fecha del consentimiento, que tampoco los fija el cliente. Un envío que declare una versión inventada, vieja o vacía DEBE terminar en ese mismo mensaje, sin crear ni tocar ninguna ficha.

#### Scenario: el aviso cambió a media captura

- **WHEN** el dueño abre el formulario con la versión `1`, se despliega la versión `2` y él manda el formulario después
- **THEN** no se guarda ningún registro y ve el mensaje "El aviso de privacidad cambió mientras llenabas esto. Léelo otra vez y vuelve a marcar la casilla." junto a la casilla, con sus datos todavía en el formulario y el aviso nuevo a la vista

#### Scenario: reintento después del cambio

- **WHEN** el dueño lee el aviso nuevo, vuelve a marcar la casilla y manda otra vez
- **THEN** el registro se guarda con normalidad y su constancia queda con la versión `2`

#### Scenario: versión inventada en el envío

- **WHEN** un envío llega declarando una versión del aviso que no existe, una vieja o ninguna
- **THEN** no se crea ni se modifica ninguna ficha y quien envió ve el mismo mensaje del aviso que cambió

#### Scenario: la versión guardada la pone el servidor

- **WHEN** un envío válido se guarda
- **THEN** la versión que queda en la constancia es la vigente del servidor, aunque el envío haya traído cualquier otra cosa en ese campo

## MODIFIED Requirements

### Requirement: Consentimiento con aviso simplificado visible y constancia

El formulario DEBE mostrar el aviso de privacidad simplificado dentro de la propia página (visible sin salir del formulario, PRD §6.1 y §8) y un checkbox obligatorio con el texto literal "Acepto el aviso de privacidad y confirmo que este negocio es mío o que tengo permiso para registrarlo." Sin ese checkbox no DEBE haber envío. Al guardar un alta nueva, el sistema DEBE registrar la constancia como un par que pone el servidor —el timestamp (`consintioAvisoEn`) y la versión del aviso vigente en ese momento (`consintioAvisoVersion`)—, nunca valores enviados por el cliente; en el reenvío de una ficha rechazada esa constancia se conserva completa y no se sustituye (ver el requirement "Una sola ficha por número de WhatsApp").

El aviso simplificado DEBE advertir, de forma llana y antes de que el dueño marque la casilla, que si su ficha se publica el nombre del negocio, el WhatsApp, el teléfono fijo y lo demás que escriba quedan a la vista de cualquiera en el directorio: sin esa advertencia el consentimiento no es informado. El texto del aviso simplificado DEBE ser: "Aviso de privacidad (resumen): NecesitoUno Tizayuca usa los datos que escribes aquí para revisar tu negocio, contactarte por WhatsApp y publicar tu ficha en el directorio. Ojo con esto: si publicamos tu ficha, el nombre de tu negocio, tu WhatsApp, tu teléfono fijo y lo demás que escribas quedan a la vista de cualquiera que entre al directorio, con botones para escribirte o marcarte directo. Publicamos tu colonia, no tu domicilio exacto, salvo que tú escribas la dirección. No vendemos ni compartimos tus datos con nadie más. Puedes pedirnos que corrijamos o borremos tu ficha cuando quieras, por el mismo WhatsApp con el que te contactemos; lo atendemos en máximo 20 días hábiles."

El bloque de consentimiento DEBE incluir además un enlace visible al aviso de privacidad integral, con el texto literal "Lee el aviso de privacidad completo", hacia `/aviso-de-privacidad`, con área táctil de al menos 44px y en la misma pestaña (no es un enlace externo). La frase "Cuando publiquemos el aviso completo, aquí va a estar el enlace." NO DEBE aparecer en ningún lado.

El bloque DEBE mostrar también, antes de la casilla, cuál versión del aviso se está aceptando, con el texto literal "Estás aceptando la versión 1 del aviso de privacidad." (donde `1` es el identificador de versión vigente, leído del mismo lugar que lo lee la página del aviso: no se escribe a mano en dos sitios). El dueño NO DEBE tener que llenar ni elegir nada por esto: es texto, no un campo.

#### Scenario: aviso visible sin salir del formulario

- **WHEN** el dueño llega a la sección de consentimiento
- **THEN** lee el aviso simplificado en la misma pantalla, sin abrir otra página ni descargar nada

#### Scenario: el aviso simplificado avisa que el WhatsApp y el teléfono quedan públicos

- **WHEN** el dueño lee el aviso simplificado antes de marcar la casilla
- **THEN** lee que, si se publica su ficha, el nombre de su negocio, su WhatsApp, su teléfono fijo y lo demás que escriba quedan a la vista de cualquiera que entre al directorio, con botones para escribirle o marcarle directo

#### Scenario: la versión está a la vista antes de aceptar

- **WHEN** el dueño llega a la casilla de consentimiento
- **THEN** lee "Estás aceptando la versión 1 del aviso de privacidad." y esa versión es la misma que muestra `/aviso-de-privacidad`

#### Scenario: enlace al aviso integral

- **WHEN** el dueño quiere leer el aviso completo antes de aceptar
- **THEN** encuentra en el bloque de consentimiento el enlace "Lee el aviso de privacidad completo", que abre `/aviso-de-privacidad` en la misma pestaña, y en ningún lugar del formulario aparece ya la frase "Cuando publiquemos el aviso completo, aquí va a estar el enlace."

#### Scenario: sin checkbox no hay envío

- **WHEN** el dueño llena todo correctamente pero no marca el checkbox y envía
- **THEN** no se crea ningún negocio y ve "Marca la casilla para poder registrar tu negocio" junto al checkbox

#### Scenario: constancia del consentimiento

- **WHEN** un registro se guarda con el checkbox marcado
- **THEN** el negocio queda con un timestamp de consentimiento correspondiente al momento en que el servidor procesó el envío y con la versión del aviso vigente en ese momento

#### Scenario: los enlaces del registro apuntan a páginas que existen

- **WHEN** se revisan los enlaces de la página de registro
- **THEN** el único enlace del bloque de consentimiento es el del aviso integral y lleva a una ruta que existe (la verificación automática de enlaces del sitio lo comprueba)

### Requirement: Una sola ficha por número de WhatsApp

Si el WhatsApp normalizado ya tiene ficha en estado `en_revision` o `publicado`, el registro DEBE rechazarse y el formulario DEBE decirlo con el texto literal "Este número ya tiene una ficha registrada. Si es tu negocio, no hace falta registrarlo otra vez: te vamos a pasar por WhatsApp el enlace para editarlo." El flujo "Perdí mi enlace" es P1 (PRD §6.4) y aquí solo se menciona, sin enlace ni botón.

Si la ficha de ese número está en estado `rechazado`, el envío NO DEBE tratarse como duplicado: el negocio "puede corregir y volver a enviar" (PRD §6.3). En ese caso el sistema DEBE actualizar esa misma ficha con los datos del nuevo envío, regresarla a `en_revision`, dejar nulos la fecha y el motivo del rechazo anterior (si no, la purga de rechazados a los 90 días se llevaría un registro que ya está otra vez en la cola) y reiniciar el reloj de la espera, de modo que el indicador de 48 horas del panel cuente desde el reenvío.

La constancia del consentimiento es la excepción: ni la fecha (`consintioAvisoEn`) ni la versión aceptada (`consintioAvisoVersion`) DEBEN sustituirse en el reenvío, porque son la evidencia LFPDPPP del titular y un formulario anónimo podría estar siendo reenviado por un tercero; el checkbox de consentimiento sigue siendo obligatorio en cada envío. Cuando la versión vigente del aviso es **posterior** a la de esa constancia original, el sistema DEBE registrar aparte la reaceptación: la fecha del reenvío y la versión vigente (`reconsintioAvisoEn` y `reconsintioAvisoVersion`), sobrescribiendo la reaceptación anterior si la hubiera. En cualquier otro caso los campos de reaceptación NO DEBEN tocarse: ni cuando la versión vigente es la misma de la constancia, ni cuando es **anterior** (un despliegue revertido), ni cuando la constancia original **no tiene versión** por ser anterior al versionado. Esto solo puede ocurrir sobre un envío aceptado, así que la reaceptación siempre corresponde a una casilla marcada con ese texto enfrente (ver el requirement "Nadie consiente una versión del aviso que no tuvo enfrente").

> **Enmienda aprobada durante la implementación de T-012** (hallazgos MEDIO-3 y MEDIO-4 de la etapa C, aprobados por el orquestador). La regla decía "cuando la versión vigente es **distinta**… —o cuando la constancia original no tiene versión, por ser anterior al versionado—". Dos consecuencias la volvían falsa como evidencia:
> 1. **Versión anterior:** tras revertir un despliegue, un reenvío anotaba como reaceptación una versión más **vieja** que la de la constancia, y el panel la rotulaba como más nueva. La comparación es de orden (la versión es un entero creciente, design.md §1), no una desigualdad.
> 2. **Sin versión:** las fichas anteriores al versionado —hoy, todas— estrenaban reaceptación en su primer reenvío. Como el formulario es anónimo, eso convertía a cualquiera que conociera el número en autor de evidencia de consentimiento sobre la ficha de otro. "No consta" no es comparable: no se anota nada y la ficha sigue mostrando "versión no registrada", que es la verdad.

El dueño DEBE ver la misma pantalla de gracias que un registro nuevo. El sistema NO DEBE revelarle en ningún momento que su ficha estaba rechazada ni el motivo del rechazo: ese dato solo vive dentro del panel, y el formulario público es anónimo (cualquiera podría escribir un número ajeno). El reenvío sigue siendo un envío del formulario público: DEBE pasar por las mismas validaciones, por el campo trampa y por el límite de envíos por IP, y NO DEBE poder alterar el origen, los giros, el token de gestión ni la fecha de publicación de la ficha.

#### Scenario: número con ficha publicada

- **WHEN** el dueño envía un WhatsApp que ya tiene ficha publicada
- **THEN** no se crea un segundo negocio ni se toca la ficha existente, y ve el mensaje "Este número ya tiene una ficha registrada. Si es tu negocio, no hace falta registrarlo otra vez: te vamos a pasar por WhatsApp el enlace para editarlo." junto al campo de WhatsApp

#### Scenario: número con ficha en revisión

- **WHEN** el dueño envía un WhatsApp cuya ficha sigue esperando revisión
- **THEN** ve el mismo mensaje de número ya registrado y su ficha en cola no cambia

#### Scenario: reenvío tras un rechazo

- **WHEN** un negocio cuya ficha fue rechazada corrige sus datos y vuelve a enviar el formulario con el mismo número
- **THEN** ve la pantalla de gracias con el mensaje "¡Gracias! Tu negocio está en revisión. Te contactaremos por WhatsApp para confirmar tus datos antes de publicarlo.", su ficha queda con los datos nuevos en estado `en_revision`, sin fecha ni motivo de rechazo, y vuelve a aparecer en la cola del panel como recién llegada

#### Scenario: la constancia del consentimiento no se sustituye en el reenvío

- **WHEN** una ficha rechazada se reenvía con el checkbox de consentimiento marcado y el aviso sigue en la misma versión
- **THEN** el reenvío se acepta, la ficha conserva la fecha y la versión de consentimiento del registro original, y sus campos de reaceptación siguen vacíos

#### Scenario: reenvío contra una versión nueva del aviso

- **WHEN** una ficha rechazada cuya constancia es de la versión `1` se reenvía cuando ya está vigente la versión `2`
- **THEN** la constancia original sigue diciendo versión `1` con su fecha de siempre, y la ficha queda además con la reaceptación: la fecha del reenvío y la versión `2`

#### Scenario: reenvío de una ficha anterior al versionado

- **WHEN** se reenvía una ficha cuya constancia no tiene versión registrada
- **THEN** su constancia sigue sin versión (no se le inventa una) y NO se registra reaceptación: sin versión de partida no hay nada con qué comparar, y el panel sigue mostrando "versión no registrada"

#### Scenario: reenvío después de revertir el despliegue

- **WHEN** una ficha rechazada cuya constancia es de la versión `2` se reenvía cuando la versión vigente volvió a ser la `1`
- **THEN** el reenvío se acepta con normalidad y no se anota reaceptación: la versión vigente no es posterior a la de la constancia, y registrar lo contrario afirmaría un cambio que no ocurrió

#### Scenario: el formulario no delata el rechazo

- **WHEN** alguien envía el formulario con un número cuya ficha estaba rechazada
- **THEN** en ningún momento ve el motivo del rechazo ni ningún dato de la ficha anterior

#### Scenario: el reenvío no se autopublica

- **WHEN** un reenvío incluye campos extra como estado `publicado`, origen `siembra`, giros, fecha de publicación o una versión del aviso a modo
- **THEN** esos valores se ignoran y la ficha queda en `en_revision`, con el origen que ya tenía, sin giros nuevos, sin fecha de publicación y con la constancia original intacta

#### Scenario: el reenvío pasa por las mismas defensas

- **WHEN** un reenvío llega con el campo trampa lleno, con la IP sin cupo o con un campo inválido
- **THEN** se trata exactamente igual que cualquier otro envío del formulario y la ficha rechazada no cambia

#### Scenario: duplicado escrito con otro formato

- **WHEN** un negocio ya publicado como "7711234567" se intenta registrar de nuevo como "+52 771 123 4567"
- **THEN** el sistema lo detecta como el mismo número y muestra el mismo mensaje, sin crear una segunda ficha

#### Scenario: carrera entre dos envíos simultáneos

- **WHEN** dos envíos con el mismo número llegan casi al mismo tiempo y el segundo choca con la unicidad de la base de datos
- **THEN** el usuario del segundo envío ve el mensaje de número ya registrado, no un error técnico

### Requirement: El servidor valida todos los campos y devuelve errores por campo en español

El servidor DEBE validar cada campo recibido, sin confiar en la validación del navegador: los obligatorios no pueden venir vacíos, la categoría y la colonia DEBEN existir en el catálogo, "¿Qué ofreces?" no puede exceder 200 caracteres, el link de Facebook solo se acepta si empieza con `http://` o `https://` (se rechaza cualquier otro esquema, incluido `javascript:` o `data:`), y todo campo de texto libre tiene un máximo de longitud. Los mensajes DEBEN mostrarse junto al campo correspondiente, en español claro, y el formulario DEBE conservar lo que el dueño ya había capturado. Los textos de error DEBEN ser, literalmente: "Escribe el nombre de tu negocio", "Elige una categoría", "Revisa tu número de WhatsApp: deben ser 10 dígitos", "Elige tu colonia", "Escribe el nombre de tu colonia", "Marca la casilla para poder registrar tu negocio", "Deja esto en 200 caracteres o menos", "El link de Facebook debe empezar con http:// o https://" y "El aviso de privacidad cambió mientras llenabas esto. Léelo otra vez y vuelve a marcar la casilla."

#### Scenario: obligatorios vacíos

- **WHEN** el dueño envía el formulario sin llenar nada
- **THEN** no se guarda nada y ve un mensaje de error junto a cada campo obligatorio faltante, con el foco puesto en el primero

#### Scenario: "¿Qué ofreces?" demasiado largo

- **WHEN** el dueño envía 250 caracteres en "¿Qué ofreces?"
- **THEN** no se guarda nada y ve "Deja esto en 200 caracteres o menos" junto a ese campo

#### Scenario: link de Facebook con esquema no permitido

- **WHEN** el dueño envía como link de Facebook algo que no empieza con http:// o https:// (por ejemplo "javascript:alert(1)" o "facebook.com/minegocio")
- **THEN** no se guarda nada y ve "El link de Facebook debe empezar con http:// o https://" junto a ese campo

#### Scenario: categoría o colonia fuera del catálogo

- **WHEN** el envío trae un identificador de categoría o de colonia que no existe en el catálogo
- **THEN** el registro se rechaza y no se crea ningún negocio

#### Scenario: no se pierde lo capturado

- **WHEN** el envío se rechaza por un error de validación
- **THEN** el formulario se vuelve a mostrar con todos los valores que el dueño había escrito (incluidas categoría, colonia y opcionales), salvo el checkbox de consentimiento, que debe volver a marcarse
