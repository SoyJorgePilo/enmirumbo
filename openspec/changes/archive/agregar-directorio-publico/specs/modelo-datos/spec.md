# Delta de spec: modelo-datos

## ADDED Requirements

### Requirement: Seed de negocios ficticios para desarrollo, separado del de catálogos

El proyecto DEBE poder poblar la base de desarrollo con negocios de mentira para ver el directorio funcionando, mediante un comando propio y distinto del seed de catálogos. El seed de catálogos NO DEBE crear negocios: sus conteos siguen siendo solo los de categorías, colonias y giros. El seed de demostración DEBE ser idempotente (correrlo dos veces no duplica fichas) y DEBE crear un conjunto que cubra los casos que el directorio necesita probar: negocios publicados en varias categorías (incluida "Clubes y escuelas deportivas") y varias colonias, alguno con entregas a domicilio y alguno sin ellas, alguno con todos los campos opcionales y alguno con solo los obligatorios, uno publicado con colonia "Otra" sin normalizar, uno en `en_revision` y uno `rechazado`. Los datos DEBEN ser inventados y reconocibles como tales: nombres ficticios, números de WhatsApp de la serie reservada para pruebas (`771999xxxx`) y ninguna dirección de un negocio real (repo público + LFPDPPP, PRD §8). El comando DEBE avisar en su salida que lo que sembró son datos de mentira y NO DEBE ejecutarse contra un entorno de producción.

#### Scenario: sembrar negocios de demostración

- **WHEN** se corre el comando de seed de demostración sobre una base con los catálogos ya poblados
- **THEN** quedan creados los negocios ficticios, con al menos uno publicado en la categoría de deporte, al menos uno con entregas a domicilio, uno con colonia "Otra" sin normalizar, uno en `en_revision` y uno `rechazado`

#### Scenario: el seed de catálogos no crea negocios

- **WHEN** se corre `npm run db:seed` sobre una base recién migrada
- **THEN** los catálogos quedan poblados y la tabla de negocios queda vacía

#### Scenario: seed de demostración idempotente

- **WHEN** se corre el seed de demostración dos veces seguidas
- **THEN** el número de negocios no cambia entre la primera y la segunda corrida

#### Scenario: datos ficticios y nada real

- **WHEN** se revisan los negocios que siembra el comando
- **THEN** todos los números de WhatsApp empiezan con `771999`, los nombres son inventados y ninguno corresponde a un negocio real de Tizayuca

#### Scenario: nunca contra producción

- **WHEN** se intenta correr el seed de demostración en un entorno de producción
- **THEN** el comando no siembra nada y lo dice
