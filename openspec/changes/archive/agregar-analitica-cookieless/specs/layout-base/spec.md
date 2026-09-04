# Delta de spec: layout-base (change `agregar-analitica-cookieless`)

## ADDED Requirements

### Requirement: La medición cookieless se carga solo si está configurada, y sin ella el sitio funciona igual

El sitio DEBE cargar el script del proveedor de analítica cookieless (ADR-005) ÚNICAMENTE cuando estén configuradas las dos variables de entorno `NEXT_PUBLIC_UMAMI_SRC` (URL absoluta con esquema `https:` del script del proveedor) y `NEXT_PUBLIC_UMAMI_WEBSITE_ID` (identificador del sitio en el proveedor, no vacío). Si falta cualquiera de las dos, si vienen vacías o de puros espacios, o si `NEXT_PUBLIC_UMAMI_SRC` no es una URL absoluta `https:`, el sitio NO DEBE incluir ninguna etiqueta `<script>` de terceros, NO DEBE hacer ninguna petición a un dominio externo y DEBE responder exactamente igual que antes de este change: sin errores, sin páginas rotas y sin JavaScript adicional. Cuando la configuración está a medias o es inválida (una variable puesta y la otra no, o un `src` que no es `https:`), el servidor DEBE dejar una advertencia en su log una sola vez por proceso, sin bloquear el arranque ni ninguna página. Ninguna pantalla del sitio DEBE mostrar banner, aviso ni interruptor de cookies o de consentimiento de medición (PRD §9: proveedor cookieless, sin banner).

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

### Requirement: El panel del admin queda fuera de la medición

Ninguna página bajo `/admin` DEBE cargar el script de medición ni enviar visitas o eventos al proveedor, aunque las variables estén configuradas. La exclusión DEBE ser una propiedad de la estructura del sitio —el script se inyecta desde el tronco de las páginas públicas, no desde el layout raíz que también envuelve al panel— y no una lista de rutas que alguien deba recordar actualizar. La razón es doble: el panel no es tráfico de vecinos y ensuciaría las métricas del PRD §10, y sus URLs (`/admin/registros/<id>`) apuntan a un registro concreto de una persona, que no tiene por qué llegar a un tercero (PRD §8, LFPDPPP).

#### Scenario: el panel no carga el script

- **WHEN** el admin abre `/admin`, la cola o el detalle de un registro, con la medición configurada
- **THEN** el HTML de esas páginas no contiene el script del proveedor ni ningún atributo de evento, y el proveedor no recibe ninguna visita ni ningún identificador de registro

#### Scenario: una página pública nueva sí queda medida

- **WHEN** se agrega una página pública nueva al sitio
- **THEN** hereda la medición sin tocar ninguna lista de rutas, porque vive en el mismo tronco que las demás páginas públicas

### Requirement: La medición no lleva datos personales ni el texto que escribe la gente

Los eventos que el sitio manda al proveedor DEBEN limitarse a un nombre de evento del contrato (`whatsapp-tarjeta`, `whatsapp-ficha`, `llamar`, `como-llegar`) y, como máximo, a dos propiedades: `categoria` y `colonia`, ambas con el **slug del catálogo** como valor. Ninguna otra propiedad DEBE viajar. NO DEBEN viajar nunca el nombre del negocio, su WhatsApp, su teléfono, su dirección o referencias, su horario, su identificador ni el texto libre de colonia que capturó: cuando la colonia del negocio no es del catálogo (caso "Otra", o negocio sin colonia), la propiedad `colonia` DEBE valer `otra`. Además, la medición NO DEBE enviar la cadena de consulta de las URLs (`?q=…` de la búsqueda, `?colonia=…` del filtro), porque `q` es texto libre que escribe el vecino: solo viaja la ruta pública de la página, la misma que cualquiera comparte por WhatsApp.

**Enmienda aprobada** (auditoría de seguridad de T-010, hallazgos A-1 y M-2; aprobada por el orquestador por delegación del humano): los canales de datos hacia el proveedor **no son dos, son cuatro**. Además del nombre del evento con sus propiedades y de la URL, el proveedor recibe en cada envío el **título del documento** y el **referente** de la página. Esta regla los nombra para que nadie los deje fuera de la cuenta al tocar metadata o al agregar enlaces:

