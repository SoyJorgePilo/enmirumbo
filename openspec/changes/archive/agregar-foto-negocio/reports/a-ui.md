# Reporte UI · agregar-foto-negocio

Capa de interfaz del campo de foto, sin lógica de negocio ni acceso a datos
nuevo. `npm run lint`, `npm run build` y `npx vitest run` (904/904, sin tocar
`tests/`) en verde al cierre de esta sesión.

## Archivos creados

- `src/lib/mock/agregar-foto-negocio.ts` — mocks para preview manual y
  fixtures: dos funciones que generan `data:image/svg+xml,...` chiquitos "al
  vuelo" (nunca un binario), más el shape exacto que ya esperan
  `TarjetaNegocioProps` y el fragmento nuevo de `DetalleRegistro`. **No está
  wireado a Prisma/seed-demo** — ver la sección "Por qué no sembré fotos"
  abajo, es la decisión más importante de este reporte.

## Archivos modificados

- `src/components/registro/formulario-registro.tsx` — campo de foto opcional
  (`<input type="file" id="foto" accept="image/jpeg,image/png,image/webp">`)
  con la política del PRD §6.1 como ayuda visible antes de elegir el
  archivo, la casilla siempre visible "Dejar mi ficha sin foto"
  (`id="quitarFoto"`), estado de error (`errores.foto`), `<form>` ahora
  `encType="multipart/form-data"`, y `"foto"` agregado a
  `ORDEN_CAMPOS_PARA_FOCO` (entre `facebookUrl` y `consentimiento`, mismo
  orden que la spec lista los opcionales). Cero JS nuevo: sigue siendo el
  mismo Client Component de antes (por `useActionState`), pero nada del
  campo de foto depende de `onChange`/preview/recorte en cliente.
- `src/lib/registro/textos.ts` — `TEXTO_POLITICA_FOTO`,
  `TEXTO_CASILLA_SIN_FOTO`, `ACCEPT_FOTO`, `MENSAJES_ERROR_FOTO` (3
  literales) y `AVISO_FOTO_NO_GUARDADA`. Todos son literales de la spec,
  verificados carácter por carácter (ver abajo).
- `src/lib/registro/tipos.ts` — `ErroresFormularioRegistro` gana la clave
  opcional `"foto"` (junto a `"consentimiento"` y `"general"`, que ya eran
  claves fuera de `CamposFormularioRegistro`). Cambio puramente aditivo: no
  toqué `CamposFormularioRegistro`, `leerEnvioRegistro`, `validarRegistro`
  ni `procesar.ts` — nada de eso es mío.
- `src/components/directorio/marcador-foto.tsx` — nuevas props `alt` (texto
  alternativo cuando hay foto; por defecto `""` si no se pasa) y `prioridad`
  (mapea a `priority` de `next/image`, controla carga diferida). El
  marcador de posición sin foto no cambió.
- `src/components/directorio/tarjeta-negocio.tsx` — nueva prop `prioridad`
  (default `false`), y pasa `alt={`Foto de ${nombre}`}` a `MarcadorFoto`.
- `src/app/negocio/[ficha]/page.tsx` — pasa `alt={`Foto de
  ${negocio.nombre}`}` y `prioridad` (siempre `true`, es la imagen principal
  de la ficha) a `MarcadorFoto`.
- `src/app/[categoria]/page.tsx` y `src/app/buscar/page.tsx` — el `.map` de
  tarjetas ahora pasa `prioridad={indice === 0}` (listado en una sola
  columna: "la primera fila" es la primera tarjeta).
- `src/components/admin/detalle-registro.tsx` — nueva sección "Foto del
  negocio" (rótulo literal) arriba del todo, antes de la lista `<dl>`: si
  `registro.fotoUrl` existe, `MarcadorFoto` en un contenedor `aspect-video
  max-w-sm`; si no, el literal "Sin foto". El prop `registro` ahora es
  `RegistroAdminDetalle & { fotoUrl?: string | null }` (extensión local del
  tipo, no toqué `RegistroAdminDetalle` en `src/lib/admin/consultas.ts`).
