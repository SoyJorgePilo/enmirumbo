# Spec: directorio-publico

## Requirements

### Requirement: La home muestra las 8 categorías como botones grandes

La ruta raíz (`/`) DEBE mostrar las 8 categorías del catálogo (PRD §6.1) como botones grandes, en el orden del catálogo, cada uno con el nombre de la categoría tal como está en la base y enlazado a su listado. La sección DEBE encabezarse con el texto literal "Busca por categoría". Los botones DEBEN medir al menos 44px en su dimensión menor y verse completos en un viewport de 390px. Las categorías DEBEN quedar debajo del buscador (PRD §6.2: "buscador + categorías como botones grandes"), sin que ninguno de los dos pierda protagonismo: son las dos entradas del Flujo B y ambas se ven sin hacer scroll en un celular de 390px. Ningún control de la home DEBE quedar sin destino.

#### Scenario: las ocho categorías visibles

- **WHEN** un vecino abre la home en su celular
- **THEN** ve, bajo el encabezado "Busca por categoría", ocho botones grandes con los nombres de las categorías del catálogo ("Restaurantes y fondas", "Servicios del hogar", "Belleza", "Salud", "Abarrotes y comercio", "Talleres", "Clubes y escuelas deportivas" y "Otro")

#### Scenario: tocar una categoría lleva a su listado

- **WHEN** el vecino toca el botón "Servicios del hogar"
- **THEN** llega al listado de esa categoría en la ruta `/servicios-del-hogar`

#### Scenario: el buscador va antes que las categorías

- **WHEN** el vecino abre la home en un viewport de 390px
- **THEN** el campo de búsqueda aparece arriba del encabezado "Busca por categoría", y tanto el campo como los ocho botones se ven completos, sin scroll horizontal

#### Scenario: sin controles muertos en la home

- **WHEN** se revisa la home
- **THEN** todo control lleva a una página que existe: los botones de categoría a su listado, el buscador a la página de resultados y la entrada de registro al formulario; no hay filtros ni botones sin destino

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

### Requirement: Buscador en la home que funciona sin JavaScript de cliente

La home DEBE mostrar, arriba de las categorías, un buscador que sea un formulario de envío por GET hacia la página de resultados, de modo que funcione sin JavaScript de cliente. El campo DEBE tener una etiqueta visible asociada con el texto literal "Busca lo que necesitas", un ejemplo dentro del campo con el texto literal "ej. plomero, tacos, futbol infantil" y un botón de envío con el texto literal "Buscar". El campo y el botón DEBEN medir al menos 44px en su dimensión menor. El buscador NO DEBE agregar un encabezado propio: la home conserva un solo `h1` y sus encabezados de segundo nivel siguen siendo los de categorías, deporte y registro.

#### Scenario: buscar desde la home

- **WHEN** el vecino escribe "plomero" en el buscador de la home y toca "Buscar"
- **THEN** llega a la página de resultados de esa búsqueda, con la palabra que escribió reflejada en la URL

#### Scenario: el buscador funciona sin JavaScript

- **WHEN** el vecino busca con el JavaScript de cliente deshabilitado
- **THEN** el envío se resuelve igual, porque el buscador es un formulario GET del servidor y no un control con comportamiento de cliente

#### Scenario: campo etiquetado y tocable

- **WHEN** alguien recorre la home con lector de pantalla o la usa en un celular
- **THEN** el campo de búsqueda se anuncia con su etiqueta visible "Busca lo que necesitas", muestra el ejemplo "ej. plomero, tacos, futbol infantil" y tanto el campo como el botón "Buscar" tienen al menos 44px de área táctil

#### Scenario: la jerarquía de la home no cambia

- **WHEN** se inspecciona el HTML de la home con el buscador puesto
- **THEN** sigue habiendo exactamente un `h1` y los encabezados de segundo nivel siguen siendo los de categorías, deporte y registro, sin saltos de jerarquía

### Requirement: Página de resultados con las mismas tarjetas del listado

