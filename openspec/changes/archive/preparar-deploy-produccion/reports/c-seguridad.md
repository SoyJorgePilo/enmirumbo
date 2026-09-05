# Etapa C (seguridad y pruebas) — preparar-deploy-produccion

**Rama:** `feature/preparar-deploy-produccion` (worktree `.claude/worktrees/wt-t013`)
**Entrada:** spec (`despliegue` nueva + deltas `modelo-datos` y `paginas-legales`), `reports/b-dev.md` (iteraciones 1 y 2), `git diff origin/main...`, y verificación en vivo contra la base local (PostgreSQL 17.5 / PGlite) y contra el sitio servido con `npm start`.

> **Este documento tiene dos partes.** La revisión de la **iteración 1** se conserva íntegra abajo (§1-§6), porque es la que explica por qué existen los arreglos. La revisión de la **iteración 2** —que es el estado actual— está en **§7**, al final.

---

# VEREDICTO ACTUAL (iteración 4 — final)

**LIMPIO. Pasa al validador.** Cero hallazgos abiertos: los 5 altos, los 11 medios y los 6 bajos de las cuatro iteraciones están cerrados y verificados contra el código real. **Toda la suite en verde**, incluidas mis 122 pruebas adversariales: ninguna queda en rojo.

| Severidad | It. 1 | It. 2 | It. 3 | **It. 4 (final)** |
|---|---|---|---|---|
| Crítico | 0 | 0 | 0 | **0** |
| Alto | 5 | 0 | 0 | **0** |
| Medio | 8 | 3 | 1 (R4) | **0** |
| Bajo | 6 | 2 | 0 | **0** |

## Gates (iteración 4)

| Gate | Resultado |
|---|---|
| `npm run lint` | ✅ limpio |
| `npm run build` (con `DATABASE_URL` a un puerto muerto) | ✅ completa |
| `npm test` | ✅ **2616 pasan / 0 fallan / 2 saltadas** (95 archivos). Las 2 saltadas son las de concurrencia real, que sólo corren en el CI y cuyo salto tiene guardián propio (§7.3). |

---

## 1. Frente por frente, lo que sí aguantó

Antes de los hallazgos, lo que audité y salió bien, porque también es información:

**La migración única, tabla por tabla contra las 7 de SQLite.** Las 30 columnas de `Negocio`, las 7 de `Reporte`, los 3 catálogos y la tabla puente están todas, con los tipos equivalentes (`DATETIME`→`TIMESTAMP(3)`, `REAL`→`DOUBLE PRECISION`, `INTEGER AUTOINCREMENT`→`SERIAL`, `TEXT`→`TEXT`). El `UNIQUE(A,B)` de `_GiroToNegocio` pasó a PK compuesta: mismo invariante. Las 5 claves foráneas conservan `RESTRICT`/`SET NULL`/`CASCADE` exactamente como estaban.

**Las cuatro CHECK aguantan escritura cruda hostil.** Verificado en vivo contra la base, con `INSERT` y con `UPDATE` (que es como se escribe una transición ilegal, y que el dev sólo probaba con `INSERT`): `PUBLICADO`, `Publicado`, `publicado ` (espacio final), ` publicado`, `publicado\n`, `publicado\t`, cadena vacía, `publi-cado`, `publicadó`, y un homoglifo cirílico (`publicadо`, U+043E) — los once rechazados con `23514`, nombrando la constraint. Igual para `origen`, `Reporte.motivo` y `Reporte.estado`. `pg_constraint` las lista las cuatro después de `migrate deploy`.

**Los índices únicos parciales.** En SQLite la migración de la foto dependía explícitamente de que "un índice único admite varios NULL". En PostgreSQL el default es el mismo (no lleva `NULLS NOT DISTINCT`): verificado que tres fichas sin foto y sin token conviven, y que dos claves de foto iguales, dos tokens iguales o dos WhatsApp iguales siguen rebotando. Fijado con pruebas para que no dependa de un comentario.

**Colación y bytes raros.** El byte nulo (`0x00`) es **el único** carácter que PostgreSQL rechaza en una columna de texto (`22021`): los surrogates sueltos (`\uD800`), los no-caracteres (`U+FFFF`), los bidi-override y los emoji con ZWJ entran sin ruido (el driver los transcodifica a U+FFFD). O sea: el barrido que el dev pidió en su §5.3 está completo por el lado de los *caracteres*; lo que falta son *bordes* (ver M4).

**El buscador y el `LIKE` sensible a mayúsculas.** Confirmado contra la base que en PostgreSQL `LIKE '%PLOME%'` **no** encuentra `plomeria` (en SQLite sí lo encontraba). El requirement se sostiene porque las dos puntas pasan por `normalizarTexto` y quedan en `[a-z0-9 ]`. No hay regresión, pero era un candado que sólo existía en un comentario: ahora hay pruebas que fallan si alguien deja de normalizar una de las dos puntas.

**Los 90 días de la purga, al milisegundo.** `rechazadoEn <= ahora − 90d`: a 90 días menos 1 ms no borra, a 90 días exactos borra, con fecha futura no borra, y un rechazado viejo que además arrastra `despublicadoEn`/`publicadoEn` sí se va. La cascada de reportes y el borrado de la foto se comprobaron.

**El CI reprueba de verdad una migración inválida.** El dev lo dejó como "no verificado en vivo". Lo forcé: metí una migración con un tipo inexistente y `npx prisma migrate deploy` sale con **código 1** y el error de PostgreSQL. El paso "Aplicar migraciones" del workflow reprueba el PR. Scenario cerrado.

**La CSP no rompe el sitio real.** Con el sitio servido, ni `/`, ni `/registro`, ni `/buscar`, ni las legales piden un solo recurso de un origen externo (el único `https://` en el HTML de `/registro` es el *placeholder* de texto del campo de Facebook). La cabecera viaja también en las páginas estáticas y en el 404. Los dos dominios de Umami son los correctos y están en la directiva correcta cada uno (`script-src` ← `cloud.umami.is`, `connect-src` ← `gateway.umami.is`). `frame-ancestors 'none'`, `form-action 'self'`, `object-src 'none'` y `base-uri 'self'` están puestos.

**El `'unsafe-inline'`, evaluado honestamente:** con él, la CSP **no aporta nada contra XSS de script** — un `<script>` inyectado en el HTML se ejecutaría igual. Lo que sí aporta, y no es poco para este sitio, es acotar **orígenes**: un script inyectado no puede cargar payload de otro dominio ni exfiltrar a otro dominio (`connect-src 'self' + gateway`), no se puede enmarcar el sitio, y un formulario no puede postear a otro host. Dado que (a) el escape lo hace React en todo el árbol, (b) el único `dangerouslySetInnerHTML` del proyecto es el JSON-LD y **sí escapa `<` a `<`** (`src/lib/seo/datos-estructurados.ts:114`), y (c) el `nonce` costaría volver dinámico el sitio entero, la decisión me parece **correcta y bien documentada**. No es hallazgo; es deuda bien declarada.

**La puerta de las tareas.** Fail-closed en los dos caminos y en las dos rutas: secreto vacío → 404 antes de comparar nada; comparación de tiempo constante con `timingSafeEqual`. Le tiré 14 variantes de `Authorization` (esquema en otra caja, doble espacio, basura pegada, un carácter de menos, salto de línea, el secreto en mayúsculas, dos secretos, prefijo repetido): ninguna abre. El 500 fail-closed del barrido está bien: verifiqué que ninguno de sus mensajes de salvaguarda lleva una clave de foto, y el cuerpo de las dos rutas es sólo de conteos.

---

## 2. Hallazgos ALTOS (bloquean)

### A1 · La guarda "es una base local" se salta con un parámetro estándar de PostgreSQL

**`prisma/guardas-entorno.ts:51-66`** (código nuevo de este change).

`apuntaABaseLocal` decide si la dirección es local leyendo `new URL(url).hostname`. El driver **no usa ese hostname** si la cadena trae el parámetro `?host=`, que es sintaxis normal de cadena de conexión de PostgreSQL y la implementa `pg-connection-string` (el parser que hay debajo de `@prisma/adapter-pg`).

Comprobado en vivo, en las dos direcciones:

```
new pg.Client({connectionString:'postgresql://a:b@localhost:1/x?host=evil.example.com'}).host
→ 'evil.example.com'

# y al revés: una URL con hostname inexistente + ?host=localhost CONECTA
postgresql://postgres:postgres@db.necesitouno-inexistente.invalid:51214/template1?host=localhost
→ conectó a la base local
```

**Escenario de explotación.** Alguien pone en su `.env` (copiado de una guía, heredado de un compañero, o pegado desde un canal de chat):

