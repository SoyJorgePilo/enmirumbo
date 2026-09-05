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

El formulario DEBE pedir los 5 campos obligatorios del PRD §6.1 — nombre del negocio, categoría (lista cerrada de las 8 del catálogo), WhatsApp de 10 dígitos, colonia (lista cerrada del catálogo con opción "Otra" + texto libre) y checkbox de consentimiento — y DEBE ofrecer como opcionales: "¿Qué ofreces?" (máx. 200 caracteres), "¿Haces entregas o vas a domicilio?" (sí/no), teléfono fijo, dirección o referencias, horario, link de Facebook y **una foto del negocio**. Los opcionales DEBEN estar marcados visiblemente como opcionales. Las etiquetas visibles DEBEN ser, literalmente: "¿Cómo se llama tu negocio?", "¿A qué se dedica?", "Tu WhatsApp (10 dígitos)", "¿En qué colonia estás?", "¿Qué ofreces? (opcional)", "¿Haces entregas o vas a domicilio? (opcional)", "Teléfono fijo (opcional)", "Dirección o referencias (opcional)", "Horario (opcional)", "Link de tu Facebook (opcional)" y "Foto de tu negocio (opcional)".

ENMENDADO (enmienda aprobada por el fundador, revisión visual lote 2): el campo "Horario (opcional)" DEBE explicarse con un ejemplo escrito como habla un negocio, no con una abreviatura de agenda. Su texto de ejemplo dentro del campo DEBE ser literalmente "Lunes a sábado de 9 de la mañana a 7 de la tarde", y debajo del campo DEBE aparecer, siempre visible, la línea de ayuda literal: "Escríbelo como se lo dirías a un cliente: 'L-S 9am-7pm', 'Todos los días de 8 a 8', 'Solo fines de semana'." El campo sigue siendo texto libre: ni el ejemplo ni la ayuda imponen un formato, y el servidor no rechaza ningún horario por su redacción.

#### Scenario: el ejemplo del horario se lee como lo diría un negocio

- **WHEN** el dueño llega al campo "Horario (opcional)"
- **THEN** dentro del campo ve el ejemplo "Lunes a sábado de 9 de la mañana a 7 de la tarde" y debajo la ayuda "Escríbelo como se lo dirías a un cliente: 'L-S 9am-7pm', 'Todos los días de 8 a 8', 'Solo fines de semana'."

#### Scenario: el horario sigue siendo texto libre

- **WHEN** el dueño escribe su horario con otras palabras (por ejemplo "Solo fines de semana")
- **THEN** el registro se guarda con ese texto tal cual, sin error ni reformateo

#### Scenario: formulario vacío al abrir

- **WHEN** el dueño abre la página de registro
- **THEN** ve los 5 campos obligatorios y los 7 opcionales (incluida la foto), con los opcionales identificados como tales, sin ningún mensaje de error y sin ningún campo prellenado

#### Scenario: listas cerradas del catálogo

- **WHEN** el dueño despliega la lista de categorías y la de colonias
- **THEN** ve las 8 categorías y las 21 colonias del catálogo, más la opción "Otra" al final de las colonias

#### Scenario: alta solo con obligatorios

- **WHEN** el dueño llena únicamente los 5 obligatorios y envía
- **THEN** el registro se guarda, los campos opcionales quedan vacíos y la ficha queda sin foto

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

### Requirement: El campo de foto explica la política del PRD §6.1 y abre la galería del celular

El formulario DEBE ofrecer un campo de foto opcional, de una sola imagen, que en el celular abra la galería (campo de archivo que declara que acepta imágenes). Junto al campo DEBE aparecer, como texto de ayuda visible antes de elegir el archivo, la política de foto del PRD §6.1 en español llano, con el texto literal: "Una foto de tu local, de tus productos o de tu trabajo. Que no salgan personas que se puedan reconocer. Máximo 5 MB (JPG, PNG o WebP); nosotros la comprimimos para que cargue rápido." El campo DEBE tener etiqueta asociada y un área tocable de al menos 44px.

El formulario DEBE incluir además una casilla con el texto literal "Dejar mi ficha sin foto", visible siempre y con el mismo texto para cualquiera que abra el formulario: en un registro nuevo no cambia nada, y en un reenvío tras rechazo es lo que permite quitar la foto que ya había (ver el requirement "El reenvío tras un rechazo permite cambiar o quitar la foto"). El formulario NO DEBE revelar, ni con ese texto ni con ninguna otra pista, si el número que se está capturando ya tenía ficha.

#### Scenario: elegir una foto desde el celular

- **WHEN** el dueño toca el campo "Foto de tu negocio (opcional)" en su celular
- **THEN** se abre el selector de imágenes de su galería, puede elegir una sola foto y ve arriba del campo la política "Una foto de tu local, de tus productos o de tu trabajo. Que no salgan personas que se puedan reconocer. Máximo 5 MB (JPG, PNG o WebP); nosotros la comprimimos para que cargue rápido."

#### Scenario: registrarse sin foto

- **WHEN** el dueño envía el formulario sin elegir ninguna foto
- **THEN** el registro se guarda igual, sin foto y sin ningún mensaje de error por ese campo

