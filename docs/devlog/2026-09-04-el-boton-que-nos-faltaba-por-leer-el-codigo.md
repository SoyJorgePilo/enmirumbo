# 2026-09-04 · El botón que nos faltaba, y lo encontramos leyendo el código

<!-- Escrito para publicarse: un extracto de esta entrada debe poder ir tal cual a Facebook/LinkedIn/X. Tono cercano, español mexicano, sin jerga innecesaria. -->

**Hito:** el panel de administración ya puede despublicar una ficha y borrarla para siempre — los dos derechos ARCO (cancelación y oposición) que el aviso de privacidad de NecesitoUno lleva semanas prometiendo por escrito, sin que hubiera cómo cumplirlos ([PR #13](https://github.com/SoyJorgePilo/necesitouno/pull/13)).

## Qué construimos

- **Despublicar, con motivo obligatorio.** Desde el detalle de un negocio publicado, un toque lo regresa a revisión, guarda por qué y lo saca del directorio, del buscador y de cualquier listado en la siguiente petición. Su URL responde el mismo 404 que un negocio que nunca existió.
- **Aviso al negocio por WhatsApp**, mensaje prellenado con el motivo — lo manda la persona admin, nunca el sistema.
- **Borrado definitivo en dos pasos, sin JavaScript.** El admin teclea la palabra `BORRAR` para confirmar. Se lleva la fila, los giros, los reportes y —lo verificamos con una ficha con foto real, no de mentiras— los dos archivos `.webp` del disco. La foto del negocio vecino queda intacta.
- Las dos acciones exigen sesión válida y son idempotentes: doble toque, dos pestañas abiertas o una carrera con otra aprobación no revientan nada.

## La decisión interesante

Este ticket no salió de una lluvia de ideas ni del backlog priorizado: salió de escribir la especificación de otro botón. Al especificar "Reportar" (T-011, el botón para que un vecino avise que una ficha es falsa o que el negocio ya cerró), nos topamos con una pregunta incómoda leyendo el código real del panel: *¿y luego qué hace el admin con ese reporte?* La respuesta era "nada" — `aprobarRegistro` y `rechazarRegistro` solo tocan registros en revisión; sobre una ficha ya publicada, el panel contestaba "Este registro ya lo habías resuelto." Bajar una ficha reportada como falsa hoy hubiera significado editar SQLite a mano, con el sitio ya lanzado.

Y ahí apareció algo peor: el aviso de privacidad, que ya estaba publicado, prometía con estas palabras exactas que "en cuanto nos llega tu mensaje la bajamos del directorio" y que podíamos "eliminar tu registro de forma definitiva, no solo esconderlo." Ese compromiso llevaba semanas declarado como pendiente operativo en el propio código — una promesa legal sin botón detrás. El ticket T-015 nació de cerrar ese hueco antes de que alguien lo probara de verdad.

## Qué aprendimos

Que la parte más destructiva del sitio se diseña distinto a todo lo demás. Descartamos el patrón de GitHub (escribir el nombre del negocio para confirmar el borrado) porque en un teclado de celular los acentos y las comillas de un nombre real son un suplicio; la palabra fija `BORRAR` obliga a leer sin castigar al admin. Y no nos quedamos con la corazonada: la probamos contra homoglifos cirílicos, ancho completo, negritas matemáticas y espacios invisibles, para asegurarnos de que nada que *se pareciera* a la palabra pudiera colarse. De regalo salió un bug real (una carrera entre borrar y aprobar al mismo tiempo tumbaba el panel con un error 500), que se corrigió antes de mergear.

## Siguiente paso

Quedaron cinco pendientes anotados en el backlog, con dueño y ticket propio: el buscador de fichas dentro del panel (hoy llegar a una ficha publicada sin reporte de por medio obliga a copiar el id de la URL pública), acceso y rectificación de datos (las otras dos letras de ARCO), y una bitácora de quién borra qué — hoy, con un solo admin, es tolerable; en cuanto haya un segundo, deja de serlo.

---
*Tickets/PRs relacionados: T-015 · PR #13*
