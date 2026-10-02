# T-024 · Formularios públicos en Astro (Fase 3)

**Estado:** en-review <!-- pendiente | en-spec | en-desarrollo | en-review | hecho -->
**Prioridad:** P1
**Épica:** E9 (docs/backlog.md)
**Referencias PRD:** v2 §10 (técnica reemplazable); ADR-013
**Depende de:** T-023
**OpenSpec change:** `migrar-formularios-publicos-astro` (3a: reportar + lo transversal); 3b `migrar-registro-astro` pendiente
**PR:** —

## Contexto

Registro (multipart con foto, cupos por IP, versión del aviso) y reportar, con Astro Actions. Migración sin cambio de comportamiento: las specs de `openspec/specs/` son el contrato. Se integra en la rama larga `migracion-astro`; nada llega a `main` hasta el corte (T-027).

## Criterios de aceptación

- [ ] Scenarios de `registro`, `foto` y `reportes` en verde, incluidas las adversariales de cupos y foto
- [ ] Envío sin JS: `Origin` correcto, sin 500 y sin reenvío al recargar
- [ ] El 403 de `checkOrigin` sale en español y con cabeceras de seguridad
- [ ] Cada Action delega en `src/lib/` sin lógica nueva

## Fuera de alcance de este ticket

- Cambios de comportamiento de producto o de copy.
- Fases posteriores.

## Notas

- Costos conocidos del spike (PR #29): `checkOrigin` con 403 en inglés y sin cabeceras; PRG por `Referer` con `strict-origin`; cabeceras en prerenderizadas vía integración propia; 20 de 44 componentes usan `next/link`/`next/image`, 9 reciben Server Actions como prop.
- Ruta completa del pipeline (toca superficies sensibles).
- 3a (`migrar-formularios-publicos-astro`: reportar + lo transversal) en review; el ticket NO pasa a hecho hasta mergear 3b (`migrar-registro-astro`: registro con foto y verificación SMS). Pendiente humano de 3a: tarea 19 (preview de Vercel sin JS en Chrome y Firefox, `curl` de cabeceras, cupo con `x-forwarded-for` falso, HSTS).
