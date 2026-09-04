# T-005 · Construir el panel de revisión del admin

**Estado:** en-review
**Prioridad:** P0
**Épica:** E3-1, E3-2, E3-3, E3-5 (docs/backlog.md)
**Referencias PRD:** §6.3, §7 Flujo A (tramo del admin), §8 (LFPDPPP, retención de rechazados)
**Depende de:** T-001, T-003 (hay registros que revisar), T-004 (al aprobar se publica en el directorio)
**OpenSpec change:** `agregar-panel-admin`
**PR:** —

## Contexto

Hoy los registros entran a la cola y ahí se quedan: nadie puede aprobarlos ni publicarlos. El panel es el camino crítico para operar el sitio y el corazón del diferenciador del producto (verificación manual = confianza, PRD §6.3). Es superficie doblemente sensible: muestra datos personales completos de los registros y publica fichas — el acceso se protege con contraseña única por variable de entorno y cookie segura, sin sistema de cuentas (§6.3 y §6.6).

## Criterios de aceptación

- [x] Ruta del panel no indexada, protegida con contraseña única definida en variable de entorno y sesión con cookie segura (HttpOnly, Secure, SameSite); sin contraseña configurada el panel no abre (fail-safe); logout posible
- [x] Cola de revisión: registros `en_revision` (más antiguos primero) con todos los datos capturados y botón que abre WhatsApp del negocio con mensaje prellenado para la verificación manual (PRD §6.3)
- [x] Aprobar: asigna 1-3 giros del catálogo (o ninguno si no embona, Apéndice B), normaliza la colonia si fue "Otra", marca el origen (`siembra`/`organico`), publica la ficha (estado `publicado` + `publicadoEn`) y ofrece abrir WhatsApp prellenado con el aviso y el link de la ficha
- [x] Rechazar: exige motivo, guarda fecha y motivo del rechazo (extender el modelo con `rechazadoEn`/`motivoRechazo` — la migración es parte del cambio) y ofrece abrir WhatsApp prellenado con el aviso y el motivo
- [x] Un negocio rechazado puede volver a `en_revision` si el negocio corrige y reenvía desde el formulario público (mismo WhatsApp: el formulario ofrece reenviar en vez del mensaje de duplicado, PRD §6.3 "puede corregir y volver a enviar")
- [x] Indicador visible de registros con más de 48 horas esperando (meta operativa del PRD §10)
- [x] Las transiciones de estado solo ocurren desde el panel autenticado; cualquier intento sin sesión válida recibe redirección al login sin filtrar datos
- [x] Mobile-first: el admin revisa desde el celular (marcado por construcción —áreas táctiles ≥44px, sin anchos fijos, sin JS de cliente—; **la comprobación visual real a 390px queda para el humano del PR**: no hay pipeline de capturas en el repo)

## Fuera de alcance de este ticket

- Botón "Reportar" en la ficha pública y su cola (E3-4 — ticket propio)
- Purga automática de rechazados a los 90 días (requiere tarea programada → se decide con el hosting en E0-3; el modelo ya guarda `rechazadoEn` para habilitarla)
- Enlace de gestión al aprobar (E8/P1); el aviso por WhatsApp solo incluye el link de la ficha
- Edición de los datos del negocio por el admin (solo normalizar colonia y asignar giros)
- Multi-admin, roles o registro de auditoría

## Notas

- El envío del WhatsApp siempre es manual (abre wa.me prellenado; no hay API de WhatsApp, PRD §6.6).
- La cota "1-3 giros" se valida aquí (el modelo no la impone, spec de T-001).
- Datos de sesión: sin dependencias nuevas si alcanza con cookie firmada (HMAC con secreto de entorno); justificar cualquier librería.
- El caso "reenviar tras rechazo" toca el formulario público (`registro-negocio`): su delta es parte de la spec.
