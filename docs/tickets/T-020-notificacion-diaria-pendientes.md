# T-020 · Avisar por correo al admin cuando haya registros pendientes

**Estado:** en-spec <!-- pendiente | en-spec | en-desarrollo | en-review | hecho -->
**Prioridad:** P1
**Épica:** E3 (docs/backlog.md)
**Referencias PRD:** §6.3 (meta operativa de revisión <48h)
**Depende de:** T-019
**OpenSpec change:** `agregar-aviso-diario-pendientes`
**PR:** —

## Contexto

Hoy el único lugar donde se entera el admin de un registro nuevo es la cola del panel: no hay correos ni notificaciones, y el compromiso de revisar en <48h depende de que se acuerde de abrirla. Durante la campaña puerta a puerta eso es frágil: el negocio que se registró en su puerta espera publicación rápida. El fundador pidió (2026-09-04) un aviso simple que no lo obligue a vigilar el panel.

## Criterios de aceptación

- [ ] Una vez al día, si hay al menos un registro en revisión (alta nueva o edición pendiente), llega UN correo al buzón del directorio con el conteo y el enlace al panel. Si no hay pendientes, no llega nada.
- [ ] El correo NO contiene datos personales de los negocios (ni nombres, ni teléfonos): solo el conteo por tipo y el enlace — el correo viaja por servidores de terceros.
- [ ] Se dispara desde la infraestructura de tareas programadas existente (`CRON_SECRET`, mismas reglas de 404 a extraños).
- [ ] Proveedor de correo configurable por variables de entorno con el patrón fail-safe del proyecto: sin configurar, el sistema no manda nada, lo dice en el log y todo lo demás sigue funcionando.
- [ ] Si el envío falla, el cron responde error a la vista (sin tumbar las otras tareas programadas).

## Fuera de alcance de este ticket

- Notificación instantánea por alta (empujón por WhatsApp/SMS/push): otra complejidad y otro costo; evaluar con datos reales.
- Correos al negocio que se registra (confirmaciones, avisos de aprobación — eso sigue siendo por WhatsApp manual del admin).
- Resúmenes de métricas o reportes por correo.

## Notas

- Candidato natural de proveedor: Resend (capa gratis suficiente para 1 correo/día, dominio propio verificable con los DNS de Namecheap) — la spec decide.
- El buzón destino natural es `contacto@enmirumbo.com` (reenvía al Gmail del fundador), pero conviene variable aparte para poder cambiarlo sin redeploy de código.
- Documentar las variables nuevas en `docs/despliegue.md` (la prueba `tests/despliegue.test.ts` lo exige).
