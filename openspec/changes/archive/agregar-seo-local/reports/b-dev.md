# Etapa B (dev) — agregar-seo-local

**Ticket:** `docs/tickets/T-009-seo-local.md` · **Rama:** `feature/agregar-seo-local` (worktree `.claude/worktrees/wt-seo`)
**Etapa A (ui):** saltada con justificación del orquestador. **No hizo falta UI nueva de verdad:** las páginas de giro y de giro+colonia reutilizan íntegros la tarjeta, los chips de colonia y el bloque de estado vacío del listado por categoría. Lo único que se agregó son los chips de giro de la ficha, con exactamente las mismas clases que los chips del filtro por colonia.

**Gates (iteración 1):** `npm run lint` sin errores ni warnings · `npm run build` ✓ · `npm test` **1085 pruebas en 41 archivos, todas en verde** (antes del change: 873 en 40).
**Gates (iteración 2, al cierre):** `npm run lint` limpio · `npm run build` ✓ **dos veces, con y sin `SITIO_URL`** · `npm test` **1192 pruebas en 43 archivos, todas en verde** (incluidas las 86 de la etapa C).
**Git:** no se tocó. El árbol queda con los cambios sin commitear para el validador.

> **Iteración 2 (respuesta a `reports/c-seguridad.md`): ver la sección 6 al final.** Corrige M1, M2, M4 y la observación O1. M3 no se toca a propósito (coordinación de merge con T-008).

---

## 1. Tareas completadas

Las 25 tareas de `tasks.md` quedan en `- [x]`, cada una con el archivo de prueba que la verifica y con las correcciones de plan anotadas ahí mismo (tareas 3, 4, 5, 7, 13, 16, 24 y 25 llevan nota). Resumen del código nuevo:

| Archivo | Qué es |
| --- | --- |
| `src/app/[destino]/page.tsx` | **Renombrado** de `src/app/[categoria]/page.tsx`. Resuelve los tres tipos de URL de la raíz y trae la metadata de cada uno. |
| `src/components/directorio/listado-categoria.tsx` | El marcado del listado por categoría, tal cual estaba (la página ahora consulta, el componente pinta). |
| `src/components/directorio/listado-giro.tsx` | Página de giro y de giro+colonia: es la misma pantalla con y sin colonia. |
| `src/components/directorio/lista-negocios.tsx`, `navegacion-colonias.tsx` | Las dos piezas que categoría y giro comparten de verdad ("la misma tarjeta y el mismo orden" es el mismo componente, no una coincidencia). |
| `src/lib/seo/rutas.ts` | Resolvedor puro: categoría → giro → giro+colonia → nada. |
| `src/lib/seo/destino.ts` | El resolvedor con los catálogos de la base detrás. |
| `src/lib/seo/frases-giro.ts`, `titulos.ts` | Tabla curada de frases y todos los literales de encabezados, títulos y descripciones. |
| `src/lib/seo/metadata.ts` | Metadata base del sitio, canónicas, `noindex` de lo vacío e imágenes de la vista previa. |
| `src/lib/seo/datos-estructurados.ts` | JSON-LD `LocalBusiness` y su escapado. |
| `src/lib/seo/invariante-catalogos.ts` | La invariante de no-ambigüedad de los tres catálogos. |
| `src/lib/sitio.ts` | `SITIO_URL` (mudada desde `admin/config.ts`, que la reexporta). |
| `src/lib/colores-marca.ts` | Los tokens de `globals.css` en JS, solo para la imagen de `next/og`. |
| `src/app/robots.ts`, `src/app/sitemap.ts`, `src/app/opengraph-image.tsx` | Los tres artefactos del sitio. |

Sin dependencias nuevas, sin migraciones y sin tocar el modelo. Todo Server Components; el único `<script>` que se agrega es el bloque de datos JSON-LD de la ficha.

---

## 2. Mapa scenario → prueba

Los tres deltas suman **61 scenarios** (42 `directorio-publico`, 15 `layout-base`, 4 `modelo-datos`; el encargo decía 58). Los archivos nuevos son `tests/seo-*.test.ts`; cuando la verificación es manual se dice cómo se hizo.

### `directorio-publico` — Listado por categoría en URL limpia (MODIFIED)

