# Delta: plataforma-astro

> Fase 2b de ADR-013 (T-023). `/[destino]`, `/negocio/[ficha]`, `/buscar` y `/api/foto/[clave]/[variante]` pasan a servirse con Astro. **Ningún comportamiento que salga del servidor cambia**, salvo una excepción decidida por el fundador: el `<body>` de las 404 dinámicas. Ahí el servidor pinta la página de no encontrado que hoy el vecino solo ve gracias al JavaScript de Next. El contrato sigue siendo el de los requirements de `directorio-publico` y `layout-base` que tocan estas rutas, incluida la medición y su exclusión, más los de cabeceras de `despliegue`. Este delta se monta sobre el de `migrar-lectura-publica-astro` (2a) y da por hechos su armazón, su middleware, su diff y sus guardianes.

## ADDED Requirements

### Requirement: Las páginas del directorio responden desde Astro el mismo HTML que Next

`/[destino]` (categoría, giro y giro+colonia), `/negocio/[ficha]` y `/buscar` DEBEN responder, para la misma base y el mismo entorno, lo mismo que la versión Next:

- el mismo estado;
- el mismo texto por landmark;
- los mismos enlaces con su `href`, `rel` y `target`;
- los mismos atributos de medición;
- la misma secuencia de elementos con sus clases.

Deben hacerlo dentro del tronco público medido. La resolución de la raíz DEBE seguir el orden categoría → giro → giro+colonia, y `?colonia=` DEBE leerse igual que hoy: se usa el primer valor y una colonia que no está en el catálogo se ignora. La ficha DEBE seguir abriéndose por su identificador aunque la parte legible de la URL ya no coincida con el nombre.

#### Scenario: listado de una categoría igual al de hoy

- **WHEN** con la base semilla se abre `/servicios-del-hogar` en las dos versiones, sin filtro, con `?colonia=` de una colonia del catálogo y con `?colonia=inventada`
- **THEN** el diff no reporta diferencias: mismo encabezado "Servicios del hogar en Tizayuca", mismas tarjetas en el mismo orden y mismo filtro de colonias

#### Scenario: giro y giro+colonia iguales a los de hoy

- **WHEN** se abren una página de giro con negocios, una de giro+colonia con negocios, una de giro sin negocios y `/box-huicalco` sin negocios
- **THEN** el diff no reporta diferencias, y las vacías muestran "Todavía no hay negocios publicados de esto en Tizayuca." o "Todavía no hay negocios publicados de esto en esta colonia." con "Ver todas las colonias", con respuesta 200

#### Scenario: ficha igual a la de hoy

- **WHEN** se abre la ficha de un negocio publicado con todos los campos y la de uno que solo llenó lo obligatorio
- **THEN** el diff no reporta diferencias: mismo `h1`, sello "Negocio verificado", botones de contacto, enlaces de giro, "Reportar este negocio" y "Perdí mi enlace"

#### Scenario: enlace viejo tras un cambio de nombre

- **WHEN** se abre `/negocio/<nombre-anterior>-<id>` de un negocio publicado
- **THEN** responde 200 con la ficha, y su canónica apunta al segmento con el nombre actual, igual que en Next

#### Scenario: la categoría le gana al giro

- **WHEN** un slug existe como categoría y como giro en el catálogo de prueba
- **THEN** la respuesta de Astro es el listado de la categoría, igual que la de Next

### Requirement: Metadatos y datos estructurados del directorio iguales a los de Next

Cada página de este change DEBE emitir el mismo conjunto de `<title>`, `<meta>`, `<link rel="canonical">` y bloques JSON-LD que la versión Next. Eso incluye:

- la canónica del listado filtrado hacia el listado sin filtro;
- el `noindex, follow` de las páginas de giro vacías y ninguna instrucción de no indexar en las que tienen negocios;
- en la ficha, el Open Graph propio (`article`, título, descripción, `siteName`, `es_MX`, URL e imagen construida por el sitio) y el bloque `LocalBusiness`, comparado como JSON.

Todo DEBE seguir saliendo de `src/lib/seo/` sin duplicar textos. Sin URL pública en producción, ninguna DEBE publicar una URL absoluta a la dirección local.

#### Scenario: metadatos de la ficha con y sin foto

