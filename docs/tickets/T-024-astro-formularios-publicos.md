# T-024 · Formularios públicos en Astro (Fase 3)

**Estado:** en-desarrollo <!-- pendiente | en-spec | en-desarrollo | en-review | hecho --> — 3a mergeada en `migracion-astro` (PR #36); 3b-1 en review (PR #37); 3b-2 en spec, pendiente de aprobación humana. No pasa a hecho hasta mergear 3b-2
**Prioridad:** P1
**Épica:** E9 (docs/backlog.md)
**Referencias PRD:** v2 §10 (técnica reemplazable); ADR-013
**Depende de:** T-023
**OpenSpec change:** `migrar-formularios-publicos-astro` (3a: reportar + lo transversal); `migrar-registro-astro` (3b-1: `/registro` con foto, `/registro/gracias`, `acciones.ts` sin Next, O1); `migrar-verificacion-sms-astro` (3b-2: `/registro/verificar` con `confirmar`/`reenviar` tras la bandera; spec escrita, PR hacia `migracion-astro` tras mergear #37)
**PR:** #36 (3a, hacia `migracion-astro`) — https://github.com/SoyJorgePilo/enmirumbo/pull/36; #37 (3b-1, hacia `migracion-astro`) — https://github.com/SoyJorgePilo/enmirumbo/pull/37

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
- 3a (`migrar-formularios-publicos-astro`: reportar + lo transversal) en review. El ticket NO pasa a hecho hasta mergear 3b-1 (`migrar-registro-astro`) y 3b-2 (`migrar-verificacion-sms-astro`).
- Estado de la bandera: la verificación por SMS NO se enciende en ningún entorno de `migracion-astro` hasta mergear 3b-2 (antes de eso, `/registro/verificar` no existe en Astro). Con 3b-2 mergeado, ya puede encenderse en un preview de `migracion-astro` (y se apaga al terminar). El panel que muestra la marca sigue en Next hasta la Fase 5. Pendiente humano de 3a: tarea 19 (preview de Vercel sin JS en Chrome y Firefox, `curl` de cabeceras, cupo con `x-forwarded-for` falso, HSTS).
