# Diseño: migrar-lectura-publica-astro

Este diseño cubre la Fase 2 completa. Las secciones marcadas **(2b)** dejan resueltas decisiones del siguiente change; aquí no se implementan.

## 0. Inventario: qué API de Next usa cada ruta

| Ruta (Next) | APIs de Next | Render hoy | En Astro |
|---|---|---|---|
| `app/layout.tsx` | `Metadata` (`metadataDelSitio`), `LayoutProps`, avisos de arranque en el tronco del módulo | — | `src/layouts/DocumentoBase.astro` + avisos en el tronco de `src/middleware.ts` (§5) |
| `app/(publico)/layout.tsx` | grupo de rutas, `LayoutProps` | — | `src/layouts/TroncoPublico.astro` (envuelve a `DocumentoBase` y agrega `ScriptAnalitica`) |
| `app/not-found.tsx` | `metadata` (OG explícito), `next/link`, convención `not-found` (+ `robots noindex` que Next inyecta solo) | estático | `src/pages/404.astro`, prerenderizada, solo con `DocumentoBase` |
| `(publico)/page.tsx` (home) | `force-dynamic`, `next/link` | por petición | `src/pages/index.astro` |
| `(publico)/aviso-de-privacidad`, `terminos` | `metadata` estático | estático | `.astro` con `prerender = true` |
| `app/robots.ts` | `MetadataRoute.Robots`, `force-dynamic` | por petición | `src/pages/robots.txt.ts` |
| `app/sitemap.ts` | `MetadataRoute.Sitemap`, `force-dynamic` | por petición | `src/pages/sitemap.xml.ts` |
| `app/opengraph-image.tsx` | `ImageResponse` de `next/og`, convención de archivo (`alt`, `size`, `contentType`) | estático (build) | `src/pages/opengraph-image.ts`, prerenderizado (§6) |
| **(2b)** `(publico)/[destino]/page.tsx` | `generateMetadata`, `notFound()`, `params`/`searchParams` (promesas), `force-dynamic` | por petición | `src/pages/[destino].astro` (§2) |
| **(2b)** `(publico)/negocio/[ficha]/page.tsx` | `generateMetadata`, `notFound()`, `next/link`, `<script type="application/ld+json">`, `force-dynamic` | por petición | `src/pages/negocio/[ficha].astro` |
| **(2b)** `(publico)/buscar/page.tsx` | `metadata` estático (título fijo, `noindex`), `searchParams` | por petición | `src/pages/buscar.astro` |
| **(2b)** `api/foto/[clave]/[variante]/route.ts` | `RouteContext`, `force-dynamic` | por petición | `src/pages/api/foto/[clave]/[variante].ts` (§8) |

No se usa `connection()`, `generateStaticParams`, `revalidate` ni `"use cache"`. Todo lo que lee la base usa `force-dynamic`. Lo estático lo es porque no lee nada por petición.

## 1. Layouts: documento base, tronco medido y 404 fuera del tronco

- `DocumentoBase.astro` reproduce `app/layout.tsx`: `<html lang="es-MX" class="h-full antialiased">`, `<body class="flex min-h-dvh flex-col …">`, `Header`, `<main class="mx-auto …">`, `Footer` y `globals.css` importado desde `src/app/` (design de T-022 §2). Recibe los metadatos de la página como prop y los resuelve (§3).
- `TroncoPublico.astro` envuelve `DocumentoBase` y pinta `ScriptAnalitica` al final del contenido, **en la misma posición del DOM que hoy**: dentro de `<main>`, después de la página, que es donde lo deja el layout del grupo. El diff lo confirma.
- **La exclusión de la medición sigue siendo estructural.** Toda página pública usa `TroncoPublico`. Lo que use `DocumentoBase` directo queda fuera y DEBE llevar arriba un comentario `// fuera de la medición: <motivo>`. La prueba de exclusión (hoy `tests/analitica-exclusion-admin.test.ts`, que mira `src/app/`) se extiende a `src/pages/`: falla si una página usa `DocumentoBase` sin motivo escrito, o si una exclusión declarada se queda sin páginas. En 2a la única excluida es `404.astro`, igual que hoy `app/not-found.tsx` vive fuera de `(publico)`.
- **404 fuera del grupo, con paridad exacta.**
  - Una URL que no casa con ninguna ruta la sirve `404.astro` (prerenderizada, sin medición), como hoy.
  - **(2b)** Las 404 que hoy resuelve `notFound()` *dentro* del grupo (`/loquesea`, `/negocio/inexistente`) hoy sí cargan la medición. En Astro, `[destino].astro` y `[ficha].astro` NO devuelven `new Response(null, {status: 404})`: eso Astro lo reencamina a `404.astro` (`core/routing/handler.js`, cuerpo nulo + 404) y perderían el script. En su lugar ponen `Astro.response.status = 404` y pintan el mismo componente `NoEncontrado` dentro de `TroncoPublico`. Así hay un solo marcado de la 404 y dos troncos, como hoy.

