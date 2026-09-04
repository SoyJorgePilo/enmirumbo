# T-006 · Construir el buscador del directorio

**Estado:** en-review
**Prioridad:** P0
**Épica:** E2-1 (el buscador de la home), E2-4 (docs/backlog.md)
**Referencias PRD:** §6.2 (búsqueda simple, normalización), §7 Flujo B
**Depende de:** T-004 (directorio público)
**OpenSpec change:** `agregar-buscador`
**PR:** —

## Contexto

Cierra la épica E2: el vecino que sabe qué necesita ("plomero") no debería navegar categorías. El PRD pide búsqueda simple por nombre, palabras clave de "¿Qué ofreces?" y giros asignados, insensible a mayúsculas y acentos y con coincidencia parcial — "plomero" encuentra "plomería" y "plomeria" aunque la categoría del negocio sea "Servicios del hogar". Solo busca entre negocios publicados.

## Criterios de aceptación

- [x] La home muestra el buscador arriba de las categorías (PRD §6.2: "buscador + categorías como botones grandes"); funciona sin JS de cliente (form GET)
- [x] Existe la página de resultados con las mismas tarjetas del listado (reutilizadas de T-004), y estado vacío útil que ofrece las categorías como alternativa
- [x] La búsqueda cubre nombre del negocio, palabras clave de "¿Qué ofreces?" y giros asignados; solo negocios `publicado`
- [x] Insensible a mayúsculas y acentos, con coincidencia parcial: "plomero" encuentra al de "plomería" y al de "plomeria"; "futbol" encuentra al club aunque escriba "fútbol"
- [x] Consulta vacía o de puro espacio no busca (regresa o muestra la home/resultados con aviso); términos hostiles (unicode raro, muy largos) se acotan sin error 500
- [x] La página de resultados no es indexable (meta robots noindex: las URLs con query no son las páginas SEO de E5)
- [x] Mobile-first, Server Components, sin dependencias nuevas (la normalización de acentos se resuelve con lo que ya existe — ver `src/lib/slug.ts`)

Pendiente de ojos humanos antes del merge: la revisión visual a 390/768/1280 px (tasks #17) no se pudo cerrar sin navegador.

## Fuera de alcance de este ticket

- Ranking de relevancia, sinónimos o fuzzy matching más allá de la coincidencia parcial normalizada
- Autocompletado o sugerencias en vivo (requeriría JS; el MVP no lo pide)
- Páginas SEO por giro/colonia (E5-1) y Schema (E5-2)
- Analítica de términos buscados (E7)

## Notas

- SQLite + Prisma: la insensibilidad a acentos no viene gratis en `contains`; probablemente toque materializar columnas normalizadas (ej. `nombreNormalizado`, `queOfrecesNormalizado`) mantenidas al escribir, con migración — decidirlo en la spec/design.
- Los giros hoy no tienen asignación real (llega con el panel T-005); la búsqueda por giro debe quedar implementada y probada vía fixtures aunque en producción se active cuando el admin asigne.
- La lista blanca de hrefs de `tests/layout.test.ts` crecerá con la ruta de resultados.
