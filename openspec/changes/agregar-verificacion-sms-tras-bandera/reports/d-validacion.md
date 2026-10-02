# Reporte VALIDADOR — agregar-verificacion-sms-tras-bandera (T-016)

Etapa D. Validación independiente contra los cuatro deltas de spec, el ticket
`docs/tickets/T-016-verificacion-sms.md` y el diff completo (`git diff` contra
`origin/main` + lo no rastreado del worktree `wt-t016`). No acepté por reporte
ninguna de las afirmaciones de las etapas A, B y C: lo que abajo se dice
"verificado" lo ejecuté yo.

**Veredicto: APROBADO.** 0 bloqueantes. 3 hallazgos bajos, todos documentados y
trasladados al PR; ninguno tiene efecto con la bandera apagada, que es como se
mergea este change.

---

## 1. El test de oro: con la bandera apagada, ¿es el sitio de hoy?

Es el requirement rey y la razón de ser del change, así que no me quedé en las
suites del change: **comparé el HTML renderizado contra el de `origin/main`**,
montando los componentes de main junto a los de la rama en el mismo proceso.

| Superficie | Método | Resultado |
|---|---|---|
| Detalle del panel (ficha sin verificar) | render de `DetalleRegistro` de la rama vs. el de `origin/main`, misma ficha | **idéntico byte a byte** |
| Renglón de la cola (ficha sin verificar) | render de `TarjetaCola` de la rama vs. el de `origin/main` | **idéntico byte a byte** |
| `/registro` (formulario) | sin diff en la página ni en el componente; el guardián prohíbe que importen `verificacion/` | sin cambios |
| `/registro/gracias` | render de la página de la rama vs. la de `origin/main` | **NO idéntico** → hallazgo [V-1] |
| `/registro/verificar` | `leerConfiguracionVerificacion()` → `notFound()` **antes** de mirar la cookie | 404 como cualquier dirección inventada |
| Peticiones al proveedor | `proveedorDeVerificacion(null)` → `null`; el adaptador real solo entra por `import()` dinámico tras comprobar la configuración | cero |
| Filas nuevas | `dependenciasDeVerificacion()` devuelve `null` y `accion.ts` ni llama al flujo; con la capacidad apagada no se escribe ni una fila en `IntentoDeCupo` | cero |

### [V-1] BAJO — la pantalla de gracias no es byte a byte la de hoy (sin efecto visible)

`src/app/(publico)/registro/gracias/page.tsx`. Con la bandera apagada y sin
parámetros, lo servido cambia así:

```
main:  <section …><h1 class="max-w-md text-2xl font-bold …">¡Gracias! …</h1><a …>
rama:  <section …><div class="flex max-w-md flex-col gap-2"><h1 class="text-2xl font-bold …">¡Gracias! …</h1></div><a …>
```

