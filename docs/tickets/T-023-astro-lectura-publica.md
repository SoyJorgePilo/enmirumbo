# T-023 · Superficie pública de lectura en Astro (Fase 2)

**Estado:** en-review <!-- pendiente | en-spec | en-desarrollo | en-review | hecho --> — mitad 2a en review (PR #32); mitad 2b (`/[destino]`, `/negocio/[ficha]`, `/buscar`, fotos) en review (PR #33, apilado sobre #32): A1 de d-validacion resuelto y re-validado. Pendiente humano: preview de Vercel y Lighthouse (tarea 19 de 2b) y el merge (tarea 20). El ticket no pasa a hecho hasta mergear las dos
**Prioridad:** P1
**Épica:** E9 (docs/backlog.md)
**Referencias PRD:** v2 §10 (técnica reemplazable); ADR-013
**Depende de:** T-022
**OpenSpec change:** `migrar-lectura-publica-astro` (Fase 2a) · `migrar-directorio-publico-astro` (Fase 2b)
**PR:** #32 (mitad 2a, apilado sobre #31) — https://github.com/SoyJorgePilo/enmirumbo/pull/32 · #33 (mitad 2b, apilado sobre #32) — https://github.com/SoyJorgePilo/enmirumbo/pull/33

## Contexto

`/`, `/[destino]`, `/negocio/[ficha]`, `/buscar`, legales, 404, `sitemap`, `robots`, OG y ruta de fotos. Migración sin cambio de comportamiento: las specs de `openspec/specs/` son el contrato. Se integra en la rama larga `migracion-astro`; nada llega a `main` hasta el corte (T-027).

## Criterios de aceptación

- [ ] Scenarios de `directorio`, `buscador`, `seo-local`, `paginas-legales` y `layout-base` en verde
- [ ] Diff de HTML contra la versión Next sin diferencias de contenido, enlaces, `<meta>` ni JSON-LD
- [ ] Cabeceras de seguridad idénticas en dinámicas, prerenderizadas y 404
- [ ] Lighthouse móvil ≥ 100 y 0 KB de JS propio en páginas sin interacción

## Fuera de alcance de este ticket

- Cambios de comportamiento de producto o de copy.
- Fases posteriores.

## Notas

- Costos conocidos del spike (PR #29): `checkOrigin` con 403 en inglés y sin cabeceras; PRG por `Referer` con `strict-origin`; cabeceras en prerenderizadas vía integración propia; 20 de 44 componentes usan `next/link`/`next/image`, 9 reciben Server Actions como prop.
- Ruta completa del pipeline (toca superficies sensibles).
