# Delta: revision-admin — despublicar una ficha y borrarla de forma definitiva

## ADDED Requirements

### Requirement: Despublicar una ficha publicada, con motivo obligatorio y condicionada al estado

Desde el detalle de un negocio en estado `publicado`, el admin DEBE poder **despublicarlo** en una sola acción que exige escribir el motivo, bajo el rótulo literal "¿Por qué la despublicas?" y con el botón literal "Despublicar". La acción DEBE dejar el negocio en estado `en_revision` y guardar la fecha de la despublicación y el motivo. Sin motivo, la despublicación NO DEBE ejecutarse y DEBE mostrarse el texto literal "Escribe por qué la despublicas". Al despublicar, la ficha DEBE dejar de estar en el directorio público de inmediato (ver la capacidad `directorio-publico`).

La escritura DEBE ir **condicionada al estado**: solo surte efecto sobre un negocio que sigue en `publicado`. Si la ficha ya no estaba publicada —porque el admin la despublicó desde otra pestaña, tocó el botón dos veces, o el registro nunca llegó a publicarse—, la segunda acción NO DEBE aplicarse ni sobrescribir la primera, y el panel DEBE decirlo con el texto literal "Esta ficha ya no estaba publicada." Recargar la pantalla posterior a la despublicación NO DEBE repetirla.

Despublicar NO DEBE destruir nada: los giros asignados, la colonia normalizada, el origen, la fecha de la última publicación y todos los datos que capturó el negocio DEBEN quedar tal como estaban. Despublicar tampoco DEBE tocar el motivo ni la fecha de un rechazo anterior.

#### Scenario: despublicar con motivo

- **WHEN** el admin abre el detalle de un negocio publicado, escribe "El dueño nos pidió por WhatsApp que la bajáramos" y toca "Despublicar"
- **THEN** el negocio queda en estado `en_revision` con esa fecha y ese motivo guardados, y su ficha deja de estar en el directorio

#### Scenario: despublicar sin motivo

- **WHEN** el admin toca "Despublicar" con el motivo vacío
- **THEN** no cambia nada en la base, el negocio sigue publicado y ve "Escribe por qué la despublicas"

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

Después de despublicar, el panel DEBE confirmar con el texto literal "Ya la despublicaste." y ofrecer un botón "Avisarle por WhatsApp" que abra la conversación con ese negocio y un mensaje ya escrito, literalmente: "Hola, te escribo de NecesitoUno Tizayuca. Bajamos del directorio la ficha de «<nombre del negocio>»: <motivo>. Si quieres que la volvamos a publicar o tienes alguna duda, contéstame por aquí." El motivo que viaja en el mensaje es el que el admin acaba de escribir. El envío siempre lo hace la persona: el sistema NO DEBE mandar mensajes por su cuenta (PRD §6.6). Si el número guardado no se puede interpretar como un número mexicano de 10 dígitos, NO DEBE pintarse un enlace roto: el panel muestra el número tal como está guardado, sin botón, igual que en el resto del panel.

#### Scenario: aviso de despublicación

- **WHEN** el admin acaba de despublicar "Tacos del Güero" con el motivo "El negocio cerró"
- **THEN** ve "Ya la despublicaste." y un botón "Avisarle por WhatsApp" que abre la conversación con ese negocio, con el mensaje "Hola, te escribo de NecesitoUno Tizayuca. Bajamos del directorio la ficha de «Tacos del Güero»: El negocio cerró. Si quieres que la volvamos a publicar o tienes alguna duda, contéstame por aquí." ya escrito, sin enviarse

#### Scenario: número que no se puede interpretar

- **WHEN** el negocio despublicado tiene guardado un número que no se normaliza a 10 dígitos
- **THEN** el panel muestra el número tal cual, sin botón de WhatsApp y sin enlace roto

### Requirement: El borrado definitivo se confirma en dos pasos, escribiendo una palabra, y no depende de JavaScript

