# T-027 · Corte a producción y retiro de Next (Fase 6)

**Estado:** pendiente <!-- pendiente | en-spec | en-desarrollo | en-review | hecho -->
**Prioridad:** P1
**Épica:** E9 (docs/backlog.md)
**Referencias PRD:** v2 §10 (técnica reemplazable); ADR-013
**Depende de:** T-026 y T-021 completo
**OpenSpec change:** —
**PR:** —

## Contexto

Tareas programadas, cabeceras finales, retiro de `next`/`eslint-config-next`/`AGENTS.md`, docs y deploy con rollback. Migración sin cambio de comportamiento: las specs de `openspec/specs/` son el contrato. Se integra en la rama larga `migracion-astro`; nada llega a `main` hasta este ticket.

## Criterios de aceptación

- [ ] Suite completa en verde y prueba de humo de `docs/despliegue.md` en preview
- [ ] Evidencia del preview de T-021 completa (los 5 puntos con veredicto real)
- [ ] Crons de `vercel.json` responden igual (404 a extraños)
- [ ] ADR-001 pasa a `reemplazada`; CLAUDE.md, despliegue.md y PRD v2 §10 actualizados

## Fuera de alcance de este ticket

- Cambios de comportamiento de producto o de copy.
- Fases posteriores.

## Notas

- Costos conocidos del spike (PR #29): `checkOrigin` con 403 en inglés y sin cabeceras; PRG por `Referer` con `strict-origin`; cabeceras en prerenderizadas vía integración propia; 20 de 44 componentes usan `next/link`/`next/image`, 9 reciben Server Actions como prop.
- Ruta completa del pipeline (toca superficies sensibles).
