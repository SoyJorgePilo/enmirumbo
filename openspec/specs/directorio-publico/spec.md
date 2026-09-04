# Spec: directorio-publico

## Requirements

### Requirement: La home muestra las 8 categorías como botones grandes

La ruta raíz (`/`) DEBE mostrar las 8 categorías del catálogo (PRD §6.1) como botones grandes, en el orden del catálogo, cada uno con el nombre de la categoría tal como está en la base y enlazado a su listado. La sección DEBE encabezarse con el texto literal "Busca por categoría". Los botones DEBEN medir al menos 44px en su dimensión menor y verse completos en un viewport de 390px. Mientras el buscador (E2-4) no exista, la home NO DEBE mostrar ningún campo de búsqueda ni ningún otro control sin destino.

#### Scenario: las ocho categorías visibles

- **WHEN** un vecino abre la home en su celular
- **THEN** ve, bajo el encabezado "Busca por categoría", ocho botones grandes con los nombres de las categorías del catálogo ("Restaurantes y fondas", "Servicios del hogar", "Belleza", "Salud", "Abarrotes y comercio", "Talleres", "Clubes y escuelas deportivas" y "Otro")

#### Scenario: tocar una categoría lleva a su listado

- **WHEN** el vecino toca el botón "Servicios del hogar"
- **THEN** llega al listado de esa categoría en la ruta `/servicios-del-hogar`

#### Scenario: sin controles muertos en la home

- **WHEN** se revisa la home mientras el buscador no está implementado
- **THEN** no aparece ningún campo de búsqueda, ni filtro, ni botón que no lleve a una página existente

### Requirement: Bloque "Deporte en Tizayuca" destacado en la home

La home DEBE incluir un bloque propio titulado literalmente "Deporte en Tizayuca" (PRD §6.5), presentado al mismo nivel visual que el bloque de categorías comerciales —mismo peso de encabezado y misma jerarquía, ni más chico ni escondido abajo— con una frase de acompañamiento y una entrada al listado de la categoría "Clubes y escuelas deportivas". Que esa categoría aparezca también entre los 8 botones es intencional: el bloque no la reemplaza, la destaca.

#### Scenario: el bloque de deporte se ve al mismo nivel que las categorías

- **WHEN** una mamá que busca actividades para sus hijos abre la home en su celular
- **THEN** ve el bloque "Deporte en Tizayuca" con el mismo peso visual que el bloque de categorías, con la frase "Escuelas, clubes y entrenadores para que los niños (y los grandes) se muevan." y una entrada con el texto "Ver clubes y escuelas deportivas"

#### Scenario: el bloque lleva al listado de deporte

- **WHEN** la mamá toca "Ver clubes y escuelas deportivas"
- **THEN** llega al listado `/clubes-y-escuelas-deportivas`, el mismo al que llega desde el botón de esa categoría

### Requirement: Listado por categoría en URL limpia con el slug del catálogo

Cada categoría DEBE tener un listado público en la raíz del sitio, con la URL formada por el slug del catálogo (por ejemplo `/servicios-del-hogar`). La página DEBE encabezarse con el nombre de la categoría seguido de "en Tizayuca" (por ejemplo "Servicios del hogar en Tizayuca") como único `h1`, y listar los negocios publicados de esa categoría. El orden DEBE ser determinista: primero los publicados más recientemente y, a igualdad, por nombre. Un slug que no corresponde a ninguna categoría del catálogo DEBE responder 404, sin sugerir categorías parecidas. Ningún slug del catálogo DEBE poder tapar una ruta propia del sitio.

#### Scenario: listado de una categoría con negocios

- **WHEN** el vecino abre `/servicios-del-hogar` y hay negocios publicados en esa categoría
- **THEN** ve el encabezado "Servicios del hogar en Tizayuca" y una tarjeta por cada negocio publicado de esa categoría

#### Scenario: categoría inexistente

- **WHEN** alguien abre `/plomeros-baratos`, que no es un slug del catálogo
- **THEN** ve la página 404 en español del sitio y la respuesta tiene código 404

