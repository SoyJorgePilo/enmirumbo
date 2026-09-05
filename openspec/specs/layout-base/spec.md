# Spec: layout-base

## Requirements

### Requirement: Layout global con header y footer en todas las páginas

Toda página del sitio DEBE renderizarse dentro de un layout global con un header que muestra la marca como wordmark tipográfico "NecesitoUno", y un footer al final de la página. El footer DEBE incluir los enlaces a las dos páginas legales, con los textos literales "Aviso de privacidad" y "Términos y condiciones", cada uno hacia una página que existe y con área táctil de al menos 44px.

ENMENDADO (encargo del fundador: "el header se ve limpio con solo el wordmark"): el header ya NO lleva "Tizayuca" junto al wordmark. El posicionamiento hiperlocal sigue siendo obligatorio en el producto, pero se exige en otras superficies: el `h1` de la home, el footer (que ya lo trae con "NecesitoUno Tizayuca" y "Hecho para los vecinos de Tizayuca, Hidalgo.") y toda la metadata SEO (`title`, `description`, Open Graph) del requirement "Server Component con documento en es-MX y metadata base".

#### Scenario: header con el wordmark

- **WHEN** un vecino abre cualquier página del sitio en su celular
- **THEN** ve en la parte superior el wordmark "NecesitoUno", enlazado a la home

#### Scenario: el posicionamiento hiperlocal sigue visible fuera del header

- **WHEN** un vecino abre la home o llega al final de cualquier página
- **THEN** ve "Tizayuca" en el `h1` de la home y en el footer ("NecesitoUno Tizayuca", "Hecho para los vecinos de Tizayuca, Hidalgo.")

#### Scenario: footer con los enlaces legales y sin enlaces muertos

- **WHEN** el vecino llega al final de cualquier página
- **THEN** ve el footer con la identificación del sitio ("NecesitoUno Tizayuca") y los enlaces "Aviso de privacidad" y "Términos y condiciones", cada uno hacia una página que existe de verdad, y ningún enlace que lleve a una página inexistente

#### Scenario: los enlaces del footer se pueden tocar en el celular

- **WHEN** el dueño de un negocio toca "Aviso de privacidad" o "Términos y condiciones" desde su celular
- **THEN** cada enlace mide al menos 44px en su dimensión menor y lo lleva a la página correspondiente

### Requirement: Paleta y tipografía como tokens reutilizables con el verde WhatsApp como acción principal

La paleta de colores y la tipografía DEBEN estar definidas como tokens con nombre en la configuración de Tailwind (bloque `@theme` de `globals.css`), de modo que las pantallas futuras las consuman por nombre y no con valores sueltos. El verde WhatsApp DEBE existir como token y estar documentado en el propio archivo como el color de acción principal del sitio; ningún otro token de la paleta DEBE competir con él como color de acción.

#### Scenario: el verde de acción está tokenizado y documentado

- **WHEN** un desarrollador abre la configuración de tokens para estilizar un botón de acción
- **THEN** encuentra el token del verde WhatsApp con un comentario que lo documenta como color de acción principal, y puede usarlo como clase de Tailwind sin escribir el valor hexadecimal

#### Scenario: el layout consume solo tokens

- **WHEN** se revisan el layout, el header, el footer y la home provisional
- **THEN** todos los colores y familias tipográficas provienen de los tokens definidos, sin valores hexadecimales sueltos en los componentes

### Requirement: Diseño mobile-first sin scroll horizontal

El layout DEBE verse correcto en un viewport de 390px de ancho y adaptarse hacia arriba (tablet y escritorio) sin producir scroll horizontal en ningún ancho.

ENMENDADO (enmienda aprobada por el fundador, revisión visual lote 2): "sin scroll horizontal" DEBE sostenerse por construcción y estar verificado, no solo afirmado. En las pantallas públicas NO DEBE usarse ninguna clase que impida el colapso responsivo: texto forzado a una sola línea (`whitespace-nowrap`, `text-nowrap`), recorte de etiquetas (`truncate`), anchos mínimos distintos de `min-w-0` ni anchos fijos en píxeles. Toda retícula DEBE declarar una sola columna como base y agregar columnas por punto de quiebre. La suite de pruebas DEBE incluir un guardián que revise el HTML servido de las pantallas públicas y falle si alguna clase rompe esas reglas.

La verificación visual a 390px DEBE hacerse con emulación de dispositivo real (el viewport de la página fijado a 390px). Una captura pedida solo con el tamaño de ventana del navegador NO es prueba válida: el navegador puede negarse a achicar la ventana por debajo del mínimo del sistema (medido: 500px en macOS), maquetar a ese ancho mayor y recortar la imagen al tamaño pedido, lo que hace ver como "desbordamiento" un contenido que en un celular real cabe completo.

