# Diseño: agregar-listado-gestion-panel

Tres decisiones que no se leen solas en la spec.

## 1. "Despublicada" se muestra como etiqueta, no como filtro

El modelo tiene tres estados (`en_revision | publicado | rechazado`) y despublicar deja la ficha en `en_revision` con `despublicadoEn` y `motivoDespublicacion` escritos (`modelo-datos`, requirement "El negocio guarda el rastro de su despublicación"). "Despublicada" es entonces una lectura derivada: `estado = en_revision` **y** `despublicadoEn` más reciente que `registradoEn` —exactamente la condición que ya calcula `obtenerColaDeRevision` para pintar "Ya estaba publicada, la despublicaste"—.

Se eligió reutilizar esa etiqueta en el renglón y dejar los filtros en los tres estados reales porque:

- el admin ya aprendió ese lenguaje en la cola; dos vocabularios para el mismo hecho es peor que uno;
- un cuarto filtro obliga a comparar dos columnas dentro de una consulta paginada (SQL a mano, porque no es un `where` que Prisma exprese directo), y a decidir si "En revisión" entonces excluye a las despublicadas — con lo que un registro dejaría de estar en el filtro de su propio estado;
- inventar un estado `despublicado` en la base sería una migración y un cambio de invariantes que el ticket no pide y que rompería los CHECK y las transiciones condicionadas de T-005/T-015.

Si el fundador quiere el filtro propio (duda 1 de la propuesta), la vía barata es una opción extra que filtre por `estado = en_revision` y `despublicadoEn NOT NULL`, aceptando que la ficha aparezca en dos filtros.

## 2. El listado ordena por `registradoEn` y la cola sigue con su reloj

La cola ordena por `max(registradoEn, despublicadoEn)` y lo hace **en memoria**, con la justificación explícita de que son decenas de filas (el pendiente de un solo admin). El listado no puede asumir eso: existe justamente para cuando haya cientos de fichas publicadas, y su requisito es "no se degrada".

Por eso el orden del listado es una columna: `registradoEn` descendente, con el identificador como desempate estable (sin desempate, dos filas con la misma fecha pueden intercambiarse entre consultas y un registro aparece dos veces o se pierde al pasar de página). La consecuencia visible —una ficha vieja despublicada ayer no salta al principio— se compensa mostrando en cada renglón la fecha por la que se ordena: el orden queda explicado en pantalla, sin reglas invisibles. Es la duda 2 de la propuesta.

## 3. Páginas de 25 con `skip`/`take`, no keyset ni scroll infinito

`skip`/`take` (LIMIT/OFFSET) es lo más simple que cumple: el navegador solo recibe su página, los enlaces son URLs compartibles y recargables, y no hace falta JavaScript. Su defecto conocido —el costo del OFFSET crece con la página— es irrelevante en el orden de magnitud del proyecto (un directorio municipal, miles de fichas en el mejor de los casos) y se cambiaría por paginación por cursor sin tocar la spec, porque la spec habla de páginas y enlaces, no del mecanismo.

Se descartó el scroll infinito por dos razones que no son de gusto: exige JavaScript de cliente en un panel que tiene prometido funcionar sin él, y no da una URL a la que volver.

25 es un scroll razonable a 390px y deja el HTML chico; el número vive en una sola constante para poder ajustarlo (duda 3 de la propuesta).
