# Spec: revision-admin

## Requirements

### Requirement: Acceso al panel con contraseña única de entorno y sesión firmada

El panel DEBE vivir bajo la ruta `/admin` y solo abrirse tras escribir la contraseña única definida en una variable de entorno del servidor (PRD §6.3), sin cuentas, sin correo y sin recuperación de contraseña. La pantalla de acceso DEBE encabezarse con el texto literal "Panel de revisión", pedir un solo campo con la etiqueta "Contraseña" y un botón "Entrar". Al acertar, el sistema DEBE crear una sesión sostenida por una cookie firmada por el servidor, con estos atributos: `HttpOnly`, `SameSite=Lax`, alcance limitado a la ruta del panel y `Secure` siempre que el sitio se sirva por HTTPS (en producción, siempre). La sesión DEBE caducar a las 8 horas. La contraseña NO DEBE viajar dentro de la cookie ni quedar en el log del servidor, ni siquiera parcialmente. El panel DEBE ofrecer un botón "Salir" que invalida la sesión. Intentos fallidos repetidos desde la misma procedencia DEBEN bloquearse temporalmente, con el mismo criterio anti-abuso del PRD §8. Los textos de la pantalla de acceso DEBEN ser, literalmente: "Contraseña incorrecta." al fallar, "Demasiados intentos. Espera unos minutos y vuelve a intentar." al agotar los intentos y "Cerraste sesión." al salir.

#### Scenario: entrar al panel con la contraseña correcta

- **WHEN** el admin abre `/admin` sin sesión, escribe la contraseña configurada y toca "Entrar"
- **THEN** llega a la cola de revisión y su navegador guarda una cookie de sesión marcada `HttpOnly` y `SameSite`, con alcance limitado a la ruta del panel, cuyo contenido no incluye la contraseña

#### Scenario: contraseña equivocada

- **WHEN** alguien escribe una contraseña distinta de la configurada
- **THEN** ve "Contraseña incorrecta.", no se crea ninguna sesión y no llega a ninguna pantalla del panel

#### Scenario: cookie manipulada o caducada

- **WHEN** alguien presenta una cookie de sesión con la firma alterada, firmada con otro secreto, o cuya caducidad de 8 horas ya pasó
- **THEN** el sistema la trata como si no hubiera sesión y lo manda a la pantalla de acceso

#### Scenario: salir del panel

- **WHEN** el admin toca "Salir"
- **THEN** ve "Cerraste sesión.", la cookie deja de servir y volver atrás en el navegador no vuelve a mostrar ninguna pantalla del panel

#### Scenario: intentos repetidos

- **WHEN** desde la misma procedencia llegan más intentos fallidos de los permitidos en la ventana configurada
- **THEN** los siguientes intentos se rechazan con "Demasiados intentos. Espera unos minutos y vuelve a intentar.", aunque la contraseña que se mande sea la correcta

#### Scenario: la contraseña no aparece en el log

- **WHEN** se revisan los mensajes que el servidor escribe durante un acceso exitoso y uno fallido
- **THEN** ninguno contiene la contraseña configurada ni la que se intentó, ni el contenido de la cookie

### Requirement: Sin contraseña configurada el panel no abre (fail-safe)

Si falta la variable de entorno de la contraseña, si está vacía, o si falta el secreto con el que se firman las sesiones, el panel NO DEBE abrirse para nadie: ninguna pantalla del panel se muestra, ninguna sesión se puede crear y ninguna transición de estado se puede ejecutar. La pantalla de acceso DEBE decirlo con el texto literal "El panel no está disponible por ahora." y el detalle de qué falta DEBE quedar solo en el log del servidor, nunca en la respuesta. El sistema NO DEBE inventar una contraseña por defecto ni dejar el panel abierto "solo en desarrollo".

#### Scenario: sin contraseña configurada

- **WHEN** el servidor corre sin la variable de entorno de la contraseña (o con ella vacía) y alguien abre `/admin`
- **THEN** ve "El panel no está disponible por ahora." y no hay ningún campo que le permita entrar

#### Scenario: sin secreto de firma

- **WHEN** el servidor corre con contraseña pero sin el secreto de las sesiones y alguien escribe la contraseña correcta
- **THEN** no se crea ninguna sesión y sigue viendo "El panel no está disponible por ahora."

#### Scenario: nada de contraseñas por defecto

- **WHEN** se revisa el código y la configuración del panel
- **THEN** no existe ninguna contraseña por defecto, ni un modo que salte el acceso en desarrollo, ni un valor de ejemplo que funcione como contraseña real

#### Scenario: ninguna transición sin configuración

- **WHEN** con el panel sin configurar se manda directamente una petición de aprobar o rechazar un registro
- **THEN** no cambia nada en la base y la respuesta no trae ningún dato del registro

### Requirement: Toda pantalla y toda acción del panel exigen sesión válida

Cada página del panel y cada acción sobre un registro —aprobar, rechazar, despublicar, marcar un reporte como atendido, borrar definitivamente y la pantalla que confirma el borrado— DEBEN verificar la sesión antes de leer o escribir nada. Sin sesión válida, la respuesta DEBE ser una redirección a la pantalla de acceso, sin mostrar ni un dato del registro ni de sus reportes —ni en la pantalla, ni en el HTML, ni en la URL de destino—, sin confirmar si ese identificador existe y sin ejecutar ningún cambio en la base. Ninguna de estas acciones DEBE existir en una superficie pública: el formulario de registro, los listados, las fichas y el formulario de reporte NO DEBEN poder cambiar el estado, el origen, los giros ni la colonia de un negocio, ni despublicarlo, ni borrarlo, ni marcar reportes como atendidos. El formulario público de reporte solo puede crear reportes en estado `pendiente`.

#### Scenario: cola sin sesión

- **WHEN** alguien sin sesión abre `/admin`
- **THEN** llega a la pantalla de acceso y en la respuesta no aparece ningún nombre, número de WhatsApp ni dato de ningún registro, ni ningún conteo de reportes

#### Scenario: detalle de un registro sin sesión

- **WHEN** alguien sin sesión abre la URL del detalle de un registro concreto, con su identificador
- **THEN** llega a la pantalla de acceso, sin ver ningún dato de ese registro ni de sus reportes, y sin que la respuesta confirme si ese identificador existe

#### Scenario: aprobar sin sesión

- **WHEN** llega directamente al servidor una petición de aprobar un registro sin cookie de sesión válida
- **THEN** el registro sigue en `en_revision`, no se publica ninguna ficha y la respuesta no trae datos del negocio

#### Scenario: rechazar sin sesión

