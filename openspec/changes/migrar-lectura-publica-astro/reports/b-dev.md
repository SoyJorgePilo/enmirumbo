# Etapa B · dev — migrar-lectura-publica-astro (T-023, Fase 2a)

No hubo etapa UI (`a-ui.md` no existe): el change no dibuja pantallas nuevas.

## Resumen

Armazón de Astro y rutas de 2a con paridad medida contra la build de Next de `main`: documento base y tronco medido (`src/layouts/`), resolución de metadatos (`src/astro/metadatos.ts`), middleware de cabeceras y avisos de arranque (`src/middleware.ts`), cabeceras en la CDN e imagen de marca generada al construir (`src/astro/integraciones/`), y las páginas `/`, `/aviso-de-privacidad`, `/terminos`, 404, `/robots.txt`, `/sitemap.xml` y `/opengraph-image`. **El diff da cero diferencias en las 7 rutas, sin medición y con ella.** Lint, typecheck, build sin base y `npm test` en verde.

## Línea base (tarea 1) y resultado

| | Archivos | Pruebas |
|---|---|---|
| Antes (HEAD, base `prisma dev` propia) | 114 | 3289 pasan, 2 saltadas |
| Después | 120 | 3389 pasan, 2 saltadas (0 fallas; [A1]/[A2] no salieron en esta corrida) |

Archivos con rutas de 2a, re-apuntados, con su conteo de `expect(` (antes → después; ninguno baja y no hay `skip` nuevos): analitica-adversarial 49→51, analitica-exclusion-admin 47→59, analitica-privacidad 22→22, configuracion-produccion 74→74, directorio-adversarial 117→117, directorio-despublicado 48→48, directorio-paginas 121→122, fotos-supabase 64→64, gestion-privacidad 13→13, gestion-seguridad-adversarial 151→151, layout 139→144, legales-adversarial 49→50, legales-borrador 4→4, legales-paginas 151→152, rebrand-seguridad-adversarial 92→92, responsivo-guardian 20→20, seo-artefactos 42→60, seo-iteracion2 33→34, seo-metadata 46→46, seo-seguridad-adversarial 165→165. Guardianes extendidos: buscador-pagina 59→60, directorio-consultas 58→64, despliegue 50→55, marca-guardian 13→17, reportes-privacidad 30→30. Las aserciones sobre rutas de 2b siguen contra `src/app/`.

## Tareas

| # | Estado | Nota |
|---|---|---|
| 1 | [x] | Tabla de arriba |
| 2 | [x] | Ver "Dependencias" |
| 3 | [x] | `scripts/servir-salida-vercel.mjs`: además del spike, sirve destinos estáticos (`/404.html`) con su `status` y sus `headers`, y deja que la tabla fije `Content-Type` |
| 4 | [x] | `scripts/diff-html/nucleo.mjs` + `tests/diff-html.test.ts` (19). Contra una copia alterada de `/terminos` sale ≠ 0 y nombra viewport, enlace y secuencia |
| 5 | [x] | Cómo levantar Next de `main` al inicio de `scripts/diff-html.mjs`. Fixtures en `tests/fixtures/next-head/{con,sin}-sitio-url/` (solo `<head>`; traen `og:image:*` y el `noindex` de la 404) |
| 6 | [x] | `tests/astro-metadatos.test.ts`: 4 casos × con/sin `SITIO_URL` contra los fixtures + scenarios |
| 7 | [x] | Exclusión extendida a `src/pages/` (fixtures `tests/fixtures/paginas-sin-motivo/`) |
| 8 | [x] | `tests/astro-middleware.test.ts` (10) |
| 9 | [x] | Árbol, generador y PNG probados; el estático y la función, en la prueba de build. Imágenes: `reports/imagen-de-marca-next.png` y `reports/imagen-de-marca-astro.png` (mismos textos, colores y tamaño; Next deja un poco más de espacio entre palabras) |
| 10 | [x] | Unitaria (`tests/astro-cabeceras-cdn.test.ts`) y sobre el `config.json` construido |
| 11–12 | [x] | Diff en cero (tarea 16) |
| 13 | [x] | Mutación: una página temporal con `DocumentoBase` sin motivo, `prerender` + `@/lib/directorio`, `client:load`, "NecesitoUno", `whitespace-nowrap` y un `href` inexistente hizo fallar a los 7 guardianes, cada uno nombrando el archivo. Revertida |
| 14 | [x] | `tests/plataforma-astro-build.test.ts` (+9): emulador en un proceso aparte sobre la salida real |
| 15 | [x] | Ver línea base |
| 16 | [x] | Ver "Diff" |
| 17 | [x] | Lighthouse 13.5 móvil vía emulador: `/` 100 y `/aviso-de-privacidad` 100 (FCP 0.9 s, LCP 1.1 s, TBT 0, CLS 0). Indicativo hasta el preview |
| 18 | [x] | lint 0, typecheck 0 errores, build con `DATABASE_URL` a un puerto muerto, `npm test` 120/120. Nada en `src/lib`, `src/components`, `src/app`, `vercel.json`, `prisma/`, `openspec/specs/`, `spikes/`, `next.config.ts` |
| 19 | [~] | Paso humano: preview de Vercel |
| 20 | [ ] | PR (validador), hacia `migracion-astro` |

