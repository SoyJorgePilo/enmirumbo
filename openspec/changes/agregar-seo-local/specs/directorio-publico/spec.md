# Spec delta: directorio-publico

## MODIFIED Requirements

### Requirement: Listado por categoría en URL limpia con el slug del catálogo

Cada categoría DEBE tener un listado público en la raíz del sitio, con la URL formada por el slug del catálogo (por ejemplo `/servicios-del-hogar`). La página DEBE encabezarse con el nombre de la categoría seguido de "en Tizayuca" (por ejemplo "Servicios del hogar en Tizayuca") como único `h1`, y listar los negocios publicados de esa categoría. El orden DEBE ser determinista: primero los publicados más recientemente y, a igualdad, por nombre.

La raíz del sitio DEBE resolver un slug contra los tres catálogos en un orden fijo y sin ambigüedad: **primero categorías, después giros, después el par giro+colonia**. La categoría gana siempre, de modo que **ninguna URL de categoría ya publicada puede cambiar de significado** por lo que se agregue a los otros catálogos. Un slug que no corresponde a ninguna categoría, ni a ningún giro, ni a ningún par giro+colonia del catálogo DEBE responder 404, sin sugerir slugs parecidos. Ningún slug de ninguno de los tres catálogos DEBE poder tapar una ruta propia del sitio.

#### Scenario: listado de una categoría con negocios

- **WHEN** el vecino abre `/servicios-del-hogar` y hay negocios publicados en esa categoría
- **THEN** ve el encabezado "Servicios del hogar en Tizayuca" y una tarjeta por cada negocio publicado de esa categoría

#### Scenario: las URLs de categoría publicadas siguen siendo las mismas

- **WHEN** alguien abre un enlace de categoría compartido antes de este cambio, por ejemplo `/clubes-y-escuelas-deportivas`
- **THEN** ve el mismo listado de esa categoría que veía antes, con el mismo encabezado y sin ninguna redirección

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

### Requirement: Directorio en Server Components, mobile-first y usable sin JavaScript

La home, los listados por categoría, **las páginas de giro y de giro+colonia**, las fichas, el buscador y la página de resultados DEBEN ser Server Components y NO DEBEN agregar JavaScript de cliente propio (PRD §8, presupuesto de <2s en 4G). El JSON-LD de la ficha NO cuenta como JavaScript de cliente: es un bloque de datos, no código ejecutable. Todas las páginas DEBEN verse completas en un viewport de 390px sin scroll horizontal, con áreas táctiles de al menos 44px en todo elemento tocable, y DEBEN seguir siendo navegables con el JavaScript de cliente deshabilitado, incluidos el filtro por colonia, la búsqueda y la navegación entre las páginas de giro y de giro+colonia.

#### Scenario: sin JS de cliente nuevo

- **WHEN** se revisan los archivos nuevos y modificados de la home, el listado, las páginas de giro y giro+colonia, la tarjeta, la ficha, el buscador y la página de resultados
- **THEN** ninguno declara `"use client"` ni agrega un bundle de cliente propio

#### Scenario: celular a 390px

- **WHEN** un vecino abre la home, un listado, una página de giro, una de giro+colonia, una ficha y una página de resultados en un viewport de 390px
- **THEN** todo se ve completo y legible, sin scroll horizontal, y cada elemento tocable mide al menos 44px en su dimensión menor

#### Scenario: navegación sin JavaScript

- **WHEN** el vecino recorre home → categoría → ficha → giro → giro+colonia → WhatsApp con el JavaScript de cliente deshabilitado
- **THEN** el recorrido completo funciona igual, porque cada paso es un enlace o un formulario resuelto por el servidor

## ADDED Requirements

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

### Requirement: Título y descripción propios en cada página del directorio, con su canónica

Cada página pública del directorio DEBE declarar su propio título y su propia descripción, en lugar de heredar los del sitio, y DEBE declarar su URL canónica absoluta. Los textos son:

