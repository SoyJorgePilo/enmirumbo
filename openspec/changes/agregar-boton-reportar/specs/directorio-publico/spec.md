# Delta: directorio-publico — botón "Reportar" en la ficha

## ADDED Requirements

### Requirement: Control discreto "Reportar este negocio" en la ficha

Cada ficha publicada DEBE ofrecer un control con el texto literal "Reportar este negocio" que lleve al mini-formulario de reporte (PRD §6.3). El control DEBE ir **después** de los botones de contacto, al final de la ficha, y presentarse en jerarquía visual claramente menor que "Enviar WhatsApp": ni verde de acción, ni tamaño de botón principal, ni nada que lo haga competir con el contacto, que sigue siendo la única acción principal de la página. Su etiqueta accesible DEBE nombrar al negocio, para que quien navega con lector de pantalla sepa qué ficha está reportando. El control DEBE tener un área táctil de al menos 44px en su dimensión menor. El control NO DEBE aparecer en las tarjetas del listado por categoría ni en las de la página de resultados: reportar es un acto deliberado sobre una ficha concreta.

#### Scenario: la ficha ofrece reportar sin robarle el lugar a WhatsApp

- **WHEN** el vecino abre la ficha de un negocio publicado
- **THEN** ve "Reportar este negocio" al final de la página, después de los botones de contacto, con menos peso visual que "Enviar WhatsApp", que sigue siendo el control más prominente de la ficha

#### Scenario: tocar el control abre el formulario de reporte

- **WHEN** el vecino toca "Reportar este negocio" en la ficha de "Tacos del Güero"
- **THEN** llega al mini-formulario de reporte de ese negocio, sin salir del sitio y sin que se le pida ninguna cuenta

#### Scenario: etiqueta accesible con el nombre del negocio

- **WHEN** alguien recorre la ficha con lector de pantalla
- **THEN** el control se anuncia indicando a qué negocio reporta, no solo como "Reportar"

#### Scenario: reportar no está en las tarjetas

- **WHEN** se revisan el listado por categoría y la página de resultados
- **THEN** ninguna tarjeta muestra un control de reportar

### Requirement: Mini-formulario de reporte sin cuenta, con motivo de lista cerrada y comentario opcional

El reporte DEBE resolverse en una página propia bajo la ficha del negocio, sin cuentas, sin registro y sin JavaScript de cliente (formulario resuelto por el servidor). La página DEBE encabezarse con el texto literal "Reportar este negocio" como único `h1`, mostrar el nombre del negocio que se está reportando —como texto, tal como lo capturó el negocio— y explicar con el texto literal "Dinos qué pasa y lo revisamos. No te pedimos ningún dato tuyo." El formulario DEBE tener:

- Un grupo de opciones **de lista cerrada** bajo el rótulo literal "¿Qué pasa?", con exactamente estas cuatro y ninguna más: "Ya cerró", "No es real", "Los datos están mal" y "Contenido ofensivo o inapropiado". Ninguna DEBE venir marcada por defecto.
- Un comentario **opcional** bajo el rótulo literal "¿Nos quieres contar más? (opcional)", acotado a 300 caracteres, con la ayuda visible "Máximo 300 caracteres."
- Un botón de envío con el texto literal "Enviar reporte".

La página DEBE declarar `noindex` en su metadata de robots. Si el negocio no existe o no está en estado `publicado`, la página DEBE responder 404 —la misma página y el mismo código que una ficha inexistente—, sin delatar que existe una ficha en revisión o rechazada. La página DEBE ofrecer también una vuelta a la ficha con el texto literal "Volver a la ficha".

#### Scenario: formulario de reporte completo

- **WHEN** el vecino llega al formulario de reporte de "Tacos del Güero"
- **THEN** ve el encabezado "Reportar este negocio", el nombre del negocio, la frase "Dinos qué pasa y lo revisamos. No te pedimos ningún dato tuyo.", las cuatro opciones de "¿Qué pasa?" sin ninguna marcada, el campo "¿Nos quieres contar más? (opcional)" con su ayuda "Máximo 300 caracteres." y el botón "Enviar reporte"

#### Scenario: el reporte funciona sin JavaScript

- **WHEN** el vecino elige un motivo y envía el reporte con el JavaScript de cliente deshabilitado
- **THEN** el reporte se procesa igual, porque el formulario es un envío resuelto por el servidor

#### Scenario: reportar un negocio que no está publicado

- **WHEN** alguien abre la página de reporte de un negocio en `en_revision`, `rechazado` o de un identificador que no existe
- **THEN** ve la página 404 en español con código 404, idéntica en los tres casos, y ningún dato del negocio aparece en la respuesta

#### Scenario: la página de reporte no se indexa