La búsqueda DEBE resolverse en una página propia con la consulta en la URL, encabezada con el texto literal `Resultados para "<lo que escribió el vecino>"` como único `h1`, mostrando cada negocio encontrado con la misma tarjeta del listado por categoría (foto o marcador, nombre, colonia, etiqueta "A domicilio" cuando aplique y botón verde de WhatsApp que abre directo la conversación). El orden DEBE ser el mismo del listado: primero los publicados más recientemente y, a igualdad, por nombre. La página DEBE repetir arriba el buscador con lo que el vecino escribió ya puesto en el campo, para poder corregir sin regresar. El texto que se muestra de la consulta DEBE recortarse si es larguísimo, y DEBE mostrarse como texto, nunca interpretarse como marcado.

#### Scenario: resultados de una búsqueda

- **WHEN** el vecino busca "plomero" y hay negocios publicados que coinciden
- **THEN** ve el encabezado `Resultados para "plomero"` y una tarjeta por cada negocio encontrado, con el mismo aspecto y el mismo botón de WhatsApp que en el listado por categoría

#### Scenario: corregir la búsqueda sin regresar

- **WHEN** el vecino llega a los resultados y quiere buscar otra cosa
- **THEN** ve arriba el mismo buscador con "plomero" ya escrito en el campo, lo cambia y vuelve a buscar sin salir de la página

#### Scenario: orden determinista

- **WHEN** varios negocios publicados coinciden con la búsqueda
- **THEN** aparecen primero los publicados más recientemente y, entre los publicados el mismo día, por nombre; el orden es el mismo cada vez que se repite la búsqueda

#### Scenario: la consulta se muestra como texto

- **WHEN** alguien busca algo que parece marcado, por ejemplo `<b>plomero</b>`
- **THEN** la página lo muestra como texto plano en el encabezado y no interpreta ninguna etiqueta

### Requirement: Sin resultados, la página ofrece las categorías como alternativa

Cuando la búsqueda no encuentra ningún negocio publicado, la página NO DEBE quedarse vacía: DEBE decirlo con el texto literal `No encontramos negocios para "<lo que escribió el vecino>".`, invitar a intentar de otro modo con el texto literal "Prueba con otra palabra o elige una categoría:" y ofrecer las 8 categorías del catálogo como botones grandes que llevan a su listado, iguales a los de la home.

#### Scenario: búsqueda sin coincidencias

- **WHEN** el vecino busca "veterinario espacial" y ningún negocio publicado coincide
- **THEN** ve `No encontramos negocios para "veterinario espacial".`, la frase "Prueba con otra palabra o elige una categoría:" y los ocho botones de categoría que llevan a sus listados

#### Scenario: la búsqueda vacía de resultados no es un error

- **WHEN** una búsqueda no encuentra nada
- **THEN** la respuesta es una página normal (no un 404 ni un error) y conserva el buscador arriba con lo que el vecino escribió

### Requirement: La búsqueda cubre nombre, palabras clave y giros, y solo lo publicado

La búsqueda DEBE encontrar negocios por el nombre del negocio, por las palabras clave que el negocio escribió en "¿Qué ofreces?" y por los giros que el admin le asignó (PRD §6.2 y Apéndice B), de modo que quien escriba "plomero" encuentre al negocio aunque su categoría sea "Servicios del hogar". Un término puede coincidir en cualquiera de esos tres lugares. La búsqueda DEBE devolver únicamente negocios en estado `publicado`: los que están en `en_revision` o `rechazado` NO DEBEN aparecer en los resultados ni filtrarse ninguno de sus datos al HTML de la página, exactamente igual que en los listados.

#### Scenario: encuentra por palabras clave aunque la categoría sea otra

- **WHEN** el vecino busca "plomero" y hay un negocio publicado en la categoría "Servicios del hogar" que escribió "plomería, destape de drenajes" en "¿Qué ofreces?"
- **THEN** ese negocio aparece en los resultados

#### Scenario: encuentra por nombre del negocio

- **WHEN** el vecino busca por una palabra del nombre de un negocio publicado
- **THEN** ese negocio aparece en los resultados aunque esa palabra no esté en "¿Qué ofreces?" ni en sus giros

#### Scenario: encuentra por giro asignado por el admin

- **WHEN** el admin le asignó a un negocio publicado el giro "Comida corrida" y el vecino busca "comida", aunque esa palabra no esté ni en el nombre ni en "¿Qué ofreces?" del negocio
- **THEN** ese negocio aparece en los resultados

