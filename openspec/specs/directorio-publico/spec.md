# Spec: directorio-publico

## Requirements

### Requirement: La home muestra las 8 categorías como botones grandes

La ruta raíz (`/`) DEBE mostrar las 8 categorías del catálogo (PRD §6.1) como botones grandes, en el orden del catálogo, cada uno con el nombre de la categoría tal como está en la base y enlazado a su listado. La sección DEBE encabezarse con el texto literal "Busca por categoría". Los botones DEBEN medir al menos 44px en su dimensión menor y verse completos en un viewport de 390px. Las categorías DEBEN quedar debajo del buscador (PRD §6.2: "buscador + categorías como botones grandes"), sin que ninguno de los dos pierda protagonismo: son las dos entradas del Flujo B y ambas se ven sin hacer scroll en un celular de 390px. Ningún control de la home DEBE quedar sin destino.

ENMENDADO (encargo del fundador: "los botones se ven planos"): cada botón PUEDE llevar un icono decorativo (`aria-hidden`) junto al nombre; el nombre sigue siendo el contenido accesible.

ENMENDADO (enmienda aprobada por el fundador, revisión visual lote 2): la retícula de categorías DEBE colapsar de verdad al angostarse la pantalla, sin un número de columnas fijo: una sola columna en las pantallas más angostas, dos en un celular normal y tres de tablet para arriba. Ningún nombre de categoría DEBE recortarse ni quedar en una sola línea forzada: el texto quiebra en varias líneas y todos los botones de una fila conservan la misma altura.

#### Scenario: la retícula colapsa a una sola columna en pantallas muy angostas

- **WHEN** el vecino abre la home en un viewport de 320px
- **THEN** los ocho botones se ven uno debajo del otro, con el nombre completo de cada categoría, sin recortes y sin scroll horizontal

#### Scenario: dos columnas en celular y tres en pantalla ancha

- **WHEN** la home se abre en un viewport de 390px y después en uno de tablet o escritorio
- **THEN** las categorías se acomodan en dos columnas en el celular y en tres en la pantalla ancha, con los nombres completos en ambos casos

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

ENMENDADO (encargo del fundador, cohesión visual con el bloque de categorías): el bloque PUEDE llevar un icono decorativo `aria-hidden` junto al encabezado; el texto del encabezado es literalmente "Deporte en Tizayuca".

#### Scenario: el bloque de deporte se ve al mismo nivel que las categorías

- **WHEN** una mamá que busca actividades para sus hijos abre la home en su celular
- **THEN** ve el bloque "Deporte en Tizayuca" con el mismo peso visual que el bloque de categorías, con la frase "Escuelas, clubes y entrenadores para que los niños (y los grandes) se muevan." y una entrada con el texto "Ver clubes y escuelas deportivas"

#### Scenario: el bloque lleva al listado de deporte

- **WHEN** la mamá toca "Ver clubes y escuelas deportivas"
- **THEN** llega al listado `/clubes-y-escuelas-deportivas`, el mismo al que llega desde el botón de esa categoría

### Requirement: Listado por categoría en URL limpia con el slug del catálogo

Cada categoría DEBE tener un listado público en la raíz del sitio, con la URL formada por el slug del catálogo (por ejemplo `/servicios-del-hogar`). La página DEBE encabezarse con el nombre de la categoría seguido de "en Tizayuca" (por ejemplo "Servicios del hogar en Tizayuca") como único `h1`, y listar los negocios publicados de esa categoría. El orden DEBE ser determinista: primero los publicados más recientemente y, a igualdad, por nombre.

La raíz del sitio DEBE resolver un slug contra los tres catálogos en un orden fijo y sin ambigüedad: **primero categorías, después giros, después el par giro+colonia**. La categoría gana siempre, de modo que **ninguna URL de categoría ya publicada puede cambiar de significado** por lo que se agregue a los otros catálogos. Un slug que no corresponde a ninguna categoría, ni a ningún giro, ni a ningún par giro+colonia del catálogo DEBE responder 404, sin sugerir slugs parecidos. Ningún slug de ninguno de los tres catálogos DEBE poder tapar una ruta propia del sitio.

#### Scenario: listado de una categoría con negocios

- **WHEN** el vecino abre `/servicios-del-hogar` y hay negocios publicados en esa categoría
- **THEN** ve el encabezado "Servicios del hogar en Tizayuca" y una tarjeta por cada negocio publicado de esa categoría

#### Scenario: las URLs de categoría son estables

- **WHEN** alguien abre un enlace de categoría que se compartió tiempo atrás, por ejemplo `/clubes-y-escuelas-deportivas`
- **THEN** ve el listado de esa categoría, con su encabezado y sin ninguna redirección

#### Scenario: la categoría le gana al giro con el mismo slug

- **WHEN** el slug de una categoría coincidiera con el slug de un giro del catálogo
- **THEN** la raíz muestra el listado de la categoría, no la página del giro

#### Scenario: slug que no está en ningún catálogo

- **WHEN** alguien abre `/plomeros-baratos`, que no es slug de categoría, ni de giro, ni un par giro+colonia válido
- **THEN** ve la página 404 en español del sitio y la respuesta tiene código 404

#### Scenario: categoría sin negocios publicados todavía

- **WHEN** el vecino abre el listado de una categoría que aún no tiene ningún negocio publicado
- **THEN** ve el mensaje "Todavía no hay negocios publicados en esta categoría." y la invitación "Registra tu negocio gratis", en lugar de una página vacía

#### Scenario: la ruta dinámica no tapa las rutas propias del sitio

- **WHEN** el vecino abre `/registro` o la ficha de un negocio
- **THEN** llega a esas páginas y no al listado de una categoría ni a una página de giro; y ningún slug de los tres catálogos coincide con un segmento reservado del sitio

### Requirement: Solo se muestra lo que está publicado

El directorio público DEBE mostrar únicamente negocios en estado `publicado`. Los negocios en `en_revision` o `rechazado` NO DEBEN aparecer en ningún listado, ni en ningún conteo, ni en el filtro de colonias, ni en los resultados del buscador, y su ficha DEBE responder 404 con la misma página y el mismo código que un negocio inexistente, para no delatar que existe una ficha en revisión (PRD §6.3 y §8).

**Esa regla se aplica también en el instante en que una ficha deja de estar publicada.** Cuando el admin despublica una ficha, esta DEBE desaparecer del directorio en la siguiente petición, sin esperar a que caduque ningún caché ni a que se regenere nada: fuera del listado de su categoría, de sus conteos, del filtro de colonias, del bloque de la home, de sus páginas de giro y de giro+colonia, de los resultados del buscador y del `sitemap.xml`. Su URL DEBE responder el mismo 404 indistinguible que sirve para un negocio en revisión o inexistente: nada en la respuesta DEBE permitir distinguir "esta ficha se despublicó" de "esta ficha nunca existió". Lo mismo aplica a una ficha borrada de forma definitiva.

Ninguna superficie pública DEBE mostrar jamás la fecha ni el motivo de una despublicación: son datos internos del panel, como el motivo de un rechazo.

#### Scenario: un negocio en revisión no aparece en el listado

- **WHEN** un negocio de la categoría "Belleza" está en estado `en_revision` y el vecino abre `/belleza`
- **THEN** ese negocio no aparece en el listado ni ninguno de sus datos está en el HTML de la página

#### Scenario: un negocio rechazado no aparece en el listado

- **WHEN** un negocio está en estado `rechazado` y el vecino abre el listado de su categoría
- **THEN** ese negocio no aparece ni ninguno de sus datos está en el HTML de la página

#### Scenario: ficha de un negocio no publicado

