# Spec delta: layout-base

## MODIFIED Requirements

### Requirement: Layout global con header y footer en todas las páginas

Toda página del sitio DEBE renderizarse dentro de un layout global con un header que muestra la marca como wordmark tipográfico "NecesitoUno" acompañado del posicionamiento "Tizayuca", y un footer al final de la página. El footer DEBE incluir los enlaces a las dos páginas legales (E6), con los textos literales "Aviso de privacidad" y "Términos y condiciones", cada uno hacia una página que existe y con área táctil de al menos 44px. Ya no queda espacio reservado: el hueco que T-002 dejó previsto lo ocupan estos dos enlaces.

#### Scenario: header con marca y posicionamiento

- **WHEN** un vecino abre cualquier página del sitio en su celular
- **THEN** ve en la parte superior el wordmark "NecesitoUno" junto con "Tizayuca" como posicionamiento visible

#### Scenario: footer con los enlaces legales y sin enlaces muertos

- **WHEN** el vecino llega al final de cualquier página
- **THEN** ve el footer con la identificación del sitio ("NecesitoUno Tizayuca") y los enlaces "Aviso de privacidad" y "Términos y condiciones", cada uno hacia una página que existe de verdad, y ningún enlace que lleve a una página inexistente

#### Scenario: los enlaces del footer se pueden tocar en el celular

- **WHEN** el dueño de un negocio toca "Aviso de privacidad" o "Términos y condiciones" desde su celular
- **THEN** cada enlace mide al menos 44px en su dimensión menor y lo lleva a la página correspondiente

### Requirement: Enlaces internos a rutas existentes y enlaces externos protegidos

Todo enlace interno del sitio DEBE apuntar a una ruta que existe, incluidas las rutas dinámicas, cuyos destinos se resuelven desde el catálogo (categorías) o desde los negocios publicados. La misma regla DEBE aplicar al destino de los formularios del sitio (el `action` del buscador, por ejemplo): un formulario que envía a una ruta que no existe es un control muerto igual que un enlace roto, y la verificación automática DEBE señalarlo. La lista blanca de rutas de la verificación automática DEBE reconocer las rutas legales `/aviso-de-privacidad` y `/terminos`, que ya existen; deja de ser cierto que "el footer sigue sin enlaces" y que los legales de E6 son páginas pendientes. Todo enlace que salga del sitio y abra en pestaña nueva (WhatsApp, mapas, la página que registró un negocio) DEBE llevar `rel="noopener noreferrer"`. Los enlaces de llamada (`tel:`) NO DEBEN abrir pestaña nueva y por lo tanto no requieren ese atributo.

#### Scenario: enlace interno a una ruta inexistente

- **WHEN** se agrega en el código de interfaz un enlace a una ruta que el sitio no tiene
- **THEN** la verificación automática del sitio falla, señalando ese enlace

#### Scenario: las rutas legales ya no son un enlace muerto

- **WHEN** se revisan los enlaces del footer, del bloque de consentimiento del registro y de las propias páginas legales
- **THEN** `/aviso-de-privacidad` y `/terminos` pasan la verificación como rutas existentes, y una ruta legal mal escrita (por ejemplo `/terminos-y-condiciones`) sigue fallando

#### Scenario: enlaces a rutas dinámicas

- **WHEN** se revisan los enlaces a listados de categoría y a fichas de negocio
- **THEN** cada uno corresponde a una ruta dinámica declarada del sitio, cuyo destino existe (un slug del catálogo, un negocio publicado)

#### Scenario: destino del formulario de búsqueda

- **WHEN** se revisa el buscador de la home y el de la página de resultados
- **THEN** su destino de envío es una ruta que existe en el sitio, y la verificación automática falla si se cambia por una ruta inexistente

#### Scenario: enlaces externos protegidos

- **WHEN** se revisa cualquier enlace que abre en pestaña nueva hacia WhatsApp, Google Maps o la página que registró un negocio
- **THEN** lleva `rel="noopener noreferrer"`

#### Scenario: enlace de llamada

- **WHEN** se revisa el botón "Llamar" de una ficha
- **THEN** usa un enlace `tel:` que no abre pestaña nueva