## Diff (tarea 16)

Next 16.3.3 de `main` (`git archive main`, `next build && next start -p 3001`) contra la salida de Astro servida por el emulador (`:4321`). Las dos builds usaron la misma base `prisma dev` sembrada (`db:seed` + `db:seed:demo`, datos ficticios) y el mismo entorno. Se reconstruyeron las dos en cada variante.

```
# A: SITIO_URL=https://enmirumbo.example, sin medición      # B: igual + NEXT_PUBLIC_UMAMI_SRC/WEBSITE_ID
igual    / (200/200)                                         igual    / (200/200)
igual    /aviso-de-privacidad (200/200)                      igual    /aviso-de-privacidad (200/200)
igual    /terminos (200/200)                                 igual    /terminos (200/200)
igual    /a/b/c (404/404)                                    igual    /a/b/c (404/404)
igual    /robots.txt (200/200)                               igual    /robots.txt (200/200)
igual    /sitemap.xml (200/200)                              igual    /sitemap.xml (200/200)
igual    /opengraph-image (200/200)                          igual    /opengraph-image (200/200)
Cero diferencias en 7 rutas. (exit 0)                        Cero diferencias en 7 rutas. (exit 0)
```

Variante extra C (producción sin `SITIO_URL`): también cero. En B, el `<script>` del proveedor sale en `/` y en las legales en la misma posición que en Next, y en la 404 no sale en ninguna de las dos. `Cache-Control` se compara solo en las dinámicas (`/`, robots, sitemap): en las estáticas, `next start` manda `s-maxage` y la CDN pone el suyo.

## Mapa scenario → prueba

| Scenario (`plataforma-astro`) | Prueba |
|---|---|
| una página pública queda medida · la 404 desconocida no se mide | `plataforma-astro-paginas` + diff B |
| una exclusión sin motivo reprueba | `analitica-exclusion-admin` (bloque Astro + fixtures) |
| los avisos de arranque no inundan el log | `astro-middleware` (10 peticiones, 1 aviso) + `configuracion-produccion`/`fotos-supabase` (tronco del módulo) |
| metadatos: home, legales, vista previa, 404, sin URL pública | `astro-metadatos` y `plataforma-astro-paginas` (contra fixtures de Next) |
| URL desconocida · nada de la 404 por defecto | `plataforma-astro-paginas`, `directorio-paginas`, `layout`, build (404 real en `/no-existe` y `/a/b/c`) |
| robots/sitemap iguales, sin URL pública, por petición | `seo-artefactos` (cuerpo exacto, tipo, un giro nuevo sin reconstruir) + diff |
| imagen: dirección, textos, nada por petición, dependencias | `astro-imagen-de-marca`, `plataforma-astro-build`, `npm audit` (abajo) |
| las cuatro en todas partes · política más estricta · Cache-Control | `plataforma-astro-build` (emulado), `astro-cabeceras-cdn`, `astro-middleware` |
| lo que sirve la CDN, en un preview | **pendiente humano** (tarea 19) |
| el script sí ve una diferencia | `diff-html` + copia alterada |
| cero JS propio · ninguna directiva de cliente | `plataforma-astro-paginas`, `plataforma-astro-build`, `layout` |
| Lighthouse móvil | manual, tarea 17 |
| misma dureza · slug tapado · prerenderizada que lee la base · marca por Astro | conteos de arriba, `directorio-consultas`, `despliegue`, `marca-guardian` |
| el diff no toca producto · producción no se entera | `git diff --stat` vacío en rutas prohibidas; el PR lo abre el validador |
| MODIFIED `fetchpriority` | sin cambio de código: `compat-paridad` ya probaba la letra nueva |