| Scenario | Verificación |
| --- | --- |
| listado de una categoría con negocios | `seo-paginas` · "/%s sigue respondiendo su listado…"; `directorio-paginas` (suite previa, intacta) |
| las URLs de categoría publicadas siguen siendo las mismas | `seo-paginas` · las **8 categorías**, una por una, con su encabezado; toda la suite `directorio-paginas` sin cambiar una sola aserción |
| la categoría le gana al giro con el mismo slug | `seo-rutas` · "la categoría gana siempre, aunque un giro se llamara igual" |
| slug que no está en ningún catálogo | `seo-paginas` · "plomeros-baratos responde 404"; `seo-rutas` |
| categoría sin negocios publicados todavía | `seo-paginas` · "la categoría vacía conserva su literal y su invitación" |
| la ruta dinámica no tapa las rutas propias del sitio | `seo-invariante-catalogos` · segmentos reservados en los **tres** catálogos; `directorio-consultas` (previa); manual: `/registro` responde 200 en el servidor |

### `directorio-publico` — Server Components, mobile-first y sin JavaScript (MODIFIED)

| Scenario | Verificación |
| --- | --- |
| sin JS de cliente nuevo | `seo-paginas` · ningún archivo nuevo de `src/app/[destino]`, `src/components/directorio` ni `src/lib/seo` declara `"use client"`; `layout.test` (previa) |
| celular a 390px | `seo-paginas` · áreas táctiles ≥44px en el código nuevo + **revisión manual** (tarea 24) |
| navegación sin JavaScript | `seo-paginas` · la navegación por colonia son enlaces, no un `<select>`; manual: recorrido home → categoría → ficha → giro → giro+colonia sobre el sitio servido, todo con `<a>` |

### `directorio-publico` — Página indexable por giro (ADDED)

| Scenario | Verificación |
| --- | --- |
| página de un giro con negocios | `seo-paginas` · encabezado, tarjetas en orden y el mismo botón de WhatsApp |
| el giro deportivo aterriza la búsqueda del PRD §6.5 | `seo-paginas` · `/futbol` encabeza "Clases de futbol en Tizayuca"; `seo-textos` |
| el giro manda, no la categoría | `seo-consultas` + `seo-paginas` · en `/plomeria` conviven un negocio de Servicios del hogar y uno de Talleres |
| un negocio sin ese giro no aparece | `seo-paginas` · `/electricidad` no trae "Electricidad Rápida JR"; `seo-consultas` |
| solo lo publicado, también aquí | `seo-paginas` · ni el nombre ni el id del negocio en revisión con giro están en el HTML; `seo-consultas`; `seo-adversarial` |
| la navegación por colonia lleva a URLs propias | `seo-paginas` · `/plomeria-huicalco`, sin ningún `?colonia=` |

### `directorio-publico` — Página indexable por giro y colonia (ADDED)

| Scenario | Verificación |
| --- | --- |
| página de giro y colonia con negocios | `seo-paginas` · "Plomería en Huicalco, Tizayuca" y una sola tarjeta |
| la colonia que ya dice Tizayuca no lo repite | `seo-paginas` (`haciendas-de-tizayuca`); `seo-textos` cubre las 5 colonias del catálogo |
| el filtro es real | `seo-paginas` · el de Atempa no aparece en la de Huicalco; `seo-consultas` |
| compuesto que no existe | `seo-paginas` · `plomeria-colonia-inventada`, `loquesea-huicalco` y `plomeria-huicalco-otra-cosa` → 404; `seo-rutas` |
| volver al giro completo | `seo-paginas` · "Todas las colonias" → `/plomeria`, con la colonia activa marcada |

### `directorio-publico` — Lo vacío no se indexa ni se enlaza, pero tampoco es 404 (ADDED)

| Scenario | Verificación |
| --- | --- |
| giro del catálogo que todavía no tiene negocios | `seo-paginas` · `/box` responde 200 con el literal y la invitación |
| combinación de giro y colonia sin negocios | `seo-paginas` · `/box-huicalco` con su literal y "Ver todas las colonias" |
| lo vacío no se indexa | `seo-metadata` · `noindex, follow` en `/box`, `/box-huicalco` y `/plomeria-nacozari`; `seo-artefactos` · ninguna de esas URLs está en el sitemap |
| lo vacío tampoco se enlaza | `seo-paginas` · `/natacion` solo enlaza colonias con contenido; `seo-adversarial`; `layout.test` · revisión de enlaces de las páginas nuevas |
| lo que sí tiene contenido sí se indexa | `seo-metadata` · `/plomeria`, `/plomeria-huicalco` y el listado no declaran nada |

