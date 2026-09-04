# Spec: despliegue

Lo que el sistema garantiza para que poner el sitio en producción sea configurar variables y presionar un botón: un solo dialecto de base de datos, lo que el CI prueba, el build, la configuración que no puede faltar en silencio, dónde viven las fotos, los comandos que escriben en la base, las tareas programadas que corren solas, las cabeceras de toda respuesta y el documento único de despliegue.

## Requirements

### Requirement: Un solo dialecto de base de datos en todos los entornos

El sistema DEBE usar el mismo motor de base de datos —PostgreSQL, el que ADR-004 recomienda para producción— en desarrollo, en pruebas, en integración continua y en producción. DEBE existir un solo esquema de Prisma y un solo árbol de migraciones; el proyecto NO DEBE mantener migraciones paralelas por dialecto. La base local DEBE poder levantarse con un solo comando documentado, sin cuentas ni servicios de pago, y el mismo árbol de migraciones que se aplica en local DEBE ser el que se aplica en producción.

#### Scenario: base local desde un clon recién hecho

- **WHEN** alguien clona el repositorio, copia `.env.example` a `.env`, levanta la base local con el comando documentado y aplica las migraciones
- **THEN** obtiene una base PostgreSQL con todas las tablas del modelo, y `npm run db:seed` la deja con los tres catálogos poblados (8 categorías, 21 colonias, 49 giros)

#### Scenario: el mismo árbol en producción

- **WHEN** se aplican las migraciones sobre la base vacía de producción
- **THEN** se aplica exactamente el mismo árbol de migraciones que en local, sin pasos manuales ni SQL escrito aparte, y el esquema resultante es el mismo

#### Scenario: no hay dos dialectos que mantener

- **WHEN** se revisa el proyecto
- **THEN** existe un único esquema de Prisma, un único directorio de migraciones y su dialecto declarado es PostgreSQL; ningún archivo del proyecto declara un dialecto distinto

### Requirement: El CI prueba las migraciones y la suite contra un Postgres efímero

Cada Pull Request DEBE ejercitarse contra una base PostgreSQL creada desde cero para esa corrida: aplicar todas las migraciones en orden, correr el seed de catálogos y correr toda la suite de pruebas contra ella. Una migración que no aplique, un seed que falle o una prueba que dependa de una peculiaridad de otro dialecto DEBEN reprobar el PR. El CI NO DEBE usar la base de nadie más ni conservar datos entre corridas.

#### Scenario: PR con una migración que no aplica en el dialecto de producción

- **WHEN** un PR agrega una migración con SQL que PostgreSQL no acepta
- **THEN** el CI falla en el paso de migraciones y el PR no se puede mergear

#### Scenario: la suite corre contra la base de producción-equivalente

- **WHEN** el CI corre las pruebas
- **THEN** todas se ejecutan contra el Postgres efímero de la corrida, incluidas las del buscador, las del directorio y las del panel

#### Scenario: base limpia en cada corrida

- **WHEN** se corren dos veces seguidas los mismos workflows
- **THEN** la segunda corrida arranca con una base vacía y da el mismo resultado que la primera

### Requirement: El build de producción no necesita la base de datos

`next build` DEBE completarse sin ninguna base de datos accesible: ninguna página DEBE consultar la base al construir. Toda ruta que lea la base DEBE renderizarse por petición. El CI DEBE construir sin base accesible, de modo que una ruta nueva que rompa esta regla reprueba el PR en vez de descubrirse en el primer deploy.

#### Scenario: build sin base

- **WHEN** se corre el build de producción sin ninguna base disponible ni alcanzable
- **THEN** termina con éxito y no intenta conectarse

#### Scenario: una ruta nueva que lee la base al construir

- **WHEN** alguien agrega una página que consulta la base y no se rinde por petición
- **THEN** la verificación automática lo señala y el PR falla

### Requirement: En producción ninguna configuración requerida falta en silencio

