# Propuesta: agregar-seo-local

**Ticket:** `docs/tickets/T-009-seo-local.md` (E5-1, E5-2, E5-3, E5-5, E4-3; P0)
**PRD:** §8 SEO local ("Páginas indexables por giro y por giro+colonia (ej. /plomeria-haciendas-de-tizayuca), con URLs limpias y geolocalizadas, **generadas desde el catálogo cerrado de giros que el admin asigna al aprobar** (Apéndice B) — las palabras clave libres del negocio no generan páginas […] También hay páginas por categoría"; "Schema Markup LocalBusiness en cada ficha, con expectativa realista: al publicar colonia (no dirección exacta) y horario en texto libre, el markup será parcial; el horario estructurado queda para fases posteriores (§12)"; "La cola larga '[giro] en Tizayuca' / '[giro] en [colonia]' es la vía realista para que el directorio aparezca en Google sin pelear el Local Pack de Maps"), §6.5 ("Oportunidad SEO sin competencia: páginas indexables tipo 'clases de futbol en Tizayuca', 'box en Tizayuca'"), §6.2, §8 rendimiento (<2s en 4G), §10 (visitantes únicos semanales como métrica)

## Por qué

El SEO local es el canal de adquisición que el PRD eligió para no pagar publicidad, y hoy no existe: el sitio tiene URLs limpias por categoría pero ninguna página que responda a "plomero en Tizayuca" ni a "clases de futbol en Tizayuca", ninguna ficha emite datos estructurados, no hay `sitemap.xml` ni `robots.txt`, y todas las páginas heredan el mismo título y la misma descripción del sitio — así que en un resultado de Google (y en la vista previa de WhatsApp, que es como se comparten las fichas) todas se ven idénticas. Este change construye la cola larga del PRD §8 sobre lo que ya existe: los tres catálogos con slug estable, los giros que el admin asigna al aprobar y el directorio público de T-004/T-006.

## Qué cambia

- **Páginas por giro en la raíz** (`/plomeria`, `/futbol`): listan los negocios publicados que tienen ese giro asignado, sin importar su categoría, con la misma tarjeta y el mismo orden del listado por categoría. Encabezado "«Frase del giro» en Tizayuca".
- **Páginas por giro y colonia** (`/plomeria-haciendas-de-tizayuca`): mismo listado, acotado a una colonia del catálogo. Encabezado "«Frase del giro» en «Colonia», Tizayuca".
- **Los tres tipos de URL de la raíz conviven en un solo segmento dinámico** que resuelve contra los catálogos en orden fijo — categoría, giro, giro+colonia — y responde 404 si el slug no está en ninguno. **Ninguna URL de categoría ya publicada cambia** (`/servicios-del-hogar` sigue siendo la misma URL; solo cambia el nombre de la carpeta de la ruta). Ver `design.md` §1 y §2: es la decisión técnica central del ticket.
- **Frases curadas para los giros deportivos (E4-3):** el catálogo dice "Futbol", pero la búsqueda que el PRD §6.5 quiere capturar es "clases de futbol en Tizayuca". Una tabla curada en código traduce el nombre del catálogo a la frase del título ("Clases de futbol", "Gimnasios", "Clases de taekwondo y artes marciales"); los giros sin entrada usan su nombre tal cual.
- **Nada de thin content:** las combinaciones sin negocios publicados no se enlazan ni entran al sitemap y declaran `noindex`, pero **responden 200 con un estado vacío útil**, no un 404 confuso (el ticket lo pide explícito).
- **Schema.org LocalBusiness (JSON-LD) en cada ficha publicada**, con la expectativa realista del PRD §8 citada en la spec: nombre, URL, colonia (nunca domicilio exacto), categoría y giros, y la foto cuando exista. Sin horario estructurado (§12) y **sin teléfono ni WhatsApp** (`design.md` §6, hallazgo M5 de T-004).
- **`sitemap.xml` y `robots.txt`** con las convenciones de App Router de Next 16 (`app/sitemap.ts` y `app/robots.ts`), generados de la base sin intervención manual. `robots.txt` permite lo público y excluye `/admin`, `/buscar` y `/registro/gracias`.
- **Metadata propia por página:** título y descripción para listados de categoría, páginas de giro, giro+colonia y fichas; canónica en cada página indexable (el listado con `?colonia=` canoniza al listado sin filtro, para no duplicar contenido con las páginas de giro+colonia); plantilla de título "%s — NecesitoUno" y `metadataBase` tomada de la variable `SITIO_URL` que ya usa el panel.
- **Open Graph en la ficha** (título, descripción, URL, imagen): la foto del negocio si existe —el campo `fotoUrl` ya está en el modelo y lo llenará T-008— y si no, una imagen de marca del propio sitio generada con `next/og` (sin dependencias nuevas).
- Todo en Server Components, sin JavaScript de cliente nuevo y sin dependencias nuevas.

## Capacidades afectadas

