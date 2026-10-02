# Etapa D · validación — migrar-formularios-publicos-astro (T-024, Fase 3a)

**Veredicto: APROBADO.** 0 bloqueantes. 1 hallazgo bajo nuevo (O1), no bloquea; candidato para 3b. El PR va directo a `migracion-astro`. T-024 pasa a `en-review` y no a `hecho`, porque falta 3b.

Todo lo verifiqué yo desde un árbol limpio (`.vercel`, `dist` y `.astro` borrados), con bases propias: `prisma dev` `t024valida` para la suite y `t024vespejo` para la paridad, más un PostgreSQL 16 real desechable. Next de `origin/main` (`8d514f5`) sale de `git archive`, con su propio `npm ci`. Fusión: `origin/migracion-astro` sigue en `44dd0e3`, así que no hubo nada que fusionar.

## Compuertas

- `npm run lint`: exit 0.
- `npm run typecheck`: 424 archivos, 0 errores.
- `npm run build` con `DATABASE_URL` a `127.0.0.1:1` y sin `SITIO_URL`: Complete. El manifiesto trae `checkOrigin:false` y `actionBodySizeLimit:6291456`.
- `npm test` contra `prisma dev`:
  - en el orden con caché: 149 archivos, 4102 pasan, 2 expected fail y 3 saltadas;
  - **en el orden del CI** (sin caché de resultados): el mismo resultado.
- `npm test` contra **PostgreSQL 16 real**, en el orden del CI: 149 archivos, **4105 pasan, 2 expected fail y 0 saltadas**. Corrió la concurrencia sobre la build (14 → 10 y 8 → 3).
- Los dos expected fail son los declarados, `[M1]` (2b) y `[c-seguridad M1]`. No hay `skip`, `only` ni `todo` nuevos.

## Lección A1: datos que quedan en la base compartida

- Al terminar las tres corridas completas, `public` queda con **0 negocios, 0 reportes y 0 fotos en la base**. Lo mismo pasa con cada archivo nuevo o re-apuntado corrido solo (8 archivos, 0/0 y 0 archivos de foto).
- Observación preexistente, no de este change: 19 archivos viejos dejan el `.webp` del negocio demo en `.fotos-test` (por ejemplo `directorio-paginas` y `seo-*`). Ninguno es nuevo y ninguno pierde su limpieza aquí.

## Diff de HTML contra Next de `main` (2a + 2b + 3a juntas)

- **Base:** `db:seed` + `db:seed:demo`. Encima, con datos ficticios: fotos para la ficha en revisión y la rechazada, una despublicada con foto y 10 reportes pendientes en otra ficha (el tope).
- **Entorno:** `next start` y `servir-salida-vercel.mjs` en producción, con un Storage falso en HTTPS local.
- **Resultados:**
  - **A** (`SITIO_URL`): cero diferencias en 89 rutas, exit 0.
  - **B** (A + medición): cero diferencias en 89 rutas, exit 0.
  - **C** (producción sin `SITIO_URL`): cero diferencias en 62 rutas, exit 0.
- **Normalizaciones:** solo las tres de 2b (16 URLs de 404 dinámica) y las dos de `NORMALIZACIONES_FORMULARIO` (las 7 páginas del formulario). Las dos están impresas y son estrechas: un oculto de más, otra ruta u otro método salen como diferencia (`tests/diff-html.test.ts`).
- **Envíos del arnés:** éxito, sin motivo, 301 caracteres, honeypot, tope y sin `Origin` dan igual. Lo único aceptado es el origen ajeno o `null` (Next 500, Astro 403).
- **Medición en B:** la llevan el formulario y la confirmación. No la llevan el 403 ni la 404.

## Arnés y cabeceras sobre la salida construida (variantes A y C)