## Dependencias

- `satori@0.33.5`, `@resvg/resvg-js@2.6.2` y `node-html-parser@9.0.4`, exactas y en `devDependencies`: solo corren al construir o en las pruebas.
- **GHSA-vcvr-r3jv-pc5j:** el aviso es de `next` (`>=16.2.0 <16.3.6`). El propio aviso atribuye el RCE a un problema "upstream" del `ImageResponse` de Node; `satori@0.33.5` (22-09-2026, "Harden SVG serialization") es la que fija `@vercel/og@1.0.3`, publicada el mismo día, y por eso se fija 0.33.5. (Corregido tras c-seguridad obs. 9: antes se citaba un aviso de `satori` con un ID que no existe.)
- **Desviación a revisar:** `satori@0.33.5` fija `fflate@0.7.3`, con un aviso moderado (GHSA-px8p-9vwx-vf98, ZIP64 en `unzipSync`). No me detuve. Lo fijé a `0.7.5` (parche de la misma menor) con `overrides.satori.fflate`, igual que `path-to-regexp` en T-022. Con eso, `npm audit` vuelve a los mismos 7 avisos de la línea base y no hay `hasInstallScript` nuevo (`resvg` trae binarios por `optionalDependencies`). Si el override no se acepta, hay que bajar a `satori@0.32` y queda sin el endurecimiento de 0.33.5, o buscar otra vía.

## Decisiones técnicas

- **Versión de la imagen.** Un plugin de Vite genera el PNG una sola vez por build y lo expone en dos módulos virtuales: `virtual:enmirumbo/versiones`, con el hash del PNG y el del icono, y `virtual:enmirumbo/imagen-de-marca-png`, que solo usa el endpoint prerenderizado. Así `satori` y `resvg` no entran a la función (se verificó sobre la build). El endpoint sirve los bytes en vez de generarlos él, porque las páginas dinámicas necesitan el hash al construir.
- **Tailwind:** `@import "tailwindcss"` reventaba la build (ENOENT `<raíz>/tailwindcss`). En los entornos `ssr` y `prerender` el resolvedor de `@import` trataba el paquete como externo. Se arregla con `vite.environments.{ssr,prerender}.resolve.noExternal: ["tailwindcss"]`. T-022 no lo vio porque no tenía páginas.
- **`tsconfig.json`** excluye `.next/types/validator.ts`: `next typegen` toma `src/pages/*.ts` como rutas del Pages Router y exigía `default`. Los globales de Next (`PageProps`…) siguen en `routes.d.ts`.
- **`public/favicon.ico`**, copia de `src/app/favicon.ico`: sin él, `/favicon.ico` y el `<link rel="icon">` de Next no tendrían paridad.
- **Respuesta:** el middleware pone `text/html; charset=utf-8` porque Astro manda `text/html` a secas. Robots y sitemap fijan el `Cache-Control` que manda Next (`public, max-age=0, must-revalidate`).
- **404 en la CDN:** las cabeceras van en la propia ruta comodín `/.* → /404.html`, porque las rutas de cabeceras se evalúan contra la URL pedida, no contra el destino.
- **En las pruebas**, `devToolbar` está apagado en `vitest.config.mts` para que Astro no anote `data-astro-source-*`. `tests/astro-paginas.ts` pinta con la Container API, y `contenidoDelMain` equivale a lo que pintaba la página de Next.
- **Texto alternativo y medidas de la imagen** viven en `src/astro/imagen-de-marca/datos.ts`, duplicados respecto a `src/app/opengraph-image.tsx` hasta T-027.
- **Geist:** el guardián de restos de create-next-app exceptúa "geist" solo en `src/astro/imagen-de-marca/`, que es la tipografía de `next/og`.

