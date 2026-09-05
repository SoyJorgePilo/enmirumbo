# Delta: revision-admin — listado de todos los negocios para gestionarlos

## ADDED Requirements

### Requirement: Vista "Todos los negocios" con el estado a la vista y entrada al detalle

El panel DEBE tener una pantalla propia en `/admin/negocios`, encabezada con el texto literal "Todos los negocios", que liste **todos los registros de la base sin importar su estado** —los que esperan revisión, los publicados, los rechazados y los que volvieron a la cola por una despublicación—, para que ninguna ficha quede fuera del alcance del admin (PRD §6.3; PRD §8: las herramientas de cancelación y borrado solo sirven si se puede llegar a la ficha). Es la puerta de entrada que le faltaba al panel: la vista NO DEBE ofrecer ninguna acción sobre los registros —ni aprobar, ni rechazar, ni despublicar, ni borrar, ni marcar reportes—, porque esas viven en el detalle y ahí se deciden con todos los datos enfrente.

Cada renglón DEBE mostrar:

- el **nombre** del negocio;
- su **colonia** (la del catálogo o el texto libre que capturó), con el mismo criterio que la cola;
- su **fecha de registro**, escrita completa (por ejemplo "Se registró el 3 de septiembre de 2026");
- su **estado escrito con palabras**, con los textos literales "En revisión", "Publicado" o "Rechazado" según el estado guardado, legible como texto y no solo por un color;
- la etiqueta literal "Ya estaba publicada, la despublicaste" cuando la ficha volvió a `en_revision` por una despublicación (misma condición y mismo literal que ya usa la cola), porque "despublicada" no es un estado del modelo sino un `en_revision` con rastro;
- una entrada al detalle de ese registro (`/admin/registros/<id>`) con el texto literal "Ver detalle".

El orden por defecto DEBE dejar arriba **lo más reciente**, ordenando por la fecha de registro de forma descendente; esa es exactamente la fecha que el renglón muestra, para que el orden se explique solo. Entre dos registros con la misma fecha el orden DEBE ser estable, de modo que un mismo registro no aparezca dos veces ni desaparezca al pasar de página. Este reloj es el del listado y NO cambia el de la cola, que sigue contando la espera desde la más reciente entre el registro y la despublicación.

El encabezado DEBE decir cuántos registros trae la lista que se está viendo, con los textos literales "1 negocio en esta lista" o "<n> negocios en esta lista". Si la base no tiene ningún negocio, la pantalla DEBE mostrar el texto literal "Todavía no hay negocios registrados." en lugar de una lista vacía.

#### Scenario: llegar a una ficha publicada sin adivinar la URL

- **WHEN** el admin abre "Todos los negocios" con un negocio publicado que no tiene ningún reporte
- **THEN** lo ve en la lista con su nombre, su colonia, su fecha de registro, el estado "Publicado" y una entrada "Ver detalle" que abre `/admin/registros/<id>` de ese negocio

#### Scenario: la lista trae los cuatro casos

- **WHEN** en la base hay un registro `en_revision` recién llegado, uno `publicado`, uno `rechazado` y uno que estuvo publicado y el admin despublicó
- **THEN** los cuatro aparecen en la lista, los tres primeros con "En revisión", "Publicado" y "Rechazado", y el despublicado con "En revisión" más la etiqueta "Ya estaba publicada, la despublicaste"

#### Scenario: lo más reciente arriba

- **WHEN** el admin abre la lista con tres registros que se registraron en días distintos
- **THEN** los ve del más reciente al más antiguo, y la fecha que muestra cada renglón corresponde al orden en el que están

#### Scenario: la lista no ofrece acciones

- **WHEN** el admin revisa la pantalla "Todos los negocios"
- **THEN** no hay ningún botón de aprobar, rechazar, despublicar, borrar ni marcar reportes: lo único que puede hacer desde ahí es filtrar, cambiar de página y abrir un detalle

#### Scenario: base sin negocios

- **WHEN** el admin abre la lista y la base no tiene ningún negocio
- **THEN** ve "Todavía no hay negocios registrados." y ningún renglón

#### Scenario: el conteo dice cuántos hay

