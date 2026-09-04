# Delta de spec: registro-negocio

## ADDED Requirements

### Requirement: El alta deja la ficha lista para el buscador

Al guardar un registro, el servidor DEBE escribir también la versión normalizada del nombre y de "¿Qué ofreces?" que usa el buscador (capacidad `modelo-datos`), con la misma función de normalización que usa la búsqueda, de modo que en cuanto el admin publique la ficha el vecino la encuentre escribiendo con o sin acentos. Ese valor lo calcula el servidor a partir de lo que capturó el dueño: ningún valor enviado por el cliente DEBE poder fijarlo ni alterarlo, igual que el estado, el origen y la constancia del consentimiento. El dueño NO DEBE ver ni llenar nada nuevo en el formulario: los campos visibles del registro siguen siendo exactamente los mismos.

#### Scenario: registro con acentos, encontrable después

- **WHEN** el dueño registra "Plomería Güicho" con "destape de drenajes" en "¿Qué ofreces?", y más adelante su ficha se publica
- **THEN** un vecino que busca "plomeria" o "plomero" encuentra ese negocio

#### Scenario: el cliente no puede fijar el texto de búsqueda

- **WHEN** un envío incluye campos extra que pretenden fijar el texto normalizado de búsqueda
- **THEN** esos valores se ignoran y el negocio queda con el texto normalizado calculado a partir de su nombre y su "¿Qué ofreces?" reales

#### Scenario: el formulario no cambia para el dueño

- **WHEN** el dueño abre la página de registro
- **THEN** ve los mismos campos obligatorios y opcionales de siempre, sin ningún campo nuevo relacionado con la búsqueda
