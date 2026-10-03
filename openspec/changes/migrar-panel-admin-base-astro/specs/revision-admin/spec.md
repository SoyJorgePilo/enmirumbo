# Delta: revision-admin

> Enmienda de letra, **sin cambio de comportamiento** (ADR-013, Fase 5a; T-026), con el mismo criterio con el que 2a enmendó `layout-base`. El requirement describe la ausencia de JavaScript de cliente con vocabulario de Next ("Server Components", la directiva `"use client"`), que deja de describir el panel cuando se sirve con Astro. La redacción nueva es neutral respecto al marco y verdadera con los dos. Se conserva el encabezado porque otras specs lo citan por nombre. Solo cambian la frase de "Server Components" y el último scenario; el resto es texto vigente copiado sin cambios.

## MODIFIED Requirements

### Requirement: El panel se opera desde el celular y sin JavaScript de cliente innecesario

El panel DEBE ser mobile-first: cola —**incluida la sección de negocios reportados**—, listado de todos los negocios con sus filtros y su paginación, detalle —**incluida la lista de reportes sin atender**—, **detalle comparativo de la edición**, formularios de aprobar, rechazar, despublicar, aplicar los cambios, descartar los cambios, generar un enlace nuevo y marcar atendido, y la pantalla de confirmación del borrado DEBEN verse completos y usables en un viewport de 390px, sin scroll horizontal, con áreas táctiles de al menos 44px y contraste AA (PRD §8). La comparación entre lo publicado y lo propuesto DEBE ser legible en esa pantalla, sin obligar al admin a desplazarse a los lados. Las pantallas del panel DEBEN pintarse por completo en el servidor, sin hidratarse en el navegador (ni con la directiva `"use client"` de React ni con una directiva `client:` de Astro), y sus formularios DEBEN funcionar sin JavaScript de cliente, igual que el registro público. En el listado, filtrar y cambiar de página son enlaces, no controles con JavaScript: la vista completa funciona con el JavaScript de cliente deshabilitado.

#### Scenario: revisar desde el celular

- **WHEN** el admin abre la cola con la sección de reportados, el detalle de un negocio con reportes, el detalle de una edición y los formularios de aprobar, rechazar, despublicar, aplicar, descartar y marcar atendido en un viewport de 390px
- **THEN** todo se ve completo y legible, sin scroll horizontal —incluido un comentario de reporte sin espacios— y cada control tocable mide al menos 44px en su dimensión menor

#### Scenario: la comparación se lee en el celular

- **WHEN** el admin revisa en 390px una edición que cambia varios campos
- **THEN** entiende qué está publicado y qué se propone sin desplazarse horizontalmente

#### Scenario: el listado también se opera en el celular

- **WHEN** el admin abre "Todos los negocios" en un viewport de 390px, con nombres largos y una colonia de texto libre larga
- **THEN** ve los renglones completos sin scroll horizontal, y los filtros, los enlaces de paginación y cada entrada "Ver detalle" miden al menos 44px en su dimensión menor

#### Scenario: el panel funciona sin JavaScript

- **WHEN** el admin entra, aprueba, rechaza, despublica, aplica una edición, la descarta, genera un enlace nuevo, marca un reporte como atendido y borra con el JavaScript de cliente deshabilitado
- **THEN** las nueve acciones funcionan igual, porque cada una es un envío de formulario del servidor

#### Scenario: el listado se filtra y se pagina sin JavaScript

- **WHEN** el admin abre el listado con el JavaScript de cliente deshabilitado, cambia de filtro y avanza de página
- **THEN** las dos cosas funcionan, porque son enlaces que solo cambian el querystring

#### Scenario: la confirmación del borrado también se opera en el celular

- **WHEN** el admin abre la pantalla de confirmación del borrado en un viewport de 390px con el JavaScript de cliente deshabilitado
- **THEN** ve el texto completo sin scroll horizontal, puede escribir la palabra y borrar

#### Scenario: sin JS de cliente propio

- **WHEN** se revisan los archivos nuevos del panel
- **THEN** ninguno se hidrata en el navegador (ni `"use client"` ni directiva `client:`), el HTML de sus pantallas no trae islas, `modulepreload` ni `<script>` propio, y no se agrega ningún bundle de cliente propio