- **WHEN** el admin abre la lista y la base tiene 34 negocios
- **THEN** lee "34 negocios en esta lista"

### Requirement: El listado se filtra por estado sin salir de la vista

La pantalla DEBE permitir acotar la lista por estado **desde la propia URL**, con enlaces que solo cambian el querystring y sin ningún JavaScript de cliente: bajo el rótulo literal "Filtrar por estado", las opciones con los textos literales "Todos" (el valor por defecto), "En revisión", "Publicados" y "Rechazados". El filtro elegido DEBE quedar señalado de forma legible —no solo por color— para que el admin sepa qué está viendo, y el conteo del encabezado DEBE corresponder a lo filtrado, no al total de la base.

Cambiar de filtro DEBE devolver siempre a la primera página: la página 7 de "Todos" no significa nada dentro de "Rechazados". Si el filtro no deja ningún registro, la pantalla DEBE mostrar el texto literal "No hay negocios con ese estado." y conservar visibles los enlaces de los demás filtros, para poder salir de ahí sin teclear la URL a mano.

Un valor de `estado` que no se reconozca —una palabra inventada, un parámetro vacío, repetido o con varios valores— DEBE tratarse como "Todos", sin error del servidor y sin decir nada del identificador ni de los datos de ningún registro. El filtro y la página son lo único que viaja en la URL de esta pantalla: **ningún dato personal DEBE ir en el querystring**.

#### Scenario: ver solo lo publicado

- **WHEN** el admin toca "Publicados" en la lista
- **THEN** ve únicamente los negocios en estado `publicado`, el conteo del encabezado cuenta solo esos, la opción "Publicados" se ve señalada como la activa y la URL cambia solo en su querystring

#### Scenario: cambiar de filtro regresa a la primera página

- **WHEN** el admin está en la página 3 de "Todos" y toca "Rechazados"
- **THEN** llega a la primera página de los rechazados, no a una página 3 que podría no existir

#### Scenario: un filtro sin resultados

- **WHEN** el admin toca "Rechazados" y no hay ningún registro rechazado
- **THEN** ve "No hay negocios con ese estado." y los enlaces de los demás filtros siguen a la vista

#### Scenario: filtro inventado en la URL

- **WHEN** alguien con sesión abre la lista con un `estado` que no existe, vacío o repetido varias veces en la URL
- **THEN** ve la lista completa igual que con "Todos", sin error del servidor y sin ningún mensaje que revele nada

#### Scenario: la URL del listado no lleva datos personales

- **WHEN** se revisan las URLs de la pantalla con cualquier filtro y cualquier página
- **THEN** solo llevan el estado y el número de página: ni nombres, ni números de WhatsApp, ni identificadores de registro

### Requirement: El listado se corta en páginas y no se degrada cuando hay muchos registros

La lista DEBE mostrarse en páginas de **25 renglones** como máximo, elegidas con el parámetro `pagina` de la URL. El recorte lo DEBE hacer la consulta a la base —pidiendo solo los renglones de la página—, no el navegador ni un filtrado en memoria de todas las filas: el tamaño del HTML que recibe el admin NO DEBE crecer con el total de registros de la base. NO DEBE haber scroll infinito ni carga progresiva: son JavaScript de cliente y el panel no lo usa (PRD §6.3, panel simple; meta de <2s en 4G).

Cuando hay más de una página, la pantalla DEBE mostrar en qué página está, con el texto literal "Página 2 de 5", y los enlaces para moverse: "Ver más antiguos" hacia la página siguiente (que es la de los registros más viejos, porque el orden es de recientes primero) y "Ver más nuevos" hacia la anterior. Cada enlace DEBE aparecer solo cuando lleva a algún lado: en la primera página no hay "Ver más nuevos" y en la última no hay "Ver más antiguos". Los dos DEBEN conservar el filtro de estado que estaba puesto. Con una sola página, NO DEBE aparecer ningún control de paginación.

Una `pagina` que no se pueda interpretar —letras, cero, negativo, decimal, repetida o vacía— DEBE tratarse como la primera. Una `pagina` más allá de la última DEBE responder sin error, mostrando el texto de lista vacía y el enlace "Ver más nuevos" para regresar.

