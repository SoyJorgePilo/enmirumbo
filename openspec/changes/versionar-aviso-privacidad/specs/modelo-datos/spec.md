# Delta: modelo-datos

## ADDED Requirements

### Requirement: La constancia del consentimiento guarda contra qué versión del aviso se dio

El negocio DEBE guardar, junto a la fecha del consentimiento (`consintioAvisoEn`), el identificador de la versión del aviso de privacidad que estaba vigente cuando se dio ese consentimiento (`consintioAvisoVersion`). Es lo que convierte la constancia de la LFPDPPP (PRD §8) en una prueba completa: sin la versión, la fecha apunta a un texto que pudo haber cambiado.

Las dos DEBEN viajar juntas: ningún camino de escritura DEBE poder guardar una sin la otra. La versión DEBE quedar nula únicamente en las fichas registradas **antes** de que existiera el versionado; a esas filas NO DEBE asignárseles una versión de relleno, porque nadie puede afirmar hoy qué texto tuvieron enfrente. El campo es una cadena, sin valor por defecto en la base de datos.

El negocio DEBE poder guardar además una **reaceptación**: la fecha (`reconsintioAvisoEn`) y la versión (`reconsintioAvisoVersion`) de la última vez que se aceptó una versión del aviso **distinta** de la de su constancia original. Ambas nulas mientras eso no ocurra, y ambas también inseparables. La reaceptación NO sustituye a la constancia original: la complementa.

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

- **WHEN** se aplica la migración sobre una base que ya tiene negocios en revisión, publicados y rechazados
- **THEN** todas las filas siguen ahí con sus datos intactos, su versión de consentimiento queda nula y ninguna consulta del sitio falla por eso

#### Scenario: el seed de demostración siembra la versión

- **WHEN** se corre el seed de negocios ficticios
- **THEN** todos nacen con la versión vigente del aviso en su constancia, y al menos uno queda con una reaceptación poblada, para que el panel tenga ese caso que mostrar

#### Scenario: la versión aceptada es un dato interno

- **WHEN** se consulta una ficha publicada desde el directorio público
- **THEN** ni la versión del consentimiento ni la reaceptación aparecen en la proyección pública, igual que `consintioAvisoEn` y `registradoEn`
