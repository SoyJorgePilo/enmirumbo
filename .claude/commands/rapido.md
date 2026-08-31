---
description: Ruta corta para fixes y chores - sin spec ni pipeline completo, con validador y PR
argument-hint: <descripción del cambio o T-XXX>
---

Ejecuta la ruta corta del proceso (`docs/proceso.md` §5b) para: $ARGUMENTS

1. **Verifica elegibilidad** antes de tocar código. Elegible solo si TODO se cumple: el cambio se describe en una frase; no cambia comportamiento de producto definido en `openspec/specs/`; no toca superficies sensibles (formulario público de registro, panel admin, enlaces de gestión, manejo de datos personales). Si no califica, dilo y propone la ruta completa (ticket + `/spec`).
2. Crea la rama `fix/<slug>` desde `main` actualizado e implementa tú directamente. Cambio mínimo, estilo del código vecino; si el fix es de lógica, acompáñalo de su test de regresión.
3. `npm run lint`, `npm run build`, `npm test` en verde. No commitees.
4. Lanza el agente `validador` en modo ruta corta (él re-verifica la elegibilidad; si detecta superficie sensible, aborta y regresa a la ruta completa). Si aprueba, él commitea, hace push y abre el PR.
5. Agrega la fila de la corrida a `docs/metricas-pipeline.md` (ruta: corta) y reporta al usuario el link del PR. El merge lo hace el usuario con el CI en verde.
