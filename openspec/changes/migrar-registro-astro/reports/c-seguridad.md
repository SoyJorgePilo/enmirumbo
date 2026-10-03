# Etapa C · seguridad — migrar-registro-astro (T-024, Fase 3b-1)

**Veredicto: PASA al validador.** 0 críticos, 0 altos, 2 medios (misma causa raíz, nueva en 3b-1) y 6 observaciones. Recomiendo que el dev corrija M1/M2 en este change. Las dos dependen de una sola decisión y son baratas. Ninguna bloquea según la regla de la etapa, pero M2 sube a **ALTO** si el preview muestra que Vercel deja pasar un cuerpo *chunked* de más de 4.5 MB.

Lo probé contra la salida construida (emulador, peticiones crudas y la función llamada directamente) con un PostgreSQL 16 real desechable (`t024b1seg`/`t024b1segx`) y con `prisma dev t024b1cseg`. Los dos ya están detenidos.

## Hallazgos

### Medio

**M1 · Un multipart malformado a `/registro?_action=registrar` corta la respuesta después de mandar las cabeceras** (`node_modules/@astrojs/react/dist/server.js:106-113`, alcanzado desde `src/astro/acciones.ts:176`)
- **Cómo se explota:** se manda un `POST /registro?_action=registrar` con `Origin` propio y una parte `Content-Disposition: form-data` sin `name`, o con un multipart truncado.
- **Qué pasa:**
  - la Action lo traduce bien (`UNSUPPORTED_MEDIA_TYPE` → `repintar`);
  - después, el renderizador de React de Astro (`getFormState`) vuelve a leer el cuerpo con `request.clone().formData()` en cada componente React de la página, y undici lanza;
  - sale `200` con las cuatro cabeceras y luego el cuerpo se rompe (`TypeError: Failed to parse body as FormData`, con la traza en el log).
- **Lo mismo** en `POST /500?_action=registrar`, la pasada de O1.
- **Por qué cuenta:** incumple el ADDED "cualquier otra falla de Astro antes del manejador… 200 con el formulario y 'No pudimos guardar tu registro…'". En el emulador, esa sola petición **tumba el proceso** (`scripts/servir-salida-vercel.mjs:124` escribe la cabecera dos veces).
- **En Vercel no se sabe aún** si el error del stream solo corta esa respuesta o derriba la instancia, con las demás peticiones en vuelo (Fluid). **Hay que medirlo en el preview (tarea 19).**
- **No filtra datos.** 3a no lo tenía porque reportar responde 303 sin pintar página.
- **Prueba:** `it.fails("[c-seguridad M1 3b-1] …")` en `tests/registro-astro-seguridad-adversarial.test.ts`. Comprobé que falla por la razón correcta (`fetch failed: other side closed`).

**M2 · El tope de 6 MiB se salta sin `Content-Length`, y el cuerpo se vuelve a leer en cada componente React** (misma causa que M1)
- **Qué pasa:**
  - con `Transfer-Encoding: chunked`, Astro corta en 6 MiB (`CONTENT_TOO_LARGE` → `repintar`), pero `getFormState` vuelve a leer **todo** el cuerpo sin límite;
  - medido en el emulador: con 200 MB *chunked* contra `/registro?_action=registrar`, la memoria residente pico pasa de 336 a **2286 MB**, y la respuesta es el 200 "Esa foto pesa más de 5 MB" (la prueba "cuerpo desmedido sin Content-Length" del dev pasa por eso);
  - con cuerpo válido, cada error vuelve a leer el multipart **8 veces más** (1 de la Action + 8 de React, contadas con una traza de `Request.prototype.formData`). Es una amplificación ×9 de CPU y memoria frente a Next, que lo lee una vez.