### `directorio-publico` — Desde la ficha se llega a sus giros (ADDED)

| Scenario | Verificación |
| --- | --- |
| ficha con giros asignados | `seo-paginas` · enlace a `/plomeria` (y la frase curada en el caso de la fonda) |
| ficha sin giros | `seo-paginas` · ninguna sección ni `<nav>` vacío |
| los enlaces de giro nunca llevan a una página vacía | `seo-paginas` · el giro que enlaza la ficha lista a ese negocio; `layout.test` · la lista blanca resuelve los giros contra el catálogo |

### `directorio-publico` — Título, descripción y canónica (ADDED)

| Scenario | Verificación |
| --- | --- |
| cada página con su propio título | `seo-metadata` · los 4 títulos y las 4 descripciones son distintos entre sí y de los del sitio, y las 4 canónicas son absolutas |
| descripción de la ficha con lo que escribió el negocio | `seo-metadata`; `seo-textos` |
| ficha sin "¿Qué ofreces?" | `seo-metadata`; `seo-textos` |
| el listado filtrado no compite con las páginas de giro | `seo-metadata` · con `?colonia=huicalco` la canónica es `/servicios-del-hogar` |
| canónicas absolutas | `seo-metadata`; manual: `<link rel="canonical">` en el servidor |

### `directorio-publico` — La ficha se ve bien al compartirla (ADDED)

| Scenario | Verificación |
| --- | --- |
| ficha con foto | `seo-metadata` · `og:image` = la foto, absoluta |
| ficha sin foto | `seo-metadata` · `og:image` = la imagen de marca del sitio |
| la imagen se declara con URL absoluta | `seo-metadata`; manual: en el servidor, `og:image` absoluto y `GET /opengraph-image` → 200 `image/png` 1200×630 |
| la vista previa no reparte el número | `seo-metadata` · ni el WhatsApp ni el fijo aparecen en la metadata serializada |

### `directorio-publico` — Schema.org LocalBusiness (ADDED)

| Scenario | Verificación |
| --- | --- |
| ficha publicada con datos estructurados | `seo-jsonld` · el bloque se compara **entero**, campo por campo |
| nunca el domicilio exacto ni el número | `seo-jsonld` · la ficha muestra dirección, fijo y horario a las personas, y el bloque no los publica; sin `telephone`, `openingHours` ni `geo` |
| negocio sin colonia del catálogo | `seo-jsonld` · se emite igual, con Tizayuca, sin inventar colonia |
| nombre con marcado dentro | `seo-jsonld` · negocio llamado `Tacos </script><script>alert(1)</script>`: sigue siendo un solo bloque válido, ni un `<` crudo, un solo `<script>` en la página y ningún `<img` |
| solo en las fichas publicadas | `seo-jsonld` · listados y páginas de giro sin bloque; la ficha en revisión responde 404 |

### `layout-base` — Metadata base del documento (MODIFIED)

| Scenario | Verificación |
| --- | --- |
| documento en español de México con metadata | `layout.test` (previa) |
| la home conserva el título del sitio | `seo-metadata` · el literal es el `default` del título |
| una página con título propio lleva la marca al final | `seo-metadata` · plantilla `%s — NecesitoUno`; manual: el servidor devuelve `<title>Plomería en Tizayuca — NecesitoUno</title>` |
| URL base declarada | `seo-metadata`; manual: canónicas y `og:image` con el origen declarado |
| producción sin URL pública declarada | `seo-metadata` · sin `metadataBase`, `openGraph.images: []` y cero `localhost`; `seo-artefactos` · el aviso al log ocurre **una sola vez por proceso**; manual: `npm run build` sin `SITIO_URL` → el HTML generado no contiene `localhost` |
| sin JS de cliente en el layout | `layout.test` (previa) |

### `layout-base` — `robots.txt` (ADDED)

