# Spec: modelo-datos

## Requirements

### Requirement: El modelo `Negocio` cubre los campos del registro

El sistema DEBE persistir un negocio con los 5 campos obligatorios del PRD §6.1 — nombre, categoría (del catálogo), WhatsApp de 10 dígitos, colonia y constancia del consentimiento del aviso de privacidad — y DEBE admitir los opcionales: "¿Qué ofreces?" (máx. 200 caracteres), entregas a domicilio (sí/no), teléfono fijo y dirección o referencias con pin opcional (latitud/longitud), horario en texto libre, link de Facebook y foto.

La foto NO se guarda como una URL cualquiera: el negocio persiste una **referencia interna a la foto** (`fotoClave`), que es una clave opaca generada por el servidor al procesar la imagen y que solo sirve para localizar los archivos en el almacenamiento de fotos (ADR-006). Esa referencia DEBE ser nula cuando el negocio no tiene foto, DEBE ser única entre negocios, y NO DEBE contener nunca una dirección externa, un `data:`, un esquema de URL ni una ruta del sistema de archivos: quien lee este campo tiene que poder asumir que lo escribió el servidor. Los bytes de la imagen NO viven en la base de datos ni en el repositorio.

#### Scenario: alta mínima con solo obligatorios
- **WHEN** se crea un negocio con nombre, categoría, WhatsApp, colonia y constancia de consentimiento
- **THEN** el negocio queda guardado, todos los campos opcionales quedan vacíos y su referencia de foto queda nula

#### Scenario: alta completa con opcionales
- **WHEN** se crea un negocio incluyendo los campos opcionales (con pin de mapa y con foto)
- **THEN** todos los valores quedan persistidos y recuperables tal como se guardaron, incluidas las coordenadas del pin y la referencia interna de la foto

#### Scenario: la referencia de la foto no es una URL
- **WHEN** se revisa el valor guardado en la referencia de foto de un negocio que subió una imagen
- **THEN** es la clave opaca que generó el servidor, sin esquema de URL, sin dominio y sin ruta del sistema de archivos, y no coincide con el identificador del negocio ni con su nombre

#### Scenario: dos negocios no comparten la misma foto
- **WHEN** se intenta guardar en dos negocios la misma referencia de foto
- **THEN** la base de datos rechaza la operación

### Requirement: La constancia del consentimiento guarda contra qué versión del aviso se dio

El negocio DEBE guardar, junto a la fecha del consentimiento (`consintioAvisoEn`), el identificador de la versión del aviso de privacidad que estaba vigente cuando se dio ese consentimiento (`consintioAvisoVersion`). Es lo que convierte la constancia de la LFPDPPP (PRD §8) en una prueba completa: sin la versión, la fecha apunta a un texto que pudo haber cambiado.

Las dos DEBEN viajar juntas: ningún camino de escritura DEBE poder guardar una sin la otra. La versión DEBE quedar nula únicamente en las fichas registradas **antes** de que existiera el versionado; a esas filas NO DEBE asignárseles una versión de relleno, porque nadie puede afirmar hoy qué texto tuvieron enfrente. El campo es una cadena, sin valor por defecto en la base de datos.

El negocio DEBE poder guardar además una **reaceptación**: la fecha (`reconsintioAvisoEn`) y la versión (`reconsintioAvisoVersion`) de la última vez que se aceptó una versión del aviso **posterior** a la de su constancia original. "Posterior" es una comparación de orden, no una desigualdad: una versión distinta puede ser más vieja (despliegue revertido) y una constancia sin versión no es comparable con ninguna, así que en esos dos casos no se anota reaceptación (la regla de escritura vive en `registro-negocio`, requirement "Una sola ficha por número de WhatsApp"). Ambas nulas mientras eso no ocurra, y ambas también inseparables. La reaceptación NO sustituye a la constancia original: la complementa.

#### Scenario: alta con su versión

- **WHEN** se crea un negocio con la constancia del consentimiento
- **THEN** quedan persistidas la fecha y la versión del aviso vigente en ese momento, y sus dos campos de reaceptación quedan nulos

#### Scenario: la versión no viaja sola

