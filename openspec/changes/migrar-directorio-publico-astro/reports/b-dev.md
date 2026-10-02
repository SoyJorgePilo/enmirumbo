# Etapa B · dev — migrar-directorio-publico-astro (T-023, Fase 2b)

No hubo etapa UI (no existe `a-ui.md`). La spec se aprobó por delegación con estas decisiones: alternativa B para la 404 dinámica, la precarga sin tocar `Imagen`, y `/registro` y `/reportar` en la Fase 3.

## Resumen

Se agregaron en Astro `/[destino]`, `/negocio/[ficha]`, `/buscar`, `/api/foto/[clave]/[variante]` y la 404 dinámica (`NoEncontradoDinamico`, sin medición). **El diff contra Next de `main` da cero diferencias en 74 rutas, sin medición (A) y con ella (B), y en 47 en producción sin `SITIO_URL` (C).** Las tres normalizaciones de la 404 dinámica se aplicaron solo en sus URLs. La precarga quedó igualada sin tocar `src/components/`, así que no hay diferencia de posición que aceptar. Lint, typecheck, build sin base y `npm test` salen en verde. De `src/lib/` solo cambió la línea de `rutas-reservadas.ts`.

## Línea base (tarea 1) y resultado

| | Archivos | Pruebas |
|---|---|---|
| Antes (HEAD, base `prisma dev --name pruebas023b`) | 121 | 3409 pasan, 1 expected fail, 2 saltadas |
| Después | 125 + `tests/salida-astro.ts` y `tests/paginas-directorio.ts` (ayudantes) | ver "Compuertas" |

Hay 29 archivos que importaban o leían rutas 2b de `src/app/`. Este es su conteo de `expect(` (antes → después). Ninguno baja y no hay `skip` nuevos:
- admin-adversarial 176→176, analitica-directorio 35→35, analitica-adversarial 51→52, analitica-privacidad 22→22
- buscador-adversarial 25→25, buscador-seguridad-adversarial 141→141, buscador-pagina 60→60
- directorio-enlaces 39→39, directorio-despublicado 48→48, foto-render 43→43, directorio-adversarial 117→117
- foto-seguridad-adversarial 91→91, fotos-ruta 21→21, directorio-paginas 122→122
- gestion-privacidad 13→13, gestion-seguridad-adversarial 151→151, layout 144→158, legales-adversarial 50→50, marca-guardian 17→17
- reportes-privacidad 30→30, reportes-seguridad-adversarial 139→139, reportes-pagina 83→83, responsivo-guardian 20→20
- seo-jsonld 27→28, seo-metadata 46→46, seo-iteracion2 34→34, seo-seguridad-adversarial 165→165, seo-paginas 63→63, tareas-programadas 15→15

Guardianes extendidos: analitica-exclusion-admin 59→62, directorio-consultas 64→69, plataforma-astro-build 40→55, astro-cabeceras-cdn 16→18 y diff-html 32→49.

Ya no queda ningún `import` de `src/app/(publico)/[destino]`, `negocio/[ficha]/page`, `buscar` ni `api/foto` en `tests/`. Queda una sola mención, y no es un import: es la ruta del `page.tsx` inerte de Next en la lista blanca de `noindex` de `buscador-pagina` (ese archivo sigue existiendo hasta T-027).

## Tareas

