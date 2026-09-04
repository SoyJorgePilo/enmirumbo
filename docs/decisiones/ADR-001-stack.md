# ADR-001 · Stack: Next.js + Prisma + SQLite

**Fecha:** 2026-08-31 · **Estado:** aceptada, **enmendada el 2026-09-06**

> **Enmienda (2026-09-06, change `preparar-deploy-produccion` / T-013, E0-3).**
> El punto "Prisma + SQLite en desarrollo" ya no está vigente: **el desarrollo
> local pasó de SQLite a PostgreSQL**, el mismo motor que producción. Lo demás
> de este ADR —Next.js App Router, TypeScript, Tailwind, Prisma— sigue igual.
>
> Por qué: `provider` es un literal del esquema de Prisma y el árbol de
> migraciones es de un dialecto, así que "SQLite en dev, Postgres en prod"
> obligaba a mantener dos árboles y a escribir dos veces cada constraint hecha
> a mano —justo donde ya se habían perdido una vez—. Ver ADR-004 y
> `openspec/changes/preparar-deploy-produccion/design.md` §2.
>
> Lo que se pierde: la fricción cero de un archivo. Lo que se gana: el
> desarrollador prueba contra el dialecto real, y levantar la base local sigue
> siendo un comando (`npm run db:local`).

## Contexto

El PRD exige: mobile-first, <2s en 4G, páginas indexables por categoría y categoría+colonia con Schema LocalBusiness (SEO local como canal principal de adquisición orgánica), formulario sin cuentas, panel de revisión simple. Es un MVP operado por una persona; la infraestructura debe ser mínima.

## Decisión

- **Next.js (App Router, TypeScript, Tailwind):** SSR/ISR para las páginas públicas indexables; React Server Components mantienen el JS del cliente al mínimo (rendimiento en 4G); un solo proyecto cubre sitio público, formulario y panel admin.
- **Prisma + SQLite** en desarrollo: cero fricción, esquema versionado con migraciones. **(Enmendado: hoy es PostgreSQL también en desarrollo — ver la nota de arriba y ADR-004.)**
- **Base de datos en producción:** se decide en el ticket de deploy (E0-3). Candidatas: Turso/libSQL (continuidad con SQLite) o Postgres gestionado (Supabase/Neon) si el hosting lo hace más simple. El esquema Prisma hace el cambio barato. **(Decidido: Postgres gestionado — Supabase, ADR-004.)**

## Alternativas consideradas

- **Astro + endpoints:** mejor rendimiento estático puro, pero la parte dinámica (cola de revisión, ediciones supervisadas) queda más artesanal.
- **AdonisJS + Inertia:** convenciones fuertes y full-stack TS, pero el SSR/SEO de páginas públicas requiere más trabajo manual que Next.js.

## Consecuencias

- Deploy natural en Vercel (u otro host Node) con ISR para regenerar fichas al aprobar cambios.
- La elección de DB de producción queda como decisión abierta y documentada; no bloquea E0-E2 en local. **(Cerrada en E0-3: ADR-004, Supabase.)**
