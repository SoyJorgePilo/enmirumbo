---
description: Cierra el ciclo de una feature o hito con su entrada de devlog (building in public)
argument-hint: [tema opcional, ej. "primer deploy"]
---

Ejecuta la etapa 7 del proceso (`docs/proceso.md`):

1. Si hay cierre pendiente de un change mergeado, complétalo primero: mover el change a `openspec/changes/archive/`, aplicar sus deltas a `openspec/specs/`, ticket a `hecho`.
2. Lanza el agente `cronista` para escribir la entrada de devlog. Si el usuario dio un tema en $ARGUMENTS, úsalo como foco; si no, el cronista lo deduce de lo ocurrido desde la última entrada.
3. Muestra al usuario la entrada y el extracto propuesto para redes. Ajusta si lo pide.
4. Commitea la entrada (y el cierre del paso 1 si lo hubo) en `main` con mensaje `docs: checkpoint <fecha>`.
