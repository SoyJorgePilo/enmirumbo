# Etapa C · seguridad-test — explorar-migracion-astro (T-021)

**Veredicto: PASA al validador** (0 crítico, 0 alto, 2 medio). Los medios no bloquean; M1 debe corregirse antes de apuntar el spike a la base de Supabase, y M2 entra al reporte del spike como costo.

Alcance auditado: `git diff` (solo `tsconfig.json`, `eslint.config.mjs`, ticket), archivos sin seguimiento (`spikes/astro/`, `docs/decisiones/ADR-013-spike.md`, el change). Pruebas dinámicas contra la salida real de `astro build` servida por `scripts/servidor-local.mjs` (emulado, sin preview).

## Hallazgos

### Crítico — ninguno
### Alto — ninguno

### Medio

**M1 · La guarda de TLS se salta con un `sslmode` duplicado** — `spikes/astro/src/lib/base.ts:35`
`revisarConexion` lee el **primer** `sslmode` (`searchParams.get`) y el primer `sslrootcert`; `pg-connection-string` recorre `searchParams.entries()` y se queda con el **último**. Comprobado con el parser real:
`…?sslmode=verify-full&sslrootcert=certs/supabase-root-2021-ca.crt&sslmode=disable` → la guarda dice `{ ok: true }` y `pg` conecta con `ssl: false` (con `&sslmode=no-verify`, `rejectUnauthorized: false`).
Explotación: quien escriba (o copie mal) `DATABASE_URL` en el proyecto de Vercel del spike obtiene una conexión remota sin cifrar o sin verificar, y la página muestra datos como si la guarda hubiera pasado: rompe la promesa "sin caer a una conexión sin verificar" (PRD v2 §2.5) y, de paso, el veredicto del punto 4. No hay vector anónimo (la URL es un secreto de entorno), por eso medio.
Corrección sugerida (dev): rechazar parámetros repetidos (`getAll(k).length > 1` → `no-interpretable`) o, mejor, decidir sobre `parse(url)` de `pg-connection-string` (exigir `ssl` objeto con `ca` y `rejectUnauthorized !== false`). Prueba que lo documenta: `it.fails("M1: …")` en `tests/adversarial-seguridad.test.ts`; al corregir, quitar `.fails`.
Fuera del diff: `src/lib/base-datos/conexion.ts:62-65` (`modoTlsDeclarado`) usa el mismo criterio de "primera coincidencia"; conviene un ticket aparte para revisar si la app tiene el mismo hueco.

**M2 · El 403 de `checkOrigin` sale sin cabeceras de seguridad y en inglés** — Astro core, antes del middleware (`src/middleware.ts` no lo alcanza)
`POST /reportar?_action=reportar` con `Origin: null`, sin `Origin` o con uno ajeno → `403 text/plain "Cross-site POST form submissions are forbidden"` sin `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options` ni `Referrer-Policy`. El requirement dice "toda respuesta"; el dev ya lo anotó como excepción. Impacto real bajo (texto plano, sin HTML), pero es un costo de la migración: Fase 3 debe decidir si apaga `checkOrigin` y lo reimplementa en middleware (con cabeceras y texto en español) o acepta la excepción. Debe figurar como "pasa con costo" en ADR-013-spike §3, no como pasa limpio.

### Observaciones (bajo, no bloquean)