| Scenario | Verificación |
| --- | --- |
| lo público se puede rastrear | `seo-artefactos`; manual: `curl /robots.txt` |
| el panel y los resultados quedan fuera | `seo-artefactos` · exactamente `/admin`, `/buscar`, `/registro/gracias` |
| no se anuncian rutas secretas | `seo-artefactos` · nada de `/editar` ni de tokens |
| el sitemap se anuncia con URL absoluta | `seo-artefactos` (y el caso sin URL, que omite la línea); manual |

### `layout-base` — `sitemap.xml` (ADDED)

| Scenario | Verificación |
| --- | --- |
| el sitemap trae lo publicado | `seo-artefactos` · home, `/registro`, las 8 categorías, giros y pares con contenido, fichas; sin repetidos |
| nada de lo que no está publicado | `seo-artefactos` · ni ids ni WhatsApp de los no publicados |
| sin páginas privadas ni de búsqueda | `seo-artefactos` · sin `/admin`, `/buscar`, `/registro/gracias`, combinaciones vacías ni URLs con `?` |
| se actualiza sin que nadie lo toque | `seo-artefactos` · se publica un dentista y aparecen `/dentista`, `/dentista-atempa` y su ficha |
| fecha de la ficha | `seo-artefactos` + `seo-consultas` · `lastmod` = `publicadoEn` |

### `modelo-datos` — Los catálogos no producen URLs ambiguas (ADDED)

| Scenario | Verificación |
| --- | --- |
| los catálogos de hoy son inequívocos | `seo-invariante-catalogos` · 8 + 49 + 21 slugs sembrados, sin un solo problema |
| un giro que se llama como una categoría | `seo-invariante-catalogos` · falla y nombra el slug (giro y colonia) |
| un giro que taparía una ruta propia | `seo-invariante-catalogos` · `buscar`, `registro`, `admin` en cualquiera de los tres catálogos |
| un compuesto con dos lecturas | `seo-invariante-catalogos` · falla nombrando **las dos** lecturas (`a + b-c`, `a-b + c`) |

### Suite adversarial (tarea 22, no es un scenario suelto)

`tests/seo-adversarial.test.ts`: 29 slugs hostiles (`%`, `_`, `..`, `//`, `'; DROP TABLE`, RTL override, cirílico, CJK, mayúsculas, acentos, guiones de más, 500 caracteres, 300 guiones) contra la página **y** contra su metadata. Ninguno rompe el servidor: o resuelve, o es el 404 en español del sitio. Más el caso `/dentista-nacozari`, combinación ocupada **solo** por un negocio en revisión: responde 200 vacío, no lo delata, no se indexa y no se enlaza.

---

## 3. Decisiones técnicas

1. **`[categoria]` → `[destino]` con resolución en un módulo puro.** La decisión de `design.md` §1, tal cual. La página consulta la base y decide; `resolverSlugDeLaRaiz` es puro y se prueba sin base, y **la misma función** es la que usa la lista blanca de enlaces de `tests/layout.test.ts` (así la prueba no reimplementa la regla que vigila).

2. **El slug se valida antes de tocar la base.** Solo `[a-z0-9](-[a-z0-9])*` y hasta 120 caracteres. Dos ventajas: `/Plomeria` sigue siendo 404 (nada de la misma página en dos URLs, que es justo el contenido duplicado que este change viene a evitar) y toda la clase adversarial muere sin costar una consulta.

3. **Un compuesto ambiguo responde 404, no elige.** El resolvedor exige **exactamente un** par válido. Que hoy no pueda pasar lo garantiza la invariante de catálogo; si algún día pasa, se prefiere el 404 a servir una URL que significa dos cosas.

4. **Los catálogos se leen enteros (3 consultas de 78 filas en total)** en vez de una consulta por slug: la resolución es una regla sobre los tres catálogos a la vez, y de paso la página ya tiene los nombres con los que encabeza.

5. **`openGraph.images: []` cuando no hay `SITIO_URL`.** Hallazgo al leer `node_modules/next/dist/lib/metadata/resolvers/resolve-url.js`: sin `metadataBase`, Next resuelve la imagen del archivo `opengraph-image` contra `http://localhost:3000`. La única forma de evitarlo es que la metadata del nivel declare sus propias `images` (`resolve-metadata.js:149`), así que con la variable ausente se declara la lista vacía. Comprobado sobre el HTML construido: cero `localhost`.