Cuando falte una variable sin la cual el sistema no puede cumplir su función, el sistema DEBE decirlo —en el log del servidor al arrancar y, cuando corresponda, en la pantalla afectada— y NUNCA DEBE sustituirla por un valor de desarrollo. En particular: sin dirección de base de datos configurada en producción el sistema NO DEBE caer a la base local por defecto, y sin `SITIO_URL` en producción ninguna pantalla DEBE armar enlaces a `localhost`. El mismo criterio rige para el secreto de las tareas programadas y para el almacenamiento de fotos, cuyas consecuencias propias se enuncian en sus requirements. Fuera de producción se conservan los valores locales por defecto, para que un clon recién hecho arranque sin configurar nada.

#### Scenario: producción sin dirección de base de datos

- **WHEN** el sistema arranca en producción sin `DATABASE_URL`
- **THEN** deja constancia del problema con el nombre de la variable que falta y no se conecta a ninguna base local por defecto

#### Scenario: producción sin `SITIO_URL`

- **WHEN** el sistema arranca en producción sin `SITIO_URL`
- **THEN** deja constancia del problema en el log del servidor, y el panel avisa a la vista que no puede armar el link de la ficha en lugar de mandar un `localhost` a un negocio real

#### Scenario: desarrollo sin configurar nada

- **WHEN** alguien arranca el proyecto en local con la base local levantada y sin más variables que las del ejemplo
- **THEN** el sitio funciona con los valores por defecto de desarrollo y no exige configuración de producción

#### Scenario: el aviso no se repite por petición

- **WHEN** se piden muchas páginas con la configuración incompleta
- **THEN** el aviso aparece una sola vez por proceso en el log, no una vez por petición

### Requirement: Ninguna conexión a la base sale de la máquina sin cifrar

Cuando la dirección de la base de datos apunte a un host que no es la máquina donde corre el proceso, la conexión DEBE ir cifrada. El sistema NO DEBE abrir una conexión en claro hacia un servidor remoto: DEBE fallar a la vista y decir en el log qué falta, con el mismo criterio que usa para `SITIO_URL` y `DATABASE_URL`. Ningún mensaje DEBE incluir la contraseña de la base. El documento de despliegue NO DEBE traer ningún valor de ejemplo remoto sin cifrado, y la verificación automática DEBE reprobar si aparece uno.

Para decidir si la dirección es local o remota, el sistema DEBE resolver el host **como lo resuelve el driver**, no leyendo la URL a ojo: una cadena de conexión puede llevar parámetros que cambian el destino real. Ante una dirección que no se pueda interpretar con seguridad, DEBE tratarse como remota.

#### Scenario: dirección remota sin cifrado

- **WHEN** el sistema arranca apuntando a una base que no está en esta máquina y la dirección no pide TLS
- **THEN** no abre ninguna conexión, lo dice en el log nombrando lo que falta, y el mensaje no incluye la contraseña de la base

#### Scenario: la dirección disfrazada de local

- **WHEN** una dirección dice `localhost` en la parte visible pero el driver se conectaría a otro host
- **THEN** el sistema la trata como remota: exige cifrado y los comandos que escriben masivamente en la base piden el permiso explícito

#### Scenario: la base local no necesita cifrado

- **WHEN** la dirección apunta a la máquina donde corre el proceso
- **THEN** no se exige TLS, porque los bytes no salen del equipo

### Requirement: Los comandos que escriben en la base reconocen el entorno real

Los comandos que escriben masivamente en la base (seed de demostración y relleno de búsqueda) DEBEN reconocer un entorno peligroso: "base local" significa una base en la máquina de quien corre el comando —el mismo criterio de host efectivo que exige el cifrado—, no un prefijo ni un texto de la dirección. En producción —detectada por `NODE_ENV` o por `VERCEL_ENV`— el seed de demostración NO DEBE sembrar nada, ni siquiera con permiso explícito. Contra una base remota que no sea de producción, DEBE exigir permiso explícito. Cada comando DEBE decir por qué no hizo nada.

#### Scenario: seed de demostración en el entorno de producción del hosting

- **WHEN** se intenta correr el seed de demostración con `VERCEL_ENV=production`
- **THEN** no siembra nada y lo dice

#### Scenario: seed de demostración apuntando a una base remota

- **WHEN** se intenta correr el seed de demostración con la dirección de una base remota y sin el permiso explícito
- **THEN** no siembra nada y explica que la dirección no es una base local y que hace falta asumir el riesgo a mano

#### Scenario: seed de demostración contra la base local

