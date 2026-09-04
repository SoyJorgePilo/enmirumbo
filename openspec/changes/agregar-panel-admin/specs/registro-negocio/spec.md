# Delta de spec: registro-negocio

## MODIFIED Requirements

### Requirement: Una sola ficha por número de WhatsApp

Si el WhatsApp normalizado ya tiene ficha en estado `en_revision` o `publicado`, el registro DEBE rechazarse y el formulario DEBE decirlo con el texto literal "Este número ya tiene una ficha registrada. Si es tu negocio, no hace falta registrarlo otra vez: te vamos a pasar por WhatsApp el enlace para editarlo." El flujo "Perdí mi enlace" es P1 (PRD §6.4) y aquí solo se menciona, sin enlace ni botón.

Si la ficha de ese número está en estado `rechazado`, el envío NO DEBE tratarse como duplicado: el negocio "puede corregir y volver a enviar" (PRD §6.3). En ese caso el sistema DEBE actualizar esa misma ficha con los datos del nuevo envío, regresarla a `en_revision`, dejar nulos la fecha y el motivo del rechazo anterior (si no, la purga de rechazados a los 90 días se llevaría un registro que ya está otra vez en la cola) y reiniciar el reloj de la espera, de modo que el indicador de 48 horas del panel cuente desde el reenvío. El dueño DEBE ver la misma pantalla de gracias que un registro nuevo. El sistema NO DEBE revelarle en ningún momento que su ficha estaba rechazada ni el motivo del rechazo: ese dato solo vive dentro del panel, y el formulario público es anónimo (cualquiera podría escribir un número ajeno). El reenvío sigue siendo un envío del formulario público: DEBE pasar por las mismas validaciones, por el campo trampa y por el límite de envíos por IP, y NO DEBE poder alterar el origen, los giros, el token de gestión ni la fecha de publicación de la ficha.

#### Scenario: número con ficha publicada

- **WHEN** el dueño envía un WhatsApp que ya tiene ficha publicada
- **THEN** no se crea un segundo negocio ni se toca la ficha existente, y ve el mensaje "Este número ya tiene una ficha registrada. Si es tu negocio, no hace falta registrarlo otra vez: te vamos a pasar por WhatsApp el enlace para editarlo." junto al campo de WhatsApp

#### Scenario: número con ficha en revisión

- **WHEN** el dueño envía un WhatsApp cuya ficha sigue esperando revisión
- **THEN** ve el mismo mensaje de número ya registrado y su ficha en cola no cambia

#### Scenario: reenvío tras un rechazo

- **WHEN** un negocio cuya ficha fue rechazada corrige sus datos y vuelve a enviar el formulario con el mismo número
- **THEN** ve la pantalla de gracias con el mensaje "¡Gracias! Tu negocio está en revisión. Te contactaremos por WhatsApp para confirmar tus datos antes de publicarlo.", su ficha queda con los datos nuevos en estado `en_revision`, sin fecha ni motivo de rechazo, y vuelve a aparecer en la cola del panel como recién llegada

#### Scenario: el formulario no delata el rechazo

- **WHEN** alguien envía el formulario con un número cuya ficha estaba rechazada
- **THEN** en ningún momento ve el motivo del rechazo ni ningún dato de la ficha anterior

#### Scenario: el reenvío no se autopublica

- **WHEN** un reenvío incluye campos extra como estado `publicado`, origen `siembra`, giros o fecha de publicación
- **THEN** esos valores se ignoran y la ficha queda en `en_revision`, con el origen que ya tenía, sin giros nuevos y sin fecha de publicación

#### Scenario: el reenvío pasa por las mismas defensas

- **WHEN** un reenvío llega con el campo trampa lleno, con la IP sin cupo o con un campo inválido
- **THEN** se trata exactamente igual que cualquier otro envío del formulario y la ficha rechazada no cambia

#### Scenario: duplicado escrito con otro formato

- **WHEN** un negocio ya publicado como "7711234567" se intenta registrar de nuevo como "+52 771 123 4567"
- **THEN** el sistema lo detecta como el mismo número y muestra el mismo mensaje, sin crear una segunda ficha

#### Scenario: carrera entre dos envíos simultáneos

- **WHEN** dos envíos con el mismo número llegan casi al mismo tiempo y el segundo choca con la unicidad de la base de datos
- **THEN** el usuario del segundo envío ve el mensaje de número ya registrado, no un error técnico
