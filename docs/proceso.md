# Proceso de desarrollo — NecesitoUno

> Versión 0.5 — borrador para afinar. Este documento ES parte del building in public: describe cómo se construye el producto con un flujo asistido por agentes de IA.
>
> Cambios v0.5 (tras la revisión de las primeras corridas registradas — ver ADR-009): la etapa A deja de ser experimento y se vuelve permanente con contrato de reemplazo obligatorio; los mandatos de integración del validador para corridas en paralelo quedan escritos (§5c); el `/checkpoint` rellena la columna Post-merge de la bitácora. Cambios v0.4: cada agente declara su modelo en el frontmatter, asignado por costo del error (ADR-008) — el modelo deja de ser una variable de ambiente y pasa a ser una constante versionada del pipeline. Cambios v0.3 (tras investigar el estado del arte 2026 — ver ADR-002): CI de GitHub Actions como gate determinista; ruta corta `/rapido` para cambios chicos (ceremonia proporcional al tamaño); handoffs entre agentes por archivo (`reports/`), no por conversación; el dev trabaja en TDD y seguridad-test pasa a auditoría + tests adversariales; bitácora de métricas del pipeline; la etapa UI-first queda marcada como experimento con criterio de salida. Cambios v0.2: el pipeline de implementación pasa de 1 implementador + revisor a 4 agentes especializados (ui, dev, seguridad-test, validador); solo el validador toca git.

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
Comando: **`/spec T-XXX`** (agente `spec-writer`, modelo `opus`).

Convierte el ticket en una propuesta de cambio OpenSpec en `openspec/changes/<id>/`:
- `proposal.md` — por qué, qué cambia, impacto
- `tasks.md` — checklist de implementación
- `specs/<capacidad>/spec.md` — deltas de requisitos (ADDED/MODIFIED) con escenarios

**Punto de control humano #1:** la spec se lee y se aprueba antes de escribir código. Aquí es donde más barato es corregir.

### 5. Implementación multiagente
Comando: **`/implementar <change-id>`**. La sesión principal orquesta; cuatro agentes especializados ejecutan en cadena sobre la rama `feature/<change-id>`:

| Etapa | Agente | Modelo | Hace | Entrega |
|---|---|---|---|---|
| A | `ui` | `sonnet` | Capa de interfaz con datos mock: componentes, copy es-MX, estados, mobile-first. Se salta si el change no tiene UI o reutiliza UI existente (justificación registrada en la fila de métricas) | `reports/a-ui.md` con formas de datos esperadas + contrato de reemplazo |
| B | `dev` | `opus` | Perfil de ingeniero de software en **TDD**: por cada scenario automatizable, primero el test (rojo), luego el código (verde); `tasks.md` tarea por tarea | `reports/b-dev.md` + tareas marcadas |
| C | `seguridad-test` | `opus` | Auditoría de seguridad del diff (entrada, inyección, secretos, LFPDPPP) + tests adversariales que el dev no pensó. Sus hallazgos regresan al dev hasta quedar limpio | `reports/c-seguridad.md`; crítico/alto bloquea |
| D | `validador` | `opus` | Compuerta final: re-verifica spec, ticket, alcance y gates de forma independiente. **Único agente que toca git**: si aprueba, commitea, push y abre el PR | `reports/d-validacion.md` + link del PR |

Reglas clave:

- **Handoff por archivo, no por conversación:** cada agente escribe su reporte en `openspec/changes/<id>/reports/` y el siguiente lo lee de ahí. Lo que no está en un archivo no existe para la siguiente etapa.
- **El modelo es parte del pipeline, no del ambiente:** cada agente declara su modelo en el frontmatter, asignado por costo del error (ADR-008). Sin eso, el mismo change costaría y rendiría distinto según con qué modelo se abrió la terminal ese día, y las métricas compararían corridas que no son comparables.
- `ui`, `dev` y `seguridad-test` trabajan sobre el working tree sin commitear — nada entra a la historia de git sin pasar por el validador.
- El veredicto local del validador no sustituye al CI: el check de GitHub Actions (lint + build + test) debe estar en verde en el PR. El CI es el gate determinista; los agentes pueden equivocarse al reportar, el CI no.

**La etapa A es permanente** (experimento cerrado en ADR-009: en 7 corridas con UI, reemplazar los mocks costó 0 correcciones en 4 y correcciones puntuales en 3 — el criterio de salida no se cumplió). Lo que la hace barata es el **contrato de reemplazo**, y por eso es obligatorio: `reports/a-ui.md` debe listar las formas de datos esperadas y, de forma explícita, qué archivos se borran y qué imports se renombran cuando el dev conecte lo real. Si en corridas futuras el reemplazo cuesta rehacer componentes o copy, la fusión A→dev se reabre con esa evidencia (ADR-009 §Cuándo revisarla).

