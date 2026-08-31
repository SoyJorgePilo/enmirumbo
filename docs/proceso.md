# Proceso de desarrollo — NecesitoUno

> Versión 0.2 — borrador para afinar. Este documento ES parte del building in public: describe cómo se construye el producto con un flujo asistido por agentes de IA.
>
> Cambios v0.2: el pipeline de implementación pasa de 1 implementador + revisor a 4 agentes especializados (ui, dev, seguridad-test, validador); solo el validador toca git.

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
| A | `ui` | Capa de interfaz con datos mock: componentes, copy es-MX, estados, mobile-first. Se salta si el change no tiene UI | Reporte con formas de datos esperadas |
| B | `dev` | Perfil de ingeniero de software: `tasks.md` tarea por tarea — datos, lógica de servidor, integración de la UI real | Tareas marcadas + decisiones técnicas |
| C | `seguridad-test` | Tests proporcionados al riesgo + auditoría de seguridad del diff (entrada, inyección, secretos, LFPDPPP). Sus hallazgos regresan al dev hasta quedar limpio | Reporte por severidad; crítico/alto bloquea |
| D | `validador` | Compuerta final: re-verifica spec, ticket, alcance y gates de forma independiente. **Único agente que toca git**: si aprueba, commitea, push y abre el PR | Veredicto + link del PR |

Regla clave: `ui`, `dev` y `seguridad-test` trabajan sobre el working tree sin commitear — nada entra a la historia de git sin pasar por el validador.

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
- 6 agentes en `.claude/agents/`: `spec-writer` (specs), `ui`, `dev`, `seguridad-test`, `validador` (pipeline de implementación) y `cronista` (devlog).
- 3 comandos en `.claude/commands/`: `/spec`, `/implementar`, `/checkpoint`.
- Sin orquestación pesada: la sesión principal dirige el pipeline como una cadena con reintentos acotados (máx. 3 iteraciones dev↔seguridad); no hay frameworks de orquestación. Si el proyecto lo pide más adelante, se escala — no antes (misma filosofía que el PRD aplica a la verificación automática).

## Reglas del proyecto

1. Ningún código sin ticket; ningún ticket P0/P1 sin spec aprobada.
2. Los dos puntos de control humanos (spec y PR) no se saltan nunca.
3. Todo en español mexicano, tono coloquial en UI (PRD §8).
4. Nunca se commitean secretos ni datos personales de negocios reales (repo público + LFPDPPP).
5. Cada PR mergeado genera su checkpoint de devlog antes de empezar la siguiente feature.