Es un `<div>` contenedor —el que sostiene la línea "¡Listo! Ya confirmamos tu
número." cuando existe— y el `max-w-md` que se mudó del `h1` a ese `div`.
**Render idéntico** (mismo ancho máximo, el `gap-2` no hace nada con un solo
hijo, el `text-center` se hereda igual) y **cero texto, campo, enlace o script
nuevo**, que es exactamente lo que pide el scenario aprobado ("nada nuevo en el
HTML con la capacidad apagada"). Por eso no bloquea: la spec se cumple. Pero la
promesa coloquial "byte a byte" no se cumple al pie de la letra, y cerrarla son
tres líneas (pintar el `div` solo cuando hay línea extra). Queda a decisión del
humano.

### [V-2] BAJO — `/registro/gracias` pasa de estática a dinámica

En el build de `main` esa ruta se prerenderiza; en la rama sale como `ƒ`
(dinámica), porque la página ahora lee `searchParams`. Es **inherente al diseño
aprobado** (las banderas de presentación `?verificado=1` / `?agotado=1` viven en
la URL), no hay forma de conservar el prerender sin cambiar la spec. Impacto:
una pantalla terminal, sin consultas a la base, deja de servirse desde el
prerender. Lo dejo dicho porque es el único cambio de comportamiento observable
en producción con la bandera apagada.

### [V-3] BAJO — residuo funcional heredado de la etapa C

`src/lib/verificacion/flujo.ts:274-276`: un reenvío bloqueado por el **cupo por
IP** o por el **tope diario** ya gastó uno de los dos reenvíos del registro (el
turno de 60 s y el reenvío se apartan antes de llegar al proveedor). Es el
residuo que la etapa C declaró tras cerrar [C-3], por el camino contrario:
[C-3] era el clic dentro del cooldown, que ahora **no** gasta reenvío. El
camino que queda es raro (hay que tener el cupo por IP agotado con la ficha
recién creada) y su único efecto es que al dueño le quedan menos reintentos de
los escritos; ningún SMS de más, ningún gasto de más. Sin efecto con la bandera
apagada.

---

## 2. Spec: requirement por requirement

Los cuatro deltas, con muestreo de scenarios verificados por mí (no por el mapa
del dev):

- **`registro-negocio` ADDED** — fail-safe (tabla de arriba), "el registro se
  guarda antes de pedir el código" (`procesarRegistro` devuelve la ficha y
  `accion.ts` pide el código DESPUÉS del `create`; con el campo trampa y con un
  duplicado devuelve `ficha: null`, así que **no existe camino para mandarle un
  SMS a un número ajeno**), la pantalla del código con sus 16 literales, el
  canal acotado y la no fuga. Los literales los comparé carácter por carácter
  contra los deltas: los 16 coinciden, incluidos los cuatro errores del campo,
  el de intentos agotados, el de espera, el del cupo y la línea de gracias.
- **`registro-negocio` MODIFIED** — el reenvío conserva la marca
  (`yaVerificado` sale de la fila y corta el pedido de código), ningún valor del
  cliente la puede fijar (lista blanca de `procesarRegistro` intacta), el
  mensaje de gracias no cambia ni una palabra (verificado en el render), y la
  pantalla del código no agrega ningún evento de medición.
- **`revision-admin` MODIFIED** — las tres situaciones del detalle y la etiqueta
  del renglón, con la regla de aparición correcta: la fecha se muestra **siempre**
  (encendida o apagada) y "Sin verificar…" solo con la capacidad encendida.
  Ninguna transición del panel cambia; el botón "Escribirle por WhatsApp" y los
  formularios de aprobar/rechazar siguen intactos en una ficha verificada.
- **`modelo-datos` ADDED** — ver §3.
- **`despliegue` ADDED** — `docs/despliegue.md` §11 cubre los siete puntos del
  requirement (costo, A2P, variables en orden con la bandera al final, cómo
  apagarla, tope por proceso, embudo del PRD §10, y que la publicación sigue
  siendo del admin) y está marcada como opcional fuera del checklist obligatorio;
  `.env.example` documenta las seis variables, todas comentadas y vacías.

**Ningún scenario quedó sin implementación verificable.**

## 3. La migración

`prisma/migrations/20260909000000_agrega_verificacion_sms/migration.sql`: una
sola sentencia, `ALTER TABLE "Negocio" ADD COLUMN "numeroVerificadoEn"
TIMESTAMP(3)`.

- **Aplicable:** `npx prisma migrate status` contra la base propia del worktree
  (puerto 51250) → "Database schema is up to date", 4 migraciones, sin drift.
- **Segura al revertir:** nulable y **sin default**, así que no reescribe la
  tabla, no toca ninguna otra columna ni los CHECK de `estado` y `origen`, y a
  las filas anteriores no se les inventa fecha (fijado en
  `tests/modelo-migraciones.test.ts`, que ahora exige `numeroVerificadoEn` nula
  en la fila vieja). Volver al código anterior deja la columna huérfana e inerte:
  no hay pérdida de datos ni migración inversa que correr.
- **Sin columna de código:** el código lo genera, lo caduca y lo compara el
  proveedor; en la base no vive ninguno.

## 4. El admin sigue aprobando siempre

`confirmarCodigo` hace un `updateMany` condicionado a `numeroVerificadoEn: null`
con `data: { numeroVerificadoEn }` y nada más. No hay ningún otro camino que
escriba estado, `publicadoEn` ni giros desde la verificación. El detalle del
panel gana dos líneas de texto y **ninguna acción**; la cola gana una etiqueta y
no cambia orden, conteo de atrasados ni qué registros aparecen.