```
DATABASE_URL="postgresql://postgres:CLAVE@localhost:5432/postgres?host=db.XXXX.supabase.co"
```

Desde su laptop, `NODE_ENV` y `VERCEL_ENV` no valen `production`, así que `esEntornoDeProduccion` dice `false`; `apuntaABaseLocal` mira `localhost` y dice `true`; `motivoParaNoSembrar` devuelve `null` **sin pedir `SEED_DEMO_PERMITIR=1`**. `npm run db:seed:demo` siembra **12 negocios de mentira en la base de producción**, con sus fotos, y como es idempotente por WhatsApp nadie lo nota hasta que aparecen en el directorio. Exactamente la misma puerta abre `npm run db:backfill:busqueda`, que **reescribe dos columnas de TODAS las fichas** de la base a la que apunte.

Es un hallazgo de este change: la guarda vieja preguntaba por el prefijo `file:`, que no tenía esta ambigüedad; la nueva la introduce.

**Arreglo sugerido:** derivar el host con el mismo parser del driver (`new pg.Client({connectionString}).host`, o `pg-connection-string`), o rechazar de plano cualquier cadena que traiga `host` o `hostaddr` como parámetro de consulta.

**Pruebas:** `tests/despliegue-seguridad-adversarial.test.ts` → `[A1] la guarda coincide con el host al que el driver se conecta de verdad` y `[A1] con esa cadena el seed de demostración pide permiso explícito`. **Las dos en rojo** hasta que se corrija.

---

### A2 · La conexión a Supabase que documenta el despliegue viaja SIN TLS

**`docs/despliegue.md:111` (§3.1, `DATABASE_URL`) y `docs/despliegue.md:151` (§4, paso 2).**

El documento fija los dos valores de producción:

- app: *"Termina en `:6543/postgres?pgbouncer=true`"*
- migraciones/seed: `postgresql://postgres:CLAVE@db.XXXX.supabase.co:5432/postgres`

Ninguno lleva `sslmode`. `@prisma/adapter-pg` es `pg`, y **`pg` no negocia TLS salvo que la cadena lo pida** (`pg.defaults.ssl === false`). Comprobado con los literales exactos del documento:

```
postgresql://postgres:CLAVE@db.abcdefgh.supabase.co:5432/postgres            → ssl: false
postgresql://…@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true → ssl: false
postgresql://…?sslmode=require                                               → ssl: {…}
```

**Esto es una regresión introducida por este change.** Hasta ahora la base era un archivo local; al mudarse a un driver JS, se hereda el default de `pg`, que es "sin cifrar". (El motor Rust de Prisma, que es lo que la gente asume, usaba `sslmode=prefer`.)

**Escenario de fuga.** Cada consulta entre las funciones de Vercel y Supabase cruza Internet en claro: nombres de negocio, números de WhatsApp, direcciones, motivos de rechazo, comentarios de reportes — **todo el conjunto de datos personales del directorio (PRD §8, LFPDPPP)**, legible por cualquiera en el camino. Y en el paso 2 de §4 el operador manda además **la contraseña de la base** por ese mismo canal sin cifrar, desde su laptop, probablemente desde una red que no controla. Si Supabase tuviera activado "Enforce SSL", el efecto sería otro pero igual de imputable al documento: el despliegue falla y nadie sabe por qué.

**Arreglo sugerido:** poner `?sslmode=require` (o `verify-full`) en los dos valores literales del documento y en `.env.example`, y añadirlo a la prueba de humo de §9. Ojo con el aviso de `pg`: hoy `require` se comporta como `verify-full` y eso cambiará en pg v9, así que conviene escribir el modo que de verdad se quiere.

---

### A3 · La sentencia "atómica" del tope de reportes ya no es atómica

**`src/lib/reportes/crear.ts:177-184`.**

```sql
INSERT INTO "Reporte" (...) SELECT ...
WHERE (SELECT COUNT(*) FROM "Reporte" WHERE "negocioId"=$ AND "estado"='pendiente') < 10
```

Este es el arreglo del hallazgo A1 de la etapa C de T-011, y funcionaba **porque SQLite serializaba las escrituras con un lock de base**: la sentencia era atómica de verdad. PostgreSQL corre en `READ COMMITTED` (verificado: `show transaction_isolation` → `read committed`) y el sub-`SELECT` es una lectura de instantánea **que no toma ningún lock sobre las filas que cuenta**. Dos peticiones simultáneas que empiecen antes de que la otra confirme cuentan las mismas 9 pendientes y **las dos insertan**. El tope se pasa.

En producción el escenario no es teórico: `src/lib/prisma.ts` abre `max: 5` conexiones **por instancia**, y en serverless hay muchas instancias vivas. Un cliente HTTP/2 que dispare 20 envíos en paralelo contra la misma ficha —que es literalmente el ataque que el requirement "Anti-abuso del reporte sin captcha" describe— entra por encima del tope.

**No hay prueba que lo detecte, ni la puede haber en este proyecto hoy** (ver M7): todos los clientes de la suite usan `max: 1`, así que los `Promise.all` de `tests/reportes-seguridad-adversarial.test.ts:189-244` quedan serializados por el pool y pasan siempre.

**No añadí prueba para esto** a propósito: la base local (`prisma dev`/PGlite) multiplexa **todas** las conexiones sobre un solo backend de PostgreSQL (verificado: dos clientes distintos devuelven `pg_backend_pid() = 42`), así que una carrera de verdad no es reproducible aquí, y una prueba que sólo corre en CI y que no puedo ver pasar sería peor que no tenerla. Queda descrito el experimento: dos conexiones, `BEGIN` + la sentencia en cada una, `COMMIT` en las dos → 11 pendientes con tope 10.

**Arreglo sugerido:** un `SELECT ... FROM "Negocio" WHERE id=$ FOR UPDATE` dentro de la misma transacción antes del `INSERT` (serializa por ficha, que es la granularidad que se quiere), o un `pg_advisory_xact_lock` sobre el hash del `negocioId`.

---

### A4 · Los tres límites anti-abuso viven en memoria del proceso, y el destino es serverless

**`src/lib/registro/limite-ip.ts:5-9` · `src/lib/reportes/limite.ts:16` · `src/lib/admin/acceso.ts:32-35` · falsa garantía en `docs/despliegue.md:115`.**

El módulo lo dice él mismo, y nombra a este ticket:

> *"PROVISIONAL A SABIENDAS: el conteo vive en memoria del proceso. Se reinicia con el proceso, no se comparte entre instancias […]. **Cuando se decida la base de producción (E0-3) esto se mueve a un almacén compartido.**"*

**E0-3 es este change.** Se decidió la base de producción, se eligió el hosting serverless, y el contador no se movió — ni se declaró como deuda en `docs/despliegue.md` §10, que es donde el proyecto pone lo que sabe que le falta.

Lo grave no es el cupo de altas ni el de reportes: es **el límite de 5 intentos de acceso al panel cada 10 minutos**, que es lo único que protege `PANEL_CONTRASENA`, **la única credencial del sitio** (sin cuentas, sin MFA, sin recuperación, PRD §6.3). En Vercel, cada función viva tiene su propio `Map`; el atacante que manda intentos en paralelo consigue que la plataforma levante instancias y obtiene 5 intentos **por instancia**, con contadores que además se evaporan cuando la instancia se recicla. El techo efectivo deja de ser 5/10min y pasa a ser "los que quepan".

Y el documento le promete al operador justo lo contrario (`docs/despliegue.md:115`):

> *"Lo usan […] el de **5 intentos de acceso al panel cada 10 minutos**. […] Sin esta variable esos tres límites **no operan**, y la contraseña del panel […] queda expuesta a fuerza bruta."*

Se lee como "con la variable puesta, sí operan". En Vercel no operan como se describe. Un operador que confíe en esa frase elige una contraseña más floja de la que elegiría sabiendo la verdad.

**Arreglo mínimo aceptable si no se implementa el almacén compartido en este change:** decirlo con todas sus letras en `docs/despliegue.md` §3.1 y §10 (*"en serverless estos límites son por instancia; la contraseña del panel tiene que ser de alta entropía porque el freno de fuerza bruta es débil"*) y abrir el ticket. Tal como está, es una garantía de seguridad que el documento afirma y el despliegue no entrega.

---

### A5 · Las fotos: el sistema hace justo lo que la spec de este change le prohíbe, y el borrado ARCO deja de funcionar

**Requirement `despliegue` › "El documento fija dónde viven las fotos en producción" · `src/lib/fotos/almacen.ts` · `docs/despliegue.md` §7 y §10.**

