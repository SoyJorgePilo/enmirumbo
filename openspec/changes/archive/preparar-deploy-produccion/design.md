# Diseño: preparar-deploy-produccion

## §1 El problema real: Prisma tiene un dialecto por esquema

T-013 lo plantea como "SQLite en dev vs Postgres en prod". Las restricciones concretas, con Prisma 7.10 en la mano:

1. `datasource db { provider = "…" }` es un literal del esquema. No admite `env()`: no hay forma de que el mismo `schema.prisma` sea SQLite en la laptop y Postgres en Vercel.
2. `prisma/migrations/migration_lock.toml` graba el dialecto (`provider = "sqlite"` hoy) y `prisma migrate` se niega a operar si no coincide con el del esquema. El árbol de migraciones **es** de un dialecto.
3. El SQL de las migraciones ya es específico de SQLite, y a mano: la inicial lleva los `CHECK ("estado" IN (…))` y `CHECK ("origen" IN (…))` escritos por nosotros, y la migración `20260904032104_agrega_texto_normalizado_de_busqueda` tuvo que reescribirse a mano porque el patrón de redefinición de tabla de SQLite que genera Prisma **borraba esos CHECK** (ver tarea 3 del change `agregar-buscador`). Es decir: ya nos costó una vez conservarlos en un solo dialecto.
4. Los adaptadores de Prisma 7 (`@prisma/adapter-better-sqlite3`, `@prisma/adapter-pg`) son de **runtime**: eligen con qué driver se habla, no en qué dialecto se generan las migraciones ni las consultas. No resuelven nada de lo anterior. Lo único que aportan aquí es que cambiar de base es cambiar de adaptador, sin motor binario de por medio.

Conclusión: "un provider por esquema" no se negocia. Lo que se decide es **cuántos esquemas/árboles mantenemos y qué dialecto usa el desarrollador**.

## §2 Opciones evaluadas

### A. Dos árboles de migraciones (SQLite en dev, Postgres en prod)

Dos archivos de esquema (`schema.prisma` y `schema.postgres.prisma`) y dos carpetas de migraciones, elegidas por variable de entorno desde `prisma7.config.ts` (que ya recibe `schema` y `migrations.path` como parámetros, así que técnicamente se puede).

En contra, y es decisivo: **cada CHECK y cada migración habría que escribirlos dos veces**, en dos dialectos, y el criterio de aceptación 2 del ticket es precisamente que las constraints escritas a mano sobrevivan. El árbol de Postgres solo se ejercitaría en CI, así que un olvido se descubre después de haberlo mergeado; y el desarrollador seguiría probando el buscador, los índices y el orden de resultados contra una base que no es la de los vecinos. Es duplicar la superficie exacta donde ya nos falló una vez.

### B. Seguir en SQLite y probar Postgres solo en CI

Es la mitigación que insinúa ADR-004 en sus consecuencias ("CI puede correr las migraciones contra Postgres efímero"). Pero para correr migraciones contra Postgres hay que **tener** migraciones de Postgres: es la opción A con menos disciplina y el mismo costo.

### C. Postgres en todos los entornos (**elegida**)

Un `provider = "postgresql"`, un árbol de migraciones, un adaptador de producción, un dialecto que el desarrollador ve todos los días. Los CHECK se escriben una vez y la prueba que los ejercita corre contra el mismo motor que Supabase.

Lo que cuesta, sin adornos: levantar un Postgres local (§3), rehacer el árbol de migraciones (§4), cambiar el adaptador y las guardas que reconocen "base local" por el prefijo `file:` (§6), y **contradecir ADR-001**, que eligió SQLite para desarrollo. Se paga barato porque no hay datos reales que migrar y porque ADR-003 eligió Prisma prometiendo exactamente esta portabilidad ("cambiar `provider` y el connection string").

### D. Turso/libSQL para conservar SQLite en producción

Mantendría un solo dialecto sin tocar el dev. Descartada: re-decide ADR-004, que evaluó Turso y prefirió Postgres gestionado por madurez de respaldo (driver 3, "el que no perdona"). Este change no re-abre ADRs.

**Decisión: C.** Postgres en dev, pruebas, CI y producción; Supabase en producción (ADR-004), Vercel Hobby como hosting (ADR-007).

## §3 Cómo se levanta el Postgres de desarrollo

Dos caminos, en este orden de preferencia:

