# OpenSpec — instrucciones para agentes

Este directorio sigue las convenciones de OpenSpec (spec-driven development ligero).

## Estructura

```
openspec/
├── project.md              # contexto del proyecto
├── specs/                  # VERDAD ACTUAL: lo que el sistema ya hace
│   └── <capacidad>/spec.md
└── changes/                # PROPUESTAS: lo que se quiere cambiar
    ├── <change-id>/
    │   ├── proposal.md     # por qué, qué cambia, impacto
    │   ├── tasks.md        # checklist de implementación
    │   ├── design.md       # (opcional) decisiones técnicas si las hay
    │   └── specs/<capacidad>/spec.md   # deltas de requisitos
    └── archive/            # changes completados
```

## Formato de deltas (en `changes/<id>/specs/.../spec.md`)

```markdown
## ADDED Requirements
### Requirement: El formulario valida el WhatsApp
El sistema DEBE rechazar números que no tengan 10 dígitos...

#### Scenario: número inválido
- **WHEN** el usuario envía un WhatsApp de 8 dígitos
- **THEN** ve el mensaje "Revisa tu número de WhatsApp (10 dígitos)"
```

Prefijos: `ADDED`, `MODIFIED`, `REMOVED`, `RENAMED`. Cada requirement lleva al menos un `#### Scenario:`.

## Reglas

1. Un change por ticket; el `<change-id>` es kebab-case y descriptivo (ej. `agregar-modelo-datos`).
2. `proposal.md` cita el ticket (`docs/tickets/T-XXX...`) y las secciones del PRD que implementa.
3. `tasks.md` son tareas pequeñas y verificables; se marcan `- [x]` conforme se implementan.
4. Ningún change pasa a implementación sin aprobación humana explícita de la propuesta.
5. Al mergear el PR: mover el change a `archive/` y aplicar los deltas a `specs/` (ahí vive la verdad consolidada del sistema).