| # | Estado | Nota |
|---|---|---|
| 1–2 | [x] | Fixtures `tests/fixtures/next-2b/{con,sin}-sitio-url/` capturados con `diff-html.mjs --capturar-2b`, con `<id>` y `<clave>` anonimizados. Next manda `lang` ausente (`<html id="__next_error__">`) y `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`; el título de `/buscar` es **"Buscar — EnMiRumbo — EnMiRumbo"** |
| 3–4 | [x] | Se vieron en rojo por la ausencia de las rutas: `plataforma-astro-404-dinamica` (10) y `fotos-ruta-salida` (10, más 1 `it.fails` de T-024) |
| 5 | [x] | Mutación: sin la línea, 4 pruebas reprueban. Revertida |
| 6 | [x] | Medido: React dentro de Astro **no emite** la precarga, ni en línea ni en el `<head>`. `DocumentoBase` la pone después del `viewport` con `urlDeFoto`, en el mismo lugar que Next. `git diff src/components/` vacío |
| 7 | [x] | Además de `GET`: `HEAD` y `ALL` (`OPTIONS` → 204 con `Allow`, el resto → 405), que es lo que respondía Next (ver Decisiones) |
| 8 | [x] | Mutaciones: el componente sin motivo hace reprobar 2 pruebas (revertido). "Un `<meta>` de más" queda como prueba fija en `diff-html.test.ts` |
| 9–11 | [x] | Correcciones anotadas en tasks.md: la lectura de `?colonia=` y dónde quedan los metadatos |
| 12–15 | [x] | Pruebas nuevas y re-apuntadas; ver el mapa |
| 16 | [x] | Abajo |
| 17 | [x] | Lighthouse 13.4.1 móvil con el emulador: `/servicios-del-hogar` 100 (FCP 0.9 s, LCP 1.1 s, TBT 0, CLS 0) y la ficha con foto 100 (LCP 1.2 s). Es indicativo hasta el preview |
| 18 | [x] | Ver "Compuertas" |
| 19 | [~] | Paso humano: preview de Vercel |
| 20 | [ ] | PR (lo abre el validador) |

## Diff (tarea 16)

Next de `main` (`git archive main` en el scratchpad; solo lectura del repo) con `next start`, contra la salida de Astro servida por el emulador. Las dos versiones usaron la misma base `prisma dev --name paridad023b`, sembrada con `db:seed` y `db:seed:demo` más tres negocios ficticios con foto (en revisión, rechazado y despublicado). Las dos se construyeron con el mismo entorno en cada variante.

**Fotos en modo producción:** Next y Astro exigen Supabase. Para eso se usó un Storage **falso** en HTTPS local que sirve `FOTOS_DIR`, con certificado autofirmado en `NODE_EXTRA_CA_CERTS` y una llave ficticia. El script vive en el scratchpad y no se versiona.

```
A (SITIO_URL, sin medición) y B (+ NEXT_PUBLIC_UMAMI_*): "Cero diferencias en 74 rutas." (exit 0, las dos)
Medidas como 404 dinámica de Next (documento de error de `[destino]`): /negocio, /api
- cuerpo-contra-a-b-c: 11 → /no-existe, /loquesea, /plomeria-colonia-inventada, /negocio/inexistente,
  /negocio/sin-identificador, /negocio/x-<inexistente>, /negocio/x-<revisión>, /negocio/x-<rechazado>,
  /negocio/x-<despublicado>, /negocio, /api
- hoja-de-estilos: 11 → (las mismas)      - lang-y-class-del-html: 11 → (las mismas)
C (NODE_ENV=production sin SITIO_URL): "Cero diferencias en 47 rutas." (sin fichas: el sitemap sale vacío)
```

Entraron al diff:
- las 74 rutas: las 7 de 2a y las del sitemap (8 categorías, giros, pares giro+colonia y 10 fichas);
- la colonia válida, la inventada y la repetida;
- el giro vacío y el giro+colonia vacío;
- el enlace viejo;
- 6 de `/buscar`, con la consulta hostil;
- las 9 de la 404 dinámica;
- 16 de fotos: publicada en las dos variantes, `HEAD`, `POST` con `Origin`, `OPTIONS`, `original`, revisión, rechazada, inventada, mayúsculas, `%2F`, `%00`, `..%2F` y `%2e%2e`;
- `/negocio`, `/api` y `/api/foto`.

En B, el script del proveedor sale en las páginas 200 en la misma posición que en Next, y no sale en las 404 dinámicas de Astro. Cuando las dos fotos son 200, el hash y `Content-Length` coinciden.

## Mapa scenario → prueba (`plataforma-astro`, 2b)

