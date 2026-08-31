# ADR-002 · Ajustes al pipeline multiagente (proceso v0.3)

**Fecha:** 2026-08-31 · **Estado:** aceptada

## Contexto

Antes de estrenar el pipeline v0.2 (spec-writer → ui → dev → seguridad-test → validador) investigamos el estado del arte 2025-2026 en tres frentes: guía oficial de vendors (Anthropic, OpenAI, docs de Claude Code), metodologías de spec-driven development (GitHub Spec Kit, Amazon Kiro, OpenSpec, BMAD) y pipelines reales publicados (Cloudflare, sistema multiagente interno de Anthropic, Simon Willison, Jesse Vincent, Armin Ronacher, DORA 2025).

Lo que el consenso considera world-class: (1) el gate humano va en la spec, antes del código; (2) pocos roles con fronteras claras — BMAD llegó a 12+ agentes y retrocedió fusionándolos; multi-agente cuesta ~15x tokens y solo paga en trabajo paralelizable; (3) nadie califica su propio trabajo — el revisor necesita contexto fresco; (4) gates deterministas (CI, tests) por encima del juicio de cualquier agente — hay agentes documentados marcando verificaciones como hechas sin hacerlas; (5) el artefacto de handoff versionado ES el pipeline — el contexto pasado por conversación pierde el contexto de decisión en cada salto; (6) ceremonia proporcional al cambio — Spec Kit midió ~10x de overhead aplicado a todo por igual; (7) el pipeline se mide por retrabajo (rework/churn post-merge), no por volumen de PRs (DORA 2025: +98% PRs con métricas de entrega planas).

El v0.2 ya cumplía 1, 2, 3 y parte de 5. Los gaps: sin gate determinista externo, ceremonia plana, handoffs conversacionales, tests después del código, y cero medición.

## Decisión

1. **CI en GitHub Actions** (`.github/workflows/ci.yml`): lint + build + test en cada PR y push a main. El veredicto de un agente no sustituye al CI.
2. **Ruta corta `/rapido`** para fixes/chores describibles en una frase que no tocan superficies sensibles ni comportamiento especificado; el validador re-verifica la elegibilidad y puede escalar a ruta completa.
3. **Handoffs por archivo**: cada etapa escribe su reporte en `openspec/changes/<id>/reports/` y la siguiente lo lee de ahí.
4. **TDD en el dev**: test por scenario primero, código después; `seguridad-test` deja de escribir los tests base y pasa a auditoría + tests adversariales.
5. **Bitácora de métricas** (`docs/metricas-pipeline.md`): una fila por corrida; cada ~5 corridas se evalúa si alguna etapa no paga su costo y se recorta.

Además: la etapa UI-first con mocks queda marcada como **experimento** — ninguna fuente respalda ese orden (el patrón dominante es implementación integrada); criterio de salida definido en proceso §5.

## Alternativas consideradas

- **Adoptar Spec Kit o BMAD completos:** descartado — la evidencia de overhead (10x, 2,500+ líneas de Markdown por feature) y el retroceso de BMAD confirman que nuestro OpenSpec ligero + roles propios es el punto correcto del espectro para un equipo de una persona.
- **Más agentes (rendimiento, docs, arquitectura como Cloudflare):** descartado por ahora — Cloudflare estratifica 2-7 revisores según riesgo del MR con presupuesto de empresa; nuestra bitácora de métricas decidirá con datos si alguna revisión extra paga.
- **Hooks de Claude Code como gate local (Stop hook):** pospuesto — el CI cubre el mismo riesgo con menos piezas; se reconsidera si los agentes reportan gates en verde que el CI desmiente.

## Consecuencias

- El PR solo se mergea con CI en verde; primer costo: mantener el build siempre verde en main.
- La ruta corta reintroduce juicio ("¿califica?") — el doble check (sesión principal + validador) lo acota.
- Si el experimento UI-first falla, el agente `ui` cambia de constructor a revisor de interfaz (se decidirá con la primera feature con UI).

## Fuentes principales

Anthropic: [Claude Code Best Practices](https://code.claude.com/docs/en/best-practices) · [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) · [Multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) · [Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents). OpenAI: [A practical guide to building agents](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf). SDD: [Spec Kit](https://github.com/github/spec-kit) · [Kiro specs](https://kiro.dev/docs/specs/) · [OpenSpec](https://github.com/Fission-AI/OpenSpec) · [BMAD](https://github.com/bmad-code-org/BMAD-METHOD) · [Scott Logic — Spec Kit a prueba](https://blog.scottlogic.com/2025/11/26/putting-spec-kit-through-its-paces-radical-idea-or-reinvented-waterfall.html) · [Marmelab — Waterfall strikes back](https://marmelab.com/blog/2025/11/12/spec-driven-development-waterfall-strikes-back.html) · [Marc Brooker — Waterfall vs spec](https://brooker.co.za/blog/2026/04/09/waterfall-vs-spec.html). Industria: [Cloudflare — AI code review at scale](https://blog.cloudflare.com/ai-code-review/) · [Jesse Vincent — coding agents](https://blog.fsck.com/2025/10/05/how-im-using-coding-agents-in-september-2025/) y [Superpowers](https://blog.fsck.com/2025/10/09/superpowers/) · [Simon Willison — parallel agents](https://simonwillison.net/2025/Oct/5/parallel-coding-agents/) · [Armin Ronacher — Things that didn't work](https://lucumr.pocoo.org/2025/7/30/things-that-didnt-work/) · [Greptile — self-review](https://www.greptile.com/blog/ai-code-reviews-conflict) · [avanwyk — agentic workflow](https://avanwyk.com/an-opinionated-agentic-engineering-workflow/) · [Faros — DORA 2025](https://www.faros.ai/blog/key-takeaways-from-the-dora-report-2025).