La spec aprobada dice, literal: *"Mientras ese ticket no se implemente, el sistema **NO DEBE aceptar ni servir archivos subidos**"*, con su scenario "hoy no hay fotos que servir". T-008 mergeó: el sistema acepta y sirve fotos, contra el sistema de archivos. El dev lo declaró (§5.1) y lo documentó bien, pero lo pesó como "las fotos desaparecen en cada deploy". **Pesa más que eso**, y por eso lo subo a alto:

1. **El borrado ARCO deja de borrar.** `borrarNegocioDefinitivamente` (`src/lib/negocio.ts:74-76`) llama a `almacen.borrar(fotoClave)` sobre el disco **de la instancia que atiende esa petición**. En Vercel, el archivo lo escribió otra instancia. `rm(..., {force:true})` no encuentra nada, no falla, y la función devuelve `true`: **el panel dice "borrado" y la foto sigue sirviéndose** desde la instancia que sí la tiene, hasta que esa instancia se recicle. Un dato personal (la cara de un negocio, su fachada) sobrevive a una solicitud ARCO y a la purga de los 90 días, y el sistema informa lo contrario.
2. **El barrido de huérfanas nunca barre, y responde 200.** En cada instancia nueva `FOTOS_DIR` está vacío, así que `barrerFotosHuerfanas` entra por `claves.length === 0` → *"El almacén de fotos está vacío: nada que barrer"* → **200**. El cron diario informa éxito todos los días sin haber revisado nada. Justo el fallo silencioso que el requirement "se nota cuando no barre" existe para impedir; la salvaguarda del 500 no lo cubre porque este caso no es "detenido", es "vacío".
3. Y sí, además las fotos desaparecen en cada deploy.

**Arreglo:** las dos salidas que el documento ya plantea (adaptador de Supabase Storage, o lanzar sin fotos). Lo que no puede quedarse es el estado actual, donde el sitio anuncia fotos y el borrado de datos personales miente.

---

## 3. Hallazgos MEDIOS

### M1 · El 404 de las rutas de tareas no se parece en nada a un 404 de verdad

**`src/lib/tareas/secreto.ts:28-33`.** El requirement dice: *"recibe la **misma respuesta 404** que una ruta inexistente"*. Medido contra el sitio servido:

| | ruta de tarea sin secreto | ruta inexistente |
|---|---|---|
| cuerpo | 9 bytes, `Not Found` | 11 090 bytes, HTML |
| `content-type` | `text/plain;charset=UTF-8` | `text/html; charset=utf-8` |
| cabeceras propias | `x-robots-tag: noindex, nofollow` | `x-nextjs-cache`, `ETag`, `X-Powered-By`… |

Un escáner distingue las dos rutas de cron en una sola pasada, y ese `x-robots-tag` en un 404 es una señal de "aquí hay algo". No es catastrófico —el secreto tiene entropía y la comparación es de tiempo constante— pero el requirement no está cumplido y la ruta **no tiene ningún límite de intentos**, así que confirmar su existencia es el primer paso de cualquier ataque de fuerza bruta contra ella. Las pruebas del dev sólo comprueban `status === 404`.

### M2 · La base local no es "producción-equivalente" para el orden alfabético

Colación de la base local (`prisma dev`): **`C`**. La del `postgres:17` del CI y la de Supabase: `en_US.utf8`. Con `ORDER BY "nombre" ASC` sobre los mismos datos:

- local (`C`): `Banana | Zeta | apice | banana | zeta | Ápice | ñu` (orden de bytes)
- prod/CI (`en_US.utf8`): `apice | Ápice | banana | Banana | ñu | zeta | Zeta`

El listado del directorio ordena por `nombre` (`src/lib/directorio.ts:220`). El desarrollador ve un orden y el vecino ve otro, y una prueba que fije orden alfabético puede pasar en local y fallar en CI (o al revés). El requirement "la suite corre contra la base de producción-equivalente" se cumple en dialecto pero no en colación, y eso no está escrito en ningún lado. Mínimo: anotarlo en `docs/despliegue.md` §2 junto a los otros dos límites de PGlite.

*(Los NULL en `ORDER BY … DESC` sí están bien: verificado que PostgreSQL los pone primero, el dev lo documentó en `src/lib/directorio.ts:160-167`, y ninguna ficha `publicado` llega sin `publicadoEn` porque las tres transiciones lo escriben.)*

### M3 · Un fallo al borrar una foto deja la purga de los 90 días parada para siempre

**`src/lib/purga/rechazados.ts:86-88`.** El bucle no tiene `try`. Si `almacen.borrar` lanza para una ficha (permisos, almacén remoto caído, un directorio donde debería haber un archivo), la excepción sube: la ruta contesta 500 y **las demás fichas que ya cumplieron el plazo no se purgan**. Como el fallo es estable, mañana tropieza con la misma ficha, y pasado también: la obligación del aviso de privacidad no se vuelve a cumplir nunca, sin más señal que un 500 diario en un panel de crons.

Lo que hace más claro que es un descuido: **el barrido de huérfanas ya aprendió esta lección** (`src/lib/fotos/huerfanas.ts:250-262`, hallazgo B-6: *"no puede tumbar la pasada entera y dejar el barrido inservible para siempre"*). La purga, escrita en este change, no la aplicó.

**Prueba:** `[M3] un fallo al borrar la foto de una ficha no impide purgar las demás` — **en rojo**.

### M4 · El byte nulo tumba el panel: quedaron dos bordes sin filtrar

**`src/lib/admin/transiciones.ts:250` y `:304`; `src/app/admin/registros/[id]/accion-rechazar.ts:29` y `accion-despublicar.ts:36`.**

El dev tapó tres bordes (URL de ficha, id de reporte, comentario del reporte) y pidió barrer el resto. Barrí:

- **Motivo de rechazo y motivo de despublicación:** llegan crudos a `updateMany`, y las Server Actions **no envuelven la llamada en `try`**. Un motivo pegado desde otro programa con un `\0` adentro → `22021` → excepción dentro de una Server Action → **HTTP 500 en el panel**, con la transición sin hacer y el admin sin saber por qué. Es el mismo arreglo de borde que ya existe para el comentario del reporte (`sinBytesNulos`).
- **Campos del registro público** (`nombre`, `queOfreces`, `direccion`, `horario`, `coloniaOtra`…): también llegan crudos, pero `procesarRegistro` sí tiene `try/catch` (`src/lib/registro/procesar.ts:440`), así que degradan a "error del servidor" en vez de reventar. Es **bajo**, no medio: no hay 500 ni foto huérfana, pero un alta legítima falla para siempre sin explicación.
- **Lo que NO hace falta filtrar:** verificado contra la base que los surrogates sueltos, los no-caracteres y el bidi-override entran sin problema. El byte nulo es el único.
- **Lo que ya está cubierto por otra vía:** el slug de `/[destino]` no llega a la base (`tieneFormaDeSlugDeLaRaiz` lo descarta antes), y el buscador lo pierde en `normalizarTexto`.

**Prueba:** `[M4] un motivo de rechazo con un byte nulo no tumba la transición` — **en rojo**.

### M5 · La purga sale de los pendientes legales sin ninguna forma de saber si corre

El delta `paginas-legales` retira la purga de `PENDIENTES_OPERATIVOS_LEGALES` *"porque el sistema la ejecuta sin intervención humana"*. Pero la purga sólo corre si `CRON_SECRET` está configurada: **sin ella la ruta responde 404 a todo el mundo, en silencio, para siempre**, y el sistema sigue afirmando en su lista de pendientes que ese compromiso ya está cumplido. Toda la vigilancia es una frase en `docs/despliegue.md:213` ("revisa esa pantalla al menos una vez al mes"). Se cambió un pendiente *declarado* por un incumplimiento *invisible*. Mínimo: que el arranque en producción sin `CRON_SECRET` deje constancia en el log, igual que ya se hace con `DATABASE_URL` y `SITIO_URL` — la infraestructura para eso ya existe en este change.

### M6 · El documento de despliegue enseña a filtrar la contraseña de producción

**`docs/despliegue.md:151` y `:170`.** Los dos comandos ponen la cadena completa **con la contraseña de la base de producción** al principio de la línea de comandos:

```bash
DATABASE_URL="postgresql://postgres:CLAVE@db.XXXX.supabase.co:5432/postgres" npx prisma migrate deploy
DATABASE_URL="<la directa>" BACKFILL_PERMITIR=1 npm run db:backfill:busqueda
```

Eso deja la contraseña en `~/.zsh_history` en claro y visible en `ps` para cualquier proceso de la máquina mientras corre. Es la credencial de la base con todos los datos personales del directorio, y el documento la trata como un valor cualquiera. Sugerencia: un `.env.produccion` fuera del repositorio, o `read -s`, y una línea que diga qué hacer si ya quedó en el historial.

