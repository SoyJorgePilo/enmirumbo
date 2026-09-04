# Reporte UI — agregar-panel-admin

## Archivos creados

Contenido real (no mock):

- `src/lib/admin/textos.ts` — todos los literales de la spec `revision-admin`
  (encabezados, rótulos, botones, errores, confirmaciones) y las **tres**
  plantillas de WhatsApp (`mensajeVerificacion`, `mensajeAvisoPublicacion`,
  `mensajeAvisoRechazo`), copiadas y revisadas carácter por carácter contra
  la spec. Único texto sin literal en la spec: `textoConteoAtrasados` (ver
  "Copy propuesto" abajo).
- `src/lib/admin/whatsapp.ts` — `construirEnlaceWhatsappPanel(whatsapp,
  mensaje)`, real (reutiliza `normalizarWhatsapp` de `src/lib/whatsapp.ts`,
  igual que `src/lib/enlaces.ts` del directorio público). Sin número
  normalizable devuelve `null`, sin inventar enlace.
- `src/components/admin/boton-whatsapp.tsx` — Server Component. Un solo
  componente para los 3 usos (verificación + los 2 avisos): recibe
  `whatsapp`, `mensaje` y `etiqueta`; sin enlace posible, muestra el número
  tal cual (requirement "Botón de verificación...", scenario "número que no
  se puede interpretar").
- `src/components/admin/boton-salir.tsx`, `indicador-atrasado.tsx`,
  `tarjeta-cola.tsx`, `detalle-registro.tsx`, `formulario-aprobar.tsx`,
  `formulario-rechazar.tsx` — todos Server Components, cero `"use client"`
  (grep verificado).

Mock:

- `src/lib/mock/agregar-panel-admin.ts` — **el archivo más importante para
  el dev**: catálogos (`CATALOGO_COLONIAS_MOCK`, `CATALOGO_GIROS_MOCK`, 21 y
  49 elementos, mismos nombres que `prisma/seed.ts`), 8 registros
  (`REGISTROS_MOCK`: 6 `en_revision` con distintas combinaciones —
  atrasado/no atrasado, colonia "Otra" pendiente, solo obligatorios —, 1
  `publicado` y 1 `rechazado`), `obtenerColaMock()`, `obtenerRegistroMockPorId(id)`,
  `PANEL_CONFIGURADO_MOCK`, `CONTRASENA_MOCK`, `URL_SITIO_MOCK`. Ver
  "Formas de datos" abajo.

Server Actions **MOCK** (cada una con un bloque de comentario al inicio que
lista qué debe reemplazar el dev, mismo patrón que
`agregar-formulario-registro/reports/a-ui.md`):

- `src/app/admin/accion-acceso-mock.ts` (tasks #8, #9)
- `src/app/admin/accion-salir-mock.ts` (task #10)
- `src/app/admin/registros/[id]/accion-aprobar-mock.ts` (task #17)
- `src/app/admin/registros/[id]/accion-rechazar-mock.ts` (task #20)

Páginas (`src/app/admin/`), todas Server Components con `metadata.robots =
{ index: false, follow: false }`:

- `page.tsx` — acceso (+ fail-safe, + confirmación de logout)
- `cola/page.tsx`
- `registros/[id]/page.tsx` — detalle + botón de verificación + los dos
  formularios (solo si `estado === "en_revision"`)
- `registros/[id]/aprobado/page.tsx`, `.../rechazado/page.tsx`,
  `.../ya-resuelto/page.tsx` — pantallas post-acción (POST→GET)

## Archivos modificados

- `openspec/changes/agregar-panel-admin/tasks.md` — marcadas `[x]` las
  tareas 7, 12, 14, 15, 16, 18, 19, 25 y 26, cada una con una nota de qué
  falta (validación real, guard de sesión, tests). No toqué `tests/` ni
  `docs/tickets/T-006-buscador.md` ni nada de `agregar-buscador/`.

`npm run lint`, `npm run build` y `npm test` (431/431) pasan limpios.

## Cómo probarlo

```
npm run dev
# /admin              → contraseña: tizayuca-demo
# /admin?sinConfigurar=1  → estado fail-safe
# /admin/cola
# /admin/registros/reg-tacos-guero          (completo, atrasado, botón WhatsApp)
# /admin/registros/reg-refaccionaria-tornillo (colonia "Otra" pendiente)
# /admin/registros/reg-yoga-luna            (solo los 5 obligatorios)
# /admin/registros/reg-veterinaria-segunda  (publicado → intenta aprobar/rechazar → "ya resuelto")
# /admin/registros/reg-prestamos-rapidos    (rechazado, motivo literal de la spec)
```

Verifiqué las acciones mock invocándolas directamente (sin navegador, con
`FormData` construido a mano): 4 giros → `errorAprobar=giros` conservando la
selección en la URL; colonia "Otra" sin elegir → `errorAprobar=colonia`;
motivo vacío → `errorRechazar=motivo`; aprobar/rechazar un registro
`publicado` → redirige a `ya-resuelto`; contraseña incorrecta/correcta →
los dos textos y el `redirect` a `/admin/cola`.

## Formas de datos que esperan los componentes (contrato para el dev)

Todo en `src/lib/mock/agregar-panel-admin.ts`:

```ts
type ElementoCatalogo = { id: number; nombre: string; slug: string }; // de @/lib/registro/tipos, reutilizado

type RegistroAdminDetalle = {
  id: string;
  nombre: string;
  categoriaNombre: string;
  whatsapp: string;
  coloniaNombre: string | null;   // del catálogo, o null si pendiente
  coloniaOtra: string | null;     // texto libre capturado si eligió "Otra"
  coloniaPendiente: boolean;      // true si coloniaOtra existe y coloniaNombre es null
  queOfreces: string | null;
  entregaADomicilio: boolean;
  telefonoFijo: string | null;
  direccion: string | null;
  horario: string | null;
  facebookUrl: string | null;
  estado: EstadoNegocio;          // "en_revision" | "publicado" | "rechazado" — de @/lib/negocio (real)
  origen: OrigenNegocio;          // "siembra" | "organico" — de @/lib/negocio (real)
  registradoEn: Date;
  publicadoEn: Date | null;
  consintioAvisoEn: Date;
  rechazadoEn: Date | null;       // campo NUEVO del modelo (spec modelo-datos)
  motivoRechazo: string | null;   // campo NUEVO del modelo (spec modelo-datos)
};

type RegistroColaItem = {
  id: string;
  nombre: string;
  coloniaTexto: string;   // coloniaNombre ?? coloniaOtra, ya resuelto para mostrar
  esperaTexto: string;    // "Hace 4 horas", "Hace 2 días"... YA FORMATEADO
  atrasado: boolean;      // true si > 48h
};
```

- **`RegistroColaItem.esperaTexto`/`atrasado` son el contrato, no una
  función que dejé a medias.** En el mock vienen precalculados a mano
  (`esperaTextoMock`/`atrasadoMock` en cada registro de `REGISTROS_MOCK`,
  fechas fijas para que la demo sea reproducible). La consulta real
  (tasks.md #13) debe calcularlos contra un "ahora" **inyectable** — eso es
  business logic con sus propios tests (registros de 3h/47h/49h/200h), así
  que deliberadamente NO escribí esa función: solo dejé la forma que su
  resultado debe tener para que `TarjetaCola`/`obtenerColaMock` no cambien.
- `TarjetaCola` recibe exactamente `RegistroColaItem` (spread directo).
- `DetalleRegistro` recibe `{ registro: RegistroAdminDetalle }`.
- `FormularioAprobar` recibe `{ action, giros, girosSeleccionados,
  colonias, coloniaSeleccionada?, coloniaPendienteTexto?, origenSeleccionado,
  errorGiros?, errorColonia? }` — `action` es una Server Action
  `(formData: FormData) => void | Promise<void>` ya ligada al `id` con
  `.bind(null, id)` (patrón documentado en
  `node_modules/next/dist/docs/01-app/02-guides/forms.md`, sección "Passing
  additional arguments" — funciona en Server Components, no requiere
  cliente).
- `FormularioRechazar` recibe `{ action, motivoPrevio?, error? }`.
- `BotonWhatsapp` recibe `{ whatsapp, mensaje, etiqueta }` — no sabe nada de
  giros/colonia/origen, es puramente de presentación.

## Decisión de arquitectura más importante: CERO Client Components, a propósito

A diferencia del formulario público de registro (que terminó siendo un
Client Component completo por `useActionState`, ver
`agregar-formulario-registro/reports/a-ui.md`), aquí la spec es **estricta,
no ambigua**: requirement "El panel se opera desde el celular y sin
JavaScript de cliente innecesario", scenario "sin JS de cliente propio" dice
literalmente que **ningún archivo nuevo del panel declara `"use client"`**.
Por eso:

- Los formularios de aprobar/rechazar/acceso son `<form action={servidor}>`
  puros, sin `useActionState`/`useFormStatus`.
- Los errores y los valores a conservar (giros marcados, colonia elegida,
  motivo) viajan por **`searchParams`** tras un `redirect()` de la Server
  Action (POST→GET), no por el `state` de un hook de cliente. Verifiqué que
  `grep -rn '"use client"' src/app/admin src/components/admin` no devuelve
  nada.
- Esto es un patrón MENOS habitual que `useActionState` y tiene un límite
  real: codificar el motivo del rechazo completo en la URL si algún día se
  quisiera conservarlo tras un error sería frágil (límites de longitud de
  URL, caracteres especiales). Para "Elige máximo 3 giros" y "Elige la
  colonia" alcanza sin problema (pocos valores cortos); para el rechazo NO
  intenté conservar el motivo tecleado si viene vacío (no hay nada útil que
  conservar: un motivo vacío/solo espacios no aporta). Si el dev prefiere
  otra estrategia (p. ej. seguir sin cliente pero usar una cookie de "flash
  message" de un solo uso en vez de `searchParams`), es un cambio acotado a
  las tres Server Actions y a cómo `page.tsx` lee el estado — los
  componentes de formulario no cambian (siguen recibiendo props simples).

## Decisiones de UI sin respaldo explícito en la spec

1. **Jerarquía de botones**: la spec no dice qué botón es "el principal" en
   una pantalla que tiene TANTO el botón de WhatsApp de verificación COMO
   "Aprobar y publicar"/"Rechazar". Usé `CLASE_BOTON_PRIMARIO` (verde) SOLO
   para los 3 botones de WhatsApp (verificación, aviso de publicación, aviso
   de rechazo) y para "Entrar" (único botón de su pantalla); `Aprobar y
   publicar` y `Rechazar` usan `CLASE_BOTON_SECUNDARIO` (neutro), siguiendo
   el principio del brief "nada compite con el botón de WhatsApp en
   jerarquía visual" — en el detalle, el WhatsApp de verificación es la
   acción que de verdad importa antes de decidir. Si el equipo prefiere que
   "Aprobar y publicar" sea la acción prominente (es, al final, la acción
   que publica), es cambiar una clase en `formulario-aprobar.tsx`.
2. **Rutas del panel**: la spec no fija URLs exactas más allá de que vive
   bajo `/admin`. Elegí `/admin` (acceso), `/admin/cola`, `/admin/registros/[id]`,
   y tres sub-rutas de confirmación (`/aprobado`, `/rechazado`,
   `/ya-resuelto`) para que cada pantalla post-acción sea un GET propio
   (POST→GET real, recargar no repite nada) sin sobrecargar el detalle con
   banderas de estado.
3. **`/admin` hace doble función** (acceso Y fail-safe) en vez de una ruta
   separada para el fail-safe: la spec describe ambos estados como lo que
   se ve al abrir `/admin`, así que los resolví en la misma página con un
   `if` temprano.
4. **La cola es un solo `<article>` como "stretched link"** (todo el
   renglón navega a "Revisar"), no un botón aparte, porque a diferencia de
   `tarjeta-negocio.tsx` (que tiene DOS acciones por tarjeta: ir a la ficha
   y WhatsApp directo) aquí solo hay una.
5. **Giros como lista plana con scroll** (`max-h-64 overflow-y-auto`) en vez
   de agrupados visualmente por categoría del Apéndice B: el catálogo real
   de `Giro` no tiene relación con `Categoria` en el schema, así que no hay
   de dónde sacar la agrupación sin inventar una. El orden del catálogo
   (ids consecutivos en el orden del Apéndice B) ya deja los giros
   agrupados implícitamente.
6. **Detalle interno agrupado en una caja aparte** ("Datos internos del
   panel": estado, origen, fechas) separado de lo que capturó el negocio,
   para que el admin distinga de un vistazo qué es dato del formulario y
   qué es dato de operación. No hay literal de encabezado en la spec para
   esta sección.

## Copy propuesto que necesita visto bueno

- `textoConteoAtrasados(n)`: **"{n} registro(s) lleva(n) más de 48 horas
  esperando."** — la spec solo exige que la cola "diga cuántos están en esa
  condición", sin dar el texto literal.
- Encabezado interno del detalle: **"Datos internos del panel"**.
- Rótulos de los 8 campos del detalle (nombre en `<h1>`, luego "WhatsApp",
  "Colonia", "¿Qué ofreces?", "¿Hace entregas o va a domicilio?", "Teléfono
  fijo", "Dirección o referencias", "Horario", "Página que registró") — la
  spec solo enumera los campos en prosa, sin rótulos exactos; reutilicé
  donde pude la redacción de las etiquetas del formulario público
  (`src/lib/registro/textos.ts` no las expone como constantes propias, así
  que no fue una importación directa, solo una redacción consistente).
- "No capturado" para opcionales vacíos (requirement lo exige en sustancia:
  "sin inventar contenido"; el texto exacto es propuesta mía).
- Texto sin enlace cuando el WhatsApp no normaliza: **"WhatsApp registrado:
  {número} (no se pudo generar el enlace)"**.
- "Volver a la cola" en las 3 pantallas de confirmación.
- Título de pestaña de las páginas del panel: "Panel de revisión —
  NecesitoUno Tizayuca" / "Registros por revisar — Panel de revisión".

## Pendientes para el dev (más allá de lo ya marcado en tasks.md)

1. **Sesión real** (tasks #4, #5, #6, #8, #9, #10, #11): las 7 páginas de
   `src/app/admin/**` y las 4 acciones mock necesitan `requerirSesionAdmin()`
   al inicio. Ahora mismo CUALQUIERA que entre a una URL de detalle ve los
   datos — es exactamente el estado "todavía no hay guard" que se espera de
   la etapa UI, pero es lo primero que hay que cerrar.
2. **Reemplazar cada `*-mock.ts`** por la Server Action real, y las
   funciones `obtener*Mock` por consultas Prisma con la MISMA forma
   (`RegistroAdminDetalle`, `RegistroColaItem`, `ElementoCatalogo[]`).
3. **`accion-rechazar-mock.ts` / `.../rechazado/page.tsx`**: el mock pasa el
   motivo por `?motivo=` porque no persiste nada. La versión real debe leer
   `motivoRechazo` de la fila ya guardada, no de la URL.
4. **`URL_SITIO_MOCK`** (`https://necesitouno.example`, dominio reservado
   RFC 2606) → variable de entorno real de `design.md` §7. Si falta en
   producción, el aviso de publicación no debe mandar un link a `localhost`
   a un negocio real (la spec lo exige explícitamente).
5. **`export const dynamic = "force-dynamic"`** en `cola/page.tsx` y
   `registros/[id]/page.tsx` cuando lean Prisma en vez del mock (mismo
   patrón que `src/app/registro/page.tsx` y `src/app/[categoria]/page.tsx`):
   hoy `/admin/cola` compiló como ruta estática (`○`) porque el mock no
   depende del request.
6. **`tests/layout.test.ts`** (tasks.md #24, explícitamente fuera de mi
   alcance): confirmé con `npm test` que las 431 pruebas existentes siguen
   en verde con mis cambios, pero ese archivo no cubre `/admin` todavía —
   hay que sumar las rutas nuevas a la lista blanca de hrefs y agregar la
   verificación de `rel="noopener noreferrer"` en los `wa.me` del panel
   (los 3 usos ya lo llevan, en `boton-whatsapp.tsx`).
7. Si el dev decide que el patrón `searchParams` para conservar
   giros/colonia/origen es demasiado frágil para producción, la alternativa
   documentada en la sección de arquitectura de arriba (cookie de "flash
   message") no cambia los props de `FormularioAprobar`/`FormularioRechazar`.
