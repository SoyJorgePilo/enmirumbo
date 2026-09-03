# Spec: modelo-datos

## Requirements

### Requirement: El modelo `Negocio` cubre los campos del registro

El sistema DEBE persistir un negocio con los 5 campos obligatorios del PRD §6.1 — nombre, categoría (del catálogo), WhatsApp de 10 dígitos, colonia y constancia del consentimiento del aviso de privacidad — y DEBE admitir los 5 opcionales: "¿Qué ofreces?" (máx. 200 caracteres), entregas a domicilio (sí/no), teléfono fijo y dirección o referencias con pin opcional (latitud/longitud), horario en texto libre, y foto y/o link de Facebook.

#### Scenario: alta mínima con solo obligatorios
- **WHEN** se crea un negocio con nombre, categoría, WhatsApp, colonia y constancia de consentimiento
- **THEN** el negocio queda guardado y todos los campos opcionales quedan vacíos

#### Scenario: alta completa con opcionales
- **WHEN** se crea un negocio incluyendo los 5 campos opcionales (con pin de mapa)
- **THEN** todos los valores quedan persistidos y recuperables tal como se guardaron, incluidas las coordenadas del pin

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

### Requirement: Giros asignables al negocio por el admin

El sistema DEBE permitir vincular giros del catálogo a un negocio (relación muchos-a-muchos). Un negocio recién registrado no tiene giros; el admin le asigna de 1 a 3 al aprobar (PRD §6.3), y un negocio puede publicarse sin giro si ninguno embona (Apéndice B). La cota 1-3 se hace cumplir en el panel de revisión, no en la base de datos.

#### Scenario: asignación de giros
- **WHEN** el admin vincula 3 giros a un negocio
- **THEN** los tres vínculos quedan persistidos y consultables tanto desde el negocio como desde cada giro

#### Scenario: negocio recién registrado sin giros
- **WHEN** un negocio se crea desde el registro
- **THEN** no tiene ningún giro vinculado

### Requirement: Estado de revisión, origen y timestamps del ciclo de vida

El negocio DEBE tener un estado con valores `en_revision | publicado | rechazado` (default `en_revision`), un origen con valores `siembra | organico` (PRD §6.3 y §10; default `organico`, el admin lo ajusta al aprobar), un timestamp de registro asignado automáticamente al crearse y un timestamp de publicación que permanece nulo hasta que la ficha se publica.

#### Scenario: negocio recién creado
- **WHEN** se crea un negocio
- **THEN** su estado es `en_revision`, su timestamp de registro tiene la fecha de creación y su timestamp de publicación es nulo

#### Scenario: publicación
- **WHEN** un negocio pasa a estado `publicado` y se le asigna la fecha de publicación
- **THEN** ambos valores quedan persistidos y consultables

#### Scenario: valores fuera del conjunto
- **WHEN** se intenta guardar un estado u origen fuera de los valores definidos
- **THEN** la base de datos rechaza la escritura (constraint CHECK en la migración)

### Requirement: La colonia admite "Otra" con texto libre pendiente de normalizar

El sistema DEBE permitir registrar un negocio sin colonia de catálogo, guardando el texto libre que capturó (PRD §6.1, Apéndice A). Un negocio en esa condición DEBE ser identificable como pendiente de normalizar, y el admin DEBE poder normalizarlo asignándole después una colonia del catálogo.

#### Scenario: registro con colonia "Otra"
- **WHEN** un negocio se registra con la opción "Otra" y el texto "Rinconada del Venado"
- **THEN** el texto libre queda guardado y el negocio no tiene colonia de catálogo asignada (pendiente de normalizar)

#### Scenario: normalización por el admin
- **WHEN** el admin asigna al negocio una colonia del catálogo
- **THEN** el negocio queda vinculado a esa colonia y deja de estar pendiente de normalizar

### Requirement: Borrado definitivo de un negocio (operación ARCO)

El sistema DEBE permitir eliminar definitivamente un negocio (hard delete real, no despublicar), borrando su fila y sus vínculos con giros, sin dejar datos recuperables por ninguna consulta (PRD §8).

#### Scenario: hard delete
- **WHEN** se elimina definitivamente un negocio que tenía giros vinculados
- **THEN** desaparecen su fila y todos sus vínculos con giros, y ninguna consulta posterior devuelve sus datos

### Requirement: Migración inicial y seed reproducibles

El proyecto DEBE poder levantar la base de datos desde cero con la migración inicial de Prisma y poblar los catálogos con `npm run db:seed`. El seed DEBE ser idempotente.

#### Scenario: base desde cero
- **WHEN** se aplica la migración inicial sobre una base inexistente y luego se corre `npm run db:seed`
- **THEN** la base queda creada con todas las tablas y los tres catálogos poblados (8 categorías, 21 colonias, 49 giros)

#### Scenario: seed idempotente
- **WHEN** se corre `npm run db:seed` dos veces seguidas
- **THEN** los conteos de los catálogos no cambian entre la primera y la segunda corrida

### Requirement: El esquema reserva el terreno para la gestión P1 sin implementarla

El modelo `Negocio` DEBE incluir un campo opcional y único para el token del enlace de gestión (PRD §6.4), que permanece nulo en el MVP y no tiene ninguna lógica asociada. Las revisiones de edición supervisadas se modelarán como tabla propia cuando llegue E8 (ver design.md); este change no crea esa tabla.

#### Scenario: espacio reservado sin comportamiento
- **WHEN** se registra un negocio en el MVP
- **THEN** su token de gestión es nulo y ninguna funcionalidad del sistema lo lee ni lo escribe