#### Scenario: la casilla de quitar foto es igual para todos

- **WHEN** dos personas distintas abren el formulario, una con un número sin ficha y otra con un número cuya ficha fue rechazada
- **THEN** las dos ven exactamente el mismo campo de foto y la misma casilla "Dejar mi ficha sin foto", sin ninguna diferencia que delate que una de las dos ya tenía ficha

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

El servidor DEBE validar cada campo recibido, sin confiar en la validación del navegador: los obligatorios no pueden venir vacíos, la categoría y la colonia DEBEN existir en el catálogo, "¿Qué ofreces?" no puede exceder 200 caracteres, el link de Facebook solo se acepta si empieza con `http://` o `https://` (se rechaza cualquier otro esquema, incluido `javascript:` o `data:`), la foto DEBE cumplir lo que exige el requirement "El servidor solo acepta la foto si es una imagen real de máximo 5 MB", y todo campo de texto libre tiene un máximo de longitud. Los mensajes DEBEN mostrarse junto al campo correspondiente, en español claro, y el formulario DEBE conservar lo que el dueño ya había capturado. Los textos de error DEBEN ser, literalmente: "Escribe el nombre de tu negocio", "Elige una categoría", "Revisa tu número de WhatsApp: deben ser 10 dígitos", "Elige tu colonia", "Escribe el nombre de tu colonia", "Marca la casilla para poder registrar tu negocio", "Deja esto en 200 caracteres o menos", "El link de Facebook debe empezar con http:// o https://" y "El aviso de privacidad cambió mientras llenabas esto. Léelo otra vez y vuelve a marcar la casilla."

ENMENDADO (enmienda aprobada por el fundador, revisión visual lote 2): el **teléfono fijo** DEBE validarse en el servidor, no solo confiar en el teclado del celular. Solo se aceptan dígitos y los separadores con los que la gente escribe un teléfono —espacio, guion, paréntesis y `+`— y DEBE haber al menos un dígito. Cualquier otro contenido (letras, "no tengo", una dirección de correo, marcado) DEBE rechazarse con el mensaje literal "Revisa el teléfono fijo: escribe solo números (puedes usar espacios, guiones o paréntesis)" junto a ese campo, sin guardar nada. El campo DEBE pedir el teclado telefónico en el celular (no el numérico puro, que no ofrece los separadores). Lo capturado se guarda tal cual lo escribió el dueño: esta regla decide qué entra, no cómo se ve después — la ficha pública sigue mostrando "Teléfono: &lt;texto&gt;" para lo que no se puede marcar, sin cambio alguno.

Cuando un envío se rechaza, el formulario DEBE volver con todos los valores capturados salvo dos excepciones, que el dueño tiene que reponer: el checkbox de consentimiento y **la foto**, porque ningún navegador repuebla un campo de archivo por razones de seguridad. Si el envío rechazado traía foto, el formulario DEBE decirlo junto al campo con el texto literal "Tu foto no se quedó guardada: vuelve a elegirla antes de enviar." y NO DEBE quedarse con el archivo en el servidor mientras tanto.

#### Scenario: obligatorios vacíos

- **WHEN** el dueño envía el formulario sin llenar nada
- **THEN** no se guarda nada y ve un mensaje de error junto a cada campo obligatorio faltante, con el foco puesto en el primero

#### Scenario: "¿Qué ofreces?" demasiado largo

- **WHEN** el dueño envía 250 caracteres en "¿Qué ofreces?"
- **THEN** no se guarda nada y ve "Deja esto en 200 caracteres o menos" junto a ese campo

#### Scenario: link de Facebook con esquema no permitido

- **WHEN** el dueño envía como link de Facebook algo que no empieza con http:// o https:// (por ejemplo "javascript:alert(1)" o "facebook.com/minegocio")
- **THEN** no se guarda nada y ve "El link de Facebook debe empezar con http:// o https://" junto a ese campo

#### Scenario: teléfono fijo con letras

- **WHEN** el envío llega directo al servidor (sin pasar por el navegador) con "no tengo" o "llámame al celu" en el teléfono fijo
- **THEN** no se guarda nada y ve "Revisa el teléfono fijo: escribe solo números (puedes usar espacios, guiones o paréntesis)" junto a ese campo

#### Scenario: teléfono fijo con separadores

- **WHEN** el dueño escribe su teléfono como "(775) 123-45-67" o "+52 775 123 4567"
- **THEN** el registro se guarda con ese texto tal cual, sin error

#### Scenario: teléfono fijo sin un solo dígito

- **WHEN** el envío trae en el teléfono fijo solo separadores (por ejemplo "()" o "--")
- **THEN** no se guarda nada y ve el mismo mensaje junto a ese campo

#### Scenario: categoría o colonia fuera del catálogo

- **WHEN** el envío trae un identificador de categoría o de colonia que no existe en el catálogo
- **THEN** el registro se rechaza y no se crea ningún negocio

#### Scenario: no se pierde lo capturado

