# Etapa C · seguridad y pruebas adversariales — migrar-lectura-publica-astro (T-023, 2a)

**Veredicto: PASA al validador.** Crítico 0 · Alto 0 · Medio 1 · Bajo/observaciones 9.
El medio (M1) no bloquea, pero hay que decidirlo antes del corte: o se corrige en 2b o se registra como brecha junto a la del `checkOrigin`.

Base propia `prisma dev --name segur023` (TCP 51238), sembrada solo con datos ficticios (`db:seed` + `db:seed:demo`). Ya está detenida.

## Hallazgos

### Medio

**M1. Un 500 por excepción sale sin las cuatro cabeceras.** Archivo: `src/middleware.ts:34-38`.
- **Cómo se reproduce:** con la base caída (Supabase en pausa, `DATABASE_URL` inalcanzable), `GET /` y `GET /sitemap.xml` regresan `500`. El cuerpo va vacío y no lleva CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy` ni `Cache-Control`.
- **Causa:** la página lanza, y Astro (`core/errors/default-handler.js`) arma `new Response(null, {status: 500})` fuera del middleware porque no hay una `500.astro`. Next, en el mismo caso, mandaba las cuatro porque `headers()` aplica a todo.
- **Por qué es medio y no alto:** el cuerpo va vacío. No hay contenido que enmarcar ni que interpretar, y comprobé que no sale la traza ni la `DATABASE_URL` (prueba con una clave ficticia reconocible).
- **Qué incumple:** la letra de la spec ("Toda respuesta de las rutas migradas DEBE llevar exactamente las cuatro…") y la paridad con Next.
- **Arreglo sugerido:** una `src/pages/500.astro` dinámica en español, que sí pasa por el middleware. Coincide con la propuesta 6 de b-dev, que suponía la página del marco; en realidad sale un cuerpo vacío.
- **Prueba:** queda documentado con `it.fails` en `tests/astro-seguridad-adversarial.test.ts`. Cuando se cierre, esa prueba se pone roja y hay que pasarla a `it`.

### Bajo / observaciones (no bloquean)

1. **Brecha conocida del 403 de `checkOrigin`, confirmada.** Sale sin las cuatro cabeceras y con texto en inglés ("Cross-site POST form submissions are forbidden").
   - También salta con `PUT /robots.txt` sin `Origin`.
   - El cuerpo es solo esa frase, sin más datos.
   - Queda documentada con `it.fails`, para que T-024 la vea cambiar.
2. **El middleware no pisa ninguna cabecera que la respuesta ya traiga, no solo `Referrer-Policy`** (`src/astro/cabeceras.ts:41-43`). Está así en la letra del design §5, pero es más amplio que la spec ("más estricta").
   - Una ruta de las fases 4-5 que mande una CSP más laxa, `X-Frame-Options: SAMEORIGIN` o `Referrer-Policy: unsafe-url` ganaría sin que nadie lo note.
   - Propuesta para 4-5: respetar solo `Referrer-Policy`, y solo si está en una lista de valores más estrictos.
3. **Para 2b: hay caminos de Astro que saltan el middleware.** Pasa con el reencaminamiento a la 404 prerenderizada (`prerenderedErrorPageFetch`, en el mismo `default-handler.js`) y con el 500 por defecto. El design §1 ya evita el reencaminamiento en `[destino]` y `[ficha]`. Conviene una prueba sobre la build que pida `/negocio/inexistente` y exija las cuatro.
4. **`scripts/servir-salida-vercel.mjs:127` escucha en todas las interfaces.** `listen(PUERTO)` sin host deja la función, conectada a la base local, visible en la red del dev. Basta con poner `127.0.0.1`.
   - También: `scripts/diff-html.mjs:108,117` acepta en `--rutas` URLs absolutas, así que `new URL(ruta, base)` puede pedir a otro host. Es una herramienta local y el riesgo es mínimo.
   - Ninguno de los dos scripts lee `.env`, ejecuta procesos ni escribe fuera de `--capturar-head <dir>`. El emulador no se sale de `static/`: lo probé con `%2e%2e`, `%00` y codificación rota.
5. **El guardián `paginasAstroSinMotivo` busca `<TroncoPublico` en la fuente sin quitar los comentarios** (`tests/analitica-exclusion-admin.test.ts`). Una página que lo nombre solo en un comentario se libra del guardián. Ese error excluye de la medición en silencio, que es la dirección inocua; la dirección peligrosa (lo privado medido) la cubre mi guardián nuevo.
6. **La prueba de escape del dev usa `etiquetasAHtml`, que es solo de pruebas, y no el render real.** Lo cubrí sobre `DocumentoBase.astro` y el render real está bien:
   - Astro escapa `"` y `&`, y deja `<` y `>` dentro de los atributos entre comillas. Eso es HTML válido e inerte.
   - El árbol parseado no gana elementos y los textos hostiles llegan intactos.
   - Importa para 2b, donde el título y la descripción saldrán de datos del negocio.
