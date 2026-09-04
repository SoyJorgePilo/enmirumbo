# Propuesta: agregar-panel-admin

**Ticket:** `docs/tickets/T-005-panel-admin.md` (E3-1, E3-2, E3-3, E3-5; P0)
**PRD:** §6.3 (cola de revisión, verificación por WhatsApp antes de publicar, aprobar con 1-3 giros + normalizar colonia + marcar origen, rechazar con motivo y posibilidad de corregir y reenviar, acceso por contraseña de entorno con cookie segura y sin cuentas), §7 Flujo A (el tramo "el admin lo contacta por WhatsApp para confirmar → se publica la ficha"), §8 (LFPDPPP: datos personales, retención de rechazados a 90 días, accesibilidad y mobile-first), §10 (meta operativa de <48 horas entre registro y publicación, y origen `siembra`/`organico` para separar las métricas)

## Por qué

Con el registro (T-003) y el directorio (T-004) en pie, los negocios entran a la cola y ahí se quedan: nadie puede aprobarlos, así que el directorio nunca publica una ficha y el Flujo A del PRD §7 está cortado justo antes de su último paso. La revisión manual no es un trámite interno: es el diferenciador de confianza del producto frente a Google Maps y los agregadores scrapeados (PRD §6.3), y sin panel no existe. Además es la superficie más sensible del sitio —muestra datos personales completos y publica fichas—, así que se protege como pide el PRD §6.3: ruta no indexada, contraseña única por variable de entorno y sesión con cookie segura, sin sistema de cuentas (§6.6).

## Qué cambia

- **Panel protegido en `/admin`**, con pantalla de acceso por contraseña única definida en variable de entorno y sesión sostenida por una cookie firmada (HttpOnly, `Secure` en HTTPS, SameSite, acotada a la ruta del panel) con caducidad y botón para salir. Sin contraseña o sin secreto de firma configurados, el panel no abre para nadie: es un fail-safe, no un panel abierto.
- **Cola de revisión**: los registros en `en_revision`, más antiguos primero, con indicador visible de los que llevan más de 48 horas esperando (meta operativa del PRD §10) y el detalle de cada registro con todos los datos capturados, incluidos los que el directorio público nunca muestra.
- **Verificación manual por WhatsApp**: desde el detalle, un botón abre `wa.me` con el número del negocio y un mensaje prellenado para confirmar que el negocio existe y que el número le pertenece. El envío siempre lo hace la persona: no hay API de WhatsApp (PRD §6.6).
- **Aprobar publica la ficha**: asigna de 1 a 3 giros del catálogo (o ninguno si no embona, Apéndice B; la cota se valida aquí porque el modelo no la impone), normaliza la colonia cuando el negocio escribió "Otra", marca el origen (`siembra`/`organico`), pone estado `publicado` con su fecha de publicación y ofrece abrir WhatsApp prellenado con el aviso y el link de la ficha.
- **Rechazar exige motivo**: guarda fecha y motivo del rechazo —campos nuevos del modelo, con su migración— y ofrece abrir WhatsApp prellenado con el aviso y ese motivo.
- **El negocio rechazado puede corregir y volver a enviar** desde el formulario público con el mismo número: en vez del mensaje de duplicado, el envío actualiza su ficha y la regresa a la cola en `en_revision` (PRD §6.3).
- **Ninguna transición fuera del panel autenticado**: toda página y toda acción del panel exigen sesión válida; sin ella hay redirección a la pantalla de acceso, sin filtrar ni un dato del registro y sin cambiar nada en la base.
- **Mobile-first**: el admin revisa desde el celular, así que la cola, el detalle y los formularios de aprobar/rechazar se diseñan para 390px.

## Capacidades afectadas

- `revision-admin` (nueva, ADDED): acceso y sesión, fail-safe sin configuración, cola con indicador de 48 horas, detalle con datos completos, verificación por WhatsApp, aprobación con giros/colonia/origen, rechazo con motivo, transiciones solo autenticadas, panel fuera de los buscadores y mobile-first.
- `modelo-datos` (MODIFIED): el ciclo de vida del negocio suma `rechazadoEn` y `motivoRechazo`, con migración sobre la base existente; habilitan la purga de rechazados a los 90 días que el PRD §8 exige y que se implementará cuando haya tarea programada (E0-3).
- `registro-negocio` (MODIFIED): "una sola ficha por número" deja de ser un no absoluto — si la ficha de ese número está `rechazado`, el envío la actualiza y la regresa a revisión en vez de mostrar el mensaje de duplicado, que sigue igual para fichas `publicado` y `en_revision`.
- `directorio-publico`: se consume sin cambios (una ficha aprobada aparece sola en los listados, que ya filtran por estado `publicado`).