- **WHEN** se revisan todos los negocios guardados
- **THEN** ninguno tiene fecha de consentimiento con versión vacía salvo las fichas anteriores al versionado, y ninguno tiene fecha de reaceptación sin versión de reaceptación (ni al revés)

#### Scenario: reaceptación de una versión más nueva

- **WHEN** un negocio cuya constancia original es de la versión `1` acepta la versión `2`
- **THEN** su constancia original queda igual (misma fecha, versión `1`) y sus campos de reaceptación quedan con la fecha de ese momento y la versión `2`

#### Scenario: fichas anteriores al versionado

- **WHEN** se aplica la migración que agrega las tres columnas sobre una base que ya tiene negocios en revisión, publicados y rechazados
- **THEN** todas las filas siguen ahí con sus datos intactos, su versión de consentimiento queda nula y ninguna consulta del sitio falla por eso

#### Scenario: el seed de demostración siembra la versión

- **WHEN** se corre el seed de negocios ficticios
- **THEN** nacen con la versión vigente del aviso en su constancia, salvo dos que existen para dar al panel sus otros dos casos: una ficha anterior al versionado (sin versión y sin reaceptación) y una con la constancia de una versión anterior ficticia y su reaceptación poblada

#### Scenario: la versión aceptada es un dato interno

- **WHEN** se consulta una ficha publicada desde el directorio público
- **THEN** ni la versión del consentimiento ni la reaceptación aparecen en la proyección pública, igual que `consintioAvisoEn` y `registradoEn`

### Requirement: Una sola ficha por número de WhatsApp

La base de datos DEBE impedir, mediante constraint de unicidad, que existan dos negocios con el mismo número de WhatsApp (PRD §6.1: "una sola ficha por número").

#### Scenario: WhatsApp duplicado
- **WHEN** se intenta crear un segundo negocio con un WhatsApp que ya tiene ficha
- **THEN** la base de datos rechaza la operación por violación de la constraint de unicidad

### Requirement: Catálogos de categorías, colonias y giros con slug estable

El sistema DEBE contar con tres catálogos persistidos: las 8 categorías del PRD §6.1, las colonias del Apéndice A y los giros del Apéndice B. Cada entrada DEBE tener nombre y slug únicos; el slug DEBE ser apto para URL SEO: minúsculas, sin acentos, con guiones (p. ej. `plomeria`, `haciendas-de-tizayuca`, para componer `/plomeria-haciendas-de-tizayuca`).

#### Scenario: catálogos poblados por el seed
- **WHEN** se ejecuta el seed sobre una base recién migrada
- **THEN** existen 8 categorías, 21 colonias y 49 giros, cada uno con su slug

#### Scenario: slug apto para URL
- **WHEN** se consulta el slug de "Plomería" y el de "Haciendas de Tizayuca"
- **THEN** son `plomeria` y `haciendas-de-tizayuca` (sin mayúsculas, acentos ni espacios)

#### Scenario: slugs estables entre corridas
- **WHEN** se vuelve a ejecutar el seed sobre una base ya poblada
- **THEN** los slugs existentes no cambian ni se generan entradas duplicadas

### Requirement: Los slugs de los tres catálogos no producen URLs ambiguas en la raíz

Las páginas públicas de categoría (`/servicios-del-hogar`), de giro (`/plomeria`) y de giro+colonia (`/plomeria-haciendas-de-tizayuca`) comparten la raíz del sitio, así que los slugs de los tres catálogos DEBEN garantizar que **cada URL de la raíz se lea de una sola manera**. El proyecto DEBE tener una verificación automática sobre los catálogos sembrados que falle —antes de que nada se publique— si se rompe cualquiera de estas condiciones:

- ningún slug de giro ni de colonia coincide con un slug de categoría;
- ningún slug de ninguno de los tres catálogos coincide con un segmento reservado del sitio (las rutas propias, PRD §6.3 y §6.4);
- ningún slug compuesto `«giro»-«colonia»` coincide con un slug de categoría ni con un slug de giro;
- ningún slug compuesto `«giro»-«colonia»` admite dos lecturas distintas, es decir, no existen dos pares de giro y colonia del catálogo que produzcan la misma URL.

