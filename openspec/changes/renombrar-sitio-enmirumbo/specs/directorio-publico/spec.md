# Delta: directorio-publico

El mensaje con el que un vecino le escribe a un negocio lleva el nombre del directorio dentro y hoy vive solo en el código (se aprobó en la propuesta de T-004, duda 2). Como el rebrand lo cambia, se fija aquí: es texto público con la marca, y lo que no está en la spec se puede perder en el siguiente cambio.

## ADDED Requirements

### Requirement: El mensaje prellenado del WhatsApp nombra al directorio con la marca vigente

Todo botón de WhatsApp hacia un negocio —el de la tarjeta del listado, el de las páginas de giro y de resultados, y el "Enviar WhatsApp" de la ficha— DEBE abrir la conversación con el mismo mensaje ya escrito, literalmente: "Hola, te vi en EnMiRumbo. ¿Me das informes?". El mensaje DEBE ser el mismo en todas las superficies (se declara una sola vez), NO DEBE enviarse solo —lo manda el vecino— y NO DEBE contener ningún dato del vecino. Va sin descriptor geográfico a propósito: el negocio que lo recibe está en Tizayuca y ya sabe dónde está, así que decírselo solo alarga el mensaje (resolución del fundador del 2026-09-04).

#### Scenario: el vecino escribe desde una tarjeta del listado

- **WHEN** el vecino toca el botón de WhatsApp de una tarjeta del listado
- **THEN** se abre la conversación con ese negocio y el mensaje "Hola, te vi en EnMiRumbo. ¿Me das informes?" ya escrito, sin enviarse

#### Scenario: el vecino escribe desde la ficha

- **WHEN** el vecino toca "Enviar WhatsApp" en la ficha de un negocio
- **THEN** se abre la conversación con exactamente el mismo mensaje que abriría desde la tarjeta, sin la marca anterior en ninguna parte
