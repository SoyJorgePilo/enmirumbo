# Delta de spec: revision-admin

## ADDED Requirements

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

Cada página del panel y cada transición de estado (aprobar, rechazar) DEBEN verificar la sesión antes de leer o escribir nada. Sin sesión válida, la respuesta DEBE ser una redirección a la pantalla de acceso, sin mostrar ni un dato del registro —ni en la pantalla, ni en el HTML, ni en la URL de destino— y sin ejecutar ningún cambio en la base. Las transiciones de estado NO DEBEN existir en ninguna superficie pública: el formulario de registro, los listados y las fichas no DEBEN poder cambiar el estado, el origen, los giros ni la colonia de un negocio.

#### Scenario: cola sin sesión

- **WHEN** alguien sin sesión abre `/admin`
- **THEN** llega a la pantalla de acceso y en la respuesta no aparece ningún nombre, número de WhatsApp ni dato de ningún registro

#### Scenario: detalle de un registro sin sesión

- **WHEN** alguien sin sesión abre la URL del detalle de un registro concreto, con su identificador
- **THEN** llega a la pantalla de acceso, sin ver ningún dato de ese registro y sin que la respuesta confirme si ese identificador existe

#### Scenario: aprobar sin sesión

- **WHEN** llega directamente al servidor una petición de aprobar un registro sin cookie de sesión válida
- **THEN** el registro sigue en `en_revision`, no se publica ninguna ficha y la respuesta no trae datos del negocio

#### Scenario: rechazar sin sesión

- **WHEN** llega directamente al servidor una petición de rechazar un registro sin cookie de sesión válida
- **THEN** el registro no cambia de estado y no se guarda ningún motivo de rechazo

#### Scenario: ninguna transición desde lo público

- **WHEN** se revisan las superficies públicas (formulario de registro, listados y fichas)
- **THEN** ninguna permite cambiar estado, origen, giros ni colonia de un negocio

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

#### Scenario: orden de la cola

- **WHEN** el admin abre la cola con tres registros pendientes que llegaron en días distintos
- **THEN** los ve del más antiguo al más reciente, cada uno con su nombre, su colonia, desde cuándo espera y su entrada "Revisar"

#### Scenario: la cola solo trae pendientes

- **WHEN** en la base hay negocios en `en_revision`, `publicado` y `rechazado`
- **THEN** la cola muestra únicamente los `en_revision`

#### Scenario: cola vacía

- **WHEN** no hay ningún registro en `en_revision`
- **THEN** el admin ve "No hay registros esperando. Todo al día." en lugar de una lista vacía

### Requirement: Indicador visible de los registros con más de 48 horas esperando

Todo registro de la cola que lleve más de 48 horas desde su registro DEBE mostrarse con un indicador visible junto a su renglón, con el texto literal "Lleva más de 48 horas", y la cola DEBE decir cuántos están en esa condición (PRD §10: si el tiempo entre registro y publicación se pasa de 48 horas de forma sostenida, hay que revisar la carga del admin). El indicador NO DEBE depender solo del color: DEBE ser legible como texto.

#### Scenario: registro atrasado

- **WHEN** un registro lleva 50 horas en la cola
- **THEN** su renglón muestra el indicador "Lleva más de 48 horas" y el conteo de atrasados de la cola lo incluye

#### Scenario: registro dentro de la meta

- **WHEN** un registro lleva 3 horas en la cola
- **THEN** su renglón no muestra el indicador

#### Scenario: el indicador se lee, no solo se ve

- **WHEN** el admin revisa la cola en un celular o con lector de pantalla
- **THEN** el aviso de los registros atrasados se entiende por su texto, sin depender de un color

### Requirement: Detalle del registro con todos los datos capturados, solo dentro del panel

El detalle de un registro DEBE mostrar todo lo que el negocio capturó —nombre, categoría, WhatsApp, colonia (de catálogo o texto libre), qué ofrece, si hace entregas o va a domicilio, teléfono fijo, dirección o referencias, horario y la página que registró— más los datos internos que el admin necesita para operar: estado, origen, fecha de registro y constancia del consentimiento del aviso de privacidad (evidencia ante la LFPDPPP, PRD §8). Estos datos personales completos DEBEN verse únicamente dentro del panel con sesión válida: NO DEBEN aparecer en ninguna página pública ni en el log del servidor. Si el registro no existe, el detalle DEBE responder como no encontrado, sin sugerir nada.

#### Scenario: detalle completo

