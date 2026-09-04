# Propuesta: agregar-despublicar-y-borrado-arco

**Ticket:** `docs/tickets/T-015-despublicar-y-arco.md` (E3-6 + hallazgo de T-011, P0 — criterio de lanzamiento)
**PRD:** §6.3 (revisión manual = verificación + moderación; "se rechazan —o se retiran, si ya estaban publicadas— las fichas que…", botón "Reportar" como disparador), §8 ("Operación ARCO y retención: las solicitudes de acceso, corrección o eliminación llegan por el WhatsApp del admin y se atienden en ≤20 días hábiles; **el panel permite el borrado definitivo (no solo despublicar)**; … las fichas retiradas a solicitud del negocio, de inmediato")

## Por qué

El panel aprueba y rechaza registros en revisión, pero no puede tocar una ficha ya publicada: `aprobarRegistro` y `rechazarRegistro` (`src/lib/admin/transiciones.ts`) solo surten efecto sobre `en_revision`, así que sobre un negocio publicado el panel contesta "Este registro ya lo habías resuelto." Bajar la ficha de un negocio que cerró o que resultó falso, o borrar un registro porque su dueño lo pidió, hoy sería tocar SQLite a mano — inaceptable con el sitio lanzado, y justo lo que el PRD §8 pide que el panel haga.

Además, el aviso de privacidad **ya publicado** promete las dos cosas con estas palabras exactas (`openspec/specs/paginas-legales/spec.md`, "Cómo limitar el uso o la divulgación de tus datos"): *"Pide que despubliquemos tu ficha: en cuanto nos llega tu mensaje la bajamos del directorio, sin trámites ni explicaciones."*, *"Pide que borremos todo: eliminamos tu registro de forma definitiva, no solo lo escondemos."* y *"Te contestamos en un máximo de 20 días hábiles y, si tu solicitud procede, la aplicamos en cuanto te respondemos."*; los términos rematan con *"Y si el propio negocio nos pide que la bajemos, la bajamos de inmediato."* Ese compromiso está declarado hoy como **pendiente operativo** en `PENDIENTES_OPERATIVOS_LEGALES` ("Se hace a mano contra la base: el panel solo aprueba y rechaza", ticket "E3-6 (flujo ARCO en el panel)"). Este change es el que vuelve verdad operativa esas frases y retira ese pendiente.

## Qué cambia

- **Despublicar una ficha publicada, con motivo obligatorio.** Desde el detalle de un negocio `publicado`, la acción "Despublicar" lo regresa a `en_revision` y guarda la fecha y el motivo. La escritura va **condicionada al estado** (`updateMany` con `estado: publicado` en el `where`, mismo patrón de T-005): despublicar dos veces no sobrescribe nada y el panel lo dice. La ficha desaparece del directorio, del buscador y de cualquier índice generado desde lo publicado en la misma petición siguiente, y su URL responde el 404 indistinguible que ya sirve para los registros en revisión.
- **La ficha despublicada vuelve a la cola, marcada como lo que es.** No se inventa un estado nuevo: reusar `en_revision` reusa el detalle, el aprobar y el rechazar que ya existen (ver `design.md` §1). Para que la cola no mienta, el renglón trae la etiqueta literal "Ya estaba publicada, la despublicaste" y su espera se cuenta desde la despublicación, no desde el registro original (que se conserva intacto).
- **Nada del trabajo del admin se pierde al despublicar:** los giros asignados y `publicadoEn` se conservan (`publicadoEn` pasa a significar "la última vez que estuvo publicada"), y el formulario de aprobar trae marcados los giros que la ficha ya tenía, para que republicar no los borre en silencio (`design.md` §2).
- **Aviso al negocio por WhatsApp**, con el mismo patrón de T-005: botón "Avisarle por WhatsApp" con mensaje prellenado que incluye el motivo. Lo manda la persona, nunca el sistema (PRD §6.6).
- **Borrado definitivo (ARCO) con confirmación de dos pasos y sin JavaScript de cliente:** el detalle lleva a una pantalla propia de confirmación (paso 1, que no borra nada), donde el admin escribe la palabra `BORRAR` y toca "Sí, borrar para siempre" (paso 2). El borrado se lleva la fila, los vínculos con giros, los reportes (T-011) y el archivo de la foto si algún día existe (T-008). Es idempotente: borrar dos veces no truena, y no queda ni un dato del negocio en la URL de la pantalla de confirmación final ni en el log.
- **El flujo ARCO queda documentado y a la vista:** la pantalla de confirmación recuerda, con texto literal, que antes de borrar hay que confirmar la titularidad por WhatsApp desde el número registrado y que el plazo de respuesta es de 20 días hábiles. El procedimiento completo (solicitud por WhatsApp/correo → verificación humana → borrado → respuesta) queda escrito en la spec de `revision-admin` y en `design.md` §4.
- **Sesión obligatoria y cero superficie pública:** las dos acciones y la pantalla de confirmación exigen sesión válida antes de leer o escribir nada; un POST sin cookie no despublica, no borra y no confirma si el identificador existe.
- **Contexto para decidir:** las acciones viven en el detalle, debajo de los reportes sin atender que agrega el change `agregar-boton-reportar`, de modo que el admin lee el reporte y actúa en la misma pantalla.

