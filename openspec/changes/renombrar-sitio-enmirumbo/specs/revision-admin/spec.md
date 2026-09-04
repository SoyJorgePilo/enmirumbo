# Delta: revision-admin

Los cuatro mensajes prellenados del panel se presentan al negocio con el nombre del directorio. Cambia la marca dentro de cada literal; no cambia ninguna otra palabra, ni cuándo aparece el botón, ni quién manda el mensaje (siempre la persona).

Regla de marca en los mensajes (resolución del fundador del 2026-09-04): el mensaje de **verificación** es el primer contacto con ese negocio, así que ahí se presenta como "EnMiRumbo, el directorio de negocios de Tizayuca"; los tres mensajes posteriores —publicación, rechazo y despublicación— llegan a alguien que ya recibió esa presentación y dicen "EnMiRumbo" a secas. No existe la forma compuesta "EnMiRumbo Tizayuca".

## MODIFIED Requirements

### Requirement: Botón de verificación que abre WhatsApp con mensaje prellenado

El detalle DEBE ofrecer un botón que abra la conversación de WhatsApp con el número que registró el negocio, con un mensaje ya escrito para hacer la verificación manual del PRD §6.3. El botón DEBE decir literalmente "Escribirle por WhatsApp" y el mensaje prellenado DEBE ser, literalmente: "Hola, te escribo de EnMiRumbo, el directorio de negocios de Tizayuca. Recibimos el registro de «<nombre del negocio>». ¿Nos confirmas que el negocio es tuyo y que este es tu WhatsApp?". El envío siempre lo hace la persona: el sistema NO DEBE mandar mensajes por su cuenta (PRD §6.6). Si el número guardado no se puede interpretar como un número mexicano de 10 dígitos, NO DEBE pintarse un enlace roto: el panel muestra el número tal como está guardado, sin botón.

#### Scenario: abrir la conversación de verificación

- **WHEN** el admin toca "Escribirle por WhatsApp" en el detalle del negocio "Tacos del Güero"
- **THEN** se abre WhatsApp con la conversación de ese número y el mensaje "Hola, te escribo de EnMiRumbo, el directorio de negocios de Tizayuca. Recibimos el registro de «Tacos del Güero». ¿Nos confirmas que el negocio es tuyo y que este es tu WhatsApp?" ya escrito, sin enviarse

#### Scenario: número que no se puede interpretar

- **WHEN** el registro tiene guardado un número que no se normaliza a 10 dígitos
- **THEN** el panel muestra el número tal cual, sin botón de WhatsApp y sin enlace roto

### Requirement: Al aprobar se ofrece avisarle al negocio por WhatsApp con el link de su ficha

Después de aprobar, el panel DEBE confirmar con el texto literal "Ya quedó publicado." y ofrecer un botón "Avisarle por WhatsApp" que abra la conversación con ese negocio y un mensaje prellenado con el aviso y el link de su ficha pública, literalmente: "¡Listo! Ya quedó publicado «<nombre del negocio>» en EnMiRumbo. Esta es tu ficha: <link de la ficha> — compártela con tus clientes." El link DEBE ser la URL completa de la ficha pública, la misma que abriría cualquier vecino. El enlace de gestión (PRD §6.4) NO entra en este mensaje.

#### Scenario: aviso de publicación

- **WHEN** el admin acaba de aprobar el registro de "Estética Lupita"
- **THEN** ve "Ya quedó publicado." y un botón "Avisarle por WhatsApp" que abre la conversación con ese negocio, con el mensaje "¡Listo! Ya quedó publicado «Estética Lupita» en EnMiRumbo. Esta es tu ficha: <link de la ficha> — compártela con tus clientes." ya escrito

#### Scenario: el link del aviso abre la ficha real

- **WHEN** se abre el link que lleva ese mensaje
- **THEN** carga la ficha pública de ese negocio, la misma a la que llega un vecino desde el listado

#### Scenario: sin enlace de gestión todavía

- **WHEN** se revisa el mensaje de aviso de publicación
- **THEN** no incluye ningún enlace de gestión ni promete uno

### Requirement: Rechazar exige motivo, lo guarda con su fecha y ofrece avisar por WhatsApp

Desde el detalle, el admin DEBE poder rechazar el registro escribiendo obligatoriamente el motivo, bajo el rótulo literal "¿Por qué lo rechazas?" y con el botón "Rechazar". El sistema DEBE guardar el estado `rechazado`, la fecha del rechazo y el motivo (los datos de los registros rechazados se eliminan a los 90 días, PRD §8: la fecha es lo que la purga programada usa para saber cuándo toca). Sin motivo, el rechazo NO DEBE ejecutarse y DEBE mostrarse el texto literal "Escribe por qué lo rechazas". Después de rechazar, el panel DEBE confirmar con "Registro rechazado." y ofrecer un botón "Avisarle por WhatsApp" con el mensaje prellenado, literalmente: "Hola, revisamos el registro de «<nombre del negocio>» en EnMiRumbo y por ahora no lo pudimos publicar: <motivo>. Si lo corriges, lo puedes volver a enviar desde el mismo formulario con este mismo número." Un negocio rechazado NO DEBE aparecer en ninguna página pública.

