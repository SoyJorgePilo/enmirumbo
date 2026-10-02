# Tareas: migrar-lectura-publica-astro (Fase 2a)

Rama: `feature/astro-lectura-publica`, apilada sobre `feature/agregar-andamio-astro` (PR #31). El PR va a `migracion-astro` cuando #31 esté mergeado. Orden por dependencia; cada tarea se comprueba sola. `src/lib/`, `src/components/` y `src/app/` no se tocan.

## Preparación

- [ ] 1. **Línea base.** Anotar en `reports/b-dev.md` el resultado de `npm test` (archivos y pruebas). Listar los archivos de `tests/` que importan `src/app/` para rutas de 2a: layout raíz, `(publico)/layout`, home, legales, `not-found`, `robots`, `sitemap` y `opengraph-image`. Unos 18; `grep` en `proposal.md`. Guardar el conteo de `expect(` por archivo. Comprobar: la tabla está en el reporte.
- [ ] 2. **Dependencias.**
   - Leer el aviso GHSA-vcvr-r3jv-pc5j y decidir si alcanza a `satori`/`@resvg/resvg-js`.
   - Agregar `satori` y `@resvg/resvg-js` en versiones no afectadas, más un parser de HTML para el diff (p. ej. `node-html-parser`) en `devDependencies`.
   - Comprobar: `npm audit` sin avisos nuevos de esas cadenas, y ningún `hasInstallScript` inesperado en el lockfile (anotar el de `@resvg/resvg-js` si lo trae, con su porqué).
- [ ] 3. **Servidor local de la salida de Vercel.** Trasladar `spikes/astro/scripts/servidor-local.mjs` a `scripts/servir-salida-vercel.mjs`. Debe aplicar las rutas, cabeceras y estáticos de `.vercel/output/config.json` (design.md §9). Comprobar: tras `npm run build`, sirve `/_astro/*.css` y una URL desconocida responde 404.

## Diff de HTML (primero la herramienta, para medir todo lo demás)

- [ ] 4. **Script de diff, prueba primero.** Pruebas unitarias del normalizador y del comparador con HTML de ejemplo: quita el runtime de Next y los hashes, y detecta un enlace faltante, una `<meta>` cambiada, un JSON-LD distinto y una cabecera de seguridad ausente. Después, `scripts/diff-html.mjs` según design.md §9. Comprobar: pruebas en verde, y el script sale ≠ 0 al compararse contra una copia alterada.
- [ ] 5. **Referencia Next.** Documentar al inicio de `scripts/diff-html.mjs` cómo levantar Next de `main` en un `git worktree`, con la misma base sembrada y el mismo entorno. Capturar desde esa build el `<head>` de `/`, `/aviso-de-privacidad`, `/terminos` y `/no-existe`, con y sin `SITIO_URL`, como fixtures de `tests/` (solo datos semilla ficticios). Comprobar: los fixtures traen `og:image:*` y el `robots noindex` de la 404.

## Armazón

- [ ] 6. **Metadatos, prueba primero.** `src/astro/metadatos.ts` (design.md §3) produce, desde los objetos de `src/lib/seo/metadata.ts`, el mismo conjunto de etiquetas que los fixtures de la tarea 5. Incluye el parámetro de versión de la imagen heredada y el `noindex` de la 404. Comprobar: pruebas en verde para los cuatro casos × con/sin `SITIO_URL`.
- [ ] 7. **Layouts y exclusión, prueba primero.**
   - Extender la prueba de exclusión de la medición a `src/pages/`: una página con `DocumentoBase` sin motivo escrito reprueba.
   - Crear `src/layouts/DocumentoBase.astro` y `TroncoPublico.astro` (design.md §1), con el script de la medición en la misma posición que hoy.
   - Comprobar: la prueba de exclusión pasa, y una página fixture sin motivo la hace fallar (revertir).
- [ ] 8. **Middleware, prueba primero.** `src/middleware.ts`:
   - pone las cuatro cabeceras de `cabecerasDeSeguridad()` sin pisar una que la respuesta ya traiga;
   - pone el `Cache-Control` de Next en el HTML dinámico;
   - sin cabeceras del marco;
   - avisos de arranque en el tronco del módulo.
   Comprobar: pruebas unitarias en verde. Una respuesta con `Referrer-Policy: strict-origin` la conserva, y diez peticiones sin `SITIO_URL` en producción dejan un solo aviso.
- [ ] 9. **Imagen de marca.**
   - `src/pages/opengraph-image.ts` con `prerender = true`, `satori` + `@resvg/resvg-js` y Geist Regular con su licencia OFL en el repo (design.md §6).
   - Probar que el árbol trae los cuatro textos y que el PNG mide 1200×630.
   - Comprobar: tras el build, `/opengraph-image` es un estático y `_render.func` no contiene `satori` ni `resvg`. Dejar en el reporte las dos imágenes (Next y Astro) lado a lado para revisión humana.
- [ ] 10. **Cabeceras en la CDN.** `src/astro/integraciones/cabeceras-en-la-cdn.ts`, registrada en `astro.config.mjs` después del adaptador. Agrega las cuatro cabeceras a `config.json` para las prerenderizadas, `/404` y `/_astro/(.*)`, y `Content-Type: image/png` a `/opengraph-image`. Comprobar: una prueba sobre el `config.json` construido. Con `scripts/servir-salida-vercel.mjs`, las cuatro cabeceras salen en `/aviso-de-privacidad`, `/no-existe`, `/opengraph-image` y en una hoja de `/_astro/`.

## Rutas

- [ ] 11. **Home, legales y 404.**
   - `src/pages/index.astro` (dinámica) y `aviso-de-privacidad.astro` y `terminos.astro` (prerenderizadas), en `TroncoPublico`.
   - `404.astro` (prerenderizada), en `DocumentoBase` con su motivo escrito.
   - Las tres reutilizan los componentes de `src/components/` sin `client:`. La 404 pinta un componente `NoEncontrado` que 2b reutilizará.
   - Comprobar: el diff (tarea 4) sale en cero para las cuatro rutas.
- [ ] 12. **`robots.txt` y `sitemap.xml`.** Endpoints dinámicos con `urlAbsoluta`/`urlSitio` y `obtenerDatosDelSitemap` (sin cambios), con el mismo cuerpo, el mismo tipo de contenido y los mismos casos sin `SITIO_URL` que hoy. Comprobar: el diff en cero para los dos, y el sitemap trae un negocio recién publicado sin reconstruir.

## Verificación

- [ ] 13. **Guardianes sobre Astro.** Extender a `src/pages/` y `src/layouts/` los guardianes de marca, responsivo, enlaces internos y destinos de formulario, rutas reservadas del catálogo (`robots.txt`, `sitemap.xml`, `opengraph-image`, legales) y rutas que leen la base. Una prerenderizada que importe `@/lib/directorio`, `@/lib/prisma` o `@/lib/fotos/*` reprueba. Agregar un guardián de "ninguna directiva `client:`". Comprobar: cada guardián falla con un caso puesto a propósito (revertir).
- [ ] 14. **Pruebas contra la build.** Ampliar `tests/plataforma-astro-build.test.ts` con dos comprobaciones:
   - el HTML de `/`, legales y 404 sin `<script>` (salvo datos), `modulepreload` ni `astro-island`;
   - las cuatro cabeceras en todas las rutas del alcance.
   Comprobar: en verde.
- [ ] 15. **Re-apuntar pruebas.** Re-apuntar a las páginas de Astro (Container API o salida construida) las aserciones sobre rutas de 2a de los archivos de la tarea 1. Las aserciones sobre rutas de 2b o de fases posteriores siguen contra `src/app/`. Comprobar: el conteo de `expect(` por archivo es igual o mayor que en la línea base, no hay `skip` nuevos y todo está en verde.
- [ ] 16. **Diff completo.** Correr `scripts/diff-html.mjs` (Next de `main` vs. salida de Astro, misma base) sin medición y con medición. Pegar la salida en `reports/b-dev.md`. Comprobar: cero diferencias en las siete rutas del alcance.
- [ ] 17. **Rendimiento.** Lighthouse móvil sobre `/` y `/aviso-de-privacidad` servidas por `scripts/servir-salida-vercel.mjs`. Comprobar: rendimiento 100 en las dos, anotado en el reporte como indicativo hasta el preview.

## Cierre

- [ ] 18. **Compuertas.** `npm run lint`, `npm run typecheck`, `npm run build` sin base (`DATABASE_URL` a un puerto muerto) y `npm test`, todo en verde. `git diff --stat` sin cambios en `src/lib/`, `src/components/`, `src/app/`, `vercel.json`, `prisma/`, `openspec/specs/` ni `spikes/`.
- [ ] 19. **Preview de Vercel (paso humano).** Desplegar la rama en un preview y con `curl -sD - -o /dev/null` comprobar las cuatro cabeceras en `/`, `/aviso-de-privacidad`, `/no-existe` y `/opengraph-image` (este último con `Content-Type: image/png`). Repetir Lighthouse móvil en `/`. Anotar el resultado en el ticket.
- [ ] 20. **PR hacia `migracion-astro`** (nunca `main`), con el diff de la tarea 16 y el preview de la tarea 19 en la descripción, enlazado en T-023.
