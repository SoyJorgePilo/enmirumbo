# 2026-09-04 · El referente que delataba al panel

<!-- Escrito para publicarse: un extracto de esta entrada debe poder ir tal cual a Facebook/LinkedIn/X. Tono cercano, español mexicano, sin jerga innecesaria. -->

**Hito:** el directorio ya mide. Sin banner de cookies, sin dato personal en los eventos y con el panel de administración completamente invisible para el proveedor.

## Qué construimos

Hasta ayer el sitio estaba completo —registro, listados, ficha, buscador, panel— pero no podíamos contestar ninguna de las preguntas que de verdad importan: ¿cuánta gente ve una ficha? ¿cuántos le dan clic a WhatsApp? ¿cuántos registros se completan de principio a fin? El PRD las pide desde el día uno porque son las que van a decidir si el MVP sigue como está o cambia de rumbo.

Conectamos Umami (proveedor cookieless, sin banner de consentimiento) con cuatro eventos: clic a WhatsApp desde la tarjeta y desde la ficha, clic a "Llamar" y clic a "Cómo llegar", cada uno con la categoría y la colonia del negocio y nada más. El embudo del registro se mide con dos vistas de página (`/registro` y `/registro/gracias`), no con el botón, porque un clic con errores de validación no es un registro completado. Y todo esto sin una sola línea de JavaScript propio: son atributos `data-umami-event` en componentes de servidor.

Si no hay cuenta configurada, el sitio no manda ni un byte a ningún lado. Eso lo medimos, no lo prometimos: comparamos el paquete que le llega al navegador con las variables puestas y sin ellas, y son **idénticos, 601,181 bytes**, cero archivos con la palabra "umami" adentro. El día que alguien cree la cuenta y pegue las dos variables, empieza a medir sin tocar código ni redesplegar nada más.

## La decisión interesante

La parte que costó no fue conectar el script — fue sacar al panel de la medición sin dejar un hueco.

La primera versión parecía sólida: el panel vive fuera del grupo de rutas donde se inyecta el script, así que nunca carga el tracker. Verificado y cierto. Pero la auditoría de seguridad encontró algo que el diseño no había considerado: cada evento que el tracker manda incluye el **referente** — la página desde donde llegaste — y cuando ese referente es del mismo sitio, lo reenvía completo como ruta. Si un admin está revisando el registro de una persona en `/admin/registros/<id>` y abre el sitio público en otra pestaña (el clic de siempre en el logo o en "Aviso de privacidad"), esa navegación sí es de documento normal, y el proveedor recibe `/admin/registros/<id>` como dato. Sin querer, estábamos filtrando la URL de un expediente concreto a un tercero.

El arreglo obvio fue cerrar el referente con `no-referrer` en el layout del panel. Cerró la fuga —lo confirmamos en Chrome real, con dos páginas y la meta puesta y quitada—. Pero de paso rompió algo que sí era un requirement aprobado: el panel tiene que funcionar sin JavaScript, porque el flujo central es aprobar un negocio desde un celular con la señal mala. Y resulta que un documento con `no-referrer` hace que el navegador mande `Origin: null` en cualquier envío de formulario nativo, y Next rechaza con 500 cualquier Server Action cuyo origen no calce con el host. Cerramos una fuga y abrimos un apagón del panel en el camino que más importa.

El arreglo del arreglo fue cambiar el valor, no el mecanismo: `strict-origin`. Con ese valor el referente que sale es el origen pelado (`https://sitio/`), nunca la ruta, así que la fuga sigue cerrada — y el `Origin` del formulario llega intacto, así que el panel vuelve a funcionar sin JavaScript. Lo medimos en una matriz de tres políticas contra dos comportamientos, en Chrome, no lo dedujimos de la documentación. Tres iteraciones para fijar el valor correcto de una sola línea de metadata — y las tres dejaron rastro en tests, no solo en el código: la regla que quedó no es "usa esta cadena", es la invariante ("oculta la ruta, conserva el Origin") con la lista completa de valores prohibidos y el motivo escrito al lado, para que nadie la "endurezca" sin darse cuenta y reintroduzca el mismo apagón.

## Qué aprendimos

Que "excluir el panel de la medición" tiene más canales de los que parece a simple vista: el script es uno, pero el referente es otro, y el título de la página es un tercero (por eso `/buscar` ahora tiene un título fijo — para que el término que escribe el vecino no viaje en el `<title>`). Cada canal hay que auditarlo por separado; ninguno se cierra "por analogía" con el anterior.

También aprendimos, otra vez, que el arreglo rápido de un hallazgo de seguridad puede abrir uno nuevo, y que la única forma honesta de saberlo es medir el arreglo contra el mismo escenario que rompía antes — no razonar que "ya quedó". Las tres iteraciones no fueron indecisión: fueron el precio de no dar nada por bueno de segunda mano.

## Siguiente paso

Falta el paso humano: crear la cuenta en Umami, pegar las dos variables de entorno y redesplegar — hasta entonces el sitio sigue sin mandar un solo byte a nadie. Con la cuenta conectada, toca también probar el botón "Llamar" en un celular real y entrar al panel con el JavaScript deshabilitado, para confirmar en producción lo que ya medimos en local.

---
*Tickets/PRs relacionados: T-010 · PR #14*