#### Scenario: ninguna pantalla pública bloquea el colapso responsivo

- **WHEN** se revisa el HTML servido de la home, el listado, la ficha, el registro, los resultados de búsqueda y las páginas legales
- **THEN** ninguna clase fuerza una sola línea, recorta etiquetas, fija un ancho mínimo ni fija columnas sin punto de quiebre

#### Scenario: la medición del ancho no depende del tamaño de la ventana

- **WHEN** alguien verifica que una pantalla no desborda a 390px
- **THEN** lo hace con el viewport emulado en 390px y comparando el ancho de desplazamiento del documento contra el ancho del viewport, no con una captura pedida por tamaño de ventana

#### Scenario: celular a 390px

- **WHEN** el sitio se abre en un viewport de 390px de ancho
- **THEN** el header, el contenido y el footer se ven completos y legibles, sin scroll horizontal

#### Scenario: adaptación a escritorio

- **WHEN** el sitio se abre en un viewport de tablet o escritorio
- **THEN** el contenido se adapta (por ejemplo, con un ancho máximo centrado) manteniendo la misma estructura y sin scroll horizontal

### Requirement: Accesibilidad base del PRD §8

El layout DEBE usar HTML semántico con landmarks (`header`, `main`, `footer`) y jerarquía de encabezados correcta (un solo `h1` por página). Todas las combinaciones de tokens de color usadas para texto DEBEN cumplir contraste AA (WCAG 2.1: ≥4.5:1 en texto normal). Todo elemento interactivo del layout DEBE tener un área táctil de al menos 44px.

ENMENDADO (corrección de contraste no-textual reportada por el fundador): los contornos de los controles de formulario (inputs, selects, textareas y checkboxes/radios de captura, en cualquier pantalla del sitio) DEBEN alcanzar una relación de contraste de al menos 3:1 contra el fondo sobre el que se recortan (WCAG 2.1, criterio 1.4.11). Los bordes puramente decorativos (tarjetas, separadores, pastillas de navegación) quedan fuera de esta regla.

ENMENDADO (enmienda aprobada por el fundador, revisión visual lote 2): el **botón/enlace de acción secundaria** —"Buscar", "Llamar", "Cómo llegar", "Ver su página", "Ver clubes y escuelas deportivas"— es un control, no un adorno: su contorno DEBE cumplir el mismo mínimo de 3:1 contra el fondo. Ese contorno más marcado NO DEBE romper la jerarquía: el secundario sigue sin usar el verde de acción en ningún papel (ni fondo ni texto ni borde), así que la única acción con relleno verde de la pantalla sigue siendo la principal.

#### Scenario: contorno del botón secundario

- **WHEN** se verifica el color de borde del botón de acción secundaria contra el fondo sobre el que se recorta
- **THEN** la relación de contraste es de al menos 3:1 y el botón sigue sin usar el verde de acción

#### Scenario: contorno de los controles de formulario

- **WHEN** se verifica el color de borde de un input, select, textarea o checkbox/radio de captura contra el fondo sobre el que se recorta
- **THEN** la relación de contraste es de al menos 3:1

#### Scenario: estructura semántica

- **WHEN** se inspecciona el HTML de cualquier página
- **THEN** el contenido está dentro de landmarks `header`, `main` y `footer`, y los encabezados siguen jerarquía sin saltos (un solo `h1`)

#### Scenario: contraste AA de los tokens

- **WHEN** se verifican las combinaciones texto/fondo definidas por los tokens de la paleta (incluido el texto sobre el verde de acción)
- **THEN** todas alcanzan una relación de contraste de al menos 4.5:1

#### Scenario: áreas táctiles

- **WHEN** un vecino usa el sitio en su celular
- **THEN** cualquier elemento tocable del header o el footer mide al menos 44px en su dimensión menor

### Requirement: Server Component con documento en es-MX y metadata base

El layout global DEBE ser un Server Component que no envíe JavaScript de cliente propio. La ÚNICA excepción es el script del proveedor de analítica cookieless: es JavaScript de un tercero, condicional a la configuración, diferido, ausente en `/admin` y sin código propio alrededor; justificado por el PRD §9 ("analítica desde el día 1") y ADR-005. El documento DEBE declarar `lang="es-MX"` y exponer metadata base del sitio: título "NecesitoUno Tizayuca — Encuentra negocios y servicios en Tizayuca" y descripción "Encuentra negocios, servicios y deporte en Tizayuca y contáctalos directo por WhatsApp. Registro gratis para negocios locales."

Ese título DEBE seguir siendo el de las páginas que no declaran uno propio (la home, entre ellas), y las páginas que sí lo declaran DEBEN presentarse en el documento como `«Título de la página» — NecesitoUno`, para que un resultado de búsqueda diga primero de qué es la página y después de quién.

