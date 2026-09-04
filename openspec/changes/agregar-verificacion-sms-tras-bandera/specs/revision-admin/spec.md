# Delta de spec: revision-admin

## MODIFIED Requirements

### Requirement: Cola de revisión con los registros pendientes, más antiguos primero

La cola DEBE ser la pantalla principal del panel, encabezada con el texto literal "Registros por revisar", y listar únicamente los negocios en estado `en_revision`, ordenados del más antiguo al más reciente (el que lleva más tiempo esperando, arriba), porque la meta operativa es responder cada registro en menos de 48 horas (PRD §10). Cada renglón DEBE mostrar el nombre del negocio, su colonia (la del catálogo o el texto libre que capturó), desde cuándo espera y una entrada al detalle con el texto "Revisar". Los negocios `publicado` y `rechazado` NO DEBEN aparecer en la cola. Con la cola vacía DEBE mostrarse el texto literal "No hay registros esperando. Todo al día."

**La espera se cuenta desde que el registro entró a la cola**, que es la más reciente entre su fecha de registro y su fecha de despublicación: una ficha que estuvo publicada meses y se despublicó hoy lleva esperando desde hoy, no desde que se registró. Ese mismo reloj DEBE mandar el orden de la cola, para que la espera que se muestra y la posición del renglón no se contradigan. Los negocios que llegaron a la cola por una despublicación DEBEN distinguirse de los registros nuevos con la etiqueta literal "Ya estaba publicada, la despublicaste" en su renglón, para que el admin no los confunda con altas por revisar; el criterio de espera sigue siendo el mismo para todos, sin secciones aparte.

**El renglón de un registro cuyo número quedó verificado por SMS DEBE traer la etiqueta literal "Número verificado por SMS"** (ADR-011), para que el admin sepa de un vistazo qué paso se ahorra antes de abrir el detalle. Esa etiqueta DEBE aparecer **solo** cuando la ficha trae su fecha de verificación: un registro sin verificar NO DEBE mostrar ninguna etiqueta ni ningún hueco en su lugar, ni siquiera con la capacidad de verificación encendida, porque la cola es una lista de pendientes y no un tablero de estados. Como con la capacidad apagada ninguna ficha se verifica, la cola del lanzamiento se ve exactamente como se ve hoy.

La verificación NO DEBE alterar nada más de la cola: ni el orden, ni el conteo de atrasados, ni qué registros aparecen. Una ficha verificada espera su turno como cualquier otra.

#### Scenario: orden de la cola

- **WHEN** el admin abre la cola con tres registros pendientes que llegaron en días distintos
- **THEN** los ve del más antiguo al más reciente, cada uno con su nombre, su colonia, desde cuándo espera y su entrada "Revisar"

#### Scenario: la cola solo trae pendientes

- **WHEN** en la base hay negocios en `en_revision`, `publicado` y `rechazado`
- **THEN** la cola muestra únicamente los `en_revision`

#### Scenario: cola vacía

- **WHEN** no hay ningún registro en `en_revision`
- **THEN** el admin ve "No hay registros esperando. Todo al día." en lugar de una lista vacía

#### Scenario: una ficha despublicada aparece marcada y con su espera nueva

- **WHEN** el admin despublica un negocio que se había registrado hace ocho meses y vuelve a la cola
- **THEN** ese renglón dice que lleva esperando desde la despublicación (no desde su registro), trae la etiqueta "Ya estaba publicada, la despublicaste" y se ordena por esa espera nueva

#### Scenario: una ficha despublicada y luego reenviada cuenta desde el reenvío

- **WHEN** una ficha despublicada se rechaza, el negocio corrige sus datos y vuelve a enviar el formulario
- **THEN** su renglón cuenta la espera desde el reenvío, que es lo más reciente que le pasó, y no desde la despublicación anterior

#### Scenario: renglón con el número verificado

- **WHEN** el admin abre la cola y uno de los registros pendientes verificó su número por SMS
- **THEN** ese renglón trae la etiqueta "Número verificado por SMS", los demás no traen ninguna etiqueta de verificación, y el orden de la cola es el mismo que sin ella

#### Scenario: la cola del lanzamiento no cambia

- **WHEN** el admin abre la cola con la capacidad de verificación apagada
- **THEN** ve exactamente lo que ve hoy: ninguna etiqueta ni texto nuevo sobre verificación en ningún renglón

