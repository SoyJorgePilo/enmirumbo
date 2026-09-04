# Spec delta: layout-base

## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: El sitio publica un `robots.txt` que permite lo público y excluye lo que no toca

El sitio DEBE servir un `robots.txt` en su raíz que permita rastrear el sitio público y excluya `/admin` (el panel de revisión), `/buscar` (las URLs con consulta, que además ya declaran `noindex`) y `/registro/gracias` (la pantalla de confirmación del registro). NO DEBE listar rutas que todavía no existen, en particular las de enlaces de gestión (E8): anunciar en un archivo público la ruta de un enlace secreto es peor que no excluirla. El archivo DEBE apuntar al sitemap del sitio con su URL absoluta, salvo que la URL pública del sitio no esté declarada, en cuyo caso esa línea se omite en vez de apuntar a una dirección local.

Este `robots.txt` es una petición a los rastreadores que se portan bien, no una defensa contra la cosecha masiva del directorio (hallazgo M5 de T-004): esa sigue siendo deuda de E5-5.

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

El sitio DEBE servir un `sitemap.xml` en su raíz, generado a partir de la base en cada petición y sin ningún paso manual, que incluya: la home, los listados de las 8 categorías, **cada página de giro y de giro+colonia que tenga al menos un negocio publicado** y la ficha de cada negocio publicado. Cada ficha DEBE declarar como fecha de última modificación su fecha de publicación.

El sitemap NO DEBE incluir el panel (`/admin`), la página de resultados (`/buscar`), la confirmación del registro (`/registro/gracias`) ni ninguna página de giro o giro+colonia sin negocios publicados. NO DEBE incluir tampoco negocios que no estén en estado `publicado`, ni filtrar ninguno de sus datos. Cuando la URL pública del sitio no esté declarada en producción, el sitemap DEBE responder un documento válido y vacío antes que publicar direcciones locales.

Las 8 categorías se incluyen aunque estén vacías —son la navegación fija del sitio, están enlazadas desde la home y su estado vacío invita a registrarse—; lo que se excluye por vacío son las combinaciones de giro y colonia, que son más de mil y sí producirían thin content.

#### Scenario: el sitemap trae lo publicado

- **WHEN** un buscador pide `/sitemap.xml` con negocios publicados en la base
- **THEN** encuentra la home, las 8 URLs de categoría, la URL de cada giro y de cada par giro+colonia con negocios publicados, y la URL de cada ficha publicada

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