- **WHEN** llega directamente al servidor una petición de rechazar un registro sin cookie de sesión válida
- **THEN** el registro no cambia de estado y no se guarda ningún motivo de rechazo

#### Scenario: despublicar sin sesión

- **WHEN** llega directamente al servidor una petición de despublicar un negocio sin cookie de sesión válida
- **THEN** el negocio sigue `publicado`, no se guarda motivo ni fecha de despublicación, su ficha sigue en el directorio y la respuesta no trae datos del negocio

#### Scenario: borrar sin sesión

- **WHEN** llega directamente al servidor una petición de borrado, con la palabra de confirmación y todo, sin cookie de sesión válida
- **THEN** el registro sigue existiendo completo y la respuesta no trae ningún dato suyo

#### Scenario: la pantalla de confirmación del borrado sin sesión

- **WHEN** alguien sin sesión abre la URL de la pantalla de confirmación del borrado de un registro concreto
- **THEN** llega a la pantalla de acceso, sin ver el nombre del negocio ni ningún otro dato, y sin que la respuesta confirme si ese identificador existe

#### Scenario: atender un reporte sin sesión

- **WHEN** llega directamente al servidor una petición de marcar un reporte como atendido sin cookie de sesión válida
- **THEN** el reporte sigue `pendiente`, sin fecha de atención, y la respuesta no trae su motivo, su comentario ni dato alguno del negocio

#### Scenario: ninguna transición desde lo público

- **WHEN** se revisan las superficies públicas (formulario de registro, listados, fichas y formulario de reporte)
- **THEN** ninguna permite cambiar estado, origen, giros ni colonia de un negocio, ni despublicarlo, ni borrarlo, ni marcar reportes como atendidos

### Requirement: El panel no se indexa ni se enlaza desde el sitio público

Las páginas del panel DEBEN pedir a los buscadores que no las indexen ni sigan sus enlaces (PRD §6.3: "ruta no indexada") y NO DEBEN estar enlazadas desde ninguna página pública del sitio: ni la home, ni el footer, ni el formulario, ni las fichas.

#### Scenario: metadata de no indexación

- **WHEN** se revisa la respuesta de cualquier pantalla del panel, incluida la de acceso
- **THEN** declara `noindex, nofollow`

#### Scenario: sin enlaces desde lo público

- **WHEN** se revisan la home, el formulario de registro, un listado, una ficha y el footer
- **THEN** ninguno enlaza al panel ni menciona su ruta

### Requirement: Cola de revisión con los registros pendientes, más antiguos primero

La cola DEBE ser la pantalla principal del panel, encabezada con el texto literal "Registros por revisar", y listar únicamente los negocios en estado `en_revision`, ordenados del más antiguo al más reciente (el que lleva más tiempo esperando, arriba), porque la meta operativa es responder cada registro en menos de 48 horas (PRD §10). Cada renglón DEBE mostrar el nombre del negocio, su colonia (la del catálogo o el texto libre que capturó), desde cuándo espera y una entrada al detalle con el texto "Revisar". Los negocios `publicado` y `rechazado` NO DEBEN aparecer en la cola. Con la cola vacía DEBE mostrarse el texto literal "No hay registros esperando. Todo al día."

**La espera se cuenta desde que el registro entró a la cola**, que es la más reciente entre su fecha de registro y su fecha de despublicación: una ficha que estuvo publicada meses y se despublicó hoy lleva esperando desde hoy, no desde que se registró. Ese mismo reloj DEBE mandar el orden de la cola, para que la espera que se muestra y la posición del renglón no se contradigan. Los negocios que llegaron a la cola por una despublicación DEBEN distinguirse de los registros nuevos con la etiqueta literal "Ya estaba publicada, la despublicaste" en su renglón, para que el admin no los confunda con altas por revisar; el criterio de espera sigue siendo el mismo para todos, sin secciones aparte.

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

### Requirement: Indicador visible de los registros con más de 48 horas esperando

Todo registro de la cola que lleve más de 48 horas **desde que entró a la cola** —su fecha de registro o, si es más reciente, la fecha en que se despublicó— DEBE mostrarse con un indicador visible junto a su renglón, con el texto literal "Lleva más de 48 horas", y la cola DEBE decir cuántos están en esa condición (PRD §10: si el tiempo entre registro y publicación se pasa de 48 horas de forma sostenida, hay que revisar la carga del admin). El indicador NO DEBE depender solo del color: DEBE ser legible como texto.

#### Scenario: registro atrasado

- **WHEN** un registro lleva 50 horas en la cola
- **THEN** su renglón muestra el indicador "Lleva más de 48 horas" y el conteo de atrasados de la cola lo incluye

#### Scenario: registro dentro de la meta

- **WHEN** un registro lleva 3 horas en la cola
- **THEN** su renglón no muestra el indicador

#### Scenario: una ficha recién despublicada no nace atrasada

- **WHEN** el admin despublica un negocio registrado hace ocho meses y abre la cola enseguida
- **THEN** ese renglón no muestra "Lleva más de 48 horas" ni entra en el conteo de atrasados

#### Scenario: el indicador se lee, no solo se ve

- **WHEN** el admin revisa la cola en un celular o con lector de pantalla
- **THEN** el aviso de los registros atrasados se entiende por su texto, sin depender de un color

### Requirement: La cola avisa qué negocios tienen reportes sin atender

Debajo de los registros por revisar, la cola DEBE mostrar una sección propia encabezada con el texto literal "Negocios reportados" que liste **solo los negocios con al menos un reporte pendiente**, del que lleva más tiempo con un reporte sin atender al más reciente. Cada renglón DEBE mostrar el nombre del negocio, cuántos reportes sin atender tiene —con el texto literal "1 reporte sin atender" o "<n> reportes sin atender", según corresponda— y una entrada al detalle de ese negocio con el texto literal "Ver reportes". La sección DEBE encabezar con el conteo total, con el texto literal "1 negocio tiene reportes sin atender." o "<n> negocios tienen reportes sin atender.". Si no hay ningún reporte pendiente, la sección completa NO DEBE aparecer: la pantalla vacía del panel sigue siendo "No hay registros esperando. Todo al día."

Lo que decide quién entra a esta sección son sus reportes pendientes, no su estado: los reportes de un negocio NO DEBEN aparecer en la lista de "Registros por revisar" ni alterar su orden, y esa lista sigue trayendo únicamente los `en_revision`. Son dos secciones distintas, con dos trabajos distintos, y un negocio que a la vez espera revisión y tiene reportes sin atender aparece en las dos, cada una con lo suyo.

#### Scenario: cola con negocios reportados

