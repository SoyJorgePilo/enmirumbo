# Spec: registro-negocio

## Requirements

### Requirement: Página pública de registro en una sola pantalla

El sitio DEBE tener una página pública de registro, alcanzable desde la home, con un solo formulario en una sola pantalla (sin pasos, sin asistente, sin cuenta ni contraseña, PRD §6.1). La página DEBE usar el layout global y ser correcta en un viewport de 390px sin scroll horizontal.

#### Scenario: el dueño llega al registro desde la home

- **WHEN** el dueño de un negocio abre la home en su celular y toca "Registra tu negocio gratis"
- **THEN** llega a la página de registro y ve el formulario completo en una sola pantalla, con header y footer del sitio

#### Scenario: mobile-first a 390px

- **WHEN** la página de registro se abre en un viewport de 390px de ancho
- **THEN** todos los campos, etiquetas y el botón de envío se ven completos y usables, sin scroll horizontal, y cada control tocable mide al menos 44px en su dimensión menor

### Requirement: Campos obligatorios y opcionales del formulario

El formulario DEBE pedir los 5 campos obligatorios del PRD §6.1 — nombre del negocio, categoría (lista cerrada de las 8 del catálogo), WhatsApp de 10 dígitos, colonia (lista cerrada del catálogo con opción "Otra" + texto libre) y checkbox de consentimiento — y DEBE ofrecer como opcionales: "¿Qué ofreces?" (máx. 200 caracteres), "¿Haces entregas o vas a domicilio?" (sí/no), teléfono fijo, dirección o referencias, horario y link de Facebook. Los opcionales DEBEN estar marcados visiblemente como opcionales. La foto NO entra en este change (E1-3). Las etiquetas visibles DEBEN ser, literalmente: "¿Cómo se llama tu negocio?", "¿A qué se dedica?", "Tu WhatsApp (10 dígitos)", "¿En qué colonia estás?", "¿Qué ofreces? (opcional)", "¿Haces entregas o vas a domicilio? (opcional)", "Teléfono fijo (opcional)", "Dirección o referencias (opcional)", "Horario (opcional)" y "Link de tu Facebook (opcional)".

#### Scenario: formulario vacío al abrir

- **WHEN** el dueño abre la página de registro
- **THEN** ve los 5 campos obligatorios y los 6 opcionales, con los opcionales identificados como tales, sin ningún mensaje de error y sin ningún campo prellenado

#### Scenario: listas cerradas del catálogo

- **WHEN** el dueño despliega la lista de categorías y la de colonias
- **THEN** ve las 8 categorías y las 21 colonias del catálogo, más la opción "Otra" al final de las colonias

#### Scenario: alta solo con obligatorios

- **WHEN** el dueño llena únicamente los 5 obligatorios y envía
- **THEN** el registro se guarda y los campos opcionales quedan vacíos

### Requirement: El ejemplo de "¿Qué ofreces?" se adapta a la categoría elegida

El campo "¿Qué ofreces?" DEBE mostrar dentro del campo un ejemplo de palabras clave que cambia según la categoría seleccionada (PRD §6.1 y §6.5). Cada una de las 8 categorías DEBE tener su ejemplo; para "Servicios del hogar" el ejemplo DEBE ser literalmente "ej. plomería, destape de drenajes, bombas de agua" y para "Clubes y escuelas deportivas" DEBE ser literalmente "ej. futbol infantil 6-12 años, entrenamientos martes y jueves". Mientras no haya categoría elegida DEBE mostrarse un ejemplo genérico.

#### Scenario: ejemplo de servicios del hogar

- **WHEN** el dueño elige la categoría "Servicios del hogar"
- **THEN** el campo "¿Qué ofreces?" muestra el ejemplo "ej. plomería, destape de drenajes, bombas de agua"

#### Scenario: ejemplo de deporte

