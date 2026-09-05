# Delta: layout-base

## MODIFIED Requirements

### Requirement: Layout global con header y footer en todas las páginas

Toda página del sitio DEBE renderizarse dentro de un layout global con un header que muestra la marca como wordmark tipográfico "EnMiRumbo", y un footer al final de la página. El footer DEBE incluir los enlaces a las dos páginas legales, con los textos literales "Aviso de privacidad" y "Términos y condiciones", cada uno hacia una página que existe y con área táctil de al menos 44px.

ENMENDADO (encargo del fundador: "el header se ve limpio con solo el wordmark"): el header ya NO lleva "Tizayuca" junto al wordmark. El posicionamiento hiperlocal sigue siendo obligatorio en el producto, pero se exige en otras superficies: el `h1` de la home, el footer (con la línea "Hecho para los vecinos de Tizayuca, Hidalgo.") y toda la metadata SEO (`title`, `description`, Open Graph) del requirement "Server Component con documento en es-MX y metadata base".

ENMENDADO (rebrand aprobado por el fundador el 2026-09-04, T-019): la marca del sitio es **"EnMiRumbo"**, escrita junto, con `M` y `R` mayúsculas y **sin localidad pegada**. NO DEBE existir una forma compuesta tipo "«marca» + Tizayuca" en ninguna superficie: donde el contexto geográfico haga falta, se escribe como descriptor —"EnMiRumbo, el directorio de negocios de Tizayuca"— y a partir de la segunda mención se usa "EnMiRumbo" a secas. La geografía es lo que el sitio dice de sí mismo, no parte de su nombre. La línea "Hecho para los vecinos de Tizayuca, Hidalgo." NO cambia.

#### Scenario: header con el wordmark

- **WHEN** un vecino abre cualquier página del sitio en su celular
- **THEN** ve en la parte superior el wordmark "EnMiRumbo", enlazado a la home, sin ninguna localidad pegada al nombre

#### Scenario: el posicionamiento hiperlocal sigue visible fuera del header

- **WHEN** un vecino abre la home o llega al final de cualquier página
- **THEN** ve "Tizayuca" en el `h1` de la home y en el footer, en la línea "Hecho para los vecinos de Tizayuca, Hidalgo.", y no como apellido de la marca

#### Scenario: la línea de cierre del footer no cambió con el rebrand

- **WHEN** el vecino llega al final de cualquier página después del rebrand
- **THEN** sigue leyendo, palabra por palabra, "Hecho para los vecinos de Tizayuca, Hidalgo."

#### Scenario: footer con los enlaces legales y sin enlaces muertos

- **WHEN** el vecino llega al final de cualquier página
- **THEN** ve el footer con la identificación del sitio ("EnMiRumbo") y los enlaces "Aviso de privacidad" y "Términos y condiciones", cada uno hacia una página que existe de verdad, y ningún enlace que lleve a una página inexistente

#### Scenario: los enlaces del footer se pueden tocar en el celular

- **WHEN** el dueño de un negocio toca "Aviso de privacidad" o "Términos y condiciones" desde su celular
- **THEN** cada enlace mide al menos 44px en su dimensión menor y lo lleva a la página correspondiente

### Requirement: Server Component con documento en es-MX y metadata base

El layout global DEBE ser un Server Component que no envíe JavaScript de cliente propio. La ÚNICA excepción es el script del proveedor de analítica cookieless: es JavaScript de un tercero, condicional a la configuración, diferido, ausente en `/admin` y sin código propio alrededor; justificado por el PRD §9 ("analítica desde el día 1") y ADR-005. El documento DEBE declarar `lang="es-MX"` y exponer metadata base del sitio: título "EnMiRumbo — Encuentra negocios y servicios en Tizayuca" y descripción "Encuentra negocios, servicios y deporte en Tizayuca y contáctalos directo por WhatsApp. Registro gratis para negocios locales." La geografía del título sigue viviendo en el descriptor ("en Tizayuca"), que es donde ya estaba; lo que desaparece es la localidad pegada al nombre.

Ese título DEBE seguir siendo el de las páginas que no declaran uno propio (la home, entre ellas), y las páginas que sí lo declaran DEBEN presentarse en el documento como `«Título de la página» — EnMiRumbo`, para que un resultado de búsqueda diga primero de qué es la página y después de quién.

El layout DEBE declarar además la **URL pública del sitio como base de todas las URLs absolutas** (canónicas, sitemap y vista previa al compartir), tomada de la misma variable de entorno que ya usa el panel para armar el link de la ficha (`SITIO_URL`). Fuera de producción, sin variable declarada, DEBE usarse la dirección local de desarrollo. En producción, si la variable no está declarada o es ilegible, el sitio NO DEBE publicar URLs absolutas apuntando a la dirección local: se omiten las canónicas y la vista previa absoluta y queda constancia en el log del servidor (una sola vez por proceso, nunca por petición).