| Scenario | Prueba |
|---|---|
| categoría, giro y giro+colonia, ficha, enlace viejo, la categoría le gana al giro | diff A/B; `directorio-paginas`, `seo-paginas` y `directorio-adversarial` (re-apuntadas) |
| metadatos con y sin foto, JSON-LD, lo vacío no se indexa, producción sin URL | `plataforma-astro-directorio` (contra fixtures, con y sin `SITIO_URL`), `seo-metadata`, `seo-jsonld`, diff C |
| `/buscar`: título, noindex y consulta hostil | `plataforma-astro-directorio`, `buscador-*`, `analitica-adversarial`, diff |
| 404 dinámica: los 7 scenarios, más "diferencias acotadas" y "una fuera de la lista reprueba" | `plataforma-astro-404-dinamica` (salida servida), `diff-html.test` (lista exacta y mutaciones), diff A/B |
| despublicar y volver a pedir todo; nada en caché compartida | `plataforma-astro-despublicado` (salida servida), `directorio-despublicado` |
| foto idéntica, los cuatro 404, rutas adversariales, la base cae, el bucket no se asoma | `fotos-ruta-salida` (salida servida), `fotos-ruta` y `foto-seguridad-adversarial` (re-apuntadas), diff |
| precarga de la ficha; listado sin descargas de más | `plataforma-astro-directorio` (medición y 12 negocios), diff |
| la ficha se mide sola; atributos iguales; exclusión sin motivo reprueba | `plataforma-astro-directorio`, `analitica-*`, `analitica-exclusion-admin` (fixture) |
| sitemap sin 404; excepciones de la Fase 3; buscador; slug "404" | `plataforma-astro-build`, `layout` (guardián nuevo), `directorio-consultas` |
| las cuatro en todas partes; cero JS | `plataforma-astro-build` (8 respuestas), `plataforma-astro-directorio` |
| Lighthouse | manual (tarea 17); el preview es humano |
| misma dureza; nada probándose en Next; el diff no toca producto | conteos de arriba, `grep` vacío, `git diff --stat` |

## Decisiones técnicas

- **Lectura de datos fuera de las páginas.** Va en `src/astro/directorio.ts` (`cargarDestino`, `cargarFicha` y `cargarBusqueda`). Las páginas `.astro` solo pintan, y las pruebas obtienen ahí "lo que devolvía `generateMetadata`" (`tests/paginas-directorio.ts`).
- **Los metadatos van en `src/astro/metadatos-directorio.ts`, no en `metadatos.ts`.** El guardián de `despliegue` reprobó cuando estaban en `metadatos.ts`: ese módulo lo usa `DocumentoBase`, y por ahí las prerenderizadas alcanzaban `@/lib/directorio` vía un tipo. El guardián tenía razón y no se tocó.
- **`ALL` en el endpoint de fotos.** Sin él, Astro responde a `POST` con un 404 sin cuerpo y lo reencamina fuera del middleware. Next respondía 405/204. **Sin `Origin`, `POST` sigue saliendo 403 de `checkOrigin`.** Es la brecha conocida de T-024 y queda documentada con `it.fails`, igual que en 2a.
- **`id="__next_error__"` se trata como ruido del marco** en `nucleo.mjs` (`atributos()`), como ya decía su comentario de 2a y el design §1.6. No es una cuarta normalización.
- **`tests/salida-astro.ts`** reutiliza la build solo si la dejó él mismo (lleva una marca) y nada cambió después. Así las pruebas sobre la salida no se ven afectadas por builds manuales con otro `SITIO_URL`.
- **Fotos sobre la build:** el emulador corre con `NODE_ENV=development` para usar el disco de la suite, porque en producción no hay caída al disco. La paridad en producción la cubre el diff.

## Desviaciones y guardianes ajustados (para el validador)

1. **Desviación de letra: `?colonia=` repetida.** La spec dice "se usa el primer valor", pero en Next de `main` (medido) `?colonia=a&colonia=b` **no filtra**. `directorio-adversarial` ya lo fijaba ("repetido → listado completo, 6 tarjetas"). Se implementó la paridad: solo se filtra si hay un único valor, con `getAll`. La spec también exige "igual que hoy" y diff en cero con la colonia repetida, así que la letra "primer valor" se contradice. Propongo corregirla al archivar.
2. **Normalizaciones en `/negocio` y `/api` (medidas, no supuestas).** Next las resuelve con `notFound()` de `[destino]`, es decir, con su documento de error. El script las detecta midiendo `__next_error__` y lo imprime aparte ("Medidas como 404 dinámica"). El design §7 las lista para medirse, no en la viñeta de 404 dinámicas. **El validador decide si lo acepta.**
3. **`plataforma-astro-build` · "/_image responde igual que una ruta que no existe".**
   - Antes: `pedirAlHandler("/ruta-que-no-existe")`.
   - Después: `pedirAlHandler("/ruta/que/no-existe")`, más `expect(inexistente.status).toBe(404)`.
   - Por qué: un solo segmento ahora es `/[destino]`, que necesita la base, y ese handler corre sin base (respondía 500). La aserción de igualdad se conserva y se suma una.