- **WHEN** alguien abre la URL de la ficha de un negocio en `en_revision` o `rechazado`
- **THEN** ve la página 404 en español, exactamente igual que si el negocio no existiera, y ningún dato del negocio aparece en la respuesta

#### Scenario: la ficha despublicada sale del directorio en la siguiente petición

- **WHEN** el admin despublica un negocio y enseguida se abren la home, el listado de su categoría con y sin filtro de colonia, sus páginas de giro y de giro+colonia, la página de resultados con una búsqueda que antes lo encontraba y el `sitemap.xml`
- **THEN** no aparece en ninguna, ninguno de sus datos está en el HTML y los conteos de esas pantallas ya no lo incluyen

#### Scenario: la URL de una ficha despublicada no delata nada

- **WHEN** alguien abre el enlace que le compartieron por WhatsApp de una ficha que acaba de despublicarse
- **THEN** ve exactamente la misma página 404, con el mismo código, que si el identificador nunca hubiera existido, sin ningún aviso de que la ficha estuvo publicada

#### Scenario: la ficha borrada tampoco deja rastro

- **WHEN** alguien abre la URL de una ficha borrada de forma definitiva
- **THEN** ve el mismo 404 y ningún dato del negocio aparece en la respuesta

#### Scenario: la despublicación no se publica

- **WHEN** se revisan la home, los listados, la página de resultados y el HTML de cualquier ficha después de despublicar un negocio
- **THEN** en ninguna aparece la fecha ni el motivo de la despublicación

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

Cada negocio del listado DEBE presentarse en una tarjeta con: **su foto cuando la tiene** y, cuando no, un marcador de posición neutro que no prometa una imagen; el nombre del negocio; su colonia; la etiqueta "A domicilio" solo cuando el negocio registró que hace entregas o va a domicilio; y un botón verde de WhatsApp que abre directo la conversación con ese negocio, sin pasar por la ficha (PRD §6.2). El resto de la tarjeta DEBE llevar a la ficha del negocio. El botón de WhatsApp DEBE tener un área táctil de al menos 44px y una etiqueta accesible que diga a qué negocio se le escribe. La foto DEBE llevar un texto alternativo que nombre al negocio ("Foto de <nombre del negocio>"), mientras que el marcador de posición sigue siendo decorativo y no se anuncia. Con foto o sin ella, la tarjeta DEBE ocupar el mismo espacio y no DEBE saltar cuando la imagen termina de cargar.

El botón de WhatsApp de la tarjeta DEBE declarar el evento `whatsapp-tarjeta` con las propiedades `categoria` y `colonia`, mediante atributos de marcado y sin JavaScript propio, según el contrato único de medición que fija la capacidad `layout-base` (requirement "La medición no lleva datos personales ni el texto que escribe la gente"): los valores son slugs del catálogo, y `otra` cuando la colonia no es del catálogo. La `categoria` DEBE ser la del negocio, no la de la página, para que el dato sea correcto también en la página de resultados, donde conviven negocios de categorías distintas. El evento DEBE quedar declarado aunque la medición no esté configurada: los atributos son marcado inerte y no cambian el comportamiento del botón.

ENMENDADO (enmienda aprobada por el fundador, revisión visual lote 2) — **el marcador de posición ya no es un cuadro gris mudo**: cuando el negocio no tiene foto (o lo guardado no es una referencia del servidor), el marcador DEBE mostrar el emoji de **la categoría de ese negocio**, en grande y centrado sobre el fondo de superficie. El emoji es decorativo: va con `aria-hidden` y NO se anuncia, de modo que la regla de accesibilidad no cambia; el nombre del negocio sigue siendo lo que se lee. Es el mismo emoji que usan los botones de categoría de la home, y una categoría que el mapa todavía no conozca cae en un emoji genérico. Esta regla aplica dondequiera que se pinte el marcador de posición (listado por categoría, páginas de giro y giro+colonia, y resultados de búsqueda); la ficha sin foto sigue sin mostrar ningún bloque de imagen.

ENMENDADO (misma revisión) — **la tarjeta es fluida**: el hueco de la foto DEBE conservar su proporción cuadrada y NO DEBE estirarse cuando el texto de al lado crece; la etiqueta "A domicilio" DEBE ocupar solo lo que mide su texto y nunca el ancho completo de la tarjeta; y el nombre y la colonia DEBEN poder quebrar en varias líneas. Nada de la tarjeta DEBE forzarse a una sola línea.

#### Scenario: el marcador sin foto muestra el emoji de la categoría

- **WHEN** el vecino ve en el listado un negocio de "Servicios del hogar" que no registró foto
- **THEN** en el lugar de la foto ve el emoji de esa categoría, en grande sobre el fondo de superficie, y el lector de pantalla no lo anuncia

#### Scenario: la tarjeta no se estira ni se aprieta

- **WHEN** el listado se abre en un viewport de 390px con un negocio de nombre largo y etiqueta "A domicilio"
- **THEN** el hueco de la foto sigue siendo cuadrado, la etiqueta mide solo lo que su texto y el nombre quiebra en varias líneas, sin scroll horizontal

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

#### Scenario: el clic desde la tarjeta se mide con su categoría y su colonia

- **WHEN** el vecino toca el botón de WhatsApp de un negocio de "Belleza" en la colonia "Haciendas de Tizayuca", con la medición configurada
- **THEN** se registra el evento `whatsapp-tarjeta` con `categoria` = `belleza` y `colonia` = `haciendas-de-tizayuca`, y nada más del negocio

#### Scenario: en la página de resultados manda la categoría del negocio

- **WHEN** el vecino busca "plomero" y toca el WhatsApp de un negocio de "Servicios del hogar" en los resultados
- **THEN** el evento lleva `categoria` = `servicios-del-hogar` (la del negocio), no un valor de la página de búsqueda

#### Scenario: el botón se comporta igual sin medición

- **WHEN** el sitio corre sin la analítica configurada y el vecino toca el botón de WhatsApp de una tarjeta
- **THEN** abre la conversación exactamente igual, y los atributos del evento están en el HTML sin ejecutar nada

### Requirement: La ficha muestra la foto del negocio cuando la tiene

La ficha de un negocio publicado DEBE mostrar su foto, en un tamaño mayor que el de la tarjeta, arriba o junto a la información del negocio (PRD §6.2), con el texto alternativo "Foto de <nombre del negocio>". Si el negocio no registró foto, la ficha NO DEBE mostrar ningún hueco, marco vacío ni texto que anuncie una imagen inexistente: simplemente no hay foto, igual que con el resto de los campos opcionales.

#### Scenario: ficha con foto

- **WHEN** el vecino abre la ficha de un negocio publicado que subió foto
- **THEN** ve la foto del negocio, más grande que en la tarjeta del listado, anunciada como "Foto de <nombre del negocio>"

#### Scenario: ficha sin foto

- **WHEN** el vecino abre la ficha de un negocio publicado que no subió foto
- **THEN** ve su información sin ningún hueco de imagen, sin marco vacío y sin texto que hable de una foto

### Requirement: Solo se pinta la foto que generó el servidor

El directorio DEBE construir la dirección de cada imagen a partir de la referencia interna que generó el servidor al procesar la foto, y NO DEBE usar nunca como origen de una imagen un valor que pueda venir de fuera: si la referencia guardada en una ficha no es una de las que el servidor genera —una URL externa, un `data:`, un `javascript:`, una ruta con `..` o cualquier cadena arbitraria—, la vista DEBE comportarse como si el negocio no tuviera foto y mostrar el marcador de posición, sin intentar cargar nada (hallazgo M1 de T-004). Esta regla aplica igual en el listado por categoría, en las páginas de giro y de giro+colonia, en la página de resultados de búsqueda, en la ficha, en la imagen de la vista previa al compartir (`og:image`) y en la imagen de los datos estructurados (hallazgo M3 de T-009): como la referencia guardada ya no es una dirección, no hay lista blanca de dominios que mantener —la lista blanca es la construcción de la URL—.