Es una invariante de los catálogos sembrados (8 categorías, 21 colonias y 49 giros con slug estable), no un campo del modelo. Reservar un nombre es gratis; migrar una URL ya publicada, no.

#### Scenario: los catálogos de hoy son inequívocos

- **WHEN** se corre la verificación sobre la base con los tres catálogos sembrados
- **THEN** pasa: ninguna URL de la raíz se puede leer de dos maneras

#### Scenario: un giro que se llama como una categoría

- **WHEN** se agrega al catálogo un giro cuyo slug coincide con el de una categoría
- **THEN** la verificación falla y señala el slug en conflicto

#### Scenario: un giro que taparía una ruta propia

- **WHEN** se agrega al catálogo un giro o una colonia con un slug que es un segmento reservado del sitio (por ejemplo `buscar`)
- **THEN** la verificación falla y señala el slug en conflicto

#### Scenario: un compuesto con dos lecturas

- **WHEN** el catálogo llega a un estado en el que un mismo slug compuesto se puede leer como dos pares distintos de giro y colonia
- **THEN** la verificación falla y nombra las dos lecturas posibles

### Requirement: Giros asignables al negocio por el admin

El sistema DEBE permitir vincular giros del catálogo a un negocio (relación muchos-a-muchos). Un negocio recién registrado no tiene giros; el admin le asigna de 1 a 3 al aprobar (PRD §6.3), y un negocio puede publicarse sin giro si ninguno embona (Apéndice B). La cota 1-3 se hace cumplir en el panel de revisión, no en la base de datos.

#### Scenario: asignación de giros
- **WHEN** el admin vincula 3 giros a un negocio
- **THEN** los tres vínculos quedan persistidos y consultables tanto desde el negocio como desde cada giro

#### Scenario: negocio recién registrado sin giros
- **WHEN** un negocio se crea desde el registro
- **THEN** no tiene ningún giro vinculado

### Requirement: Estado de revisión, origen y timestamps del ciclo de vida

El negocio DEBE tener un estado con valores `en_revision | publicado | rechazado` (default `en_revision`), un origen con valores `siembra | organico` (PRD §6.3 y §10; default `organico`, el admin lo ajusta al aprobar), un timestamp de registro asignado automáticamente al crearse y un timestamp de publicación que permanece nulo hasta que la ficha se publica. **El timestamp de publicación significa "la última vez que la ficha estuvo publicada": al despublicarla NO DEBE borrarse —es el único rastro de que estuvo en el directorio y de cuándo—, y al volver a publicarla se sobrescribe con la fecha de la nueva publicación. Lo que decide si una ficha se muestra es su estado, nunca ese timestamp.** Además DEBE guardar el rastro del rechazo: un timestamp de rechazo y el motivo en texto, ambos nulos mientras el negocio no haya sido rechazado. La fecha del rechazo es lo que habilita la eliminación de los registros rechazados a los 90 días que exige el PRD §8 (la purga en sí no está implementada). Si un negocio rechazado corrige y vuelve a enviar su registro, ambos campos DEBEN volver a quedar nulos, para que la purga no se lleve un registro que ya está otra vez en la cola. La migración DEBE poder aplicarse sobre una base que ya tiene negocios, sin perder ni alterar sus datos. El seed de negocios de demostración DEBE poblar ambos campos en su negocio `rechazado`, para que el panel y la purga futura tengan un caso realista que probar.

#### Scenario: negocio recién creado
- **WHEN** se crea un negocio
- **THEN** su estado es `en_revision`, su timestamp de registro tiene la fecha de creación, y su timestamp de publicación, su timestamp de rechazo y su motivo de rechazo son nulos

#### Scenario: publicación
- **WHEN** un negocio pasa a estado `publicado` y se le asigna la fecha de publicación
- **THEN** ambos valores quedan persistidos y consultables

#### Scenario: la fecha de publicación sobrevive a la despublicación
- **WHEN** un negocio publicado se despublica y queda en `en_revision`
- **THEN** su timestamp de publicación sigue teniendo la fecha en que estuvo publicado, y ninguna superficie pública lo muestra porque su estado ya no es `publicado`