## Capacidades afectadas

- `revision-admin` (ADDED + MODIFIED): se agregan despublicar con motivo, su aviso por WhatsApp, el borrado definitivo en dos pasos con el recordatorio del trámite ARCO, la sesión obligatoria de ambas acciones y la regla de qué acciones se ven según el estado. Se modifican la cola y el indicador de 48 horas (para que la espera de una ficha despublicada cuente desde la despublicación), el detalle (muestra cuándo y por qué se despublicó) y el requirement de aprobar (los giros que ya tenía llegan marcados; republicar actualiza `publicadoEn`).
- `modelo-datos` (ADDED + MODIFIED): campos `despublicadoEn` y `motivoDespublicacion` con su migración; `publicadoEn` queda definido como la última publicación y sobrevive a la despublicación; el borrado definitivo se declara como arrastre completo (giros, reportes y archivos).
- `directorio-publico` (MODIFIED): una ficha despublicada o borrada desaparece de inmediato de listados, conteos, filtro de colonias y buscador, y su URL responde el mismo 404 que una ficha inexistente.
- `paginas-legales` (MODIFIED): la lista de pendientes operativos pierde el renglón del flujo ARCO en el panel (queda solo la purga de rechazados a los 90 días, E0-3/T-013).

## Impacto en código (alto nivel)

- `prisma/schema.prisma` + migración: dos columnas nuevas y nulables en `Negocio` (`despublicadoEn`, `motivoDespublicacion`), sin tocar ninguna existente ni los CHECK de `estado` y `origen`.
- `src/lib/admin/transiciones.ts`: `despublicarFicha` (condicionada a `publicado`) y `borrarNegocio` (`deleteMany` por id, idempotente), con el mismo tipo de resultado discriminado que ya usan aprobar y rechazar.
- `src/lib/admin/textos.ts`: literales nuevos (botones, rótulos, errores, confirmaciones, recordatorio ARCO y plantilla de WhatsApp de despublicación).
- `src/lib/admin/consultas.ts`: la cola devuelve el reloj de espera desde la entrada a la cola y la marca de "ya estaba publicada"; el detalle suma fecha y motivo de despublicación.
- `src/app/admin/registros/[id]/`: Server Actions de despublicar y borrar, pantalla `despublicado` (aviso por WhatsApp, hermana de `aprobado`/`rechazado`), pantalla `borrar` (confirmación) y pantalla de borrado hecho sin datos del negocio.
- `src/components/admin/`: formulario de despublicar, bloque de acciones por estado y pantalla de confirmación del borrado.
- `src/lib/legales/textos.ts`: se retira el pendiente operativo de E3-6 de `PENDIENTES_OPERATIVOS_LEGALES`.
- `tests/`: suites de transiciones (despublicar condicionado, borrado idempotente y en cascada), de las pantallas nuevas, de la cola con fichas despublicadas, adversarial (POST sin sesión, borrado sin la palabra, borrado por GET) y de no fuga (nada del negocio borrado en URL ni log).

