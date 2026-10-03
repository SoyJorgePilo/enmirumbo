# T-026 · Panel admin en Astro (Fase 5)

**Estado:** en-review <!-- pendiente | en-spec | en-desarrollo | en-review | hecho --> — 5a en review; 5b, 5c, 5d pendientes
**Prioridad:** P1
**Épica:** E9 (docs/backlog.md)
**Referencias PRD:** v2 §10 (técnica reemplazable); ADR-013
**Depende de:** T-025
**OpenSpec change:** `migrar-panel-admin-base-astro` (5a, en review). Propuestos, sin especificar: `migrar-panel-admin-detalle-astro` (5b), `migrar-panel-admin-acciones-ficha-astro` (5c), `migrar-panel-admin-ediciones-astro` (5d)
**PR:** [#42](https://github.com/SoyJorgePilo/enmirumbo/pull/42) (5a, borrador apilado sobre #38)

## Contexto

Acceso, sesión, cola, detalle, 7 acciones, listado y ediciones. Migración sin cambio de comportamiento: las specs de `openspec/specs/` son el contrato. Se integra en la rama larga `migracion-astro`; nada llega a `main` hasta el corte (T-027).

## Criterios de aceptación

- [ ] Scenarios de `panel-admin` en verde contra Postgres real
- [ ] Sesión firmada y límite de acceso intactos; rutas de admin inaccesibles sin sesión
- [ ] Exclusión de analítica en admin intacta

## Fuera de alcance de este ticket

- Cambios de comportamiento de producto o de copy.
- Fases posteriores.

## Notas

- Costos conocidos del spike (PR #29): `checkOrigin` con 403 en inglés y sin cabeceras; PRG por `Referer` con `strict-origin`; cabeceras en prerenderizadas vía integración propia; 20 de 44 componentes usan `next/link`/`next/image`, 9 reciben Server Actions como prop.
- Ruta completa del pipeline (toca superficies sensibles).