### Requirement: Detalle del registro con todos los datos capturados, solo dentro del panel

El detalle de un registro DEBE mostrar todo lo que el negocio capturó —nombre, categoría, WhatsApp, colonia (de catálogo o texto libre), qué ofrece, si hace entregas o va a domicilio, teléfono fijo, dirección o referencias, horario, la página que registró y **la foto que subió**— más los datos internos que el admin necesita para operar: estado, origen, fecha de registro y constancia del consentimiento del aviso de privacidad (evidencia ante la LFPDPPP, PRD §8). **Si la ficha estuvo publicada y se despublicó, el detalle DEBE mostrar además cuándo y por qué se despublicó**, con los rótulos literales "Cuándo la despublicaste" y "Por qué la despublicaste"; si nunca se despublicó, esos rótulos NO DEBEN aparecer. La foto DEBE verse lo bastante grande para poder juzgarla contra la política del PRD §6.1 (del local, los productos o el trabajo; sin personas reconocibles) antes de aprobar o rechazar, bajo el rótulo literal "Foto del negocio"; si el registro no trae foto, DEBE decirlo con el texto literal "Sin foto". El motivo de rechazo libre que ya existe basta para explicarle al negocio por qué su foto no cumplió: el panel NO DEBE tener catálogo de motivos ni acciones específicas sobre la foto.

**El detalle DEBE decir, junto al WhatsApp, si ese número está verificado por SMS** (ADR-011), con dos textos y una regla de aparición que respeta el fail-safe de la capacidad:

- Si la ficha trae su fecha de verificación, el detalle DEBE mostrarla **siempre**, esté la capacidad encendida o apagada, con el texto literal "Número verificado por SMS el 4 de septiembre de 2026" (la fecha con la misma forma que la constancia del consentimiento). Un hecho comprobado no se borra porque después se apague un interruptor.
- Si la ficha **no** trae esa fecha y la capacidad está **encendida**, el detalle DEBE mostrar el texto literal "Sin verificar — confirma por WhatsApp como siempre".
- Si la ficha no trae esa fecha y la capacidad está **apagada** —el estado del lanzamiento—, el detalle NO DEBE mostrar ninguna de las dos líneas ni ningún hueco en su lugar: se ve exactamente como se ve hoy.

La verificación por SMS le ahorra al admin el paso de confirmar el número, **no lo sustituye en la decisión**: el detalle DEBE seguir ofreciendo las mismas acciones para el mismo estado, con los mismos rótulos y en el mismo orden, y el botón "Escribirle por WhatsApp" DEBE seguir apareciendo igual para una ficha verificada, porque la conversación sigue siendo la evidencia de consentimiento y el filtro de moderación (PRD §6.3). Ninguna ficha se publica por haber verificado su número.

La constancia del consentimiento DEBE mostrarse completa: la fecha y, entre paréntesis, la versión del aviso que se aceptó, con la forma "3 de septiembre de 2026 (versión 1)". Si la ficha es anterior al versionado y no tiene versión registrada, DEBE decirlo con el texto literal "versión no registrada" en lugar de la versión, nunca inventar una. Cuando la ficha además tiene una reaceptación —porque se reenvió cuando ya estaba vigente una versión posterior— el detalle DEBE mostrarla como un dato propio, con la etiqueta literal "El reenvío aceptó la versión 1 del aviso" (donde `1` es la versión reaceptada) y, como valor, la fecha de ese reenvío; si no la tiene, esa línea no aparece. La etiqueta describe el hecho comprobable y NO DEBE atribuirle el acto al titular: quien reenvía el formulario público es un actor no autenticado, que es la misma razón por la que la constancia original no se sustituye. Tampoco DEBE afirmar por su cuenta que la versión es "más nueva": eso lo garantiza la regla de escritura, que solo anota la reaceptación cuando la versión vigente es posterior (`registro-negocio`).

Estos datos personales completos —incluida la foto— DEBEN verse únicamente dentro del panel con sesión válida: NO DEBEN aparecer en ninguna página pública ni en el log del servidor, y la dirección con la que el panel muestra la foto de un registro no publicado NO DEBE servir nada sin sesión válida. Si el registro no existe, el detalle DEBE responder como no encontrado, sin sugerir nada.

#### Scenario: detalle completo

