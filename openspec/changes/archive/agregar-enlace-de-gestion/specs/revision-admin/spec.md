# Delta de spec: revision-admin

## ADDED Requirements

### Requirement: Aprobar un registro genera su enlace de gestión, único e irrepetible

Al aprobar un registro, la misma transición que publica la ficha DEBE generar su enlace de gestión (PRD §6.4): un token criptográficamente aleatorio de al menos 256 bits, distinto en cada generación, del que la base guarda solo la huella (capacidad `modelo-datos`). Ninguna ficha publicada DEBE quedarse sin enlace, y dos negocios NUNCA DEBEN compartir token. Una aprobación repetida sobre un registro ya resuelto NO DEBE generar un token nuevo (invalidaría el que el admin ya mandó): sigue mostrando "Este registro ya lo habías resuelto." El detalle de un negocio publicado DEBE indicar que tiene enlace y desde cuándo, pero **no DEBE mostrar el enlace en sí**: el panel no lo conoce, porque solo guarda su huella (`design.md` §3).

#### Scenario: cada aprobación estrena enlace

- **WHEN** el admin aprueba dos registros distintos
- **THEN** cada negocio queda con su propio enlace de gestión y los dos tokens son distintos entre sí

#### Scenario: el token no se puede adivinar

- **WHEN** se revisan los tokens generados
- **THEN** provienen de una fuente aleatoria criptográfica, tienen al menos 256 bits de entropía y no se derivan del nombre, del identificador, del número ni de la fecha del negocio

#### Scenario: aprobar dos veces no cambia el enlace

- **WHEN** el admin manda la misma aprobación desde una pestaña que tenía abierta
- **THEN** ve "Este registro ya lo habías resuelto." y el enlace que ya había mandado sigue siendo el válido

#### Scenario: el panel no muestra el enlace vigente

- **WHEN** el admin abre el detalle de un negocio publicado
- **THEN** lee que ese negocio tiene enlace de gestión y desde cuándo, sin que el enlace ni el token aparezcan en la pantalla ni en el HTML de la respuesta

### Requirement: El detalle de una edición compara lo publicado con lo propuesto

El detalle de una edición DEBE encabezarse con el texto literal "Cambios por revisar" y mostrar, campo por campo, **lo que está publicado y lo que el negocio quiere cambiar**, bajo los rótulos literales "Lo que está publicado" y "Lo que quiere cambiar", marcando con el texto literal "Cambió" cada campo cuyo valor propuesto es distinto del publicado. Los campos que no cambian DEBEN verse igual, sin marca, para que el admin no tenga que adivinar qué está mirando. La marca NO DEBE depender solo del color: DEBE ser legible como texto.

Si la edición propone un WhatsApp distinto, el detalle DEBE mostrar los dos números y advertirlo con el texto literal "Ojo: está cambiando su WhatsApp. Confirma con el número nuevo antes de aplicar.", y el botón "Escribirle por WhatsApp" DEBE abrir la conversación con el **número propuesto** (es a quien hay que verificar), con la misma plantilla de verificación del PRD §6.3. Estos datos personales completos DEBEN verse únicamente dentro del panel con sesión válida.

#### Scenario: comparación campo por campo

- **WHEN** el admin abre una edición que solo cambia el horario y la dirección
- **THEN** ve "Cambios por revisar", las columnas "Lo que está publicado" y "Lo que quiere cambiar", la marca "Cambió" junto al horario y a la dirección, y el resto de los campos sin marca

#### Scenario: cambio de WhatsApp advertido

- **WHEN** el admin abre una edición que propone un número de WhatsApp distinto del publicado
- **THEN** ve los dos números, la advertencia "Ojo: está cambiando su WhatsApp. Confirma con el número nuevo antes de aplicar." y el botón "Escribirle por WhatsApp" abre la conversación con el número nuevo

#### Scenario: la marca se lee, no solo se ve

- **WHEN** el admin revisa la edición en el celular o con lector de pantalla
- **THEN** entiende qué campos cambian por su texto, sin depender de un color

#### Scenario: edición inexistente

- **WHEN** el admin con sesión abre el detalle de una edición que no existe
- **THEN** ve la página de no encontrado, sin sugerencias ni datos de otros negocios

