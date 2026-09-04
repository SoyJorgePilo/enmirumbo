# Reporte UI — `agregar-buscador`

Capa de interfaz del buscador (T-006), con mocks. `npm run lint` y `npm run build` en verde. No toqué `tests/` ni hice commits.

## Archivos creados

- `src/components/directorio/buscador.tsx` — Server Component, sin directiva de cliente. Formulario GET a `/buscar`.
- `src/components/directorio/categorias-grid.tsx` — grilla de categorías extraída para reusarla en los estados de `/buscar` (sin encabezado propio). **No se usa en la home** (ver "Decisiones" más abajo): la home sigue con su marcado original para no romper un test preexistente que inspecciona su código fuente literal.
- `src/app/buscar/page.tsx` — página de resultados, con `noindex, follow`.
- `src/lib/mock/agregar-buscador.ts` — datos mock centralizados + función de búsqueda mock, ambas **claramente marcadas para reemplazo** (ver contrato abajo).

## Archivos modificados

- `src/app/page.tsx` — se agregó `<Buscador />` arriba de la sección "Busca por categoría"; nada más cambió (la grilla de categorías sigue inline, igual que antes).
- `openspec/changes/agregar-buscador/tasks.md` — marqué `[x]` las tareas 9, 10 y 14 (puramente UI, verificables ya); anoté con "**a-ui**" el avance parcial de 11, 12, 13, 17 y 18 sin marcarlas (dependen de que el dev conecte la búsqueda real / actualice tests).

## Contrato de datos para el dev

### `src/lib/mock/agregar-buscador.ts` (a borrar cuando conectes lo real)

```ts
// Firma IDÉNTICA a la que tendrá terminosDeBusqueda de src/lib/busqueda.ts (tasks.md #2):
function terminosDeBusquedaMock(consultaCruda: string): string[]

// Firma IDÉNTICA a la que tendrá buscarNegociosPublicados de src/lib/directorio.ts (design.md §4, tasks.md #8):
// async, devuelve NegocioListado[] (el mismo tipo que ya consume TarjetaNegocio).
async function buscarNegociosPublicadosMock(consultaCruda: string): Promise<NegocioListado[]>
```

En `src/app/buscar/page.tsx` el swap es **solo el import**:

```ts
// hoy:
import { buscarNegociosPublicadosMock, terminosDeBusquedaMock } from "@/lib/mock/agregar-buscador";
// mañana:
import { terminosDeBusqueda } from "@/lib/busqueda";
import { buscarNegociosPublicados } from "@/lib/directorio";
```

y renombrar las dos llamadas (`terminosDeBusquedaMock` → `terminosDeBusqueda`, `buscarNegociosPublicadosMock` → `buscarNegociosPublicados`). El resto de la página (los tres estados, los literales, `TarjetaNegocio`, `CategoriasGrid`) no debería necesitar cambios.

**Importante:** la normalización dentro del mock (NFD, raíz de 5, tope de 4 términos, 60 caracteres) es una reimplementación simplificada solo para que la demo se comporte parecido — **no** tiene la cobertura adversarial de tasks.md #2 (emojis, otros alfabetos, bytes nulos, etc.). No la reutilices; usa `src/lib/busqueda.ts` cuando exista.

Los negocios ficticios de ese archivo (`NEGOCIOS_BUSCABLES_MOCK`) cubren a propósito: acentos ("Plomería" con acento y "Plomeria" sin él), la "ñ" ("Piñatería"/"pinatas"), "fútbol" acentuado, y una fonda cuyo giro (`fonda-comida-corrida`) NO aparece ni en el nombre ni en "¿Qué ofreces?" — el mismo caso que pide `design.md` §3. WhatsApp en la franja `771999_6xxx_` (la de `prisma/seed-demo.ts` usa `_5xxx_`, para no chocar).

### `Buscador` (`src/components/directorio/buscador.tsx`)

```ts
type BuscadorProps = { valorInicial?: string }; // default ""
```

Formulario GET a `/buscar`, campo `name="q"`, sin heading propio. Botón con `CLASE_BOTON_SECUNDARIO` (neutro): el verde de acción queda reservado para "Registra tu negocio gratis" y el WhatsApp de cada tarjeta, como pide la spec de layout (PRD §11).

### `CategoriasGrid` (`src/components/directorio/categorias-grid.tsx`)

```ts
type CategoriasGridProps = { categorias: CategoriaCatalogo[] }; // de src/lib/directorio.ts
```

Sin heading propio. Hoy solo la usa `/buscar` (en sus dos estados sin negocios). La home sigue con su propia copia inline del mismo marcado (ver "Decisiones" abajo) — si en algún momento quieres unificarlas, es un cambio de una línea en `src/app/page.tsx`, pero entonces hay que actualizar a la vez el test que se menciona ahí.

### `/buscar` — los tres estados (todos Server Component, sin JS)