#### Scenario: referencia externa guardada a mano

- **WHEN** una ficha publicada tiene guardada como foto `https://evil.example/pixel.png`
- **THEN** su tarjeta y su ficha muestran el marcador de posición, y en el HTML de la respuesta no aparece ese dominio ni ninguna petición hacia él, ni en la imagen de la vista previa ni en los datos estructurados

#### Scenario: `data:` o `javascript:` en la referencia

- **WHEN** una ficha publicada tiene guardada como foto `data:image/svg+xml,<svg onload=alert(1)>` o `javascript:alert(1)`
- **THEN** no se pinta ninguna imagen: se muestra el marcador de posición y ese contenido no aparece en el HTML servido

#### Scenario: intento de salirse del almacenamiento

- **WHEN** una ficha publicada tiene guardada como foto una referencia con `../` o con una ruta absoluta del sistema de archivos
- **THEN** se muestra el marcador de posición y ningún archivo fuera del almacenamiento de fotos se sirve

### Requirement: La foto de un negocio no publicado no es accesible públicamente

La dirección pública que sirve una foto DEBE comprobar, en cada petición, que el negocio dueño de esa foto está en estado `publicado`. La foto de un negocio en `en_revision` o `rechazado`, la de un negocio que ya no existe y la de una referencia inventada DEBEN responder 404, con la misma respuesta en los cuatro casos, para no delatar que ese archivo existe (PRD §6.3 y §8). Una foto que dejó de estar publicada NO DEBE quedar disponible por haberse guardado antes en una caché pública. La única forma de ver la foto de un registro que no está publicado es la dirección propia del panel, que exige sesión válida y vive en la capacidad `revision-admin`.

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

### Requirement: Página indexable por giro en la raíz, generada del catálogo cerrado

Cada giro del catálogo cerrado (PRD Apéndice B) DEBE tener una página pública en la raíz del sitio con la URL formada por su slug (por ejemplo `/plomeria`), que liste **todos los negocios publicados que tienen ese giro asignado por el admin, sin importar su categoría**, con la misma tarjeta y el mismo orden determinista del listado por categoría (primero los publicados más recientemente y, a igualdad, por nombre). Las palabras clave libres del negocio NO generan páginas: solo los giros del catálogo (PRD §8).

El único `h1` de la página DEBE ser la frase del giro seguida de "en Tizayuca". La frase DEBE salir de una tabla curada de frases por giro, y cuando un giro no tenga entrada en esa tabla DEBE usarse su nombre del catálogo tal cual, de modo que agregar un giro nuevo nunca rompa la página. La página DEBE ofrecer, como el listado por categoría, una navegación por colonia: "Todas las colonias" más una opción por cada colonia del catálogo que tenga al menos un negocio publicado de ese giro, y cada opción DEBE llevar a la URL propia de giro+colonia, no a un parámetro de consulta.

#### Scenario: página de un giro con negocios

- **WHEN** el vecino abre `/plomeria` y hay negocios publicados a los que el admin les asignó el giro "Plomería"
- **THEN** ve el encabezado "Plomería en Tizayuca" y una tarjeta por cada uno de esos negocios, con el mismo aspecto y el mismo botón de WhatsApp que en el listado por categoría

#### Scenario: el giro deportivo aterriza la búsqueda que pide el PRD §6.5

- **WHEN** una mamá que busca "clases de futbol en Tizayuca" abre `/futbol`, donde hay un club publicado con ese giro asignado
- **THEN** ve el encabezado "Clases de futbol en Tizayuca" —no "Futbol en Tizayuca"— y la tarjeta de ese club

#### Scenario: el giro manda, no la categoría

- **WHEN** dos negocios publicados de categorías distintas tienen asignado el mismo giro
- **THEN** los dos aparecen en la página de ese giro

#### Scenario: un negocio sin ese giro no aparece

- **WHEN** un negocio publicado no tiene asignado el giro de la página (porque el admin le asignó otros o ninguno)
- **THEN** no aparece en esa página, aunque la palabra del giro esté en su nombre o en su "¿Qué ofreces?"

#### Scenario: solo lo publicado, también aquí

- **WHEN** un negocio en `en_revision` o `rechazado` tiene giros asignados
- **THEN** no aparece en ninguna página de giro y ninguno de sus datos está en el HTML de la respuesta

#### Scenario: la navegación por colonia lleva a URLs propias

- **WHEN** el vecino ve la página `/plomeria` y hay negocios publicados de ese giro en la colonia "Huicalco"
- **THEN** ve la opción "Huicalco" enlazada a `/plomeria-huicalco`, y solo aparecen colonias con al menos un negocio publicado de ese giro

### Requirement: Página indexable por giro y colonia

Cada par de giro y colonia del catálogo DEBE tener una página pública en la raíz con la URL formada por el slug del giro, un guion y el slug de la colonia (por ejemplo `/plomeria-haciendas-de-tizayuca`, PRD §8), que liste los negocios publicados con ese giro asignado **y** esa colonia del catálogo, con la misma tarjeta y el mismo orden. El único `h1` DEBE ser la frase del giro, "en", el nombre de la colonia, y "Tizayuca" separado por coma (por ejemplo "Plomería en Huicalco, Tizayuca"); cuando el nombre de la colonia ya contiene la palabra "Tizayuca" (por ejemplo "Haciendas de Tizayuca"), NO DEBE repetirse: el encabezado termina en el nombre de la colonia.

La resolución del par DEBE ser inequívoca: un slug compuesto que no se pueda leer como exactamente un par giro+colonia del catálogo DEBE responder 404. La página DEBE mostrar la misma navegación por colonia que la página del giro, con la colonia actual marcada como activa y con "Todas las colonias" llevando de vuelta a la página del giro.

#### Scenario: página de giro y colonia con negocios

- **WHEN** el vecino abre `/plomeria-huicalco` y hay un negocio publicado con el giro "Plomería" en la colonia "Huicalco"
- **THEN** ve el encabezado "Plomería en Huicalco, Tizayuca" y la tarjeta de ese negocio

#### Scenario: la colonia que ya dice Tizayuca no lo repite

- **WHEN** el vecino abre la página del giro "Plomería" en la colonia "Haciendas de Tizayuca"
- **THEN** el encabezado es "Plomería en Haciendas de Tizayuca", sin un segundo "Tizayuca" al final

#### Scenario: el filtro es real

- **WHEN** hay negocios publicados con ese giro en otras colonias
- **THEN** no aparecen en esta página: solo los de la colonia de la URL

#### Scenario: compuesto que no existe

- **WHEN** alguien abre `/plomeria-colonia-inventada` o `/loquesea-huicalco`, donde una de las dos partes no está en su catálogo
- **THEN** ve la página 404 en español y la respuesta tiene código 404

#### Scenario: volver al giro completo

- **WHEN** el vecino está en `/plomeria-huicalco` y toca "Todas las colonias"
- **THEN** llega a `/plomeria` y ve los negocios publicados de ese giro en todo Tizayuca

### Requirement: Las páginas de giro sin negocios publicados no se indexan ni se enlazan, pero tampoco son 404

Una página de giro o de giro+colonia cuyo slug es válido pero que **no tiene ningún negocio publicado** NO DEBE indexarse ni enlazarse desde ninguna página del sitio ni aparecer en el sitemap (evitar thin content, PRD §8), y AL MISMO TIEMPO NO DEBE responder 404: DEBE responder con normalidad, declarar `noindex` permitiendo seguir sus enlaces, y mostrar un estado vacío útil con la invitación a registrarse. Una página de giro o de giro+colonia **con** negocios publicados NO DEBE llevar `noindex`.