- `directorio-publico` (MODIFIED + ADDED): cómo resuelve la raíz sus tres tipos de URL (modifica el requirement del listado por categoría, que hoy afirma que cualquier slug fuera del catálogo de categorías es 404), las páginas de giro y giro+colonia, el trato de las combinaciones sin contenido, los enlaces de ficha→giro→giro+colonia que hacen rastreables esas páginas, la metadata por página, el Open Graph de la ficha y el JSON-LD.
- `layout-base` (MODIFIED + ADDED): la metadata base del documento suma `metadataBase`, plantilla de título e identidad de Open Graph; y aparecen dos artefactos nuevos del sitio, `robots.txt` y `sitemap.xml`.
- `modelo-datos` (ADDED): los tres catálogos no pueden producir URLs ambiguas en la raíz (ningún giro que se llame como una categoría o como una ruta propia, ningún compuesto giro+colonia que se lea de dos maneras). No hay migración ni campos nuevos: es una invariante verificada sobre los catálogos ya sembrados.

## Impacto en código (alto nivel)

- `src/app/[categoria]/` se renombra a `src/app/[destino]/` y pasa a delegar en el listado que corresponda según el catálogo que resuelva el slug. En App Router no pueden coexistir dos segmentos dinámicos con distinto nombre en el mismo nivel, así que **la unificación no es una preferencia de estilo: es la única forma de tener `/[categoria]`, `/[giro]` y `/[giro]-[colonia]` en la raíz** (`design.md` §1).
- Módulo nuevo `src/lib/seo/` con: el resolvedor de la raíz contra los tres catálogos, la tabla de frases de los giros y el armado de títulos/descripciones/canónicas. Módulo puro, probado sin base.
- `src/lib/directorio.ts` suma las consultas de giro (negocios publicados por giro y por giro+colonia, colonias con contenido para un giro, giros de un negocio publicado, y los conjuntos que alimentan el sitemap), con el mismo filtro `estado: publicado` por construcción y la misma proyección de campos públicos.
- Rutas nuevas `src/app/robots.ts`, `src/app/sitemap.ts` y `src/app/opengraph-image.tsx`; `generateMetadata` en las páginas del directorio; JSON-LD en `src/app/negocio/[ficha]/page.tsx`.
- `src/lib/rutas-reservadas.ts` gana la verificación cruzada de catálogos; `tests/layout.test.ts` amplía su lista blanca de rutas con las de giro (que se resuelven del catálogo, como las de categoría).
- `.env.example` y el README documentan `SITIO_URL` como requisito para el sitemap y las canónicas.
- Sin dependencias nuevas, sin migraciones, sin tocar la base.
- **Conflicto esperado y asumido** (el ticket lo anota): T-008 toca la misma ficha para la foto. La foto entra en el Open Graph y en el JSON-LD de este change leyendo `fotoUrl`, que ya existe en el modelo; si T-008 mergea primero, no hay nada que cambiar aquí.

## Fuera de este change

- **Rendimiento medido (E5-4):** este change no degrada el presupuesto (Server Components, cero JS nuevo), pero la medición con Lighthouse se hace con el deploy (E0-3).
- **Fricción real contra la cosecha masiva del directorio (E5-5, hallazgo M5 de T-004):** `robots.txt` es una petición, no una defensa; el rate limit de lectura sigue siendo deuda de E0-3.
- **Analítica de tráfico orgánico (E7):** sin ella, el efecto de estas páginas no se puede medir todavía.
- **Canonicals multi-ciudad y `hreflang`:** una sola ciudad en el MVP.
- **`/registro` y las páginas legales en el sitemap:** el ticket enumera qué entra (home, categorías, giros/giro+colonia con contenido, fichas) y esto no está en la lista; T-007 corre en paralelo. Es una línea de seguimiento, no un cambio de diseño (ver dudas).
- **Un índice navegable de giros por categoría** ("todos los giros de Servicios del hogar"): las páginas de giro quedan rastreables desde las fichas y desde el sitemap; un índice propio es una pantalla nueva que el ticket no pide, y hoy no existe relación giro↔categoría en el modelo.
- **Tipos de Schema más específicos por categoría** (Restaurant, SportsActivityLocation…): el PRD §8 dice LocalBusiness; afinarlo sin poder verificar el giro real de cada negocio arriesga marcar mal una ficha.
- **Horario estructurado (`openingHours`)** en el JSON-LD: el PRD §8 lo manda explícitamente a fases posteriores (§12) porque el horario se captura en texto libre.
- **Google Business Profile del propio directorio** (PRD §8): es una tarea humana fuera del código.
- **Que la ficha se regenere al aprobar (ISR):** hoy todo el directorio lee la base por request; cuando E0-3 defina hosting se podrá revisar.

## Dudas resueltas en la aprobación

1. **Colonias que ya dicen "Tizayuca"**: aprobada la desviación — se omite el ", Tizayuca" final en esos 5 casos. "Plomería en Haciendas de Tizayuca" es el título correcto; la fórmula del ticket era la regla general, no una obligación de redundancia.
2. **`telephone` en el JSON-LD**: aprobado NO emitirlo. Publicar el número en formato máquina contradice la mitigación de cosecha masiva (M5 de T-004); el botón de WhatsApp ya es el canal.
3. **`SITIO_URL`**: aprobado fallar a la vista (sitemap vacío y sin canónicas absolutas si falta) — se suma a la lista de variables-requisito de E0-3. El sitemap incluye `/registro` desde ya; las páginas legales de T-007 (paralelo) se agregan con un ajuste de una línea tras su merge — anotado como deuda pequeña en el PR.
