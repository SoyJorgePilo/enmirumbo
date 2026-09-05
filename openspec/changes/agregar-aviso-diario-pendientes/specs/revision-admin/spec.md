# Delta de spec: revision-admin

## ADDED Requirements

### Requirement: Un aviso al día por correo cuando hay pendientes, y ninguno cuando no los hay

Cuando la cola de revisión tenga al menos un pendiente, el sistema DEBE mandar **un correo al día** al buzón del directorio, para que el admin no dependa de acordarse de abrir el panel (PRD §6.3, meta de responder cada registro en menos de 48 horas; PRD §11, "notificaciones de pendientes" como mitigación de la dependencia del admin). Si no hay ningún pendiente, NO DEBE mandarse nada: el silencio significa "todo al día", y un correo diario de "no hay nada" acabaría en la carpeta de ignorados junto con el que sí importa.

Lo que cuenta como pendiente es **exactamente lo que el admin ve esperando en el panel**, en sus tres tipos: los negocios en estado `en_revision` (altas nuevas, incluidas las fichas que volvieron a la cola por una despublicación), las ediciones que esperan revisión (PRD §6.4) y los **reportes sin atender** de la sección "Negocios reportados". Cualquiera de los tres, por sí solo, DEBE bastar para que el correo salga.

El conteo DEBE salir del mismo criterio que arma cada sección de la cola, no de una consulta paralela con reglas propias. Si el correo dijera un número y el panel mostrara otro, el admin dejaría de creerle al correo. En concreto:

- Dentro de la lista de registros por revisar, cada pendiente se cuenta **una sola vez y bajo el mismo tipo con el que aparece en el panel**: un negocio que ya está en la cola por sí mismo y además tiene una edición esperando cuenta uno, no dos.
- Los reportes se cuentan **aparte**, y son reportes, no negocios: un negocio con tres reportes sin atender suma tres. Que ese negocio también esté esperando revisión NO DEBE restarle nada a ninguno de los dos conteos, porque son dos trabajos distintos —la misma razón por la que la cola los pinta en dos secciones y no en una.

**El día es el de Tizayuca (UTC−6, sin horario de verano desde 2022), no el del reloj UTC del servidor.** Un segundo disparo de la tarea dentro del mismo día local NO DEBE mandar un segundo correo, aunque en UTC ya sea otro día. La marca del día NO DEBE necesitar tablas nuevas: se resuelve pidiéndole al proveedor que descarte un envío repetido con la misma marca (ver `design.md` §3).

Un intento que el proveedor **no llegó a aceptar** NO DEBE gastar el día: el siguiente disparo DEBE volver a intentar el correo de ese mismo día, porque si no, un fallo de red a la hora de la tarea dejaría al admin sin aviso hasta el día siguiente.

#### Scenario: hay pendientes de los tres tipos

- **WHEN** la tarea diaria corre con dos altas nuevas, una edición esperando revisión y dos reportes sin atender
- **THEN** llega un correo al buzón del directorio que dice que hay 2 altas nuevas, 1 edición y 2 reportes sin atender, con el enlace al panel

#### Scenario: el panel está al día

- **WHEN** la tarea diaria corre y no hay ningún negocio en `en_revision`, ninguna edición esperando ni ningún reporte sin atender
- **THEN** no llega ningún correo, y en el log queda que no había nada que avisar

#### Scenario: solo hay reportes sin atender

- **WHEN** la tarea corre sin altas ni ediciones esperando, pero con un reporte sin atender
- **THEN** el correo sale igual, porque un vecino que reportó una ficha también está esperando respuesta

#### Scenario: los conteos dicen lo mismo que la cola

- **WHEN** un negocio publicado manda cambios y otro negocio está en `en_revision` con una edición suya también esperando
- **THEN** el correo cuenta ese primero como edición y el segundo una sola vez, con el mismo tipo con el que el admin lo ve en la cola, sin sumar a nadie dos veces

#### Scenario: un negocio que espera revisión y además tiene reportes

- **WHEN** un negocio en `en_revision` tiene tres reportes sin atender
- **THEN** el correo lo cuenta como 1 alta nueva y además como 3 reportes sin atender, igual que la cola lo muestra en sus dos secciones

#### Scenario: dos disparos el mismo día

- **WHEN** la tarea programada se dispara dos veces el mismo día con pendientes en la cola
- **THEN** al buzón llega un solo correo, no dos

#### Scenario: dos disparos del mismo día de Tizayuca que en UTC son días distintos

