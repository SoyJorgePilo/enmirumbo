# Delta: revision-admin

## MODIFIED Requirements

### Requirement: Detalle del registro con todos los datos capturados, solo dentro del panel

El detalle de un registro DEBE mostrar todo lo que el negocio capturó —nombre, categoría, WhatsApp, colonia (de catálogo o texto libre), qué ofrece, si hace entregas o va a domicilio, teléfono fijo, dirección o referencias, horario y la página que registró— más los datos internos que el admin necesita para operar: estado, origen, fecha de registro y constancia del consentimiento del aviso de privacidad (evidencia ante la LFPDPPP, PRD §8).

La constancia DEBE mostrarse completa: la fecha y, entre paréntesis, la versión del aviso que se aceptó, con la forma "3 de septiembre de 2026 (versión 1)". Si la ficha es anterior al versionado y no tiene versión registrada, DEBE decirlo con el texto literal "versión no registrada" en lugar de la versión, nunca inventar una. Cuando la ficha además tiene una reaceptación —porque se reenvió cuando ya estaba vigente otra versión— el detalle DEBE mostrarla como un dato propio, con la etiqueta literal "Aceptó una versión más nueva del aviso" y el mismo formato de fecha y versión; si no la tiene, esa línea no aparece.

Estos datos personales completos DEBEN verse únicamente dentro del panel con sesión válida: NO DEBEN aparecer en ninguna página pública ni en el log del servidor. Si el registro no existe, el detalle DEBE responder como no encontrado, sin sugerir nada.

#### Scenario: detalle completo

- **WHEN** el admin abre el detalle de un registro que llenó todos los campos
- **THEN** ve todos los datos capturados y, además, el estado, el origen, la fecha de registro y la constancia del consentimiento con su fecha y su versión

#### Scenario: registro anterior al versionado

- **WHEN** el admin abre el detalle de una ficha registrada antes de que el aviso tuviera versión
- **THEN** ve la fecha del consentimiento con "versión no registrada", sin ninguna versión inventada

#### Scenario: registro que aceptó una versión más nueva

- **WHEN** el admin abre el detalle de una ficha que se reenvió cuando ya estaba vigente otra versión del aviso
- **THEN** ve la constancia original con su fecha y su versión, y además la línea "Aceptó una versión más nueva del aviso" con la fecha del reenvío y la versión nueva

#### Scenario: detalle de un registro con solo obligatorios

- **WHEN** el admin abre el detalle de un registro que solo llenó los 5 obligatorios
- **THEN** ve esos datos y los opcionales aparecen como no capturados, sin inventar contenido

#### Scenario: los datos personales no salen del panel

- **WHEN** se revisan las páginas públicas y el log del servidor mientras hay registros en la cola
- **THEN** el WhatsApp, el teléfono fijo, la dirección y la versión del consentimiento de un registro no publicado no aparecen en ninguno de los dos

#### Scenario: registro inexistente

- **WHEN** el admin con sesión abre el detalle de un identificador que no existe
- **THEN** ve la página de no encontrado, sin sugerencias ni datos de otros registros