- **WHEN** con `SITIO_URL` declarada se abren una ficha con foto y una sin foto
- **THEN** sus `<meta>` coinciden con los de Next: la primera trae `og:image` hacia `«SITIO_URL»/api/foto/<clave>/ficha` y la segunda la imagen de marca, y ninguna trae el WhatsApp ni el teléfono

#### Scenario: JSON-LD igual

- **WHEN** se comparan los bloques `application/ld+json` de una ficha publicada en las dos versiones
- **THEN** son iguales como JSON parseado, sin domicilio exacto ni número, y el nombre con marcado sigue escapado

#### Scenario: lo vacío no se indexa, lo lleno sí

- **WHEN** se revisan una página de giro sin negocios y una con negocios
- **THEN** la primera trae `noindex, follow` y la segunda ninguna instrucción de no indexar, igual que en Next

#### Scenario: producción sin URL pública

- **WHEN** el sitio corre en producción sin `SITIO_URL` y se abren un listado, una página de giro, una ficha y `/buscar`
- **THEN** ninguna trae canónica, `og:image` ni otra URL absoluta hacia `localhost`, y todas responden con normalidad

### Requirement: `/buscar` conserva su título estático, su `noindex` y su eco saneado

`/buscar` DEBE responder igual que en Next en sus tres estados:

- **sin consulta buscable:** "¿Qué estás buscando?" con las categorías;
- **con resultados:** `Resultados para "…"` con las tarjetas;
- **sin resultados:** `No encontramos negocios para "…".` y "Prueba con otra palabra o elige una categoría:".

DEBE conservar el título estático que sirve hoy Next, sin el texto que escribió el vecino, la instrucción de no indexar permitiendo seguir enlaces, el primer valor de `q` repetido y el recorte y saneado del eco: sin caracteres de control ni marcas bidi, cortado a 80 puntos de código y con "…" solo en el encabezado.

#### Scenario: la consulta no llega al título

- **WHEN** el vecino busca "quiero abogado por mi divorcio" con la medición configurada
- **THEN** el `<title>` es el mismo título estático de Next, el texto solo aparece en el `h1` y en el campo, y el script del proveedor lleva `data-exclude-search="true"`

#### Scenario: no indexable

- **WHEN** se revisa la metadata de `/buscar?q=plomero`
- **THEN** pide no indexarse y permite seguir enlaces, igual que en Next

#### Scenario: consulta hostil

- **WHEN** se busca una consulta con el byte NUL, `U+202E`, 300 caracteres y un emoji en el punto de corte
- **THEN** la respuesta de Astro es igual a la de Next: sin controles ni marcas bidi en el cuerpo y sin medio emoji, y responde 200

### Requirement: Las 404 de las rutas dinámicas muestran la página de no encontrado sin medirse

Cuando `/[destino]` no resuelve el slug, o `/negocio/[ficha]` no encuentra un negocio **publicado** con ese identificador (inexistente, malformado, en revisión, rechazado, despublicado o borrado), Astro DEBE responder la página de "no encontrado" del sitio dentro del documento base, con o sin JavaScript en el navegador:

- código 404;
- el encabezado "No encontramos esta página", la frase "A lo mejor el negocio ya no está publicado o la dirección quedó mal escrita." y un único enlace, "Ir al inicio", hacia `/`, dentro del header y el footer;
- la instrucción de no indexar y el mismo `<title>`, `<meta>` y canónica que manda Next en ese caso;
- sin el script de la medición aunque esté configurada, con el motivo de la exclusión escrito, igual que hoy, que no se miden;
- las cuatro cabeceras de seguridad y el mismo `Cache-Control` que Next.

La respuesta DEBE ser idéntica byte a byte en todos esos casos, así que una ficha no publicada y una inexistente no se distinguen. NO DEBE contener ningún dato de la petición ni del negocio: ni el slug, ni el nombre, ni la colonia, ni el WhatsApp, ni el identificador. Tampoco DEBE contener ningún rastro del marco.

Contra el documento de error de Next, el diff DEBE aceptar solo estas diferencias, y solo en las URLs de 404 dinámicas de design.md §7 cuando las dos versiones responden 404:

