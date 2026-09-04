# Diseño técnico: agregar-directorio-publico

Decisiones no obvias que la implementación debe respetar. Antes de tocar código, leer la guía correspondiente en `node_modules/next/dist/docs/` (esta versión de Next.js difiere de lo conocido; ver `AGENTS.md` de la raíz), en particular lo relativo a rutas dinámicas, `params` asíncronos, `searchParams`, `notFound()` y `not-found.tsx`.

## 1. La ruta de categoría vive en la raíz y no puede tapar rutas propias

El PRD §8 y el ticket piden `/servicios-del-hogar`, no `/categoria/servicios-del-hogar`: la URL limpia en la raíz es la que se comparte por WhatsApp y la que E5-1 va a extender con `giro-colonia`. Eso mete un segmento dinámico (`src/app/[categoria]/`) en la raíz, con dos riesgos:

1. **Colisión con rutas propias.** En Next.js los segmentos estáticos ganan al dinámico, así que `/registro` y `/negocio/...` siguen funcionando; el riesgo real es al revés: que una categoría del catálogo se llame igual que una ruta propia (hoy `registro`, `negocio`, y mañana `admin`, `buscar`, `aviso-de-privacidad`, `terminos`) y su listado quede inalcanzable para siempre. Se resuelve con una lista de segmentos reservados en `src/lib/` y un test que falle si algún slug del catálogo la toca. Es una salvaguarda barata que E5-1 va a agradecer.
2. **Cajón de sastre.** El segmento dinámico atrapa cualquier URL de un solo nivel. La ruta solo debe responder si el slug existe en la tabla `Categoria`; en cualquier otro caso, `notFound()`. Nada de aproximaciones ni redirecciones "parecidas".

Ambas páginas leen la base en cada request (`force-dynamic`, igual que `/registro`): en CI no hay base al construir, y el contenido depende de lo que el admin publique. El presupuesto de <2s en 4G del PRD §8 se sostiene por el lado del peso (Server Components, cero JS de cliente nuevo, sin imágenes reales todavía), no por prerenderizado.

## 2. URL de la ficha: `/negocio/<nombre-en-slug>-<identificador>`

Opciones evaluadas:

| Opción | A favor | En contra |
| --- | --- | --- |
| `/negocio/<id>` | trivial, estable | ilegible en un mensaje de WhatsApp, cero señal para SEO |
| `/<categoria>/<negocio>` | jerarquía bonita, SEO | se rompe cuando el admin recategoriza; choca conceptualmente con las páginas de E5-1 |
| Columna `slug` única en `Negocio` | la URL más limpia | migración, colisiones de nombres a resolver, y el ticket no pide tocar el modelo |
| **`/negocio/<slug>-<id>`** (elegida) | legible, estable ante recategorización y ante cambios de nombre, sin migración | la URL arrastra el identificador |

El segmento se resuelve por el identificador, que es la parte después del último guion (los `cuid` de Prisma no llevan guiones). La parte legible es decorativa: si el negocio cambió de nombre y alguien abre una URL vieja, la ficha se muestra igual — los enlaces compartidos por WhatsApp no se pueden romper, que es el canal del producto. La URL canónica (la que arma el sitio) siempre usa el nombre actual.

Si el identificador no existe, o el negocio no está en estado `publicado`, la respuesta es 404 — la misma para ambos casos, para no confirmar la existencia de fichas en revisión.

## 3. Filtro por colonia: enlaces con parámetro de consulta, no `select` con JS

El ticket prohíbe JS de cliente nuevo. El filtro se pinta como una fila de enlaces ("Todas las colonias" + una por colonia con negocios publicados en esa categoría) que apuntan a `?colonia=<slug>`; el servidor lee el parámetro y filtra. Ventajas: funciona sin JS, es enlazable y compartible, y no genera URLs indexables paralelas que compitan con las páginas de E5-1 (que serán rutas propias, no parámetros).

Solo se listan colonias que tienen al menos un negocio publicado en esa categoría: un filtro que lleva a "no hay nada" es un control muerto. Un `?colonia=` desconocido no es un error del usuario ni una ruta inexistente: se ignora y se muestra el listado completo (el 404 se reserva para categoría y negocio, que es lo que pide el ticket).

## 4. Enlaces salientes en un solo módulo

`wa.me`, `tel:`, Google Maps y la página que registró el negocio se arman en un módulo de `src/lib/`, no en el JSX:

- **WhatsApp**: `https://wa.me/52<10 dígitos>`; el número se pasa por `normalizarWhatsapp` (T-003) antes de construirlo, así que una fila sembrada a mano con formato raro no genera un enlace roto. El mensaje prellenado, si se aprueba (duda 2 de la propuesta), se codifica como parámetro.
- **Cómo llegar**: búsqueda en Google Maps con el texto que capturó el negocio + su colonia + "Tizayuca, Hidalgo", codificado. No hay coordenadas (el pin quedó pospuesto en T-003) y no se inventa una dirección: si el negocio no capturó dirección ni referencias, el botón no existe.
- **Página del negocio** (campo `facebookUrl`): hallazgo M4 de T-003. La validación del registro solo garantiza `http(s)`, no que el dominio sea Facebook, así que la etiqueta no puede decir "Facebook": muestra el dominio real guardado (`m.facebook.com`, `fb.me` o lo que sea), que además delata los homógrafos que T-003 ya normaliza a `xn--...`. Si la URL guardada no se puede interpretar, el enlace no se pinta.

Todos los externos abren en pestaña nueva con `rel="noopener noreferrer"`. `tel:` no abre pestaña (el celular cambia de app), así que va sin `target` ni `rel`.

## 5. Consultas del directorio con el filtro de estado en un solo lugar

Todas las lecturas públicas pasan por un módulo `src/lib/directorio.ts` cuyas funciones aplican `estado: "publicado"` por construcción (usando el literal de `src/lib/negocio.ts`, sin strings mágicos). Ninguna página arma su propio `where`: es la forma barata de que "la ficha y el listado NUNCA muestran datos de negocios no publicados" sea una propiedad del código y no una disciplina, y de que un test pueda vigilar un solo archivo.

Ese módulo también decide qué campos se leen: se seleccionan explícitamente los públicos y se dejan fuera `consintioAvisoEn`, `tokenGestion`, `origen`, `estado` y `registradoEn`. Lo que no se lee no se puede filtrar por accidente al HTML.

## 6. Seed de demo separado del de catálogos

El seed de catálogos (`npm run db:seed`) es parte del arranque de cualquier entorno y su spec exige conteos exactos; meterle negocios de mentira lo contaminaría. Por eso los negocios ficticios viven en un archivo aparte con su propio comando (`npm run db:seed:demo`), idempotente por número de WhatsApp y con un aviso claro en la salida de que son datos de mentira.

Reglas LFPDPPP (repo público): nombres inventados que se lean como inventados, WhatsApp de la serie `771999xxxx` ya usada en los tests de T-001/T-003, sin direcciones reales verificables y sin fotos. El conjunto debe cubrir los casos que el ticket obliga a probar a mano: varios negocios en varias categorías (incluida la de deporte) y colonias, uno con entrega a domicilio y otro sin ella, uno con todos los opcionales y otro con solo obligatorios, uno con colonia "Otra" sin normalizar, uno `en_revision` y uno `rechazado` (que jamás deben aparecer).
