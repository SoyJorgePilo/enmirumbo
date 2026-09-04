# Delta: modelo-datos — tabla `Reporte`

## ADDED Requirements

### Requirement: El modelo `Reporte` guarda el aviso de un vecino sobre una ficha, sin ningún dato de quien lo envía

El sistema DEBE persistir los reportes del botón "Reportar" (PRD §6.3) en una tabla propia, ligada al negocio reportado, con exactamente estos datos y ninguno más: el negocio al que apunta, el motivo, el comentario opcional, el estado y las fechas. En concreto:

- **Motivo**: uno de una lista cerrada de cuatro valores estables (`cerrado`, `no_real`, `datos_incorrectos`, `inapropiado`), con la validación del conjunto hecha cumplir por la base (constraint CHECK en la migración, como ya se hace con el estado y el origen del negocio en SQLite, ADR-001). Las etiquetas que ven las personas viven en el código, no en la base: el valor guardado es estable aunque el copy cambie.
- **Comentario**: texto opcional y nulo cuando el vecino no escribió nada; la cota de 300 caracteres se hace cumplir en el formulario, no en la base.
- **Estado**: `pendiente | atendido`, con default `pendiente` y CHECK del conjunto.
- **Fechas**: la de creación, asignada automáticamente, y la de atención, nula hasta que el admin marca el reporte como atendido.

La tabla NO DEBE tener ninguna columna que identifique a quien reportó: ni IP, ni huella, ni nombre, ni contacto, ni un valor derivado de ellos (PRD §8 y LFPDPPP: lo que no se guarda no se puede filtrar). El sistema DEBE poder consultar, por negocio, cuántos reportes tiene en estado `pendiente`, y listar los reportes pendientes de un negocio del más antiguo al más reciente. La migración DEBE poder aplicarse sobre una base que ya tiene negocios sin alterar ni una fila ni una columna de `Negocio`, y sin borrar los CHECK que ya existen.

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

#### Scenario: migración sobre una base con datos

- **WHEN** se aplica la migración sobre una base que ya tiene negocios publicados, en revisión y rechazados
- **THEN** la tabla de reportes queda creada y vacía, todos los negocios siguen con sus datos intactos y los CHECK de estado y origen del negocio siguen vigentes

## MODIFIED Requirements

### Requirement: Borrado definitivo de un negocio (operación ARCO)

El sistema DEBE permitir eliminar definitivamente un negocio (hard delete real, no despublicar), borrando su fila, sus vínculos con giros **y todos sus reportes**, sin dejar datos recuperables por ninguna consulta (PRD §8). Un reporte NO DEBE poder quedar huérfano ni impedir el borrado del negocio al que apunta: los derechos ARCO del negocio pesan más que el aviso de un vecino anónimo.

#### Scenario: hard delete

- **WHEN** se elimina definitivamente un negocio que tenía giros vinculados
- **THEN** desaparecen su fila y todos sus vínculos con giros, y ninguna consulta posterior devuelve sus datos

#### Scenario: hard delete de un negocio con reportes

- **WHEN** se elimina definitivamente un negocio que tenía reportes pendientes y atendidos
- **THEN** el borrado se completa, sus reportes desaparecen con él y ninguna consulta posterior devuelve ni el negocio ni sus reportes