#### Scenario: los negocios no publicados nunca aparecen

- **WHEN** el vecino busca un término que coincide con un negocio en `en_revision` y con otro `rechazado`
- **THEN** ninguno de los dos aparece en los resultados y ningún dato suyo está en el HTML de la página

#### Scenario: negocio publicado sin giros

- **WHEN** un negocio publicado todavía no tiene giros asignados (el admin aún no lo revisó en el panel)
- **THEN** se sigue encontrando por su nombre y por sus palabras clave, sin error

### Requirement: Coincidencia insensible a mayúsculas y acentos, y parcial por raíz de la palabra

La búsqueda DEBE ignorar mayúsculas, acentos y signos, tanto en lo que escribe el vecino como en lo que guardó el negocio, y DEBE coincidir parcialmente por la raíz de cada palabra, de modo que "plomero" encuentre al de "plomería" y al de "plomeria", y "futbol" al club que escribió "fútbol" (PRD §6.2). Cuando el vecino escribe varias palabras con contenido, DEBEN encontrarse solo los negocios que coinciden con todas, sin importar en cuál de los tres lugares (nombre, palabras clave o giros) aparece cada una. La búsqueda NO DEBE hacer ranking de relevancia, sinónimos ni corrección de errores de dedo.

Antes de aplicar el tope de términos que se buscan y antes de exigirlos todos, la búsqueda DEBE descartar las **muletillas**: una lista corta y fija de palabras con las que el vecino enuncia su pregunta pero que no describen al negocio que busca —artículos, preposiciones y conjunciones ("el", "la", "de", "en", "con", "que"…), pronombres y adverbios de pregunta ("quien", "me", "mi", "donde", "cerca", "hay"…), los verbos genéricos de "¿quién hace X?" ("necesito", "busco", "arregla", "repara", "vende"…) y "tizayuca", que no discrimina a ningún negocio porque el sitio entero es de Tizayuca—. El descarte tiene que ocurrir antes del tope de términos para que la palabra útil no se quede fuera de la cuota cuando el vecino escribe con prisa ("quien me arregla la cerrajería"). Quitar una muletilla solo puede AMPLIAR los resultados, nunca reducirlos, porque deja de exigirse una condición. Si la consulta es de puras muletillas, DEBEN buscarse tal cual, para que el vecino vea que no se encontró nada en vez del aviso de consulta vacía.

#### Scenario: mayúsculas y acentos dan igual

- **WHEN** el vecino busca "PLOMERÍA", "plomeria" o "Plomería"
- **THEN** los tres devuelven los mismos negocios

#### Scenario: "plomero" encuentra a "plomería"

- **WHEN** el vecino busca "plomero" y hay un negocio publicado que escribió "plomería" y otro que escribió "plomeria"
- **THEN** los dos aparecen en los resultados

#### Scenario: "futbol" encuentra al club de "fútbol"

- **WHEN** una mamá busca "futbol" y hay un club publicado que escribió "fútbol infantil de 6 a 12 años"
- **THEN** ese club aparece en los resultados

#### Scenario: varias palabras se exigen todas

- **WHEN** el vecino busca "futbol infantil" y un negocio coincide con las dos palabras mientras otro solo coincide con "futbol"
- **THEN** solo aparece el que coincide con las dos

#### Scenario: la "ñ" no rompe la búsqueda

- **WHEN** el vecino busca "pinatas" y hay un negocio publicado que escribió "piñatas"
- **THEN** ese negocio aparece en los resultados

#### Scenario: las muletillas no reducen los resultados

- **WHEN** el vecino busca "cerrajeria en Tizayuca" o "quien me arregla la cerrajeria"
- **THEN** ve los mismos negocios que buscando solo "cerrajeria", porque "en", "tizayuca", "quien", "me", "arregla" y "la" se descartan antes de exigir los términos

#### Scenario: consulta de puras muletillas

- **WHEN** el vecino busca solo "quien me" o "necesito uno"
- **THEN** la página busca esos términos tal cual y muestra el aviso de que no se encontraron negocios, no el aviso de consulta vacía

### Requirement: Consulta vacía y términos hostiles acotados, sin error

