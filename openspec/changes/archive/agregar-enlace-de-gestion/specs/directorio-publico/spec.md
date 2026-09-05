# Delta de spec: directorio-publico

## ADDED Requirements

### Requirement: Botón "Perdí mi enlace" en la ficha, hacia el WhatsApp del admin

Cada ficha publicada DEBE ofrecer, al final y en jerarquía claramente menor que los botones de contacto, un bloque encabezado con el texto literal "¿Es tu negocio?" y un control con el texto literal "Perdí mi enlace" que abra WhatsApp con la conversación del **admin** y el mensaje ya escrito, literalmente: "Hola, soy de «<nombre del negocio>» en NecesitoUno Tizayuca y perdí el enlace para editar mi ficha. Les escribo desde el número que registré, ¿me lo pueden pasar?" (PRD §6.4 y §7 Flujo D: el admin verifica que quien escribe lo hace desde el número registrado y le reenvía o le genera uno nuevo).

El número del admin DEBE leerse de una variable de entorno del servidor: NO DEBE estar escrito en el código, ni en los seeds, ni en los tests (repo público + LFPDPPP, PRD §8). Si esa variable falta o su valor no se puede interpretar como un número mexicano de 10 dígitos, el bloque NO DEBE pintarse: nada de enlaces rotos ni de números de ejemplo. El control NO DEBE aparecer en las tarjetas del listado ni en los resultados de búsqueda, y NO DEBE prometer que el enlace llega solo: lo manda una persona.

#### Scenario: pedir el enlace desde la ficha

- **WHEN** el dueño de "Tacos del Güero" abre su ficha y toca "Perdí mi enlace"
- **THEN** sale hacia WhatsApp con la conversación del admin y el mensaje "Hola, soy de «Tacos del Güero» en NecesitoUno Tizayuca y perdí el enlace para editar mi ficha. Les escribo desde el número que registré, ¿me lo pueden pasar?" ya escrito, sin enviarse

#### Scenario: sin número de admin configurado

- **WHEN** el sitio corre sin la variable de entorno del WhatsApp del admin, o con un valor que no se normaliza a 10 dígitos
- **THEN** la ficha se muestra completa pero sin el bloque "¿Es tu negocio?" ni el control "Perdí mi enlace", y no aparece ningún enlace roto ni ningún número inventado

#### Scenario: el número del admin no vive en el repo

- **WHEN** se revisan el código, los seeds y las suites de pruebas
- **THEN** no aparece ningún número de WhatsApp real del admin: solo la lectura de la variable de entorno

#### Scenario: el control no compite con el contacto

- **WHEN** un vecino abre una ficha
- **THEN** "Enviar WhatsApp" sigue siendo la acción principal y "Perdí mi enlace" se ve claramente como algo secundario, al final de la ficha

#### Scenario: solo en la ficha

- **WHEN** se revisan las tarjetas del listado y de los resultados de búsqueda
- **THEN** ninguna muestra "Perdí mi enlace"

### Requirement: Una edición esperando revisión no se asoma a ninguna superficie pública

Mientras una edición espera revisión, el directorio DEBE seguir mostrando **exactamente la versión publicada** (PRD §6.4: "Mientras tanto, la ficha sigue mostrando la versión anterior"). Ningún dato propuesto DEBE aparecer en la ficha, en el listado por categoría, en el filtro por colonia, en los resultados de búsqueda, en ningún conteo ni en el HTML de ninguna respuesta. La búsqueda DEBE seguir encontrando al negocio por lo que está publicado, no por lo propuesto. Tampoco DEBE existir ninguna señal de que hay una edición esperando: ni una etiqueta, ni un "actualizando", ni una diferencia observable entre una ficha con edición pendiente y una sin ella.

#### Scenario: la ficha sigue mostrando lo publicado

- **WHEN** un negocio con una edición pendiente que cambia su nombre, su horario y su teléfono aparece en su ficha
- **THEN** se ven el nombre, el horario y el teléfono publicados, y ninguno de los valores propuestos está en el HTML de la respuesta

#### Scenario: la búsqueda no encuentra lo propuesto

- **WHEN** un negocio publicado como "Estética Lupita" tiene una edición pendiente que lo renombra "Estética Lupita y Asociados", y un vecino busca "asociados"
- **THEN** no lo encuentra por ese término, y sí lo sigue encontrando buscando "estetica"

#### Scenario: nada delata que hay cambios esperando

- **WHEN** se comparan la ficha y la tarjeta de un negocio con edición pendiente contra las de uno sin ella
- **THEN** no hay ninguna diferencia visible ni en el HTML que permita saber cuál tiene cambios en revisión

## MODIFIED Requirements

### Requirement: Botones de contacto de la ficha con el WhatsApp como acción principal

La ficha DEBE ofrecer los botones del PRD §6.2, cada uno solo si el negocio registró el dato: "Enviar WhatsApp" (siempre presente y como única acción principal, con el verde de acción del sitio), "Llamar" solo si registró teléfono fijo, "Cómo llegar" solo si capturó dirección o referencias (abre Google Maps con esa referencia y su colonia en Tizayuca) y el enlace a la página que registró, solo si la registró. El enlace a la página registrada NO DEBE afirmar que lleva a Facebook: DEBE mostrar el dominio real al que apunta (hallazgo M4 de T-003). Ningún otro botón DEBE competir en jerarquía visual con el de WhatsApp, y eso incluye el control "Perdí mi enlace", que va al final de la ficha y en jerarquía menor. Los botones DEBEN mostrar la acción, no el número de teléfono como texto. El botón "Llamar" solo se genera si el teléfono fijo se normaliza a 10 dígitos nacionales; si no es normalizable, la ficha muestra el dato capturado como texto plano ("Teléfono: …") sin enlace de llamada (decisión ratificada al cerrar T-004: no se pierde lo registrado y ningún código de marcado hostil llega a un `tel:`).

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

#### Scenario: "Perdí mi enlace" no pelea con el contacto

- **WHEN** el vecino abre una ficha con el bloque "¿Es tu negocio?" visible
- **THEN** "Enviar WhatsApp" sigue siendo el control más prominente de la página

### Requirement: Se publica la colonia, nunca el domicilio exacto ni los datos internos de la ficha

El directorio DEBE mostrar la colonia del negocio y NO DEBE mostrar ningún dato de ubicación que el negocio no haya capturado él mismo: lo único que puede aparecer como dirección es el texto de dirección o referencias que escribió (PRD §8). Ni el listado ni la ficha DEBEN exponer, ni en la pantalla ni en el HTML de la respuesta, los datos internos de la ficha: estado, origen, fecha de registro, constancia del consentimiento, **la huella del enlace de gestión ni ningún token o URL de edición**, ni **nada del contenido de una edición pendiente**.

#### Scenario: negocio sin dirección capturada

- **WHEN** el vecino abre la ficha de un negocio que solo registró su colonia
- **THEN** ve la colonia y ninguna otra referencia de ubicación

#### Scenario: negocio con referencias capturadas

- **WHEN** el vecino abre la ficha de un negocio que escribió "a un lado de la primaria, calle Morelos"
- **THEN** ve ese texto tal como lo escribió el negocio, sin agregarle ni completarle datos de domicilio

#### Scenario: sin datos internos en la respuesta

- **WHEN** se inspecciona el HTML de un listado o de una ficha de un negocio que tiene enlace de gestión y una edición pendiente
- **THEN** no aparecen el estado, el origen, la fecha de registro, la fecha de consentimiento, la huella del enlace, ninguna URL de edición ni ningún valor propuesto en la edición
