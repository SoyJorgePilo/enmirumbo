# Delta de spec: modelo-datos

## MODIFIED Requirements

### Requirement: Migración inicial y seed reproducibles

El proyecto DEBE poder levantar la base de datos desde cero con las migraciones de Prisma y poblar los catálogos con `npm run db:seed`. El seed DEBE ser idempotente. La base DEBE ser del mismo motor en desarrollo, pruebas y producción (PostgreSQL, ADR-004), con un solo árbol de migraciones: el que se aplica en la laptop es el que se aplica en Supabase. Levantar la base local DEBE requerir un solo comando documentado, sin cuentas ni servicios de pago.

#### Scenario: base desde cero

- **WHEN** se aplican las migraciones sobre una base vacía y luego se corre `npm run db:seed`
- **THEN** la base queda creada con todas las tablas y los tres catálogos poblados (8 categorías, 21 colonias, 49 giros)

#### Scenario: seed idempotente

- **WHEN** se corre `npm run db:seed` dos veces seguidas
- **THEN** los conteos de los catálogos no cambian entre la primera y la segunda corrida

#### Scenario: la base de desarrollo es la misma que la de producción

- **WHEN** alguien levanta la base local con el comando documentado y aplica las migraciones
- **THEN** obtiene el mismo motor y el mismo esquema que producción, y las pruebas que corre en local ejercitan el dialecto real

### Requirement: Estado de revisión, origen y timestamps del ciclo de vida

El negocio DEBE tener un estado con valores `en_revision | publicado | rechazado` (default `en_revision`), un origen con valores `siembra | organico` (PRD §6.3 y §10; default `organico`, el admin lo ajusta al aprobar), un timestamp de registro asignado automáticamente al crearse y un timestamp de publicación que permanece nulo hasta que la ficha se publica. Además DEBE guardar el rastro del rechazo: un timestamp de rechazo y el motivo en texto, ambos nulos mientras el negocio no haya sido rechazado. La fecha del rechazo es lo que habilita la eliminación de los registros rechazados a los 90 días que exige el PRD §8. Si un negocio rechazado corrige y vuelve a enviar su registro, ambos campos DEBEN volver a quedar nulos, para que la purga no se lleve un registro que ya está otra vez en la cola. La migración DEBE poder aplicarse sobre una base que ya tiene negocios, sin perder ni alterar sus datos. El seed de negocios de demostración DEBE poblar ambos campos en su negocio `rechazado`, para que el panel y la purga tengan un caso realista que probar.

Los conjuntos de valores válidos los DEBE hacer cumplir la base de datos, con constraints escritas a mano en las migraciones, **en el dialecto de producción**. Esas constraints DEBEN seguir presentes después de aplicar el árbol completo de migraciones, no solo la primera: una migración posterior que las borre es un defecto que la verificación automática DEBE detectar.

#### Scenario: negocio recién creado

- **WHEN** se crea un negocio
- **THEN** su estado es `en_revision`, su timestamp de registro tiene la fecha de creación, y su timestamp de publicación, su timestamp de rechazo y su motivo de rechazo son nulos

#### Scenario: publicación

- **WHEN** un negocio pasa a estado `publicado` y se le asigna la fecha de publicación
- **THEN** ambos valores quedan persistidos y consultables

#### Scenario: rechazo con fecha y motivo

- **WHEN** un negocio pasa a estado `rechazado` con la fecha del rechazo y el motivo que escribió el admin
- **THEN** ambos valores quedan persistidos y consultables, y el negocio sigue existiendo en la base (no se borra en ese momento)

#### Scenario: el rastro del rechazo se limpia al volver a revisión

- **WHEN** un negocio rechazado vuelve al estado `en_revision`
- **THEN** su timestamp de rechazo y su motivo quedan nulos otra vez

#### Scenario: valores fuera del conjunto

- **WHEN** se intenta guardar un estado u origen fuera de los valores definidos
- **THEN** la base de datos rechaza la escritura (constraint CHECK en la migración), en el mismo motor que corre en producción

#### Scenario: las constraints sobreviven a todo el árbol de migraciones

- **WHEN** se aplican todas las migraciones en orden sobre una base vacía y después se intenta guardar un estado inventado
- **THEN** la base lo rechaza: ninguna migración posterior se llevó por delante las constraints escritas a mano

#### Scenario: migración sobre una base con datos

- **WHEN** se aplica la migración sobre una base que ya tiene negocios publicados, en revisión y rechazados
- **THEN** todas las filas siguen ahí con sus datos intactos y los dos campos nuevos quedan nulos en todas

#### Scenario: el seed de demostración incluye un rechazo con motivo

- **WHEN** se corre el seed de negocios de demostración
- **THEN** su negocio `rechazado` trae fecha de rechazo y motivo poblados, con un motivo ficticio

## ADDED Requirements

### Requirement: Los registros rechazados se eliminan definitivamente a los 90 días

El sistema DEBE eliminar de forma definitiva —el mismo borrado real que la operación ARCO, sin dejar datos recuperables por ninguna consulta— los negocios en estado `rechazado` cuya fecha de rechazo tenga 90 días o más, que es el compromiso publicado en el aviso de privacidad (PRD §8). La purga NO DEBE tocar ningún negocio en otro estado, ni un rechazado que todavía no cumple el plazo, ni un rechazado sin fecha de rechazo. DEBE ser idempotente: correrla dos veces seguidas deja la base igual y no falla. DEBE informar cuántos registros eliminó, sin publicar ningún dato personal en ese informe.

#### Scenario: rechazado que cumplió el plazo

- **WHEN** se ejecuta la purga y hay un negocio rechazado con fecha de rechazo de hace 90 días o más
- **THEN** ese negocio desaparece junto con sus vínculos con giros, y ninguna consulta posterior devuelve sus datos

#### Scenario: rechazado que todavía no cumple el plazo

- **WHEN** se ejecuta la purga y hay un negocio rechazado hace 89 días
- **THEN** ese negocio sigue en la base, intacto

#### Scenario: la purga no toca lo que no es suyo

- **WHEN** se ejecuta la purga con negocios publicados, en revisión y rechazados recientes en la base
- **THEN** solo desaparecen los rechazados que cumplieron el plazo; el conteo de publicados y de en revisión no cambia

#### Scenario: el negocio que corrigió y volvió a la cola

- **WHEN** un negocio fue rechazado hace más de 90 días pero corrigió y volvió a `en_revision` (su fecha de rechazo quedó nula)
- **THEN** la purga no lo elimina

#### Scenario: purga idempotente

- **WHEN** se ejecuta la purga dos veces seguidas
- **THEN** la segunda no elimina nada, no falla y lo informa como cero

#### Scenario: el informe no filtra datos personales

- **WHEN** la purga termina
- **THEN** lo que informa y lo que deja en el log es un conteo, sin nombres de negocios, números de WhatsApp ni motivos de rechazo