| Caso | Resultado |
|---|---|
| válido / sin `Origin` | 303 → `/…/reportar/gracias` y borrador borrado (`Max-Age=0`, `HttpOnly`, `Secure`, `SameSite`, `Path`); `CACHE_DE_ACCION` |
| inválido | 303 → `?error=motivo`, con borrador y sin el comentario en el `Location` |
| honeypot | el mismo 303 que el válido y sin fila |
| ficha no publicada (POST) | 404, el mismo cuerpo que por GET y que `/loquesea`, sin `Set-Cookie` |
| `Origin` ajeno, `null` y malformado | 403 con tres cuerpos idénticos; texto aprobado, `noindex`, 0 `<script>`, sin eco, sin "Cross-site" ni "Forbidden" |
| 7 MiB con y sin `Content-Length` | 303 → `?error=servidor`, sin cookie y sin fila |
| `POST /?_action=reportar` y `/negocio/<seg>?_action=` | 404, idéntico a `/loquesea` **y** a `/a/b/c` |
| `/_actions/reportar` (formulario y JSON) y `/_actions/inventada` | la 404 de la CDN, byte a byte igual a `/a/b/c` |

- **Base de datos:** solo escribieron los dos envíos válidos.
- **Las cuatro cabeceras más `strict-origin-when-cross-origin`, sin `X-Powered-By`,** en el 200 del formulario y de la confirmación, los 303, el 403, la 404 por GET y por POST, y el 500 (formulario con la base caída: "Algo falló de nuestro lado", `Cache-Control` dinámico).
- **Cupo:** con `REGISTRO_ENCABEZADO_IP=x-forwarded-for`, rotar el primer valor y `x-real-ip` agota el cupo en el cuarto envío (3 filas).
- **IP:** `clientAddress` no aparece en `src/`. La llave del cupo sale de `ipDeEncabezados(contexto.request.headers)` (`src/astro/reportar.ts:161`).
- **Regla de origen:** `src/astro/origen.ts:27-45` coincide con `parseHostHeader` de Next. Usa el primer valor de `X-Forwarded-Host` con `trim`, cae a `Host` y no tiene lista de permitidos. Sin `Origin`, procede. Es más estricta en `null`, malformado y host vacío (403 en vez de 500 o de pasar).

## Escrutinio de pruebas (`git diff HEAD -- tests/`)

- **`expect(` por archivo, igual o mayor en los 13 modificados:**
  - `layout` 159→167, `plataforma-astro-build` 55→70, `diff-html` 49→59;
  - `reportes-seguridad-adversarial` 139→140, `astro-seguridad-adversarial` 39→40;
  - los demás, iguales.
- `grep` de imports de `src/app/(publico)/negocio/[ficha]/reportar` en `tests/`: vacío.
- **Revisé cada ajuste y ninguno queda más laxo:**
  - `compat-seguridad-adversarial`: el guardián es textual, pero se suma al conductual.
  - Contextos falsos del middleware: solo agregan `request` (GET), `locals` y `routePattern`.
  - Manifiesto: se lee `entry.mjs` más `chunks/`.
  - `layout`: resuelve `?_action` contra la ruta y fija el caso sin ruta. `EXCEPCIONES_FASE_3` queda en exactamente `/registro`.
  - `reportes-pagina`: las 3 de "basura" pasan de 404 a `?error=servidor`, conforme a design.md §6 y al scenario de la spec. Siguen exigiendo "sin fila".
  - `reportes-seguridad-adversarial`: el espía de `notFound` se sustituye por igualdad byte a byte, que es más estricta.
- **Mutaciones mías (todas revertidas):**
  1. **Quitar la llamada a `envioDeOtroOrigen` del middleware:** fallan 10 pruebas. Son 2 de `compat`, 7 de `astro-origen` y 1 de `astro-seguridad-adversarial`.
  2. **Quitar la auto-comprobación de ruta** (`src/astro/reportar.ts:146`): falla `reportar-accion` ("la Action comprueba su propia ruta").
  3. **Volver a meter `/negocio/<…>/reportar` en `EXCEPCIONES_FASE_3`:** fallan 2 pruebas de `layout`.

## Alcance y convenciones