- **WHEN** el envío se rechaza por un error de validación
- **THEN** el formulario se vuelve a mostrar con todos los valores que el dueño había escrito (incluidas categoría, colonia y opcionales), salvo el checkbox de consentimiento y la foto, que deben volver a ponerse

#### Scenario: hay que volver a elegir la foto

- **WHEN** el dueño envía el formulario con una foto y el envío se rechaza porque otro campo tiene error
- **THEN** ve "Tu foto no se quedó guardada: vuelve a elegirla antes de enviar." junto al campo de foto, el campo aparece vacío y en el servidor no quedó guardado ningún archivo de ese envío

### Requirement: El servidor solo acepta la foto si es una imagen real de máximo 5 MB

El servidor DEBE aceptar la foto únicamente si pesa 5 MB o menos y si su **contenido** es de verdad una imagen JPG, PNG o WebP que se puede abrir, sin fiarse de la extensión del archivo ni del tipo que declara el navegador (PRD §6.1: "máx. 5 MB de entrada"). DEBE rechazar, con el mismo criterio, los archivos que no son imagen, las imágenes vectoriales (SVG) y las imágenes cuyas dimensiones superen los 40 megapíxeles, que son la forma barata de tumbar al servidor con un archivo chico. Si el envío trae más de un archivo de foto, el sistema DEBE quedarse con la primera imagen y descartar las demás: una ficha tiene una sola foto.

El procesamiento de la imagen DEBE ocurrir **después** del campo trampa, del cupo por IP y de la validación del resto de los campos: un envío bloqueado por esas defensas NO DEBE costarle al servidor ni un byte de procesamiento de imagen ni dejar archivo alguno. Los mensajes DEBEN mostrarse junto al campo de foto y ser, literalmente: "Esa foto pesa más de 5 MB. Sube una más ligera." cuando se pasa del tamaño, "No pudimos leer esa foto. Sube una imagen JPG, PNG o WebP." cuando el contenido no es una de esas imágenes (incluidos SVG y archivos disfrazados) o cuando es demasiado grande en píxeles, y "No pudimos preparar tu foto. Intenta con otra." si el procesamiento falla por un problema del servidor. Ningún mensaje DEBE incluir detalles técnicos del archivo ni del error.

#### Scenario: foto de más de 5 MB

- **WHEN** el dueño sube una foto de 6 MB
- **THEN** no se guarda ningún negocio ni ningún archivo, y ve "Esa foto pesa más de 5 MB. Sube una más ligera." junto al campo de foto

#### Scenario: archivo disfrazado de imagen

- **WHEN** alguien envía como foto un archivo llamado `foto.jpg` cuyo contenido es HTML, un PDF o un ejecutable
- **THEN** no se guarda ningún negocio ni ningún archivo, y ve "No pudimos leer esa foto. Sube una imagen JPG, PNG o WebP."

#### Scenario: SVG rechazado

- **WHEN** alguien envía un SVG (aunque el navegador lo declare como `image/svg+xml`)
- **THEN** se rechaza con "No pudimos leer esa foto. Sube una imagen JPG, PNG o WebP." y en ningún momento ese contenido se guarda ni se sirve

#### Scenario: imagen enorme en píxeles

- **WHEN** alguien envía un PNG de pocos megabytes pero de 100 megapíxeles
- **THEN** el servidor lo rechaza con el mismo mensaje de foto ilegible, sin quedarse sin memoria y sin tardar más que un envío normal

#### Scenario: el bot no paga procesamiento

- **WHEN** llega un envío con el campo trampa lleno o desde una IP sin cupo, con una foto de 5 MB adjunta
- **THEN** no se procesa ninguna imagen, no queda ningún archivo guardado y la respuesta es la que ya define el anti-abuso para ese caso

#### Scenario: varios archivos en el mismo envío

- **WHEN** un envío trae tres archivos en el campo de foto
- **THEN** la ficha queda con una sola foto y de los otros dos no queda ningún archivo guardado

### Requirement: El trabajo de imagen tiene un techo y el que no cabe se va con un mensaje, no a una cola

El tope de 5 MB acota los bytes que llegan, no el trabajo que provocan: una imagen *válida* de casi 40 megapíxeles puede pesar poco más de 100 KB y costar decenas de MB de memoria al abrirse, así que un envío bien formado, que pasa todas las defensas previas, podría tumbar el servidor por acumulación. Por eso el sistema DEBE limitar cuántas fotos **abre** a la vez, con un tope fijo y pequeño, independiente de cuántas peticiones lleguen. Un envío que llega cuando el tope está ocupado NO DEBE quedarse esperando turno ni encolarse: DEBE rechazarse de inmediato, junto al campo de foto, con el texto literal "Estamos recibiendo muchas fotos, intenta de nuevo en un momento", conservando todo lo que el dueño había capturado y sin dejar ni ficha ni archivos. Preferimos pedirle a una persona que reintente en un minuto antes que dejar el directorio caído para todo el pueblo.