- **WHEN** un club elige la categoría "Clubes y escuelas deportivas"
- **THEN** el campo "¿Qué ofreces?" muestra el ejemplo "ej. futbol infantil 6-12 años, entrenamientos martes y jueves"

#### Scenario: el ejemplo cambia al cambiar de categoría

- **WHEN** el dueño cambia la categoría de "Servicios del hogar" a otra categoría
- **THEN** el ejemplo del campo se actualiza al de la nueva categoría sin recargar la página y sin borrar lo que ya escribió

### Requirement: El servidor normaliza y valida el WhatsApp a 10 dígitos

El servidor DEBE normalizar el WhatsApp antes de validarlo y antes de tocar la base de datos: descarta espacios, guiones, puntos y paréntesis, y quita el prefijo de país (`+52`, `52` o `521`) cuando al hacerlo quedan exactamente 10 dígitos. El valor guardado DEBE ser siempre el de 10 dígitos, de modo que la unicidad "una sola ficha por número" (PRD §6.1) no se pueda burlar escribiendo el mismo número con otro formato. Si tras la normalización no quedan exactamente 10 dígitos, el envío DEBE rechazarse con el mensaje "Revisa tu número de WhatsApp: deben ser 10 dígitos".

#### Scenario: variantes del mismo número se guardan igual

- **WHEN** se envía el WhatsApp como "+52 771 123 4567", como "771-123-4567" o como "7711234567"
- **THEN** en los tres casos el número guardado es "7711234567"

#### Scenario: número con menos de 10 dígitos

- **WHEN** el dueño envía un WhatsApp de 8 dígitos
- **THEN** no se guarda nada y ve el mensaje "Revisa tu número de WhatsApp: deben ser 10 dígitos" junto a ese campo

#### Scenario: texto que no es un número

- **WHEN** el dueño envía en el campo de WhatsApp un texto sin dígitos suficientes (por ejemplo "no tengo" o "771 123 45")
- **THEN** no se guarda nada y ve el mismo mensaje de error junto a ese campo

#### Scenario: la normalización ocurre aunque el navegador no valide

- **WHEN** el envío llega directamente al servidor sin pasar por la validación del navegador
- **THEN** el servidor aplica igual la normalización y el rechazo

### Requirement: El servidor valida todos los campos y devuelve errores por campo en español

El servidor DEBE validar cada campo recibido, sin confiar en la validación del navegador: los obligatorios no pueden venir vacíos, la categoría y la colonia DEBEN existir en el catálogo, "¿Qué ofreces?" no puede exceder 200 caracteres, el link de Facebook solo se acepta si empieza con `http://` o `https://` (se rechaza cualquier otro esquema, incluido `javascript:` o `data:`), y todo campo de texto libre tiene un máximo de longitud. Los mensajes DEBEN mostrarse junto al campo correspondiente, en español claro, y el formulario DEBE conservar lo que el dueño ya había capturado. Los textos de error DEBEN ser, literalmente: "Escribe el nombre de tu negocio", "Elige una categoría", "Revisa tu número de WhatsApp: deben ser 10 dígitos", "Elige tu colonia", "Escribe el nombre de tu colonia", "Marca la casilla para poder registrar tu negocio", "Deja esto en 200 caracteres o menos" y "El link de Facebook debe empezar con http:// o https://".

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

### Requirement: Una sola ficha por número de WhatsApp

Si el WhatsApp normalizado ya tiene ficha en estado `en_revision` o `publicado`, el registro DEBE rechazarse y el formulario DEBE decirlo con el texto literal "Este número ya tiene una ficha registrada. Si es tu negocio, no hace falta registrarlo otra vez: te vamos a pasar por WhatsApp el enlace para editarlo." El flujo "Perdí mi enlace" es P1 (PRD §6.4) y aquí solo se menciona, sin enlace ni botón.