#### Scenario: republicar actualiza la fecha de publicación
- **WHEN** una ficha despublicada se vuelve a publicar
- **THEN** su timestamp de publicación queda con la fecha de esta publicación, no con la anterior

#### Scenario: rechazo con fecha y motivo
- **WHEN** un negocio pasa a estado `rechazado` con la fecha del rechazo y el motivo que escribió el admin
- **THEN** ambos valores quedan persistidos y consultables, y el negocio sigue existiendo en la base (no se borra en ese momento)

#### Scenario: el rastro del rechazo se limpia al volver a revisión
- **WHEN** un negocio rechazado vuelve al estado `en_revision`
- **THEN** su timestamp de rechazo y su motivo quedan nulos otra vez

#### Scenario: valores fuera del conjunto
- **WHEN** se intenta guardar un estado u origen fuera de los valores definidos
- **THEN** la base de datos rechaza la escritura (constraint CHECK en la migración)

#### Scenario: migración sobre una base con datos
- **WHEN** se aplica la migración sobre una base que ya tiene negocios publicados, en revisión y rechazados
- **THEN** todas las filas siguen ahí con sus datos intactos y los dos campos nuevos quedan nulos en todas

#### Scenario: el seed de demostración incluye un rechazo con motivo
- **WHEN** se corre el seed de negocios de demostración
- **THEN** su negocio `rechazado` trae fecha de rechazo y motivo poblados, con un motivo ficticio

### Requirement: El negocio guarda el rastro de su despublicación

El negocio DEBE guardar un timestamp de despublicación y el motivo en texto, ambos nulos mientras la ficha nunca haya sido despublicada. Los dos se escriben juntos cuando el admin despublica una ficha publicada (PRD §6.3 "se retiran, si ya estaban publicadas"; PRD §8 "las fichas retiradas a solicitud del negocio, de inmediato") y se sobrescriben en cada despublicación posterior: siempre reflejan la última.

Este rastro NO se limpia en ninguna transición: sobrevive a que la ficha se publique de nuevo, se rechace o el negocio la reenvíe, porque es historia útil dentro del panel ("esta ficha ya la bajaste una vez, por esto") y ninguna consulta depende de que sea nulo. Para que ese rastro viejo no ensucie la cola, **la espera de un registro se cuenta desde la más reciente entre su fecha de registro y su fecha de despublicación** (ver `revision-admin`), nunca desde la de despublicación a secas.

El motivo de la despublicación es un dato interno del panel, del mismo tipo que el motivo del rechazo: NO DEBE aparecer en ninguna página pública. La migración DEBE poder aplicarse sobre una base que ya tiene negocios, sin perder ni alterar sus datos y sin tocar los CHECK de `estado` y de `origen` que ya existen.

#### Scenario: negocio que nunca se ha despublicado
- **WHEN** se crea un negocio y se publica
- **THEN** su timestamp de despublicación y su motivo de despublicación son nulos

#### Scenario: despublicación con fecha y motivo
- **WHEN** un negocio publicado pasa a `en_revision` por una despublicación, con su fecha y el motivo que escribió el admin
- **THEN** ambos valores quedan persistidos y consultables, y el negocio sigue existiendo con todos sus demás datos

#### Scenario: el rastro refleja la última despublicación
- **WHEN** una ficha se despublica, se vuelve a publicar y se despublica otra vez con otro motivo
- **THEN** quedan guardados la fecha y el motivo de la segunda despublicación, no los de la primera

#### Scenario: el rastro sobrevive a las demás transiciones
- **WHEN** una ficha despublicada se rechaza, o se publica de nuevo
- **THEN** su fecha y su motivo de despublicación siguen guardados, sin borrarse ni alterarse

#### Scenario: migración del rastro de despublicación sobre una base con datos
- **WHEN** se aplica la migración que agrega estos dos campos sobre una base que ya tiene negocios publicados, en revisión y rechazados
- **THEN** todas las filas siguen ahí con sus datos intactos, los dos campos nuevos quedan nulos en todas y los CHECK de `estado` y `origen` siguen vigentes

### Requirement: La colonia admite "Otra" con texto libre pendiente de normalizar