#### Scenario: categoría sin negocios publicados todavía

- **WHEN** el vecino abre el listado de una categoría que aún no tiene ningún negocio publicado
- **THEN** ve el mensaje "Todavía no hay negocios publicados en esta categoría." y la invitación "Registra tu negocio gratis", en lugar de una página vacía

#### Scenario: la ruta dinámica no tapa las rutas propias del sitio

- **WHEN** el vecino abre `/registro` o la ficha de un negocio
- **THEN** llega a esas páginas y no al listado de una categoría; y ningún slug del catálogo coincide con un segmento reservado del sitio

### Requirement: Solo se muestra lo que está publicado

El directorio público DEBE mostrar únicamente negocios en estado `publicado`. Los negocios en `en_revision` o `rechazado` NO DEBEN aparecer en ningún listado, ni en ningún conteo, ni en el filtro de colonias, y su ficha DEBE responder 404 con la misma página y el mismo código que un negocio inexistente, para no delatar que existe una ficha en revisión (PRD §6.3 y §8).

#### Scenario: un negocio en revisión no aparece en el listado

- **WHEN** un negocio de la categoría "Belleza" está en estado `en_revision` y el vecino abre `/belleza`
- **THEN** ese negocio no aparece en el listado ni ninguno de sus datos está en el HTML de la página

#### Scenario: un negocio rechazado no aparece en el listado

- **WHEN** un negocio está en estado `rechazado` y el vecino abre el listado de su categoría
- **THEN** ese negocio no aparece ni ninguno de sus datos está en el HTML de la página

#### Scenario: ficha de un negocio no publicado

- **WHEN** alguien abre la URL de la ficha de un negocio en `en_revision` o `rechazado`
- **THEN** ve la página 404 en español, exactamente igual que si el negocio no existiera, y ningún dato del negocio aparece en la respuesta

### Requirement: Filtro por colonia en el listado, sin JavaScript de cliente

El listado por categoría DEBE ofrecer un filtro por colonia (PRD §6.2) que funcione sin JavaScript de cliente: una opción "Todas las colonias" más una opción por cada colonia que tenga al menos un negocio publicado en esa categoría, cada una enlazando al mismo listado con el filtro aplicado. La opción activa DEBE distinguirse visualmente. Un filtro que no corresponde a ninguna colonia del catálogo NO DEBE romper la página ni responder 404: se ignora y se muestra el listado completo. Un negocio publicado sin colonia del catálogo (caso "Otra" sin normalizar) DEBE aparecer en el listado sin filtro y no DEBE romper ninguna vista.

#### Scenario: filtrar por una colonia

- **WHEN** el vecino abre `/servicios-del-hogar` y toca la colonia "Haciendas de Tizayuca"
- **THEN** el listado muestra solo los negocios publicados de esa categoría en esa colonia, esa opción se ve como la activa y la URL refleja el filtro

#### Scenario: quitar el filtro

- **WHEN** el vecino, con un filtro aplicado, toca "Todas las colonias"
- **THEN** vuelve a ver todos los negocios publicados de la categoría

#### Scenario: solo colonias con negocios

- **WHEN** el vecino ve el filtro de un listado
- **THEN** solo aparecen colonias que tienen al menos un negocio publicado en esa categoría, de modo que ninguna opción lleve a un listado vacío

#### Scenario: filtro con negocios de esa categoría pero no en esa colonia

- **WHEN** el filtro deja el listado sin resultados porque los negocios de esa categoría están en otras colonias
- **THEN** el vecino ve el mensaje "No encontramos negocios de esta categoría en esa colonia." y un enlace "Ver todas las colonias" que quita el filtro

#### Scenario: colonia desconocida en la URL

- **WHEN** alguien abre el listado con un filtro de colonia que no existe en el catálogo
- **THEN** ve el listado completo de la categoría, sin error y sin 404

#### Scenario: negocio publicado con colonia "Otra" sin normalizar

- **WHEN** un negocio publicado no tiene colonia del catálogo, solo el texto libre que capturó
- **THEN** aparece en el listado sin filtro con ese texto como colonia, no aparece bajo ningún filtro de colonia del catálogo, y ninguna vista se rompe

