# Diseño: agregar-paginas-legales

Solo lo que no es obvio. Lo demás (rutas, Server Components, tokens de color, mobile-first) sigue el patrón del sitio.

## 1. Capacidad nueva `paginas-legales`, no un apéndice de `layout-base`

`layout-base` es la capacidad del chrome del sitio (header, footer, 404, reglas de enlaces). Las páginas legales no son chrome: son contenido de producto con requisitos propios (elementos mínimos de la LFPDPPP, reglas de moderación publicadas, borrador vs. versión revisada) que va a seguir cambiando por su cuenta —E6-3 (revisión legal), T-008 (política de foto), E7 (analítica y cookies), E3-6 (flujo ARCO)—. Meterlas en `layout-base` haría que esa spec creciera con texto legal que nada tiene que ver con el layout. `layout-base` conserva lo que sí es suyo: que el footer las enlace.

## 2. El texto legal vive como datos (`src/lib/legales/textos.ts`), no suelto en el JSX

Mismo patrón que `src/lib/registro/textos.ts` y `src/lib/admin/textos.ts`: el contenido aprobado se declara como constantes (secciones con su encabezado y sus párrafos/viñetas) y la página solo lo pinta. Razones:

- **El texto es contenido aprobado en la spec.** Tenerlo en un módulo permite que los tests comparen contra el literal en vez de contra fragmentos de markup, y que un cambio de redacción se vea en un diff legible.
- **Los dos documentos comparten piezas** (marca de borrador, fecha de última actualización, placeholders, enlaces cruzados): una sola fuente evita que se desincronicen.
- **Se descartó MDX/markdown**: agregaría dependencia y pipeline de contenido para dos páginas; el proyecto no tiene CMS ni lo quiere en el MVP.

La página sigue siendo la dueña de la semántica (`h1`, `h2`, listas): el módulo aporta el texto, no el markup.

## 3. Placeholders declarados en un solo lugar, con verificación que no bloquea hoy

Los datos que solo puede dar el humano se declaran una vez (`PLACEHOLDERS_LEGALES`) y se interpolan en el texto. La verificación automática:

- **falla** si aparece en las páginas legales un placeholder entre corchetes que no esté declarado en esa lista (así nadie inventa uno suelto que nadie va a buscar después),
- **falla** si la lista no está vacía y la marca de borrador no se ve en las dos páginas (el borrador no puede pasar por definitivo),
- **no falla** por el simple hecho de que existan placeholders: hoy es el estado correcto del proyecto, que ni siquiera está desplegado (E0-3).

Cuando el humano complete los datos y la revisión legal (E6-3), vaciar la lista quita la marca de borrador sola. Ese es el interruptor de lanzamiento: uno, visible y probado.

## 4. Rutas `/aviso-de-privacidad` y `/terminos` tal cual

Ambos segmentos están reservados desde T-004 en `src/lib/rutas-reservadas.ts`, así que ninguna categoría del catálogo puede taparlos y la lista blanca de enlaces ya sabe de ellos. Se usan tal cual, aunque "términos y condiciones" sea el nombre visible del documento: cambiar el segmento ahora solo serviría para desalinear la reserva y alargar una URL que se va a compartir por WhatsApp.
