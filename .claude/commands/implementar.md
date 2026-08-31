---
description: Implementa un change OpenSpec aprobado con el pipeline multiagente - UI, dev, seguridad/test y validador (que commitea y abre el PR)
argument-hint: <change-id>
---

Ejecuta la etapa 5 del proceso (`docs/proceso.md`) para el change $ARGUMENTS. Tú orquestas; los agentes ejecutan. No implementes tú lo que le toca a un agente.

**Preparación**

1. Verifica que `openspec/changes/$ARGUMENTS/` existe y pregunta al usuario si la spec ya está aprobada, salvo que lo haya dicho en esta conversación. Sin aprobación no se implementa.
2. Actualiza el ticket asociado a estado `en-desarrollo`. Crea la rama `feature/$ARGUMENTS` desde `main` actualizado.

**Pipeline (los agentes NO commitean; solo el validador toca git). El handoff entre etapas es por archivo: cada agente escribe su reporte en `openspec/changes/$ARGUMENTS/reports/` y el siguiente lo lee de ahí — al lanzar cada agente, indícale la ruta de los reportes previos, no le resumas tú el contenido.**

3. **Etapa A — `ui`** (solo si el change tiene superficie de interfaz; un change de puro backend/datos la salta): construye componentes, páginas, copy y estados con datos mock según la spec. Deja `reports/a-ui.md`.
4. **Etapa B — `dev`**: implementa `tasks.md` tarea por tarea en TDD (test del scenario primero, código después) — modelo de datos, lógica de servidor, integración de la UI reemplazando los mocks según `reports/a-ui.md`. Deja `reports/b-dev.md`.
5. **Etapa C — `seguridad-test`**: audita la seguridad del diff y añade tests adversariales; revisa el mapa scenario→test del dev. Si reporta hallazgos críticos/altos o defectos funcionales, regresa al `dev` (o al `ui` si es de interfaz) apuntándole a `reports/c-seguridad.md`, y repite la etapa C hasta quedar limpio. Máximo 3 iteraciones; si no converge, detente y consulta al usuario.
6. **Etapa D — `validador`**: valida todo de forma independiente (spec, ticket, alcance, compuertas). Si rechaza, regresa los hallazgos al agente correspondiente y vuelve a validar. Si aprueba: él mismo commitea, hace push y abre el PR.

**Cierre**

7. Agrega la fila de la corrida a `docs/metricas-pipeline.md` (ruta: completa; iteraciones de la etapa C; hallazgos del validador; veredicto de primera pasada).
8. Reporta al usuario: link del PR (recordando que el CI debe quedar en verde), resumen de lo que hizo cada etapa y cualquier propuesta fuera de alcance que los agentes hayan anotado (candidatas a nuevos tickets).

El merge lo hace el usuario (punto de control humano #2). Tras el merge, recuérdale cerrar el ciclo con `/checkpoint` (archiva el change, consolida specs, ticket a `hecho`, devlog).