El layout DEBE declarar además la **URL pública del sitio como base de todas las URLs absolutas** (canónicas, sitemap y vista previa al compartir), tomada de la misma variable de entorno que ya usa el panel para armar el link de la ficha (`SITIO_URL`). Fuera de producción, sin variable declarada, DEBE usarse la dirección local de desarrollo. En producción, si la variable no está declarada o es ilegible, el sitio NO DEBE publicar URLs absolutas apuntando a la dirección local: se omiten las canónicas y la vista previa absoluta y queda constancia en el log del servidor (una sola vez por proceso, nunca por petición).

El layout DEBE declarar también la identidad de la vista previa al compartir que heredan todas las páginas: el nombre del sitio "NecesitoUno", el idioma español de México y una imagen de marca del propio sitio.

#### Scenario: documento en español de México con metadata

- **WHEN** se carga cualquier página del sitio
- **THEN** el HTML declara `lang="es-MX"` y el `<title>` y la meta descripción incluyen "Tizayuca"

#### Scenario: la home conserva el título del sitio

- **WHEN** se abre la ruta raíz
- **THEN** el título del documento sigue siendo "NecesitoUno Tizayuca — Encuentra negocios y servicios en Tizayuca"

#### Scenario: una página con título propio lleva la marca al final

- **WHEN** se abre el listado de una categoría, cuyo título propio es "Servicios del hogar en Tizayuca"
- **THEN** el título del documento es "Servicios del hogar en Tizayuca — NecesitoUno"

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

### Requirement: Home del sitio dentro del layout, con la entrada al registro

La ruta raíz (`/`) DEBE mostrar la home real del sitio dentro del layout global, con un único `h1` de bienvenida en español mexicano coloquial —el texto literal "¿Qué necesitas en Tizayuca?"— acompañado de la frase "Encuentra negocios y servicios de aquí cerquita y contáctalos directo por WhatsApp.". La home DEBE conservar la entrada al registro del Flujo A (PRD §7) con el texto literal "Registra tu negocio gratis", con el estilo de acción principal (verde WhatsApp) y área táctil de al menos 44px, presentada bajo la pregunta "¿Tienes un negocio en Tizayuca?". El contenido de directorio de la home (categorías y bloque de deporte) lo especifica la capacidad `directorio-publico`; aquí solo se exige que viva dentro del layout, con header y footer, y con la jerarquía de encabezados correcta (un `h1` y las secciones como `h2`). La frase provisional "Muy pronto vas a poder encontrar aquí los negocios y servicios de Tizayuca." DEBE desaparecer, porque el directorio ya existe. Todo texto residual de la plantilla de create-next-app DEBE seguir ausente.

#### Scenario: home dentro del layout

- **WHEN** un vecino abre la ruta raíz del sitio en su celular
- **THEN** ve, dentro del layout con header y footer, el encabezado "¿Qué necesitas en Tizayuca?" y la frase "Encuentra negocios y servicios de aquí cerquita y contáctalos directo por WhatsApp."

#### Scenario: la home ya no anuncia que el directorio viene después

- **WHEN** se abre la ruta raíz
- **THEN** no aparece la frase "Muy pronto vas a poder encontrar aquí los negocios y servicios de Tizayuca."

#### Scenario: entrada al registro desde la home

- **WHEN** el dueño de un negocio abre la ruta raíz en su celular
- **THEN** ve la pregunta "¿Tienes un negocio en Tizayuca?" y un enlace visible con el texto "Registra tu negocio gratis", con el estilo de acción principal, que lo lleva a la página de registro

#### Scenario: jerarquía de encabezados

- **WHEN** se inspecciona el HTML de la home
- **THEN** hay exactamente un `h1` y las secciones de categorías y de deporte son encabezados de segundo nivel, sin saltos de jerarquía

#### Scenario: sin rastros de la plantilla

- **WHEN** se abre la ruta raíz
- **THEN** no aparece ningún texto, logo ni enlace de la plantilla de Next.js/Vercel

### Requirement: Página 404 en español dentro del layout

El sitio DEBE tener una página de "no encontrado" propia, en español mexicano coloquial y dentro del layout global, que se muestre ante cualquier URL desconocida y ante los casos que el directorio marca como inexistentes (categoría o negocio). DEBE responder con código 404, encabezarse con el texto literal "No encontramos esta página", explicar con la frase "A lo mejor el negocio ya no está publicado o la dirección quedó mal escrita." y ofrecer un enlace de regreso con el texto "Ir al inicio". NO DEBE mostrar detalles técnicos, ni rastros de la plantilla, ni enlaces a páginas inexistentes.

#### Scenario: URL desconocida

