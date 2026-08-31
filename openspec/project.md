# Proyecto: NecesitoUno — Directorio de Negocios de Tizayuca

## Qué es

Directorio web donde los negocios de Tizayuca se registran solos (sin cuentas ni contraseñas), un admin los verifica manualmente por WhatsApp antes de publicar, y los vecinos los encuentran y contactan por WhatsApp. Fuente de verdad de producto: `docs/PRD.md` (v0.7).

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Prisma + SQLite (desarrollo); DB de producción por decidir en E0-3 (ver `docs/decisiones/ADR-001-stack.md`)
- Sin sistema de cuentas: el registro es anónimo con revisión, la edición usa enlaces secretos de gestión (P1)

## Convenciones

- Todo el contenido de UI en español mexicano coloquial ("Registra tu negocio", no "Crear listado")
- Mobile-first: se diseña para celular; escritorio es adaptación
- URLs públicas limpias y geolocalizadas para SEO (`/plomeria-haciendas-de-tizayuca`)
- Server Components por defecto; JS de cliente solo donde hay interacción real
- Nunca datos personales reales ni secretos en el repo (público + LFPDPPP)

## Estructura

- `src/app/` — rutas Next.js (público, formulario, admin)
- `prisma/` — esquema, migraciones, seed de catálogos
- `docs/` — PRD, backlog, tickets, decisiones, devlog
- `openspec/specs/` — verdad actual del sistema por capacidad
- `openspec/changes/` — propuestas de cambio en curso; `archive/` las completadas

## Capacidades (se poblarán al archivar los primeros changes)

- `registro-negocio` — formulario de alta y flujo de envío
- `directorio-publico` — home, listados, ficha, búsqueda
- `revision-admin` — cola de verificación y moderación
- `seo-local` — páginas indexables, schema, sitemap
- `edicion-gestion` — enlaces de gestión y ediciones supervisadas (P1)
