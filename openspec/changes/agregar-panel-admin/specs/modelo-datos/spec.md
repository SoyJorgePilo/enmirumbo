# Delta de spec: modelo-datos

## MODIFIED Requirements

### Requirement: Estado de revisión, origen y timestamps del ciclo de vida

El negocio DEBE tener un estado con valores `en_revision | publicado | rechazado` (default `en_revision`), un origen con valores `siembra | organico` (PRD §6.3 y §10; default `organico`, el admin lo ajusta al aprobar), un timestamp de registro asignado automáticamente al crearse y un timestamp de publicación que permanece nulo hasta que la ficha se publica. Además DEBE guardar el rastro del rechazo: un timestamp de rechazo y el motivo en texto, ambos nulos mientras el negocio no haya sido rechazado. La fecha del rechazo es lo que habilita la eliminación de los registros rechazados a los 90 días que exige el PRD §8 (la purga en sí no es parte de este change). Si un negocio rechazado corrige y vuelve a enviar su registro, ambos campos DEBEN volver a quedar nulos, para que la purga no se lleve un registro que ya está otra vez en la cola. La migración DEBE poder aplicarse sobre una base que ya tiene negocios, sin perder ni alterar sus datos. El seed de negocios de demostración DEBE poblar ambos campos en su negocio `rechazado`, para que el panel y la purga futura tengan un caso realista que probar.

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
- **THEN** la base de datos rechaza la escritura (constraint CHECK en la migración)

#### Scenario: migración sobre una base con datos
- **WHEN** se aplica la migración sobre una base que ya tiene negocios publicados, en revisión y rechazados
- **THEN** todas las filas siguen ahí con sus datos intactos y los dos campos nuevos quedan nulos en todas

#### Scenario: el seed de demostración incluye un rechazo con motivo
- **WHEN** se corre el seed de negocios de demostración
- **THEN** su negocio `rechazado` trae fecha de rechazo y motivo poblados, con un motivo ficticio
