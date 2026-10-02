# Delta: layout-base

> Enmienda de letra, **sin cambio de comportamiento** (ADR-013, Fase 2; T-023). Dos requirements describen la ausencia de JavaScript de cliente con vocabulario de Next ("Server Component", la directiva `"use client"`), que deja de describir el sitio cuando se sirve con Astro. La redacción nueva es neutral respecto al marco y verdadera con los dos. Se conservan los encabezados porque otras specs los citan por nombre. Lo único que cambia es la primera frase del primero, la frase de `"use client"` del segundo y un scenario de cada uno; el resto es texto vigente copiado sin cambios.

## MODIFIED Requirements

### Requirement: Server Component con documento en es-MX y metadata base

El layout global DEBE renderizarse por completo en el servidor y NO DEBE enviar JavaScript de cliente propio: ninguna parte del layout se hidrata en el navegador, ni con la directiva `"use client"` de React ni con una directiva `client:` de Astro. La ÚNICA excepción es el script del proveedor de analítica cookieless: es JavaScript de un tercero, condicional a la configuración, diferido, ausente en `/admin` y sin código propio alrededor; justificado por el PRD §9 ("analítica desde el día 1") y ADR-005. El documento DEBE declarar `lang="es-MX"` y exponer metadata base del sitio: título "EnMiRumbo — Encuentra negocios y servicios en Tizayuca" y descripción "Encuentra negocios, servicios y deporte en Tizayuca y contáctalos directo por WhatsApp. Registro gratis para negocios locales." La geografía del título sigue viviendo en el descriptor ("en Tizayuca"), que es donde ya estaba; lo que desaparece es la localidad pegada al nombre.

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

- **WHEN** se construye el sitio y se revisan el layout, el header y el footer
- **THEN** ninguno se hidrata en el navegador (ni `"use client"` ni directiva `client:`), el HTML no trae `modulepreload` ni islas de hidratación, y no se agregan bundles de cliente propios

#### Scenario: el único script es el de la medición

- **WHEN** se revisa el HTML de una página pública con la medición configurada
- **THEN** el único JavaScript externo que carga es el del proveedor de analítica; sin configuración, no carga ninguno

### Requirement: Un solo script diferido y cero JavaScript propio de cliente

La medición DEBE agregar como máximo **una** etiqueta `<script>` externa, cargada de forma diferida (`defer` o `async`) para no bloquear el pintado, y NO DEBE introducirse mediante un gestor de etiquetas ni cargar scripts encadenados (PRD §8, meta de <2s en 4G). El sitio NO DEBE agregar JavaScript de cliente propio para medir: los eventos se declaran con atributos `data-*` en el marcado, que son inertes sin el script, y ningún archivo de la medición DEBE hidratarse en el navegador (ni con la directiva `"use client"` ni con una directiva `client:`).

No agregar JavaScript propio no basta para que la medición sea invisible, porque el script del proveedor **sí** interviene el clic: cuando el elemento que declara un evento es un enlace con destino que **no** abre pestaña nueva, el proveedor cancela el clic, manda el evento y navega hasta que recibe respuesta, de modo que en una red lenta la acción del vecino se queda esperando (medido: 3.0 s de retraso con 3 s de latencia del proveedor). Por eso, **ningún enlace que no abra pestaña nueva DEBE llevar el evento en el propio enlace**; en esos casos —hoy el botón "Llamar", que usa `tel:` y por diseño no abre pestaña— el evento DEBE declararse en un elemento envolvente que no sea un enlace, de modo que el proveedor registre el mismo evento sin tocar la navegación. La envoltura NO DEBE cambiar el diseño ni la accesibilidad del botón, y el modo de fallo aceptado es el benigno: si el proveedor cambiara su forma de leer los eventos, se dejaría de registrar ese clic, pero el botón nunca se rompería ni se retrasaría.

#### Scenario: un solo script y diferido

- **WHEN** se revisa el HTML de una página pública con la medición configurada
- **THEN** hay exactamente una etiqueta `<script>` externa, con carga diferida, apuntando al dominio del proveedor documentado en `.env.example`

#### Scenario: los atributos no ejecutan nada por sí solos

- **WHEN** el sitio corre sin configuración y el vecino toca el botón de WhatsApp de una tarjeta
- **THEN** el botón se comporta igual que siempre (abre la conversación), no se ejecuta ningún JavaScript de medición y no sale ninguna petición del sitio

#### Scenario: sin componentes de cliente

- **WHEN** se revisan los archivos que implementan la medición
- **THEN** ninguno se hidrata en el navegador (ni `"use client"` ni directiva `client:`) ni agrega un bundle de cliente propio

#### Scenario: llamar por teléfono con la medición encendida

- **WHEN** el vecino toca "Llamar" en una ficha, con la medición configurada y una red lenta
- **THEN** el teléfono empieza a marcar de inmediato, sin esperar a que el proveedor conteste, y el evento `llamar` se registra igual

#### Scenario: un botón nuevo que no abre pestaña nueva

- **WHEN** se instrumenta un botón cuyo enlace no abre pestaña nueva
- **THEN** el evento se declara en un elemento envolvente y no en el enlace, para que el proveedor no pueda aplazar la acción del vecino
