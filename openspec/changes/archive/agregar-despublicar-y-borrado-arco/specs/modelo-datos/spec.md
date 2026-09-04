# Delta: modelo-datos — rastro de la despublicación y borrado que arrastra todo

## ADDED Requirements

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

#### Scenario: migración sobre una base con datos

- **WHEN** se aplica la migración sobre una base que ya tiene negocios publicados, en revisión y rechazados
- **THEN** todas las filas siguen ahí con sus datos intactos, los dos campos nuevos quedan nulos en todas y los CHECK de `estado` y `origen` siguen vigentes

## MODIFIED Requirements

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

### Requirement: Borrado definitivo de un negocio (operación ARCO)

El sistema DEBE permitir eliminar definitivamente un negocio (hard delete real, no despublicar), esté en el estado que esté, borrando su fila **y todo lo que cuelgue de ella**: sus vínculos con giros, sus reportes y cualquier otra fila ligada al negocio que el modelo llegue a tener, sin dejar datos recuperables por ninguna consulta (PRD §8). Si el sistema llega a guardar archivos propios de la ficha —la foto del negocio—, el borrado DEBE eliminarlos también: un archivo que sobrevive al borrado es el dato personal que el aviso de privacidad prometió eliminar.

**El arrastre DEBE estar garantizado por el modelo, no por la acción que borra**: toda relación que apunte al negocio se declara con borrado en cascada, de modo que una tabla nueva que alguien agregue después no pueda dejar filas huérfanas ni impedir un borrado ARCO. Ningún dato ligado a un tercero (por ejemplo el aviso de un vecino que reportó la ficha) DEBE poder bloquear el borrado: los derechos ARCO del titular pesan más.

El borrado DEBE ser idempotente: pedir el borrado de un identificador que ya no existe NO DEBE producir un error, sino quedarse sin efecto.

#### Scenario: hard delete
- **WHEN** se elimina definitivamente un negocio que tenía giros vinculados
- **THEN** desaparecen su fila y todos sus vínculos con giros, y ninguna consulta posterior devuelve sus datos

#### Scenario: hard delete de un negocio con reportes
- **WHEN** se elimina definitivamente un negocio que tenía reportes pendientes y atendidos
- **THEN** el borrado se completa, sus reportes desaparecen con él y ninguna consulta posterior devuelve ni el negocio ni sus reportes

#### Scenario: borrar en cualquier estado
- **WHEN** se eliminan definitivamente un negocio `publicado`, uno `en_revision` y uno `rechazado`
- **THEN** los tres desaparecen igual, sin importar su estado

#### Scenario: borrado idempotente
- **WHEN** se pide dos veces el borrado del mismo identificador
- **THEN** la segunda vez no ocurre ningún error y no hay nada más que borrar

#### Scenario: ninguna relación bloquea el borrado
- **WHEN** se revisan las relaciones del esquema que apuntan al negocio
- **THEN** todas están declaradas con borrado en cascada, de modo que ninguna puede dejar filas huérfanas ni impedir el borrado