1. **Consulta vacía / sin términos buscables** (`terminos.length === 0`): `h1` "¿Qué estás buscando?" + aviso + `Buscador` vacío + `CategoriasGrid`. No se llama a la función de búsqueda (ni al mock ni, mañana, a la real).
2. **Sin resultados** (`terminos.length > 0` pero `resultados.length === 0`): `h1` `Resultados para "…"` + `Buscador` prellenado + aviso de "no encontramos" + `CategoriasGrid`.
3. **Con resultados**: `h1` + `Buscador` prellenado + `<ul>` de `TarjetaNegocio` (mismas props que en `/[categoria]`).

## Decisiones de UI sin respaldo explícito de la spec

- **No extraje la grilla de categorías de la home.** Mi primer intento sí la extraía a `CategoriasGrid` y la reusaba en la home, pero eso le quita a `src/app/page.tsx` la clase literal `min-h-16` que `tests/directorio-paginas.test.ts:546` busca por texto en el archivo fuente. Para no tocar `tests/` ni romper una suite verde sin necesidad, dejé la home con su marcado original (duplicado, no reusado) y solo usé el componente nuevo en `/buscar`. Es deuda menor: si el dev decide unificarlas más adelante, hay que ajustar ese test a la vez.
- **Botón "Buscar" con estilo neutro** (`CLASE_BOTON_SECUNDARIO`), no con el verde de acción: no está escrito en la spec del buscador, pero se sigue el criterio ya establecido en `estilos-boton.ts` y en la propia home ("nada compite con el botón de WhatsApp").
- **`role="search"`** en el `<form>`: mejora de accesibilidad no pedida explícitamente por la spec (landmark ARIA), no debería requerir aprobación pero lo marco por transparencia.
- **Truncado de la consulta mostrada a 80 caracteres** (`LONGITUD_MAXIMA_CONSULTA_MOSTRADA` en `src/app/buscar/page.tsx`): la spec solo exige que "el encabezado no repite la cadena completa" en consultas larguísimas, sin dar un número. Elegí 80 como valor conservador y fácil de ajustar; queda para que alguien lo valide si le parece muy largo/corto.
- **Copy nuevo**: ninguno — todos los literales de este change ya venían aprobados literal en la spec (proposal.md, duda 1). No propuse copy nuevo.

## Verificación manual hecha (sin capturas)

Con `npx next dev -p 3100` + `curl` verifiqué: los tres estados de `/buscar` (vacío/espacios/`%`, sin resultados, con resultados), coincidencia por acentos ("plomero"→"Plomería"/"Plomeria"), por "ñ" ("pinatas"→"Piñatería"), por giro sin que la palabra esté en nombre/queOfreces ("comida"→"Fonda Sazón de Mamá"), escapado de HTML en la consulta (`<b>plomero</b>` sale como `&lt;b&gt;`), meta `robots: noindex, follow`, botón de WhatsApp con `href`/`rel`/`target` correctos, y que una consulta de 5000 caracteres responde 200. No abrí un navegador real a 390/768/1280px (sin herramienta de captura en este entorno) — pendiente de ojos humanos antes del PR (tasks.md #17).

## Pendientes para el dev (no son bugs, son la siguiente etapa del pipeline)

1. Implementar `src/lib/busqueda.ts` y `buscarNegociosPublicados` (tasks #1-#8) y hacer el swap de imports descrito arriba en `src/app/buscar/page.tsx`; borrar `src/lib/mock/agregar-buscador.ts`.
2. **Dos scenarios preexistentes de otros changes ahora fallan y hay que actualizarlos** (no los toqué, per instrucción de no tocar `tests/`):
   - `tests/directorio-paginas.test.ts:144` (`"no hay buscador ni ningún otro control sin destino"`) — asertaba que la home NO tenía `<form>/<input>/<button>`; ese es exactamente el candado que este change quita a propósito (proposal.md, "Qué cambia": *"Cae la cláusula de la spec que prohibía mostrar un campo de búsqueda"*).
   - `tests/directorio-adversarial.test.ts:668` (mismo patrón, dentro de "el recorrido completo funciona sin JavaScript de cliente") — el buscador SÍ es sin JS (formulario GET puro), así que el assert debería cambiar a revisar ausencia de manejadores de eventos (`on(click|change|submit|input)=`) en vez de prohibir `<form>` a secas; la segunda mitad de ese mismo test (línea 669) ya hace justo esa revisión.
   - Confirmé con `npx vitest run`: son las ÚNICAS 2 fallas de las 431 pruebas existentes; todo lo demás sigue en verde.
3. `tests/layout.test.ts` task #16 (lista blanca de `/buscar` + revisión del `action` de formularios) y la suite adversarial del buscador (task #15) siguen pendientes, como estaba previsto en tasks.md.
4. Revisar tasks.md #17 con un navegador real a 390/768/1280px antes de abrir el PR.