#### Scenario: giro del catálogo que todavía no tiene negocios

- **WHEN** el vecino abre la página de un giro del catálogo al que ningún negocio publicado tiene asignado
- **THEN** la respuesta es normal (no un 404), ve el encabezado del giro, el mensaje "Todavía no hay negocios publicados de esto en Tizayuca." y la invitación "Registra tu negocio gratis"

#### Scenario: combinación de giro y colonia sin negocios

- **WHEN** el vecino abre `/box-huicalco`, con el giro y la colonia en sus catálogos pero sin ningún negocio publicado que coincida
- **THEN** la respuesta es normal, ve el mensaje "Todavía no hay negocios publicados de esto en esta colonia." y un enlace "Ver todas las colonias" que lleva a la página del giro completo

#### Scenario: lo vacío no se indexa

- **WHEN** un buscador rastrea una página de giro o de giro+colonia sin negocios publicados
- **THEN** encuentra la instrucción de no indexarla, puede seguir sus enlaces, y esa URL no está en el sitemap

#### Scenario: lo vacío tampoco se enlaza

- **WHEN** se revisan los enlaces de la home, los listados, las fichas y las páginas de giro
- **THEN** ninguno apunta a una página de giro o de giro+colonia sin negocios publicados

#### Scenario: lo que sí tiene contenido sí se indexa

- **WHEN** un buscador rastrea una página de giro y una de giro+colonia que sí tienen negocios publicados
- **THEN** ninguna de las dos declara `noindex`

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

La ficha DEBE ofrecer los botones del PRD §6.2, cada uno solo si el negocio registró el dato: "Enviar WhatsApp" (siempre presente y como única acción principal, con el verde de acción del sitio), "Llamar" solo si registró teléfono fijo, "Cómo llegar" solo si capturó dirección o referencias (abre Google Maps con esa referencia y su colonia en Tizayuca) y el enlace a la página que registró, solo si la registró. El enlace a la página registrada NO DEBE afirmar que lleva a Facebook: DEBE mostrar el dominio real al que apunta (hallazgo M4 de T-003). Ningún otro control DEBE competir en jerarquía visual con el de WhatsApp, **incluido el control "Reportar este negocio", que no es un botón de contacto: va aparte de este bloque, después de él y con peso visual menor**. Los botones DEBEN mostrar la acción, no el número de teléfono como texto. El botón "Llamar" solo se genera si el teléfono fijo se normaliza a 10 dígitos nacionales; si no es normalizable, la ficha muestra el dato capturado como texto plano ("Teléfono: …") sin enlace de llamada (decisión ratificada al cerrar T-004: no se pierde lo registrado y ningún código de marcado hostil llega a un `tel:`).

Los tres botones de contacto de la ficha DEBEN declarar su evento con atributos de marcado y sin JavaScript propio, según el contrato único de medición de `layout-base`: "Enviar WhatsApp" el evento `whatsapp-ficha`, "Llamar" el evento `llamar` y "Cómo llegar" el evento `como-llegar`, los tres con las propiedades `categoria` y `colonia` del negocio como slugs del catálogo (PRD §9). Como el enlace `tel:` de "Llamar" no abre pestaña nueva, su evento DEBE declararse en un elemento envolvente y no en el propio enlace, para que el proveedor no pueda aplazar la marcación. El enlace a la página registrada NO se instrumenta.

#### Scenario: WhatsApp como acción principal

- **WHEN** el vecino abre cualquier ficha publicada
- **THEN** ve el botón "Enviar WhatsApp" con el verde de acción, más grande o más prominente que cualquier otro control de la página —incluido "Reportar este negocio"—, y al tocarlo sale hacia la conversación con ese negocio

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

#### Scenario: los tres contactos de la ficha se miden por separado

- **WHEN** el vecino toca "Enviar WhatsApp", "Llamar" o "Cómo llegar" en la ficha de un negocio de "Talleres" en la colonia "Huicalco", con la medición configurada
- **THEN** se registra `whatsapp-ficha`, `llamar` o `como-llegar` según el botón, cada uno con `categoria` = `talleres` y `colonia` = `huicalco`

#### Scenario: el enlace a la página del negocio no se mide

- **WHEN** se revisa el HTML de una ficha de un negocio que registró página
- **THEN** ese enlace no lleva ningún atributo de evento

#### Scenario: los eventos de la ficha se distinguen de los de la tarjeta

- **WHEN** se comparan los clics a WhatsApp desde el listado y desde la ficha
- **THEN** llegan con nombres de evento distintos (`whatsapp-tarjeta` y `whatsapp-ficha`), de modo que la métrica del PRD §10 se puede calcular contra las vistas de ficha sin mezclarlos

#### Scenario: reportar queda fuera del bloque de contacto

- **WHEN** se revisa el orden de la ficha
- **THEN** el bloque de contacto trae solo los botones del PRD §6.2 y "Reportar este negocio" aparece después, separado de ellos

### Requirement: La vista de ficha se mide sola, sin instrumentación propia

La "vista de ficha" del PRD §9 DEBE medirse con la vista de página que el proveedor registra por sí mismo al cargarse la ficha: el sitio NO DEBE agregar ningún evento, contador ni JavaScript propio para contarla. Como la ficha vive en una URL propia y estable (`/negocio/<slug>-<id>`), esa vista es el denominador de la métrica del PRD §10 "clics a WhatsApp / vistas de ficha", cuyo numerador es el evento `whatsapp-ficha`. La URL que viaja al proveedor es la ruta pública de la ficha, la misma que cualquiera comparte por WhatsApp; ningún dato adicional del negocio la acompaña.

#### Scenario: abrir una ficha cuenta como vista

- **WHEN** un vecino abre la ficha de un negocio publicado con la medición configurada
- **THEN** queda registrada una vista de esa página, sin que el sitio haya mandado ningún evento propio

#### Scenario: la ficha no agrega instrumentación

- **WHEN** se revisa el código de la ficha
- **THEN** no hay ningún evento de "vista", ni contador en la base, ni JavaScript de cliente agregado para medir

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
- **THEN** no aparecen el estado, el origen, la fecha de registro, la constancia del consentimiento —ni su fecha, ni su versión, ni la reaceptación— ni el token de gestión del negocio

### Requirement: Desde la ficha se llega a las páginas de sus giros

La ficha de un negocio publicado DEBE mostrar los giros que el admin le asignó, cada uno como enlace a su página de giro, para que esas páginas sean alcanzables navegando y rastreables por un buscador sin depender solo del sitemap. Un negocio publicado sin giros asignados NO DEBE mostrar ninguna sección vacía ni etiqueta sin contenido, exactamente igual que el resto de los campos que el negocio no llenó. Los giros DEBEN presentarse con la frase curada del giro y con área táctil de al menos 44px.

#### Scenario: ficha con giros asignados

- **WHEN** el vecino abre la ficha de un negocio publicado al que el admin le asignó los giros "Plomería" y "Cerrajería"
- **THEN** ve los dos giros como enlaces y, al tocar "Plomería", llega a `/plomeria`

#### Scenario: ficha sin giros

- **WHEN** el vecino abre la ficha de un negocio publicado al que el admin todavía no le asignó ningún giro
- **THEN** la ficha se muestra completa y no aparece ninguna sección de giros vacía

#### Scenario: los enlaces de giro nunca llevan a una página vacía

- **WHEN** se revisa cualquier enlace de giro de una ficha publicada
- **THEN** la página a la que lleva tiene al menos ese negocio publicado, así que nunca es una de las páginas vacías no indexables

### Requirement: Control discreto "Reportar este negocio" en la ficha