El sistema DEBE permitir registrar un negocio sin colonia de catálogo, guardando el texto libre que capturó (PRD §6.1, Apéndice A). Un negocio en esa condición DEBE ser identificable como pendiente de normalizar, y el admin DEBE poder normalizarlo asignándole después una colonia del catálogo.

#### Scenario: registro con colonia "Otra"
- **WHEN** un negocio se registra con la opción "Otra" y el texto "Rinconada del Venado"
- **THEN** el texto libre queda guardado y el negocio no tiene colonia de catálogo asignada (pendiente de normalizar)

#### Scenario: normalización por el admin
- **WHEN** el admin asigna al negocio una colonia del catálogo
- **THEN** el negocio queda vinculado a esa colonia y deja de estar pendiente de normalizar

### Requirement: El modelo `Reporte` guarda el aviso de un vecino sobre una ficha, sin ningún dato de quien lo envía

El sistema DEBE persistir los reportes del botón "Reportar" (PRD §6.3) en una tabla propia, ligada al negocio reportado, con exactamente estos datos y ninguno más: el negocio al que apunta, el motivo, el comentario opcional, el estado y las fechas. En concreto:

- **Motivo**: uno de una lista cerrada de cuatro valores estables (`cerrado`, `no_real`, `datos_incorrectos`, `inapropiado`), con la validación del conjunto hecha cumplir por la base (constraint CHECK en la migración, como ya se hace con el estado y el origen del negocio en SQLite, ADR-001). Las etiquetas que ven las personas viven en el código, no en la base: el valor guardado es estable aunque el copy cambie.
- **Comentario**: texto opcional y nulo cuando el vecino no escribió nada; la cota de 300 caracteres se hace cumplir en el formulario, no en la base.
- **Estado**: `pendiente | atendido`, con default `pendiente` y CHECK del conjunto.
- **Fechas**: la de creación, asignada automáticamente, y la de atención, nula hasta que el admin marca el reporte como atendido.

La tabla NO DEBE tener ninguna columna que identifique a quien reportó: ni IP, ni huella, ni nombre, ni contacto, ni un valor derivado de ellos (PRD §8 y LFPDPPP: lo que no se guarda no se puede filtrar).

La relación con el negocio DEBE declararse **con borrado en cascada**, como exige el requirement "Borrado definitivo de un negocio (operación ARCO)": el aviso de un vecino anónimo no puede bloquear ni sobrevivir al ejercicio de un derecho ARCO del titular, y la verificación automática de las claves foráneas que apuntan a `Negocio` DEBE recorrer también esta relación, de modo que quitarle la cascada haga fallar la verificación.

El sistema DEBE poder consultar, por negocio, cuántos reportes tiene en estado `pendiente`, y listar los reportes pendientes de un negocio del más antiguo al más reciente. La migración DEBE poder aplicarse sobre una base que ya tiene negocios sin alterar ni una fila ni una columna de `Negocio`, y sin borrar los CHECK que ya existen.

#### Scenario: reporte recién creado

- **WHEN** se crea un reporte sobre un negocio publicado con el motivo `cerrado` y sin comentario
- **THEN** queda guardado con ese negocio, ese motivo, comentario nulo, estado `pendiente`, fecha de creación puesta y fecha de atención nula

#### Scenario: reporte con comentario

- **WHEN** se crea un reporte con un comentario de texto
- **THEN** el comentario queda persistido tal cual se envió y es recuperable sin alteraciones

#### Scenario: motivo fuera del conjunto

- **WHEN** se intenta guardar un reporte con un motivo que no está en la lista cerrada
- **THEN** la base de datos rechaza la escritura (constraint CHECK de la migración)

#### Scenario: estado fuera del conjunto

- **WHEN** se intenta guardar un reporte con un estado distinto de `pendiente` o `atendido`
- **THEN** la base de datos rechaza la escritura

#### Scenario: atender un reporte

- **WHEN** un reporte pasa a estado `atendido` con su fecha de atención
- **THEN** ambos valores quedan persistidos y ese reporte deja de contar entre los pendientes de su negocio

#### Scenario: conteo y lista de pendientes por negocio

- **WHEN** un negocio tiene tres reportes pendientes y uno ya atendido
- **THEN** su conteo de pendientes es 3 y la lista de pendientes trae esos tres, del más antiguo al más reciente, sin el atendido

