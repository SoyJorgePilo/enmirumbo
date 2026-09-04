# Diseño técnico: agregar-seo-local

Decisiones no obvias que la implementación debe respetar. Antes de tocar código, leer las guías correspondientes en `node_modules/next/dist/docs/` (esta versión de Next.js —16.3.3— difiere de lo conocido; ver `AGENTS.md` de la raíz), en particular:

- `01-app/03-api-reference/03-file-conventions/01-metadata/sitemap.md` y `.../robots.md` (convenciones `app/sitemap.ts` y `app/robots.ts`)
- `01-app/03-api-reference/03-file-conventions/01-metadata/opengraph-image.md`
- `01-app/02-guides/json-ld.md`
- lo relativo a `generateMetadata`, `metadataBase`, `params` asíncronos y rutas dinámicas

## 1. La convivencia de `/[categoria]`, `/[giro]` y `/[giro]-[colonia]` en la raíz

Es el problema técnico central del ticket. El PRD §8 exige las tres formas de URL en la raíz (`/servicios-del-hogar`, `/plomeria`, `/plomeria-haciendas-de-tizayuca`) y **las de categoría ya están publicadas desde T-004: no pueden romperse**.

En App Router **no pueden coexistir dos segmentos dinámicos con nombres distintos en el mismo nivel** (`app/[categoria]/` y `app/[giro]/` es un error de compilación: "You cannot use different slug names for the same dynamic path"). Así que "una carpeta por tipo de página" no es una opción disponible.

| Opción | A favor | En contra |
| --- | --- | --- |
| **A. Prefijos** (`/giro/plomeria`, `/giro/plomeria/haciendas-de-tizayuca`) | cero ambigüedad, cada tipo con su carpeta | contradice el PRD §8, que pide la URL limpia y geolocalizada con el ejemplo textual `/plomeria-haciendas-de-tizayuca`; pierde la palabra clave al principio de la URL, que es justo lo que se busca |
| **B. Middleware que reescribe** la raíz hacia `/(interno)/categoria/...` o `/(interno)/giro/...` | mantiene carpetas separadas | mete una capa que corre en todas las peticiones (incluidas las de assets), duplica el lugar donde se decide la ruta, y el middleware no puede consultar la base con Prisma sin arrastrar el cliente al runtime del borde |
| **C. Columna nueva "ruta SEO" en la base** con todas las URLs materializadas | resolución por una sola consulta | migración y mantenimiento de ~1 000 filas derivadas que hay que regenerar en cada cambio de catálogo o de estado; el ticket no pide tocar el modelo |
| **D. Un solo segmento dinámico en la raíz** que resuelve el slug contra los tres catálogos en orden fijo (**elegida**) | única compatible con las URLs del PRD; una sola puerta de entrada donde vive toda la decisión; sin migración ni capas nuevas | la resolución es código propio y hay que probar que es determinista (§2) |

**Cómo queda.** `src/app/[categoria]/page.tsx` se renombra a `src/app/[destino]/page.tsx`. Renombrar la carpeta **no cambia ninguna URL**: `/servicios-del-hogar` se sigue sirviendo exactamente igual; lo único que cambia es el nombre del parámetro dentro del código. La página delega en un resolvedor puro (`src/lib/seo/rutas.ts`) que decide, en este orden:

1. ¿el slug está en el catálogo de **categorías**? → listado por categoría (comportamiento actual, intacto);
2. ¿está en el catálogo de **giros**? → página de giro;
3. ¿se parte en un par **giro + colonia** válido? → página de giro y colonia;
4. si no → `notFound()`.

El orden importa y es parte de la spec: **la categoría gana siempre**, para que ningún catálogo futuro pueda secuestrar una URL de categoría ya publicada.

Los segmentos estáticos (`/registro`, `/negocio/...`, `/buscar`, `/admin`, `/aviso-de-privacidad`, `/terminos`) le siguen ganando al dinámico por regla de Next, y la lista de `src/lib/rutas-reservadas.ts` sigue impidiendo que un slug del catálogo quede inalcanzable. Lo que este change agrega es que esa verificación ahora cubre **los tres catálogos y los compuestos**, no solo las categorías (§2).

## 2. Partir `<giro>-<colonia>` sin ambigüedad

Los slugs de ambos catálogos llevan guiones (`taekwondo-artes-marciales`, `fonda-comida-corrida`, `haciendas-de-tizayuca`, `el-refugio-tepojaco`), así que "partir por el guion" no está definido de una sola manera. La regla es enumerar **todos** los cortes posibles del slug (en cada guion), quedarse con los pares en que la parte izquierda es un giro del catálogo y la derecha una colonia del catálogo, y exigir que quede **exactamente uno**:

