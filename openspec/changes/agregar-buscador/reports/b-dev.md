# Reporte dev — `agregar-buscador`

Lógica del buscador (T-006): normalización compartida, columnas materializadas con su migración y su relleno, `buscarNegociosPublicados`, y la capa de UI de la etapa A conectada a datos reales (mocks borrados).

**Gates dentro del worktree:** `npm run lint` ✅ · `npm run build` ✅ · `npm test` ✅ **571 pruebas, 21 archivos, 0 fallas** (antes del change eran 431 + 2 rojas a propósito). No toqué git.

## Tareas completadas

Las 18 de `tasks.md` quedan en `- [x]`, cada una con nota de qué se hizo y cómo se verificó. La única que **sigue necesitando una persona** es la #17: no hay navegador en este entorno, así que la revisión a 390/768/1280 px es estructural (HTML servido + clases), no visual. Queda anotada para quien abra el PR.

## Archivos

**Nuevos**

- `src/lib/texto.ts` — `quitarAcentos` (NFD + borrado de marcas combinantes), extraído de `slug.ts`.
- `src/lib/busqueda.ts` — `normalizarTexto`, `terminosDeBusqueda`, `datosDeBusqueda` y las tres constantes de la regla (60 caracteres, 4 términos, raíz de 5).
- `prisma/migrations/20260904032104_agrega_texto_normalizado_de_busqueda/migration.sql`
- `prisma/backfill-busqueda.ts` + script `npm run db:backfill:busqueda`.
- `tests/busqueda.test.ts`, `tests/busqueda-datos.test.ts`, `tests/busqueda-consultas.test.ts`, `tests/buscador-pagina.test.ts`, `tests/buscador-adversarial.test.ts`.

**Modificados**

- `src/lib/slug.ts` (usa el helper; mismo comportamiento), `src/lib/directorio.ts` (`buscarNegociosPublicados`), `src/lib/registro/procesar.ts` (escribe las columnas), `prisma/schema.prisma`, `prisma/seed-demo.ts` (giros + columnas + "Fútbol" con acento), `src/app/buscar/page.tsx` (imports reales + recorte de la consulta), `src/app/page.tsx` (usa `CategoriasGrid`), `package.json`.
- `tests/layout.test.ts`, `tests/directorio-paginas.test.ts`, `tests/directorio-adversarial.test.ts` (ver "Tests preexistentes tocados").

**Borrados**

- `src/lib/mock/agregar-buscador.ts` (y la carpeta `src/lib/mock/`), como pedía el reporte de la etapa A.

## Mapa scenario → test

### `directorio-publico`