- **WHEN** el admin abre la cola y hay dos negocios publicados con reportes pendientes (uno con tres reportes y otro con uno)
- **THEN** ve, debajo de los registros por revisar, la sección "Negocios reportados" con el conteo "2 negocios tienen reportes sin atender.", el renglón del primero con "3 reportes sin atender", el del segundo con "1 reporte sin atender" y en cada uno la entrada "Ver reportes"

#### Scenario: sin reportes pendientes no hay sección

- **WHEN** el admin abre la cola y ningún negocio tiene reportes sin atender
- **THEN** no aparece la sección "Negocios reportados" ni ningún conteo de reportes

#### Scenario: los reportes no se mezclan con los registros por revisar

- **WHEN** un negocio publicado tiene reportes pendientes
- **THEN** no aparece en la lista de "Registros por revisar" (que sigue trayendo solo los `en_revision`) ni cambia el orden de esa lista

#### Scenario: un negocio despublicado con reportes está en las dos secciones

- **WHEN** el admin despublica un negocio que tenía reportes sin atender y vuelve a la cola
- **THEN** lo ve en "Registros por revisar" con su espera nueva y también en "Negocios reportados" con sus reportes pendientes, sin que una sección altere a la otra

#### Scenario: "Ver reportes" abre el detalle del negocio

- **WHEN** el admin toca "Ver reportes" en el renglón de un negocio publicado
- **THEN** llega al detalle de ese negocio, con sus datos completos y sus reportes sin atender

### Requirement: Detalle del registro con todos los datos capturados, solo dentro del panel

El detalle de un registro DEBE mostrar todo lo que el negocio capturó —nombre, categoría, WhatsApp, colonia (de catálogo o texto libre), qué ofrece, si hace entregas o va a domicilio, teléfono fijo, dirección o referencias, horario, la página que registró y **la foto que subió**— más los datos internos que el admin necesita para operar: estado, origen, fecha de registro y constancia del consentimiento del aviso de privacidad (evidencia ante la LFPDPPP, PRD §8). **Si la ficha estuvo publicada y se despublicó, el detalle DEBE mostrar además cuándo y por qué se despublicó**, con los rótulos literales "Cuándo la despublicaste" y "Por qué la despublicaste"; si nunca se despublicó, esos rótulos NO DEBEN aparecer. La foto DEBE verse lo bastante grande para poder juzgarla contra la política del PRD §6.1 (del local, los productos o el trabajo; sin personas reconocibles) antes de aprobar o rechazar, bajo el rótulo literal "Foto del negocio"; si el registro no trae foto, DEBE decirlo con el texto literal "Sin foto". El motivo de rechazo libre que ya existe basta para explicarle al negocio por qué su foto no cumplió: el panel NO DEBE tener catálogo de motivos ni acciones específicas sobre la foto.

La constancia del consentimiento DEBE mostrarse completa: la fecha y, entre paréntesis, la versión del aviso que se aceptó, con la forma "3 de septiembre de 2026 (versión 1)". Si la ficha es anterior al versionado y no tiene versión registrada, DEBE decirlo con el texto literal "versión no registrada" en lugar de la versión, nunca inventar una. Cuando la ficha además tiene una reaceptación —porque se reenvió cuando ya estaba vigente una versión posterior— el detalle DEBE mostrarla como un dato propio, con la etiqueta literal "El reenvío aceptó la versión 1 del aviso" (donde `1` es la versión reaceptada) y, como valor, la fecha de ese reenvío; si no la tiene, esa línea no aparece. La etiqueta describe el hecho comprobable y NO DEBE atribuirle el acto al titular: quien reenvía el formulario público es un actor no autenticado, que es la misma razón por la que la constancia original no se sustituye. Tampoco DEBE afirmar por su cuenta que la versión es "más nueva": eso lo garantiza la regla de escritura, que solo anota la reaceptación cuando la versión vigente es posterior (`registro-negocio`).

Estos datos personales completos —incluida la foto— DEBEN verse únicamente dentro del panel con sesión válida: NO DEBEN aparecer en ninguna página pública ni en el log del servidor, y la dirección con la que el panel muestra la foto de un registro no publicado NO DEBE servir nada sin sesión válida. Si el registro no existe, el detalle DEBE responder como no encontrado, sin sugerir nada.

#### Scenario: detalle completo

- **WHEN** el admin abre el detalle de un registro que llenó todos los campos y subió foto
- **THEN** ve todos los datos capturados, la foto bajo el rótulo "Foto del negocio" en un tamaño que le permite juzgarla, y además el estado, el origen, la fecha de registro y la constancia del consentimiento con su fecha y su versión

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
- **THEN** el WhatsApp, el teléfono fijo, la dirección, la foto y la versión del consentimiento de un registro no publicado no aparecen en ninguno de los dos

#### Scenario: registro inexistente

- **WHEN** el admin con sesión abre el detalle de un identificador que no existe
- **THEN** ve la página de no encontrado, sin sugerencias ni datos de otros registros

#### Scenario: rechazar por la foto usa el motivo libre de siempre

- **WHEN** el admin ve una foto que incumple la política del PRD §6.1 y rechaza el registro escribiendo el motivo
- **THEN** el rechazo funciona exactamente igual que cualquier otro: se guarda el motivo con su fecha y se ofrece avisarle al negocio por WhatsApp

### Requirement: Botón de verificación que abre WhatsApp con mensaje prellenado

El detalle DEBE ofrecer un botón que abra la conversación de WhatsApp con el número que registró el negocio, con un mensaje ya escrito para hacer la verificación manual del PRD §6.3. El botón DEBE decir literalmente "Escribirle por WhatsApp" y el mensaje prellenado DEBE ser, literalmente: "Hola, te escribo de NecesitoUno Tizayuca, el directorio de negocios del municipio. Recibimos el registro de «<nombre del negocio>». ¿Nos confirmas que el negocio es tuyo y que este es tu WhatsApp?". El envío siempre lo hace la persona: el sistema NO DEBE mandar mensajes por su cuenta (PRD §6.6). Si el número guardado no se puede interpretar como un número mexicano de 10 dígitos, NO DEBE pintarse un enlace roto: el panel muestra el número tal como está guardado, sin botón.

#### Scenario: abrir la conversación de verificación

- **WHEN** el admin toca "Escribirle por WhatsApp" en el detalle del negocio "Tacos del Güero"
- **THEN** se abre WhatsApp con la conversación de ese número y el mensaje "Hola, te escribo de NecesitoUno Tizayuca, el directorio de negocios del municipio. Recibimos el registro de «Tacos del Güero». ¿Nos confirmas que el negocio es tuyo y que este es tu WhatsApp?" ya escrito, sin enviarse

