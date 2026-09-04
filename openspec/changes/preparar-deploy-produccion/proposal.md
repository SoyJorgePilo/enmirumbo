# Propuesta: preparar-deploy-produccion

**Ticket:** `docs/tickets/T-013-preparacion-deploy.md` (E0-3, P0 — la mitad de código del deploy; las cuentas y el dominio son humanos)
**PRD:** §8 (rendimiento "<2s en 4G"; LFPDPPP: "los registros rechazados se eliminan a los 90 días", respaldo y encargo de tratamiento), §6.3 (el ciclo de vida que la purga cierra), §10 (medir desde el día 1 obliga a que el sitio esté en línea)
**ADRs:** ADR-004 (Postgres gestionado — Supabase), ADR-006 (el storage del proveedor que gane ADR-004/007, variantes con `sharp`), ADR-007 (Vercel Hobby, con la disciplina de no usar nada exclusivo de Vercel), ADR-003 (Prisma: la portabilidad prometida era "cambiar `provider` y el connection string")

## Por qué

Hoy el proyecto solo sabe hablar SQLite: el `provider` del esquema, las tres migraciones del árbol y hasta las guardas anti-producción (`apuntaABaseLocal` reconoce lo local por `file:`) están escritas para el dialecto de desarrollo, mientras que ADR-004 recomienda Postgres gestionado (Supabase) para los datos reales. El día que el humano cree las cuentas, ese hueco no se cierra con una variable: se cierra reescribiendo migraciones bajo presión, que es exactamente la "tarde de arqueología" que T-013 quiere evitar. Además el aviso de privacidad ya publicó dos compromisos que el código no cumple —eliminar los registros rechazados a los 90 días (PRD §8) y nombrar al encargado del tratamiento (ADR-004)—, y no hay un solo documento que diga qué variables existen ni en qué orden se opera un despliegue.

## Qué cambia

- **Un solo dialecto de base en todos los entornos: Postgres.** El esquema pasa a `provider = "postgresql"`, el árbol de migraciones se rehace desde cero (no hay datos reales que migrar) y desarrollo, pruebas, CI y producción corren contra Postgres. La alternativa de mantener dos árboles de migraciones se evaluó y se descartó en `design.md` §2: duplicaría justo el lugar donde los CHECK escritos a mano se pierden.
- **Los CHECK de `estado` y `origen` se reescriben una sola vez, en el dialecto de producción**, y una prueba los ejercita contra la base real: guardar un estado inventado lo sigue rechazando la base, no la aplicación.
- **El CI levanta un Postgres efímero** (`services` de GitHub Actions), aplica todas las migraciones en orden, corre el seed de catálogos y toda la suite contra él. Una migración que no aplique, o un CHECK que se pierda, reprueban el PR.
- **`docs/despliegue.md` como entregable**: un solo documento con TODAS las variables acumuladas (con el valor exacto de `REGISTRO_ENCABEZADO_IP` en Vercel: `x-forwarded-for`), el orden de operaciones (variables → migrar → seed de catálogos → verificar), los pasos humanos (cuentas, dominio, DNS, respaldos) y lo que nunca se corre en producción (seed de demostración). Una prueba barre el código en busca de `process.env` y falla si aparece una variable que el documento no menciona: el documento no se desactualiza en silencio.
- **La purga de rechazados a los 90 días entra en este change** (PRD §8): borrado definitivo de los negocios rechazados que ya cumplieron el plazo, disparado por una tarea programada diaria que solo responde con el secreto correcto. La lógica es del sistema, no de Vercel: cualquier cron que sepa hacer una petición con encabezado sirve (ADR-007). Con esto sale de `PENDIENTES_OPERATIVOS_LEGALES` el pendiente que hoy declara que "no hay purga".
- **Nada falla en silencio en producción**: sin `DATABASE_URL` el servidor lo dice y no cae a una base local por defecto; sin `SITIO_URL` el aviso ya existente del panel se acompaña de un aviso al arrancar. El `next build` sigue sin necesitar la base (todas las rutas que la leen son dinámicas) y el CI lo demuestra construyendo sin base accesible.
- **Las guardas anti-producción se reescriben para el mundo real**: "base local" deja de significar "archivo `file:`" y pasa a significar "Postgres en `localhost`", y `VERCEL_ENV=production` sigue cerrando la puerta del seed de demostración.
- **Las fotos quedan decididas, no implementadas**: el documento de despliegue fija que viven en el storage de Supabase (ADR-006 + ADR-004) y qué variables reserva; el adaptador lo escribe T-008, que es quien tiene la subida.

## Capacidades afectadas

- `despliegue` (**capacidad nueva**, ADDED): dialecto único, CI contra Postgres efímero, build sin base, configuración que no falta en silencio, guardas de los comandos que escriben, disparo de la purga y el documento único de despliegue (variables, orden, pasos humanos y decisión de fotos).
- `modelo-datos` (MODIFIED + ADDED): la base se levanta con el mismo dialecto que producción y las constraints escritas a mano sobreviven a todo el árbol de migraciones; se agrega el comportamiento de la purga de rechazados a los 90 días.
- `paginas-legales` (MODIFIED): la lista de pendientes operativos pierde la purga (ya existe) y gana el encargado del tratamiento que ADR-004 exige nombrar antes del lanzamiento.

## Impacto en código (alto nivel)

