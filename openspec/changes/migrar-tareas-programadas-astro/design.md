# Diseño: migrar-tareas-programadas-astro (T-027, mitad 6a)

Base: los design.md de 2a (`migrar-lectura-publica-astro`: middleware, cabeceras, avisos de arranque, emulador), 2b (`migrar-directorio-publico-astro`: endpoint de fotos, `ALL`, 404 vacío con `no-store` propio), 3a (`migrar-formularios-publicos-astro`: regla de origen, tabla de Actions), 3b-1 (`migrar-registro-astro` §4: criterio de líneas autorizadas en `src/lib/`; §7: Twilio falso) y 3b-2. Lo que ya resolvieron no se reabre aquí.

Código leído: `src/app/api/tareas/{purgar-rechazados,barrer-fotos-huerfanas}/route.ts`, `src/lib/tareas/secreto.ts`, `src/lib/purga/rechazados.ts`, `src/lib/avisos/aviso.ts`, `src/lib/correo/{configuracion,resend}.ts`, `src/lib/fotos/almacen.ts`, `src/middleware.ts`, `src/astro/{acciones,origen,cabeceras}.ts`, `src/pages/api/foto/[clave]/[variante].ts`, `vercel.json`, `tests/{tareas-programadas,despliegue,salida-astro,limpieza}.ts`, `tests/fixtures/twilio-falso.mjs`, `scripts/diff-html.mjs`.

## 1. Cómo se sirven los endpoints en Astro

### 1.1 Archivos y ruta

| Next (inerte hasta 6b) | Astro |
|---|---|
| `src/app/api/tareas/purgar-rechazados/route.ts` | `src/pages/api/tareas/purgar-rechazados.ts` |
| `src/app/api/tareas/barrer-fotos-huerfanas/route.ts` | `src/pages/api/tareas/barrer-fotos-huerfanas.ts` |

- `export const prerender = false`. Las dos escriben en la base o en el almacén en cada petición. El equivalente de `dynamic = "force-dynamic"` es no prerenderizar, y Astro no cachea una respuesta de función por su cuenta.
- La URL pública es la misma (`/api/tareas/<nombre>`, sin extensión), así que el cron de `vercel.json` sigue llamando la misma ruta.
- **El cuerpo se copia, no se reinterpreta.** Se conservan:
  - el mismo orden (puerta → purga → aviso, o puerta → barrido);
  - los mismos `try/catch`;
  - las mismas líneas de log (`[purga] …`, `[fotos] …`), con los mismos textos;
  - el mismo `JSON.stringify` sobre objetos con las claves en el mismo orden;
  - los mismos estados.

  La única diferencia es el envoltorio: `APIRoute` en lugar de `GET(peticion)`, y `return respuestaDeTareaNoExistente()` en lugar de un `notFound()` que lanza (§3).
- **Cabeceras propias de la respuesta JSON**, las de hoy: `Content-Type: application/json; charset=utf-8` y `X-Robots-Tag: noindex, nofollow`. El middleware agrega las cuatro de seguridad (no pisa ninguna que ya venga). Como el tipo no es HTML, no agrega `Cache-Control` (`src/astro/cabeceras.ts`, `ajustar`).
- **`Cache-Control` del JSON.** Hay que medirlo en Next, no suponerlo (tarea 1). El encargo pide `no-store`. Si Next lo manda, el endpoint de Astro fija exactamente el valor medido. Si Next no manda ninguno, Astro tampoco: la CDN de Vercel no guarda respuestas de función sin `s-maxage`/`public`, y agregar uno sería una diferencia. En ese caso el dev lo reporta en b-dev y el humano decide. El diff (§6) compara esta cabecera.

### 1.2 Lo que Vercel Cron manda

Vercel Cron dispara una petición **`GET`** a la ruta declarada, en el despliegue de **producción**, con `Authorization: Bearer <CRON_SECRET>` cuando la variable se llama así, y con `User-Agent: vercel-cron/1.0`. No manda `Origin` ni cuerpo. Esa es la petición que se emula en todas las pruebas de "secreto correcto". El `User-Agent` no se usa para decidir nada (ADR-007: cualquier programador de tareas sirve).

### 1.3 Métodos