Si la ficha de ese número está en estado `rechazado`, el envío NO DEBE tratarse como duplicado: el negocio "puede corregir y volver a enviar" (PRD §6.3). En ese caso el sistema DEBE actualizar esa misma ficha con los datos del nuevo envío, regresarla a `en_revision`, dejar nulos la fecha y el motivo del rechazo anterior (si no, la purga de rechazados a los 90 días se llevaría un registro que ya está otra vez en la cola) y reiniciar el reloj de la espera, de modo que el indicador de 48 horas del panel cuente desde el reenvío. La constancia del consentimiento (`consintioAvisoEn`) es la única excepción: NO DEBE sustituirse en el reenvío, porque es la evidencia LFPDPPP del titular y un formulario anónimo podría estar siendo reenviado por un tercero; el checkbox de consentimiento sigue siendo obligatorio en cada envío. El dueño DEBE ver la misma pantalla de gracias que un registro nuevo. El sistema NO DEBE revelarle en ningún momento que su ficha estaba rechazada ni el motivo del rechazo: ese dato solo vive dentro del panel, y el formulario público es anónimo (cualquiera podría escribir un número ajeno). El reenvío sigue siendo un envío del formulario público: DEBE pasar por las mismas validaciones, por el campo trampa y por el límite de envíos por IP, y NO DEBE poder alterar el origen, los giros, el token de gestión ni la fecha de publicación de la ficha.

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

### Requirement: Consentimiento con aviso simplificado visible y constancia

El formulario DEBE mostrar el aviso de privacidad simplificado dentro de la propia página (visible sin salir del formulario, PRD §6.1 y §8) y un checkbox obligatorio con el texto literal "Acepto el aviso de privacidad y confirmo que este negocio es mío o que tengo permiso para registrarlo." Sin ese checkbox no DEBE haber envío. Al guardar un alta nueva, el sistema DEBE registrar la constancia como un timestamp puesto por el servidor (`consintioAvisoEn`), nunca un valor enviado por el cliente; en el reenvío de una ficha rechazada esa constancia se conserva y no se sustituye (ver el requirement "Una sola ficha por número de WhatsApp"). Mientras la página del aviso integral (E6) no exista, el aviso simplificado NO DEBE contener enlaces a páginas inexistentes; en su lugar indica que el aviso completo se publicará. El texto del aviso simplificado DEBE ser: "Aviso de privacidad (resumen): NecesitoUno Tizayuca usa los datos que escribes aquí solo para revisar tu negocio, contactarte por WhatsApp y publicar tu ficha en el directorio. Publicamos tu colonia, no tu domicilio exacto, salvo que tú escribas la dirección. No vendemos ni compartimos tus datos con nadie más. Puedes pedirnos que corrijamos o borremos tu ficha cuando quieras, por el mismo WhatsApp con el que te contactemos; lo atendemos en máximo 20 días hábiles. Cuando publiquemos el aviso completo, aquí va a estar el enlace."

#### Scenario: aviso visible sin salir del formulario

- **WHEN** el dueño llega a la sección de consentimiento
- **THEN** lee el aviso simplificado en la misma pantalla, sin abrir otra página ni descargar nada

#### Scenario: sin checkbox no hay envío

- **WHEN** el dueño llena todo correctamente pero no marca el checkbox y envía
- **THEN** no se crea ningún negocio y ve "Marca la casilla para poder registrar tu negocio" junto al checkbox

#### Scenario: constancia del consentimiento

- **WHEN** un registro se guarda con el checkbox marcado
- **THEN** el negocio queda con un timestamp de consentimiento correspondiente al momento en que el servidor procesó el envío

#### Scenario: sin enlaces muertos al aviso integral

- **WHEN** se revisa el aviso simplificado mientras la página del aviso integral no existe
- **THEN** ningún enlace del bloque de consentimiento lleva a una página inexistente

### Requirement: Colonia "Otra" con texto libre pendiente de normalizar

