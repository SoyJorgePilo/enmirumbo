# Diseño técnico: agregar-buscador

Decisiones no obvias que la implementación debe respetar. Antes de tocar código, leer la guía correspondiente en `node_modules/next/dist/docs/` (esta versión de Next.js difiere de lo conocido; ver `AGENTS.md` de la raíz), en particular lo relativo a `searchParams` asíncronos, formularios GET en Server Components y `metadata`/`robots`.

## 1. Dónde vive la normalización de acentos: columnas materializadas

SQLite no compara sin acentos: `LIKE '%plomeria%'` no encuentra "Plomería", y el `mode: "insensitive"` de Prisma no está soportado en este proveedor. Opciones evaluadas:

| Opción | A favor | En contra |
| --- | --- | --- |
| Filtrar en memoria (traer los publicados y normalizar en JS) | cero migración, cero sincronización | carga toda la tabla en cada búsqueda —la ruta más caliente del Flujo B— y saca el filtro `estado: publicado` del único lugar donde hoy vive (`src/lib/directorio.ts`); el día que crezca, la corrección exige la misma migración |
| `COLLATE` o extensión de SQLite | ninguna columna nueva | no hay collation sin acentos en SQLite base; implicaría dependencia o build propio, y el ticket prohíbe dependencias nuevas |
| Índice FTS5 | pensado para esto, rápido | tabla virtual fuera del modelo de Prisma, migración a mano y una decisión que se contradiría con la base de producción aún por decidir (E0-3, ADR-001); desproporcionado para decenas de fichas |
| **Columnas normalizadas en `Negocio`** (elegida) | la consulta sigue siendo un `where` de Prisma junto al filtro de estado; portable a Postgres el día de E0-3 | hay que mantenerlas al escribir y rellenar lo ya guardado |

Se agregan `nombreNormalizado` y `queOfrecesNormalizado` (texto, no nulos, default `""` solo para que la migración pueda correr sobre filas existentes). Son campos derivados: **nunca** se editan a mano ni se leen para mostrar; `src/lib/directorio.ts` no los incluye en sus proyecciones públicas.

El riesgo real de esta opción es que un camino de escritura futuro se olvide de mantenerlas y el negocio quede invisible en el buscador sin que nada falle. Se contiene con tres cosas: (a) una sola función `datosDeBusqueda(nombre, queOfreces)` que todo camino de escritura usa; (b) un script de relleno idempotente (`db:backfill:busqueda`) que recalcula todo; (c) un test de consistencia que recorre la base de pruebas y exige que cada fila tenga sus columnas iguales a la normalización de sus campos fuente.

Hoy el único camino de escritura es el alta del registro (más los seeds). El panel del admin (T-005) asigna giros, normaliza colonia y publica, pero no edita nombre ni "¿Qué ofreces?"; la edición del negocio es P1 (E8) y tendrá que usar la misma función.

## 2. Regla de coincidencia: raíz de 5 caracteres, y todos los términos

El PRD §6.2 pide que **"plomero" encuentre "plomería"**, y eso no es substring: ninguna de las dos palabras contiene a la otra. Tampoco es fuzzy (el ticket lo excluye). La regla que cumple el ejemplo del PRD con código trivial y determinista:

1. **Normalizar** consulta y textos guardados igual: NFD, se quitan las marcas de acento (la "ñ" queda "n" en ambos lados, así que "piñatas" y "pinatas" se encuentran), minúsculas, todo lo que no sea `a-z0-9` pasa a espacio, espacios colapsados.
2. **Acotar**: la consulta se recorta a 60 caracteres antes de partirse; se toman como máximo 4 términos; se descartan los términos de un solo carácter (una letra suelta coincide con casi todo y no aporta).
3. **Raíz**: cada término de 5 caracteres o más se recorta a sus primeras 5 letras ("plomero" → "plome", "plomeria" → "plome"); los más cortos se usan completos.
4. **Coincidir**: un negocio publicado entra en los resultados si **todos** los términos aparecen —cada uno como substring de su raíz— en su nombre normalizado, en su "¿Qué ofreces?" normalizado o en el `slug` de alguno de sus giros. Los términos pueden repartirse entre campos distintos.

Consecuencias asumidas: "pastel" encuentra "pastelería" (bien) y "carni" encuentra tanto "carnicería" como "carnitas" (aceptable en un directorio de barrio). Sin ranking: el orden es el mismo del listado (publicados más recientes primero, desempate por nombre), que ya es determinista y no fosiliza las primeras posiciones.

El número 5 es un compromiso: con 4 el ruido crece ("come" pegaría con demasiado); con 6, "plomero"/"plomería" siguen funcionando pero se pierden pares cortos como "taco"/"taquería" —que de todos modos esta regla no resuelve, y que es exactamente el terreno de los sinónimos que el ticket deja fuera.

## 3. Los giros no necesitan columna nueva

El `slug` del catálogo de giros ya es minúsculas, sin acentos y con guiones (`modelo-datos`: "Plomería" → `plomeria`, "Fonda / comida corrida" → `fonda-comida-corrida`). Como la consulta se parte en términos de una sola palabra, los guiones nunca estorban a un substring: "comid" está dentro de `fonda-comida-corrida`. Así que la búsqueda por giro se resuelve con `giros: { some: { slug: { contains: raiz } } }`, sin denormalizar los giros dentro del negocio y sin que el panel del admin (T-005) tenga que mantener nada extra al asignarlos.

Como hoy ningún negocio tiene giros (los asigna el admin, que llega con T-005), la única forma de probar este camino es por fixtures: el seed de demostración asigna giros a un par de negocios ficticios, incluido **uno cuyo giro no aparece ni en su nombre ni en su "¿Qué ofreces?"**, que es el único caso que demuestra de verdad que la búsqueda por giro funciona.

## 4. La búsqueda vive en el módulo de consultas del directorio

`buscarNegociosPublicados(consulta)` se agrega a `src/lib/directorio.ts` y no a la página: ese módulo es el único lugar del código que lee negocios para mostrarlos, aplica `estado: publicado` por construcción y selecciona campo por campo lo que es público. Una consulta de búsqueda armada aparte sería justo la excepción que rompe esa propiedad. La función devuelve `NegocioListado[]`, el mismo tipo que consume la tarjeta de T-004.

Sobre inyección y comodines: Prisma parametriza, pero `contains` **no** escapa `%` ni `_`, que en `LIKE` son comodines. La normalización del paso 1 los elimina antes de llegar a la base, así que `q=%` termina siendo una consulta vacía y no un "tráete todo". Esto se prueba explícitamente en la suite adversarial.

## 5. La página de resultados: dinámica, con `noindex`, sin JS

`/buscar` lee `searchParams` (es dinámica por definición) y consulta la base en cada request, igual que el resto del directorio. El formulario de la home es `<form action="/buscar" method="get">` con `<input type="search" name="q">`: navegación del servidor pura, sin JS de cliente, y el mismo componente se repinta arriba de los resultados con el valor ya escrito.

`noindex` (con `follow`, para que Google siga los enlaces a las fichas): las URLs con parámetro de consulta no son las páginas SEO del PRD §8 —esas son las de giro y giro+colonia de E5-1— y dejarlas indexables generaría contenido duplicado y delgado que compite con ellas. `/buscar` ya estaba reservado como segmento en `src/lib/rutas-reservadas.ts` desde T-004, así que ninguna categoría del catálogo puede taparlo.

Si `q` llega repetido (`?q=a&q=b`), se usa el primer valor: es el comportamiento determinista más simple y no hay caso legítimo que lo produzca.