- **WHEN** un buscador rastrea la página de reporte de cualquier ficha
- **THEN** encuentra la instrucción de no indexarla

### Requirement: El servidor valida el motivo y el comentario del reporte

Toda la validación del reporte DEBE ocurrir en el servidor, porque el formulario funciona sin JavaScript y porque un envío puede llegar directo, sin pasar por la página. El motivo DEBE pertenecer a la lista cerrada: un envío sin motivo, con un motivo vacío o con un valor que no está en la lista NO DEBE guardar nada y DEBE devolver el formulario con el texto literal "Dinos qué pasa con este negocio", conservando el comentario que ya se había escrito. El comentario DEBE tratarse siempre como texto plano —nunca se interpreta como marcado, ni al guardarse ni al mostrarse— y DEBE rechazarse si pasa de 300 caracteres, con el texto literal "El comentario es muy largo (máximo 300 caracteres)". Un comentario vacío o de puros espacios DEBE guardarse como "sin comentario", no como una cadena de espacios. Si el reporte no se puede guardar por una falla del servidor, el vecino DEBE ver el texto literal "No pudimos enviar tu reporte. Vuelve a intentarlo en un momento." sin ningún detalle técnico.

#### Scenario: envío sin elegir motivo

- **WHEN** el vecino toca "Enviar reporte" sin marcar ninguna opción
- **THEN** no se guarda ningún reporte y ve "Dinos qué pasa con este negocio", con el comentario que había escrito todavía en el campo

#### Scenario: motivo fuera de la lista

- **WHEN** llega directamente al servidor un envío con un motivo inventado que no está en la lista cerrada
- **THEN** no se guarda ningún reporte y la respuesta es el mismo error de motivo, sin error del servidor

#### Scenario: comentario demasiado largo

- **WHEN** el envío trae un comentario de más de 300 caracteres
- **THEN** no se guarda ningún reporte y el vecino ve "El comentario es muy largo (máximo 300 caracteres)"

#### Scenario: comentario que parece marcado

- **WHEN** alguien envía como comentario `<script>alert(1)</script>` con un motivo válido
- **THEN** el reporte se guarda con ese texto tal cual y, cuando el admin lo lee en el panel, lo ve como texto plano: ninguna etiqueta se interpreta en ninguna pantalla

#### Scenario: comentario de puros espacios

- **WHEN** el vecino envía un motivo válido y un comentario de puros espacios
- **THEN** el reporte queda guardado sin comentario, no con una cadena de espacios

### Requirement: El envío del reporte confirma en español llano y no delata nada

Un reporte aceptado DEBE confirmarse con el texto literal "¡Gracias por avisarnos! Vamos a revisar este negocio." y una vuelta a la ficha con el texto literal "Volver a la ficha". La confirmación NO DEBE decir cuántos reportes tiene ese negocio, ni si ya lo habían reportado, ni qué va a pasar con la ficha, ni prometer respuesta a quien reportó (que es anónimo y no dejó forma de contacto). Recargar la pantalla de confirmación NO DEBE crear otro reporte.

#### Scenario: reporte enviado

- **WHEN** el vecino elige "Ya cerró" y toca "Enviar reporte"
- **THEN** ve "¡Gracias por avisarnos! Vamos a revisar este negocio." y el enlace "Volver a la ficha", que lo regresa a la ficha del negocio

#### Scenario: la confirmación no cuenta nada del negocio

- **WHEN** un vecino reporta un negocio que ya tenía reportes pendientes
- **THEN** ve exactamente la misma confirmación que si fuera el primero, sin conteos ni pistas de lo que el admin vaya a hacer

#### Scenario: recargar la confirmación no duplica

- **WHEN** el vecino recarga la pantalla de confirmación
- **THEN** no se crea ningún reporte adicional

### Requirement: Anti-abuso del reporte sin captcha: honeypot, cupo por IP y tope de pendientes por negocio

El formulario de reporte DEBE protegerse contra envíos automatizados sin captcha y sin fricción (PRD §8), con tres defensas:

1. **Campo trampa (honeypot)** invisible para las personas y no anunciado por lectores de pantalla: un envío con ese campo lleno NO DEBE guardar nada y DEBE mostrar exactamente la misma confirmación que un reporte legítimo, para no delatar la trampa.
2. **Cupo por IP**: 3 reportes por hora desde la misma IP. Al agotarlo, el envío NO DEBE guardar nada y el vecino DEBE ver el texto literal "Ya recibimos varios reportes desde aquí. Espera un rato y vuelve a intentar." La IP se lee con la misma política de encabezado declarado que ya usa el registro: si el despliegue no declara cuál es el encabezado de confianza, NO se confía en ningún encabezado y este cupo simplemente no opera, quedando las otras dos defensas. El cupo de reportes DEBE ser un contador propio: agotarlo NO DEBE impedir registrar un negocio, ni al revés.
3. **Tope de reportes pendientes por negocio**: cuando un negocio ya acumula 10 reportes sin atender, los envíos siguientes sobre esa misma ficha NO DEBEN guardarse; quien reporta DEBE ver la misma confirmación de siempre, porque el negocio ya está señalado y nada se pierde al no apuntarlo otra vez.

