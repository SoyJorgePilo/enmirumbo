# Decisiones técnicas: agregar-despublicar-y-borrado-arco

Solo lo que no se cae de maduro. Todo lo demás sigue los patrones ya escritos en `openspec/changes/archive/agregar-panel-admin/design.md`.

## 1. A qué estado va una ficha despublicada: `en_revision`, no un estado nuevo

El ticket deja abierto el destino ("regresa a `en_revision` o el estado que la spec justifique").

- **`en_revision` (elegida).** Reusa todo lo que ya existe: el detalle, el formulario de aprobar (que es el camino de republicar), el de rechazar (que es el camino de "esta ficha era falsa, ahora que se purgue a los 90 días") y la cola como lugar donde no se olvida. Cero migración de estados, cero CHECK nuevo, cero superficie pública que aprender un cuarto valor.
- **Estado `despublicado` (descartada).** Obliga a: migrar el CHECK de `estado`, decidir si el directorio lo trata como `rechazado` en cada consulta, inventar una pantalla y una acción de "republicar" (que el ticket no pide) y explicar la diferencia entre "en revisión" y "despublicado" a un panel de un solo admin. Más superficie por un matiz que la etiqueta de la cola resuelve.

El costo de reusar `en_revision` es que la ficha despublicada entra a la cola de "Registros por revisar", que estaba pensada para registros nuevos. Se paga con dos cosas, ambas en la spec: la etiqueta literal "Ya estaba publicada, la despublicaste" en su renglón, y el reloj de espera de §3.

**Efecto colateral que sí importa:** mientras está despublicada, su WhatsApp cuenta como "ficha en revisión" para el formulario público (`registro-negocio`, requirement "Una sola ficha por número de WhatsApp"), así que si el dueño intenta registrarse de nuevo ve "Este número ya tiene una ficha registrada…". Es el comportamiento correcto: la ficha existe y el trámite se resuelve por WhatsApp con el admin, no creando un duplicado.

## 2. Qué se conserva al despublicar: `publicadoEn` y los giros

- **`publicadoEn` se conserva.** Nada depende de que sea nulo: toda superficie pública filtra por `estado` (`src/lib/directorio.ts`), y ninguna consulta usa `publicadoEn` para decidir visibilidad —solo para ordenar los listados (`orderBy: [{ publicadoEn: "desc" }, …]`), que ni siquiera ve a los no publicados. Borrarlo destruiría el único rastro de que la ficha estuvo publicada, que es justo el dato que el admin necesita al ver esa fila en la cola. Su significado pasa de "cuándo se publicó" a **"la última vez que estuvo publicada"**: nulo solo si nunca se publicó, y sobrescrito por el `updateMany` de aprobar cuando se republica (lo que además la manda arriba del listado, que es razonable para una ficha que reaparece).
- **Los giros se conservan.** Son trabajo de clasificación del admin y no hay ninguna superficie que muestre giros de fichas no publicadas. Pero `aprobarRegistro` hace `giros: { set: [...] }` con lo que venga del formulario: republicar sin marcar nada los borraría en silencio. Por eso el formulario de aprobar debe llegar con los giros actuales marcados (requirement modificado). Es la única forma de que "despublicar no destruye nada" sea verdad de punta a punta.

## 3. El reloj de la cola: `max(registradoEn, despublicadoEn)`

La cola ordena por antigüedad y marca "Lleva más de 48 horas" contando desde `registradoEn`. Una ficha registrada hace ocho meses y despublicada hoy entraría hasta arriba, marcada como atrasada: la cola mentiría todos los días.

Opciones consideradas:

- **Pisar `registradoEn` con la fecha de la despublicación.** Hay precedente (el reenvío tras rechazo lo hace, `src/lib/registro/procesar.ts` §4b) pero ahí se justifica porque el negocio **volvió a enviar** sus datos: es un registro nuevo sobre la misma fila. Despublicar no es un envío de nadie; pisar la fecha falsearía la constancia de cuándo se registró ese negocio, que el detalle muestra y que el aviso de privacidad nombra como dato guardado.
- **`despublicadoEn ?? registradoEn` (descartada).** Se rompe en la secuencia despublicada → rechazada → el dueño corrige y reenvía: el reenvío reinicia `registradoEn` pero el `despublicadoEn` viejo seguiría mandando, y la ficha entraría a la cola marcada como atrasada desde el primer minuto.
- **`max(registradoEn, despublicadoEn)` (elegida).** "La espera se cuenta desde que el registro entró a la cola." Sobrevive a cualquier orden de eventos sin necesidad de limpiar el rastro de la despublicación en tres flujos distintos (aprobar, rechazar y el reenvío público, que además vive en otra capacidad).