4. **`analitica-exclusion-admin`.** La lista exacta de exclusiones suma `NoEncontradoDinamico.astro`, con su motivo. El recorrido ahora incluye `src/astro/`: todo componente que pinte un documento fuera del tronco debe declarar el motivo, y un fixture sin motivo reprueba. No se quitó nada.
5. **`directorio-consultas`.** "404" y "500" ya no se exceptúan: ahora se exigen reservados, y se conserva la vigilancia sobre el catálogo.
6. **Cabeceras en la CDN** (`cabeceras-en-la-cdn.ts`, fuera de las rutas prohibidas). La ruta `^/([^/]+?)/?$` de `/[destino]` también atrapa `/opengraph-image/` y `/404`. Astro las reconoce como prerenderizadas y respondía **sin pasar por el middleware**, sin las cuatro cabeceras. Lo detectó el guardián de c-seguridad 2a.
   - Se agregan rutas de cabeceras solo para `^/<estático sin extensión>/$` y `^/404/?$`.
   - Un primer intento más amplio lo reprobó el otro guardián de c-seguridad ("no alcanza rutas de la función"), y se acotó.
   - Ese tipo de URL responde ahora 404 con las cuatro. Next respondía 308 (la barra final va a T-027).

## Hallazgos y propuestas (fuera de alcance)

1. **Medición en la 404 dinámica de Next:** en `main`, la carga RSC de `/loquesea` trae el elemento `<script src=…umami…>` del layout `(publico)`. El canario de 2a dice que no se ejecuta al hidratar. Astro no lo trae, que es lo que pide la spec. Lo dejo a la vista por si el validador quiere confirmarlo en un navegador.
2. El título repetido "Buscar — EnMiRumbo — EnMiRumbo" se reprodujo por paridad. Su arreglo va por `/rapido`.
3. `/registro` en 2b ahora pasa por `[destino]`: responde **la 404 dinámica** (mismo cuerpo y `noindex`), no la 404 prerenderizada de 2a. La diferencia es el `Cache-Control` dinámico. El scenario dice "responde igual que en 2a"; en el estado y la página sí, en la caché no. Llega a la Fase 3.
4. `scripts/servir-salida-vercel.mjs` sigue escuchando en todas las interfaces (obs. 4 de c-seguridad 2a). No lo toqué.

## Compuertas

- `npm run lint`: 0.
- `npm run typecheck`: 357 archivos, 0 errores.
- `npm run build` con `DATABASE_URL` a `127.0.0.1:1` y sin `SITIO_URL`: Complete.
- `npm test` (base `pruebas023b`): 125/125 archivos; 3474 pasan, 2 expected fail (el 403 de T-024 de 2a y el `POST` sin `Origin`), 2 saltadas.
  - En la última corrida completa reprobó solo [A1] (3473 pasan). Al repetir el archivo, 90/90.
  - [A2] salió una vez en una corrida parcial y también pasó al repetir.
  - Las dos son las intermitentes preexistentes de cupos; el único cambio en ese archivo es el re-apuntado del pintado de la ficha.
- `git diff --stat`: en `src/lib/` solo `rutas-reservadas.ts` (+1). No hay cambios en `src/components`, `src/app`, `vercel.json`, `prisma/`, `openspec/specs`, `spikes/` ni `next.config.ts`.
- Bases `pruebas023b` y `paridad023b`: detenidas al terminar. Next, el emulador y el Storage falso también se detuvieron.

## Pendientes humanos

- Tarea 19 (preview de Vercel): revisar con `curl` las cuatro cabeceras y el `Cache-Control` en un listado, una ficha, `/loquesea` (que además debe mostrar el texto con JS apagado), una ficha no publicada y una foto publicada y una 404. Además:
  - comprobar `/opengraph-image/` y `/404`, que llevan las cuatro por la ruta de la CDN nueva;
  - repetir Lighthouse.
- Decidir las desviaciones 1 y 2 (colonia repetida; normalizaciones medidas en `/negocio` y `/api`).
