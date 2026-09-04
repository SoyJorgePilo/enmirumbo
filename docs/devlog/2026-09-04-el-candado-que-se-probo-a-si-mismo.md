# 2026-09-04 · El candado que se probó a sí mismo

<!-- Escrito para publicarse: un extracto de esta entrada debe poder ir tal cual a Facebook/LinkedIn/X. Tono cercano, español mexicano, sin jerga innecesaria. -->

**Hito:** con T-012 (PR [#15](https://github.com/SoyJorgePilo/necesitouno/pull/15)) mergeado, cada ficha que se registra en NecesitoUno queda amarrada a la versión exacta del aviso de privacidad que tenía enfrente — y el candado que hace cumplir eso se disparó, sin que nadie se lo pidiera, dos veces en la misma fusión del PR. (Van siete entradas de devlog en un solo día. Récord del proyecto, y probablemente también su techo.)

## Qué construimos

- El aviso de privacidad estrena un número de versión visible, en la página y en el bloque de consentimiento del formulario ("Estás aceptando la versión 1 del aviso de privacidad").
- Un test guardián que calcula una huella del texto publicado y la compara contra la anclada para esa versión: cambiar una coma del aviso sin subir el número deja la suite en rojo.
- La ficha ya guarda `consintioAvisoVersion` junto a la fecha de consentimiento, y si el negocio reenvía tras un rechazo con el aviso ya cambiado, se anota aparte una reaceptación — sin tocar nunca la constancia original.
- Si alguien manda el formulario justo cuando el aviso cambió de versión a medio llenado, el registro no se guarda: se le repinta el aviso nuevo, se le desmarca la casilla y se le dice por qué.

## La decisión interesante

Construir el candado fue lo fácil. Lo interesante pasó al fusionarlo con `main`, que es cuando cualquier mecanismo de este tipo deja de ser una promesa en el diseño y se vuelve una prueba de fuego real.

Mientras el PR #15 estaba abierto, `main` avanzó con una corrección legal legítima de otro ticket: el aviso decía "hoy el formulario todavía no pide fotos" cuando, desde hacía días, sí las pedía. Al traer ese cambio a nuestra rama, git resolvió el archivo del texto sin ningún conflicto — las dos ediciones tocaban párrafos distintos, así que para git no había nada que decidir. Para el candado sí lo había: la huella del aviso ya no coincidía con la anclada, y la suite se puso roja exigiendo una decisión de versión sobre un cambio legal real que, de no ser por el test, habría entrado en silencio.

Poco después llegó una segunda fusión, esta vez sin nada legal de por medio: otro ticket movió las páginas públicas a una carpeta distinta del proyecto. El texto del aviso no cambió ni una letra. El candado se quedó callado, como debía — la única falla fue un test aparte que leía la ruta del archivo a mano y truena, correctamente, al no encontrarla en su lugar viejo.

Saltar cuando el texto cambia y quedarse quieto cuando no, en la misma tarde: es exactamente el comportamiento que se diseñó en el papel, comprobado contra una fusión real y no contra un caso de prueba inventado.

Hay dos piezas más detrás de ese candado que vale la pena contar. Una: cuando un negocio reenvía su registro y el aviso ya cambió, nadie puede "reaceptar" en su nombre con solo tocar el formulario — el sistema exige que la versión vigente sea **posterior** a la que el negocio aceptó originalmente, no simplemente **distinta**. La diferencia importa: si alguna vez revertimos un despliegue y la versión "vigente" retrocede, un reenvío ya no se anota como si hubiera aceptado algo "más nuevo" que en realidad es más viejo — el rollback no miente. Dos: la constancia original —fecha y versión con las que el negocio consintió la primera vez— nunca se pisa. Se guarda aparte, como un segundo registro, precisamente porque el formulario es anónimo y cualquiera podría reenviarlo; nadie ajeno al negocio puede fabricar evidencia de que "sí volvió a leer y aceptar" algo que nunca vio.

Y el detalle que más nos gustó: antes de que este change tocara siquiera `main`, el primer cambio de texto que el propio candado detectó — dentro de su propia rama, contra sí mismo — fue agregar la foto del negocio a la lista de "qué datos recogemos" del aviso. El guardián se estrenó atrapando su propia obra.

## Qué aprendimos

Que una huella de contenido atrapa lo que un `git merge` sin conflictos no puede ver: dos ediciones de texto pueden fusionarse limpio a nivel de líneas y aun así, juntas, decir algo que nadie aprobó explícitamente. El candado no reemplaza la revisión humana del texto legal — sigue habiendo pendientes por completar a mano (los placeholders del aviso) —, pero convierte "¿alguien se fijó si el aviso cambió?" en una pregunta que la máquina contesta sola, cada vez, sin depender de que alguien se acuerde de mirar.

## Siguiente paso

Todavía nadie completó los datos reales del aviso (domicilio del responsable, correo de derechos ARCO, fecha de publicación) ni encendimos la analítica cookieless que ya está en el código pero apagada — y ambas cosas, cuando pasen, van a obligar a estrenar la versión 2 de a de veras, con fichas reales ya consentidas contra la versión 1. Ese es el momento en que el candado deja de probarse a sí mismo y empieza a proteger evidencia de verdad.

---
*Tickets/PRs relacionados: T-012 · PR #15*
