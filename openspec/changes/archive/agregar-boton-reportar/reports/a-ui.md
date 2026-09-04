# Reporte UI — agregar-boton-reportar

## Archivos creados

Contenido REAL (no mock — literales y validación pura de la spec):

- `src/lib/reportes/motivos.ts` — lista cerrada de motivos (`MOTIVOS_REPORTE`),
  sus etiquetas (`ETIQUETA_MOTIVO_REPORTE`), el tipo `MotivoReporte` y
  `esMotivoReporteValido()` (type guard contra `undefined`, cadena vacía,
  motivo inventado, arreglo). El dev puede usarlo tal cual dentro de
  `crearReporte` (tasks.md #5).
- `src/lib/reportes/textos.ts` — todos los literales de la spec pública
  (encabezado, frase, rótulos, ayuda del comentario, botón, confirmación,
  "Volver a la ficha", los 4 errores, `LIMITE_COMENTARIO_REPORTE = 300`).
- `src/components/directorio/boton-reportar.tsx` — Server Component, el
  control discreto de la ficha.
- `src/components/reportes/formulario-reporte.tsx` — Server Component puro
  (sin directiva de cliente), el `<form>` del mini-formulario: motivo (radios,
  ninguno marcado), comentario (`maxLength=300`), honeypot reutilizado
  (`CampoHoneypot`), botón "Enviar reporte", los 4 estados de error.
- `src/app/admin/registros/[id]/accion-marcar-reporte-atendido-mock.ts` —
  Server Action de "Marcar como atendido" (guarda de sesión REAL).
- `src/components/admin/tarjeta-negocio-reportado.tsx`,
  `negocios-reportados.tsx`, `reportes-pendientes-negocio.tsx` — Server
  Components de la cola y el detalle del panel.

Server Actions **MOCK** (cada una con un bloque de comentario grande al
inicio que dice exactamente qué reemplaza el dev, mismo patrón que los
`a-ui.md` anteriores):

- `src/app/negocio/[ficha]/reportar/accion-mock.ts` (reemplaza tasks.md #5, #8)
- `src/lib/mock/agregar-boton-reportar.ts` (reemplaza parte de tasks.md #6 y
  #14 — es el archivo MÁS importante para el dev, léelo primero)

Páginas (`src/app/negocio/[ficha]/reportar/`), Server Components, sin
`"use client"`:

- `page.tsx` — el formulario (404 real si el negocio no existe o no está
  publicado, reutilizando `obtenerNegocioPublicado`)
- `gracias/page.tsx` — confirmación (`metadata.robots` noindex en ambas)

## Archivos modificados

- `src/app/negocio/[ficha]/page.tsx` — agrega `<BotonReportar>` al final,
  después de `<BotonesContacto>`.
- `src/lib/admin/textos.ts` — agrega los 8 literales nuevos del panel
  (sección "Reportes" al final del archivo).
- `src/app/admin/cola/page.tsx` — agrega la sección "Negocios reportados"
  (datos del mock).
- `src/app/admin/registros/[id]/page.tsx` — agrega la sección "Reportes sin
  atender" (datos del mock) y lee `?reporte=atendido|ya-atendido`.
- `openspec/changes/agregar-boton-reportar/tasks.md` — marcadas `[x]` las
  tareas 2, 3, 7, 8, 9, 11, 12, 13, 14, cada una con una nota de qué es real
  y qué es mock/falta. La 10 (rutas nuevas en `tests/layout.test.ts`) queda
  sin marcar a propósito: no toqué `tests/`.

`npm run lint` y `npm run build` pasan limpios. `npm test`: 1293/1296 en
verde; los 3 que fallan son exactamente los que dependen de listas
exhaustivas en `tests/` que no me tocaba tocar (ver "Pendientes para el dev"
abajo) — verifiqué cada uno a mano para confirmar que es "falta actualizar la
lista", no un bug.

## Cómo lo probé (sin tests, con `curl` + sesión real)

Con `npm ci && npx prisma migrate dev && npm run db:seed && npm run
db:seed:demo` y el servidor en el puerto 3500:

- Ficha de un negocio publicado del seed → trae "Reportar este negocio" al
  final, con `aria-label` que nombra al negocio.
- `/negocio/<segmento>/reportar` → 200 con las 4 opciones y todos los
  literales; `/negocio/no-existe/reportar` → 404.
- Envié el formulario replicando el POST `multipart/form-data` real que
  genera Next para una Server Action con argumentos ligados (extraje los
  campos ocultos `$ACTION_1:0`/`$ACTION_1:1` del HTML — un simple
  `-d "motivo=..."` NO basta, Next no lo reconoce sin esos campos):
  - motivo válido + comentario → `303` a `.../reportar/gracias`, que muestra
    "¡Gracias por avisarnos! Vamos a revisar este negocio." y "Volver a la
    ficha".
  - sin motivo → `303` de vuelta con `?error=motivo`, "Dinos qué pasa con
    este negocio", comentario conservado.
  - comentario de 301 caracteres → `?error=comentario`, "El comentario es
    muy largo (máximo 300 caracteres)".
  - honeypot lleno → `303` directo a `.../gracias` (misma confirmación, sin
    delatar nada).
  - disparador de demo `comentario=cupo agotado` → `?error=cupo`, "Ya
    recibimos varios reportes desde aquí...".
- Panel: entré con `PANEL_CONTRASENA`/`PANEL_SESION_SECRETO` de prueba (no
  commiteados, `.env` borrado al terminar). La cola mostró "Negocios
  reportados" con 2 negocios (3 y 1 reportes sin atender); el detalle del
  negocio con 3 mostró los tres, del más antiguo al más reciente, con
  motivo/comentario/espera correctos. Marcar el primero como atendido →
  "Reporte atendido.", desaparece de la lista, la cola baja a "2 reportes sin
  atender"; repetir la misma acción → "Este reporte ya lo habías atendido."

## Formas de datos que esperan los componentes (contrato para el dev)

### Ficha pública

```ts
// src/components/directorio/boton-reportar.tsx
type BotonReportarProps = { nombre: string; href: string };
```

Ya está cableado en `page.tsx` con datos reales (`negocio.nombre`,
`/negocio/<segmento>/reportar`) — nada que mockear aquí.

### Formulario de reporte

```ts
// src/components/reportes/formulario-reporte.tsx
type ErrorFormularioReporte = "motivo" | "comentario" | "cupo" | "servidor";
type FormularioReporteProps = {
  action: (formData: FormData) => void | Promise<void>; // Server Action ya ligada al negocio
  comentarioPrevio?: string;
  error?: ErrorFormularioReporte;
};
```

`reportarNegocioAccionMock(negocioId, hrefFicha, formData)` es la firma que
`page.tsx` liga con `.bind(null, negocio.id, hrefFicha)`. Si `crearReporte`
real termina con una firma distinta (p. ej. sin `hrefFicha`, redirigiendo con
una constante de ruta), el único cambio es esa línea de `.bind` en
`page.tsx` — `FormularioReporte` no le importa qué firma tiene `action` más
allá de `(formData) => void | Promise<void>`.

### Panel — mock de reportes (`src/lib/mock/agregar-boton-reportar.ts`)

```ts
type NegocioReportadoColaItem = { id: string; nombre: string; totalPendientes: number };
type ReportePendienteDetalle = {
  id: string;
  motivoEtiqueta: string;   // YA la etiqueta legible, no el valor de BD
  esperaTexto: string;      // YA formateado, con textoEspera() real
  comentario: string | null;
};

obtenerNegociosReportadosMock(): Promise<NegocioReportadoColaItem[]>
obtenerReportesPendientesDeNegocioMock(negocioId: string, ahora?: Date): Promise<ReportePendienteDetalle[]>
marcarReporteAtendidoMock(reporteId: string): "atendido" | "ya-atendido"
```

`SeccionNegociosReportados` recibe `{ negocios: NegocioReportadoColaItem[] }`
(spread directo desde `obtenerNegociosReportadosMock()`).
`ReportesPendientesNegocio` recibe `{ reportes: ReportePendienteDetalle[],
action: (reporteId: string, formData: FormData) => void | Promise<void>,
mensaje?: "atendido" | "ya-atendido" }` — el componente hace
`action.bind(null, reporte.id)` por cada `<form>`, así que `action` que le
pasa la página ya viene ligada solo al `negocioId`
(`marcarReporteAtendidoAccionMock.bind(null, id)`).

**Estas dos formas (`NegocioReportadoColaItem`, `ReportePendienteDetalle`)
son el contrato real, no un mock que dejé a medias**: cuando exista la tabla
`Reporte`, las consultas reales de tasks.md #6 deben devolver EXACTAMENTE
esta forma para que `SeccionNegociosReportados`/`TarjetaNegocioReportado`/
`ReportesPendientesNegocio` no cambien. El único campo derivado que hay que
seguir calculando igual es `esperaTexto` (reutiliza `textoEspera` de
`src/lib/admin/consultas.ts`, que YA es real).

## Decisión de arquitectura: el mock de reportes lee negocios publicados vía `obtenerDatosDelSitemap`, no con su propio `where`

`tests/directorio-consultas.test.ts` tiene un invariante estricto: el patrón
`estado: ESTADO_NEGOCIO_PUBLICADO` (o `"publicado"`) solo puede aparecer en
`src/lib/directorio.ts` (lectura) y `src/lib/admin/transiciones.ts`
(escritura) — **ningún otro archivo**, ni siquiera uno de mock. Mi primer
intento (`prisma.negocio.findMany({ where: { estado: ... } })` dentro del
propio módulo mock) rompía ese test. Lo resolví reutilizando
`obtenerDatosDelSitemap()` (ya existente, real, en `directorio.ts`) para
obtener `fichas: { id, nombre, publicadoEn }[]` de todos los negocios
publicados, y ordenando/recortando en memoria dentro del mock. Confirmé con
`npm test` que el invariante vuelve a pasar.

**Ojo con esto al reemplazar el mock**: como uso `obtenerDatosDelSitemap()`
(que ordena `publicadoEn desc, nombre asc`) y luego reordeno ascendente, dos
negocios que comparten `publicadoEn` (el seed de demo tiene un caso a
propósito) NO necesariamente quedan en el mismo orden en que aparecen en
`prisma/seed-demo.ts` — el desempate real es por nombre. Lo verifiqué a mano
y es determinista entre pantallas (cola y detalle coinciden), solo no es
"el primer negocio del archivo del seed" literalmente. La consulta real de
tasks.md #6 no tiene este problema porque ordena por la fecha del reporte,
no por `publicadoEn` del negocio.

## Decisiones de UI sin respaldo explícito en la spec

1. **"Enviar reporte" usa el botón SECUNDARIO (neutro), no el verde de
   acción.** La spec solo exige que "Reportar este negocio" (el control de
   la ficha) no compita con WhatsApp; no dice nada del botón de envío dentro
   del propio formulario de reporte, donde no hay ningún WhatsApp con el que
   competir. Decidí mantenerlo neutro de todas formas: reportar no es una
   acción para celebrar en verde, y es consistente con que "Aprobar y
   publicar"/"Rechazar" del panel también son secundarios (misma razón que
   documentó el `a-ui.md` de `agregar-panel-admin`). Si el equipo prefiere
   verde aquí (es, al final, la única acción de esa página), es una clase en
   `formulario-reporte.tsx`.
2. **Confirmación de "Marcar como atendido" es un banner en la misma
   pantalla del detalle** (`?reporte=atendido|ya-atendido`), NO una
   sub-página propia como `/aprobado`, `/rechazado`, `/ya-resuelto`. A
   diferencia de aprobar/rechazar (que resuelven el registro y tiene sentido
   navegar a una pantalla de cierre), marcar un reporte atendido es una
   acción que se repite varias veces sobre la MISMA pantalla del detalle
   (puede haber más reportes pendientes debajo) — mandar a una sub-página
   aparte rompería ese flujo. El componente ya soporta `mensaje?: "atendido"
   | "ya-atendido"` si el dev prefiere otro mecanismo.
3. **`ReportesPendientesNegocio` se muestra SIEMPRE que haya pendientes**,
   sin condicionarlo a `enRevision` (a diferencia de los formularios de
   aprobar/rechazar): un negocio reportado es, por definición, uno que ya
   está `publicado`. Es una lectura directa de la spec ("El detalle del
   negocio lista sus reportes sin atender", sin condición de estado), lo
   dejo anotado porque es la única sección del detalle que NO depende de
   `enRevision`.
4. **Orden de secciones en el detalle**: `DetalleRegistro` →
   `BotonWhatsapp` → **"Reportes sin atender"** → formularios de
   aprobar/rechazar (si aplica). La spec no fija el orden; puse los reportes
   antes de aprobar/rechazar porque en la práctica un negocio con reportes
   pendientes casi siempre YA está publicado (no tiene esos formularios), así
   que el orden solo importa para el caso raro de un negocio `en_revision`
   con reportes de una publicación anterior si algún día existe
   "despublicar" (T-015, fuera de este change).
5. **El disparador de demo del mock (`"cupo agotado"` / `"error servidor"`
   como comentario)** es una convención SOLO de `accion-mock.ts`, documentada
   en su propio comentario de cabecera — no es parte de ningún contrato que
   el dev deba conservar.

## Pendientes para el dev (más allá de lo ya marcado en tasks.md)

1. **`crearReporte`** (tasks.md #5): reemplaza
   `src/app/negocio/[ficha]/reportar/accion-mock.ts` completo. La validación
   de motivo/comentario que SÍ escribí (usa `esMotivoReporteValido` y
   `LIMITE_COMENTARIO_REPORTE`, ambos reales) se puede dejar tal cual dentro
   de la función real; lo que falta es honeypot→silencio, cupo por IP real
   (`ipDeEncabezados` + `crearCupoPorIp`, tasks.md #4) y el tope de 10
   pendientes por negocio.
2. **Consultas reales del panel** (tasks.md #6): reemplazan
   `obtenerNegociosReportadosMock`/`obtenerReportesPendientesDeNegocioMock`
   de `src/lib/mock/agregar-boton-reportar.ts`, MISMA forma de salida (ver
   arriba). Se puede borrar `obtenerDatosDelSitemap` de la cadena de
   dependencias por completo: la consulta real agrupa/filtra directo sobre
   la tabla `Reporte`.
3. **`marcarReporteAtendido`** (tasks.md #14): reemplaza
   `marcarReporteAtendidoMock` (el `Set` en memoria) y
   `src/app/admin/registros/[id]/accion-marcar-reporte-atendido-mock.ts`
   (renombrar sin `-mock`, la guarda de sesión ya es real y se mantiene tal
   cual).
4. **`tests/layout.test.ts`** (tasks.md #10, explícitamente fuera de mi
   alcance): confirmé con `npm test` que fallan exactamente 2 puntos —
   la whitelist de `href`/`action` de la home/listado/ficha (falta
   `/negocio/[ficha]/reportar`) y, en `tests/buscador-pagina.test.ts`, la
   lista exhaustiva de páginas `noindex` (faltan `/negocio/[ficha]/reportar`
   y `.../reportar/gracias`).
5. **`tests/admin-paginas.test.ts`**: el test "encabeza, lista lo pendiente…"
   compara el HTML completo de la cola contra un snapshot que no conocía la
   sección "Negocios reportados"; hay que decidir si ese test agrega
   fixtures de reportes reales (tabla `Reporte`) o si se separa en un test
   propio de la sección nueva.
6. **`prisma/seed-demo.ts`**: el proposal lo deja explícitamente fuera de
   alcance ("Reportes sembrados en el seed de demostración... si al operar
   el panel se quiere ver la sección con datos, es un chore de una línea").
   Mientras no exista, la demo de "Negocios reportados"/"Reportes sin
   atender" solo se ve gracias al mock descrito arriba.
7. Revisión visual a 390px/768px/1280px (tasks.md #18): diseñé mobile-first
   a 390px (una columna, controles `min-h-11`, `break-words` en todo lo que
   escribe el negocio o el vecino) pero no lo verifiqué con capturas de
   pantalla — no tengo ese pipeline en este entorno.
