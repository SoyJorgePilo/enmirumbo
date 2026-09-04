# Delta: revision-admin — los reportes llegan a la cola y al detalle

## ADDED Requirements

### Requirement: La cola avisa qué negocios tienen reportes sin atender

Debajo de los registros por revisar, la cola DEBE mostrar una sección propia encabezada con el texto literal "Negocios reportados" que liste **solo los negocios con al menos un reporte pendiente**, del que lleva más tiempo con un reporte sin atender al más reciente. Cada renglón DEBE mostrar el nombre del negocio, cuántos reportes sin atender tiene —con el texto literal "1 reporte sin atender" o "<n> reportes sin atender", según corresponda— y una entrada al detalle de ese negocio con el texto literal "Ver reportes". La sección DEBE encabezar con el conteo total, con el texto literal "1 negocio tiene reportes sin atender." o "<n> negocios tienen reportes sin atender.". Si no hay ningún reporte pendiente, la sección completa NO DEBE aparecer: la pantalla vacía del panel sigue siendo "No hay registros esperando. Todo al día." Los reportes de un negocio NO DEBEN aparecer en la lista de "Registros por revisar" ni alterar su orden: son dos secciones distintas, con dos trabajos distintos.

#### Scenario: cola con negocios reportados

- **WHEN** el admin abre la cola y hay dos negocios publicados con reportes pendientes (uno con tres reportes y otro con uno)
- **THEN** ve, debajo de los registros por revisar, la sección "Negocios reportados" con el conteo "2 negocios tienen reportes sin atender.", el renglón del primero con "3 reportes sin atender", el del segundo con "1 reporte sin atender" y en cada uno la entrada "Ver reportes"

#### Scenario: sin reportes pendientes no hay sección

- **WHEN** el admin abre la cola y ningún negocio tiene reportes sin atender
- **THEN** no aparece la sección "Negocios reportados" ni ningún conteo de reportes

#### Scenario: los reportes no se mezclan con los registros por revisar

- **WHEN** un negocio publicado tiene reportes pendientes
- **THEN** no aparece en la lista de "Registros por revisar" (que sigue trayendo solo los `en_revision`) ni cambia el orden de esa lista

#### Scenario: "Ver reportes" abre el detalle del negocio

- **WHEN** el admin toca "Ver reportes" en el renglón de un negocio publicado
- **THEN** llega al detalle de ese negocio, con sus datos completos y sus reportes sin atender

### Requirement: El detalle del negocio lista sus reportes sin atender

El detalle de un negocio DEBE mostrar, en una sección propia encabezada con el texto literal "Reportes sin atender", los reportes pendientes de ese negocio, del más antiguo al más reciente. Cada reporte DEBE mostrar la etiqueta legible de su motivo (la misma que vio el vecino: "Ya cerró", "No es real", "Los datos están mal" o "Contenido ofensivo o inapropiado"), desde cuándo lleva sin atenderse —en la misma forma en palabras que usa la cola— y el comentario, solo si el vecino escribió uno. El comentario DEBE mostrarse **como texto plano**, con el mismo escape que el resto de los datos capturados: ninguna etiqueta se interpreta y una palabra larguísima no DEBE provocar scroll horizontal a 390px. La sección NO DEBE aparecer si el negocio no tiene reportes pendientes. Los reportes DEBEN verse únicamente dentro del panel con sesión válida: NO DEBEN aparecer en ninguna página pública. El detalle NO DEBE mostrar ningún dato de quien reportó, porque no existe ninguno.

#### Scenario: detalle con reportes

- **WHEN** el admin abre el detalle de un negocio con dos reportes pendientes, uno con comentario y otro sin él
- **THEN** ve la sección "Reportes sin atender" con los dos, del más antiguo al más reciente, cada uno con la etiqueta de su motivo y desde cuándo espera, y el comentario solo en el que lo trae

#### Scenario: comentario con marcado

- **WHEN** un reporte trae como comentario `<b>cerró</b><script>alert(1)</script>`
- **THEN** el panel lo muestra como texto tal cual se escribió y no interpreta ninguna etiqueta

#### Scenario: negocio sin reportes

- **WHEN** el admin abre el detalle de un negocio que no tiene reportes pendientes
- **THEN** no ve la sección "Reportes sin atender" ni ningún hueco vacío

#### Scenario: los reportes no salen del panel

- **WHEN** se revisan las páginas públicas del negocio reportado mientras tiene reportes pendientes
- **THEN** ni la ficha, ni su listado, ni la página de resultados muestran motivos, comentarios ni conteos de reportes

### Requirement: Marcar un reporte como atendido, una sola vez

Cada reporte pendiente del detalle DEBE tener un botón con el texto literal "Marcar como atendido" que lo pase a estado `atendido` con su fecha, lo saque de la lista de pendientes de ese negocio y actualice el conteo de la cola. Tras marcarlo, el panel DEBE confirmar con el texto literal "Reporte atendido." Marcar como atendido NO DEBE cambiar el estado del negocio ni ninguno de sus datos: es solo la constancia de que el admin ya lo vio; lo que decida hacer con la ficha son las herramientas que ya tiene el panel. La acción solo DEBE surtir efecto sobre un reporte que siga `pendiente`: si el admin lo marcó dos veces, desde dos pestañas o recargando, la segunda vez NO DEBE sobrescribir la fecha de la primera y el panel DEBE decirlo con el texto literal "Este reporte ya lo habías atendido." Recargar la pantalla posterior NO DEBE repetir la acción.

