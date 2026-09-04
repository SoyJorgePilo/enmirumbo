# Etapa B (dev) — preparar-deploy-produccion

**Rama:** `feature/preparar-deploy-produccion` (worktree `.claude/worktrees/wt-t013`)
**Etapa A (ui):** se saltó — infraestructura sin superficie visible.
**Gates:** `npm run lint` ✅ · `npm run build` **sin base alcanzable** ✅ · `npm test` ✅ **2398 pruebas, 89 archivos, contra PostgreSQL** (dos corridas seguidas idénticas).

---

## 1. El spike de la base local (tarea 1)

**Elegido: `npx prisma dev`**, envuelto en `npm run db:local`. Es el servidor PostgreSQL que trae el propio Prisma (PGlite): `select version()` responde **PostgreSQL 17.5**, la misma versión mayor que el `postgres:17` del CI y que Supabase. No pide Docker (que además **no está instalado** en esta máquina, así que la opción B del design no era verificable aquí) ni un PostgreSQL de sistema.

- Comando: `npm run db:local` (parar: `npm run db:local:detener`).
- Puertos **fijos**, así que la URL no cambia entre máquinas:
  `postgresql://postgres:postgres@localhost:51214/template1?sslmode=disable`
  (51215 es la base sombra de `prisma migrate dev`).
- Verificado: `prisma migrate deploy`, `npm run db:seed` (8 categorías, 21 colonias, 49 giros), `npm run db:seed:demo`, `npm run db:backfill:busqueda`, `npm run fotos:barrer-huerfanos` y **la suite completa**.
- El flag `--db-port` **se ignora** (probado con las tres sintaxis): los puertos son 51213+4·(n−1) por servidor, en orden de creación.

**Dos límites suyos, medidos, que moldearon todo el diseño de la base de pruebas** (y que están en `docs/despliegue.md` §2 para que nadie los redescubra):

1. **Una sola sesión de PostgreSQL compartida por TODAS las conexiones.** Comprobado: abrir dos conexiones, hacer `SET search_path TO pruebas` en una y leer `current_schema()` en la otra devuelve `pruebas`. Esto **descarta el aislamiento por esquema** que anticipaba `design.md` §5: un `SET search_path` de la suite se le filtraría a `next dev`. También hace que `prisma migrate deploy --schema otro` deje el `search_path` movido para todo el proceso (hay una función `restaurarEsquemaCompartido()` justo para eso).
2. **Corta a las 10 conexiones simultáneas** (la 11.ª muere con `Connection terminated unexpectedly`), y **multiplexar dos consultas de verdad simultáneas corrompe el protocolo extendido**: `bind message supplies 5 parameters, but prepared statement "" requires 0`. Reproducido de forma intermitente en `tests/admin-adversarial.test.ts`.

**Consecuencia de diseño, decidida a la vista:** la base local es **de usar y tirar**. La suite usa el esquema `public` de `DATABASE_URL` y lo recrea en cada corrida, con dos esquemas auxiliares (`pruebas_seed_demo`, `pruebas_migracion`) para las pruebas que necesitan una base donde nadie escribió. Está documentado en `.env.example`, en `tests/esquemas.ts` y en `docs/despliegue.md` §2, con la salida para quien no lo quiera: apuntar `DATABASE_URL` a un `docker run … postgres:17`, que también está en el documento. Nada del proyecto depende de `prisma dev`.

---

## 2. Mapa scenario → prueba

### Spec `despliegue` (capacidad nueva)

| Requirement · Scenario | Dónde se verifica |
|---|---|
| Un solo dialecto · base local desde un clon recién hecho | manual (§4 abajo) + `tests/modelo-migraciones.test.ts` › "deja todas las tablas del modelo sobre una base vacía" + `tests/seed.test.ts` (8/21/49) |
| Un solo dialecto · el mismo árbol en producción | `tests/modelo-migraciones.test.ts` › todo el bloque aplica el árbol con `prisma migrate deploy`, el mismo comando del despliegue |
| Un solo dialecto · no hay dos dialectos que mantener | `tests/modelo-migraciones.test.ts` › "es un solo árbol y su dialecto declarado es PostgreSQL" |
| CI · PR con una migración que no aplica | `.github/workflows/ci.yml` paso "Aplicar migraciones" (verificación manual §4: con SQL inválido el paso falla) |
| CI · la suite corre contra la base de producción-equivalente | `.github/workflows/ci.yml` (`services: postgres:17` + `DATABASE_URL` del job) |
| CI · base limpia en cada corrida | servicio efímero de Actions + `tests/global-setup.ts` (drop/create de los tres esquemas); dos corridas locales seguidas dan idéntico |
| Build sin base · build sin base | `.github/workflows/ci.yml` paso "Build sin base de datos" + manual §4 |
| Build sin base · una ruta nueva que lee la base al construir | `tests/despliegue.test.ts` › "toda ruta que consulta la base se rinde por petición" (+ el guardián del guardián que exige que el rastreo encuentre ≥5 rutas) |
| Config · producción sin dirección de base de datos | `tests/configuracion-produccion.test.ts` › "en producción por %s, sin variable, no hay base a la que conectarse" y "el aviso nombra la variable que falta…" |
| Config · producción sin `SITIO_URL` | `tests/configuracion-produccion.test.ts` › "en producción no inventa localhost y deja constancia una sola vez" + "el aviso se dispara al ARRANCAR el servidor" |
| Config · desarrollo sin configurar nada | `tests/configuracion-produccion.test.ts` › "fuera de producción, sin variable, usa la base local por defecto" y "fuera de producción sigue funcionando con localhost" |
| Config · el aviso no se repite por petición | `tests/configuracion-produccion.test.ts` › "el aviso sale una sola vez por proceso" (50 llamadas → 1 log) |
| Comandos que escriben · seed en producción del hosting | `tests/configuracion-produccion.test.ts` › "el seed de demostración no siembra en producción ni con permiso" + `tests/seed-demo.test.ts` |
| Comandos que escriben · seed apuntando a Supabase | `tests/configuracion-produccion.test.ts` › "contra una base remota sin permiso, el seed dice qué falta" + `tests/directorio-adversarial.test.ts` › "cualquier base que no esté en esta máquina se bloquea" |
| Comandos que escriben · seed contra la base local | `tests/seed-demo.test.ts` › "sí siembra contra un PostgreSQL de esta máquina (ADR-004)" |
| Purga · la tarea programada corre | `tests/purga-rechazados.test.ts` › "con el secreto correcto purga y responde solo el conteo" |
| Purga · alguien encuentra la ruta | `tests/purga-rechazados.test.ts` › `it.each` de 6 casos adversariales (sin encabezado, secreto malo, vacío, sin `Bearer`, otro esquema, basura pegada) |
| Purga · sin secreto configurado | `tests/purga-rechazados.test.ts` › "sin CRON_SECRET responde 404 y no purga nada" + "un CRON_SECRET de puros espacios es como no tenerlo" |
| Purga · programación declarada | `tests/despliegue.test.ts` › bloque "las tareas programadas están declaradas" (frecuencia diaria, la ruta existe, el `curl` está en el documento) |
| Documento · el humano despliega siguiendo el documento | `tests/despliegue.test.ts` › "el documento trae las cinco partes que la spec exige" |
| Documento · el encabezado de IP tiene un valor exacto | `tests/despliegue.test.ts` › "el encabezado de IP trae su valor literal para Vercel y su advertencia" |
| Documento · una variable nueva sin documentar | `tests/despliegue.test.ts` › "toda variable de entorno que el código lee está en docs/despliegue.md" (+ el guardián que exige que el barrido encuentre las 8 conocidas) |
| Documento · variables de tickets pendientes | `tests/despliegue.test.ts` › "las decisiones que otro ticket implementa están escritas, no omitidas" |
| Fotos · la decisión está escrita antes de que exista el código | `docs/despliegue.md` §7 + `tests/despliegue.test.ts` (Supabase Storage / ADR-006 / T-008) |
| Fotos · hoy no hay fotos que servir | **OBSOLETO — ver §5.1.** T-008 mergeó: sí se suben y se sirven fotos. |
| **CSP** (encargo) · la medición funciona con la política puesta | `tests/despliegue.test.ts` › "permite el script del proveedor y los envíos a su gateway" + verificación manual §4 contra el sitio servido |
| **CSP** (encargo) · un script de otro origen | `tests/despliegue.test.ts` › "no deja hueco para ningún otro origen de scripts" |
| **CSP** (encargo) · la política se verifica contra el sitio | `tests/despliegue.test.ts` › "el documento trae la política escrita y cómo verificarla" + `docs/despliegue.md` §8 |
| **Barrido de fotos** (encargo) · barrido normal | `tests/tareas-programadas.test.ts` › "con el secreto correcto barre y responde 200 con puros conteos" |
| **Barrido de fotos** (encargo) · una salvaguarda lo detiene | `tests/tareas-programadas.test.ts` › "si una salvaguarda detiene el barrido, la respuesta NO es 200" + "y lo deja en el log como error" |
| **Barrido de fotos** (encargo) · alguien encuentra la ruta | `tests/tareas-programadas.test.ts` › `it.each` de 4 casos |

