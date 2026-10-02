# T-023 · Superficie pública de lectura en Astro (Fase 2)

**Estado:** en-review <!-- pendiente | en-spec | en-desarrollo | en-review | hecho --> — mitad 2a en review; la 2b (`/[destino]`, `/negocio/[ficha]`, `/buscar`, fotos) sigue pendiente, así que el ticket NO pasa a hecho con este PR
**Prioridad:** P1
**Épica:** E9 (docs/backlog.md)
**Referencias PRD:** v2 §10 (técnica reemplazable); ADR-013
**Depende de:** T-022
**OpenSpec change:** `migrar-lectura-publica-astro` (Fase 2a; la 2b se propone como change aparte, ver su `proposal.md`)
**PR:** —

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