## 5. Cupos: nadie quema saldo de Twilio

Los topes están anclados en el servidor (los tres por registro en la tabla
`IntentoDeCupo`, con clave HMAC del identificador; el cupo por IP y el tope
diario en memoria del proceso, como los demás cupos del sitio). **No me fié de
las suites: las mutilé.** Subí `MAX_REENVIOS_POR_REGISTRO` 2→99,
`MAX_INTENTOS_POR_REGISTRO` 5→99 y `CODIGOS_POR_IP_POR_HORA` 3→300 sobre el
código real: **18 pruebas se pusieron rojas** en las tres suites del canal.
Revertido y comprobado. Los guardianes muerden.

La deuda del tope diario por proceso (con N instancias, hasta N veces el gasto)
está escrita en `docs/despliegue.md` §11.4 con la recomendación de poner además
un límite de gasto en la consola de Twilio, que es el único techo que no depende
de la plataforma.

## 6. Alcance

El diff hace lo que el ticket pide y nada más, con **una desviación deliberada y
declarada**: la corrección del hallazgo [C-1] de la etapa C toca
`src/lib/gestion/` (T-014), que la propuesta había puesto "fuera de este
change". Aplicar una edición que **cambia el WhatsApp** ahora limpia
`numeroVerificadoEn` dentro de la misma transacción, y `campos.ts` gana el censo
exhaustivo de columnas que impide que la próxima columna nueva entre al modelo
sin que nadie decida qué pasa con ella al editar. Lo acepto porque sin eso el
panel afirmaría —con el literal aprobado, junto a un número de un tercero— una
verificación que nunca ocurrió; volver a **pedir** código tras el cambio de
número sigue fuera, como manda la propuesta. La decisión final es del humano al
mergear.

Sin dependencias nuevas (el adaptador de Twilio usa `fetch` contra la API REST,
no el SDK). Sin `any` gratuitos (`tsc --noEmit` limpio). Textos en español
mexicano coloquial. Cero literales de la marca vieja en el diff; el guardián de
marca (`tests/rebrand-seguridad-adversarial.test.ts`) está en verde.

## 7. Seguridad

El reporte de la etapa C (vuelta 2) no deja críticos ni altos abiertos: [C-1],
[C-1b] y [C-2] cerrados y re-verificados por la propia etapa C, y [C-3]
corregido en la iteración 3 con las aserciones invertidas a verde (lo confirmé
leyendo el orden real de `reenviarCodigo`: el turno de 60 s se aparta **antes**
que el tope de reenvíos). Mi propio barrido del diff: ningún secreto, ninguna
credencial funcional, ningún dato personal real —los números son de las series
ficticias `77199x` y las credenciales de prueba no pueden confundirse con las
verdaderas—, y ninguna proyección pública gana un campo (`numeroVerificadoEn`
no sale a ficha, listados, resultados, sitemap ni datos estructurados).

## 8. Compuertas mecánicas (ejecutadas por mí, base propia puerto 51250)

- `npx tsc --noEmit` → **limpio**
- `npm run lint` → **limpio**
- `npm run build` → **verde** (`/registro/verificar` dinámica; ver [V-2] sobre
  `/registro/gracias`)
- `npm test` → **3 554 pasan, 2 saltados, 2 en rojo**: únicamente **[A1]** y
  **[A2]** de `tests/reportes-seguridad-adversarial.test.ts`, las carreras
  intermitentes conocidas y ajenas a este change (el servidor local de
  `prisma dev` multiplexa las conexiones sobre una sola sesión)

El CI de GitHub Actions sobre `postgres:17` es el que manda: **esta validación
local no lo sustituye y el PR no se mergea sin él en verde.**

## 9. Pendientes que se llevan al PR

1. Revisión visual con ojos humanos (tarea 24): contraste AA real y áreas
   táctiles medidas en un dispositivo, en la pantalla del código y en las tres
   formas de gracias. El guardián automático cubre el HTML servido, no el
   pixel.
2. [V-1], [V-2] y [V-3] de §1.
3. **Trae migración:** tras el merge hay que correr `migrate deploy` en
   producción.
