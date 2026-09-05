# Propuesta: agregar-aviso-diario-pendientes

**Ticket:** `docs/tickets/T-020-notificacion-diaria-pendientes.md` (P1, épica E3)
**PRD:** §6.3 (meta operativa: revisar y responder cada registro en menos de 48 horas), §6.4 (los cambios que manda un negocio entran a la misma cola) y §11 (riesgo "Dependencia del admin", cuya mitigación declarada es "meta de <48 horas y **notificaciones de pendientes**")

## Por qué

Hoy el único lugar donde el admin se entera de que hay algo esperando es la cola del panel: si no se acuerda de abrirla, el registro se atora y el compromiso de <48 h del PRD §6.3 depende de la memoria de una persona (T-020, contexto). El PRD §11 ya nombra "notificaciones de pendientes" como la mitigación de ese riesgo, y durante la campaña puerta a puerta el costo es directo: el negocio que se registró en su puerta espera publicación rápida. Este change agrega el aviso más barato que resuelve eso: **un correo al día, solo si hay pendientes, con conteos y el enlace al panel**.

## Qué cambia

- **Un correo diario al buzón del directorio cuando la cola no está vacía.** Trae el conteo por tipo —"Altas nuevas", "Ediciones" y "Reportes sin atender", las tres cosas que el admin ve esperando en el panel— y el enlace al panel. Si no hay nada esperando, no llega nada: el silencio significa "todo al día".
- **Sin un solo dato personal dentro.** Ni nombres de negocios, ni WhatsApp, ni colonias, ni comentarios de reportes, ni identificadores: el correo viaja por servidores de un tercero y lo único que necesita decir es cuántos hay y a dónde entrar (T-020, criterio 2; LFPDPPP, PRD §8).
- **Sobre la infraestructura de tareas programadas que ya existe.** El aviso viaja en la tarea diaria de la purga de rechazados —mismo `CRON_SECRET`, mismo 404 a quien no lo trae— porque el plan del hosting solo admite dos tareas programadas diarias y `vercel.json` ya declara exactamente dos (`docs/despliegue.md` §6). Esa tarea **se mueve de 09:17 a 13:17 UTC (~07:17 en Tizayuca)**, para que el correo esté en la bandeja al empezar la jornada y no a las tres de la mañana; a la purga esa hora le da igual. Ninguno de los dos trabajos puede tumbar al otro: la purga corre aunque el correo falle, y el correo se intenta aunque la purga no se complete.
- **Proveedor de correo por variables, con el patrón fail-safe del proyecto.** Se elige **Resend** (ver `design.md` §2). Sin configuración utilizable no se manda nada, queda dicho en el log nombrando qué falta, y todo lo demás —incluida la purga— sigue funcionando. Nunca hay un destinatario, un remitente ni un enlace por defecto.
- **El fallo de envío se ve.** Si el proveedor rechaza el envío o no contesta dentro del límite de espera, la tarea responde con error para que el programador de tareas lo registre como fallo, con el motivo en el log y sin datos de nadie.
- **Un correo por día, aunque el disparo se repita.** El "día" es el de Tizayuca (UTC−6 fijo) y el segundo disparo del mismo día no manda un segundo correo; un intento que el proveedor no llegó a aceptar no gasta el día.
- **Variables nuevas documentadas** en `docs/despliegue.md` (§3.2 y §6) y en `.env.example`: `RESEND_API_KEY`, `AVISOS_CORREO_REMITENTE` y `AVISOS_CORREO_DESTINO`. La verificación automática de `tests/despliegue.test.ts` lo exige.

Todos los literales nuevos dicen **"EnMiRumbo"** (rebrand de T-019, `renombrar-sitio-enmirumbo`), sin forma compuesta con la localidad.

## Capacidades afectadas

- **`despliegue`** — ADDED: el requirement del disparo del aviso sobre la tarea programada existente (secreto, 404, independencia entre trabajos, límite de espera y error a la vista) y el de la configuración fail-safe del correo (variables, qué pasa con cada hueco, dónde se documentan, y que el buzón destino nunca vive en el repo). MODIFIED: "La purga de rechazados se dispara sola en producción", que ahora lleva el aviso encima y cuya respuesta dice también en qué quedó.
- **`revision-admin`** — ADDED: el requirement del aviso en sí (solo si hay pendientes, uno al día en la hora de Tizayuca, conteos de los tres tipos con el mismo criterio que las dos secciones de la cola) y el del contenido del correo (asunto y cuerpo literales, sin ningún dato personal).
- **`modelo-datos`** — no cambia: el aviso no agrega tablas ni columnas. La idempotencia del día se resuelve con la clave de idempotencia del proveedor (`design.md` §3).

