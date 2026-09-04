# Delta: registro-negocio — el cupo por IP del registro es propio

## MODIFIED Requirements

### Requirement: Anti-abuso sin captcha en el formulario público

El formulario DEBE protegerse contra envíos automatizados sin poner fricción al usuario y sin captcha (PRD §8), mediante: un campo trampa (honeypot) invisible para las personas, un límite de envíos por IP (3 por hora) y una alerta registrada en el log del servidor cuando las altas del día superan un umbral plausible. Al bloquear un envío, el sistema NO DEBE guardar nada.

El límite por IP del registro DEBE llevar **su propio conteo**, separado del de cualquier otra superficie pública que use el mismo mecanismo —hoy el botón "Reportar" de la ficha (PRD §6.3)—: agotar el cupo de reportes NO DEBE impedirle a nadie registrar su negocio, ni agotar el cupo de altas DEBE impedirle reportar una ficha. La política de lectura de la IP es la misma para todos esos cupos: solo se confía en el encabezado que el despliegue declara, y sin esa configuración no se aplica ningún cupo por IP.

#### Scenario: bot que llena el honeypot

- **WHEN** un envío llega con el campo trampa lleno
- **THEN** no se crea ningún negocio y quien envió ve la misma pantalla de gracias que un envío legítimo (para no delatar la trampa)

#### Scenario: límite por IP

- **WHEN** desde la misma IP llega un cuarto envío dentro de la misma hora
- **THEN** el envío se rechaza sin guardar nada y el usuario ve "Ya recibimos varios registros desde aquí. Espera un rato y vuelve a intentar."

#### Scenario: alerta por volumen diario

- **WHEN** las altas creadas en el día superan el umbral configurado
- **THEN** queda registrada una alerta en el log del servidor, sin bloquear a los usuarios legítimos

#### Scenario: el honeypot no molesta a las personas

- **WHEN** un vecino llena el formulario con teclado o con autocompletado del navegador
- **THEN** el campo trampa permanece vacío y su envío se procesa normalmente (no es un campo enfocable ni anunciado por lectores de pantalla)

#### Scenario: los cupos no se comparten entre superficies

- **WHEN** desde la misma IP se agota el cupo de reportes de la hora y enseguida se envía un registro válido
- **THEN** el registro se procesa con normalidad; y a la inversa, agotar el cupo de altas no impide enviar un reporte