- **Rutas prohibidas:**
  - `src/lib/` cambia una sola línea (`rutas-reservadas.ts:41`);
  - `src/components/` cambia solo `formulario-reporte.tsx` (tipo de `action` y `method`);
  - `src/app/`, `vercel.json`, `prisma/`, `openspec/specs/`, `spikes/`, `next.config.ts` y `package*.json` no tienen diff.
- **El pegamento de `src/astro/reportar.ts:118-183` es copia de `accion.ts`.** La única diferencia es que pasa `negocio.id` (ya validado) en vez del argumento ligado.
- **Datos:** sin secretos. Los WhatsApp son de la serie `771999xxxx` y los nombres, del seed ficticio.
- **Texto:** la UI nueva es solo el 403, con el texto aprobado. No hay `any`, no hay dependencias nuevas y todo el texto está en español.

## Hallazgos

**O1 · bajo, nuevo, no bloquea.** Un `POST …/reportar?_action=reportar` con la base caída responde 404 "No encontramos esta página", con las cuatro cabeceras y sin escribir. Debería responder el 500 "Algo falló de nuestro lado". La causa:

- `destinoTrasUnaFalla` vuelve a leer la base y lanza (`src/astro/acciones.ts:91`);
- Astro pinta `/500` pasando otra vez por el middleware con la misma petición `POST ?_action=`;
- la tabla la responde como "dirección inexistente" (`src/astro/acciones.ts:122-124`).

Next de `main` responde un 500 de 21 bytes, sin documento. No es un escenario de la spec y no filtra nada. Aun así, 3b lo hereda en el registro. **Propuesta para 3b:** en `atenderAcciones`, dejar pasar la pasada de la página de error (`routePattern === "/500"`) con `siguiente()`, y una prueba con la base caída.

## Decisiones encargadas

- **(a) Observación 1 de C:** lo medí sobre la build real. Cuando la build y la ejecución comparten `SITIO_URL`, como en Vercel, la Action pedida desde otra ruta es **byte a byte igual a `/a/b/c`** (variante A: true; C: true). La diferencia en `og:image`/`twitter:*` solo aparece si se construye sin `SITIO_URL` y se sirve con ella, que es como lo arma el emulador `conSitio` de las pruebas. **No hay que cambiar el código ni la referencia de la prueba.** Nota de archivado: precisar la letra como "igual que `/a/b/c` cuando la build y la ejecución comparten entorno (y siempre igual que `/loquesea`)".
- **(b) M1 de C** (`x-astro-locals` → `Forbidden` en inglés y sin cabeceras, desde la Fase 1, no explotable, `it.fails`): queda en el PR como candidato a ticket.
- **(c) La regla compara el host y no el esquema,** igual que Next. Se agrega a la tarea 19: confirmar `Strict-Transport-Security` en el dominio.

## Candidatos a ticket (van en el PR)

1. **M1:** `x-astro-locals` responde `Forbidden` sin cabeceras. La salida propuesta es una ruta `has: header` hacia `/404.html`.
2. **Vercel corta el cuerpo a 4.5 MB** con su propio 413, en inglés y sin cabeceras. Una foto de 4.5 a 5 MB no recibe "Esa foto pesa más de 5 MB" (preexistente en `main`).
3. **El middleware no pisa cabeceras ya presentes:** el 303 se arma mutable aquí, pero la regla general sigue abierta.
4. **La 404 dinámica de Next tiene el `<body>` vacío sin JS** (preexistente en `main`).
5. **O1** (arriba), para 3b.

## Pendiente humano (tarea 19, preview de Vercel)

- Con JS apagado, en Chrome y en Firefox: ficha → reportar → enviar sin motivo → corregir → enviar → recargar.
- Con `curl`: las cuatro cabeceras en el formulario, el 303, el 403 y la 404.
- `/_actions/reportar` responde la 404 de la CDN.
- Cuatro envíos con un `x-forwarded-for` falso: el cuarto agota el cupo.
- `Strict-Transport-Security` presente.
- **El CI de GitHub Actions tiene que quedar en verde en el PR.** El merge lo hace un humano.