- **WHEN** alguien dispara la tarea a las 20:00 y otra vez a las 23:00 hora de Tizayuca —que en UTC caen en dos fechas distintas— con pendientes en la cola
- **THEN** sigue llegando un solo correo, porque el día que cuenta es el local

#### Scenario: reintento después de un envío que no salió

- **WHEN** el envío del día falla porque el proveedor no responde, y la tarea se vuelve a disparar más tarde ese mismo día
- **THEN** el correo se intenta otra vez y, si esta vez sale, llega ese día

### Requirement: El correo dice cuántos hay, nunca quiénes son

El correo del aviso DEBE contener **solo conteos por tipo y el enlace al panel**. NO DEBE contener ningún dato de ningún negocio ni de ningún reporte: ni nombres, ni números de WhatsApp, ni teléfonos, ni direcciones, ni colonias, ni motivos o comentarios de reportes, ni identificadores de registro, de edición o de reporte, ni en el asunto, ni en el cuerpo, ni en la dirección del enlace. El correo viaja por servidores de un tercero y se queda guardado en un buzón: lo que no va dentro no hay que cuidarlo (LFPDPPP, PRD §8). Por la misma razón, lo que el sistema escriba en el log sobre este envío DEBEN ser conteos y estados, nunca datos de nadie.

El asunto DEBE ser, literalmente, "EnMiRumbo: 1 pendiente por revisar" cuando hay uno solo, y "EnMiRumbo: <n> pendientes por revisar" cuando hay más, donde `<n>` es la suma de los tres tipos.

El cuerpo DEBE ser texto plano y decir, literalmente:

```
Hay pendientes en la cola de EnMiRumbo:

Altas nuevas: <n>
Ediciones: <n>
Reportes sin atender: <n>

Entra al panel: <enlace al panel>

Acuérdate: la meta es contestarle a cada negocio en menos de 48 horas.

Este aviso lo manda solo el sistema, una vez al día y nada más cuando hay algo esperando.
```

**Solo DEBEN aparecer las líneas de los tipos que tienen al menos uno**, y siempre en ese orden: un día sin ediciones no lleva la línea "Ediciones: 0", porque un cero es ruido que el ojo tiene que descartar todas las mañanas. El enlace DEBE ser la dirección del panel armada con la URL pública del sitio (`<SITIO_URL>/admin`), la misma a la que el admin entra a diario.

El remitente DEBE presentarse como "EnMiRumbo" sobre la dirección configurada, para que el correo se reconozca de un vistazo en la bandeja. Ningún texto del correo DEBE usar la marca anterior ni la forma compuesta con la localidad (`layout-base`, guardián del rebrand).

#### Scenario: el correo de un día con los tres tipos

- **WHEN** hay 2 altas nuevas, 1 edición esperando y 2 reportes sin atender, y el correo sale
- **THEN** el asunto dice "EnMiRumbo: 5 pendientes por revisar" y el cuerpo trae "Hay pendientes en la cola de EnMiRumbo:", las líneas "Altas nuevas: 2", "Ediciones: 1" y "Reportes sin atender: 2" en ese orden, el enlace al panel, el recordatorio de las 48 horas y la explicación de por qué llegó ese correo

#### Scenario: un día con un solo pendiente

- **WHEN** lo único que espera es una edición
- **THEN** el asunto dice "EnMiRumbo: 1 pendiente por revisar" y el cuerpo trae la línea "Ediciones: 1" y ninguna línea de altas nuevas ni de reportes

#### Scenario: un día en el que solo hay reportes

- **WHEN** lo único que espera son 3 reportes sin atender
- **THEN** el asunto dice "EnMiRumbo: 3 pendientes por revisar" y el cuerpo trae solo la línea "Reportes sin atender: 3"

#### Scenario: el correo no trae datos de nadie

- **WHEN** se revisa un correo mandado un día en el que la cola tenía fichas con nombre, WhatsApp, colonia y foto, y un reporte con comentario escrito por un vecino
- **THEN** ni el asunto, ni el cuerpo, ni el enlace traen el nombre, el WhatsApp, la colonia, el comentario del reporte ni ningún identificador: solo números, el enlace al panel y los textos fijos

#### Scenario: el log del envío tampoco los trae

- **WHEN** se revisan los mensajes que el servidor escribe al mandar el aviso, y los que escribe cuando el envío falla
- **THEN** ninguno contiene datos de ningún negocio, ni la dirección del buzón destino completa, ni la credencial del proveedor

#### Scenario: el enlace lleva al panel de verdad

- **WHEN** el admin toca el enlace del correo desde su celular
- **THEN** llega a la pantalla de acceso del panel del sitio publicado, no a un `localhost` ni a una dirección de ejemplo
