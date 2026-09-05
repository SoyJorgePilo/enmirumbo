# Proyecto: EnMiRumbo — Directorio de Negocios de Tizayuca

## Qué es

Directorio web donde los negocios de Tizayuca se registran solos (sin cuentas ni contraseñas), un admin los verifica manualmente por WhatsApp antes de publicar, y los vecinos los encuentran y contactan por WhatsApp. Fuente de verdad de producto: `docs/PRD.md` (v0.7).

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Prisma + PostgreSQL en todos los entornos: desarrollo, pruebas, CI y producción (ADR-004; enmienda a ADR-001). La base local se levanta con `npm run db:local`; en producción es Supabase — ver `docs/despliegue.md`
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

## Capacidades consolidadas (verdad actual en `openspec/specs/`)

- `modelo-datos` — esquema, migraciones, seeds y sus invariantes
- `layout-base` — marco visual, tokens, accesibilidad, metadata base y verificación de enlaces
- `registro-negocio` — formulario de alta, validación, consentimiento, anti-abuso y reenvío tras rechazo
- `directorio-publico` — home, listados por categoría, ficha, filtro por colonia y buscador
- `revision-admin` — acceso del admin, cola de verificación, aprobar/rechazar
- `paginas-legales` — aviso de privacidad integral y términos, con textos normativos literales

En construcción (changes en curso): foto del negocio, SEO local (páginas por giro, schema, sitemap), analítica, botón "Reportar", versión del aviso, preparación de deploy, edición con enlace de gestión (P1).