Si el dueño elige "Otra" en la lista de colonias, el formulario DEBE pedir el nombre en texto libre y ese texto es obligatorio. El registro DEBE guardarse con el texto libre y sin colonia de catálogo, para que el admin lo normalice después (PRD §6.3, Apéndice A). Si elige una colonia del catálogo, el texto libre DEBE ignorarse.

#### Scenario: registro con colonia "Otra"

- **WHEN** el dueño elige "Otra" y escribe "Rinconada del Venado"
- **THEN** el negocio se guarda con ese texto libre y sin colonia de catálogo, quedando pendiente de normalizar

#### Scenario: "Otra" sin texto

- **WHEN** el dueño elige "Otra" y deja vacío el texto libre
- **THEN** no se guarda nada y ve "Escribe el nombre de tu colonia" junto a ese campo

#### Scenario: colonia del catálogo con texto libre residual

- **WHEN** el envío trae una colonia del catálogo y además texto libre de colonia
- **THEN** el negocio se guarda con la colonia del catálogo y sin texto libre

### Requirement: El envío exitoso encola el negocio y muestra la pantalla de gracias

Un envío válido DEBE crear el negocio en estado `en_revision` con origen `organico` (los valores por defecto del modelo) y llevar al dueño a la pantalla de gracias con el mensaje literal del PRD §6.1: "¡Gracias! Tu negocio está en revisión. Te contactaremos por WhatsApp para confirmar tus datos antes de publicarlo." El estado, el origen y la fecha de consentimiento los fija el servidor: ningún valor enviado por el cliente DEBE poder alterarlos. Recargar la pantalla de gracias NO DEBE crear un registro nuevo.

#### Scenario: registro exitoso

- **WHEN** el dueño envía el formulario correctamente lleno
- **THEN** ve la pantalla con el mensaje "¡Gracias! Tu negocio está en revisión. Te contactaremos por WhatsApp para confirmar tus datos antes de publicarlo." y el negocio queda guardado en estado `en_revision` con origen `organico`, sin giros y sin publicar

#### Scenario: el cliente no puede autopublicarse

- **WHEN** un envío incluye campos extra como estado `publicado`, origen `siembra`, fecha de publicación o token de gestión
- **THEN** esos valores se ignoran y el negocio queda igual en `en_revision`, origen `organico`, sin fecha de publicación y sin token

#### Scenario: recarga tras el éxito

- **WHEN** el dueño recarga la pantalla de gracias o vuelve a ella
- **THEN** no se crea ningún registro adicional

#### Scenario: falla al guardar

- **WHEN** el guardado falla por un problema del servidor o de la base de datos
- **THEN** el dueño ve el mensaje "No pudimos guardar tu registro. Vuelve a intentarlo en un momento." con sus datos aún en el formulario, y no se muestra ningún detalle técnico del error

### Requirement: Anti-abuso sin captcha en el formulario público

El formulario DEBE protegerse contra envíos automatizados sin poner fricción al usuario y sin captcha (PRD §8), mediante: un campo trampa (honeypot) invisible para las personas, un límite de envíos por IP (3 por hora) y una alerta registrada en el log del servidor cuando las altas del día superan un umbral plausible. Al bloquear un envío, el sistema NO DEBE guardar nada.

#### Scenario: bot que llena el honeypot

- **WHEN** un envío llega con el campo trampa lleno
- **THEN** no se crea ningún negocio y quien envió ve la misma pantalla de gracias que un envío legítimo (para no delatar la trampa)

#### Scenario: límite por IP

- **WHEN** desde la misma IP llega un cuarto envío dentro de la misma hora
- **THEN** el envío se rechaza sin guardar nada y el usuario ve "Ya recibimos varios registros desde aquí. Espera un rato y vuelve a intentar."

#### Scenario: alerta por volumen diario

- **WHEN** las altas creadas en el día superan el umbral configurado
- **THEN** queda registrada una alerta en el log del servidor, sin bloquear a los usuarios legítimos