6. **La ficha declara su `og:image` explícita.** Una página que declara `openGraph` deja de heredar la imagen del layout, así que la ficha nombra la foto del negocio o, si no tiene, la imagen de marca (`/opengraph-image`, que responde la misma imagen que la convención de archivo). Sin esto, "ninguna ficha se comparte sin imagen" se rompía justo en las fichas sin foto.

7. **La canónica de la ficha usa el segmento del nombre actual**, no el de la URL con la que llegó el visitante: un enlace viejo sigue abriendo la ficha pero no se indexa como una segunda URL.

8. **`urlSitio` se mudó a `src/lib/sitio.ts` sin cambiar su comportamiento** y `admin/config.ts` la reexporta: `tests/admin-config.test.ts` sigue pasando sin tocarlo. El aviso de "producción sin URL pública" sigue el patrón del panel y del límite por IP: una vez por proceso, nunca por petición (`robots.txt` y `sitemap.xml` son públicos y sería una vía gratis para inundar el log).

9. **`src/lib/colores-marca.ts`.** `next/og` pinta con estilos en línea y no puede usar las clases de Tailwind, y el proyecto prohíbe hexadecimales sueltos en componentes. Los tokens viven en un módulo aparte y una prueba falla si dejan de coincidir con `globals.css`.

10. **Los fixtures nuevos viven en `tests/seo-fixtures.ts`, no en `prisma/seed-demo.ts`.** El seed de demostración es lo que ve cualquiera que corra `npm run db:seed:demo` y varias suites afirman sus conteos; los casos que este change necesita (mismo giro en dos categorías, un giro en varias colonias, negocios en revisión con giros, una foto) son de prueba, no de demostración. Todo ficticio, con la serie `771999xxxx`.

11. **`prisma/schema.prisma` no cambió.** Lo único que se sumó a una consulta es el nombre de la categoría en la ficha (`categoriaNombre`), que el JSON-LD necesita para `knowsAbout`.

---

## 4. Cambios en pruebas ya existentes (y por qué)

Ninguna aserción previa se debilitó por conveniencia; los cinco cambios son consecuencia directa de la spec:

- `directorio-paginas`, `directorio-adversarial`, `admin-adversarial`, `layout.test`: ruta del import y nombre del parámetro (`categoria` → `destino`). Cero aserciones tocadas.
- `directorio-adversarial` (2 pruebas): `not.toMatch(/<script/i)` ahora descuenta el bloque `application/ld+json`, que la spec declara explícitamente "bloque de datos, no código ejecutable". El escapado de ese bloque se prueba campo por campo —y con un `</script>` adentro— en `seo-jsonld`; en el resto de la respuesta sigue exigiéndose ni un `<script>` más.
- `layout.test`: la lista blanca de hrefs resuelve ahora con el resolvedor de producción (acepta giro y giro+colonia del catálogo, sigue rechazando lo inventado) y la revisión de enlaces cubre `/plomeria` y `/plomeria-huicalco`; el título del layout pasa a `{ default, template }` (el literal no cambió).
- `buscador-pagina`: solo se amplió el comentario de "ninguna otra página se marca como no indexable". La prueba sigue cubriendo **todas** las páginas, incluida `[destino]`, porque la instrucción vive en una constante compartida (`NOINDEX_CON_ENLACES`) y ninguna página la escribe a mano.

---

## 5. Deuda y propuestas fuera de alcance

**Deuda que hereda este change (anotada, no resuelta):**

1. **Las páginas legales de T-007 no están en el sitemap.** Duda 3 de la propuesta: se suman con una línea en `src/app/sitemap.ts` cuando T-007 mergee. Hoy `/registro` sí entra.
2. **`robots.txt` no defiende de la cosecha masiva** (hallazgo M5 de T-004): es una petición que un scraper ignora. El límite de lectura por IP sigue siendo deuda de E5-5/E0-3.
3. **`SITIO_URL` en el build.** Las 3 páginas estáticas (`/registro/gracias`, `/_not-found`, `/_global-error`) fijan su metadata en el build; si la variable no está declarada **al construir**, esas tres quedan sin canónica ni vista previa aunque el runtime sí la tenga. Ninguna es indexable ni compartible, así que el efecto es nulo hoy, pero conviene que E0-3 declare la variable también en el entorno de build.
4. **`/opengraph-image` con y sin huella.** La convención de archivo emite la imagen con una huella de caché (`/opengraph-image?b182…`) y la ficha sin foto la nombra sin ella. Las dos URLs sirven la misma imagen (verificado: 200 `image/png`); la diferencia solo afecta al caché de los rastreadores.
5. **La revisión visual a 390/768/1280 px queda para ojos humanos en el PR** (detalle en la tarea 24): en este entorno no hay navegador, así que se verificó estructuralmente sobre el HTML servido.

