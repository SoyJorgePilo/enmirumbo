# T-016 · Construir la verificación SMS del número tras bandera

**Estado:** en-review
**Prioridad:** P1 (no bloquea el lanzamiento: nace apagada)
**Épica:** derivada de PRD v0.9 / ADR-011
**Referencias PRD:** §6.3 (la revisión manual no cambia de dueño), §6.6 (v0.9), §8 (LFPDPPP: el número ya es dato tratado)
**Depende de:** T-003 (formulario), T-005 (panel), T-013 (variables de despliegue)
**OpenSpec change:** `agregar-verificacion-sms-tras-bandera`
**PR:** —

## Contexto

Decisión del fundador (ADR-011): capacidad híbrida de verificación de propiedad del número vía Twilio Verify, detrás de bandera y apagada en el lanzamiento. Con la bandera apagada, el sitio se comporta EXACTAMENTE igual que hoy (fail-safe patrón Umami/panel). Con la bandera encendida: tras enviar el registro, el negocio recibe un código SMS y lo captura; el registro queda marcado "número verificado" en el panel, y el admin — que conserva íntegra la decisión de publicar — se ahorra el paso de confirmar el número.

## Criterios de aceptación

- [x] Bandera + variables de Twilio (`VERIFICACION_SMS_ACTIVA`, credenciales) con fail-safe absoluto: sin bandera/credenciales, cero cambios observables en formulario, panel, tests y bundle; credenciales a medias → aviso en log una vez, comportamiento apagado
- [x] Con la bandera activa: tras el envío válido del registro, pantalla de captura del código (6 dígitos, reintentos acotados, reenvío con espera), integrada al flujo sin JS obligatorio; el registro se crea `en_revision` ANTES de la verificación (un SMS fallido no pierde el registro — queda "número sin verificar")
- [x] El modelo marca la verificación (`numeroVerificadoEn` nullable — migración) y el panel la muestra ("Número verificado por SMS el …" / "Sin verificar — confirma por WhatsApp como siempre"); NADA se publica automáticamente
- [x] Anti-abuso del canal SMS (es dinero por mensaje): cupo por IP y por número reutilizando la política existente, cooldown de reenvío, tope diario global con alerta en log (paridad con el umbral de altas)
- [x] Los códigos y credenciales jamás en logs ni URLs; el código se valida server-side contra Twilio (nunca almacenado propio); errores en español llano sin filtrar detalles del proveedor
- [x] Tests con Twilio simulado (adaptador tras puerto — patrón `FOTOS_DIR`): la suite no llama a la red ni exige credenciales; el adaptador real queda listo para configurar
- [x] `docs/despliegue.md` gana la sección de activación (crear cuenta Twilio, variables, costos aproximados, prender bandera) marcada como OPCIONAL post-lanzamiento

## Fuera de alcance de este ticket

- Publicación automática (excluida por PRD v0.9 — la decisión es del admin siempre)
- WhatsApp como canal del código (iteración futura de la misma bandera)
- Re-verificación al cambiar número vía enlace de gestión (se coordina con T-014 cuando ambos existan — anotar el punto de integración)

## Notas

- Twilio Verify maneja generación/expiración/comparación del código — no reinventar; el adaptador propio solo orquesta.
- El costo por verificación (~$0.05 USD/SMS a MX + A2P) va documentado donde el humano decida activar.
- Orden de cola: después de T-014 (tocan el mismo formulario/panel).