- **WHEN** alguien abre una URL que no corresponde a ninguna página del sitio
- **THEN** ve, dentro del layout con header y footer, el encabezado "No encontramos esta página", la frase "A lo mejor el negocio ya no está publicado o la dirección quedó mal escrita." y el enlace "Ir al inicio", y la respuesta tiene código 404

#### Scenario: la 404 no es una página en inglés ni un volcado técnico

- **WHEN** se revisa la página de no encontrado
- **THEN** todo su texto está en español, no aparece ningún mensaje de error técnico ni de la plantilla de Next.js, y el único enlace lleva a la home

### Requirement: Enlaces internos a rutas existentes y enlaces externos protegidos

Todo enlace interno del sitio DEBE apuntar a una ruta que existe, incluidas las rutas dinámicas, cuyos destinos se resuelven desde los catálogos (categorías, giros y pares giro+colonia) o desde los negocios publicados. La misma regla DEBE aplicar al destino de los formularios del sitio (el `action` del buscador, por ejemplo): un formulario que envía a una ruta que no existe es un control muerto igual que un enlace roto, y la verificación automática DEBE señalarlo. La lista blanca de rutas de la verificación automática DEBE reconocer las rutas legales `/aviso-de-privacidad` y `/terminos`, que ya existen. Todo enlace que salga del sitio y abra en pestaña nueva (WhatsApp, mapas, la página que registró un negocio) DEBE llevar `rel="noopener noreferrer"`. Los enlaces de llamada (`tel:`) NO DEBEN abrir pestaña nueva y por lo tanto no requieren ese atributo.

#### Scenario: enlace interno a una ruta inexistente

- **WHEN** se agrega en el código de interfaz un enlace a una ruta que el sitio no tiene
- **THEN** la verificación automática del sitio falla, señalando ese enlace

#### Scenario: las rutas legales existen y la verificación las reconoce

- **WHEN** se revisan los enlaces del footer, del bloque de consentimiento del registro y de las propias páginas legales
- **THEN** `/aviso-de-privacidad` y `/terminos` pasan la verificación como rutas existentes, y una ruta legal mal escrita (por ejemplo `/terminos-y-condiciones`) sigue fallando

#### Scenario: enlaces a rutas dinámicas

- **WHEN** se revisan los enlaces a listados de categoría, a páginas de giro y de giro+colonia, y a fichas de negocio
- **THEN** cada uno corresponde a una ruta dinámica declarada del sitio, cuyo destino existe (un slug de alguno de los tres catálogos, un negocio publicado)

#### Scenario: destino del formulario de búsqueda

- **WHEN** se revisa el buscador de la home y el de la página de resultados
- **THEN** su destino de envío es una ruta que existe en el sitio, y la verificación automática falla si se cambia por una ruta inexistente

#### Scenario: enlaces externos protegidos

- **WHEN** se revisa cualquier enlace que abre en pestaña nueva hacia WhatsApp, Google Maps o la página que registró un negocio
- **THEN** lleva `rel="noopener noreferrer"`

#### Scenario: enlace de llamada

- **WHEN** se revisa el botón "Llamar" de una ficha
- **THEN** usa un enlace `tel:` que no abre pestaña nueva

### Requirement: El sitio publica un `robots.txt` que permite lo público y excluye lo que no toca

El sitio DEBE servir un `robots.txt` en su raíz que permita rastrear el sitio público y excluya `/admin` (el panel de revisión), `/buscar` (las URLs con consulta, que además ya declaran `noindex`) y `/registro/gracias` (la pantalla de confirmación del registro). NO DEBE listar las rutas del enlace de gestión (`/editar/...`) ni ninguna otra ruta que el sitio no sirva: anunciar en un archivo público por dónde viven los enlaces secretos es peor que no excluirlos, y esas pantallas ya se protegen con `noindex, nofollow` y sin ningún enlace público que lleve a ellas. El archivo DEBE apuntar al sitemap del sitio con su URL absoluta, salvo que la URL pública del sitio no esté declarada, en cuyo caso esa línea se omite en vez de apuntar a una dirección local.

Este `robots.txt` es una petición a los rastreadores que se portan bien, no una defensa contra la cosecha masiva del directorio (hallazgo M5 de T-004), que sigue siendo deuda pendiente (E5-5).

#### Scenario: lo público se puede rastrear

- **WHEN** un buscador pide `/robots.txt`
- **THEN** obtiene un archivo que permite rastrear el sitio y que no bloquea la home, los listados por categoría, las páginas de giro ni las fichas

#### Scenario: el panel y los resultados quedan fuera

- **WHEN** se revisa el `robots.txt`
- **THEN** excluye `/admin`, `/buscar` y `/registro/gracias`

#### Scenario: no se anuncian rutas secretas

