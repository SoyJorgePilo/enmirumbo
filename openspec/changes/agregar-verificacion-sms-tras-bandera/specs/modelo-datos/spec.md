# Delta de spec: modelo-datos

> El esquema se **modifica**: `Negocio` gana una columna nueva. En formato de delta va como un requirement ADDED con sus invariantes, igual que se hizo con la tabla `Reporte` y con la referencia interna de la foto.

## ADDED Requirements

### Requirement: El negocio guarda cuándo se verificó su número por SMS

El negocio DEBE poder guardar la fecha en que el proveedor de SMS confirmó que su número le pertenece (`numeroVerificadoEn`), en una columna **nullable** agregada por migración. Nula significa exactamente una cosa: "ese número no ha pasado por la verificación por SMS", que es el estado de todas las fichas mientras la capacidad esté apagada (ADR-011) y el de cualquier ficha registrada antes de que la columna existiera. A esas filas NO DEBE asignárseles una fecha de relleno.

Ese valor DEBE escribirlo **únicamente el servidor**, y solo después de que el proveedor confirme el código: ningún camino de escritura que reciba datos del cliente DEBE poder fijarlo, igual que pasa con el estado, el origen, la constancia del consentimiento y la referencia de la foto. El sistema NO DEBE guardar el código de verificación en ninguna columna: el código lo genera, lo caduca y lo compara el proveedor.

La marca **sobrevive a las transiciones del panel**: aprobar, rechazar, despublicar y volver a publicar no la tocan, y un reenvío tras rechazo tampoco, porque el número no cambió y el hecho comprobado sigue siendo cierto (la regla de escritura vive en `registro-negocio`). Solo desaparece con la fila: el borrado definitivo se la lleva como todo lo demás.

Es un **dato interno**: NO DEBE aparecer en ninguna proyección pública del directorio —ficha, listados, resultados, sitemap ni datos estructurados—, igual que `consintioAvisoEn` y `registradoEn`. Su única lectura es el panel del admin (capacidad `revision-admin`).

La migración DEBE poder aplicarse sobre una base que ya tiene negocios en los tres estados, sin perder ni alterar ninguna fila y sin tocar los CHECK de `estado` y de `origen` que ya existen.

#### Scenario: negocio recién registrado

- **WHEN** se crea un negocio desde el formulario
- **THEN** su fecha de verificación del número queda nula

#### Scenario: verificación confirmada

- **WHEN** el proveedor confirma el código de una ficha
- **THEN** queda persistida la fecha de esa confirmación y el negocio sigue en `en_revision`, sin ningún otro cambio en sus datos

#### Scenario: la marca sobrevive a las transiciones

- **WHEN** una ficha con el número verificado se aprueba, se despublica, se rechaza y se vuelve a enviar
- **THEN** su fecha de verificación sigue siendo la misma en todos esos pasos

#### Scenario: el código no vive en la base

- **WHEN** se revisan las columnas de la tabla de negocios
- **THEN** existe la fecha de verificación y no existe ninguna columna que guarde un código, un identificador de la verificación en el proveedor ni nada derivado del código

#### Scenario: dato interno

- **WHEN** se consulta una ficha publicada desde el directorio público
- **THEN** la fecha de verificación no aparece en la proyección pública, igual que la constancia del consentimiento

#### Scenario: migración sobre una base con datos

- **WHEN** se aplica la migración que agrega la columna sobre una base que ya tiene negocios publicados, en revisión y rechazados
- **THEN** todas las filas siguen ahí con sus datos intactos, la columna nueva queda nula en todas y los CHECK de `estado` y `origen` siguen vigentes

#### Scenario: el borrado se la lleva

- **WHEN** se borra definitivamente un negocio que tenía su número verificado
- **THEN** desaparece con su fila, como el resto de sus datos
