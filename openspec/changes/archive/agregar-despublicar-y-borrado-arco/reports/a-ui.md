# Reporte UI — agregar-despublicar-y-borrado-arco

Esta capa se construye sobre un panel **ya real** (T-005): las páginas de
cola y detalle ya leen Prisma de verdad, no mocks. Mi trabajo extiende esas
mismas páginas y componentes; solo lo que todavía no tiene lógica de negocio
(escrituras de despublicar/borrar, que dependen de columnas y funciones que
el dev aún no crea) queda explícitamente marcado como MOCK, siguiendo el
mismo patrón que `openspec/changes/archive/agregar-panel-admin/reports/a-ui.md`
(sección "accion-rechazar-mock.ts... el mock pasa el motivo por `?motivo=`
porque no persiste nada").

## Archivos creados

Contenido real (no mock):

- `src/components/admin/formulario-despublicar.tsx` — motivo obligatorio con
  el texto de ayuda literal de la duda 2 ("Este motivo se le enviará al
  negocio por WhatsApp.") ligado por `aria-describedby`.
- `src/components/admin/control-borrar.tsx` — enlace de **navegación** (GET)
  a `/admin/registros/[id]/borrar`; no borra nada. Distinguido como acción
  irreversible con `border-2 border-tinta` + texto "⚠ Acción irreversible",
  sin introducir ningún color nuevo a la paleta (globals.css es explícito:
  "un solo verde de acción, neutrales para todo lo demás").
- `src/components/admin/confirmacion-borrado.tsx` — paso 2 completo:
  encabezado, advertencia con el nombre, recordatorio ARCO, campo `BORRAR`,
  "Sí, borrar para siempre" y "Mejor no, regresar", en el orden exacto de la
  spec.
- `src/app/admin/registros/[id]/borrar/page.tsx` — paso 1 (GET puro, no
  borra nada), con guarda de sesión y `notFound()` si el id no existe.
- `src/app/admin/registros/[id]/despublicado/page.tsx` — hermana de
  `aprobado/`/`rechazado/`: mismo patrón POST→GET, mismo guard de estado.
- `src/app/admin/borrado-hecho/page.tsx` — pantalla final del borrado,
  **fuera** de `/admin/registros/[id]/…` a propósito (esa era la exigencia
  del requirement de no fuga: nada del negocio en la URL final). Distingue
  "Ya se borró para siempre." de "Esta ficha ya no existe." con
  `?resultado=borrado|ya-no-existe` — ninguno de los dos valores es un dato
  personal.

Mock (Server Actions sin escritura real, cada una con un bloque de
comentario al inicio que dice qué debe reemplazar el dev):

- `src/app/admin/registros/[id]/accion-despublicar-mock.ts`
- `src/app/admin/registros/[id]/accion-borrar-mock.ts`

## Archivos modificados

- `src/lib/admin/textos.ts` — todos los literales nuevos de la spec (revisé
  cada uno carácter por carácter contra el delta), más `mensajeAvisoDespublicacion`,
  `textoAdvertenciaBorrado` y la constante `PALABRA_CONFIRMACION_BORRADO`.
- `src/lib/admin/consultas.ts` — **solo tipos**, sin tocar ninguna consulta:
  agregué `vieneDeDespublicacion?`, `despublicadoEn?`, `motivoDespublicacion?`
  y `girosIds?` como campos **opcionales** en `RegistroColaItem` /
  `RegistroAdminDetalle`. Opcionales a propósito: así el código real de
  `obtenerColaDeRevision`/`obtenerRegistroParaPanel` sigue compilando sin
  cambios hasta que el dev los implemente (tasks.md #6), y mientras tanto
  todo degrada con gracia al comportamiento de hoy (sin etiqueta, sin giros
  premarcados, sin rótulos de despublicación).
- `src/components/admin/detalle-registro.tsx` — pinta "Cuándo la
  despublicaste"/"Por qué la despublicaste" solo si `despublicadoEn`/
  `motivoDespublicacion` vienen presentes.
- `src/components/admin/tarjeta-cola.tsx` — pinta la etiqueta "Ya estaba
  publicada, la despublicaste" si `vieneDeDespublicacion` es `true` (texto,
  no solo color, mismo criterio que `IndicadorAtrasado`).
- `src/app/admin/registros/[id]/page.tsx` — reorganizado por estado: datos →
  (comentario ancla para los reportes de `agregar-boton-reportar`, T-011,
  todavía sin mergear) → WhatsApp de verificación → aprobar/rechazar
  (`en_revision`) → despublicar (`publicado`) → "Borrar definitivamente"
  (siempre, al final). También premarca `girosSeleccionados` con
  `registro.girosIds ?? []` cuando no hay error que conservar (contrato de
  la tarea 13).
- `openspec/changes/agregar-despublicar-y-borrado-arco/tasks.md` — marcadas
  `[x]` las tareas 3, 7, 8, 9, 10, 11, 12 y 13, cada una con una nota inline
  de qué es real y qué queda MOCK para el dev. No toqué `tests/` ni ninguna
  otra sección del ticket.

`npm run lint` y `npm run build` pasan limpios. `npm test`: **974/975**
(único rojo: ver "Pendiente conocido de `tests/`" abajo — no lo pude tocar
por instrucción explícita).

## Cómo probarlo

```
npm run dev -- -p 3400
# .env local (gitignored) con PANEL_CONTRASENA / PANEL_SESION_SECRETO / SITIO_URL
# /admin/registros/<id-de-un-negocio-publicado>   → formulario de despublicar + "Borrar definitivamente"
# /admin/registros/<id>/borrar                     → paso 1, no borra nada al abrir/recargar
# /admin/borrado-hecho?resultado=borrado           → "Ya se borró para siempre."
# /admin/borrado-hecho?resultado=ya-no-existe      → "Esta ficha ya no existe."
```

Verifiqué por HTTP (con una cookie de sesión firmada a mano con
`crearValorDeSesion`, igual que hace `tests/layout.test.ts`) que las 4
pantallas nuevas renderizan sus literales exactos, que el detalle de una
ficha `publicado` NO muestra aprobar/rechazar, y que sin cookie
`/admin/registros/<id>/borrar` redirige 307 a `/admin` (guard real,
reutiliza `requerirSesionAdmin()`).

## Formas de datos que esperan los componentes (contrato para el dev)

```ts
// src/lib/admin/consultas.ts (tipos ya extendidos, implementación pendiente
// en tasks.md #6)
type RegistroColaItem = {
  id: string;
  nombre: string;
  coloniaTexto: string;
  esperaTexto: string;
  atrasado: boolean;
  vieneDeDespublicacion?: boolean; // NUEVO — hoy siempre undefined
};

type RegistroAdminDetalle = {
  // ...los campos ya existentes de T-005, sin cambios...
  despublicadoEn?: Date | null;        // NUEVO — hoy siempre undefined
  motivoDespublicacion?: string | null; // NUEVO — hoy siempre undefined
  girosIds?: number[];                  // NUEVO — hoy siempre undefined
};
```

- `TarjetaCola` recibe `RegistroColaItem` completo por spread
  (`<TarjetaCola {...registro} />`, sin cambios en `cola/page.tsx`): en
  cuanto `obtenerColaDeRevision` calcule `vieneDeDespublicacion` de verdad,
  la etiqueta aparece sola.
- `DetalleRegistro` recibe `{ registro: RegistroAdminDetalle }`: en cuanto
  `obtenerRegistroParaPanel` seleccione `despublicadoEn`/
  `motivoDespublicacion`, los dos rótulos aparecen solos.
- `FormularioDespublicar` recibe `{ action, motivoPrevio?, error? }` — mismo
  contrato que `FormularioRechazar`.
- `ControlBorrar` recibe `{ id }` — no necesita más, es solo navegación.
- `ConfirmacionBorrado` recibe `{ nombreNegocio, action, volverHref, error? }`.
- `action` en los tres formularios es `(formData: FormData) => void |
  Promise<void>`, ya ligada con `.bind(null, id)` — patrón idéntico a
  `aprobarRegistroAccion`/`rechazarRegistroAccion` existentes.

## Qué es real y qué es MOCK (para que el dev sepa exactamente qué tocar)

1. **`accion-despublicar-mock.ts` → crear `accion-despublicar.ts`**: la
   versión mock valida que el motivo no esté vacío y redirige a
   `/admin/registros/[id]/despublicado?motivoMock=…` **sin escribir en la
   base**. El dev debe llamar a `despublicarFicha(prisma, id, motivo)`
   (tasks.md #4) y ramificar su resultado discriminado
   (`despublicada|ya-no-publicada|no-encontrado|error:motivo`) con el mismo
   patrón POST→GET que `accion-rechazar.ts`. El caso `"ya-no-publicada"` NO
   tiene todavía una pantalla propia — a diferencia de `ya-resuelto` (que
   sirve para aprobar/rechazar), el literal exigido acá es distinto ("Esta
   ficha ya no estaba publicada.", no "Este registro ya lo habías
   resuelto."); el dev decide si reutiliza `ya-resuelto/page.tsx` con un
   mensaje condicional o crea una pantalla nueva.
2. **`despublicado/page.tsx`**: real, pero lee el motivo con
   `registro.motivoDespublicacion ?? primeraCadena(sp.motivoMock) ?? ""`.
   El `?? primeraCadena(sp.motivoMock)` es **solo para la vista previa** —
   hay que borrarlo en cuanto la columna y la consulta reales existan (el
   requirement de no fuga exige que el motivo SIEMPRE salga de la fila
   guardada, nunca de la URL — mismo criterio que ya aplica
   `rechazado/page.tsx` con `motivoRechazo`).
3. **`accion-borrar-mock.ts` → crear `accion-borrar.ts`**: valida la palabra
   `BORRAR` (constante `PALABRA_CONFIRMACION_BORRADO`) y redirige a
   `/admin/borrado-hecho?resultado=borrado` **sin borrar nada**. El dev debe
   llamar a `borrarNegocio(prisma, id)` (tasks.md #5) antes del redirect y
   usar `?resultado=ya-no-existe` cuando el resultado sea `"ya-no-existe"`.
   El `id` nunca viaja hacia `/admin/borrado-hecho` en ninguna de las dos
   versiones — eso ya queda resuelto tal cual.
4. **`consultas.ts`**: como arriba, campos opcionales sin implementación.
   `girosSeleccionados` en `page.tsx` ya cae a `registro.girosIds ?? []`.

## Decisiones de UI sin respaldo explícito en la spec

1. **Estilo de "Borrar definitivamente"**: la spec no dice cómo distinguirlo
   visualmente ("visualmente separado como acción irreversible"). Usé
   `border-2 border-tinta` (más grueso que el `border-borde` del resto de
   las tarjetas) + el texto "⚠ Acción irreversible" arriba del botón, sin
   introducir un color de "peligro" — la paleta del sitio es
   deliberadamente de una sola vía (`globals.css`: "neutrales para todo, verde
   solo para la acción"). Si el equipo quiere más contraste, es un cambio de
   una clase en `control-borrar.tsx`.
2. **`FormularioDespublicar` y `ConfirmacionBorrado` usan
   `CLASE_BOTON_SECUNDARIO`** (neutro), no el verde de WhatsApp — mismo
   criterio que "Aprobar y publicar"/"Rechazar" en el panel-admin original:
   el verde se reserva para los botones que abren WhatsApp.
3. **Ruta de la pantalla final**: elegí `/admin/borrado-hecho` (estática, sin
   `[id]`) por ser la lectura más directa del requirement "esa pantalla no
   puede ser `/admin/registros/<id>/…`". El parámetro `?resultado=` es mi
   propuesta para distinguir "Ya se borró para siempre." de "Esta ficha ya
   no existe." sin id ni nombre en la URL — la spec no da ninguna pista de
   cómo resolver esa distinción sin exponer datos.
4. **Guard de `despublicado/page.tsx`**: reutilicé el mismo criterio que
   `rechazado/page.tsx` (comparar el `estado` actual) en vez de exigir
   `despublicadoEn` presente, porque hoy esa columna no existe. Cuando el
   dev implemente `despublicadoEn`, puede endurecer el guard si lo prefiere
   (p. ej. exigir también `despublicadoEn` no nulo) sin tocar el componente.
5. **Campo del formulario de borrado se llama `confirmarBorrado`** (no hay
   nombre de campo en la spec) — elegido para que no choque con ningún otro
   `name` del panel.

## Copy propuesto que necesita visto bueno

Todos los literales de botones/rótulos/errores de esta pantalla vienen
citados tal cual del delta de `revision-admin` (los revisé carácter por
carácter). Lo único sin literal explícito en la spec:

- "Acción irreversible" — encabezado del bloque de `ControlBorrar`.

## Pendiente conocido de `tests/` (no lo pude tocar)

`npm test` da **974/975**. El único rojo:

```
tests/layout.test.ts > ... > las pantallas del panel solo enlazan a rutas del panel que existen
"href a una ruta inexistente: /admin/registros/<id>/borrar"
```

La función `rutaInternaExiste` de ese archivo tiene una lista blanca de
sub-rutas válidas de `/admin/registros/<id>/…`:
`["aprobado", "rechazado", "ya-resuelto"]` (línea ~268). El detalle de una
ficha `publicado` ahora sí enlaza a `.../borrar` (vía `ControlBorrar`), y esa
sub-ruta todavía no está en la lista. Quien toque `tests/` primero (dev o
seguridad-test, según cómo se reparta) debe sumar `"borrar"` — y
`"despublicado"` en cuanto haya algún enlace hacia ella desde una pantalla
revisada por esa suite — a ese arreglo. No lo agregué yo porque la
instrucción de este turno fue explícita: no tocar `tests/`.

## Pendientes para el dev (más allá de lo ya listado en tasks.md)

1. Tareas 1 y 2 (modelo de datos): sin las columnas `despublicadoEn`/
   `motivoDespublicacion` en `prisma/schema.prisma`, nada de lo de arriba
   persiste todavía — es exactamente el estado esperado en esta etapa.
2. Tareas 4 y 5 (`despublicarFicha`/`borrarNegocio` en `transiciones.ts`) y
   6 (consultas reales): mientras no existan, las dos pantallas de
   confirmación (`despublicado`, `borrado-hecho`) siguen funcionando para
   revisión visual, pero ningún dato persiste de verdad.
3. Sumar `"borrar"` (y `"despublicado"` si aplica) a la lista blanca de
   `tests/layout.test.ts` (ver sección de arriba).
4. Revisión humana a 390/768/1280px (tasks.md #18): estructuralmente todo
   usa los mismos patrones ya verificados de `formulario-rechazar.tsx`/
   `aprobado/page.tsx` (flex-col, `min-h-11`, `break-words`), pero no
   reemplaza el ojo humano en un dispositivo real.