#### Scenario: nada del reportante en el esquema

- **WHEN** se revisan las columnas de la tabla de reportes
- **THEN** no existe ninguna que guarde IP, nombre, contacto ni ningún otro identificador de quien reportó

#### Scenario: la relación con el negocio está en cascada

- **WHEN** se corre la verificación de las relaciones del esquema que apuntan al negocio
- **THEN** la de los reportes aparece entre las revisadas y está declarada con borrado en cascada; quitarle la cascada hace fallar la verificación

#### Scenario: migración sobre una base con datos

- **WHEN** se aplica la migración sobre una base que ya tiene negocios publicados, en revisión y rechazados
- **THEN** la tabla de reportes queda creada y vacía, todos los negocios siguen con sus datos intactos y los CHECK de estado y origen del negocio siguen vigentes

### Requirement: Borrado definitivo de un negocio (operación ARCO)

El sistema DEBE permitir eliminar definitivamente un negocio (hard delete real, no despublicar), **esté en el estado que esté** (`en_revision`, `publicado` o `rechazado`), borrando su fila **y todo lo que cuelgue de ella**: sus vínculos con giros, sus reportes, cualquier otra fila ligada al negocio que el modelo llegue a tener y **los archivos de su foto en el almacenamiento**, sin dejar datos ni imágenes recuperables por ninguna consulta ni por ninguna dirección del sitio (PRD §8). El borrado de los archivos DEBE incluir todas las variantes generadas: un archivo que sobrevive al borrado es el dato personal que el aviso de privacidad prometió eliminar. Si el archivo ya no estaba (por ejemplo, porque se borró antes), el borrado del negocio DEBE completarse igual y no DEBE fallar.

**El arrastre DEBE estar garantizado por el modelo, no por la acción que borra**: toda relación que apunte al negocio se declara con borrado en cascada, de modo que una tabla nueva que alguien agregue después no pueda dejar filas huérfanas ni impedir un borrado ARCO. El proyecto DEBE tener una verificación automática que recorra las relaciones declaradas en el esquema de la base y falle si alguna que apunta al negocio no está en cascada, para que la invariante no dependa de que alguien la recuerde. Ningún dato ligado a un tercero (por ejemplo el aviso de un vecino que reportó la ficha) DEBE poder bloquear el borrado: los derechos ARCO del titular pesan más.

El borrado DEBE ser idempotente: pedir el borrado de un identificador que ya no existe NO DEBE producir un error, sino quedarse sin efecto.

#### Scenario: hard delete
- **WHEN** se elimina definitivamente un negocio que tenía giros vinculados y foto
- **THEN** desaparecen su fila, todos sus vínculos con giros y todas las variantes de su foto; ninguna consulta posterior devuelve sus datos y la dirección que servía su foto responde como si nunca hubiera existido

#### Scenario: hard delete de un negocio con reportes
- **WHEN** se elimina definitivamente un negocio que tenía reportes pendientes y atendidos
- **THEN** el borrado se completa, sus reportes desaparecen con él y ninguna consulta posterior devuelve ni el negocio ni sus reportes

#### Scenario: borrar en cualquier estado
- **WHEN** se eliminan definitivamente un negocio `publicado`, uno `en_revision` y uno `rechazado`
- **THEN** los tres desaparecen igual, sin importar su estado

#### Scenario: borrado con el archivo ya ausente
- **WHEN** se elimina definitivamente un negocio cuya foto ya no está en el almacenamiento
- **THEN** el negocio se borra igual, sin error

#### Scenario: borrado idempotente
- **WHEN** se pide dos veces el borrado del mismo identificador
- **THEN** la segunda vez no ocurre ningún error y no hay nada más que borrar

#### Scenario: ninguna relación bloquea el borrado
- **WHEN** se corre la verificación sobre las relaciones del esquema que apuntan al negocio
- **THEN** todas están declaradas con borrado en cascada, y agregar una relación nueva sin cascada hace fallar la verificación

### Requirement: Migración inicial y seed reproducibles

El proyecto DEBE poder levantar la base de datos desde cero con la migración inicial de Prisma y poblar los catálogos con `npm run db:seed`. El seed DEBE ser idempotente.