## 2. (2b) Enrutamiento de `/[destino]` y `/negocio/[ficha]`

- `src/pages/[destino].astro` llama a `resolverDestinoDeLaRaiz` (sin cambios) y pinta `ListadoCategoria` o `ListadoGiro`. Las rutas estáticas de Astro le ganan al parámetro, igual que en Next: `buscar.astro`, `terminos.astro`, `robots.txt.ts`, `sitemap.xml.ts`, `opengraph-image.ts` y `404.astro`.
- `src/lib/rutas-reservadas.ts` y su prueba (`tests/directorio-consultas.test.ts`) hoy derivan los nombres reservados de `src/app/`. Desde 2a también DEBEN mirar `src/pages/`, para que un slug del catálogo no quede tapado por una ruta de Astro.
- `params` llega decodificado en Astro. El identificador de ficha se sigue extrayendo con `extraerIdDeSegmentoFicha` (último guion) y `?colonia=` se lee con `Astro.url.searchParams.get` (primer valor, como hoy).

## 3. `generateMetadata` → metadatos resueltos en el servidor

- Las páginas siguen produciendo un objeto con la forma de `Metadata` usando las mismas funciones de `src/lib/seo/` (`metadataDelSitio`, `canonicaDe`, `imagenesDeLaFicha`, `NOINDEX_CON_ENLACES`, títulos). El import `type Metadata from "next"` de `src/lib/seo/metadata.ts` es solo de tipos y se queda hasta el corte.
- `src/astro/metadatos.ts` reproduce **la parte de la resolución de Next que este sitio usa**, sin generalizar:
  - fusión superficial por clave entre layout y página: un `openGraph` de la página reemplaza al del layout entero, que es por qué la ficha repite `siteName` y `locale`;
  - plantilla `%s — EnMiRumbo` para títulos de página y `title.default` cuando la página no declara título;
  - `alternates.canonical`, `robots` (`index,follow` / `noindex, follow`), `openGraph` y las etiquetas `og:image:*` de la convención de archivo (`width`, `height`, `type`, `alt`);
  - `<meta name="robots" content="noindex">` en toda respuesta 404, como hace Next (`node_modules/next/dist/docs/.../not-found.md`);
  - `<meta charset>` y `<meta name="viewport" content="width=device-width, initial-scale=1">`.
- La imagen heredada del layout lleva en Next un parámetro de versión (`/opengraph-image?<hash>`). Se conserva con un hash del PNG generado, para no perder el cambio de dirección que obliga a WhatsApp y Facebook a refrescar la vista previa. La imagen declarada a mano (`RUTA_IMAGEN_DE_MARCA`, en la 404 y la ficha) va sin parámetro, también como hoy.
- **Verdad = lo que emite la build de Next.** Las pruebas de `metadatos.ts` usan como expectativa etiquetas capturadas de la salida de Next para home, legales, 404 y, en 2b, giro vacío y ficha. El diff (§9) es la red final. El orden de las etiquetas no se exige; el conjunto sí.

## 4. Dinámico vs. prerender (`force-dynamic`/`connection()` → `prerender`)

- `output: 'server'`: todo es por petición salvo `export const prerender = true`. Ese valor llevan solo las rutas que hoy son estáticas: `aviso-de-privacidad`, `terminos`, `404` y `opengraph-image`.
- `despliegue` exige que el build no lea la base: una página prerenderizada que consultara la base haría fallar `astro build` en el CI, que construye sin base. Además, la prueba que hoy recorre `src/app/` buscando `force-dynamic` (`tests/despliegue.test.ts`) se extiende a `src/pages/`: ninguna ruta con `prerender = true` puede importar `@/lib/directorio`, `@/lib/prisma` ni `@/lib/fotos/*`.
- Las legales prerenderizadas incluyen la medición resuelta **al construir**, igual que hoy con Next.