## Impacto en código (alto nivel)

- **Puerto de correo nuevo** en `src/lib/correo/` con la misma forma que el puerto de fotos (`src/lib/fotos/almacen.ts`): un adaptador Resend cuando la configuración está completa y un adaptador que no manda nada y deja constancia cuando no lo está.
- **Lectura de configuración fail-safe** (las tres variables nuevas más `SITIO_URL`), con el aviso en el log una sola vez por proceso, al estilo de `avisarSinSecretoDeTareasUnaVez` en `src/lib/tareas/secreto.ts`.
- **Conteo de pendientes** reutilizando los criterios que ya viven en `src/lib/admin/consultas.ts` (altas `en_revision` + ediciones pendientes, cada renglón contado una sola vez, más los reportes sin atender de la otra sección de la cola), sin duplicar ninguna regla.
- **Textos del correo** en un módulo propio de literales, como `src/lib/admin/textos.ts`.
- **Enganche** en `src/app/api/tareas/purgar-rechazados/route.ts`: intento de aviso después del trabajo de la purga, con la semántica de respuesta combinada.
- **Horario:** `vercel.json`, la tarea de la purga pasa de `17 9 * * *` a `17 13 * * *`.
- **Documentación:** `docs/despliegue.md` (§3.2, §6 —con la hora nueva— y la prueba de humo de §9) y `.env.example`.
- **Pruebas:** una suite nueva del aviso (contenido, conteos, fail-safe, doble disparo, zona horaria, fallo de envío) y ajustes en `tests/purga-rechazados.test.ts` y `tests/tareas-programadas.test.ts` por la respuesta combinada.

## Fuera de este change

Cosas que aparecieron al escribir la spec y que **no** se especifican aquí:

- **El conteo de atrasados (>48 h) no entra.** El criterio del ticket es "solo el conteo por tipo y el enlace", y un "3 llevan más de 48 horas" en el asunto sería más útil pero es alcance nuevo.
- **Notificación instantánea por alta** (WhatsApp/SMS/push) y **correos hacia el negocio** (confirmaciones, avisos de aprobación): fuera de alcance del propio ticket.
- **Alertas de salud del sistema por correo** (que la purga lleva días fallando, que el barrido se detuvo): hoy eso solo se ve en la pantalla de crons del hosting. Es el mismo canal de correo, pero es otro problema.
- **Un `unsubscribe` o una preferencia de frecuencia:** es un buzón propio del operador, no una lista de correo.

## Decisiones ya resueltas (orquestador, con delegación del fundador)

Se registran aquí porque cambian el alcance y los literales que la spec fija:

1. **El correo llega a las 07:17 de Tizayuca**, no a las 03:17: la tarea de la purga se mueve de 09:17 a 13:17 UTC. Un aviso de madrugada se lee cuando ya se perdió media jornada; a esa hora acompaña el café. A la purga la hora le da igual.
2. **Los reportes sin atender sí cuentan como pendientes.** Son la tercera cosa que espera en la misma pantalla y meterlos ahora sale más barato que abrir otro ticket: una línea más en el cuerpo ("Reportes sin atender: n", omitida cuando es cero), y bastan por sí solos para que el correo salga. Se cuentan por reporte y no por negocio, y no se descuentan cuando el mismo negocio también espera revisión (`design.md` §6).
3. **El buzón destino no es asunto de la spec:** es el valor de `AVISOS_CORREO_DESTINO` al configurar. La recomendación operativa —Gmail directo del admin como destino, `contacto@enmirumbo.com` como remitente o "responder a" cuando Resend verifique el dominio, para no tropezar con SPF en el reenvío— queda escrita en `design.md` §2.

## Dudas abiertas (a resolver antes de aprobar)

1. **Verificar `enmirumbo.com` en Resend es un paso humano previo** (registros DNS en Namecheap). Hasta que exista, el fail-safe hace lo correcto —no manda y lo dice en el log—, pero el aviso simplemente no opera: conviene que el fundador lo haga antes del merge para que la prueba de humo de la tarea 7.1 se pueda cerrar de verdad y no "cuando haya dominio".
2. **La garantía de "un correo al día" se apoya en la clave de idempotencia del proveedor** (`design.md` §3). En la implementación hay que confirmar contra la API real dos cosas: que la ventana cubre 24 horas y que un envío que el proveedor NO aceptó no consume la clave. Si lo segundo no se cumple, el peor caso es que un día con fallo de red el aviso se pierda hasta el día siguiente; si eso no se acepta, el respaldo es una tabla de marcas del día y `modelo-datos` deja de estar intacto.