1. **`npx prisma dev`** — Prisma 7 trae `@prisma/dev` como dependencia y el CLI anuncia el comando como "runs Postgres locally in your terminal". Es un Postgres real (PGlite) sin Docker ni servicios del sistema: encaja con "operabilidad de una persona" y con un clon recién hecho del repo.
2. **`docker compose up db`** con `postgres:17` — el mismo motor y versión que el CI. Fallback si el servidor local de Prisma no sirve para lo que necesitamos (aplicar migraciones y correr la suite), o si su URL exige un adaptador distinto del de producción.

La tarea 1 del checklist es un spike corto que decide entre los dos **verificando**, no suponiendo: aplicar el árbol de migraciones, correr el seed y correr un test contra esa base. Lo que salga se documenta en `docs/despliegue.md` y en `.env.example` como el comando único para levantar la base local. El criterio de desempate es el de siempre: menos piezas, cero yak-shaving.

El CI **no** usa el servidor local de Prisma: usa el servicio `postgres:17` de GitHub Actions, porque lo que ahí se prueba es el dialecto que corre en Supabase.

## §4 El árbol de migraciones se rehace, no se traduce

No hay datos reales en ningún lado (el ticket lo dice explícitamente) y las tres migraciones actuales son SQLite puro. Traducirlas una por una no aporta nada: lo que se conserva es el **esquema resultante**, no la historia.

- Se borra `prisma/migrations/` y se genera una sola migración inicial en Postgres con `prisma migrate dev`, que consolida las tres (modelo inicial de T-001, rastro de rechazo, columnas normalizadas de búsqueda).
- A esa migración se le agregan **a mano** los dos CHECK (`estado`, `origen`), igual que hoy, con un comentario que diga que son escritos a mano y por qué. En Postgres esto se sostiene mejor: `ALTER TABLE … ADD COLUMN` no reescribe la tabla, así que las migraciones futuras no se los llevan por delante como pasaba en SQLite.
- `migration_lock.toml` queda en `postgresql`.
- La historia previa no se pierde: está en git, y el devlog del merge lo deja escrito (valor building in public).

## §5 Diferencias de dialecto que hay que vigilar (y qué se hace con cada una)

| Punto | SQLite hoy | Postgres | Qué se hace |
|---|---|---|---|
| CHECK de `estado`/`origen` | escritos a mano, frágiles ante redefinición de tabla | escritos a mano, estables | prueba dedicada que inserta un valor inventado y espera error de la base |
| `contains` del buscador (`LIKE`) | insensible a mayúsculas en ASCII | **sensible** a mayúsculas | ya se compara columna normalizada en minúsculas contra término normalizado en minúsculas (`src/lib/busqueda.ts`); no cambia nada, pero la suite del buscador corre contra Postgres y lo demuestra |
| `orderBy publicadoEn desc` con nulos | NULL al final | **NULL primero** | solo se listan publicados (con fecha), así que no aplica; se fija con la suite del directorio corriendo contra Postgres |
| Tipos | `REAL`, `DATETIME`, `INTEGER … AUTOINCREMENT` | `DOUBLE PRECISION`, `TIMESTAMP(3)`, identidad | lo genera Prisma; se verifica que el seed de catálogos y el de demostración pasen |
| `@unique` con nulos (`tokenGestion`) | varios NULL permitidos | varios NULL permitidos | sin cambio |
| Concurrencia en pruebas | un archivo compartido, `fileParallelism: false` | una base compartida, misma restricción | se conserva `fileParallelism: false`; la base de prueba se recrea (drop/create schema) en el `globalSetup` |

## §6 Conexión, adaptador y guardas

