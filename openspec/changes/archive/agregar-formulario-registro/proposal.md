# Propuesta: agregar-formulario-registro

**Ticket:** `docs/tickets/T-003-formulario-registro.md` (E1-1, E1-2, E1-4, E1-5; P0)
**PRD:** §6.1 (registro de una sola pantalla, 5 obligatorios + opcionales, mensaje de gracias), §6.5 (el mismo formulario sirve para deporte: solo cambia el ejemplo), §7 Flujo A (la home lleva a "Registra tu negocio gratis"), §8 (anti-abuso sin captcha, accesibilidad, LFPDPPP: aviso simplificado y consentimiento)

## Por qué

Sin registro no hay directorio: es la primera superficie pública real del producto y el arranque del Flujo A del PRD §7. El PRD §6.1 exige un solo formulario, en una sola pantalla, desde el celular, sin cuentas ni códigos de verificación, y el §6.5 pide que ese mismo formulario reciba también a clubes y escuelas deportivas. Como recibe datos personales de terceros en un repo público (LFPDPPP, PRD §8), la validación y normalización en el servidor y el consentimiento con constancia son requisitos de primera clase, no detalles de implementación.

## Qué cambia

- **Nueva página pública de registro** (`/registro`) con un formulario de una pantalla: los 5 obligatorios del PRD §6.1 (nombre, categoría de lista cerrada, WhatsApp, colonia de lista cerrada con "Otra" + texto libre, consentimiento) y los opcionales de este ticket ("¿Qué ofreces?" ≤200, entregas a domicilio, teléfono fijo, dirección o referencias, horario, link de Facebook). La foto queda para E1-3.
- **Ejemplo dinámico** en "¿Qué ofreces?" según la categoría elegida (plomería vs. deporte, PRD §6.1 y §6.5): única pieza de JS de cliente justificada, acotada a ese campo.
- **Validación y normalización en el servidor de todo campo**, con errores por campo en español claro y conservando lo que el negocio ya capturó. El WhatsApp se normaliza a 10 dígitos antes de tocar la base — esto resuelve el hallazgo M1 heredado de T-001 (la unicidad solo protegía la cadena exacta) — y `facebookUrl` se restringe a http(s) (hallazgo bajo de T-001).
- **Consentimiento LFPDPPP**: aviso de privacidad simplificado visible dentro del formulario, checkbox obligatorio y constancia guardada como timestamp de servidor en `consintioAvisoEn`. Sin enlace al aviso integral mientras E6 no exista (cero enlaces muertos, igual que el footer de T-002).
- **Una sola ficha por número**: si el WhatsApp normalizado ya tiene ficha, el formulario lo dice y menciona que el enlace para editar llega por WhatsApp (el flujo "Perdí mi enlace" es P1).
- **Envío exitoso**: crea el negocio en estado `en_revision` con origen `organico` y muestra la pantalla de gracias con el mensaje literal del PRD §6.1.
- **Anti-abuso sin captcha** (PRD §8): honeypot, límite de envíos por IP y alerta en el log del servidor cuando el volumen diario supera lo plausible.
- **La home provisional enlaza al registro** con el texto "Registra tu negocio gratis" (Flujo A), lo que modifica el requirement de home provisional de `layout-base` y obliga a actualizar la lista blanca de hrefs de `tests/layout.test.ts` (PR #4).

## Capacidades afectadas

- `registro-negocio` (nueva): página, campos, validación de servidor, consentimiento, anti-abuso y pantalla de gracias.
- `layout-base` (MODIFIED): la home provisional deja de estar sin enlaces y ahora ofrece la entrada al registro.
- `modelo-datos`: se consume tal como está (T-001), sin cambios de esquema ni migraciones.

## Impacto en código (alto nivel)

- Rutas nuevas en `src/app/registro/` (página del formulario) y la pantalla de gracias.
- Server Action de registro y módulo de validación/normalización en `src/lib/` (normalizar WhatsApp, validar URL de Facebook, cotas de longitud), reutilizable después por el panel (E3) y por la edición (E8).
- Cliente Prisma de aplicación (hoy solo existe el de pruebas en `tests/db.ts`).
- Componente de cliente mínimo para el ejemplo dinámico y el estado "enviando".
- `src/app/page.tsx`: enlace "Registra tu negocio gratis".
- `tests/layout.test.ts` (PR #4): actualizar la lista blanca de hrefs para admitir `/registro`.
- Sin dependencias nuevas si la validación se escribe a mano; ver `design.md`.

## Fuera de este change

- **Pin en mapa**: se pospone (ver `design.md` §2). Los links cortos de Google Maps (`maps.app.goo.gl`) no traen coordenadas y resolverlos exige una petición saliente desde el servidor; el PRD §8 ya define publicar colonia y no domicilio exacto, así que el campo de dirección/referencias en texto libre cubre la sede del deporte y el resto. Merece ticket propio si el admin lo pide.
- Foto del negocio y su compresión (E1-3, ADR-006).
- Panel de revisión, alertas reales al admin y normalización de colonias "Otra" (E3): aquí los registros solo se encolan y el texto libre queda marcado como pendiente.
- Enlace de gestión y flujo "Perdí mi enlace" (E8/P1): solo se menciona en el mensaje de número duplicado.
- Páginas legales y enlace al aviso integral (E6).
- Persistencia del límite de envíos entre instancias/reinicios: el MVP usa memoria del proceso (`design.md` §4); un almacén compartido llegará con la DB de producción (E0-3).
- Rechazo de registros duplicados por nombre+colonia o detección de spam por contenido: lo filtra la revisión manual (PRD §6.3).

## Dudas resueltas en la aprobación

1. **Copy legal del aviso simplificado**: aprobado como provisional. La revisión legal profesional (E6-3) es gate previo al lanzamiento, no a este change; cuando E6 aterrice el texto definitivo, se ajusta.
2. **Pin en mapa**: aprobado posponerlo — solo dirección o referencias en texto libre. El PRD lo marca "opcional" y los links cortos de Google Maps no traen coordenadas; queda como candidato a ticket futuro si la siembra demuestra que hace falta.
3. **Mensaje de número duplicado**: aprobado el texto propuesto. Revelar que el número ya tiene ficha es comportamiento pedido por el PRD §6.1 (habilita el flujo "Perdí mi enlace"); la enumeración se mitiga con el límite por IP (design.md §5).
