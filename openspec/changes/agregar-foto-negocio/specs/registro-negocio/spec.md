# Delta de spec: registro-negocio

## MODIFIED Requirements

### Requirement: Campos obligatorios y opcionales del formulario

El formulario DEBE pedir los 5 campos obligatorios del PRD §6.1 — nombre del negocio, categoría (lista cerrada de las 8 del catálogo), WhatsApp de 10 dígitos, colonia (lista cerrada del catálogo con opción "Otra" + texto libre) y checkbox de consentimiento — y DEBE ofrecer como opcionales: "¿Qué ofreces?" (máx. 200 caracteres), "¿Haces entregas o vas a domicilio?" (sí/no), teléfono fijo, dirección o referencias, horario, link de Facebook y **una foto del negocio**. Los opcionales DEBEN estar marcados visiblemente como opcionales. Las etiquetas visibles DEBEN ser, literalmente: "¿Cómo se llama tu negocio?", "¿A qué se dedica?", "Tu WhatsApp (10 dígitos)", "¿En qué colonia estás?", "¿Qué ofreces? (opcional)", "¿Haces entregas o vas a domicilio? (opcional)", "Teléfono fijo (opcional)", "Dirección o referencias (opcional)", "Horario (opcional)", "Link de tu Facebook (opcional)" y "Foto de tu negocio (opcional)".

#### Scenario: formulario vacío al abrir

- **WHEN** el dueño abre la página de registro
- **THEN** ve los 5 campos obligatorios y los 7 opcionales (incluida la foto), con los opcionales identificados como tales, sin ningún mensaje de error y sin ningún campo prellenado

#### Scenario: listas cerradas del catálogo

- **WHEN** el dueño despliega la lista de categorías y la de colonias
- **THEN** ve las 8 categorías y las 21 colonias del catálogo, más la opción "Otra" al final de las colonias

#### Scenario: alta solo con obligatorios

- **WHEN** el dueño llena únicamente los 5 obligatorios y envía
- **THEN** el registro se guarda, los campos opcionales quedan vacíos y la ficha queda sin foto

### Requirement: El servidor valida todos los campos y devuelve errores por campo en español

El servidor DEBE validar cada campo recibido, sin confiar en la validación del navegador: los obligatorios no pueden venir vacíos, la categoría y la colonia DEBEN existir en el catálogo, "¿Qué ofreces?" no puede exceder 200 caracteres, el link de Facebook solo se acepta si empieza con `http://` o `https://` (se rechaza cualquier otro esquema, incluido `javascript:` o `data:`), la foto DEBE cumplir lo que exige el requirement "El servidor solo acepta la foto si es una imagen real de máximo 5 MB", y todo campo de texto libre tiene un máximo de longitud. Los mensajes DEBEN mostrarse junto al campo correspondiente, en español claro, y el formulario DEBE conservar lo que el dueño ya había capturado. Los textos de error DEBEN ser, literalmente: "Escribe el nombre de tu negocio", "Elige una categoría", "Revisa tu número de WhatsApp: deben ser 10 dígitos", "Elige tu colonia", "Escribe el nombre de tu colonia", "Marca la casilla para poder registrar tu negocio", "Deja esto en 200 caracteres o menos" y "El link de Facebook debe empezar con http:// o https://".

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

#### Scenario: categoría o colonia fuera del catálogo

- **WHEN** el envío trae un identificador de categoría o de colonia que no existe en el catálogo
- **THEN** el registro se rechaza y no se crea ningún negocio

#### Scenario: no se pierde lo capturado

- **WHEN** el envío se rechaza por un error de validación
- **THEN** el formulario se vuelve a mostrar con todos los valores que el dueño había escrito (incluidas categoría, colonia y opcionales), salvo el checkbox de consentimiento y la foto, que deben volver a ponerse

#### Scenario: hay que volver a elegir la foto

- **WHEN** el dueño envía el formulario con una foto y el envío se rechaza porque otro campo tiene error
- **THEN** ve "Tu foto no se quedó guardada: vuelve a elegirla antes de enviar." junto al campo de foto, el campo aparece vacío y en el servidor no quedó guardado ningún archivo de ese envío

### Requirement: El registro funciona sin JavaScript de cliente

