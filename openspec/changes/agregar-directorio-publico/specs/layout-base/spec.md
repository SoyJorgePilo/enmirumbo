# Delta de spec: layout-base

## RENAMED Requirements

- FROM: `### Requirement: Home provisional que usa el layout`
- TO: `### Requirement: Home del sitio dentro del layout, con la entrada al registro`

## MODIFIED Requirements

### Requirement: Home del sitio dentro del layout, con la entrada al registro

La ruta raíz (`/`) DEBE mostrar la home real del sitio dentro del layout global, con un único `h1` de bienvenida en español mexicano coloquial —el texto literal "¿Qué necesitas en Tizayuca?"— acompañado de la frase "Encuentra negocios y servicios de aquí cerquita y contáctalos directo por WhatsApp.". La home DEBE conservar la entrada al registro del Flujo A (PRD §7) con el texto literal "Registra tu negocio gratis", con el estilo de acción principal (verde WhatsApp) y área táctil de al menos 44px, presentada bajo la pregunta "¿Tienes un negocio en Tizayuca?". El contenido de directorio de la home (categorías y bloque de deporte) lo especifica la capacidad `directorio-publico`; aquí solo se exige que viva dentro del layout, con header y footer, y con la jerarquía de encabezados correcta (un `h1` y las secciones como `h2`). La frase provisional "Muy pronto vas a poder encontrar aquí los negocios y servicios de Tizayuca." DEBE desaparecer, porque el directorio ya existe. Todo texto residual de la plantilla de create-next-app DEBE seguir ausente.

#### Scenario: home dentro del layout

- **WHEN** un vecino abre la ruta raíz del sitio en su celular
- **THEN** ve, dentro del layout con header y footer, el encabezado "¿Qué necesitas en Tizayuca?" y la frase "Encuentra negocios y servicios de aquí cerquita y contáctalos directo por WhatsApp."

#### Scenario: la home ya no anuncia que el directorio viene después

- **WHEN** se abre la ruta raíz
- **THEN** no aparece la frase "Muy pronto vas a poder encontrar aquí los negocios y servicios de Tizayuca."

#### Scenario: entrada al registro desde la home

- **WHEN** el dueño de un negocio abre la ruta raíz en su celular
- **THEN** ve la pregunta "¿Tienes un negocio en Tizayuca?" y un enlace visible con el texto "Registra tu negocio gratis", con el estilo de acción principal, que lo lleva a la página de registro

#### Scenario: jerarquía de encabezados

- **WHEN** se inspecciona el HTML de la home
- **THEN** hay exactamente un `h1` y las secciones de categorías y de deporte son encabezados de segundo nivel, sin saltos de jerarquía

#### Scenario: sin rastros de la plantilla

- **WHEN** se abre la ruta raíz
- **THEN** no aparece ningún texto, logo ni enlace de la plantilla de Next.js/Vercel

## ADDED Requirements

### Requirement: Página 404 en español dentro del layout

El sitio DEBE tener una página de "no encontrado" propia, en español mexicano coloquial y dentro del layout global, que se muestre ante cualquier URL desconocida y ante los casos que el directorio marca como inexistentes (categoría o negocio). DEBE responder con código 404, encabezarse con el texto literal "No encontramos esta página", explicar con la frase "A lo mejor el negocio ya no está publicado o la dirección quedó mal escrita." y ofrecer un enlace de regreso con el texto "Ir al inicio". NO DEBE mostrar detalles técnicos, ni rastros de la plantilla, ni enlaces a páginas inexistentes.

#### Scenario: URL desconocida

- **WHEN** alguien abre una URL que no corresponde a ninguna página del sitio
- **THEN** ve, dentro del layout con header y footer, el encabezado "No encontramos esta página", la frase "A lo mejor el negocio ya no está publicado o la dirección quedó mal escrita." y el enlace "Ir al inicio", y la respuesta tiene código 404

#### Scenario: la 404 no es una página en inglés ni un volcado técnico

- **WHEN** se revisa la página de no encontrado
- **THEN** todo su texto está en español, no aparece ningún mensaje de error técnico ni de la plantilla de Next.js, y el único enlace lleva a la home

### Requirement: Enlaces internos a rutas existentes y enlaces externos protegidos

Todo enlace interno del sitio DEBE apuntar a una ruta que existe, incluidas las rutas dinámicas, cuyos destinos se resuelven desde el catálogo (categorías) o desde los negocios publicados; ningún enlace DEBE llevar a una página pendiente (los legales de E6). Todo enlace que salga del sitio y abra en pestaña nueva (WhatsApp, mapas, la página que registró un negocio) DEBE llevar `rel="noopener noreferrer"`. Los enlaces de llamada (`tel:`) NO DEBEN abrir pestaña nueva y por lo tanto no requieren ese atributo. El footer sigue sin enlaces mientras las páginas legales no existan.

#### Scenario: enlace interno a una ruta inexistente

- **WHEN** se agrega en el código de interfaz un enlace a una ruta que el sitio no tiene
- **THEN** la verificación automática del sitio falla, señalando ese enlace

#### Scenario: enlaces a rutas dinámicas

- **WHEN** se revisan los enlaces a listados de categoría y a fichas de negocio
- **THEN** cada uno corresponde a una ruta dinámica declarada del sitio, cuyo destino existe (un slug del catálogo, un negocio publicado)

#### Scenario: enlaces externos protegidos

- **WHEN** se revisa cualquier enlace que abre en pestaña nueva hacia WhatsApp, Google Maps o la página que registró un negocio
- **THEN** lleva `rel="noopener noreferrer"`

#### Scenario: enlace de llamada

- **WHEN** se revisa el botón "Llamar" de una ficha
- **THEN** usa un enlace `tel:` que no abre pestaña nueva