**Propuestas fuera de alcance (no se construyeron):**

- **Índice navegable de giros por categoría.** Las páginas de giro son alcanzables desde las fichas y el sitemap, pero un vecino no tiene forma de ver "todos los giros de Servicios del hogar". Es una pantalla nueva y hoy no existe relación giro↔categoría en el modelo: propuesta para el backlog, no para este PR.
- **Enlazar giros hermanos desde la página de giro** ("también hay: Cerrajería, Electricidad") para que el rastreo no dependa de las fichas.
- **Migrar el listado por categoría de `?colonia=` a URLs propias.** Hoy conviven dos formas de filtrar por colonia (parámetro en categoría, URL propia en giro). No es un problema de SEO —la canónica del filtrado apunta al listado sin filtro— pero sí una inconsistencia que se va a notar al mantener.
- **ISR / revalidación al aprobar:** todo el directorio sigue leyendo la base por petición; cuando E0-3 defina hosting se puede revisar (ya anotado en la propuesta).
- **Medición Lighthouse (E5-4):** este change no agrega JavaScript de cliente ni peticiones nuevas al cliente, pero la medición va con el deploy.

---

## 6. Iteración 2 — respuesta a la etapa C

Entrada: `reports/c-seguridad.md` (0 críticos, 0 altos, 4 medios, 3 observaciones; veredicto "pasa"). Se corrigen **M1, M2, M4 y O1**; **M3 se deja a propósito** (abajo, coordinación de merge). Las 86 pruebas de la etapa C siguen en verde y su suite se actualizó solo donde la corrección cambió el comportamiento medido, sin debilitar ninguna aserción de seguridad.

### M1 · Construir sin `SITIO_URL` publicaba una `og:image` a `localhost` en la 404 — **corregido**

El hallazgo es correcto y mi verificación anterior estaba mal hecha: había mirado `registro/gracias.html` y el resultado de `grep -rl localhost .next/server/app/` **con** la variable declarada, no sin ella.

**Causa raíz.** `openGraph.images: []` corta la imagen de la convención de archivo en el nivel de metadata que la declara, pero la ruta interna `/_not-found` es **otro nivel raíz**: no hereda las `images` del layout, así que Next le pegaba `src/app/opengraph-image.tsx` resuelta contra `http://localhost:3000` por falta de `metadataBase`.

**Corrección.** `src/app/not-found.tsx` declara ahora su propia metadata (`openGraph.images`) usando una función compartida nueva, `imagenesDeMarca()` (`src/lib/seo/metadata.ts`): lista con la imagen **absoluta** cuando hay URL pública y **vacía** cuando no. Es decir, los dos niveles raíz de metadata del sitio —layout y 404— declaran sus imágenes en vez de heredarlas, que es lo único que cierra ese camino. De paso, con la variable declarada la 404 gana su vista previa, que antes tampoco tenía sentido perder.

**Verificación (la que faltaba, ahora en los dos sentidos):**

```
rm -rf .next && npm run build                        # sin SITIO_URL
grep -rl "localhost" .next/server/app/               # → sin resultados
grep -o '<meta property="og:image"[^>]*>' .next/server/app/_not-found.html   # → sin og:image

rm -rf .next && SITIO_URL=https://necesitouno.example npm run build
grep -rl "localhost" .next/server/app/               # → sin resultados
# _not-found.html → <meta property="og:image" content="https://necesitouno.example/opengraph-image"/>
```

Automatizado en `tests/seo-iteracion2.test.ts` (bloque M1): los dos niveles raíz declaran `images`, `imagenesDeMarca` devuelve absoluta / vacía según el entorno, y la ficha sin foto tampoco inventa una imagen local en producción. El `grep` sobre el build queda como verificación manual documentada porque correr `next build` dentro de la suite le sumaría ~15 s al gate que el CI ya corre aparte.