### Requirement: La tarjeta del listado trae lo esencial y el WhatsApp sin clics extra

Cada negocio del listado DEBE presentarse en una tarjeta con: su foto o, mientras no haya foto (E1-3), un marcador de posición neutro que no prometa una imagen; el nombre del negocio; su colonia; la etiqueta "A domicilio" solo cuando el negocio registró que hace entregas o va a domicilio; y un botón verde de WhatsApp que abre directo la conversación con ese negocio, sin pasar por la ficha (PRD §6.2). El resto de la tarjeta DEBE llevar a la ficha del negocio. El botón de WhatsApp DEBE tener un área táctil de al menos 44px y una etiqueta accesible que diga a qué negocio se le escribe.

#### Scenario: contenido de la tarjeta

- **WHEN** el vecino ve el listado de una categoría
- **THEN** cada tarjeta muestra marcador de foto, nombre del negocio, su colonia y un botón verde de WhatsApp

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

### Requirement: Ficha de negocio en URL propia con la información registrada y el sello de verificado

Cada negocio publicado DEBE tener una ficha en URL propia y estable, con el nombre del negocio como único `h1`, el sello visible "Negocio verificado" (PRD §6.2) y la información que el negocio registró: qué ofrece, colonia, dirección o referencias si las capturó, horario y la etiqueta "A domicilio" cuando aplique. Los campos que el negocio no registró NO DEBEN mostrarse: nada de etiquetas vacías ni de textos como "No disponible". Una URL de ficha con un identificador inexistente DEBE responder 404. Si la parte legible de la URL ya no corresponde al nombre actual del negocio, la ficha DEBE mostrarse igual, para no romper los enlaces que la gente comparte por WhatsApp.

#### Scenario: ficha completa

- **WHEN** el vecino abre la ficha de un negocio publicado que llenó todos los campos opcionales
- **THEN** ve el nombre como encabezado, el sello "Negocio verificado", qué ofrece, su colonia, su dirección o referencias, su horario y la etiqueta "A domicilio"

#### Scenario: ficha de un negocio que solo llenó lo obligatorio

- **WHEN** el vecino abre la ficha de un negocio publicado sin campos opcionales
- **THEN** ve el nombre, el sello "Negocio verificado", su colonia y el botón de WhatsApp, sin secciones vacías ni etiquetas sin contenido

#### Scenario: ficha inexistente

- **WHEN** alguien abre una URL de ficha con un identificador que no existe
- **THEN** ve la página 404 en español y la respuesta tiene código 404

#### Scenario: enlace viejo tras un cambio de nombre

- **WHEN** alguien abre una URL de ficha cuya parte legible ya no coincide con el nombre actual del negocio, pero cuyo identificador sí existe y está publicado
- **THEN** ve la ficha del negocio, no un 404

### Requirement: Botones de contacto de la ficha con el WhatsApp como acción principal

La ficha DEBE ofrecer los botones del PRD §6.2, cada uno solo si el negocio registró el dato: "Enviar WhatsApp" (siempre presente y como única acción principal, con el verde de acción del sitio), "Llamar" solo si registró teléfono fijo, "Cómo llegar" solo si capturó dirección o referencias (abre Google Maps con esa referencia y su colonia en Tizayuca) y el enlace a la página que registró, solo si la registró. El enlace a la página registrada NO DEBE afirmar que lleva a Facebook: DEBE mostrar el dominio real al que apunta (hallazgo M4 de T-003). Ningún otro botón DEBE competir en jerarquía visual con el de WhatsApp. Los botones DEBEN mostrar la acción, no el número de teléfono como texto. El botón "Llamar" solo se genera si el teléfono fijo se normaliza a 10 dígitos nacionales; si no es normalizable, la ficha muestra el dato capturado como texto plano ("Teléfono: …") sin enlace de llamada (decisión ratificada al cerrar T-004: no se pierde lo registrado y ningún código de marcado hostil llega a un `tel:`).

