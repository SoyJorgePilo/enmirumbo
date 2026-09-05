# Delta de spec: modelo-datos

## REMOVED Requirements

### Requirement: El esquema reserva el terreno para la gestión P1 sin implementarla

**Razón:** el enlace de gestión deja de ser terreno reservado y pasa a estar implementado (T-014, PRD §6.4). La columna `tokenGestion` en claro se sustituye por la huella del token (`design.md` §3), así que el requirement que la describía como "nula y sin lógica" ya no es verdad.

**Migración:** la columna `tokenGestion` está nula en todas las filas existentes (ninguna funcionalidad la escribía), así que la migración la elimina sin pérdida de datos y crea en su lugar `tokenGestionHash` y `tokenGestionCreadoEn`. Su comportamiento nuevo queda descrito en el requirement "El negocio guarda su enlace de gestión como huella, nunca en claro".

## ADDED Requirements

### Requirement: El negocio guarda su enlace de gestión como huella, nunca en claro

El modelo `Negocio` DEBE guardar el enlace de gestión (PRD §6.4) como la **huella SHA-256 del token**, en un campo opcional y único, más la fecha en que se generó. El token en claro NO DEBE persistirse en ninguna columna, en ningún log ni en ningún archivo del proyecto: la base tiene que poder respaldarse sin que el respaldo contenga los enlaces de nadie. Ambos campos DEBEN permanecer nulos mientras la ficha no se haya aprobado. Generar un enlace nuevo DEBE sustituir la huella anterior, de modo que la base nunca conserve más de un enlace válido por negocio. La migración DEBE poder aplicarse sobre una base que ya tiene negocios, sin perder ni alterar sus datos.

#### Scenario: negocio recién registrado

- **WHEN** se crea un negocio desde el registro
- **THEN** su huella de enlace y su fecha de generación son nulas

#### Scenario: la base no guarda el token

- **WHEN** se genera un enlace de gestión y después se revisa la fila del negocio
- **THEN** lo guardado es una huella de la que no se puede recuperar el token, y el token en claro no aparece en ninguna columna

#### Scenario: dos negocios no pueden compartir huella

- **WHEN** se intenta guardar en un segundo negocio la misma huella que ya tiene otro
- **THEN** la base de datos rechaza la operación por violación de la constraint de unicidad

#### Scenario: regenerar sustituye

- **WHEN** un negocio que ya tenía enlace recibe uno nuevo
- **THEN** su fila queda con una sola huella —la nueva— y con la fecha de generación actualizada

#### Scenario: migración sobre una base con datos

- **WHEN** se aplica la migración sobre una base que ya tiene negocios publicados, en revisión y rechazados
- **THEN** todas las filas siguen ahí con sus datos intactos y los campos nuevos quedan nulos en todas

### Requirement: Una edición pendiente guarda el contenido completo de lo que se quiere publicar

El sistema DEBE persistir las ediciones que manda un negocio en una tabla propia, separada de `Negocio` (`design.md` §1), con **el contenido completo** de lo que quedaría publicado si se aprueba —los mismos campos que el negocio puede capturar en el formulario— más el negocio al que pertenece, su estado (`pendiente | aplicada | descartada`, con CHECK en la migración), la fecha en que llegó, la fecha en que se resolvió y el motivo del descarte. Guardar una edición NO DEBE modificar ninguna columna del negocio.

La base DEBE impedir que un negocio tenga dos ediciones `pendiente` a la vez. Los campos de una edición NO DEBEN incluir el estado, el origen, los giros, la fecha de publicación, la constancia del consentimiento ni la huella del enlace del negocio: esos no son editables y no viajan en una edición.

#### Scenario: edición guardada sin tocar la ficha

- **WHEN** se guarda una edición pendiente con un nombre y un horario distintos de los del negocio
- **THEN** la fila de la edición queda con esos valores y la fila del negocio conserva exactamente los suyos, incluidos estado, origen, giros y fecha de publicación

#### Scenario: una sola pendiente por negocio

- **WHEN** se intenta crear una segunda edición `pendiente` para un negocio que ya tiene una
- **THEN** la base de datos lo impide, de modo que nunca hay dos versiones esperando revisión del mismo negocio

#### Scenario: estados fuera del conjunto

- **WHEN** se intenta guardar una edición con un estado distinto de `pendiente`, `aplicada` o `descartada`
- **THEN** la base de datos rechaza la escritura (constraint CHECK en la migración)

#### Scenario: una edición resuelta deja de bloquear

- **WHEN** una edición pasa a `aplicada` o a `descartada` y el negocio manda cambios nuevos
- **THEN** la edición nueva se guarda como `pendiente` sin chocar con la resuelta

#### Scenario: la edición no puede cargar campos que no son editables

- **WHEN** se revisan las columnas de la tabla de ediciones
- **THEN** no existe ninguna para estado, origen, giros, fecha de publicación, constancia de consentimiento ni huella del enlace del negocio

## MODIFIED Requirements

### Requirement: Borrado definitivo de un negocio (operación ARCO)

El sistema DEBE permitir eliminar definitivamente un negocio (hard delete real, no despublicar), borrando su fila, sus vínculos con giros y **todas sus ediciones —pendientes o ya resueltas—**, sin dejar datos recuperables por ninguna consulta (PRD §8). Una edición guarda los mismos datos personales que la ficha (nombre, WhatsApp, teléfono, dirección), así que un borrado que la dejara atrás no sería un borrado. Borrar el negocio DEBE llevarse también su huella de enlace, de modo que ningún enlace de gestión siga resolviendo a algo.

#### Scenario: hard delete

- **WHEN** se elimina definitivamente un negocio que tenía giros vinculados
- **THEN** desaparecen su fila y todos sus vínculos con giros, y ninguna consulta posterior devuelve sus datos

#### Scenario: el borrado se lleva las ediciones

- **WHEN** se elimina definitivamente un negocio que tenía una edición pendiente y dos ya resueltas
- **THEN** desaparecen también esas tres ediciones y ninguna consulta posterior devuelve el nombre, el WhatsApp, el teléfono ni la dirección que traían

#### Scenario: el enlace de un negocio borrado no resuelve

- **WHEN** se abre el enlace de gestión de un negocio que fue eliminado definitivamente
- **THEN** responde como no encontrado, igual que un enlace inventado