Una consulta vacía, ausente o de puros espacios NO DEBE buscar nada ni listar todo el directorio: la página DEBE mostrarse con el encabezado literal "¿Qué estás buscando?" como único `h1`, el aviso literal "Escribe qué necesitas y te decimos quién lo hace en Tizayuca.", el buscador vacío y las 8 categorías como alternativa. La consulta DEBE acotarse antes de tocar la base: se recorta su longitud, se limita el número de términos que se buscan y se descarta todo lo que no sea letra o dígito (incluidos los comodines de búsqueda y los caracteres de otros alfabetos), de modo que ninguna consulta —por larga, rara o maliciosa que sea— produzca un error del servidor ni devuelva resultados que no le tocan.

#### Scenario: consulta vacía o de puros espacios

- **WHEN** alguien abre la página de resultados sin consulta, con la consulta vacía o escribiendo solo espacios
- **THEN** ve "¿Qué estás buscando?", el aviso "Escribe qué necesitas y te decimos quién lo hace en Tizayuca.", el buscador vacío y las categorías, sin ningún negocio listado y sin error

#### Scenario: consulta larguísima

- **WHEN** alguien busca una cadena de miles de caracteres
- **THEN** la página responde normal (con resultados o sin ellos), sin error del servidor, y el encabezado no repite la cadena completa

#### Scenario: caracteres que en una búsqueda serían comodines

- **WHEN** alguien busca `%` o `_`
- **THEN** no se devuelve el directorio completo: la consulta se trata como vacía y se muestra el aviso de que escriba qué necesita

#### Scenario: alfabetos y símbolos raros

- **WHEN** alguien busca solo emojis o caracteres de otro alfabeto
- **THEN** la página responde sin error y, al no quedar ningún término buscable, muestra el aviso de consulta vacía

#### Scenario: consulta repetida en la URL

- **WHEN** la URL trae el parámetro de búsqueda más de una vez
- **THEN** se usa el primer valor y la página responde con normalidad

### Requirement: La página de resultados no es indexable

La página de resultados DEBE declarar `noindex` en su metadata de robots (permitiendo seguir sus enlaces), porque las URLs con consulta no son las páginas SEO del PRD §8 —esas son las de giro y giro+colonia de E5— y no deben competir con ellas ni generar contenido duplicado.

#### Scenario: metadata de la página de resultados

- **WHEN** un buscador rastrea la página de resultados de cualquier consulta
- **THEN** encuentra la instrucción de no indexarla, y sí puede seguir los enlaces a las fichas de los negocios

#### Scenario: las páginas del directorio siguen indexables

- **WHEN** se revisan la home, un listado por categoría y una ficha
- **THEN** ninguna quedó marcada como no indexable

### Requirement: Directorio en Server Components, mobile-first y usable sin JavaScript

La home, los listados, las fichas, el buscador y la página de resultados DEBEN ser Server Components y NO DEBEN agregar JavaScript de cliente propio (PRD §8, presupuesto de <2s en 4G). Todas las páginas DEBEN verse completas en un viewport de 390px sin scroll horizontal, con áreas táctiles de al menos 44px en todo elemento tocable, y DEBEN seguir siendo navegables con el JavaScript de cliente deshabilitado, incluidos el filtro por colonia y la búsqueda.

#### Scenario: sin JS de cliente nuevo

- **WHEN** se revisan los archivos nuevos de la home, el listado, la tarjeta, la ficha, el buscador y la página de resultados
- **THEN** ninguno declara `"use client"` ni agrega un bundle de cliente propio

#### Scenario: celular a 390px

- **WHEN** un vecino abre la home, un listado, una ficha y una página de resultados en un viewport de 390px
- **THEN** todo se ve completo y legible, sin scroll horizontal, y cada elemento tocable mide al menos 44px en su dimensión menor

#### Scenario: navegación sin JavaScript

- **WHEN** el vecino recorre home → buscar → resultados → ficha → WhatsApp, y home → categoría → filtro por colonia → ficha → WhatsApp, con el JavaScript de cliente deshabilitado
- **THEN** los dos flujos completos funcionan igual, porque cada paso es un enlace o un formulario resuelto por el servidor