#### Scenario: base desde cero
- **WHEN** se aplica la migración inicial sobre una base inexistente y luego se corre `npm run db:seed`
- **THEN** la base queda creada con todas las tablas y los tres catálogos poblados (8 categorías, 21 colonias, 49 giros)

#### Scenario: seed idempotente
- **WHEN** se corre `npm run db:seed` dos veces seguidas
- **THEN** los conteos de los catálogos no cambian entre la primera y la segunda corrida

### Requirement: El esquema reserva el terreno para la gestión P1 sin implementarla

El modelo `Negocio` DEBE incluir un campo opcional y único para el token del enlace de gestión (PRD §6.4), que permanece nulo en el MVP y no tiene ninguna lógica asociada. Las revisiones de edición supervisadas se modelarán como tabla propia cuando llegue E8; hoy esa tabla no existe.

#### Scenario: espacio reservado sin comportamiento
- **WHEN** se registra un negocio en el MVP
- **THEN** su token de gestión es nulo y ninguna funcionalidad del sistema lo lee ni lo escribe

### Requirement: El negocio guarda una versión normalizada de su nombre y de "¿Qué ofreces?" para el buscador

El sistema DEBE persistir, junto a cada negocio, una versión normalizada de su nombre y de su "¿Qué ofreces?" —minúsculas, sin acentos ni signos— pensada solo para que el buscador pueda encontrar sin importar acentos ni mayúsculas (PRD §6.2), porque la base de datos no compara así por sí sola. Esos valores DEBEN ser siempre un reflejo de los campos que les dan origen: se escriben cada vez que se guarda un negocio, con la misma función de normalización que usa el buscador, y ningún flujo DEBE poder dejarlos desincronizados. Un negocio sin "¿Qué ofreces?" DEBE quedar con su versión normalizada vacía, no nula. Estos valores son internos del buscador: NO DEBEN mostrarse en ninguna vista pública ni aparecer en las consultas del directorio.

#### Scenario: alta con acentos y mayúsculas

- **WHEN** se guarda un negocio llamado "Plomería Güicho" que ofrece "Destape de drenajes y BOMBAS de agua"
- **THEN** quedan persistidas sus versiones normalizadas sin acentos ni mayúsculas ("plomeria guicho" y "destape de drenajes y bombas de agua"), además de los textos originales tal como los escribió el negocio

#### Scenario: negocio sin "¿Qué ofreces?"

- **WHEN** se guarda un negocio que no llenó "¿Qué ofreces?"
- **THEN** su versión normalizada de ese campo queda vacía y ninguna consulta del buscador falla por eso

#### Scenario: las fichas que ya existían quedan encontrables

- **WHEN** se agregan estas versiones normalizadas sobre una base que ya tenía negocios guardados y se corre el relleno correspondiente
- **THEN** todos esos negocios quedan con sus versiones normalizadas calculadas, de modo que el buscador los encuentra igual que a los registrados después

#### Scenario: el relleno se puede repetir

- **WHEN** se corre el relleno dos veces seguidas
- **THEN** los valores quedan iguales y no se altera ningún otro dato del negocio

#### Scenario: valores consistentes con su origen

- **WHEN** se revisan todos los negocios guardados
- **THEN** la versión normalizada de cada uno corresponde exactamente a la normalización de su nombre y de su "¿Qué ofreces?" actuales

### Requirement: Seed de negocios ficticios para desarrollo, separado del de catálogos