Ningún envío bloqueado por cualquiera de las tres defensas DEBE escribir nada en la base ni dejar en el log del servidor el contenido del reporte.

#### Scenario: bot que llena el honeypot

- **WHEN** un envío de reporte llega con el campo trampa lleno
- **THEN** no se guarda ningún reporte y quien envió ve la misma confirmación que un reporte legítimo

#### Scenario: cupo por IP agotado

- **WHEN** desde la misma IP llega un cuarto reporte dentro de la misma hora
- **THEN** no se guarda nada y el vecino ve "Ya recibimos varios reportes desde aquí. Espera un rato y vuelve a intentar."

#### Scenario: sin encabezado de IP declarado

- **WHEN** el servidor corre sin la variable que declara el encabezado de confianza y llegan muchos reportes
- **THEN** el cupo por IP no bloquea a nadie (no se confía en un encabezado que escribe quien envía), pero el honeypot y el tope por negocio siguen operando

#### Scenario: el cupo de reportes no consume el de altas

- **WHEN** un vecino agota su cupo de reportes de la hora y enseguida registra un negocio desde la misma IP
- **THEN** el registro se procesa con normalidad, porque cada cupo lleva su propio conteo

#### Scenario: negocio con el tope de pendientes alcanzado

- **WHEN** un negocio ya tiene 10 reportes sin atender y llega otro reporte sobre esa misma ficha
- **THEN** no se guarda un reporte nuevo y quien reportó ve la confirmación de siempre, sin enterarse del tope

#### Scenario: el honeypot no molesta a las personas

- **WHEN** un vecino llena el formulario con teclado o con autocompletado del navegador
- **THEN** el campo trampa permanece vacío y su reporte se procesa normalmente

### Requirement: Del reportante no se pide ni se guarda ningún dato

El formulario de reporte NO DEBE pedir nombre, teléfono, correo ni ningún otro dato de quien reporta, y el sistema NO DEBE guardar ninguno: lo único que se persiste de un reporte es el negocio al que apunta, el motivo, el comentario opcional, su estado y sus fechas. La IP se usa **solo en memoria** para el cupo de la hora, exactamente como en el registro: NO DEBE quedar en ninguna tabla ni en el log del servidor, y tampoco DEBE guardarse una versión derivada de ella. El contenido del reporte NO DEBE escribirse en el log.

#### Scenario: el formulario no pide datos del reportante

- **WHEN** se revisa el formulario de reporte
- **THEN** sus únicos campos son el motivo, el comentario opcional y el campo trampa invisible

#### Scenario: nada del reportante queda guardado

- **WHEN** se revisa un reporte recién creado en la base
- **THEN** trae el negocio, el motivo, el comentario, el estado y las fechas, y ningún dato ni identificador de quien lo envió

#### Scenario: la IP no se persiste ni se registra

- **WHEN** se revisan la base y el log del servidor después de varios reportes
- **THEN** no aparece ninguna IP ni ningún valor derivado de ella, ni el contenido de los comentarios

### Requirement: Un reporte no cambia nada de lo público

Los reportes DEBEN ser invisibles fuera del panel: un negocio reportado sigue publicado exactamente igual (PRD §6.3: la moderación la hace el admin, no el volumen de reportes). NINGÚN reporte DEBE despublicar, ocultar, reordenar ni marcar una ficha de forma automática, y ni la ficha, ni el listado, ni la página de resultados DEBEN mostrar —ni en pantalla ni en el HTML de la respuesta— cuántos reportes tiene un negocio, sus motivos o sus comentarios. Tras enviar un reporte, la ficha DEBE verse igual que antes para cualquier vecino.

#### Scenario: la ficha reportada sigue igual

- **WHEN** un negocio publicado recibe varios reportes y otro vecino abre su ficha
- **THEN** la ve exactamente igual que antes: sigue publicada, con su sello "Negocio verificado", sin aviso de reportes y en el mismo lugar de su listado

#### Scenario: nada de auto-despublicar

- **WHEN** un negocio acumula el tope de reportes pendientes
- **THEN** su estado sigue siendo `publicado` y solo el admin, desde el panel, puede decidir qué hacer

#### Scenario: sin rastro de reportes en el HTML público

- **WHEN** se inspecciona el HTML de la ficha reportada, de su listado y de una página de resultados que la incluye
- **THEN** no aparece ningún conteo, motivo ni comentario de reportes