1. el `<body>`, que se compara contra el que manda Next para `/a/b/c` en lugar del `<body>` vacío del documento de error;
2. el `<link rel="stylesheet">` del `<head>`;
3. los atributos `lang` y `class` del `<html>`.

El script DEBE tener esas tres normalizaciones en una lista explícita, imprimir dónde aplicó cada una y reportar cualquier otra diferencia.

#### Scenario: slug desconocido

- **WHEN** alguien abre `/loquesea` o `/no-existe`
- **THEN** recibe 404 con "No encontramos esta página", la frase de ayuda y "Ir al inicio" hacia `/`, dentro del header y el footer, sin JavaScript en el navegador

#### Scenario: compuesto que no existe

- **WHEN** alguien abre `/plomeria-colonia-inventada`
- **THEN** ve la misma página de no encontrado que con `/loquesea`, con código 404 y el mismo HTML byte a byte

#### Scenario: ficha no publicada indistinguible de una inexistente

- **WHEN** se piden `/negocio/x-<id inexistente>`, `/negocio/x-<id en revisión>`, `/negocio/x-<id rechazado>`, `/negocio/x-<id despublicado>` y `/negocio/sin-identificador`
- **THEN** los cinco muestran "No encontramos esta página" con código 404, sus cuerpos son idénticos byte a byte, con las mismas cabeceras salvo la fecha, y ninguno contiene el nombre, la colonia, el WhatsApp ni el identificador del negocio

#### Scenario: no se indexa

- **WHEN** se revisa el `<head>` de `/loquesea` y el de una ficha en revisión
- **THEN** los dos piden no indexarse, igual que en Next

#### Scenario: la 404 dinámica no se mide

- **WHEN** con las dos variables de la medición configuradas se abre la URL de una ficha en revisión
- **THEN** el HTML no trae el script del proveedor, así que la URL con el nombre del negocio no sale del sitio, y el componente que la pinta declara por escrito por qué queda fuera de la medición

#### Scenario: sin rastros del marco

- **WHEN** se revisa cualquiera de esas respuestas
- **THEN** no aparece "Next", "Astro", `__next_error__` ni ninguna traza

#### Scenario: diferencias aceptadas acotadas

- **WHEN** se corre el diff con `--incluir-2b`
- **THEN** en las 404 dinámicas solo se aplican las tres normalizaciones listadas, la salida dice en qué URLs se aplicó cada una, y el `<body>` de Astro coincide con el que manda Next para `/a/b/c`

#### Scenario: una diferencia fuera de la lista reprueba

- **WHEN** la 404 dinámica de Astro difiere de la de Next en algo que no está en la lista, como un `<meta>` de más, otro `Cache-Control` o el script de la medición
- **THEN** el diff lo reporta como diferencia

### Requirement: Lo despublicado desaparece de toda superficie migrada en la siguiente petición

Al despublicar o borrar un negocio, la siguiente petición DEBE dejar de mostrarlo, sin reconstruir nada y sin que ninguna caché compartida lo conserve, en todas estas superficies de Astro:

- la home;
- el listado de su categoría, con y sin filtro;
- el filtro de colonias y los conteos;
- sus páginas de giro y de giro+colonia;
- los resultados de `/buscar`;
- `sitemap.xml`;
- la ficha, que responde la 404 dinámica;
- su foto, que responde el 404 vacío.

Ninguna superficie DEBE mostrar la fecha ni el motivo de la despublicación.

#### Scenario: despublicar y volver a pedir todo

- **WHEN** el admin despublica un negocio con foto y enseguida se piden a la build de Astro la home, el listado con y sin filtro, sus páginas de giro y de giro+colonia, `/buscar` con un término que lo encontraba, `sitemap.xml`, su ficha y su foto
- **THEN** ninguna página contiene sus datos, los conteos ya no lo incluyen, la ficha responde la 404 dinámica y la foto el 404 vacío

#### Scenario: nada se queda en una caché compartida

- **WHEN** se revisan las cabeceras de esas páginas y de la foto antes de despublicar
- **THEN** las páginas mandan `private, no-cache, no-store, max-age=0, must-revalidate` y la foto `private, max-age=3600`, igual que Next

### Requirement: La ruta de fotos responde igual que en Next y no expone el almacén

