# Etapa D (validación) — preparar-deploy-produccion

**Rama:** `feature/preparar-deploy-produccion` (worktree `.claude/worktrees/wt-t013`) · **Ticket:** T-013 · **Fecha:** 2026-09-04

## Veredicto: **APROBADO**

Nada de lo que sigue se da por bueno porque lo diga un reporte previo: todo lo central se volvió a ejecutar aquí, contra la base, contra el servidor y contra el documento.

---

## 1. Compuertas mecánicas (ejecutadas por mí)

| Gate | Resultado |
|---|---|
| `npm run lint` | ✅ limpio |
| `npm run build` **sin base alcanzable** (`DATABASE_URL` a un puerto muerto) | ✅ 27 rutas; ninguna se prerenderiza leyendo la base |
| `npm test` | ✅ **95 archivos, 2616 pruebas, 2 saltadas** (`concurrencia-real`, que exige un Postgres de verdad y corre en el CI) |
| `npx prisma migrate deploy` sobre esquema vacío | ✅ 2 migraciones aplicadas |
| `npm run db:seed` | ✅ 8 categorías, 21 colonias, 49 giros |
| `prisma migrate diff` base viva ↔ esquema | ✅ *No difference detected* (sin drift) |

Los gates se repitieron **sobre el árbol fusionado con `origin/main`** (ver §6).

## 2. La migración única, desde cero, con los CHECK vivos

`DROP SCHEMA public` → `migrate deploy` → seed, y después `INSERT`/`UPDATE` crudos con `pg`, saltándome la aplicación entera:

| Ataque directo a la base | Resultado |
|---|---|
| `INSERT … estado='inventado'` | ❌ rechazado — `Negocio_estado_check` |
| `INSERT … origen='fantasma'` | ❌ rechazado — `Negocio_origen_check` |
| `UPDATE … estado='borrado'` | ❌ rechazado — `Negocio_estado_check` |
| `UPDATE … origen='OrGaNiCo'` (mayúsculas) | ❌ rechazado |
| `UPDATE … estado=''` | ❌ rechazado |
| `INSERT Reporte … motivo='spam'` | ❌ rechazado — `Reporte_motivo_check` |
| `INSERT Reporte … estado='archivado'` | ❌ rechazado — `Reporte_estado_check` |
| Valores válidos (`rechazado`/`siembra`/`no_real`/`atendido`) | ✅ entran |

Las cuatro constraints están en `pg_constraint` **con nombre**, así que el error de la base nombra la regla violada. Fila escrita con solo las columnas del modelo original → todas las posteriores nulas (`fotoClave`, `tokenGestion`, `rechazadoEn`, `motivoRechazo`, `despublicadoEn`, `consintioAvisoVersion`): ninguna migración rellena datos que nadie declaró.

## 3. Las guardas, con mis payloads (24 direcciones)

`?host=` disfrazado, `hostaddr`, sockets, `sslmode` en todas sus formas, esquemas ajenos, IPv6, sufijos tramposos:

- `postgresql://…@localhost:5432/x?host=db.abcd.supabase.co` → **remota**, exige TLS. La guarda no se deja engañar por lo que se lee en la URL.
- `prefer`, `allow`, `disable` → **no cuentan como cifrado**; `require`, `REQUIRE`, `verify-full`, `%72equire` → sí.
- `hostaddr=`, `file:`, `mysql:`, basura, vacío → **sospechosas ⇒ remotas** (fallan cerrado).
- `127.0.0.1.evil.com` → remota. `[::1]`, `LOCALHOST`, `127.0.0.1` → locales.
- Socket Unix → no se le exige TLS, y **sigue sin contar como local** para las escrituras masivas.
- Único caso donde mi expectativa falló y el código tiene razón: `?HOST=` en mayúsculas. `pg-connection-string` —el parser del propio driver— no honra la clave en mayúsculas, así que el driver **también** se conectaría a `localhost`: la guarda no es más laxa que el driver, que es el invariante que importa.
- Ningún mensaje de error filtra la contraseña de la base (comprobado con una contraseña señuelo en la cadena).

Comandos que escriben en masa, ejecutados de verdad: `VERCEL_ENV=production` + `SEED_DEMO_PERMITIR=1` → no siembra nada y lo dice; base remota (incluida la disfrazada) sin permiso → se niega y explica; sin TLS → falla a la vista antes de abrir la conexión; contra la base local → siembra los 12 ficticios avisando de que son "de MENTIRA".

