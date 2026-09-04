# Delta de spec: registro-negocio

## ADDED Requirements

### Requirement: La verificación por SMS solo existe si está encendida y completamente configurada

El sitio DEBE ofrecer la verificación de propiedad del número por SMS (ADR-011) ÚNICAMENTE cuando estén, todas a la vez: la bandera `VERIFICACION_SMS_ACTIVA` con el valor `1`, las tres variables del proveedor (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`) no vacías, y el secreto `VERIFICACION_SMS_SECRETO` de al menos 32 caracteres, con el que el servidor firma el paso intermedio. Si falta cualquiera de ellas, si vienen vacías o de puros espacios, o si la bandera trae cualquier otro valor, el sitio DEBE comportarse **exactamente igual que si esta capacidad no existiera**: el formulario de registro se ve y se envía igual, un envío válido lleva directo a la pantalla de gracias de siempre, la ruta `/registro/verificar` responde como no encontrada igual que cualquier dirección inventada, no se hace ninguna petición al proveedor, no se agrega ni un byte de JavaScript de cliente y ninguna pantalla del panel cambia. Apagado es el estado por defecto: no hay valor de relleno ni "modo de prueba" que encienda la capacidad sin esas variables.

Cuando la configuración está **a medias** —la bandera encendida con credenciales incompletas, o credenciales completas sin secreto— el servidor DEBE dejar **una sola advertencia por proceso** en su log diciendo qué falta, sin incluir el valor de ninguna credencial ni parte de ella, sin detener el arranque y sin romper ninguna página: el comportamiento sigue siendo el de apagado. Este requirement manda sobre todos los demás de la verificación por SMS: cualquier duda sobre si algo se muestra o se envía se resuelve del lado de no mostrar y no enviar.

El trato con el proveedor DEBE pasar por un **puerto propio** de dos operaciones —pedir el código y comprobarlo—, con el adaptador real detrás, igual que el almacén de fotos vive tras `FOTOS_DIR`. El adaptador real solo DEBE construirse cuando la configuración está completa, y el comportamiento observable NO DEBE depender de qué proveedor haya del otro lado. Gracias a eso, las pruebas automáticas del proyecto DEBEN poder recorrer todo el flujo —código correcto, equivocado, vencido, proveedor caído— **con un adaptador simulado, sin llamar a la red y sin exigir credenciales de nadie**.

#### Scenario: sin configuración, el sitio de hoy

- **WHEN** el sitio corre sin ninguna de las variables de la verificación y un dueño llena y envía el formulario de registro correctamente
- **THEN** su negocio queda guardado en `en_revision` y ve la pantalla de gracias con el mensaje "¡Gracias! Tu negocio está en revisión. Te contactaremos por WhatsApp para confirmar tus datos antes de publicarlo.", sin ver ninguna pantalla de código, y no sale ninguna petición hacia el proveedor de SMS

#### Scenario: la ruta del código no existe cuando la capacidad está apagada

- **WHEN** alguien abre a mano `/registro/verificar` con la capacidad apagada
- **THEN** recibe la misma respuesta de no encontrado que cualquier dirección inventada del sitio, sin ninguna pista de que esa pantalla exista

#### Scenario: configuración a medias

- **WHEN** el sitio corre con `VERIFICACION_SMS_ACTIVA="1"` pero sin `TWILIO_VERIFY_SERVICE_SID`, o con las credenciales completas y sin `VERIFICACION_SMS_SECRETO`
- **THEN** el registro se comporta como con la capacidad apagada, las páginas responden con normalidad y queda una sola advertencia en el log del servidor que dice qué falta, sin ninguna credencial dentro

#### Scenario: apagar la bandera devuelve el flujo de siempre

- **WHEN** la capacidad estuvo encendida y se apaga la bandera, dejando las credenciales puestas
- **THEN** los envíos siguientes terminan en la pantalla de gracias sin pedir código y no se manda ningún SMS más

#### Scenario: nada nuevo en el HTML con la capacidad apagada

- **WHEN** se comparan las páginas de registro, de gracias, la cola del panel y el detalle de un registro sin verificar, con la capacidad apagada, contra lo que el sitio respondía antes de este cambio
- **THEN** no aparece ningún texto, campo, enlace ni script nuevo en ninguna de ellas

#### Scenario: la suite no llama a la red ni pide credenciales

- **WHEN** se corre la suite completa del proyecto sin ninguna variable del proveedor configurada
- **THEN** pasa entera, incluidas las pruebas del flujo de verificación con su adaptador simulado, sin hacer ninguna petición a un dominio externo y sin construir el adaptador real

### Requirement: Con la bandera encendida, el registro se guarda antes de pedir el código

Cuando la capacidad está encendida, un envío válido del formulario DEBE crear el negocio en `en_revision` **antes** de pedirle nada al proveedor, con exactamente las mismas reglas de hoy (estado, origen, constancia del consentimiento y texto de búsqueda los pone el servidor). Solo después el sistema DEBE pedir el código al proveedor y llevar al dueño a la pantalla de captura. La ficha recién creada queda **sin verificar** hasta que el proveedor confirme el código: nada del alta depende del SMS.

Si el código no se puede pedir —el proveedor falla o tarda, el tope diario está alcanzado, el cupo por IP está agotado o el número no lo acepta el proveedor— el sistema NO DEBE mostrar ningún error ni perder el registro: DEBE llevar al dueño a la pantalla de gracias de siempre, con su mensaje de siempre, y la ficha queda en la cola sin verificar, para que el admin la confirme por WhatsApp como hace hoy. El envío del formulario NO DEBE quedarse esperando al proveedor más allá de un tiempo corto y acotado: si se pasa, se toma como que el código no salió.

Abandonar la pantalla del código —cerrar la pestaña, apagar el celular, no escribir nada— NO DEBE tener ninguna consecuencia sobre la ficha: sigue en `en_revision`, sin verificar, y su espera en la cola cuenta desde el registro, no desde el SMS.

#### Scenario: el registro existe aunque el SMS no salga

- **WHEN** un dueño envía el formulario correctamente con la capacidad encendida y el proveedor de SMS responde con un error
- **THEN** su negocio ya quedó guardado en `en_revision`, sin marca de verificación, y ve la pantalla de gracias con el mensaje de siempre, sin ningún mensaje de error ni detalle del proveedor

#### Scenario: el dueño abandona la pantalla del código

- **WHEN** el dueño llega a la pantalla del código y cierra la pestaña sin escribir nada
- **THEN** su ficha sigue en la cola del panel, en `en_revision` y sin verificar, exactamente como cualquier registro de hoy

#### Scenario: el alta no cambia por la bandera

- **WHEN** se compara lo que queda guardado tras un envío válido con la capacidad encendida y con la capacidad apagada
- **THEN** el negocio queda igual en los dos casos —mismo estado, mismo origen, misma constancia de consentimiento, mismos datos capturados— y la única diferencia posible es la marca de verificación, que se escribe después

#### Scenario: el proveedor tarda demasiado

- **WHEN** el proveedor no contesta dentro del tiempo acotado que el sistema espera
- **THEN** el dueño ve la pantalla de gracias sin esperar más, su registro está guardado y no queda ninguna petición colgada

### Requirement: La pantalla "Confirma tu número" captura el código sin JavaScript y con intentos acotados

Con la capacidad encendida y el código ya pedido, el dueño DEBE llegar a una pantalla propia (`/registro/verificar`) que use el layout del sitio, sea correcta a 390px y funcione con el JavaScript de cliente deshabilitado, como el resto del registro. La pantalla DEBE encabezarse con el texto literal "Confirma tu número" y mostrar, en este orden:

- la explicación, literalmente: "Te mandamos un código por SMS al número que termina en 4567. Escríbelo aquí y confirmamos que ese WhatsApp es tuyo." (donde `4567` son los últimos cuatro dígitos del número que capturó);
- la tranquilidad, literalmente: "Tu negocio ya quedó registrado y está en revisión. Esto solo nos ahorra un paso.";
- un campo con el rótulo literal "Código de 6 dígitos", que abre el teclado numérico en el celular y tiene etiqueta asociada;
- el botón literal "Confirmar mi número";
- un botón literal "Reenviar el código";
- y una salida con el texto literal "Mejor luego, mi registro ya quedó", que lleva a la pantalla de gracias sin marcar nada.

El número completo NO DEBE aparecer en la pantalla, ni el código, ni ningún identificador del registro. La pantalla NO DEBE ser indexable y NO DEBE aparecer en el sitemap, igual que `/registro/gracias`.

La pantalla solo DEBE abrirse para quien acaba de enviar su registro en esta sesión: el sistema DEBE saber de qué ficha se trata por una **credencial de paso que pone y firma el servidor** —nunca por un identificador en la URL ni por un campo que mande el cliente—, con caducidad corta. Sin esa credencial, o con una alterada, caducada o de otra ficha, la pantalla DEBE responder como no encontrada, sin decir si ese registro existe.

Los intentos DEBEN estar acotados: como máximo 5 códigos escritos y 2 reenvíos por registro. Al agotarse cualquiera de los dos, el sistema DEBE llevar al dueño a la pantalla de gracias con el mensaje literal "Ya lo intentaste varias veces. No te preocupes: tu registro está en revisión y te vamos a contactar por WhatsApp." y NO DEBE pedir más códigos para esa ficha. Entre un reenvío y el siguiente DEBE haber una espera de al menos 60 segundos; mientras no se cumpla, el botón de reenviar DEBE responder con el texto literal "Espera un momento para pedir otro código."

Los mensajes de error DEBEN mostrarse junto al campo, en español llano y sin detalles del proveedor, y DEBEN ser, literalmente: "Escribe los 6 dígitos que te llegaron por SMS." cuando lo capturado no son 6 dígitos, "Ese código no es. Revísalo y vuelve a escribirlo." cuando el proveedor dice que no coincide, "Ese código ya venció. Pide uno nuevo." cuando caducó, y "No pudimos confirmar tu número en este momento. No te preocupes: tu registro está en revisión y te vamos a contactar por WhatsApp." cuando el proveedor falla o no contesta.

Cuando el proveedor confirma el código, el sistema DEBE marcar la ficha como verificada (capacidad `modelo-datos`) y llevar al dueño a la pantalla de gracias, que DEBE mostrar arriba del mensaje de siempre la línea literal "¡Listo! Ya confirmamos tu número." El mensaje de gracias NO DEBE cambiar ni una palabra. **Verificar el número NO DEBE publicar la ficha, ni cambiar su estado, ni adelantar la cola**: la ficha sigue en `en_revision` esperando al admin.

#### Scenario: código correcto

- **WHEN** el dueño escribe el código que le llegó y toca "Confirmar mi número"
- **THEN** ve la pantalla de gracias con "¡Listo! Ya confirmamos tu número." arriba del mensaje "¡Gracias! Tu negocio está en revisión. Te contactaremos por WhatsApp para confirmar tus datos antes de publicarlo.", y su ficha sigue en `en_revision`, ahora con su marca de verificación

#### Scenario: código equivocado

- **WHEN** el dueño escribe un código que no coincide
- **THEN** sigue en la pantalla "Confirma tu número", ve "Ese código no es. Revísalo y vuelve a escribirlo." junto al campo, su ficha sigue sin verificar y puede volver a intentar

#### Scenario: código incompleto

- **WHEN** el dueño manda el campo vacío o con 4 dígitos
- **THEN** ve "Escribe los 6 dígitos que te llegaron por SMS." junto al campo y no se le pide nada al proveedor

#### Scenario: se acaban los intentos

- **WHEN** el dueño falla el código cinco veces
- **THEN** ve la pantalla de gracias con "Ya lo intentaste varias veces. No te preocupes: tu registro está en revisión y te vamos a contactar por WhatsApp.", su ficha queda sin verificar y no se manda ningún SMS más para ese registro

#### Scenario: reenviar demasiado pronto

- **WHEN** el dueño toca "Reenviar el código" antes de que pasen 60 segundos del envío anterior
- **THEN** ve "Espera un momento para pedir otro código." y no se manda ningún SMS

#### Scenario: salir por su propio pie

- **WHEN** el dueño toca "Mejor luego, mi registro ya quedó"
- **THEN** llega a la pantalla de gracias con el mensaje de siempre, sin la línea de confirmación, y su ficha queda sin verificar

#### Scenario: la pantalla no se abre de a gratis

- **WHEN** alguien abre `/registro/verificar` sin haber enviado un registro, o con la credencial de paso alterada, caducada o correspondiente a otra ficha
- **THEN** recibe la respuesta de no encontrado, sin que se confirme si ese registro existe y sin que se pueda marcar nada

#### Scenario: sin JavaScript de cliente

- **WHEN** el dueño captura el código, reenvía y confirma con el JavaScript de cliente deshabilitado
- **THEN** las tres acciones funcionan igual, porque cada una es un envío de formulario del servidor

#### Scenario: verificar no publica

- **WHEN** una ficha verifica su número correctamente
- **THEN** sigue en `en_revision`, no aparece en ninguna página pública y espera su turno en la cola como cualquier otra

### Requirement: El canal de SMS cuesta dinero y está acotado por cupo, cooldown y tope diario

Cada verificación se paga por mensaje (ADR-011: ~$0.05 USD por SMS a México más los requisitos A2P), así que el sistema DEBE acotar cuántos SMS puede provocar quien quiera, sin captcha y sin fricción para el dueño legítimo (PRD §8):

- **Cupo por IP**: como máximo 3 códigos pedidos por hora desde la misma IP, con **su propio conteo**, separado del cupo de altas del registro y del de reportes: agotar uno no consume los otros. La política de lectura de la IP es la misma de siempre —solo se confía en el encabezado que el despliegue declara y, sin esa configuración, este cupo no se aplica—.
- **Cooldown de reenvío**: al menos 60 segundos entre un SMS y el siguiente para el mismo registro, y como máximo 2 reenvíos por registro.
- **Tope diario global**: un número configurable de verificaciones iniciadas por día (por defecto 50). Al alcanzarlo, el sistema DEBE **dejar de pedir códigos** —los envíos siguientes terminan en la pantalla de gracias, como si la capacidad estuviera apagada— y DEBE registrar una alerta en el log del servidor, con la misma forma que la alerta de altas diarias del PRD §8. La diferencia con esa alerta es deliberada y hay que respetarla: la de altas solo avisa, esta además corta, porque lo que está en juego es dinero que se gasta solo.

Cuando un envío se queda sin cupo o sin tope, el dueño NO DEBE ver un error técnico ni enterarse del motivo: ve la pantalla de gracias de siempre, con su ficha guardada. En la pantalla del código, un reenvío bloqueado por el cupo por IP DEBE responder con el texto literal "Ya pedimos varios códigos desde aquí. Espera un rato y vuelve a intentar."

Ningún camino DEBE poder pedir un SMS sin haber creado o actualizado antes una ficha: no existe una forma de mandar mensajes escribiendo un número suelto.

#### Scenario: cupo por IP agotado

- **WHEN** desde la misma IP se piden tres códigos en una hora y llega un cuarto registro válido
- **THEN** ese cuarto registro se guarda igual y su dueño ve la pantalla de gracias, sin código y sin ningún mensaje que le explique por qué

#### Scenario: los cupos no se comparten

- **WHEN** desde la misma IP se agota el cupo de códigos y enseguida se envía un reporte, o se agota el cupo de reportes y enseguida se registra un negocio
- **THEN** cada uno se procesa con su propio contador, sin que agotar uno bloquee al otro

#### Scenario: tope diario alcanzado

- **WHEN** en un día se alcanza el tope configurado de verificaciones iniciadas y llega otro registro válido
- **THEN** no se manda ningún SMS más ese día, el registro se guarda y termina en la pantalla de gracias, y queda una alerta en el log del servidor

#### Scenario: no se puede pedir un SMS sin registro

- **WHEN** llega directamente al servidor una petición de mandar un código con un número escrito a mano, sin un registro detrás
- **THEN** no se manda ningún mensaje y no se crea ni se toca ninguna ficha

#### Scenario: sin encabezado de IP declarado

- **WHEN** el sitio corre sin la variable que declara el encabezado de la IP
- **THEN** el cupo por IP de los códigos simplemente no se aplica —como ya pasa con el de altas— y el cooldown, el tope de reenvíos y el tope diario siguen operando

### Requirement: Ni el código ni las credenciales aparecen en URLs, logs ni pantallas

El código de verificación NO DEBE generarse, guardarse ni compararse en el sitio: lo produce, lo caduca y lo compara el proveedor (ADR-011), y el servidor solo le pregunta si el código que escribió el dueño es el bueno. En consecuencia, el sistema NO DEBE tener ninguna columna, archivo ni memoria donde viva un código.

Ni el código, ni las credenciales del proveedor, ni el número de WhatsApp completo, ni el identificador del registro DEBEN viajar en una URL, escribirse en el log del servidor o aparecer en un mensaje de error mostrado a quien envía. Los errores del proveedor DEBEN traducirse a los textos en español llano de la pantalla del código, sin códigos de error, sin nombres de servicio y sin partes de la respuesta del proveedor. El log de la capacidad DEBE limitarse a eventos y conteos (se pidió un código, se agotó el tope diario, la configuración está incompleta), como ya hace el registro con sus propios eventos.

#### Scenario: nada sensible en la URL

- **WHEN** el dueño pide el código, se equivoca, reenvía y confirma
- **THEN** las únicas rutas que recorre son `/registro`, `/registro/verificar` y `/registro/gracias`, sin cadena de consulta que traiga el código, el número o el identificador de su ficha

#### Scenario: nada sensible en el log

- **WHEN** se revisa todo lo que el servidor escribió durante una verificación exitosa, una fallida y una con el proveedor caído
- **THEN** no aparece ningún código, ninguna credencial ni el número de WhatsApp del negocio

#### Scenario: el error del proveedor no se filtra

- **WHEN** el proveedor responde con un error propio (credenciales rechazadas, servicio no disponible, número bloqueado)
- **THEN** el dueño ve "No pudimos confirmar tu número en este momento. No te preocupes: tu registro está en revisión y te vamos a contactar por WhatsApp." y ningún detalle del proveedor llega a la pantalla

#### Scenario: el código no se guarda en casa

- **WHEN** se revisan el esquema de la base, el almacenamiento y el estado que el sitio conserva entre peticiones
- **THEN** no existe ningún lugar donde se guarde el código de verificación de nadie

## MODIFIED Requirements

### Requirement: Una sola ficha por número de WhatsApp

Si el WhatsApp normalizado ya tiene ficha en estado `en_revision` o `publicado`, el registro DEBE rechazarse y el formulario DEBE decirlo con el texto literal "Este número ya tiene una ficha registrada. Si es tu negocio, no hace falta registrarlo otra vez: te vamos a pasar por WhatsApp el enlace para editarlo." El flujo "Perdí mi enlace" es P1 (PRD §6.4) y aquí solo se menciona, sin enlace ni botón. **Un envío rechazado por duplicado NO DEBE provocar ningún SMS**: no se pide código para una ficha que no se creó ni se actualizó, y quien escriba números ajenos no DEBE poder usar el formulario para mandarles mensajes.

Si la ficha de ese número está en estado `rechazado`, el envío NO DEBE tratarse como duplicado: el negocio "puede corregir y volver a enviar" (PRD §6.3). En ese caso el sistema DEBE actualizar esa misma ficha con los datos del nuevo envío, regresarla a `en_revision`, dejar nulos la fecha y el motivo del rechazo anterior (si no, la purga de rechazados a los 90 días se llevaría un registro que ya está otra vez en la cola) y reiniciar el reloj de la espera, de modo que el indicador de 48 horas del panel cuente desde el reenvío.

**La marca de verificación del número NO se toca en el reenvío**: el número es el mismo —es la llave por la que se encontró la ficha—, así que un hecho ya comprobado sigue siendo cierto y la marca se conserva tal cual. Con la capacidad encendida, un reenvío de una ficha ya verificada NO DEBE pedir código otra vez: va directo a la pantalla de gracias. Un reenvío de una ficha sin verificar sí puede pedirlo, con los mismos cupos que cualquier envío. Como el estado, el origen y la constancia del consentimiento, esta marca solo la escribe el servidor tras la confirmación del proveedor: ningún valor enviado por el cliente DEBE poder fijarla, borrarla ni adelantarla.

La constancia del consentimiento es la excepción: ni la fecha (`consintioAvisoEn`) ni la versión aceptada (`consintioAvisoVersion`) DEBEN sustituirse en el reenvío, porque son la evidencia LFPDPPP del titular y un formulario anónimo podría estar siendo reenviado por un tercero; el checkbox de consentimiento sigue siendo obligatorio en cada envío. Cuando la versión vigente del aviso es **posterior** a la de esa constancia original, el sistema DEBE registrar aparte la reaceptación: la fecha del reenvío y la versión vigente (`reconsintioAvisoEn` y `reconsintioAvisoVersion`), sobrescribiendo la reaceptación anterior si la hubiera. En cualquier otro caso los campos de reaceptación NO DEBEN tocarse: ni cuando la versión vigente es la misma de la constancia, ni cuando es **anterior** (un despliegue revertido), ni cuando la constancia original **no tiene versión** por ser anterior al versionado, que no es comparable con ninguna. Anotar una reaceptación en esos casos afirmaría un cambio que no ocurrió, o convertiría a cualquiera que conozca el número en autor de evidencia de consentimiento sobre la ficha de otro. Esto solo puede ocurrir sobre un envío aceptado, así que la reaceptación siempre corresponde a una casilla marcada con ese texto enfrente (ver el requirement "Nadie consiente una versión del aviso que no tuvo enfrente").

El dueño DEBE ver la misma pantalla de gracias que un registro nuevo. El sistema NO DEBE revelarle en ningún momento que su ficha estaba rechazada ni el motivo del rechazo: ese dato solo vive dentro del panel, y el formulario público es anónimo (cualquiera podría escribir un número ajeno). El reenvío sigue siendo un envío del formulario público: DEBE pasar por las mismas validaciones, por el campo trampa y por el límite de envíos por IP, y NO DEBE poder alterar el origen, los giros, el token de gestión ni la fecha de publicación de la ficha.

#### Scenario: número con ficha publicada

- **WHEN** el dueño envía un WhatsApp que ya tiene ficha publicada
- **THEN** no se crea un segundo negocio ni se toca la ficha existente, no se manda ningún SMS, y ve el mensaje "Este número ya tiene una ficha registrada. Si es tu negocio, no hace falta registrarlo otra vez: te vamos a pasar por WhatsApp el enlace para editarlo." junto al campo de WhatsApp

#### Scenario: número con ficha en revisión

- **WHEN** el dueño envía un WhatsApp cuya ficha sigue esperando revisión
- **THEN** ve el mismo mensaje de número ya registrado, su ficha en cola no cambia y nadie recibe un SMS

#### Scenario: el formulario no sirve para mandarle mensajes a un tercero

- **WHEN** alguien envía el formulario una y otra vez con números ajenos que ya tienen ficha
- **THEN** ninguno de esos números recibe un SMS, porque el código solo se pide para una ficha que este envío creó o actualizó

#### Scenario: reenvío tras un rechazo

- **WHEN** un negocio cuya ficha fue rechazada corrige sus datos y vuelve a enviar el formulario con el mismo número
- **THEN** ve la pantalla de gracias con el mensaje "¡Gracias! Tu negocio está en revisión. Te contactaremos por WhatsApp para confirmar tus datos antes de publicarlo.", su ficha queda con los datos nuevos en estado `en_revision`, sin fecha ni motivo de rechazo, y vuelve a aparecer en la cola del panel como recién llegada

#### Scenario: el reenvío conserva la verificación del número

- **WHEN** una ficha que ya había verificado su número por SMS se rechaza y el negocio la reenvía corregida
- **THEN** su marca de verificación sigue con la fecha original, no se le pide código otra vez y llega directo a la pantalla de gracias

#### Scenario: el cliente no puede fijar la verificación

- **WHEN** un envío incluye campos extra que pretenden marcar la ficha como verificada (una fecha de verificación, un "verificado=1" o un código a modo)
- **THEN** esos valores se ignoran y la ficha queda sin verificar, igual que cualquier registro que no pasó por el proveedor

#### Scenario: la constancia del consentimiento no se sustituye en el reenvío

- **WHEN** una ficha rechazada se reenvía con el checkbox de consentimiento marcado y el aviso sigue en la misma versión
- **THEN** el reenvío se acepta, la ficha conserva la fecha y la versión de consentimiento del registro original, y sus campos de reaceptación siguen vacíos

#### Scenario: reenvío contra una versión nueva del aviso

- **WHEN** una ficha rechazada cuya constancia es de la versión `1` se reenvía cuando ya está vigente la versión `2`
- **THEN** la constancia original sigue diciendo versión `1` con su fecha de siempre, y la ficha queda además con la reaceptación: la fecha del reenvío y la versión `2`

#### Scenario: reenvío de una ficha anterior al versionado

- **WHEN** se reenvía una ficha cuya constancia no tiene versión registrada
- **THEN** su constancia sigue sin versión (no se le inventa una) y NO se registra reaceptación: sin versión de partida no hay nada con qué comparar, y el panel sigue mostrando "versión no registrada"

#### Scenario: reenvío después de revertir el despliegue

- **WHEN** una ficha rechazada cuya constancia es de la versión `2` se reenvía cuando la versión vigente volvió a ser la `1`
- **THEN** el reenvío se acepta con normalidad y no se anota reaceptación: la versión vigente no es posterior a la de la constancia, y registrar lo contrario afirmaría un cambio que no ocurrió

#### Scenario: el formulario no delata el rechazo

- **WHEN** alguien envía el formulario con un número cuya ficha estaba rechazada
- **THEN** en ningún momento ve el motivo del rechazo ni ningún dato de la ficha anterior

#### Scenario: el reenvío no se autopublica

- **WHEN** un reenvío incluye campos extra como estado `publicado`, origen `siembra`, giros, fecha de publicación o una versión del aviso a modo
- **THEN** esos valores se ignoran y la ficha queda en `en_revision`, con el origen que ya tenía, sin giros nuevos, sin fecha de publicación y con la constancia original intacta

#### Scenario: el reenvío pasa por las mismas defensas

- **WHEN** un reenvío llega con el campo trampa lleno, con la IP sin cupo o con un campo inválido
- **THEN** se trata exactamente igual que cualquier otro envío del formulario y la ficha rechazada no cambia

#### Scenario: duplicado escrito con otro formato

- **WHEN** un negocio ya publicado como "7711234567" se intenta registrar de nuevo como "+52 771 123 4567"
- **THEN** el sistema lo detecta como el mismo número y muestra el mismo mensaje, sin crear una segunda ficha

#### Scenario: carrera entre dos envíos simultáneos

- **WHEN** dos envíos con el mismo número llegan casi al mismo tiempo y el segundo choca con la unicidad de la base de datos
- **THEN** el usuario del segundo envío ve el mensaje de número ya registrado, no un error técnico

### Requirement: El envío exitoso encola el negocio y muestra la pantalla de gracias

Un envío válido DEBE crear el negocio en estado `en_revision` con origen `organico` (los valores por defecto del modelo) y llevar al dueño a la pantalla de gracias con el mensaje literal del PRD §6.1: "¡Gracias! Tu negocio está en revisión. Te contactaremos por WhatsApp para confirmar tus datos antes de publicarlo." El estado, el origen y la constancia del consentimiento —su fecha y su versión— los fija el servidor: ningún valor enviado por el cliente DEBE poder alterarlos. Recargar la pantalla de gracias NO DEBE crear un registro nuevo.

**A dónde lleva el envío depende de la bandera de la verificación por SMS, y solo de eso**: con la capacidad apagada —el estado por defecto y el del lanzamiento— el envío válido lleva directo a la pantalla de gracias, como siempre; con la capacidad encendida y el código pedido con éxito, lleva a la pantalla "Confirma tu número", que a su vez termina en la pantalla de gracias. El mensaje de la pantalla de gracias NO DEBE cambiar en ningún caso: cuando el número quedó verificado se le agrega **arriba** la línea "¡Listo! Ya confirmamos tu número.", sin tocar el texto de siempre. La pantalla de gracias DEBE seguir siendo alcanzable por sí sola y recargarla NO DEBE crear ni marcar nada.

#### Scenario: registro exitoso

- **WHEN** el dueño envía el formulario correctamente lleno
- **THEN** ve la pantalla con el mensaje "¡Gracias! Tu negocio está en revisión. Te contactaremos por WhatsApp para confirmar tus datos antes de publicarlo." y el negocio queda guardado en estado `en_revision` con origen `organico`, sin giros y sin publicar

#### Scenario: registro exitoso con la verificación encendida

- **WHEN** el dueño envía el formulario correctamente lleno, con la capacidad de verificación encendida y el código pedido con éxito
- **THEN** llega a la pantalla "Confirma tu número" y su negocio ya quedó guardado en `en_revision`, con origen `organico`, sin giros y sin publicar

#### Scenario: el cliente no puede autopublicarse

- **WHEN** un envío incluye campos extra como estado `publicado`, origen `siembra`, fecha de publicación o token de gestión
- **THEN** esos valores se ignoran y el negocio queda igual en `en_revision`, origen `organico`, sin fecha de publicación y sin token

#### Scenario: recarga tras el éxito

- **WHEN** el dueño recarga la pantalla de gracias o vuelve a ella
- **THEN** no se crea ningún registro adicional y no se marca ninguna verificación

#### Scenario: falla al guardar

- **WHEN** el guardado falla por un problema del servidor o de la base de datos
- **THEN** el dueño ve el mensaje "No pudimos guardar tu registro. Vuelve a intentarlo en un momento." con sus datos aún en el formulario, no se pide ningún código y no se muestra ningún detalle técnico del error

### Requirement: El embudo del registro se mide con las vistas de sus dos pantallas

Los eventos "formulario iniciado" y "formulario enviado" del PRD §9 DEBEN medirse con las vistas de página de `/registro` y de `/registro/gracias`, sin agregar JavaScript propio, sin instrumentar el botón "Enviar" y sin ningún evento extra. El botón no se instrumenta a propósito: un clic en "Enviar" con errores de validación no es un registro, y contarlo inflaría la conversión del PRD §10 ("% de registros completados sin ayuda", que se lee como vistas de `/registro/gracias` entre vistas de `/registro`). La pantalla de gracias es un proxy de la conversión, no el conteo contable de altas: el número exacto de negocios registrados vive en la base de datos.

La pantalla "Confirma tu número" NO DEBE agregar ningún evento propio ni ningún JavaScript: si existe, se mide como cualquier otra página pública, por su vista. Como con la capacidad encendida esa pantalla se mete **entre** el envío y la pantalla de gracias, quien abandone ahí ya tiene su ficha guardada pero no genera vista de `/registro/gracias`: el proxy de la conversión se vuelve más estricto de lo que era. Esa consecuencia DEBE quedar escrita en la documentación de activación (capacidad `despliegue`), para que nadie lea una caída del embudo como una caída de registros; el conteo contable sigue siendo la base de datos. Con la capacidad apagada el embudo es exactamente el de siempre.

#### Scenario: registro exitoso

- **WHEN** el dueño de un negocio llena el formulario correctamente y lo envía, con la medición configurada
- **THEN** quedan registradas una vista de `/registro` y una vista de `/registro/gracias`, que es lo que cuenta como conversión

#### Scenario: envío con errores no cuenta como conversión

- **WHEN** el dueño envía el formulario con un campo mal y ve los errores por campo
- **THEN** sigue en `/registro`, no se registra ninguna vista de `/registro/gracias` y no se manda ningún evento de "enviado"

#### Scenario: sin instrumentación en el botón

- **WHEN** se revisa el formulario de registro
- **THEN** el botón "Enviar" no lleva ningún atributo de evento ni JavaScript agregado para medir, y el formulario sigue funcionando sin JavaScript de cliente

#### Scenario: la pantalla del código no agrega eventos

- **WHEN** se revisa la pantalla "Confirma tu número" con la medición configurada
- **THEN** no lleva ningún atributo de evento ni JavaScript propio, y lo único que puede llegar al proveedor es la vista de esa ruta, sin cadena de consulta

#### Scenario: abandonar en el código no cuenta como conversión

- **WHEN** un dueño envía su registro con la capacidad encendida y abandona en la pantalla del código
- **THEN** su ficha está guardada en la base y no hay vista de `/registro/gracias`, así que el conteo contable de altas y el proxy del embudo pueden diferir, tal como advierte la documentación de activación
