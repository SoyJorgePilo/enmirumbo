# Propuesta: migrar-directorio-publico-astro

**Ticket:** `docs/tickets/T-023-astro-lectura-publica.md` (P1, épica E9). Es el segundo change del ticket. El primero es `migrar-lectura-publica-astro` (2a, PR #32).
**PRD:** v2 §10. Lo técnico se puede reemplazar si §2–§7 quedan intactos, y las specs consolidadas son el contrato de cualquier reescritura.
**Decisión que ejecuta:** `docs/decisiones/ADR-013-migracion-astro.md`, Fase 2 (mitad 2b). Las decisiones técnicas ya resueltas están en `openspec/changes/migrar-lectura-publica-astro/design.md`, §2, §4 y §8. Los hallazgos para 2b salen de `reports/b-dev.md` (hallazgos 1, 2 y 5) y de `reports/d-validacion.md` (desviación de letra 1, hallazgos bajos 4 y 5, candidatos a ticket).
**Rama:** `feature/astro-directorio-publico`. Va apilada sobre `feature/astro-lectura-publica` (PR #32), que a su vez va sobre el andamio (PR #31). Nada llega a `main` antes del corte (T-027).

## Por qué

T-023 pide trasladar a Astro toda la superficie pública de lectura sin cambiar comportamiento. Con 2a ya están en Astro el armazón, la home, las legales, la 404 global, robots, sitemap y la imagen de marca. Falta la parte con base de datos, fotos y datos estructurados: `/[destino]`, `/negocio/[ficha]`, `/buscar` y `/api/foto/[clave]/[variante]` (T-023, contexto; ADR-013, Fase 2). Los criterios del ticket son tres: los scenarios de `directorio-publico` y `layout-base` en verde, un diff de HTML contra Next sin diferencias y las mismas cabeceras en todas partes. Esta mitad cierra la Fase 2.

## Qué cambia

- **Páginas nuevas en Astro**, todas dinámicas y dentro de `TroncoPublico`. Usan los componentes de `src/components/` sin directiva `client:`.
  - `src/pages/[destino].astro`: categoría, giro y giro+colonia. Usa `resolverDestinoDeLaRaiz` y el filtro `?colonia=`.
  - `src/pages/negocio/[ficha].astro`: ficha con JSON-LD y su propio Open Graph.
  - `src/pages/buscar.astro`: título estático y `noindex`.
- **Endpoint** `src/pages/api/foto/[clave]/[variante].ts`. Llama a `servirFoto` sin cambios. Conserva el 404 vacío, las claves opacas y el `Cache-Control` de hoy.
- **404 de las rutas dinámicas: página de no encontrado sin medición** (alternativa B, `design.md` §1). Hoy Next responde a `notFound()` dentro de `[destino]` y `[ficha]` con un documento de error de `<body>` vacío, y es su JavaScript el que después pinta "No encontramos esta página". Astro va a pintar esa página desde el servidor:
  - `NoEncontrado` dentro de `DocumentoBase`, con estado 404, `noindex` y las cuatro cabeceras;
  - **sin medición**, con el motivo escrito, igual que hoy, que no se miden;
  - sin ningún dato de la petición ni del negocio, así que una ficha no publicada y una inexistente responden idéntico.
- **Lo que 2a dejó pendiente:**
  - Las URLs de `sitemap.xml` y los enlaces internos ya resuelven en la build de Astro.
  - El diff corre con `--incluir-2b` y tiene que salir en cero.
  - `"404"` y `"500"` entran a `SEGMENTOS_RESERVADOS`.
  - Se corrige la letra del scenario "URL desconocida" de 2a (MODIFIED abajo).
- **Precarga de la foto prioritaria:** la misma `<link rel="preload" as="image">` que emite Next, en el mismo lugar del documento (ver la decisión 2 abajo).
- **Pruebas:** unos 29 archivos que hoy importan `src/app/` para estas rutas pasan a apuntar a Astro sin perder aserciones. Además se agregan fixtures de la 404 dinámica de Next y pruebas adversariales de la ruta de fotos contra la build.
- **Ningún texto de UI, URL, consulta, cabecera ni dato público cambia.** La única diferencia es que el `<body>` de las 404 dinámicas ahora lo manda el servidor.

## Decisiones del fundador (por delegación)

1. **404 dinámicas: alternativa B, no paridad exacta del `<body>` vacío.** La paridad exacta dejaría la página en blanco para quien hoy ve el mensaje gracias al JS de Next, que es casi todo el tráfico. Además dejaría de cumplir cuatro scenarios de `directorio-publico` ("slug que no está en ningún catálogo", "compuesto que no existe", "ficha inexistente" y la parte de "ve la página 404 en español" de "ficha de un negocio no publicado") y la 404 de `layout-base` ("Página 404 en español dentro del layout"). Con la alternativa B se cumplen todos, ahora también sin JS.
   - Lo que **sí** cambia contra Next es el HTML que sale del servidor en esas URLs. El diff con `--incluir-2b` acepta solo tres normalizaciones explícitas en esas URLs: el `<body>`, comparado contra el de Next en `/a/b/c`; la hoja de estilos; y `lang`/`class` del `<html>` (`design.md` §1, punto 6). Cualquier otra diferencia se reporta.
   - Se conservan la ausencia de medición y la indistinguibilidad entre "no existe" y "no está publicada".
2. **Precarga de la foto:** si no se puede igualar sin tocar `src/components/`, el dev lo reporta y la diferencia de posición se acepta como documentada. **No** se autorizan cambios a la capa `Imagen` (`design.md` §2).
3. **Enlaces a `/registro` y `/negocio/<…>/reportar`:** esperan a la Fase 3. En 2b responden la 404 global, el guardián de enlaces los trata como excepción explícita y no se crean páginas provisionales (`design.md` §8).

## Capacidades afectadas

- **`plataforma-astro`**
  - ADDED: paridad de `/[destino]`, `/negocio/[ficha]`, `/buscar` y la ruta de fotos (HTML, metadatos, JSON-LD, cabeceras, caché, precarga, medición y su exclusión), 404 dinámicas, despublicadas, rutas reservadas, enlaces y sitemap, y dureza de las pruebas.
  - MODIFIED: "La 404 responde igual que en Next". Lo introdujo el change 2a, que todavía no se archiva. `/no-existe` deja de ser la 404 global porque ahora la resuelve `[destino]`.
- **Sin MODIFIED a `directorio-publico`, `layout-base` ni `analitica`:** sus requirements siguen siendo el contrato y con la alternativa B se cumplen, también sin JS. No se edita `openspec/specs/`.

## Impacto en código (alto nivel)

- **Nuevo:**
  - `src/pages/[destino].astro`, `src/pages/negocio/[ficha].astro`, `src/pages/buscar.astro` y `src/pages/api/foto/[clave]/[variante].ts`.
  - `src/astro/componentes/NoEncontradoDinamico.astro`: sin props, pinta `NoEncontrado` dentro de `DocumentoBase` con metadatos constantes y sin medición.
  - Fixtures de Next para la 404 dinámica, la ficha, el giro vacío y `/buscar`.
- **Modificado:**
  - `src/lib/rutas-reservadas.ts`: solo agrega `"404"` y `"500"` a la lista. Es la única excepción a "no tocar `src/lib/`" y se justifica en `design.md` §5.
  - `scripts/diff-html.mjs`: la lista de 2b pasa a ser parte del alcance, y se suma la lista explícita `NORMALIZACIONES_404_DINAMICA`, de tres entradas.
  - Los ~29 archivos de pruebas de estas rutas y los guardianes que recorren `src/pages/`.
- **Sin tocar:** `src/components/`, `src/app/`, `src/lib/fotos/*`, `src/lib/directorio.ts`, `src/lib/seo/*`, `next.config.ts`, `vercel.json`, `prisma/`, `openspec/specs/` y `spikes/`.

## Fuera de este change

- **Barra final:** Next responde `308` en `/plomeria/` y `/negocio/x-1/`, y Astro responde `200` con la misma página y la misma canónica (hallazgo bajo 4 de la validación de 2a). Va a T-027, junto con `trailingSlash`.
- **Enlaces de la ficha a rutas de fases posteriores:** `/negocio/<…>/reportar` (Fase 3, T-024) y `/registro` responden la 404 global en la build de Astro hasta su fase, por la decisión 3. El HTML de la ficha no cambia. Ningún vecino lo ve porque nada llega a `main` antes del corte.
- **Marca repetida en los títulos** ("… — EnMiRumbo — EnMiRumbo"): se reproduce por paridad donde Next la emite, incluido `/buscar` si así lo mide el diff. El arreglo va por `/rapido` en `main`.
- **`/admin/foto/…`**: Fase 5.
- **`src/lib/tareas/secreto.ts`**, que importa `next/navigation`, y el renombre de `NEXT_PUBLIC_UMAMI_*`: T-027.
