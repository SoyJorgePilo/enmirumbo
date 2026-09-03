# layout-base — deltas

## ADDED Requirements

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

### Requirement: Home provisional que usa el layout

La ruta raíz (`/`) DEBE mostrar una página de inicio provisional con contenido mínimo dentro del layout global — la marca y una frase de bienvenida en español mexicano coloquial — sin buscador, categorías ni ningún componente de feature (la home real llega con E2-1). Todo texto residual de la plantilla de create-next-app DEBE desaparecer.

#### Scenario: home provisional visible

- **WHEN** un vecino abre la ruta raíz del sitio
- **THEN** ve, dentro del layout con header y footer, un encabezado de bienvenida y la frase "Muy pronto vas a poder encontrar aquí los negocios y servicios de Tizayuca."

#### Scenario: sin rastros de la plantilla

- **WHEN** se abre la ruta raíz
- **THEN** no aparece ningún texto, logo ni enlace de la plantilla de Next.js/Vercel