- **WHEN** se revisa el `robots.txt`
- **THEN** no aparece ninguna ruta de enlaces de gestión ni ninguna otra ruta que el sitio no sirva

#### Scenario: el sitemap se anuncia con URL absoluta

- **WHEN** el sitio tiene su URL pública declarada
- **THEN** el `robots.txt` incluye la línea del sitemap con la URL absoluta de `/sitemap.xml`

### Requirement: El sitio publica un `sitemap.xml` que se actualiza solo

El sitio DEBE servir un `sitemap.xml` en su raíz, generado a partir de la base en cada petición y sin ningún paso manual, que incluya: la home, la página de registro (`/registro`), los listados de las 8 categorías, **cada página de giro y de giro+colonia que tenga al menos un negocio publicado** y la ficha de cada negocio publicado. Cada ficha DEBE declarar como fecha de última modificación su fecha de publicación.

El sitemap NO DEBE incluir el panel (`/admin`), la página de resultados (`/buscar`), la confirmación del registro (`/registro/gracias`) ni ninguna página de giro o giro+colonia sin negocios publicados. NO DEBE incluir tampoco negocios que no estén en estado `publicado`, ni filtrar ninguno de sus datos. Cuando la URL pública del sitio no esté declarada en producción, el sitemap DEBE responder un documento válido y vacío antes que publicar direcciones locales.

Las 8 categorías se incluyen aunque estén vacías —son la navegación fija del sitio, están enlazadas desde la home y su estado vacío invita a registrarse—; lo que se excluye por vacío son las combinaciones de giro y colonia, que son más de mil y sí producirían thin content.

#### Scenario: el sitemap trae lo publicado

- **WHEN** un buscador pide `/sitemap.xml` con negocios publicados en la base
- **THEN** encuentra la home, `/registro`, las 8 URLs de categoría, la URL de cada giro y de cada par giro+colonia con negocios publicados, y la URL de cada ficha publicada

#### Scenario: nada de lo que no está publicado

- **WHEN** hay negocios en `en_revision` y `rechazado` con giros y colonia asignados
- **THEN** ni sus fichas ni las combinaciones de giro+colonia que solo ellos ocupan aparecen en el sitemap, y ninguno de sus datos está en la respuesta

#### Scenario: sin páginas privadas ni de búsqueda

- **WHEN** se revisa el sitemap
- **THEN** no aparecen `/admin`, `/buscar` ni `/registro/gracias`

#### Scenario: se actualiza sin que nadie lo toque

- **WHEN** el admin publica un negocio nuevo con un giro que hasta entonces no tenía ninguno
- **THEN** la siguiente lectura del sitemap ya trae su ficha y la URL de ese giro, sin que nadie haya editado un archivo

#### Scenario: fecha de la ficha

- **WHEN** se revisa la entrada de una ficha publicada
- **THEN** su fecha de última modificación es la fecha en que se publicó el negocio

### Requirement: La medición cookieless se carga solo si está configurada, y sin ella el sitio funciona igual

El sitio DEBE cargar el script del proveedor de analítica cookieless (ADR-005) ÚNICAMENTE cuando estén configuradas las dos variables de entorno `NEXT_PUBLIC_UMAMI_SRC` (URL absoluta con esquema `https:` del script del proveedor) y `NEXT_PUBLIC_UMAMI_WEBSITE_ID` (identificador del sitio en el proveedor, no vacío). Si falta cualquiera de las dos, si vienen vacías o de puros espacios, o si `NEXT_PUBLIC_UMAMI_SRC` no es una URL absoluta `https:`, el sitio NO DEBE incluir ninguna etiqueta `<script>` de terceros, NO DEBE hacer ninguna petición a un dominio externo y DEBE responder exactamente igual que si la medición no existiera: sin errores, sin páginas rotas y sin JavaScript adicional. Cuando la configuración está a medias o es inválida (una variable puesta y la otra no, o un `src` que no es `https:`), el servidor DEBE dejar una advertencia en su log una sola vez por proceso, sin bloquear el arranque ni ninguna página. Ninguna pantalla del sitio DEBE mostrar banner, aviso ni interruptor de cookies o de consentimiento de medición (PRD §9: proveedor cookieless, sin banner).

#### Scenario: sin variables configuradas no se carga nada

- **WHEN** el sitio corre sin `NEXT_PUBLIC_UMAMI_SRC` ni `NEXT_PUBLIC_UMAMI_WEBSITE_ID` y un vecino abre la home, un listado, una ficha o el formulario
- **THEN** el HTML de la respuesta no contiene ninguna etiqueta `<script>` hacia un dominio externo, el navegador no pide nada fuera del sitio y todas las páginas se ven y funcionan igual

#### Scenario: con las dos variables se carga el script del proveedor

