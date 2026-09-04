# Delta de spec: layout-base

## MODIFIED Requirements

### Requirement: Home provisional que usa el layout

La ruta raíz (`/`) DEBE mostrar una página de inicio provisional con contenido mínimo dentro del layout global — la marca, una frase de bienvenida en español mexicano coloquial y la entrada al registro de negocios (PRD §7, Flujo A) — sin buscador, categorías ni ningún otro componente de feature (la home real llega con E2-1). Todo texto residual de la plantilla de create-next-app DEBE seguir ausente. El enlace al registro DEBE mostrarse con el texto literal "Registra tu negocio gratis", con el estilo de acción principal (verde WhatsApp) y área táctil de al menos 44px. El footer sigue sin enlaces a páginas inexistentes.

#### Scenario: home provisional visible

- **WHEN** un vecino abre la ruta raíz del sitio
- **THEN** ve, dentro del layout con header y footer, un encabezado de bienvenida y la frase "Muy pronto vas a poder encontrar aquí los negocios y servicios de Tizayuca."

#### Scenario: entrada al registro desde la home

- **WHEN** el dueño de un negocio abre la ruta raíz en su celular
- **THEN** ve un enlace visible con el texto "Registra tu negocio gratis" que lo lleva a la página de registro

#### Scenario: sin rastros de la plantilla

- **WHEN** se abre la ruta raíz
- **THEN** no aparece ningún texto, logo ni enlace de la plantilla de Next.js/Vercel

#### Scenario: sin enlaces muertos

- **WHEN** se revisan todos los enlaces de la home y del layout
- **THEN** cada uno apunta a una ruta que existe en el sitio (la home y el registro), y ninguno a una página pendiente (legales de E6)