- `openspec/changes/agregar-foto-negocio/tasks.md` — marqué `[x]` la tarea
  11 completa, y `[x]` con nota "parcial" las tareas 18, 19 y 20 (hice la
  parte de interfaz; falta la parte de datos/servidor). La 12 la dejé sin
  marcar pero anoté qué parte sí quedó (los literales en `textos.ts`).

No toqué `prisma/schema.prisma`, ninguna migración, `src/lib/fotos/`,
`validacion.ts`, `procesar.ts`, `accion.ts`, `src/lib/directorio.ts`,
`src/lib/admin/consultas.ts`, `prisma/seed-demo.ts`, `next.config.ts` ni
nada de `tests/`.

## Por qué NO sembré fotos en `prisma/seed-demo.ts` (decisión importante)

Consideré usar el generador de mocks del punto anterior para que el
directorio mostrara una foto real de verdad al correr `npm run dev`. No lo
hice: `tests/directorio-paginas.test.ts` ("cada tarjeta trae marcador de
foto, nombre, colonia...") afirma explícitamente
`expect(htmlServicios).not.toContain("<img")` sobre el listado de
"servicios-del-hogar", que sale de `NEGOCIOS_DEMO`. Sembrar una foto en
cualquiera de esos tres negocios habría roto ese test — y tengo instrucción
explícita de no tocar `tests/`. Verifiqué en cambio los tres componentes con
un render manual fuera del árbol de tests (`renderToStaticMarkup`, script
descartado al terminar, no commiteado): `alt="Foto de <nombre>"` presente
con foto, marcador `aria-hidden` sin foto, cero `<img>` cuando no hay foto,
y "Foto del negocio"/"Sin foto" correctos en el panel — resultados en la
sección siguiente.

La tarea 22 (sembrar fotos reales con el pipeline de `sharp`) es justo la
que tiene que traer el seed y actualizar ese test **a la vez** (el
comportamiento nuevo — "un negocio con foto y otro sin ella en el mismo
listado" — es del requirement MODIFIED de `directorio-publico`, así que el
test viejo queda obsoleto por diseño, no por accidente). Dejé
`src/lib/mock/agregar-foto-negocio.ts` con exactamente las funciones que esa
tarea puede reutilizar para no depender de `sharp` en el seed si no quiere
(aunque el ADR-006/design.md §2 sí pide `sharp` para las fotos reales que
suba un negocio).

## Verificación manual (además de lint/build/tests)

1. `curl http://localhost:3200/registro` (con `next start` local): el HTML
   trae `id="foto" accept="image/jpeg,image/png,image/webp"`,
   `id="quitarFoto"`, `<label for="foto">Foto de tu negocio
   (opcional)</label>`, el texto literal de la política completo, "Dejar mi
   ficha sin foto" y `<form ... encType="multipart/form-data"
   method="POST">`.
2. Render manual (`renderToStaticMarkup`) de `TarjetaNegocio` con foto mock:
   `alt="Foto de Tortillería La Espiga de Mentiras"` presente, hay `<img>`.
   Sin foto: `aria-hidden` presente, cero `<img>`.
   `DetalleRegistro` con foto mock: contiene "Foto del negocio" y `<img>`.
   Sin foto: contiene "Sin foto".
3. `npx vitest run` completo: 904/904, incluida la suite `directorio-*` y
   `registro-*` sin ningún cambio.

## Formas de datos que esperan los componentes (contrato para el dev)

```ts
// MarcadorFoto (src/components/directorio/marcador-foto.tsx)
type MarcadorFotoProps = {
  fotoUrl?: string | null;   // YA debe venir validada/segura de pintar (ver nota M1 abajo)
  alt?: string;              // "Foto de <nombre>" cuando hay foto; "" si no se pasa
  prioridad?: boolean;       // true solo en la primera tarjeta visible / en la ficha
  className?: string;
};

// TarjetaNegocio (src/components/directorio/tarjeta-negocio.tsx) — sin cambios
// de shape salvo la nueva prop:
type TarjetaNegocioProps = {
  nombre: string;
  coloniaNombre: string | null;
  entregaADomicilio: boolean;
  fotoUrl?: string | null;
  prioridad?: boolean;       // NUEVA: pásala `true` solo para el índice 0 del listado
  hrefFicha: string;
  hrefWhatsapp: string | null;
};

// DetalleRegistro (src/components/admin/detalle-registro.tsx)
type DetalleRegistroProps = {
  registro: RegistroAdminDetalle & { fotoUrl?: string | null }; // NUEVO campo opcional
};
```

- `ErroresFormularioRegistro.foto` (en `src/lib/registro/tipos.ts`) es el
  slot único para los 4 literales de foto: los 3 de
  `MENSAJES_ERROR_FOTO` (`demasiadoGrande`, `noEsImagen`,
  `errorProcesamiento`) cuando la foto en sí falla, y
  `AVISO_FOTO_NO_GUARDADA` cuando falla otro campo pero el envío traía
  foto. El formulario ya pinta `errores.foto` en el campo correcto — el
  dev solo tiene que poner el mensaje que corresponda ahí en
  `validacion.ts`/`procesar.ts`.
- El campo del formulario se llama `foto` (`FormData.get("foto")` → `File`)
  y la casilla `quitarFoto` (`FormData.get("quitarFoto")` → `"on"` si está
  marcada, mismo patrón que `entregaADomicilio`/`consentimiento` de
  `validacion.ts`). Ninguno de los dos está en `CamposFormularioRegistro`
  a propósito: un `<input type="file">` nunca se repuebla (por eso `foto`
  tampoco tiene `defaultValue`), y no hay literal de la spec que pida
  repoblar la casilla, así que la dejé sin eco (como el checkbox de
  consentimiento). Si el dev decide que sí conviene eco de `quitarFoto`,
  es un campo booleano más, mismo patrón que `entregaADomicilio`.
- **`DetalleRegistro` no muestra foto real todavía**: seguirá mostrando
  "Sin foto" para cualquier registro hasta que `obtenerRegistroParaPanel`
  (`src/lib/admin/consultas.ts`) proyecte `fotoUrl` en el `select` y en el
  objeto que devuelve. Es un cambio mecánico (copiar el patrón de
  `queOfreces`/`facebookUrl` ahí mismo) que decidí no hacer por ser acceso
  a datos, no interfaz.
- **Nota de seguridad para el dev (M1, spec `directorio-publico` "Solo se
  pinta la foto que generó el servidor")**: `MarcadorFoto` sigue confiando
  en que `fotoUrl` ya es segura de pintar — **no valida nada**. Hoy eso es
  cierto porque nada escribe esa columna. En cuanto el dev implemente el
  validador de render (tarea 9) y el route handler (tarea 10), quien llame
  a `MarcadorFoto`/`TarjetaNegocio`/la ficha/`DetalleRegistro` DEBE pasar el
  resultado de ese validador (URL interna o `null`), nunca el valor crudo
  de la base. No até esa validación al componente porque es lógica de
  servidor y porque el propio design.md §4 dice que la clave cambia de
  nombre (`fotoUrl` → `fotoClave`) — hacerlo yo habría significado inventar
  esa API sin que exista el resto.

## Decisiones de UI sin respaldo literal de la spec

1. **Orden del campo de foto**: lo puse último entre los opcionales (después
   de "Link de tu Facebook", antes del aviso de consentimiento), porque es
   el orden literal en que el requirement "Campos obligatorios y opcionales
   del formulario" los enumera ("...horario, link de Facebook y una foto
   del negocio").
2. **La casilla "Dejar mi ficha sin foto" no se repuebla en un rebote de
   error**: la spec no dice qué hacer con ella al volver el formulario con
   errores (solo dice que el campo de FOTO se pierde). La traté igual que
   el checkbox de consentimiento (que la spec sí dice explícitamente que se
   pierde) por ser el patrón más simple y menos sorprendente; si el equipo
   prefiere que si el dueño la marcó, se re-marque al rebotar, es un cambio
   de una línea en `procesar.ts`/`validacion.ts` (agregar `quitarFoto` a
   `CamposFormularioRegistro`) que no hice por no tocar esos archivos.
3. **Estilo del `<input type="file">`**: usé el patrón `file:*` de Tailwind
   (botón "Elegir archivo" propio con `file:min-h-11` para el área táctil,
   fondo `bg-superficie` neutro) porque no hay ningún estilo de referencia
   de campo de archivo en el resto del sitio ni en la spec. Contraste y
   área táctil verificados a ojo contra el resto de inputs del formulario.
4. **`prioridad` de `MarcadorFoto`/`TarjetaNegocio` (nuevo, no pedido
   literalmente en ningún requirement con ese nombre)**: es mi lectura del
   requirement "El peso de las fotos no rompe el presupuesto de 4G" ("solo
   la primera fila de tarjetas DEBE cargar su foto de inmediato"). Como el
   listado es de una sola columna (`<ul className="flex flex-col gap-4">`),
   mapeé "primera fila" a "primer elemento" (`indice === 0`). Si el diseño
   cambia a grid con varias columnas, el criterio de `indice === 0` deja de
   alcanzar y hay que ajustarlo a "las N tarjetas del primer renglón según
   el breakpoint".
5. **Ubicación de la sección "Foto del negocio" en el panel**: la puse
   arriba de todo (antes de la `<dl>` de datos), no intercalada como un
   `<Dato>` más, porque el propio requirement dice que la foto tiene que
   verse "lo bastante grande para poder juzgarla... antes de aprobar o
   rechazar" — me pareció que eso pide prioridad visual, no una fila más
   entre 8.

## Copy verificado carácter por carácter contra la spec

"Foto de tu negocio (opcional)", "Una foto de tu local, de tus productos o
de tu trabajo. Que no salgan personas que se puedan reconocer. Máximo 5 MB
(JPG, PNG o WebP); nosotros la comprimimos para que cargue rápido.", "Dejar
mi ficha sin foto", "Esa foto pesa más de 5 MB. Sube una más ligera.", "No
pudimos leer esa foto. Sube una imagen JPG, PNG o WebP.", "No pudimos
preparar tu foto. Intenta con otra.", "Tu foto no se quedó guardada: vuelve
a elegirla antes de enviar.", "Foto de <nombre del negocio>" (patrón de
`alt`), "Foto del negocio", "Sin foto" — todos tomados literal de
`specs/registro-negocio/spec.md`, `specs/directorio-publico/spec.md` y
`specs/revision-admin/spec.md` del change.

## Pendiente para el dev (no es mío)

1. `src/lib/fotos/` completo: puerto de almacenamiento, clave opaca,
   procesamiento con `sharp`, validador de render (tareas 1-9).
2. Route handler `/api/foto/[clave]/[variante]` (tarea 10).
3. Resto de `src/lib/registro/validacion.ts` y `procesar.ts`: leer el
   `File` de `foto` y el booleano de `quitarFoto`, validar tamaño/tipo
   declarado, enganchar el procesamiento como paso 4.5, limpieza de
   huérfanos, reenvío que cambia/quita foto (tareas 12-16).
4. Renombrar `fotoUrl` → `fotoClave` en `prisma/schema.prisma` + migración a
   mano (tarea 8) — **cuidado**: en cuanto eso pase, todos los componentes
   que hoy reciben `fotoUrl` (`TarjetaNegocioProps`, `MarcadorFotoProps`,
   `NegocioListado`/`NegocioFicha` de `src/lib/directorio.ts`,
   `RegistroAdminDetalle`) van a necesitar que quien los llama les pase la
   URL YA resuelta por el validador de la tarea 9, no la clave cruda — los
   componentes de UI no cambian de forma, solo cambia qué les pasa el
   `page.tsx`/`consultas.ts` que los llama.
5. `src/lib/directorio.ts`: proyectar la clave/URL resuelta (tarea 17).
6. `src/lib/admin/consultas.ts`: agregar `fotoUrl: true` al `select` de
   `obtenerRegistroParaPanel` y al objeto que devuelve, para que
   `DetalleRegistro` deje de mostrar siempre "Sin foto".
7. `prisma/seed-demo.ts` con fotos reales (tarea 22) — y junto con eso,
   actualizar `tests/directorio-paginas.test.ts` línea ~219
   (`not.toContain("<img")`) porque ese comportamiento cambia a propósito.
8. `next.config.ts`: `serverActions.bodySizeLimit` a `6mb` (tarea 2).
9. Suite adversarial de foto y demás tests de las tareas 21-26.