El borrado definitivo es irreversible y no tiene papelera, así que NO DEBE poder ejecutarse desde el detalle con un solo toque. El detalle DEBE ofrecer un control con el texto literal "Borrar definitivamente" que **solo lleva a una pantalla de confirmación propia**: ese primer paso NO DEBE borrar nada ni cambiar nada en la base, y ninguna petición GET DEBE borrar jamás un registro.

La pantalla de confirmación DEBE mostrar, en este orden:

- el encabezado literal "¿Seguro que quieres borrar esta ficha?";
- el nombre del negocio y la advertencia literal "Esto borra para siempre el registro de «<nombre del negocio>», sus giros y sus reportes. No hay papelera y no se puede deshacer.";
- el recordatorio del trámite, literalmente: "Antes de borrar: confirma por WhatsApp, desde el número con el que se registró, que quien lo pide es el dueño del negocio. Tienes 20 días hábiles para contestarle.";
- un campo de texto con el rótulo literal "Escribe BORRAR para confirmar";
- el botón literal "Sí, borrar para siempre" y una salida con el texto literal "Mejor no, regresar" que devuelve al detalle sin tocar nada.

El borrado solo DEBE ejecutarse si lo que se escribió en el campo es la palabra `BORRAR` —sin distinguir mayúsculas de minúsculas y tolerando espacios de sobra al principio o al final, pero ninguna otra palabra—. Si no coincide, NO DEBE borrarse nada y DEBE mostrarse el texto literal "Para borrar, escribe BORRAR en el campo." Toda esta pantalla DEBE ser un Server Component cuyo formulario funciona con el JavaScript de cliente deshabilitado, y DEBE verse completa y usable en un viewport de 390px, sin scroll horizontal, con áreas táctiles de al menos 44px y contraste AA.

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

#### Scenario: la confirmación funciona sin JavaScript y en el celular

- **WHEN** el admin abre la pantalla de confirmación en un viewport de 390px con el JavaScript de cliente deshabilitado
- **THEN** ve el texto completo sin scroll horizontal, puede escribir la palabra y borrar, y ningún archivo nuevo del panel declara `"use client"`

### Requirement: El borrado definitivo se lleva todo y no deja rastro de datos personales

El borrado definitivo DEBE eliminar el registro completo, esté en el estado que esté (`en_revision`, `publicado` o `rechazado`): su fila, sus vínculos con giros, sus reportes y el archivo de su foto si el sistema llegara a guardar archivos de foto. Después del borrado, ninguna consulta DEBE devolver sus datos, su ficha pública DEBE responder el mismo 404 que un negocio inexistente y su renglón DEBE desaparecer de la cola. El borrado DEBE ser **idempotente**: si el registro ya no existe —porque se borró desde otra pestaña o se recargó la pantalla—, NO DEBE producirse ningún error del servidor y el panel DEBE decirlo con el texto literal "Esta ficha ya no existe."

Terminado el borrado, el panel DEBE llevar al admin a una pantalla que confirme con el texto literal "Ya se borró para siempre." y ofrezca volver a la cola. Esa pantalla NO DEBE mostrar ningún dato del negocio borrado, y ni el nombre, ni el WhatsApp, ni ningún otro dato personal DEBEN viajar en la URL ni escribirse en el log del servidor: lo que se acaba de borrar de la base no puede quedar guardado en un registro de accesos.

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

#### Scenario: la foto también se va

- **WHEN** se borra un negocio cuya foto es un archivo guardado por el sitio
- **THEN** el archivo deja de existir y ninguna URL lo sigue sirviendo

### Requirement: Despublicar y borrar exigen sesión válida y no existen fuera del panel

La pantalla de confirmación del borrado y las dos acciones nuevas —despublicar y borrar— DEBEN verificar la sesión del panel antes de leer o escribir nada. Sin sesión válida, la respuesta DEBE ser una redirección a la pantalla de acceso, sin mostrar ni un dato del registro —ni en la pantalla, ni en el HTML, ni en la URL de destino—, sin confirmar si ese identificador existe y sin ejecutar ningún cambio en la base. Ninguna superficie pública DEBE poder despublicar ni borrar un negocio: ni el formulario de registro, ni los listados, ni la ficha, ni el formulario de reporte.