## 5. Cabeceras: middleware + estáticas del adaptador + `Referrer-Policy`

- **Una sola fuente:** `cabecerasDeSeguridad()` de `src/lib/seguridad/csp.ts`, sin cambios.
- **Por función** (`src/middleware.ts`):
  - pone las cuatro cabeceras en toda respuesta que salga de la función (páginas, endpoints, 404 por función y redirecciones);
  - no agrega ninguna cabecera que delate el marco (Astro no pone `X-Powered-By`; se comprueba);
  - en las páginas HTML dinámicas pone el mismo `Cache-Control` que hoy manda Next para `force-dynamic` (`private, no-cache, no-store, max-age=0, must-revalidate`, confirmado con el diff). Los endpoints que ya fijan el suyo (`servirFoto` en 2b) lo conservan.
- **Por CDN** (`src/astro/integraciones/cabeceras-en-la-cdn.ts`): en `astro:build:done`, después del adaptador, agrega a `.vercel/output/config.json` rutas `{src, headers, continue: true}` con las cuatro cabeceras para cada ruta prerenderizada, para `/404` y para `/_astro/(.*)`. Es el patrón del spike (`spikes/astro/src/integraciones/cabeceras-en-la-cdn.ts`, costo 3a), con la misma salvedad: **solo un preview de Vercel confirma que Vercel las aplica**. Para `/opengraph-image` agrega además `Content-Type: image/png`, porque el archivo estático no tiene extensión.
- **`Referrer-Policy`:** la global es `strict-origin-when-cross-origin`. El middleware **solo pone una cabecera si la respuesta no la trae ya**. Así una ruta que declare una política más estricta (hoy el panel con `<meta>`; en Astro, `/admin` y `/editar` en fases 4 y 5, que además podrán ponerla por cabecera) no queda anulada por la global (`despliegue`, "Una pantalla que necesite una política de referente MÁS estricta…"). La integración de la CDN no toca rutas de función, así que no puede pisarla. La regla por prefijo para `/admin` y `/editar` no entra en 2a.
- **Brecha conocida:** el `403` de `checkOrigin` sale antes del middleware y sin cabeceras (ver `proposal.md`, Fuera de este change).

## 6. `next/og` → imagen de marca generada al construir

- **Decisión:** `src/pages/opengraph-image.ts` con `prerender = true`. En `GET`, que solo corre durante `astro build`, arma el mismo árbol de la imagen de hoy con `satori` (JSX → SVG) y lo pasa a PNG con `@resvg/resvg-js`. Mantiene 1200×630, los colores de `COLORES_MARCA` y los mismos textos y `alt`. La tipografía es la misma que trae `next/og`, **Geist Regular** (`node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf`, licencia SIL OFL), copiada al repo junto a su licencia. Así no depende de `next`, que se retira en el corte.
- **Por qué no un PNG binario en el repo:** el comentario de `opengraph-image.tsx` lo descartó porque nadie puede revisarlo en un diff. Generarlo desde código conserva eso.
- **Por qué al construir y no por petición:** la imagen no depende de nada de la petición. Sin render en tiempo de ejecución no hay función ni entrada del atacante que llegue al renderizador.
- **Advertencia RCE:** `next` 16.3.3 tiene un aviso crítico (GHSA-vcvr-r3jv-pc5j, RCE en `ImageResponse` de `next/og`, rango `>=16.2.0 <16.3.6`), señalado en c-seguridad de T-022. `next/og` usa `satori` y `resvg` por dentro. Antes de agregar las dependencias hay que leer el aviso y comprobar si la causa está en esas bibliotecas o en el envoltorio de Next, y fijar versiones no afectadas (`npm audit` limpio para las dos). Aun así, el render al construir con entrada constante cierra la superficie. Producción (`main`) sigue expuesta hasta que alguien suba `next`, y eso va por `/rapido` en `main`, no aquí.
- **Paridad:** no se exige igualdad de bytes con el PNG de Next. Se exige mismo tamaño, mismo tipo y mismos textos; el revisor compara las dos imágenes a ojo (tarea 9).

## 7. Analítica: exclusión y variables

