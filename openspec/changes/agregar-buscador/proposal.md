# Propuesta: agregar-buscador

**Ticket:** `docs/tickets/T-006-buscador.md` (E2-1 —la mitad que faltaba de la home— y E2-4; P0)
**PRD:** §6.2 (página principal con "buscador + categorías como botones grandes" y "búsqueda simple por nombre, palabras clave de '¿Qué ofreces?' y giros asignados: insensible a mayúsculas y acentos, con coincidencia parcial"), §6.5 (la búsqueda de deporte es la misma que la del resto: "futbol", "box", "natación"), §7 Flujo B (el vecino entra, **escribe en el buscador** o toca una categoría, ve el listado y sale hablando por WhatsApp), §8 (rendimiento en 4G, accesibilidad, solo se publica lo verificado)

## Por qué

El directorio ya se puede navegar por categorías (T-004), pero el vecino que llega sabiendo qué necesita —"plomero", "tacos", "futbol para niños"— hoy tiene que adivinar en qué categoría lo metió el admin: el PRD §6.2 pide explícitamente que "quien escriba 'plomero' debe encontrar al negocio aunque su categoría sea 'Servicios del hogar'". Este change cierra la épica E2 construyendo el buscador de la home y su página de resultados, que es la otra entrada del Flujo B del PRD §7 y la que convierte al directorio en algo que se usa con prisa desde el celular. Sin él, la home tiene un hueco declarado: la spec vigente de `directorio-publico` incluso prohíbe hoy mostrar un campo de búsqueda "mientras el buscador (E2-4) no exista".

## Qué cambia

- **La home estrena buscador arriba de las categorías** (PRD §6.2): un formulario GET hacia `/buscar`, con etiqueta visible, sin JavaScript de cliente y sin encabezado propio (la home conserva su único `h1` y sus tres `h2`). Cae la cláusula de la spec que prohibía mostrar un campo de búsqueda.
- **Página de resultados en `/buscar?q=…`** (segmento ya reservado en `src/lib/rutas-reservadas.ts` desde T-004), con las mismas tarjetas del listado, el mismo orden determinista (publicados más recientes primero, desempate por nombre) y el buscador repetido arriba con lo que el vecino escribió, para corregir sin regresar.
- **Qué se busca:** nombre del negocio, palabras clave de "¿Qué ofreces?" y giros asignados por el admin; **solo negocios `publicado`**, con las mismas reglas de privacidad del resto del directorio.
- **Cómo coincide:** insensible a mayúsculas y acentos (y a la "ñ"), con coincidencia parcial por raíz de la palabra, de modo que "plomero" encuentra al de "plomería" y al de "plomeria", y "futbol" encuentra al club de "fútbol". Sin ranking, sin sinónimos y sin fuzzy (ver `design.md` §2).
- **Columnas normalizadas en la base:** SQLite no da la insensibilidad a acentos en `contains` (ni Prisma su `mode: "insensitive"`), así que el negocio guarda una versión normalizada de su nombre y de "¿Qué ofreces?", escrita en cada alta y rellenada para las fichas que ya existen. Los giros no necesitan columna nueva: su `slug` del catálogo ya está normalizado (`design.md` §1 y §3).
- **Estados vacíos útiles:** sin resultados, la página ofrece las 8 categorías como alternativa; con la consulta vacía o de puro espacio no se busca nada y se explica qué hacer, en lugar de listar todo o tronar.
- **Términos hostiles acotados:** longitud y número de términos con tope, todo lo que no sea letra o dígito se descarta (incluidos `%` y `_`, que en un `LIKE` serían comodines) y nada de eso produce un error 500.
- **La página de resultados no es indexable** (`noindex`): las URLs con parámetro de consulta no son las páginas SEO de E5, y no deben competir con ellas.

## Capacidades afectadas

- `directorio-publico` (MODIFIED + ADDED): la home deja de tener prohibido el buscador y suma el formulario de búsqueda; se agregan la página de resultados, el alcance y la regla de coincidencia, el tratamiento de consultas vacías y hostiles, y el `noindex` de los resultados. Se amplía el requirement de Server Components/mobile-first para cubrir las pantallas nuevas.
- `modelo-datos` (ADDED + MODIFIED): el negocio persiste el texto normalizado de búsqueda (migración con relleno de las fichas existentes); el seed de negocios ficticios suma giros asignados para poder probar la búsqueda por giro mientras el panel del admin (T-005) no existe.
- `registro-negocio` (ADDED): el alta escribe el texto normalizado, para que una ficha recién registrada sea encontrable en cuanto el admin la publique.
- `layout-base` (MODIFIED): la regla de "enlaces internos a rutas existentes" se extiende al destino de los formularios (`action`), que es como el buscador sale de la home.