- **Título.** Ningún título de una página pública DEBE contener texto escrito por un visitante ni datos que la regla de arriba prohíbe. En particular, la página de resultados (`/buscar`) DEBE declarar un título **estático**, sin el término que escribió el vecino: es la misma protección que la exclusión de la cadena de consulta, que por sí sola no cubre el título. Como esa página no es indexable, un título dinámico no aporta nada de SEO y sí filtraría texto libre; quien le dé metadata propia a las páginas del directorio DEBE respetar esta excepción.
- **Referente.** Las pantallas del panel (`/admin`) DEBEN declarar una política de referente que impida que la **ruta** salga como referente: al pasar del panel a una página pública, el proveedor NO DEBE poder saber de qué URL del panel venía la visita. Sin eso, `/admin/registros/<id>` —que apunta al registro de una persona concreta— llegaría a un tercero, porque el proveedor reenvía los referentes del mismo origen como ruta. Esa política NO DEBE anular el encabezado `Origin` de los envíos de formulario: el panel tiene prometido funcionar sin JavaScript de cliente (requirement "El panel se opera desde el celular y sin JavaScript de cliente innecesario" de `revision-admin`), y un `Origin` anulado hace que el servidor rechace sus envíos. Las dos condiciones juntas descartan tanto `no-referrer` (anula el `Origin`) como `same-origin` (deja pasar la ruta entre páginas propias); `strict-origin` —el valor implementado— y `origin` las cumplen. La política DEBE vivir en el tronco del panel, no en cada enlace del encabezado o del pie: así cubre también los enlaces que se agreguen después (PRD §8, LFPDPPP). Si algún día se declara además como cabecera del hosting, DEBE llevar el mismo valor y por la misma razón. *(Corrección editorial de la validación, observación O-2 de la auditoría: el scenario "el admin sale del panel hacia el sitio público" decía "no recibe referente", que describe `no-referrer` —el valor que rompía el panel sin JavaScript—; ahora dice que puede recibir el origen pelado pero nunca la ruta, que es lo que de verdad se prohíbe. Una línea, sin cambio de código ni de tests.)*

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

La medición DEBE agregar como máximo **una** etiqueta `<script>` externa, cargada de forma diferida (`defer` o `async`) para no bloquear el pintado, y NO DEBE introducirse mediante un gestor de etiquetas ni cargar scripts encadenados (PRD §8, meta de <2s en 4G). El sitio NO DEBE agregar JavaScript de cliente propio para medir: los eventos se declaran con atributos `data-*` en el marcado, que son inertes sin el script, y ningún archivo nuevo DEBE declarar `"use client"`.

**Enmienda aprobada** (auditoría de seguridad de T-010, hallazgo M-4; aprobada por el orquestador por delegación del humano): "sin JavaScript propio" no basta para que la medición sea invisible, porque el script del proveedor **sí** interviene el clic. Cuando el elemento que declara un evento es un enlace con destino que **no** abre pestaña nueva, el proveedor cancela el clic, manda el evento y navega hasta que recibe respuesta: en una red lenta, la acción del vecino se queda esperando (medido: 3.0 s de retraso con 3 s de latencia del proveedor). Por eso, **ningún enlace que no abra pestaña nueva DEBE llevar el evento en el propio enlace**; en esos casos —hoy el botón "Llamar", que usa `tel:` y por diseño no abre pestaña— el evento DEBE declararse en un elemento envolvente que no sea un enlace, de modo que el proveedor registre el mismo evento sin tocar la navegación. La envoltura NO DEBE cambiar el diseño ni la accesibilidad del botón, y el modo de fallo aceptado es el benigno: si el proveedor cambiara su forma de leer los eventos, se dejaría de registrar ese clic, pero el botón nunca se rompería ni se retrasaría.

#### Scenario: un solo script y diferido

- **WHEN** se revisa el HTML de una página pública con la medición configurada
- **THEN** hay exactamente una etiqueta `<script>` externa, con carga diferida, apuntando al dominio del proveedor documentado en `.env.example`

#### Scenario: los atributos no ejecutan nada por sí solos

- **WHEN** el sitio corre sin configuración y el vecino toca el botón de WhatsApp de una tarjeta
- **THEN** el botón se comporta igual que siempre (abre la conversación), no se ejecuta ningún JavaScript de medición y no sale ninguna petición del sitio

#### Scenario: sin componentes de cliente

- **WHEN** se revisan los archivos nuevos de este change
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

## MODIFIED Requirements

### Requirement: Server Component con documento en es-MX y metadata base

El layout global DEBE ser un Server Component que no envíe JavaScript de cliente propio. La ÚNICA excepción es el script del proveedor de analítica cookieless: es JavaScript de un tercero, condicional a la configuración, diferido, ausente en `/admin` y sin código propio alrededor; justificado por el PRD §9 ("analítica desde el día 1") y ADR-005. El documento DEBE declarar `lang="es-MX"` y exponer metadata base del sitio: título "NecesitoUno Tizayuca — Encuentra negocios y servicios en Tizayuca" y descripción "Encuentra negocios, servicios y deporte en Tizayuca y contáctalos directo por WhatsApp. Registro gratis para negocios locales."

#### Scenario: documento en español de México con metadata

- **WHEN** se carga cualquier página del sitio
- **THEN** el HTML declara `lang="es-MX"` y el `<title>` y la meta descripción incluyen "Tizayuca"

#### Scenario: sin JS de cliente en el layout

- **WHEN** se construye el sitio y se revisa el layout, el header y el footer
- **THEN** ninguno usa la directiva `"use client"` ni agrega bundles de cliente propios

#### Scenario: el único script es el de la medición

- **WHEN** se revisa el HTML de una página pública con la medición configurada
- **THEN** el único JavaScript externo que carga es el del proveedor de analítica; sin configuración, no carga ninguno
