# Delta: directorio-publico

> Enmienda de letra, **sin cambio de comportamiento** (ADR-013, Fase 2; T-023). Cambia "Server Components"/`"use client"` por una redacción neutral respecto al marco. El encabezado se conserva. Se adelanta al change 2b porque la redacción nueva es verdad igual con Next que con Astro.

## MODIFIED Requirements

### Requirement: Directorio en Server Components, mobile-first y usable sin JavaScript

La home, los listados por categoría, las páginas de giro y de giro+colonia, las fichas, el buscador, la página de resultados y **la página de reporte con su confirmación** DEBEN renderizarse por completo en el servidor y NO DEBEN agregar JavaScript de cliente propio: ninguna se hidrata en el navegador, ni con la directiva `"use client"` ni con una directiva `client:` (PRD §8, presupuesto de <2s en 4G). El JSON-LD de la ficha NO cuenta como JavaScript de cliente: es un bloque de datos, no código ejecutable. Tampoco cuenta el script del proveedor de analítica cookieless, que es de un tercero y lo inyecta el tronco de las páginas públicas (capacidad `layout-base`): estas páginas solo declaran eventos con atributos de marcado, sin código propio alrededor. Todas las páginas DEBEN verse completas en un viewport de 390px sin scroll horizontal, con áreas táctiles de al menos 44px en todo elemento tocable, y DEBEN seguir siendo navegables con el JavaScript de cliente deshabilitado, incluidos el filtro por colonia, la búsqueda, la navegación entre las páginas de giro y de giro+colonia y el envío de un reporte.

#### Scenario: sin JS de cliente

- **WHEN** se revisan los archivos de la home, el listado, las páginas de giro y giro+colonia, la tarjeta, la ficha, el buscador, la página de resultados y la página de reporte
- **THEN** ninguno se hidrata en el navegador (ni `"use client"` ni directiva `client:`) ni agrega un bundle de cliente propio

#### Scenario: celular a 390px

- **WHEN** un vecino abre la home, un listado, una página de giro, una de giro+colonia, una ficha, una página de resultados y el formulario de reporte en un viewport de 390px
- **THEN** todo se ve completo y legible, sin scroll horizontal, y cada elemento tocable mide al menos 44px en su dimensión menor

#### Scenario: navegación sin JavaScript

- **WHEN** el vecino recorre home → buscar → resultados → ficha → WhatsApp, home → categoría → filtro por colonia → ficha → giro → giro+colonia → WhatsApp, y ficha → reportar → enviar → confirmación, con el JavaScript de cliente deshabilitado
- **THEN** los tres recorridos completos funcionan igual, porque cada paso es un enlace o un formulario resuelto por el servidor
