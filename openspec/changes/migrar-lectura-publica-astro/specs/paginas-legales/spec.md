# Delta: paginas-legales

> Enmienda de letra, **sin cambio de comportamiento** (ADR-013, Fase 2; T-023). Cambia "Server Components"/`"use client"` por una redacción neutral respecto al marco. El encabezado se conserva.

## MODIFIED Requirements

### Requirement: Las páginas legales son Server Components mobile-first sin JavaScript de cliente

Las dos páginas DEBEN renderizarse por completo en el servidor, sin hidratarse en el navegador (ni con la directiva `"use client"` ni con una directiva `client:`) y sin agregar bundles de cliente propios: son texto. DEBEN verse completas y legibles en un viewport de 390px sin scroll horizontal, con ancho de lectura cómodo en escritorio, y todo elemento tocable (los enlaces entre documentos) DEBE medir al menos 44px en su dimensión menor.

#### Scenario: se leen en el celular

- **WHEN** el dueño abre cualquiera de las dos páginas en un viewport de 390px
- **THEN** el texto se lee completo, sin scroll horizontal, y los enlaces se pueden tocar sin precisión de cirujano

#### Scenario: sin JavaScript de cliente

- **WHEN** se construye el sitio y se revisan las dos páginas legales
- **THEN** ninguna se hidrata en el navegador (ni `"use client"` ni directiva `client:`) ni agrega JavaScript de cliente propio, y su contenido se ve completo con el JavaScript deshabilitado
