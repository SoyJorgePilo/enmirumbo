# 2026-09-04 · El semáforo que le faltaba al botón de Reportar

<!-- Escrito para publicarse: un extracto de esta entrada debe poder ir tal cual a Facebook/LinkedIn/X. Tono cercano, español mexicano, sin jerga innecesaria. -->

**Hito:** con el botón "Reportar" ([PR #16](https://github.com/SoyJorgePilo/necesitouno/pull/16), T-011) ya está construida la última historia P0 del código de NecesitoUno. Queda una sola cosa pendiente de la lista imprescindible para lanzar: el ticket de preparar el deploy — que no es una funcionalidad, es subirlo.

## Qué construimos

Cada ficha pública tiene ahora un "Reportar este negocio", discreto y al final, para cuando un vecino ve que ya cerró, que los datos están mal o que de plano no es real. Lleva a un mini-formulario sin cuenta, con un motivo de lista cerrada y un comentario opcional de hasta 300 caracteres, y cae a una cola nueva en el panel del admin para que decida qué hacer.

La parte que nos costó más trabajo no se ve: el formulario es **completamente anónimo**. No pedimos nombre, no pedimos WhatsApp, y ni siquiera la IP de quien reporta se guarda en la base — se usa un instante, en memoria, solo para el límite de envíos, y se olvida. Hasta el error más tonto (subir el formulario sin elegir motivo) tuvo que resolverse sin dejar rastro: el texto que el vecino ya había escrito no podía perderse, pero tampoco podía ir en la URL, porque cualquier URL se queda para siempre en el historial del celular y en el log del proxy. Terminó en una cookie que nadie puede leer desde el navegador y que se borra sola a los 120 segundos.

## La decisión interesante

Que un reporte no guarde nada del reportante es, a la vez, un principio de privacidad y un problema de seguridad: sin nombre, sin contacto y sin IP persistida, la única defensa posible contra el abuso son tres números — un campo trampa para bots, un cupo de 3 reportes por hora por IP, y un tope de 10 reportes pendientes por negocio. Ninguno pide datos de nadie; los tres dependen de contar bien.

Y ahí es donde la auditoría de seguridad encontró el mismo error, dos veces, en dos lugares distintos del código: **comprobar y luego actuar no son un solo paso.** El código apartaba el cupo así: "cuenta cuántos hay" → espera a la base de datos → "si son menos de 10 o de 3, guarda uno más". Entre el conteo y el guardado hay un hueco microscópico donde el programa le cede el turno a otra petición — y si catorce peticiones llegan exactamente en ese hueco, las catorce ven "0 pendientes" y las catorce se guardan. Lo comprobamos con peticiones reales, simultáneas, contra el servidor corriendo: **catorce envíos a la vez dejaban 14 filas donde debían quedar 10; ocho envíos desde la misma IP pasaban los ocho donde debían pasar 3.** El tope no era un tope, era una sugerencia — y para un formulario que no tiene ninguna otra defensa (nada de contraseña, nada de cuenta), esa era la única puerta cerrada, y estaba entreabierta.

La corrección no fue "poner un candado" en el sentido usual: fue quitarle a la carrera el hueco donde vive. El tope por negocio quedó como una sola instrucción a la base de datos (el conteo y la escritura viven en la misma sentencia SQL, que SQLite ejecuta de un tirón); el cupo por IP quedó como una sola función sin ningún punto intermedio donde el programa pueda soltar el control. Es el mismo aprendizaje de un semáforo bien puesto: comprobar y apartar tienen que ser un solo acto, no dos actos que confiamos en que nadie va a alcanzar a meter algo en medio.

## Qué aprendimos

Que estos bugs son invisibles en las pruebas normales — un test que manda una petición y espera la respuesta jamás los va a encontrar, porque nunca hay dos peticiones ocupando el mismo instante. Solo aparecen simulando de verdad el peor caso: catorce conexiones tocando la puerta exactamente a la vez. Por eso la etapa de seguridad de este proyecto no se conforma con leer el código ni con el reporte del desarrollador: levanta un servidor real y dispara las peticiones simultáneas ella misma.

Y de regalo, un hallazgo incómodo sobre confiar en la documentación: un dato que viajaba "atado" a la acción del formulario tenía un comentario en el código que juraba que ese dato lo fijaba el servidor, no quien envía el formulario. Era falso — Next.js manda esos datos de ida y vuelta al navegador sin cifrar, y cualquiera puede cambiarlos antes de reenviarlos. La corrección fue simple (reconstruir la ruta desde la base de datos en vez de confiar en lo que llega), pero la lección importa más que el arreglo: un comentario que dice "esto es seguro" hay que probarlo, no creerlo — ni cuando lo escribimos nosotros mismos.

Todo esto quedó fijado en 88 pruebas adversariales que reproducen exactamente estas condiciones, para que si algún día alguien vuelve a separar el "contar" del "guardar", una prueba se ponga roja antes de que llegue a producción.

## Siguiente paso

Con el código de todas las historias P0 completo, lo que sigue es T-013: dejar el proyecto listo para el deploy real — que la base de datos funcione en Postgres además de en SQLite, documentar en un solo lugar todas las variables de entorno que hacen falta, y decidir dónde van a vivir las fotos en producción. Ahí es donde por fin dejamos de decir "en memoria del proceso, provisional a sabiendas" y el sitio se vuelve algo que un vecino de Tizayuca puede abrir de verdad.

---
*Tickets/PRs relacionados: T-011 · PR #16*
