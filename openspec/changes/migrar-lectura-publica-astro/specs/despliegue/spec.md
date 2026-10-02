# Delta: despliegue

> Enmienda de letra, **sin cambio de comportamiento** (ADR-013; pendiente desde T-022, cuyo `proposal.md` la listó). El requirement nombra `next build`, y en la rama de la migración el build de producción ya es `astro build`. La redacción nueva nombra el build de producción sin atarlo a un marco, y deja dicho cómo se rinde "por petición" en cada uno.

## MODIFIED Requirements

### Requirement: El build de producción no necesita la base de datos

El build de producción (`npm run build`) DEBE completarse sin ninguna base de datos accesible: ninguna página DEBE consultar la base al construir. Toda ruta que lea la base DEBE renderizarse por petición, y ninguna DEBE marcarse para generarse al construir (prerenderizarse). El CI DEBE construir sin base accesible, de modo que una ruta nueva que rompa esta regla reprueba el PR en vez de descubrirse en el primer deploy.

#### Scenario: build sin base

- **WHEN** se corre el build de producción sin ninguna base disponible ni alcanzable
- **THEN** termina con éxito y no intenta conectarse

#### Scenario: una ruta nueva que lee la base al construir

- **WHEN** alguien agrega una página que consulta la base y no se rinde por petición
- **THEN** la verificación automática lo señala y el PR falla