| Método | Next hoy (Route Handler con solo `GET`) | Astro (este change) |
|---|---|---|
| `GET` | la tarea | la tarea |
| `HEAD` | Next implementa `HEAD` llamando a `GET` (con el secreto correcto, **ejecuta la tarea**) y quita el cuerpo | igual: `export const HEAD = GET`; Astro quita el cuerpo. **Se mide en la tarea 1**: si Next no ejecuta en `HEAD`, Astro tampoco |
| `POST`, `PUT`, `PATCH`, `DELETE` | 405 sin cuerpo (medido en 2b sobre la ruta de fotos) | **404 vacío, sin mirar el secreto** (`ALL`), duda 1 |
| `OPTIONS` | 204 con `Allow` | **404 vacío** (`ALL`), duda 1 |

Sin `ALL`, Astro responde a un método sin manejador con un 404 sin cuerpo que reencamina a la 404 prerenderizada, fuera del middleware (b-dev de 2b). Eso daría una tercera forma de 404. Con `ALL` que devuelve `respuestaDeTareaNoExistente()`, todo lo que no es `GET`/`HEAD` es el mismo 404 vacío del secreto equivocado.

Si el humano pide paridad estricta (duda 1), `ALL` copia lo que hace el endpoint de fotos (204/405) y la fila sale de la lista de diferencias aceptadas. Es un cambio de dos líneas.

### 1.4 `vercel.json`

No cambia: mismas rutas, mismos horarios (`17 13 * * *` y `47 9 * * *`) y siguen siendo dos.

Queda por confirmar que Vercel lea los `crons` de `vercel.json` con el framework Astro y el Build Output API. Por documentación, `vercel.json` aplica a cualquier framework. La tarea 13 revisa además si `@astrojs/vercel` copia `crons` a `.vercel/output/config.json`, y el preview (tarea 14) confirma que el panel lista las dos tareas. **Solo si el panel no las lista**, el dev lo reporta y la corrección mínima se decide entonces (por ejemplo, declararlas en la configuración del adaptador si la expone). No se adelanta ningún cambio.

## 2. `src/lib/tareas/secreto.ts` sin `next/navigation`

### 2.1 Las únicas líneas autorizadas de `src/lib/`

**Solo `src/lib/tareas/secreto.ts`.** Ningún otro archivo de `src/lib/` cambia.

| Línea(s) hoy | Después |
|---|---|
| 16: `import { notFound } from "next/navigation";` | Se borra. |
| 21-49: el comentario de `respuestaDeTareaNoExistente` y la función | Se borran de aquí y se mudan **sin cambios** (comentario y cuerpo) a `src/app/api/tareas/no-existe.ts`. |
| 1-14: comentario de cabecera | Se agrega UNA frase: el 404 vive en `src/astro/tareas.ts` (Astro) y en `src/app/api/tareas/no-existe.ts` (Next, hasta 6b), y este módulo no depende de ningún marco. |

Firmas que se conservan **exactamente**: `VARIABLE_SECRETO_TAREAS`, `secretoDeTareaCorrecto(encabezado: string | null, secreto: string): boolean`, `avisarSinSecretoDeTareasUnaVez(env?)` y `reiniciarAvisoDeSecretoDeTareas()`. El cuerpo de las cuatro no cambia ni una línea.

**Mismo criterio que 3b-1** (`migrar-registro-astro/design.md` §4): lo que dependía de Next sale de `src/lib/`, y los envoltorios de `src/app/` se ajustan lo justo para que `npm run typecheck` siga en verde hasta 6b. Aquí es todavía menos: la función no cambia de firma ni de comportamiento, solo de casa. La duda 2 pide la autorización.

### 2.2 Las líneas de `src/app/` (excepción)

- **Nuevo:** `src/app/api/tareas/no-existe.ts`, con el `import { notFound } from "next/navigation"` y la función mudada.
- `src/app/api/tareas/purgar-rechazados/route.ts` y `barrer-fotos-huerfanas/route.ts`: el import de `respuestaDeTareaNoExistente` pasa de `@/lib/tareas/secreto` a `../no-existe`. Es una línea cada uno.
- Ningún otro archivo de `src/app/` cambia. Las dos rutas de Next siguen respondiendo exactamente lo mismo, y eso se comprueba con las pruebas de Next antes de re-apuntarlas (tarea 7) y con el diff (§6), que se corre contra `main`.

### 2.3 Que `next` ya no viaje en la función de Astro

Medición sobre `.vercel/output/functions/_render.func/`, antes y después, escrita en b-dev:

- archivos bajo `node_modules/next/` (hoy: **62**, d-validacion de 2a);
- tamaño total de la función (`du -sk`);
- `grep -rl "next/navigation\|next/dist" _render.func --include=*.mjs --include=*.js` fuera de `node_modules/next/`.

Lo que se exige después: **0 archivos de `next`** y ningún módulo de la función que importe `next/*`.

Una prueba nueva sobre la build (en el archivo de `plataforma-astro-build` o uno hermano) lo fija para que no vuelva. También comprueba que el trazado (`.nft.json`, si el adaptador lo deja) no nombre `next`.

`src/lib/admin/guarda.ts` también importa `next/*`, pero hoy ningún módulo de Astro lo alcanza (solo `src/app/admin/` lo importa). Si la Fase 5 se mergea antes y lo hace alcanzable, la prueba lo detecta, y eso le toca a la Fase 5, no a este change.

## 3. La puerta del secreto, antes de todo

### 3.1 Orden dentro del endpoint

```ts
// src/astro/tareas.ts (forma, no código final)
export function tareaAutorizada(peticion: Request, env = process.env): boolean;  // lee CRON_SECRET en cada petición, trim, vacío ⇒ false, secretoDeTareaCorrecto
export function respuestaDeTareaNoExistente(): Response;                         // new Response(null, { status: 404 }), sin cabeceras propias
```

En cada endpoint, la **primera** sentencia es:

```ts
if (!tareaAutorizada(request)) return respuestaDeTareaNoExistente();
```

Va antes de `obtenerPrisma()`, `almacenDeFotos()`, `purgarRechazados`, `barrerFotosHuerfanas`, `avisarPendientes` y `configuracionDeCorreo`. Las importaciones de esos módulos son de nivel superior, igual que en Next, pero ninguno abre conexiones ni lee archivos al importarse (lo comprueba la prueba de §3.3).

El secreto se lee en **cada petición**, no al cargar el módulo, como hoy. Cambiar `CRON_SECRET` en el panel de Vercel y redesplegar basta.

### 3.2 Forma exacta del 404

El 404 es:

- estado 404;
- sin cuerpo (0 bytes);
- sin `Content-Type`;
- sin `Cache-Control` propio (la spec `despliegue` prohíbe copiar el `no-store` de la ruta de fotos);
- sin `X-Robots-Tag` (hallazgo M1 de la etapa C de `preparar-deploy-produccion`: esa cabecera lo delataba);
- con las cuatro cabeceras de seguridad que pone el middleware, como pone `next.config.ts` en Next.

Es un 404 vacío devuelto por un endpoint, así que no se reencamina a `404.astro` (3a lo midió: "deja una 404 vacía"; 3b-1 §8). Aquí ese es justamente el efecto que se busca.

Si la tarea 1 mide que el 404 de `notFound()` en un Route Handler de Next trae alguna cabecera más (por ejemplo, un `Cache-Control` del marco o `Vary`), el endpoint de Astro la replica en `respuestaDeTareaNoExistente()`, con un comentario que la cite como medida. No se inventa ninguna.

### 3.3 Cómo se prueba que la puerta va primero

Sobre la salida construida, servida por el emulador (`tests/salida-astro.ts`):

1. **Base inalcanzable.** El entorno por defecto del emulador ya apunta `DATABASE_URL` a `127.0.0.1:1`. Con `CRON_SECRET` puesto y cada caso de secreto malo, las dos rutas responden el 404 vacío. El log del proceso no gana ninguna línea `[purga]`, `[fotos]`, `[aviso]` ni de Prisma o `pg`, y la respuesta tarda lo mismo que la de una ruta sin base (se pide una cota holgada, no una medición fina). Con el secreto correcto y esa misma base, en cambio, la purga responde 500 con `{"error":"No se pudo completar la purga.","aviso":…}`: eso prueba que la base sí se intenta cuando la puerta se abre.
2. **Base real de pruebas y almacén temporal** (`FOTOS_DIR` en un directorio temporal). Con un rechazado de 91 días con foto, una foto huérfana vieja y una marca de cupo caducada, cada petición con secreto malo deja todo igual: la fila, los dos archivos de la foto, la huérfana y la marca. Lo mismo con `CRON_SECRET` vacío o de puros espacios.
3. **Ni un `fetch` al proveedor de correo.** El registro del Resend falso queda vacío tras todos los casos de secreto malo.

### 3.4 Indistinguibilidad