- **WHEN** el admin abre el detalle de un registro que llenó todos los campos
- **THEN** ve todos los datos capturados y, además, el estado, el origen, la fecha de registro y la fecha del consentimiento

#### Scenario: detalle de un registro con solo obligatorios

- **WHEN** el admin abre el detalle de un registro que solo llenó los 5 obligatorios
- **THEN** ve esos datos y los opcionales aparecen como no capturados, sin inventar contenido

#### Scenario: los datos personales no salen del panel

- **WHEN** se revisan las páginas públicas y el log del servidor mientras hay registros en la cola
- **THEN** el WhatsApp, el teléfono fijo y la dirección de un registro no publicado no aparecen en ninguno de los dos

#### Scenario: registro inexistente

- **WHEN** el admin con sesión abre el detalle de un identificador que no existe
- **THEN** ve la página de no encontrado, sin sugerencias ni datos de otros registros

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

Desde el detalle, el admin DEBE poder rechazar el registro escribiendo obligatoriamente el motivo, bajo el rótulo literal "¿Por qué lo rechazas?" y con el botón "Rechazar". El sistema DEBE guardar el estado `rechazado`, la fecha del rechazo y el motivo (los datos de los registros rechazados se eliminan a los 90 días, PRD §8: la fecha es lo que habilitará esa purga). Sin motivo, el rechazo NO DEBE ejecutarse y DEBE mostrarse el texto literal "Escribe por qué lo rechazas". Después de rechazar, el panel DEBE confirmar con "Registro rechazado." y ofrecer un botón "Avisarle por WhatsApp" con el mensaje prellenado, literalmente: "Hola, revisamos el registro de «<nombre del negocio>» en NecesitoUno Tizayuca y por ahora no lo pudimos publicar: <motivo>. Si lo corriges, lo puedes volver a enviar desde el mismo formulario con este mismo número." Un negocio rechazado NO DEBE aparecer en ninguna página pública.

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

### Requirement: Una transición solo se aplica sobre un registro que sigue en revisión

Aprobar y rechazar solo DEBEN surtir efecto sobre registros en estado `en_revision`. Si el registro ya fue resuelto —porque el admin lo abrió dos veces, tocó el botón dos veces o lo resolvió desde otra pestaña—, la segunda transición NO DEBE aplicarse ni sobrescribir la primera, y el panel DEBE decirlo con el texto literal "Este registro ya lo habías resuelto." Recargar la pantalla posterior a una transición NO DEBE repetirla.

#### Scenario: doble aprobación

- **WHEN** el admin aprueba un registro y vuelve a mandar la misma aprobación desde una pestaña que tenía abierta
- **THEN** la ficha conserva la publicación original (misma fecha, mismos giros, mismo origen) y ve "Este registro ya lo habías resuelto."

#### Scenario: rechazar algo ya publicado

- **WHEN** llega una petición de rechazo sobre un registro que ya está en `publicado`
- **THEN** el negocio sigue publicado, no se guarda motivo de rechazo y el panel muestra "Este registro ya lo habías resuelto."

#### Scenario: recargar después de resolver

- **WHEN** el admin recarga la pantalla que confirma la aprobación o el rechazo
- **THEN** no se vuelve a ejecutar ninguna transición

### Requirement: El panel se opera desde el celular y sin JavaScript de cliente innecesario

El panel DEBE ser mobile-first: cola, detalle y formularios de aprobar y rechazar DEBEN verse completos y usables en un viewport de 390px, sin scroll horizontal, con áreas táctiles de al menos 44px y contraste AA (PRD §8). Las pantallas del panel DEBEN ser Server Components y sus formularios DEBEN funcionar sin JavaScript de cliente, igual que el registro público.

#### Scenario: revisar desde el celular

- **WHEN** el admin abre la cola, el detalle de un registro y los formularios de aprobar y rechazar en un viewport de 390px
- **THEN** todo se ve completo y legible, sin scroll horizontal, y cada control tocable mide al menos 44px en su dimensión menor

#### Scenario: el panel funciona sin JavaScript

- **WHEN** el admin entra, aprueba y rechaza con el JavaScript de cliente deshabilitado
- **THEN** las tres acciones funcionan igual, porque cada una es un envío de formulario del servidor

#### Scenario: sin JS de cliente propio

- **WHEN** se revisan los archivos nuevos del panel
- **THEN** ninguno declara `"use client"` ni agrega un bundle de cliente propio
