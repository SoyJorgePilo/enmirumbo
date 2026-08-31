# Métricas del pipeline multiagente

> El pipeline se mide por retrabajo, no por volumen (ver `docs/proceso.md` §Medición). Una fila por corrida de `/implementar` o `/rapido`. "1a pasada" = veredicto del validador sin necesidad de regresar a etapas previas. "Post-merge" = commits de corrección sobre esa feature en las 2 semanas siguientes (se rellena después, normalmente en el `/checkpoint`).

| Fecha | Change/fix | Ruta | Iter. C (dev↔seg) | Hallazgos validador | 1a pasada | PR | Post-merge |
|---|---|---|---|---|---|---|---|

## Qué mirar cada ~5 corridas

- Si la etapa C casi nunca encuentra nada → candidata a fusionarse con el validador.
- Si el validador rechaza seguido por cosas que el CI ya habría atrapado → recortar su checklist mecánico.
- Si la etapa A (UI) genera retrabajo al reemplazar mocks → ejecutar el criterio de salida del experimento (proceso §5).
- Si "Post-merge" crece → el pipeline aprueba cosas que no debería; endurecer antes que acelerar.