*(Menor, del mismo §: la prueba de humo de §9 paso 3 pide "manda un alta de prueba **con tu propio WhatsApp**" en producción, y esa ficha queda publicada y visible entre los pasos 4 y 10. Vale la pena decir que se use un número que no importe.)*

### M7 · Ninguna prueba de carrera del proyecto ejercita concurrencia de verdad

`tests/db.ts:28` usa `max: 1` por cliente, y la base local multiplexa todas las conexiones sobre **un solo backend** de PostgreSQL (verificado: `pg_backend_pid()` idéntico desde dos clientes distintos; `SET search_path` en uno lo ve el otro). Resultado: los `Promise.all` de `reportes-seguridad-adversarial`, `despublicar-borrado-seguridad-adversarial` y `reportes-crear` quedan **serializados por el pool** y no pueden fallar aunque el invariante esté roto — que es exactamente lo que pasa con A3.

El comentario de `tests/db.ts:19-23` dice que las pruebas de concurrencia "no pierden nada porque lo que comprueban es que dos operaciones simultáneas dejen un solo desenlace, y eso lo decide el `where` de la escritura". **Es cierto para `updateMany` condicionado** (aprobar, rechazar, despublicar, atender reporte: PostgreSQL re-evalúa el `WHERE` tras tomar el lock de fila, así que esas cuatro siguen siendo correctas — las revisé una por una). **No es cierto para el `INSERT … WHERE (SELECT COUNT(*))** del tope de reportes, que no toma ningún lock. La generalización del comentario es lo que dejó pasar A3.

### M8 · Scenarios de la spec sin prueba fiel

| Scenario | Situación |
|---|---|
| `despliegue` › Fotos › **"hoy no hay fotos que servir"** | **Sin prueba y, además, incumplido**: el sistema sí acepta y sirve fotos (→ A5). El mapa del dev lo marca "OBSOLETO"; una spec no se vuelve obsoleta por un merge, se enmienda. |
| `modelo-datos` › **"migración sobre una base con datos"** | Reformulado a "las columnas nuevas nacen nulas". Es defendible con un árbol de una sola migración, pero **no es lo que dice la spec**; necesita enmienda explícita al consolidar, no una nota en el reporte. |
| `despliegue` › CI › **"PR con una migración que no aplica"** | El dev lo dejó sin verificar. **Lo verifiqué a mano**: `prisma migrate deploy` sale con código 1 y el paso del CI reprueba. Sigue sin prueba automática, que es lo correcto (necesita un PR), pero ya no está sin verificar. |
| `despliegue` › CSP › **"la medición funciona con la política puesta"** | Sólo se comprueba la cadena de la política, no el navegador. Lo verifiqué a mano hasta donde se puede sin analítica configurada: ningún recurso externo en el HTML servido, cabecera presente en dinámicas y estáticas. Aceptable. |

---

## 4. Bajos y observaciones (no bloquean)

1. **Byte nulo en el formulario público** → "error del servidor" permanente para un alta legítima (ver M4). Mismo arreglo de borde.
2. **`secretoDeTareaCorrecto` corta antes de `timingSafeEqual` si las longitudes difieren** (`src/lib/tareas/secreto.ts:49`): filtra la longitud del secreto por tiempo. Con `openssl rand -hex 32` la longitud es pública de todos modos; es la práctica normal y no lo subo.
3. **Faltan `Referrer-Policy`, `X-Content-Type-Options` y `Strict-Transport-Security`.** El dev lo declara fuera de alcance (§5.5) y tiene razón según la spec. Apoyo su `/rapido`: son tres líneas en `src/lib/seguridad/csp.ts` y el sitio sirve bytes subidos por usuarios en `/api/foto/…`.
4. **`?pgbouncer=true` en el valor documentado de `DATABASE_URL` (`docs/despliegue.md:111`) no hace nada** con el adaptador de driver: era una bandera del motor Rust de Prisma. `pg` la recibe como una clave de configuración desconocida y la ignora. No rompe nada, pero da una falsa sensación de "ya está configurado para el pooler".
5. **La migración cita un archivo de pruebas que no existe** (`prisma/migrations/20260906000000_inicial/migration.sql:172`: `tests/modelo-constraints.test.ts`). El real es `tests/modelo-migraciones.test.ts`. Es el comentario que le dice al siguiente que no borre las CHECK: conviene que apunte a algo.
6. **Vercel Hobby permite 2 crons diarios y `vercel.json` declara exactamente 2.** Cualquier tarea programada futura obliga a Pro o a un cron externo. Merece una línea en `docs/despliegue.md` §6.

---

## 5. Pruebas adversariales añadidas

Un archivo nuevo: **`tests/despliegue-seguridad-adversarial.test.ts`** — **56 pruebas, 52 en verde y 4 en rojo a propósito**. Todos los datos son ficticios (serie 771999 4xxx, hosts `.invalid` / `.example` reservados por RFC).

| Bloque | Qué cubre | Resultado |
|---|---|---|
| 1. Guarda de base local vs. host real del driver | 6 direcciones locales y remotas (incluido `localhost.algo.example` y credenciales con `@` adentro) + los dos casos de A1 | 6 ✅ · **2 ❌ (A1)** |
| 2. CHECK bajo `UPDATE` crudo | 11 estados hostiles (cajas, espacios, `\n`, `\t`, vacío, acento, homoglifo cirílico) + origen + los dos CHECK de `Reporte` + la transición ilegal `rechazado → publicado` | 15 ✅ |
| 3. Índices únicos y nulos en el dialecto nuevo | varias fichas sin foto y sin token conviven; foto, token y WhatsApp duplicados rebotan | 4 ✅ |
| 4. Buscador vs. `LIKE` sensible a mayúsculas | 5 formas de escribir la misma consulta encuentran la misma ficha; las columnas guardadas son `[a-z0-9 ]`; los comodines `%` y `_` no llegan a la consulta | 7 ✅ |
| 5. Bordes exactos del plazo de 90 días | 90d−1ms, 90d exactos, fecha futura, rechazado viejo con rastro de despublicación + la resistencia de M3 | 4 ✅ · **1 ❌ (M3)** |
| 6. Byte nulo: lo que quedó sin filtrar | surrogate suelto y no-carácter SÍ entran (no hay que filtrarlos) + el motivo de rechazo de M4 | 1 ✅ · **1 ❌ (M4)** |
| 7. Puerta de las tareas | 14 variantes de `Authorization` que no deben abrir + el secreto exacto + por qué la comprobación de "secreto vacío" tiene que vivir en la ruta | 16 ✅ |

**Las 4 en rojo son intencionales** y están marcadas con `[A1]`, `[M3]` y `[M4]` en el nombre, con un aviso en la cabecera del archivo. Son la reproducción exacta de tres hallazgos: cuando el dev los corrija, se ponen solas en verde y no hay que tocarlas.

## 6. Qué hace falta para pasar al validador

1. **A1**, **A3**, **M3** y **M4** son código: arreglarlos deja en verde las 4 pruebas rojas y la suite entera.
2. **A2** y **M6** son `docs/despliegue.md` (y `.env.example` para el `sslmode`).
3. **A4** es una decisión: mover los contadores a un almacén compartido, o —como mínimo— corregir la frase de `docs/despliegue.md:115` y declararlo en §10 con su ticket.
4. **A5** es la decisión que el propio documento plantea en §7: adaptador de Supabase Storage o lanzar sin fotos. Además hay que enmendar el scenario "hoy no hay fotos que servir", que hoy la implementación incumple.

---
---

# 7. Revisión de la ITERACIÓN 2

Lo que sigue audita **la corrección**, no el hallazgo. Cada alto se volvió a atacar con los payloads originales de la iteración 1 más variantes nuevas, contra el código de hoy.

## 7.1 · A1 — CERRADO y verificado

`src/lib/base-datos/conexion.ts` resuelve el host con `pg-connection-string`, el mismo parser que `pg` tiene debajo. Reproducido con **mi payload original** y con seis variantes nuevas:

| Cadena | host real de `pg` | veredicto de la guarda | ¿coinciden? |
|---|---|---|---|
| `…@localhost:5432/postgres?host=db.abcdefgh.supabase.co` | `db.abcdefgh.supabase.co` | **remota** | ✅ |
| `…?host=db.a.example&host=localhost` | `localhost` | local | ✅ |
| `…?host=localhost&host=db.a.example` | `db.a.example` | **remota** | ✅ |
| `…?HOST=db.a.example` (mayúsculas) | `localhost` (`pg` lo ignora) | local | ✅ |
| `…?hostaddr=203.0.113.9` | `localhost` | **remota + sospechosa** | ✅ (fail-closed a propósito) |
| `…?host=%2Fvar%2Frun%2Fpostgresql` | `/var/run/postgresql` | **remota** | ✅ (fail-closed) |
| `…@db.inexistente.invalid:5432/x?host=localhost` | `localhost` | local | ✅ |
| `…@localhost.evil.example:5432/x` | `localhost.evil.example` | **remota** | ✅ |

Y el remate: con el payload original, `motivoParaNoSembrar` **exige el permiso explícito**. El agujero (12 negocios ficticios sembrables en producción sin pedir nada) está cerrado.

La elección de tratar `hostaddr` como sospechoso en vez de intentar interpretarlo es la correcta: `pg` no lo implementa y libpq sí, así que la misma cadena significa cosas distintas según quién la lea; adivinar ahí es exactamente cómo nació A1.

**Fijado con** un INVARIANTE ejecutable sobre 16 cadenas (`tests/iteracion2-seguridad-adversarial.test.ts` §1): *la guarda nunca puede decir "local" cuando el host real de `pg` no lo es*. Es la forma general del bug, no el caso concreto, así que también atrapa la próxima variante de sintaxis.

## 7.2 · A2 — CERRADO, y mejor de lo que pedí

Pedí que el documento llevara `sslmode`. El dev además lo hizo **exigible en el código** (`motivoParaNoAbrirLaBase` + `obtenerPrisma` + `prisma/cliente-script.ts`), fail-closed y en todos los entornos, no sólo en producción. Verificado con los dos literales exactos del documento:

- `postgresql://postgres:CLAVE@db.abcdefgh.supabase.co:5432/postgres` → **rechazada**
- `…@aws-0-….pooler.supabase.com:6543/postgres?pgbouncer=true` → **rechazada**
- la misma con `?sslmode=require` o `verify-full` → aceptada
- `?sslmode=disable` contra host remoto → **rechazada** (no basta con que la variable exista)
- local sin `sslmode` → aceptada (los bytes no salen del equipo)