- **WHEN** se corre el seed de demostración contra la base PostgreSQL local de desarrollo
- **THEN** siembra los negocios ficticios y avisa que lo que sembró son datos de mentira

### Requirement: Las fotos de los negocios viven en el almacenamiento del proveedor, no en el disco del hosting

El sistema DEBE guardar y servir las fotos de los negocios a través de un puerto único, con un adaptador de producción que use el almacenamiento de archivos del mismo proveedor de la base de datos (Supabase Storage, ADR-006 + ADR-004) y NO el sistema de archivos del hosting, que es efímero. El adaptador de desarrollo (sistema de archivos local) DEBE existir y DEBE ser el que se use en la máquina de quien desarrolla cuando no haya configuración del proveedor.

El borrado definitivo de un negocio (ARCO, PRD §8) y la purga de los 90 días DEBEN llevarse los archivos del almacén configurado, sea cual sea. El barrido de fotos huérfanas DEBE preguntarle al mismo puerto qué hay guardado, y NO al sistema de archivos: un barrido que mira a otro sitio informa éxito sin haber revisado nada.

Una configuración del proveedor a medias —con una sola de sus dos variables obligatorias— NO DEBE usar el proveedor y DEBE quedar en el log; qué se hace en su lugar lo decide el requirement "Sin almacenamiento de fotos configurado, un despliegue no cae al disco en silencio". `docs/despliegue.md` DEBE traer las variables, el paso humano de crear el bucket **privado** y por qué tiene que serlo.

#### Scenario: la foto se guarda y se sirve desde el almacenamiento del proveedor

- **WHEN** el sistema corre con el almacenamiento del proveedor configurado y un negocio sube una foto
- **THEN** los archivos quedan en ese almacenamiento y la ficha publicada los muestra, sin depender del disco de la instancia que atendió la subida

#### Scenario: el borrado ARCO se lleva los archivos

- **WHEN** se borra definitivamente un negocio que tenía foto
- **THEN** sus archivos desaparecen del almacenamiento del proveedor, no solo del disco de una instancia

#### Scenario: el barrido mira donde están las fotos

- **WHEN** el barrido de huérfanas corre con el almacenamiento del proveedor configurado
- **THEN** revisa lo que hay ahí; y si el almacén responde vacío mientras la base tiene fichas que dicen tener foto, NO informa éxito: avisa de que está mirando al almacén equivocado

#### Scenario: configuración a medias

- **WHEN** el sistema arranca con solo una de las dos variables obligatorias del proveedor
- **THEN** no usa el proveedor y deja constancia en el log de qué variable falta y de que sin ella las fotos no sobrevivirían un despliegue

#### Scenario: en desarrollo no hace falta cuenta

- **WHEN** alguien clona el proyecto y no configura nada del proveedor
- **THEN** las fotos van al directorio local de siempre y todo funciona igual

### Requirement: Sin almacenamiento de fotos configurado, un despliegue no cae al disco en silencio

Cuando el sistema corra desplegado —el hosting dice que es producción, o la base de datos no está en la máquina que ejecuta— y no haya configuración utilizable del almacenamiento de fotos, el sistema NO DEBE usar el sistema de archivos local. DEBE decirlo en el log al arrancar, nombrando las variables que faltan, y DEBE fallar a la vista al intentar guardar una foto.

Un alta SIN foto DEBE seguir funcionando con normalidad. Un envío CON foto NO DEBE quedar a medias: el sistema NO DEBE crear una ficha que prometa una imagen que no se escribió, así que DEBE devolver el formulario con el mensaje de error de la foto que ya existe ("No pudimos preparar tu foto. Intenta con otra."), sin ficha guardada y sin archivos sueltos.

El barrido de huérfanas DEBE distinguir "no hay nada guardado" de "no pude mirar": sin almacenamiento configurado NO DEBE informar éxito. El borrado definitivo de una ficha con foto en ese estado se rige por el requirement "El borrado definitivo se niega a decir que borró lo que no borró": desde aquí no se puede saber si el bucket estuvo configurado antes y todavía guarda esa foto, así que el intento de borrar los archivos DEBE fallar a la vista en vez de darse por bueno.

Fuera de un despliegue —la máquina de quien desarrolla— se conserva el almacén local sin configurar nada.

#### Scenario: desplegado y sin configurar

