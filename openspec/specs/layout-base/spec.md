# Spec: layout-base

## Requirements

### Requirement: Layout global con header y footer en todas las páginas

Toda página del sitio DEBE renderizarse dentro de un layout global con un header que muestra la marca como wordmark tipográfico "NecesitoUno" acompañado del posicionamiento "Tizayuca", y un footer al final de la página. El footer DEBE incluir los enlaces a las dos páginas legales, con los textos literales "Aviso de privacidad" y "Términos y condiciones", cada uno hacia una página que existe y con área táctil de al menos 44px.

#### Scenario: header con marca y posicionamiento

- **WHEN** un vecino abre cualquier página del sitio en su celular
- **THEN** ve en la parte superior el wordmark "NecesitoUno" junto con "Tizayuca" como posicionamiento visible

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

#### Scenario: celular a 390px

- **WHEN** el sitio se abre en un viewport de 390px de ancho
- **THEN** el header, el contenido y el footer se ven completos y legibles, sin scroll horizontal

#### Scenario: adaptación a escritorio

- **WHEN** el sitio se abre en un viewport de tablet o escritorio
- **THEN** el contenido se adapta (por ejemplo, con un ancho máximo centrado) manteniendo la misma estructura y sin scroll horizontal

### Requirement: Accesibilidad base del PRD §8

El layout DEBE usar HTML semántico con landmarks (`header`, `main`, `footer`) y jerarquía de encabezados correcta (un solo `h1` por página). Todas las combinaciones de tokens de color usadas para texto DEBEN cumplir contraste AA (WCAG 2.1: ≥4.5:1 en texto normal). Todo elemento interactivo del layout DEBE tener un área táctil de al menos 44px.

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

El layout global DEBE ser un Server Component que no envíe JavaScript de cliente propio. El documento DEBE declarar `lang="es-MX"` y exponer metadata base del sitio: título "NecesitoUno Tizayuca — Encuentra negocios y servicios en Tizayuca" y descripción "Encuentra negocios, servicios y deporte en Tizayuca y contáctalos directo por WhatsApp. Registro gratis para negocios locales."

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

El sitio DEBE servir un `robots.txt` en su raíz que permita rastrear el sitio público y excluya `/admin` (el panel de revisión), `/buscar` (las URLs con consulta, que además ya declaran `noindex`) y `/registro/gracias` (la pantalla de confirmación del registro). NO DEBE listar rutas que todavía no existen, en particular las de enlaces de gestión (E8): anunciar en un archivo público la ruta de un enlace secreto es peor que no excluirla. El archivo DEBE apuntar al sitemap del sitio con su URL absoluta, salvo que la URL pública del sitio no esté declarada, en cuyo caso esa línea se omite en vez de apuntar a una dirección local.

Este `robots.txt` es una petición a los rastreadores que se portan bien, no una defensa contra la cosecha masiva del directorio (hallazgo M5 de T-004), que sigue siendo deuda pendiente (E5-5).

#### Scenario: lo público se puede rastrear

- **WHEN** un buscador pide `/robots.txt`
- **THEN** obtiene un archivo que permite rastrear el sitio y que no bloquea la home, los listados por categoría, las páginas de giro ni las fichas

#### Scenario: el panel y los resultados quedan fuera

- **WHEN** se revisa el `robots.txt`
- **THEN** excluye `/admin`, `/buscar` y `/registro/gracias`

#### Scenario: no se anuncian rutas secretas

- **WHEN** se revisa el `robots.txt`
- **THEN** no aparece ninguna ruta de enlaces de gestión ni ninguna otra ruta que el sitio todavía no sirva

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