#### Scenario: atender un reporte

- **WHEN** el admin toca "Marcar como atendido" en uno de los dos reportes pendientes de un negocio
- **THEN** ve "Reporte atendido.", ese reporte desaparece de "Reportes sin atender", el otro sigue ahí y la cola pasa a contar un reporte menos para ese negocio

#### Scenario: el último reporte atendido saca al negocio de la sección

- **WHEN** el admin atiende el único reporte pendiente de un negocio y vuelve a la cola
- **THEN** ese negocio ya no aparece en "Negocios reportados"

#### Scenario: atender no cambia el negocio

- **WHEN** el admin marca como atendido un reporte de un negocio publicado
- **THEN** el negocio sigue en estado `publicado`, con sus mismos datos, sus mismos giros y su misma fecha de publicación, y su ficha pública no cambia

#### Scenario: doble marcado

- **WHEN** el admin marca como atendido un reporte y vuelve a mandar la misma acción desde una pestaña que tenía abierta
- **THEN** el reporte conserva la fecha de atención original y ve "Este reporte ya lo habías atendido."

#### Scenario: reporte inexistente

- **WHEN** llega una petición de marcar como atendido un identificador de reporte que no existe
- **THEN** no cambia nada en la base y la respuesta no trae datos de ningún reporte ni de ningún negocio

## MODIFIED Requirements

### Requirement: Toda pantalla y toda acción del panel exigen sesión válida

Cada página del panel y cada transición de estado (aprobar, rechazar, **marcar un reporte como atendido**) DEBEN verificar la sesión antes de leer o escribir nada. Sin sesión válida, la respuesta DEBE ser una redirección a la pantalla de acceso, sin mostrar ni un dato del registro ni de sus reportes —ni en la pantalla, ni en el HTML, ni en la URL de destino— y sin ejecutar ningún cambio en la base. Las transiciones de estado NO DEBEN existir en ninguna superficie pública: el formulario de registro, los listados y las fichas no DEBEN poder cambiar el estado, el origen, los giros ni la colonia de un negocio, ni el estado de ningún reporte. **El formulario público de reporte solo puede crear reportes en estado `pendiente`: NO DEBE poder marcarlos como atendidos ni tocar nada del negocio.**

#### Scenario: cola sin sesión

- **WHEN** alguien sin sesión abre `/admin`
- **THEN** llega a la pantalla de acceso y en la respuesta no aparece ningún nombre, número de WhatsApp ni dato de ningún registro, ni ningún conteo de reportes

#### Scenario: detalle de un registro sin sesión

- **WHEN** alguien sin sesión abre la URL del detalle de un registro concreto, con su identificador
- **THEN** llega a la pantalla de acceso, sin ver ningún dato de ese registro ni de sus reportes, y sin que la respuesta confirme si ese identificador existe

#### Scenario: aprobar sin sesión

- **WHEN** llega directamente al servidor una petición de aprobar un registro sin cookie de sesión válida
- **THEN** el registro sigue en `en_revision`, no se publica ninguna ficha y la respuesta no trae datos del negocio

#### Scenario: rechazar sin sesión

- **WHEN** llega directamente al servidor una petición de rechazar un registro sin cookie de sesión válida
- **THEN** el registro no cambia de estado y no se guarda ningún motivo de rechazo

#### Scenario: atender un reporte sin sesión

- **WHEN** llega directamente al servidor una petición de marcar un reporte como atendido sin cookie de sesión válida
- **THEN** el reporte sigue `pendiente`, sin fecha de atención, y la respuesta no trae su motivo, su comentario ni dato alguno del negocio

#### Scenario: ninguna transición desde lo público

- **WHEN** se revisan las superficies públicas (formulario de registro, listados, fichas y formulario de reporte)
- **THEN** ninguna permite cambiar estado, origen, giros ni colonia de un negocio, ni marcar reportes como atendidos

### Requirement: El panel se opera desde el celular y sin JavaScript de cliente innecesario

El panel DEBE ser mobile-first: cola —**incluida la sección de negocios reportados**—, detalle —**incluida la lista de reportes sin atender**— y formularios de aprobar, rechazar y marcar atendido DEBEN verse completos y usables en un viewport de 390px, sin scroll horizontal, con áreas táctiles de al menos 44px y contraste AA (PRD §8). Las pantallas del panel DEBEN ser Server Components y sus formularios DEBEN funcionar sin JavaScript de cliente, igual que el registro público.

#### Scenario: revisar desde el celular

- **WHEN** el admin abre la cola con la sección de reportados, el detalle de un negocio con reportes y los formularios de aprobar, rechazar y marcar atendido en un viewport de 390px
- **THEN** todo se ve completo y legible, sin scroll horizontal —incluido un comentario de reporte sin espacios— y cada control tocable mide al menos 44px en su dimensión menor

#### Scenario: el panel funciona sin JavaScript

- **WHEN** el admin entra, aprueba, rechaza y marca un reporte como atendido con el JavaScript de cliente deshabilitado
- **THEN** las cuatro acciones funcionan igual, porque cada una es un envío de formulario del servidor

#### Scenario: sin JS de cliente propio

- **WHEN** se revisan los archivos nuevos del panel
- **THEN** ninguno declara `"use client"` ni agrega un bundle de cliente propio