El proyecto DEBE poder poblar la base de desarrollo con negocios de mentira para ver el directorio funcionando, mediante un comando propio y distinto del seed de catálogos. El seed de catálogos NO DEBE crear negocios: sus conteos siguen siendo solo los de categorías, colonias y giros. El seed de demostración DEBE ser idempotente (correrlo dos veces no duplica fichas) y DEBE crear un conjunto que cubra los casos que el directorio necesita probar: negocios publicados en varias categorías (incluida "Clubes y escuelas deportivas") y varias colonias, alguno con entregas a domicilio y alguno sin ellas, alguno con todos los campos opcionales y alguno con solo los obligatorios, uno publicado con colonia "Otra" sin normalizar, uno en `en_revision` y uno `rechazado`. Además DEBE cubrir los casos que el buscador necesita probar mientras el panel del admin no siembra datos: al menos un negocio publicado **con giros asignados**, y entre ellos uno cuyo giro NO aparezca ni en su nombre ni en su "¿Qué ofreces?" (única forma de demostrar que la búsqueda por giro funciona de verdad), más al menos un negocio publicado cuyas palabras clave lleven acentos. Los negocios que siembra DEBEN quedar con sus versiones normalizadas de búsqueda escritas, como cualquier otro camino de escritura. Los datos DEBEN ser inventados y reconocibles como tales: nombres ficticios, números de WhatsApp de la serie reservada para pruebas (`771999xxxx`) y ninguna dirección de un negocio real (repo público + LFPDPPP, PRD §8). El comando DEBE avisar en su salida que lo que sembró son datos de mentira y NO DEBE ejecutarse contra un entorno de producción.

#### Scenario: sembrar negocios de demostración

- **WHEN** se corre el comando de seed de demostración sobre una base con los catálogos ya poblados
- **THEN** quedan creados los negocios ficticios, con al menos uno publicado en la categoría de deporte, al menos uno con entregas a domicilio, uno con colonia "Otra" sin normalizar, uno en `en_revision` y uno `rechazado`

#### Scenario: fixtures para la búsqueda por giro

- **WHEN** se revisan los negocios que siembra el comando
- **THEN** al menos uno publicado tiene giros del catálogo asignados, y al menos uno de esos giros no aparece ni en el nombre ni en el "¿Qué ofreces?" de ese negocio

#### Scenario: fixtures con acentos

- **WHEN** se revisan los negocios que siembra el comando
- **THEN** al menos uno publicado tiene acentos en su nombre o en sus palabras clave, y sus versiones normalizadas quedan escritas sin acentos

#### Scenario: el seed de catálogos no crea negocios

- **WHEN** se corre `npm run db:seed` sobre una base recién migrada
- **THEN** los catálogos quedan poblados y la tabla de negocios queda vacía

#### Scenario: seed de demostración idempotente

- **WHEN** se corre el seed de demostración dos veces seguidas
- **THEN** el número de negocios no cambia entre la primera y la segunda corrida, y ningún negocio termina con giros repetidos

#### Scenario: datos ficticios y nada real

- **WHEN** se revisan los negocios que siembra el comando
- **THEN** todos los números de WhatsApp empiezan con `771999`, los nombres son inventados y ninguno corresponde a un negocio real de Tizayuca

#### Scenario: nunca contra producción

- **WHEN** se intenta correr el seed de demostración en un entorno de producción
- **THEN** el comando no siembra nada y lo dice

### Requirement: El seed de demostración deja fichas con foto para ver el directorio como lo verá el vecino

El seed de negocios ficticios DEBE dejar al menos un negocio publicado **con foto** y al menos uno publicado **sin foto**, para poder ver en desarrollo tanto la tarjeta con imagen real como el marcador de posición. Las imágenes las DEBE generar el propio seed al ejecutarse (rectángulos de color con el nombre ficticio, por ejemplo): NO DEBEN agregarse archivos de imagen al repositorio, ni usarse fotos de negocios reales ni de personas (repo público + LFPDPPP, PRD §8). El seed DEBE seguir siendo idempotente también en esto: correrlo dos veces no deja archivos duplicados ni huérfanos.

#### Scenario: sembrar con fotos

- **WHEN** se corre el seed de demostración sobre una base con los catálogos poblados
- **THEN** al menos un negocio publicado queda con su referencia de foto y sus archivos generados, y al menos uno publicado queda sin foto

#### Scenario: nada de imágenes en el repositorio

- **WHEN** se revisa el repositorio después de correr el seed
- **THEN** no hay ningún archivo de imagen versionado y los archivos generados quedan en el almacenamiento local, fuera del control de versiones

#### Scenario: seed de demostración idempotente con fotos

- **WHEN** se corre el seed de demostración dos veces seguidas
- **THEN** los negocios sembrados conservan una sola foto cada uno y no quedan archivos sueltos de la corrida anterior
