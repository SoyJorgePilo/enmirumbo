# Delta de spec: directorio-publico

## MODIFIED Requirements

### Requirement: La tarjeta del listado trae lo esencial y el WhatsApp sin clics extra

Cada negocio del listado DEBE presentarse en una tarjeta con: **su foto cuando la tiene** y, cuando no, un marcador de posición neutro que no prometa una imagen; el nombre del negocio; su colonia; la etiqueta "A domicilio" solo cuando el negocio registró que hace entregas o va a domicilio; y un botón verde de WhatsApp que abre directo la conversación con ese negocio, sin pasar por la ficha (PRD §6.2). El resto de la tarjeta DEBE llevar a la ficha del negocio. El botón de WhatsApp DEBE tener un área táctil de al menos 44px y una etiqueta accesible que diga a qué negocio se le escribe. La foto DEBE llevar un texto alternativo que nombre al negocio ("Foto de <nombre del negocio>"), mientras que el marcador de posición sigue siendo decorativo y no se anuncia. Con foto o sin ella, la tarjeta DEBE ocupar el mismo espacio y no DEBE saltar cuando la imagen termina de cargar.

#### Scenario: contenido de la tarjeta

- **WHEN** el vecino ve el listado de una categoría donde hay un negocio con foto y otro sin ella
- **THEN** la tarjeta del primero muestra su foto y la del segundo el marcador de posición, y las dos muestran nombre del negocio, colonia y el botón verde de WhatsApp

#### Scenario: la foto se anuncia con el nombre del negocio

- **WHEN** alguien recorre el listado con lector de pantalla
- **THEN** la foto de "Tacos del Güero" se anuncia como "Foto de Tacos del Güero" y el marcador de posición de un negocio sin foto no se anuncia

#### Scenario: la maquetación no salta

- **WHEN** el listado se abre en una red lenta y las fotos todavía no terminan de cargar
- **THEN** cada tarjeta ya ocupa el mismo espacio que ocupará con la foto puesta, y nada se mueve de lugar cuando las imágenes aparecen

#### Scenario: etiqueta "A domicilio" solo cuando aplica

- **WHEN** en el listado hay un negocio que registró que hace entregas o va a domicilio y otro que no
- **THEN** solo la tarjeta del primero muestra la etiqueta "A domicilio"

#### Scenario: WhatsApp directo desde la tarjeta

- **WHEN** el vecino toca el botón de WhatsApp de una tarjeta
- **THEN** sale del sitio hacia la conversación de WhatsApp con ese negocio, en un solo toque y sin haber entrado a la ficha

#### Scenario: la tarjeta lleva a la ficha

- **WHEN** el vecino toca la tarjeta fuera del botón de WhatsApp
- **THEN** llega a la ficha de ese negocio

#### Scenario: etiqueta accesible del botón

- **WHEN** alguien recorre el listado con lector de pantalla
- **THEN** cada botón de WhatsApp se anuncia indicando el negocio al que le escribe, no solo como "WhatsApp"

## ADDED Requirements

### Requirement: La ficha muestra la foto del negocio cuando la tiene

La ficha de un negocio publicado DEBE mostrar su foto, en un tamaño mayor que el de la tarjeta, arriba o junto a la información del negocio (PRD §6.2), con el texto alternativo "Foto de <nombre del negocio>". Si el negocio no registró foto, la ficha NO DEBE mostrar ningún hueco, marco vacío ni texto que anuncie una imagen inexistente: simplemente no hay foto, igual que con el resto de los campos opcionales.

#### Scenario: ficha con foto

- **WHEN** el vecino abre la ficha de un negocio publicado que subió foto
- **THEN** ve la foto del negocio, más grande que en la tarjeta del listado, anunciada como "Foto de <nombre del negocio>"

#### Scenario: ficha sin foto

- **WHEN** el vecino abre la ficha de un negocio publicado que no subió foto
- **THEN** ve su información sin ningún hueco de imagen, sin marco vacío y sin texto que hable de una foto

### Requirement: Solo se pinta la foto que generó el servidor

