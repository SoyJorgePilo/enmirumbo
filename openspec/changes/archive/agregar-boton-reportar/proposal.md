# Propuesta: agregar-boton-reportar

**Ticket:** `docs/tickets/T-011-boton-reportar.md` (E3-4, P0 — última historia P0 del panel)
**PRD:** §6.3 ("Botón 'Reportar' en cada ficha pública para negocios falsos o cerrados", dentro de la revisión manual = verificación + moderación), §8 (anti-abuso sin fricción "en el formulario público y el botón de reportar": honeypot + límite por IP, sin captcha; y el principio de no publicar ni guardar datos personales que no hagan falta), §13 riesgos ("negocios que cierran o cambian de número → mitigación MVP: botón de reporte + revisión manual")

## Por qué

La verificación por WhatsApp del PRD §6.3 se hace una sola vez, al aprobar: después de eso nadie vuelve a mirar la ficha, y un negocio que cerró o que cambió de número se queda publicado con el sello "Negocio verificado" puesto — que es justo la promesa que sostiene el directorio frente a Google Maps. El PRD §6.3 cierra ese hueco con un botón "Reportar" en cada ficha pública y el §13 lo nombra como la mitigación del riesgo de datos desactualizados: los vecinos son los ojos del directorio después de la verificación inicial. Este change agrega ese botón, el mini-formulario anónimo que lo acompaña y la forma en que los reportes llegan a la cola del admin.

## Qué cambia

- **La ficha estrena un control discreto "Reportar este negocio"**, al final de la ficha y en jerarquía claramente menor que "Enviar WhatsApp" (que sigue siendo la única acción principal, spec vigente de `directorio-publico`). No aparece en las tarjetas del listado ni en los resultados de búsqueda: reportar es un acto deliberado sobre una ficha concreta.
- **Mini-formulario en página propia** (`/negocio/<slug>-<id>/reportar`), sin cuenta y sin JavaScript de cliente: un motivo de **lista cerrada** ("Ya cerró", "No es real", "Los datos están mal", "Contenido ofensivo o inapropiado") y un comentario opcional acotado a 300 caracteres, tratado siempre como texto plano. La página no es indexable y responde 404 para cualquier negocio que no esté publicado, con el mismo 404 que una ficha inexistente.
- **Confirmación en español llano** tras enviar, sin revelar nada del estado del negocio ni de otros reportes.
- **Tabla nueva `Reporte`** ligada al negocio (migración): motivo de la lista cerrada, comentario opcional, estado `pendiente | atendido`, fecha de creación y fecha de atención. **Ni un dato del reportante**: no se pide ni se guarda nombre, contacto ni IP; la IP solo se usa en memoria para el cupo, como ya hace el registro.
- **El panel ve los reportes**: la cola suma una sección "Negocios reportados" con su conteo (solo si hay pendientes) y el detalle del negocio lista sus reportes sin atender —motivo, cuándo llegó y comentario escapado como texto—, cada uno con "Marcar como atendido". La acción es idempotente y exige sesión, como toda transición del panel. Qué hace el admin con la información son las herramientas que ya tiene (T-005).
- **Anti-abuso proporcional y sin captcha** (PRD §8), reutilizando `src/lib/registro/limite-ip.ts`: campo trampa (honeypot), cupo propio de 3 reportes por hora y por IP —con la misma política de encabezado declarado: sin `REGISTRO_ENCABEZADO_IP` configurado no se confía en ningún encabezado y ese cupo simplemente no opera— y un tope de 10 reportes pendientes por negocio, pasado el cual los envíos dejan de guardarse sin decírselo a quien reporta. El cupo de reportes es un contador aparte del de altas: agotar uno no consume el otro.
- **Los reportes no tocan lo público**: nada de auto-despublicar, nada de "este negocio tiene 3 reportes" en la ficha, en el listado ni en los resultados. Un reporte solo cambia lo que ve el admin.

## Capacidades afectadas

- `directorio-publico` (ADDED + MODIFIED): se agregan el control de reportar en la ficha, el mini-formulario y su página, la validación server-side, la confirmación, el anti-abuso, la ausencia total de datos del reportante y la garantía de que un reporte no altera ninguna superficie pública. Se modifican el requirement de los botones de contacto (para fijar que "Reportar" no compite con WhatsApp) y el de Server Components/mobile-first/sin JS (para cubrir las pantallas nuevas).
- `revision-admin` (ADDED + MODIFIED): sección de reportes en la cola, lista de reportes sin atender en el detalle y la acción de marcar atendido; se modifican el requirement de sesión obligatoria (la acción nueva entra) y el de operar desde el celular sin JS de cliente.
- `modelo-datos` (ADDED + MODIFIED): tabla `Reporte` con su migración; el borrado definitivo del negocio (ARCO) ahora se lleva también sus reportes.
- `registro-negocio` (MODIFIED): el cupo por IP del formulario queda declarado como contador propio, separado del de reportes, para que un vecino que reportó no se quede sin poder registrar su negocio.