### M2 · El "¿Qué ofreces?" viajaba literal, teléfono incluido — **corregido**

Se acepta el hallazgo como lo que es: la spec dice "La descripción NO DEBE incluir el WhatsApp ni el teléfono del negocio", y cumplirlo **por campo** (no leer `whatsapp` ni `telefonoFijo`) no alcanza cuando el negocio escribe el número dentro de un texto libre que este change saca de la ficha.

**Corrección.** Módulo nuevo `src/lib/seo/saneo.ts` con `ocultarNumerosDeContacto`: sustituye por `…` toda secuencia de **7 o más dígitos** (siete es un número local; los de México tienen diez), admitiendo entre ellos los separadores con los que se escribe un teléfono (espacio, `-`, `.`, `()`, `/`, `+`) y **no** letras ni comas. Se aplica en las **tres** superficies que sacan el texto de la ficha:

1. `<meta name="description">` — vía `descripcionFicha` (`src/lib/seo/titulos.ts`);
2. `og:description` — es el mismo valor que la anterior;
3. `description` del JSON-LD — vía `datosEstructuradosDeFicha`.

**La ficha le sigue mostrando el texto completo a las personas**, que es donde el negocio quiso ponerlo: lo que se corta es que el número viaje al snippet de Google, a la vista previa de WhatsApp y a un campo legible por máquina.

Es conservador a propósito (puede ocultar de más, nunca de menos): "2020-2024" son ocho dígitos y también se oculta. Lo que la gente sí quiere leer sobrevive, y está probado: "de 6 a 12 años", "L-S 9am-7pm", "$1,200", "24/7", "Pizzas de 30 cm".

Verificado en `tests/seo-iteracion2.test.ts` (bloque M2: 5 casos que se ocultan, 5 que no se tocan, el umbral de 6 vs 7 dígitos, la descripción, y la ficha renderizada de verdad comprobando las tres superficies) y a mano sobre el sitio servido:

```
<meta name="description" content="Plomería 24 horas, llámanos al …"/>
<meta property="og:description" content="Plomería 24 horas, llámanos al …"/>
…"description":"Plomería 24 horas, llámanos al …"…      (JSON-LD)
…y en el cuerpo de la ficha: "Plomería 24 horas, llámanos al 771 000 0000."
```

**Queda anotado, no corregido:** el mismo riesgo existe en el **nombre** del negocio (va al `<title>`, a `og:title` y a `name` del JSON-LD). No se sanea porque el nombre es la identidad de la ficha y ocultarle dígitos rompería negocios que se llaman con números ("Taquería 24/7", "Farmacia 3 Hermanos"); además el admin lo ve al aprobar. Si se decide sanear también ahí, es una línea en el mismo módulo.

### M4 · Los tres catálogos se leían dos veces por petición — **corregido**

`obtenerCatalogosDeLaRaiz` (`src/lib/directorio.ts`) memoriza ahora la lectura con una vigencia corta (`VIGENCIA_CATALOGOS_MS = 30 s`) y expone `reiniciarMemoriaDeCatalogos()` para las pruebas.

**Por qué una memoria del proceso y no `React.cache`:** lo comprobé antes de decidir — `cache()` **no memoriza fuera de un render de React** (sin dispatcher devuelve el valor sin guardar), así que (a) no serviría para `sitemap.xml`, que es un route handler, y (b) no sería observable en la suite, con lo que la mejora no se podría probar ni defender de una regresión. Los catálogos son datos de **siembra** (`prisma/seed.ts`): no los edita nadie desde la aplicación, así que 30 s de vigencia solo pueden retrasar la aparición de un giro recién sembrado en desarrollo. **Los negocios NUNCA se memorizan** —lo que el admin publica o rechaza se ve en la petición siguiente— y hay prueba explícita de eso.

Costo medido, con el mismo instrumento de la etapa C (memoria fría, es decir el peor caso):

