# T-014 · Habilitar la edición con enlace de gestión

**Estado:** pendiente
**Prioridad:** P1 (antes de escalar; no bloquea el lanzamiento)
**Épica:** E8-1, E8-2, E8-3, E8-4 (docs/backlog.md)
**Referencias PRD:** §6.4, §7 Flujos C y D
**Depende de:** T-005 (panel), T-003 (formulario)
**OpenSpec change:** —
**PR:** —

## Contexto

La autogestión sin cuentas del PRD §6.4: al aprobar, el sistema genera un enlace único y secreto que el admin manda por WhatsApp; con él, el negocio edita su ficha cuando quiera, y los cambios pasan por revisión antes de publicarse. El modelo ya reservó `tokenGestion` desde T-001. Es P1: se construye ahora para que esté listo, pero su merge puede esperar al lanzamiento si hay que priorizar.

## Criterios de aceptación

- [ ] Al aprobar un registro se genera el token de gestión (criptográficamente aleatorio, único) y el mensaje de WhatsApp de aviso incluye el enlace con la instrucción del PRD §6.4 (texto literal en la spec)
- [ ] El enlace abre la ficha en modo edición con el formulario de registro prellenado (mismo formulario, sin lógica aparte); token inválido/inexistente → 404 indistinguible
- [ ] Enviar la edición NO toca la ficha pública: crea una revisión pendiente (tabla o mecanismo que la spec decida) que entra a la cola del admin; la ficha sigue mostrando la versión publicada mientras tanto
- [ ] La cola del admin distingue "alta nueva" de "edición"; aprobar una edición aplica los cambios a la ficha publicada; rechazarla la descarta con motivo (avisos por WhatsApp prellenado como en T-005)
- [ ] El admin puede regenerar el enlace (invalida el anterior) desde el detalle
- [ ] Botón "Perdí mi enlace" en la ficha pública → WhatsApp prellenado al admin (el número del admin es variable de entorno, no hardcodeado)
- [ ] Anti-abuso: el enlace no se puede adivinar (entropía + comparación segura), cupo por IP en el envío de ediciones, y ninguna edición pendiente se filtra a lo público

## Fuera de alcance de este ticket

- Expiración automática de enlaces (el PRD no la pide; regenerar cubre el caso)
- Editar la foto dentro de la edición si T-008 no está mergeado al implementar (coordinar)
- Historial de versiones de la ficha

## Notas

- La "revisión pendiente" es la decisión de diseño central (¿tabla `RevisionEdicion` con snapshot de campos? ¿fila sombra?) — design.md con opciones.
- El consentimiento en ediciones: los datos ya son públicos con consentimiento vigente; la edición no re-consiente (coordina con la protección de `consintioAvisoEn` y con T-012 si ya existe).
