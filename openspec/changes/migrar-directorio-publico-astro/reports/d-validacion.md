# Etapa D · validación — migrar-directorio-publico-astro (T-023, Fase 2b)

**Veredicto (re-validación): APROBADO.** A1 está resuelto; el PR #33 sale de borrador solo con el CI de GitHub Actions en verde.
Crítico 0 · Alto 0 (A1 resuelto) · Medio 1 (preexistente en `main`, fuera de alcance) · Bajo 5.

**A1 (resuelto).** `plataforma-astro-build` y `-directorio` dejaban los 12 demo en la base compartida y rompían `admin-reportes-paginas:235` e `iteracion2-seguridad-adversarial:425` en el CI.
- **Arreglo:** `tests/limpieza.ts` (`borrarNegociosSembrados`, `WHATSAPP_DEMO`) en los `afterAll` de `-build`, `-directorio`, `-despublicado` y `directorio-astro-seguridad-adversarial`.
- **`git diff d138f78`:** solo esos 4 tests + `limpieza.ts` + b-dev/d-validacion/ticket. Ninguna aserción tocada: solo cambian imports y `afterAll`.
- **Seguro:** borra por `whatsapp IN (...)` con números ficticios (`7719995001-012` del seed demo, `77199963xx`, `77199968xx`, `7719996401`) en el esquema de pruebas, y las fotos en `FOTOS_DIR=./.fotos-test`. No alcanza datos que no sean de las pruebas.
- **Repro propia** (base nueva `reval023c`, sequencer fijo en una config temporal, ya borrada):
  - `-build` → `admin-reportes-paginas` → `iteracion2…`: 3/3 archivos, 91/91; quedan 0 negocios y 0 fotos.
  - `-directorio` → los mismos dos: 3/3, 83/83; 0 negocios y 0 fotos.
  - **Control** con `-build` y `-directorio` sin el arreglo (`git stash`): fallan :235 y :425 en las dos variantes. La repro sí detecta el hallazgo.

Lo verifiqué todo yo desde cero, sin fiarme de b-dev ni de c-seguridad: bases propias `prisma dev` (`compuerta023b` para la suite y `espejo023b` para la paridad), un worktree de `main` con su propio `npm ci` y tres builds de Next y tres de Astro (A, B y C). Etapa A saltada: no hay pantallas nuevas.

## Compuertas (corridas por mí)

| Compuerta | Resultado |
|---|---|
| `npm run lint` | exit 0 |
| `npm run typecheck` | 0 errores, 0 warnings (9 hints) |
| `npm run build` con `DATABASE_URL` a `127.0.0.1:1` y sin `SITIO_URL` | Complete |
| `npm test` (re-validación, base `reval023c`) | 1ª: 125/126, falla solo `reportes-seguridad-adversarial` [A2]; 2ª: **126/126; 3497 pasan, 3 expected fail, 2 saltadas**, y quedan 0 negocios y 0 fotos |

- Re-validación: lint exit 0, typecheck 0 errores, build sin `DATABASE_URL` exit 0.
- [A2] es la carrera de cupo conocida contra PGlite: sola falló 1 de 4 corridas. El diff de 2b en ese archivo solo cambia el render de la ficha y no toca la carrera. En el CI corre contra `postgres:17`.
- Los 3 `it.fails` son los declarados: `[brecha conocida T-024]` (2a), `[T-024] POST sin Origin` y `[M1]`. No hay `skip` nuevos.

## Diff de HTML contra Next de `main` (worktree propio, base sembrada)

- **Base:** `db:seed` + `db:seed:demo`. Encima, con datos ficticios:
  - foto para el negocio en revisión y para el rechazado;
  - un despublicado con foto;
  - un publicado con foto que después borré, dejando los archivos en el almacén.
- **Entorno de las dos versiones:** `next start` y `servir-salida-vercel.mjs` en `NODE_ENV=production`, con un Storage **falso** propio en HTTPS local (certificado autofirmado, llave ficticia, no se versiona).
- **A** (`SITIO_URL`): **Cero diferencias en 74 rutas**, exit 0.
- **B** (A + `NEXT_PUBLIC_UMAMI_*`): **Cero diferencias en 74 rutas**, exit 0. El script del proveedor sale en las 200 de las dos versiones.
- **C** (producción sin `SITIO_URL`): **Cero diferencias en 47 rutas**, exit 0. Ninguna página trae `localhost`.
- **Normalizaciones:** en las tres variantes salen solo las 3 de `NORMALIZACIONES_404_DINAMICA`, 11 aplicaciones cada una, y solo en las 9 URLs de 404 dinámica del §7 más `/negocio` y `/api`. Esas dos se miden: Next las resuelve con `notFound()` de `[destino]` y el script lo imprime. **Lo acepto:** es el mismo mecanismo, se mide y no se supone, y la salida lo declara.

## Verificaciones propias (a)–(d), sobre la salida real con el emulador