- **En producción lo mitiga** el tope de 4.5 MB de la plataforma (≤ ~40 MB por envío), pero la defensa propia de 3a deja de valer en esta ruta.
- **Propuesta para el dev, sin implementar:** que el POST re-pintado no llegue al renderizador de React con `actionResult` y cuerpo multipart. Dos caminos:
  - el estado en un `locals` propio, sin `_actionPayload`, si se comprueba que Astro no re-ejecuta la Action;
  - o `siguiente()` sobre una petición `GET` reescrita.

  En los dos casos hay que medir con la traza de arriba que el cuerpo se lee una sola vez y que M1 responde el formulario con el error general.

### Observaciones (sin severidad)

1. **Preexistente (`src/lib/registro/limite-ip.ts:183`, `procesar.ts:261`), igual en Next; en Vercel la plataforma escribe el `x-forwarded-for`.** Medido sobre la build:
   - **Llaves del cupo distintas para la misma IP:** `::ffff:203.0.113.60` frente a `203.0.113.60`, IPv6 no canónica (`2001:db8:0:0:0:0:0:1`) frente a `2001:db8::1`, y `[v4]:puerto` o `[v6]:puerto`, que no dan llave.
   - **El cupo no es atómico:** 12 envíos a la vez desde una IP dejan **7 altas** con un cupo de 3. Ya está declarado en proposal.md.
2. **Guardián más laxo de lo que parece** (`tests/registro-pagina.test.ts:61` y `:559`):
   - el filtro `esLaMejoraProgresiva` acepta cualquier número de `<script src>` propios de `/registro`;
   - lo compensa `analitica-privacidad`, que exige uno o ninguno (mi mutación con un segundo `<script>` lo hace fallar), junto con la prueba de la build "un solo `<script>`";
   - sugiero acotarlo a ≤1 también ahí.
3. **`tests/registro-mejora-dom.test.ts`:** happy-dom, a diferencia de un navegador, pide las `<link>` de un documento de `DOMParser`. En una máquina con algo escuchando en `:3000`, la prueba le pega a ese servidor: lo vi con `GET http://localhost:3000/_astro/DocumentoBase…css`. En mi archivo quito las `<link>` de la respuesta.
4. **`package-lock.json`:** `ws@8.22.0` queda marcado como **no-dev**, porque cumple el peer opcional de `@vercel/functions`. No viaja en `_render.func` (verificado) y no tiene avisos.
   - **`npm audit`:** 1 moderada y 5 altas, las mismas de antes (`prisma`, `@prisma/config`, `brace-expansion`, `deepmerge-ts`, `fast-uri`, `mysql2`).
   - **Paquetes nuevos:** ninguno tiene `hasInstallScript`.
5. **Para 3b-2:**
   - con JS, el módulo sigue el 303 con `fetch` y pide `GET /registro/verificar` antes del `location.assign`, así que ese GET tiene que seguir sin efectos;
   - con la bandera encendida antes de 3b-2, el dueño registrado vería "No pudimos guardar tu registro…" (404), y su reintento daría "número ya registrado". Confirma que la bandera no se enciende (`docs/despliegue.md`).
6. **Sin tiempo de espera en el `fetch` del módulo** (`src/astro/registro-cliente.ts:187`): si la red se cuelga, el botón queda en "Enviando..." hasta que el navegador desista, igual que un envío nativo. Es UX, no seguridad.

## Verificado sin hallazgo (sobre la build salvo que se diga)

- **Foto:** todos estos casos responden `noEsImagen` o `errorProcesamiento`, sin ficha, sin archivos y sin 500:
  - polyglot GIF/JS, GIF de verdad, SVG con `<script>` declarado como JPEG, PDF, HTML como PNG, una cabecera PNG sola y un JPEG truncado;
  - un PNG válido con MIME `text/html` y extensión `.html` **sí pasa**, porque se decide por contenido.
