# Propuesta: agregar-directorio-publico

**Ticket:** `docs/tickets/T-004-directorio-publico.md` (E2-1 parcial —categorías y bloque deporte, sin buscador—, E2-2, E2-3, E4-1; P0)
**PRD:** §6.2 (home con categorías como botones grandes, listado por categoría con filtro por colonia, ficha con botones de contacto y sello "Negocio verificado"), §6.5 (bloque "Deporte en Tizayuca" al mismo nivel visual que las categorías comerciales), §7 Flujo B (el vecino entra, toca una categoría, ve el listado, entra a la ficha y sale hablando por WhatsApp), §8 (rendimiento en 4G, accesibilidad, publicar colonia y no domicilio exacto)

## Por qué

Con el registro ya en pie (T-003) el sitio recibe negocios pero ningún vecino puede encontrarlos: falta la otra mitad del Flujo B del PRD §7, cuyo éxito es literalmente "salió del sitio hablando con el negocio". Este change construye el camino completo home → categoría → ficha → WhatsApp que define el producto según el PRD §6.2, más el bloque destacado "Deporte en Tizayuca" del §6.5, que es el hueco de información que ningún otro actor del municipio cubre. Mientras el buscador (E2-4) no llega, las categorías como botones grandes son la única navegación, así que tienen que bastarse solas.

## Qué cambia

- **La home deja de ser provisional**: muestra las 8 categorías del catálogo como botones grandes, el bloque "Deporte en Tizayuca" al mismo nivel visual (que lleva al listado de la categoría "Clubes y escuelas deportivas") y conserva la entrada "Registra tu negocio gratis" del Flujo A. Desaparece la frase "Muy pronto vas a poder encontrar aquí los negocios y servicios de Tizayuca."
- **Listado por categoría en URL limpia con el slug del catálogo** (`/servicios-del-hogar`, `/clubes-y-escuelas-deportivas`), con filtro por colonia mediante enlaces (sin JS de cliente) y solo con negocios en estado `publicado`. La ruta dinámica vive en la raíz para no migrar URLs cuando llegue E5-1, y no puede tapar rutas propias del sitio (`/registro`, `/negocio`).
- **Tarjeta de listado con lo esencial sin clics extra** (PRD §6.2): foto o marcador de posición, nombre, colonia, etiqueta "A domicilio" cuando aplique y botón verde de WhatsApp que sale directo a `wa.me` con el número normalizado; la tarjeta completa también lleva a la ficha.
- **Ficha de negocio en URL propia** con la información que el negocio registró, sello "Negocio verificado" y los botones del PRD §6.2: "Enviar WhatsApp" como acción principal, "Llamar" si hay teléfono fijo, "Cómo llegar" si capturó dirección o referencias, y el enlace a la página que registró mostrando su dominio real, sin prometer que es Facebook (hallazgo M4 de T-003).
- **Nada de negocios no publicados**: los estados `en_revision` y `rechazado` no aparecen en ningún listado y su ficha responde 404. Se publica la colonia, no el domicilio exacto, salvo lo que el propio negocio escribió como dirección o referencias (PRD §8).
- **Página 404 global en español** (`not-found.tsx`, hoy no existe), dentro del layout, para categoría o negocio inexistentes y para cualquier URL desconocida.
- **Regla de enlaces del sitio**: los internos apuntan a rutas que existen (ahora también dinámicas, resueltas desde el catálogo) y los externos (`wa.me`, mapas, página del negocio) abren en pestaña nueva con `rel="noopener noreferrer"`; `tel:` no abre pestaña. La lista blanca de `tests/layout.test.ts` se amplía para cubrir ambos casos.
- **Seed de desarrollo con negocios ficticios**: comando propio, separado del seed de catálogos, que crea negocios de mentira claramente marcados (nombres inventados, WhatsApp `771999xxxx`) para poder ver listados y fichas; nunca datos reales (repo público + LFPDPPP).

## Capacidades afectadas