Para cada ruta de tareas se piden, con `GET` y con `HEAD`:

- sin `Authorization`;
- `Bearer` + secreto equivocado de la misma longitud;
- secreto truncado en un carácter;
- secreto con un carácter de más;
- el secreto sin `Bearer`;
- `bearer` en minúsculas;
- `Bearer` con dos espacios;
- `Basic …`;
- `Authorization` vacío;
- con `CRON_SECRET` sin configurar;
- con `CRON_SECRET` de puros espacios;
- y además `POST`, `PUT`, `DELETE` y `OPTIONS` con el secreto correcto y `Origin` propio.

Todas las respuestas son idénticas entre sí (estado, cuerpo y el conjunto de cabeceras con sus valores, salvo `Date`) y entre las dos rutas. También son idénticas al 404 de Next medido en la tarea 1 (§6) y al 404 de la ruta de fotos con clave inventada, salvo el `Cache-Control: no-store` de esta última, que es suyo.

**Frente a una dirección inexistente** (`/api/tareas/inventada`, `/a/b/c`): esas sirven la página 404 en HTML. El requirement `despliegue` ya admite esta diferencia ("el marco devuelve dos 404 distintos"), y Next tiene la misma. Lo que se exige es que la diferencia sea **la misma que en Next**: el diff compara también `/api/tareas/inventada` en las dos versiones.

**Tiempo constante:** se conserva `timingSafeEqual` sin cambios. No se escribe una prueba de tiempos (sería frágil). Sí hay un guardián de código: `secretoDeTareaCorrecto` sigue usando `timingSafeEqual`, y ni `src/astro/tareas.ts` ni los endpoints comparan el secreto con `===`, `startsWith` ni `includes`.

## 4. El middleware y estas rutas

Recorrido de `src/middleware.ts` para cada forma de petición (sin cambios en el middleware):

| Petición | `isPrerendered` | Regla de origen (`envioDeOtroOrigen`) | Tabla de Actions (`atenderAcciones`) | Resultado |
|---|---|---|---|---|
| `GET`/`HEAD` (el cron) | no | `false`: `GET`/`HEAD`/`OPTIONS` son métodos seguros | `getActionContext` no ve Action (Astro solo la reconoce en `POST` con `?_action=` o en `/_actions/*`) → `siguiente()` | el endpoint, con las cuatro cabeceras |
| `GET …?_action=reportar` | no | `false` | sin Action (es `GET`) → `siguiente()` | el endpoint, que aplica su puerta. Con el secreto correcto corre la tarea, igual que Next, que ignora la consulta |
| `POST` con `Origin` ajeno o `null` | no | `true` | — | la página 403 en español (`/envio-rechazado`), igual que cualquier `POST` ajeno a cualquier ruta del sitio. **El endpoint no corre** |
| `POST …?_action=<x>` con `Origin` propio | no | `false` | `routePattern` ≠ la ruta de `x` → `comoDireccionInexistente` | la 404 de no encontrado (HTML), igual que en cualquier ruta ajena. **El endpoint no corre** |
| `POST` con `Origin` propio o sin `Origin`, sin `?_action=` | no | `false` | sin Action → `siguiente()` | `ALL` del endpoint → 404 vacío, sin mirar el secreto |

Conclusiones:

- La regla de origen y el candado de Actions **no aplican a `GET`**. No hace falta excepción ni línea nueva en el middleware para estas rutas. Vercel Cron no manda `Origin`, y aunque lo mandara, un `GET` no se evalúa.
- **Ningún `POST` ejecuta una tarea**, por ninguno de los tres caminos.
- Los avisos de arranque se quedan donde están (`avisarSinSecretoDeTareasUnaVez()` en el tronco del middleware). Lo único que cambia es que ya no arrastran `next`.

Las pruebas de la tarea 5 recorren cada fila sobre la build.

## 5. Pruebas sin servicios reales

### 5.1 Resend falso

`tests/fixtures/resend-falso.mjs` sigue el molde de `twilio-falso.mjs`. Se carga con `node --import ./tests/fixtures/resend-falso.mjs scripts/servir-salida-vercel.mjs` y, para Next en el diff, con `NODE_OPTIONS=--import=…` en `next start`.