Y comprobé lo que más me preocupaba de un mensaje de error sobre una cadena de conexión: **no repite la contraseña ni la cadena completa**, pero sí nombra el host y el parámetro que falta, o sea es accionable.

**Bajo nuevo (B7):** `sslmode=prefer` se cuenta como cifrada. Hoy es cierto —este `pg` trata `prefer`/`require` como `verify-full`— pero el propio driver avisa por consola de que en `pg` v9 adoptarán la semántica de libpq, donde `prefer` **acepta texto claro como respaldo**. El día de esa actualización, `prefer` pasaría el filtro y no cifraría. El documento ya menciona el cambio para `require`; conviene que el código rechace `prefer` explícitamente, que es una línea.

**Bajo nuevo (B8):** un `?host=/var/run/postgresql` (socket Unix, que por definición no sale de la máquina) se trata como remoto **e inseguro**, así que el sistema no arranca y el mensaje pide `sslmode=require`, que no arregla nada. Es fail-closed, o sea seguro, pero deja a quien use socket Unix sin salida y con una instrucción que no aplica. El setup documentado del proyecto es TCP, así que no bloquea; vale una línea en el mensaje.

## 7.3 · A3 — CERRADO; el salto está bien declarado, con una grieta que tapé

El cerrojo consultivo está **en el camino real** (`src/lib/reportes/crear.ts`, dentro de `$transaction`, antes del `INSERT`) y `tests/concurrencia-real.test.ts` demuestra las **dos caras** —con cerrojo no se pasa el tope, sin cerrojo sí—, que es lo que le da valor: una prueba que sólo enseña el caso bueno no demuestra que el arreglo haga algo.

**El salto está bien declarado**, y lo verifiqué punto por punto:
- la detección es la correcta y la reproduje: en la base local dos conexiones devuelven el mismo `pg_backend_pid()`;
- hay `console.warn` con el motivo al cargar el archivo;
- usa `it.runIf`, así que vitest las reporta como **saltadas** (las 2 de la corrida) y no como inexistentes;
- el "guardián del guardián" distingue "un solo backend" de "no pude conectar" abriendo una conexión de verdad en la rama del salto. Bien pensado: sin eso, un fallo de conexión se disfrazaría de salto legítimo.

**La grieta que sí quedaba, y que tapé con una prueba mía:** nada obligaba a que esas pruebas **corrieran en el CI**. Si la detección diera `false` allí por cualquier motivo, el PR pasaría en verde con la única demostración del arreglo saltada en silencio. Añadí `en el CI la base tiene que poder ejercitar carreras de verdad`, que con `CI=1` exige backends independientes.

**La otra grieta, también tapada:** `concurrencia-real` usa su **propia copia** del SQL, así que si alguien borrara el `pg_advisory_xact_lock` de `crear.ts` seguiría en verde. Añadí tres pruebas con un cliente que apunta las consultas: que `crearReporte` toma el cerrojo **antes** del `INSERT` y **dentro de la misma transacción**, que el cerrojo es **por ficha** (dos fichas distintas ⇒ cerrojos distintos), y lo mismo para `apartarCupoCompartido`.

## 7.4 · A4 — CERRADO el grave. LUPA sobre la desviación legal

### Lo técnico, verificado

El límite del panel cuenta en la base con ventana deslizante, transacción y cerrojo por clave. Comprobado: la clave es `HMAC-SHA256(cupo:ip, PANEL_SESION_SECRETO)` truncado a 32 hex — **no contiene la IP en ninguna forma reconocible**, cambia al rotar el secreto, y dos cupos distintos no comparten contador aunque sea la misma IP. Sin secreto **no se escribe nada** en la base (cae al contador en memoria) en vez de guardar la IP en claro. El intento se aparta **antes** de comparar la contraseña, así que acertar no regala un intento.

### El dictamen legal que se me pidió, con el texto delante

**Pregunta:** ¿guardar HMAC(IP) del **login del panel** contradice el aviso publicado?

**El texto, literal** (`src/lib/legales/textos.ts:195`), y su contexto importa tanto como la frase:

> Sección **"Qué datos recogemos"** → *"Los que tú escribes **en el formulario de registro**:"*
> […]
> *"**Cuando envías el formulario**, el servidor usa tu dirección IP por menos de una hora, solo en su memoria, **para frenar registros automatizados**. No la guardamos en la base de datos ni la ligamos a tu ficha."*

**Dictamen: NO hay contradicción.** La frase está acotada por sí misma en tres ejes, y los tres apuntan al formulario público:

1. **Disparador:** "Cuando envías el formulario". El acceso al panel no es ese formulario.
2. **Finalidad:** "para frenar registros automatizados". La del panel es frenar fuerza bruta contra la credencial: otra finalidad.
3. **Destinatario:** todo el aviso habla de "tú" = quien registra su negocio ("los datos personales que nos das", "tu ficha"). El admin es el propio responsable.

Leerla como una promesa global ("nunca guardamos nada derivado de la IP de nadie") obliga a ignorar su primera cláusula y el encabezado de su sección. **La opción (a) del orquestador es la sostenible**, y la decisión del dev de NO mover los cupos públicos es, además, claramente correcta: moverlos sí volvería falsa esa frase, y declarar como "pendiente" una afirmación falsa ya publicada sería peor que el hueco de seguridad.

**Pero no sale gratis, y por eso hay un medio (R3) y no un "todo bien":**

- **Es un tratamiento nuevo que nadie declaró.** `/admin` es una página **pública**: cualquiera puede abrirla y enviar el formulario, y cada envío escribe una fila con un identificador derivado de su IP. Los titulares de esos datos no son sólo el admin: son también el vecino curioso y el atacante. Ninguno recibe aviso alguno (arts. 15-17 LFPDPPP). Hay dos defensas buenas —el responsable trata datos para su propia seguridad, que el art. 19 LFPDPPP le **exige**, con seudonimización y retención mínima— y por eso el dictamen es "aceptar", no "revertir". Pero "aceptar" en este proyecto significa **declararlo**, que es justo el mecanismo que `PENDIENTES_OPERATIVOS_LEGALES` existe para dar.
- **Hoy no está declarado como tal.** El renglón nuevo de `PENDIENTES_OPERATIVOS_LEGALES` habla del **formulario público**; el HMAC del panel aparece sólo dentro del campo `hoy`, de pasada, como justificación de otra cosa. Un revisor legal que recorra la lista no encuentra "el panel guarda un derivado de la IP de quien intenta entrar" como asunto propio.
- **Y la retención que se declararía sería falsa** mientras R1 siga abierto (§7.5): no es cierto que las filas se borren al salir de la ventana.

