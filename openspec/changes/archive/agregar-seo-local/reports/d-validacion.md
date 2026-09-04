# Etapa D (validación) — agregar-seo-local

**Ticket:** `docs/tickets/T-009-seo-local.md` · **Rama:** `feature/agregar-seo-local` (worktree `.claude/worktrees/wt-seo`)
**Entrada:** spec aprobada (61 scenarios en 3 deltas), `reports/b-dev.md` (con iteración 2), `reports/c-seguridad.md` (con §6 de re-verificación) y el árbol sin commitear.

## Veredicto: **APROBADO**

0 hallazgos bloqueantes. Los reportes previos no se dieron por buenos: cada afirmación central se re-verificó por mi cuenta contra un servidor real y contra dos builds desde cero. 1 corrección editorial aplicada por mí, 1 recomendación de la etapa C **declinada con evidencia medida**, y 5 notas trasladadas al PR.

## 1. Compuertas mecánicas (ejecutadas por mí)

| Gate | Resultado |
| --- | --- |
| `npm run lint` | Limpio, sin errores ni warnings |
| `npx tsc --noEmit` | Sin errores |
| `npm test` | **1 225 pruebas en 43 archivos, todas en verde** (12.3 s) |
| `npm run build` **sin** `SITIO_URL` | ✓ tras `rm -rf .next`; `grep -rl localhost .next/server/app/` → **sin resultados**; `_not-found.html` **sin** `og:image`; sin el aviso `metadataBase` de Next |
| `npm run build` **con** `SITIO_URL` | ✓ tras `rm -rf .next`; sin `localhost`; `_not-found.html` → `og:image` a `https://necesitouno.example/opengraph-image` |

Todo se volvió a correr **después** de mi corrección editorial: lint, `tsc` y las 1 225 pruebas siguen en verde.

Sin dependencias nuevas: `package.json` y `package-lock.json` no están en el diff. Sin migraciones: `prisma/schema.prisma` intacto.

## 2. Lo que verifiqué por mi cuenta sobre servidor real (`next start`)

No por muestreo donde el encargo pedía exhaustividad.

**Las 8 URLs de categoría, una por una** (el renombrado a `[destino]` no podía romper nada publicado). Las 8 → **200**, con su `h1` correcto, título propio con la plantilla `— NecesitoUno`, canónica absoluta y **sin** `robots`:

`/restaurantes-y-fondas` · `/servicios-del-hogar` · `/belleza` · `/salud` · `/abarrotes-y-comercio` · `/talleres` · `/clubes-y-escuelas-deportivas` · `/otro`

**Páginas nuevas y 404:**

| URL | Resultado |
| --- | --- |
| `/plomeria` | 200, `h1` "Plomería en Tizayuca", un solo `<h1>`, sin `noindex` |
| `/plomeria-huicalco` | 200, "Plomería en Huicalco, Tizayuca", sin `noindex` |
| `/futbol` | 200, **"Clases de futbol en Tizayuca"** (E4-3 aterrizado) |
| `/plomeria-haciendas-de-tizayuca` | 200, **"Plomería en Haciendas de Tizayuca"** — sin el segundo "Tizayuca" (duda 1) |
| `/box`, `/box-huicalco` | 200 + `noindex, follow` + literales exactos + "Ver todas las colonias" |
| `/plomeros-baratos`, `/plomeria-colonia-inventada`, `/loquesea-huicalco`, `/plomeria-huicalco-otra-cosa`, `/Plomeria` | **404** |

`/plomeria` enlaza **solo** `/plomeria-huicalco` (la única colonia con contenido): lo vacío no se enlaza.

**JSON-LD** de una ficha publicada con dirección, fijo y horario capturados: bloque válido con `name`, `url` canónica, `description`, `address` (`streetAddress: "Col. Huicalco"`, Tizayuca/Hidalgo/MX) y `knowsAbout`. **Ausentes, comprobados uno por uno:** el WhatsApp, el fijo, el texto de dirección ("Morelos"), el horario ("L-S 9am"), `telephone`, `openingHours`, `geo`. Una ficha sin giros no pinta ninguna sección vacía y su `knowsAbout` trae solo la categoría.

**Sitemap** (28 URLs): home, `/registro`, las 8 categorías, 4 giros y 4 pares **con contenido**, 10 fichas publicadas con `lastmod`. Sin `/admin`, `/buscar`, `/registro/gracias` ni combinaciones vacías. **Prueba viva de lo no publicado:** le asigné el giro "Plomería" al negocio `en_revision` directamente en la base — no apareció ni en `/plomeria` ni en el sitemap; revertido. Las fichas de los dos no publicados → 404 sin filtrar el nombre.