#### Scenario: la lista larga se corta

- **WHEN** el admin abre "Todos los negocios" con 60 registros en la base
- **THEN** ve 25 renglones, lee "Página 1 de 3" y tiene el enlace "Ver más antiguos" pero no "Ver más nuevos"

#### Scenario: moverse entre páginas conservando el filtro

- **WHEN** el admin filtra por "Publicados" y toca "Ver más antiguos"
- **THEN** llega a la segunda página de los publicados —no de todos— y desde ahí "Ver más nuevos" lo regresa a la primera

#### Scenario: el HTML no crece con la base

- **WHEN** se compara la respuesta de la lista con 30 registros contra la misma con 500
- **THEN** las dos traen 25 renglones y un tamaño equivalente, porque la consulta pidió solo la página

#### Scenario: una sola página

- **WHEN** el admin abre la lista con 10 registros
- **THEN** ve los 10 y ningún control de paginación

#### Scenario: página inventada en la URL

- **WHEN** alguien con sesión pide la página `0`, `-3`, `dos` o una repetida
- **THEN** ve la primera página, sin error del servidor

#### Scenario: página más allá de la última

- **WHEN** el admin pide la página 99 de una lista que tiene 3
- **THEN** no hay error del servidor: ve la pantalla sin renglones y el enlace "Ver más nuevos" para volver

### Requirement: La cola tiene una entrada visible al listado, y el listado regresa a la cola

La cola DEBE ofrecer una entrada al listado completo con el texto literal "Ver todos los negocios", para que la vista exista dentro del flujo del admin y no sea una URL que haya que recordar. El listado, a su vez, DEBE ofrecer el regreso a la cola con el texto literal "Volver a la cola", que es el mismo que ya usan las pantallas de confirmación del panel. Ninguna de las dos entradas DEBE cambiar lo que la cola muestra ni el orden en que lo muestra: la cola sigue siendo la lista de pendientes, del más antiguo al más reciente, con su sección de negocios reportados.

#### Scenario: entrar al listado desde la cola

- **WHEN** el admin abre la cola y toca "Ver todos los negocios"
- **THEN** llega a "Todos los negocios" con el filtro "Todos" y la primera página

#### Scenario: la cola no cambia

- **WHEN** el admin abre la cola con registros pendientes y negocios reportados
- **THEN** sigue viendo "Registros por revisar" con los `en_revision` del más antiguo al más reciente y la sección "Negocios reportados", exactamente como antes, más la entrada nueva

#### Scenario: regresar a la cola

- **WHEN** el admin está en el listado y toca "Volver a la cola"
- **THEN** llega a la cola de revisión

### Requirement: El listado hereda el acceso, la no indexación y la mínima exposición de datos del panel

El listado DEBE quedar detrás de **la misma sesión firmada** que el resto del panel, sin ningún mecanismo de acceso propio: la sesión se verifica **antes** de leer nada de la base y, sin sesión válida, la respuesta DEBE ser la redirección a la pantalla de acceso, sin un solo nombre, colonia, conteo ni identificador de registro en la respuesta. Sin la configuración del panel (contraseña o secreto de firma), la pantalla NO DEBE abrirse, igual que las demás. La pantalla DEBE declarar `noindex, nofollow` y heredar la política de referente del panel, y NO DEBE estar enlazada desde ninguna página pública del sitio.

El listado DEBE mostrar **lo mínimo para reconocer una ficha y llegar a ella**: nombre, colonia, fecha de registro y estado. El WhatsApp, el teléfono fijo, la dirección, la foto, el motivo del rechazo, el motivo de la despublicación y la constancia del consentimiento NO DEBEN aparecer en esta pantalla: siguen viviendo solo en el detalle (PRD §8, LFPDPPP: entre menos datos personales se pinten de golpe, menos hay que cuidar). Nada de lo que muestra el listado DEBE escribirse en el log del servidor.

La pantalla DEBE ser **de solo lectura**: no expone ninguna acción de escritura, así que ninguna petición contra ella DEBE poder cambiar el estado, los giros, la colonia ni ningún dato de un registro, ni borrar nada.