- `directorio-publico` (nueva): home con categorías y bloque deporte, listado por categoría con filtro por colonia, tarjeta, ficha, botones de contacto y las reglas de visibilidad/privacidad de lo publicado.
- `layout-base` (RENAMED + MODIFIED + ADDED): la home deja de ser provisional; se agregan la página 404 en español y la regla de enlaces internos/externos del sitio.
- `modelo-datos` (ADDED): seed de negocios ficticios para desarrollo, separado e idempotente; el esquema no cambia y no hay migración nueva.
- `registro-negocio`: se consume sin cambios (la home sigue enlazando a `/registro`).

## Impacto en código (alto nivel)

- Rutas nuevas: `src/app/[categoria]/page.tsx` (listado), `src/app/negocio/[ficha]/page.tsx` (ficha) y `src/app/not-found.tsx` (404 global).
- `src/app/page.tsx`: home real con categorías, bloque deporte y CTA de registro.
- Módulo de consultas del directorio en `src/lib/` (categoría por slug, publicados por categoría y colonia, colonias con negocios publicados, negocio publicado por identificador), con el filtro por estado en un solo lugar.
- Módulo de enlaces salientes en `src/lib/` (arma `wa.me` reutilizando `normalizarWhatsapp`, `tel:`, búsqueda en Google Maps y el enlace a la página registrada con su dominio visible).
- Componentes de presentación en `src/components/directorio/` (tarjeta, sello, etiqueta "A domicilio", marcador de foto, botones de contacto), todos Server Components.
- `prisma/seed-demo.ts` (o equivalente) + script `db:seed:demo` en `package.json`; `prisma/seed.ts` sigue creando solo catálogos.
- `tests/layout.test.ts`: lista blanca de hrefs con rutas dinámicas y tratamiento de enlaces externos; suites nuevas de listado, ficha y seed de demo.
- Sin dependencias nuevas y sin migración de base.

## Fuera de este change

- **Buscador y búsqueda por palabras clave** (E2-4): ni siquiera aparece el input, para no dejar controles muertos en la home.
- **Páginas por giro y giro+colonia** (E5-1) y **Schema Markup LocalBusiness** (E5-2): las URLs de categoría ya usan slugs del catálogo para no migrarlas después, pero aquí no se generan páginas por giro ni se emite markup.
- **Giros del negocio en la ficha**: los asigna el admin (E3) y hoy ningún negocio los tiene; mostrarlos como etiquetas sueltas sin páginas destino puede entrar con E5-1.
- **"¿Qué ofreces?" en la tarjeta del listado**: el ticket fija el contenido de la tarjeta y no lo incluye; si al usar el directorio se ve pobre, es un ajuste de UI con su propio ticket.
- **Botón "Reportar"** en la ficha (E3-4) y **analítica de vistas y clics** (E7).
- **Foto real del negocio y su compresión** (E1-3): mientras tanto, marcador de posición.
- **Pin en mapa**: sigue pospuesto desde T-003; "Cómo llegar" se arma con el texto que capturó el negocio, no con coordenadas.
- **`sitemap.xml`, `robots.txt` y metadata por página** (título y descripción propios de listado y ficha): son de la capacidad `seo-local` (E5); aquí las páginas heredan la metadata base del layout.
- **Paginación del listado**: con el volumen del arranque (PRD §9) no hace falta; entra cuando una categoría pase de una pantalla larga.

## Dudas resueltas en la aprobación

1. **URL de la ficha**: aprobada la opción propuesta `/negocio/<nombre-en-slug>-<identificador>` — estable ante recategorización y sin migración futura; el slug le da legibilidad y el identificador la unicidad.
2. **Mensaje prellenado del WhatsApp**: aprobado "Hola, te vi en NecesitoUno Tizayuca. ¿Me das informes?" — además de romper el hielo, le dice al negocio de dónde llegó el cliente (señal de valor del directorio desde el día uno).
3. **Orden del listado**: aprobado publicados más recientes primero con empate por nombre — premia a los recién llegados y evita que el orden alfabético fosilice las primeras posiciones.