- Envuelve `globalThis.fetch`. El adaptador real (`crearCorreoResend`) llama a `fetch(URL_API_RESEND, …)`, así que cae aquí **sin tocar `src/lib/`** y sin una variable que cambie la URL del proveedor en producción.
- `RESEND_FALSO_GUION`: `aceptado` (200), `rechazado` (422), `repetido` (409 `invalid_idempotent_request`), `error` (503) o `tarda` (no contesta; el `AbortController` de 5 s lo corta). También acepta `@<archivo>` para leerlo en cada llamada, como el Twilio falso.
- `RESEND_FALSO_REGISTRO`: una línea JSON por llamada con el método, la URL, si había `Authorization` (sí/no, **nunca el valor**), `Idempotency-Key`, `User-Agent` y el cuerpo (`from`, `to`, `subject`, `text`).
- **Cualquier otro host externo LANZA.** Solo pasan las direcciones locales. Las tareas no hablan con Twilio, así que este simulador no se combina con el Twilio falso.
- Un guardián (`tests/resend-falso.test.ts`) comprueba que nada de `src/` ni de la build lo menciona.

**Entorno de las pruebas del aviso, todo ficticio:**

- `RESEND_API_KEY=re_prueba_falsa`;
- `AVISOS_CORREO_REMITENTE=avisos@ejemplo.invalid`;
- `AVISOS_CORREO_DESTINO=admin@ejemplo.invalid`;
- `SITIO_URL=https://enmirumbo.example`.

`.invalid` y `.example` son dominios reservados (RFC 2606): no hay buzón real que pueda recibir nada, y el guardián de correos reales de `tests/despliegue.test.ts` ya los admite.

**Lo que se comprueba del correo:**

- el cuerpo que recibió el simulador no contiene el nombre, el WhatsApp, la colonia, la oferta ni el identificador de ningún negocio sembrado;
- trae solo conteos y el enlace a `https://enmirumbo.example/admin`;
- una segunda corrida el mismo día no produce un segundo envío aceptado.

### 5.2 Almacén de fotos y base

- **Base:** la de pruebas (`tests/db.ts`, PostgreSQL local o el efímero del CI), con datos de la serie ficticia `771999xxxx`. Cada archivo limpia lo suyo con `tests/limpieza.ts`. Lo que siembra un archivo no puede romper la "cola vacía" ni el "nada que barrer" de otro (hallazgo A1 de 2b; obs. 6 de 3b-2).
- **Fotos:** el almacén local con `FOTOS_DIR` en un directorio temporal propio de cada archivo. El emulador corre con `NODE_ENV=production`, sin `VERCEL_ENV` y con una base en `localhost`, así que la selección del almacén no lo toma por "desplegado" y no busca el bucket. Las variables del almacenamiento del proveedor se **borran** del entorno del emulador y una aserción lo comprueba: ninguna prueba puede alcanzar el bucket real aunque la terminal las tenga.
- **La purga borra los archivos antes que la fila.** El caso de "almacén que falla" se arma poniendo un directorio donde debería estar un archivo de la variante (la técnica que nombra `rechazados.ts`). La ficha no se borra, cuenta en `fallidos` y la respuesta es 500. Con el almacén sano, los dos archivos ya no están y la fila tampoco.
- **El barrido no borra fotos de negocios vivos.** Un negocio publicado con foto, uno en revisión con foto y uno rechazado reciente con foto conservan sus dos archivos tras el barrido. Solo se va la huérfana vieja, y la huérfana recién escrita queda en `enPeriodoDeGracia`.

### 5.3 Qué corre dónde

- **Unitarias (Vitest, sin build):** las pruebas re-apuntadas llaman a `GET` del endpoint de Astro con un contexto mínimo (`{ request, url, params: {} } as never`), como ya hace `tareas-programadas.test.ts` con la ruta de fotos.
- **Sobre la build (emulador + base de pruebas + Resend falso):** paridad, puerta, métodos, middleware, aviso, barrido, purga y log de arranque.
- **Ninguna prueba** usa `RESEND_API_KEY`, Supabase Storage, Twilio ni la red. Si el Resend falso no está cargado, el adaptador real fallaría contra la red; para impedirlo, el helper que levanta el emulador para estas pruebas exige el `--import` y falla si falta.

## 6. El diff contra Next