### Spec `modelo-datos`

| Requirement · Scenario | Dónde se verifica |
|---|---|
| Migración y seed · base desde cero | `tests/modelo-migraciones.test.ts` › "deja todas las tablas del modelo sobre una base vacía"; `tests/seed.test.ts` |
| Migración y seed · seed idempotente | `tests/seed.test.ts` (sin cambios) |
| Migración y seed · la base de desarrollo es la misma que la de producción | `tests/modelo-migraciones.test.ts` › "es un solo árbol y su dialecto declarado es PostgreSQL" (y el hecho de que TODA la suite corre contra PostgreSQL) |
| Ciclo de vida · negocio recién creado | `tests/modelo-rechazo.test.ts`, `tests/modelo-migraciones.test.ts` › "una fila que solo escribe lo del modelo original deja nulo todo lo demás" |
| Ciclo de vida · publicación / rechazo con fecha y motivo / limpieza al volver a revisión | `tests/modelo-rechazo.test.ts` (sin cambios de fondo) |
| Ciclo de vida · valores fuera del conjunto | `tests/modelo-migraciones.test.ts` › `describe` "la base rechaza un valor fuera del conjunto" (9 casos, con `INSERT` crudo) |
| Ciclo de vida · las constraints sobreviven a todo el árbol | `tests/modelo-migraciones.test.ts` › "las cuatro constraints escritas a mano siguen vivas al final del árbol" (consulta `pg_constraint` **después** de `migrate deploy`) + "ninguna migración del árbol borra esas constraints" |
| Ciclo de vida · migración sobre una base con datos | `tests/modelo-migraciones.test.ts` › "una fila que solo escribe lo del modelo original deja nulo todo lo demás" — **reformulado, ver §5.2** |
| Ciclo de vida · el seed de demostración incluye un rechazo con motivo | `tests/seed-demo.test.ts` (sin cambios) |
| **Purga** · rechazado que cumplió el plazo | `tests/purga-rechazados.test.ts` › "elimina un rechazado de hace 90 días y otro de hace 91" |
| **Purga** · rechazado que todavía no cumple | `tests/purga-rechazados.test.ts` › "no toca un rechazado de hace 89 días" |
| **Purga** · no toca lo que no es suyo | `tests/purga-rechazados.test.ts` › "no toca publicados ni en revisión, por viejos que sean" |
| **Purga** · el que corrigió y volvió a la cola | `tests/purga-rechazados.test.ts` › dos pruebas (sin fecha de rechazo; y rechazado hace un año que volvió a `en_revision`) |
| **Purga** · idempotente | `tests/purga-rechazados.test.ts` › "correrla dos veces seguidas deja la base igual e informa cero" |
| **Purga** · el informe no filtra datos personales | `tests/purga-rechazados.test.ts` › "lo que informa es un conteo, sin un solo dato de nadie" + "el log de la purga no lleva ningún dato de nadie" |

### Spec `paginas-legales`

| Requirement · Scenario | Dónde se verifica |
|---|---|
| Placeholders y borrador · los pendientes operativos también están declarados | `tests/legales-textos.test.ts` › "el encargado del tratamiento sin nombrar sí está declarado, con su ticket" |
| Placeholders y borrador · la purga ya no es un pendiente | `tests/legales-textos.test.ts` › "la purga de los rechazados a los 90 días ya no aparece como pendiente" |
| El texto publicado no cambia | `tests/legales-paginas.test.ts` y `tests/legales-adversarial.test.ts` pasan **sin tocarse** |

### Scenarios verificados a mano (no automatizables)

| Qué | Cómo se verificó |
|---|---|
| El build no necesita la base | `DATABASE_URL="postgresql://nadie:nadie@127.0.0.1:1/ninguna" npm run build` → completa; las 27 rutas salen como `ƒ (Dynamic)` salvo 5 estáticas que no leen datos |
| El sitio funciona contra PostgreSQL de verdad | `PORT=3800 CRON_SECRET=… npm start` → `/` pinta las 8 categorías, `/servicios-del-hogar` lista los negocios ficticios, una ficha real responde 200 |
| La CSP viaja en las respuestas | `curl -sI http://localhost:3800/` y `…/aviso-de-privacidad` → la cabecera completa, también en la página **estática** |
| La ruta de la purga en un servidor de verdad | `curl` sin secreto → 404; con `Authorization: Bearer …` → `{"eliminados":0}` |
| El byte nulo ya no revienta nada | `curl "…/negocio/x-%00"` → 404 (antes del arreglo: 500) |
| Los cuatro comandos de `prisma/` | `db:seed`, `db:seed:demo` (12 ficticios), `db:backfill:busqueda`, `fotos:barrer-huerfanos` → todos en verde contra la base local |
| CI con una migración inválida | **no verificado en vivo** (requiere un PR). El paso existe y `prisma migrate deploy` sale con código ≠ 0 ante SQL inválido; queda para la etapa de seguridad si quiere forzarlo. |

