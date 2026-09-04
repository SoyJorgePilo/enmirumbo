# Delta de spec: directorio-publico

## MODIFIED Requirements

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

## ADDED Requirements

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

- **WHEN** un negocio publicado todavía no tiene giros asignados (el admin aún no lo revisó con el panel)
- **THEN** se sigue encontrando por su nombre y por sus palabras clave, sin error

### Requirement: Coincidencia insensible a mayúsculas y acentos, y parcial por raíz de la palabra

La búsqueda DEBE ignorar mayúsculas, acentos y signos, tanto en lo que escribe el vecino como en lo que guardó el negocio, y DEBE coincidir parcialmente por la raíz de cada palabra, de modo que "plomero" encuentre al de "plomería" y al de "plomeria", y "futbol" al club que escribió "fútbol" (PRD §6.2). Cuando el vecino escribe varias palabras, DEBEN encontrarse solo los negocios que coinciden con todas, sin importar en cuál de los tres lugares (nombre, palabras clave o giros) aparece cada una. La búsqueda NO DEBE hacer ranking de relevancia, sinónimos ni corrección de errores de dedo.

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
- **THEN** ninguna quedó marcada como no indexable por este cambio