### Requirement: Aplicar la edición actualiza la ficha publicada y solo eso

Desde el detalle de la edición, el admin DEBE poder aplicarla en una sola acción con el botón literal "Aplicar los cambios", que copia a la ficha publicada **exactamente los campos editables** de la edición —nombre, categoría, WhatsApp, colonia (de catálogo o texto libre), qué ofrece, entregas a domicilio, teléfono fijo, dirección o referencias con su pin, horario y página— y nada más. El estado, el origen, los giros asignados, la fecha de publicación, la fecha de registro, la constancia del consentimiento y el enlace de gestión DEBEN quedar intactos: aplicar una edición NO DEBE despublicar, ni volver a poner en revisión, ni regenerar el enlace, ni obligar al negocio a re-consentir. Las versiones normalizadas de búsqueda DEBEN recalcularse, para que la ficha se siga encontrando por lo que ahora dice.

Si el WhatsApp propuesto ya lo tiene otra ficha en el momento de aplicar, la edición NO DEBE aplicarse y el panel DEBE decirlo con el texto literal "Ese número ya está en otra ficha: no se pudieron aplicar los cambios.", dejando la edición pendiente para que el admin la resuelva. Aplicada la edición, el panel DEBE confirmar con "Listo, la ficha ya se actualizó." y ofrecer un botón "Avisarle por WhatsApp" con el mensaje prellenado, literalmente: "¡Listo! Ya actualizamos la ficha de «<nombre del negocio>» en NecesitoUno Tizayuca. Así quedó: <link de la ficha>". El cambio DEBE verse en el directorio público de inmediato.

#### Scenario: aplicar los cambios

- **WHEN** el admin toca "Aplicar los cambios" en una edición que cambia el horario de "Tacos del Güero"
- **THEN** ve "Listo, la ficha ya se actualizó.", la ficha pública muestra el horario nuevo y el negocio conserva su estado `publicado`, su origen, sus giros y su fecha de publicación

#### Scenario: aplicar no toca lo que no es editable

- **WHEN** se comparan el negocio antes y después de aplicar una edición
- **THEN** su estado, su origen, sus giros, su fecha de publicación, su fecha de registro, su constancia de consentimiento y su enlace de gestión son idénticos

#### Scenario: aviso de que la ficha ya se actualizó

- **WHEN** el admin acaba de aplicar la edición de "Estética Lupita"
- **THEN** ve un botón "Avisarle por WhatsApp" con el mensaje "¡Listo! Ya actualizamos la ficha de «Estética Lupita» en NecesitoUno Tizayuca. Así quedó: <link de la ficha>" ya escrito, sin enviarse

#### Scenario: el número propuesto se lo ganó otra ficha

- **WHEN** el admin aplica una edición cuyo WhatsApp propuesto ya quedó publicado en otra ficha
- **THEN** no se aplica nada, ve "Ese número ya está en otra ficha: no se pudieron aplicar los cambios." y la edición sigue pendiente

#### Scenario: la ficha editada se sigue encontrando

- **WHEN** se aplica una edición que cambia el nombre a "Plomería Güicho"
- **THEN** un vecino que busca "plomeria" encuentra ese negocio

### Requirement: Descartar la edición exige motivo, no toca la ficha y ofrece avisar por WhatsApp

Desde el detalle de la edición, el admin DEBE poder descartarla escribiendo obligatoriamente el motivo, bajo el rótulo literal "¿Por qué no aplicas los cambios?" y con el botón "Descartar los cambios". Sin motivo, el descarte NO DEBE ejecutarse y DEBE mostrarse el texto literal "Escribe por qué descartas los cambios". Descartar NO DEBE modificar ni un dato de la ficha publicada, que sigue exactamente como estaba, ni cambiar su estado, ni invalidar el enlace de gestión: el negocio puede corregir y volver a mandar cambios con el mismo enlace. El sistema DEBE guardar el motivo y la fecha del descarte, y el panel DEBE confirmar con "Cambios descartados." y ofrecer un botón "Avisarle por WhatsApp" con el mensaje prellenado, literalmente: "Hola, revisamos los cambios que mandaste para «<nombre del negocio>» en NecesitoUno Tizayuca y por ahora no los pudimos aplicar: <motivo>. Tu ficha sigue publicada como estaba y puedes mandarlos otra vez con tu mismo enlace."

