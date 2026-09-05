# Delta: registro-negocio

## MODIFIED Requirements

### Requirement: Consentimiento con aviso simplificado visible y constancia

El formulario DEBE mostrar el aviso de privacidad simplificado dentro de la propia página (visible sin salir del formulario, PRD §6.1 y §8) y un checkbox obligatorio con el texto literal "Acepto el aviso de privacidad y confirmo que este negocio es mío o que tengo permiso para registrarlo." Sin ese checkbox no DEBE haber envío. Al guardar un alta nueva, el sistema DEBE registrar la constancia como un par que pone el servidor —el timestamp (`consintioAvisoEn`) y la versión del aviso vigente en ese momento (`consintioAvisoVersion`)—, nunca valores enviados por el cliente; en el reenvío de una ficha rechazada esa constancia se conserva completa y no se sustituye (ver el requirement "Una sola ficha por número de WhatsApp").

El aviso simplificado DEBE advertir, de forma llana y antes de que el dueño marque la casilla, que si su ficha se publica el nombre del negocio, el WhatsApp, el teléfono fijo y lo demás que escriba quedan a la vista de cualquiera en el directorio: sin esa advertencia el consentimiento no es informado. El texto del aviso simplificado DEBE ser: "Aviso de privacidad (resumen): EnMiRumbo, el directorio de negocios de Tizayuca, usa los datos que escribes aquí para revisar tu negocio, contactarte por WhatsApp y publicar tu ficha en el directorio. Ojo con esto: si publicamos tu ficha, el nombre de tu negocio, tu WhatsApp, tu teléfono fijo y lo demás que escribas quedan a la vista de cualquiera que entre al directorio, con botones para escribirte o marcarte directo. Publicamos tu colonia, no tu domicilio exacto, salvo que tú escribas la dirección. No vendemos ni compartimos tus datos con nadie más. Puedes pedirnos que corrijamos o borremos tu ficha cuando quieras, por el mismo WhatsApp con el que te contactemos; lo atendemos en máximo 20 días hábiles."

Ese texto es una de las tres piezas del contenido versionado del aviso (ver la capacidad `paginas-legales`): cambiarlo estrena versión, y por eso el rebrand a "EnMiRumbo" pasa por el mismo trámite que cualquier otro cambio del aviso.

El bloque de consentimiento DEBE incluir además un enlace visible al aviso de privacidad integral, con el texto literal "Lee el aviso de privacidad completo", hacia `/aviso-de-privacidad`, con área táctil de al menos 44px y en la misma pestaña (no es un enlace externo). La frase "Cuando publiquemos el aviso completo, aquí va a estar el enlace." NO DEBE aparecer en ningún lado.

El bloque DEBE mostrar también, antes de la casilla, cuál versión del aviso se está aceptando, con el texto literal "Estás aceptando la versión 2 del aviso de privacidad." (donde `2` es el identificador de versión vigente, leído del mismo lugar que lo lee la página del aviso: no se escribe a mano en dos sitios). El dueño NO DEBE tener que llenar ni elegir nada por esto: es texto, no un campo.

#### Scenario: aviso visible sin salir del formulario

- **WHEN** el dueño llega a la sección de consentimiento
- **THEN** lee el aviso simplificado en la misma pantalla, sin abrir otra página ni descargar nada

#### Scenario: el aviso simplificado avisa que el WhatsApp y el teléfono quedan públicos

- **WHEN** el dueño lee el aviso simplificado antes de marcar la casilla
- **THEN** lee que, si se publica su ficha, el nombre de su negocio, su WhatsApp, su teléfono fijo y lo demás que escriba quedan a la vista de cualquiera que entre al directorio, con botones para escribirle o marcarle directo

#### Scenario: el aviso simplificado nombra al sitio con la marca vigente

- **WHEN** el dueño lee la primera línea del aviso simplificado
- **THEN** dice "Aviso de privacidad (resumen): EnMiRumbo, el directorio de negocios de Tizayuca, usa los datos que escribes aquí…", sin rastro de la marca anterior y sin la localidad pegada al nombre

#### Scenario: la versión está a la vista antes de aceptar

- **WHEN** el dueño llega a la casilla de consentimiento
- **THEN** lee "Estás aceptando la versión 2 del aviso de privacidad." y esa versión es la misma que muestra `/aviso-de-privacidad`

#### Scenario: enlace al aviso integral

- **WHEN** el dueño quiere leer el aviso completo antes de aceptar
- **THEN** encuentra en el bloque de consentimiento el enlace "Lee el aviso de privacidad completo", que abre `/aviso-de-privacidad` en la misma pestaña, y en ningún lugar del formulario aparece ya la frase "Cuando publiquemos el aviso completo, aquí va a estar el enlace."

#### Scenario: sin checkbox no hay envío

- **WHEN** el dueño llena todo correctamente pero no marca el checkbox y envía
- **THEN** no se crea ningún negocio y ve "Marca la casilla para poder registrar tu negocio" junto al checkbox

#### Scenario: constancia del consentimiento

- **WHEN** un registro se guarda con el checkbox marcado
- **THEN** el negocio queda con un timestamp de consentimiento correspondiente al momento en que el servidor procesó el envío y con la versión del aviso vigente en ese momento

#### Scenario: los enlaces del registro apuntan a páginas que existen

- **WHEN** se revisan los enlaces de la página de registro
- **THEN** el único enlace del bloque de consentimiento es el del aviso integral y lleva a una ruta que existe (la verificación automática de enlaces del sitio lo comprueba)
