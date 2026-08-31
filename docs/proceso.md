# Proceso de desarrollo — NecesitoUno

> Versión 0.1 — borrador para afinar. Este documento ES parte del building in public: describe cómo se construye el producto con un flujo asistido por agentes de IA.

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
Comando: **`/implementar <change-id>`**.

1. Se crea rama `feature/<change-id>`.
2. El implementador (sesión principal o subagente) ejecuta `tasks.md` tarea por tarea, marcándolas.
3. El agente `revisor` revisa el diff contra la spec y los criterios de aceptación (no solo "el código funciona": ¿cumple el escenario?).
4. Lint + build + tests en verde.
5. Se abre PR referenciando ticket y change.

**Punto de control humano #2:** el PR lo revisa y mergea una persona. Siempre.

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
- 3 agentes en `.claude/agents/`: `spec-writer`, `revisor`, `cronista`.
- 3 comandos en `.claude/commands/`: `/spec`, `/implementar`, `/checkpoint`.
- Sin orquestación pesada: la sesión principal dirige, los agentes son especialistas puntuales. Si el proyecto lo pide más adelante, se escala — no antes (misma filosofía que el PRD aplica a la verificación automática).

## Reglas del proyecto

1. Ningún código sin ticket; ningún ticket P0/P1 sin spec aprobada.
2. Los dos puntos de control humanos (spec y PR) no se saltan nunca.
3. Todo en español mexicano, tono coloquial en UI (PRD §8).
4. Nunca se commitean secretos ni datos personales de negocios reales (repo público + LFPDPPP).
5. Cada PR mergeado genera su checkpoint de devlog antes de empezar la siguiente feature.