#### Scenario: número que no se puede interpretar

- **WHEN** el registro tiene guardado un número que no se normaliza a 10 dígitos
- **THEN** el panel muestra el número tal cual, sin botón de WhatsApp y sin enlace roto

### Requirement: Aprobar asigna giros, normaliza la colonia, marca el origen y publica la ficha

Desde el detalle, el admin DEBE poder aprobar el registro en una sola acción que: asigna de 1 a 3 giros del catálogo (Apéndice B) o ninguno si ninguno embona; normaliza la colonia eligiendo una del catálogo cuando el negocio la escribió como "Otra"; marca el origen de la ficha (`siembra` u `organico`, PRD §10); y publica la ficha dejándola en estado `publicado` con su fecha de publicación. La cota de 1 a 3 giros se hace cumplir aquí, no en la base. Los rótulos DEBEN ser, literalmente: "Giros (de 1 a 3, o ninguno si no embona)", "¿En qué colonia está?", "¿De dónde salió?" con las opciones "Se registró solo" (origen `organico`) y "Lo sembramos nosotros" (origen `siembra`), y el botón "Aprobar y publicar". Los errores DEBEN ser, literalmente: "Elige máximo 3 giros" y "Elige la colonia de este negocio". Al aprobar, la ficha DEBE quedar visible en el directorio público de inmediato.

**Aprobar es también el camino para volver a publicar una ficha despublicada.** Cuando el registro ya trae giros asignados (porque estuvo publicado), el formulario DEBE llegar con esos giros ya marcados, para que republicar no los borre sin que el admin se dé cuenta; el admin puede desmarcarlos o cambiarlos como en cualquier aprobación. Al publicar de nuevo, la fecha de publicación DEBE actualizarse a la de esta publicación, y el rastro de la despublicación anterior NO DEBE limpiarse.

#### Scenario: aprobación completa

- **WHEN** el admin elige 2 giros, marca el origen "Se registró solo" y toca "Aprobar y publicar" en un registro cuya colonia ya es del catálogo
- **THEN** el negocio queda en estado `publicado` con su fecha de publicación, con esos 2 giros y con origen `organico`, y aparece en el listado público de su categoría

#### Scenario: aprobación sin giros

- **WHEN** el admin aprueba un registro sin elegir ningún giro porque ninguno del catálogo embona
- **THEN** la ficha se publica igual, sin giros asignados

#### Scenario: más de tres giros

- **WHEN** el admin intenta aprobar con 4 giros seleccionados
- **THEN** no se publica nada y ve "Elige máximo 3 giros", conservando lo que ya había elegido

#### Scenario: normalizar la colonia "Otra"

- **WHEN** el admin abre un registro que escribió su colonia como "Otra" con el texto "Rinconada del Venado"
- **THEN** ve ese texto tal como lo capturó el negocio y una lista del catálogo para elegir la colonia definitiva; al aprobar con una colonia elegida, el negocio queda vinculado a esa colonia del catálogo

#### Scenario: aprobar sin normalizar la colonia pendiente

- **WHEN** el admin intenta aprobar un registro con colonia "Otra" sin elegir ninguna del catálogo
- **THEN** no se publica nada y ve "Elige la colonia de este negocio"

#### Scenario: marcar el origen de siembra

- **WHEN** el admin aprueba un registro que consiguió por cambaceo y marca "Lo sembramos nosotros"
- **THEN** la ficha queda con origen `siembra`, para poder separar las métricas del PRD §10

#### Scenario: republicar conserva los giros

- **WHEN** el admin abre el formulario de aprobar de una ficha que despublicó y que tenía 3 giros asignados
- **THEN** los 3 giros llegan marcados, y si aprueba sin tocarlos la ficha se publica con esos mismos 3 giros, con la fecha de publicación de hoy y sin perder la fecha ni el motivo de la despublicación anterior

#### Scenario: aprobar no edita los datos del negocio

- **WHEN** el admin aprueba un registro
- **THEN** el nombre, el WhatsApp, "¿Qué ofreces?", el teléfono, la dirección, el horario y la página del negocio quedan exactamente como el negocio los capturó

### Requirement: Al aprobar se ofrece avisarle al negocio por WhatsApp con el link de su ficha

Después de aprobar, el panel DEBE confirmar con el texto literal "Ya quedó publicado." y ofrecer un botón "Avisarle por WhatsApp" que abra la conversación con ese negocio y un mensaje prellenado con el aviso y el link de su ficha pública, literalmente: "¡Listo! Ya quedó publicado «<nombre del negocio>» en NecesitoUno Tizayuca. Esta es tu ficha: <link de la ficha> — compártela con tus clientes." El link DEBE ser la URL completa de la ficha pública, la misma que abriría cualquier vecino. El enlace de gestión (PRD §6.4) NO entra en este mensaje.

#### Scenario: aviso de publicación

- **WHEN** el admin acaba de aprobar el registro de "Estética Lupita"
- **THEN** ve "Ya quedó publicado." y un botón "Avisarle por WhatsApp" que abre la conversación con ese negocio, con el mensaje "¡Listo! Ya quedó publicado «Estética Lupita» en NecesitoUno Tizayuca. Esta es tu ficha: <link de la ficha> — compártela con tus clientes." ya escrito

#### Scenario: el link del aviso abre la ficha real

- **WHEN** se abre el link que lleva ese mensaje
- **THEN** carga la ficha pública de ese negocio, la misma a la que llega un vecino desde el listado

#### Scenario: sin enlace de gestión todavía

- **WHEN** se revisa el mensaje de aviso de publicación
- **THEN** no incluye ningún enlace de gestión ni promete uno

### Requirement: Rechazar exige motivo, lo guarda con su fecha y ofrece avisar por WhatsApp

Desde el detalle, el admin DEBE poder rechazar el registro escribiendo obligatoriamente el motivo, bajo el rótulo literal "¿Por qué lo rechazas?" y con el botón "Rechazar". El sistema DEBE guardar el estado `rechazado`, la fecha del rechazo y el motivo (los datos de los registros rechazados se eliminan a los 90 días, PRD §8: la fecha es lo que la purga programada usa para saber cuándo toca). Sin motivo, el rechazo NO DEBE ejecutarse y DEBE mostrarse el texto literal "Escribe por qué lo rechazas". Después de rechazar, el panel DEBE confirmar con "Registro rechazado." y ofrecer un botón "Avisarle por WhatsApp" con el mensaje prellenado, literalmente: "Hola, revisamos el registro de «<nombre del negocio>» en NecesitoUno Tizayuca y por ahora no lo pudimos publicar: <motivo>. Si lo corriges, lo puedes volver a enviar desde el mismo formulario con este mismo número." Un negocio rechazado NO DEBE aparecer en ninguna página pública.