Cada ficha publicada DEBE ofrecer un control con el texto literal "Reportar este negocio" que lleve al mini-formulario de reporte (PRD §6.3). El control DEBE ir **después** de los botones de contacto, al final de la ficha, y presentarse en jerarquía visual claramente menor que "Enviar WhatsApp": ni verde de acción, ni tamaño de botón principal, ni nada que lo haga competir con el contacto, que sigue siendo la única acción principal de la página. Su etiqueta accesible DEBE nombrar al negocio, para que quien navega con lector de pantalla sepa qué ficha está reportando. El control DEBE tener un área táctil de al menos 44px en su dimensión menor. El control NO DEBE aparecer en ninguna tarjeta —ni en el listado por categoría, ni en las páginas de giro y de giro+colonia, ni en la página de resultados—: reportar es un acto deliberado sobre una ficha concreta.

#### Scenario: la ficha ofrece reportar sin robarle el lugar a WhatsApp

- **WHEN** el vecino abre la ficha de un negocio publicado
- **THEN** ve "Reportar este negocio" al final de la página, después de los botones de contacto, con menos peso visual que "Enviar WhatsApp", que sigue siendo el control más prominente de la ficha

#### Scenario: tocar el control abre el formulario de reporte

- **WHEN** el vecino toca "Reportar este negocio" en la ficha de "Tacos del Güero"
- **THEN** llega al mini-formulario de reporte de ese negocio, sin salir del sitio y sin que se le pida ninguna cuenta

#### Scenario: etiqueta accesible con el nombre del negocio

- **WHEN** alguien recorre la ficha con lector de pantalla
- **THEN** el control se anuncia indicando a qué negocio reporta, no solo como "Reportar"

#### Scenario: reportar no está en las tarjetas

- **WHEN** se revisan el listado por categoría, una página de giro, una de giro+colonia y la página de resultados
- **THEN** ninguna tarjeta muestra un control de reportar

### Requirement: Mini-formulario de reporte sin cuenta, con motivo de lista cerrada y comentario opcional

El reporte DEBE resolverse en una página propia bajo la ficha del negocio (`/negocio/<slug>-<id>/reportar`), sin cuentas, sin registro y sin JavaScript de cliente (formulario resuelto por el servidor). El identificador se lee del mismo segmento que la ficha, así que un enlace viejo con el nombre anterior del negocio también abre su reporte. La página DEBE encabezarse con el texto literal "Reportar este negocio" como único `h1`, mostrar el nombre del negocio que se está reportando —como texto, tal como lo capturó el negocio— y explicar con el texto literal "Dinos qué pasa y lo revisamos. No te pedimos ningún dato tuyo." El formulario DEBE tener:

- Un grupo de opciones **de lista cerrada** bajo el rótulo literal "¿Qué pasa?", con exactamente estas cuatro y ninguna más: "Ya cerró", "No es real", "Los datos están mal" y "Contenido ofensivo o inapropiado". Ninguna DEBE venir marcada por defecto.
- Un comentario **opcional** bajo el rótulo literal "¿Nos quieres contar más? (opcional)", acotado a 300 caracteres, con la ayuda visible "Máximo 300 caracteres."
- Un botón de envío con el texto literal "Enviar reporte".

La página DEBE declarar `noindex` en su metadata de robots. Si el negocio no existe o no está en estado `publicado`, la página DEBE responder 404 —la misma página y el mismo código que una ficha inexistente—, sin delatar que existe una ficha en revisión o rechazada. Ese mismo 404 DEBE ser la respuesta a **cualquier** petición cuyo identificador de negocio no sirva: uno inventado, uno vacío, uno que ni siquiera es texto o un envío que llega con más argumentos de los que la acción declara. Todas esas respuestas DEBEN ser indistinguibles entre sí —mismo código, mismo cuerpo, ninguna cookie— y ninguna DEBE terminar en un error del servidor. La página DEBE ofrecer también una vuelta a la ficha con el texto literal "Volver a la ficha".

#### Scenario: formulario de reporte completo

- **WHEN** el vecino llega al formulario de reporte de "Tacos del Güero"
- **THEN** ve el encabezado "Reportar este negocio", el nombre del negocio, la frase "Dinos qué pasa y lo revisamos. No te pedimos ningún dato tuyo.", las cuatro opciones de "¿Qué pasa?" sin ninguna marcada, el campo "¿Nos quieres contar más? (opcional)" con su ayuda "Máximo 300 caracteres." y el botón "Enviar reporte"

#### Scenario: el reporte funciona sin JavaScript

- **WHEN** el vecino elige un motivo y envía el reporte con el JavaScript de cliente deshabilitado
- **THEN** el reporte se procesa igual, porque el formulario es un envío resuelto por el servidor

#### Scenario: reportar un negocio que no está publicado

- **WHEN** alguien abre la página de reporte de un negocio en `en_revision`, `rechazado` o de un identificador que no existe
- **THEN** ve la página 404 en español con código 404, idéntica en los tres casos, y ningún dato del negocio aparece en la respuesta

#### Scenario: envío con el identificador manipulado

- **WHEN** llega directamente al servidor un envío de reporte cuyo identificador de negocio está vacío, no es texto (un número, un objeto, una lista) o que trae argumentos de más
- **THEN** la respuesta es el mismo 404 que la de un identificador inexistente, byte por byte, sin cookies, sin escribir nada en la base y sin ningún error del servidor

#### Scenario: la página de reporte no se indexa

- **WHEN** un buscador rastrea la página de reporte de cualquier ficha
- **THEN** encuentra la instrucción de no indexarla

### Requirement: El servidor valida el motivo y el comentario del reporte

Toda la validación del reporte DEBE ocurrir en el servidor, porque el formulario funciona sin JavaScript y porque un envío puede llegar directo, sin pasar por la página. El motivo DEBE pertenecer a la lista cerrada: un envío sin motivo, con un motivo vacío o con un valor que no está en la lista NO DEBE guardar nada y DEBE devolver el formulario con el texto literal "Dinos qué pasa con este negocio", conservando el comentario que ya se había escrito. El comentario DEBE tratarse siempre como texto plano —nunca se interpreta como marcado, ni al guardarse ni al mostrarse— y DEBE rechazarse si pasa de 300 caracteres, con el texto literal "El comentario es muy largo (máximo 300 caracteres)". Un comentario vacío o de puros espacios DEBE guardarse como "sin comentario", no como una cadena de espacios. Si el reporte no se puede guardar por una falla del servidor, el vecino DEBE ver el texto literal "No pudimos enviar tu reporte. Vuelve a intentarlo en un momento." sin ningún detalle técnico.

**El comentario que se conserva tras un error NO DEBE viajar en la URL**, porque lo que un vecino escribe sobre un negocio acabaría en el historial del navegador y en el log de cualquier proxy: la dirección de vuelta solo lleva el código del error, y el borrador se conserva en una cookie de vida corta (a lo más un par de minutos), marcada `HttpOnly`, `SameSite=Lax`, `Secure` siempre que el sitio se sirva por HTTPS y acotada con `Path` a la ruta del formulario de esa ficha, que se borra en cuanto el reporte se envía bien. Esa cookie DEBE acotarse por el servidor antes de escribirse, de modo que ningún comentario largo produzca un encabezado desmedido; un valor que no sea el que escribió el servidor DEBE dejar el campo vacío, nunca romper la página, y el borrador DEBE pintarse siempre escapado dentro del campo.

**La ruta a la que vuelve el vecino la reconstruye el servidor** a partir del negocio que encontró en la base, tanto al confirmar como al volver con un error: el envío NO DEBE poder dictar a dónde se redirige ni qué `Path` lleva la cookie del borrador. Un campo o un argumento del envío que pretenda fijar un destino DEBE ignorarse por completo, sin que ninguna dirección ajena llegue nunca a la redirección ni al encabezado de la cookie.