## MODIFIED Requirements

### Requirement: Botones de contacto de la ficha con el WhatsApp como acción principal

La ficha DEBE ofrecer los botones del PRD §6.2, cada uno solo si el negocio registró el dato: "Enviar WhatsApp" (siempre presente y como única acción principal, con el verde de acción del sitio), "Llamar" solo si registró teléfono fijo, "Cómo llegar" solo si capturó dirección o referencias (abre Google Maps con esa referencia y su colonia en Tizayuca) y el enlace a la página que registró, solo si la registró. El enlace a la página registrada NO DEBE afirmar que lleva a Facebook: DEBE mostrar el dominio real al que apunta (hallazgo M4 de T-003). Ningún otro control DEBE competir en jerarquía visual con el de WhatsApp, **incluido el control "Reportar este negocio", que no es un botón de contacto: va aparte de este bloque, después de él y con peso visual menor**. Los botones DEBEN mostrar la acción, no el número de teléfono como texto. El botón "Llamar" solo se genera si el teléfono fijo se normaliza a 10 dígitos nacionales; si no es normalizable, la ficha muestra el dato capturado como texto plano ("Teléfono: …") sin enlace de llamada (decisión ratificada al cerrar T-004: no se pierde lo registrado y ningún código de marcado hostil llega a un `tel:`).

#### Scenario: WhatsApp como acción principal

- **WHEN** el vecino abre cualquier ficha publicada
- **THEN** ve el botón "Enviar WhatsApp" con el verde de acción, más grande o más prominente que cualquier otro control de la página —incluido "Reportar este negocio"—, y al tocarlo sale hacia la conversación con ese negocio

#### Scenario: botones que dependen de lo registrado

- **WHEN** el negocio registró teléfono fijo y dirección o referencias, pero no página
- **THEN** la ficha muestra "Llamar" y "Cómo llegar" además de "Enviar WhatsApp", y no muestra ningún enlace a página externa

#### Scenario: negocio sin teléfono ni dirección

- **WHEN** el negocio no registró teléfono fijo ni dirección o referencias
- **THEN** la ficha no muestra "Llamar" ni "Cómo llegar", y el único contacto es "Enviar WhatsApp"

#### Scenario: "Cómo llegar" abre el mapa con lo que capturó el negocio

- **WHEN** el vecino toca "Cómo llegar" en la ficha de un negocio que escribió "a un lado de la primaria" y está en la colonia "Huicalco"
- **THEN** se abre Google Maps buscando esa referencia junto con la colonia y Tizayuca, en una pestaña nueva

#### Scenario: el enlace a la página registrada no promete Facebook

- **WHEN** un negocio registró como página un link que no es de Facebook (por ejemplo `https://mi-negocio.example/perfil`)
- **THEN** la ficha muestra el enlace indicando el dominio real al que lleva (`mi-negocio.example`) y en ningún lado dice que es su Facebook

#### Scenario: reportar queda fuera del bloque de contacto

- **WHEN** se revisa el orden de la ficha
- **THEN** el bloque de contacto trae solo los botones del PRD §6.2 y "Reportar este negocio" aparece después, separado de ellos

### Requirement: Directorio en Server Components, mobile-first y usable sin JavaScript

La home, los listados, las fichas, el buscador, la página de resultados y **la página de reporte con su confirmación** DEBEN ser Server Components y NO DEBEN agregar JavaScript de cliente propio (PRD §8, presupuesto de <2s en 4G). Todas las páginas DEBEN verse completas en un viewport de 390px sin scroll horizontal, con áreas táctiles de al menos 44px en todo elemento tocable, y DEBEN seguir siendo navegables con el JavaScript de cliente deshabilitado, incluidos el filtro por colonia, la búsqueda y el envío de un reporte.

#### Scenario: sin JS de cliente nuevo

- **WHEN** se revisan los archivos nuevos de la home, el listado, la tarjeta, la ficha, el buscador, la página de resultados y la página de reporte
- **THEN** ninguno declara `"use client"` ni agrega un bundle de cliente propio

#### Scenario: celular a 390px

- **WHEN** un vecino abre la home, un listado, una ficha, una página de resultados y el formulario de reporte en un viewport de 390px
- **THEN** todo se ve completo y legible, sin scroll horizontal, y cada elemento tocable mide al menos 44px en su dimensión menor

#### Scenario: navegación sin JavaScript

- **WHEN** el vecino recorre home → buscar → resultados → ficha → WhatsApp, home → categoría → filtro por colonia → ficha → WhatsApp, y ficha → reportar → enviar → confirmación, con el JavaScript de cliente deshabilitado
- **THEN** los tres flujos completos funcionan igual, porque cada paso es un enlace o un formulario resuelto por el servidor
