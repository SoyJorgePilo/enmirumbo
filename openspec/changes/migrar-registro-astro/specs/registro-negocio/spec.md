# Delta: registro-negocio

> Dos enmiendas mínimas por la migración a Astro (T-024, Fase 3b-1; `design.md` §1 y §9). Ninguna cambia lo que ve el dueño con JavaScript ni ningún texto de UI. La primera nombra con todas sus letras el JS que hoy ya hace React: mandar el formulario sin recargar para pintar los errores en el sitio. La segunda admite que, **sin** JS, la dirección de los errores lleve el parámetro técnico de la Action. Los demás requirements no cambian.

## MODIFIED Requirements

### Requirement: El registro funciona sin JavaScript de cliente

El envío del formulario y toda su validación DEBEN funcionar aunque el JavaScript de cliente no cargue. Sin JS solo se pierden tres cosas:

- el ejemplo dinámico de "¿Qué ofreces?", que cae en el ejemplo genérico;
- el indicador "Enviando...";
- que los errores lleguen sin recargar la página. Sin JS, la respuesta al envío vuelve a pintar la página con los mismos errores por campo, los valores capturados y el foco en el primer campo con error.

Esto mantiene el presupuesto de rendimiento del PRD §8 en 4G.

Con JS, el único JavaScript propio de la página DEBE ser un módulo pequeño que haga solo tres cosas:

- el ejemplo dinámico;
- el estado de envío del botón;
- mandar el formulario a su propia dirección para pintar los errores en el sitio y, si el envío prospera, ir a la pantalla que corresponda.

NO DEBE cargarse ningún marco de componentes en el navegador. La foto viaja en ese mismo envío del formulario: NO DEBE haber vista previa, recorte ni compresión en el cliente, ni ningún JavaScript nuevo asociado al campo de foto.

#### Scenario: envío sin JS

- **WHEN** el dueño envía el formulario, con o sin foto, con el JavaScript de cliente deshabilitado o aún sin cargar
- **THEN** el registro se procesa igual en el servidor y ve la pantalla de gracias o los errores por campo, según corresponda, con el foco en el primer campo con error

#### Scenario: JS acotado al campo del ejemplo

- **WHEN** se revisa el JavaScript de cliente propio que carga la página de registro
- **THEN** corresponde solo al ejemplo dinámico por categoría, al estado de envío del botón y al envío del formulario a su propia dirección; no toca el campo de foto ni el resto de la página, no mide nada y no carga ningún marco de componentes. El script del proveedor de analítica no cuenta, porque es de un tercero y lo inyecta el tronco de las páginas públicas (capacidad `layout-base`)

#### Scenario: con JS, los errores llegan sin recargar

- **WHEN** con JavaScript el dueño envía el formulario con un campo mal
- **THEN** ve el error junto al campo, con el foco en él y sus datos en su lugar, sin que la página se recargue y sin que cambie la dirección

### Requirement: Ningún dato del formulario viaja a la medición

Nada de lo que el dueño escribe en el registro DEBE llegar al proveedor de analítica, ni como propiedad de un evento ni dentro de una URL: ni el nombre del negocio, ni el WhatsApp, ni el teléfono, ni la colonia, ni la dirección, ni el horario, ni el texto de "¿Qué ofreces?". Las dos pantallas del registro DEBEN seguir viviendo en URLs sin datos del dueño, y los errores por campo DEBEN mostrarse en la ruta `/registro`. Así, la única información que sale del sitio es que alguien vio esas dos pantallas.

Con JavaScript, la dirección de los errores DEBE seguir siendo exactamente `/registro`. Sin JavaScript, la dirección puede llevar el parámetro técnico de la acción del formulario (`?_action=registrar`): no contiene ningún dato del dueño, y sin JavaScript la medición no corre.

#### Scenario: las URLs del registro no llevan datos

- **WHEN** el dueño recorre el formulario, se equivoca, corrige y termina en la pantalla de gracias
- **THEN** las únicas rutas que viajan al proveedor son `/registro` y `/registro/gracias`, sin cadena de consulta y sin ningún dato suyo

#### Scenario: sin JS, el parámetro técnico no trae datos

- **WHEN** sin JavaScript el dueño envía el formulario con errores
- **THEN** la dirección es `/registro` o `/registro?_action=registrar`, sin ningún otro parámetro y sin ningún dato que haya escrito

#### Scenario: un envío bloqueado por el honeypot

- **WHEN** un bot llena el campo trampa y recibe la misma pantalla de gracias que un envío legítimo (para no delatar la trampa)
- **THEN** no se cuenta ninguna conversión, porque la medición ocurre solo en el navegador y un bot que no ejecuta JavaScript no registra la vista; y si llegara a contarla, el número contable de altas sigue siendo el de la base, no el del proveedor
