# Proceso de desarrollo — NecesitoUno

> Versión 0.3 — borrador para afinar. Este documento ES parte del building in public: describe cómo se construye el producto con un flujo asistido por agentes de IA.
>
> Cambios v0.3 (tras investigar el estado del arte 2026 — ver ADR-002): CI de GitHub Actions como gate determinista; ruta corta `/rapido` para cambios chicos (ceremonia proporcional al tamaño); handoffs entre agentes por archivo (`reports/`), no por conversación; el dev trabaja en TDD y seguridad-test pasa a auditoría + tests adversariales; bitácora de métricas del pipeline; la etapa UI-first queda marcada como experimento con criterio de salida. Cambios v0.2: el pipeline de implementación pasa de 1 implementador + revisor a 4 agentes especializados (ui, dev, seguridad-test, validador); solo el validador toca git.

## El flujo en una línea

```
PRD → Backlog → Ticket → Spec (OpenSpec) → Implementación multiagente → PR → Merge → Checkpoint devlog
```

## Etapas

### 1. PRD (`docs/PRD.md`)
Fuente de verdad de producto. Solo cambia con una nueva versión (v0.8, v0.9…) y su nota de cambios. Nada se implementa si contradice el PRD; si el PRD está mal, primero se corrige el PRD.

### 2. Backlog (`docs/backlog.md`)
Épicas e historias derivadas del PRD, priorizadas (P0/P1) y ordenadas por dependencia. Es la vista de "qué falta"; no baja a detalle técnico.

### 3. Ticket (`docs/tickets/T-XXX-nombre.md`)
Cuando una historia se va a trabajar, se convierte en ticket con la plantilla (`docs/tickets/_TEMPLATE.md`): contexto, criterios de aceptación verificables, dependencias y referencias al PRD. Estados: `pendiente → en-spec → en-desarrollo → en-review → hecho`.

### 4. Spec — SDD con OpenSpec (`openspec/`)
Comando: **`/spec T-XXX`** (agente `spec-writer`).

Convierte el ticket en una propuesta de cambio OpenSpec en `openspec/changes/<id>/`:
- `proposal.md` — por qué, qué cambia, impacto
- `tasks.md` — checklist de implementación
- `specs/<capacidad>/spec.md` — deltas de requisitos (ADDED/MODIFIED) con escenarios

**Punto de control humano #1:** la spec se lee y se aprueba antes de escribir código. Aquí es donde más barato es corregir.

### 5. Implementación multiagente
Comando: **`/implementar <change-id>`**. La sesión principal orquesta; cuatro agentes especializados ejecutan en cadena sobre la rama `feature/<change-id>`:

| Etapa | Agente | Hace | Entrega |
|---|---|---|---|
| A | `ui` ⚗️ | Capa de interfaz con datos mock: componentes, copy es-MX, estados, mobile-first. Se salta si el change no tiene UI | `reports/a-ui.md` con formas de datos esperadas |
| B | `dev` | Perfil de ingeniero de software en **TDD**: por cada scenario automatizable, primero el test (rojo), luego el código (verde); `tasks.md` tarea por tarea | `reports/b-dev.md` + tareas marcadas |
| C | `seguridad-test` | Auditoría de seguridad del diff (entrada, inyección, secretos, LFPDPPP) + tests adversariales que el dev no pensó. Sus hallazgos regresan al dev hasta quedar limpio | `reports/c-seguridad.md`; crítico/alto bloquea |
| D | `validador` | Compuerta final: re-verifica spec, ticket, alcance y gates de forma independiente. **Único agente que toca git**: si aprueba, commitea, push y abre el PR | `reports/d-validacion.md` + link del PR |

Reglas clave:

- **Handoff por archivo, no por conversación:** cada agente escribe su reporte en `openspec/changes/<id>/reports/` y el siguiente lo lee de ahí. Lo que no está en un archivo no existe para la siguiente etapa.
- `ui`, `dev` y `seguridad-test` trabajan sobre el working tree sin commitear — nada entra a la historia de git sin pasar por el validador.
- El veredicto local del validador no sustituye al CI: el check de GitHub Actions (lint + build + test) debe estar en verde en el PR. El CI es el gate determinista; los agentes pueden equivocarse al reportar, el CI no.