#### Scenario: rechazo con motivo

- **WHEN** el admin escribe "El número no contesta y no pudimos confirmar que el negocio exista" y toca "Rechazar"
- **THEN** el registro queda en estado `rechazado` con ese motivo y la fecha del rechazo guardados, y sale de la cola

#### Scenario: rechazo sin motivo

- **WHEN** el admin toca "Rechazar" con el motivo vacío
- **THEN** no cambia nada en la base y ve "Escribe por qué lo rechazas"

#### Scenario: aviso de rechazo por WhatsApp

- **WHEN** el admin acaba de rechazar el registro de "Préstamos Rápidos" con el motivo "No publicamos préstamos informales"
- **THEN** ve "Registro rechazado." y un botón "Avisarle por WhatsApp" con el mensaje "Hola, revisamos el registro de «Préstamos Rápidos» en NecesitoUno Tizayuca y por ahora no lo pudimos publicar: No publicamos préstamos informales. Si lo corriges, lo puedes volver a enviar desde el mismo formulario con este mismo número." ya escrito

#### Scenario: el rechazado no se publica

- **WHEN** un vecino busca en el directorio un negocio que fue rechazado
- **THEN** no aparece en ningún listado y su ficha responde como no encontrada, igual que la de un negocio inexistente

### Requirement: Despublicar una ficha publicada, con motivo obligatorio y condicionada al estado

Desde el detalle de un negocio en estado `publicado`, el admin DEBE poder **despublicarlo** en una sola acción que exige escribir el motivo, bajo el rótulo literal "¿Por qué la despublicas?" y con el botón literal "Despublicar". La acción DEBE dejar el negocio en estado `en_revision` y guardar la fecha de la despublicación y el motivo. Sin motivo, la despublicación NO DEBE ejecutarse y DEBE mostrarse el texto literal "Escribe por qué la despublicas". Al despublicar, la ficha DEBE dejar de estar en el directorio público de inmediato (ver la capacidad `directorio-publico`).

Como ese motivo es lo que viaja dentro del WhatsApp que se le manda al negocio, NO DEBE recortarse en silencio: un motivo de más de 500 caracteres DEBE rechazarse sin escribir nada en la base, con el texto literal "El motivo no puede pasar de 500 caracteres. Recórtalo un poco: así, completo, es como le va a llegar al negocio." El campo DEBE avisar de antemano a dónde va lo que se escriba, con el texto literal "Este motivo se le enviará al negocio por WhatsApp.", para que una nota interna no salga por accidente hacia un tercero.

La escritura DEBE ir **condicionada al estado**: solo surte efecto sobre un negocio que sigue en `publicado`. Si la ficha ya no estaba publicada —porque el admin la despublicó desde otra pestaña, tocó el botón dos veces, o el registro nunca llegó a publicarse—, la segunda acción NO DEBE aplicarse ni sobrescribir la primera, y el panel DEBE decirlo con el texto literal "Esta ficha ya no estaba publicada." Recargar la pantalla posterior a la despublicación NO DEBE repetirla.

Despublicar NO DEBE destruir nada: los giros asignados, la colonia normalizada, el origen, la fecha de la última publicación y todos los datos que capturó el negocio DEBEN quedar tal como estaban. Despublicar tampoco DEBE tocar el motivo ni la fecha de un rechazo anterior.

#### Scenario: despublicar con motivo

- **WHEN** el admin abre el detalle de un negocio publicado, escribe "El dueño nos pidió por WhatsApp que la bajáramos" y toca "Despublicar"
- **THEN** el negocio queda en estado `en_revision` con esa fecha y ese motivo guardados, y su ficha deja de estar en el directorio

#### Scenario: despublicar sin motivo

- **WHEN** el admin toca "Despublicar" con el motivo vacío
- **THEN** no cambia nada en la base, el negocio sigue publicado y ve "Escribe por qué la despublicas"

#### Scenario: motivo más largo que la cota

- **WHEN** el admin manda un motivo de 501 caracteres, saltándose el límite del campo
- **THEN** no se guarda nada, el negocio sigue publicado y ve "El motivo no puede pasar de 500 caracteres. Recórtalo un poco: así, completo, es como le va a llegar al negocio."

#### Scenario: el admin sabe a dónde va lo que escribe

- **WHEN** el admin abre el formulario de despublicar
- **THEN** junto al rótulo "¿Por qué la despublicas?" lee "Este motivo se le enviará al negocio por WhatsApp."

#### Scenario: despublicar algo que ya no estaba publicado

- **WHEN** llega una petición de despublicar sobre un negocio que ya está en `en_revision` o en `rechazado`
- **THEN** no se guarda ningún motivo ni fecha de despublicación, no cambia su estado y el panel muestra "Esta ficha ya no estaba publicada."

#### Scenario: doble despublicación

- **WHEN** el admin despublica una ficha y vuelve a mandar la misma acción desde una pestaña que tenía abierta
- **THEN** la ficha conserva la fecha y el motivo de la primera despublicación y ve "Esta ficha ya no estaba publicada."

#### Scenario: despublicar no borra el trabajo hecho

- **WHEN** se despublica un negocio que tenía 3 giros asignados, colonia del catálogo, origen `siembra` y fecha de publicación
- **THEN** conserva sus 3 giros, su colonia, su origen y su fecha de última publicación, y ninguno de los datos que capturó el negocio cambia

#### Scenario: recargar después de despublicar

- **WHEN** el admin recarga la pantalla que confirma la despublicación
- **THEN** no se vuelve a ejecutar ninguna acción

### Requirement: Al despublicar se ofrece avisarle al negocio por WhatsApp

Después de despublicar, el panel DEBE confirmar con el texto literal "Ya la despublicaste." y ofrecer un botón "Avisarle por WhatsApp" que abra la conversación con ese negocio y un mensaje ya escrito, literalmente: "Hola, te escribo de NecesitoUno Tizayuca. Bajamos del directorio la ficha de «<nombre del negocio>»: <motivo>. Si quieres que la volvamos a publicar o tienes alguna duda, contéstame por aquí." El motivo que viaja en el mensaje es el que el admin acaba de escribir. El envío siempre lo hace la persona: el sistema NO DEBE mandar mensajes por su cuenta (PRD §6.6). Si el número guardado no se puede interpretar como un número mexicano de 10 dígitos, NO DEBE pintarse un enlace roto: el panel muestra el número tal como está guardado, sin botón.