| Scenario | Verificación |
| --- | --- |
| las ocho categorías visibles | `tests/directorio-paginas.test.ts` (preexistente, sigue verde con `CategoriasGrid`) |
| tocar una categoría lleva a su listado | ídem |
| el buscador va antes que las categorías | `tests/directorio-paginas.test.ts` "las categorías van bajo el encabezado…" + orden del marcado en `src/app/page.tsx`; el "sin scroll horizontal a 390px" es **manual** (#17) |
| sin controles muertos en la home | `tests/directorio-paginas.test.ts` › "todo control de la home lleva a algo: el único formulario va a /buscar" |
| sin JS de cliente nuevo | `tests/buscador-pagina.test.ts` › "no declara JavaScript de cliente ni manejadores de eventos"; `tests/layout.test.ts` › "ningún archivo de la capacidad layout-base declara use client" (cubre `buscador.tsx`, `categorias-grid.tsx` y `buscar/page.tsx` por exclusión) |
| celular a 390px | `tests/directorio-paginas.test.ts` › "todo lo tocable del directorio reserva al menos 44px" (ahora incluye `buscador.tsx` y `categorias-grid.tsx`); lo visual es **manual** (#17) |
| navegación sin JavaScript | `tests/directorio-adversarial.test.ts` › "ninguna página del directorio necesita un control con JavaScript" (actualizado: sin manejadores de eventos, y todo `<form>` con `action` interno y `method`) |
| buscar desde la home | `tests/buscador-pagina.test.ts` › "es un formulario GET a /buscar…" + `tests/layout.test.ts` › "el buscador de la home y el de resultados envían a una ruta que existe" |
| el buscador funciona sin JavaScript | `tests/buscador-pagina.test.ts` › "no declara JavaScript de cliente ni manejadores de eventos" |
| campo etiquetado y tocable | `tests/buscador-pagina.test.ts` › "es un formulario GET…" y "la etiqueta visible está asociada al campo por id"; los 44px, vía `min-h-11` en el test de áreas táctiles |
| la jerarquía de la home no cambia | `tests/layout.test.ts` › "el layout arma header/main/footer y la home tiene un h1 con secciones h2" + `tests/buscador-pagina.test.ts` › "no agrega ningún encabezado propio" |
| resultados de una búsqueda | `tests/buscador-pagina.test.ts` › "encabeza con Resultados para…" y "lista al negocio sembrado que coincide, con su tarjeta completa" |
| corregir la búsqueda sin regresar | `tests/buscador-pagina.test.ts` › "repite el buscador arriba con la consulta ya escrita" y "prellena el campo…" |
| orden determinista | `tests/busqueda-consultas.test.ts` › "ordena por publicación reciente y desempata por nombre" (incluye repetir la búsqueda) |
| la consulta se muestra como texto | `tests/buscador-pagina.test.ts` › "una consulta que parece marcado se muestra escapada"; `tests/buscador-adversarial.test.ts` › "el marcado y las comillas salen escapados" |
| búsqueda sin coincidencias | `tests/buscador-pagina.test.ts` › "dice que no encontró nada y ofrece las ocho categorías" |
| la búsqueda vacía de resultados no es un error | `tests/buscador-pagina.test.ts` › "es una página normal y conserva el buscador con lo escrito" |
| encuentra por palabras clave aunque la categoría sea otra | `tests/busqueda-consultas.test.ts` › "encuentra por las palabras clave de '¿Qué ofreces?'" |
| encuentra por nombre del negocio | `tests/busqueda-consultas.test.ts` › "encuentra por una palabra del nombre…" |
| encuentra por giro asignado por el admin | `tests/busqueda-consultas.test.ts` › "'comida' encuentra a la fonda por su giro, no por su texto"; extremo a extremo en `tests/buscador-pagina.test.ts` › "'comida' encuentra a la fonda por el giro que le puso el admin" |
| los negocios no publicados nunca aparecen | `tests/busqueda-consultas.test.ts` › "ni el en_revision ni el rechazado vuelven…"; `tests/buscador-pagina.test.ts` › "ni el en_revision ni el rechazado aparecen en el HTML"; `tests/buscador-adversarial.test.ts` › "la consulta %j no revela nada del negocio en revisión" (7 consultas × 5 datos sensibles, incluido `tokenGestion`) |
| negocio publicado sin giros | `tests/busqueda-consultas.test.ts` › "un publicado sin giros se sigue encontrando…" |
| mayúsculas y acentos dan igual | `tests/busqueda-consultas.test.ts` › "'PLOMERÍA', 'plomeria' y 'Plomería' devuelven lo mismo"; unitario en `tests/busqueda.test.ts` |
| "plomero" encuentra a "plomería" | `tests/busqueda-consultas.test.ts` › primer caso |
| "futbol" encuentra al club de "fútbol" | `tests/busqueda-consultas.test.ts` y `tests/buscador-pagina.test.ts` (este último contra el seed real) |
| varias palabras se exigen todas | `tests/busqueda-consultas.test.ts` › "con varias palabras solo vuelve el que coincide con todas" |
| la "ñ" no rompe la búsqueda | `tests/busqueda-consultas.test.ts` › "'pinatas' encuentra al de 'piñatas'" |
| consulta vacía o de puros espacios | `tests/buscador-pagina.test.ts` › tabla de 7 casos; `tests/busqueda-consultas.test.ts` › "la consulta %j devuelve lista vacía sin tocar la base" |
| consulta larguísima | `tests/buscador-pagina.test.ts` › "una cadena de miles de caracteres no se repite entera…"; `tests/buscador-adversarial.test.ts` › "una cadena de 100 000 caracteres no vuelve entera al HTML" |
| caracteres que en una búsqueda serían comodines | `tests/buscador-adversarial.test.ts` › "una consulta de puros comodines se trata como vacía" y "un comodín pegado a un término no amplía el resultado" |
| alfabetos y símbolos raros | `tests/buscador-pagina.test.ts` (emojis, cirílico) y `tests/buscador-adversarial.test.ts` (ideogramas, ancho completo, byte nulo, controles) |
| consulta repetida en la URL | `tests/buscador-pagina.test.ts` › "con el parámetro repetido usa el primer valor"; `tests/buscador-adversarial.test.ts` › "con q repetido se usa el primer valor" y "un arreglo vacío o de valores raros no truena" |
| metadata de la página de resultados | `tests/buscador-pagina.test.ts` › "declara noindex, follow" |
| las páginas del directorio siguen indexables | `tests/buscador-pagina.test.ts` › "ninguna otra página del sitio quedó marcada como no indexable" |

### `modelo-datos`

| Scenario | Verificación |
| --- | --- |
| alta con acentos y mayúsculas | `tests/busqueda-datos.test.ts` › "guarda el nombre y el '¿Qué ofreces?' normalizados" |
| negocio sin "¿Qué ofreces?" | `tests/busqueda-datos.test.ts` › "un alta sin '¿Qué ofreces?' queda con cadena vacía, no nula" + unitario de `datosDeBusqueda` |
| las fichas que ya existían quedan encontrables | `tests/busqueda-datos.test.ts` › "llena las columnas en blanco de las filas previas" |
| el relleno se puede repetir | `tests/busqueda-datos.test.ts` › "correrlo dos veces no cambia nada ni toca otros campos" (compara la tabla entera antes/después) |
| valores consistentes con su origen | `tests/busqueda-datos.test.ts` › "toda la base cumple que lo guardado es datosDeBusqueda de sus fuentes" + el caso negativo |
| sembrar negocios de demostración | `tests/seed-demo.test.ts` (preexistente, sigue verde) |
| fixtures para la búsqueda por giro | `tests/busqueda-datos.test.ts` › "al menos un publicado tiene giros y uno de ellos no está en su texto" |
| fixtures con acentos | `tests/busqueda-datos.test.ts` › "cada negocio sembrado queda con sus columnas normalizadas escritas" |
| el seed de catálogos no crea negocios | `tests/seed-demo.test.ts` (preexistente) |
| seed de demostración idempotente | `tests/seed-demo.test.ts` + `tests/busqueda-datos.test.ts` › "correrlo dos veces no duplica negocios ni vínculos de giro" |
| datos ficticios y nada real / nunca contra producción | `tests/seed-demo.test.ts` y `tests/directorio-adversarial.test.ts` (preexistentes) |
| (schema) el cliente expone los dos campos | `tests/busqueda-datos.test.ts` › "el cliente de Prisma expone los dos campos y arrancan vacíos, no nulos"; la migración desde cero la aplica `tests/global-setup.ts` en cada corrida |

### `registro-negocio`

| Scenario | Verificación |
| --- | --- |
| registro con acentos, encontrable después | `tests/busqueda-datos.test.ts` › "guarda el nombre y el '¿Qué ofreces?' normalizados" (la mitad de "y después se encuentra" la cubre `tests/busqueda-consultas.test.ts`) |
| el cliente no puede fijar el texto de búsqueda | `tests/busqueda-datos.test.ts` › "ignora los campos extra que pretendan fijar el texto de búsqueda" |
| el formulario no cambia para el dueño | `tests/registro-pagina.test.ts` (preexistente): no se tocó ningún campo visible; `leerEnvioRegistro` sigue leyendo exactamente los mismos 11 campos |

### `layout-base`

| Scenario | Verificación |
| --- | --- |
| enlace interno a una ruta inexistente | `tests/layout.test.ts` › "señala un enlace inventado…" (preexistente) |
| enlaces a rutas dinámicas | `tests/layout.test.ts` › "la home, el listado…, la ficha y la 404 solo enlazan a lo que existe" (ahora incluye `/buscar` con y sin consulta) |
| destino del formulario de búsqueda | `tests/layout.test.ts` › "el buscador de la home y el de resultados envían a una ruta que existe" + "señala un formulario que envía a una ruta que no existe" |
| enlaces externos protegidos / enlace de llamada | `tests/layout.test.ts` (preexistentes) |

## Decisiones técnicas

1. **La migración se escribió a mano.** `prisma migrate dev` generó para SQLite el patrón de *redefinición de tabla* (crear `new_Negocio`, copiar, `DROP`, renombrar), y eso **borraba los `CHECK` de `estado` y `origen`** que la migración inicial había puesto a mano (Prisma no los conoce porque no son expresables en el schema). Con esa migración, `tests/negocio.test.ts` y `tests/adversarial.test.ts` habrían dejado de proteger nada aunque siguieran verdes en una base vieja. Se reemplazó por dos `ALTER TABLE … ADD COLUMN … NOT NULL DEFAULT ''`, que dejan la tabla y sus constraints intactas; `prisma migrate status` no reporta drift y la base local se reconstruyó desde las migraciones para verificar que los `CHECK` siguen ahí. **Vale la pena revisarlo en el PR**: cualquier migración futura sobre `Negocio` va a tener el mismo problema.
2. **`quitarAcentos` vive en `src/lib/texto.ts`, no en `slug.ts` ni en `busqueda.ts`.** Si viviera en `slug.ts`, el buscador dependería del módulo de URLs; al revés, los slugs dependerían del buscador. Los imports son relativos (`./texto`) porque `prisma/seed.ts` y los scripts de `prisma/` cargan esos módulos con `tsx`, fuera del resolvedor de alias de Next.
3. **La consulta se recorta antes de normalizarse.** `terminosDeBusqueda` hace `slice(0, 60)` antes del `normalize("NFD")`: una consulta de 100 000 caracteres no paga el costo de normalizarse entera. Probado con 100 000 caracteres y con 50 000 emojis.
4. **La página ya no le devuelve al vecino la cadena completa que mandó.** La etapa A recortaba a 80 caracteres el `h1` pero prellenaba el campo con la consulta cruda, así que `?q=<5 000 caracteres>` volvía íntegra dentro del `value` del `input` — la misma amplificación que el hallazgo MEDIO 3 de T-003. Ahora `recortarConsulta` devuelve dos versiones: la del título (con "…") y la del campo (recortada, sin "…", para que al corregir no se cuele el carácter). No se pierde nada buscable: la búsqueda solo mira los primeros 60 caracteres.
5. **La grilla de categorías de la home se unificó con `CategoriasGrid`.** La etapa A la dejó duplicada (home inline + componente para `/buscar`) para no tocar un test que buscaba `min-h-16` en el fuente de la home. Pero la spec exige que los botones de `/buscar` sean "iguales a los de la home", y con dos copias eso es disciplina, no propiedad del código. Se unificó y se movió esa aserción al fuente de `categorias-grid.tsx`.
6. **Los giros del seed se fijan con `set` al actualizar y `connect` al crear.** `set` no existe en el input de `create` de Prisma; sobre una fila nueva `connect` es equivalente. Así el seed es idempotente también en los vínculos de giro y no deja giros viejos colgando si mañana cambia la lista.
7. **Fixtures de búsqueda propias, no el seed de demostración**, en `tests/busqueda-consultas.test.ts` y `tests/buscador-adversarial.test.ts`: fechas de publicación controladas (incluido un empate) y un negocio en revisión con datos sensibles. El seed sí se usa en `tests/buscador-pagina.test.ts` y `tests/busqueda-datos.test.ts`, que son justamente donde importa que la búsqueda funcione contra lo que ve un dev al arrancar el proyecto. Series de WhatsApp reservadas por archivo: `7719993xxx` (adversarial) y `7719998xxx` (consultas), borradas en el `afterAll`.
8. **Ningún cambio de dependencias.** Nada nuevo en `package.json` salvo el script `db:backfill:busqueda`.

## Tests preexistentes tocados (y por qué)

- `tests/directorio-paginas.test.ts` › *"no hay buscador ni ningún otro control sin destino"* → renombrado a **"todo control de la home lleva a algo: el único formulario va a /buscar"**. Es la cláusula que el delta de `directorio-publico` deroga explícitamente. La versión nueva es más fuerte que un `not.toMatch(/<form/)`: exige que haya exactamente un formulario, con `action="/buscar"` y `method="get"`, un solo `input` (`name="q"`), un solo `button` de tipo `submit`, y ningún `select`/`textarea`.
- `tests/directorio-adversarial.test.ts` › *"ninguna página del directorio necesita un control con JavaScript"* → ya no prohíbe `<form>`; ahora exige que no haya manejadores de eventos, que todo formulario tenga `action` interno y `method`, y que **fuera** de los formularios no quede ningún control. Es lo que el scenario "navegación sin JavaScript" quiere decir de verdad.
- `tests/directorio-paginas.test.ts` › *"todo lo tocable del directorio reserva al menos 44px"* → lee `categorias-grid.tsx` (donde vive ahora `min-h-16`) y además `buscador.tsx` (`min-h-11` del campo).
- `tests/layout.test.ts` → ver el mapa de scenarios; el barrido de literales del código ahora cubre `href` **y** `action`.

## Deuda y propuestas (fuera de alcance de este change)

1. **Revisión visual real a 390/768/1280 px (tasks #17).** Nadie ha abierto un navegador todavía. Es el único punto del change que no está verificado como manda la spec.
2. **Índice de base para las columnas normalizadas.** Hoy la búsqueda es un `LIKE '%raiz%'` sobre `Negocio`: con decenas de fichas es instantáneo, y un índice B-tree no serviría para un `contains` de todos modos. Cuando el volumen lo pida (o cuando se decida la base de producción, E0-3/ADR-001), toca reevaluar FTS5 o `pg_trgm`. Anotado también en `design.md` §2.
3. **Ningún camino de escritura que no sea el registro mantiene las columnas.** El panel del admin (T-005) va a editar giros y publicar; si algún día edita `nombre` o `queOfreces` (E8), **tiene que** usar `datosDeBusqueda`. La red es el test de consistencia de `tests/busqueda-datos.test.ts` — vale la pena que T-005 la conserve y la extienda a sus propias fixtures.
4. **`openspec/specs/layout-base/spec.md` líneas 80-82** siguen con el encabezado huérfano que ya reportaba `proposal.md`. No se tocó aquí; sigue pendiente para el próximo archivado o un chore.
5. **Analítica de términos sin resultados (E7).** Hoy el estado "no encontramos nada" no deja rastro. Es exactamente la señal que el PRD §9 quiere para la siembra, pero tiene su propio ticket y su propia decisión de privacidad.
7. **(iteración 2) Flooding de `/buscar` — hallazgo M-4 de la etapa C.** Sin spec ni ticket, no se implementa aquí. Propuesta para backlog: cupo por IP reutilizando `src/lib/registro/limite-ip.ts`, o `Cache-Control` para consultas repetidas. Conviene antes de la siembra del PRD §9.
8. **(iteración 2) `id` literal en el buscador — hallazgo B-2.** Se vuelve un problema el día que haya dos buscadores en la misma página (el del header, fuera de alcance según `proposal.md`). Arreglo: `useId` o un prop `idCampo`.
9. **(iteración 3) `tests/registro-adversarial.test.ts` es binario para git** (`U+200E`, `U+200B`, `U+200F`, `U+202E` literales, de T-003). Mismo problema que B-3, pero fuera del diff de este change: chore de una línea, con el script de escapado ya probado aquí.
10. **(iteración 3) Adjetivos, complementos y colonia en la consulta** ("plomero barato", "doctor 24 horas", "cerrajeria en Huicalco"): conforme a la spec devuelven cero. Ver "Deuda de PRODUCTO" al final de la iteración 3 — decisión de producto, no defecto.
6. **Propuesta menor de UI:** con la raíz de 5, "veterinario" trae "Liga de Veteranos". Está documentado y aceptado en `design.md` §2, y hay un test que lo fija (`"la raíz de 5 confunde palabras parecidas"`) para que se vea qué se rompe el día que alguien cambie la regla. Si en el uso real molesta, el arreglo es ranking o sinónimos — otro ticket.

---

# Iteración 2 — respuesta a la etapa C

Corrección de **M-1, M-2, M-3 y B-1** de `reports/c-seguridad.md`. **M-4 no se toca**: no tiene spec ni ticket, va a backlog tal como lo pidió la etapa C.

**Gates en el worktree:** `npm run lint` ✅ · `npm run build` ✅ · `npm test` ✅ **642 pruebas, 22 archivos, 0 fallas** (620 al cerrar la etapa C). Los **3 tests marcados `HALLAZGO M-n (pin)` quedaron invertidos**, no borrados: cada uno afirma ahora el comportamiento corregido y conserva las garantías que ya sostenía. La suite adversarial de la etapa C sigue teniendo 59 pruebas en verde. No toqué git.

## M-2 · El tope de 60 se aplica al texto ya normalizado

`src/lib/busqueda.ts` › `terminosDeBusqueda`. Era `normalizarTexto(cruda.slice(0, 60))`; ahora es `normalizarTexto(cruda).slice(0, 60)`. El relleno (espacios, puntuación, emojis, otro alfabeto, comodines) desaparece **antes** de gastar la cuota, así que `"   …cerrajero"` busca "cerrajero" en vez de contestar "¿Qué estás buscando?".

Se cayó el recorte previo de la cadena cruda —la decisión 3 del reporte original— porque es incompatible con el arreglo: cualquier cota sobre la cadena sin normalizar reintroduce el mismo defecto con un relleno más largo. Lo medí antes de quitarlo: normalizar la consulta entera cuesta **0.36 ms con 200 000 caracteres y 1.6 ms con un millón** (20 iteraciones, este equipo), y en la práctica el largo ya está acotado antes por el límite de la línea de petición HTTP. Lo que sigue acotado —que es lo que importa— es lo que llega a la base: como mucho 4 raíces de 5 caracteres `[a-z0-9]`, cosa que la etapa C ya verifica inspeccionando los argumentos reales de Prisma. El costo por request que quedaba señalado en M-4 no cambia de orden.

- Pin invertido: `"un relleno hostil al principio ya no se come la consulta"` (5 rellenos, incluidos cirílico y `%_`), más `"la cota sigue viva: el relleno no deja pasar más términos de la cuenta"`, que fija que el arreglo no volvió ilimitada la consulta.
- Unitario nuevo en `tests/busqueda.test.ts`: `"el relleno no alfanumérico del principio no se come la consulta"` (6 rellenos).

## M-3 · Muletillas: se descartan antes del tope de 4 términos

`src/lib/busqueda.ts`. **Mecanismo elegido: una lista corta de muletillas** —las palabras con las que el vecino *enuncia la pregunta*, no las que describen el negocio— que se descartan **antes** del tope de 4 y del `AND`. `terminosDeBusqueda("quien me arregla la cerrajeria")` pasa de `["quien","me","arreg","la"]` (cero resultados) a `["cerra"]`.

Por qué este mecanismo y no los otros que sugería la etapa C: **ninguna de las alternativas resolvía el caso**. Ordenar por longitud antes del `slice` deja `["cerrajeria","arregla"]` y el `AND` sigue exigiendo "arregla", que el cerrajero no escribió → cero. Subir el mínimo de término a 3 saca "me" y "la" pero deja "quien" y "arregla" → cero. El problema no es la cuota, es que se exigen palabras que no describen a ningún negocio.

Fidelidad a la spec: el requirement dice que se exigen todas *las palabras del vecino*, y su scenario es "futbol infantil" — dos palabras con contenido, que **se siguen exigiendo las dos** (hay test). Lo que se descarta es el enunciado de la pregunta. La lista incluye a propósito los verbos genéricos ("arregla", "repara", "vende", "hace"): describen la pregunta, no al negocio, y quien busca "quien repara lavadoras" quiere lavadoras. Dos propiedades que hacen esto seguro:

- **Quitar una muletilla solo puede devolver MÁS, nunca menos**: se deja de exigir una condición. En un directorio de barrio ese es el lado bueno del error, y es coherente con `design.md` §2, que ya asume falsos positivos y no hace ranking.
- **Si al quitarlas no queda nada, se usan tal cual**: `"quien me la hace"` se busca literal y el vecino ve "no encontramos", no "¿qué estás buscando?" — que sería mentira, porque sí escribió algo.

- Pins invertidos/añadidos: `"una frase natural del vecino encuentra lo mismo que la palabra sola"`, `"las palabras con contenido sí se siguen exigiendo todas"`, `"una consulta de puras muletillas se busca tal cual, no se vacía"`.
- Unitarios nuevos en `tests/busqueda.test.ts`: 3 casos (descarte, contenido exigido, todo-muletillas).

## M-1 · El eco de `?q` se sanea y se corta por puntos de código

`src/app/buscar/page.tsx` › `recortarConsulta`. Antes de recortar, los controles (`\p{Cc}`, incluido el byte NUL) y el formato (`\p{Cf}`, donde viven RLO/LRO/ZWSP/BOM) se sustituyen **por un espacio** —no se borran, para no pegar palabras que el vecino escribió separadas— y los espacios se colapsan. El recorte de 80 pasó de `slice` sobre unidades UTF-16 a `[...texto].slice(80).join("")`, que nunca parte una pareja suplente.

Verificado contra el servidor de verdad (`next dev -p 3100`), no solo en `renderToStaticMarkup`, con la misma consulta que usó la etapa C:

```
/buscar?q=plomero%00%E2%80%AEzz   → HTTP 200
h1:     "Resultados para &quot;plomero zz&quot;"   (sin 0x00, sin U+202E)
value:  "plomero zz"
```

**Residuo que conviene que la etapa C conozca:** el `U+202E` sigue apareciendo **una vez** en la respuesta, dentro del payload RSC que Next inlina en un `<script>` (`__PAGE__?{"q":"plomero ‮zz"}`), porque ahí se serializan los `searchParams` crudos del framework. El NUL **sí** desaparece por completo del cuerpo (el serializador lo escapa como ` `, así que no queda byte crudo), que era el punto de las respuestas no conformes. Y el RLO que queda es una cadena JSON dentro de un script: no es texto renderizado, no hay spoofing visual ni salida de atributo. No está en el alcance de `recortarConsulta` — lo controla Next, no la página.

- Pins invertidos: `"los caracteres de control y las marcas bidi no vuelven en el eco"` y `"el recorte de 80 no parte una pareja suplente"` (con la comprobación en las dos direcciones: ni alta ni baja suelta).
- Nuevo `it.each` de 7 invisibles (NUL, RLO, LRO, ZWSP, ZWJ, BOM, `\r\n\t`), cada uno verificado sobre el `h1` y el `value`.

## B-1 · Guarda de entorno en el script de relleno

- `prisma/guardas-entorno.ts` (nuevo): `esEntornoDeProduccion`, `apuntaABaseLocal` y `normalizarValorDeEntorno`, extraídos de `seed-demo.ts`, que ahora los importa y los reexporta (ningún test los importaba directo, nada se rompe). Los dos scripts comparten **cómo se reconoce un entorno peligroso**; la política sigue siendo de cada uno.
- `prisma/backfill-busqueda.ts`: `motivoParaNoRellenar(env)` + `VARIABLE_PERMISO_BACKFILL` (`BACKFILL_PERMITIR`). `rellenarTextoDeBusqueda` recibe el entorno, devuelve `rellenado: false` sin tocar la base cuando la guarda aplica, y la ejecución directa sale con código 1.

**Diferencia deliberada con el seed, que hay que revisar en el PR:** en el seed, el permiso explícito **no** abre la puerta de producción (sembrar datos de mentira ahí no tiene ningún caso de uso legítimo). En el relleno **sí** la abre, porque correrlo en producción *es* el caso de uso: es lo que deja encontrables las fichas que ya existían cuando se aplicó la migración. Bloquearlo sin escape habría convertido una guarda en una trampa operativa. La guarda está para que nadie lo corra por accidente contra la base equivocada, no para prohibirlo.

- Tests nuevos en `tests/busqueda-datos.test.ts` › `"guarda de entorno del relleno (B-1)"`: 6 entornos peligrosos que no escriben nada (se compara la tabla entera antes/después), el caso local que sí corre, y el permiso explícito que sí abre producción.

## Lo que NO se tocó

- **M-4 (flooding de `/buscar`)**: sin spec ni ticket. Se queda como deuda 7 de este reporte para backlog: cupo por IP reutilizando `src/lib/registro/limite-ip.ts`, o `Cache-Control` para consultas repetidas. Nota: el arreglo de M-2 no lo empeora en órdenes de magnitud (0.36 ms de normalización con 200 000 caracteres, medido), pero sí es un argumento más para atenderlo antes de la siembra del PRD §9.
- **B-2 (`id` literal en el buscador)**: la etapa C lo marca como accesibilidad para el día que el buscador entre al header, que `proposal.md` deja explícitamente fuera de este change. Se resuelve con `useId` o un prop `idCampo` cuando ese ticket exista.
- **Relleno sin transacción** (nota menor dentro de B-1): sigue igual. Es idempotente y se puede repetir, que es la mitigación que la propia etapa C reconoce; envolverlo en una transacción sobre una tabla completa tiene su propio costo y no hay spec que lo pida.

---

# Iteración 3 — dos correcciones chicas antes del validador

**Gates:** `npm run lint` ✅ · `npm run build` ✅ · `npm test` ✅ **665 pruebas, 22 archivos, 0 fallas**.

## B-3 · Tests legibles en el diff del PR

`tests/buscador-adversarial.test.ts` (4 caracteres) y `tests/busqueda.test.ts` (2) tenían bytes de control **literales** dentro de literales de cadena —`U+0000`, `U+0001`-`U+0003`, `U+001B`—, y con eso git marcaba los archivos como binarios: el revisor humano del PR no habría podido leerlos. Se convirtieron a secuencias de escape (`"plomero "`, `""`, `" \t\n"`). **Cero cambio de comportamiento**: dentro de un literal de TypeScript son exactamente los mismos bytes, y las 6 sustituciones las hizo un script por punto de código, no a mano. Verificado después: `git diff --numstat` ya cuenta líneas para los dos archivos, y ningún archivo de este change (`tests/`, `src/lib/`, `src/app/buscar/`, `prisma/`) tiene invisibles crudos.

**Preexistente, no tocado:** `tests/registro-adversarial.test.ts` (de T-003) tiene `U+200E`, `U+200B`, `U+200F` y `U+202E` literales y por lo tanto el mismo problema. No está en el diff de este change, así que no lo modifiqué; queda como chore de una línea para quien quiera hacerlo (deuda 9).

## Residuo de M-3 · "tizayuca" es muletilla

`src/lib/busqueda.ts`. El sitio entero es de Tizayuca: la palabra no discrimina ningún negocio, pero exigirla con `AND` dejaba en cero `"cerrajeria en Tizayuca"` —que es justo como escribe quien llega de una búsqueda de Google—. Ahora es una muletilla más, con las mismas dos propiedades del resto: quitarla solo puede devolver más, y buscar **solo** `"tizayuca"` no se vacía (queda `["tizay"]`, se responde una página normal de resultados).

- `tests/busqueda.test.ts`: `'"tizayuca" no discrimina: es una muletilla más'` (4 formas de escribirla, incluida "tizayuca centro", donde "centro" sí se sigue exigiendo) y `'una consulta que es solo "tizayuca" no truena ni se vacía'`.
- `tests/buscador-seguridad-adversarial.test.ts`: `'"cerrajeria en Tizayuca" encuentra lo mismo que "cerrajeria"'` y `'buscar solo "tizayuca" responde una página normal, sin tronar'` (que además comprueba que no se cuela ninguna ficha sin publicar).
- El pin `RESIDUO M-3` de la etapa C se **actualizó, no se borró**: perdió el caso del municipio (ya corregido, con su test propio arriba) y conserva los otros tres, con la nota de qué se corrigió y por qué el resto se queda.

## Deuda de PRODUCTO que se deja a propósito (residuo de M-3)

`"plomero barato"`, `"doctor 24 horas"`, `"cerrajeria en Huicalco"` y demás siguen devolviendo cero cuando el negocio no escribió el adjetivo, el complemento o la colonia. **Es el comportamiento que manda la spec** —requirement "Coincidencia insensible…": "DEBEN encontrarse solo los negocios que coinciden con todas", y la duda 3 de `proposal.md` aprobó explícitamente "exigir todas"—, así que no se toca aquí. Pero es contraintuitivo para el vecino del Flujo B y vale la pena decidirlo como producto, no como bug:

- **"barato", "24 horas", "a domicilio"**: son criterios, no palabras del negocio. Un `AND` sobre ellos siempre va a fallar. La salida honesta es sacarlos del texto y volverlos filtros (o dejarlos como muletillas, con el mismo argumento que "tizayuca": no discriminan porque casi ningún negocio los escribe).
- **"en Huicalco"**: la colonia sí es un dato del negocio, pero es una **relación**, no texto buscable; el change dejó la búsqueda por colonia fuera de alcance a propósito (`proposal.md`, "Fuera de este change"). Es el candidato más claro a ticket propio, y encaja con las páginas de giro+colonia de E5-1.
- Mitigación que ya está puesta y no depende de esto: la búsqueda sin resultados no es un error y ofrece las 8 categorías como salida.

Mientras tanto, la analítica de términos sin resultados (deuda 5, E7) es exactamente lo que diría cuál de los tres duele de verdad antes de gastar un ticket en adivinarlo.
