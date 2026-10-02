# Etapa D · validación — migrar-registro-astro (T-024, Fase 3b-1)

**Veredicto: APROBADO.** 0 bloqueantes, 1 hallazgo bajo propio (V1, decisión humana antes del merge), 0 críticos/altos abiertos de C (M1 y M2 corregidos y reproducidos por mí). El PR va directo a `migracion-astro`. T-024 pasa a `en-review`, no a `hecho`: falta 3b-2.

Todo lo verifiqué desde un árbol limpio (copia de los 910 archivos versionados + nuevos, `npm ci` propio, sin `.vercel`/`dist`/`.astro`), con bases propias: `prisma dev v3b1dval` y un PostgreSQL 16 desechable (`suiteci` para la suite, `espejo` para la paridad). Next de `origin/main` (`8d514f5`) sale de `git archive` con su `npm ci`. `origin/migracion-astro` sigue en `200b2a4`: nada que fusionar.

## Compuertas (mías)

- `npm run lint`: exit 0. `npm run typecheck`: 426 archivos, 0 errores.
- `npm run build` con `DATABASE_URL` a `127.0.0.1:1` y sin `SITIO_URL`: Complete.
- `npm test` contra `prisma dev v3b1dval`: 161 archivos, 4262 pasan, 2 expected fail, 4 saltadas (concurrencia y las 2 preexistentes).
- `npm test` contra **PostgreSQL 16 real, en el orden del CI** (sin caché de resultados, `.vercel` borrado, `migrate deploy` + `db:seed` antes): 161 archivos, **4266 pasan, 2 expected fail, 0 saltadas**. La carrera por el mismo número con foto corre (`✓`, verificado con `--reporter=verbose`).
- Expected fail: `[M1]` de 2b y `[c-seguridad M1]` de 3a. El `it.fails` de M1 3b-1 ya es `it` y pasa.
- Al final de las dos corridas: **0 negocios, 0 reportes, 0 fotos en la base, 0 filas de `IntentoDeCupo`**. En `.fotos-test` quedan los 2 `.webp` del negocio demo (preexistente, no de este change).

## Diff de HTML contra Next de `main` (2a + 2b + 3a + 3b-1 juntas)

- Base `espejo`: `db:seed` + `db:seed:demo` + fotos para revisión y rechazado, un despublicado con foto y una ficha con 10 reportes (tope). Storage falso de Supabase en HTTPS local (GET/POST/DELETE), `next start` y `servir-salida-vercel.mjs` en producción.
- **A** (`SITIO_URL`): cero diferencias en 96 rutas. **B** (A + medición): cero en 96. **C** (sin `SITIO_URL`): cero en 69. Exit 0 en las tres.
- Envíos 3a: 6 iguales + 2 ACEPTADA; envíos 3b-1: 22 iguales + 2 ACEPTADA. Lo aceptado es solo origen ajeno/`null` (Next 500, Astro 403).
- `NORMALIZACIONES_REGISTRO` impresas y acotadas a `/registro` y sus re-pintados: las cinco de `design.md` §8 (13/13/13/13/10 en B y C; en A el cupo-4 no repinta en ninguno de los dos lados porque corrí A sin `REGISTRO_ENCABEZADO_IP`).

## Arnés sin JS sobre la salida construida (A), Next y Astro lado a lado

| Caso | Resultado |
|---|---|
| Alta con JPEG real de 2.7 MB con EXIF (marca, modelo, fecha, GPS) | 200→303 `/registro/gracias`→200 en los dos; ficha `en_revision`/`organico`/versión 2; variantes 1200×900 y 400×300 **byte a byte iguales a las de Next**, sin `exif`/`xmp`/`icc` y sin las cadenas `GPS` ni `MarcaFicticia` |
| Inválida (WhatsApp de 8 dígitos, 250 caracteres, foto) | 200 con los tres mensajes literales por campo; Astro con `autofocus` solo en `whatsapp` (Next ninguno); URL `/registro?_action=registrar`; sin `Location` ni `Set-Cookie`; 0 filas |
| Honeypot | el mismo 303 a gracias, 0 filas |
| Reenvío por el mismo WhatsApp | 2.º envío: 200 con el mensaje de duplicado, 1 fila con el nombre original |
| Cupo por IP (`x-forwarded-for` con primer valor rotado) | 3 altas y el 4.º con "Ya recibimos varios registros desde aquí…" en los dos |
| `Origin` ajeno / `null` / ausente | 403/403 (Next 500/500) sin fila; ausente: 303 y 1 fila |
| `POST /?_action=registrar`, ficha y su `/reportar?_action=registrar`, `/registro/gracias?_action=registrar`, `/registro?_action=reportar`, `/_actions/registrar` (form y JSON), `/_actions/inventada` | 404 con cuerpo idéntico a `/a/b/c` y `/loquesea`, cuatro cabeceras, 0 filas |
| Base caída (`127.0.0.1:1`): GET `/registro`, POST registrar, POST reportar, `POST /500?_action=registrar` | **500 "Algo falló de nuestro lado"** (O1 cerrado), cuatro cabeceras, `Cache-Control` dinámico, 0 filas |
| 7 MiB con `Content-Length` y por trozos | 200 con "Esa foto pesa más de 5 MB", 0 filas |
| Cabeceras en 200 (`/registro`, gracias), 303, 403, 404, 500 | las cuatro presentes en todas, sin `X-Powered-By` |