Esa pantalla DEBE existir únicamente para una despublicación que de verdad ocurrió: si el registro no está en `en_revision`, o no tiene fecha de despublicación, o su motivo está vacío, la pantalla NO DEBE mostrarse y el admin DEBE volver al detalle, sin que la respuesta filtre nada. Un mensaje con el motivo en blanco es un WhatsApp incorrecto hacia un tercero, que es justo lo que el panel existe para evitar.

#### Scenario: aviso de despublicación

- **WHEN** el admin acaba de despublicar "Tacos del Güero" con el motivo "El negocio cerró"
- **THEN** ve "Ya la despublicaste." y un botón "Avisarle por WhatsApp" que abre la conversación con ese negocio, con el mensaje "Hola, te escribo de NecesitoUno Tizayuca. Bajamos del directorio la ficha de «Tacos del Güero»: El negocio cerró. Si quieres que la volvamos a publicar o tienes alguna duda, contéstame por aquí." ya escrito, sin enviarse

#### Scenario: número que no se puede interpretar al avisar de la despublicación

- **WHEN** el negocio despublicado tiene guardado un número que no se normaliza a 10 dígitos
- **THEN** el panel muestra el número tal cual, sin botón de WhatsApp y sin enlace roto

#### Scenario: la pantalla de confirmación no se abre sobre un alta nueva

- **WHEN** alguien con la sesión del panel abre la pantalla de "Ya la despublicaste." de un registro que llegó por el formulario público y nunca estuvo publicado
- **THEN** no la ve: vuelve al detalle de ese registro, sin ningún mensaje de WhatsApp cargado y sin que la respuesta traiga datos del negocio

### Requirement: El borrado definitivo se confirma en dos pasos, escribiendo una palabra

El borrado definitivo es irreversible y no tiene papelera, así que NO DEBE poder ejecutarse desde el detalle con un solo toque. El detalle DEBE ofrecer un control con el texto literal "Borrar definitivamente" que **solo lleva a una pantalla de confirmación propia**: ese primer paso NO DEBE borrar nada ni cambiar nada en la base, y ninguna petición GET DEBE borrar jamás un registro.

La pantalla de confirmación DEBE mostrar, en este orden:

- el encabezado literal "¿Seguro que quieres borrar esta ficha?";
- el nombre del negocio y la advertencia literal "Esto borra para siempre el registro de «<nombre del negocio>», sus giros y sus reportes. No hay papelera y no se puede deshacer.";
- el recordatorio del trámite, literalmente: "Antes de borrar: confirma por WhatsApp, desde el número con el que se registró, que quien lo pide es el dueño del negocio. Tienes 20 días hábiles para contestarle.";
- un campo de texto con el rótulo literal "Escribe BORRAR para confirmar";
- el botón literal "Sí, borrar para siempre" y una salida con el texto literal "Mejor no, regresar" que devuelve al detalle sin tocar nada.

El borrado solo DEBE ejecutarse si lo que se escribió en el campo es la palabra `BORRAR` —sin distinguir mayúsculas de minúsculas y tolerando espacios de sobra al principio o al final, pero ninguna otra palabra—. Si no coincide, NO DEBE borrarse nada y DEBE mostrarse el texto literal "Para borrar, escribe BORRAR en el campo."

Este botón es la última pieza de un trámite humano que la spec deja documentado, porque el software solo ejecuta el paso final: la solicitud ARCO llega por el WhatsApp del directorio o por el correo publicado en el aviso de privacidad → el admin verifica la titularidad confirmando que quien pide viene del mismo número de WhatsApp con el que se registró el negocio (mismo criterio humano de la verificación del alta, PRD §6.3) → el admin ejecuta la despublicación o el borrado según lo que se haya pedido → el admin responde en la misma conversación, dentro de los 20 días hábiles que promete el aviso de privacidad (PRD §8).

#### Scenario: llegar a la confirmación no borra nada

- **WHEN** el admin toca "Borrar definitivamente" en el detalle de un registro
- **THEN** llega a la pantalla de confirmación con el encabezado "¿Seguro que quieres borrar esta ficha?", la advertencia con el nombre del negocio y el recordatorio del trámite, y el registro sigue existiendo con todos sus datos

#### Scenario: confirmar con la palabra correcta

- **WHEN** el admin escribe "BORRAR" y toca "Sí, borrar para siempre"
- **THEN** el registro se borra de forma definitiva y el panel lo confirma

#### Scenario: la palabra no coincide

- **WHEN** el admin escribe "borra" o deja el campo vacío y toca "Sí, borrar para siempre"
- **THEN** no se borra nada y ve "Para borrar, escribe BORRAR en el campo."

#### Scenario: minúsculas y espacios de sobra

- **WHEN** el admin escribe " borrar " y toca "Sí, borrar para siempre"
- **THEN** el borrado se ejecuta igual, porque solo se ignoran mayúsculas y espacios sobrantes

#### Scenario: arrepentirse

- **WHEN** el admin toca "Mejor no, regresar"
- **THEN** vuelve al detalle del registro, que sigue completo y sin cambios

#### Scenario: ningún GET borra

- **WHEN** se abre la pantalla de confirmación, se recarga y se navega hacia atrás y hacia adelante sin enviar el formulario
- **THEN** el registro sigue existiendo, porque abrir esa pantalla no ejecuta nada

### Requirement: El borrado definitivo se lleva todo y no deja rastro de datos personales

El borrado definitivo DEBE eliminar el registro completo, esté en el estado que esté (`en_revision`, `publicado` o `rechazado`): su fila, sus vínculos con giros, sus reportes y los archivos de su foto. Después del borrado, ninguna consulta DEBE devolver sus datos, su ficha pública DEBE responder el mismo 404 que un negocio inexistente y su renglón DEBE desaparecer de la cola. El borrado DEBE ser **idempotente**: si el registro ya no existe —porque se borró desde otra pestaña o se recargó la pantalla—, NO DEBE producirse ningún error del servidor y el panel DEBE decirlo con el texto literal "Esta ficha ya no existe."

Hay un caso en el que el borrado NO se ejecuta y el panel DEBE decirlo en vez de confirmar: la ficha tiene foto y el almacenamiento no se deja alcanzar (requirement "El borrado definitivo se niega a decir que borró lo que no borró", `despliegue`). Ahí la ficha sigue existiendo completa y el admin DEBE leer el texto literal "La ficha no se borró: no pude alcanzar el almacén de fotos. Revisa la configuración y vuelve a intentar." Una ficha sin foto se borra con normalidad aunque el almacenamiento esté caído.