⚗️ **La etapa A (UI-first con mocks) es un experimento:** el estado del arte no la respalda (el patrón dominante es implementación integrada). Se evalúa al cerrar la primera feature con interfaz: si reemplazar los mocks generó retrabajo significativo, la etapa A se fusiona dentro del dev y el agente `ui` pasa a revisor de interfaz post-implementación.

**Punto de control humano #2:** el PR lo revisa y mergea una persona, con el CI en verde. Siempre.

### 5b. Ruta corta — `/rapido`
La ceremonia debe ser proporcional al cambio: un fix o chore que se describe en una frase no paga spec ni pipeline de 4 agentes.

Comando: **`/rapido <descripción o T-XXX>`**. Elegible solo si: se describe en una frase, no cambia comportamiento de producto definido en specs, y no toca superficies sensibles (formulario público, panel admin, enlaces de gestión, datos personales). La sesión principal implementa directo en una rama `fix/<slug>`, y el `validador` valida, commitea y abre el PR igual que siempre. Si el validador detecta que el diff sí toca superficie sensible o comportamiento especificado, aborta y exige la ruta completa.

### 6. Cierre
Al mergear: el change se archiva (`openspec/changes/archive/`) y sus deltas se consolidan en `openspec/specs/` (la verdad actual del sistema); el ticket pasa a `hecho`.

### 7. Checkpoint building in public
Comando: **`/checkpoint`** (agente `cronista`).

Escribe una entrada en `docs/devlog/` con la plantilla: qué se construyó, qué decisión hubo, qué se aprendió, captura/demo si aplica. El devlog es la materia prima para los posts públicos (Facebook/LinkedIn/X) — se escribe pensando en que un extracto se pueda publicar tal cual.

## Puntos de control documentales (calendario building in public)

| Checkpoint | Cuándo | Artefacto |
|---|---|---|
| Día 0 | Arranque del proyecto | `devlog/2026-08-31-dia-0.md` ✅ |
| Por feature | Cada PR mergeado | Entrada devlog vía `/checkpoint` |
| Primer deploy | Sitio en producción (aunque vacío) | Entrada devlog + hito |
| Siembra (Fase 0 PRD) | Primeros negocios cargados en cambaceo | Entrada devlog con aprendizajes de campo |
| Lanzamiento público | Difusión en grupos de Facebook | Entrada devlog + snapshot de métricas base |
| Métricas 30 días | +30 días del lanzamiento | Entrada devlog contra umbrales del PRD §10 |
| Métricas 60 días | +60 días | Veredicto del MVP contra PRD §10 |

## El harness (deliberadamente ligero)

- `CLAUDE.md` — contexto y convenciones del proyecto para cualquier sesión de agente.
- 6 agentes en `.claude/agents/`: `spec-writer` (specs), `ui`, `dev`, `seguridad-test`, `validador` (pipeline de implementación) y `cronista` (devlog).
- 4 comandos en `.claude/commands/`: `/spec`, `/implementar`, `/rapido`, `/checkpoint`.
- CI en GitHub Actions (`.github/workflows/ci.yml`) como único gate no negociable por máquina.
- Sin orquestación pesada: la sesión principal dirige el pipeline como una cadena con reintentos acotados (máx. 3 iteraciones dev↔seguridad); no hay frameworks de orquestación. Si el proyecto lo pide más adelante, se escala — no antes (misma filosofía que el PRD aplica a la verificación automática).

## Medición del pipeline

El pipeline se mide por retrabajo, no por volumen. Cada corrida de `/implementar` o `/rapido` agrega una fila a `docs/metricas-pipeline.md`: ruta, iteraciones dev↔seguridad, hallazgos del validador, veredicto de primera pasada, y (rellenado después) correcciones post-merge. Si las corridas muestran que una etapa no aporta hallazgos, esa etapa se elimina — el harness también obedece la regla de no crecer sin evidencia.

## Reglas del proyecto

1. Ningún código sin ticket; ningún ticket P0/P1 sin spec aprobada.
2. Los dos puntos de control humanos (spec y PR) no se saltan nunca.
3. Todo en español mexicano, tono coloquial en UI (PRD §8).
4. Nunca se commitean secretos ni datos personales de negocios reales (repo público + LFPDPPP).
5. Cada PR mergeado genera su checkpoint de devlog antes de empezar la siguiente feature.
