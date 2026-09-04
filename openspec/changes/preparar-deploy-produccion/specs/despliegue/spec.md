# Delta de spec: despliegue

Capacidad nueva. Cubre lo que el sistema debe garantizar para que un despliegue a producción sea configurar variables y presionar un botón: el dialecto de la base, lo que el CI prueba, el build, la configuración que no puede faltar en silencio, los comandos que escriben en la base, el disparo de la purga y el documento único de despliegue.

## ADDED Requirements

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

Cada Pull Request DEBE ejercitarse contra una base PostgreSQL creada desde cero para esa corrida: aplicar todas las migraciones en orden, correr el seed de catálogos y correr toda la suite de pruebas contra ella. Una migración que no aplique, un seed que falle o una prueba que dependa de una peculiaridad del dialecto anterior DEBEN reprobar el PR. El CI NO DEBE usar la base de nadie más ni conservar datos entre corridas.

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

Cuando falte una variable sin la cual el sistema no puede cumplir su función, el sistema DEBE decirlo —en el log del servidor al arrancar y, cuando corresponda, en la pantalla afectada— y NUNCA DEBE sustituirla por un valor de desarrollo. En particular: sin dirección de base de datos configurada en producción el sistema NO DEBE caer a la base local por defecto, y sin `SITIO_URL` en producción ninguna pantalla DEBE armar enlaces a `localhost`. Fuera de producción se conservan los valores locales por defecto que ya existen, para que un clon recién hecho siga arrancando sin configurar nada.

#### Scenario: producción sin dirección de base de datos

- **WHEN** el sistema arranca en producción sin `DATABASE_URL`
- **THEN** deja constancia del problema con el nombre de la variable que falta y no se conecta a ninguna base local por defecto

#### Scenario: producción sin `SITIO_URL`

- **WHEN** el sistema arranca en producción sin `SITIO_URL`
- **THEN** deja constancia del problema en el log del servidor, y el panel sigue avisando a la vista que no puede armar el link de la ficha en lugar de mandar un `localhost` a un negocio real

#### Scenario: desarrollo sin configurar nada

- **WHEN** alguien arranca el proyecto en local con la base local levantada y sin más variables que las del ejemplo
- **THEN** el sitio funciona con los valores por defecto de desarrollo y no exige configuración de producción

#### Scenario: el aviso no se repite por petición

- **WHEN** se piden muchas páginas con la configuración incompleta
- **THEN** el aviso aparece una sola vez por proceso en el log, no una vez por petición

### Requirement: Los comandos que escriben en la base reconocen el entorno real

Los comandos que escriben masivamente en la base (seed de demostración y relleno de búsqueda) DEBEN seguir reconociendo un entorno peligroso ahora que la base local también es PostgreSQL: "base local" significa una base en la máquina de quien corre el comando, no un prefijo de archivo. En producción —detectada por `NODE_ENV` o por `VERCEL_ENV`— el seed de demostración NO DEBE sembrar nada, ni siquiera con permiso explícito. Contra una base remota que no sea de producción, DEBE exigir el permiso explícito que ya existe. Cada comando DEBE decir por qué no hizo nada.

#### Scenario: seed de demostración en el entorno de producción del hosting

- **WHEN** se intenta correr el seed de demostración con `VERCEL_ENV=production`
- **THEN** no siembra nada y lo dice

#### Scenario: seed de demostración apuntando a la base de Supabase

- **WHEN** se intenta correr el seed de demostración con la dirección de una base remota y sin el permiso explícito
- **THEN** no siembra nada y explica que la dirección no es una base local y que hace falta asumir el riesgo a mano

#### Scenario: seed de demostración contra la base local

- **WHEN** se corre el seed de demostración contra la base PostgreSQL local de desarrollo
- **THEN** siembra los negocios ficticios y avisa que lo que sembró son datos de mentira

### Requirement: La purga de rechazados se dispara sola en producción

El borrado de los registros rechazados a los 90 días (PRD §8) DEBE ejecutarse sin intervención humana, mediante una tarea programada que corra al menos una vez al día en producción. El disparo DEBE ser una petición HTTP a una ruta del propio sistema que solo actúa si trae el secreto configurado; sin secreto configurado, o con un secreto que no coincide, la ruta DEBE comportarse como si no existiera (404) y NO DEBE borrar nada. La ruta NO DEBE ser indexable y su respuesta NO DEBE incluir datos personales: solo cuántos registros se eliminaron. El mecanismo NO DEBE depender de nada exclusivo del hosting: cualquier programador de tareas capaz de hacer una petición con encabezado DEBE poder dispararlo (ADR-007).

#### Scenario: la tarea programada corre

- **WHEN** el programador de tareas llama a la ruta con el secreto correcto
- **THEN** el sistema elimina los registros rechazados que ya cumplieron 90 días, responde cuántos eliminó y lo deja en el log sin nombres ni números de nadie

#### Scenario: alguien encuentra la ruta

- **WHEN** cualquier persona pide esa ruta sin el secreto, o con uno equivocado
- **THEN** recibe la misma respuesta 404 que una ruta inexistente y no se borra ningún registro

#### Scenario: sin secreto configurado

- **WHEN** el sistema corre sin el secreto de tareas configurado
- **THEN** la ruta responde 404 a todo el mundo y ninguna purga se ejecuta

#### Scenario: programación declarada

- **WHEN** se revisa la configuración del despliegue
- **THEN** la tarea está declarada con su frecuencia diaria y `docs/despliegue.md` explica cómo dispararla desde cualquier otro programador de tareas si el hosting cambia

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

#### Scenario: variables de tickets pendientes

- **WHEN** se busca en el documento la configuración de las fotos o de la analítica
- **THEN** encuentra la sección con la decisión tomada y la nota de que las variables las define el ticket pendiente correspondiente, no un hueco silencioso

### Requirement: El documento fija dónde viven las fotos en producción

El documento de despliegue DEBE dejar decidido, citando ADR-006 y ADR-004, que las fotos de los negocios viven en el almacenamiento de archivos del mismo proveedor de la base de datos (Supabase Storage) y NO en el sistema de archivos del hosting, que es efímero. DEBE decir qué configuración reserva para eso y que la implementación llega con el ticket de la foto del negocio (T-008). Mientras ese ticket no se implemente, el sistema NO DEBE aceptar ni servir archivos subidos.

#### Scenario: la decisión está escrita antes de que exista el código

- **WHEN** se lee la sección de fotos del documento de despliegue
- **THEN** dice dónde vivirán los archivos, por qué no en el disco del hosting, y qué ticket lo implementa

#### Scenario: hoy no hay fotos que servir

- **WHEN** se revisa el sistema tal como queda con este change
- **THEN** ninguna pantalla acepta subir un archivo ni sirve archivos subidos, y el directorio sigue mostrando su marcador de foto