- **Metadatos:** un WebP con EXIF (GPS), XMP e ICC, un JPEG CMYK con EXIF y un PNG de 16 bits dan variantes WebP sin `exif`/`xmp`/`icc`, y sin las cadenas `MarcaFicticia` ni `GPSLatitude` en los bytes.
- **Nombres de archivo** con traversal (`../../`, `..\`), NUL, RTL más emoji o 5000 caracteres: la clave la genera el servidor (`^[0-9a-f]{32}$`), salen solo las 2 variantes y no se escribe nada fuera de `FOTOS_DIR`.
- **Semáforo vigente en la función de Astro** (ALTO histórico): 8 PNG válidos de **38.9 MP** (125 KB cada uno) a la vez dan **2 aceptados y 6 con "Estamos recibiendo muchas fotos…"**, con pico de 322 MB residentes y sin 500 ni huérfanos. Una sola instancia del módulo en el bundle. Uno de 40.2 MP da `noEsImagen`; una tira de 30000×1300 pasa.
- **`sharp`** viaja en `_render.func/node_modules` (`sharp` y `@img/sharp-*`). El binario de Linux lo confirma el preview.
- **Multipart:**
  - con campos duplicados manda el primero;
  - `estado`, `origen`, una `avisoVersion=0` repetida, `__proto__` y `constructor` se ignoran: la ficha queda `en_revision`/`organico` con la versión vigente y sin contaminar prototipos;
  - JSON, `text/plain` y XML responden 200 con el formulario y el error general, sin escribir;
  - un archivo en `whatsapp` o texto en `foto` no tumba nada;
  - 100 000 campos responden 200 en ~1.6 s.
- **XSS:**
  - `"><script>`, `<img onerror>` y `<form id=categoriaId>` en los campos de texto vuelven escapados, con un solo `<form>`, sin eco en cabeceras y sin `Set-Cookie`;
  - `javascript:` en Facebook se rechaza;
  - `getFormState` no pinta `data-action-result` aunque se mande `$ACTION_KEY`, porque no hay isla.
- **Cupo:** rotar `x-real-ip`, `x-vercel-forwarded-for` o el primer valor de `x-forwarded-for` no da más cupo, y tampoco escribir la misma IP con puerto, con corchetes o con espacios. El agotado no impide reportar (prueba del dev).
- **Regla de origen y candado:**
  - `null`, `https://evil.example`, `<host>.evil.example` y un `Origin` vacío responden 403 sin ficha. Sin `Origin` procede (decisión de 3a).
  - Sin ficha y sin 303: `/REGISTRO`, `/registro/gracias`, `/404?_action=registrar`, `?_action=REGISTRAR`, `registrar%00`, `__proto__`, `?_action=reportar` desde `/registro` y `/_actions/registrar/`.
  - `/registro/?_action=registrar` (barra final) corre como `/registro`.
  - Con `?_action=registrar&_action=reportar` gana el primero, igual que en 3a.
  - `GET ?_action=registrar` solo pinta el formulario vacío.
- **Módulo de cliente** (leído en `/_astro/registro-cliente.*.js` y en el arranque de 1768 B):
  - un solo `fetch`, a `form.action`;
  - navega solo a las dos rutas fijas (el `pathname` se compara contra la lista; ni consulta ni destino de la respuesta);
  - reemplaza con `DOMParser` + `importNode` solo el `<form>` que contiene `#categoriaId`; los `<script>` de un documento de `DOMParser` quedan inertes;
  - nada de `innerHTML`, almacenamiento, `history` ni medición;
  - el formulario es del mismo origen y React escapa el contenido, así que no hay clobbering explotable;
  - CSP: `import()` y el arranque son `'self'`, y `connect-src 'self'` cubre el `fetch`.
- **Cookie de paso y bandera:**
  - las pruebas del dev cubren `HttpOnly`, `SameSite=Lax`, `Path`, `Max-Age=900`, `Secure` y el valor sin el número;
  - el Twilio falso lanza ante cualquier host que no sea `verify.twilio.com` y no aparece en `src/` ni en la build.
  - **`src/lib/verificacion/acciones.ts`:** cada `notFound()`/`redirect()` pasó a `return` con el mismo destino y en el mismo orden. Los envoltorios de Next lo traducen igual, y `obedecerDestino` conserva las aserciones de `verificacion-*`.
- **Logs:** en todo mi tráfico no apareció ni una IP, ni un número, ni un nombre ni lo capturado (solo `[registro]` genéricos). La URL sin JS solo lleva `?_action=registrar`.
- **Alcance:**
  - `src/lib/`: solo `verificacion/acciones.ts`;
  - `src/app/`: los 3 envoltorios;
  - `src/components/registro/`: 2 cambiados y 3 nuevos;
  - sin diff en `vercel.json`, `prisma/`, `next.config.ts`, `openspec/specs/`, `spikes/`, `astro.config.mjs` ni `.env.example`;
  - fixtures `next-3b` con `enmirumbo.example` y WhatsApp `77199981xx`; sin secretos.

## Guardianes ajustados y mutaciones (todas revertidas)

- **Revisé el `git diff` de `tests/`:** ninguno pierde aserciones y los 404 sustituidos conservan su lugar (`/registro/verificar`). La única holgura es la de la observación 2.
- **Mis mutaciones:**
  1. que el módulo navegue a cualquier ruta del mismo origen: fallan 2 (`mejora-progresiva` y `mejora-dom` con `/negocios`);
  2. un segundo `<script>` en `/registro` y otro en gracias: fallan 2 de `analitica-privacidad`;
  3. quitar la auto-comprobación de ruta de `registrar` (`src/astro/registro.ts:67`): falla `registrar-accion`;
  4. quitar el candado de doble envío y el filtro de `evento.target`: fallan 3, dos de ellas mías.

## Scenarios sin prueba

- **Ninguno automatizable sin prueba.** El mapa de b-dev está completo.
- **Hueco que cerré:** "cualquier otra falla de Astro antes del manejador" solo tenía la prueba unitaria y el `text/plain` del DOM sobre la build. Agregué JSON, `text/plain` y XML sobre la build, y el multipart malformado como `it.fails` (M1).
- **Las tareas 4–6** cubren sus scenarios, y las mutaciones confirman que detectan.
- **"La medición no cuenta los errores"** sigue siendo humano (tarea 19).

## Pruebas adversariales añadidas

- **`tests/registro-astro-seguridad-adversarial.test.ts`** (sobre la build): **12 pasan y 1 es expected fail** ([c-seguridad M1 3b-1]). Cubre:
  - fotos por contenido, JPEG truncado, nombres hostiles, metadatos (WebP EXIF/XMP/ICC y CMYK) y 8 fotos de 38.9 MP más una de 40.2 MP;
  - duplicados y `__proto__`, y cuerpos que no son formulario;
  - el multipart malformado (M1);
  - XSS al repintar;
  - la llave del cupo;
  - rutas y nombres raros, `GET ?_action` y orígenes ajenos.
- **`tests/registro-mejora-dom-adversarial.test.ts`** (happy-dom, HTML real de la build): **6 pasan**. Cubre:
  - el doble envío (`submit` ×2 y `click`);
  - el `submit` de otro formulario, que no se intercepta;
  - el `<form>` señuelo de otra dirección en la respuesta;
  - gracias desde otro esquema, otro puerto u otro subdominio.

## Compuertas

- **`npm test`:**
  - PostgreSQL 16 real: 160 archivos, **4255 pasan y 3 expected fail** (`[M1]` de 2b, `[c-seguridad M1]` de 3a y `[c-seguridad M1 3b-1]`), 0 saltadas, la carrera incluida;
  - `prisma dev t024b1cseg`: 4251 pasan, 3 expected fail y 4 saltadas (las de concurrencia).
  - Al final: 0 negocios y 0 reportes en la base.
- **`npm run lint`:** 0. **`npm run build`:** Complete.
- Sin commits. Clúster, `prisma dev` y emuladores detenidos.
