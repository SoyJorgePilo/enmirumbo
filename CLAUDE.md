@AGENTS.md

# NecesitoUno — Directorio de Negocios de Tizayuca

Directorio web hiperlocal: negocios se registran solos desde el celular (sin cuentas), un admin los verifica por WhatsApp antes de publicar, los vecinos los encuentran y contactan por WhatsApp. **Fuente de verdad de producto: `docs/PRD.md`.** Proyecto building in public: el repo es público.

## Proceso (resumen — detalle en `docs/proceso.md`)

```
PRD → Backlog (docs/backlog.md) → Ticket (docs/tickets/) → /spec → aprobación humana
    → /implementar (ui → dev → seguridad-test → validador) → PR → merge humano → /checkpoint (devlog)
Fixes/chores de una frase sin superficie sensible: /rapido (sin spec, con validador y PR)
```

- Ningún código de feature sin ticket; ningún ticket sin spec OpenSpec aprobada (`openspec/AGENTS.md`).
- Los dos puntos de control humanos (aprobar spec, mergear PR) no se saltan nunca; el PR requiere el CI de GitHub Actions en verde.
- Handoffs entre agentes por archivo en `openspec/changes/<id>/reports/`; solo el validador toca git.
- Cada corrida del pipeline registra su fila en `docs/metricas-pipeline.md`.
- Tras cada merge: archivar el change, consolidar `openspec/specs/` y escribir devlog.

## Stack y convenciones

- Next.js App Router + TypeScript + Tailwind; Prisma + SQLite en dev (ADR-001).
- Server Components por defecto; JS de cliente solo con interacción real (meta: <2s en 4G).
- **Todo texto de UI en español mexicano coloquial** ("Registra tu negocio", no "Crear listado").
- Mobile-first: se diseña para celular, escritorio es adaptación.
- URLs públicas limpias/geolocalizadas para SEO local (`/plomeria-haciendas-de-tizayuca`).

## Reglas duras

- Repo público + LFPDPPP: **nunca** commitear secretos, ni nombres/WhatsApp de negocios reales (los seeds usan datos ficticios).
- No implementar nada listado como fuera de alcance en PRD §6.6 (cuentas, pagos, reseñas, etc.).
- Commits y PRs en español; mensajes de commit con prefijo convencional (`feat:`, `fix:`, `docs:`, `chore:`).