#### Scenario: listado sin sesión

- **WHEN** alguien sin sesión abre `/admin/negocios`, con o sin filtro y página en la URL
- **THEN** llega a la pantalla de acceso y la respuesta no trae ningún nombre, colonia, estado, conteo ni identificador de registro

#### Scenario: listado con el panel sin configurar

- **WHEN** el servidor corre sin la contraseña del panel o sin el secreto de firma y alguien abre `/admin/negocios`
- **THEN** no ve la lista: se comporta igual que las demás pantallas del panel sin configurar

#### Scenario: el listado no se indexa ni se enlaza

- **WHEN** se revisa la respuesta del listado y las páginas públicas del sitio (home, formulario, listados, fichas y pie)
- **THEN** el listado declara `noindex, nofollow` y ninguna página pública lo enlaza ni menciona su ruta

#### Scenario: el listado no pinta más datos de los necesarios

- **WHEN** el admin abre el listado con fichas que tienen WhatsApp, teléfono, dirección, foto y motivo de rechazo guardados
- **THEN** ninguno de esos datos aparece en la pantalla ni en el HTML: solo nombre, colonia, fecha de registro y estado

#### Scenario: nada se escribe desde el listado

- **WHEN** llegan peticiones de escritura contra la ruta del listado, con sesión o sin ella
- **THEN** no cambia nada en la base, ningún registro cambia de estado y la respuesta no trae datos de ningún negocio

## MODIFIED Requirements

### Requirement: El panel se opera desde el celular y sin JavaScript de cliente innecesario

El panel DEBE ser mobile-first: cola —**incluida la sección de negocios reportados**—, **listado de todos los negocios (con sus filtros y su paginación)**, detalle —**incluida la lista de reportes sin atender**—, formularios de aprobar, rechazar, despublicar y marcar atendido, y la pantalla de confirmación del borrado DEBEN verse completos y usables en un viewport de 390px, sin scroll horizontal, con áreas táctiles de al menos 44px y contraste AA (PRD §8). Las pantallas del panel DEBEN ser Server Components y sus formularios DEBEN funcionar sin JavaScript de cliente, igual que el registro público. **En el listado, filtrar y cambiar de página son enlaces, no controles con JavaScript: la vista completa funciona con el JavaScript de cliente deshabilitado.**

#### Scenario: revisar desde el celular

- **WHEN** el admin abre la cola con la sección de reportados, el detalle de un negocio con reportes y los formularios de aprobar, rechazar, despublicar y marcar atendido en un viewport de 390px
- **THEN** todo se ve completo y legible, sin scroll horizontal —incluido un comentario de reporte sin espacios— y cada control tocable mide al menos 44px en su dimensión menor

#### Scenario: el listado también se opera en el celular

- **WHEN** el admin abre "Todos los negocios" en un viewport de 390px, con nombres largos y una colonia de texto libre larga
- **THEN** ve los renglones completos sin scroll horizontal, y los filtros, los enlaces de paginación y cada entrada "Ver detalle" miden al menos 44px en su dimensión menor

#### Scenario: el panel funciona sin JavaScript

- **WHEN** el admin entra, aprueba, rechaza, despublica, marca un reporte como atendido y borra con el JavaScript de cliente deshabilitado
- **THEN** las seis acciones funcionan igual, porque cada una es un envío de formulario del servidor

#### Scenario: el listado se filtra y se pagina sin JavaScript

- **WHEN** el admin abre el listado con el JavaScript de cliente deshabilitado, cambia de filtro y avanza de página
- **THEN** las dos cosas funcionan, porque son enlaces que solo cambian el querystring

#### Scenario: la confirmación del borrado también se opera en el celular

- **WHEN** el admin abre la pantalla de confirmación del borrado en un viewport de 390px con el JavaScript de cliente deshabilitado
- **THEN** ve el texto completo sin scroll horizontal, puede escribir la palabra y borrar

#### Scenario: sin JS de cliente propio

- **WHEN** se revisan los archivos nuevos del panel
- **THEN** ninguno declara `"use client"` ni agrega un bundle de cliente propio