Corolario: **el rastro de la despublicación no se limpia nunca**, solo se sobrescribe en la siguiente despublicación. Queda como historia útil en el detalle ("esta ficha ya la bajaste una vez, por esto") y no puede confundir a la cola.

## 4. La confirmación de dos pasos sin JavaScript de cliente

El panel es estricto: Server Components y formularios que funcionan con el JS deshabilitado (requirement vigente). Así que nada de `confirm()`, nada de modal, nada de `"use client"`.

Los dos pasos son **dos pantallas**:

1. En el detalle, "Borrar definitivamente" es un enlace/`form` de navegación a `/admin/registros/<id>/borrar`. **Ese paso no borra nada**: es un GET y un GET nunca tiene efectos.
2. La pantalla de confirmación explica lo que se va a perder, recuerda el trámite ARCO, pide escribir la palabra `BORRAR` y ofrece "Sí, borrar para siempre" (POST) y "Mejor no, regresar".

Por qué escribir una palabra y no solo un segundo botón: el segundo botón es un doble toque, y en un celular un doble toque es un accidente creíble. Escribir `BORRAR` obliga a leer. Por qué `BORRAR` y no el nombre del negocio (el patrón de GitHub): el nombre puede traer acentos, comillas o emojis y se teclea fatal en un celular; el objetivo es que el admin se detenga, no que sufra. La comparación ignora mayúsculas/minúsculas y espacios de sobra, pero no acepta ninguna otra palabra.

Después del borrado no hay fila que leer, así que la pantalla final no puede ser `/admin/registros/<id>/…`: es una pantalla propia que solo confirma, **sin nombre ni WhatsApp en la URL** (una URL viaja al log de acceso del hosting; el requirement de que los datos personales no salgan del panel también aplica ahí).

## 5. Escrituras condicionadas, igual que T-005

- **Despublicar:** `updateMany({ where: { id, estado: publicado }, data: { estado: en_revision, despublicadoEn, motivoDespublicacion } })`. `count === 0` significa "ya no estaba publicada" (otra pestaña, doble toque, o el negocio nunca estuvo publicado). No hay `findUnique` + `update`: esa pareja deja la ventana de carrera que el design de T-005 ya descartó.
- **Borrar:** `deleteMany({ where: { id } })`. `count === 0` significa "ya no existe". Un `delete` lanzaría, y una excepción dentro de una Server Action es un 500.
- **Cascada:** el arrastre de giros, reportes y ediciones pendientes se resuelve en el esquema (`onDelete: Cascade` en las relaciones y la implícita de giros), no a mano en la acción. Una relación nueva que alguien agregue después sin cascada rompería el borrado ARCO: por eso la spec de `modelo-datos` lo escribe como invariante del modelo, no como paso de la acción.

## 6. "De inmediato" en el directorio público

Hoy todas las páginas públicas son `force-dynamic` (`src/app/page.tsx`, `src/app/[categoria]/page.tsx`, `src/app/negocio/[ficha]/page.tsx`, `/buscar`), así que despublicar surte efecto en la siguiente petición sin invalidar ningún caché. No hace falta `revalidatePath`. Si algún día se agrega caché, ISR o un sitemap generado, el requirement de `directorio-publico` es el que obliga a que la despublicación siga siendo inmediata.

## 7. El flujo ARCO completo (lo que el software no hace)

El botón es la última pieza de un trámite que es humano de principio a fin:

1. **Llega la solicitud** por el WhatsApp del directorio o por el correo ARCO, los dos canales que publica el aviso de privacidad.
2. **El admin verifica la titularidad**: la solicitud tiene que venir del mismo número de WhatsApp con el que se registró el negocio (es lo que el aviso ya promete: *"antes de cambiar o borrar algo confirmamos que la solicitud viene del mismo número de WhatsApp con el que se registró el negocio"*). Si llega por correo, el admin escribe al número registrado y confirma ahí. Es el mismo criterio de la verificación del alta: humana, por WhatsApp.
3. **El admin ejecuta**: despublicar si lo que se pidió es bajar la ficha (el aviso promete hacerlo *"en cuanto nos llega tu mensaje"*), borrado definitivo si lo que se pidió es cancelación.
4. **El admin contesta** en la misma conversación, dentro de los **20 días hábiles** que promete el aviso, aunque en la práctica sea el mismo día.

Nada de esto se automatiza ni se registra en la base en este change: no hay tabla de solicitudes ARCO ni bitácora. El único rastro que queda es la ficha despublicada con su motivo, o la ausencia de la fila borrada. Si el volumen de solicitudes crece, la bitácora es un ticket propio (y probablemente la única forma de demostrar el cumplimiento del plazo ante la autoridad).