- **WHEN** el sistema arranca desplegado sin las variables del almacenamiento
- **THEN** deja constancia en el log nombrando las variables que faltan, y ninguna foto se guarda en el disco de la instancia

#### Scenario: el alta con foto no deja una ficha a medias

- **WHEN** alguien registra su negocio con foto en ese estado
- **THEN** ve el formulario de vuelta con "No pudimos preparar tu foto. Intenta con otra.", no queda ninguna ficha guardada de ese envío ni ningún archivo suelto, y el log dice que no se pudo guardar la foto

#### Scenario: el alta sin foto sigue funcionando

- **WHEN** alguien registra su negocio sin foto en ese estado
- **THEN** el registro se guarda con normalidad y ve la pantalla de gracias de siempre

#### Scenario: el barrido no informa éxito

- **WHEN** la tarea programada del barrido corre en ese estado
- **THEN** no responde "nada que barrer": responde con error, para que el programador de tareas lo registre

#### Scenario: desarrollo sin configurar nada

- **WHEN** alguien clona el proyecto y arranca en su máquina
- **THEN** las fotos van al directorio local de siempre, sin avisos ni configuración

### Requirement: El borrado definitivo se niega a decir que borró lo que no borró

Cuando un negocio tenga foto y el almacenamiento no se deje alcanzar, el borrado definitivo (ARCO, PRD §8) NO DEBE ejecutarse: la fila NO DEBE tocarse y quien lo pidió DEBE recibir un mensaje que diga que **no** se borró, por qué y que se puede reintentar. Los archivos DEBEN intentarse ANTES que la fila, o en la misma unidad de trabajo; NUNCA la fila primero, porque entonces la foto —un dato personal— queda viva y sin ninguna fila que la nombre, fuera del alcance incluso del barrido de huérfanas.

El riesgo contrario —que los archivos se vayan y la fila sobreviva— se acepta a cambio: esa ficha se queda sin foto, que es reparable y visible.

Un negocio SIN foto DEBE borrarse con normalidad aunque el almacenamiento esté caído: no hay nada que alcanzar, y negarse ahí sería incumplir el borrado por una configuración que a esa ficha no le afecta.

En la purga programada, un registro en ese estado DEBE contarse como no purgado —lo que hace que la tarea responda con error— y DEBE volver a intentarse en la siguiente corrida.

#### Scenario: la ficha tiene foto y el almacenamiento no responde

- **WHEN** el admin confirma el borrado definitivo de una ficha con foto y el almacenamiento no se deja alcanzar
- **THEN** la ficha sigue existiendo completa, y la pantalla dice que no se borró, que no se pudo alcanzar el almacén de fotos y que revise la configuración y vuelva a intentar

#### Scenario: la ficha no tiene foto

- **WHEN** se borra definitivamente una ficha sin foto y el almacenamiento está caído
- **THEN** se borra con normalidad: no había nada que alcanzar

#### Scenario: el orden de las dos operaciones

- **WHEN** se borra definitivamente una ficha con foto y todo funciona
- **THEN** los archivos se borran antes que la fila

#### Scenario: la purga programada ante el mismo estado

- **WHEN** la purga diaria encuentra un registro que ya cumplió los 90 días, tiene foto, y el almacenamiento no responde
- **THEN** ese registro no se elimina, se cuenta como no purgado —la tarea responde con error— y sigue purgando los demás

### Requirement: La purga de rechazados se dispara sola en producción

El borrado de los registros rechazados a los 90 días (PRD §8) DEBE ejecutarse sin intervención humana, mediante una tarea programada que corra al menos una vez al día en producción. El disparo DEBE ser una petición HTTP a una ruta del propio sistema que solo actúa si trae el secreto configurado; sin secreto configurado, o con un secreto que no coincide, la ruta DEBE comportarse como si no existiera (404) y NO DEBE borrar nada. La ruta NO DEBE ser indexable y su respuesta DEBE limitarse a conteos, sin ningún dato personal. El mecanismo NO DEBE depender de nada exclusivo del hosting: cualquier programador de tareas capaz de hacer una petición con encabezado DEBE poder dispararlo (ADR-007).

#### Scenario: la tarea programada corre