#### Scenario: descarte con motivo

- **WHEN** el admin escribe "El texto que pusiste en «¿Qué ofreces?» no lo podemos publicar" y toca "Descartar los cambios"
- **THEN** la edición queda descartada con ese motivo y su fecha, sale de la cola, y la ficha pública sigue idéntica

#### Scenario: descarte sin motivo

- **WHEN** el admin toca "Descartar los cambios" con el motivo vacío
- **THEN** no cambia nada en la base y ve "Escribe por qué descartas los cambios"

#### Scenario: aviso del descarte por WhatsApp

- **WHEN** el admin acaba de descartar los cambios de "Préstamos Rápidos" con el motivo "No publicamos préstamos informales"
- **THEN** ve "Cambios descartados." y un botón "Avisarle por WhatsApp" con el mensaje "Hola, revisamos los cambios que mandaste para «Préstamos Rápidos» en NecesitoUno Tizayuca y por ahora no los pudimos aplicar: No publicamos préstamos informales. Tu ficha sigue publicada como estaba y puedes mandarlos otra vez con tu mismo enlace." ya escrito

#### Scenario: el enlace sigue sirviendo tras un descarte

- **WHEN** el dueño abre su enlace de gestión después de que le descartaron unos cambios
- **THEN** el enlace funciona igual y el formulario aparece prellenado con lo que está publicado

### Requirement: Una edición se resuelve una sola vez y solo si sigue siendo la última

Aplicar y descartar solo DEBEN surtir efecto sobre la edición **que el admin tenía enfrente** y mientras siga pendiente. Si ya la resolvió —doble clic, dos pestañas—, la segunda acción NO DEBE aplicarse y el panel DEBE decirlo con el texto literal "Estos cambios ya los habías resuelto." Si mientras tanto el negocio mandó cambios más nuevos que reemplazaron a esos, la acción tampoco DEBE aplicarse y el panel DEBE decirlo con el texto literal "Estos cambios ya no son los últimos: el negocio mandó otros más nuevos.", dejando la edición nueva esperando en la cola. Recargar la pantalla posterior a una resolución NO DEBE repetirla.

#### Scenario: doble aplicación

- **WHEN** el admin aplica una edición y vuelve a mandar la misma acción desde otra pestaña
- **THEN** la ficha conserva lo aplicado la primera vez y ve "Estos cambios ya los habías resuelto."

#### Scenario: el negocio mandó otros mientras tanto

- **WHEN** el admin abre una edición, el negocio manda cambios nuevos que la reemplazan, y entonces el admin toca "Aplicar los cambios"
- **THEN** no se aplica nada, ve "Estos cambios ya no son los últimos: el negocio mandó otros más nuevos." y en la cola queda la edición nueva por revisar

#### Scenario: recargar después de resolver

- **WHEN** el admin recarga la pantalla que confirma que aplicó o descartó unos cambios
- **THEN** no se vuelve a ejecutar ninguna acción

### Requirement: El admin puede generar un enlace nuevo, y el anterior deja de servir

El detalle de un negocio publicado DEBE ofrecer un botón con el texto literal "Generar un enlace nuevo" (PRD §6.4: cuando hay sospecha de que alguien más tiene el enlace, o cuando el dueño lo perdió y no aparece en el chat). Al usarlo, el sistema DEBE generar un token nuevo y **el anterior DEBE dejar de funcionar de inmediato**, respondiendo el mismo 404 que un enlace inventado. El panel DEBE confirmar con el texto literal "Listo, el enlace anterior ya no sirve." y ofrecer un botón "Mandarle el enlace por WhatsApp" con el mensaje prellenado, literalmente: "Hola, te mandamos un enlace nuevo para editar tu ficha de «<nombre del negocio>» en NecesitoUno Tizayuca: <enlace de gestión>. El anterior ya no sirve. Guarda este mensaje (puedes destacarlo con la estrella), con ese enlace actualizas tus datos cuando quieras." Ese es el **único momento** en que el enlace se muestra: si el admin sale de esa pantalla sin mandarlo, tiene que generar otro. Regenerar NO DEBE tocar los datos de la ficha ni las ediciones pendientes que ya estuvieran esperando.

