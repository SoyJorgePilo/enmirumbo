---
description: Implementa un change OpenSpec aprobado - rama, código tarea por tarea, revisión y PR
argument-hint: <change-id>
---

Ejecuta la etapa 5 del proceso (`docs/proceso.md`) para el change $ARGUMENTS:

1. Verifica que `openspec/changes/$ARGUMENTS/` existe y pregunta al usuario si la spec ya está aprobada, salvo que lo haya dicho en esta conversación. Sin aprobación no se implementa.
2. Actualiza el ticket asociado a estado `en-desarrollo`. Crea la rama `feature/$ARGUMENTS` desde `main` actualizado.
3. Implementa `tasks.md` tarea por tarea, marcando cada `- [x]` al completarla y verificarla. Respeta el alcance de la spec: lo que no está en los deltas no se construye. Commits pequeños por tarea o grupo coherente.
4. Al terminar: `npm run lint` y `npm run build` en verde (y tests si existen).
5. Lanza el agente `revisor` con el change-id y el diff `main...HEAD`. Corrige lo que reporte como `cambios requeridos` y vuelve a pasar la revisión.
6. Con veredicto `aprobado`: push de la rama y abre el PR con `gh pr create`. El cuerpo del PR: qué hace (2-3 frases), referencia al ticket y al change, checklist de criterios de aceptación del ticket, y el resultado de lint/build.
7. Actualiza el ticket: estado `en-review` y el número de PR. Reporta al usuario el link del PR.

El merge lo hace el usuario (punto de control humano #2). Tras el merge, recuérdale cerrar el ciclo: archivar el change, consolidar specs, ticket a `hecho` y correr `/checkpoint`.