Ese tope DEBE cubrir **solo la parte que abre la imagen original**, que es la que gasta memoria en proporción a lo que mandó el cliente. La compresión posterior —que trabaja sobre un tamaño ya acotado por el sistema— NO DEBE ocupar uno de esos lugares: si lo hiciera, un puñado de fotos deliberadamente difíciles de comprimir, enviadas a ritmo de una por segundo, dejaría el campo de foto inservible para todo el mundo de forma sostenida, y eso ya no es "un pico de tráfico, intenta en un momento" sino una negación de servicio barata. El rechazo por cupo DEBE ser un aviso ocasional en un pico real, no el estado normal del formulario.

Una misma foto NO DEBE abrirse más de una vez para producir sus dos variantes: la segunda se deriva del trabajo ya hecho. Así el costo de un envío no crece con el número de tamaños ni con los reintentos de compresión.

El tope de megapíxeles se mantiene en 40: es lo que deja pasar una foto de celular tomada en su modo de más resolución y que aun así quepa en 5 MB, y bajarlo rechazaría fotos legítimas sin cerrar el problema —el que lo cierra es el tope de trabajo simultáneo, porque la concurrencia es la dimensión que no estaba acotada—.

#### Scenario: llegan más fotos de las que caben a la vez

- **WHEN** llegan al mismo tiempo más envíos con foto de los que el servidor procesa a la vez
- **THEN** los que caben se procesan normalmente y el resto recibe "Estamos recibiendo muchas fotos, intenta de nuevo en un momento" junto al campo de foto, sin esperar turno

#### Scenario: al que no cupo no se le pierde lo escrito

- **WHEN** un envío se rechaza porque el servidor estaba ocupado procesando otras fotos
- **THEN** el formulario vuelve con todo lo que había capturado (salvo la foto, que ningún navegador repuebla), no se creó ninguna ficha y no quedó ningún archivo guardado

#### Scenario: el trabajo por foto no se multiplica

- **WHEN** el servidor procesa una foto y produce sus variantes de tarjeta y de ficha
- **THEN** la imagen se abre una sola vez, y las dos variantes salen de ese único trabajo

#### Scenario: fotos difíciles de comprimir no bloquean el formulario

- **WHEN** alguien sostiene un envío por segundo con fotos hechas a propósito para que comprimirlas cueste
- **THEN** un vecino que sube su foto en ese mismo rato la sube igual, sin recibir el aviso de "estamos recibiendo muchas fotos"

### Requirement: La foto se guarda comprimida, sin metadatos y con una referencia que genera el servidor

Toda foto aceptada DEBE guardarse **procesada por el servidor** (PRD §6.1: "comprimida en el servidor"; ADR-006: variantes generadas al subir): el sistema DEBE producir una variante para la tarjeta del listado y otra para la ficha, redimensionadas y comprimidas, y DEBE descartar el archivo original. El resultado NO DEBE conservar ningún metadato de la imagen: en particular, ninguna variante guardada ni servida DEBE incluir EXIF con coordenadas GPS, marca del dispositivo o fecha de la toma, porque la ubicación del celular es un dato personal que el PRD §8 no publica ni siquiera cuando el negocio da su dirección.

El sistema DEBE guardar en la ficha una **referencia interna generada por el servidor** (una clave opaca que no se puede adivinar a partir del negocio ni de su nombre). Ningún valor mandado por el cliente DEBE poder fijar ni alterar esa referencia, igual que pasa con el estado, el origen y la constancia del consentimiento. Los archivos DEBEN vivir fuera del repositorio y fuera del control de versiones (ADR-006), en el almacenamiento que el sistema tenga configurado; el comportamiento observable NO DEBE depender de cuál sea ese almacenamiento. Si el alta o el reenvío no llegan a guardarse (error de la base, número duplicado, ficha ya resuelta), el archivo recién escrito DEBE borrarse: ningún envío fallido DEBE dejar archivos huérfanos.

#### Scenario: la foto se sirve comprimida y en dos tamaños

- **WHEN** el dueño registra su negocio con una foto de 4 MB tomada con el celular
- **THEN** la ficha queda con una foto guardada en dos variantes —una para la tarjeta y otra para la ficha—, ambas mucho más ligeras que el original, y el archivo original no se conserva en ninguna parte

#### Scenario: la ubicación del celular no se publica ni se guarda

- **WHEN** el dueño sube una foto que trae EXIF con coordenadas GPS y modelo de celular
- **THEN** ninguna de las variantes guardadas ni servidas contiene esas coordenadas ni ningún otro metadato de la imagen

#### Scenario: el cliente no puede fijar la referencia de la foto

- **WHEN** un envío incluye campos extra que pretenden fijar la referencia de la foto (por ejemplo una URL externa, un `data:` o una ruta interna inventada)
- **THEN** esos valores se ignoran y la ficha queda con la referencia que generó el servidor, o sin foto si no se subió ninguna

#### Scenario: sin archivos huérfanos cuando el alta falla

- **WHEN** un envío con foto se rechaza al final porque ese número ya tiene ficha o porque la base falla al guardar
- **THEN** no queda ningún archivo guardado de ese envío

### Requirement: Una sola ficha por número de WhatsApp