`/api/foto/<clave>/<variante>` DEBE seguir decidiendo en cada petición, con `servirFoto` sin cambios, si el negocio dueño de la clave está publicado.

- **Foto publicada:** DEBE responder 200 con los **mismos bytes** que Next para la misma clave, `Content-Type: image/webp`, el mismo `Content-Length` y `Cache-Control: private, max-age=3600`.
- **Casos que no deben distinguirse** (en revisión, rechazado, negocio inexistente, clave inventada con forma válida, variante inválida, archivo ausente y fallo de la base o del almacén): DEBEN responder el mismo 404 sin cuerpo, con `Cache-Control: no-store`, idéntico entre sí y al de Next.

En todos los casos la respuesta DEBE llevar las cuatro cabeceras de seguridad. NO DEBE redirigir al almacenamiento ni contener una URL o firma del bucket, y NO DEBE servir nada fuera del almacén de fotos.

#### Scenario: foto publicada idéntica

- **WHEN** se pide la variante `tarjeta` y la `ficha` de una foto publicada a las dos versiones
- **THEN** los cuerpos tienen el mismo hash, sin metadatos EXIF, y las cabeceras de tipo, tamaño y caché coinciden

#### Scenario: los cuatro 404 son el mismo

- **WHEN** se piden la foto de un negocio en revisión, la de uno rechazado, una clave inventada con forma válida y una clave válida con la variante `original`
- **THEN** las cuatro responden 404 sin cuerpo, `Cache-Control: no-store` y las mismas cabeceras, sin ningún byte de imagen

#### Scenario: rutas adversariales

- **WHEN** se piden direcciones de foto con `../`, `%2F`, `%00`, `%2e%2e`, mayúsculas cambiadas o la clave de otro negocio no publicado
- **THEN** ninguna responde 200 ni un byte de imagen o de un archivo del servidor, y el estado y el tipo de cada una son iguales a los de Next

#### Scenario: la base cae

- **WHEN** la base o el almacén fallan al pedir una foto
- **THEN** la respuesta es el mismo 404 vacío, no una página de error, y el log no trae la clave ni la ruta del almacén

#### Scenario: el bucket no se asoma

- **WHEN** se revisan las cabeceras y el cuerpo de cualquier respuesta de la ruta
- **THEN** no aparece `Location`, el dominio del almacenamiento ni ninguna firma

### Requirement: La foto prioritaria se precarga igual que en Next

La ficha con foto, y cada listado o página de resultados cuya primera tarjeta tenga foto, DEBEN emitir la misma precarga de imagen que emite Next, con la misma dirección, los mismos atributos y en la misma parte del documento. La foto prioritaria DEBE ir sin `loading` y las demás con `loading="lazy"`. Ninguna página DEBE pedir la variante de ficha para pintar una tarjeta.

Si la posición de la precarga no se puede igualar sin modificar `src/components/`, la diferencia de **posición** se acepta solo si está documentada en el reporte del dev y en el PR, con las rutas afectadas. Esto no autoriza cambios a `src/components/` (design.md §2). La dirección, los atributos, el `loading` y la variante siguen exigiendo paridad.

#### Scenario: precarga de la ficha

- **WHEN** se abre la ficha de un negocio con foto
- **THEN** el documento trae la misma `<link rel="preload" as="image">` hacia `/api/foto/<clave>/ficha` que Next, y el diff no reporta diferencias de `<link>` ni de secuencia, salvo la diferencia de posición documentada si se aceptó

#### Scenario: listado sin descargas de más

- **WHEN** se abre un listado con doce negocios con foto
- **THEN** solo la primera foto va sin `loading` y con precarga, y todas son de la variante `tarjeta`

### Requirement: La medición del directorio y su exclusión no cambian

Las páginas del directorio que responden 200 DEBEN cargar el script del proveedor en la misma posición que Next cuando la medición está configurada, y ninguno cuando no lo está. Los atributos de evento (`whatsapp-tarjeta`, `whatsapp-ficha`, `llamar`, `como-llegar`) DEBEN ser los mismos, con solo `categoria` y `colonia` como slugs, y el evento de "Llamar" DEBE seguir en el elemento envolvente. Las 404 dinámicas y la ruta de fotos NO DEBEN cargar la medición. Toda exclusión DEBE declarar su motivo por escrito.