- **cero pares válidos** → 404 (`/plomeria-inventada`, `/loquesea`);
- **un par válido** → esa es la página;
- **dos o más pares válidos** → no puede pasar, y es un error de datos, no de tráfico: lo atrapa la invariante de catálogo.

**La invariante de catálogo** (delta de `modelo-datos`) es una verificación automática sobre los tres catálogos sembrados que falla si: un giro se llama como una categoría o como un segmento reservado; una colonia se llama como una categoría o como un giro; o algún compuesto giro+colonia coincide con otro slug o admite dos lecturas. Con los catálogos de hoy (8 categorías, 49 giros, 21 colonias) se cumple; la verificación existe para que el día que alguien agregue un giro al Apéndice B, el CI lo diga antes de que una URL quede secuestrada. Es la misma idea barata de `SEGMENTOS_RESERVADOS`: reservar un nombre es gratis, migrar URLs publicadas no.

## 3. Sin contenido: 200 con `noindex`, no 404

Hay 49 giros × 21 colonias ≈ 1 000 combinaciones posibles y solo un puñado tendrá negocios. Dos riesgos opuestos: publicar mil páginas vacías (thin content, que Google castiga y que el ticket prohíbe) o responder 404 a una URL que sí describe algo real y que puede estar compartida en un chat ("`/box-huicalco` no existe" es confuso: el giro existe, la colonia existe, simplemente todavía nadie se registró).

La resolución: la página **responde 200**, muestra un estado vacío útil con la invitación a registrarse y una salida hacia la página del giro completo, y **declara `noindex, follow`**. Además no aparece en el sitemap y ninguna página del sitio la enlaza. Un buscador que llegue por un enlace externo no la indexa; un vecino que llegue por un enlace compartido ve algo con sentido.

**Las 8 categorías son la excepción y van siempre al sitemap**, incluso vacías: son el esqueleto de navegación del sitio, están enlazadas desde la home y son 8, no mil. La regla anti-thin-content ataca el volumen combinatorio, no las páginas fijas del directorio.

## 4. Los títulos: una tabla curada de frases por giro

El nombre del catálogo no siempre es la frase que la gente busca ni la que se lee bien en un título:

- deporte (E4-3, PRD §6.5): la búsqueda es "clases de futbol en Tizayuca", no "Futbol en Tizayuca";
- los nombres con diagonal quedan feos en un `h1`: "Taekwondo / artes marciales en Tizayuca".

Se resuelve con una tabla curada `slug de giro → frase`, en código (`src/lib/seo/`), no en la base: es contenido editorial, cambia con lo aprendido en la Fase 0 y no merece una migración. Los giros sin entrada usan su nombre tal cual, así que agregar un giro al catálogo nunca rompe nada — a lo sumo su título es mejorable.

Con la frase, el título se compone igual para todos: `«Frase» en Tizayuca` y `«Frase» en «Colonia», Tizayuca`. La única excepción es la de las colonias cuyo nombre ya contiene "Tizayuca" (Tizayuca Centro, Haciendas de Tizayuca, Fuentes de Tizayuca, Nuevo Tizayuca, Los Héroes Tizayuca): ahí se omite el ", Tizayuca" final para no escribirlo dos veces. Es una desviación consciente del literal del ticket y está anotada como duda en la propuesta.

## 5. URL base: se reutiliza `SITIO_URL`

El sitemap, la línea `Sitemap:` de `robots.txt`, las canónicas y el Open Graph necesitan URLs absolutas, y en el servidor no hay forma confiable de deducir el dominio (los encabezados de host los escribe quien pide). Ya existe esa decisión tomada en T-005: la variable `SITIO_URL` que lee `src/lib/admin/config.ts` para armar el link de la ficha en el aviso de aprobación. Se reutiliza tal cual —una sola variable, un solo criterio— extrayendo `urlSitio()` a un módulo compartido si hace falta, sin cambiar su comportamiento: origen válido declarado, `http://localhost:3000` fuera de producción, `null` en producción si falta.

Con `null` (producción mal configurada) el sitio **falla a la vista, no a escondidas**: el sitemap responde un documento vacío y `robots.txt` omite la línea `Sitemap:`, en vez de publicar URLs a `localhost` que Google intentaría rastrear. Se deja un aviso en el log del servidor una sola vez por proceso, con el mismo patrón que el panel y el límite por IP (nunca por petición: la ruta es pública y sería una vía gratis para inundar el log).

`metadataBase` del layout se alimenta de la misma función, que es lo que permite que las rutas relativas de Open Graph se resuelvan a absolutas.

## 6. Qué emite el JSON-LD y qué no