**`SITIO_URL` fail-visible** (build y servidor en producción **sin** la variable): `sitemap.xml` responde un documento válido y vacío, `robots.txt` **omite** la línea `Sitemap:`, `/plomeria` sale sin canónica y sin `og:image`, y **cero** `localhost` en la respuesta. Con la variable: canónicas y `og:image` absolutas.

**Otros:** `/servicios-del-hogar?colonia=huicalco` canoniza a `/servicios-del-hogar`; `/buscar` conserva su `noindex, follow`; `/opengraph-image` → 200 `image/png` 38 KB.

## 3. Spec, ticket y alcance

- **Spec (61 scenarios, 3 deltas):** recorrí el mapa scenario→prueba de `b-dev.md` contra el código y contra el servidor. Ninguno sin cobertura. Los "manuales" son los que este entorno no puede automatizar (no hay navegador) y quedan como pendiente humano explícito.
- **Ticket:** los 8 criterios de aceptación se cumplen (detalle en el cuerpo del PR).
- **Alcance:** nada en el diff que la spec no pida. Los archivos que no salen literalmente de una tarea —`saneo.ts`, `colores-marca.ts`, `lista-negocios.tsx`, `listado-categoria.tsx`— o implementan un requirement al pie ("La descripción NO DEBE incluir el WhatsApp ni el teléfono") o son extracción de marcado existente para el reuso que la spec exige ("la misma tarjeta y el mismo orden"). Sin scope creep.
- **`tasks.md`:** las 25 en `[x]`, con sus correcciones de plan anotadas; verifiqué por muestreo (3, 5, 7, 13, 17, 24) que lo anotado corresponde al código.
- **Convenciones:** UI en español mexicano; cero `"use client"` nuevo (los dos del repo son de registro, previos); cero `any` fuera de `src/generated/`; hexadecimales solo en `globals.css` y en `colores-marca.ts`, que existe porque `next/og` no puede usar Tailwind y tiene prueba que lo ata a los tokens.
- **Seguridad / LFPDPPP:** 0 críticos, 0 altos. Sin secretos; `.env` ignorado y fuera del diff. Todos los números de los fixtures son de las series ficticias (`771000…`, `771777…`, `771999…`) y los nombres se leen como inventados.

## 4. Corrección editorial aplicada por mí

**R3 · `Object.freeze` en los catálogos memoizados** (`src/lib/directorio.ts`). La memoria entrega la misma referencia a todas las peticiones del proceso; un `catalogos.giros.sort(...)` futuro dentro de una página habría corrompido el catálogo de todas las peticiones siguientes. Congelados los tres arreglos y el tipo `CatalogosDeLaRaiz` pasa a `readonly`. Verifiqué que el único consumidor de producción (`src/lib/seo/destino.ts`) solo hace `.find`. `tsc`, lint y las 1 225 pruebas en verde después del cambio.

## 5. Recomendación de la etapa C **declinada**, con la medición

**`normalize("NFKC")` + retiro de `\p{Cf}` antes del saneo de dígitos (R1).** No la apliqué, y no por prudencia genérica: la medí y la justificación del reporte es **incorrecta en un punto**.

`c-seguridad.md` §6 afirma que cierra "ancho completo, arábigo-índicos y ancho cero de una vez". Medido:

| Caso | Con NFKC + `\p{Cf}` |
| --- | --- |
| `７７１９９９８８７７` (ancho completo) | se oculta ✅ |
| `٧٧١٩٩٩٨٨٧٧` (arábigo-índicos) | **sigue pasando entera** ❌ |
| dígitos con ancho cero | se oculta ✅ |

Los dígitos arábigo-índicos no tienen descomposición de compatibilidad a ASCII, así que NFKC no los toca. Y el costo no es nulo: NFKC **reescribe el texto que el negocio escribió** en el snippet de Google — `"Pizzas de 30 cm ½ orden"` → `"1⁄2 orden"`, `"Café ﬁno"` → `"Café fino"`, `"Niños²"` → `"Niños2"`. Ese último caso es el que decide: NFKC convierte superíndices en dígitos planos, o sea que **puede fabricar la secuencia de dígitos que luego oculta**.

Hacerlo bien es normalizar **solo para detectar** y emitir el original — un rediseño de la función con pruebas propias, no una corrección editorial de dos líneas en la compuerta final. Queda anotado como deuda, con el modelo de amenaza de la etapa C intacto: las formas que sobreviven exigen que el negocio ofusque a propósito **su propio** número, que ya está a un toque en el botón de WhatsApp de su ficha.

## 6. Notas trasladadas al PR (ninguna bloquea)