## 4. Purga, barrido y cron con `Bearer`, en un servidor real

`next start` de producción, puerto 3999, con datos ficticios sembrados a mano (rechazado de 100 días, rechazado de 89, publicado, dos marcas de cupo):

- Sin encabezado, con `Bearer` equivocado, con el secreto **truncado** (mismo prefijo) y con `Authorization` sin `Bearer` → **404 en los cuatro casos**, cuerpo de 0 bytes, y no se borró nada.
- Con el secreto correcto → `200 {"eliminados":1,"fallidos":0,"cuposLimpiados":1}`. Comprobado en la base: se fue **solo** el de 100 días; el de 89 y el publicado, intactos; se recogió la marca de cupo de 2 h y sobrevivió la de un minuto.
- Segunda corrida → `{"eliminados":0,"fallidos":0,"cuposLimpiados":0}`, 200: idempotente.
- Barrido de huérfanas con el almacén sin configurar → **500** `{"barrido":false}`: no dice "nada que barrer". Fail-closed comprobado en vivo.
- El log solo lleva conteos: ni un nombre, ni un WhatsApp, ni un motivo.

## 5. Fail-visible, arrancando sin cada variable

Cuatro arranques reales de `next start`:

| Arranque | Lo que salió |
|---|---|
| Sin `DATABASE_URL` | `[base] falta DATABASE_URL…` **una sola vez**, no cae a ninguna base local, y las pantallas que leen datos dan 500 (no un silencio) |
| Remota sin TLS | `[base] …viajaría SIN CIFRAR…` con el nombre del host y **sin la contraseña**; no abre la conexión |
| `?host=` remoto disfrazado de `localhost` | mismo bloqueo por TLS: la guarda vale también arrancando |
| Sin nada | los **cuatro** avisos: `SITIO_URL`, `DATABASE_URL`, `CRON_SECRET` y el de Supabase Storage |

Con todo configurado, el único aviso es el de las fotos (no hay cuenta de Supabase todavía), que es lo correcto.

**Cabeceras**, medidas contra el servidor: las cuatro (`CSP`, `nosniff`, `DENY`, `Referrer-Policy`) viajan en página dinámica, página estática, `robots.txt`, activo de `_next` y 404 HTML; `x-powered-by` no aparece en ninguna; `/admin` conserva su `<meta name="referrer" content="strict-origin">`.

## 6. Integración con `origin/main`

Fusionado `origin/main` después de validar. Gates completos repetidos sobre el árbol fusionado y flujo crítico re-verificado en servidor real. Detalle de conflictos y resolución, en el cuerpo del PR.

## 7. Los dos guardianes, probados por mutación

No basta con que estén verdes; tienen que **saber ponerse rojos**:

- Agregué una lectura `process.env.VARIABLE_INVENTADA_DE_VALIDACION` → `tests/despliegue.test.ts` falló nombrando la variable y el archivo. Revertido.
- Agregué una página que consulta la base sin rendirse por petición → la prueba de rutas dinámicas la señaló por nombre. Revertida.

## 8. Hallazgos

### Corregidos aquí (editoriales, autorizados)

1. **`src/lib/purga/rechazados.ts:144`** — el comentario decía "el borrado quita la FILA antes que los archivos", que es exactamente lo contrario de lo que hace el código desde la decisión R4. La lógica que envolvía era correcta; el porqué escrito, invertido. Reescrito.
2. **`CLAUDE.md:23`** — "Prisma + SQLite en dev (ADR-001)" → PostgreSQL en todos los entornos, citando ADR-004 / T-013 y la enmienda a ADR-001.
3. **`specs/modelo-datos/spec.md`, scenario "una ficha falla y las demás se purgan"** (MEDIO, encontrado por mí) — la enmienda de la iteración 2 dejó escrito que ante un almacén inalcanzable *"ese registro se elimina igual —la fila se borra antes que los archivos— … y el archivo suelto lo recoge el barrido"*. La decisión del fundador (iteración 4) invirtió justo eso: hoy el registro **no** se elimina, se cuenta aparte y el cron responde 500. Era la única contradicción viva del contrato, y se habría consolidado a `openspec/specs/` como tal. Reenunciado con nota de enmienda; el código y las pruebas ya fijaban el comportamiento nuevo.
4. **`reports/c-seguridad.md:213`** — traía un **byte nulo crudo** (residuo de un payload adversarial) que volvía el archivo binario para `grep`. Sustituido por el texto `\0`, sin cambiar el sentido de la frase.

