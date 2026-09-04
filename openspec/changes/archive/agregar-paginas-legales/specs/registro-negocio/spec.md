# Spec delta: registro-negocio

## MODIFIED Requirements

### Requirement: Consentimiento con aviso simplificado visible y constancia

El formulario DEBE mostrar el aviso de privacidad simplificado dentro de la propia página (visible sin salir del formulario, PRD §6.1 y §8) y un checkbox obligatorio con el texto literal "Acepto el aviso de privacidad y confirmo que este negocio es mío o que tengo permiso para registrarlo." Sin ese checkbox no DEBE haber envío. Al guardar un alta nueva, el sistema DEBE registrar la constancia como un timestamp puesto por el servidor (`consintioAvisoEn`), nunca un valor enviado por el cliente; en el reenvío de una ficha rechazada esa constancia se conserva y no se sustituye (ver el requirement "Una sola ficha por número de WhatsApp").

El aviso simplificado DEBE advertir, de forma llana y antes de que el dueño marque la casilla, que si su ficha se publica el nombre del negocio, el WhatsApp, el teléfono fijo y lo demás que escriba quedan a la vista de cualquiera en el directorio (E1-6, hallazgo M3 de la auditoría de T-004): sin esa advertencia el consentimiento no es informado. El texto del aviso simplificado DEBE ser: "Aviso de privacidad (resumen): NecesitoUno Tizayuca usa los datos que escribes aquí para revisar tu negocio, contactarte por WhatsApp y publicar tu ficha en el directorio. Ojo con esto: si publicamos tu ficha, el nombre de tu negocio, tu WhatsApp, tu teléfono fijo y lo demás que escribas quedan a la vista de cualquiera que entre al directorio, con botones para escribirte o marcarte directo. Publicamos tu colonia, no tu domicilio exacto, salvo que tú escribas la dirección. No vendemos ni compartimos tus datos con nadie más. Puedes pedirnos que corrijamos o borremos tu ficha cuando quieras, por el mismo WhatsApp con el que te contactemos; lo atendemos en máximo 20 días hábiles."

El bloque de consentimiento DEBE incluir además un enlace visible al aviso de privacidad integral (E6), con el texto literal "Lee el aviso de privacidad completo", hacia `/aviso-de-privacidad`, con área táctil de al menos 44px y en la misma pestaña (no es un enlace externo). Cae la regla anterior de no enlazar mientras esa página no existiera, y con ella la frase "Cuando publiquemos el aviso completo, aquí va a estar el enlace.", que ya no DEBE aparecer en ningún lado.

#### Scenario: aviso visible sin salir del formulario

- **WHEN** el dueño llega a la sección de consentimiento
- **THEN** lee el aviso simplificado en la misma pantalla, sin abrir otra página ni descargar nada

#### Scenario: el aviso simplificado avisa que el WhatsApp y el teléfono quedan públicos

- **WHEN** el dueño lee el aviso simplificado antes de marcar la casilla
- **THEN** lee que, si se publica su ficha, el nombre de su negocio, su WhatsApp, su teléfono fijo y lo demás que escriba quedan a la vista de cualquiera que entre al directorio, con botones para escribirle o marcarle directo

#### Scenario: enlace al aviso integral

- **WHEN** el dueño quiere leer el aviso completo antes de aceptar
- **THEN** encuentra en el bloque de consentimiento el enlace "Lee el aviso de privacidad completo", que abre `/aviso-de-privacidad` en la misma pestaña, y en ningún lugar del formulario aparece ya la frase "Cuando publiquemos el aviso completo, aquí va a estar el enlace."

#### Scenario: sin checkbox no hay envío

- **WHEN** el dueño llena todo correctamente pero no marca el checkbox y envía
- **THEN** no se crea ningún negocio y ve "Marca la casilla para poder registrar tu negocio" junto al checkbox

#### Scenario: constancia del consentimiento

- **WHEN** un registro se guarda con el checkbox marcado
- **THEN** el negocio queda con un timestamp de consentimiento correspondiente al momento en que el servidor procesó el envío

#### Scenario: los enlaces del registro apuntan a páginas que existen

- **WHEN** se revisan los enlaces de la página de registro
- **THEN** el único enlace del bloque de consentimiento es el del aviso integral y lleva a una ruta que existe (la verificación automática de enlaces del sitio lo comprueba)