#### Scenario: rechazo con motivo

- **WHEN** el admin escribe "El número no contesta y no pudimos confirmar que el negocio exista" y toca "Rechazar"
- **THEN** el registro queda en estado `rechazado` con ese motivo y la fecha del rechazo guardados, y sale de la cola

#### Scenario: rechazo sin motivo

- **WHEN** el admin toca "Rechazar" con el motivo vacío
- **THEN** no cambia nada en la base y ve "Escribe por qué lo rechazas"

#### Scenario: aviso de rechazo por WhatsApp

- **WHEN** el admin acaba de rechazar el registro de "Préstamos Rápidos" con el motivo "No publicamos préstamos informales"
- **THEN** ve "Registro rechazado." y un botón "Avisarle por WhatsApp" con el mensaje "Hola, revisamos el registro de «Préstamos Rápidos» en EnMiRumbo y por ahora no lo pudimos publicar: No publicamos préstamos informales. Si lo corriges, lo puedes volver a enviar desde el mismo formulario con este mismo número." ya escrito

#### Scenario: el rechazado no se publica

- **WHEN** un vecino busca en el directorio un negocio que fue rechazado
- **THEN** no aparece en ningún listado y su ficha responde como no encontrada, igual que la de un negocio inexistente

### Requirement: Al despublicar se ofrece avisarle al negocio por WhatsApp

Después de despublicar, el panel DEBE confirmar con el texto literal "Ya la despublicaste." y ofrecer un botón "Avisarle por WhatsApp" que abra la conversación con ese negocio y un mensaje ya escrito, literalmente: "Hola, te escribo de EnMiRumbo. Bajamos del directorio la ficha de «<nombre del negocio>»: <motivo>. Si quieres que la volvamos a publicar o tienes alguna duda, contéstame por aquí." El motivo que viaja en el mensaje es el que el admin acaba de escribir. El envío siempre lo hace la persona: el sistema NO DEBE mandar mensajes por su cuenta (PRD §6.6). Si el número guardado no se puede interpretar como un número mexicano de 10 dígitos, NO DEBE pintarse un enlace roto: el panel muestra el número tal como está guardado, sin botón.

Esa pantalla DEBE existir únicamente para una despublicación que de verdad ocurrió: si el registro no está en `en_revision`, o no tiene fecha de despublicación, o su motivo está vacío, la pantalla NO DEBE mostrarse y el admin DEBE volver al detalle, sin que la respuesta filtre nada. Un mensaje con el motivo en blanco es un WhatsApp incorrecto hacia un tercero, que es justo lo que el panel existe para evitar.

#### Scenario: aviso de despublicación

- **WHEN** el admin acaba de despublicar "Tacos del Güero" con el motivo "El negocio cerró"
- **THEN** ve "Ya la despublicaste." y un botón "Avisarle por WhatsApp" que abre la conversación con ese negocio, con el mensaje "Hola, te escribo de EnMiRumbo. Bajamos del directorio la ficha de «Tacos del Güero»: El negocio cerró. Si quieres que la volvamos a publicar o tienes alguna duda, contéstame por aquí." ya escrito, sin enviarse

#### Scenario: número que no se puede interpretar al avisar de la despublicación

- **WHEN** el negocio despublicado tiene guardado un número que no se normaliza a 10 dígitos
- **THEN** el panel muestra el número tal cual, sin botón de WhatsApp y sin enlace roto

#### Scenario: la pantalla de confirmación no se abre sobre un alta nueva

- **WHEN** alguien con la sesión del panel abre la pantalla de "Ya la despublicaste." de un registro que llegó por el formulario público y nunca estuvo publicado
- **THEN** no la ve: vuelve al detalle de ese registro, sin ningún mensaje de WhatsApp cargado y sin que la respuesta traiga datos del negocio

## ADDED Requirements

### Requirement: Ningún mensaje del panel se presenta con la marca anterior

Todo mensaje de WhatsApp que el panel arme para que el admin se lo mande a un negocio DEBE nombrar al directorio como "EnMiRumbo", con el descriptor "el directorio de negocios de Tizayuca" solo en el mensaje de primer contacto. Ninguno DEBE quedarse con la marca anterior ni escribir la localidad pegada al nombre, incluidos los mensajes que otros changes agreguen después de este.

#### Scenario: se recorren todos los mensajes del panel

- **WHEN** se revisan los mensajes prellenados que el panel puede armar hoy —verificación, aviso de publicación, aviso de rechazo y aviso de despublicación—
- **THEN** el de verificación presenta al sitio como "EnMiRumbo, el directorio de negocios de Tizayuca", los otros tres dicen "EnMiRumbo" a secas, y ninguno menciona la marca anterior ni la forma compuesta
