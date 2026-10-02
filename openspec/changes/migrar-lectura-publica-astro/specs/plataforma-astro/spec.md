# Delta: plataforma-astro

> Fase 2a de ADR-013 (T-023): el armazón público y las rutas `/`, `/aviso-de-privacidad`, `/terminos`, 404, `/robots.txt`, `/sitemap.xml` y `/opengraph-image` pasan a servirse con Astro. **Ningún comportamiento de producto cambia**. Siguen siendo el contrato los requirements de `layout-base`, `paginas-legales` y `directorio-publico` que tocan estas rutas, y los de cabeceras de `despliegue`. Lo que sigue exige que la versión Astro se comporte igual que la de Next. `/[destino]`, `/negocio/[ficha]`, `/buscar` y `/api/foto/…` van en el change siguiente (2b).

## ADDED Requirements

### Requirement: Las páginas públicas se arman con un documento base y un tronco medido, como en Next

Toda página migrada DEBE pintarse dentro de un documento base equivalente al layout raíz de Next: `lang="es-MX"`, header con el wordmark, `main` y footer, con las mismas clases. Las páginas públicas medidas DEBEN usar además un tronco público. Ese tronco, y solo él, inyecta el script de la medición, en la misma posición del documento que hoy. La exclusión de la medición DEBE seguir siendo una propiedad de la estructura y no una lista de rutas. Una página que use el documento base sin el tronco DEBE declarar por escrito por qué queda fuera, y la 404 de las URLs desconocidas queda fuera, como hoy. Los avisos de arranque (sin URL pública, sin base, sin secreto de tareas, sin almacén de fotos) DEBEN seguir saliendo una sola vez por proceso y nunca por petición.

#### Scenario: una página pública queda medida

- **WHEN** el sitio corre con las dos variables de la medición configuradas y un vecino abre `/` o `/aviso-de-privacidad`
- **THEN** la página trae header, `main` y footer dentro de `<html lang="es-MX">`, y exactamente un `<script>` diferido del proveedor, con `data-exclude-search="true"`

#### Scenario: la 404 de una URL desconocida no se mide

- **WHEN** con la medición configurada alguien abre `/a/b/c`
- **THEN** ve la 404 dentro del header y el footer, y el HTML no trae el script del proveedor

#### Scenario: una exclusión sin motivo reprueba

- **WHEN** alguien agrega en `src/pages/` una página que usa el documento base sin el tronco público y sin escribir por qué
- **THEN** la verificación automática falla y nombra el archivo

#### Scenario: los avisos de arranque no inundan el log

- **WHEN** el sitio corre en producción sin `SITIO_URL` y recibe diez peticiones a páginas distintas
- **THEN** el log del servidor trae una sola vez el aviso de la URL pública faltante, y ninguna página falla

### Requirement: Los metadatos de cada página son los mismos que emitía Next

Cada página migrada DEBE emitir el mismo conjunto de `<title>`, `<meta>` y `<link rel="canonical">` que la versión Next para el mismo entorno. Eso incluye:

- la plantilla `«Título» — EnMiRumbo` y el título del sitio cuando la página no declara uno;
- la descripción;
- la canónica absoluta;
- la instrucción de robots;
- la identidad de la vista previa (nombre del sitio, `es_MX`, tipo);
- la imagen de marca con su ancho, alto, tipo y texto alternativo;
- `charset` y `viewport`.

Los metadatos DEBEN seguir saliendo de los módulos actuales de `src/lib/seo/`, sin duplicar textos. Toda respuesta 404 DEBE pedir que no se indexe, como hace hoy Next. Sin URL pública declarada en producción, ninguna de estas páginas DEBE publicar una URL absoluta a la dirección local.

#### Scenario: la home conserva el título del sitio

- **WHEN** se abre `/`
- **THEN** el título es "EnMiRumbo — Encuentra negocios y servicios en Tizayuca", la descripción es la del sitio y no hay instrucción de no indexar

#### Scenario: las legales llevan su título con la marca al final

- **WHEN** se abren `/aviso-de-privacidad` y `/terminos`
- **THEN** cada una tiene `«su título» — EnMiRumbo` y su propia descripción, iguales a las de la versión Next, y ninguna pide no ser indexada

#### Scenario: la vista previa heredada trae la imagen de marca

- **WHEN** con `SITIO_URL` declarada se revisan los metadatos de la home y de una página legal
- **THEN** `og:image` apunta a `«SITIO_URL»/opengraph-image` con su parámetro de versión, `og:image:width` vale 1200, `og:image:height` vale 630, `og:image:type` vale `image/png` y `og:image:alt` dice "EnMiRumbo: encuentra negocios y servicios de Tizayuca y contáctalos por WhatsApp"

