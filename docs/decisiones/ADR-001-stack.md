# ADR-001 · Stack: Next.js + Prisma + SQLite

**Fecha:** 2026-08-31 · **Estado:** aceptada

## Contexto

El PRD exige: mobile-first, <2s en 4G, páginas indexables por categoría y categoría+colonia con Schema LocalBusiness (SEO local como canal principal de adquisición orgánica), formulario sin cuentas, panel de revisión simple. Es un MVP operado por una persona; la infraestructura debe ser mínima.

## Decisión

- **Next.js (App Router, TypeScript, Tailwind):** SSR/ISR para las páginas públicas indexables; React Server Components mantienen el JS del cliente al mínimo (rendimiento en 4G); un solo proyecto cubre sitio público, formulario y panel admin.
- **Prisma + SQLite** en desarrollo: cero fricción, esquema versionado con migraciones.
- **Base de datos en producción:** se decide en el ticket de deploy (E0-3). Candidatas: Turso/libSQL (continuidad con SQLite) o Postgres gestionado (Supabase/Neon) si el hosting lo hace más simple. El esquema Prisma hace el cambio barato.

## Alternativas consideradas

- **Astro + endpoints:** mejor rendimiento estático puro, pero la parte dinámica (cola de revisión, ediciones supervisadas) queda más artesanal.
- **AdonisJS + Inertia:** convenciones fuertes y full-stack TS, pero el SSR/SEO de páginas públicas requiere más trabajo manual que Next.js.

## Consecuencias

- Deploy natural en Vercel (u otro host Node) con ISR para regenerar fichas al aprobar cambios.
- La elección de DB de producción queda como decisión abierta y documentada; no bloquea E0-E2 en local.