- **Referencia:** Next de `main`, construido y servido fuera del árbol de trabajo, como indica `scripts/diff-html.mjs` (paso 3; se prefiere `git archive main | tar -x -C ../enmirumbo-next` para no crear otro worktree). Contra **la misma base** y **el mismo `FOTOS_DIR`**, con el **mismo `CRON_SECRET` de prueba** (`openssl rand -hex 32`, solo en la terminal, nunca en el repo) y el Resend falso cargado en los dos procesos.
- **Estado de la base por caso.** Las tareas escriben, así que antes de cada petición, de cada lado, un sembrador ficticio (`scripts/sembrar-tareas.mjs`, nuevo, solo datos `771999xxxx`) deja la base y el almacén en el mismo estado inicial. El script corre Next → resiembra → Astro → compara.
- **Casos:**
  - los de §3.4;
  - con el secreto correcto: la purga normal (dos rechazados de 91 días, uno de 89 y uno sin fecha de rechazo), la segunda corrida (idempotente: ceros), la purga con `fallidos > 0`, la purga con la base caída (500 con `error` y `aviso`);
  - el aviso en sus cuatro estados (`mandado`, `sin-pendientes`, `sin-configurar` sin las variables, `fallido` con el guion `error`, y `repetido` en frío y tras un envío aceptado);
  - el barrido normal, el barrido detenido (base vacía y huérfana presente) y el barrido sin almacén alcanzable;
  - `/api/tareas/inventada` y las dos rutas con barra final (solo se registra; la propuesta, en "Fuera de este change", lo deja para 6b).
- **Qué se compara:**
  - estado;
  - **cuerpo byte a byte** (el JSON es `JSON.stringify` en los dos lados, así que el orden de claves debe coincidir);
  - conjunto de cabeceras con sus valores, excluyendo `date`, `connection`, `keep-alive`, `transfer-encoding` y las `x-vercel-*` del emulador;
  - las líneas del log de la petición (prefijo y texto, sin marcas de tiempo);
  - lo que recibió el Resend falso;
  - el estado de la base y del almacén después.
- **Diferencias aceptadas, lista explícita:** solo una, la de §1.3 (otros métodos: 404 vacío contra 405/204), si el humano la aprueba (duda 1). Cualquier otra diferencia se reporta y no se normaliza. El script imprime cuántas veces aplicó la excepción y en qué peticiones.
- **Fixtures:** `--capturar-6a` escribe en `tests/fixtures/next-6a/` las respuestas de Next (estado, cabeceras y cuerpo en base64). Así las pruebas de la suite comparan contra Next sin necesitar la build de Next en el CI.

## 7. Qué se retira de Next, solo en 6b

Nada de esto se toca aquí:

- `src/app/api/tareas/purgar-rechazados/route.ts`, `src/app/api/tareas/barrer-fotos-huerfanas/route.ts` y `src/app/api/tareas/no-existe.ts`;
- la mención de las dos rutas de Next en la lista blanca de `noindex` de `tests/buscador-pagina.test.ts` (si sigue haciendo falta tras re-apuntarla);
- el paquete `next` (`notFound` ya no lo necesitará nadie de `src/lib/`);
- el párrafo de `respuestaDeTareaNoExistente` en `no-existe.ts`, que documenta el 404 de Next ("11 090 bytes / 0 bytes"). Su historia queda en `src/astro/tareas.ts`, que cita las medidas de Next y de Astro.

## 8. Riesgos

| Riesgo | Mitigación |
|---|---|
| Vercel no registra los crons con la build de Astro | Tarea 13 (`config.json`) y tarea 14 (lista de crons en el panel del preview). Sin crons, el PR no sale de borrador |
| Next manda en el 404 o en el JSON una cabecera que no se adivinó | Se mide en la tarea 1 y se replica con su cita. El diff compara el conjunto completo de cabeceras |
| `HEAD` con el secreto correcto ejecuta la tarea | Es lo que hace Next (se mide). La tarea es idempotente y requiere el secreto. Queda escrito en el requirement |
| Una prueba alcanza Resend, el bucket o la red | El Resend falso lanza ante cualquier host externo, las variables del bucket se borran del entorno del emulador y el helper exige el `--import` |
| Las pruebas re-apuntadas pierden dureza | Conteo de `expect(` por archivo, igual o mayor, sin `skip` nuevos. El validador lo compara |
| La base compartida de la suite arrastra estado entre archivos | Prefijo propio por archivo, `afterAll` con `tests/limpieza.ts` y una sonda de "cola vacía / nada que barrer" al final, como en 3b-2 |
| `next` sigue entrando por otro camino | La prueba de §2.3 sobre la build lo detecta, venga de donde venga |
