# Delta de spec: modelo-datos

## MODIFIED Requirements

### Requirement: El modelo `Negocio` cubre los campos del registro

El sistema DEBE persistir un negocio con los 5 campos obligatorios del PRD §6.1 — nombre, categoría (del catálogo), WhatsApp de 10 dígitos, colonia y constancia del consentimiento del aviso de privacidad — y DEBE admitir los opcionales: "¿Qué ofreces?" (máx. 200 caracteres), entregas a domicilio (sí/no), teléfono fijo y dirección o referencias con pin opcional (latitud/longitud), horario en texto libre, link de Facebook y foto.

La foto NO se guarda como una URL cualquiera: el negocio persiste una **referencia interna a la foto** (`fotoClave`), que es una clave opaca generada por el servidor al procesar la imagen y que solo sirve para localizar los archivos en el almacenamiento de fotos (ADR-006). Esa referencia DEBE ser nula cuando el negocio no tiene foto, DEBE ser única entre negocios, y NO DEBE contener nunca una dirección externa, un `data:`, un esquema de URL ni una ruta del sistema de archivos: quien lee este campo tiene que poder asumir que lo escribió el servidor. Los bytes de la imagen NO viven en la base de datos ni en el repositorio.

#### Scenario: alta mínima con solo obligatorios

- **WHEN** se crea un negocio con nombre, categoría, WhatsApp, colonia y constancia de consentimiento
- **THEN** el negocio queda guardado, todos los campos opcionales quedan vacíos y su referencia de foto queda nula

#### Scenario: alta completa con opcionales

- **WHEN** se crea un negocio incluyendo los campos opcionales (con pin de mapa y con foto)
- **THEN** todos los valores quedan persistidos y recuperables tal como se guardaron, incluidas las coordenadas del pin y la referencia interna de la foto

#### Scenario: la referencia de la foto no es una URL

- **WHEN** se revisa el valor guardado en la referencia de foto de un negocio que subió una imagen
- **THEN** es la clave opaca que generó el servidor, sin esquema de URL, sin dominio y sin ruta del sistema de archivos, y no coincide con el identificador del negocio ni con su nombre

#### Scenario: dos negocios no comparten la misma foto

- **WHEN** se intenta guardar en dos negocios la misma referencia de foto
- **THEN** la base de datos rechaza la operación

### Requirement: Borrado definitivo de un negocio (operación ARCO)

El sistema DEBE permitir eliminar definitivamente un negocio (hard delete real, no despublicar), borrando su fila, sus vínculos con giros y **los archivos de su foto en el almacenamiento**, sin dejar datos ni imágenes recuperables por ninguna consulta ni por ninguna dirección del sitio (PRD §8). El borrado de los archivos DEBE incluir todas las variantes generadas. Si el archivo ya no estaba (por ejemplo, porque se borró antes), el borrado del negocio DEBE completarse igual y no DEBE fallar.

#### Scenario: hard delete

- **WHEN** se elimina definitivamente un negocio que tenía giros vinculados y foto
- **THEN** desaparecen su fila, todos sus vínculos con giros y todas las variantes de su foto; ninguna consulta posterior devuelve sus datos y la dirección que servía su foto responde como si nunca hubiera existido

#### Scenario: borrado con el archivo ya ausente

- **WHEN** se elimina definitivamente un negocio cuya foto ya no está en el almacenamiento
- **THEN** el negocio se borra igual, sin error

## ADDED Requirements

### Requirement: El seed de demostración deja fichas con foto para ver el directorio como lo verá el vecino

El seed de negocios ficticios DEBE dejar al menos un negocio publicado **con foto** y al menos uno publicado **sin foto**, para poder ver en desarrollo tanto la tarjeta con imagen real como el marcador de posición. Las imágenes las DEBE generar el propio seed al ejecutarse (rectángulos de color con el nombre ficticio, por ejemplo): NO DEBEN agregarse archivos de imagen al repositorio, ni usarse fotos de negocios reales ni de personas (repo público + LFPDPPP, PRD §8). El seed DEBE seguir siendo idempotente también en esto: correrlo dos veces no deja archivos duplicados ni huérfanos.

#### Scenario: sembrar con fotos

- **WHEN** se corre el seed de demostración sobre una base con los catálogos poblados
- **THEN** al menos un negocio publicado queda con su referencia de foto y sus archivos generados, y al menos uno publicado queda sin foto

#### Scenario: nada de imágenes en el repositorio

- **WHEN** se revisa el repositorio después de correr el seed
- **THEN** no hay ningún archivo de imagen versionado y los archivos generados quedan en el almacenamiento local, fuera del control de versiones

#### Scenario: seed de demostración idempotente con fotos

- **WHEN** se corre el seed de demostración dos veces seguidas
- **THEN** los negocios sembrados conservan una sola foto cada uno y no quedan archivos sueltos de la corrida anterior