Si el WhatsApp normalizado ya tiene ficha en estado `en_revision` o `publicado`, el registro DEBE rechazarse y el formulario DEBE decirlo con el texto literal "Este número ya tiene una ficha registrada. Si es tu negocio, no hace falta registrarlo otra vez: te vamos a pasar por WhatsApp el enlace para editarlo." Ese mensaje es cierto de punta a punta: el enlace de gestión existe (PRD §6.4), el admin lo manda al aprobar y la ficha pública ofrece el botón "Perdí mi enlace" para pedirlo de nuevo (capacidad `directorio-publico`). El formulario de registro sigue **sin** llevar botón ni enlace hacia el modo edición: pedir el enlace es una conversación con el admin, no un botón en un formulario anónimo.

Si la ficha de ese número está en estado `rechazado`, el envío NO DEBE tratarse como duplicado: el negocio "puede corregir y volver a enviar" (PRD §6.3). En ese caso el sistema DEBE actualizar esa misma ficha con los datos del nuevo envío, regresarla a `en_revision`, dejar nulos la fecha y el motivo del rechazo anterior (si no, la purga de rechazados a los 90 días se llevaría un registro que ya está otra vez en la cola) y reiniciar el reloj de la espera, de modo que el indicador de 48 horas del panel cuente desde el reenvío.

La constancia del consentimiento es la excepción: ni la fecha (`consintioAvisoEn`) ni la versión aceptada (`consintioAvisoVersion`) DEBEN sustituirse en el reenvío, porque son la evidencia LFPDPPP del titular y un formulario anónimo podría estar siendo reenviado por un tercero; el checkbox de consentimiento sigue siendo obligatorio en cada envío. Cuando la versión vigente del aviso es **posterior** a la de esa constancia original, el sistema DEBE registrar aparte la reaceptación: la fecha del reenvío y la versión vigente (`reconsintioAvisoEn` y `reconsintioAvisoVersion`), sobrescribiendo la reaceptación anterior si la hubiera. En cualquier otro caso los campos de reaceptación NO DEBEN tocarse: ni cuando la versión vigente es la misma de la constancia, ni cuando es **anterior** (un despliegue revertido), ni cuando la constancia original **no tiene versión** por ser anterior al versionado, que no es comparable con ninguna. Anotar una reaceptación en esos casos afirmaría un cambio que no ocurrió, o convertiría a cualquiera que conozca el número en autor de evidencia de consentimiento sobre la ficha de otro. Esto solo puede ocurrir sobre un envío aceptado, así que la reaceptación siempre corresponde a una casilla marcada con ese texto enfrente (ver el requirement "Nadie consiente una versión del aviso que no tuvo enfrente").

El dueño DEBE ver la misma pantalla de gracias que un registro nuevo. El sistema NO DEBE revelarle en ningún momento que su ficha estaba rechazada ni el motivo del rechazo: ese dato solo vive dentro del panel, y el formulario público es anónimo (cualquiera podría escribir un número ajeno). El reenvío sigue siendo un envío del formulario público: DEBE pasar por las mismas validaciones, por el campo trampa y por el límite de envíos por IP, y NO DEBE poder alterar el origen, los giros, la huella del enlace de gestión ni la fecha de publicación de la ficha.

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

### Requirement: El reenvío tras un rechazo permite cambiar o quitar la foto

Cuando una ficha rechazada se corrige y se vuelve a enviar (PRD §6.3), el envío DEBE poder: subir una foto nueva, que reemplaza a la anterior; quitar la que tenía, marcando la casilla "Dejar mi ficha sin foto"; o dejarla igual, no eligiendo archivo ni marcando la casilla. Cada vez que una foto deja de estar en la ficha —porque se reemplazó o porque se quitó—, sus archivos DEBEN borrarse del almacenamiento, no solo desvincularse de la ficha (PRD §8: el borrado es real). El dueño DEBE ver la misma pantalla de gracias de siempre y el sistema NO DEBE decirle nada del rechazo anterior ni de la foto que tenía.

#### Scenario: cambiar la foto al reenviar

- **WHEN** un negocio rechazado vuelve a enviar el formulario con una foto distinta
- **THEN** su ficha queda con la foto nueva, los archivos de la anterior ya no existen en el almacenamiento y ve la pantalla de gracias de siempre

#### Scenario: quitar la foto al reenviar

- **WHEN** un negocio rechazado vuelve a enviar marcando "Dejar mi ficha sin foto" y sin elegir archivo
- **THEN** su ficha queda sin foto, los archivos de la que tenía ya no existen y ve la pantalla de gracias de siempre

#### Scenario: reenvío que no toca la foto

- **WHEN** un negocio rechazado corrige su horario y vuelve a enviar sin elegir archivo y sin marcar la casilla
- **THEN** su ficha conserva exactamente la misma foto que tenía

#### Scenario: el reenvío con foto pasa por las mismas defensas

- **WHEN** un reenvío llega con una foto de 6 MB, con el campo trampa lleno o con la IP sin cupo
- **THEN** se trata igual que cualquier otro envío del formulario: la ficha rechazada no cambia, su foto anterior sigue intacta y no queda ningún archivo nuevo

### Requirement: Consentimiento con aviso simplificado visible y constancia