#### Scenario: envío sin elegir motivo

- **WHEN** el vecino toca "Enviar reporte" sin marcar ninguna opción
- **THEN** no se guarda ningún reporte y ve "Dinos qué pasa con este negocio", con el comentario que había escrito todavía en el campo

#### Scenario: lo que escribió el vecino no queda en la dirección

- **WHEN** el vecino envía el formulario sin motivo con un comentario escrito
- **THEN** la dirección a la que vuelve solo lleva el código del error, el texto regresa desde una cookie de vida corta —`HttpOnly`, `SameSite=Lax`, `Secure` en HTTPS y acotada a la ruta del formulario de esa ficha— y esa cookie se borra en cuanto el reporte se envía bien

#### Scenario: borrador manipulado

- **WHEN** llega una petición con el borrador sustituido por algo que el servidor no escribió, por ejemplo texto con marcado o basura
- **THEN** el formulario se muestra con el campo vacío o con ese contenido escapado como texto, sin romperse y sin interpretar ninguna etiqueta

#### Scenario: el envío no elige a dónde se vuelve

- **WHEN** un envío de reporte llega con campos o argumentos extra que apuntan a un sitio ajeno (`https://evil.example`, `//evil.example`, o valores con saltos de línea o atributos de cookie dentro)
- **THEN** ninguno cambia el destino: o la respuesta es el 404 de identificador inservible, o se vuelve a la ruta de esa misma ficha, que construye el servidor, y ninguna cookie sale con un `Path` o un dominio distinto del suyo

#### Scenario: motivo fuera de la lista

- **WHEN** llega directamente al servidor un envío con un motivo inventado que no está en la lista cerrada
- **THEN** no se guarda ningún reporte y la respuesta es el mismo error de motivo, sin error del servidor

#### Scenario: comentario demasiado largo

- **WHEN** el envío trae un comentario de más de 300 caracteres
- **THEN** no se guarda ningún reporte y el vecino ve "El comentario es muy largo (máximo 300 caracteres)"

#### Scenario: comentario que parece marcado

- **WHEN** alguien envía como comentario `<script>alert(1)</script>` con un motivo válido
- **THEN** el reporte se guarda con ese texto tal cual y, cuando el admin lo lee en el panel, lo ve como texto plano: ninguna etiqueta se interpreta en ninguna pantalla

#### Scenario: comentario de puros espacios

- **WHEN** el vecino envía un motivo válido y un comentario de puros espacios
- **THEN** el reporte queda guardado sin comentario, no con una cadena de espacios

### Requirement: El envío del reporte confirma en español llano y no delata nada

Un reporte aceptado DEBE confirmarse con el texto literal "¡Gracias por avisarnos! Vamos a revisar este negocio." y una vuelta a la ficha con el texto literal "Volver a la ficha". La confirmación NO DEBE decir cuántos reportes tiene ese negocio, ni si ya lo habían reportado, ni qué va a pasar con la ficha, ni prometer respuesta a quien reportó (que es anónimo y no dejó forma de contacto). Recargar la pantalla de confirmación NO DEBE crear otro reporte.

#### Scenario: reporte enviado

- **WHEN** el vecino elige "Ya cerró" y toca "Enviar reporte"
- **THEN** ve "¡Gracias por avisarnos! Vamos a revisar este negocio." y el enlace "Volver a la ficha", que lo regresa a la ficha del negocio

#### Scenario: la confirmación no cuenta nada del negocio

- **WHEN** un vecino reporta un negocio que ya tenía reportes pendientes
- **THEN** ve exactamente la misma confirmación que si fuera el primero, sin conteos ni pistas de lo que el admin vaya a hacer

#### Scenario: recargar la confirmación no duplica

- **WHEN** el vecino recarga la pantalla de confirmación
- **THEN** no se crea ningún reporte adicional

### Requirement: Anti-abuso del reporte sin captcha: honeypot, cupo por IP y tope de pendientes por negocio

El formulario de reporte DEBE protegerse contra envíos automatizados sin captcha y sin fricción (PRD §8), con tres defensas:

1. **Campo trampa (honeypot)** invisible para las personas y no anunciado por lectores de pantalla: un envío con ese campo lleno NO DEBE guardar nada y DEBE mostrar exactamente la misma confirmación que un reporte legítimo, para no delatar la trampa.
2. **Cupo por IP**: 3 reportes por hora desde la misma IP. Al agotarlo, el envío NO DEBE guardar nada y el vecino DEBE ver el texto literal "Ya recibimos varios reportes desde aquí. Espera un rato y vuelve a intentar." La IP se lee con la misma política de encabezado declarado que ya usa el registro: si el despliegue no declara cuál es el encabezado de confianza, NO se confía en ningún encabezado y este cupo simplemente no opera, quedando las otras dos defensas. El cupo de reportes DEBE ser un contador propio: agotarlo NO DEBE impedir registrar un negocio, ni al revés.
3. **Tope de reportes pendientes por negocio**: cuando un negocio ya acumula 10 reportes sin atender, los envíos siguientes sobre esa misma ficha NO DEBEN guardarse; quien reporta DEBE ver la misma confirmación de siempre, porque el negocio ya está señalado y nada se pierde al no apuntarlo otra vez.

Las dos cotas DEBEN hacerse cumplir **sin ventana de carrera**: el tope se decide en la misma operación que guarda el reporte, y el cupo por IP se comprueba y se aparta de una sola vez. Un puñado de envíos simultáneos NO DEBE poder dejar más de 10 reportes sin atender sobre una misma ficha, ni más de 3 reportes de la misma IP en la hora, y todos ellos DEBEN recibir la respuesta que les tocaría de haber llegado uno por uno.

Ningún envío bloqueado por cualquiera de las tres defensas DEBE escribir nada en la base ni dejar en el log del servidor el contenido del reporte.

#### Scenario: bot que llena el honeypot

- **WHEN** un envío de reporte llega con el campo trampa lleno
- **THEN** no se guarda ningún reporte y quien envió ve la misma confirmación que un reporte legítimo

#### Scenario: cupo por IP agotado

- **WHEN** desde la misma IP llega un cuarto reporte dentro de la misma hora
- **THEN** no se guarda nada y el vecino ve "Ya recibimos varios reportes desde aquí. Espera un rato y vuelve a intentar."

#### Scenario: sin encabezado de IP declarado

- **WHEN** el servidor corre sin la variable que declara el encabezado de confianza y llegan muchos reportes
- **THEN** el cupo por IP no bloquea a nadie (no se confía en un encabezado que escribe quien envía), pero el honeypot y el tope por negocio siguen operando

#### Scenario: el cupo de reportes no consume el de altas

- **WHEN** un vecino agota su cupo de reportes de la hora y enseguida registra un negocio desde la misma IP
- **THEN** el registro se procesa con normalidad, porque cada cupo lleva su propio conteo

#### Scenario: negocio con el tope de pendientes alcanzado

- **WHEN** un negocio ya tiene 10 reportes sin atender y llega otro reporte sobre esa misma ficha
- **THEN** no se guarda un reporte nuevo y quien reportó ve la confirmación de siempre, sin enterarse del tope

#### Scenario: muchos reportes al mismo tiempo

- **WHEN** llegan catorce reportes simultáneos sobre la misma ficha, cada uno desde una IP distinta, y ocho simultáneos desde una misma IP sobre otra ficha
- **THEN** la primera ficha queda con exactamente 10 reportes sin atender y la segunda con exactamente 3, todos los envíos ven la respuesta que les corresponde y ninguno revela que había un tope

#### Scenario: el honeypot no molesta a las personas

