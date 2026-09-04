# Delta de spec: registro-negocio (change `agregar-analitica-cookieless`)

## ADDED Requirements

### Requirement: El embudo del registro se mide con las vistas de sus dos pantallas

Los eventos "formulario iniciado" y "formulario enviado" del PRD §9 DEBEN medirse con las vistas de página de `/registro` y de `/registro/gracias`, sin agregar JavaScript propio, sin instrumentar el botón "Enviar" y sin ningún evento extra. El botón no se instrumenta a propósito: un clic en "Enviar" con errores de validación no es un registro, y contarlo inflaría la conversión del PRD §10 ("% de registros completados sin ayuda", que se lee como vistas de `/registro/gracias` entre vistas de `/registro`). La pantalla de gracias es un proxy de la conversión, no el conteo contable de altas: el número exacto de negocios registrados vive en la base de datos.

#### Scenario: registro exitoso

- **WHEN** el dueño de un negocio llena el formulario correctamente y lo envía, con la medición configurada
- **THEN** quedan registradas una vista de `/registro` y una vista de `/registro/gracias`, que es lo que cuenta como conversión

#### Scenario: envío con errores no cuenta como conversión

- **WHEN** el dueño envía el formulario con un campo mal y ve los errores por campo
- **THEN** sigue en `/registro`, no se registra ninguna vista de `/registro/gracias` y no se manda ningún evento de "enviado"

#### Scenario: sin instrumentación en el botón

- **WHEN** se revisa el formulario de registro
- **THEN** el botón "Enviar" no lleva ningún atributo de evento ni JavaScript agregado para medir, y el formulario sigue funcionando sin JavaScript de cliente

### Requirement: Ningún dato del formulario viaja a la medición

Nada de lo que el dueño escribe en el registro —nombre del negocio, WhatsApp, teléfono, colonia, dirección, horario o el texto de "¿Qué ofreces?"— DEBE llegar al proveedor de analítica, ni como propiedad de un evento ni dentro de una URL. Las dos pantallas del registro DEBEN seguir viviendo en URLs sin parámetros, y los errores por campo DEBEN seguir mostrándose en la misma URL `/registro`, de modo que la única información que sale del sitio es que alguien vio esas dos pantallas.

#### Scenario: las URLs del registro no llevan datos

- **WHEN** el dueño recorre el formulario, se equivoca, corrige y termina en la pantalla de gracias
- **THEN** las únicas rutas que viajan al proveedor son `/registro` y `/registro/gracias`, sin cadena de consulta y sin ningún dato suyo

#### Scenario: un envío bloqueado por el honeypot

- **WHEN** un bot llena el campo trampa y recibe la misma pantalla de gracias que un envío legítimo (para no delatar la trampa)
- **THEN** no se cuenta ninguna conversión, porque la medición ocurre solo en el navegador y un bot que no ejecuta JavaScript no registra la vista; y si llegara a contarla, el número contable de altas sigue siendo el de la base, no el del proveedor