- **Listado por categoría:** título `«Categoría» en Tizayuca`; descripción `«Categoría» en Tizayuca: negocios de aquí, verificados uno por uno, que contactas directo por WhatsApp.`
- **Página de giro:** título `«Frase del giro» en Tizayuca`; descripción `«Frase del giro» en Tizayuca: negocios verificados que contactas directo por WhatsApp, sin intermediarios.`
- **Página de giro y colonia:** título `«Frase del giro» en «Colonia», Tizayuca` (sin repetir "Tizayuca" cuando el nombre de la colonia ya lo contiene); descripción `«Frase del giro» en «Colonia»: negocios verificados de Tizayuca que contactas directo por WhatsApp.`
- **Ficha:** título `«Nombre del negocio» en «Colonia», Tizayuca` o, si el negocio no tiene colonia, `«Nombre del negocio» en Tizayuca`; descripción: lo que el negocio escribió en "¿Qué ofreces?", recortado si es largo, y si no escribió nada, `«Nombre del negocio» en «Colonia», Tizayuca. Negocio verificado que contactas directo por WhatsApp.`

El listado por categoría con un filtro de colonia aplicado (`?colonia=`) DEBE declarar como canónica el listado sin filtro, para no competir con las páginas de giro+colonia ni duplicar contenido. La descripción NO DEBE incluir el WhatsApp ni el teléfono del negocio, ni ningún dato interno de la ficha.

#### Scenario: cada página con su propio título

- **WHEN** se revisan el listado `/servicios-del-hogar`, la página `/plomeria`, la página `/plomeria-huicalco` y la ficha de un negocio
- **THEN** cada una declara un título y una descripción distintos entre sí y distintos de los del sitio, y ninguna se queda con los del layout

#### Scenario: descripción de la ficha con lo que escribió el negocio

- **WHEN** el vecino comparte la ficha de un negocio que escribió "Plomería, destape de drenajes y bombas de agua." en "¿Qué ofreces?"
- **THEN** la descripción de la página es ese texto, y no incluye su WhatsApp ni su teléfono

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

Cada ficha publicada DEBE declarar datos de Open Graph para que la vista previa del enlace muestre algo útil cuando se comparte (PRD §9: cada ficha se distribuye como link individual): título y descripción los mismos de la página, la URL canónica, el nombre del sitio y el idioma español de México, y una imagen. La imagen DEBE ser la foto del negocio cuando exista; cuando no exista, DEBE usarse la imagen de marca del propio sitio, de modo que **ninguna ficha se comparta sin imagen**. La vista previa NO DEBE agregar el WhatsApp ni el teléfono del negocio.

#### Scenario: ficha con foto

- **WHEN** un negocio publicado tiene foto y alguien comparte su ficha
- **THEN** la vista previa usa esa foto, con el título y la descripción de la ficha

#### Scenario: ficha sin foto

- **WHEN** un negocio publicado no tiene foto y alguien comparte su ficha
- **THEN** la vista previa usa la imagen de marca del sitio, no queda sin imagen

#### Scenario: la imagen se declara con URL absoluta

- **WHEN** se revisan los datos de Open Graph de cualquier ficha
- **THEN** la imagen y la URL son absolutas, construidas con la URL pública del sitio

#### Scenario: la vista previa no reparte el número

- **WHEN** se revisan los datos de Open Graph de una ficha
- **THEN** no aparecen el WhatsApp ni el teléfono fijo del negocio

### Requirement: Cada ficha publicada emite Schema.org LocalBusiness

Cada ficha publicada DEBE emitir datos estructurados JSON-LD de tipo `LocalBusiness` (PRD §8) con lo que es honesto publicar: el nombre del negocio, la URL canónica de su ficha, su categoría y sus giros, la colonia como única referencia de ubicación —dentro de una dirección que declara Tizayuca, Hidalgo, México—, la descripción con lo que escribió en "¿Qué ofreces?" si lo escribió, y su foto si la tiene.

El markup DEBE respetar la expectativa realista del PRD §8, que la spec cita: *"al publicar colonia (no dirección exacta) y horario en texto libre, el markup será parcial; el horario estructurado queda para fases posteriores (§12)"*. En consecuencia NO DEBE emitir: el horario, el texto de dirección o referencias que capturó el negocio, coordenadas, ni el WhatsApp o el teléfono (hallazgo M5 de T-004: no entregar los números en formato legible por máquina). Tampoco DEBE emitirse en las fichas que no están publicadas, ni en los listados.

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