#### Scenario: regenerar invalida el anterior

- **WHEN** el admin toca "Generar un enlace nuevo" en el detalle de un negocio
- **THEN** ve "Listo, el enlace anterior ya no sirve.", el enlace viejo responde 404 y el nuevo abre el modo edición de esa misma ficha

#### Scenario: mandar el enlace nuevo

- **WHEN** el admin acaba de generar el enlace de "Tacos del Güero"
- **THEN** ve un botón "Mandarle el enlace por WhatsApp" con el mensaje "Hola, te mandamos un enlace nuevo para editar tu ficha de «Tacos del Güero» en NecesitoUno Tizayuca: <enlace de gestión>. El anterior ya no sirve. Guarda este mensaje (puedes destacarlo con la estrella), con ese enlace actualizas tus datos cuando quieras." ya escrito

#### Scenario: el enlace se muestra una sola vez

- **WHEN** el admin sale de la pantalla de confirmación y vuelve al detalle del negocio
- **THEN** el enlace ya no aparece en ninguna pantalla del panel, y para volver a mandarlo tiene que generar otro

#### Scenario: regenerar no toca la ficha ni la cola

- **WHEN** el admin genera un enlace nuevo para un negocio que tiene una edición pendiente
- **THEN** los datos de la ficha no cambian y la edición sigue esperando en la cola

## MODIFIED Requirements

### Requirement: Cola de revisión con los registros pendientes, más antiguos primero

La cola DEBE ser la pantalla principal del panel, encabezada con el texto literal "Registros por revisar", y listar **dos cosas juntas**: los negocios en estado `en_revision` y las ediciones que esperan revisión (PRD §6.4: los cambios "entran a la misma cola de revisión"). El orden DEBE ser del más antiguo al más reciente según cuándo entró cada cosa a la cola —para un alta, cuándo se registró; para una edición, cuándo la mandó el negocio—, porque la meta operativa es responder cada caso en menos de 48 horas (PRD §10).

Cada renglón DEBE distinguir de qué se trata con una etiqueta de texto, literalmente "Alta nueva" o "Edición", y mostrar el nombre del negocio, su colonia (la del catálogo o el texto libre que capturó), desde cuándo espera y una entrada con el texto "Revisar" hacia el detalle que corresponda. La distinción NO DEBE depender solo del color ni del orden: DEBE ser legible como texto. Los negocios `publicado` y `rechazado` NO DEBEN aparecer en la cola por sí mismos —solo a través de sus ediciones pendientes, si las tienen—, y las ediciones ya aplicadas o descartadas NO DEBEN aparecer. Con la cola vacía —sin altas y sin ediciones— DEBE mostrarse el texto literal "No hay registros esperando. Todo al día."

#### Scenario: orden de la cola mezclada

- **WHEN** el admin abre la cola con dos altas y una edición que llegaron en días distintos
- **THEN** los ve del más antiguo al más reciente sin importar de qué tipo sean, cada uno con su etiqueta "Alta nueva" o "Edición", su nombre, su colonia, desde cuándo espera y su entrada "Revisar"

#### Scenario: la edición lleva a su propio detalle

- **WHEN** el admin toca "Revisar" en un renglón etiquetado "Edición"
- **THEN** llega al detalle comparativo de esos cambios, no al detalle de un alta

#### Scenario: la cola solo trae lo pendiente

- **WHEN** en la base hay negocios en `en_revision`, `publicado` y `rechazado`, y ediciones pendientes, aplicadas y descartadas
- **THEN** la cola muestra únicamente los `en_revision` y las ediciones pendientes

#### Scenario: un negocio publicado con edición pendiente

- **WHEN** un negocio publicado manda cambios
- **THEN** aparece en la cola una sola vez, como "Edición", sin volver a aparecer como alta

#### Scenario: cola vacía

- **WHEN** no hay ningún registro en `en_revision` ni ninguna edición pendiente
- **THEN** el admin ve "No hay registros esperando. Todo al día." en lugar de una lista vacía

### Requirement: Indicador visible de los registros con más de 48 horas esperando