---

## 3. Decisiones técnicas

1. **Un árbol, una migración, cuatro CHECK con nombre.** `prisma/migrations/20260906000000_inicial/` consolida las **siete** migraciones SQLite anteriores (el change decía tres: se escribió antes de que mergearan foto, reportes, despublicación y versión del aviso). Las constraints escritas a mano son **cuatro**, no dos: `Negocio_estado_check`, `Negocio_origen_check`, `Reporte_motivo_check`, `Reporte_estado_check`. Van como `ALTER TABLE … ADD CONSTRAINT` con nombre explícito —y no inline— para que se puedan buscar en `pg_constraint` y para que el error de la base nombre la regla violada.
2. **`prisma dev` y no Docker** (§1). Con la salida documentada.
3. **La suite usa `public`; la base local se reinicia en cada `npm test`.** Es la consecuencia honesta de la sesión compartida de PGlite: aislar por esquema habría sido una mentira que se filtra al `next dev` del desarrollador. Los datos de la base local son catálogos y negocios ficticios.
4. **Una conexión por cliente en las pruebas, cinco en la aplicación.** `tests/db.ts` usa `max: 1` porque PGlite corrompe el protocolo con dos consultas simultáneas de verdad; las pruebas de concurrencia no pierden nada, porque lo que comprueban es que dos operaciones simultáneas dejen **un** solo desenlace, y eso lo decide el `where` de la escritura. `src/lib/prisma.ts` usa `max: 5` **por una razón de producción, no de pruebas**: en serverless hay muchas instancias vivas y un pool grande por instancia agota el presupuesto del agrupador de Supabase mucho antes de que al sitio le haga falta esa concurrencia.
5. **El byte nulo se filtra en el borde, no cerca de la base** (`tieneByteNulo`/`sinBytesNulos` en `src/lib/texto.ts`). Ver §5.3.
6. **Un solo módulo para la puerta de las tareas** (`src/lib/tareas/secreto.ts`): 404 indistinguible y comparación de tiempo constante, compartidos por la purga y el barrido.
7. **La purga borra uno por uno con `borrarNegocioDefinitivamente`**, el mismo borrado del ARCO del panel, y no con un `deleteMany` en bloque: así se van también los archivos de la foto. Un `deleteMany` habría sido más corto y habría dejado las fotos huérfanas.
8. **CSP estática en `next.config.ts`, sin `nonce`.** Un `nonce` obliga a renderizar por petición **todas** las páginas, incluidas las legales, que hoy salen de la CDN. Se prefirió acotar orígenes sin costar rendimiento; el `'unsafe-inline'` queda como deuda declarada (§5.4).
9. **El barrido de fotos responde 500 cuando una salvaguarda lo detiene.** Es la traducción a HTTP del `process.exitCode = 1` del comando: un 200 con el motivo en el cuerpo lo daría por bueno el programador de tareas y las huérfanas se acumularían en silencio.
10. **`shadowDatabaseUrl` en `prisma7.config.ts`** apunta al puerto 51215 de `prisma dev` cuando no hay `DATABASE_URL`, para que `prisma migrate dev` funcione en un clon recién hecho. `migrate deploy` —lo que corre en CI y producción— no la usa.

---

## 4. Lo que hay que saber para operar (resumen; el detalle en `docs/despliegue.md`)

```bash
npm run db:local        # PostgreSQL local, en otra terminal
npx prisma migrate deploy
npm run db:seed
npm run dev
```

`npm test` **reinicia** esa base. Variables nuevas: `CRON_SECRET` (obligatoria en producción: sin ella la purga de los 90 días **nunca corre**, y eso es un incumplimiento del aviso de privacidad publicado) y `SHADOW_DATABASE_URL` (solo desarrollo).

---

## 5. Deuda, hallazgos y propuestas fuera de alcance

### 5.1 La spec de fotos quedó obsoleta antes de implementarse (hallazgo)

El delta `despliegue` dice: *"Mientras ese ticket no se implemente, el sistema NO DEBE aceptar ni servir archivos subidos"*. **T-008 ya mergeó**: el sitio acepta y sirve fotos, con un adaptador que escribe en el **sistema de archivos**. En Vercel ese disco es efímero, así que las fotos **desaparecerían en cada deploy**.

Está escrito con todas sus letras en `docs/despliegue.md` §7 y §10 (con las dos salidas: escribir el adaptador de Supabase Storage detrás del puerto que ya existe, o lanzar sin fotos), y en `.env.example`. **No se implementó el adaptador**: no está en la spec de este change y es trabajo con su propio diseño. **Propuesta: ticket propio, bloqueante si el directorio se anuncia con fotos.**

### 5.2 El scenario "migración sobre una base con datos" cambió de forma

Con un árbol de UNA migración no existe "una migración posterior sobre datos ya guardados": no hay migración posterior. Lo que se conserva —y es lo que el scenario protege— es que **las columnas que fueron llegando después nacen nulas y nada las rellena**. Eso lo prueba `tests/modelo-migraciones.test.ts` insertando una fila con solo las columnas del modelo original de T-001 y exigiendo que las diez posteriores queden nulas (y las dos del buscador, en blanco). Las cuatro réplicas manuales que había en `modelo-rechazo`, `modelo-despublicacion`, `modelo-reporte` y `modelo-version-aviso` se retiraron con una nota en cada archivo apuntando al nuevo. **Merece una enmienda de spec al consolidar.**

### 5.3 El cambio de dialecto destapó una regresión de robustez (arreglada)

PostgreSQL **no puede** guardar un byte nulo en una columna de texto: aborta la consulta. En SQLite cabía. Sin arreglarlo, una URL con `%00` devolvía **500 en vez de 404** y un comentario pegado con basura tumbaba el envío del reporte. Se arregló en el borde:

- `src/lib/ficha-url.ts` — un segmento con byte nulo no trae identificador (404, como cualquier URL inventada).
- `src/lib/admin/reportes.ts` — un id de reporte con byte nulo se responde `"ya-atendido"`, sin tocar la base.
- `src/lib/reportes/crear.ts` — el comentario se guarda sin bytes nulos; lo que el vecino escribió no se pierde.

No estaba en la spec: es "no romper lo que otras specs ya exigían" (`directorio-publico` › "segmentos hostiles no abren ninguna ficha"). **Para la etapa de seguridad: vale la pena barrer si queda otro borde donde texto de usuario llegue a la base sin pasar por aquí** (los del registro y el buscador ya lo filtran por otras vías: `normalizarTexto` y la validación de campos).

### 5.4 Deuda declarada del despliegue (toda en `docs/despliegue.md` §10)

1. Fotos en disco efímero (§5.1).
2. El encargado del tratamiento sin nombrar en el aviso (ADR-004) — ahora declarado en `PENDIENTES_OPERATIVOS_LEGALES` con ticket E6-3.
3. ARCO y despublicar del panel: T-015.
4. **La CSP lleva `'unsafe-inline'` en `script-src`.** Quitarlo exige `nonce` por petición y volver dinámico el sitio entero.
5. Restaurar un respaldo nunca se ha ensayado.
6. Cold start de Supabase en plan gratuito.