- La exclusión queda resuelta en §1.
- **Variables:** `configuracionAnalitica()` lee `process.env.NEXT_PUBLIC_UMAMI_*` en el servidor. En Astro funciona igual, sin `import.meta.env` ni prefijo `PUBLIC_`, porque el script se pinta en el servidor y nunca hace falta exponerlo al bundle de cliente. Las prerenderizadas lo leen al construir y las dinámicas en tiempo de ejecución. En Vercel las variables quedan fijas por despliegue, así que "cambiarlas exige volver a desplegar" sigue siendo cierto. **No se renombran en 2a.**
- **Enmienda propuesta para el corte (T-027), no aplicada aquí:** en `layout-base`, requirements "La medición cookieless se carga solo si está configurada…" y "`.env.example` explica la analítica…", sustituir `NEXT_PUBLIC_UMAMI_SRC`/`NEXT_PUBLIC_UMAMI_WEBSITE_ID` por `UMAMI_SRC`/`UMAMI_WEBSITE_ID`. Se prefieren nombres neutros a `PUBLIC_*`: no van al cliente, y `PUBLIC_` invitaría a leerlas con `import.meta.env`, que las incrustaría en el bundle. Todo lo demás de los requirements queda igual. El renombre toca Vercel (producción y previews), `.env.example`, `docs/despliegue.md` y las dos lecturas literales de `src/lib/analitica/config.ts`.

## 8. (2b) Ruta de fotos con claves opacas

- `src/pages/api/foto/[clave]/[variante].ts` exporta `GET` y llama a `servirFoto` (sin cambios), que sigue siendo quien valida la clave y el estado `publicado`.
- **404 vacío:** un endpoint de Astro que devuelve 404 con cuerpo nulo **no** se reencamina a `404.astro` (`runtime/server/endpoint.js` marca `skipErrorReroute`), así que se conserva "el 404 vacío con `cache-control: no-store`" que `despliegue` describe. Lo cubre una prueba contra la build.
- **Diferencias de decodificación:** Astro decodifica `params` distinto que Next. Las pruebas adversariales de 2b repiten las de hoy (`../`, `%2F`, `%00`, `%2e%2e`, clave de otro negocio) y exigen el mismo 404 indistinguible.

## 9. Diff de HTML contra la versión Next

- **Referencia:** la build de Next de la rama `main` (`git worktree add ../enmirumbo-next main`, `next build && next start -p 3001`), no producción. Producción tiene otra base y no se le puede sembrar. Las dos builds usan la **misma** `DATABASE_URL` (base local sembrada con `npm run db:seed`), el mismo `SITIO_URL` y las mismas variables de medición. Se corre dos veces: con medición y sin ella.
- **Astro:** la salida real (`.vercel/output/`) servida por `scripts/servir-salida-vercel.mjs`, el emulador del Build Output API trasladado desde `spikes/astro/scripts/servidor-local.mjs`, que aplica las rutas y cabeceras de `config.json`. No se usa `astro dev`.
- **`scripts/diff-html.mjs <baseNext> <baseAstro> [--rutas archivo]`:**
  - **Rutas:** las del `sitemap.xml` de Next que caen en el alcance del change, más una lista fija: `/no-existe`, `/robots.txt`, `/sitemap.xml`, `/opengraph-image` y, en 2b, `/loquesea`, `/negocio/inexistente`, `/buscar?q=…` y una foto.
  - **Normaliza:** quita los `<script>` y `<link>` del runtime de Next (`self.__next_f`, `/_next/static/*`, `modulepreload`, `data-precedence`), los comentarios `<!-- -->` de React, los hashes de assets y el `?<hash>` de la imagen (se exige que exista, no su valor). Colapsa espacios.
  - **Compara:**
    - estado HTTP;
    - las cuatro cabeceras de seguridad, `Content-Type`, `Cache-Control` y que no haya cabeceras del marco;
    - `<html lang>` y `<title>`;
    - el conjunto de `<meta>` y de `<link rel="canonical">`;
    - cada bloque JSON-LD, como JSON parseado;
    - texto visible por landmark;
    - enlaces (`href`, `rel`, `target`);
    - la secuencia de elementos con sus clases dentro de `<body>`.
  - Sale con código ≠ 0 y lista cada diferencia por ruta.
- **No corre en el CI** (necesita las dos builds y Next de `main`). Lo corren el dev y el validador, y su salida va pegada en `reports/`. El normalizador sí tiene pruebas unitarias en la suite.