El formulario DEBE mostrar el aviso de privacidad simplificado dentro de la propia página (visible sin salir del formulario, PRD §6.1 y §8) y un checkbox obligatorio con el texto literal "Acepto el aviso de privacidad y confirmo que este negocio es mío o que tengo permiso para registrarlo." Sin ese checkbox no DEBE haber envío. Al guardar un alta nueva, el sistema DEBE registrar la constancia como un par que pone el servidor —el timestamp (`consintioAvisoEn`) y la versión del aviso vigente en ese momento (`consintioAvisoVersion`)—, nunca valores enviados por el cliente; en el reenvío de una ficha rechazada esa constancia se conserva completa y no se sustituye (ver el requirement "Una sola ficha por número de WhatsApp").

El aviso simplificado DEBE advertir, de forma llana y antes de que el dueño marque la casilla, que si su ficha se publica el nombre del negocio, el WhatsApp, el teléfono fijo y lo demás que escriba quedan a la vista de cualquiera en el directorio: sin esa advertencia el consentimiento no es informado. El texto del aviso simplificado DEBE ser: "Aviso de privacidad (resumen): EnMiRumbo, el directorio de negocios de Tizayuca, usa los datos que escribes aquí para revisar tu negocio, contactarte por WhatsApp y publicar tu ficha en el directorio. Ojo con esto: si publicamos tu ficha, el nombre de tu negocio, tu WhatsApp, tu teléfono fijo y lo demás que escribas quedan a la vista de cualquiera que entre al directorio, con botones para escribirte o marcarte directo. Publicamos tu colonia, no tu domicilio exacto, salvo que tú escribas la dirección. No vendemos ni compartimos tus datos con nadie más. Puedes pedirnos que corrijamos o borremos tu ficha cuando quieras, por el mismo WhatsApp con el que te contactemos; lo atendemos en máximo 20 días hábiles."

Ese texto es una de las tres piezas del contenido versionado del aviso (ver la capacidad `paginas-legales`): cambiarlo estrena versión, y por eso el rebrand a "EnMiRumbo" pasó por el mismo trámite que cualquier otro cambio del aviso.

El bloque de consentimiento DEBE incluir además un enlace visible al aviso de privacidad integral, con el texto literal "Lee el aviso de privacidad completo", hacia `/aviso-de-privacidad`, con área táctil de al menos 44px y en la misma pestaña (no es un enlace externo). La frase "Cuando publiquemos el aviso completo, aquí va a estar el enlace." NO DEBE aparecer en ningún lado.

El bloque DEBE mostrar también, antes de la casilla, cuál versión del aviso se está aceptando, con el texto literal "Estás aceptando la versión 2 del aviso de privacidad." (donde `2` es el identificador de versión vigente, leído del mismo lugar que lo lee la página del aviso: no se escribe a mano en dos sitios). El dueño NO DEBE tener que llenar ni elegir nada por esto: es texto, no un campo.

#### Scenario: aviso visible sin salir del formulario

- **WHEN** el dueño llega a la sección de consentimiento
- **THEN** lee el aviso simplificado en la misma pantalla, sin abrir otra página ni descargar nada

#### Scenario: el aviso simplificado avisa que el WhatsApp y el teléfono quedan públicos

- **WHEN** el dueño lee el aviso simplificado antes de marcar la casilla
- **THEN** lee que, si se publica su ficha, el nombre de su negocio, su WhatsApp, su teléfono fijo y lo demás que escriba quedan a la vista de cualquiera que entre al directorio, con botones para escribirle o marcarle directo

#### Scenario: el aviso simplificado nombra al sitio con la marca vigente

- **WHEN** el dueño lee la primera línea del aviso simplificado
- **THEN** dice "Aviso de privacidad (resumen): EnMiRumbo, el directorio de negocios de Tizayuca, usa los datos que escribes aquí…", sin rastro de la marca anterior y sin la localidad pegada al nombre

#### Scenario: la versión está a la vista antes de aceptar

- **WHEN** el dueño llega a la casilla de consentimiento
- **THEN** lee "Estás aceptando la versión 2 del aviso de privacidad." y esa versión es la misma que muestra `/aviso-de-privacidad`

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

### Requirement: Nadie consiente una versión del aviso que no tuvo enfrente

El formulario DEBE decirle al servidor con qué versión del aviso se pintó, y el servidor DEBE compararla con la versión vigente al procesar el envío. Si no coinciden —porque el aviso cambió entre que el dueño abrió el formulario y lo mandó, o porque el dato no llegó— el envío NO DEBE guardarse: el formulario DEBE volver a mostrarse con el aviso nuevo, con todo lo que el dueño ya había capturado, con la casilla de consentimiento desmarcada y con el mensaje literal "El aviso de privacidad cambió mientras llenabas esto. Léelo otra vez y vuelve a marcar la casilla." junto a la casilla.

La versión que se guarda DEBE ser siempre la que el servidor tiene vigente, nunca la que llegó en el envío: el dato del formulario solo sirve para detectar el desfase, igual que el estado, el origen y la fecha del consentimiento, que tampoco los fija el cliente. Un envío que declare una versión inventada, vieja o vacía DEBE terminar en ese mismo mensaje, sin crear ni tocar ninguna ficha. El dato DEBE viajar en el propio envío del formulario, sin JavaScript de cliente.

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

