# 2026-09-04 · El aviso que prometía de más: cuando el texto legal se audita como si fuera código

<!-- Escrito para publicarse: un extracto de esta entrada debe poder ir tal cual a Facebook/LinkedIn/X. Tono cercano, español mexicano, sin jerga innecesaria. -->

**Hito:** con T-007 (PR [#9](https://github.com/SoyJorgePilo/necesitouno/pull/9)) mergeado, NecesitoUno ya tiene sus dos páginas legales — `/aviso-de-privacidad` y `/terminos` — y el aviso simplificado del formulario por fin le dice al negocio, de frente, que su WhatsApp va a quedar público.

## Qué construimos

- **`/aviso-de-privacidad`**: los seis elementos mínimos que pide la LFPDPPP — quién es el responsable, qué datos recogemos, para qué, qué queda público y qué no, cómo limitar su uso, derechos ARCO en ≤20 días hábiles y cómo cambia el aviso — redactado completo, no relleno.
- **`/terminos`**: el directorio se declara intermediario informativo (no responde por lo que pase entre vecino y negocio), explica qué significa el sello "Negocio verificado" (que el número existe, no que el negocio sea confiable) y publica tal cual las cinco reglas de moderación del PRD.
- **El footer estrena sus dos enlaces** — el espacio que quedó reservado desde el layout base ya no apunta a la nada.
- **El aviso simplificado del formulario se reescribió**: ya no promete "aquí va a estar el enlace" a futuro, dice de forma llana que el nombre, el WhatsApp, el teléfono y lo demás quedan a la vista de cualquiera, y enlaza al aviso completo.
- Siete datos que solo puede dar una persona (domicilio del responsable, correo ARCO, WhatsApp del directorio, jurisdicción, entre otros) quedan como placeholders visibles entre corchetes, con una marca de "esto sigue siendo borrador" arriba de las dos páginas que desaparece sola el día que se llenen y pase la revisión legal profesional — que sigue siendo un paso humano, no algo que un agente pueda resolver.

## La decisión interesante

Lo más incómodo de esta corrida no fue código: fue que el aviso de privacidad, tal como lo redactamos primero, prometía algo que el sistema no puede cumplir. Decía que si tu registro "no se publicó", tus datos se borran a los 90 días. Suena razonable — hasta que se compara con lo que el modelo de datos realmente sabe hacer: el único reloj que existe es la fecha de rechazo, y esa fecha se queda vacía mientras la ficha sigue esperando revisión. "No publicado" incluye tanto los rechazados como los que llevan semanas atorados en la cola sin que nadie los atienda. Y para colmo, los propios términos —en el mismo sitio— decían algo distinto: que el borrado era solo para los rechazados. El sitio se contradecía a sí mismo, y encima ninguna de las dos versiones tenía una purga automática detrás: no existe un solo `delete` de negocios en todo el código.

La auditoría de seguridad lo encontró leyendo el texto legal exactamente como lee un endpoint: comparando cada frase contra lo que el esquema de la base de datos puede sostener, no contra si "sonaba bien". El escenario que armó fue simple y efectivo — alguien registra su negocio un lunes, el admin se atrasa, la ficha se queda en revisión, y a los 91 días el dueño cree que sus datos ya no existen porque el aviso se lo prometió. Pero siguen ahí, intactos. Publicar un plazo de borrado que el sistema no puede cumplir no es un detalle de redacción: es incumplir el propio aviso.

La corrección fue acotar la promesa a lo que sí es cierto — "si rechazamos tu registro, sus datos se eliminan a los 90 días" — y declarar aparte, en el código, los dos compromisos operativos que el texto ya no promete como automáticos: el flujo de derechos ARCO en el panel y la purga misma, ninguno de los dos con pantalla todavía. Y para que la corrección no fuera solo de palabras, el validador comparó el texto final, byte por byte, contra lo que la spec aprobó: el aviso, los términos y el aviso simplificado del formulario coincidieron carácter por carácter con lo que se había autorizado publicar.

Ahí quedó el principio que nos gustó de esta entrega: en un directorio que maneja datos de negocios reales, el aviso de privacidad se audita con el mismo rigor que un endpoint, no se redacta una vez y se archiva.

## Qué aprendimos

Que el riesgo más caro de una página "solo de contenido" no es que tenga un bug — es que le mienta al usuario sin que nadie se dé cuenta, porque nada truena, el build pasa y el texto se ve bien. Y que declarar en el código lo que todavía falta por resolver (quién purga los rechazados, cómo se atiende una solicitud ARCO) es más honesto que dejarlo implícito: si algún día ese texto se vuelve a desviar de lo que el sistema hace de verdad, hay algo contra qué compararlo.

## Siguiente paso

Quedan siete placeholders y dos pendientes operativos (el flujo ARCO en el panel y la purga automática de rechazados) como los criterios que hay que resolver antes de quitar la marca de borrador y lanzar de verdad — eso, junto con la revisión legal profesional, es trabajo humano y no bloquea seguir construyendo. Con el formulario, el directorio, el panel, el buscador y ahora lo legal en pie, T-008 (foto del negocio) es lo que sigue en la fila.

---
*Tickets/PRs relacionados: T-007 · PR #9*