## Impacto en código (alto nivel)

- Migración de Prisma nueva (`rechazadoEn`, `motivoRechazo`, ambos opcionales) y regeneración del cliente; el seed de demostración pobla ambos en su negocio rechazado.
- Rutas nuevas bajo `src/app/admin/`: acceso, cola y detalle del registro, todas Server Components con lectura dinámica.
- Módulos nuevos en `src/lib/admin/`: configuración y fail-safe, firma y verificación de la cookie de sesión (HMAC con `node:crypto`, sin dependencias nuevas), guarda de sesión compartida por páginas y acciones, consultas de la cola, transiciones (aprobar/rechazar) y textos literales del panel, incluidas las plantillas de los tres mensajes de WhatsApp.
- `src/lib/registro/procesar.ts`: el caso "ya existe ficha con este número" se bifurca según el estado de la ficha existente.
- `src/lib/enlaces.ts` o módulo hermano: enlaces `wa.me` con mensaje prellenado propio del panel (el mensaje del vecino no sirve aquí).
- `.env.example`: variables nuevas de contraseña, secreto de sesión y URL pública del sitio (el aviso de aprobación manda el link absoluto de la ficha), documentadas con su comportamiento fail-safe.
- Tests nuevos: sesión (token válido, alterado, caducado, secreto distinto), fail-safe, guarda en todas las rutas y acciones del panel, orden y marca de 48 horas de la cola, aprobación y rechazo (incluida la cota 1-3 y la colonia pendiente), reenvío tras rechazo, y privacidad (ningún dato del registro en la respuesta cuando no hay sesión).
- Sin dependencias nuevas.

## Fuera de este change

- **Botón "Reportar" en la ficha pública y su cola** (E3-4): ticket propio, como dice T-005.
- **Purga automática de rechazados a los 90 días** (PRD §8): necesita tarea programada, que se decide con el hosting en E0-3. Este change solo deja guardada la fecha del rechazo que la habilita.
- **Borrado definitivo desde el panel (derechos ARCO, PRD §8)**: el modelo ya lo soporta (`modelo-datos`) pero T-005 no lo pide en sus criterios ni lo lista como fuera de alcance. Hoy una solicitud de borrado se atendería a mano contra la base: conviene un ticket propio antes del lanzamiento, porque el PRD lo compromete en ≤20 días hábiles.
- **Enlace de gestión al aprobar** (E8/P1): el aviso por WhatsApp solo lleva el link de la ficha.
- **Edición de los datos del negocio por el admin**: solo se normaliza la colonia y se asignan giros.
- **Multi-admin, roles, registro de auditoría y recuperación de contraseña**: sin sistema de cuentas (PRD §6.6). Si el proyecto suma admins, se revisa (PRD §6.3).
- **Despublicar o volver a revisión una ficha ya publicada**: no está en los criterios del ticket.
- **Notificación automática al negocio**: el WhatsApp siempre lo manda la persona desde `wa.me` prellenado.
- **`robots.txt` del sitio** (E5, `seo-local`): aquí el panel se protege con la metadata `noindex, nofollow` de sus propias páginas y con no enlazarlo desde ninguna página pública.
- **Alerta al admin dentro del panel cuando las altas del día superan el umbral**: hoy es una advertencia en el log del servidor (T-003) y ahí se queda.

## Dudas resueltas en la aprobación

1. **Mensajes de WhatsApp prellenados**: aprobados los tres textos literales de la spec (verificación, aviso de publicación con link de ficha, aviso de rechazo con motivo). Son editables después sin migración; si el humano quiere ajustar el tono tras usarlos en la siembra, será un change de copy.
2. **Motivo del rechazo**: texto libre obligatorio basta para el MVP. Los atajos con las reglas de moderación del PRD §6.3 quedan como mejora futura si la operación los pide.
3. **Reenvío tras rechazo**: aprobado — pisa los datos anteriores, borra `rechazadoEn`/`motivoRechazo` (correcto: si no, la purga de 90 días se llevaría un registro que volvió a la cola) y reinicia el reloj de 48 h. El historial del rechazo previo no se necesita en el MVP (sin auditoría, fuera de alcance del ticket).
4. **Sesión de 8 horas**: aprobada — cubre una jornada de revisión sin re-login y caduca sola.
