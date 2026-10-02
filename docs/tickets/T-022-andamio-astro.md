# T-022 · Andamio de Astro en la raíz (Fase 1)

**Estado:** en-review <!-- pendiente | en-spec | en-desarrollo | en-review | hecho -->
**Prioridad:** P1
**Épica:** E9 (docs/backlog.md)
**Referencias PRD:** v2 §10 (técnica reemplazable); ADR-013
**Depende de:** T-021 (go del spike)
**OpenSpec change:** `agregar-andamio-astro`
**PR:** —

## Contexto

Astro + `@astrojs/vercel` + `@astrojs/react` + Tailwind 4 + Vitest conviven con `src/lib` y `src/components` sin tocarlos; ESLint sin `eslint-config-next`; CI con `astro build`. Migración sin cambio de comportamiento: las specs de `openspec/specs/` son el contrato. Se integra en la rama larga `migracion-astro`; nada llega a `main` hasta el corte (T-027).

## Criterios de aceptación

- [x] `astro build` y `npm test` de `src/lib` en verde
- [x] Los 41 archivos de pruebas de render siguen pasando sin cambios de aserciones (en realidad son 43; todos en verde)
- [x] Existe una capa de compatibilidad (`Link`, `Imagen`) que reemplaza `next/link`/`next/image` en los componentes
- [ ] El CI corre lint, build y test del nuevo marco (configurado; falta verlo en verde en el PR)

## Fuera de alcance de este ticket

- Cambios de comportamiento de producto o de copy.
- Fases posteriores.

## Notas

- Costos conocidos del spike (PR #29): `checkOrigin` con 403 en inglés y sin cabeceras; PRG por `Referer` con `strict-origin`; cabeceras en prerenderizadas vía integración propia; 20 de 44 componentes usan `next/link`/`next/image`, 9 reciben Server Actions como prop.
- Ruta completa del pipeline (toca superficies sensibles).
