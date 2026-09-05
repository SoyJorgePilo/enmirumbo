# Reporte UI — agregar-listado-gestion-panel (T-018)

Esta capa se construye sobre un panel **ya real** (T-005 y siguientes): la
guarda de sesión, `textos.ts` y `consultas.ts` ya son código de producción,
no mocks. Sigo el mismo patrón que
`openspec/changes/archive/agregar-despublicar-y-borrado-arco/reports/a-ui.md`:
todo lo que no depende de datos (literales, componentes de presentación, la
pantalla, el enlace desde la cola, la normalización pura de los parámetros de
la URL) es código real; lo único que falta —la consulta paginada a Prisma
(tasks.md #3)— queda aislado en un módulo de mock con la misma firma que debe
tener la función real, para que el dev solo tenga que cambiar una línea.

## Archivos creados

Contenido real (no mock):

- `src/lib/admin/listado-parametros.ts` — `FiltroEstadoListado`,
  `FILTROS_ESTADO_LISTADO`, `PORPAGINA_LISTADO` (= 25),
  `normalizarFiltroEstado`, `normalizarPagina` y `hrefListadoDeNegocios`
  (único lugar que arma la URL del listado; filtros, paginación y el enlace
  de la cola lo reutilizan). Módulo puro, sin Prisma ni `cookies()`. Nota
  para el dev/seguridad-test: es una implementación candidata — tasks.md #2
  pide su propia suite exhaustiva de entradas raras, que yo no escribí
  (instrucción de esta etapa: no tocar `tests/`).
- `src/components/admin/renglon-listado-negocio.tsx` — nombre, colonia,
  fecha de registro completa ("Se registró el 3 de septiembre de 2026"),
  estado escrito, etiqueta de despublicada, "Ver detalle" con patrón de
  enlace expandido (`after:absolute after:inset-0`) para que todo el
  renglón sea tocable. Área ≥44px, `break-words`.
- `src/components/admin/filtros-listado-negocios.tsx` — tira de 4 filtros,
  siempre a página 1, activo señalado con `aria-current="true"` + borde
  grueso + subrayado + negritas (no solo color).
- `src/components/admin/paginacion-listado-negocios.tsx` — "Página X de Y",
  "Ver más antiguos"/"Ver más nuevos", cada uno solo si lleva a algún lado,
  conservando el filtro.
- `src/app/admin/negocios/page.tsx` — la pantalla: `requerirSesionAdmin()`
  antes de leer nada, `metadata.robots = { index: false, follow: false }`,
  encabezado, conteo, filtros, lista o vacío (según haya o no filtro
  puesto), paginación (solo si hay más de una página) y "Volver a la cola".
  Server Component, sin `"use client"`.

Mock:

- `src/lib/mock/agregar-listado-gestion-panel.ts` — **el archivo que el dev
  reemplaza**: 32 negocios ficticios de Tizayuca (colonias reales del
  catálogo de `prisma/seed.ts`, nombres inventados, ids `reg-*` igual que
  las fixtures previas del panel) cubriendo los 4 casos de la spec —
  `en_revision` reciente, `publicado`, `rechazado`, y `publicado` que se
  despublicó— y `obtenerListadoDeNegociosMock(parametros)`: mismo tipo de
  entrada/salida que debe tener `obtenerListadoDeNegocios(prisma,
  parametros)` (filtra, ordena por `registradoEn` descendente con `id` como
  desempate estable, pagina en memoria). 32 registros dan dos páginas en
  "Todos" (25 + 7) para poder revisar la paginación de verdad.

## Archivos modificados

- `src/lib/admin/textos.ts` — literales nuevos del listado (encabezado,
  "Ver todos los negocios", "Ver detalle", filtros, vacíos, "Ver más
  antiguos/nuevos"), y las funciones `textoEstadoNegocio`,
  `textoFechaDeRegistro`, `textoConteoNegociosListado`, `textoPaginaDe`.
  Reutiliza `ETIQUETA_COLA_DESPUBLICADA` y `TEXTO_VOLVER_A_LA_COLA` sin
  duplicarlos, como pide tasks.md #1.
- `src/lib/admin/consultas.ts` — **solo tipos**, sin tocar ninguna consulta
  existente: `RegistroListadoItem`, `ParametrosListadoDeNegocios`,
  `ResultadoListadoDeNegocios`, más un comentario que documenta la firma
  exacta que debe tener `obtenerListadoDeNegocios(prisma, parametros)`
  (tasks.md #3, sin implementar). No toqué `obtenerColaDeRevision` ni
  `obtenerRegistroParaPanel`.
- `src/app/admin/cola/page.tsx` — agregado el enlace "Ver todos los
  negocios" (hacia `hrefListadoDeNegocios(FILTRO_TODOS, 1)` =
  `/admin/negocios`) debajo del encabezado. No toqué la consulta, el orden
  ni la sección de reportados.

`npm run lint` y `npx tsc --noEmit` pasan limpios (tuve que correr `npx next
typegen` primero para que `PageProps<"/admin/negocios">` exista — el mismo
error de `PageProps`/`LayoutProps` no encontrado aparecía en **todos** los
archivos existentes del repo antes de generarlo, no es algo que yo haya roto).
No corrí `npm run build` ni `npm test` por instrucción explícita (Postgres
local en uso por otro pipeline).

## Cómo probarlo

```
npm run dev
# .env local con PANEL_CONTRASENA / PANEL_SESION_SECRETO
# /admin/cola                                  → enlace nuevo "Ver todos los negocios"
# /admin/negocios                              → "Todos", 25 de 32, página 1 de 2
# /admin/negocios?pagina=2                     → los 7 restantes, "Ver más nuevos" pero no "Ver más antiguos"
# /admin/negocios?estado=publicado             → solo publicados, conteo distinto, "Publicados" señalado
# /admin/negocios?estado=rechazado             → 4 rechazados, una sola página, sin controles de paginación
# /admin/negocios?estado=xyz&pagina=-3         → se ve igual que "Todos" página 1, sin error
# /admin/negocios?pagina=999                   → lista vacía + "No hay..." (si hay filtro) + "Ver más nuevos"
```

No pude arrancar el servidor de verdad en esta corrida (la base local la usa
otro pipeline en paralelo); la verificación fue lint + `tsc` + lectura
cuidadosa de cada componente contra los escenarios de la spec. Falta el
repaso visual a 390/768/1280px con ojos humanos (tasks.md #13).

## Formas de datos que esperan los componentes (contrato para el dev)

```ts
// src/lib/admin/consultas.ts (tipos reales, implementación pendiente)
type RegistroListadoItem = {
  id: string;
  nombre: string;
  coloniaTexto: string;   // colonia del catálogo o texto libre, ya resuelto
  registradoEn: Date;
  estado: EstadoNegocio;  // "en_revision" | "publicado" | "rechazado"
  vieneDeDespublicacion: boolean; // mismo criterio que RegistroColaItem
};

type ParametrosListadoDeNegocios = {
  estado: FiltroEstadoListado; // "todos" | "en_revision" | "publicado" | "rechazado"
  pagina: number;               // ya normalizada, entero ≥ 1
  porPagina: number;            // PORPAGINA_LISTADO = 25
};

type ResultadoListadoDeNegocios = {
  registros: RegistroListadoItem[];
  total: number; // del FILTRO aplicado, no de toda la base
};
```

- `obtenerListadoDeNegocios(prisma, parametros): Promise<ResultadoListadoDeNegocios>`
  es la función que falta (tasks.md #3). Debe reemplazar la llamada a
  `obtenerListadoDeNegociosMock` en `src/app/admin/negocios/page.tsx` (una
  línea de import + una llamada, marcada con un comentario `// MOCK` en el
  archivo) y luego se puede borrar `src/lib/mock/agregar-listado-gestion-panel.ts`
  entero — ningún componente lo importa directamente, solo la página.
- `RenglonListadoNegocio` recibe `RegistroListadoItem` completo por spread
  (`<RenglonListadoNegocio {...registro} />`).
- `FiltrosListadoNegocios` recibe `{ filtroActivo: FiltroEstadoListado }`.
- `PaginacionListadoNegocios` recibe `{ filtroActivo, paginaActual,
  totalPaginas }` — `page.tsx` decide si se pinta (`totalPaginas > 1`), el
  componente no se auto-oculta.
- `normalizarFiltroEstado`/`normalizarPagina` reciben lo que
  `searchParams.estado`/`searchParams.pagina` traiga tal cual (`string |
  string[] | undefined`), nunca lanzan.

## Decisiones de UI sin respaldo explícito en la spec

1. **URLs sin parámetros por defecto**: `hrefListadoDeNegocios` omite
   `estado` cuando es "todos" y `pagina` cuando es 1, así que el enlace de
   la cola apunta a `/admin/negocios` a secas, no a
   `/admin/negocios?estado=todos&pagina=1`. La spec no lo exige ni lo
   prohíbe; me pareció la lectura más limpia de "URLs compartibles" del
   design.md §3. Si el dev prefiere que los parámetros siempre estén
   explícitos, es un cambio dentro de esa única función.
2. **Insignia del estado en el renglón**: un `<p>` con borde neutro
   (`border-borde`, sin color de "peligro" ni "éxito" — la paleta del sitio
   es de una sola vía, igual que documentó la etapa UI de
   `agregar-despublicar-y-borrado-arco`). El texto es el que distingue el
   estado, el borde es solo refuerzo visual.
3. **Filtro activo con `aria-current="true"`** en vez de
   `aria-current="page"`: elegí `"true"` porque el filtro no es exactamente
   "la página actual" en el sentido de navegación entre documentos distintos
   (las cuatro opciones viven en la misma pantalla); ambos valores son
   válidos para `aria-current` y cualquier lector de pantalla lo anuncia
   igual. Si el equipo prefiere `"page"` por convención, es un cambio de un
   atributo.
4. **"Ver todos los negocios" va justo debajo del encabezado de la cola**,
   antes del conteo de atrasados — la spec solo dice "entrada visible", no
   dónde. Lo puse ahí para que sea lo primero que se lee al entrar al panel,
   sin competir con el conteo de atrasados que es la señal operativa más
   urgente de esa pantalla.
5. **`textoFechaDeRegistro`** usa un formato de fecha distinto al que ya
   usa `detalle-registro.tsx` (`FORMATO_FECHA`, corto y con hora): ese
   formato es para el dato interno del panel; el renglón del listado
   necesita el ejemplo literal de la spec ("3 de septiembre de 2026", mes en
   palabras, sin hora). No unifiqué los dos formatos porque cumplen
   necesidades distintas (auditoría interna vs. lectura rápida en una
   lista).

## Copy propuesto que necesita visto bueno

Todos los literales de encabezados/botones/rótulos/vacíos vienen citados tal
cual del delta de `revision-admin` (los revisé carácter por carácter). Lo
único sin literal explícito:

- `textoFechaDeRegistro`: el delta solo da un *ejemplo* ("por ejemplo 'Se
  registró el 3 de septiembre de 2026'"), no la plantilla exacta con
  variables. Usé literalmente `Se registró el ${fecha}` con
  `Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year:
  "numeric" })`, que reproduce el ejemplo carácter por carácter para esa
  fecha.
- `aria-label="Paginación del listado"` en el `<nav>` de
  `PaginacionListadoNegocios`: sin literal en la spec, texto técnico de
  accesibilidad (no visible), no necesita el mismo escrutinio que el copy en
  pantalla.

## Pendientes para el dev (más allá de lo ya listado en tasks.md)

1. **Tarea 3**: implementar `obtenerListadoDeNegocios(prisma, parametros)`
   en `src/lib/admin/consultas.ts` con los tipos ya declarados; reemplazar
   la línea `// MOCK` en `src/app/admin/negocios/page.tsx`; borrar
   `src/lib/mock/agregar-listado-gestion-panel.ts`.
2. **Tarea 4** (prueba de volumen con 200+ registros, `skip`/`take` real):
   no aplica a la etapa UI, el mock pagina en memoria sobre 32 filas fijas
   a propósito.
3. **Tarea 2** (suite exhaustiva de `normalizarFiltroEstado`/
   `normalizarPagina`): escribí la implementación pero no la suite —
   instrucción explícita de no tocar `tests/` en esta etapa.
4. **Tarea 11** (suites que recorren todas las páginas de `/admin` —
   `noindex`, referente, sin analítica — y la verificación de enlaces del
   sitio público): la ruta nueva debería recogerse sola si esas suites
   iteran el árbol de `src/app/admin`; si alguna tiene una lista blanca
   explícita de rutas (como pasó con `tests/layout.test.ts` en el change de
   despublicar/borrar), hay que sumar `/admin/negocios` a mano.
5. **Tarea 13** (repaso visual 390/768/1280px, JS deshabilitado): no lo pude
   hacer con ojos humanos en esta corrida (sin servidor arrancado); la
   estructura sigue los mismos patrones ya verificados de `tarjeta-cola.tsx`
   (`min-h-11`, `break-words`, flex-col) así que debería comportarse igual,
   pero falta la revisión real.