## Coordinación con los changes en curso

- `agregar-boton-reportar` (T-011, en spec) y `agregar-enlace-de-gestion` (T-014) también modifican el requirement **"Borrado definitivo de un negocio (operación ARCO)"** de `modelo-datos`. El delta de este change está redactado como **superset** (fila + giros + reportes + ediciones pendientes + archivos): al consolidar en `openspec/specs/`, se conserva la unión, no el último que mergea.
- `agregar-boton-reportar` modifica los requirements **"Toda pantalla y toda acción del panel exigen sesión válida"** y **"El panel se opera desde el celular y sin JavaScript de cliente innecesario"** de `revision-admin` para sumar "marcar un reporte como atendido". Para no pelear por el mismo texto, este change **no** los modifica: la sesión y el mobile-first/sin-JS de las acciones nuevas se especifican en requirements propios. Al consolidar, la lista entre paréntesis de esos dos requirements debe quedar con las cinco acciones (aprobar, rechazar, marcar atendido, despublicar y borrar).
- El requirement **"Una transición solo se aplica sobre un registro que sigue en revisión"** se deja intacto: sigue siendo verdad para aprobar y rechazar. La condición de estado de las acciones nuevas vive en sus propios requirements.

## Fuera de este change

- **Cómo llega el admin al detalle de una ficha publicada.** Hoy el panel solo enlaza registros `en_revision` (la cola), y `agregar-boton-reportar` sumará el enlace "Ver reportes" para los reportados. Para una solicitud ARCO que llega por WhatsApp sin reporte de por medio, el camino operativo es: abrir la ficha pública del negocio, copiar el identificador del final de la URL (`/negocio/<slug>-<id>`) y abrir `/admin/registros/<id>`. **Funciona, pero es incómodo desde el celular**: un buscador de fichas dentro del panel (por nombre o WhatsApp) es la solución natural y no está en los criterios de este ticket. Queda anotado como candidato a ticket propio (ver duda 1).
- **Papelera o recuperación** del borrado: es definitivo por diseño ARCO (fuera de alcance del ticket).
- **Purga automática de los registros rechazados a los 90 días** (E0-3/T-013): sigue siendo pendiente operativo declarado en las páginas legales.
- **Registro de auditoría** de las acciones del admin (quién despublicó o borró y cuándo). El repo tiene un solo admin y el ticket lo deja fuera; si algún día hay más de uno, es lo primero que hace falta.
- **Republicar en un clic** (`en_revision → publicado` sin volver a pasar por el formulario de aprobar): republicar hoy es aprobar de nuevo, que ya sirve.
- **Avisar al negocio del borrado**: el borrado nace de una solicitud del propio dueño, así que la respuesta va en la misma conversación de WhatsApp que la pidió; el panel no ofrece plantilla porque después del borrado ya no hay número que abrir.
- **Notificación o alerta al admin** cuando una ficha lleva mucho despublicada en la cola: la cola ya la muestra con su etiqueta y su indicador de 48 horas.
- **Sitemap**: todavía no existe (el ticket de SEO local no está escrito). El delta de `directorio-publico` deja fijada la regla —lo que se despublica sale de cualquier índice generado desde lo publicado— para que el sitemap nazca cumpliéndola.

## Dudas resueltas en la aprobación

1. **Llegar a una ficha publicada sin reporte**: se acepta el rodeo por URL para el MVP (casos ARCO son excepcionales). "Buscador de fichas en el panel" queda anotado como mejora futura en el backlog.
2. **Motivo literal al negocio**: aprobada la consistencia con T-005, con un ajuste obligatorio: el campo del motivo DEBE rotularse "Este motivo se le enviará al negocio por WhatsApp." (texto de ayuda visible), para que ninguna nota interna viaje por accidente. Incorporarlo al requirement correspondiente.
3. **Literales**: aprobados tal cual, y la confirmación tecleando `BORRAR` (ignorando mayúsculas/espacios) gana sobre el estilo "escribe el nombre" — los acentos en móvil son un suplicio real.