#### Scenario: la 404 pide no indexarse y declara su imagen

- **WHEN** se abre una URL desconocida con `SITIO_URL` declarada
- **THEN** el HTML trae `<meta name="robots" content="noindex">` y la imagen de marca absoluta, sin parámetro de versión

#### Scenario: producción sin URL pública

- **WHEN** el sitio corre en producción sin `SITIO_URL` y se abren `/`, las dos legales y una URL desconocida
- **THEN** ninguna trae canónica, `og:image` ni otra URL absoluta hacia `localhost`, y todas responden con normalidad

### Requirement: La 404 responde igual que en Next

Una URL que no corresponde a ninguna ruta DEBE responder con código 404 y la página de "no encontrado" en español dentro del documento base: el encabezado "No encontramos esta página", la frase "A lo mejor el negocio ya no está publicado o la dirección quedó mal escrita." y un único enlace, "Ir al inicio", hacia `/`. NO DEBE mostrar la página de error por defecto de Astro, ningún texto en inglés ni ningún detalle técnico.

#### Scenario: URL desconocida

- **WHEN** alguien abre `/no-existe` o `/a/b/c`
- **THEN** recibe código 404 con el encabezado "No encontramos esta página", la frase "A lo mejor el negocio ya no está publicado o la dirección quedó mal escrita." y el enlace "Ir al inicio" hacia `/`, dentro del header y el footer

#### Scenario: nada de la 404 por defecto del marco

- **WHEN** se revisa el HTML de cualquier 404 del sitio
- **THEN** no aparece ningún texto en inglés, ni el nombre del marco, ni una traza de error

### Requirement: `robots.txt` y `sitemap.xml` responden igual que en Next

`/robots.txt` y `/sitemap.xml` DEBEN generarse por petición y responder, para la misma base y el mismo entorno, el mismo cuerpo y el mismo tipo de contenido que la versión Next. Eso cubre las mismas reglas, las mismas URLs, la misma fecha de última modificación por ficha y el mismo comportamiento sin URL pública declarada: sin línea de sitemap en `robots.txt` y un sitemap válido y vacío.

#### Scenario: robots igual al de hoy

- **WHEN** con `SITIO_URL` declarada se pide `/robots.txt` a las dos versiones
- **THEN** los dos cuerpos son iguales: permiten `/`, excluyen `/admin`, `/buscar` y `/registro/gracias`, y anuncian `«SITIO_URL»/sitemap.xml`, con el mismo tipo de contenido de texto

#### Scenario: robots sin URL pública

- **WHEN** el sitio corre en producción sin `SITIO_URL` y se pide `/robots.txt`
- **THEN** la respuesta no trae línea de sitemap ni ninguna dirección local

#### Scenario: sitemap igual al de hoy

- **WHEN** con la base semilla se pide `/sitemap.xml` a las dos versiones
- **THEN** las dos traen exactamente el mismo conjunto de URLs y de fechas de última modificación, con el mismo tipo de contenido XML

#### Scenario: el sitemap se sigue armando por petición

- **WHEN** el admin publica un negocio con un giro que no tenía ninguno, sin volver a construir el sitio
- **THEN** la siguiente lectura de `/sitemap.xml` ya trae su ficha y la URL de ese giro

#### Scenario: sitemap sin URL pública

- **WHEN** el sitio corre en producción sin `SITIO_URL` y se pide `/sitemap.xml`
- **THEN** responde un documento XML válido sin ninguna URL

### Requirement: La imagen de marca se sirve en la misma dirección y no se renderiza por petición

`/opengraph-image` DEBE seguir respondiendo una imagen PNG de 1200×630 con el wordmark "EnMiRumbo", "Tizayuca" debajo, más chica y separada, la línea "Negocios y servicios de aquí, verificados uno por uno." y la pastilla "Contáctalos por WhatsApp". La imagen DEBE generarse al construir el sitio, desde código revisable y sin un binario de imagen en el repositorio. Ningún dato de la petición DEBE llegar al generador, y la función del servidor NO DEBE incluir código para generar imágenes. Las dependencias que la generan NO DEBEN tener avisos de seguridad conocidos al integrarse.

#### Scenario: la imagen responde en su dirección de siempre

- **WHEN** alguien pide `/opengraph-image`
- **THEN** recibe 200 con `Content-Type: image/png`, una imagen de 1200×630 y las cuatro cabeceras de seguridad

#### Scenario: la imagen dice lo mismo que hoy

- **WHEN** se revisa lo que se le pasa al generador de la imagen
- **THEN** contiene "EnMiRumbo", "Tizayuca" en un elemento aparte, "Negocios y servicios de aquí, verificados uno por uno." y "Contáctalos por WhatsApp", con los colores de la marca, y no contiene la marca anterior ni la localidad pegada al wordmark

