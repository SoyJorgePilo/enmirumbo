# T-011 · Agregar el botón "Reportar" en la ficha pública

**Estado:** en-desarrollo
**Prioridad:** P0
**Épica:** E3-4 (docs/backlog.md)
**Referencias PRD:** §6.3 ("Botón Reportar en cada ficha pública para negocios falsos o cerrados")
**Depende de:** T-004 (ficha), T-005 (panel)
**OpenSpec change:** `agregar-boton-reportar`
**PR:** —

## Contexto

Última historia P0 del panel: los vecinos son los ojos del directorio después de la verificación inicial. Un negocio cerrado o falso debe poder señalarse desde su ficha, y el reporte cae a la cola del admin para que decida (despublicar, contactar, ignorar). Sin cuentas: el reporte es anónimo, lo que obliga a anti-abuso proporcional.

## Criterios de aceptación

- [ ] La ficha pública tiene el botón "Reportar" (discreto: no compite con WhatsApp) que lleva a un mini-formulario sin cuenta: motivo de lista cerrada (ej. "Ya cerró", "No es real", "Datos incorrectos", "Contenido inapropiado") + comentario opcional acotado
- [ ] El envío crea un reporte ligado al negocio (tabla nueva — migración) y muestra confirmación en español llano; funciona sin JS
- [ ] El panel del admin muestra los reportes: contador/sección en la cola y el detalle del negocio lista sus reportes pendientes; el admin puede marcarlos como atendidos (qué hizo al respecto queda fuera: sus herramientas son las de T-005)
- [ ] Anti-abuso: honeypot + cupo por IP (reutilizar `limite-ip`), tope de reportes pendientes por negocio, y los reportes NO afectan la ficha pública automáticamente (nada de auto-despublicar)
- [ ] Ningún dato del reportante se solicita ni se guarda (ni nombre ni contacto); la IP solo para el cupo, no persistida
- [ ] Validación server-side de motivo (lista cerrada) y comentario (cota, texto plano)

## Fuera de alcance de este ticket

- Notificaciones al admin (revisa el panel, meta de 48h)
- Flujo de resolución más allá de "atendido" (despublicar ya existe vía panel… si no existe despublicar como acción, anotarlo como hallazgo para ticket)
- Reportes con evidencia (fotos, links)

## Notas

- Toca ficha pública (`src/app/negocio/`), panel (`src/app/admin/`) y modelo (tabla `Reporte`) — coordinar el orden de merge con los PRs de foto y SEO abiertos (mismo territorio de ficha).
- El comentario libre se muestra SOLO en el panel (superficie autenticada) — mismo tratamiento de escape que el resto de datos capturados.
- **Hallazgo confirmado al especificar (2026-09-04): el panel NO tiene acción de despublicar.** `aprobarRegistro` y `rechazarRegistro` (`src/lib/admin/transiciones.ts`) solo surten efecto sobre registros en `en_revision`; sobre una ficha `publicado` el panel responde "Este registro ya lo habías resuelto.". El admin podrá leer y atender reportes, pero no bajar la ficha de un negocio que cerró o resultó falso sin tocar la base a mano. Conforme al "fuera de alcance" de este ticket, queda como **ticket propio de E3** (transición `publicado → en_revision` o estado `despublicado`), a priorizar junto con este.