**Punto de control humano #2:** el PR lo revisa y mergea una persona, con el CI en verde. Siempre.

### 5b. Ruta corta — `/rapido`
La ceremonia debe ser proporcional al cambio: un fix o chore que se describe en una frase no paga spec ni pipeline de 4 agentes.

Comando: **`/rapido <descripción o T-XXX>`**. Elegible solo si: se describe en una frase, no cambia comportamiento de producto definido en specs, y no toca superficies sensibles (formulario público, panel admin, enlaces de gestión, datos personales). La sesión principal implementa directo en una rama `fix/<slug>`, y el `validador` valida, commitea y abre el PR igual que siempre. Si el validador detecta que el diff sí toca superficie sensible o comportamiento especificado, aborta y exige la ruta completa.

### 5c. Corridas en paralelo — mandatos de integración del validador

Cuando dos o más changes corren a la vez, "los dos pipelines en verde" no implica "la fusión es mecánica" (devlog 2026-09-04 "La cuenta de las dos ramas": tres problemas semánticos que ningún merge de texto marca). El validador de cada rama:

1. **Fusiona `main` en la rama antes de abrir el PR** y corre la suite completa sobre el árbol fusionado. Las pruebas de la otra feature son parte del gate.
2. **Delegar un hallazgo a otra rama viva es válido, pero queda registrado dos veces:** en el veredicto del validador que delega (con el motivo de merge) y en el del validador que recibe (con el cierre verificado). Un hallazgo delegado sin cierre documentado cuenta como abierto.
3. **Si la integración colisiona con una spec aprobada de otra capacidad, no la reescribe:** abre el PR en borrador y declara el bloqueo para el humano. Enmendar specs pasa por `/spec` y aprobación humana, siempre.
4. **Sin scope creep de fusión:** lo que el merge desbloquea pero la spec no pide se anota como seguimiento en el PR, no se implementa.

### 6. Cierre
Al mergear: el change se archiva (`openspec/changes/archive/`) y sus deltas se consolidan en `openspec/specs/` (la verdad actual del sistema); el ticket pasa a `hecho`.

### 7. Checkpoint building in public
Comando: **`/checkpoint`** (agente `cronista`, modelo `sonnet`).

Escribe una entrada en `docs/devlog/` con la plantilla: qué se construyó, qué decisión hubo, qué se aprendió, captura/demo si aplica. El devlog es la materia prima para los posts públicos (Facebook/LinkedIn/X) — se escribe pensando en que un extracto se pueda publicar tal cual. Además, el checkpoint rellena la columna "Post-merge" de `docs/metricas-pipeline.md` para las corridas mergeadas hace ≥2 semanas (ver §Medición).

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
- 6 agentes en `.claude/agents/`: `spec-writer` (specs), `ui`, `dev`, `seguridad-test`, `validador` (pipeline de implementación) y `cronista` (devlog). Cada uno declara su modelo: `opus` en las cuatro etapas de juicio (`spec-writer`, `dev`, `seguridad-test`, `validador`) y `sonnet` en las dos de ejecución supervisada (`ui`, `cronista`) — ver [ADR-008](decisiones/ADR-008-modelo-por-agente.md).
- 4 comandos en `.claude/commands/`: `/spec`, `/implementar`, `/rapido`, `/checkpoint`.
- CI en GitHub Actions (`.github/workflows/ci.yml`) como único gate no negociable por máquina.
- Sin orquestación pesada: la sesión principal dirige el pipeline como una cadena con reintentos acotados (máx. 3 iteraciones dev↔seguridad); no hay frameworks de orquestación. Si el proyecto lo pide más adelante, se escala — no antes (misma filosofía que el PRD aplica a la verificación automática).

## Medición del pipeline

El pipeline se mide por retrabajo, no por volumen. Cada corrida de `/implementar` o `/rapido` agrega una fila a `docs/metricas-pipeline.md`: ruta, iteraciones dev↔seguridad, hallazgos del validador, veredicto de primera pasada, y (rellenado después) correcciones post-merge. **Rellenar "Post-merge" es parte del `/checkpoint`:** en cada checkpoint, el cronista revisa las corridas mergeadas hace dos semanas o más y escribe la celda (los commits de corrección sobre esa feature, o "0" explícito). Una celda vacía no significa cero: significa que no se midió. Si las corridas muestran que una etapa no aporta hallazgos, esa etapa se elimina — el harness también obedece la regla de no crecer sin evidencia.

## Reglas del proyecto

1. Ningún código sin ticket; ningún ticket P0/P1 sin spec aprobada.
2. Los dos puntos de control humanos (spec y PR) no se saltan nunca.
3. Todo en español mexicano, tono coloquial en UI (PRD §8).
4. Nunca se commitean secretos ni datos personales de negocios reales (repo público + LFPDPPP).
5. Cada PR mergeado genera su checkpoint de devlog antes de empezar la siguiente feature.