- **WHEN** el programador de tareas llama a la ruta con el secreto correcto
- **THEN** el sistema elimina los registros rechazados que ya cumplieron 90 días, responde con los conteos de lo que hizo y lo deja en el log sin nombres ni números de nadie

#### Scenario: alguien encuentra la ruta

- **WHEN** cualquier persona pide esa ruta sin el secreto, o con uno equivocado
- **THEN** recibe la misma respuesta 404 que una ruta inexistente y no se borra ningún registro

#### Scenario: sin secreto configurado

- **WHEN** el sistema corre sin el secreto de tareas configurado
- **THEN** la ruta responde 404 a todo el mundo y ninguna purga se ejecuta

#### Scenario: programación declarada

- **WHEN** se revisa la configuración del despliegue
- **THEN** la tarea está declarada con su frecuencia diaria y `docs/despliegue.md` explica cómo dispararla desde cualquier otro programador de tareas si el hosting cambia

### Requirement: El barrido de fotos huérfanas también corre solo, y se nota cuando no barre

El barrido de las fotos que ya no son de ninguna ficha —datos personales que, sin ficha, quedan fuera del alcance del borrado ARCO (PRD §8)— DEBE ejecutarse sin intervención humana, con una tarea programada diaria, disparada igual que la purga: una petición HTTP al propio sistema con el secreto configurado, que sin él responde 404 y no hace nada.

Cuando el barrido NO se complete —porque una de sus salvaguardas lo detuvo—, la respuesta NO DEBE ser de éxito: DEBE llevar un código de error que el programador de tareas registre como fallo, y quedar en el log como error. El comando de consola equivalente ya lo dice con su código de salida; una versión programada que contestara "todo bien" dejaría las fotos huérfanas acumulándose sin que nadie se entere. El informe DEBE ser solo de conteos: ninguna clave de foto sale en la respuesta ni en el log.

#### Scenario: barrido normal

- **WHEN** la tarea programada llama a la ruta con el secreto correcto y el barrido se completa
- **THEN** responde con éxito y con los conteos de lo revisado y lo borrado, sin ninguna clave de foto

#### Scenario: una salvaguarda detiene el barrido

- **WHEN** el barrido se detiene porque sospecha que apunta a la base equivocada
- **THEN** la respuesta NO es de éxito, el motivo queda en el log como error y no se borra ningún archivo

#### Scenario: alguien encuentra la ruta

- **WHEN** cualquier persona pide esa ruta sin el secreto, o con uno equivocado
- **THEN** recibe la misma respuesta 404 que una ruta inexistente y no se barre nada

### Requirement: El 404 de las tareas programadas no las delata

Cuando una ruta de tarea programada responde como si no existiera, su respuesta NO DEBE llevar ninguna marca propia —ni cuerpo propio, ni tipo de contenido propio, ni cabeceras propias— que permita separarla del resto de las rutas del sitio en un barrido automático. DEBE ser el 404 vacío que el marco de trabajo emite cuando una ruta existente decide que lo pedido no está, sin nada suyo encima.

El marco devuelve dos 404 distintos: la página HTML completa cuando la dirección no corresponde a ninguna ruta, y esa respuesta vacía. Una ruta programada no puede emitir el primero —el marco no expone forma de renderizar esa página desde ahí—, así que lo exigible es que emita exactamente el segundo. La otra ruta del sistema que emite este 404 vacío es la que sirve las fotos, y añade además `cache-control: no-store`: esa cabecera es suya, y la ruta de tareas NO DEBE copiarla para parecerse, porque una cabecera de más es justamente una marca propia.

#### Scenario: un escáner busca las rutas de tareas

- **WHEN** alguien pide la ruta de una tarea sin el secreto, con un secreto equivocado o con un encabezado de autorización mal formado
- **THEN** recibe el 404 vacío del marco de trabajo —sin cuerpo, sin tipo de contenido y sin ninguna cabecera que no ponga el marco—, indistinguible del 404 de cualquier otra ruta del sistema que responde que lo pedido no existe

### Requirement: Lo que se guarda para contar cupos no se queda para siempre

Las marcas que el sistema guarda para hacer cumplir un límite anti-abuso DEBEN borrarse cuando ya no sirven para contar: son datos derivados de la IP de terceros y conservarlos sin finalidad es lo que LFPDPPP art. 11 prohíbe. Borrar solo las de la clave que se vuelve a consultar NO basta: la procedencia que prueba una vez y no vuelve DEBE quedar recogida por una tarea programada diaria.