#### Scenario: nada se renderiza por petición

- **WHEN** se inspecciona la salida del build
- **THEN** `/opengraph-image` es un archivo estático y el paquete de la función del servidor no contiene el generador de imágenes

#### Scenario: dependencias sin avisos

- **WHEN** se corre `npm audit` tras agregar las dependencias de la imagen
- **THEN** ninguna de ellas, ni lo que traen, aparece con un aviso de seguridad

### Requirement: Las cabeceras de seguridad son idénticas en respuestas dinámicas, prerenderizadas, 404 y estáticas

Toda respuesta de las rutas migradas DEBE llevar exactamente las cuatro cabeceras de `cabecerasDeSeguridad()` con sus valores actuales: Content-Security-Policy, `X-Content-Type-Options`, `X-Frame-Options` y `Referrer-Policy`. Eso vale para las respuestas de la función, las que sirve la CDN sin pasar por la función (páginas prerenderizadas, 404, imagen de marca y hojas de estilo de `/_astro/`) y las 404. Ninguna respuesta DEBE anunciar el marco de trabajo. La cabecera global NO DEBE pisar una política de referente más estricta que declare una ruta. Las páginas dinámicas DEBEN mandar el mismo `Cache-Control` que manda hoy Next.

#### Scenario: las cuatro en todas partes

- **WHEN** se piden `/`, `/aviso-de-privacidad`, `/terminos`, `/no-existe`, `/robots.txt`, `/sitemap.xml`, `/opengraph-image` y una hoja de `/_astro/` a la salida real del build
- **THEN** todas traen las cuatro cabeceras con los mismos valores que `cabecerasDeSeguridad()`, y ninguna trae `X-Powered-By` ni otra que nombre el marco

#### Scenario: lo que sirve la CDN, en un preview de Vercel

- **WHEN** se piden `/aviso-de-privacidad`, `/no-existe` y `/opengraph-image` a un preview de Vercel de la rama
- **THEN** las tres traen las cuatro cabeceras, aunque no hayan pasado por la función

#### Scenario: una política más estricta no se pisa

- **WHEN** una ruta responde con `Referrer-Policy: strict-origin`
- **THEN** la respuesta conserva `strict-origin` y no recibe la política global

#### Scenario: lo dinámico no se guarda en cachés compartidas

- **WHEN** se pide `/` a las dos versiones
- **THEN** las dos mandan el mismo `Cache-Control`

### Requirement: El HTML servido no difiere del de Next

Un script del repositorio DEBE comparar, ruta por ruta, la respuesta de la versión Next (rama `main`) con la de Astro, servidas con la misma base y el mismo entorno. Compara estado, cabeceras de seguridad, tipo de contenido, `Cache-Control`, idioma, título, `<meta>`, canónica, JSON-LD, texto visible, enlaces y la secuencia de elementos con sus clases, después de quitar lo que es propio de cada marco (runtime y hashes de assets). Para las rutas de este change, el resultado DEBE ser cero diferencias, con la medición configurada y sin ella.

#### Scenario: cero diferencias en las rutas migradas

- **WHEN** se corre el script contra las dos versiones con la base semilla, primero sin y después con las variables de la medición
- **THEN** reporta cero diferencias en `/`, `/aviso-de-privacidad`, `/terminos`, `/no-existe`, `/robots.txt`, `/sitemap.xml` y `/opengraph-image` (estado, tipo y cabeceras)

#### Scenario: el script sí ve una diferencia

- **WHEN** a una de las dos respuestas le falta un enlace, cambia una `<meta>` o pierde una cabecera de seguridad
- **THEN** el script termina con error y nombra la ruta y la diferencia

### Requirement: Las páginas migradas no llevan JavaScript propio y conservan el rendimiento móvil

Ninguna página migrada DEBE traer `<script>` salvo el del proveedor de medición cuando está configurado. Tampoco DEBE traer `modulepreload` ni islas de hidratación, y ningún archivo de `src/pages/` ni `src/layouts/` DEBE usar una directiva `client:`. La home y las legales DEBEN mantener rendimiento 100 en Lighthouse móvil.

#### Scenario: cero JS propio

- **WHEN** se revisa el HTML de `/`, `/aviso-de-privacidad`, `/terminos` y de una 404 sin la medición configurada
- **THEN** no hay ninguna etiqueta `<script>` (salvo bloques de datos), ni `modulepreload`, ni `astro-island`

#### Scenario: ninguna directiva de cliente

- **WHEN** se buscan directivas `client:` en `src/pages/` y `src/layouts/`
- **THEN** no aparece ninguna