### 5.5 Propuestas fuera de alcance (no construidas)

- **Más cabeceras de seguridad.** La spec pide CSP y solo CSP; `Strict-Transport-Security`, `Referrer-Policy` y `X-Content-Type-Options` serían tres líneas en el mismo módulo y encajan en "poner el sitio en producción". No se agregaron por disciplina de alcance. **Recomiendo un `/rapido`.**
- **`DIRECT_URL` como variable del esquema.** El design §6 abría la puerta a dos URLs en producción. El spike mostró que **no hace falta**: `prisma migrate deploy` se corre a mano desde la máquina de quien despliega, con la conexión directa en la línea de comandos (`docs/despliegue.md` §4). Una variable menos que configurar y que documentar.
- **Ensayo de restauración de respaldo**, ping de uptime contra el cold start de Supabase, y `Dockerfile` (ADR-007 pide que la salida siga siendo barata, no construirla ahora).

### 5.6 Lo que el humano tiene que cambiar a mano

`CLAUDE.md` **no se tocó a propósito**: es configuración del agente y no la edita el dev. La línea 23 dice hoy:

```
- Next.js App Router + TypeScript + Tailwind; Prisma + SQLite en dev (ADR-001).
```

y ya no es cierta. Texto sugerido:

```
- Next.js App Router + TypeScript + Tailwind; Prisma + PostgreSQL en todos los entornos, `npm run db:local` para la base de desarrollo (ADR-004; enmienda a ADR-001).
```

Lo demás de la pasada de coherencia sí se hizo: `openspec/project.md`, `README.md`, `docs/decisiones/README.md`, `docs/backlog.md` (fila E0-3 y la deuda del barrido de huérfanas, que este change cierra) y los tres ADRs (ADR-004 y ADR-007 a **aceptada (ejecutada en E0-3 / T-013)** con su sección "qué se ejecutó"; ADR-001 con la nota de enmienda).

---

## 6. Archivos nuevos

- `docs/despliegue.md` — el documento de despliegue.
- `vercel.json` — programación de las dos tareas.
- `prisma/migrations/20260906000000_inicial/migration.sql` — el árbol nuevo.
- `prisma/cliente-script.ts` — el cliente de los comandos de `prisma/`.
- `src/lib/base-local.ts`, `src/lib/purga/rechazados.ts`, `src/lib/tareas/secreto.ts`, `src/lib/seguridad/csp.ts`.
- `src/app/api/tareas/purgar-rechazados/route.ts`, `src/app/api/tareas/barrer-fotos-huerfanas/route.ts`.
- `tests/esquemas.ts`, `tests/catalogo-db.ts`, `tests/modelo-migraciones.test.ts`, `tests/purga-rechazados.test.ts`, `tests/tareas-programadas.test.ts`, `tests/despliegue.test.ts`, `tests/configuracion-produccion.test.ts`.

Dependencias: **entran** `@prisma/adapter-pg`, `pg` y `@types/pg`; **sale** `@prisma/adapter-better-sqlite3` (un binario nativo menos que instalar en el hosting).

---

# Iteración 2 — respuesta a la etapa C

**Entrada:** `reports/c-seguridad.md` (BLOQUEADO: 5 altos, 8 medios, 6 bajos) y las correcciones que priorizó el orquestador.
**Gates, contra PostgreSQL:** `npm run lint` ✅ · `npm run build` sin base alcanzable ✅ · `npm test` ✅ **2513 pruebas + 2 saltadas, 93 archivos**, dos corridas seguidas idénticas.
**Las 4 pruebas que la etapa C dejó en rojo a propósito ([A1] ×2, [M3], [M4]) están en verde**, y sus 56 pruebas siguen pasando enteras.

## 1. Los cinco altos

### A1 · La guarda miraba un host que el driver no usa — CERRADO

`prisma/guardas-entorno.ts` ya no lee `new URL(url).hostname`. Hay un módulo nuevo, `src/lib/base-datos/conexion.ts`, que resuelve el host **con `pg-connection-string`**, que es literalmente el parser que `pg` tiene debajo (viene con `pg`, no es una dependencia nueva). Con eso:

- `postgresql://…@localhost:5432/x?host=db.supabase.co` → **remoto** (el driver se conecta a Supabase).
- `postgresql://…@inexistente.invalid:5432/x?host=localhost` → **local**.
- Una cadena con `hostaddr` → **remota y sospechosa**: `pg` no lo implementa y libpq sí, así que la misma cadena significa cosas distintas según quién la lea. No se adivina.
- Cualquier esquema que no sea `postgres(ql)://` → remoto. Esto recupera, con criterio explícito, lo que antes daba el prefijo `file:`.

Ante cualquier duda la respuesta es la cara. Pruebas: las dos `[A1]` de la etapa C, más 17 casos en `tests/configuracion-produccion.test.ts`.

### A2 · La conexión a Supabase iba sin cifrar — CERRADO, y en el código, no solo en el documento

Dos mitades, como pidió el orquestador:

1. **Los literales del documento** llevan `sslmode=require` (§3.1 y §4), y hay una **prueba que barre `docs/despliegue.md`**: cualquier `postgresql://` remoto sin `sslmode` reprueba la suite. Se añadió §3.4 con el porqué, la nota de que en este `pg` `require` se comporta como `verify-full` (y que en `pg` v9 cambiará), y qué hacer si la validación del certificado fallara **sin** apagar el cifrado.
2. **El código lo exige.** `motivoParaNoAbrirLaBase()` junta las dos condiciones que en producción no pueden faltar en silencio —dirección ausente y conexión en claro hacia fuera— y `obtenerPrisma()` **no abre nada** si alguna se cumple: lanza y deja el motivo en el log. Lo mismo en `prisma/cliente-script.ts`, que es justo lo que se corre contra Supabase desde una laptop. El aviso sale al arrancar (`src/app/layout.tsx`), una vez por proceso, y el mensaje **no incluye la contraseña** (probado).

### A3 · El tope de reportes ya no era atómico — CERRADO

`crearReporte` mete el `INSERT` condicionado dentro de una transacción y toma antes `pg_advisory_xact_lock(hashtext(negocioId))`. Se eligió el cerrojo consultivo sobre `SELECT … FOR UPDATE` del negocio porque **no toca ninguna fila real**: no compite con las transiciones del panel ni las bloquea, y la granularidad es la que se quiere (una ficha). Una colisión de `hashtext` entre dos fichas solo las serializa entre sí, que no cambia ningún resultado.

Detalle que costó encontrar: `pg_advisory_xact_lock` devuelve `void` y el cliente no sabe deserializar ese tipo — de ahí el `::text` en la consulta.

**La prueba de concurrencia real existe** (`tests/concurrencia-real.test.ts`): dos conexiones `pg` de verdad, dos transacciones abiertas a la vez, y las **dos caras** del asunto —con cerrojo B no pasa el tope; **sin** cerrojo B sí lo pasa—, porque una prueba que solo demuestra el caso bueno no demuestra que el arreglo haga algo.