1. **Semilla sin guarda contra producción** — `package.json` `db:semilla` / `prisma/semilla.sql:3,9`: corre `CREATE TABLE` + `TRUNCATE spike_negocio` contra cualquier `DATABASE_URL` del `.env` del spike. Solo toca su propia tabla, pero si alguien pega la URL de producción, escribe en producción. Sugerencia: el paso humano del preview ya dice "base nueva"; añadir una advertencia explícita junto al comando.
2. **`vite.server.fs.allow: ["../.."]`** — `astro.config.mjs:31`: en `astro dev` el servidor de Vite puede servir por `/@fs/` cualquier archivo del repo (no los `.env*`/`*.crt` del `fs.deny` por defecto). Solo dev y en `localhost`; acotar a `["../../src"]` reduciría superficie.
3. **Abuso del formulario** — sin límite de cuerpo ni de frecuencia: un `POST` de 5 MB se acepta y se parsea (303). En el spike solo incrementa un contador; en la migración real hay que conservar el cupo por IP de la app.
4. **Cookie del aviso guarda `error.message` arbitrario** — `src/middleware.ts:44`: con un `POST` JSON a `?_action=reportar` la cookie lleva "This action only accepts FormData." La lectura (`avisoDesdeCookie`) solo acepta los dos códigos y Astro codifica el valor; sin impacto. Mejor escribir solo el código validado.
5. **`entrar` no pide credencial** (por diseño del spike): cualquiera obtiene sesión y ve `/protegida`, que no tiene nada sensible. Que siga sin contenido real.
6. **Referrer-Policy de páginas prerenderizadas**: `cabeceras-estaticas.ts:36` llama `cabecerasPara("/<archivo>")`; si algún día `reportar` se prerenderiza (`/reportar/index.html`), saldría con la política de producción y no con `strict-origin`. Hoy no aplica.
7. **Tailwind de la raíz escanea `spikes/`** (detección automática, `spikes/astro/src` no está en `.gitignore`). Verificado: todas las clases del spike ya existen en `src/`, el CSS de producción no cambia hoy.

## Verificaciones por eje (todas OK salvo M1/M2)

1. **Sesión** — HMAC-SHA256 `v1.<caducidad>`, `timingSafeEqual` con chequeo de largo previo, caducidad validada, secreto < 32 → `null`. Respuesta real: `Set-Cookie: spike_sesion=…; Max-Age=28800; Path=/; HttpOnly; Secure; SameSite=Lax`. Con cookie válida 200; alterada (firma, caducidad, mayúsculas, `=`/`.`/`%00` extra, caducidad gigante), duplicada con basura primero, o forjada con secreto vacío/corto → 307 a `/acceso`. Sin secreto (31 caracteres): `POST /acceso` → 303 **sin** `spike_sesion`, `/acceso` → 503 con aviso. Bypass de ruta: `/%70rotegida`, `/PROTEGIDA`, `//protegida`, `/protegida%2F`, `/protegida;x`, `/protegida/index.html` → 404, `/./protegida` → 307; ninguno muestra contenido protegido.
2. **Cabeceras** — las cuatro, idénticas a `cabecerasDeSeguridad()`, en `/`, `/reportar` (`strict-origin`, también en su 303), `/reportar/gracias`, `/estatica` (CDN, vía `config.json`), `/negocios` (503), `/acceso`, `/protegida` (307), 404, `/_astro/*.css` y `/_astro/noexiste.js`. CSP sin `nonce-`. Excepción: M2.
3. **Formulario sin JS** — `Origin: null`, ausente, ajeno, `localhost:4399.ajeno.test`, mayúsculas o con `/` final → 403 (nunca 500). `Referer` ajeno, `//ajeno` o `javascript:` → `Location` siempre fija (`/reportar` o `/reportar/gracias`): **no hay open redirect**. Acción desconocida → 303 a `/`. Texto del vecino nunca en URL ni cookie.
4. **TLS** — remota exige `verify-full` + `sslrootcert` existente; `?host=`/`?hostaddr=` rechazados; `pg` con `verify-full` deja `rejectUnauthorized` por defecto (verifica cadena y nombre). Certificado `certs/supabase-root-2021-ca.crt`: CA **pública** de Supabase (sin clave privada), byte a byte igual a `certs/` de la raíz ya versionado; viaja en `_render.func/certs/`. Fallo: M1.
5. **Repo y aislamiento** — sin `.env` en el spike; `spikes/astro/.gitignore` excluye `node_modules/`, `dist/`, `.astro/`, `.vercel/`, `src/generated/`, `.env*` (verificado con `git check-ignore`); `git status` solo propone archivos fuente y de configuración del spike (incluida la prueba de esta etapa), nada generado. Escaneo de credenciales (URLs con clave, tokens, JWT, claves privadas, teléfonos de 10 dígitos): solo placeholders (`USUARIO:CLAVE@HOST`, `postgres:postgres@localhost`, `db.ejemplo.test`). Semilla con 3 negocios ficticios sin WhatsApp. Sin cambios vs `main` en `src/`, `tests/`, `package*.json`, `vitest.config.mts`, `.github/`, `vercel.json`, `next.config.ts`. `npm run build` raíz no menciona `spikes`; vitest raíz solo incluye `tests/**`; el proyecto de Vercel del spike (Root Directory `spikes/astro`) no lee el `vercel.json` raíz (crons) ni comparte variables.