- **Adaptador**: entra `@prisma/adapter-pg`, sale `@prisma/adapter-better-sqlite3` (que además es un binario nativo menos que instalar en el hosting). Los cuatro lugares que instancian el cliente (`src/lib/prisma.ts`, `tests/db.ts`, `prisma/seed-demo.ts`, `prisma/backfill-busqueda.ts`) pasan por el mismo cambio.
- **Dos URLs en producción**: Supabase ofrece conexión agrupada (pooler) y directa. El runtime serverless usa la agrupada (`DATABASE_URL`) porque abre y cierra conexiones a cada rato; `prisma migrate deploy` usa la directa (`DIRECT_URL`), que es la que admite DDL sin sorpresas. Las dos van al documento de despliegue con su puerto y su para-qué. Si el spike de la tarea 1 muestra que una sola alcanza, se documenta una sola: lo que no se vale es descubrirlo el día del deploy.
- **Sin `DATABASE_URL` en producción, el servidor lo dice.** Hoy `src/lib/prisma.ts` cae a `file:./prisma/dev.db` como default. Con Postgres ese default seguiría siendo cómodo en local, pero en producción un default silencioso es un sitio que arranca conectado a una base que no existe: fuera de producción se conserva el default local, en producción se falla a la vista (mismo criterio que `urlSitio` del panel, que ya devuelve `null` en producción).
- **Guardas anti-producción** (`prisma/guardas-entorno.ts`): `apuntaABaseLocal` deja de preguntar "¿empieza con `file:`?" y pasa a preguntar "¿el host es `localhost`/`127.0.0.1`/`[::1]`?". Lo demás no cambia: `esEntornoDeProduccion` ya mira `NODE_ENV` y `VERCEL_ENV`, y las políticas de cada script (el seed de demostración no corre en producción ni con permiso; el backfill sí, con permiso explícito) se quedan como están.

## §7 La purga de los 90 días: por qué entra aquí y cómo

**Entra.** El aviso de privacidad publicado ya promete el borrado a los 90 días (PRD §8) y el propio código lo declara como deuda en `PENDIENTES_OPERATIVOS_LEGALES`, apuntando a E0-3 — que es este ticket. Dejarla fuera obligaría a abrir un ticket bloqueador de lanzamiento para algo que son treinta líneas y una programación.

Mecanismo, respetando la disciplina de ADR-007 (nada exclusivo de Vercel):

- **Lógica en el sistema**: una función pura que, dada una fecha de corte, dice qué negocios cumplen la condición (rechazados con fecha de rechazo de 90 días o más), y un borrado definitivo idéntico al de ARCO que ya especifica `modelo-datos`. Es lo que se prueba.
- **Disparo por HTTP**: una ruta de Next.js estándar que exige `Authorization: Bearer <secreto>`. Cualquier cron sabe hacer eso: el de Vercel, `curl` desde un servidor, o un workflow programado. Si mañana el sitio se va a un contenedor, la ruta viaja con él y solo cambia quién la llama.
- **Nombre del secreto**: `CRON_SECRET`. Es el único nombre que hace que el scheduler de Vercel mande el encabezado solo; con cualquier otro habría que declararlo a mano y tendríamos el mismo secreto en dos variables. Se documenta que el nombre viene del scheduler y que el sistema no depende de él para nada más.
- **Sin secreto configurado la ruta no purga y responde 404**, igual que si no existiera: una ruta de borrado masivo no debe anunciarse. Con secreto equivocado, el mismo 404 (no se confirma que exista).
- **Programación**: `vercel.json` con una corrida diaria de madrugada. Es un archivo de configuración del hosting, no código: se borra el día que se cambie de proveedor.

## §8 El documento de despliegue no se desactualiza en silencio

`docs/despliegue.md` es prosa, y la prosa se pudre. La red que lo sostiene es una prueba que barre `src/` y `prisma/` buscando lecturas de `process.env` y exige que cada nombre encontrado aparezca en el documento (con una lista corta y explícita de las que pone la plataforma: `NODE_ENV`, `VERCEL_ENV`). Agregar una variable sin documentarla reprueba el PR. Es el mismo truco que ya usan `PLACEHOLDERS_LEGALES` y el barrido de enlaces de `tests/layout.test.ts`: convertir una disciplina en un test.

## §9 Fotos: se decide, no se implementa

ADR-006 dice "el storage del proveedor que gane ADR-004/007" y ADR-004 recomienda Supabase: la decisión, entonces, es **Supabase Storage**, con variantes generadas al subir con `sharp` y servidas por `next/image`. Lo que este change **no** puede hacer es escribir el adaptador: T-008 sigue pendiente, no hay subida de archivos ni un solo byte que guardar, y un adaptador sin llamador es código muerto que además envejece antes de usarse. Lo que sí se hace es dejar la decisión escrita en el documento de despliegue con las variables que reserva y la nota de que `FOTOS_DIR` (filesystem) **no** es una opción en serverless (el disco es efímero, ADR-006). T-008 implementa contra esa decisión, no la re-abre.