#### Scenario: una ficha se mide sola

- **WHEN** con la medición configurada se abre una ficha publicada
- **THEN** hay exactamente un `<script>` diferido del proveedor, con `data-exclude-search="true"`, y ningún otro `<script>` salvo el JSON-LD

#### Scenario: atributos iguales

- **WHEN** se comparan los atributos de medición de una tarjeta y de una ficha cuya colonia es "Otra"
- **THEN** coinciden con los de Next: `colonia` vale `otra` y ningún atributo trae el nombre, el WhatsApp, el teléfono ni el identificador

#### Scenario: una exclusión nueva sin motivo reprueba

- **WHEN** alguien agrega en `src/pages/` o `src/astro/` una respuesta HTML fuera del tronco público sin escribir por qué
- **THEN** la verificación automática falla y nombra el archivo

### Requirement: El sitemap, los enlaces y las rutas reservadas resuelven en Astro

Toda URL que publica `sitemap.xml` y todo enlace interno o destino de formulario que pintan la home, los listados, la ficha y `/buscar` hacia rutas de esta fase DEBEN responder 200 en la build de Astro. Los enlaces a `/registro` y a `/negocio/<…>/reportar` esperan a la Fase 3: la verificación los acepta como excepción explícita por fase y el HTML que los pinta no cambia. La verificación de enlaces DEBE reconocer como rutas dinámicas declaradas las de `src/pages/`. `"404"` y `"500"` DEBEN estar en los segmentos reservados, y ningún slug de los catálogos DEBE coincidir con un segmento que publique `src/pages/`.

#### Scenario: el sitemap no lleva a un 404

- **WHEN** con la base semilla se piden a la build de Astro todas las URLs de su `sitemap.xml`
- **THEN** cada una responde 200, salvo `/registro`, que se sirve en la Fase 3 y responde igual que en 2a

#### Scenario: los enlaces de la Fase 3 son la única excepción

- **WHEN** el guardián de enlaces recorre la ficha
- **THEN** acepta `/registro` y `/negocio/<…>/reportar` por estar en la lista de excepciones de la Fase 3, y falla con cualquier otro `href` a una ruta que no existe

#### Scenario: el buscador envía a una ruta que existe

- **WHEN** se envía el buscador de la home sin JavaScript
- **THEN** llega a `/buscar?q=…` de Astro con sus resultados

#### Scenario: un slug "404" reprueba

- **WHEN** un catálogo de prueba trae una categoría o un giro con slug `404` o `500`
- **THEN** la verificación de rutas reservadas falla

### Requirement: Cabeceras y JavaScript de las rutas de 2b iguales a las de Next

Toda respuesta de las cuatro rutas de este change (200, 404 dinámica, 404 vacío de fotos y foto servida) DEBE llevar las cuatro cabeceras de `cabecerasDeSeguridad()` con sus valores actuales, sin cabeceras que anuncien el marco, y el `Content-Type` y el `Cache-Control` que manda Next para esa misma respuesta. Ninguna página de este change DEBE traer `<script>` propio, salvo los bloques JSON-LD y el del proveedor cuando está configurado, ni `modulepreload` ni islas. Un listado y una ficha DEBEN mantener rendimiento 100 en Lighthouse móvil.

#### Scenario: las cuatro en todas partes

- **WHEN** se piden a la salida real del build un listado, una página de giro, una ficha, `/buscar?q=plomero`, `/loquesea`, una ficha no publicada, una foto publicada y una foto inexistente
- **THEN** todas traen las cuatro cabeceras con los valores de `cabecerasDeSeguridad()`, ninguna trae `X-Powered-By` y el diff no reporta diferencias de tipo ni de caché

#### Scenario: cero JS propio

- **WHEN** se revisa el HTML de un listado, una ficha y `/buscar` sin la medición configurada
- **THEN** no hay `<script>` salvo el JSON-LD de la ficha, ni `modulepreload`, ni `astro-island`

#### Scenario: Lighthouse móvil

- **WHEN** se corre Lighthouse móvil sobre `/servicios-del-hogar` y una ficha con foto en un preview de Vercel
- **THEN** el rendimiento es 100 en las dos

### Requirement: El diff de 2b sale en cero y las pruebas no pierden dureza

