# Delta de spec: layout-base

## MODIFIED Requirements

### Requirement: Enlaces internos a rutas existentes y enlaces externos protegidos

Todo enlace interno del sitio DEBE apuntar a una ruta que existe, incluidas las rutas dinámicas, cuyos destinos se resuelven desde el catálogo (categorías) o desde los negocios publicados; ningún enlace DEBE llevar a una página pendiente (los legales de E6). La misma regla DEBE aplicar al destino de los formularios del sitio (el `action` del buscador, por ejemplo): un formulario que envía a una ruta que no existe es un control muerto igual que un enlace roto, y la verificación automática DEBE señalarlo. Todo enlace que salga del sitio y abra en pestaña nueva (WhatsApp, mapas, la página que registró un negocio) DEBE llevar `rel="noopener noreferrer"`. Los enlaces de llamada (`tel:`) NO DEBEN abrir pestaña nueva y por lo tanto no requieren ese atributo. El footer sigue sin enlaces mientras las páginas legales no existan.

#### Scenario: enlace interno a una ruta inexistente

- **WHEN** se agrega en el código de interfaz un enlace a una ruta que el sitio no tiene
- **THEN** la verificación automática del sitio falla, señalando ese enlace

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