**(a) Fotos.** Pedí `tarjeta` y `ficha` de cada clave a Next y a Astro.
- **Publicada:** 200 en las dos, con el mismo sha256 (`6e9d004d…` y `65e240f4…`), los mismos bytes, `image/webp` y `private, max-age=3600`.
- **En revisión, rechazada, despublicada, inventada, y borrada con los archivos aún en el almacén** (antes de borrarla daba 200 con el mismo hash en las dos): 404 de 0 bytes, `no-store`, sin `Content-Type`.
- **Nunca** sale `Location` ni el host o la ruta `storage/v1` del almacén, en cabeceras ni en el cuerpo. Las cuatro cabeceras salen en todos los casos.

**(b) Indistinguibilidad.** Comparé 10 URLs:
- una ficha en revisión con su nombre en la URL, una rechazada, una despublicada, una borrada, un id inexistente, `sin-identificador` y `-`;
- `/loquesea`, `/plomeria-colonia-inventada` y `/no-existe`.

Las diez responden 404 con **el mismo sha256 del cuerpo** y las mismas cabeceras salvo `Date`. Ningún cuerpo trae el nombre, el id ni el slug.

**(c) Sin medición en ninguna 404 (variante B).** Ninguna de estas respuestas trae `umami` ni `<script>`:
- 404 dinámicas: `/loquesea`, `/no-existe`, el compuesto, la ficha en revisión, `/negocio`, `/api`, `/registro` y `/negocio/<…>/reportar`;
- 404 global: `/a/b/c`, `/api/foto` y `/404/`;
- `/404` (200), `/500` y el 500 de M1;
- la foto 404.

**(d) Cuatro cabeceras y ninguna cabecera del marco** en:
- **dinámicas:** listado, giro, giro+colonia, ficha y `/buscar?q=plomero`, con `private, no-cache…`;
- **404 dinámica:** `/loquesea` y la ficha en revisión, con `Cache-Control` dinámico;
- **404 global** (`/a/b/c`) y **500** (`/500` y M1);
- `/opengraph-image`, `/opengraph-image/`, `/404` y `/404/`;
- **fotos:** la 200 (`private, max-age=3600`) y las 404 (`no-store`).

## Escrutinio de guardianes y pruebas (`git diff HEAD -- tests/`)

- **Conteo de `expect(`:** en los 35 archivos modificados es igual o mayor. No hay `skip`, `only` ni `todo` nuevos, y no se quitó ningún `it.fails`.
- **Aserciones que desaparecen:** revisé las 14 líneas `expect` quitadas sin una equivalente. Todas son el `digest` `NEXT_HTTP_ERROR_FALLBACK;404` de Next, y ahora se exige `status 404` más un documento idéntico byte a byte o que contenga "No encontramos esta página", que es **más estricto**. Las del título estático de `/buscar` se re-apuntan a `METADATOS_BUSCAR`, con una regex equivalente y `generateMetadata` vigilado en el módulo y en la página.
- **`plataforma-astro-build` (`_image`):** cambia `/ruta-que-no-existe` por `/ruta/que/no-existe` y **suma** `status 404`. Lo acepto: un solo segmento ahora es `[destino]`, que necesita la base.
- **`astro-cabeceras-cdn` y `cabeceras-en-la-cdn.ts`:** se agregan rutas solo para `^/<estático sin extensión>/$` y `^/404/?$`. La prueba de "no alcanza rutas de la función" sigue intacta, y se suma la de `/favicon.ico/` → `{}`. No queda más laxo.
- **`analitica-exclusion-admin`:** la lista exacta suma `NoEncontradoDinamico` y el recorrido ahora incluye `src/astro/`, con un fixture sin motivo que reprueba. Es más estricto.
- **`directorio-consultas`:** "404" y "500" pasan a exigirse como reservados, con mutación de catálogo, y se conserva la vigilancia sobre el catálogo.
- **Metadatos en `src/astro/metadatos-directorio.ts`:** el guardián de `despliegue` **no se tocó** (ningún archivo de despliegue en el diff). Mover los metadatos ahí fue la forma correcta de cumplirlo.
- **Imports de Next:** el `grep` de imports de `src/app/(publico)/[destino]`, `negocio/[ficha]/page`, `buscar` y `api/foto` en `tests/` sale vacío.

## ¿Pueden las normalizaciones del diff ocultar una fuga?

Lo probé con mutaciones sobre la 404 de una ficha en revisión servida por Astro.

**El diff SÍ reporta:**
- el nombre en `<main>`;
- el id en `<title>`;
- un `<meta>` de más;
- el id en un `href`;
- el script del proveedor.

**El diff NO ve:**
- una clase extra en `<html>` (la normalización 3 ignora `class` completo);
- un `<link rel=stylesheet>` cualquiera (la 2 quita todos, no solo `/_astro/*.css`);
- el texto fuera de los landmarks y los comentarios (límite general del diff desde 2a).

