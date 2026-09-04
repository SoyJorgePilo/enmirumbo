# 2026-09-03 · La IP que elegía el atacante

<!-- Escrito para publicarse: un extracto de esta entrada debe poder ir tal cual a Facebook/LinkedIn/X. Tono cercano, español mexicano, sin jerga innecesaria. -->

**Hito:** NecesitoUno ya tiene formulario público de registro (T-003, PR [#5](https://github.com/SoyJorgePilo/necesitouno/pull/5)) — y la etapa de seguridad del pipeline se ganó el sueldo por primera vez encontrando un hueco de verdad antes de que llegara a producción.

## Qué construimos

Antes de esto, saldamos una deuda chica que había quedado pendiente del checkpoint pasado (PR [#4](https://github.com/SoyJorgePilo/necesitouno/pull/4), un `.env.example` que no estaba donde el `.gitignore` lo esperaba).

Y con eso limpio, entró lo que de verdad se nota: cualquier negocio de Tizayuca puede entrar a `/registro` desde su celular y darse de alta solo — nombre, categoría, WhatsApp, colonia y el resto de los campos del PRD, en una sola pantalla, sin cuentas, sin captcha visible. Al enviar, la ficha queda en `en_revision` esperando que el admin la verifique por WhatsApp antes de publicarla, y la persona ve la pantalla de gracias. Funciona incluso sin JavaScript en el navegador (probamos con `curl` directo).

Es la primera superficie del proyecto que recibe datos personales de un tercero real (aunque hoy solo la estemos probando con datos ficticios) en un repo que es público. Eso le subió el listón a todo lo demás.

## La decisión interesante

Hasta ahora, cada corrida del pipeline había pasado la etapa de seguridad en limpio a la primera. Esta fue la primera que no: 1 hallazgo alto y 6 medios, una vuelta completa de ida y regreso entre desarrollo y seguridad antes de que quedara aprobado.

El hallazgo alto era el que importaba de verdad: para frenar abuso (alguien inundando la cola con altas falsas, o usando el mensaje de "este número ya está registrado" para adivinar qué negocios reales existen), el formulario limita cuántas veces se puede enviar desde la misma IP por hora. El problema es de dónde sacábamos esa IP — del encabezado `x-forwarded-for`, que en muchas configuraciones de proxy es el propio navegador (o cualquier script) quien lo escribe. Es decir: el atacante no solo podía evadir el límite, podía *elegir su propia llave de cupo* — cambiar el encabezado en cada envío y tener, en la práctica, cupo infinito.

La corrección no fue agregar más candados, fue quitarle al cliente el control de cuál candado le toca: ahora la IP se lee de un único encabezado declarado explícitamente por configuración (según cómo se despliegue), se valida que de verdad parezca una IP antes de usarla, y si esa configuración no existe, el sistema falla seguro — sin cupo en vez de con un cupo falso — y lo avisa en el log. Encontramos también, en el mismo barrido, que un envío crudo (sin pasar por el navegador) podía dejar registrada una "constancia de consentimiento" LFPDPPP aunque la casilla nunca se hubiera marcado — corregido exigiendo un valor afirmativo real, no solo que el campo exista.

Que la etapa de seguridad haya regresado el trabajo por primera vez no es una falla del proceso: es la prueba de que el proceso hace lo que prometimos que haría. Y el validador, en la compuerta final, no se conformó con leer los reportes: volvió a atacar el sitio corriendo en vivo con `curl` — envíos crudos con campos que el cliente no debería poder controlar, con el checkbox vacío, con el encabezado de IP falsificado — para confirmar con sus propios ojos que lo que decía el reporte de seguridad era cierto.

## Qué aprendimos

Que confiar en un dato que el cliente puede escribir —aunque tenga forma de "dato técnico" y no de "campo del formulario"— es el mismo error de fondo que confiar en lo que manda el navegador para nombre o WhatsApp. La spec ya nos había enseñado eso; la infraestructura anti-abuso lo tuvo que aprender aparte. Y que verificar en capas —seguridad revisa el código, el validador ataca el sistema corriendo— sí atrapa cosas distintas: dos riesgos residuales del límite por IP (qué pasa si nunca se configura el encabezado, qué pasa si el hosting encadena varios proxies) quedaron documentados con dueño explícito para cuando se decida dónde vive el sitio en producción (E0-3), en vez de perderse entre reportes.

## Siguiente paso

Sigue E1-3: la foto del negocio desde el formulario de registro, comprimida en el servidor — la última pieza que le falta a la experiencia de alta antes de que el directorio empiece a recibir negocios de verdad.

---
*Tickets/PRs relacionados: T-003 · PR #4 · PR #5*