### No bloqueantes, para el checkpoint / la consolidación

5. **BAJO · El 404 de las tareas no es byte-a-byte el de `/api/foto`.** El scenario pide "la misma respuesta, byte por byte". Medido: son idénticas salvo que **la ruta de fotos** añade `cache-control: no-store` (`src/lib/fotos/servir.ts:68`) y la de tareas no. Lo normativo del requirement —"ninguna cabecera que no ponga el marco de trabajo"— lo cumple la ruta de tareas de forma **más** estricta que su propia referencia. No se toca el código (añadirle esa cabecera sería darle una marca propia); al consolidar, conviene reformular el scenario contra "el 404 vacío del marco" en vez de contra la ruta de fotos.
6. **BAJO · `docs/despliegue.md` §6** documenta la respuesta de la purga como `{"eliminados": 0, "fallidos": 0}`; la real trae también `cuposLimpiados`.
7. **BAJO · `docs/despliegue.md` §2** anuncia "tres cosas" y enumera cuatro; §10 numera dos ítems como "8".
8. **BAJO · delta de `paginas-legales`** dice "la lista … hoy son dos" y la implementación declara **cuatro** pendientes (las iteraciones 2 y 3 sumaron los cupos en memoria y el tratamiento del panel). Los cuatro son ciertos y la norma pide "reflejar la realidad del sistema", así que no hay incumplimiento; la cuenta en prosa hay que actualizarla al consolidar.

### Verificado y sin hallazgos

- **Alcance:** 82 archivos tocados contra la base de la rama, todos dentro de lo que piden `proposal.md`, `design.md` y el encargo del orquestador. El borde del byte nulo (`src/lib/texto.ts` y sus tres llamadores) no estaba en la spec pero es un defecto que **introduce** el cambio de dialecto —`%00` pasaba de dato raro a 500—, así que corregirlo es del change, no scope creep.
- **`tasks.md`:** las 36 tareas marcadas y hechas; las cuatro "correcciones al enunciado" del dev (siete migraciones, cuatro constraints, cinco sitios del adaptador) verificadas contra el árbol real.
- **Criterios de aceptación de T-013:** los siete cumplidos.
- **Secretos y datos personales:** ningún token, llave ni credencial en el diff; todos los teléfonos son de las series ficticias `771000xxxx` / `771999xxxx`; `.env.example` no trae ni un valor secreto.
- **ADRs:** ADR-004 y ADR-007 en "aceptada (ejecutada en E0-3 / T-013)" con su sección de qué se ejecutó; ADR-001 con nota de enmienda; `docs/decisiones/README.md` refleja los tres estados.
- **Convenciones:** UI y mensajes en español mexicano (incluido el literal de R4 que ve el admin); sin `any` gratuitos; dependencias nuevas justificadas (`@prisma/adapter-pg`, `pg`, `@types/pg` entran; `@prisma/adapter-better-sqlite3` sale).
- **`docs/despliegue.md` leído como quien despliega mañana:** las cinco partes que pide la spec están, con el valor literal `x-forwarded-for`, el orden de operaciones, la contraseña fuera de la línea de comandos, el bucket privado y por qué, el `curl` de las cabeceras, la prueba de humo de 12 pasos y la deuda conocida. No encontré ningún paso que obligue a abrir el código.

## 9. Lo que este veredicto NO cubre

El CI de GitHub Actions debe quedar **en verde en el PR**: mi validación es local y no lo sustituye. En particular, lo único que aquí no se pudo ejercitar es `tests/concurrencia-real.test.ts` (la base local multiplexa las conexiones sobre un solo backend), que es justo la prueba del tope atómico de reportes contra `postgres:17`. Y quedan fuera de todo automatismo, por naturaleza: la prueba de humo con cuentas reales (Supabase Storage por red, §9 pasos 10-11), el HSTS del hosting y el borrado ARCO contra un bucket de verdad.

**El merge lo hace un humano.**
