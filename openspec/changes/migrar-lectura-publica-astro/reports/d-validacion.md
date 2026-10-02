# Etapa D · validación — migrar-lectura-publica-astro (T-023, Fase 2a)

**Veredicto: APROBADO.** Crítico 0 · Alto 0 · Medio 0 · Bajo 6, ninguno bloquea. Hay 2 desviaciones de letra aceptadas, documentadas abajo.
Rama `feature/astro-lectura-publica`, apilada sobre `feature/agregar-andamio-astro` (PR #31). El PR va con `--base feature/agregar-andamio-astro`, y GitHub lo retargetea a `migracion-astro` cuando se mergee #31.

## Compuertas (corridas por mí, desde limpio)

| Gate | Resultado |
|---|---|
| `npm ci` | verde. Sin `hasInstallScript` nuevo: los 5 avisos de install-scripts son de paquetes previos (prisma, esbuild, fsevents, unrs-resolver) |
| `npm run lint` | 0 problemas |
| `npm run typecheck` | 348 archivos, 0 errores, 0 warnings |
| `npm run build` sin base (`rm -rf dist .vercel .astro`; `DATABASE_URL` a `127.0.0.1:1`) | verde, sin intentar conectarse |
| `npm test` con base `prisma dev --name valida023`, nueva | 121/121 archivos; 3409 pasan, 1 expected fail (403 de `checkOrigin`, T-024), 2 saltadas |
| `npm audit` antes (lock de HEAD) / después | 7 / 7, los mismos paquetes (`@prisma/config`, `brace-expansion`, `deepmerge-ts`, `fast-uri`, `mysql2`, `next`, `prisma`). Ninguno viene de las cadenas nuevas |

## Verificación independiente

1. **Diff de HTML contra Next de `main`.** Levanté Next en mi propio `git worktree` de `main` (`ee772ad`, `next build && next start`). Usé una base aparte, `prisma dev --name valida023diff`, sembrada solo con datos ficticios (`db:seed` + `db:seed:demo`, WhatsApp 771999xxxx). Astro corrió con su salida real servida por `scripts/servir-salida-vercel.mjs`. Las dos builds se hicieron con el mismo entorno.
   - A (`SITIO_URL`, sin medición): `Cero diferencias en 7 rutas`, exit 0.
   - B (+ `NEXT_PUBLIC_UMAMI_*`): `Cero diferencias en 7 rutas`, exit 0. El script del proveedor sale en `/` y en las legales, y no sale en `/a/b/c`.
   - Con `--incluir-2b`, el script sí ve diferencias: 68, en `/no-existe`, `/loquesea`, `/negocio/inexistente` y `/buscar` (200 vs 404). Así compruebo que el comparador no es ciego.
2. **Producción sin `SITIO_URL`** (`NODE_ENV=production`, salida real): ninguna URL a `localhost` en `/`, `/500`, robots ni sitemap. El sitemap sale válido y vacío, robots sale sin línea de sitemap y el aviso sale **una** vez tras varias peticiones.
3. **Las cuatro cabeceras sobre la salida real** (emulador de Vercel). Las llevan todas estas, con los valores de `cabecerasDeSeguridad()` y sin `x-powered-by`:
   - dinámicas: `/` (más `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`), robots y sitemap (`public, max-age=0, must-revalidate`);
   - prerenderizadas: las dos legales, con y sin `/`, y `/terminos/index.html`;
   - 404: `/no-existe`, `/a/b/c`, `/buscar`, `/admin` y `/registro` (404 en esta rama, de 2b o de fases posteriores);
   - `/opengraph-image` (`image/png`), `/_astro/*.css` y `/favicon.ico`.
   - **500:** `/500`, y `/` y `/sitemap.xml` con la base inalcanzable. Salen 500 con las cuatro, `Cache-Control` dinámico, la página en español y `noindex`. El cuerpo no trae la clave ficticia (`claveFicticiaXYZ`) ni traza.
   - **307:** ninguna ruta de 2a emite un 307 en la salida real (`config.json` no tiene rutas de redirección). Lo cubre la prueba unitaria del middleware real con `Response.redirect(…, 307)`, de cabeceras inmutables (`tests/astro-middleware.test.ts:55`), en verde.
4. **Imagen de marca:** `static/opengraph-image` es un PNG de 1200×630. `_render.func` (11 MB) no contiene `satori`, `resvg`, `yoga-layout`, `harfbuzz`, binarios `.node` ni un PNG en base64. Lo comprobé con `grep -r` y `find`. Sí trae 62 archivos de `next` por `src/lib/tareas/secreto.ts` (deuda conocida).
5. **`overrides.satori.fflate = 0.7.5`:** sin el override, `npm audit` marca `fflate 0.7.0–0.7.4` (GHSA-px8p-9vwx-vf98, moderado) por `satori >=0.33.0`. Con él, `npm ls` muestra `fflate@0.7.5 overridden`, una sola copia, y el aviso desaparece. Es un parche de la misma menor, y el patrón es igual al de `path-to-regexp` en T-022. Justificado.
6. **Dependencias nuevas** (`satori@0.33.5`, `@resvg/resvg-js@2.6.2`, `node-html-parser@9.0.4`): exactas, en `devDependencies`, y solo corren al construir o en pruebas. Las 37 entradas nuevas del lock vienen de `registry.npmjs.org`.
7. **Rutas prohibidas sin diff** (`git diff HEAD` más los archivos sin seguimiento): `src/app`, `src/lib`, `src/components`, `openspec/specs`, `vercel.json`, `prisma/`, `spikes/` y `next.config.ts` están vacíos.
8. **Secretos y datos reales:** revisé con `grep` el diff y los archivos nuevos. Solo hay URLs de base ficticias (`nadie:nadie@127.0.0.1:1`, `claveFicticia`), `enmirumbo.example`, teléfonos `771999xxxx` del seed demo y ningún correo. Los fixtures `next-head/` son solo `<head>` con datos de sitio.
9. **Cero JS propio en la build:** `404.html` y las legales no traen `modulepreload` ni `astro-island`. El único `<script>` es el del proveedor cuando está configurado.
10. **Dureza de las pruebas:** comparé el conteo de `expect(` por archivo contra HEAD en los 26 archivos modificados. Ninguno baja, y coincide con la tabla de b-dev. No hay `skip`/`todo`/`it.fails` nuevos en archivos existentes. El único `it.fails` es el del 403 de T-024, en el archivo nuevo de c-seguridad, y los dos de M1 ya pasaron a `it`.

## Guardianes ajustados: ninguno quedó más laxo

- **`analitica-exclusion-admin`:** el `toEqual` exacto de "quién pinta `<ScriptAnalitica />`" pasa de 1 a 2 archivos, el layout de Next y `TroncoPublico.astro`. Sigue siendo una igualdad exacta, no un "contiene", y es justo lo que la spec pide: el tronco, y solo él, mide. Todo lo demás se agregó: `.astro` entra al recorrido, el `DocumentoBase` no mide ni trae `referrer`, la lista de exclusiones es exacta (`404.astro` y `500.astro`, cada una con su motivo escrito) y hay un fixture que reprueba.
- **`buscador-pagina` ("deja pasar el noindex"):** el guardián ahora cubre también `src/pages/` y exige al menos 4 páginas `.astro` indexables. Solo `500.astro` entra a la lista blanca, y la lista blanca **exige** que declare `noindex`. Antes eran 3 excepciones de `src/app`, todas intactas. Una página de error no es contenido, y Next también manda `noindex` en sus errores. La 404 no se vuelve excepción: su `noindex` lo pone `DocumentoBase` (`noEncontrado`), así que el archivo de la página sigue sujeto al guardián.
- **`directorio-consultas` (reserva de "500"):** solo agrega pruebas, sin quitar ni cambiar líneas. Todo segmento que publica `src/pages/` debe estar en `SEGMENTOS_RESERVADOS`, salvo `index`, `404` y `500`. Esos tres no se pueden reservar sin tocar `src/lib/`, y lo compensa una aserción de que ningún slug del catálogo es "404" ni "500". Es más débil que reservarlos, porque solo vigila el catálogo de hoy. Lo acepto en 2a porque todavía no existe `[destino]` en Astro y nada puede taparse. **Para 2b:** agregar "404" y "500" a `SEGMENTOS_RESERVADOS`.
- **`legales-paginas`:** el título esperado pasa de `"Aviso de privacidad — EnMiRumbo"` (la metadata cruda de la página Next) a `"… — EnMiRumbo — EnMiRumbo"` (el título servido). Es la paridad medida con Next, que en producción repite la marca. La prueba ahora **fija** ese bug, y cuando se arregle hay que actualizarla (candidato a ticket, abajo).

## Desviaciones fuera de lo previsto: aceptadas

- **`tsconfig.json` excluye `.next/types/validator.ts`:** comprobé que `next typegen` genera validadores para `src/pages/{opengraph-image,robots.txt,sitemap.xml}.ts` como si fueran del Pages Router. Se pierde la validación de tipos de rutas de `src/app/`, que en esta rama es código inerte. Hay que revertirlo en T-027.
- **Tailwind en `astro.config.mjs`** (`vite.environments.{ssr,prerender}.resolve.noExternal: ["tailwindcss"]`): solo agrupa CSS, y sin ello el build truena. Justificado.
- **`public/favicon.ico`:** idéntico byte a byte a `src/app/favicon.ico` (`cmp`). Hace falta para la paridad del `<link rel="icon">`. En T-027 hay que quitar uno de los dos, porque Next marca conflicto entre `public/` y `app/` para la misma ruta.
- **`src/pages/500.astro` (corrección de M1):** agrega copy nuevo ("Algo falló de nuestro lado", en español mexicano). Lo justifica la spec, que pide las cuatro cabeceras en toda respuesta, y quedó anotado en `proposal.md`. Lo acepto.

## Desviaciones de letra aceptadas

1. **`/no-existe` en el scenario "cero diferencias":** en Next, `[destino]` resuelve `/no-existe` con `notFound()`. La respuesta es `<html id="__next_error__">` con `<body>` vacío y solo la pinta el JS, así que no hay contra qué empatar. El diff de 2a usa `/a/b/c`, la 404 global. En Astro, `/no-existe` ya cumple el scenario "URL desconocida" (404 con el texto y el enlace), así que es estrictamente mejor. Hay que corregir la letra al archivar y decidir en 2b (ver candidatos).
2. **Tareas 19 y 20:** el preview de Vercel es un paso humano. El PR va a la rama de #31 y no directo a `migracion-astro`, por el apilamiento. No se marcan.

## Hallazgos bajos (no bloquean)

1. `astro.config.mjs:55-60`: el comentario de `cabecerasEnLaCdn` está duplicado. Es cosmético. Hay además 3 líneas en blanco al final de archivo en pruebas (`git diff --check`).
2. `scripts/servir-salida-vercel.mjs:59`: el emulador prueba `${ruta}.html` implícito, cosa que Vercel no hace sin `cleanUrls`. Por eso `/404` sale **200 y sin cabeceras** en el emulador. En Vercel debería caer en la ruta comodín (404 con cabeceras). Hay que confirmarlo en el preview, y agregué `/404` al checklist del preview en el cuerpo del PR.
3. `scripts/servir-salida-vercel.mjs:127`: el emulador escucha en todas las interfaces (c-seguridad obs. 4). Conviene `127.0.0.1`.
4. Barra final: Next responde `308` en `/aviso-de-privacidad/` y `/terminos/`, y Astro responde `200` con la misma página. Hay canónica, así que no duplica en buscadores. Va a 2b o T-027 (`trailingSlash: "never"`).
5. Los segmentos "404" y "500" no están reservados en `SEGMENTOS_RESERVADOS` (ver arriba), para 2b.
6. `paginasAstroSinMotivo` no quita comentarios antes de buscar `<TroncoPublico` (c-seguridad obs. 5). Falla hacia lo inocuo.

## Candidatos a ticket (fuera de alcance; van en el PR)

- **Marca repetida en las legales en producción:** "Aviso de privacidad — EnMiRumbo — EnMiRumbo". Es un `/rapido` sobre `main` y luego paridad en la rama.
- **`src/lib/tareas/secreto.ts` importa `next/navigation`** y mete 62 archivos de `next` en la función de Astro. Deuda para T-027.
- **404 de rutas dinámicas con `<body>` vacío en Next** (`/loquesea`, `/negocio/inexistente`): sin JS, el vecino ve una página en blanco en producción hoy. Para 2b hay que decidir si se pintan dentro de `TroncoPublico` (empezarían a medirse) o de `DocumentoBase`.
- **Middleware que no pisa *ninguna* cabecera existente** (c-seguridad obs. 2): para las fases 4-5, respetar solo una `Referrer-Policy` más estricta.

## Muestreo

Revisé el código de `src/middleware.ts`, `src/astro/cabeceras.ts`, las dos integraciones, los layouts, `index`, legales, `404`, `500`, robots, sitemap y `opengraph-image`. En pruebas revisé los diffs completos de `analitica-exclusion-admin`, `buscador-pagina`, `directorio-consultas`, `layout`, `legales-borrador`, `seo-iteracion2` y `gestion-seguridad-adversarial`, y todas las líneas borradas de los 26 archivos de pruebas modificados. Comparé a ojo las dos imágenes de marca: mismos textos, colores y tamaño, y en Next un poco más de espacio entre palabras. No hay `any` en código nuevo, y la UI está en español mexicano. **Lighthouse no lo re-ejecuté:** la cifra que cuenta es la del preview (tarea 19).

**PNG de `reports/`: se commitean.** Son 71 KB en total, sin datos personales, y la tarea 9 pide dejarlos "en el reporte para revisión humana". GitHub los muestra en "Files changed". No contradicen "sin un binario de imagen en el repositorio" de la spec, que se refiere a la fuente del generador, y esa sale de código (`arbol.tsx`). Se pueden borrar al archivar el change.

Limpieza: quité el worktree y detuve las bases `valida023` y `valida023diff` y los servidores.