## Impacto en código (alto nivel)

- Módulo nuevo `src/lib/busqueda.ts`: normalización de texto y de la consulta (recorte, términos, raíces). Reutiliza el quitado de acentos que ya vive en `src/lib/slug.ts` (se extrae a un helper compartido sin cambiar el comportamiento de `slugify`); **sin dependencias nuevas**.
- `prisma/schema.prisma` + migración: dos columnas normalizadas en `Negocio`; script de relleno (`db:backfill:busqueda`) para las fichas ya guardadas; `prisma/seed-demo.ts` escribe las columnas y asigna giros a algunos negocios ficticios.
- `src/lib/registro/` (procesamiento del alta): escribe las columnas normalizadas con el helper compartido.
- `src/lib/directorio.ts`: función nueva de búsqueda, con el filtro `estado: publicado` aplicado por construcción como el resto del módulo.
- `src/components/directorio/buscador.tsx` (Server Component) y `src/app/buscar/page.tsx`; `src/app/page.tsx` inserta el buscador arriba de "Busca por categoría".
- Tests: suites nuevas de normalización, consultas de búsqueda, página de resultados y adversarial del buscador; `tests/layout.test.ts` acepta `/buscar` y revisa el `action` de los formularios.

## Fuera de este change

- **Ranking de relevancia, sinónimos y fuzzy matching** ("fontanero" → "plomero", tolerancia a errores de dedo): el ticket los excluye; con el volumen del arranque (PRD §9) el orden determinista alcanza.
- **Autocompletado o sugerencias en vivo**: requerirían JS de cliente y el MVP no los pide.
- **Índice de texto completo (FTS5 de SQLite)**: se evaluó y se descartó por ahora (`design.md` §2); la decisión de base de producción sigue abierta (E0-3, ADR-001).
- **Páginas SEO por giro y giro+colonia (E5-1) y Schema (E5-2)**: la búsqueda por giro que se implementa aquí no genera páginas indexables.
- **Analítica de términos buscados (E7)**: saber qué busca la gente y no encuentra es valiosísimo para la siembra del PRD §9, pero es su propio ticket (y su propia decisión de privacidad).
- **Filtro por colonia dentro de los resultados** y **mostrar la categoría del negocio en la tarjeta**: la tarjeta la fija la spec de T-004 y el ticket no la toca; si al usar el buscador se ve confuso de qué categoría es cada resultado, es un ajuste de UI con ticket propio.
- **Paginación de resultados**: mismo criterio que el listado.
- **Buscador en el header de todas las páginas**: el ticket lo pide en la home y lo repite en resultados; ponerlo en el header es una decisión de navegación global, no de este change.
- **Búsqueda por colonia como término** ("plomero en Huicalco"): el PRD acota la búsqueda a nombre, palabras clave y giros.
- **Defecto de consolidación detectado, ajeno a este ticket:** `openspec/specs/layout-base/spec.md` arrastra en sus líneas 80-82 un encabezado huérfano (`### Requirement: Home del sitio dentro del layout, con la entrada al registro\`` seguido de `## MODIFIED Requirements`) que quedó de un archivado anterior. No se toca aquí; conviene limpiarlo en el próximo archivado o con un chore.

## Dudas resueltas en la aprobación

1. **Literales de UI**: aprobados todos tal como los propone la spec ("Busca lo que necesitas", "ej. plomero, tacos, futbol infantil", "Buscar", el encabezado de resultados, el estado vacío con categorías y el aviso de consulta vacía).
2. **Regla de raíz de 5 caracteres**: aprobada — cumple el ejemplo del propio PRD §6.2 ("plomero" encuentra "plomería"); los falsos positivos tipo "carni"→"carnitas" son aceptables en un directorio chico y sin ranking.
3. **Varias palabras**: aprobado exigir todas — menos ruido; el estado sin resultados ya ofrece las categorías como salida.