**Conclusión: no bloquea.** La fuga queda cerrada por estructura y por pruebas que no dependen del diff:
- `NoEncontradoDinamico` no tiene props ni lee `Astro.params`, `Astro.url` ni `Astro.request`, y la prueba lo fija;
- `plataforma-astro-404-dinamica` exige cuerpos idénticos byte a byte y una lista de datos prohibidos;
- mi verificación (b) confirma lo mismo sobre la salida real (ver el bajo B1).

## Desviaciones decididas

1. **`?colonia=` repetida: ACEPTADA.** Next de `main` no filtra con un valor repetido (lo medí: 200 y listado completo) y `directorio-adversarial` ya lo fijaba. La letra "se usa el primer valor" de la spec (requirement de páginas) y la del design §4 **se corrigen al archivar**.
2. **`/404` responde 200 en el emulador (Next: 404): ACEPTADA.** Trae la página en español con `noindex`, las cuatro cabeceras, sin script y sin datos. Queda en el checklist del preview (tarea 19). Lo mismo para `/500`, que responde 500 (Next: 404 dinámica), y para `/404/` y `/opengraph-image/`, que responden 404 (Next: 308; la barra final va a T-027).
3. **`/registro` responde la 404 dinámica**, no la prerenderizada de 2a. El estado y la página son iguales, y solo cambia el `Cache-Control` dinámico. Llega a la Fase 3.

## Hallazgos

**Medio**
- **M1 (c-seguridad):** `?colonia=%00` responde 500 (`src/astro/directorio.ts:73-75` → `src/lib/directorio.ts:149-156`). Es **preexistente en `main`**: lo medí y Next también responde 500. No se arregla aquí, queda fijado con `it.fails` y es candidato a `/rapido` en `main`.

**Bajos**
- **B1** `scripts/diff-html/nucleo.mjs:264-271`: las normalizaciones 2 y 3 son más anchas de lo necesario. Conviene filtrar solo `/_astro/*.css` y comparar `lang` y `class` contra `es-MX` y `h-full antialiased`.
- **B2** `src/layouts/DocumentoBase.astro:62`: `etiquetas.slice(0, 2)` supone que `charset` y `viewport` van primero. Es frágil, aunque hoy se cumple.
- **B3** `scripts/diff-html.mjs` (`anonimizar`): no sustituye `fotoRechazada`. Hoy no sale en ningún fixture.
- **B4** `/500` responde 500 y `/404` responde 200, contra 404 en Next (ver desviación 2).
- **B5** `servir-salida-vercel.mjs` escucha en todas las interfaces (heredado de 2a).

**Candidatos a ticket o `/rapido` para `main` (no se arreglan en este PR):**
- M1 (`?colonia=%00` → 500);
- la marca repetida en los títulos ("… — EnMiRumbo — EnMiRumbo", en legales y en `/buscar`);
- `src/lib/tareas/secreto.ts` importa `next/navigation` (T-027);
- la 404 dinámica de Next tiene el `<body>` vacío sin JS;
- el middleware no pisa cabeceras ya presentes (revisar en T-024 y T-027).

## Alcance, rutas prohibidas, secretos

- **Rutas prohibidas:**
  - en `src/lib/` solo cambia `rutas-reservadas.ts` (+1 línea);
  - `git diff` y `git status` salen vacíos en `src/app`, `src/components`, `vercel.json`, `prisma/`, `openspec/specs`, `spikes/`, `next.config.ts` y `package*.json`.
- **Sin scope creep:**
  - la precarga en `DocumentoBase` y `TroncoPublico` es la tarea 6;
  - las rutas de la CDN son el requirement de cabeceras;
  - `ALL`/`HEAD` en el endpoint de fotos es paridad medida (`POST` 405 y `OPTIONS` 204 iguales a Next);
  - no hay dependencias nuevas.
- **Secretos y datos personales:**
  - no hay secretos;
  - los teléfonos son de las series ficticias `771999xxxx`, más uno `7717775006` que solo aparece en una aserción `not.toMatch`;
  - los fixtures usan `enmirumbo.example` con `<id>` y `<clave>` anonimizados.
- **Código y UI:** sin `any` en el código nuevo, y la UI sigue en español mexicano.
- **tasks.md:** las tareas 1–18 están `[x]` y las verifiqué por muestreo (6, 7, 9, 12, 13, 14 y 16). La 19 (preview) y la 20 (PR) quedan para el humano o el PR.

## Pendiente humano

- **Preview de Vercel (tarea 19):**
  - revisar con `curl` las cuatro cabeceras y el `Cache-Control` en un listado, una ficha, `/loquesea` (que se vea con JS apagado), una ficha no publicada, una foto 200 y una foto 404;
  - revisar `/opengraph-image/`, `/404` y `/500`;
  - correr Lighthouse móvil en el listado y en la ficha.
- **CI:** el de GitHub Actions tiene que quedar en verde en el PR, porque esta validación local no lo sustituye. El PR sale de borrador solo con el CI en verde. El merge lo hace un humano.
- **Vercel:** el check falla también en #31 y #32, y no lo causa este PR. El preview de la tarea 19 está bloqueado hasta resolverlo.