## M1 y M2 de la etapa C, reproducidos antes/después

Construí una variante con la mutación (`pintarSinReleerElCuerpo` sin quitar el `Content-Type`) y medí con una sonda propia (`Request.prototype.formData` + RSS):

| | Antes (mutado) | Después (el change) |
|---|---|---|
| Multipart sin `name` / truncado a `/registro?_action=registrar` | socket cortado y **emulador caído** | 200 completo (`</html>`), "No pudimos guardar tu registro…", emulador vivo |
| Lo mismo a `/500?_action=registrar` | emulador caído | 500 completo, 0 lecturas |
| 200 MB por trozos sin `Content-Length` | RSS 78→**2454 MB**, 8 lecturas | RSS 148→**165 MB**, 0 lecturas, 200 "Esa foto pesa más de 5 MB" |
| Cuerpo válido con error | 9 lecturas | **1** lectura |

## Bandera de SMS (Twilio falso, `node --import tests/fixtures/twilio-falso.mjs`)

- **Encendida, `enviado`:** 303 `/registro/verificar` con `nu_paso` (`HttpOnly; Secure; SameSite=Lax; Path=/registro/verificar; Max-Age=900`, valor sin el número); ficha `en_revision` sin verificar; 1 llamada a `/Verifications` con `To=+52…`, `Channel=sms`.
- `error`, `rechazado`, `tarda` (corte a ~5 s): 303 a gracias sin cookie, ficha guardada. Reenvío de ficha ya verificada y duplicado: 0 llamadas.
- **Apagada con credenciales:** 303 a gracias, 0 cookies, 0 llamadas; `/registro/verificar` byte a byte igual a `/a/b/c`, también con la bandera encendida (3b-2 pendiente).

## Módulo de cliente (medido en la build)

- `/registro` lleva exactamente un `<script type="module" src="/_astro/registro.astro_…js">`; `/`, gracias, legales, `/buscar` y la 404: ninguno. Sin `astro-island` ni `modulepreload`; el `client.*.js` de React (191 KB) existe en `_astro/` desde la base y ninguna página lo pide.
- Peso con `gzip -9`: arranque 970 B + módulo 1912 B = **2882 B** (≤ 5 KB).
- Leído el `.js` construido: un solo `fetch`, a `form.action`; navega solo a `/registro/gracias` o `/registro/verificar` (compara `pathname` del mismo origen y asigna la constante); reemplaza solo el `<form>` que contiene `#categoriaId` (`importNode`, sin `innerHTML`); sin `history`, almacenamiento, `sendBeacon` ni medición.

## Escrutinio de pruebas (`git diff HEAD -- tests/`)

- `expect(` igual o mayor en los 18 archivos modificados (p. ej. `registro-pagina` 110→118, `layout` 167→178, `verificacion-acciones` 43→46, `verificacion-adversarial` 39→39); sin `skip`/`only`/`todo` nuevos; el único condicional nuevo es `it.runIf(backendsIndependientes)` de la carrera, que corre en PostgreSQL.
- Los siete guardianes ajustados y `registro-pagina` revisados: ninguno más laxo. "Cero `<script src>`" pasó a **exactamente uno** y con la ruta exacta del módulo (`tests/registro-pagina.test.ts:66-67`, `:569-571`); la observación 2 de C ya no aplica.
- **Mutaciones mías (todas revertidas, árbol limpio después):**
  1. Sin la regla de origen (`src/middleware.ts:50`): fallan 10 (7 `astro-origen`, 2 `plataforma-astro-registro`, 1 `registro-astro-seguridad-adversarial`).
  2. Devolver el `Content-Type` en `pintarSinReleerElCuerpo` (`src/astro/acciones.ts:163`): fallan 7 (6 `registro-astro-cuerpo-una-vez`, 1 adversarial M1).
  3. Sin la guarda de `/500` (`src/astro/acciones.ts:172`): falla la de reportar con la base caída. El registro sigue dando 500 sin la guarda porque la petición ya no se declara formulario al pintar; la guarda queda probada por reportar.

## Alcance, datos y dependencias

