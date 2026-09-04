# Spec: layout-base

## Requirements

### Requirement: Layout global con header y footer en todas las páginas

Toda página del sitio DEBE renderizarse dentro de un layout global con un header que muestra la marca como wordmark tipográfico "NecesitoUno" acompañado del posicionamiento "Tizayuca", y un footer al final de la página. El footer DEBE dejar previsto el espacio para las páginas legales (E6) sin incluir enlaces muertos.

#### Scenario: header con marca y posicionamiento

- **WHEN** un vecino abre cualquier página del sitio en su celular
- **THEN** ve en la parte superior el wordmark "NecesitoUno" junto con "Tizayuca" como posicionamiento visible

#### Scenario: footer presente sin enlaces muertos

- **WHEN** el vecino llega al final de cualquier página
- **THEN** ve el footer con la identificación del sitio ("NecesitoUno Tizayuca") y ningún enlace que lleve a una página inexistente

### Requirement: Paleta y tipografía como tokens reutilizables con el verde WhatsApp como acción principal

La paleta de colores y la tipografía DEBEN estar definidas como tokens con nombre en la configuración de Tailwind (bloque `@theme` de `globals.css`), de modo que las pantallas futuras las consuman por nombre y no con valores sueltos. El verde WhatsApp DEBE existir como token y estar documentado en el propio archivo como el color de acción principal del sitio; ningún otro token de la paleta DEBE competir con él como color de acción.

#### Scenario: el verde de acción está tokenizado y documentado

- **WHEN** un desarrollador abre la configuración de tokens para estilizar un botón de acción
- **THEN** encuentra el token del verde WhatsApp con un comentario que lo documenta como color de acción principal, y puede usarlo como clase de Tailwind sin escribir el valor hexadecimal

#### Scenario: el layout consume solo tokens

- **WHEN** se revisan el layout, el header, el footer y la home provisional
- **THEN** todos los colores y familias tipográficas provienen de los tokens definidos, sin valores hexadecimales sueltos en los componentes

### Requirement: Diseño mobile-first sin scroll horizontal

El layout DEBE verse correcto en un viewport de 390px de ancho y adaptarse hacia arriba (tablet y escritorio) sin producir scroll horizontal en ningún ancho.

#### Scenario: celular a 390px

- **WHEN** el sitio se abre en un viewport de 390px de ancho
- **THEN** el header, el contenido y el footer se ven completos y legibles, sin scroll horizontal

#### Scenario: adaptación a escritorio

- **WHEN** el sitio se abre en un viewport de tablet o escritorio
- **THEN** el contenido se adapta (por ejemplo, con un ancho máximo centrado) manteniendo la misma estructura y sin scroll horizontal

### Requirement: Accesibilidad base del PRD §8

El layout DEBE usar HTML semántico con landmarks (`header`, `main`, `footer`) y jerarquía de encabezados correcta (un solo `h1` por página). Todas las combinaciones de tokens de color usadas para texto DEBEN cumplir contraste AA (WCAG 2.1: ≥4.5:1 en texto normal). Todo elemento interactivo del layout DEBE tener un área táctil de al menos 44px.

#### Scenario: estructura semántica

- **WHEN** se inspecciona el HTML de cualquier página
- **THEN** el contenido está dentro de landmarks `header`, `main` y `footer`, y los encabezados siguen jerarquía sin saltos (un solo `h1`)

#### Scenario: contraste AA de los tokens

- **WHEN** se verifican las combinaciones texto/fondo definidas por los tokens de la paleta (incluido el texto sobre el verde de acción)
- **THEN** todas alcanzan una relación de contraste de al menos 4.5:1

#### Scenario: áreas táctiles

- **WHEN** un vecino usa el sitio en su celular
- **THEN** cualquier elemento tocable del header o el footer mide al menos 44px en su dimensión menor

### Requirement: Server Component con documento en es-MX y metadata base

El layout global DEBE ser un Server Component que no envíe JavaScript de cliente propio. El documento DEBE declarar `lang="es-MX"` y exponer metadata base del sitio: título "NecesitoUno Tizayuca — Encuentra negocios y servicios en Tizayuca" y descripción "Encuentra negocios, servicios y deporte en Tizayuca y contáctalos directo por WhatsApp. Registro gratis para negocios locales."

#### Scenario: documento en español de México con metadata

- **WHEN** se carga cualquier página del sitio
- **THEN** el HTML declara `lang="es-MX"` y el `<title>` y la meta descripción incluyen "Tizayuca"

#### Scenario: sin JS de cliente en el layout

- **WHEN** se construye el sitio y se revisa el layout, el header y el footer
- **THEN** ninguno usa la directiva `"use client"` ni agrega bundles de cliente propios

### Requirement: Home del sitio dentro del layout, con la entrada al registro`

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
