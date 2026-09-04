# 2026-09-04 · Una foto de 123 KB que pedía 35 megas de RAM (y el techo que casi se pasa de listo)

<!-- Escrito para publicarse: un extracto de esta entrada debe poder ir tal cual a Facebook/LinkedIn/X. Tono cercano, español mexicano, sin jerga innecesaria. -->

**Hito:** T-008 quedó mergeado — NecesitoUno ya deja subir una foto del negocio desde el formulario de registro, y aparece comprimida en la tarjeta, en la ficha y en el panel del admin.

## Qué construimos

- El formulario suma un campo de foto opcional (input que abre la galería del celular, sin JavaScript de cliente nuevo) con la política del PRD como texto de ayuda: una foto del local o del trabajo, sin gente reconocible, máximo 5 MB.
- El servidor la valida por contenido —no por extensión ni por lo que diga el navegador—, la comprime a dos tamaños (uno chico para la tarjeta, uno más grande para la ficha) y le quita todos los metadatos EXIF antes de guardarla. Eso incluye el GPS: si tomaste la foto con el celular, esa foto trae la ubicación exacta de dónde se tomó, y esa ubicación no se publica ni se guarda.
- La referencia que se guarda es una clave que genera el servidor, no una URL: nada de lo que mande el cliente puede acabar sirviéndose como imagen.
- El panel del admin ve la foto del registro en revisión, y el borrado definitivo de un negocio se lleva también sus archivos.
- Llegó en dos PRs: la [#11](https://github.com/SoyJorgePilo/necesitouno/pull/11) con toda la funcionalidad, y la [#12](https://github.com/SoyJorgePilo/necesitouno/pull/12), una enmienda chica que cerró un problema legal que contamos abajo.

## La decisión interesante

Esta vez el hilo interesante no es la foto en sí, es un ataque que la auditoría de seguridad encontró y que nos tomó tres rondas cerrar bien.

El ataque es casi aburrido de lo simple que es: un PNG de un solo color, de 7300×5400 píxeles (39.4 megapíxeles, justo por debajo de nuestro tope), pesa **123 KB** porque un color plano comprime perfectísimo. Pero al abrirlo, el servidor tiene que reconstruir esos 39.4 millones de píxeles en memoria — unos 35 MB de RAM por cada envío. Nada en el formulario detecta esa foto como "rara": pasa la trampa anti-bot, pasa el cupo por IP, pasa la validación de campos, porque es una imagen válida de verdad. Con solo 12 envíos simultáneos —trivial desde una laptop, sin necesidad de nada especial— la memoria del servidor subía **429 MB**. Con 1.4 MB de subida total. Esa desproporción es la que rompe un servidor pequeño.

La primera corrección fue un semáforo: nunca más de 2 fotos procesándose al mismo tiempo, y el que no cabe se rechaza al instante en vez de esperar en una cola (una cola solo cambia el problema de memoria por uno de peticiones acumuladas). Con eso, la memoria dejó de crecer con la cantidad de gente subiendo fotos a la vez — a 50 envíos simultáneos, el delta de memoria es literalmente 0, porque nunca hay más de 2 imágenes abiertas al mismo tiempo. De paso, el dev que lo implementó se dio cuenta de que su propio código tenía un defecto que agravaba el problema: para generar las dos variantes de cada foto (tarjeta y ficha), reabría la imagen original en cada escalón de una escalera de calidad — hasta 12 veces por cada foto subida. Se corrigió para decodificar una sola vez y generar las dos variantes de ese mismo resultado.

Ahí es donde se puso interesante: en la siguiente auditoría, seguridad encontró que la corrección se había pasado de lista. El semáforo protegía **todo** el procesamiento, incluida la compresión final — y la compresión, cuando la foto es difícil de comprimir (un JPEG con mucho ruido de 1.47 MB), tarda. Con solo dos turnos disponibles, alguien mandando fotos difíciles a un ritmo de apenas **1.1 peticiones por segundo** —una sola conexión doméstica— mantenía los dos turnos ocupados para siempre. El resultado: cualquier vecino que intentara subir una foto legítima recibía "Estamos recibiendo muchas fotos, intenta de nuevo en un momento", siempre, no como aviso ocasional de un pico real sino como estado permanente del formulario. El techo que se puso para proteger memoria terminó bloqueando fotos honestas.

La medición fue la parte reveladora: del tiempo que un turno quedaba retenido, el 99% lo consumía la compresión — la parte que trabaja sobre una imagen ya reducida y que no necesita protección de memoria. Solo el 1% (decodificar el original) es lo que de verdad puede tronar un servidor. La corrección final fue angostar el semáforo para que cubra únicamente ese 1%: abrir y decodificar la imagen. La compresión corre después, libre. El resultado, medido con la misma foto difícil: el turno pasó de **1,789 ms a 13 ms**. Y con el mismo ataque sostenido de 1.1 peticiones por segundo que antes bloqueaba a todo el pueblo, ahora los envíos legítimos pasan **6 de 6, sin un solo rechazo**.

De pilón: mientras se resolvía esto, el validador se topó con que el aviso de privacidad —aprobado apenas ayer— decía textualmente "hoy el formulario todavía no pide fotos". Con T-008 mergeado, esa frase se vuelve falsa. El validador no lo corrigió por su cuenta: es texto legal fijado por una spec aprobada, y tocarlo sin pasar por el mismo proceso de aprobación sería exactamente el tipo de atajo que este pipeline existe para evitar. Abrió el PR en borrador, se enmendó la spec por la vía formal, y la corrección entró como PR #12 aparte.

## Qué aprendimos

Que arreglar un hallazgo de seguridad puede crear uno nuevo, y que la única forma de saberlo es medir las dos cosas a la vez: no basta con probar que el ataque ya no funciona, hay que probar también que el uso legítimo sigue funcionando bajo el mismo ataque. "Bloqueamos al atacante" y "seguimos sirviendo al vecino" son dos pruebas distintas, y esta vez hicieron falta las dos para encontrar que la primera solución, aunque cerraba el hueco, abría otro. Y que un agente que se niega a tocar un texto legal por su cuenta —aunque tenga la corrección enfrente— es justo el tipo de disciplina que vale más que la velocidad.

## Siguiente paso

Las fotos ya funcionan en desarrollo, pero se guardan en el disco local del servidor, que en un deploy serverless se borra en cada reinicio — así que no pueden salir a producción hasta que T-013 (preparación del deploy) resuelva dónde viven de verdad los archivos. Sigue pendiente.

---
*Tickets/PRs relacionados: T-008 · PR #11 · PR #12*