Todo renglón de la cola que lleve más de 48 horas esperando DEBE mostrarse con un indicador visible junto a él, con el texto literal "Lleva más de 48 horas", y la cola DEBE decir cuántos están en esa condición (PRD §10). El reloj de un alta cuenta desde su registro; el de una edición, **desde que el negocio la mandó**, y si el negocio la reemplaza por otra más nueva el reloj se reinicia con ella (lo que el admin tiene que revisar es lo nuevo). El indicador NO DEBE depender solo del color: DEBE ser legible como texto.

#### Scenario: registro atrasado

- **WHEN** un registro lleva 50 horas en la cola
- **THEN** su renglón muestra el indicador "Lleva más de 48 horas" y el conteo de atrasados de la cola lo incluye

#### Scenario: edición atrasada

- **WHEN** una edición lleva 50 horas esperando revisión
- **THEN** su renglón muestra el mismo indicador y también entra en el conteo de atrasados

#### Scenario: el reloj de la edición se reinicia al reemplazarla

- **WHEN** un negocio con una edición de 50 horas manda cambios nuevos que la reemplazan
- **THEN** el renglón de la cola deja de estar marcado como atrasado, porque lo que hay que revisar acaba de llegar

#### Scenario: registro dentro de la meta

- **WHEN** un registro lleva 3 horas en la cola
- **THEN** su renglón no muestra el indicador

#### Scenario: el indicador se lee, no solo se ve

- **WHEN** el admin revisa la cola en un celular o con lector de pantalla
- **THEN** el aviso de los registros atrasados se entiende por su texto, sin depender de un color

### Requirement: Toda pantalla y toda acción del panel exigen sesión válida

Cada página del panel y cada acción que escribe (aprobar, rechazar, **aplicar una edición, descartar una edición y generar un enlace nuevo**) DEBEN verificar la sesión antes de leer o escribir nada. Sin sesión válida, la respuesta DEBE ser una redirección a la pantalla de acceso, sin mostrar ni un dato del registro o de la edición —ni en la pantalla, ni en el HTML, ni en la URL de destino— y sin ejecutar ningún cambio en la base. Ninguna de estas acciones DEBE existir en ninguna superficie pública: el formulario de registro, el modo edición, los listados y las fichas no DEBEN poder cambiar el estado, el origen, los giros ni la colonia de un negocio, ni resolver ediciones, ni generar enlaces de gestión.

#### Scenario: cola sin sesión

- **WHEN** alguien sin sesión abre `/admin`
- **THEN** llega a la pantalla de acceso y en la respuesta no aparece ningún nombre, número de WhatsApp ni dato de ningún registro

#### Scenario: detalle de un registro sin sesión

- **WHEN** alguien sin sesión abre la URL del detalle de un registro concreto, con su identificador
- **THEN** llega a la pantalla de acceso, sin ver ningún dato de ese registro y sin que la respuesta confirme si ese identificador existe

#### Scenario: detalle de una edición sin sesión

- **WHEN** alguien sin sesión abre la URL del detalle de una edición, con su identificador
- **THEN** llega a la pantalla de acceso, sin ver ni un dato de lo publicado ni de lo propuesto

#### Scenario: aprobar sin sesión

- **WHEN** llega directamente al servidor una petición de aprobar un registro sin cookie de sesión válida
- **THEN** el registro sigue en `en_revision`, no se publica ninguna ficha, no se genera ningún enlace de gestión y la respuesta no trae datos del negocio

#### Scenario: rechazar sin sesión

- **WHEN** llega directamente al servidor una petición de rechazar un registro sin cookie de sesión válida
- **THEN** el registro no cambia de estado y no se guarda ningún motivo de rechazo

#### Scenario: resolver una edición sin sesión

- **WHEN** llegan directamente al servidor peticiones de aplicar y de descartar una edición sin cookie de sesión válida
- **THEN** la ficha publicada no cambia, la edición sigue pendiente y no se guarda ningún motivo de descarte

#### Scenario: generar un enlace sin sesión

- **WHEN** llega directamente al servidor una petición de generar un enlace nuevo sin cookie de sesión válida
- **THEN** el enlace del negocio no cambia, el que ya tenía sigue sirviendo y la respuesta no trae ningún token

#### Scenario: ninguna transición desde lo público

