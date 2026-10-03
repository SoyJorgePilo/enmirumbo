# T-025 · Enlace de gestión en Astro (Fase 4)

**Estado:** en-review <!-- pendiente | en-spec | en-desarrollo | en-review | hecho -->
**Prioridad:** P1
**Épica:** E9 (docs/backlog.md)
**Referencias PRD:** v2 §10 (técnica reemplazable); ADR-013
**Depende de:** T-024
**OpenSpec change:** `migrar-enlace-gestion-astro`
**PR:** —

## Contexto

`/editar/[token]` y su Action. Migración sin cambio de comportamiento: las specs de `openspec/specs/` son el contrato. Se integra en la rama larga `migracion-astro`; nada llega a `main` hasta el corte (T-027).

## Criterios de aceptación

- [x] Scenarios de `gestion` en verde
- [x] El token no aparece en `Referer` ni en la analítica (guardianes intactos)
- [x] `Referrer-Policy: strict-origin` en el grupo de gestión

## Fuera de alcance de este ticket

- Cambios de comportamiento de producto o de copy.
- Fases posteriores.

## Notas

- Costos conocidos del spike (PR #29): `checkOrigin` con 403 en inglés y sin cabeceras; PRG por `Referer` con `strict-origin`; cabeceras en prerenderizadas vía integración propia; 20 de 44 componentes usan `next/link`/`next/image`, 9 reciben Server Actions como prop.
- Ruta completa del pipeline (toca superficies sensibles).