Terminado el borrado, el panel DEBE llevar al admin a una pantalla que confirme con el texto literal "Ya se borró para siempre." y ofrezca volver a la cola. Esa pantalla NO DEBE mostrar ningún dato del negocio borrado, y ni el nombre, ni el WhatsApp, ni el identificador, ni ningún otro dato personal DEBEN viajar en la URL ni escribirse en el log del servidor: lo que se acaba de borrar de la base no puede quedar guardado en un registro de accesos.

#### Scenario: borrar un negocio publicado con todo colgando

- **WHEN** el admin confirma el borrado de un negocio publicado que tenía giros asignados y reportes
- **THEN** desaparecen su fila, sus vínculos con giros y sus reportes, y ninguna consulta posterior devuelve ni el negocio ni sus reportes

#### Scenario: borrar en cualquier estado

- **WHEN** el admin borra un registro en `en_revision` y otro en `rechazado`
- **THEN** los dos desaparecen igual, sin importar su estado

#### Scenario: la ficha borrada responde 404

- **WHEN** alguien abre la URL que tenía la ficha de un negocio borrado
- **THEN** ve la página 404 en español, exactamente igual que si el negocio nunca hubiera existido

#### Scenario: borrar dos veces

- **WHEN** el admin borra un registro y vuelve a mandar la misma confirmación desde una pestaña que tenía abierta
- **THEN** no hay error del servidor, nada más se borra y ve "Esta ficha ya no existe."

#### Scenario: la confirmación del borrado no filtra nada

- **WHEN** el admin termina de borrar un registro
- **THEN** ve "Ya se borró para siempre." y una salida a la cola, y ni la pantalla, ni la URL, ni el log del servidor traen el nombre, el WhatsApp ni ningún dato de ese negocio

#### Scenario: el almacén de fotos no responde

- **WHEN** el admin confirma el borrado de una ficha con foto y el almacenamiento no se deja alcanzar
- **THEN** lee "La ficha no se borró: no pude alcanzar el almacén de fotos. Revisa la configuración y vuelve a intentar.", la ficha sigue existiendo completa y esa pantalla tampoco trae ningún dato del negocio

#### Scenario: la foto también se va

- **WHEN** se borra un negocio cuya foto es un archivo guardado por el sitio
- **THEN** el archivo deja de existir, ninguna URL lo sigue sirviendo y la foto de los demás negocios queda intacta

### Requirement: El detalle del negocio lista sus reportes sin atender

El detalle de un negocio DEBE mostrar, en una sección propia encabezada con el texto literal "Reportes sin atender", los reportes pendientes de ese negocio, del más antiguo al más reciente. Cada reporte DEBE mostrar la etiqueta legible de su motivo (la misma que vio el vecino: "Ya cerró", "No es real", "Los datos están mal" o "Contenido ofensivo o inapropiado"), desde cuándo lleva sin atenderse —en la misma forma en palabras que usa la cola— y el comentario, solo si el vecino escribió uno. El comentario DEBE mostrarse **como texto plano**, con el mismo escape que el resto de los datos capturados: ninguna etiqueta se interpreta y una palabra larguísima no DEBE provocar scroll horizontal a 390px. La sección DEBE ir después de los datos del negocio y antes de las acciones, para que el admin lea los avisos antes de decidir, y NO DEBE aparecer si el negocio no tiene reportes pendientes. Los reportes DEBEN verse únicamente dentro del panel con sesión válida: NO DEBEN aparecer en ninguna página pública. El detalle NO DEBE mostrar ningún dato de quien reportó, porque no existe ninguno.

#### Scenario: detalle con reportes

- **WHEN** el admin abre el detalle de un negocio con dos reportes pendientes, uno con comentario y otro sin él
- **THEN** ve la sección "Reportes sin atender" con los dos, del más antiguo al más reciente, cada uno con la etiqueta de su motivo y desde cuándo espera, y el comentario solo en el que lo trae

#### Scenario: comentario con marcado

- **WHEN** un reporte trae como comentario `<b>cerró</b><script>alert(1)</script>`
- **THEN** el panel lo muestra como texto tal cual se escribió y no interpreta ninguna etiqueta

#### Scenario: negocio sin reportes

- **WHEN** el admin abre el detalle de un negocio que no tiene reportes pendientes
- **THEN** no ve la sección "Reportes sin atender" ni ningún hueco vacío

#### Scenario: los reportes no salen del panel

- **WHEN** se revisan las páginas públicas del negocio reportado mientras tiene reportes pendientes
- **THEN** ni la ficha, ni su listado, ni la página de resultados muestran motivos, comentarios ni conteos de reportes

### Requirement: Marcar un reporte como atendido, una sola vez

Cada reporte pendiente del detalle DEBE tener un botón con el texto literal "Marcar como atendido" que lo pase a estado `atendido` con su fecha, lo saque de la lista de pendientes de ese negocio y actualice el conteo de la cola. Tras marcarlo, el panel DEBE confirmar con el texto literal "Reporte atendido." Marcar como atendido NO DEBE cambiar el estado del negocio ni ninguno de sus datos: es solo la constancia de que el admin ya lo vio; lo que decida hacer con la ficha son las herramientas que ya tiene el panel (despublicar y borrar).

**El aviso lo pinta el detalle del negocio, exista o no la sección de reportes sin atender.** Atender el último pendiente hace desaparecer la sección, que es el caso más frecuente —casi todo negocio reportado tendrá un solo aviso—, y la confirmación no DEBE irse con ella. Una pantalla del detalle que no venga de una acción recién ejecutada NO DEBE pintar ningún aviso.

La acción solo DEBE surtir efecto sobre un reporte que siga `pendiente`: si el admin lo marcó dos veces, desde dos pestañas o recargando, la segunda vez NO DEBE sobrescribir la fecha de la primera y el panel DEBE decirlo con el texto literal "Este reporte ya lo habías atendido." Recargar la pantalla posterior NO DEBE repetir la acción. La acción DEBE quedar acotada al negocio cuyo detalle se está viendo: un reporte que no es de ese negocio DEBE responder exactamente igual que uno que no existe, de modo que el panel no sirva para averiguar qué reportes hay en otras fichas.

#### Scenario: atender un reporte

- **WHEN** el admin toca "Marcar como atendido" en uno de los dos reportes pendientes de un negocio
- **THEN** ve "Reporte atendido.", ese reporte desaparece de "Reportes sin atender", el otro sigue ahí y la cola pasa a contar un reporte menos para ese negocio

#### Scenario: atender el último reporte también se confirma

- **WHEN** el admin marca como atendido el único reporte pendiente de un negocio
- **THEN** ve "Reporte atendido." aunque la sección "Reportes sin atender" ya no aparezca, y volviendo a mandar la misma acción ve "Este reporte ya lo habías atendido.", también sin sección