#### Scenario: despublicar sin sesión

- **WHEN** llega directamente al servidor una petición de despublicar un negocio sin cookie de sesión válida
- **THEN** el negocio sigue `publicado`, no se guarda motivo ni fecha de despublicación, su ficha sigue en el directorio y la respuesta no trae datos del negocio

#### Scenario: borrar sin sesión

- **WHEN** llega directamente al servidor una petición de borrado, con la palabra de confirmación y todo, sin cookie de sesión válida
- **THEN** el registro sigue existiendo completo y la respuesta no trae ningún dato suyo

#### Scenario: la pantalla de confirmación sin sesión

- **WHEN** alguien sin sesión abre la URL de la pantalla de confirmación del borrado de un registro concreto
- **THEN** llega a la pantalla de acceso, sin ver el nombre del negocio ni ningún otro dato, y sin que la respuesta confirme si ese identificador existe

#### Scenario: ninguna de las dos acciones vive en lo público

- **WHEN** se revisan las superficies públicas (formulario de registro, listados, fichas y formulario de reporte)
- **THEN** ninguna permite despublicar ni borrar un negocio

### Requirement: El detalle ofrece las acciones que corresponden al estado, con el contexto a la vista

El detalle DEBE mostrar las acciones aplicables al estado del registro y ninguna más: un registro `en_revision` ofrece aprobar y rechazar; un registro `publicado` ofrece "Despublicar"; cualquier registro, en cualquier estado, ofrece "Borrar definitivamente". Las acciones destructivas DEBEN ir después de los datos y del contexto de la decisión —incluidos los reportes sin atender del negocio, cuando la capacidad de reportes esté presente—, para que el admin lea antes de actuar, y "Borrar definitivamente" DEBE distinguirse visualmente de las demás como lo que es: la acción irreversible.

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

## MODIFIED Requirements

### Requirement: Cola de revisión con los registros pendientes, más antiguos primero

La cola DEBE ser la pantalla principal del panel, encabezada con el texto literal "Registros por revisar", y listar únicamente los negocios en estado `en_revision`, ordenados del más antiguo al más reciente (el que lleva más tiempo esperando, arriba), porque la meta operativa es responder cada registro en menos de 48 horas (PRD §10). Cada renglón DEBE mostrar el nombre del negocio, su colonia (la del catálogo o el texto libre que capturó), desde cuándo espera y una entrada al detalle con el texto "Revisar". Los negocios `publicado` y `rechazado` NO DEBEN aparecer en la cola. Con la cola vacía DEBE mostrarse el texto literal "No hay registros esperando. Todo al día."

**La espera se cuenta desde que el registro entró a la cola**, que es la más reciente entre su fecha de registro y su fecha de despublicación: una ficha que estuvo publicada meses y se despublicó hoy lleva esperando desde hoy, no desde que se registró. Los negocios que llegaron a la cola por una despublicación DEBEN distinguirse de los registros nuevos con la etiqueta literal "Ya estaba publicada, la despublicaste" en su renglón, para que el admin no los confunda con altas por revisar. El orden de la cola sigue siendo el mismo criterio de espera para todos, sin secciones aparte.

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
- **THEN** ese renglón dice que lleva esperando desde la despublicación (no desde su registro) y trae la etiqueta "Ya estaba publicada, la despublicaste"

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

### Requirement: Detalle del registro con todos los datos capturados, solo dentro del panel