El script de diff DEBE incluir siempre las rutas de esta fase (design.md §7) y reportar cero diferencias contra Next de `main`, con la medición configurada y sin ella. Solo quedan fuera de esa cuenta las diferencias aceptadas de la 404 dinámica y, si se documentó, la posición de la precarga. Las pruebas que hoy importan `src/app/` para estas rutas DEBEN pasar a probar las de Astro y conservar en cada archivo el mismo número de aserciones o más, sin `skip` nuevos. Al terminar, ninguna prueba de la suite DEBE importar una página o ruta de `src/app/` de la superficie pública de lectura.

#### Scenario: cero diferencias

- **WHEN** se corre el diff con la base semilla, sin y con las variables de la medición
- **THEN** reporta cero diferencias en todas las rutas de design.md §7, fuera de las normalizaciones listadas de la 404 dinámica, y si se aceptó, la posición de la precarga

#### Scenario: misma dureza

- **WHEN** se compara cada archivo de pruebas re-apuntado contra su versión anterior
- **THEN** tiene al menos las mismas aserciones, todas en verde contra Astro, y ninguna `skip` nueva

#### Scenario: nada de la superficie de lectura queda probándose en Next

- **WHEN** se buscan en `tests/` imports de `src/app/(publico)/[destino]`, `src/app/(publico)/negocio/[ficha]/page`, `src/app/(publico)/buscar` o `src/app/api/foto`
- **THEN** no aparece ninguno

### Requirement: La mitad 2b no altera producto ni llega a producción

Este change NO DEBE modificar `src/components/`, `src/app/`, `vercel.json`, `prisma/`, `openspec/specs/` ni `src/lib/`, salvo agregar `"404"` y `"500"` a `src/lib/rutas-reservadas.ts`. Su PR DEBE apuntar a la rama de la migración, nunca a `main`.

#### Scenario: el diff no toca producto

- **WHEN** se revisa el diff del change
- **THEN** en `src/lib/` solo cambia la lista de `rutas-reservadas.ts`, y no hay cambios en las demás rutas prohibidas

#### Scenario: producción no se entera

- **WHEN** se integra el change
- **THEN** su PR apunta a la rama de la migración y producción sigue sirviendo la versión de Next

## MODIFIED Requirements

> Requirement introducido por el change `migrar-lectura-publica-astro` (2a), todavía sin archivar. Este bloque se aplica al archivar 2b, después de 2a. Corrige la desviación de letra 1 de `d-validacion.md` de 2a: con `[destino]` en Astro, `/no-existe` deja de ser la 404 global.

### Requirement: La 404 responde igual que en Next

Una URL que no corresponde a ninguna ruta del sitio, como una con más segmentos de los que admite alguna ruta, DEBE responder con código 404 y la página de "no encontrado" en español dentro del documento base: el encabezado "No encontramos esta página", la frase "A lo mejor el negocio ya no está publicado o la dirección quedó mal escrita." y un único enlace, "Ir al inicio", hacia `/`. Las URLs que sí casan con `/[destino]` o `/negocio/[ficha]` y no resuelven siguen el requirement "Las 404 de las rutas dinámicas muestran la página de no encontrado sin medirse": la misma página, sin medición. Ninguna 404 DEBE mostrar la página de error por defecto de Astro, ningún texto en inglés ni ningún detalle técnico.

#### Scenario: URL desconocida

- **WHEN** alguien abre `/a/b/c`
- **THEN** recibe código 404 con el encabezado "No encontramos esta página", la frase "A lo mejor el negocio ya no está publicado o la dirección quedó mal escrita." y el enlace "Ir al inicio" hacia `/`, dentro del header y el footer

#### Scenario: un solo segmento desconocido muestra la misma página

- **WHEN** alguien abre `/no-existe`
- **THEN** recibe código 404 con "No encontramos esta página" dentro del header y el footer, con el mismo `<body>` que `/a/b/c`, sin el script de la medición, y el diff contra Next solo aplica las normalizaciones de la 404 dinámica

#### Scenario: nada de la 404 por defecto del marco

- **WHEN** se revisa el HTML de cualquier 404 del sitio
- **THEN** no aparece ningún texto en inglés, ni el nombre del marco, ni una traza de error