El directorio DEBE construir la dirección de cada imagen a partir de la referencia interna que generó el servidor al procesar la foto, y NO DEBE usar nunca como origen de una imagen un valor que pueda venir de fuera: si la referencia guardada en una ficha no es una de las que el servidor genera —una URL externa, un `data:`, un `javascript:`, una ruta con `..` o cualquier cadena arbitraria—, la vista DEBE comportarse como si el negocio no tuviera foto y mostrar el marcador de posición, sin intentar cargar nada (hallazgo M1 de T-004). Esta regla aplica igual en el listado por categoría, en la página de resultados de búsqueda y en la ficha.

#### Scenario: referencia externa guardada a mano

- **WHEN** una ficha publicada tiene guardada como foto `https://evil.example/pixel.png`
- **THEN** su tarjeta y su ficha muestran el marcador de posición, y en el HTML de la respuesta no aparece ese dominio ni ninguna petición hacia él

#### Scenario: `data:` o `javascript:` en la referencia

- **WHEN** una ficha publicada tiene guardada como foto `data:image/svg+xml,<svg onload=alert(1)>` o `javascript:alert(1)`
- **THEN** no se pinta ninguna imagen: se muestra el marcador de posición y ese contenido no aparece en el HTML servido

#### Scenario: intento de salirse del almacenamiento

- **WHEN** una ficha publicada tiene guardada como foto una referencia con `../` o con una ruta absoluta del sistema de archivos
- **THEN** se muestra el marcador de posición y ningún archivo fuera del almacenamiento de fotos se sirve

### Requirement: La foto de un negocio no publicado no es accesible públicamente

La dirección que sirve una foto DEBE comprobar, en cada petición, que el negocio dueño de esa foto está en estado `publicado`. La foto de un negocio en `en_revision` o `rechazado`, la de un negocio que ya no existe y la de una referencia inventada DEBEN responder 404, con la misma respuesta en los cuatro casos, para no delatar que ese archivo existe (PRD §6.3 y §8). Una foto que dejó de estar publicada NO DEBE quedar disponible por haberse guardado antes en una caché pública.

#### Scenario: foto de un registro en revisión

- **WHEN** alguien pide directamente la dirección de la foto de un negocio que está en `en_revision`
- **THEN** recibe 404 y ni un byte de la imagen

#### Scenario: foto de un registro rechazado

- **WHEN** alguien pide la dirección de la foto de un negocio `rechazado`
- **THEN** recibe 404, igual que si el archivo no existiera

#### Scenario: referencia inventada

- **WHEN** alguien prueba direcciones de foto al azar o construidas a partir del identificador de un negocio
- **THEN** todas responden 404 y ninguna respuesta permite distinguir "no existe" de "existe pero no está publicado"

#### Scenario: la foto de una ficha publicada sí se sirve

- **WHEN** el vecino abre el listado o la ficha de un negocio publicado con foto
- **THEN** las imágenes cargan normalmente

### Requirement: El peso de las fotos no rompe el presupuesto de 4G

Las fotos servidas DEBEN caber en el presupuesto de rendimiento del PRD §8 (página en menos de 2 segundos en 4G, "imágenes comprimidas"): la variante que se usa en la tarjeta DEBE tener a lo más 400px de lado mayor y pesar a lo más 60 KB, y la de la ficha a lo más 1200px de lado mayor y pesar a lo más 250 KB. Si con la calidad de compresión elegida una foto se pasa de esos topes, el servidor DEBE bajar la calidad hasta cumplirlos. En un listado, solo la primera fila de tarjetas DEBE cargar su foto de inmediato; las de abajo DEBEN cargarse de forma diferida, y ninguna página DEBE pedir la variante de ficha para pintar una tarjeta.

#### Scenario: peso de las variantes

- **WHEN** se procesa cualquier foto aceptada de hasta 5 MB
- **THEN** la variante de tarjeta que se sirve pesa 60 KB o menos y la de ficha 250 KB o menos

#### Scenario: el listado no descarga lo que no se ve

- **WHEN** el vecino abre en su celular un listado con doce negocios con foto
- **THEN** al cargar la página solo se piden las fotos de las tarjetas visibles al inicio, y las demás se piden conforme baja

#### Scenario: la tarjeta no usa la foto grande

- **WHEN** se revisan las imágenes que pide un listado o una página de resultados
- **THEN** todas corresponden a la variante de tarjeta, ninguna a la de ficha
