# 2026-09-04 · Dos puertas nuevas, y la fuga que cazamos primero

<!-- Escrito para publicarse: un extracto de esta entrada debe poder ir tal cual a Facebook/LinkedIn/X. Tono cercano, español mexicano, sin jerga innecesaria. -->

**Hito:** el panel de administración ganó sus dos puertas que le faltaban — el negocio ya edita su propia ficha con un enlace secreto, y el admin ya ve y gestiona cualquier negocio publicado sin adivinar URLs — y la más grande de las dos casi se estrena con una fuga de ese mismo secreto hacia un tercero, cerrada antes de que llegara a producción.

## Qué construimos

La pregunta que destapó la primera puerta la hizo el fundador, viendo el panel de verdad: "¿y aquí dónde borro un negocio ya publicado?". La respuesta honesta era: en ningún lado, salvo que alguien adivinara el id al final de `/admin/registros/<id>`. El panel solo mostraba la cola de pendientes y los reportados — un negocio publicado y sin reportes era, en la práctica, invisible. T-018 le puso a eso una vista de "Todos los negocios", con cualquier estado, lo más reciente arriba, paginada para que no se caiga con muchos registros, y sin una sola línea de JavaScript nuevo.

La segunda puerta es la feature más grande que hemos construido hasta hoy: el enlace de gestión. Al aprobar un negocio, el sistema genera un token de 256 bits — 32 bytes al azar, imposible de adivinar — y se lo entrega al admin una sola vez, dentro del mensaje de WhatsApp que el panel arma justo después de aprobar. Ese mensaje es el único lugar donde el token existe en claro: la base de datos solo guarda su huella (SHA-256); si el admin pierde ese mensaje, no hay forma de recuperarlo, hay que regenerar. Con ese enlace, el dueño del negocio edita su ficha cuando quiera desde su celular, sin cuenta ni contraseña — y sus cambios nunca tocan la ficha pública directamente: crean una revisión pendiente que entra a la cola del admin, exactamente como una alta nueva. La ficha que ve un vecino nunca cambia sin que alguien la revise primero.

## La decisión interesante

La auditoría de seguridad encontró algo que ni el diseño ni la primera revisión habían visto: el token se estaba fugando por la analítica. Cada evento que mide el sitio manda el `pathname` de la página, y la ruta de edición es literalmente `/editar/<token>` — ahí el pathname ES el secreto. Cualquiera con acceso al panel del proveedor de analítica podía leer los enlaces de gestión de negocios ajenos.

El arreglo no fue añadir esa ruta a una lista de exclusiones (una lista es una promesa de que alguien se va a acordar de actualizarla). Fue sacar la ruta del grupo de páginas que sí se miden, el mismo mecanismo con el que el panel `/admin` ya había quedado invisible para el proveedor semanas atrás: una pantalla nueva nace excluida por dónde vive en el código, no porque alguien la haya recordado.

Y ahí vino la segunda vuelta, que no la pidió nadie: al verificar su propio arreglo, el dev encontró que la política más estricta posible (`no-referrer`, "no mandes ni el origen") rompía el formulario cuando no hay JavaScript — que es justo el camino que esta feature promete para el dueño de un negocio abriendo su enlace con mala señal en el celular. Con `no-referrer`, el navegador manda `Origin: null` al enviar el formulario, y el servidor rechaza la Server Action con un error. El arreglo honesto no fue el más estricto en el papel, fue el correcto en el comportamiento: `strict-origin`, que manda el origen pelado pero nunca la ruta — la fuga sigue cerrada, y el formulario sin JavaScript sigue funcionando. No fue una decisión improvisada: es la misma tensión que el panel ya había resuelto antes con el mismo valor, y esta vez quedó escrita como regla ("oculta la ruta, conserva el origen") en vez de como un valor suelto, para que a nadie se le ocurra "endurecerla" después y repetir el apagón.

Dos vueltas de auditoría y 80 pruebas adversariales nuevas para cerrar esa feature. La otra puerta, la del listado del admin, pasó limpia a la primera con 82 pruebas adversariales sobre una base de datos instrumentada — un recordatorio de que el riesgo no siempre está donde parece: la pantalla de solo lectura salió sin nada que corregir, y la que de verdad mueve datos ajenos fue la que necesitó dos rondas.

Las dos features se validaron de la misma forma: no leyendo los reportes de las etapas anteriores, sino ejecutando los flujos reales contra el sitio servido — para el listado, entrando al panel con una cookie de sesión firmada a mano para confirmar que sin sesión redirige y con sesión no hay ni un botón de más; para el enlace de gestión, corriendo las funciones de producción contra la base de datos para comprobar que la huella guardada es exactamente el hash del token, que aprobar dos veces no cambia nada, y que regenerar mata de verdad el enlace anterior.

## Qué aprendimos

Que cerrar una fuga de privacidad con la opción más estricta del catálogo no es automáticamente lo correcto — hay que medir el arreglo contra el otro requirement que ya estaba aprobado, no dar por hecho que "más estricto" es sinónimo de "mejor". Ya nos había pasado antes con el panel; que nos volviera a pasar con el enlace de gestión, y que esta vez se resolviera en una sola vuelta con una regla escrita en vez de en tres intentos, es la señal de que documentar el *porqué* de una decisión de seguridad vale tanto como la decisión misma.

## Siguiente paso

Con las dos puertas del panel ya abiertas, queda pendiente el buscador dentro del panel (hoy sigue habiendo que desplazarse por la lista completa para llegar a un negocio) y la purga de las ediciones resueltas, que hoy se quedan guardadas sin fecha de caducidad — deuda que la propia auditoría de este change dejó anotada. En paralelo sigue en cola el rebrand a EnMiRumbo (T-019, spec ya aprobada), para que el sitio deje de decir un nombre que ya no es el dominio.

---
*Tickets/PRs relacionados: T-014 · T-018 · PR #23 · PR #24*
