---
description: Convierte un ticket en una propuesta de cambio OpenSpec lista para aprobación humana
argument-hint: T-XXX
---

Ejecuta la etapa 4 del proceso (`docs/proceso.md`) para el ticket $ARGUMENTS:

1. Verifica que el ticket existe en `docs/tickets/` y está en estado `pendiente`. Si no, detente y repórtalo.
2. Lanza el agente `spec-writer` con el ticket para que cree el change OpenSpec en `openspec/changes/`.
3. Cuando termine, presenta al usuario un resumen para aprobación: id del change, requirements/scenarios clave, tareas de tasks.md y las dudas abiertas que el agente haya señalado.
4. NO empieces a implementar. La aprobación de la spec es el punto de control humano #1: espera a que el usuario apruebe o pida ajustes. Si pide ajustes, edita el change y vuelve a presentar.