7. **Lo que se tocó fuera de lo previsto no abre nada:**
   - `tsconfig.json` excluye `.next/types/validator.ts`. Se pierde la validación de tipos de rutas de `src/app/`, que en esta rama no corre. Hay que revertirlo en T-027.
   - `astro.config.mjs`: `noExternal: ["tailwindcss"]` solo agrupa CSS. Tiene un comentario duplicado (líneas 55-60), que es cosmético.
   - `public/favicon.ico` es idéntico byte a byte a `src/app/favicon.ico`.
8. **Restos publicados sin referencia:** `/_astro/client.*.js` (el cliente del renderizador de React) sale a la CDN aunque ningún HTML lo pide. Además, el emulador responde `POST /opengraph-image` con el HTML de la 404 y `Content-Type: image/png`, porque la ruta de cabeceras no distingue método. Es inocuo con `nosniff`; conviene mirarlo en el preview (tarea 19).
9. **El identificador de aviso que cita b-dev, `GHSA-wx4j-mvgx-mqwp`, no existe en la base de avisos de GitHub (404).** La conclusión sí se sostiene con otra evidencia:
   - `satori@0.33.5` (22-09-2026) trae "Harden SVG serialization".
   - Ese mismo día salió `@vercel/og@1.0.3`, que fija `satori 0.33.5`.
   - GHSA-vcvr-r3jv-pc5j atribuye el RCE a un problema "upstream" del `ImageResponse` de Node.
   - Hay que corregir el ID en b-dev o en el PR.

**Superficie de abuso (sin cambio respecto a Next):** `/sitemap.xml` y `/` consultan la base en cada petición sin caché compartida. Una inundación pega directo en la base. Ya pasaba con Next. No hay formularios nuevos en 2a.

## Auditoría por punto del encargo

1. **Middleware y cabeceras.** Probé contra el emulador, sobre la salida real. Las cuatro cabeceras salen con sus valores en todos estos casos:
   - `/`, las legales, `/a/b/c`, `/no-existe`, robots, sitemap, `/opengraph-image`, `/_astro/*.css`, `/404.html` y `/favicon.ico`;
   - con métodos raros: `HEAD`, `OPTIONS`, `POST` con JSON y `DELETE` a un estático;
   - en `/_server-islands/%ZZ` (400) y en `/_image?href=` (404, no hay optimizador).

   Excepciones: M1 y el 403 conocido. No sale `x-powered-by` ni `x-astro*`. Un `Referrer-Policy` más estricto (`strict-origin`, `no-referrer`) se respeta. El `Cache-Control` del HTML dinámico es `private, no-cache, no-store…`, también con `Set-Cookie` y con el tipo en mayúsculas. La consulta de la URL no se refleja en la home.
2. **Cabeceras en la CDN** (`config.json` construido). Revisé que no abra rutas ni quite protecciones:
   - Agrega rutas `continue: true` antes de `filesystem`, una por estático, con patrones anclados y escapados.
   - La 404 comodín lleva las cuatro.
   - No toca las rutas `_render`, y ningún patrón de estático alcanza `/`, robots, sitemap, `/admin` ni `/editar` (prueba nueva).
   - Si el adaptador cambia de forma, truena.