**Honestidad sobre dónde corre:** en esta máquina **no la pude ver pasar**. El servidor local (`prisma dev`/PGlite) multiplexa todas las conexiones sobre un solo backend (`pg_backend_pid()` idéntico), así que no hay dos transacciones que entrelazar; y aquí no hay Docker ni PostgreSQL de sistema para levantar uno de verdad. El archivo lo detecta al cargar, **se salta con el motivo escrito en la consola** y corre en el CI contra el servicio `postgres:17`. Lo que sí verifiqué a mano contra la base local: que las sentencias son válidas y que el `INSERT` condicionado inserta bajo el tope y no inserta en el tope. La primera prueba del archivo es el guardián del guardián, para que "se saltó todo" nunca pase inadvertido.

### A4 · Contadores anti-abuso en memoria — CERRADO EL GRAVE, con una desviación argumentada

**Lo que se movió a la base:** el límite de intentos de acceso al panel, que es el que la etapa C señaló como grave y con razón — es lo único que frena la fuerza bruta contra `PANEL_CONTRASENA`, la única credencial del sitio.

- Tabla nueva `IntentoDeCupo` (migración `20260907000000_agrega_cupos_compartidos`), una fila por intento con su hora: **ventana deslizante de verdad**, idéntica a la que hacía la memoria. Una ventana fija habría regalado el doble de intentos en el borde.
- Comprobar y apartar van **en una transacción con cerrojo por clave**: en READ COMMITTED un `COUNT(*)` no bloquea lo que cuenta, y esto es exactamente el mismo agujero de A3.
- **No se guarda la IP.** La clave es un HMAC-SHA256 de `cupo:ip` con `PANEL_SESION_SECRETO`, truncado a 32 hex. No se puede volver atrás sin el secreto, rotarlo invalida el histórico entero, y las filas **se borran al salir de la ventana** en la misma transacción que las lee.
- **La memoria sigue, como respaldo documentado:** si la base no responde, el límite opera con el contador de esa instancia y se dice en el log como error (una vez). Mientras la base sí responde, el respaldo se mantiene caliente para que una caída a media fuerza bruta no arranque de cero.
- Se apunta **antes** de comparar la contraseña, no solo en los fallos: quien ataca controla cuántas veces prueba, no si acierta.

**Lo que NO se movió, y por qué (desviación de la instrucción, argumentada por escrito).** Los cupos del formulario público y del botón "Reportar" siguen en memoria. El aviso de privacidad **ya publicado** dice, literal (`src/lib/legales/textos.ts`):

> *"Cuando envías el formulario, el servidor usa tu dirección IP por menos de una hora, **solo en su memoria**… **No la guardamos en la base de datos** ni la ligamos a tu ficha."*

Moverlos a la base —aunque fuera como HMAC, que sigue siendo un dato derivado escrito en la base— **haría falsa esa frase**, y el delta `paginas-legales` de este mismo change dice que el texto publicado no cambia. El patrón `PENDIENTES_OPERATIVOS_LEGALES` del proyecto existe para declarar "el texto promete algo que el sistema todavía no hace"; usarlo para tapar lo contrario —"el sistema hace algo que el texto niega"— sería peor que el hueco de seguridad, porque es una afirmación falsa a un titular de datos. El panel no tiene ese problema: la IP del admin no está cubierta por esa frase, que habla de quien envía el formulario.

Lo que sí se hizo con ellos:
- **Se corrigió la frase falsa del documento** (era el mínimo que la etapa C pedía) y se añadió **§3.5**, una tabla que dice, límite por límite, si se comparte entre instancias o no, con el "qué hacer mientras tanto": que `PANEL_CONTRASENA` sea larga y al azar.
- Se declaró como **pendiente operativo legal** nuevo, con su ticket (E6-3 para la redacción, E0-3 para moverlos después).
- El mecanismo genérico ya está escrito (`apartarCupoCompartido` no sabe nada del panel): moverlos, cuando la revisión legal apruebe la redacción, es cambiar tres llamadas.

### A5 · Las fotos: el borrado ARCO mentía — CERRADO, con enmienda de spec

Se implementó el **adaptador de Supabase Storage** (`src/lib/fotos/almacen-supabase.ts`), detrás del mismo puerto, elegido por variables (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, bucket configurable). Sin SDK: son cuatro llamadas HTTP y `@supabase/supabase-js` serían megabytes en cada función serverless.

Para que el arreglo fuera de verdad hubo que **abrir el puerto**: ganó `listar()` y `descripcion()`. El barrido de huérfanas leía el directorio con `readdir`/`stat` por su cuenta, y eso era la mitad del hallazgo — con cualquier otro almacén se quedaba mirando a un sitio vacío e informando éxito. Ahora se lo pregunta al puerto.

Además, **salvaguarda nueva (la quinta)**: un almacén vacío **con fichas que dicen tener foto** ya no es "nada que barrer", es "estoy mirando al almacén equivocado" → `barrido: false` → **500**. Es el cierre exacto de A5.2, que las cuatro salvaguardas anteriores no cubrían porque ese caso no era "detenido", era "vacío".

Otras decisiones, todas en el código y en `docs/despliegue.md` §7:
- **El bucket va PRIVADO.** Quien decide si una foto se puede ver es nuestro servidor, que comprueba el estado del negocio en cada petición; un bucket público dejaría saltarse esa comprobación.
- **Configuración a medias = error visible**, no caída silenciosa al disco: una variable puesta y la otra no es justo el despliegue que pierde las fotos sin que nadie se entere.
- **Ningún error deja escapar la llave de servicio** (probado).
- `listar()` **pagina hasta el final**: leer una sola página haría creer huérfanas todas las fotos que no cupieron.

**Lo que estas pruebas no cubren y hay que hacer a mano:** las llamadas reales a Supabase. El adaptador se ejercita entero contra un `fetch` simulado detrás del puerto; la red de verdad se comprueba en la prueba de humo (§9, pasos **10 y 11**), que ahora incluye subir una foto, verla en el bucket, borrar la ficha y **volver a mirar el bucket**. Está anotado en §10.

## 2. Los medios

