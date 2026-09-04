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
| 2026-09-03 | agregar-directorio-publico | completa | 1 (0 críticos/altos; 2 medios corregidos —`tel:` sin normalizar y guarda del seed— y re-verificados) | 0 bloqueantes (1 decisión de producto tomada: el fijo no marcable como texto; 5 notas: format-detection, convención de fijos ficticios —reincidente—, marcador de foto en la ficha, salto h1→h3 en el listado, conteo real 14 req/54 sc) | sí | [#6](https://github.com/SoyJorgePilo/necesitouno/pull/6) | |
| 2026-09-03 | agregar-panel-admin | completa | 1 (1 alto + 4 medios corregidos en iteración; veredicto final limpio con 5 bajos documentados) | 0 bloqueantes (1 corrección editorial aplicada por el validador: `tasks.md` #22 seguía describiendo la constancia de consentimiento como se decidió ANTES de la enmienda del `design.md` §6; 3 notas: prop `motivoPrevio` sin usar, "Revisar" `aria-hidden` en la tarjeta de la cola, revisión visual a 390px pendiente del humano) | sí | [#8](https://github.com/SoyJorgePilo/necesitouno/pull/8) | |
| 2026-09-03 | agregar-buscador | completa | 2 (0 críticos/altos; 4 medios + 2 bajos en la 1a pasada — M-1/M-2/M-3/B-1 corregidos y re-verificados; B-3 y la muletilla "tizayuca" en la iteración final; M-4 y B-2 aceptados como deuda) | 0 bloqueantes (1 desviación de spec informativa: la lista de muletillas no está en el requirement "se exigen todas" y hay que redactarla al consolidar; 3 deudas trasladadas al PR) | sí | [#7](https://github.com/SoyJorgePilo/necesitouno/pull/7) | |
| 2026-09-04 | agregar-paginas-legales | completa | 1 (1 alto + 3 medios; ALTO-1 y MEDIO-1/2 corregidos con enmienda de spec aprobada y re-verificados contra el texto servido; MEDIO-3 cerrado en la propia iteración; veredicto final limpio con 1 bajo residual) | 0 bloqueantes (contenido legal verificado byte por byte: los 3 literales aprobados —aviso, términos y aviso simplificado— coinciden con la spec enmendada; 1 bajo residual trasladado al PR: la purga de rechazados a los 90 días sigue sin ejecutor, E0-3; 5 pendientes humanos listados en el PR) | sí | | |

## Qué mirar cada ~5 corridas

- Si la etapa C casi nunca encuentra nada → candidata a fusionarse con el validador.
- Si el validador rechaza seguido por cosas que el CI ya habría atrapado → recortar su checklist mecánico.
- Si la etapa A (UI) genera retrabajo al reemplazar mocks → ejecutar el criterio de salida del experimento (proceso §5).
- Si "Post-merge" crece → el pipeline aprueba cosas que no debería; endurecer antes que acelerar.