#### Scenario: el último reporte atendido saca al negocio de la sección

- **WHEN** el admin atiende el único reporte pendiente de un negocio y vuelve a la cola
- **THEN** ese negocio ya no aparece en "Negocios reportados"

#### Scenario: el detalle sin acción reciente no avisa nada

- **WHEN** el admin abre el detalle de un negocio sin venir de marcar ningún reporte
- **THEN** no ve "Reporte atendido." ni "Este reporte ya lo habías atendido."

#### Scenario: atender no cambia el negocio

- **WHEN** el admin marca como atendido un reporte de un negocio publicado
- **THEN** el negocio sigue en estado `publicado`, con sus mismos datos, sus mismos giros y su misma fecha de publicación, y su ficha pública no cambia

#### Scenario: doble marcado

- **WHEN** el admin marca como atendido un reporte y vuelve a mandar la misma acción desde una pestaña que tenía abierta
- **THEN** el reporte conserva la fecha de atención original y ve "Este reporte ya lo habías atendido."

#### Scenario: reporte inexistente o de otro negocio

- **WHEN** llega una petición de marcar como atendido un identificador de reporte que no existe, o el de un reporte que pertenece a otro negocio
- **THEN** no cambia nada en la base, las dos respuestas son iguales y ninguna trae datos de ningún reporte ni de ningún negocio

### Requirement: El detalle ofrece las acciones que corresponden al estado, con el contexto a la vista

El detalle DEBE mostrar las acciones aplicables al estado del registro y ninguna más: un registro `en_revision` ofrece aprobar y rechazar; un registro `publicado` ofrece "Despublicar"; cualquier registro, en cualquier estado, ofrece "Borrar definitivamente". Las acciones destructivas DEBEN ir después de los datos y del contexto de la decisión —incluidos los reportes sin atender del negocio—, para que el admin lea antes de actuar, y "Borrar definitivamente" DEBE distinguirse visualmente de las demás como lo que es: la acción irreversible.

#### Scenario: detalle de una ficha publicada

- **WHEN** el admin abre el detalle de un negocio en estado `publicado`
- **THEN** ve el formulario de despublicar con su rótulo "¿Por qué la despublicas?" y el control "Borrar definitivamente", y no ve los formularios de aprobar ni de rechazar

#### Scenario: detalle de un registro en revisión

- **WHEN** el admin abre el detalle de un registro en `en_revision`
- **THEN** ve los formularios de aprobar y rechazar y el control "Borrar definitivamente", y no ve el formulario de despublicar

#### Scenario: detalle de un registro rechazado

- **WHEN** el admin abre el detalle de un registro `rechazado`
- **THEN** la única acción que ve es "Borrar definitivamente"

#### Scenario: decidir con los reportes a la vista

- **WHEN** el admin abre el detalle de un negocio publicado que tiene reportes sin atender
- **THEN** ve esos reportes y, en la misma pantalla y debajo de ellos, las acciones de despublicar y borrar, sin tener que navegar a otro lado para actuar

### Requirement: Una transición solo se aplica sobre un registro que sigue en revisión

Aprobar y rechazar solo DEBEN surtir efecto sobre registros en estado `en_revision`. Si el registro ya fue resuelto —porque el admin lo abrió dos veces, tocó el botón dos veces o lo resolvió desde otra pestaña—, la segunda transición NO DEBE aplicarse ni sobrescribir la primera, y el panel DEBE decirlo con el texto literal "Este registro ya lo habías resuelto." Recargar la pantalla posterior a una transición NO DEBE repetirla.

Como cualquier registro se puede borrar en cualquier momento, una aprobación también puede encontrarse con que la fila ya no existe. Ese caso NO DEBE terminar en un error del servidor ni resucitar la fila borrada: se resuelve como registro no encontrado, con la ficha borrada bien borrada.

#### Scenario: doble aprobación

- **WHEN** el admin aprueba un registro y vuelve a mandar la misma aprobación desde una pestaña que tenía abierta
- **THEN** la ficha conserva la publicación original (misma fecha, mismos giros, mismo origen) y ve "Este registro ya lo habías resuelto."

#### Scenario: rechazar algo ya publicado

- **WHEN** llega una petición de rechazo sobre un registro que ya está en `publicado`
- **THEN** el negocio sigue publicado, no se guarda motivo de rechazo y el panel muestra "Este registro ya lo habías resuelto."

#### Scenario: recargar después de resolver

- **WHEN** el admin recarga la pantalla que confirma la aprobación o el rechazo
- **THEN** no se vuelve a ejecutar ninguna transición

#### Scenario: la ficha se borra a media aprobación

- **WHEN** el admin aprueba un registro desde una pestaña mientras lo borra definitivamente desde otra
- **THEN** la aprobación no revienta con un error del servidor, el panel la resuelve como registro no encontrado y la fila borrada no vuelve a existir

### Requirement: El panel se opera desde el celular y sin JavaScript de cliente innecesario

El panel DEBE ser mobile-first: cola —**incluida la sección de negocios reportados**—, detalle —**incluida la lista de reportes sin atender**—, formularios de aprobar, rechazar, despublicar y marcar atendido, y la pantalla de confirmación del borrado DEBEN verse completos y usables en un viewport de 390px, sin scroll horizontal, con áreas táctiles de al menos 44px y contraste AA (PRD §8). Las pantallas del panel DEBEN ser Server Components y sus formularios DEBEN funcionar sin JavaScript de cliente, igual que el registro público.

#### Scenario: revisar desde el celular

- **WHEN** el admin abre la cola con la sección de reportados, el detalle de un negocio con reportes y los formularios de aprobar, rechazar, despublicar y marcar atendido en un viewport de 390px
- **THEN** todo se ve completo y legible, sin scroll horizontal —incluido un comentario de reporte sin espacios— y cada control tocable mide al menos 44px en su dimensión menor

#### Scenario: el panel funciona sin JavaScript

- **WHEN** el admin entra, aprueba, rechaza, despublica, marca un reporte como atendido y borra con el JavaScript de cliente deshabilitado
- **THEN** las seis acciones funcionan igual, porque cada una es un envío de formulario del servidor

#### Scenario: la confirmación del borrado también se opera en el celular

- **WHEN** el admin abre la pantalla de confirmación del borrado en un viewport de 390px con el JavaScript de cliente deshabilitado
- **THEN** ve el texto completo sin scroll horizontal, puede escribir la palabra y borrar

#### Scenario: sin JS de cliente propio

- **WHEN** se revisan los archivos nuevos del panel
- **THEN** ninguno declara `"use client"` ni agrega un bundle de cliente propio