Un envío válido DEBE crear el negocio en estado `en_revision` con origen `organico` (los valores por defecto del modelo) y llevar al dueño a la pantalla de gracias con el mensaje literal del PRD §6.1: "¡Gracias! Tu negocio está en revisión. Te contactaremos por WhatsApp para confirmar tus datos antes de publicarlo." El estado, el origen y la constancia del consentimiento —su fecha y su versión— los fija el servidor: ningún valor enviado por el cliente DEBE poder alterarlos. Recargar la pantalla de gracias NO DEBE crear un registro nuevo.

#### Scenario: registro exitoso

- **WHEN** el dueño envía el formulario correctamente lleno
- **THEN** ve la pantalla con el mensaje "¡Gracias! Tu negocio está en revisión. Te contactaremos por WhatsApp para confirmar tus datos antes de publicarlo." y el negocio queda guardado en estado `en_revision` con origen `organico`, sin giros y sin publicar

#### Scenario: el cliente no puede autopublicarse

- **WHEN** un envío incluye campos extra como estado `publicado`, origen `siembra`, fecha de publicación o una huella de enlace de gestión
- **THEN** esos valores se ignoran y el negocio queda igual en `en_revision`, origen `organico`, sin fecha de publicación y sin enlace de gestión

#### Scenario: recarga tras el éxito

- **WHEN** el dueño recarga la pantalla de gracias o vuelve a ella
- **THEN** no se crea ningún registro adicional

#### Scenario: falla al guardar

- **WHEN** el guardado falla por un problema del servidor o de la base de datos
- **THEN** el dueño ve el mensaje "No pudimos guardar tu registro. Vuelve a intentarlo en un momento." con sus datos aún en el formulario, y no se muestra ningún detalle técnico del error

### Requirement: Anti-abuso sin captcha en el formulario público

El formulario DEBE protegerse contra envíos automatizados sin poner fricción al usuario y sin captcha (PRD §8), mediante: un campo trampa (honeypot) invisible para las personas, un límite de envíos por IP (3 por hora) y una alerta registrada en el log del servidor cuando las altas del día superan un umbral plausible. Al bloquear un envío, el sistema NO DEBE guardar nada.

El límite por IP del registro DEBE llevar **su propio conteo**, separado del de cualquier otra superficie pública que use el mismo mecanismo —hoy el botón "Reportar" de la ficha (PRD §6.3) y el envío de cambios del modo edición (PRD §6.4)—: agotar el cupo de reportes o el de ediciones NO DEBE impedirle a nadie registrar su negocio, ni agotar el cupo de altas DEBE impedirle reportar una ficha o mandar sus cambios. La política de lectura de la IP es la misma para todos esos cupos: solo se confía en el encabezado que el despliegue declara, y sin esa configuración no se aplica ningún cupo por IP.

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

#### Scenario: los cupos no se comparten entre superficies

- **WHEN** desde la misma IP se agota el cupo de reportes de la hora y enseguida se envía un registro válido
- **THEN** el registro se procesa con normalidad; y a la inversa, agotar el cupo de altas no impide enviar un reporte

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

El envío del formulario y toda su validación DEBEN funcionar aunque el JavaScript de cliente no cargue: el único comportamiento que se pierde sin JS es el ejemplo dinámico de "¿Qué ofreces?" (que cae en el ejemplo genérico) y el indicador "Enviando...". Esto mantiene el presupuesto de rendimiento del PRD §8 en 4G. La foto viaja en ese mismo envío del formulario: NO DEBE haber vista previa, recorte ni compresión en el cliente, ni ningún JavaScript nuevo asociado al campo de foto.

#### Scenario: envío sin JS

- **WHEN** el dueño envía el formulario, con o sin foto, con el JavaScript de cliente deshabilitado o aún sin cargar
- **THEN** el registro se procesa igual en el servidor y ve la pantalla de gracias o los errores por campo, según corresponda

#### Scenario: JS acotado al campo del ejemplo

- **WHEN** se revisa el JavaScript de cliente propio que carga la página de registro
- **THEN** corresponde solo al ejemplo dinámico por categoría y al estado de envío del botón, no al campo de foto ni al resto de la página; el script del proveedor de analítica no cuenta, porque es de un tercero y lo inyecta el tronco de las páginas públicas (capacidad `layout-base`)

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

El enlace DEBE resolverse buscando la **huella** del token recibido, comparada en tiempo constante. Un token inexistente, uno que ya fue invalidado al regenerar, uno alterado en un carácter, uno de un negocio que ya no está publicado y una ruta sin token DEBEN responder **exactamente la misma página 404 en español y el mismo código 404** que cualquier URL que no existe: nada en la respuesta —ni el texto, ni un encabezado, ni el tiempo de respuesta apreciable— DEBE permitir distinguir "este enlace no existe" de "este enlace existe pero ya no sirve".