#### Scenario: WhatsApp como acción principal

- **WHEN** el vecino abre cualquier ficha publicada
- **THEN** ve el botón "Enviar WhatsApp" con el verde de acción, más grande o más prominente que cualquier otro botón de la página, y al tocarlo sale hacia la conversación con ese negocio

#### Scenario: botones que dependen de lo registrado

- **WHEN** el negocio registró teléfono fijo y dirección o referencias, pero no página
- **THEN** la ficha muestra "Llamar" y "Cómo llegar" además de "Enviar WhatsApp", y no muestra ningún enlace a página externa

#### Scenario: negocio sin teléfono ni dirección

- **WHEN** el negocio no registró teléfono fijo ni dirección o referencias
- **THEN** la ficha no muestra "Llamar" ni "Cómo llegar", y el único contacto es "Enviar WhatsApp"

#### Scenario: "Cómo llegar" abre el mapa con lo que capturó el negocio

- **WHEN** el vecino toca "Cómo llegar" en la ficha de un negocio que escribió "a un lado de la primaria" y está en la colonia "Huicalco"
- **THEN** se abre Google Maps buscando esa referencia junto con la colonia y Tizayuca, en una pestaña nueva

#### Scenario: el enlace a la página registrada no promete Facebook

- **WHEN** un negocio registró como página un link que no es de Facebook (por ejemplo `https://mi-negocio.example/perfil`)
- **THEN** la ficha muestra el enlace indicando el dominio real al que lleva (`mi-negocio.example`) y en ningún lado dice que es su Facebook

### Requirement: Se publica la colonia, nunca el domicilio exacto ni los datos internos de la ficha

El directorio DEBE mostrar la colonia del negocio y NO DEBE mostrar ningún dato de ubicación que el negocio no haya capturado él mismo: lo único que puede aparecer como dirección es el texto de dirección o referencias que escribió (PRD §8). Ni el listado ni la ficha DEBEN exponer, ni en la pantalla ni en el HTML de la respuesta, los datos internos de la ficha: estado, origen, fecha de registro, constancia del consentimiento ni token de gestión.

#### Scenario: negocio sin dirección capturada

- **WHEN** el vecino abre la ficha de un negocio que solo registró su colonia
- **THEN** ve la colonia y ninguna otra referencia de ubicación

#### Scenario: negocio con referencias capturadas

- **WHEN** el vecino abre la ficha de un negocio que escribió "a un lado de la primaria, calle Morelos"
- **THEN** ve ese texto tal como lo escribió el negocio, sin agregarle ni completarle datos de domicilio

#### Scenario: sin datos internos en la respuesta

- **WHEN** se inspecciona el HTML de un listado o de una ficha
- **THEN** no aparecen el estado, el origen, la fecha de registro, la fecha de consentimiento ni el token de gestión del negocio

### Requirement: Directorio en Server Components, mobile-first y usable sin JavaScript

La home, los listados y las fichas DEBEN ser Server Components y NO DEBEN agregar JavaScript de cliente propio (PRD §8, presupuesto de <2s en 4G). Todas las páginas DEBEN verse completas en un viewport de 390px sin scroll horizontal, con áreas táctiles de al menos 44px en todo elemento tocable, y DEBEN seguir siendo navegables con el JavaScript de cliente deshabilitado, incluido el filtro por colonia.

#### Scenario: sin JS de cliente nuevo

- **WHEN** se revisan los archivos nuevos de la home, el listado, la tarjeta y la ficha
- **THEN** ninguno declara `"use client"` ni agrega un bundle de cliente propio

#### Scenario: celular a 390px

- **WHEN** un vecino abre la home, un listado y una ficha en un viewport de 390px
- **THEN** todo se ve completo y legible, sin scroll horizontal, y cada elemento tocable mide al menos 44px en su dimensión menor

#### Scenario: navegación sin JavaScript

- **WHEN** el vecino recorre home → categoría → filtro por colonia → ficha → WhatsApp con el JavaScript de cliente deshabilitado
- **THEN** el flujo completo funciona igual, porque cada paso es un enlace del servidor