| Petición | Antes | Ahora |
| --- | --- | --- |
| Slug bien formado inexistente | 6 | **3** (los tres catálogos, una vez cada uno) |
| Lo mismo con la memoria caliente | 6 | **0** |
| Página de giro válida (`/plomeria`) | 9 | 6 |
| Listado por categoría | 8 | 5 |
| `sitemap.xml` | 2 fijas | 2 fijas (no usa la memoria) |

`tests/seo-seguridad-adversarial.test.ts` se actualizó en su prueba de costo: `consultasDe` reinicia la memoria antes de medir (peor caso explícito), el tope pasa de 8 a **3**, se exige que las tres consultas sean exactamente los tres catálogos y se agrega el caso de memoria caliente (0 consultas). Las demás pruebas de esa suite no se tocaron, salvo la nota del párrafo siguiente.

*Nota sobre la otra actualización de esa suite:* dos cargas hostiles (`</script\t>`, `</script\n>`) comparaban la `description` del JSON-LD **carácter por carácter** con la carga; el saneo de M2 colapsa espacios (un salto de línea en una meta descripción se ve roto en el buscador), así que esa comparación pasa a hacerse con los espacios normalizados. Lo que la prueba vigila —que la carga viaje como dato, que no haya ni un `<` crudo y que el bloque no se parta— se sigue exigiendo tal cual sobre el serializado y sobre `name` y `knowsAbout`, que no pasan por ningún saneo.

### O1 · Las rutas de archivo de la raíz no estaban reservadas — **corregido**

`SEGMENTOS_RESERVADOS` suma `robots.txt`, `sitemap.xml`, `opengraph-image` y `favicon.ico`, y el guardián de `tests/directorio-consultas.test.ts` ahora **también mira archivos**: cada archivo de `src/app` o está en la lista de "no es una ruta" (`layout.tsx`, `page.tsx`, `not-found.tsx`, `globals.css`…) o declara qué segmento publica y ese segmento tiene que estar reservado. Un archivo de convención nuevo (un `manifest.ts`, por ejemplo) rompe la prueba hasta que alguien decida qué reserva.

### M3 · `fotoUrl` sin lista blanca de dominio — **no se toca, por coordinación de merge**

Es territorio de **T-008** (subida de foto), cuya rama corre en paralelo y ya valida el campo en el punto de escritura. Tocarlo aquí sería escribir una validación que T-008 va a rehacer, y con dos ramas vivas sobre el mismo campo el conflicto sería peor que el hallazgo. Hoy no hay explotación viva y la etapa C lo confirmó: el registro público ignora `fotoUrl`, el panel no lo escribe, y ningún esquema hostil (`javascript:`, `data:`, `vbscript:`, relativo sin `/`) sale como `og:image` — siempre cae a la imagen de marca.

**Para quien mergee:** si T-009 entra antes que T-008, la lista blanca de dominio para `fotoUrl` es requisito de T-008 y hay dos consumidores que ya lo dan por bueno: `imagenesDeLaFicha` (`src/lib/seo/metadata.ts`) y `imagenAbsoluta` (`src/lib/seo/datos-estructurados.ts`). Si T-008 entra primero, conviene revisar que su validación cubra los dos.

### Observaciones no atendidas (con motivo)

- **O2 (chips de giro que copian el literal de clases de `claseFiltro`).** Real y de una línea, pero cambia marcado ya revisado por seguridad y por el ojo humano en esta misma corrida, y el beneficio es de mantenimiento, no de comportamiento. Propuesta para el primer restyle: exportar `claseFiltro` desde `navegacion-colonias.tsx` y usarla en la ficha.
- **O3 (el texto libre de colonia "Otra" entra al `<title>` y al `og:title`).** La ficha ya se lo muestra a las personas y el JSON-LD sí lo excluye. Sanearlo en el título es la misma decisión de producto que la del nombre (M2): queda anotado junto a ella.

### Archivos tocados en esta iteración

`src/app/not-found.tsx` · `src/lib/seo/metadata.ts` · `src/lib/seo/saneo.ts` (nuevo) · `src/lib/seo/titulos.ts` · `src/lib/seo/datos-estructurados.ts` · `src/lib/directorio.ts` · `src/lib/rutas-reservadas.ts` · `tests/seo-iteracion2.test.ts` (nuevo, 21 pruebas) · `tests/directorio-consultas.test.ts` · `tests/seo-seguridad-adversarial.test.ts`.
