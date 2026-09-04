# T-013 · Preparar el código para el deploy a producción

**Estado:** en-review
**Prioridad:** P0
**Épica:** E0-3 (docs/backlog.md) — la parte de código; las cuentas y decisiones finales son humanas
**Referencias PRD:** §8 (rendimiento, LFPDPPP), ADR-004 (Supabase Postgres recomendado), ADR-006, ADR-007 (Vercel Hobby recomendado)
**Depende de:** todo lo mergeado
**OpenSpec change:** `preparar-deploy-produccion`
**PR:** [#19](https://github.com/SoyJorgePilo/necesitouno/pull/19)

## Contexto

El deploy tiene dos mitades: las cuentas/decisiones humanas (Vercel, Supabase, dominio) y el código que debe estar listo para recibirlas. Este ticket cubre la segunda para que, el día que el humano cree las cuentas, producción sea configurar variables y presionar deploy — no una tarde de arqueología.

## Criterios de aceptación

- [x] El esquema Prisma funciona contra Postgres (Supabase) en producción manteniendo SQLite en desarrollo: la spec/design decide el mecanismo (provider por entorno, migraciones por dialecto, o migrar dev a Postgres local) citando ADR-004, y el CI lo prueba contra un Postgres efímero
- [x] Los CHECK de estado/origen y toda constraint escrita a mano sobreviven en el dialecto de producción (tests de migración en ambos dialectos)
- [x] Documento único de despliegue (`docs/despliegue.md`): checklist ordenado con TODAS las variables acumuladas (`SITIO_URL`, `REGISTRO_ENCABEZADO_IP` — en Vercel es `x-forwarded-for`, documentar el valor exacto —, `PANEL_CONTRASENA`, `PANEL_SESION_SECRETO`, `DATABASE_URL`, `FOTOS_DIR`/storage según ADR-006, y las de Umami de T-010), el orden de operaciones (migrar → seed de catálogos → backfill de búsqueda → verificar), y los pasos humanos (cuentas, dominio, DNS)
- [x] Las fotos (T-008) tienen su adaptador de producción según ADR-006 (Supabase Storage si ADR-004 se confirma — la spec lo decide citando el ADR) o el plan documentado si se pospone
- [x] `next build` de producción funciona sin base accesible en build time (ya hay antecedente con `force-dynamic` — verificarlo global) y sin `SITIO_URL` revienta a la vista, no en silencio
- [x] La purga de rechazados a los 90 días (compromiso publicado en el aviso) tiene su mecanismo: cron de Vercel o equivalente — si entra aquí, con test; si no, ticket propio ligado como bloqueador de lanzamiento
- [x] Guardas anti-producción existentes (seed demo, backfill) verificadas contra el entorno real de Vercel (`VERCEL_ENV`)

## Fuera de alcance de este ticket

- Crear cuentas, registrar dominio, configurar DNS (humano)
- El deploy en sí y la prueba de rendimiento desde México (cierran E0-3 tras este ticket)
- Migrar datos (no hay datos reales aún)

## Notas

- Disciplina ADR-007: nada exclusivo de Vercel más allá de lo que Next.js estándar ofrece (la salida a contenedor debe seguir barata).
- ADR-004 pide que el aviso de privacidad nombre el encargo de tratamiento (Supabase) — coordinar con los placeholders de T-007: probablemente un placeholder nuevo, no un texto definitivo.
- **Al cerrar (validador):** de las tres opciones que abría el primer criterio, la spec aprobada eligió la tercera —**migrar el desarrollo a PostgreSQL local**—, así que "manteniendo SQLite en desarrollo" ya no describe la solución: hay un solo dialecto en todos los entornos (ADR-004, enmienda a ADR-001) y el CI lo prueba contra un `postgres:17` efímero. Por lo mismo, el segundo criterio se cumple con pruebas de migración en **un** dialecto, que es el único que queda.