| # | Qué se hizo |
|---|---|
| **M1** | El 404 de las tareas ya no fabrica nada suyo: delega en `notFound()`. **Medido contra el sitio servido**: el marco da dos 404 distintos —11 090 bytes de HTML para una dirección inexistente, 0 bytes sin `content-type` para una ruta que existe y no encuentra—. Un Route Handler **no puede** emitir el primero. Lo que se consiguió es emitir exactamente el segundo: hoy la respuesta es idéntica a la de `/api/foto/…` con una clave que no existe, que es el otro Route Handler público del sitio. El requirement que añadí lo dice con ese alcance, sin prometer de más. |
| **M2** | La colación de la base local (`C`) frente a la del CI y Supabase (`en_US.utf8`) está documentada en §2 junto a los otros dos límites de PGlite, con el ejemplo de orden y la recomendación de usar un Postgres de verdad si se toca ordenamiento. |
| **M3** | `try` por registro en la purga. Y con una distinción que la etapa C no pedía pero hace falta: el borrado quita la **fila** antes que los archivos, así que un fallo del almacén significa "el registro sí se purgó y quedó una foto huérfana" (la recoge el otro cron), no "el registro sigue ahí". Se comprueba cuál de las dos fue. `fallidos` cuenta solo lo segundo, y la ruta responde **500** si no es cero. |
| **M4** | `sinBytesNulos` también en el motivo de rechazo y en el de despublicación. |
| **M5** | Aviso al arrancar, una vez por proceso, si falta `CRON_SECRET` en producción — con el nombre de la variable y la frase que importa: sin él la purga de los 90 días **no corre**, y el delta legal la retiró de los pendientes justo porque el sistema la ejecuta solo. |
| **M6** | El documento ya no enseña a poner la contraseña de producción en la línea de comandos: archivo con `umask 077` fuera del repo, `set -a && . archivo`, y qué hacer si ya quedó en el historial (borrarla **y rotarla**). También se acotó el paso 3 de la prueba de humo. |
| **M7** | Es la causa de A3; queda cerrado con `tests/concurrencia-real.test.ts` y con el comentario de `tests/db.ts` corregido: la generalización de "el `where` de la escritura decide" **vale para `updateMany` condicionado y no para el `INSERT … WHERE (SELECT COUNT(*))**, que es lo que dejó pasar A3. |
| **M8** | Enmiendas de spec, no notas en un reporte: el requirement de fotos se reescribió entero (con la enmienda citada y su porqué), el scenario "migración sobre una base con datos" se enunció en los términos verificables del árbol consolidado, y entraron cuatro requirements nuevos (TLS, cupos compartidos, tope atómico, 404 sin marca). Los dos scenarios que la etapa C verificó a mano (migración inválida en CI, CSP contra el sitio) quedan como verificación manual documentada. |

**Bajos:** B4 (`?pgbouncer=true` no hace nada con el adaptador de driver) y B6 (Hobby permite 2 crons y hay 2) están explicados en el documento; B5 (la migración citaba `tests/modelo-constraints.test.ts`) corregido. B2 y B3 se quedan como los dejó la etapa C: B2 es práctica normal y B3 sigue siendo un `/rapido`, ahora anotado en §10.

## 3. Lo que cambié de las pruebas de la etapa C, y por qué

Dos aserciones, las dos por la misma razón —el arreglo cambió la forma del resultado, no lo que la prueba vigila— y las dos con la nota escrita en el propio archivo:

- `[M3]` y los otros cuatro casos del bloque de los 90 días: `toEqual({ eliminados: N })` → `toMatchObject({ eliminados: N })`, porque `purgarRechazados` ahora informa también `fallidos` (que es lo que hace que la ruta responda 500 en vez de un 200 con la mala noticia dentro). Lo que la prueba comprueba —que el fallo del almacén con una ficha no impida purgar las demás— se asegura igual.
- Los 404 de las rutas de tareas: `expect(status).toBe(404)` → esperar el lanzamiento de `notFound()`, porque ya no se fabrica la respuesta (M1).

Ninguna otra prueba de la etapa C se tocó.

## 4. Deuda que esta iteración deja abierta

1. **Los dos cupos públicos siguen por instancia** (§A4). Bloqueado por la redacción del aviso: E6-3.
2. **`tests/concurrencia-real.test.ts` no se ha visto pasar en verde** en esta máquina (no hay Docker ni Postgres de sistema). Corre en el CI; si el validador quiere confirmarlo antes del PR, es mirar ese job.
3. **Las llamadas reales a Supabase Storage** no tienen prueba automática (§A5). Prueba de humo, pasos 10 y 11.
4. **Tres cabeceras de seguridad baratas** (`Referrer-Policy`, `X-Content-Type-Options`, `Strict-Transport-Security`) siguen fuera de alcance por spec; anotadas en §10 del documento y apoyadas por la etapa C. Un `/rapido`.
5. **`CLAUDE.md` línea 23** sigue diciendo "Prisma + SQLite en dev": no la toco (es configuración del agente). El texto sugerido está en §5.6 de la primera iteración.

## 5. Adenda del orquestador (batería Lighthouse/cabeceras)

**Cabeceras de seguridad globales**, en el mismo mecanismo de la CSP
(`src/lib/seguridad/csp.ts` → `next.config.ts`, regla `/:ruta*`):

| Cabecera | Valor | Nota |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | El sitio sirve **bytes subidos por usuarios** en `/api/foto/…`; esto quita la categoría entera de "el navegador adivinó otro tipo". |
| `X-Frame-Options` | `DENY` | **Elegido: van las DOS.** `frame-ancestors 'none'` ya estaba en la CSP y es la que manda donde se entiende; `X-Frame-Options` es la que respetan los navegadores viejos que ignoran esa directiva. Cuesta una línea y cubre a quien la otra no cubre. Documentado en §8 del documento y en el propio módulo. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Global. |
| `X-Powered-By` | **se quita** (`poweredByHeader: false`) | Ya no sale en ninguna respuesta. |

**La convivencia con el panel, verificada:** `/admin` emite
`<meta name="referrer" content="strict-origin">` en su layout y **esa meta manda
sobre la cabecera** para ese documento. No es un detalle de estilo: la global
manda la ruta completa dentro del propio sitio, y salir del panel hacia una
página pública mandaría `/admin/registros/<id>` como referente del mismo origen
—que el tracker de la analítica reenvía— (PRD §8, LFPDPPP). Hay una prueba que
falla si alguien iguala las dos políticas.

**Medido contra el sitio servido** (`npm start`, build de producción):

```
/            → CSP + X-Content-Type-Options: nosniff + X-Frame-Options: DENY + Referrer-Policy: strict-origin-when-cross-origin
/terminos    → (estática, desde la CDN) las mismas
/no-existe   → (404) las mismas
x-powered-by → no aparece en ninguna
/admin       → <meta name="referrer" content="strict-origin"/> presente
```

**Lo que NO se puso, y por qué:** `Strict-Transport-Security`. La manda el
hosting junto con su certificado; declararla desde la aplicación en un sitio que
todavía no tiene dominio es la forma clásica de dejar un dominio inaccesible
durante meses. Queda como **paso humano** en §10 del documento: activarla en
Vercel al configurar el dominio y comprobarla con el `curl` de §8.

**Deuda de vigilancia de dependencias** (`docs/despliegue.md` §10, punto 8).
Confirmado con `npm audit --json`: **4 altas, todas en la cadena del CLI de
Prisma** — `deepmerge-ts` (<8, agotamiento de pila) y `mysql2` (≤3.23, dos
avisos), que entran por `prisma` → `@prisma/config`. **No son explotables en el
runtime**: `prisma` es una `devDependency` (verificado en `package.json`), corre
solo al migrar y al generar el cliente, y no viaja en el despliegue; lo que se
despliega es `@prisma/client` + `@prisma/adapter-pg`, que no dependen de
ninguno de los dos, y el proyecto no habla MySQL por ningún lado. **No se corre
`npm audit fix --force`**, que es lo que sugiere la herramienta: instalaría
`prisma@6` y con Prisma 6 se pierde el adaptador de driver sobre el que está
montado todo este change. Se vigilan las notas de versión de Prisma 7.

---

# Iteración 3 — respuesta a la re-auditoría (§7)

**Entrada:** `reports/c-seguridad.md` §7 (los 5 altos cerrados y verificados; 3 medios nuevos: R1, R2, R3; 2 bajos: B7, B8).
**Gates, contra PostgreSQL:** `npm run lint` ✅ · `npm run build` sin base alcanzable ✅ · `npm test` ✅ **2590 pruebas + 2 saltadas, 94 archivos**.
**Los 2 tests `[R1]` y `[R2]` de la etapa C están en verde**, y sus 46 pruebas de la iteración 2 pasan enteras.

## R1 · Las marcas del cupo caducan de verdad — CERRADO

Tenía razón el hallazgo, y de la peor manera: la migración y el documento
prometían una retención que **no existía**. La limpieza vivía solo dentro de
`apartarCupoCompartido`, o sea solo para la clave que se vuelve a consultar.

`limpiarCuposCaducados` (en `src/lib/cupos/compartido.ts`), llamada desde la
tarea programada diaria (`purgarRechazados`), hace dos barridos:

1. **Retención.** Borra todo lo que salió del horizonte —**una hora**—, con un
   invariante ejecutable que exige que ese horizonte sea **mayor que la ventana
   del límite más largo en uso** (hoy, los 10 minutos del panel). Sin ese
   invariante, subir la ventana de un cupo a más de una hora debilitaría el
   límite en silencio, borrándole marcas todavía vigentes.
2. **Techo de filas.** `MAX_FILAS_DE_CUPOS = 5000`, el mismo número que el
   `MAX_IPS_RASTREADAS` del contador en memoria — con la diferencia escrita en
   el código: allá eran **IPs distintas** y aquí son **filas**, así que este es
   el más estricto de los dos. Se poda por lo más viejo, igual que el desalojo
   del mapa, y el efecto secundario (bajo avalancha, una procedencia bloqueada
   podría recuperar margen antes de tiempo) se acepta con los ojos abiertos y
   se documenta, porque es exactamente el que la versión en memoria ya tenía.

Detalle de implementación: la poda va en SQL crudo con parámetro ligado, porque
`deleteMany` de Prisma no admite orden ni límite.

La purga informa `cuposLimpiados` (un conteo, como todo lo demás). La limpieza
va **después y en su propio `try`**: un fallo suyo no puede tumbar la purga de
rechazados, que es la que tiene un compromiso publicado detrás.

**Y se corrigieron las tres frases que mentían:** la de la migración
`20260907000000`, la de `docs/despliegue.md` §3.5 y la del `schema.prisma`.

## R2 · El disco efímero ya no vuelve en silencio — CERRADO

Con el sistema desplegado y sin las variables de Supabase, `almacenDeFotos()`
ya no devuelve el disco local: devuelve un **almacén que falla a la vista**.
Lo que hace cada operación no es uniforme, y esa es la parte que pensé:

- **`guardar` lanza.** Es el único camino por el que se perderían datos en
  silencio. El alta del negocio sigue adelante y el vecino ve el aviso que ya
  existe (`AVISO_FOTO_NO_GUARDADA`), en vez de una ficha que promete una imagen
  que no existe.
- **`listar` lanza.** El barrido tiene que distinguir "no hay nada" de "no pude
  mirar": su cron responde 500, que es lo que se ve.
- **`leer` devuelve nada.** Aquí nunca se escribió nada; reventar una página
  pública no protegería a nadie.
- **`borrar` se completa sin error.** No hay ningún archivo que borrar, así que
  el borrado ARCO **no miente** — y esa es justo la diferencia con el disco
  efímero, donde sí había archivos y sí se mentía.

**Qué cuenta como "desplegado":** producción por `NODE_ENV`/`VERCEL_ENV`, **o**
que la base de datos no esté en esta máquina. Lo segundo cubre el *staging*
real y reutiliza el mismo criterio de host efectivo de A1, para que no haya dos
definiciones de "esto va en serio" que puedan discrepar. Sin `DATABASE_URL` se
asume local, igual que `apuntaABaseLocal`: un clon recién hecho arranca solo.

El aviso al arrancar se sumó a los otros tres en `src/app/layout.tsx`, y hay una
prueba que exige que los cuatro sigan en el tronco del módulo y no dentro del
componente.

## R3 · El tratamiento del panel, declarado por sí mismo — HECHO

Cuarto renglón en `PENDIENTES_OPERATIVOS_LEGALES`, y va **después** de R1 a
propósito: la retención que declara ("nada sobrevive más de una hora") solo es
cierta desde que la tarea diaria la hace cumplir. Declarar un plazo falso habría
sido peor que no declarar nada.

Dice las cuatro cosas que el hallazgo pedía: **qué** se guarda (una fila por
intento: HMAC-SHA256 de la IP, la hora, y nada más), **para qué** (frenar la
fuerza bruta contra la única credencial del sitio, que es la medida que el
art. 19 LFPDPPP le exige al responsable), **cuánto dura** y **a quién alcanza**
—cualquiera que envíe el formulario de `/admin`, que es una página pública, no
solo el admin—. Ticket E6-3, para que la revisión legal decida si el aviso
necesita una línea. No se tocó ningún texto publicado.

Coincido con el dictamen de la etapa C sobre por qué esto no contradice el
aviso: la frase de la IP está acotada por su disparador ("cuando envías el
formulario"), su finalidad ("frenar registros automatizados") y su destinatario
(quien registra su negocio). Lo que sí faltaba era declararlo, y ya está.

## B7 · `prefer` deja de contar como cifrado — HECHO

`prefer`, `allow` y `disable` ya no cuentan como cifrada, aunque `pg` trate hoy
los dos primeros como `verify-full`. El propio driver avisa de que en `pg` v9
adoptará la semántica de libpq, donde `prefer` **acepta texto claro como
respaldo**: aceptarlos ahora sería dejar que una subida de versión reabra A2
sola y en silencio. El mensaje distingue los dos casos —"no lo pediste" y "lo
que pediste no basta"—, porque no se arreglan igual.

## B8 · El socket Unix tiene salida — HECHO, con la decisión escrita

Son dos preguntas distintas y las respondí distinto, que es lo que el hallazgo
pedía decidir:

- **TLS: no se le exige.** Un socket es un archivo de esta máquina; los bytes
  no llegan a ninguna tarjeta de red. Pedir cifrado ahí dejaba al sistema sin
  arrancar **y con una instrucción que no arregla nada**, que es peor que no
  comprobar: quien la siga acaba poniendo `sslmode` a cualquier cosa para que el
  error desaparezca.
- **Guardas de escritura masiva: sigue sin contar como local.** De una ruta de
  socket no se puede saber a qué servidor lleva —un túnel SSH, un contenedor
  con producción montada, un `pgbouncer` delante de Supabase—. La salida es el
  permiso explícito (`SEED_DEMO_PERMITIR=1` / `BACKFILL_PERMITIR=1`), que es una
  decisión consciente en vez de un default silencioso. Esto además **mantiene
  intacto el invariante** de la etapa C (la guarda nunca más laxa que el
  driver), que compara contra un conjunto de hosts de máquina.

Y el mensaje de conexión insegura ahora **ofrece la salida**: dice cómo se
escribe un socket (`?host=/var/run/postgresql`) y que ahí no se pide cifrado.
Documentado en `docs/despliegue.md` §3.4 con las dos mitades.

## Deuda que sigue abierta (sin cambios)

1. Los dos cupos públicos siguen por instancia — bloqueado por la redacción del
   aviso (E6-3).
2. `tests/concurrencia-real.test.ts` no se ha visto pasar fuera del CI (no hay
   Docker ni Postgres de sistema en esta máquina).
3. Supabase Storage sin prueba de red: prueba de humo §9, pasos 10-11.
4. `Strict-Transport-Security` la pone el hosting (paso humano, §10).
5. Las 4 altas de `npm audit` en la cadena del CLI de Prisma (§10, punto 8).
6. `CLAUDE.md` línea 23 sigue diciendo "Prisma + SQLite en dev": no la toco.

---

# Iteración 4 — decisión R4 del fundador

**Entrada:** la consulta al fundador conforme al proceso (tope de iteraciones) sobre el hallazgo R4 de la etapa C. **Decisión: opción (a) — el borrado se niega a mentir.** Implementada tal cual.
**Gates, contra PostgreSQL:** `npm run lint` ✅ · `npm run build` sin base alcanzable ✅ · `npm test` ✅ **2613 pruebas + 2 saltadas, 95 archivos**.
**`[R4]` en verde**, y su prueba compañera invertida: ya no documenta el defecto, fija el comportamiento nuevo.

## Qué cambió, y el orden es el fondo del asunto

`borrarNegocioDefinitivamente` (`src/lib/negocio.ts`) **invirtió el orden**: lee la clave, **borra los archivos**, y sólo entonces borra la fila. Si la ficha tiene `fotoClave` y el almacén no se deja alcanzar, devuelve `"almacen-inalcanzable"` y **no toca la fila**. Devolvía `boolean`; ahora devuelve `"borrado" | "no-encontrado" | "almacen-inalcanzable"`, porque con dos valores no cabía la tercera respuesta.

El orden no es un detalle de implementación: **con la fila borrada primero, negarse es imposible**, porque ya no hay a qué volver. Hay una prueba que lo fija apuntando cuándo ocurre cada cosa en el camino real (`tests/admin-transiciones.test.ts`, "los archivos se borran ANTES que la fila, no después"), no leyendo el código.

Ficha **sin** foto: se borra normal aunque el almacén esté caído. No hay nada que alcanzar, y negarse ahí sería incumplir los 90 días por una configuración que a esa ficha no le afecta. También tiene su prueba, en los dos caminos (panel y purga).

## Lo que ve el admin

Literal nuevo en `src/lib/admin/textos.ts`, servido por `/admin/borrado-hecho`:

> **La ficha no se borró: no pude alcanzar el almacén de fotos. Revisa la configuración y vuelve a intentar.**

Dice las tres cosas en el orden en que hacen falta: qué NO pasó, por qué, y qué hacer. No dice "error" ni nombra variables de entorno — quien lee esa pantalla está atendiendo una solicitud ARCO por WhatsApp, no depurando un despliegue. Y es el único de los tres desenlaces en el que la ficha sigue existiendo, así que el enlace a la cola le sirve para reintentar; está anotado en la propia página.

## La purga diaria

Un registro en ese estado cuenta en `fallidos`, que es la maquinaria que la iteración 2 ya había construido: la ruta responde **500** y sale en el panel de fallos del cron. La fila se queda y mañana se reintenta. El log dice `su foto sigue en un almacén inalcanzable` **sin la clave de la foto ni ningún dato del negocio** (probado).

## Un efecto de arrastre que hubo que decidir

`crearAlmacenSinConfigurar().borrar` **pasó a lanzar**. En la iteración 3 lo dejé resolviendo con este razonamiento: *"aquí nunca se escribió nada, así que no hay archivo que borrar y el borrado no miente al completarse"*. La etapa C tenía razón en que el razonamiento tiene un agujero: **sólo vale si el almacén nunca estuvo configurado, y desde ahí eso no se puede saber**. El caso que ese almacén existe para atrapar es justo el contrario —estuvo configurado, se subieron fotos y la configuración se perdió—, y ahí la foto sí está en el bucket. Ahora lanza, y quien decide es `borrarNegocioDefinitivamente`, que sí tiene el dato que importa: si la ficha tiene `fotoClave` o no.

## Lo que se acepta a cambio, con los ojos abiertos

Al invertir el orden aparece el riesgo contrario: que los archivos se borren y luego falle el `deleteMany`. Esa ficha se queda **sin foto pero viva**. Es reparable (el dueño vuelve a subirla, y mientras tanto la ficha muestra su marcador) y es visible. Lo otro —el dato personal vivo, sin fila que lo nombre, con acuse de recibo de que se había borrado— no era ninguna de las dos cosas. Está escrito en el comentario de la función y en el requirement nuevo.

## Pruebas tocadas de la etapa C, y por qué

Dos, las dos porque el comportamiento correcto cambió el número que esperaban, no lo que vigilan:

- **`[M3]`** (iteración 1) esperaba `eliminados: 2` cuando el almacén falla con una de las dos fichas. Con la decisión del fundador, esa ficha ya no se borra: ahora es `eliminados: 1, fallidos: 1`. **Su intención se conserva y se refuerza**: la ficha sana se sigue purgando (misma aserción de antes) y se añadió que la otra sigue ahí, que es justo lo que la decisión protege.
- **El compañero de `[R4]`** documentaba a propósito el defecto ("la fila se va y nada avisa") con una nota de cuál sería el comportamiento correcto. Se invirtió a fijar exactamente esa nota.

Además, mis propias pruebas de `borrarNegocioDefinitivamente` pasaron de `toBe(true/false)` a los literales del resultado, y la de la iteración 3 sobre `borrar` que no lanzaba se reescribió con el porqué del cambio.

## Alcance de la enmienda de spec

El requirement nuevo va en el delta de **`despliegue`** —"El borrado definitivo se niega a decir que borró lo que no borró"— y no en `revision-admin`: lo que aquí se decide es cómo se comporta el sistema cuando el ALMACENAMIENTO del despliegue no responde, que es materia de este change; el requirement de `revision-admin` sobre el borrado ARCO no cambia de contrato, sólo gana un desenlace más que la pantalla ya sabe pintar. Queda anotado para quien consolide las specs al archivar.