1. **M3 (`fotoUrl` sin lista blanca de dominio)** — abierto por decisión de merge, delegado a **T-008**. Sin explotación viva. Dos consumidores lo dan por bueno: `imagenesDeLaFicha` y `imagenAbsoluta`.
2. **E5-5** — `robots.txt` es una petición, no una defensa; el límite de lectura por IP sigue siendo deuda de E5-5/E0-3, y el sitemap le entrega a cualquiera el índice de fichas publicadas (es su propósito).
3. **`SITIO_URL` como variable de despliegue**, también en el entorno de **build** (deuda #3 del dev).
4. **Páginas legales de T-007** en el sitemap: una línea tras su merge (duda 3).
5. **Revisión visual a 390/768/1280 px** — pendiente humano; en este entorno no hay navegador.

## 7. Recordatorio

El **CI de GitHub Actions debe quedar en verde en el PR**: mi validación local no lo sustituye. El **merge lo hace un humano**, y conviene **coordinarlo con el PR de la foto (T-008)**: las dos ramas tocan la ficha y comparten `fotoUrl`.

## 8. Integración con `main` (T-007 mergeó durante esta corrida)

Al ir a abrir el PR encontré que **`main` ya no era la base de la rama**: T-007 (páginas legales) se mergeó como PR #9 y la rama estaba 4 commits atrás. Fusioné `main` en la rama antes de abrir el PR —el mismo patrón que usó el buscador (`2e9202f`)— para que el CI no corriera contra una integración que nadie había probado. Valió la pena: **la fusión rompió 2 pruebas.**

### Conflictos (2, ambos resueltos conservando las dos partes)

- `docs/metricas-pipeline.md` — las dos filas nuevas, legales primero.
- `tests/layout.test.ts` — un comentario y un bloque de aserciones donde las dos ramas agregaron cosas distintas al mismo `it`. Se conservaron **todas**: las páginas nuevas de giro y las dos legales.

### Hallazgo de integración: el guardián de privacidad de T-007 atrapó a T-009

`tests/legales-adversarial.test.ts` — *"la proyección pública no crece a espaldas del aviso"* y *"todo campo que la ficha pública devuelve está declarado en el aviso"*:

```
AssertionError: campo público sin declarar en el aviso de privacidad: categoriaNombre
```

T-009 suma `categoriaNombre` a `NegocioFicha` (lo necesita el `knowsAbout` del JSON-LD) y T-007 estrenó un guardián que exige que **todo** campo de la proyección pública esté declarado en el aviso. Funcionó exactamente como debía.

**Verifiqué si era un hueco real de privacidad, y no lo es:** el aviso ya declara la categoría como pública, en la enumeración de "Qué queda público y qué no" (`src/lib/legales/textos.ts:199`): *"cualquier persona con internet puede verla: el nombre de tu negocio, **la categoría**, tu colonia, …"*. Lo que faltaba era declararla en el **mapa del guardián**, que es justo lo que el guardián existe para exigir.

Corrección aplicada: `categoriaNombre: "la categoría"` en `CAMPO_PUBLICO_DECLARADO`, con el motivo escrito. **No se tocó el texto legal**, no se debilitó el guardián (sigue exigiendo que la frase aparezca en el aviso renderizado) y **no se metió el campo a la lista de excepciones** `CAMPOS_PUBLICOS_SIN_DECLARAR`, que era el atajo tentador y equivocado.

### Gates sobre el árbol ya fusionado

| Gate | Resultado |
| --- | --- |
| `npx tsc --noEmit` | Sin errores |
| `npm run lint` | Limpio |
| `npm test` | **1 296 pruebas en 47 archivos, todas en verde** |
| `npm run build` (con `SITIO_URL`) | ✓, con `/aviso-de-privacidad` y `/terminos` en el árbol de rutas |

**Re-verificación en vivo del resultado fusionado**, porque las dos rutas legales son segmentos estáticos nuevos en la raíz y este change estrenó el segmento dinámico que comparte ese nivel: `/aviso-de-privacidad` y `/terminos` responden **200 con su propio `h1`** —los estáticos le ganan al dinámico, como predice `design.md` §1—, las 8 categorías siguen en 200, y `/plomeria`, `/plomeria-huicalco` y `/futbol` en 200 con `/plomeros-baratos` en 404.

### Lo que NO hice, a propósito

**No agregué las páginas legales al sitemap**, aunque T-007 ya mergeó y la deuda #1 del dev decía "se suman con una línea cuando T-007 mergee". El requirement de `layout-base` enumera taxativamente qué incluye el sitemap y las legales no están; agregarlas aquí sería exactamente el scope creep que esta etapa rechaza en otros. Queda como seguimiento accionable **ya desbloqueado** en el PR.