#### Scenario: el honeypot no molesta a las personas

- **WHEN** un vecino llena el formulario con teclado o con autocompletado del navegador
- **THEN** el campo trampa permanece vacío y su envío se procesa normalmente (no es un campo enfocable ni anunciado por lectores de pantalla)

### Requirement: Estados del formulario y accesibilidad del registro

El formulario DEBE tener los cuatro estados completos: vacío, error por campo, enviando y éxito. Mientras se envía, el botón DEBE indicar que está en curso y no permitir envíos repetidos. Cada campo DEBE tener etiqueta asociada, los errores DEBEN estar asociados al campo para lectores de pantalla, y el campo de WhatsApp DEBE abrir el teclado numérico en el celular.

#### Scenario: estado enviando

- **WHEN** el dueño toca el botón de enviar con el formulario correcto
- **THEN** el botón muestra "Enviando..." y queda deshabilitado hasta que el servidor responde, de modo que tocarlo dos veces no crea dos registros

#### Scenario: errores anunciados

- **WHEN** el envío se rechaza por errores de validación
- **THEN** cada mensaje queda asociado a su campo (el lector de pantalla lo anuncia al enfocarlo) y el foco se coloca en el primer campo con error

#### Scenario: teclado numérico

- **WHEN** el dueño toca el campo de WhatsApp en su celular
- **THEN** se abre el teclado numérico

### Requirement: El registro funciona sin JavaScript de cliente

El envío del formulario y toda su validación DEBEN funcionar aunque el JavaScript de cliente no cargue: el único comportamiento que se pierde sin JS es el ejemplo dinámico de "¿Qué ofreces?" (que cae en el ejemplo genérico) y el indicador "Enviando...". Esto mantiene el presupuesto de rendimiento del PRD §8 en 4G.

#### Scenario: envío sin JS

- **WHEN** el dueño envía el formulario con el JavaScript de cliente deshabilitado o aún sin cargar
- **THEN** el registro se procesa igual en el servidor y ve la pantalla de gracias o los errores por campo, según corresponda

#### Scenario: JS acotado al campo del ejemplo

- **WHEN** se revisa el JavaScript de cliente que carga la página de registro
- **THEN** corresponde solo al ejemplo dinámico por categoría y al estado de envío del botón, no al resto de la página

### Requirement: El alta deja la ficha lista para el buscador

Al guardar un registro, el servidor DEBE escribir también la versión normalizada del nombre y de "¿Qué ofreces?" que usa el buscador (capacidad `modelo-datos`), con la misma función de normalización que usa la búsqueda, de modo que en cuanto el admin publique la ficha el vecino la encuentre escribiendo con o sin acentos. Ese valor lo calcula el servidor a partir de lo que capturó el dueño: ningún valor enviado por el cliente DEBE poder fijarlo ni alterarlo, igual que el estado, el origen y la constancia del consentimiento. El dueño NO DEBE ver ni llenar nada nuevo en el formulario: los campos visibles del registro siguen siendo exactamente los mismos.

#### Scenario: registro con acentos, encontrable después

- **WHEN** el dueño registra "Plomería Güicho" con "destape de drenajes" en "¿Qué ofreces?", y más adelante su ficha se publica
- **THEN** un vecino que busca "plomeria" o "plomero" encuentra ese negocio

#### Scenario: el cliente no puede fijar el texto de búsqueda

- **WHEN** un envío incluye campos extra que pretenden fijar el texto normalizado de búsqueda
- **THEN** esos valores se ignoran y el negocio queda con el texto normalizado calculado a partir de su nombre y su "¿Qué ofreces?" reales

#### Scenario: el formulario no cambia para el dueño

- **WHEN** el dueño abre la página de registro
- **THEN** ve los mismos campos obligatorios y opcionales de siempre, sin ningún campo nuevo relacionado con la búsqueda