El almacén de esas marcas DEBE tener además un TECHO DE FILAS, porque la pantalla que las escribe es pública y anónima: pasado el techo, DEBEN podarse las más antiguas. El plazo de retención DEBE ser mayor que la ventana del límite más largo del sistema, para que la limpieza no debilite un cupo en silencio; la verificación automática DEBE comprobarlo.

Lo que la tarea informe DEBEN ser conteos, sin ninguna clave ni ningún dato de nadie.

#### Scenario: la marca que nadie vuelve a consultar

- **WHEN** una procedencia gasta una marca del cupo y no vuelve nunca, y después corre la tarea programada diaria
- **THEN** esa marca ya no está en la base

#### Scenario: el techo de filas

- **WHEN** el almacén de marcas supera su techo
- **THEN** se podan las más antiguas hasta volver al techo, y las recientes se conservan

#### Scenario: la limpieza no debilita ningún cupo

- **WHEN** se revisa el plazo de retención frente a las ventanas de los límites en uso
- **THEN** el plazo es mayor que la ventana más larga, así que la limpieza nunca borra una marca que todavía cuenta

### Requirement: Los límites anti-abuso que protegen credenciales se cuentan en un almacén compartido

El límite de intentos de acceso al panel DEBE contarse en un almacén compartido por todas las instancias del sistema, no en la memoria de cada proceso: en un hosting serverless (ADR-007) un contador en memoria le da a quien ataca tantos intentos como instancias consiga levantar. La comprobación y el apunte DEBEN ser una sola operación atómica.

Lo que se guarde NO DEBE ser la dirección IP: DEBE ser un valor derivado del que no se pueda volver atrás sin un secreto del despliegue, y DEBE borrarse en cuanto salga de la ventana del límite. Si el almacén compartido no responde, el límite DEBE seguir operando con el contador en memoria y el sistema DEBE decirlo en el log.

El documento de despliegue DEBE decir, para cada límite anti-abuso, si se comparte entre instancias o no; NO DEBE afirmar que operan todos por igual.

#### Scenario: los intentos sobreviven al reciclado de una instancia

- **WHEN** se agotan los intentos de acceso desde una procedencia y el proceso pierde su memoria
- **THEN** la procedencia sigue bloqueada dentro de la ventana

#### Scenario: en el almacén no queda ninguna IP

- **WHEN** se revisa lo que el sistema guardó al contar intentos
- **THEN** no aparece ninguna dirección IP, sino un valor derivado con el secreto del despliegue

#### Scenario: el almacén compartido no responde

- **WHEN** la base no está disponible al contar un intento
- **THEN** el límite sigue operando con el conteo en memoria de esa instancia y queda constancia en el log de que es más flojo

#### Scenario: el documento no promete de más

- **WHEN** alguien lee en el documento qué protege cada límite
- **THEN** encuentra escrito cuál se comparte entre instancias y cuáles no, y qué hacer mientras tanto

### Requirement: El tope de reportes por negocio aguanta peticiones simultáneas en el dialecto de producción

El tope de reportes sin atender por negocio DEBE hacerse cumplir aunque lleguen envíos simultáneos desde conexiones distintas. La comprobación del tope y la escritura DEBEN ocurrir dentro de la misma transacción y serializadas por ficha; NO DEBE bastar con una sentencia condicionada, porque el nivel de aislamiento por defecto de PostgreSQL no bloquea las filas que un `COUNT` lee.

#### Scenario: dos envíos simultáneos con el tope a uno

- **WHEN** dos conexiones distintas intentan a la vez el reporte que completaría el tope
- **THEN** solo una escribe, la otra recibe la misma confirmación de siempre, y el negocio queda exactamente en el tope

### Requirement: El sitio declara de dónde puede salir el JavaScript y a dónde pueden ir los datos