El envío del formulario y toda su validación DEBEN funcionar aunque el JavaScript de cliente no cargue: el único comportamiento que se pierde sin JS es el ejemplo dinámico de "¿Qué ofreces?" (que cae en el ejemplo genérico) y el indicador "Enviando...". Esto mantiene el presupuesto de rendimiento del PRD §8 en 4G. La foto viaja en ese mismo envío del formulario: NO DEBE haber vista previa, recorte ni compresión en el cliente, ni ningún JavaScript nuevo asociado al campo de foto.

#### Scenario: envío sin JS

- **WHEN** el dueño envía el formulario, con o sin foto, con el JavaScript de cliente deshabilitado o aún sin cargar
- **THEN** el registro se procesa igual en el servidor y ve la pantalla de gracias o los errores por campo, según corresponda

#### Scenario: JS acotado al campo del ejemplo

- **WHEN** se revisa el JavaScript de cliente que carga la página de registro
- **THEN** corresponde solo al ejemplo dinámico por categoría y al estado de envío del botón, no al campo de foto ni al resto de la página

## ADDED Requirements

### Requirement: El campo de foto explica la política del PRD §6.1 y abre la galería del celular

El formulario DEBE ofrecer un campo de foto opcional, de una sola imagen, que en el celular abra la galería (campo de archivo que declara que acepta imágenes). Junto al campo DEBE aparecer, como texto de ayuda visible antes de elegir el archivo, la política de foto del PRD §6.1 en español llano, con el texto literal: "Una foto de tu local, de tus productos o de tu trabajo. Que no salgan personas que se puedan reconocer. Máximo 5 MB (JPG, PNG o WebP); nosotros la comprimimos para que cargue rápido." El campo DEBE tener etiqueta asociada y un área tocable de al menos 44px.

El formulario DEBE incluir además una casilla con el texto literal "Dejar mi ficha sin foto", visible siempre y con el mismo texto para cualquiera que abra el formulario: en un registro nuevo no cambia nada, y en un reenvío tras rechazo es lo que permite quitar la foto que ya había (ver el requirement del reenvío). El formulario NO DEBE revelar, ni con ese texto ni con ninguna otra pista, si el número que se está capturando ya tenía ficha.

#### Scenario: elegir una foto desde el celular

- **WHEN** el dueño toca el campo "Foto de tu negocio (opcional)" en su celular
- **THEN** se abre el selector de imágenes de su galería, puede elegir una sola foto y ve arriba del campo la política "Una foto de tu local, de tus productos o de tu trabajo. Que no salgan personas que se puedan reconocer. Máximo 5 MB (JPG, PNG o WebP); nosotros la comprimimos para que cargue rápido."

#### Scenario: registrarse sin foto

- **WHEN** el dueño envía el formulario sin elegir ninguna foto
- **THEN** el registro se guarda igual, sin foto y sin ningún mensaje de error por ese campo

#### Scenario: la casilla de quitar foto es igual para todos

- **WHEN** dos personas distintas abren el formulario, una con un número sin ficha y otra con un número cuya ficha fue rechazada
- **THEN** las dos ven exactamente el mismo campo de foto y la misma casilla "Dejar mi ficha sin foto", sin ninguna diferencia que delate que una de las dos ya tenía ficha

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

> **Enmienda aprobada por el orquestador (iteración 2, hallazgo A-1 de `reports/c-seguridad.md`).** La auditoría midió que una imagen *válida* de 39.4 megapíxeles pesa 123 KB y cuesta decenas de MB de memoria al abrirse: un envío que pasa todas las defensas previas —porque está bien formado— puede tumbar el servidor por acumulación. El tope de 5 MB acota los bytes que llegan, no el trabajo que provocan.

El sistema DEBE limitar cuántas fotos **abre** a la vez, con un tope fijo y pequeño, independiente de cuántas peticiones lleguen. Un envío que llega cuando el tope está ocupado NO DEBE quedarse esperando turno ni encolarse: DEBE rechazarse de inmediato, junto al campo de foto, con el texto literal "Estamos recibiendo muchas fotos, intenta de nuevo en un momento", conservando todo lo que el dueño había capturado y sin dejar ni ficha ni archivos. Preferimos pedirle a una persona que reintente en un minuto antes que dejar el directorio caído para todo el pueblo.

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