- **WHEN** el sitio corre con `NEXT_PUBLIC_UMAMI_SRC="https://cloud.umami.is/script.js"` y `NEXT_PUBLIC_UMAMI_WEBSITE_ID` con un identificador, y un vecino abre una página pública
- **THEN** el HTML incluye ese script del proveedor con el identificador del sitio, y la página sigue viéndose igual

#### Scenario: configuración a medias

- **WHEN** el sitio corre con solo una de las dos variables, o con `NEXT_PUBLIC_UMAMI_SRC="/script.js"` (no absoluta `https:`)
- **THEN** no se inyecta ningún script, las páginas responden con normalidad y queda una advertencia en el log del servidor que dice qué falta, sin detener el arranque

#### Scenario: nunca hay banner de cookies

- **WHEN** un vecino recorre el sitio con la medición configurada
- **THEN** no ve ningún banner, aviso ni interruptor de cookies o de consentimiento de medición, y no tiene que aceptar nada para usar el directorio

### Requirement: El panel del admin y el modo edición quedan fuera de la medición

Ninguna página bajo `/admin` ni ninguna pantalla del modo edición (`/editar/<token>` y su confirmación) DEBE cargar el script de medición ni enviar visitas o eventos al proveedor, aunque las variables estén configuradas. La exclusión DEBE ser una propiedad de la estructura del sitio —el script se inyecta desde el tronco de las páginas públicas medidas, no desde el layout raíz que también envuelve a esas otras— y no una lista de rutas que alguien deba recordar actualizar. Las razones: el panel no es tráfico de vecinos y ensuciaría las métricas del PRD §10; sus URLs (`/admin/registros/<id>`) apuntan a un registro concreto de una persona; y en el modo edición la ruta **es** la credencial del negocio, así que mandarla al proveedor sería entregarle a un tercero la llave de una ficha (PRD §8, LFPDPPP). Cada tronco excluido DEBE tener escrito por qué lo está, y la verificación automática DEBE fallar si una exclusión se queda sin páginas o si aparece una sin justificar.

#### Scenario: el panel no carga el script

- **WHEN** el admin abre `/admin`, la cola o el detalle de un registro, con la medición configurada
- **THEN** el HTML de esas páginas no contiene el script del proveedor ni ningún atributo de evento, y el proveedor no recibe ninguna visita ni ningún identificador de registro

#### Scenario: el modo edición tampoco carga el script

- **WHEN** el dueño abre su enlace de gestión y manda sus cambios, con la medición configurada
- **THEN** ni la pantalla de edición ni la de confirmación cargan el script del proveedor, y ninguna ruta con el token sale del sitio

#### Scenario: una página pública nueva sí queda medida

- **WHEN** se agrega una página pública nueva al tronco de las páginas medidas
- **THEN** hereda la medición sin tocar ninguna lista de rutas, y el resto del sitio (home, registro y fichas) sigue midiéndose con normalidad aunque existan troncos excluidos

### Requirement: La medición no lleva datos personales ni el texto que escribe la gente

Los eventos que el sitio manda al proveedor DEBEN limitarse a un nombre de evento del contrato (`whatsapp-tarjeta`, `whatsapp-ficha`, `llamar`, `como-llegar`) y, como máximo, a dos propiedades: `categoria` y `colonia`, ambas con el **slug del catálogo** como valor. Ninguna otra propiedad DEBE viajar. NO DEBEN viajar nunca el nombre del negocio, su WhatsApp, su teléfono, su dirección o referencias, su horario, su identificador ni el texto libre de colonia que capturó: cuando la colonia del negocio no es del catálogo (caso "Otra", o negocio sin colonia), la propiedad `colonia` DEBE valer `otra`. Además, la medición NO DEBE enviar la cadena de consulta de las URLs (`?q=…` de la búsqueda, `?colonia=…` del filtro), porque `q` es texto libre que escribe el vecino: solo viaja la ruta pública de la página, la misma que cualquiera comparte por WhatsApp.

Los canales de datos hacia el proveedor son **cuatro, no dos**: además del nombre del evento con sus propiedades y de la URL, el proveedor recibe en cada envío el **título del documento** y el **referente** de la página. Los cuatro están sujetos a la misma regla, y los dos últimos se nombran aquí para que nadie los deje fuera de la cuenta al tocar metadata o al agregar enlaces:

