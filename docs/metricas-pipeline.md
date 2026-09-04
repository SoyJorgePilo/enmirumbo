# Métricas del pipeline multiagente

> El pipeline se mide por retrabajo, no por volumen (ver `docs/proceso.md` §Medición). Una fila por corrida de `/implementar` o `/rapido`. "1a pasada" = veredicto del validador sin necesidad de regresar a etapas previas. "Post-merge" = commits de corrección sobre esa feature en las 2 semanas siguientes (se rellena después, normalmente en el `/checkpoint`).
>
> Las filas solo son comparables entre sí mientras el reparto de modelos por agente no cambie (ADR-008). Si se toca, se anota aquí la fecha del cambio y las corridas anteriores no se promedian con las posteriores.

| Fecha | Change/fix | Ruta | Iter. C (dev↔seg) | Hallazgos validador | 1a pasada | PR | Post-merge |
|---|---|---|---|---|---|---|---|
| 2026-09-03 | agregar-modelo-datos | completa (sin etapa A: change sin UI) | 0 | 0 bloqueantes (1 editorial: línea redundante en `.gitignore`) | sí | [#2](https://github.com/SoyJorgePilo/necesitouno/pull/2) | |
| 2026-09-03 | agregar-layout-base | completa | 0 | 0 bloqueantes (M-1 operativo de c-seguridad atendido con staging explícito) | sí | [#3](https://github.com/SoyJorgePilo/necesitouno/pull/3) | — |
| 2026-09-03 | deuda-post-merge | corta | — | 1 alto corregido (`.env.example` ignorado por `.gitignore`) | no | [#4](https://github.com/SoyJorgePilo/necesitouno/pull/4) | |
| 2026-09-03 | agregar-formulario-registro | completa | 1 (1 alto + 6 medios, corregidos y re-verificados en la iteración) | 0 bloqueantes (3 notas informativas: no-op en un test, convención de teléfonos ficticios, fusión de scenarios al archivar) | sí | [#5](https://github.com/SoyJorgePilo/necesitouno/pull/5) | |
| 2026-09-03 | agregar-directorio-publico | completa | 1 (0 críticos/altos; 2 medios corregidos —`tel:` sin normalizar y guarda del seed— y re-verificados) | 0 bloqueantes (1 decisión de producto tomada: el fijo no marcable como texto; 5 notas: format-detection, convención de fijos ficticios —reincidente—, marcador de foto en la ficha, salto h1→h3 en el listado, conteo real 14 req/54 sc) | sí | PENDIENTE_PR | |

## Qué mirar cada ~5 corridas

- Si la etapa C casi nunca encuentra nada → candidata a fusionarse con el validador.
- Si el validador rechaza seguido por cosas que el CI ya habría atrapado → recortar su checklist mecánico.
- Si la etapa A (UI) genera retrabajo al reemplazar mocks → ejecutar el criterio de salida del experimento (proceso §5).
- Si "Post-merge" crece → el pipeline aprueba cosas que no debería; endurecer antes que acelerar.
