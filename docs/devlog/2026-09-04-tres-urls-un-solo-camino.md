# 2026-09-04 · Tres tipos de URL, un solo camino: cómo Next.js nos obligó a fusionar rutas

<!-- Escrito para publicarse: un extracto de esta entrada debe poder ir tal cual a Facebook/LinkedIn/X. Tono cercano, español mexicano, sin jerga innecesaria. -->

**Hito:** con T-009 (SEO local, PR [#10](https://github.com/SoyJorgePilo/necesitouno/pull/10)) mergeado, NecesitoUno ya es **encontrable**: existen páginas por giro y por giro+colonia ("clases de futbol en Tizayuca" es una URL real que Google puede indexar), hay `sitemap.xml` y `robots.txt` automáticos, y cada ficha publicada trae su Schema.org.

## Qué construimos

- **Páginas por giro** (`/plomeria`, `/futbol`) y **por giro y colonia** (`/plomeria-haciendas-de-tizayuca`), con el mismo listado y la misma tarjeta que ya existían para categoría, sin UI nueva que inventar.
- **Frases curadas para los giros deportivos**: el catálogo dice "Futbol", pero lo que la gente busca es "clases de futbol", así que `/futbol` se titula **"Clases de futbol en Tizayuca"**.
- **Combinaciones sin negocios responden 200, no 404**: muestran un estado vacío con invitación a registrarse y declaran `noindex, follow`. Un 404 en algo que sí describe un giro y una colonia reales (y que puede estar compartido en un chat) es más confuso que útil.
- **`sitemap.xml` y `robots.txt`** generados de la base, sin intervención manual, y **Schema.org LocalBusiness (JSON-LD)** en cada ficha: nombre, colonia (nunca dirección exacta), categoría y giros, foto cuando existe.
- Imagen de vista previa (`og:image`) para que compartir una ficha por WhatsApp o Facebook ya no se vea como un renglón gris.

Todo en Server Components, sin JavaScript de cliente nuevo y sin dependencias nuevas.

## La decisión interesante

El problema central del ticket no era de producto, era una limitación de Next.js que descubrimos a medio camino: en App Router **no pueden coexistir dos segmentos dinámicos con nombres distintos en el mismo nivel de ruta**. Ya teníamos `/[categoria]` publicado desde T-004; agregar `/[giro]` al lado, tal cual, es directamente un error de compilación ("You cannot use different slug names for the same dynamic path"). Así que "una carpeta por tipo de página" —lo obvio— no era una opción disponible.

Evaluamos cuatro caminos: prefijos tipo `/giro/plomeria` (rompe la URL limpia que pide el PRD), un middleware que reescribiera la raíz (mete una capa que corre en cada petición y no puede hablarle a Prisma desde el borde), una columna nueva en la base con las ~1,000 URLs derivadas ya materializadas (migración y mantenimiento que el ticket no pedía), o **un solo segmento dinámico `[destino]`** que resuelve el slug contra los tres catálogos —categoría, giro, giro+colonia— en ese orden fijo. Elegimos la cuarta: es la única compatible con las URLs que el PRD exige, y renombrar la carpeta no mueve ni una URL ya publicada.

El orden no es cosmético: **la categoría gana siempre**, para que ningún giro que se agregue después pueda secuestrar una URL de categoría ya indexada por Google. Y como los slugs de giros y colonias también llevan guiones (`taekwondo-artes-marciales`, `haciendas-de-tizayuca`), partir `plomeria-haciendas-de-tizayuca` en giro+colonia no tiene una sola lectura obvia — hay que probar todos los cortes posibles y exigir que quede exactamente uno válido. Montamos una invariante que verifica que los tres catálogos nunca produzcan una lectura ambigua, y la etapa de seguridad la puso a prueba de verdad: con el catálogo real (8 categorías, 49 giros, 21 colonias) probó **las 1,029 combinaciones giro+colonia una por una contra el resolvedor de producción**, no contra una copia de juguete. Todas se leyeron de una sola manera.

## Qué aprendimos

Que Google recomienda publicar el teléfono en el Schema.org de un negocio local, y aun así **decidimos no hacerlo**. El botón de WhatsApp ya es el canal de contacto de la ficha; publicar el número también en formato máquina en el JSON-LD es justo el regalo al scraper masivo que el propio directorio intenta frenar (hallazgo previo de T-004). Elegimos perder ese pedacito de SEO recomendado a cambio de no facilitar la cosecha automatizada de números — no es una casualidad, quedó escrito como decisión de la aprobación.

Y donde el trabajo se puso más fino de lo esperado: el negocio también puede escribir su teléfono en texto libre, en "¿Qué ofreces?" ("Plomería 24 horas, llámanos al 771 000 0000"), y ese texto sí viaja al snippet de Google y a la vista previa de WhatsApp. Se agregó un saneo que oculta doce formas reales de escribir un número mexicano antes de que lleguen ahí. No es perfecto —dígitos de ancho completo o arábigo-índicos se cuelan— y lo dejamos así a propósito: cerrarlo del todo exigía normalizar el texto de una forma que también reescribe cosas legítimas que el negocio sí quiere mostrar (un "½" se convierte en "1⁄2", un "²" en un 2 plano). Las formas que sobreviven necesitan que el propio negocio ofusque su número a propósito, y ese número ya está a un toque en su botón de WhatsApp — ahí no hay nada nuevo que proteger.

## Siguiente paso

T-008 (foto del negocio) es el que sigue en la fila y hereda un pendiente de este change: cuando `fotoUrl` deje de estar vacío en toda la base, necesita una lista blanca de dominio antes de servirse como `og:image`, porque hoy cualquier URL con esquema `http`/`https` se publicaría tal cual. Queda anotado con archivo y línea para que T-008 no lo redescubra. Aparte, con T-007 (páginas legales) ya mergeado, falta una línea para sumar `/aviso-de-privacidad` y `/terminos` al sitemap — deuda chica, ya desbloqueada.

---
*Tickets/PRs relacionados: T-009 · PR #10*
