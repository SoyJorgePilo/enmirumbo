# Delta de spec: directorio-publico (change `agregar-analitica-cookieless`)

Los nombres de evento y las propiedades salen del contrato único que fija `layout-base` en este mismo change ("La medición no lleva datos personales ni el texto que escribe la gente"): eventos `whatsapp-tarjeta`, `whatsapp-ficha`, `llamar` y `como-llegar`, con las propiedades `categoria` y `colonia` como slugs del catálogo, y `otra` cuando la colonia no es del catálogo.

## MODIFIED Requirements

### Requirement: La tarjeta del listado trae lo esencial y el WhatsApp sin clics extra

Cada negocio del listado DEBE presentarse en una tarjeta con: su foto o, mientras no haya foto (E1-3), un marcador de posición neutro que no prometa una imagen; el nombre del negocio; su colonia; la etiqueta "A domicilio" solo cuando el negocio registró que hace entregas o va a domicilio; y un botón verde de WhatsApp que abre directo la conversación con ese negocio, sin pasar por la ficha (PRD §6.2). El resto de la tarjeta DEBE llevar a la ficha del negocio. El botón de WhatsApp DEBE tener un área táctil de al menos 44px y una etiqueta accesible que diga a qué negocio se le escribe.

El botón de WhatsApp de la tarjeta DEBE declarar el evento `whatsapp-tarjeta` con las propiedades `categoria` y `colonia`, mediante atributos de marcado y sin JavaScript propio. La `categoria` DEBE ser la del negocio, no la de la página, para que el dato sea correcto también en la página de resultados, donde conviven negocios de categorías distintas. El evento DEBE quedar declarado aunque la medición no esté configurada: los atributos son marcado inerte y no cambian el comportamiento del botón.

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

#### Scenario: el clic desde la tarjeta se mide con su categoría y su colonia

- **WHEN** el vecino toca el botón de WhatsApp de un negocio de "Belleza" en la colonia "Haciendas de Tizayuca", con la medición configurada
- **THEN** se registra el evento `whatsapp-tarjeta` con `categoria` = `belleza` y `colonia` = `haciendas-de-tizayuca`, y nada más del negocio

#### Scenario: en la página de resultados manda la categoría del negocio

- **WHEN** el vecino busca "plomero" y toca el WhatsApp de un negocio de "Servicios del hogar" en los resultados
- **THEN** el evento lleva `categoria` = `servicios-del-hogar` (la del negocio), no un valor de la página de búsqueda

#### Scenario: el botón se comporta igual sin medición

- **WHEN** el sitio corre sin la analítica configurada y el vecino toca el botón de WhatsApp de una tarjeta
- **THEN** abre la conversación exactamente igual, y los atributos del evento están en el HTML sin ejecutar nada

### Requirement: Botones de contacto de la ficha con el WhatsApp como acción principal

La ficha DEBE ofrecer los botones del PRD §6.2, cada uno solo si el negocio registró el dato: "Enviar WhatsApp" (siempre presente y como única acción principal, con el verde de acción del sitio), "Llamar" solo si registró teléfono fijo, "Cómo llegar" solo si capturó dirección o referencias (abre Google Maps con esa referencia y su colonia en Tizayuca) y el enlace a la página que registró, solo si la registró. El enlace a la página registrada NO DEBE afirmar que lleva a Facebook: DEBE mostrar el dominio real al que apunta (hallazgo M4 de T-003). Ningún otro botón DEBE competir en jerarquía visual con el de WhatsApp. Los botones DEBEN mostrar la acción, no el número de teléfono como texto. El botón "Llamar" solo se genera si el teléfono fijo se normaliza a 10 dígitos nacionales; si no es normalizable, la ficha muestra el dato capturado como texto plano ("Teléfono: …") sin enlace de llamada (decisión ratificada al cerrar T-004: no se pierde lo registrado y ningún código de marcado hostil llega a un `tel:`).

Los tres botones de contacto de la ficha DEBEN declarar su evento con atributos de marcado y sin JavaScript propio: "Enviar WhatsApp" el evento `whatsapp-ficha`, "Llamar" el evento `llamar` y "Cómo llegar" el evento `como-llegar`, los tres con las propiedades `categoria` y `colonia` del negocio (PRD §9). El enlace a la página registrada NO se instrumenta.

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

#### Scenario: los tres contactos de la ficha se miden por separado

- **WHEN** el vecino toca "Enviar WhatsApp", "Llamar" o "Cómo llegar" en la ficha de un negocio de "Talleres" en la colonia "Huicalco", con la medición configurada
- **THEN** se registra `whatsapp-ficha`, `llamar` o `como-llegar` según el botón, cada uno con `categoria` = `talleres` y `colonia` = `huicalco`

#### Scenario: el enlace a la página del negocio no se mide

- **WHEN** se revisa el HTML de una ficha de un negocio que registró página
- **THEN** ese enlace no lleva ningún atributo de evento

#### Scenario: los eventos de la ficha se distinguen de los de la tarjeta

- **WHEN** se comparan los clics a WhatsApp desde el listado y desde la ficha
- **THEN** llegan con nombres de evento distintos (`whatsapp-tarjeta` y `whatsapp-ficha`), de modo que la métrica del PRD §10 se puede calcular contra las vistas de ficha sin mezclarlos

## ADDED Requirements

### Requirement: La vista de ficha se mide sola, sin instrumentación propia

La "vista de ficha" del PRD §9 DEBE medirse con la vista de página que el proveedor registra por sí mismo al cargarse la ficha: el sitio NO DEBE agregar ningún evento, contador ni JavaScript propio para contarla. Como la ficha vive en una URL propia y estable (`/negocio/<slug>-<id>`), esa vista es el denominador de la métrica del PRD §10 "clics a WhatsApp / vistas de ficha", cuyo numerador es el evento `whatsapp-ficha`. La URL que viaja al proveedor es la ruta pública de la ficha, la misma que cualquiera comparte por WhatsApp; ningún dato adicional del negocio la acompaña.

#### Scenario: abrir una ficha cuenta como vista

- **WHEN** un vecino abre la ficha de un negocio publicado con la medición configurada
- **THEN** queda registrada una vista de esa página, sin que el sitio haya mandado ningún evento propio

#### Scenario: la ficha no agrega instrumentación

- **WHEN** se revisa el código de la ficha
- **THEN** no hay ningún evento de "vista", ni contador en la base, ni JavaScript de cliente agregado para medir