**R3 (medio, coherencia legal).** Remedio exacto, sin tocar el texto publicado: un cuarto renglón en `PENDIENTES_OPERATIVOS_LEGALES` que nombre el tratamiento del panel —qué se guarda (HMAC, no IP), para qué (art. 19: proteger la única credencial), cuánto dura (la ventana) y a quién alcanza (cualquiera que envíe el formulario de `/admin`)—, con ticket E6-3 para que la revisión legal decida si el aviso necesita una línea. Es la misma disciplina que el proyecto ya aplica al encargado del tratamiento.

## 7.5 · Los dos medios que abrió la corrección

### R1 (medio) · Las filas del cupo no caducan: ni retención ni cota

**`src/lib/cupos/compartido.ts:139-141` · `prisma/migrations/20260907000000_agrega_cupos_compartidos/migration.sql:12-13` · `docs/despliegue.md:195`.**

Las dos fuentes de verdad prometen cosas que no ocurren:

> migración: *"Las filas se borran en cuanto salen de la ventana, **y el barrido de la purga diaria recoge las que queden**."*
> documento §3.5: *"las filas se borran en cuanto salen de la ventana"*

La limpieza vive **sólo dentro de `apartarCupoCompartido`**, o sea sólo para la clave que se vuelve a consultar. **Verificado:** una marca de hace 30 días sigue en la tabla después de correr la tarea programada diaria. Y `grep IntentoDeCupo` sobre `src/lib/purga/` y las dos rutas de `/api/tareas/` no devuelve **ninguna** referencia: el barrido que la migración promete no existe.

Dos consecuencias, las dos reales:

1. **Retención indefinida de un dato derivado de la IP de terceros** (LFPDPPP art. 11 y RLFPDPPP art. 37: suprimir cuando la finalidad se cumple). La procedencia que prueba una vez y no vuelve deja su fila para siempre. Es justo lo que R3 tendría que declarar, y no se puede declarar algo que no es verdad.
2. **Crecimiento sin cota, desde un formulario público y anónimo.** La versión en memoria tenía `MAX_IPS_RASTREADAS = 5000`; la de la base **no tiene ningún techo**. Cada POST a `/admin` desde una procedencia nueva escribe una fila que nadie recoge. No es un ataque de portada —llenar el plan gratuito de Supabase pide millones de peticiones— pero es una escritura no acotada, disponible sin autenticarse, sobre la base que sostiene el sitio.

**Remedio:** un `deleteMany({ where: { ocurrioEn: { lte: … } } })` en la tarea programada diaria que ya existe (dos líneas), y corregir las dos frases. **Prueba:** `[R1] una marca fuera de la ventana no sobrevive a la tarea programada diaria` — **en rojo**.

### R2 (medio) · El disco efímero vuelve en silencio si faltan las variables de Supabase

**`src/lib/fotos/almacen.ts:205-207` · `src/lib/fotos/almacen-supabase.ts:67`.**

`almacenDeFotos()` usa Supabase si están las dos variables y, si no, **cae al disco local**. Con **una** puesta y la otra no, avisa (`console.error`). Con **las dos ausentes** —que es el olvido probable, porque son variables nuevas— devuelve `null` **sin decir nada** y se usa el disco local. En Vercel eso es A5 entero otra vez: las fotos no sobreviven un despliegue y el borrado ARCO responde "borrado" sin borrar.

Es el mismo caso que este change ya resuelve tres veces —`DATABASE_URL` (falla), `SITIO_URL` (avisa al arrancar), `CRON_SECRET` (avisa al arrancar)— y que su propio requirement prohíbe: *"En producción ninguna configuración requerida falta en silencio"*. El documento dice "en producción no es opcional" y nada lo comprueba.

**Atenuante real:** la quinta salvaguarda del barrido acaba gritando (almacén vacío + fichas con foto → `barrido:false` → 500 en el cron). Por eso es medio y no alto. Pero llega hasta 24 h tarde y sólo si alguien mira los fallos del cron; entretanto se aceptan fotos y se miente al borrarlas.

**Remedio:** meter las dos variables en el aviso de arranque que ya existe para `CRON_SECRET`. **Prueba:** `[R2] en producción el almacén de fotos no puede ser el disco efímero` — **en rojo**.

## 7.6 · Los ocho medios de la iteración 1: cerrados

| # | Verificación |
|---|---|
| **M1** | Las rutas de tareas delegan en `notFound()`. Medido: hoy responden **exactamente igual** que cualquier otro Route Handler que no encuentra (`/api/foto/…` con clave inexistente). El marco no permite emitir el 404 HTML desde un Route Handler, y el requirement se reescribió con ese alcance en vez de prometer de más. **Correcto y honesto.** |
| **M2** | Colación documentada en §2 con el ejemplo de orden. ✅ |
| **M3** | `try` por registro, y con una distinción que yo no pedí y que es mejor: separa "el registro se purgó y quedó una foto huérfana" de "el registro sigue ahí", y sólo lo segundo cuenta como `fallidos` → 500. Mi prueba `[M3]` está en verde. ✅ |
| **M4** | `sinBytesNulos` en los dos motivos del panel. Mi prueba `[M4]` en verde. ✅ |
| **M5** | Aviso al arrancar si falta `CRON_SECRET` en producción. ✅ (y es justo el mecanismo que R2 debería reutilizar) |
| **M6** | El documento ya no pone la contraseña en la línea de comandos; explica `umask 077`, `set -a` y qué hacer si ya quedó en el historial (borrarla **y rotarla**). ✅ |
| **M7** | Comentario de `tests/db.ts` corregido con la distinción exacta (`updateMany` condicionado sí / `INSERT … WHERE COUNT` no), y `concurrencia-real` cubre lo que faltaba. ✅ |
| **M8** | Los scenarios se enmendaron en la spec, no en un reporte. ✅ |

## 7.7 · Cabeceras de la adenda — verificadas contra el sitio servido

Medido con `npm start` (build de producción) en `/`, `/terminos` (estática), `/registro`, `/admin`, un 404 y una ruta de tarea:

```
Content-Security-Policy: … (igual que antes)
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
x-powered-by: (no aparece en ninguna respuesta)
```

**La convivencia con el panel, que era la pregunta:** la cabecera global **NO pisa** la política del panel. Verificado en respuestas reales:

- `/admin` emite `<meta name="referrer" content="strict-origin"/>`; `/`, `/registro` y `/terminos` **no** emiten ninguna meta.
- La meta vive en el `metadata` de `src/app/admin/layout.tsx`, así que cubre **todos** los documentos `/admin/*`, no sólo la pantalla de acceso.
- Por la especificación de Referrer Policy, `<meta name="referrer">` fija la política del documento y **prevalece** sobre la cabecera HTTP para ese documento. El panel queda en `strict-origin` (ni siquiera manda la ruta dentro del propio sitio) y el sitio público en `strict-origin-when-cross-origin`. Es decir: la global es más laxa, la del panel la endurece, y el orden de precedencia va en la dirección segura.
- Existe además la prueba que impide igualarlas (`tests/despliegue.test.ts:448-449`). Le añadí la mía sobre el valor exacto de las cuatro cabeceras y sobre que ninguna vaya vacía.

Sobre no poner `Strict-Transport-Security` desde la aplicación: **de acuerdo**. Declararla en un sitio sin dominio definitivo es la forma clásica de dejar un dominio inaccesible; que la ponga el hosting con su certificado y quede como paso humano es lo correcto.

## 7.8 · Pruebas añadidas en esta iteración

**`tests/iteracion2-seguridad-adversarial.test.ts` — 46 pruebas, 44 ✅ y 2 ❌ deliberadas.** Datos ficticios (serie 771999 6xxx, hosts `.invalid`/`.example`, IPs de documentación RFC 5737).

| Bloque | Qué vigila | Resultado |
|---|---|---|
| 1. A1 · el host efectivo | INVARIANTE sobre 16 cadenas (la guarda nunca más laxa que el driver) + el payload original + `hostaddr` + que la base local siga reconociéndose | 19 ✅ |
| 2. A2 · TLS exigido | los 2 literales del documento, `sslmode` disable/require/verify-full, local sin TLS, cadena ilegible, y que el mensaje no repita la contraseña | 10 ✅ |
| 3. A3 · el cerrojo en el camino real | `crearReporte` toma el cerrojo antes del INSERT y en la misma transacción; el cerrojo es por ficha; `apartarCupoCompartido` igual; **y el CI no puede saltarse las carreras** | 4 ✅ |
| 4. A4 · qué se guarda del intento | la clave no contiene la IP; rotar el secreto invalida; cupos separados; sin secreto no escribe nada + la retención de R1 | 4 ✅ · **1 ❌ (R1)** |
| 5. A5 · almacén equivocado | la quinta salvaguarda dispara con fichas con foto y **no** sin ellas; con las dos variables usa Supabase y no filtra la llave; media configuración avisa + el silencio de R2 | 4 ✅ · **1 ❌ (R2)** |
| 6. Cabeceras | valores exactos de las cuatro; la del panel más estricta que la global; ninguna vacía | 3 ✅ |