- **WHEN** un vecino llena el formulario con teclado o con autocompletado del navegador
- **THEN** el campo trampa permanece vacío y su reporte se procesa normalmente

### Requirement: Del reportante no se pide ni se guarda ningún dato

El formulario de reporte NO DEBE pedir nombre, teléfono, correo ni ningún otro dato de quien reporta, y el sistema NO DEBE guardar ninguno: lo único que se persiste de un reporte es el negocio al que apunta, el motivo, el comentario opcional, su estado y sus fechas. La IP se usa **solo en memoria** para el cupo de la hora, exactamente como en el registro: NO DEBE quedar en ninguna tabla ni en el log del servidor, y tampoco DEBE guardarse una versión derivada de ella. El contenido del reporte NO DEBE escribirse en el log. El borrador que conserva el comentario tras un error vive únicamente en el navegador de quien lo escribió, caduca solo y NO DEBE guardarse en el servidor.

#### Scenario: el formulario no pide datos del reportante

- **WHEN** se revisa el formulario de reporte
- **THEN** sus únicos campos son el motivo, el comentario opcional y el campo trampa invisible

#### Scenario: nada del reportante queda guardado

- **WHEN** se revisa un reporte recién creado en la base
- **THEN** trae el negocio, el motivo, el comentario, el estado y las fechas, y ningún dato ni identificador de quien lo envió

#### Scenario: la IP no se persiste ni se registra

- **WHEN** se revisan la base y el log del servidor después de varios reportes
- **THEN** no aparece ninguna IP ni ningún valor derivado de ella, ni el contenido de los comentarios

### Requirement: Un reporte no cambia nada de lo público

Los reportes DEBEN ser invisibles fuera del panel: un negocio reportado sigue publicado exactamente igual (PRD §6.3: la moderación la hace el admin, no el volumen de reportes). NINGÚN reporte DEBE despublicar, ocultar, reordenar ni marcar una ficha de forma automática, y ninguna superficie pública —la ficha, el listado por categoría, las páginas de giro y de giro+colonia, la página de resultados y el sitemap— DEBE mostrar, ni en pantalla ni en el HTML de la respuesta, cuántos reportes tiene un negocio, sus motivos o sus comentarios. Tras enviar un reporte, la ficha DEBE verse igual que antes para cualquier vecino.

#### Scenario: la ficha reportada sigue igual

- **WHEN** un negocio publicado recibe varios reportes y otro vecino abre su ficha
- **THEN** la ve exactamente igual que antes: sigue publicada, con su sello "Negocio verificado", sin aviso de reportes y en el mismo lugar de su listado

#### Scenario: nada de auto-despublicar

- **WHEN** un negocio acumula el tope de reportes pendientes
- **THEN** su estado sigue siendo `publicado` y solo el admin, desde el panel, puede decidir qué hacer

#### Scenario: sin rastro de reportes en el HTML público

- **WHEN** se inspecciona el HTML de la ficha reportada, de su listado, de sus páginas de giro y de una página de resultados que la incluye
- **THEN** no aparece ningún conteo, motivo ni comentario de reportes

### Requirement: Buscador en la home que funciona sin JavaScript de cliente

La home DEBE mostrar, arriba de las categorías, un buscador que sea un formulario de envío por GET hacia la página de resultados, de modo que funcione sin JavaScript de cliente. El campo DEBE tener una etiqueta visible asociada con el texto literal "Busca lo que necesitas", un ejemplo dentro del campo con el texto literal "ej. plomero, tacos, futbol infantil" y un botón de envío con el texto literal "Buscar". El campo y el botón DEBEN medir al menos 44px en su dimensión menor. El buscador NO DEBE agregar un encabezado propio: la home conserva un solo `h1` y sus encabezados de segundo nivel siguen siendo los de categorías, deporte y registro.

ENMENDADO (enmienda aprobada por el fundador, revisión visual lote 2): en celular, el campo y el botón "Buscar" DEBEN ir apilados —el campo a todo lo ancho y el botón debajo, también a todo lo ancho— y solo DEBEN ponerse en una misma fila cuando la pantalla da para los dos. Esto vale igual para el buscador de la home y para el que repite la página de resultados.

#### Scenario: el buscador se apila en celular

- **WHEN** el vecino abre la home, o la página de resultados, en un viewport de 390px
- **THEN** el campo ocupa todo el ancho disponible y el botón "Buscar" va completo debajo del campo, sin recortarse y sin apretar el campo

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

### Requirement: Título y descripción propios en cada página del directorio, con su canónica

Cada página pública del directorio DEBE declarar su propio título y su propia descripción, en lugar de heredar los del sitio, y DEBE declarar su URL canónica absoluta. Los textos son:

- **Listado por categoría:** título `«Categoría» en Tizayuca`; descripción `«Categoría» en Tizayuca: negocios de aquí, verificados uno por uno, que contactas directo por WhatsApp.`
- **Página de giro:** título `«Frase del giro» en Tizayuca`; descripción `«Frase del giro» en Tizayuca: negocios verificados que contactas directo por WhatsApp, sin intermediarios.`
- **Página de giro y colonia:** título `«Frase del giro» en «Colonia», Tizayuca` (sin repetir "Tizayuca" cuando el nombre de la colonia ya lo contiene); descripción `«Frase del giro» en «Colonia»: negocios verificados de Tizayuca que contactas directo por WhatsApp.`
- **Ficha:** título `«Nombre del negocio» en «Colonia», Tizayuca` o, si el negocio no tiene colonia, `«Nombre del negocio» en Tizayuca`; descripción: lo que el negocio escribió en "¿Qué ofreces?", recortado si es largo, y si no escribió nada, `«Nombre del negocio» en «Colonia», Tizayuca. Negocio verificado que contactas directo por WhatsApp.`

El listado por categoría con un filtro de colonia aplicado (`?colonia=`) DEBE declarar como canónica el listado sin filtro, para no competir con las páginas de giro+colonia ni duplicar contenido.

La descripción NO DEBE incluir el WhatsApp ni el teléfono del negocio, ni ningún dato interno de la ficha. Como "¿Qué ofreces?" es texto libre, no basta con no leer esos campos: la descripción DEBE ocultar también las secuencias de siete o más dígitos que el negocio haya escrito dentro de ese texto —admitiendo entre ellos los separadores con los que se escribe un teléfono— sustituyéndolas por `…`. El nombre del negocio NO se altera: es la identidad de la ficha y el admin lo revisa al aprobar.

#### Scenario: cada página con su propio título

- **WHEN** se revisan el listado `/servicios-del-hogar`, la página `/plomeria`, la página `/plomeria-huicalco` y la ficha de un negocio
- **THEN** cada una declara un título y una descripción distintos entre sí y distintos de los del sitio, y ninguna se queda con los del layout

#### Scenario: descripción de la ficha con lo que escribió el negocio

- **WHEN** el vecino comparte la ficha de un negocio que escribió "Plomería, destape de drenajes y bombas de agua." en "¿Qué ofreces?"
- **THEN** la descripción de la página es ese texto, y no incluye su WhatsApp ni su teléfono

#### Scenario: un número escrito dentro de "¿Qué ofreces?"

- **WHEN** un negocio publicado escribió "Plomería 24 horas, llámanos al 771 000 0000." y alguien comparte su ficha o un buscador la rastrea
- **THEN** la descripción de la página dice "Plomería 24 horas, llámanos al …", mientras la ficha le sigue mostrando a las personas el texto completo tal como lo escribió

#### Scenario: ficha sin "¿Qué ofreces?"

- **WHEN** el negocio no llenó "¿Qué ofreces?"
- **THEN** la descripción es la frase de respaldo con su nombre y su colonia, no una descripción vacía

#### Scenario: el listado filtrado no compite con las páginas de giro