## Hallazgos y propuestas (fuera de alcance)

1. **Desviación de letra en el scenario del diff:** en Next, `/no-existe` no es la 404 global, la resuelve `[destino]` con `notFound()` (2b). El diff de 2a usa `/a/b/c`; `/no-existe` y las demás de 2b entran con `--incluir-2b`.
2. **Para 2b, importante:** en Next, toda 404 que sale de `notFound()` dentro de una ruta dinámica (`/loquesea`, `/negocio/inexistente`) llega como `<html id="__next_error__">` con el `<body>` vacío y sin hoja de estilos: el contenido lo pinta el JS. Sin JS, el vecino ve una página en blanco (producción hoy). Además, el canario de `analitica-exclusion-admin` dice que el script de la medición no sale en ese HTML y no se ejecuta al hidratar. Si 2b pinta `NoEncontrado` dentro de `TroncoPublico` (design §1), esas 404 **empezarían a medirse**. Es un cambio de comportamiento. Hay que decidirlo en la spec de 2b.
3. **Título doble en producción:** las legales salen como "Aviso de privacidad — EnMiRumbo — EnMiRumbo", porque el título propio ya trae la marca y la plantilla la vuelve a poner. Se reprodujo por paridad. Propongo un `/rapido` o un ticket aparte.
4. `src/lib/tareas/secreto.ts` importa `next/navigation`, y a través del middleware mete `next` en la función de Astro. Es deuda para T-027.
5. "404" no se pudo reservar en `SEGMENTOS_RESERVADOS` sin tocar `src/lib/`. Como compensación, la prueba exige que ningún slug del catálogo sea "404".
6. Un 500 en Astro mostraría la página de error del marco (en Next también era la por defecto). Propongo una `500.astro` en español.
7. Los PNG de `reports/` son artefactos de revisión binarios: el validador decide si se commitean.

## Cómo reproducir

```
npx prisma dev --name <propio> -d   # y exporta su DATABASE_URL
npm ci && npm run lint && npm run typecheck
DATABASE_URL=postgresql://nadie:nadie@127.0.0.1:1/ninguna npm run build
npm test
# diff: ver el encabezado de scripts/diff-html.mjs
```

## Corrección M1 (c-seguridad.md)

- `src/pages/500.astro` (dinámica, `noindex`, sin medir, estilo de `NoEncontrado`): Astro la pinta pasando por el middleware, así que el 500 por excepción lleva las cuatro y el `Cache-Control` dinámico. Verificado en la salida de Vercel con `scripts/servir-salida-vercel.mjs` y base inalcanzable: `/`, `/sitemap.xml` y `/500` → 500 con las cuatro; cuerpo sin la clave ficticia ni traza. No hizo falta tocar `cabeceras-en-la-cdn` (la 500 va por `_render`).
- Pruebas: los `it.fails` de M1 pasan a `it` en `tests/astro-seguridad-adversarial.test.ts` (+ cuerpo en español sin traza); render de la página en `tests/plataforma-astro-paginas.test.ts`. Guardianes ajustados: exclusión de medición, `noindex` permitido y "500" como segmento propio de Astro. Queda `it.fails` solo el 403 de `checkOrigin` (T-024).
- Diferencias aceptadas: `GET /500` directo responde 500 con esta página (Next daba 404); `/sitemap.xml` caído responde HTML. Sin diff de HTML: Next no tenía página de error propia con la que comparar.
- La cita del aviso de `satori` en "Dependencias" quedó corregida (obs. 9). Cierre: lint, typecheck, build sin base y `npm test` (121 archivos, 3409 + 1 expected fail) en verde; base `dev023m1` detenida.