El detalle de un registro DEBE mostrar todo lo que el negocio capturó —nombre, categoría, WhatsApp, colonia (de catálogo o texto libre), qué ofrece, si hace entregas o va a domicilio, teléfono fijo, dirección o referencias, horario y la página que registró— más los datos internos que el admin necesita para operar: estado, origen, fecha de registro y constancia del consentimiento del aviso de privacidad (evidencia ante la LFPDPPP, PRD §8). **Si la ficha estuvo publicada y se despublicó, el detalle DEBE mostrar además cuándo y por qué se despublicó**, con los rótulos literales "Cuándo la despublicaste" y "Por qué la despublicaste"; si nunca se despublicó, esos rótulos NO DEBEN aparecer. Estos datos personales completos DEBEN verse únicamente dentro del panel con sesión válida: NO DEBEN aparecer en ninguna página pública ni en el log del servidor. Si el registro no existe, el detalle DEBE responder como no encontrado, sin sugerir nada.

#### Scenario: detalle completo

- **WHEN** el admin abre el detalle de un registro que llenó todos los campos
- **THEN** ve todos los datos capturados y, además, el estado, el origen, la fecha de registro y la fecha del consentimiento

#### Scenario: detalle de un registro con solo obligatorios

- **WHEN** el admin abre el detalle de un registro que solo llenó los 5 obligatorios
- **THEN** ve esos datos y los opcionales aparecen como no capturados, sin inventar contenido

#### Scenario: detalle de una ficha despublicada

- **WHEN** el admin abre el detalle de un negocio que despublicó ayer con el motivo "El negocio cerró"
- **THEN** ve "Cuándo la despublicaste" con la fecha de ayer y "Por qué la despublicaste" con "El negocio cerró", además de la fecha de su última publicación

#### Scenario: detalle de una ficha que nunca se despublicó

- **WHEN** el admin abre el detalle de un registro que nunca estuvo despublicado
- **THEN** no ve los rótulos de la despublicación ni ningún hueco vacío en su lugar

#### Scenario: los datos personales no salen del panel

- **WHEN** se revisan las páginas públicas y el log del servidor mientras hay registros en la cola
- **THEN** el WhatsApp, el teléfono fijo y la dirección de un registro no publicado no aparecen en ninguno de los dos

#### Scenario: registro inexistente

- **WHEN** el admin con sesión abre el detalle de un identificador que no existe
- **THEN** ve la página de no encontrado, sin sugerencias ni datos de otros registros

### Requirement: Aprobar asigna giros, normaliza la colonia, marca el origen y publica la ficha

Desde el detalle, el admin DEBE poder aprobar el registro en una sola acción que: asigna de 1 a 3 giros del catálogo (Apéndice B) o ninguno si ninguno embona; normaliza la colonia eligiendo una del catálogo cuando el negocio la escribió como "Otra"; marca el origen de la ficha (`siembra` u `organico`, PRD §10); y publica la ficha dejándola en estado `publicado` con su fecha de publicación. La cota de 1 a 3 giros se hace cumplir aquí, no en la base. Los rótulos DEBEN ser, literalmente: "Giros (de 1 a 3, o ninguno si no embona)", "¿En qué colonia está?", "¿De dónde salió?" con las opciones "Se registró solo" (origen `organico`) y "Lo sembramos nosotros" (origen `siembra`), y el botón "Aprobar y publicar". Los errores DEBEN ser, literalmente: "Elige máximo 3 giros" y "Elige la colonia de este negocio". Al aprobar, la ficha DEBE quedar visible en el directorio público de inmediato.

**Aprobar es también el camino para volver a publicar una ficha despublicada.** Cuando el registro ya trae giros asignados (porque estuvo publicado), el formulario DEBE llegar con esos giros ya marcados, para que republicar no los borre sin que el admin se dé cuenta; el admin puede desmarcarlos o cambiarlos como en cualquier aprobación. Al publicar de nuevo, la fecha de publicación DEBE actualizarse a la de esta publicación.

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
- **THEN** los 3 giros llegan marcados, y si aprueba sin tocarlos la ficha se publica con esos mismos 3 giros y con la fecha de publicación de hoy

#### Scenario: aprobar no edita los datos del negocio

- **WHEN** el admin aprueba un registro
- **THEN** el nombre, el WhatsApp, "¿Qué ofreces?", el teléfono, la dirección, el horario y la página del negocio quedan exactamente como el negocio los capturó