- **WHEN** un buscador rastrea `/servicios-del-hogar?colonia=huicalco`
- **THEN** encuentra como canónica `/servicios-del-hogar`, sin el filtro

#### Scenario: canónicas absolutas

- **WHEN** se revisa la canónica de cualquier página indexable del directorio
- **THEN** es una URL absoluta construida con la URL pública del sitio, no una ruta relativa ni una dirección local

### Requirement: La ficha se ve bien al compartirla por WhatsApp o Facebook

Cada ficha publicada DEBE declarar datos de Open Graph para que la vista previa del enlace muestre algo útil cuando se comparte (PRD §9: cada ficha se distribuye como link individual): título y descripción los mismos de la página, la URL canónica, el nombre del sitio y el idioma español de México, y una imagen. La imagen DEBE ser la foto del negocio cuando exista, con su dirección construida a partir de la referencia interna que generó el servidor; cuando el negocio no tenga foto —o lo guardado no sea una referencia válida—, DEBE usarse la imagen de marca del propio sitio, de modo que **ninguna ficha se comparta sin imagen** y ninguna dirección ajena pueda acabar como `og:image`. La vista previa NO DEBE agregar el WhatsApp ni el teléfono del negocio.

#### Scenario: ficha con foto

- **WHEN** un negocio publicado tiene foto y alguien comparte su ficha
- **THEN** la vista previa usa esa foto, con el título y la descripción de la ficha

#### Scenario: ficha sin foto

- **WHEN** un negocio publicado no tiene foto y alguien comparte su ficha
- **THEN** la vista previa usa la imagen de marca del sitio, no queda sin imagen

#### Scenario: referencia de foto que no generó el servidor

- **WHEN** una ficha publicada tiene guardada como foto una dirección externa o una cadena arbitraria y alguien comparte su ficha
- **THEN** la vista previa usa la imagen de marca del sitio y esa dirección no aparece en la respuesta

#### Scenario: la imagen se declara con URL absoluta

- **WHEN** se revisan los datos de Open Graph de cualquier ficha
- **THEN** la imagen y la URL son absolutas, construidas con la URL pública del sitio

#### Scenario: la vista previa no reparte el número

- **WHEN** se revisan los datos de Open Graph de una ficha
- **THEN** no aparecen el WhatsApp ni el teléfono fijo del negocio

### Requirement: Cada ficha publicada emite Schema.org LocalBusiness

Cada ficha publicada DEBE emitir datos estructurados JSON-LD de tipo `LocalBusiness` (PRD §8) con lo que es honesto publicar: el nombre del negocio, la URL canónica de su ficha, su categoría y sus giros, la colonia como única referencia de ubicación —dentro de una dirección que declara Tizayuca, Hidalgo, México—, la descripción con lo que escribió en "¿Qué ofreces?" si lo escribió —con las secuencias largas de dígitos ocultas igual que en la meta descripción— y su foto si la tiene, con la dirección construida a partir de la referencia interna que generó el servidor. Si el negocio no tiene foto, o lo guardado no es una referencia válida, el bloque DEBE emitirse sin imagen antes que emitir una dirección que no construyó el sitio.

El markup DEBE respetar la expectativa realista del PRD §8: *"al publicar colonia (no dirección exacta) y horario en texto libre, el markup será parcial; el horario estructurado queda para fases posteriores (§12)"*. En consecuencia NO DEBE emitir: el horario, el texto de dirección o referencias que capturó el negocio, coordenadas, ni el WhatsApp o el teléfono (hallazgo M5 de T-004: no entregar los números en formato legible por máquina). Tampoco DEBE emitirse en las fichas que no están publicadas, ni en los listados.

El contenido que escribió el negocio DEBE quedar escapado dentro del bloque de datos: un nombre o un "¿Qué ofreces?" con marcado dentro NO DEBE poder cerrar el bloque ni ejecutar nada.

#### Scenario: ficha publicada con datos estructurados

- **WHEN** un buscador lee la ficha de un negocio publicado en la colonia "Huicalco" con el giro "Plomería"
- **THEN** encuentra un bloque JSON-LD válido de tipo `LocalBusiness` con su nombre, la URL de la ficha, la colonia, "Tizayuca" y "Hidalgo" como ubicación, y su categoría y su giro

#### Scenario: nunca el domicilio exacto ni el número

- **WHEN** se revisa el JSON-LD de un negocio que capturó dirección o referencias, teléfono fijo y horario
- **THEN** ninguno de esos tres datos aparece en el bloque de datos estructurados, aunque la ficha sí los muestre a las personas

#### Scenario: negocio sin colonia del catálogo

- **WHEN** un negocio publicado quedó con colonia "Otra" sin normalizar
- **THEN** el bloque JSON-LD se emite igual, con Tizayuca como ubicación y sin inventar una colonia, y nada se rompe

#### Scenario: nombre con marcado dentro

- **WHEN** un negocio publicado se llama `Tacos </script><script>alert(1)</script>`
- **THEN** el bloque de datos estructurados sigue siendo un solo bloque válido, el marcado se ve como texto dentro del dato y nada se ejecuta

#### Scenario: solo en las fichas publicadas

- **WHEN** se revisan los listados, las páginas de giro y la respuesta de una ficha en `en_revision`
- **THEN** en ninguna hay datos estructurados de negocio

#### Scenario: la imagen del bloque siempre la construye el sitio

- **WHEN** se revisa el JSON-LD de una ficha publicada con foto y el de otra cuya referencia de foto no es de las que genera el servidor
- **THEN** el primero declara la imagen construida por el sitio y el segundo se emite sin imagen, sin sacar ninguna dirección de lo guardado

### Requirement: Directorio en Server Components, mobile-first y usable sin JavaScript

La home, los listados por categoría, las páginas de giro y de giro+colonia, las fichas, el buscador, la página de resultados y **la página de reporte con su confirmación** DEBEN ser Server Components y NO DEBEN agregar JavaScript de cliente propio (PRD §8, presupuesto de <2s en 4G). El JSON-LD de la ficha NO cuenta como JavaScript de cliente: es un bloque de datos, no código ejecutable. Tampoco cuenta el script del proveedor de analítica cookieless, que es de un tercero y lo inyecta el tronco de las páginas públicas (capacidad `layout-base`): estas páginas solo declaran eventos con atributos de marcado, sin código propio alrededor. Todas las páginas DEBEN verse completas en un viewport de 390px sin scroll horizontal, con áreas táctiles de al menos 44px en todo elemento tocable, y DEBEN seguir siendo navegables con el JavaScript de cliente deshabilitado, incluidos el filtro por colonia, la búsqueda, la navegación entre las páginas de giro y de giro+colonia y el envío de un reporte.

#### Scenario: sin JS de cliente

- **WHEN** se revisan los archivos de la home, el listado, las páginas de giro y giro+colonia, la tarjeta, la ficha, el buscador, la página de resultados y la página de reporte
- **THEN** ninguno declara `"use client"` ni agrega un bundle de cliente propio

#### Scenario: celular a 390px

- **WHEN** un vecino abre la home, un listado, una página de giro, una de giro+colonia, una ficha, una página de resultados y el formulario de reporte en un viewport de 390px
- **THEN** todo se ve completo y legible, sin scroll horizontal, y cada elemento tocable mide al menos 44px en su dimensión menor

#### Scenario: navegación sin JavaScript

- **WHEN** el vecino recorre home → buscar → resultados → ficha → WhatsApp, home → categoría → filtro por colonia → ficha → giro → giro+colonia → WhatsApp, y ficha → reportar → enviar → confirmación, con el JavaScript de cliente deshabilitado
- **THEN** los tres recorridos completos funcionan igual, porque cada paso es un enlace o un formulario resuelto por el servidor