- **Título.** Ningún título de una página pública DEBE contener texto escrito por un visitante ni datos que la regla de arriba prohíbe. En particular, la página de resultados (`/buscar`) DEBE declarar un título **estático**, sin el término que escribió el vecino: es la misma protección que la exclusión de la cadena de consulta, que por sí sola no cubre el título. Como esa página no es indexable, un título dinámico no aporta nada de SEO y sí filtraría texto libre; quien le dé metadata propia a las páginas del directorio DEBE respetar esta excepción.
- **Referente.** Las pantallas del panel (`/admin`) y las del modo edición (`/editar/<token>`) DEBEN declarar una política de referente que impida que la **ruta** salga como referente: al pasar del panel a una página pública, el proveedor NO DEBE poder saber de qué URL del panel venía la visita. Sin eso, `/admin/registros/<id>` —que apunta al registro de una persona concreta— llegaría a un tercero, porque el proveedor reenvía los referentes del mismo origen como ruta. En el modo edición el motivo es aún más directo: la ruta lleva el token, así que dejarla salir como referente entregaría la llave de la ficha. Esa política NO DEBE anular el encabezado `Origin` de los envíos de formulario: tanto el panel como el modo edición tienen prometido funcionar sin JavaScript de cliente (requirements "El panel se opera desde el celular y sin JavaScript de cliente innecesario" de `revision-admin` y "El enlace de gestión abre la ficha en modo edición con el mismo formulario prellenado" de `registro-negocio`), y un `Origin` anulado hace que el servidor rechace sus envíos. Las dos condiciones juntas descartan tanto `no-referrer` (anula el `Origin`) como `same-origin` (deja pasar la ruta entre páginas propias); `strict-origin` —el valor vigente— y `origin` las cumplen. La política DEBE vivir en el tronco de cada uno de esos grupos, no en cada enlace del encabezado o del pie: así cubre también los enlaces que se agreguen después (PRD §8, LFPDPPP). Si algún día se declara además como cabecera del hosting, DEBE llevar el mismo valor y por la misma razón.

#### Scenario: propiedades de un evento

- **WHEN** se inspecciona en el HTML un botón instrumentado de una tarjeta o de una ficha
- **THEN** lleva el nombre del evento y solo dos propiedades, `categoria` y `colonia`, cuyos valores son slugs del catálogo (letras, dígitos y guiones), y ninguna otra propiedad

#### Scenario: negocio con colonia "Otra" sin normalizar

- **WHEN** el negocio no tiene colonia del catálogo, solo el texto libre que escribió (por ejemplo "atrás del panteón viejo")
- **THEN** el atributo de la propiedad `colonia` vale `otra` y ese texto no aparece en ningún atributo de medición

#### Scenario: lo que escribe el vecino no viaja

- **WHEN** el vecino busca algo en `/buscar?q=…` o filtra un listado por colonia
- **THEN** el proveedor recibe la ruta de la página sin la cadena de consulta, de modo que el texto que escribió el vecino no sale del sitio

#### Scenario: ningún dato del negocio dentro de un atributo de medición

- **WHEN** se revisa el HTML de un listado, de la página de resultados y de una ficha de un negocio publicado
- **THEN** ningún atributo de medición contiene el nombre del negocio, su WhatsApp, su teléfono, su dirección, su horario ni su identificador

#### Scenario: lo que el vecino busca tampoco viaja por el título

- **WHEN** el vecino busca "quiero abogado por mi divorcio" y la página de resultados se carga con la medición configurada
- **THEN** el título del documento es el estático de esa página, sin rastro de lo que escribió, y el proveedor no recibe ese texto ni por la URL ni por el título

#### Scenario: el admin sale del panel hacia el sitio público

- **WHEN** el admin está revisando `/admin/registros/<id>` y abre una página pública desde el encabezado o el pie, en la misma pestaña o en una nueva
- **THEN** la página pública recibe como mucho el origen del sitio, nunca la ruta del panel, así que el proveedor no llega a saber de qué registro venía la visita

#### Scenario: un enlace nuevo en el panel no reabre el canal

- **WHEN** se agrega un enlace más del panel hacia una página pública
- **THEN** hereda la política del tronco del panel sin que nadie tenga que marcarlo enlace por enlace

#### Scenario: una URL inexistente del panel tampoco filtra

- **WHEN** alguien abre a mano una dirección que no existe pero cuelga del panel y lleva el identificador de un registro (por ejemplo `/admin/registros/<id>/loquesea`), y desde ahí navega al sitio público
- **THEN** esa página de "no encontrado" también está bajo la política del panel, así que la dirección no viaja como referente

#### Scenario: cerrar el referente no puede romper el panel sin JavaScript

- **WHEN** el admin usa el panel con el JavaScript deshabilitado —o antes de que termine de cargar— y envía la contraseña, aprueba o rechaza un registro
- **THEN** el envío funciona igual que siempre, porque la política de referente del panel conserva el `Origin` de la petición; una política que lo anulara haría que el servidor rechazara el envío

### Requirement: Un solo script diferido y cero JavaScript propio de cliente