#### Scenario: Lighthouse móvil

- **WHEN** se corre Lighthouse móvil sobre `/` y `/aviso-de-privacidad` de la salida del build
- **THEN** el rendimiento es 100 en las dos

### Requirement: La verificación automática cubre las rutas de Astro sin perder dureza

Las pruebas que hoy importan `src/app/` para las rutas de este change DEBEN pasar a probar las de Astro, y conservar en cada archivo el mismo número de aserciones o más. Ninguna DEBE borrarse, debilitarse ni saltarse sin un reemplazo que verifique lo mismo. Los guardianes que hoy recorren `src/app/` DEBEN recorrer también `src/pages/` y `src/layouts/`: marca, responsivo, enlaces internos y destinos de formulario, rutas reservadas del catálogo y rutas que leen la base. Una página prerenderizada que lea la base DEBE reprobar el CI.

#### Scenario: misma dureza

- **WHEN** se compara cada archivo de pruebas re-apuntado contra su versión anterior
- **THEN** tiene al menos las mismas aserciones, todas en verde contra las páginas de Astro, y ninguna `skip` nueva

#### Scenario: un slug no queda tapado por una ruta de Astro

- **WHEN** un catálogo trae un giro cuyo slug coincide con `robots.txt`, `sitemap.xml`, `opengraph-image`, `terminos` o `aviso-de-privacidad`
- **THEN** la verificación de rutas reservadas falla igual que hoy con las rutas de Next

#### Scenario: una prerenderizada que lee la base reprueba

- **WHEN** alguien marca como prerenderizada una página que importa el acceso a la base
- **THEN** la verificación automática lo señala y el CI falla

#### Scenario: la marca anterior tampoco entra por Astro

- **WHEN** alguien escribe la marca anterior o la localidad pegada al wordmark en un archivo de `src/pages/` o `src/layouts/`
- **THEN** el guardián de marca falla y nombra el archivo

### Requirement: Este change no altera producto ni llega a producción

El change NO DEBE modificar `src/lib/`, `src/components/`, `src/app/`, `vercel.json`, `prisma/` ni `openspec/specs/`, y su PR DEBE apuntar a la rama de la migración, nunca a `main`.

#### Scenario: el diff no toca producto

- **WHEN** se revisa el diff del change
- **THEN** no hay cambios en `src/lib/`, `src/components/`, `src/app/`, `vercel.json`, `prisma/` ni `openspec/specs/`

#### Scenario: producción no se entera

- **WHEN** se integra el change
- **THEN** su PR apunta a `migracion-astro` y producción sigue sirviendo la versión de Next

## MODIFIED Requirements

> Requirement introducido por el change `agregar-andamio-astro` (T-022). Este MODIFIED solo aplica si ese change se archiva antes con la letra original. Si la letra se corrige en el PR #31 antes de mergearlo, este bloque se quita (ver `proposal.md`, "Decisión sobre `fetchpriority`").

### Requirement: Los componentes no dependen de Next para enlaces e imágenes

Ningún archivo de `src/components/` DEBE importar `next/link` ni `next/image`. En su lugar DEBEN usar una capa de compatibilidad propia, `Link` e `Imagen`, que para las props que hoy se usan produzca el mismo HTML que producían los de Next: un `<a>` con su `href` y atributos, y un `<img>` sin optimizador, con el posicionamiento de relleno y `loading="lazy"` salvo en la imagen prioritaria, que va sin atributo `loading`. Como `next/image` 16 no emite `fetchpriority` en este caso, la capa tampoco lo emite. Ningún texto, clase ni atributo visible al vecino DEBE cambiar.

#### Scenario: ningún componente importa Next

- **WHEN** se busca `next/link` o `next/image` en `src/components/`
- **THEN** no aparece ninguna coincidencia

#### Scenario: el enlace se pinta igual

- **WHEN** se renderiza en servidor `Link` y `next/link` con el mismo `href`, `className` e hijos, como los usa el header ("EnMiRumbo" hacia `/`)
- **THEN** los dos HTML son idénticos

#### Scenario: la foto se pinta igual

- **WHEN** se renderiza en servidor `Imagen` y `next/image` con las props de `MarcadorFoto` (relleno, sin optimizar, `sizes`, `className`, `alt`), con y sin prioridad
- **THEN** los dos `<img>` llevan los mismos atributos y valores: la no prioritaria con `loading="lazy"`, la prioritaria sin `loading` y sin `fetchpriority`, y ninguna apunta a `/_next/image`

#### Scenario: las pruebas de render no se enteran

- **WHEN** se corren los archivos de pruebas que renderizan con `react-dom/server`
- **THEN** todos pasan sin que se haya modificado, quitado ni saltado ninguna aserción
