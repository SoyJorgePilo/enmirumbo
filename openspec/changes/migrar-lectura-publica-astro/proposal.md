# Propuesta: migrar-lectura-publica-astro

**Ticket:** `docs/tickets/T-023-astro-lectura-publica.md` (P1, épica E9)
**PRD:** v2 §10 (lo técnico es reemplazable si §2–§7 quedan intactos; las specs consolidadas son el contrato de cualquier reescritura)
**Decisión que ejecuta:** `docs/decisiones/ADR-013-migracion-astro.md`, Fase 2. Aprendizajes: `docs/decisiones/ADR-013-spike.md` y el change `agregar-andamio-astro` (PR #31, aún sin mergear; esta rama se apila sobre él).

## Por qué

ADR-013 migra el marco web por fases, sin cambio de comportamiento, y la Fase 2 traslada a Astro toda la superficie pública de lectura (T-023, contexto). El ticket pide que los scenarios de `directorio-publico`, `layout-base` y `paginas-legales` sigan en verde, que el HTML no difiera del de Next en contenido, enlaces, `<meta>` ni JSON-LD, y que las cabeceras de seguridad sean idénticas en páginas dinámicas, prerenderizadas y 404 (T-023, criterios). La fase completa toca 13 rutas, un middleware, una integración de build, la imagen de vista previa y unos 30 archivos de pruebas que hoy importan `src/app/`: demasiado para revisarlo en un solo PR.

## Partición propuesta (Fase 2 en dos changes)

| Change | Alcance | Por qué en este orden |
|---|---|---|
| **2a · este change** (`migrar-lectura-publica-astro`) | Armazón: documento base y tronco medido (layouts), resolución de metadatos, middleware de cabeceras y la integración de cabeceras en la CDN, avisos de arranque. Rutas: `/` (home), `/aviso-de-privacidad`, `/terminos`, 404, `/robots.txt`, `/sitemap.xml`, `/opengraph-image`. Herramientas: script de diff de HTML y servidor local de la salida de Vercel | Todo lo de 2b se monta sobre este armazón. La home entra aquí para que el wordmark del header y el "Ir al inicio" de la 404 lleven a una página que exista en la build de Astro |
| **2b · siguiente change** (propuesto: `migrar-directorio-publico-astro`) | `/[destino]` (categoría, giro, giro+colonia), `/negocio/[ficha]` con JSON-LD y Open Graph propio, `/buscar`, `/api/foto/[clave]/[variante]`, la 404 dentro del tronco medido y la precarga de la foto prioritaria | Es la parte con base de datos, fotos y datos estructurados. Hereda de 2a el diff, las cabeceras y los metadatos ya probados |

Este change especifica **solo 2a**. Las decisiones técnicas de 2b se dejan resueltas en `design.md` (§2, §4 y §8) para que su spec no tenga que reabrirlas.

## Qué cambia (2a)

- **Layouts de Astro**: un documento base (`lang="es-MX"`, header, `main`, footer, hoja de estilos) y un tronco público que además inyecta la medición. La 404 usa solo el documento base, igual que hoy. Los componentes de React se pintan en servidor sin directiva `client:`.
- **Metadatos**: las páginas siguen armando sus metadatos con `src/lib/seo/` (sin cambios). Un componente propio los convierte en las mismas etiquetas que emite Next, con su plantilla de título y su forma de combinar el layout y la página.
- **Cabeceras**: el middleware pone las cuatro de `cabecerasDeSeguridad()` en todas las respuestas que pasan por la función. Una integración de build las copia a `config.json` para lo que sirve la CDN: páginas prerenderizadas, 404, `/_astro/*` y la imagen de marca. El `Cache-Control` de lo dinámico queda igual que hoy.
- **`robots.txt` y `sitemap.xml`** como endpoints dinámicos, con el mismo cuerpo y el mismo tipo de contenido que hoy.
- **Imagen de marca** en la misma dirección `/opengraph-image`. Se genera **al construir** con `satori` + `@resvg/resvg-js` y la tipografía que hoy usa `next/og`. Ya no se renderiza por petición.
- **Diff de HTML**: script que pide las rutas migradas a la build de Next (rama `main`) y a la de Astro, con la misma base semilla y el mismo entorno. Normaliza el ruido de cada marco y compara estado, cabeceras, texto, estructura, enlaces, `<meta>` y JSON-LD.
- **Pruebas**: las que hoy importan `src/app/` para estas rutas pasan a apuntar a las páginas de Astro con las mismas aserciones. Se agregan guardianes de cabeceras, de cero JS propio y de la exclusión de la medición.
- **Ningún texto de UI, ruta, consulta, cabecera ni dato público cambia.** `src/lib/` y `src/components/` no se tocan. `src/app/` sigue inerte hasta el corte (T-027).

## Capacidades afectadas

- **`plataforma-astro`**. ADDED: paridad del armazón y de las rutas de 2a. MODIFIED: requirement "Los componentes no dependen de Next para enlaces e imágenes" (letra de `fetchpriority`, ver abajo).
- **Enmiendas de letra, sin cambio de comportamiento** (MODIFIED, cada una en su delta). Ninguna edita `openspec/specs/`: se aplican al archivar.
  - `layout-base`: "Server Component con documento en es-MX y metadata base" y "Un solo script diferido y cero JavaScript propio de cliente". Cambia "Server Component"/`"use client"` por una redacción que no depende del marco.
  - `paginas-legales`: "Las páginas legales son Server Components mobile-first sin JavaScript de cliente", con la misma enmienda.
  - `directorio-publico`: "Directorio en Server Components, mobile-first y usable sin JavaScript", con la misma enmienda. Se adelanta a 2b porque la redacción neutral es verdad con los dos marcos.
  - `despliegue`: "El build de producción no necesita la base de datos". Dice "`next build`" y el build ya es `astro build` desde T-022.
- Los encabezados de los requirements se conservan aunque digan "Server Component(s)": otras specs los citan por nombre. Renombrarlos (RENAMED) queda para el corte.

### Decisión sobre `fetchpriority` (MODIFIED en `plataforma-astro`)

El scenario "la foto se pinta igual" (change `agregar-andamio-astro`) pide `fetchpriority="high"` en la foto prioritaria, pero `next/image` 16.3.3 no lo emite: solo quita `loading="lazy"`, y React 19 antepone `<link rel="preload" as="image">`. La capa `Imagen` sigue a Next.

- **Opción A (recomendada):** corregir la letra para que diga lo que Next emite de verdad: sin `loading` en la prioritaria y sin `fetchpriority`. Respeta "sin cambio de comportamiento" y deja el diff limpio.
- **Opción B:** agregar `fetchpriority="high"` a `Imagen`. Es una mejora de rendimiento, pero cambia el HTML de producción dentro de una migración. Si se quiere, que vaya en un ticket propio después del corte.

Si el PR #31 sigue abierto cuando se apruebe esto, lo más limpio es corregir la letra allí mismo y quitar este MODIFIED.

### Variables de la medición (`NEXT_PUBLIC_UMAMI_*`): sin enmienda en 2a

`ScriptAnalitica` se pinta en el servidor, así que las variables nunca tienen que llegar a un bundle de cliente. En Astro se leen igual, con `process.env`: en tiempo de ejecución las páginas dinámicas y al construir las prerenderizadas. Es la misma semántica de hoy (en Vercel, cambiar una variable ya exige redesplegar). Los requirements que las nombran siguen siendo verdad. **Recomendación:** no renombrar en 2a y proponer el cambio de nombre (`PUBLIC_UMAMI_*` o nombres neutros) en el corte (T-027), junto con Vercel, `.env.example` y `docs/despliegue.md`. El texto de esa enmienda está en `design.md` §7.

## Impacto en código (alto nivel)

- **Nuevo:**
  - `src/layouts/` (documento base y tronco público).
  - `src/astro/` (resolución de metadatos, cabeceras, integración de cabeceras en la CDN, generación de la imagen de marca y su tipografía con su licencia).
  - `src/middleware.ts`.
  - `src/pages/`: `index.astro`, `aviso-de-privacidad.astro`, `terminos.astro`, `404.astro`, `robots.txt.ts`, `sitemap.xml.ts` y `opengraph-image.ts`.
  - `scripts/diff-html.mjs` y `scripts/servir-salida-vercel.mjs` (el emulador del spike, trasladado), más sus pruebas.
- **Modificado:**
  - `astro.config.mjs` (integración de cabeceras).
  - `package.json` y `package-lock.json` (`satori`, `@resvg/resvg-js`, `node-html-parser` o similar para el diff).
  - Las pruebas que importan `src/app/` para las rutas de 2a, re-apuntadas a Astro sin perder aserciones: unos 18 archivos; la lista se arma en `tasks.md` #1 y se re-apunta en #15.
- **Sin tocar:** `src/lib/`, `src/components/`, `src/app/`, `next.config.ts`, `vercel.json`, `prisma/`, `openspec/specs/`, `spikes/`.

## Fuera de este change

- **Change 2b** (siguiente): `/[destino]`, `/negocio/[ficha]`, `/buscar`, `/api/foto/[clave]/[variante]`, la 404 dentro del tronco medido, la precarga de la foto prioritaria (React la emite en línea al pintar con Astro: verificar dónde acaba) y las pruebas de esas rutas (unos 29 archivos).
- **Fase 3 (T-024):** el `403` de `checkOrigin`. Rechaza un POST de formulario de otro origen **antes** del middleware, en inglés y sin las cuatro cabeceras (`node_modules/astro/dist/core/middleware/load.js`: el middleware de origen va delante del nuestro). En 2a ninguna ruta acepta POST, pero cualquier ruta por función puede devolver esa respuesta. Hasta que la Fase 3 decida, es una respuesta del sitio sin cabeceras: brecha conocida que no llega a `main` antes del corte.
- La política de referente estricta por prefijo (`/admin`, `/editar`) y su `<meta>`: fases 4 y 5. Este change solo garantiza que la cabecera global no pisa una más estricta.
- Renombrar las variables `NEXT_PUBLIC_UMAMI_*` y los encabezados de requirement que dicen "Server Component(s)": T-027.
- Descubierto al escribir la spec, sin especificar aquí:
  - `/_astro/client.*.js` (191 KB, runtime de islas) se sigue emitiendo aunque nadie lo cargue (b-dev de T-022).
  - `ci.yml` sin `permissions:` y la telemetría de Astro en CI (informativos de c-seguridad de T-022).
  - `next` 16.3.3 en `main` con el aviso crítico GHSA-vcvr-r3jv-pc5j (RCE en `next/og`). Afecta a producción hoy: corresponde un `/rapido` en `main`, independiente de esta migración.