- `git diff --stat`: `src/lib/` solo `verificacion/acciones.ts`; `src/app/` solo los tres envoltorios (traducen `DestinoVerificacion` a `redirect`/`notFound`, design.md §4); `src/components/registro/` 2 cambiados + 3 nuevos; sin diff en `vercel.json`, `prisma/`, `next.config.ts`, `astro.config.mjs`, `openspec/specs/`, `spikes/`.
- Sin secretos ni datos reales: WhatsApp `771999xxxx`, `enmirumbo.example`, `ACtest…`; la única URL de base es `usuario:claveFicticiaO1@127.0.0.1:1`. Los ids largos de los fixtures son el hash de la Server Action de Next.
- `happy-dom` 20.14.5 (devDependency exacta). `npm audit` antes y después: idéntico (1 moderada, 5 altas: `prisma`, `@prisma/config`, `brace-expansion`, `deepmerge-ts`, `fast-uri`, `mysql2`). Paquetes nuevos del lock: 7, ninguno con `hasInstallScript`. `ws@8.22.0` queda `devOptional` (peer opcional de `@vercel/functions`), sin avisos y fuera de `_render.func/node_modules`.
- La función gana `sharp`, `@img/sharp-*` y `detect-libc` (esperado, design.md §6). `next/navigation` en el chunk del middleware ya estaba en la base (lo comprobé construyendo `HEAD`).
- UI en español, sin `any`, sin texto de UI nuevo.

## Hallazgos

**V1 · bajo, nuevo, decisión humana antes del merge.** `src/astro/registro-cliente.ts:212-217`: si el `fetch` no responde en 60 s, el módulo aborta y hace `formulario.submit()` (envío nativo). La spec dice en el punto 5 del requirement "Con JavaScript…" (`specs/plataforma-astro/spec.md:119`) y en `design.md:74` "sin reenviar nada por su cuenta". Lo agregó el dev por la observación 6 de C. El riesgo es acotado: si el primer envío sí llegó, el segundo ve el mensaje de duplicado y no queda nada huérfano. **Opciones:** (a) aceptarlo y precisar la letra al archivar ("tras 60 s sin respuesta, cede una vez al envío nativo"); (b) que el vencimiento muestre el error general y reactive el botón, como dice la spec (unas 5 líneas). No bloquea porque el desenlace del envío nativo es el de la spec sin JS.

## Candidatos a ticket (van en el PR)

1. **Cupo por IP:** la misma IP escrita distinto (`::ffff:v4`, IPv6 no canónica) cuenta como otra llave, y el cupo no es atómico frente a una ráfaga (12 envíos dejaron 7 altas con cupo 3). Preexistente e igual en Next: ticket para `main`.
2. **413 de Vercel** con fotos de 4.5 a 5 MB (en inglés y sin cabeceras; con JS se ve el error general).
3. **M1 de 3a:** `x-astro-locals` responde `Forbidden` sin cabeceras.
4. **El middleware no pisa cabeceras ya presentes** (regla general abierta).
5. **La 404 dinámica de Next tiene el `<body>` vacío sin JS** (preexistente en `main`).
6. **`ws` en el árbol de producción** del lock (`devOptional`, peer de `@vercel/functions`): sin avisos y no viaja en la función.
7. **Para 3b-2:** con JS, el módulo sigue el 303 y pide `GET /registro/verificar` antes de navegar; ese GET tiene que seguir sin efectos.

## Pendiente humano (tarea 19, preview de Vercel)

- Sin JS en Chrome **y** Firefox: enviar vacío (foco), corregir con una foto de 3–4 MB del celular, gracias, recargar.
- Con JS: dos errores y un éxito, con **una sola vista de `/registro`** y una de gracias en Umami; URL sin cambio, foco y "Enviando...".
- Lighthouse móvil de `/registro`; que `sharp` de Linux procese la foto; `curl` de las cuatro cabeceras en `/registro`, el 303 y gracias; una foto de 4.6 MB para anotar el 413.
- **Supuesto sin confirmar fuera del emulador:** que en Vercel la petición deje quitar el `Content-Type` en `pintarSinReleerElCuerpo`. Comprobarlo enviando a `/registro?_action=registrar` un multipart con una parte sin `name` (debe volver el formulario completo con "No pudimos guardar tu registro…") y un error de validación normal (respuesta completa). **Si no se puede quitar:** volver a abrir M1/M2. **M2 sube a ALTO si Vercel deja pasar envíos por trozos de más de 4.5 MB**; comprobarlo con un `curl -H 'Transfer-Encoding: chunked'` de 6 MB.
- **La bandera de SMS no se enciende en `migracion-astro` hasta mergear 3b-2.**
- **El CI de GitHub Actions tiene que quedar en verde en el PR.** El merge lo hace un humano.