Y en `tests/despliegue-seguridad-adversarial.test.ts` (iteración 1) sólo cambió la cabecera del archivo: las 56 siguen, ahora **todas en verde**, como pruebas de regresión. Revisé las dos aserciones que el dev tocó (`toEqual` → `toMatchObject` por el `fallidos` nuevo, y el helper `almacenDeMentiras` por el puerto ampliado): no debilitan lo que vigilan.

## 7.9 · Qué queda abierto

Nada bloqueante. Por orden de coste:

1. **R1** — dos líneas en la tarea diaria (`deleteMany` de `IntentoDeCupo` fuera de ventana) y corregir las dos frases que prometen lo que no pasa. Pone en verde `[R1]`.
2. **R2** — meter `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` en el aviso de arranque que ya existe para `CRON_SECRET`. Pone en verde `[R2]`.
3. **R3** — un renglón en `PENDIENTES_OPERATIVOS_LEGALES` que declare el tratamiento del panel por sí mismo (después de R1, para que la retención que declare sea cierta).
4. **B7** (rechazar `sslmode=prefer` explícitamente) y **B8** (mensaje para socket Unix): una línea cada uno, o un `/rapido`.
5. Se mantiene la deuda que la iteración 2 declara y que comparto: los dos cupos públicos por instancia (bloqueados por E6-3), `concurrencia-real` sin verse pasar fuera del CI, y Supabase Storage sin prueba de red (prueba de humo §9, pasos 10-11).

---
---

# 8. Revisión de la ITERACIÓN 3 (última)

## 8.1 · R1 — CERRADO, reproducido contra el código real

`limpiarCuposCaducados` se llama desde la tarea diaria (`purgarRechazados`), después del borrado de rechazados y **en su propio `try`**: un fallo suyo no puede tumbar la purga que tiene un compromiso publicado detrás. Verificado con seis pruebas:

| Qué probé | Resultado |
|---|---|
| Marca de hace **más de una hora** + tarea diaria | **borrada**; la purga informa `cuposLimpiados: 1` |
| Marca de hace **un minuto** + tarea diaria | intacta: el límite sigue operando |
| **5001 filas vigentes** (todas dentro del horizonte, separadas 1 ms) | poda **exactamente 1**, y es **la más vieja** (`caducadas: 0`, `podadas: 1`) |
| Exactamente 5000 filas | poda **0**: no se pasa de celosa |
| Limpieza que revienta (`intentoDeCupo` roto) | la purga de rechazados **se completa igual** y borra su registro |
| Invariante retención > ventana | `VENTANA_INTENTOS_ACCESO_MS` (10 min) < `RETENCION_MAXIMA_DE_CUPOS_MS` (1 h) |

El invariante ejecutable es la mejor parte y no lo pedí: sin él, subir la ventana de un cupo por encima de la retención borraría marcas **todavía vigentes** y aflojaría el límite en silencio. Las tres frases que mentían (migración, `docs/despliegue.md` §3.5 y `schema.prisma`) están corregidas. La poda en SQL crudo va con parámetro ligado.

Sobre el efecto secundario que el dev documenta —bajo avalancha, el techo puede devolverle margen a una procedencia bloqueada—: es correcto aceptarlo y decirlo. Es el mismo que tenía el desalojo del mapa en memoria, y la alternativa (crecer sin cota) es peor.

## 8.2 · R2 — CERRADO

Verificado que el almacén "SIN CONFIGURAR" entra por las **tres** señales de despliegue (`VERCEL_ENV`, `NODE_ENV`, base remota) y **no** entra en una laptop con base local, así que el día a día no se rompe. `guardar` y `listar` lanzan; `leer` devuelve `null`; el barrido **no puede confundir "no pude mirar" con "no hay nada"** (su llamada lanza → cron 500). El aviso de arranque nombra las dos variables, sale **una sola vez** y está en el tronco de `src/app/layout.tsx` con los otros tres. La descripción del almacén no lleva credenciales.

Reutilizar el criterio de host efectivo de A1 para decidir "esto va en serio" es la decisión correcta: una sola definición que no puede discrepar consigo misma.

## 8.3 · R4 (medio, NUEVO) — la asimetría de `borrar` sí miente en un camino

**`src/lib/fotos/almacen.ts` (`crearAlmacenSinConfigurar`, `borrar: () => Promise.resolve()`) · `src/lib/negocio.ts:71-77` · `src/lib/admin/transiciones.ts` (`borrarNegocio`).**

El razonamiento escrito es: *"no hay ningún archivo que borrar, así que el borrado ARCO **no miente** — y esa es justo la diferencia con el disco efímero, donde sí había archivos y sí se mentía."*

Eso es cierto en **un** escenario: el almacén nunca estuvo configurado, luego nunca hubo fotos. Pero ese no es el escenario para el que existe este almacén. El que sí lo es —y es el que el propio documento hace probable— es el otro:

> Estuvo configurado, se subieron fotos (hay `fotoClave` en la base y archivos en el bucket), y **la configuración se perdió**: una llave de servicio rotada y no propagada —que `docs/despliegue.md` §1 recomienda rotar—, un deploy sin las variables, un `staging` apuntando a la base de producción. Basta con que falte **una** de las dos variables.

Entonces:

1. El admin atiende una solicitud ARCO y borra la ficha.
2. `borrarNegocioDefinitivamente` **quita la fila** y llama a `almacen.borrar(fotoClave)`, que **se completa callado**.
3. Devuelve `true` → `borrarNegocio` responde `{ resultado: "borrado" }` → el panel dice que se borró y al titular se le informa que su solicitud se cumplió.
4. **La foto —un dato personal— sigue en el almacén.** Y ahora ya no queda ninguna fila que la nombre, así que ni el barrido de huérfanas podría identificarla (aparte de que su `listar` lanza).

**Reproducido**: `borrarNegocio(prisma, ficha_con_fotoClave, crearAlmacenSinConfigurar())` → `{ resultado: "borrado" }`. Y en la purga diaria de los 90 días, el mismo caso sale como `eliminados: 1, fallidos: 0` → la ruta responde **200**: éxito informado, foto en el almacén.

Es la mentira de A5 por una puerta más estrecha, y en el único sitio donde la ley obliga a que el borrado sea real. `guardar` y `listar` ya lanzan por exactamente este motivo; `borrar` es el único que no.

**Atenuante honesto:** el cron del barrido responde 500 cada día por su `listar`, así que la mala configuración es detectable en ≤24 h por quien mire esa pantalla. Pero ese 500 dice "no pude mirar el almacén", no "una ficha borrada dejó su foto dentro", y el informe al titular ya salió.

**Arreglo, una línea:** que `borrar` también rechace. La maquinaria para absorberlo **ya existe desde la iteración 2**: `purgarRechazados` separa "la fila se purgó y quedó una foto huérfana" (`fallidos`) de "la fila sigue ahí", y la ruta responde 500 si `fallidos` no es cero. Para el ARCO del panel hace falta decidir qué ve el admin —lo honesto es "la ficha se borró, la foto no se pudo borrar: revisa la configuración del almacén"— porque la fila se quita antes que el archivo. **Ese es el punto que dejo al humano:** cambiar `borrar` es trivial; elegir qué se le dice al admin en esa pantalla es una decisión de producto sobre una operación legal.

**Prueba:** `[R4] estuvo configurado y se perdió: borrar una ficha CON foto no puede decir 'borrado'` — **en rojo**. La acompaña una que documenta el comportamiento de hoy en la purga (`eliminados: 1, fallidos: 0`), para que al corregir se vea el cambio en los dos caminos.

## 8.4 · R3, B7 y B8 — cerrados

**R3.** El cuarto renglón de `PENDIENTES_OPERATIVOS_LEGALES` dice las cuatro cosas y las dice bien: **qué** (una fila por intento: HMAC-SHA256 de la IP, la hora, nada más, irreversible sin el secreto), **para qué** (frenar la fuerza bruta contra la única credencial, art. 19 LFPDPPP), **cuánto** (la ventana; y "nada sobrevive más de una hora" — que es cierto **desde** R1) y **a quién alcanza** (cualquiera que envíe el formulario de `/admin`, que es público, no sólo el admin). Ticket E6-3. Ningún texto publicado se tocó. Ponerlo después de R1 fue lo correcto: declarar un plazo falso habría sido peor que no declarar nada.