3. **Dependencias:**
   - `npm audit` da los mismos 7 avisos antes (lock de HEAD) y después. Ninguno es de `satori`, `@resvg/resvg-js`, `node-html-parser` ni de lo que traen.
   - El `overrides.satori.fflate=0.7.5` cierra GHSA-px8p-9vwx-vf98, que sí existe.
   - Los 37 paquetes nuevos son todos `dev`, vienen de `registry.npmjs.org` con `integrity` y ninguno tiene `hasInstallScript`. Los binarios de `resvg` llegan por `optionalDependencies`, por plataforma.
   - Revisé la función: no trae `satori`, `resvg`, `yoga` ni `harfbuzz`, ni el PNG en base64. Sí trae `next/navigation` (62 archivos de `next`, nada de `next/og`), por `src/lib/tareas/secreto.ts` (b-dev #4).
4. **`/opengraph-image`:** es un estático de 35 KB. El árbol es constante y no recibe nada de la petición ni de la base. Se genera una sola vez por build, en milisegundos. La fuente es la misma Geist-Regular de `next/og` (mismo sha1), con `OFL.txt` y su copyright.
5. **Medición:**
   - Solo `TroncoPublico` pinta el script, y la 404 queda fuera.
   - Agregué un guardián nuevo: ninguna página de `src/pages/admin/**` ni de `src/pages/editar/**` puede usar el tronco ni `ScriptAnalitica`, aunque declare un motivo. Lo probé con fixtures.
   - Las `NEXT_PUBLIC_UMAMI_*` no se incrustan: la función las lee con `process.env` en tiempo de ejecución, y en `/_astro/*.js` no aparece ni el ID ni el `src` usados al construir.
6. **Metadatos:** el `<head>` de la home construida es igual al fixture de Next, salvo los hashes. No sale ningún dato nuevo. En 2a no hay JSON-LD. El escape está probado sobre el render real (obs. 6).
7. **Scripts:** ver la obs. 4.
8. **Fuera de lo previsto:** ver la obs. 7.
9. **Secretos y datos reales:**
   - En archivos nuevos o modificados no hay teléfonos, correos ni URLs reales. Los fixtures usan `enmirumbo.example`, y las URLs de base en las pruebas son ficticias.
   - `.vercel/`, `dist/` y `.astro/` están en `.gitignore`. El manifiesto de la función lleva rutas absolutas locales y la `key` de islas del build, pero no se versiona.
   - `git diff HEAD --stat` sale vacío en `src/app`, `src/lib`, `src/components`, `openspec/specs`, `vercel.json` y `prisma/`, y no hay archivos sin seguimiento en esas rutas.

## Mapa scenario → prueba (revisado)

Todos los scenarios automatizables de `plataforma-astro` tienen prueba. Las excepciones son las que el dev ya declaró:
- "dependencias sin avisos": `npm audit`, manual porque necesita red. Lo verifiqué arriba.
- "lo que sirve la CDN, en un preview": paso humano, tarea 19.
- Lighthouse: manual.

No encontré scenarios sin prueba. El de "las cuatro en todas partes" queda reforzado con métodos y codificaciones raras.

## Pruebas adversariales añadidas

`tests/astro-seguridad-adversarial.test.ts`: 17 pruebas, 15 en verde y 2 `it.fails` que documentan brechas. Fixtures en `tests/fixtures/paginas-privadas-medidas/{admin/cola.astro, admin/bien.astro, editar/[token].astro}`.

| Bloque | Qué ataca | Resultado |
|---|---|---|
| Lo privado nunca se mide | `src/pages/admin`, `src/pages/editar` con el tronco o el script; un fixture que declara motivo y aun así mete el script; un comentario que menciona el tronco | verde (2) |
| Escape real | título `</title><script>`, descripción `"><script>`, canónica con comillas, `og:title` con `<img onerror>` por `DocumentoBase.astro` | verde |
| Middleware atípico | 500 devuelto, `TEXT/HTML`, `charset=UTF-8`, `Set-Cookie` sin `Cache-Control`, `X-Powered-By` puesto por la página, `no-referrer` | verde (5) |
| Tabla de la CDN | archivos `a+b(1).css`, `x$.html`, `[slug]/index.html`, `q?.txt`; patrones de estáticos contra las rutas de la función | verde (2) |
| Salida construida (build + 2 emuladores) | `HEAD`, `OPTIONS`, `POST` y `DELETE`; `%ZZ`, `%E0%A4%A`, `%2e%2e`, `/_image?href=` externo, `/opengraph-image/`, `/index.html`; consulta reflejada; base caída sin traza ni `DATABASE_URL` en el cuerpo; 403 sin más datos que su frase | verde (5) |
| Brechas documentadas | `[M1]` 500 con las cuatro; `[T-024]` 403 con las cuatro | `it.fails` (2, fallan como se espera) |

Las intermitentes [A1]/[A2] (`reportes-seguridad-adversarial`) y la de `admin-listado-paginas` son preexistentes: ni sus archivos ni `src/lib/reportes` tienen diff, y en estas corridas no salieron.

## Cierre

- `npm test`: 121 archivos en verde; 3404 pasan, 2 `expected fail`, 2 saltadas. La línea base de b-dev era 120 archivos y 3389 pruebas: +1 archivo y +17 pruebas, las mías.
- `npm run lint`: 0 errores.
- `npm run typecheck`: 0 errores.
- `npm run build` sin base alcanzable: Complete.
- No hice commits. La base `segur023` quedó detenida y los emuladores que levanté terminaron.
