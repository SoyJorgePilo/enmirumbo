# ADR-004 · Base de datos en producción

**Fecha:** 2026-08-31 · **Estado:** **aceptada (ejecutada en E0-3 / T-013, 2026-09-06)**

## Contexto y problema

Desarrollamos con SQLite local (ADR-001). Al desplegar hay que decidir dónde viven los datos reales — que son datos personales de terceros (LFPDPPP): la decisión tiene arista legal y de respaldo, no solo técnica.

## Drivers de la decisión

1. Costo ~$0 durante la validación del MVP (60 días, tráfico municipal)
2. Continuidad con el esquema Prisma existente (no reescribir nada)
3. Respaldo automático — perder las fichas de 50 negocios verificados a mano sería fatal
4. Simplicidad operativa para una persona
5. Compatibilidad con el hosting (ADR-007): la DB y el hosting se deciden juntos

## Opciones consideradas

### Turso (libSQL)
Continuidad total con SQLite (mismo dialecto), plan gratuito generoso, réplicas cercanas. Contras: empresa joven (riesgo de continuidad/pricing), el driver libSQL con Prisma es un adaptador más nuevo que el camino Postgres, y point-in-time recovery limitado en plan gratuito.

### Postgres gestionado (Supabase / Neon)
El camino más trillado con Prisma; backups y PITR maduros; Supabase añade storage de archivos que podría resolver también ADR-006 con un solo proveedor. Contras: cambiar el provider del esquema (trivial pero hay que re-migrar), cold starts en planes gratuitos (Neon pausa, Supabase pausa tras inactividad — malo para la meta de <2s si el primer visitante paga el arranque).

### SQLite en un VPS con Litestream
Máximo control y costo fijo mínimo. Contras: convierte al proyecto en administrador de servidores (driver 4 en contra), y el deploy continuo del pipeline multiagente se complica.

## Decisión (confirmada en E0-3 / T-013)

**Postgres gestionado — Supabase** como primera opción: madurez de respaldo (driver 3, el que no perdona), camino Prisma+Postgres sin sorpresas (driver 2), y la opción de matar dos ADRs con un proveedor si su storage resuelve las fotos (ADR-006). El riesgo del pause-por-inactividad se mitiga porque el sitio tendrá tráfico SEO constante y un ping barato de uptime.

### Qué se ejecutó en T-013

El change `preparar-deploy-produccion` llevó la recomendación a código, y con un cambio de alcance respecto a lo que este ADR suponía: **PostgreSQL en todos los entornos**, no solo en producción. El esquema pasó a `provider = "postgresql"`, el árbol de migraciones se rehízo consolidado en ese dialecto (con las cuatro constraints CHECK escritas a mano), el adaptador es `@prisma/adapter-pg` y el CI corre toda la suite contra un `postgres:17` efímero. Eso **enmienda ADR-001**, que había elegido SQLite para desarrollo.

## Consecuencias

- Positivas: respaldo y restauración resueltos desde el día 1; un solo proveedor de datos.
- Negativas: dependencia de un tercero para datos personales — el aviso de privacidad debe nombrar el encargo de tratamiento (declarado como pendiente operativo en `PENDIENTES_OPERATIVOS_LEGALES`, lo cierra E6-3).
- La diferencia de dialecto dev/prod que este ADR anticipaba **desapareció**: no se mitigó con CI, se eliminó pasando el desarrollo a PostgreSQL (T-013). El precio es que ahora hace falta levantar una base local; se paga con un comando (`npm run db:local`) y sin Docker.

## Cuándo revisarla

En el ticket de deploy (E0-3), con una prueba real de cold start; y a los 60 días del lanzamiento con datos de tráfico y costo reales.