- `prisma/schema.prisma` (`provider = "postgresql"`), `prisma/migrations/` (árbol rehecho: una migración inicial en Postgres que consolida las tres actuales, con los CHECK escritos a mano) y `prisma/migrations/migration_lock.toml`.
- `src/lib/prisma.ts`, `tests/db.ts`, `prisma/seed-demo.ts` y `prisma/backfill-busqueda.ts`: adaptador `@prisma/adapter-pg` en lugar de `@prisma/adapter-better-sqlite3` (dependencia que entra y dependencia que sale).
- `prisma/guardas-entorno.ts`: `apuntaABaseLocal` reconoce el Postgres local por host, no por `file:`.
- `src/app/api/` (ruta de la tarea programada) + `src/lib/purga/` (lógica pura y borrado), `vercel.json` (programación diaria).
- `src/lib/legales/textos.ts`: `PENDIENTES_OPERATIVOS_LEGALES` se actualiza.
- `.github/workflows/ci.yml` (servicio Postgres, migraciones y build sin base), `vitest.config.mts` y `tests/global-setup.ts` (base de prueba Postgres), `package.json` (comandos de base local), `.env.example`.
- `docs/despliegue.md` (nuevo) y `tests/despliegue.test.ts` (barrido de variables documentadas y de rutas dinámicas).

## Coordinación con lo que está en vuelo

Este change cambia la base contra la que corre **toda** la suite, así que roza cualquier PR abierto. Hoy están en camino T-010 (analítica, en desarrollo), T-011, T-012 y T-014 (en spec). Recomendación: implementarlo cuando la cola esté lo más vacía posible y, si no, mergearlo antes que los demás y rebasar los otros encima — el conflicto es mecánico (adaptador y base de pruebas), pero es peor resolverlo tres veces. Los archivos compartidos con esos tickets son `src/lib/legales/textos.ts` (T-012), `.github/workflows/ci.yml`, `vitest.config.mts` y `tests/global-setup.ts`. Ver duda 2.

## Fuera de este change

- **Crear cuentas, registrar el dominio y configurar DNS, y el deploy en sí** con la prueba de rendimiento desde México: son los pasos humanos que cierran E0-3 después de este change (así lo acota el propio ticket).
- **El adaptador de fotos y la subida** (T-008, aún pendiente): aquí solo se fija la decisión y se reservan las variables en el documento. Mientras T-008 no exista, ninguna foto se sube ni se sirve, así que no hay nada que adaptar.
- **Las variables de Umami** (T-010, aún pendiente): el documento deja la sección con el paso humano de crear la cuenta, pero los nombres exactos los fija T-010; hoy no existen en el código.
- **Escribir en el texto publicado del aviso de privacidad el nombre del encargado del tratamiento** (Supabase). Este change lo declara como pendiente operativo verificable, pero editar el texto legal aprobado —que está transcrito literal en la spec `paginas-legales`— pertenece a la revisión legal (E6-3) y necesita que la cuenta exista. Ver duda 3.
- **El flujo ARCO y el despublicar del panel** (T-015, E3-6): siguen siendo el otro pendiente operativo del aviso y este change no los toca. T-015 ya reconoce que la purga de los 90 días es de este ticket.
- **Dockerfile / salida a contenedor**: ADR-007 pide que la salida siga siendo barata, no que se construya ahora.
- **Respaldos, PITR y restauración probada**: el documento incluye el paso humano de confirmar que los respaldos automáticos de Supabase están activos, pero ensayar una restauración es otro ticket.
- **Hallazgo — este change deja desactualizados varios documentos que no son suyos:** ADR-001 dice "Prisma + SQLite en dev" y ADR-004 sigue en estado "propuesta"; `openspec/project.md` y `CLAUDE.md` repiten "SQLite (desarrollo)". Decidir cuál se enmienda y cuál se supersede es un acto humano (ADR), no de este change: aquí se anota para que se resuelva al aprobar. Ver duda 1.

## Encargo adicional del orquestador (post-aprobación)

- **CSP como parte del despliegue**: la analítica (T-010) documentó el modelo de confianza del script externo; `docs/despliegue.md` y la configuración de cabeceras de este change DEBEN incluir la Content-Security-Policy con `script-src` del proveedor (`cloud.umami.is`) **y** `connect-src` de su gateway (`gateway.umami.is`), verificada contra el sitio desplegado. La deuda viene de `openspec/changes/agregar-analitica-cookieless/reports/` y de ADR-005.
- **Cron del barrido de fotos huérfanas**: `npm run fotos:barrer-huerfanos` existe sin spec (deuda declarada en el backlog); este change lo especifica junto con su cron y la vigilancia del código de salida (fail-closed: si nadie mira el exit 1, las huérfanas se acumulan en silencio).

## Dudas resueltas en la aprobación

1. **Postgres en todos los entornos: aprobado.** El razonamiento del design es correcto — un solo provider, un solo árbol de migraciones, los CHECK escritos una vez y en el dialecto de producción; el doble árbol duplica exactamente el lugar donde los CHECK ya se perdieron una vez. Como parte de ESTE change se enmiendan los ADRs (tarea nueva): ADR-004 y ADR-007 pasan de "propuesta" a "aceptada (ejecutada en E0-3/T-013)", y ADR-001 gana una nota de enmienda ("el dev local pasa de SQLite a Postgres local al ejecutar E0-3 — ver ADR-004 y este change"). El spike decide entre `npx prisma dev` y docker compose.
2. **Cola de implementación: este change va AL FINAL de la cola P0.** Orden congelado por el orquestador: foto → SEO → analítica (en vuelo) → reportar + despublicar/ARCO → versión del aviso → ESTE change → enlace de gestión (P1). Nada nuevo arranca sobre SQLite después de que este change entre a desarrollo.
3. **Encargado del tratamiento: pendiente operativo declarado** (no placeholder publicado). El texto legal aprobado no se toca por esto; la revisión legal profesional (E6-3) decidirá la redacción definitiva del encargo cuando confirme proveedor.