## Impacto en código (alto nivel)

- `prisma/schema.prisma` + migración: modelo `Reporte` (tabla nueva, con CHECK de motivo y de estado como ya se hace con `estado`/`origen` del negocio; ver `design.md` §4). No toca ninguna columna de `Negocio`.
- Módulos nuevos en `src/lib/reportes/`: catálogo cerrado de motivos con sus etiquetas, textos literales, validación del comentario, cupo por IP propio (construido con `crearCupoPorIp` de `src/lib/registro/limite-ip.ts`, sin duplicar lógica) y el procesamiento del reporte.
- `src/app/negocio/[ficha]/reportar/`: página del formulario, Server Action y pantalla de confirmación (POST → `redirect` → GET, el mismo patrón sin JS que usa el panel). `src/app/negocio/[ficha]/page.tsx` suma el control discreto.
- `src/lib/admin/` y `src/app/admin/`: consultas de reportes pendientes (conteo por negocio y lista por negocio), sección en la cola, sección en el detalle y acción de marcar atendido con escritura condicionada al estado.
- `tests/`: suites nuevas de motivos y validación, cupo de reportes (incluida la independencia con el de altas), creación de reportes contra la base de prueba, páginas pública y de panel, y adversarial (POST directo con motivo inventado, comentario con marcado, sin sesión, sin encabezado de IP, fuga de reportes a superficies públicas). `tests/layout.test.ts` suma la ruta nueva a las rutas existentes.

## Fuera de este change

- **Hallazgo confirmado — el panel no tiene "despublicar":** hoy `aprobarRegistro` y `rechazarRegistro` (`src/lib/admin/transiciones.ts`) solo surten efecto sobre registros en `en_revision`; sobre un negocio `publicado` el panel responde "Este registro ya lo habías resuelto.". Es decir, el admin puede leer un reporte y marcarlo atendido, pero **no tiene ninguna herramienta para bajar la ficha de un negocio que ya cerró o que resultó falso**: tendría que tocar la base a mano. El ticket T-011 dejó explícitamente este flujo fuera de alcance ("si no existe despublicar como acción, anotarlo como hallazgo para ticket"), así que este change **no** especifica la transición `publicado → en_revision` ni un estado `despublicado`. Queda en el ticket **T-015**, junto con el borrado definitivo ARCO (E3-6), priorizado enseguida: sin él, el reporte informa pero no repara.
- **Notificaciones al admin** (correo, WhatsApp o alerta) cuando entra un reporte: el admin revisa el panel, con la misma meta de 48 horas.
- **Historial de reportes atendidos en el panel** (hoy la sección lista solo los pendientes) y métricas de reportes por negocio.
- **Reportes con evidencia** (fotos, links) y campo de motivo libre fuera de la lista cerrada.
- **Reportar desde la tarjeta del listado o de los resultados de búsqueda.**
- **Reportes sembrados en el seed de demostración** (`prisma/seed-demo.ts`): el ticket no lo pide y las suites crean sus propias fixtures; si al operar el panel se quiere ver la sección con datos, es un chore de una línea.
- **Purga de reportes por antigüedad**: los reportes no traen datos personales, así que no caen bajo la purga de 90 días del PRD §8; si el volumen crece, se decide con la base de producción (E0-3).
- **Alerta por volumen diario de reportes** (el equivalente a la que ya existe para altas, PRD §8): el tope por negocio y el cupo por IP cubren el abuso que el ticket pide; la alerta de volumen es del ticket de analítica/operación (T-010).

## Dudas resueltas en la aprobación

1. **Despublicar**: aprobado el alcance acotado (reportar + atender). Despublicar y borrado ARCO van juntos en el ticket T-015 (ya creado), priorizado enseguida.
2. **Literales**: aprobados "Reportar este negocio", los motivos coloquiales, y SIN opción "Otro".
3. **Números anti-abuso**: aprobados 3/hora por IP con contador propio, tope de 10 pendientes por negocio, comentario ≤300.