**B7.** Verificado: `prefer`, `allow` y `disable` **rechazados**; `require` y `verify-full` aceptados. Y los mensajes **distinguen los dos casos**, que es lo que pedí: *"el driver `pg` no negocia TLS salvo que la dirección lo pida"* (no lo pediste) frente a *"el `sslmode` que trae no garantiza cifrado"* (lo que pediste no basta). No se arreglan igual, así que no pueden decir lo mismo.

**B8.** Verificado que las dos mitades quedaron como debían: un socket Unix **no exige TLS** (el sistema arranca, en vez de pedir algo que no arregla nada) pero **sigue sin contar como local** para las escrituras masivas (`apuntaABaseLocal` → `false`, o sea `SEED_DEMO_PERMITIR=1` explícito). El argumento es sólido —de una ruta de socket no se sabe si detrás hay un túnel SSH a producción— y **mantiene intacto el invariante de la etapa C**: la guarda nunca es más laxa que el driver.

## 8.5 · Pruebas añadidas en esta iteración

**`tests/iteracion3-seguridad-adversarial.test.ts` — 17 pruebas, 16 ✅ y 1 ❌ deliberada.** Datos ficticios (serie 771999 7xxx).

| Bloque | Qué vigila | Resultado |
|---|---|---|
| 1. R1 · caducidad y techo | invariante retención>ventana, marca vieja borrada por la tarea diaria, marca fresca intacta, 5001 filas → poda 1 (la más vieja), 5000 → poda 0, limpieza rota no tumba la purga | 6 ✅ |
| 2. R2 · almacén sin configurar | las 3 señales de despliegue, la laptop intacta, `guardar`/`listar` lanzan y `leer` no, el barrido no confunde, aviso único con las dos variables, descripción sin credenciales | 8 ✅ |
| 3. La asimetría de `borrar` | sin foto no miente; **con foto sí** (R4); y cómo se ve hoy en la purga | 2 ✅ · **1 ❌ (R4)** |

Total de la etapa C: **119 pruebas adversariales** en tres archivos; 118 en verde y 1 en rojo a propósito.

## 8.6 · Qué le llevo al humano

**La pregunta, en una frase:** cuando el almacén de fotos no está configurado y una ficha **sí** tiene foto, ¿el borrado ARCO debe seguir respondiendo "borrado"?

- **Si la respuesta es no** (mi recomendación): `borrar` rechaza como `guardar` y `listar`; la purga ya sabe contarlo (`fallidos` → 500); y hay que redactar qué ve el admin en el panel.
- **Si la respuesta es sí**, entonces `docs/despliegue.md` §7 y el comentario de `crearAlmacenSinConfigurar` deben decir explícitamente que en ese estado el borrado ARCO **no alcanza a los archivos**, para que no quede escrito lo contrario de lo que pasa.

Lo demás queda como deuda ya declarada y compartida: los dos cupos públicos por instancia (E6-3), `concurrencia-real` sin verse pasar fuera del CI, Supabase Storage sin prueba de red (humo §9, pasos 10-11), `Strict-Transport-Security` como paso humano, las 4 altas de `npm audit` en la cadena del CLI de Prisma (devDependency, no viaja al despliegue) y la línea 23 de `CLAUDE.md`.

---
---

# 9. Revisión de la ITERACIÓN 4 (final) — R4 cerrado

El fundador eligió la opción (a): **el borrado se niega a mentir**. Verificación exprés y proporcional, contra el código real.

## 9.1 · El orden es el fondo, y está bien puesto

`borrarNegocioDefinitivamente` ahora lee la clave, **borra los archivos y sólo entonces la fila**. Es la parte que importa: con la fila borrada primero, negarse era imposible, porque ya no había a qué volver. El tipo de retorno pasó de `boolean` a `"borrado" | "no-encontrado" | "almacen-inalcanzable"`, porque con dos valores no cabía la tercera respuesta.

## 9.2 · Los cuatro escenarios, reproducidos

| Escenario | Esperado | Resultado |
|---|---|---|
| **El original de R4**: ficha CON `fotoClave` + almacén inalcanzable | se niega y no toca la fila | ✅ `{ resultado: "almacen-inalcanzable" }`, **fila intacta y con su `fotoClave`** (aserción del contrato completo, no de "algo distinto a borrado") |
| **Camino feliz**: almacén operativo | borra archivos **y** fila | ✅ el almacén recibe la clave exacta y la fila desaparece |
| **Ficha SIN foto + almacén caído** | se borra igual | ✅ `{ resultado: "borrado" }` y fila fuera: no hay nada que alcanzar, y negarse ahí incumpliría los 90 días por una configuración que a esa ficha no le afecta |
| **Ningún camino borra la fila dejando el archivo** | invariante | ✅ barrido de las **cuatro** combinaciones (con/sin foto × almacén sano/caído): si la fila desapareció, o no había archivo, o el almacén confirmó haberlo borrado |

Y el efecto de arrastre está bien resuelto: `crearAlmacenSinConfigurar().borrar` **pasó a lanzar**, que era el fondo del hallazgo — desde el almacén no se puede saber si alguna vez estuvo configurado; quien sí tiene el dato que decide (`fotoClave` o no) es `borrarNegocioDefinitivamente`.

## 9.3 · Lo que se acepta a cambio: es el intercambio correcto

Invertir el orden abre el riesgo contrario: archivos borrados y luego un `deleteMany` que falla → ficha **sin foto pero viva**. Comparados los dos daños:

- **Antes:** dato personal vivo en el almacén, sin fila que lo nombre (invisible para el barrido de huérfanas), con acuse de recibo al titular de que se había borrado. Ni reparable ni visible.
- **Ahora:** una ficha pierde su foto; el dueño puede volver a subirla y mientras tanto se ve el marcador. Reparable y visible.

Se cambió un fallo silencioso e irreversible sobre datos personales por uno ruidoso y reparable. Es el intercambio correcto, y está escrito en el comentario de la función y en el requirement nuevo.

## 9.4 · El resto de la decisión

- **Lo que ve el admin** (`src/lib/admin/textos.ts:141`): *"La ficha no se borró: no pude alcanzar el almacén de fotos. Revisa la configuración y vuelve a intentar."* Dice qué NO pasó, por qué y qué hacer; no dice "error" ni nombra variables de entorno. Es el único desenlace en el que la ficha sigue existiendo, así que el reintento tiene sentido.
- **La purga diaria** cuenta ese caso en `fallidos` → la ruta responde **500** → sale en el panel de fallos del cron y mañana se reintenta. El log dice *"su foto sigue en un almacén inalcanzable"* **sin la clave ni ningún dato del negocio**. Es la maquinaria que la iteración 2 ya había construido: no se inventó nada nuevo.
- **Las dos pruebas de la etapa C que el dev tocó** las revisé: `[M3]` pasó de `eliminados: 2` a `eliminados: 1, fallidos: 1` —el número cambió porque el comportamiento correcto cambió— y **conserva y refuerza su intención**: la ficha sana se sigue purgando (misma aserción) y ahora también se exige que la otra siga ahí, que es justo lo que la decisión protege. El compañero de `[R4]` se invirtió para fijar lo que su propia nota pedía. Ninguna de las dos se debilitó.
- **Alcance de la enmienda de spec:** el requirement nuevo va en `despliegue` y no en `revision-admin`. Correcto: lo que se decide es cómo se comporta el sistema cuando el ALMACENAMIENTO del despliegue no responde, que es materia de este change; el contrato del borrado ARCO no cambia, sólo gana un desenlace que la pantalla ya sabe pintar.

## 9.5 · Una nota cosmética, sin severidad

`src/lib/purga/rechazados.ts:144` conserva un comentario de la iteración anterior —*"El borrado quita la FILA antes que los archivos"*— que desde esta iteración dice lo contrario de lo que hace el código. **La lógica que envuelve es correcta** (pregunta qué quedó en pie y clasifica bien: si `deleteMany` truena, la fila sigue ahí y cuenta como `fallidos`), así que no cambia ningún comportamiento; sólo el porqué escrito quedó invertido. Una línea, para quien pase por ahí.

## 9.6 · Pruebas de esta iteración

`tests/iteracion3-seguridad-adversarial.test.ts` creció de 17 a **20 pruebas, todas en verde**: `[R4]` reforzada al contrato completo (desenlace **y** fila intacta con su clave) más las tres del encargo exprés —camino feliz, ficha sin foto con el almacén caído, y el invariante de las cuatro combinaciones—.

**Total de la etapa C: 122 pruebas adversariales en tres archivos, 122 en verde.** De ellas, 7 nacieron en rojo fijando hallazgos (A1 ×2, M3, M4, R1, R2, R4) y las 7 se pusieron en verde al corregirse el código, sin que hubiera que reescribir lo que vigilaban.