- **WHEN** se revisan las superficies públicas (formulario de registro, modo edición, listados y fichas)
- **THEN** ninguna permite cambiar estado, origen, giros ni colonia de un negocio, ni resolver una edición, ni generar un enlace de gestión

### Requirement: Al aprobar se ofrece avisarle al negocio por WhatsApp con el link de su ficha y su enlace de gestión

Después de aprobar, el panel DEBE confirmar con el texto literal "Ya quedó publicado." y ofrecer un botón "Avisarle por WhatsApp" que abra la conversación con ese negocio y un mensaje prellenado con el aviso, el link de su ficha pública y **su enlace de gestión con la instrucción del PRD §6.4**, literalmente: "¡Listo! Ya quedó publicado «<nombre del negocio>» en NecesitoUno Tizayuca. Esta es tu ficha: <link de la ficha> — compártela con tus clientes. Y este es tu enlace para editarla: <enlace de gestión> — guarda este mensaje (puedes destacarlo con la estrella), con ese enlace actualizas tus datos cuando quieras." Los dos links DEBEN ser URLs completas: la de la ficha, la misma que abriría cualquier vecino; la de gestión, la que abre el modo edición de esa ficha. Esta pantalla es **el único momento** en que el enlace de gestión se muestra en el panel (`design.md` §3): si el admin la abandona sin mandar el mensaje, para volver a tenerlo tiene que generar uno nuevo, con lo que el anterior deja de servir.

#### Scenario: aviso de publicación con los dos links

- **WHEN** el admin acaba de aprobar el registro de "Estética Lupita"
- **THEN** ve "Ya quedó publicado." y un botón "Avisarle por WhatsApp" que abre la conversación con ese negocio, con el mensaje "¡Listo! Ya quedó publicado «Estética Lupita» en NecesitoUno Tizayuca. Esta es tu ficha: <link de la ficha> — compártela con tus clientes. Y este es tu enlace para editarla: <enlace de gestión> — guarda este mensaje (puedes destacarlo con la estrella), con ese enlace actualizas tus datos cuando quieras." ya escrito, sin enviarse

#### Scenario: los dos links abren lo que prometen

- **WHEN** se abren los dos links que lleva ese mensaje
- **THEN** el primero carga la ficha pública de ese negocio y el segundo abre su formulario de edición prellenado

#### Scenario: el enlace no se queda a la vista

- **WHEN** el admin sale de la pantalla de confirmación y vuelve al detalle de ese negocio
- **THEN** el enlace de gestión ya no aparece en ninguna pantalla del panel

### Requirement: El panel se opera desde el celular y sin JavaScript de cliente innecesario

El panel DEBE ser mobile-first: cola, detalle del registro, **detalle comparativo de la edición** y todos los formularios (aprobar, rechazar, aplicar los cambios, descartar los cambios y generar un enlace nuevo) DEBEN verse completos y usables en un viewport de 390px, sin scroll horizontal, con áreas táctiles de al menos 44px y contraste AA (PRD §8). La comparación entre lo publicado y lo propuesto DEBE ser legible en esa pantalla, sin obligar al admin a desplazarse a los lados. Las pantallas del panel DEBEN ser Server Components y sus formularios DEBEN funcionar sin JavaScript de cliente, igual que el registro público.

#### Scenario: revisar desde el celular

- **WHEN** el admin abre la cola, el detalle de un registro, el detalle de una edición y los formularios de aprobar, rechazar, aplicar y descartar en un viewport de 390px
- **THEN** todo se ve completo y legible, sin scroll horizontal, y cada control tocable mide al menos 44px en su dimensión menor

#### Scenario: la comparación se lee en el celular

- **WHEN** el admin revisa en 390px una edición que cambia varios campos
- **THEN** entiende qué está publicado y qué se propone sin desplazarse horizontalmente

#### Scenario: el panel funciona sin JavaScript

- **WHEN** el admin entra, aprueba, rechaza, aplica una edición, la descarta y genera un enlace nuevo con el JavaScript de cliente deshabilitado
- **THEN** todas las acciones funcionan igual, porque cada una es un envío de formulario del servidor

#### Scenario: sin JS de cliente propio

- **WHEN** se revisan los archivos nuevos del panel
- **THEN** ninguno declara `"use client"` ni agrega un bundle de cliente propio