- **WHEN** el admin abre el detalle de un registro que llenó todos los campos y subió foto
- **THEN** ve todos los datos capturados, la foto bajo el rótulo "Foto del negocio" en un tamaño que le permite juzgarla, y además el estado, el origen, la fecha de registro y la constancia del consentimiento con su fecha y su versión

#### Scenario: registro con el número verificado

- **WHEN** el admin abre el detalle de un registro que confirmó su código el 4 de septiembre de 2026
- **THEN** ve junto al WhatsApp "Número verificado por SMS el 4 de septiembre de 2026" y sigue viendo el botón "Escribirle por WhatsApp" y las mismas acciones de aprobar y rechazar de siempre

#### Scenario: registro sin verificar con la capacidad encendida

- **WHEN** el admin abre el detalle de un registro sin verificar, con la capacidad de verificación encendida
- **THEN** ve "Sin verificar — confirma por WhatsApp como siempre" junto al WhatsApp

#### Scenario: el detalle del lanzamiento no cambia

- **WHEN** el admin abre el detalle de un registro sin verificar con la capacidad apagada
- **THEN** no ve ninguna de las dos líneas de verificación ni ningún hueco donde irían

#### Scenario: la verificación no se borra al apagar la bandera

- **WHEN** una ficha verificó su número y después se apaga la capacidad
- **THEN** su detalle sigue mostrando "Número verificado por SMS el 4 de septiembre de 2026", porque es un hecho ya ocurrido

#### Scenario: verificar no adelanta la decisión

- **WHEN** el admin abre el detalle de un registro verificado en `en_revision`
- **THEN** la ficha sigue sin publicarse, ve los formularios de aprobar y rechazar completos —giros, colonia y origen incluidos— y nada aparece precargado ni resuelto por la verificación

#### Scenario: registro anterior al versionado

- **WHEN** el admin abre el detalle de una ficha registrada antes de que el aviso tuviera versión
- **THEN** ve la fecha del consentimiento con "versión no registrada", sin ninguna versión inventada

#### Scenario: registro cuyo reenvío aceptó una versión posterior

- **WHEN** el admin abre el detalle de una ficha que se reenvió cuando ya estaba vigente una versión posterior del aviso
- **THEN** ve la constancia original con su fecha y su versión, y además la línea "El reenvío aceptó la versión 2 del aviso" con la fecha de ese reenvío, sin que se le atribuya el acto al titular

#### Scenario: detalle de un registro con solo obligatorios

- **WHEN** el admin abre el detalle de un registro que solo llenó los 5 obligatorios
- **THEN** ve esos datos, los opcionales aparecen como no capturados y donde iría la foto dice "Sin foto", sin inventar contenido

#### Scenario: detalle de una ficha despublicada

- **WHEN** el admin abre el detalle de un negocio que despublicó ayer con el motivo "El negocio cerró"
- **THEN** ve "Cuándo la despublicaste" con la fecha de ayer y "Por qué la despublicaste" con "El negocio cerró", además de la fecha de su última publicación

#### Scenario: detalle de una ficha que nunca se despublicó

- **WHEN** el admin abre el detalle de un registro que nunca estuvo despublicado
- **THEN** no ve los rótulos de la despublicación ni ningún hueco vacío en su lugar

#### Scenario: la foto del registro en revisión no sale del panel

- **WHEN** alguien sin sesión pide la dirección con la que el panel muestra la foto de un registro en `en_revision`
- **THEN** no recibe la imagen, sino la misma respuesta de no encontrado que daría el sitio público, y la respuesta no confirma que ese registro exista

#### Scenario: los datos personales no salen del panel

- **WHEN** se revisan las páginas públicas y el log del servidor mientras hay registros en la cola
- **THEN** el WhatsApp, el teléfono fijo, la dirección, la foto, la versión del consentimiento y la marca de verificación de un registro no publicado no aparecen en ninguno de los dos

#### Scenario: registro inexistente

- **WHEN** el admin con sesión abre el detalle de un identificador que no existe
- **THEN** ve la página de no encontrado, sin sugerencias ni datos de otros registros

#### Scenario: rechazar por la foto usa el motivo libre de siempre

- **WHEN** el admin ve una foto que incumple la política del PRD §6.1 y rechaza el registro escribiendo el motivo
- **THEN** el rechazo funciona exactamente igual que cualquier otro: se guarda el motivo con su fecha y se ofrece avisarle al negocio por WhatsApp