La medición DEBE agregar como máximo **una** etiqueta `<script>` externa, cargada de forma diferida (`defer` o `async`) para no bloquear el pintado, y NO DEBE introducirse mediante un gestor de etiquetas ni cargar scripts encadenados (PRD §8, meta de <2s en 4G). El sitio NO DEBE agregar JavaScript de cliente propio para medir: los eventos se declaran con atributos `data-*` en el marcado, que son inertes sin el script, y ningún archivo de la medición DEBE declarar `"use client"`.

No agregar JavaScript propio no basta para que la medición sea invisible, porque el script del proveedor **sí** interviene el clic: cuando el elemento que declara un evento es un enlace con destino que **no** abre pestaña nueva, el proveedor cancela el clic, manda el evento y navega hasta que recibe respuesta, de modo que en una red lenta la acción del vecino se queda esperando (medido: 3.0 s de retraso con 3 s de latencia del proveedor). Por eso, **ningún enlace que no abra pestaña nueva DEBE llevar el evento en el propio enlace**; en esos casos —hoy el botón "Llamar", que usa `tel:` y por diseño no abre pestaña— el evento DEBE declararse en un elemento envolvente que no sea un enlace, de modo que el proveedor registre el mismo evento sin tocar la navegación. La envoltura NO DEBE cambiar el diseño ni la accesibilidad del botón, y el modo de fallo aceptado es el benigno: si el proveedor cambiara su forma de leer los eventos, se dejaría de registrar ese clic, pero el botón nunca se rompería ni se retrasaría.

#### Scenario: un solo script y diferido

- **WHEN** se revisa el HTML de una página pública con la medición configurada
- **THEN** hay exactamente una etiqueta `<script>` externa, con carga diferida, apuntando al dominio del proveedor documentado en `.env.example`

#### Scenario: los atributos no ejecutan nada por sí solos

- **WHEN** el sitio corre sin configuración y el vecino toca el botón de WhatsApp de una tarjeta
- **THEN** el botón se comporta igual que siempre (abre la conversación), no se ejecuta ningún JavaScript de medición y no sale ninguna petición del sitio

#### Scenario: sin componentes de cliente

- **WHEN** se revisan los archivos que implementan la medición
- **THEN** ninguno declara `"use client"` ni agrega un bundle de cliente propio

#### Scenario: llamar por teléfono con la medición encendida

- **WHEN** el vecino toca "Llamar" en una ficha, con la medición configurada y una red lenta
- **THEN** el teléfono empieza a marcar de inmediato, sin esperar a que el proveedor conteste, y el evento `llamar` se registra igual

#### Scenario: un botón nuevo que no abre pestaña nueva

- **WHEN** se instrumenta un botón cuyo enlace no abre pestaña nueva
- **THEN** el evento se declara en un elemento envolvente y no en el enlace, para que el proveedor no pueda aplazar la acción del vecino

### Requirement: Los conteos excluyen bots y crawlers

Los conteos de visitas DEBEN excluir bots y crawlers (PRD §9: el propio tráfico SEO inflaría las vistas y ensuciaría la conversión del §10). El sitio NO DEBE llevar conteos propios en el servidor: una visita solo se registra desde el navegador, al ejecutarse el script del proveedor, de modo que un crawler que no ejecuta JavaScript no genera ninguna visita. El filtrado de bots del proveedor DEBE quedar activo y verificado antes de dar por buenas las métricas del §10, y ese paso DEBE estar escrito en `.env.example` junto a las variables.

#### Scenario: un crawler que no ejecuta JavaScript

- **WHEN** un buscador rastrea una ficha o un listado sin ejecutar JavaScript
- **THEN** no se registra ninguna visita, porque el sitio no cuenta nada en el servidor

#### Scenario: el servidor no lleva contadores

- **WHEN** se revisa el código de las páginas públicas
- **THEN** ninguna vista escribe conteos en la base de datos ni registra la visita en el log

### Requirement: `.env.example` explica la analítica y el paso que le toca al humano

`.env.example` DEBE documentar, en su propio bloque, las dos variables de la medición: para qué son, que **no son secretos** (viajan en el HTML de todas las páginas públicas), el valor típico del script del proveedor, el enlace para crear la cuenta gratuita, que se inyectan al construir el sitio (cambiarlas exige volver a desplegar), que sin ellas el sitio corre igual sin medir nada, y el recordatorio de verificar en el panel del proveedor que el filtrado de bots está activo.

#### Scenario: el humano sabe qué hacer

- **WHEN** el humano abre `.env.example` para conectar la analítica
- **THEN** encuentra las dos variables comentadas, con el enlace para crear la cuenta, el valor típico del script, la advertencia de que hay que redesplegar al cambiarlas y la nota de que sin ellas no se mide nada pero nada se rompe
