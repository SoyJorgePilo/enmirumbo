# Proposal: agregar-modelo-datos

**Ticket:** `docs/tickets/T-001-modelo-de-datos.md` · **PRD:** §6.1, §6.3, §6.4, §8 (ARCO), §10, Apéndices A y B · **ADR:** ADR-001 (Prisma + SQLite en dev)

## Por qué

Todo el MVP gira alrededor de una sola entidad (el negocio) y sus catálogos; sin el modelo de datos no arrancan el formulario de registro (E1), el directorio público (E2) ni el panel de revisión (E3), como señala T-001. El PRD exige desde el día uno unicidad de WhatsApp (§6.1, "una sola ficha por número"), estados de revisión y origen siembra/orgánico (§6.3 y §10), giros curados para SEO (Apéndice B) y borrado definitivo para operar derechos ARCO (§8).

## Qué cambia

- Se crea el esquema Prisma con el modelo `Negocio` (5 campos obligatorios y 5 opcionales del PRD §6.1) y tres catálogos con slug estable para URLs SEO: `Categoria` (8), `Colonia` (Apéndice A, 21) y `Giro` (Apéndice B, 49) con relación muchos-a-muchos negocio↔giro.
- El negocio lleva estado (`en_revision | publicado | rechazado`), origen (`siembra | organico`), timestamps de registro y publicación, soporte para colonia "Otra" con texto libre pendiente de normalizar, y un campo reservado (nulo, único) para el token del enlace de gestión de P1 — sin lógica asociada.
- Migración inicial aplicable en una base limpia y seed idempotente de los tres catálogos (`npm run db:seed`).
- El borrado de un negocio es hard delete real: elimina la fila y sus vínculos con giros.

## Capacidades afectadas

- `modelo-datos` (nueva) — esquema, migraciones y seed que sostienen al resto de capacidades.

## Impacto en código (alto nivel)

- Nuevo: `prisma/schema.prisma`, `prisma/migrations/` (migración inicial con CHECKs de estado/origen), `prisma/seed.ts`.
- Nuevo: utilidad de slug y constantes tipadas de estado/origen (p. ej. `src/lib/negocio.ts`) para que formulario y panel compartan los valores válidos.
- Modificado: `package.json` (dependencias `prisma`/`@prisma/client`, script `db:seed`, config de seed) y `.gitignore` (asegurar `.env` y `*.db` ignorados).
- Sin UI, sin rutas, sin lógica de gestión/ediciones (E8) y sin decidir DB de producción (E0-3).

## Dudas resueltas en la aprobación

1. **Evidencia de consentimiento:** timestamp `consintioAvisoEn` (mejor evidencia LFPDPPP que un boolean), como asume la propuesta.
2. **Rechazo y purga a 90 días:** `rechazadoEn`/`motivoRechazo` NO se incluyen — T-001 solo pide timestamps de registro y publicación; el flujo de rechazo pertenece al panel de revisión (E3), que agregará su propia migración.
3. **Colonia "Otra":** confirmado el modelado FK nullable + texto libre, sin fila "Otra" en el catálogo; el formulario de E1 se diseñará sobre esa base.

## Fuera de este change

- Campos y flujo de rechazo (motivo, fecha, purga automática a 90 días) — corresponde al panel de revisión (E3), salvo lo que decida la duda 2.
- Helper singleton de cliente Prisma para la app Next.js — se creará con la primera ruta que consulte datos.
- Validación de la cota "1-3 giros al aprobar" — es regla del panel de revisión; el modelo solo habilita la relación.
- Almacenamiento y compresión de la foto (§6.1) — el modelo solo guarda la referencia (URL/ruta).
- Anti-abuso, límites por IP y todo lo relativo a formularios o UI.
