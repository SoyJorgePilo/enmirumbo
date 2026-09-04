# Delta de spec: revision-admin

## MODIFIED Requirements

### Requirement: Detalle del registro con todos los datos capturados, solo dentro del panel

El detalle de un registro DEBE mostrar todo lo que el negocio capturó —nombre, categoría, WhatsApp, colonia (de catálogo o texto libre), qué ofrece, si hace entregas o va a domicilio, teléfono fijo, dirección o referencias, horario, la página que registró y **la foto que subió**— más los datos internos que el admin necesita para operar: estado, origen, fecha de registro y constancia del consentimiento del aviso de privacidad (evidencia ante la LFPDPPP, PRD §8). La foto DEBE verse lo bastante grande para poder juzgarla contra la política del PRD §6.1 (del local, los productos o el trabajo; sin personas reconocibles) antes de aprobar o rechazar, bajo el rótulo literal "Foto del negocio"; si el registro no trae foto, DEBE decirlo con el texto literal "Sin foto". El motivo de rechazo libre que ya existe basta para explicarle al negocio por qué su foto no cumplió: el panel NO DEBE tener catálogo de motivos ni acciones específicas sobre la foto.

Estos datos personales completos —incluida la foto— DEBEN verse únicamente dentro del panel con sesión válida: NO DEBEN aparecer en ninguna página pública ni en el log del servidor, y la dirección con la que el panel muestra la foto de un registro no publicado NO DEBE servir nada sin sesión válida. Si el registro no existe, el detalle DEBE responder como no encontrado, sin sugerir nada.

#### Scenario: detalle completo

- **WHEN** el admin abre el detalle de un registro que llenó todos los campos y subió foto
- **THEN** ve todos los datos capturados, la foto bajo el rótulo "Foto del negocio" en un tamaño que le permite juzgarla, y además el estado, el origen, la fecha de registro y la fecha del consentimiento

#### Scenario: detalle de un registro con solo obligatorios

- **WHEN** el admin abre el detalle de un registro que solo llenó los 5 obligatorios
- **THEN** ve esos datos, los opcionales aparecen como no capturados y donde iría la foto dice "Sin foto", sin inventar contenido

#### Scenario: la foto del registro en revisión no sale del panel

- **WHEN** alguien sin sesión pide la dirección con la que el panel muestra la foto de un registro en `en_revision`
- **THEN** no recibe la imagen, sino la misma respuesta de no encontrado que daría el sitio público, y la respuesta no confirma que ese registro exista

#### Scenario: los datos personales no salen del panel

- **WHEN** se revisan las páginas públicas y el log del servidor mientras hay registros en la cola
- **THEN** el WhatsApp, el teléfono fijo, la dirección y la foto de un registro no publicado no aparecen en ninguno de los dos

#### Scenario: registro inexistente

- **WHEN** el admin con sesión abre el detalle de un identificador que no existe
- **THEN** ve la página de no encontrado, sin sugerencias ni datos de otros registros

#### Scenario: rechazar por la foto usa el motivo libre de siempre

- **WHEN** el admin ve una foto que incumple la política del PRD §6.1 y rechaza el registro escribiendo el motivo
- **THEN** el rechazo funciona exactamente igual que cualquier otro: se guarda el motivo con su fecha y se ofrece avisarle al negocio por WhatsApp