## Mapa scenario → prueba (revisión)

Sin test automatizado pese a ser automatizables (no bloquean en un spike, quedan como deuda para Fase 3):
- "con cookie válida abre / sin cookie 307 / alterada 307": hay pruebas de `esSesionValida`, pero **no del middleware** (307 + cuerpo sin contenido protegido); solo curl manual. Automatizable con el emulador o el container API de Astro.
- "la cookie se emite con sus atributos": solo curl; añadí prueba de `OPCIONES_COOKIE` (unidad, no de la respuesta).
- "el certificado viaja con la función": inspección manual; automatizable leyendo `.vercel/output/functions/_render.func/certs/` tras el build.
- "cabeceras en todas las respuestas" a nivel respuesta HTTP: solo curl.
Los demás (navegador sin JS, Firefox, Lighthouse, preview, veredicto) son manuales por naturaleza y están marcados como pendientes por el dev.

## Pruebas adversariales añadidas

`spikes/astro/tests/adversarial-seguridad.test.ts` (18 pruebas, sin tocar la suite raíz):
- Sesión: cookie forjada con secreto vacío/corto; firma sin prefijo `v1.`; caducidad `0…`, `+…`, `….0`, `…e0`, `-…`, con espacio; firma multibyte del mismo largo en bytes (no revienta); base64 estándar; valores de 100 KB; sesión legítima vencida; atributos `HttpOnly`/`Secure`/`SameSite=Lax`.
- Base: invariante "aprobada ⇒ pg conecta a esta máquina o verifica TLS", comprobada con el parser real de `pg`; `VERIFY-FULL`, `no-verify`, `verify-ca`, `localhost.ejemplo.test`, protocolo ajeno, `HOST=` en mayúsculas; **M1** como `it.fails`.
- Formulario: motivo con espacios, mayúsculas, `\0`, HTML, ZWSP o como archivo; comentario de 300 (pasa) y 301 RTL (no); cookie del aviso con variantes casi válidas.
- Cabeceras: rutas parecidas a `/reportar` no relajan la política; nombres de archivo con metacaracteres de regex; sin `handle: filesystem` el build truena.

Resultado: `cd spikes/astro && npx vitest run` → 6 archivos, **41 pasan + 1 fallo esperado (M1)**; `tsc --noEmit` del spike limpio.

## Cierre en la raíz

- `npm run lint` → 0. `npm run build` → 0 (sin rastro de `spikes/`).
- `npm test` → 3245 pasan, 2 omitidas, **1 falla: [A2]** de `tests/reportes-seguridad-adversarial.test.ts`; corrido aislado 4 veces: 2 fallas en cada corrida ([A1] y/o [A2], carreras contra el cupo en la base de `prisma dev`). **Preexistente confirmado**: el change no toca `tests/`, `src/`, `vitest.config.mts` ni dependencias respecto a `main`, y los cambios en `tsconfig.json` (`exclude`) y ESLint no influyen en lo que corre vitest. No se arreglaron.
- Sin commits.