El layout DEBE declarar también la identidad de la vista previa al compartir que heredan todas las páginas: el nombre del sitio "EnMiRumbo", el idioma español de México y una imagen de marca del propio sitio. Esa imagen DEBE mostrar el wordmark vigente —"EnMiRumbo", con "Tizayuca" debajo en la línea de contexto, más chica y separada, como descriptor y no como parte del nombre— y su texto alternativo DEBE nombrar al sitio con la misma marca sola; una vista previa con la marca anterior es la superficie más difícil de notar y la que más lejos viaja.

#### Scenario: documento en español de México con metadata

- **WHEN** se carga cualquier página del sitio
- **THEN** el HTML declara `lang="es-MX"` y el `<title>` y la meta descripción incluyen "Tizayuca"

#### Scenario: la home conserva el título del sitio

- **WHEN** se abre la ruta raíz
- **THEN** el título del documento es "EnMiRumbo — Encuentra negocios y servicios en Tizayuca"

#### Scenario: una página con título propio lleva la marca al final

- **WHEN** se abre el listado de una categoría, cuyo título propio es "Servicios del hogar en Tizayuca"
- **THEN** el título del documento es "Servicios del hogar en Tizayuca — EnMiRumbo"

#### Scenario: la ficha compartida por WhatsApp llega con la marca nueva

- **WHEN** un vecino comparte cualquier página del sitio y la aplicación pinta la vista previa
- **THEN** el nombre del sitio dice "EnMiRumbo" a secas, la imagen muestra ese wordmark con "Tizayuca" debajo como línea de contexto, y no aparece por ningún lado el nombre anterior ni una marca con la localidad pegada

#### Scenario: URL base declarada

- **WHEN** el sitio corre con la URL pública declarada en su variable de entorno
- **THEN** las canónicas, las URLs del sitemap y la imagen de la vista previa son absolutas y usan ese origen

#### Scenario: producción sin URL pública declarada

- **WHEN** el sitio corre en producción sin la variable de la URL pública
- **THEN** no se publica ninguna URL absoluta que apunte a la dirección local, el hecho queda en el log del servidor y ninguna página falla por eso

#### Scenario: sin JS de cliente en el layout

- **WHEN** se construye el sitio y se revisa el layout, el header y el footer
- **THEN** ninguno usa la directiva `"use client"` ni agrega bundles de cliente propios

#### Scenario: el único script es el de la medición

- **WHEN** se revisa el HTML de una página pública con la medición configurada
- **THEN** el único JavaScript externo que carga es el del proveedor de analítica; sin configuración, no carga ninguno

## ADDED Requirements

### Requirement: Ninguna superficie del sitio nombra la marca anterior ni pega la localidad al nombre

Ninguna superficie servida del sitio —páginas públicas, panel, metadata, vista previa al compartir, textos legales y mensajes de WhatsApp que el sitio arma— DEBE contener la marca anterior ("NecesitoUno", en cualquier combinación de mayúsculas y minúsculas, junto o pegada a un dominio) **ni la forma compuesta "EnMiRumbo Tizayuca"**, que el fundador descartó junto con el nombre viejo. La verificación automática del proyecto DEBE incluir un guardián que revise el código de las superficies del sitio y falle nombrando el archivo cuando cualquiera de las dos reaparezca, para que un literal nuevo escrito por otro change no las resucite sin que nadie se entere.

El guardián NO DEBE alcanzar la documentación histórica del repositorio —devlog, decisiones (ADR), tickets ya cerrados y changes archivados—, que nombra a la marca anterior a propósito porque cuenta lo que pasó cuando pasó. Reescribir esa historia para pasar la verificación sería peor que el problema que evita.

#### Scenario: un literal nuevo trae la marca vieja

- **WHEN** alguien agrega al sitio un texto, un título o un mensaje de WhatsApp que dice "NecesitoUno"
- **THEN** la verificación automática falla e indica en qué archivo apareció

#### Scenario: alguien vuelve a pegarle la localidad a la marca

- **WHEN** alguien escribe en el sitio un literal que dice "EnMiRumbo Tizayuca"
- **THEN** la verificación automática falla igual que con la marca anterior, e indica que la localidad va como descriptor y no pegada al nombre

#### Scenario: las páginas legales tampoco la nombran en su metadata

- **WHEN** se revisan el título y la descripción de `/aviso-de-privacidad`, de `/terminos`, de la página de resultados del buscador y del panel
- **THEN** ninguno menciona la marca anterior y todos usan "EnMiRumbo"

#### Scenario: la historia del repositorio se queda como está

- **WHEN** se corre la verificación con los devlogs, los ADR, los tickets cerrados y los changes archivados nombrando a "NecesitoUno"
- **THEN** la verificación pasa: esos documentos están fuera de su alcance