El sitio DEBE mandar en todas sus respuestas una cabecera `Content-Security-Policy`. La política DEBE permitir el script del proveedor de analítica (`cloud.umami.is`) **y** los envíos a su recolector (`gateway.umami.is`), que son dominios distintos, y NO DEBE permitir ningún otro origen externo de scripts. DEBE cerrar el enmarcado del sitio en páginas ajenas, los plugins y el envío de formularios a otro dominio. `docs/despliegue.md` DEBE traer la política escrita y cómo verificarla contra el sitio ya desplegado.

#### Scenario: la medición funciona con la política puesta

- **WHEN** se abre una página pública con la analítica configurada y la CSP activa
- **THEN** el script carga desde el dominio del proveedor y sus eventos llegan a su recolector, sin que el navegador bloquee nada

#### Scenario: un script de otro origen

- **WHEN** algo intenta cargar JavaScript desde un dominio que no es el del sitio ni el del proveedor declarado
- **THEN** el navegador lo bloquea

#### Scenario: la política se verifica contra el sitio, no contra el código

- **WHEN** se sigue el documento de despliegue después de publicar
- **THEN** encuentra el comando exacto para leer la cabecera del sitio en línea y qué debe decir

### Requirement: Toda respuesta del sitio lleva las cabeceras de seguridad básicas

Además de la Content-Security-Policy, TODA respuesta del sitio —dinámica, estática y de error— DEBE llevar: la instrucción de no adivinar el tipo de contenido (el sitio sirve bytes subidos por usuarios), la de no dejarse enmarcar en otra página, y una política de referente que no filtre la ruta hacia otros dominios. El sitio NO DEBE anunciar en cada respuesta qué marco de trabajo usa.

Una pantalla que necesite una política de referente MÁS estricta que la global DEBE poder imponerla, y la global NO DEBE anularla.

#### Scenario: cualquier página del sitio

- **WHEN** se pide cualquier dirección del sitio, exista o no, sea dinámica o estática
- **THEN** la respuesta lleva las cabeceras de seguridad y no lleva ninguna que anuncie el marco de trabajo

#### Scenario: el panel conserva su política estricta

- **WHEN** se abre una pantalla del panel de revisión
- **THEN** su política de referente sigue siendo la estricta que esa pantalla declara, no la global, para que la dirección de la ficha de una persona no salga como referente

### Requirement: Un solo documento dice cómo se despliega

El proyecto DEBE tener un documento único, `docs/despliegue.md`, que baste para poner el sitio en producción sin buscar nada más. DEBE contener: (a) la lista completa de variables de entorno acumuladas, cada una con para qué sirve, si es obligatoria y su valor exacto cuando lo tiene —en particular `REGISTRO_ENCABEZADO_IP`, cuyo valor en Vercel es `x-forwarded-for`—; (b) el orden de operaciones del despliegue: configurar variables, aplicar migraciones, sembrar los catálogos, verificar; (c) los pasos que solo puede hacer una persona: crear las cuentas de hosting y base de datos, registrar el dominio, configurar DNS y confirmar que los respaldos automáticos están activos; (d) qué NUNCA se corre contra producción (el seed de negocios de demostración); y (e) una verificación de humo final con las pantallas que hay que abrir. Las variables que todavía no existen en el código porque su ticket está pendiente DEBEN aparecer nombradas como pendientes, con el ticket que las traerá, en lugar de omitirse.

#### Scenario: el humano despliega siguiendo el documento

- **WHEN** una persona con las cuentas ya creadas sigue el documento de principio a fin
- **THEN** el sitio queda en línea con la base migrada y los catálogos poblados, sin haber tenido que abrir el código para averiguar qué variable falta

#### Scenario: el encabezado de IP tiene un valor exacto, no un "depende"

- **WHEN** se busca en el documento qué poner en `REGISTRO_ENCABEZADO_IP`
- **THEN** encuentra el valor literal para Vercel (`x-forwarded-for`) y la advertencia de que sin esa variable el límite de altas por hora y el de intentos de acceso al panel no operan

#### Scenario: una variable nueva sin documentar

- **WHEN** alguien agrega al código la lectura de una variable de entorno y no la documenta
- **THEN** la verificación automática lo señala y el PR falla

#### Scenario: variables que traerá un ticket pendiente

- **WHEN** se busca en el documento la configuración de una pieza cuya implementación todavía no existe
- **THEN** encuentra la decisión tomada y la nota de que las variables las define el ticket pendiente correspondiente, no un hueco silencioso
