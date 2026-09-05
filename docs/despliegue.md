# Despliegue de EnMiRumbo

Este documento basta para poner el sitio en producción. Si algo te obliga a
abrir el código para saber qué configurar, es un defecto **de este documento**:
anótalo y arréglalo aquí.

- **Hosting:** Vercel Hobby (ADR-007).
- **Base de datos:** PostgreSQL gestionado en Supabase (ADR-004).
- **Fotos:** Supabase Storage (ADR-006). En desarrollo, el disco local. Ver
  [§7](#7-fotos-de-los-negocios).
- **Analítica:** Umami Cloud, sin cookies (ADR-005).

Índice: [1. Antes de tocar nada](#1-antes-de-tocar-nada-pasos-humanos) ·
[2. Base local](#2-base-de-datos-local-para-desarrollar) ·
[3. Variables](#3-variables-de-entorno-la-lista-completa) ·
[4. Orden de operaciones](#4-orden-de-operaciones-del-despliegue) ·
[5. Lo que NUNCA se corre contra producción](#5-lo-que-nunca-se-corre-contra-producción) ·
[6. Tareas programadas](#6-tareas-programadas-cron) ·
[7. Fotos](#7-fotos-de-los-negocios) · [8. Analítica y CSP](#8-analítica-y-content-security-policy) ·
[9. Prueba de humo](#9-prueba-de-humo) · [10. Deuda conocida](#10-deuda-conocida-del-despliegue)

---

## 1. Antes de tocar nada (pasos humanos)

Nada de esto lo puede hacer el código. Hazlo en este orden.

1. **Cuenta de Vercel** (plan Hobby). Conecta el repositorio de GitHub. El
   framework se detecta solo (Next.js); no cambies los comandos de build.
   - Recuerda que **el plan Hobby prohíbe el uso comercial** (ADR-007). El MVP
     no monetiza; el día que monetice, hay que pasar a Pro o mudarse.
2. **Cuenta de Supabase** (plan gratuito). Crea el proyecto en la región más
   cercana a México (`us-east-1` o `us-west-1` según disponibilidad).
   - Guarda la contraseña de la base **fuera del repositorio**. Si se pierde,
     se rota desde el panel de Supabase.
   - En *Storage*, crea un bucket **privado** llamado `fotos` (§7).
   - En *Database → Backups*, **confirma que los respaldos automáticos diarios
     están activos**. Este paso no es opcional: el aviso de privacidad promete
     resguardo de datos personales (PRD §8) y ADR-004 eligió Supabase
     precisamente por esto.
3. **Dominio.** Regístralo con quien prefieras. En Vercel, *Settings → Domains*
   y agrega tanto el dominio raíz (`enmirumbo.com`) como `www`.
4. **DNS.** Apunta lo que te diga Vercel en esa misma pantalla: un registro `A`
   del dominio raíz a la IP que indique, y un `CNAME` de `www` a
   `cname.vercel-dns.com`. La propagación puede tardar hasta una hora; Vercel
   emite el certificado HTTPS solo cuando el DNS ya resuelve.
5. **Cuenta de Umami Cloud** (opcional pero recomendada, PRD §10). Da de alta el
   sitio con el dominio ya definitivo.
   - **No hay ninguna casilla de "filtrar bots" que activar**, aunque este
     documento lo dijera antes. La medición es un `<script>`: los rastreadores
     que no ejecutan JavaScript —que son la mayoría, incluidos los buscadores—
     no aparecen porque nunca llegan a mandar el evento. Umami además descarta
     por *user agent* los que sí ejecutan y se identifican.
   - Lo que sí existe en el panel son los **IP filters** (*Settings → Websites →
     el sitio → Filters*), para excluir a mano tráfico raro: tu propia
     conexión mientras pruebas, o una IP que dispare visitas sin sentido.
     Revisa las métricas la primera semana y filtra si hace falta.
6. **Encargado del tratamiento.** ADR-004 exige nombrar a Supabase en el aviso
   de privacidad antes del lanzamiento. Eso **no** se hace aquí: está declarado
   como pendiente operativo en el código (`PENDIENTES_OPERATIVOS_LEGALES`,
   `src/lib/legales/textos.ts`) y lo redacta la revisión legal (E6-3).

## 2. Base de datos local (para desarrollar)

El proyecto usa **el mismo motor en todos lados**: PostgreSQL en la laptop, en
las pruebas, en el CI y en Supabase (ADR-004, y enmienda a ADR-001). Un solo
`provider`, un solo árbol de migraciones, un solo dialecto.

Levantar la base local es **un comando**, en una terminal aparte:

```bash
npm run db:local        # PostgreSQL 17 local, sin Docker ni instalar nada
```

Es `prisma dev`, el servidor PostgreSQL que trae el propio Prisma. Sus puertos
son fijos, así que la dirección también:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:51214/template1?sslmode=disable"
```

Para pararlo: `npm run db:local:detener`.

> **Si venías de antes del rebrand (T-019):** la base local cambió de nombre
> (`necesitouno` → `enmirumbo`), así que `npm run db:local` va a levantar una
> **base nueva y vacía**. No se pierde nada que importe —solo catálogos y
> negocios ficticios—: repóblala con `npm run db:seed` y `npm run db:seed:demo`.
> La vieja se para con `npx prisma dev stop necesitouno`.

**Cuatro cosas que conviene saber de esa base local:**

1. **Es de usar y tirar.** `npm test` borra y vuelve a crear su esquema en cada
   corrida. Lo que hay dentro son catálogos y negocios ficticios; se repone con
   `npm run db:seed` y `npm run db:seed:demo`.
2. **Comparte una sola sesión entre conexiones.** Es una peculiaridad de PGlite
   (el motor que usa `prisma dev`): un `SET search_path` de un proceso lo ven
   todos. No afecta a producción ni al CI, pero explica por qué la suite no
   intenta aislarse en otro esquema.
3. **Ordena distinto.** La base local usa la colación `C` (orden de bytes) y
   Supabase y el CI usan `en_US.utf8`. Con `ORDER BY "nombre"`, en local sale
   `Banana, Zeta, apice, banana, ñu` y en producción `apice, Ápice, banana,
   Banana, ñu`. El listado del directorio ordena por nombre, así que lo que ves
   en local no es exactamente lo que ve el vecino, y una prueba que fije orden
   alfabético puede pasar aquí y fallar en el CI. Si vas a tocar ordenamiento,
   hazlo contra un Postgres de verdad (abajo).
4. **Corta a las 10 conexiones simultáneas, y todas comparten una sesión.** Dos
   consultas de verdad simultáneas se pisan, y con las pruebas de carrera eso se
   nota en dos formas distintas — conviene saber cuál es cuál antes de asustarse
   con un rojo:

   - `tests/concurrencia-real.test.ts` **sí se salta solo**: comprueba al
     arrancar si dos conexiones caen en procesos distintos y, si no, se declara
     no aplicable (`it.runIf`) y lo avisa por consola. En el CI corre entero.
   - **Las carreras de `tests/reportes-seguridad-adversarial.test.ts` (`[A1]` y
     `[A2]`) NO se saltan: se ejecutan aquí y suelen salir en rojo**, con
     errores del motor local que no dicen nada del código. **En el CI, contra
     `postgres:17`, pasan.** Son los dos rojos locales conocidos; si te salen
     otros, esos sí son tuyos.

   Si vas a trabajar en concurrencia, usa un PostgreSQL de verdad:

   ```bash
   docker run --rm -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:17
   # y en .env:
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres"
   ```

   Es el mismo motor y la misma versión que usa el CI. Nada del proyecto
   depende de `prisma dev`: solo la comodidad de no instalar Docker.

## 3. Variables de entorno: la lista completa

En Vercel se configuran en *Settings → Environment Variables*, para el entorno
**Production** (y, si usas previews, también para Preview con valores
distintos). Las `NEXT_PUBLIC_*` se sustituyen **al construir**: cambiarlas exige
volver a desplegar, no basta con reiniciar.

> Una prueba automática (`tests/despliegue.test.ts`) recorre `src/` y `prisma/`
> buscando lecturas de variables de entorno y **falla si aparece una que este
> documento no menciona**. Si agregas una variable al código, documéntala aquí.

### 3.1 Obligatorias en producción

| Variable | Para qué sirve | Valor |
|---|---|---|
| `DATABASE_URL` | La base de datos. En producción, la conexión **agrupada** (pooler) de Supabase: el runtime serverless abre y cierra conexiones todo el rato. | Supabase → *Connect* → *Transaction pooler*, **y le agregas `?sslmode=verify-full&sslrootcert=certs/supabase-root-2021-ca.crt`**: queda `postgresql://USUARIO:CLAVE@aws-0-REGION.pooler.supabase.com:6543/postgres?sslmode=verify-full&sslrootcert=certs/supabase-root-2021-ca.crt`. **Con Supabase, `sslmode=require` a secas NO funciona; el porqué y la ruta del certificado, en §3.4.** **Sin ella, en producción el sistema NO cae a ninguna base local: lo dice en el log y las pantallas que leen datos fallan. Y sin `sslmode` el sistema tampoco arranca: ver §3.4.** |
| `SITIO_URL` | La URL pública, sin diagonal final. De aquí salen el `sitemap.xml`, la línea `Sitemap:` de `robots.txt`, las canónicas, la vista previa de WhatsApp/Facebook y el link de la ficha que el admin manda al aprobar. | `https://enmirumbo.com` (tu dominio real). Sin ella **en producción el sitio no inventa `localhost`**: el sitemap va vacío, no hay canónicas y el panel avisa a la vista. |
| `PANEL_CONTRASENA` | La única credencial del panel `/admin`. Sin cuentas, sin correo, sin recuperación (PRD §6.6). | Una contraseña larga y que no uses en ningún otro lado. Si se pierde, se cambia la variable y se redespliega. |
| `PANEL_SESION_SECRETO` | Con lo que el servidor firma la cookie de sesión del panel (HMAC-SHA256). | Mínimo 32 caracteres al azar: `openssl rand -base64 32`. Rotarlo cierra todas las sesiones abiertas. |
| `REGISTRO_ENCABEZADO_IP` | El encabezado donde el proxy del hosting publica la IP real del visitante. Lo usan **el límite de 3 altas por hora**, el de 3 reportes por hora y el de **5 intentos de acceso al panel cada 10 minutos**. | **En Vercel, exactamente: `x-forwarded-for`.** Sin esta variable esos tres límites **no operan** (léelo literal: no es que sean más flojos, es que no cuentan nada). Con ella puesta, el del panel es el único que se comparte entre instancias; los otros dos son por instancia — **lee §3.5 antes de elegir la contraseña del panel**. (Otros hostings: `cf-connecting-ip` en Cloudflare, `x-real-ip` en nginx.) |
| `CRON_SECRET` | Autoriza el disparo de las tareas programadas (§6). Sin él, esas rutas responden 404 a todo el mundo y **la purga de los 90 días nunca corre**, que es un incumplimiento del aviso de privacidad. | Al azar, largo: `openssl rand -hex 32`. El nombre es literal porque es el que el programador de tareas de Vercel manda solo. |

### 3.2 Opcionales

| Variable | Para qué sirve | Valor |
|---|---|---|
| `NEXT_PUBLIC_UMAMI_SRC` | URL del script de medición. **No es un secreto**: viaja en el HTML. | `https://cloud.umami.is/script.js`. Tiene que ser `https:` absoluta o se ignora. |
| `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | Identificador del sitio en Umami. Tampoco es secreto. | Lo da el panel de Umami al dar de alta el sitio. |
| `REGISTRO_UMBRAL_ALTAS_DIARIAS` | Altas en un mismo día a partir de las cuales queda una advertencia en el log (la "alerta al admin" del PRD §8). | Entero. Por defecto `30`. |
| `SUPABASE_URL` | El proyecto de Supabase donde viven las fotos. **En producción no es opcional: ver §7.** | `https://XXXX.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secreto.** Llave con la que el servidor lee y escribe las fotos. | Supabase → *Settings → API → service_role*. |
| `SUPABASE_BUCKET_FOTOS` | Nombre del bucket de fotos. | Por defecto `fotos`. |
| `FOTOS_DIR` | Directorio de las fotos **en desarrollo**, cuando no hay Supabase configurado. | Por defecto `.fotos/` en la raíz. **En Vercel el disco es efímero: ver §7.** |
| `RESEND_API_KEY` | **Secreto.** Credencial del proveedor de correo (Resend) con la que sale el **aviso diario de pendientes** (T-020, §6). | La da Resend en *API Keys*; empieza por `re_`. **Sin ella no se manda ningún correo**: queda una línea en el log diciendo qué falta y todo lo demás sigue igual. |
| `AVISOS_CORREO_REMITENTE` | La dirección DESDE la que sale ese aviso. Tiene que estar en un dominio **verificado** en Resend, o el proveedor rechaza el envío. | `avisos@enmirumbo.com` (después de verificar el dominio, §6.1). **Sin ella no se manda ningún correo.** |
| `AVISOS_CORREO_DESTINO` | El buzón que RECIBE el aviso: el correo que el admin abre a diario. | Recomendación: el **Gmail directo** del admin, no una dirección que reenvíe (el reenvío puede tropezar con SPF y mandar a spam justo el correo del día que sí importa). **Sin ella no se manda ningún correo.** Es un dato personal en un repo público (LFPDPPP): nunca en el código, ni en los seeds, ni en un test, ni en `.env.example`. |
| `WHATSAPP_ADMIN` | El WhatsApp del admin al que la ficha pública ofrece escribir cuando el dueño **perdió su enlace de gestión** (PRD §6.4 y §7 Flujo D). | 10 dígitos, sin lada ni espacios. **Fail-safe: sin ella el bloque "¿Es tu negocio?" no se pinta** — nada de enlaces rotos ni de números de ejemplo. Es un dato personal en un repo público (LFPDPPP): nunca en el código, ni en los seeds, ni en un test. |

Con las dos de Umami sin poner, el sitio corre igual y **no mide nada**: no
inyecta ningún `<script>`, no pide nada a ningún dominio externo y ninguna
página cambia.

Las tres del correo funcionan igual, y con `SITIO_URL` son **cuatro**: falte la
que falte, **no se manda ningún correo**, el log lo dice una sola vez nombrando
la que falta y la tarea programada responde con normalidad —no configurar el
aviso es una decisión legítima, no un fallo—. `SITIO_URL` entra en la cuenta
porque de ahí sale el único enlace del correo: sin ella el aviso llevaría a
`localhost`, que desde el celular del admin no lleva a ningún lado. Por lo
mismo, el aviso **exige que `SITIO_URL` apunte a un host público**: con
`http://localhost:3001`, `http://127.0.0.1:3000`, `http://[::1]:3000` o una IP
de red interna (`192.168.…`, `10.…`) se apaga igual que si faltara, en vez de
mandar todos los días un enlace que no abre.

### 3.3 Solo para operar a mano (nunca configuradas de forma permanente)

| Variable | Para qué sirve |
|---|---|
| `SEED_DEMO_PERMITIR` | Deja sembrar negocios **de mentira** en una base que no está en tu máquina. Nunca sirve contra producción: ahí el seed de demostración está cerrado incluso con permiso. |
| `BACKFILL_PERMITIR` | Deja correr el relleno del texto de búsqueda contra una base remota o de producción. **Este sí hace falta en producción**, una sola vez (§4, paso 5). |
| `SHADOW_DATABASE_URL` | Base "sombra" que `prisma migrate dev` usa para detectar drift. Solo en desarrollo, y solo si no usas `npm run db:local` (que trae la suya en el puerto 51215). `prisma migrate deploy` —lo que corre en producción y en el CI— **no la usa**. |

> **Nota sobre `?pgbouncer=true`:** era una bandera del motor Rust de Prisma.
> Con el adaptador de driver (`pg`) no hace nada — se recibe como una clave de
> configuración desconocida y se ignora—. Ponerla no rompe nada, pero no
> "configura el pooler": lo que configura el pooler es el puerto `6543` y la
> cadena que da Supabase.

### 3.4 TLS: sin `sslmode` la base no se abre

**Esto no es una recomendación, es un requisito que el código hace cumplir.**

El driver que usa el sitio (`pg`, a través de `@prisma/adapter-pg`) **no cifra
la conexión salvo que la dirección se lo pida**. No hay default amable: sin
`sslmode`, cada consulta entre el hosting y Supabase cruza Internet en claro —
nombres de negocio, WhatsApp, direcciones, motivos de rechazo, comentarios de
reportes: el conjunto completo de datos personales del directorio (PRD §8,
LFPDPPP)— y la contraseña de la base viaja igual cada vez que alguien corre una
migración.

Por eso, **si la dirección apunta fuera de esta máquina y no pide TLS, el
sistema no abre la base**: lo dice en el log al arrancar y falla a la vista, en
lugar de funcionar bien y filtrar en silencio. Contra una base local no aplica
(los bytes no salen del equipo).

**Con Supabase, `sslmode=require` a secas NO sirve.** No es una peculiaridad
nuestra: Supabase firma su PostgreSQL con una autoridad certificadora **propia**
(`Supabase Root 2021 CA`) que Node no trae en su almacén de confianza, y bajo
`require` el driver `pg` valida la cadena y corta con *"self-signed certificate
in certificate chain"*. Se descubrió con el sitio ya desplegado, y el puente
temporal fue `sslmode=no-verify` —que cifra pero **no valida a quién le habla**,
o sea acepta a cualquiera que se ponga en medio—.

**Ese puente ya se retiró. La cadena de producción es esta:**

```
postgresql://USUARIO:CLAVE@aws-0-REGION.pooler.supabase.com:6543/postgres?sslmode=verify-full&sslrootcert=certs/supabase-root-2021-ca.crt
```

- **`sslmode=verify-full`** es lo más estricto que hay: valida la cadena **y**
  que el nombre del servidor coincida con el certificado.
- **`sslrootcert=certs/supabase-root-2021-ca.crt`** es la raíz pública de
  Supabase, versionada en este repositorio. Es un certificado **público de una
  CA**: no es un secreto y por eso está commiteado. `next.config.ts` lo incluye
  a mano en el rastreo de archivos del build (`outputFileTracingIncludes`)
  porque `pg` lo abre en tiempo de ejecución y ese uso Next no lo ve solo;
  `tests/tls-certificado-supabase.test.ts` vigila las dos cosas.
- **La ruta es relativa a propósito**, y se resuelve contra el directorio de
  trabajo del proceso —en Vercel, la raíz del paquete de la función—. Una ruta
  absoluta de tu laptop no significa nada allá.
- **Si el archivo falta, el sitio no arranca**, y el mensaje del log habla de
  cifrado, no del archivo: `pg` no puede interpretar la dirección y la guarda la
  trata como no cifrada. Si ves un `SIN CIFRAR` con esta cadena bien puesta, lo
  que falta es el certificado en el paquete.
- **`sslmode=no-verify` ya no se usa**, ni siquiera de paso. Cifra sin validar:
  deja pasar a cualquiera que consiga ponerse en medio de la conexión, que es
  justo de lo que protege el TLS.
- **Cuando la raíz caduque** (2031) o Supabase la rote: se descarga la nueva de
  Supabase → *Settings → Database → SSL configuration*, se reemplaza el archivo
  y se redespliega. La prueba automática avisa antes, al acercarse la fecha.
- **`prefer`, `allow` y `disable` NO cuentan como cifrado y el sistema los
  rechaza.** Hoy `pg` trata `prefer` como `verify-full`, pero el propio driver
  avisa de que en `pg` v9 adoptará la semántica de libpq, donde `prefer`
  intenta cifrar y, **si el servidor dice que no, sigue en texto claro**.
  Aceptarlos ahora sería dejar que una subida de versión reabra el agujero sola,
  y en silencio. Si quieres fijar hoy el comportamiento fuerte, escribe
  `sslmode=verify-full`.
- **Si tu base es un socket Unix** (PostgreSQL en la misma máquina, sin TCP):
  pon la ruta en `?host=`, por ejemplo
  `postgresql://usuario@localhost/enmirumbo?host=/var/run/postgresql`. **No se
  le pide cifrado**: los bytes no llegan a ninguna tarjeta de red, así que no
  hay nada que interceptar. Ojo con la otra mitad de la decisión: un socket
  **no** cuenta como "base local" para los comandos que escriben en masa
  (`db:seed:demo`, `db:backfill:busqueda`), porque de una ruta de socket no se
  puede saber a qué servidor lleva —puede ser un túnel, un contenedor con
  producción montada o un `pgbouncer` delante de Supabase—. Para esos comandos
  hace falta el permiso explícito (`SEED_DEMO_PERMITIR=1` / `BACKFILL_PERMITIR=1`),
  que es una decisión consciente en vez de un default silencioso.
- Si la validación siguiera fallando contra tu proyecto de Supabase, **no lo
  apagues con `sslmode=disable`** (eso vuelve al texto claro) **ni con
  `no-verify`**: lo que hay que revisar es que el certificado del repositorio
  sea el que ese proyecto usa hoy (Supabase → *Settings → Database → SSL
  configuration*) y que la ruta se resuelva desde el directorio de trabajo del
  proceso.

### 3.5 Hasta dónde llegan los límites anti-abuso

Tres límites protegen el sitio sin captcha (PRD §8). No todos son igual de
fuertes, y conviene saber cuál es cuál **antes** de elegir la contraseña del
panel:

| Límite | Dónde se cuenta | Qué significa en Vercel |
|---|---|---|
| **5 intentos de acceso al panel / 10 min** | **en la base** (tabla `IntentoDeCupo`) | Se comparte entre todas las instancias: el límite es real. Lo que se guarda NO es la IP, es un HMAC de la IP con `PANEL_SESION_SECRETO`. **Retención:** al volver a contar esa clave se borran sus marcas fuera de ventana, y la tarea diaria de purga (§6) recoge las que nadie vuelve a consultar y poda la tabla si pasa de 5 000 filas. Nada sobrevive más de una hora. |
| 3 altas por hora y por IP | en la memoria de cada instancia | **Es por instancia.** Alguien que mande envíos en paralelo consigue que la plataforma levante varias y obtiene 3 por cada una. Acota el abuso casual, no una campaña. |
| 3 reportes por hora y por IP | en la memoria de cada instancia | Igual que el anterior. Su defensa fuerte es la otra: el tope de 10 reportes sin atender por ficha, que sí vive en la base y es atómico. |

**Por qué los dos últimos siguen en memoria.** No es un olvido: el aviso de
privacidad **ya publicado** dice, literal, que la IP de quien envía el
formulario se usa *"por menos de una hora, solo en su memoria… No la guardamos
en la base de datos"*. Moverlos a la base —aunque fuera como HMAC— haría falsa
esa frase, y el texto legal aprobado no se toca sin la revisión legal (E6-3).
Está declarado como pendiente en §10 y en `PENDIENTES_OPERATIVOS_LEGALES`.

**Qué hacer mientras tanto:** que `PANEL_CONTRASENA` sea **larga y al azar**
(30+ caracteres de un gestor). El freno de fuerza bruta del panel es real desde
esta versión, pero la contraseña sigue siendo la única credencial del sitio.

### 3.6 Las que pone la plataforma

`NODE_ENV` y `VERCEL_ENV` las escribe el hosting. No las configures a mano: son
lo que hace que las guardas anti-producción reconozcan dónde están.

## 4. Orden de operaciones del despliegue

1. **Configura las variables** de §3.1 en Vercel (entorno Production).
2. **Aplica las migraciones** contra Supabase, desde tu máquina, usando la
   conexión **directa** (no la agrupada: el DDL con pooler da sorpresas).

   **La contraseña NO va en la línea de comandos.** Escrita ahí queda en
   `~/.zsh_history` en claro y es visible en `ps` para cualquier proceso de la
   máquina mientras corre — y es la credencial de la base con todos los datos
   personales del directorio. Ponla en un archivo fuera del repositorio:

   ```bash
   # ~/enmirumbo-produccion.env  (chmod 600, FUERA del repo)
   DATABASE_URL="postgresql://postgres:CLAVE@db.XXXX.supabase.co:5432/postgres?sslmode=verify-full&sslrootcert=certs/supabase-root-2021-ca.crt"
   ```

   ```bash
   umask 077 && touch ~/enmirumbo-produccion.env   # la primera vez
   set -a && . ~/enmirumbo-produccion.env && set +a
   npx prisma migrate deploy      # DESDE LA RAÍZ DEL REPOSITORIO
   ```

   Supabase → *Connect* → *Direct connection* te da esa cadena (puerto `5432`);
   agrégale el TLS de §3.4 — **`sslmode=require` a secas falla contra Supabase**.
   La ruta del certificado es relativa al directorio desde el que corres el
   comando: por eso `migrate deploy` se lanza desde la raíz del repositorio (o
   pones una ruta absoluta en su lugar). La cadena de la aplicación (`:6543`,
   pooler) se queda en Vercel.

   **Si ya la escribiste en la línea de comandos:** bórrala del historial
   (`history -d`, o edita `~/.zsh_history` y `~/.bash_history`) **y rota la
   contraseña** en Supabase → *Settings → Database → Reset database password*.
   Rotarla es lo único que de verdad la invalida.
3. **Siembra los catálogos** (idempotente: se puede repetir sin miedo), en la
   misma terminal donde cargaste el archivo del paso 2:

   ```bash
   npm run db:seed
   # → "Catálogos listos: 8 categorías, 21 colonias, 49 giros."
   ```

4. **Despliega.** Merge a `main`, o *Redeploy* desde Vercel si las variables
   cambiaron después del último build.
5. **Relleno del texto de búsqueda** — **solo si la base ya tenía fichas**
   creadas antes del buscador. En una base recién migrada no hace falta:

   ```bash
   BACKFILL_PERMITIR=1 npm run db:backfill:busqueda
   ```

6. **Verifica** con la prueba de humo de §9.

## 5. Lo que NUNCA se corre contra producción

- **`npm run db:seed:demo`.** Siembra 12 negocios **de mentira** con WhatsApp
  ficticios. El comando se niega solo cuando detecta producción
  (`NODE_ENV=production` o `VERCEL_ENV=production`) **incluso con
  `SEED_DEMO_PERMITIR=1`**, y también cuando la dirección de la base no está en
  tu máquina. Aun así: no lo intentes.
- **`npx prisma migrate reset`** o cualquier `db push`: borran datos.
- **Editar filas a mano** para hacer trabajo del panel. Aprobar, rechazar,
  despublicar y borrar tienen su pantalla (T-015). Lo que todavía NO tiene
  pantalla es el acceso y la rectificación —entregarle al negocio una copia de
  sus datos, corregirlos o quitar un campo—: es el renglón **E3-7** del backlog
  y hasta entonces se atiende a mano, con cuidado y dejando constancia.

## 6. Tareas programadas (cron)

Dos tareas corren solas en producción. Están declaradas en `vercel.json`:

| Ruta | Cuándo | Qué hace |
|---|---|---|
| `/api/tareas/purgar-rechazados` | diario, **13:17 UTC (~07:17 en Tizayuca)** | Dos cosas: borra definitivamente los registros **rechazados** con 90 días o más desde el rechazo (PRD §8, compromiso publicado en el aviso de privacidad) y, encima, manda el **aviso diario de pendientes** (T-020). |
| `/api/tareas/barrer-fotos-huerfanas` | diario, 09:47 UTC | Borra del almacén las fotos que ya no son de ninguna ficha (datos personales fuera del alcance del borrado ARCO si se quedan). |

**Por qué a las 13:17 UTC y no a las 09:17, como antes:** porque encima de esa
tarea viaja el aviso por correo, y 13:17 UTC son las **07:17 en Tizayuca**. Un
aviso que llega a las tres de la mañana se lee cuando ya se perdió media
jornada; a las siete acompaña el primer café. A la purga la hora le da igual:
solo tiene que correr una vez al día.

Las dos exigen el encabezado `Authorization: Bearer $CRON_SECRET`. **Sin secreto
configurado, o con uno equivocado, responden el mismo 404 que una ruta que no
existe y no hacen nada**: una ruta que borra en bloque no se anuncia.

**Ojo con el plan:** Vercel Hobby permite **2 tareas programadas diarias**, y
`vercel.json` declara exactamente 2. Cualquier tarea futura obliga a pasar a Pro
o a dispararla desde fuera con el `curl` de abajo.

`vercel.json` es configuración del hosting, no código. Si mañana el sitio se
muda, las rutas viajan con él y solo cambia quién las llama. Desde cualquier
otro programador de tareas (o desde `cron` en cualquier máquina):

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
  https://enmirumbo.com/api/tareas/purgar-rechazados
```

**Vigila el resultado, no solo que se haya llamado.** El `-f` de arriba es
deliberado: las dos rutas responden **500 cuando la tarea no se completó** —por
ejemplo, cuando una salvaguarda detiene el barrido de fotos porque sospecha que
apunta a la base equivocada—. Si nadie mira ese código, el barrido puede llevar
meses sin barrer y nadie se entera. En Vercel, los fallos de cron salen en
*Observability → Crons*; revisa esa pantalla al menos una vez al mes.

Respuesta normal de cada una (solo conteos, nunca datos de nadie):

```json
{"eliminados": 0, "fallidos": 0, "cuposLimpiados": 0, "aviso": "sin-pendientes"}
{"barrido": true, "revisadas": 12, "huerfanas": 0, "borradas": 0, "enPeriodoDeGracia": 0, "ignoradas": 0, "noBorrables": 0}
```

`cuposLimpiados` es lo otro que hace la purga: las marcas del cupo anti-abuso
del panel (§3.5) que ya salieron de su ventana, más las que se podan cuando la
tabla pasa de 5 000 filas. Va aparte a propósito: si esa limpieza falla, queda
en el log pero **no** tumba la purga de los 90 días, que es la que tiene un
compromiso publicado detrás.

Si `fallidos` no es cero —algún registro que ya cumplió el plazo no se pudo
eliminar—, la purga responde **500** aunque haya eliminado los demás. Es a
propósito: un 200 con la mala noticia dentro del cuerpo lo daría por bueno el
programador de tareas, y el incumplimiento del aviso de privacidad se repetiría
todos los días en silencio.

### 6.1 El aviso diario de pendientes (T-020)

Encima de la purga viaja un correo: **si hay algo esperando en la cola del
panel, a las 07:17 de Tizayuca llega un aviso** con cuántos hay de cada tipo
—altas nuevas, ediciones y reportes sin atender— y el enlace al panel. Si no hay
nada esperando **no llega nada**: el silencio significa "todo al día".

**El correo no lleva ni un dato de nadie.** Ni nombres de negocios, ni WhatsApp,
ni colonias, ni comentarios de reportes, ni identificadores: solo números y el
enlace. Viaja por servidores de un tercero y se queda guardado en un buzón, así
que lo que no va dentro no hay que cuidarlo (PRD §8, LFPDPPP).

**Va encima de la purga y no en una tarea propia** porque el plan Hobby admite
dos tareas diarias y ya están las dos. Los dos trabajos son independientes: la
purga corre aunque el correo falle, y el correo se intenta aunque la purga no se
complete.

El campo `aviso` de la respuesta dice en qué quedó el correo del día:

| Valor | Qué significa | Código |
|---|---|---|
| `mandado` | Había pendientes y el correo salió (o ya había salido antes en la misma ejecución). | 200 |
| `sin-pendientes` | La cola estaba vacía: no había nada que avisar. | 200 |
| `sin-configurar` | Falta alguna de las cuatro variables (§3.2). No se mandó nada. **No es un fallo.** | 200 |
| `fallido` | Había algo que avisar y el correo NO salió. | **500** |

**Un correo al día, aunque dispares la tarea dos veces.** El envío viaja con una
marca del día (`enmirumbo-pendientes-<AAAA-MM-DD>`, con la fecha de Tizayuca) y
Resend descarta el segundo envío con la misma marca durante 24 horas. Un intento
que ni siquiera llegó al proveedor (red caída, tiempo agotado) no gasta el día:
el siguiente disparo lo vuelve a intentar con la misma marca.

**Si ves `"aviso":"fallido"` en un segundo disparo del día**, mira el log: la
línea `[aviso] el proveedor respondió 409` significa que la marca de hoy ya la
usó otra petición y que **esta** no mandó nada. Puede ser lo bueno (el correo ya
había salido desde otra ejecución) o lo malo (el intento anterior fue rechazado
y hoy no ha salido ningún aviso). Desde el servidor no se distingue, así que se
avisa en rojo a propósito: **compruébalo en Resend → *Emails***, que lista lo
que salió de verdad. Un 200 diciendo "mandado" en ese caso te dejaría sin aviso
y sin enterarte durante 24 horas.

**Paso humano, una sola vez, antes de que esto sirva de algo: verificar el
dominio en Resend.**

1. En Resend → *Domains* → *Add Domain*, `enmirumbo.com`.
2. Resend da tres registros DNS (uno TXT de verificación, uno TXT de DKIM y uno
   MX o TXT de SPF). Se dan de alta en **Namecheap** → *Advanced DNS*, tal cual,
   sin cambiarles el host ni el valor.
3. Esperar a que Resend marque el dominio como *Verified* (suele ser minutos).
4. Solo entonces `AVISOS_CORREO_REMITENTE` puede ser `avisos@enmirumbo.com`.

**Si el correo no llega:** mira en este orden. (a) La respuesta del `curl`: si
dice `sin-configurar`, falta una variable; si dice `sin-pendientes`, es que de
verdad no había nada. (b) Los logs de Vercel, línea `[aviso]`. (c) El panel de
Resend → *Emails*, que muestra los envíos y por qué se rechazaron. (d) La
carpeta de spam del buzón destino: si el aviso aterriza ahí, casi siempre es un
reenvío de por medio (usa el buzón directo, §3.2).

## 7. Fotos de los negocios

**Las fotos viven en Supabase Storage** (ADR-006 + ADR-004), no en el disco del
hosting. El adaptador está implementado y se elige por variables de entorno; sin
ellas, el sitio usa el disco local, que es lo correcto en desarrollo.

| Variable | Para qué sirve | Valor |
|---|---|---|
| `SUPABASE_URL` | El proyecto de Supabase. | `https://XXXX.supabase.co` (Supabase → *Settings → API → Project URL*). |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secreto.** Llave de servicio con la que el servidor lee y escribe en el bucket. | Supabase → *Settings → API → service_role*. **Nunca** en una variable `NEXT_PUBLIC_*`, nunca en el navegador. |
| `SUPABASE_BUCKET_FOTOS` | Nombre del bucket. | Opcional; por defecto `fotos`. |

**Pasos humanos, antes del primer despliegue con fotos:**

1. Supabase → *Storage* → *New bucket*, nombre `fotos`, **privado** (la casilla
   de "Public bucket" SIN marcar).
2. No hace falta ninguna política de acceso: la llave de servicio las salta a
   propósito. **Quien decide si una foto se puede ver es nuestro servidor**, que
   comprueba en cada petición que el negocio esté publicado. Por eso el bucket
   tiene que ser privado: uno público dejaría pedir la foto de un registro en
   revisión saltándose esa comprobación.
3. Configura las dos variables en Vercel y redespliega.

**Qué pasa según lo que configures**, y no hay ningún camino silencioso:

| Configuración | En tu máquina | En un despliegue de verdad |
|---|---|---|
| Las dos variables | Supabase Storage | Supabase Storage |
| Ninguna | disco local (`FOTOS_DIR`), que es lo correcto en desarrollo | **el sitio no acepta fotos**: lo dice en el log al arrancar y cada intento de guardar falla a la vista. NO cae al disco efímero. |
| Solo una | disco local **con un error en el log** | igual: error en el log, y el sitio no acepta fotos |

"Un despliegue de verdad" es: el hosting dice que es producción, **o** la base
de datos no está en esta máquina (que es lo que distingue un *staging* real de
un `npm run dev`).

Cuando el almacenamiento no está configurado y el sistema está desplegado, el
alta **sin foto sigue funcionando** con normalidad. El alta **con** foto se
rechaza entera: el vecino ve *"No pudimos preparar tu foto. Intenta con otra."*
y **no queda ninguna ficha creada** — ni siquiera una sin imagen. Es a
propósito: media ficha guardada a espaldas de quien la mandó sería peor que
pedirle que lo intente de nuevo. Se falla **en voz alta**, no a medias.

**Y el borrado definitivo (ARCO) se niega a mentir.** Si una ficha tiene foto y
el almacenamiento no se deja alcanzar —una llave rotada y no propagada, un
despliegue sin las variables—, **la ficha no se borra**: el panel dice *"La
ficha no se borró: no pude alcanzar el almacén de fotos. Revisa la
configuración y vuelve a intentar."* y la ficha sigue completa para reintentar.
Los archivos se borran ANTES que la fila, precisamente para poder negarse. En la
purga diaria ese registro cuenta como no purgado y la tarea responde 500, así
que sale en el panel de fallos del cron.

Antes no era así, y por eso está escrito aquí: la fila se borraba primero, el
panel contestaba "borrado" y la foto —un dato personal— se quedaba en el
almacenamiento **sin ninguna fila que la nombrara**, o sea fuera del alcance
incluso del barrido de huérfanas. Si ves ese mensaje, lo que hay que arreglar es
la configuración de §7, no la ficha.

**Por qué esto no era opcional.** Con el adaptador de disco en un hosting
serverless, cada instancia tiene su propio sistema de archivos y pasan tres
cosas, las tres malas:

1. **El borrado ARCO miente.** Borrar un negocio borra los archivos del disco de
   la instancia que atiende esa petición, no de la que los escribió: no falla,
   el panel dice "borrado" y la foto se sigue sirviendo. Un dato personal
   sobreviviendo a una solicitud ARCO y a la purga de los 90 días, con el aviso
   de privacidad publicado.
2. **El barrido de huérfanas nunca barría.** Cada instancia nueva veía el
   directorio vacío e informaba "nada que barrer", con un 200, todos los días.
   (Ahora, además, un almacén vacío con fichas que dicen tener foto se trata
   como "estoy mirando al almacén equivocado" y responde 500.)
3. Y sí, además las fotos desaparecen en cada despliegue.

**En desarrollo** no hace falta nada de esto: sin las variables de Supabase, las
fotos van a `FOTOS_DIR` (por defecto `.fotos/`, ignorado por git).

## 8. Analítica y Content-Security-Policy

La medición es cookieless y sin banner (ADR-005, PRD §9). Lo que hay que saber
para el despliegue:

- **Son dos dominios, no uno.** El script se descarga de `cloud.umami.is` y los
  eventos se mandan por POST a `gateway.umami.is`. Con uno solo en la CSP, la
  medición se rompe **en silencio**: el script carga y ningún evento llega.
- El sitio manda esta `Content-Security-Policy` en todas las respuestas
  (`src/lib/seguridad/csp.ts`, aplicada desde `next.config.ts`):

  ```
  default-src 'self'; script-src 'self' 'unsafe-inline' https://cloud.umami.is;
  style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:;
  connect-src 'self' https://gateway.umami.is; object-src 'none'; base-uri 'self';
  form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests
  ```

### Las otras cabeceras de seguridad

Con la CSP viajan otras tres, en la misma configuración
(`src/lib/seguridad/csp.ts`, aplicada desde `next.config.ts`), y una que se
quita:

| Cabecera | Valor | Para qué |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | El sitio sirve **bytes subidos por usuarios** en `/api/foto/…`. Sin esto, un navegador que "adivina" el tipo podría tratar un archivo como algo distinto de lo que declaramos. |
| `X-Frame-Options` | `DENY` | Clickjacking. **Es redundante con `frame-ancestors 'none'` a propósito:** `frame-ancestors` es la moderna y la que manda donde se entiende; `X-Frame-Options` es la que respetan los navegadores viejos que la ignoran. Van las dos porque cuestan una línea. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Hacia fuera solo sale el origen, nunca la ruta. |
| `X-Powered-By` | **se quita** (`poweredByHeader: false`) | No es una defensa, es no regalar la versión del marco al primer escáner que pase. |

**El panel va más estricto, y tiene que seguir así.** `/admin` emite
`<meta name="referrer" content="strict-origin">` en su layout, y esa meta
**manda sobre la cabecera** para ese documento. Con la política global, salir
del panel hacia una página pública mandaría `/admin/registros/<id>` —que apunta
al registro de una persona— como referente del mismo origen, y el tracker de la
analítica reenvía los referentes del mismo origen (PRD §8, LFPDPPP). Si algún
día se cambia una de las dos, hay que mirar la otra.

**Lo que NO manda la aplicación:** `Strict-Transport-Security`. La pone el
hosting junto con su certificado; declararla desde la aplicación en un sitio
que todavía no tiene dominio es la forma clásica de dejar un dominio
inaccesible durante meses. Anotada en §10.

- **Verifícala contra el sitio ya desplegado**, no contra el código:

  ```bash
  curl -sI https://enmirumbo.com | grep -iE "content-security-policy|x-content-type|x-frame|referrer-policy|x-powered-by"
  ```

  Tienen que salir las cuatro primeras y **no** salir `x-powered-by`.

  Y con la analítica configurada, abre cualquier página pública con la consola
  del navegador: no debe haber ni un mensaje de CSP bloqueando nada, y el panel
  de Umami debe registrar la visita en menos de un minuto.
- El panel `/admin` **no** se mide: el script lo inyecta el tronco de las
  páginas públicas y ahí no llega.
- **El modo edición (`/editar/<token>`) tampoco se mide**, y no por gusto: el
  tracker manda el `pathname` de cada vista al recolector del proveedor, y ahí
  el pathname **es el secreto** —el enlace de gestión con el que un negocio
  edita su ficha— (T-014, hallazgo ALTO 1 de su etapa C). La exclusión es
  estructural, igual que la del panel: esa ruta vive en el grupo `(gestion)`,
  cuyo layout no inyecta el script. `data-exclude-search="true"` **no** habría
  bastado: quita la cadena de consulta, no la ruta.
- **Modelo de confianza, con los ojos abiertos:** quien controle esas variables
  —o el dominio configurado— ejecuta JavaScript en todas las páginas públicas,
  incluida `/registro`, que es donde el vecino teclea su nombre y su WhatsApp.
  La CSP acota los orígenes; no sustituye a decidir en quién confías.

### 8.1 Los logs de ejecución y el enlace de gestión — RIESGO ASUMIDO

**Qué pasa.** El enlace de gestión de un negocio (PRD §6.4) lleva su token en
la RUTA: `/editar/<43 caracteres>`. Nuestro código no lo escribe en ningún log
—está comprobado con tests que espían `console.*`—, pero **el log de acceso de
la plataforma registra la ruta de cada petición**, así que el token aparece
ahí. Lo mismo pasa, fuera de nuestro alcance, en el historial del navegador del
dueño y en cualquier CDN o WAF intermedio.

**Por qué no se arregla en el código.** Que el secreto viaje en la ruta es la
premisa del flujo aprobado ("pega el enlace que te llegó por WhatsApp", que es
un GET por definición). Las tres alternativas se revisaron y ninguna cierra el
hallazgo sin cambiar la spec: un POST no aplica, no hay expiración por diseño
(el ticket la declara fuera de alcance) y el logger de la plataforma no lo
controlamos. **Decisión del fundador: riesgo asumido**, del mismo tipo que "el
enlace viaja por WhatsApp, que no es un canal secreto" (PRD §6.4).

**Las dos condiciones de esa decisión, que SÍ son operativas y no opcionales:**

1. **NO se configuran Log Drains en Vercel.** Un drain manda los logs —y con
   ellos los tokens— a un tercero con retención larga y otro control de acceso:
   convertiría un dato de vida corta, visible solo para el propio admin, en un
   depósito permanente de credenciales de gestión en manos ajenas. Sin drain,
   los logs de ejecución se ven en vivo y se conservan un plazo corto.
   **Si algún día hace falta observabilidad, hay que resolver antes cómo se
   enmascara `/editar/*` — no al revés.**
2. **El acceso al proyecto de Vercel se limita al admin, con 2FA activo.** Hoy
   quien lee esos logs es la misma persona que puede regenerar cualquier enlace
   desde el panel y que tiene acceso directo a la base: **el poder que la fuga
   otorga no excede el que ese lector ya tenía**. Esa equivalencia es lo que
   sostiene la decisión, y deja de ser cierta en cuanto se invite a alguien más
   al proyecto. **Sumar un miembro al equipo de Vercel obliga a volver a pesar
   esto.**

**Qué hacer si un enlace se expone:** regenerarlo desde el detalle del negocio
en el panel ("Generar un enlace nuevo"); el anterior deja de servir de
inmediato.

## 9. Prueba de humo

Con el sitio ya en línea, abre estas pantallas en el celular, con datos móviles
(no wifi), y comprueba lo que dice cada renglón:

1. **`/`** — se ven las 8 categorías. Debe cargar en menos de 2 segundos (PRD §8).
2. **`/servicios-del-hogar`** — el listado responde; si no hay negocios
   publicados todavía, sale el mensaje de "todavía no hay" con el botón de
   registro (no una página en blanco ni un error).
3. **`/registro`** — el formulario se ve completo y **manda un alta de prueba**
   con tu propio WhatsApp. Debe llevar a la pantalla de gracias.
4. **`/admin`** — pide contraseña. Con la correcta, el alta de prueba aparece en
   la cola. **Apruébala** y comprueba que el mensaje de WhatsApp que ofrece el
   panel trae el link **absoluto** de la ficha (si dice `localhost`, falta
   `SITIO_URL`).
5. **La ficha aprobada** — se abre, el botón de WhatsApp lleva a la conversación
   correcta y el botón de "Reportar" funciona.
6. **`/robots.txt`** — trae la línea `Sitemap:` con tu dominio.
7. **`/sitemap.xml`** — lista URLs absolutas de tu dominio, no de `localhost`.
8. **`/aviso-de-privacidad` y `/terminos`** — se abren. Mientras la revisión
   legal no termine, muestran arriba la marca de borrador; es lo esperado.
8-bis. **El buzón del directorio** (T-019, **obligatorio antes del
   lanzamiento**) — las dos páginas legales publican `contacto@enmirumbo.com`
   como canal de contacto y de derechos ARCO, y eso es un compromiso con el
   titular, no un adorno. **Mándale un correo desde una cuenta cualquiera y
   confirma que llega** al buzón que atiende el admin. Un canal publicado que
   nadie recibe es peor que un placeholder honesto: si todavía no llega, el
   reenvío del registrador no está activado y el sitio no debe lanzarse.
9. **La CSP** — el `curl` de §8.
10. **Las fotos de verdad** (si configuraste Supabase Storage): en el alta de
    prueba del paso 3 sube una foto. Después de aprobar, la ficha tiene que
    mostrarla; y en Supabase → *Storage → fotos* tienen que estar los dos
    archivos `<clave>.tarjeta.webp` y `<clave>.ficha.webp`. Al borrar el alta
    de prueba (paso siguiente), **vuelve a mirar el bucket: los dos archivos
    tienen que haber desaparecido.** Es la única forma de comprobar que el
    borrado ARCO borra de verdad, y sustituye a lo que ninguna prueba
    automática puede ver.
11. **Las tareas programadas** — con el secreto en la mano:

    ```bash
    curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://enmirumbo.com/api/tareas/purgar-rechazados
    curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://enmirumbo.com/api/tareas/barrer-fotos-huerfanas
    ```

    Las dos tienen que responder `200` con sus conteos. Y sin el encabezado,
    la misma página 404 que `https://enmirumbo.com/una-direccion-inventada`.
11-bis. **El aviso diario de pendientes** (T-020) — con el dominio ya
    verificado en Resend (§6.1) y las tres variables puestas: deja el alta de
    prueba del paso 3 **sin revisar** en la cola y vuelve a disparar la purga
    con el `curl` de arriba. La respuesta tiene que traer `"aviso":"mandado"`
    y en el buzón de `AVISOS_CORREO_DESTINO` tiene que llegar un correo de
    "EnMiRumbo" que diga cuántos pendientes hay y traiga el enlace al panel.
    **Léelo entero antes de seguir: no puede aparecer el nombre del negocio de
    prueba, ni su WhatsApp, ni su colonia — solo números.** Dispáralo una
    segunda vez: no debe llegar un segundo correo ese día.
12. **Borra el alta de prueba** desde el panel (borrado definitivo) y comprueba
    que la ficha ya no abre (y que su foto desapareció del bucket, paso 10).

Y en el log de Vercel (*Observability → Logs*), después de todo lo anterior:
**ninguna línea** que diga `falta SITIO_URL`, `falta DATABASE_URL`,
`falta CRON_SECRET`, `SIN CIFRAR`, `configuración de Supabase Storage
incompleta` ni `[panel] sin IP atribuible`.

## 10. Deuda conocida del despliegue

Lo que este documento **no** resuelve y hay que decidir antes o poco después
del lanzamiento:

1. **Los cupos del formulario público y de los reportes siguen en la memoria de
   cada instancia** (§3.5). Se pueden mover a la base con el mismo mecanismo
   que ya usa el panel, pero eso contradice una frase del aviso de privacidad
   publicado ("solo en su memoria… no la guardamos en la base de datos"), así
   que necesita que la revisión legal (E6-3) apruebe la redacción nueva.
   Declarado también en `PENDIENTES_OPERATIVOS_LEGALES`.
2. **El encargado del tratamiento** sin nombrar en el aviso (ADR-004). Está
   declarado como pendiente operativo en el código; lo cierra E6-3.
3. **Acceso y rectificación desde el panel (lo que queda del flujo ARCO):**
   renglón **E3-7** del backlog. Cancelación y oposición —despublicar y borrar—
   ya son acciones del panel desde T-015 (E3-6); entregarle al negocio una copia
   de sus datos y editarlos o quitar un campo de su ficha sigue haciéndose a
   mano contra la base.
4. **La CSP lleva `'unsafe-inline'` en `script-src`** (§8). Quitarlo exige un
   `nonce` por petición, y eso obliga a renderizar por petición **todas** las
   páginas, incluidas las legales, que hoy salen de la CDN. Se prefirió una CSP
   que acota orígenes sin costar rendimiento.
5. **Restaurar un respaldo nunca se ha ensayado.** Que los backups estén
   activos no es lo mismo que saber restaurarlos.
6. **Cold start de Supabase en plan gratuito** (ADR-004): si el proyecto se
   pausa por inactividad, el primer visitante paga el arranque. Se mitiga con
   tráfico real o un ping de uptime barato.
7. **`Strict-Transport-Security` no la manda la aplicación** (§8). La pone el
   hosting con su certificado; ponerla desde aquí antes de tener dominio es
   como se dejan dominios inaccesibles por meses. **Paso humano al configurar
   el dominio en Vercel:** activar HSTS ahí y comprobarlo con el `curl` de §8.
8. **Vigilancia de dependencias.** `npm audit` marca hoy **4
   vulnerabilidades altas, todas en la cadena del CLI de Prisma**:

   | Paquete | Aviso | Cómo entra |
   |---|---|---|
   | `deepmerge-ts` <8 | agotamiento de pila al fusionar objetos recursivos | `prisma` → `@prisma/config` |
   | `mysql2` ≤3.23 | degradación del plugin de autenticación a contraseña en claro; y bomba de descompresión en el protocolo comprimido | `prisma` (la CLI trae los drivers de todos los motores) |

   **No son explotables en el runtime del sitio.** `prisma` es una
   `devDependency`: es la herramienta de línea de comandos que corre al migrar
   y al generar el cliente, y no viaja en lo que se despliega. Lo que sí se
   despliega es `@prisma/client` con `@prisma/adapter-pg`, que no dependen de
   ninguno de los dos. Además el proyecto no habla MySQL por ningún lado.

   **Qué hacer:** revisar las notas de cada versión de Prisma 7 y actualizar
   cuando lo arreglen; volver a mirar `npm audit` en cada corrida del pipeline.
   **Lo que NO se hace es `npm audit fix --force`**, que es lo que sugiere la
   herramienta: instalaría `prisma@6`, y con Prisma 6 se pierde el adaptador de
   driver sobre el que está montado todo este change (PostgreSQL por `pg`,
   sin motor binario). Cambiar la arquitectura para silenciar un aviso de una
   herramienta de desarrollo sería el peor negocio posible.
9. **Las llamadas reales a Supabase Storage no están cubiertas por pruebas
   automáticas**, solo el adaptador contra un `fetch` simulado. La red de
   verdad se comprueba en los pasos 10 y 11 de la prueba de humo (§9).
9. **El token del enlace de gestión queda en el log de acceso de la
   plataforma** (§8.1). Riesgo asumido con dos condiciones operativas —sin Log
   Drains y con el proyecto de Vercel limitado al admin con 2FA— que hay que
   volver a pesar si se invita a alguien más o si se necesita observabilidad.
   Cerrarlo de verdad exige sacar el secreto de la ruta, lo que cambia la spec
   del enlace de gestión (T-014).
