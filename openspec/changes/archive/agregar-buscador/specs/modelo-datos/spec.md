# Delta de spec: modelo-datos

## ADDED Requirements

### Requirement: El negocio guarda una versión normalizada de su nombre y de "¿Qué ofreces?" para el buscador

El sistema DEBE persistir, junto a cada negocio, una versión normalizada de su nombre y de su "¿Qué ofreces?" —minúsculas, sin acentos ni signos— pensada solo para que el buscador pueda encontrar sin importar acentos ni mayúsculas (PRD §6.2), porque la base de datos no compara así por sí sola. Esos valores DEBEN ser siempre un reflejo de los campos que les dan origen: se escriben cada vez que se guarda un negocio, con la misma función de normalización que usa el buscador, y ningún flujo DEBE poder dejarlos desincronizados. Un negocio sin "¿Qué ofreces?" DEBE quedar con su versión normalizada vacía, no nula. Estos valores son internos del buscador: NO DEBEN mostrarse en ninguna vista pública ni aparecer en las consultas del directorio.

#### Scenario: alta con acentos y mayúsculas

- **WHEN** se guarda un negocio llamado "Plomería Güicho" que ofrece "Destape de drenajes y BOMBAS de agua"
- **THEN** quedan persistidas sus versiones normalizadas sin acentos ni mayúsculas ("plomeria guicho" y "destape de drenajes y bombas de agua"), además de los textos originales tal como los escribió el negocio

#### Scenario: negocio sin "¿Qué ofreces?"

- **WHEN** se guarda un negocio que no llenó "¿Qué ofreces?"
- **THEN** su versión normalizada de ese campo queda vacía y ninguna consulta del buscador falla por eso

#### Scenario: las fichas que ya existían quedan encontrables

- **WHEN** se aplica el cambio sobre una base que ya tenía negocios guardados y se corre el relleno correspondiente
- **THEN** todos esos negocios quedan con sus versiones normalizadas calculadas, de modo que el buscador los encuentra igual que a los registrados después

#### Scenario: el relleno se puede repetir

- **WHEN** se corre el relleno dos veces seguidas
- **THEN** los valores quedan iguales y no se altera ningún otro dato del negocio

#### Scenario: valores consistentes con su origen

- **WHEN** se revisan todos los negocios guardados
- **THEN** la versión normalizada de cada uno corresponde exactamente a la normalización de su nombre y de su "¿Qué ofreces?" actuales

## MODIFIED Requirements

### Requirement: Seed de negocios ficticios para desarrollo, separado del de catálogos

El proyecto DEBE poder poblar la base de desarrollo con negocios de mentira para ver el directorio funcionando, mediante un comando propio y distinto del seed de catálogos. El seed de catálogos NO DEBE crear negocios: sus conteos siguen siendo solo los de categorías, colonias y giros. El seed de demostración DEBE ser idempotente (correrlo dos veces no duplica fichas) y DEBE crear un conjunto que cubra los casos que el directorio necesita probar: negocios publicados en varias categorías (incluida "Clubes y escuelas deportivas") y varias colonias, alguno con entregas a domicilio y alguno sin ellas, alguno con todos los campos opcionales y alguno con solo los obligatorios, uno publicado con colonia "Otra" sin normalizar, uno en `en_revision` y uno `rechazado`. Además DEBE cubrir los casos que el buscador necesita probar mientras el panel del admin no existe: al menos un negocio publicado **con giros asignados**, y entre ellos uno cuyo giro NO aparezca ni en su nombre ni en su "¿Qué ofreces?" (única forma de demostrar que la búsqueda por giro funciona de verdad), más al menos un negocio publicado cuyas palabras clave lleven acentos. Los negocios que siembra DEBEN quedar con sus versiones normalizadas de búsqueda escritas, como cualquier otro camino de escritura. Los datos DEBEN ser inventados y reconocibles como tales: nombres ficticios, números de WhatsApp de la serie reservada para pruebas (`771999xxxx`) y ninguna dirección de un negocio real (repo público + LFPDPPP, PRD §8). El comando DEBE avisar en su salida que lo que sembró son datos de mentira y NO DEBE ejecutarse contra un entorno de producción.

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