Como el token viaja en la URL, el sistema DEBE cerrarle las cuatro fugas conocidas. La página de edición y su confirmación DEBEN declarar `noindex, nofollow`; DEBEN declarar una política de referente que **no mande la RUTA en el `Referer`** —lo más que puede salir hacia un destino es el origen del sitio, nunca la URL de edición; suprimir el encabezado entero no vale, porque deja sin origen a los envíos de formulario y rompe la edición sin JavaScript— y NO DEBEN abrir enlaces externos. Ninguna página pública del sitio DEBE enlazar a una URL de edición. Las pantallas del modo edición NO DEBEN cargar el medidor de audiencia ni ningún otro script de terceros, porque mandaría la ruta —es decir, el secreto— a un tercero. Y el token NO DEBE escribirse nunca en el log de la aplicación, ni completo ni recortado, ni en el camino feliz ni al fallar.

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

#### Scenario: la ruta de edición no viaja a ningún tercero

- **WHEN** se revisan la página de edición y su confirmación con la medición de audiencia configurada
- **THEN** ninguna de las dos carga el script del proveedor ni manda su ruta a ningún destino externo, mientras el resto del sitio sigue midiéndose con normalidad

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

El envío de ediciones DEBE protegerse sin captcha y sin fricción (PRD §8), con: un campo trampa (honeypot) invisible para las personas y un límite de 3 envíos de edición por hora y por IP, contado en un **contador propio**, separado del de altas del registro, del de reportes de la ficha y del de intentos de acceso al panel —agotar uno no DEBE consumir los otros—. Al bloquear un envío NO DEBE guardarse ni modificarse nada. Cuando se agota el cupo, el dueño DEBE ver el texto literal "Ya recibimos varios cambios desde aquí. Espera un rato y vuelve a intentar."

#### Scenario: límite por IP

- **WHEN** desde la misma IP llega un cuarto envío de edición dentro de la misma hora
- **THEN** el envío se rechaza sin guardar nada y quien envió ve "Ya recibimos varios cambios desde aquí. Espera un rato y vuelve a intentar."

#### Scenario: el campo trampa

- **WHEN** un envío de edición llega con el campo trampa lleno
- **THEN** no se guarda ninguna edición y quien envió ve la misma confirmación que un envío legítimo

#### Scenario: los cupos no se estorban

- **WHEN** un dueño agota su cupo de ediciones y desde esa misma IP alguien registra un negocio nuevo
- **THEN** el registro se procesa con normalidad, porque los contadores son independientes

### Requirement: El embudo del registro se mide con las vistas de sus dos pantallas

Los eventos "formulario iniciado" y "formulario enviado" del PRD §9 DEBEN medirse con las vistas de página de `/registro` y de `/registro/gracias`, sin agregar JavaScript propio, sin instrumentar el botón "Enviar" y sin ningún evento extra. El botón no se instrumenta a propósito: un clic en "Enviar" con errores de validación no es un registro, y contarlo inflaría la conversión del PRD §10 ("% de registros completados sin ayuda", que se lee como vistas de `/registro/gracias` entre vistas de `/registro`). La pantalla de gracias es un proxy de la conversión, no el conteo contable de altas: el número exacto de negocios registrados vive en la base de datos.

#### Scenario: registro exitoso

- **WHEN** el dueño de un negocio llena el formulario correctamente y lo envía, con la medición configurada
- **THEN** quedan registradas una vista de `/registro` y una vista de `/registro/gracias`, que es lo que cuenta como conversión

#### Scenario: envío con errores no cuenta como conversión

- **WHEN** el dueño envía el formulario con un campo mal y ve los errores por campo
- **THEN** sigue en `/registro`, no se registra ninguna vista de `/registro/gracias` y no se manda ningún evento de "enviado"

#### Scenario: sin instrumentación en el botón

- **WHEN** se revisa el formulario de registro
- **THEN** el botón "Enviar" no lleva ningún atributo de evento ni JavaScript agregado para medir, y el formulario sigue funcionando sin JavaScript de cliente

### Requirement: Ningún dato del formulario viaja a la medición

Nada de lo que el dueño escribe en el registro —nombre del negocio, WhatsApp, teléfono, colonia, dirección, horario o el texto de "¿Qué ofreces?"— DEBE llegar al proveedor de analítica, ni como propiedad de un evento ni dentro de una URL. Las dos pantallas del registro DEBEN seguir viviendo en URLs sin parámetros, y los errores por campo DEBEN seguir mostrándose en la misma URL `/registro`, de modo que la única información que sale del sitio es que alguien vio esas dos pantallas.

#### Scenario: las URLs del registro no llevan datos

- **WHEN** el dueño recorre el formulario, se equivoca, corrige y termina en la pantalla de gracias
- **THEN** las únicas rutas que viajan al proveedor son `/registro` y `/registro/gracias`, sin cadena de consulta y sin ningún dato suyo

#### Scenario: un envío bloqueado por el honeypot

- **WHEN** un bot llena el campo trampa y recibe la misma pantalla de gracias que un envío legítimo (para no delatar la trampa)
- **THEN** no se cuenta ninguna conversión, porque la medición ocurre solo en el navegador y un bot que no ejecuta JavaScript no registra la vista; y si llegara a contarla, el número contable de altas sigue siendo el de la base, no el del proveedor
