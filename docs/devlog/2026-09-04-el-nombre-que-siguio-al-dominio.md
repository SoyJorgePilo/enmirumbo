# 2026-09-04 · El nombre que siguió al dominio

<!-- Escrito para publicarse: un extracto de esta entrada debe poder ir tal cual a Facebook/LinkedIn/X. Tono cercano, español mexicano, sin jerga innecesaria. -->

**Hito:** el sitio dejó de llamarse "NecesitoUno" y ahora es **EnMiRumbo** — dominio, header, pie, aviso de privacidad, términos y los cuatro mensajes de WhatsApp del panel, todo consistente, mergeado con PR [#25](https://github.com/SoyJorgePilo/enmirumbo/pull/25) el mismo día maratónico en que el sitio salió a internet.

## Qué construimos

El fundador compró `enmirumbo.com` y decidió algo simple: la marca sigue al dominio. Así que en vez de forzar el dominio a decir "necesitouno.com" en algún lado, el sitio entero se renombró a **EnMiRumbo**. "Rumbo" es como decimos los vecinos cuando hablamos de nuestra zona — "por mi rumbo hay una fonda buenísima" — y el nombre nuevo también sostiene algo que ya estaba en la visión: crecer a otras poblaciones sin tener que rebautizar el sitio otra vez. El relato quedó así: **"EnMiRumbo — el directorio de los negocios de tu rumbo"**.

Header, títulos, la vista previa que se ve cuando compartes un link, el aviso de privacidad, los términos, y los mensajes que le llegan al negocio y al vecino por WhatsApp — todo se revisó y se cambió donde tenía que cambiar. Una regla del fundador que se volvió pauta de diseño: "EnMiRumbo" solo, sin apellido de ciudad pegado ("EnMiRumbo Tizayuca" queda prohibido); donde hace falta contexto se escribe como descriptor, "EnMiRumbo, el directorio de negocios de Tizayuca", y solo en la primera mención de cada página. Y la línea que el fundador ama, la del pie de página, no se tocó: "Hecho para los vecinos de Tizayuca, Hidalgo." sigue exactamente igual.

## La decisión interesante

Uno pensaría que cambiarle el nombre a un sitio es un buscar-y-reemplazar. No cuando ese nombre vive dentro de un texto legal que tiene huella criptográfica.

El aviso de privacidad de EnMiRumbo no es un texto cualquiera: desde T-012 tiene un mecanismo que calcula un hash (SHA-256) del contenido exacto que se publicó, y ese hash queda anclado en una prueba. Si el texto cambia sin que alguien suba deliberadamente el número de versión, la suite se pone roja sola — es la manera en que el sistema se asegura de nunca poder decir "aceptaste la versión 2" cuando en realidad el dueño del negocio leyó y aceptó otro texto. El problema es que el nombre del sitio aparece *dentro* de ese texto versionado: en el párrafo de entrada, en la sección de quién es responsable de los datos, en el aviso simplificado del formulario. Cambiar "NecesitoUno" por "EnMiRumbo" ahí adentro cambia el texto, y cambiar el texto cambia la huella.

Había una salida barata: volver a anclar la huella de la versión 1 con el nombre nuevo, como si siempre hubiera dicho eso. Se descartó a propósito. Esa versión ya está en producción, hay negocios que la aceptaron de verdad, y reescribir en silencio lo que un dueño de negocio leyó cuando dio clic en "acepto" es exactamente el tipo de evidencia falsa que el mecanismo de T-012 se construyó para impedir. Así que en vez de eso, el aviso **estrenó versión 2**: huella nueva anclada, la evidencia de la versión 1 intacta tal como quedó el día que se publicó, y de paso se aprovechó para publicar por fin un correo de contacto real (`contacto@enmirumbo.com`) donde antes había un placeholder.

Esto también significa que si alguien tenía el formulario de registro abierto en su celular con la versión vieja del aviso cuando se hizo el despliegue, y le da "enviar" después, no se guarda nada — el sistema le dice "El aviso de privacidad cambió mientras llenabas esto. Léelo otra vez y vuelve a marcar la casilla." Ese comportamiento llevaba escrito en el código desde T-012, pero nunca se había disparado de verdad en producción. El rebrand fue quien lo estrenó.

La otra pieza que nos dio gusto construir fue un guardián automático: una prueba que revisa todo el código de las superficies del sitio y truena si encuentra "NecesitoUno" o la forma compuesta "EnMiRumbo Tizayuca" en cualquier parte. Lo probamos a propósito metiendo esas frases de vuelta en el código (por mutación, dicen los que saben) y confirmamos que sí muerde, señalando archivo y línea exacta. Eso nos salvó horas más tarde: T-014, que se había mergeado apenas unas horas antes con mensajes nuevos del panel, traía el nombre viejo metido en seis lugares que nadie había tocado a propósito — los cazó el guardián solo, con archivo y línea, sin que tuviéramos que peinar el código a mano.

Y una cosa que decidimos no hacer: no reescribimos la historia. Los devlogs viejos y los ADR anteriores siguen diciendo "NecesitoUno" porque así se llamaba el sitio cuando se escribieron. Historia es historia.

## Qué aprendimos

Que la parte "aburrida" de un rebrand —el texto legal— es la que de verdad importa cuando el sitio maneja datos de negocios reales. Cambiar un logo es gratis; cambiar un párrafo que alguien ya aceptó tiene consecuencias legales, y el sistema que construimos en T-012 estaba diseñado exactamente para este momento, aunque cuando lo escribimos no sabíamos que sería un rebrand el que lo iba a poner a prueba por primera vez de verdad.

También aprendimos que un guardián automático vale más que la memoria de cualquiera: entre el ticket que renombra el sitio y el ticket que agrega mensajes nuevos al panel, que se mergearon el mismo día con horas de diferencia, era prácticamente seguro que algo se les iba a pasar. Y algo se les pasó. Pero el CI lo atrapó antes de que llegara a producción, con el archivo y la línea exactos, en vez de que lo descubriera un vecino leyendo un WhatsApp con el nombre viejo.

## Siguiente paso

Con el sitio ya en internet y ahora con el nombre correcto en todas sus superficies, sigue cerrar el buzón `contacto@enmirumbo.com` como canal de derechos ARCO de verdad (ya publicado en el aviso, pendiente del lado del fundador) y consolidar en `openspec/specs/` los deltas de T-014 y T-019 juntos, en ese orden, para que la spec de revisión del panel no pierda el enlace de gestión que T-014 le sumó. En paralelo siguen su curso T-018 (listado completo del panel) y T-016 (verificación por SMS tras bandera).

---
*Tickets/PRs relacionados: T-019 · T-014 · T-012 · PR #25*