El PRD §8 fija la expectativa: *"al publicar colonia (no dirección exacta) y horario en texto libre, el markup será parcial; el horario estructurado queda para fases posteriores (§12)"*. Se emite en la ficha, como `<script type="application/ld+json">` renderizado por el propio Server Component (recomendación de la guía de Next), con:

- `@type: "LocalBusiness"` genérico —el PRD lo nombra así—, sin mapear categorías a subtipos: marcar como `MedicalBusiness` a un consultorio que en realidad es otra cosa es peor que no marcarlo;
- `name`, `url` (la canónica de la ficha), `description` (el "¿Qué ofreces?" del negocio, si lo escribió);
- `address` como `PostalAddress` con `addressLocality: "Tizayuca"`, `addressRegion: "Hidalgo"`, `addressCountry: "MX"` y, cuando el negocio tiene colonia, `streetAddress: "Col. «Colonia»"` — la colonia es lo único de ubicación que el directorio publica por defecto (PRD §8); **nunca** el texto de dirección o referencias que capturó el negocio;
- `knowsAbout` con su categoría y sus giros (es la propiedad válida en un `Organization` para "de qué sabe" esta ficha; `keywords` no aplica);
- `image` con la foto, solo cuando exista.

**No se emite `telephone`.** Google lo recomienda, pero el WhatsApp y el teléfono en un formato legible por máquina es exactamente el regalo al scraper que el hallazgo M5 de T-004 quería evitar, y el contacto por WhatsApp ya está a un toque para las personas. Queda como duda de la aprobación. Tampoco se emite `openingHours` (§12) ni coordenadas (no hay pin).

**Escapado:** el nombre y el "¿Qué ofreces?" los escribe el negocio. `JSON.stringify` no protege de un `</script>` incrustado, así que cada carácter `<` del JSON se sustituye por su escape unicode antes de inyectarlo, exactamente como muestra el ejemplo de la guía de Next (`01-app/02-guides/json-ld.md`). Hay caso adversarial obligatorio.

## 7. La imagen de la vista previa

Las fichas se comparten por WhatsApp y Facebook: sin `og:image` la vista previa sale como un renglón gris. La foto del negocio (`fotoUrl`) es la imagen correcta, pero hoy es nula en toda la base y la llena T-008, que corre en paralelo. El fallback es una **imagen de marca del propio sitio** en `src/app/opengraph-image.tsx`, generada con `ImageResponse` de `next/og` —que viene dentro de Next, así que no hay dependencia nueva ni un PNG binario que nadie pueda revisar en un diff— y heredada por todas las páginas. La ficha la sobrescribe cuando tiene foto.

Alternativa descartada: omitir `og:image` cuando no hay foto. Es más honesto pero deja la vista previa pobre justo en el canal principal de distribución del producto (PRD §9: "cada ficha publicada se comparte como link individual").

## 8. `robots.txt`: qué se excluye y qué no

`Allow: /` para todo lo público, y `Disallow` para `/admin` (el panel; ya declara `noindex, nofollow` por su cuenta), `/buscar` (URLs con consulta, contenido duplicado infinito) y `/registro/gracias` (pantalla de confirmación, no aporta nada a un buscador).

Dos precisiones:

- **No se listan rutas que aún no existen.** En particular `/editar` (E8): un `Disallow` de un enlace secreto lo anuncia en un archivo público, que es el anti-patrón clásico. Cuando E8 llegue, esa página llevará `noindex` en su propia metadata.
- **`/buscar` conserva su `noindex`** aunque esté excluida. Es redundante a propósito: si el rastreador no puede leer la página, tampoco lee el `noindex`, y una URL enlazada desde fuera podría indexarse solo por su dirección. Con las dos defensas puestas, cualquiera de los dos caminos la deja fuera.

`robots.txt` no defiende de la cosecha masiva del directorio (hallazgo M5 de T-004): es una petición que un scraper ignora. La defensa real (límite de lectura por IP) sigue siendo deuda de E5-5/E0-3 y está anotada como fuera de alcance.

## 9. Consultas y presupuesto de rendimiento

Las páginas nuevas leen la base por petición (`force-dynamic`), igual que el resto del directorio: en CI no hay base al construir y el contenido depende de lo que el admin publique. Todas las lecturas pasan por `src/lib/directorio.ts`, con `estado: publicado` por construcción y la proyección explícita de campos públicos — ninguna página nueva arma su propio `where` (design.md §5 de `agregar-directorio-publico`).

El sitemap se arma con un número fijo y pequeño de consultas (catálogos, negocios publicados con su giro y su colonia): nada de una consulta por combinación posible. El presupuesto de <2s en 4G se sostiene igual que hasta ahora, por el lado del peso: Server Components, cero JavaScript de cliente nuevo y el JSON-LD como texto en la respuesta (no un script ejecutable).
