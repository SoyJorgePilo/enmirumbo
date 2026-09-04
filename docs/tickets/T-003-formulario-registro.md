# T-003 · Construir el formulario de registro de negocios

**Estado:** hecho
**Prioridad:** P0
**Épica:** E1-1, E1-2, E1-4, E1-5 (docs/backlog.md)
**Referencias PRD:** §6.1, §6.5 (mismo formulario para deporte), §7 Flujo A, §8 (anti-abuso sin captcha, LFPDPPP)
**Depende de:** T-001 (modelo de datos), T-002 (layout base)
**OpenSpec change:** `agregar-formulario-registro`
**PR:** [#5](https://github.com/SoyJorgePilo/necesitouno/pull/5)

## Contexto

Es la primera superficie pública real del producto: sin registro no hay directorio. Un solo formulario de una pantalla, desde el celular, sin cuentas ni contraseñas (PRD §6.1). El mismo formulario sirve para negocios y para deporte (§6.5): solo cambian los ejemplos. Es superficie sensible — recibe datos personales de terceros en un repo público (LFPDPPP), así que la validación del servidor y los hallazgos previos de seguridad son parte del alcance, no adorno.

## Criterios de aceptación

- [x] Existe la página de registro, y la home provisional enlaza a ella con el texto "Registra tu negocio gratis" (Flujo A)
- [x] Formulario de una pantalla con los 5 obligatorios del PRD §6.1 (nombre, categoría de lista cerrada, WhatsApp de 10 dígitos, colonia de lista cerrada con opción "Otra" + texto libre, checkbox de consentimiento) y 4 opcionales: "¿Qué ofreces?" (máx. 200), entregas a domicilio, teléfono fijo y dirección/referencias, horario, y link de Facebook (la foto llega en el ticket de E1-3)
- [x] El placeholder de "¿Qué ofreces?" se adapta a la categoría elegida (ej. plomería vs. deporte, PRD §6.1 y §6.5)
- [x] Validación en el servidor de todo campo: WhatsApp se normaliza a 10 dígitos (acepta variantes con +52, espacios o guiones y las reduce; rechaza lo que no dé 10 dígitos), "¿Qué ofreces?" ≤200 caracteres, link de Facebook solo http(s) — errores por campo en español claro
- [x] Si el WhatsApp ya tiene ficha, el formulario lo dice con el mensaje del PRD (el flujo "Perdí mi enlace" es P1 y aquí solo se menciona)
- [x] El consentimiento muestra el aviso simplificado visible en el formulario y se guarda como timestamp (`consintioAvisoEn`); sin checkbox no hay envío
- [x] El envío crea el negocio en estado `en_revision` con origen `organico` y muestra la pantalla de gracias con el mensaje literal del PRD §6.1
- [x] Colonia "Otra" guarda el texto libre pendiente de normalizar (sin colonia de catálogo)
- [x] Anti-abuso mínimo del PRD §8 (sin captcha)
- [x] Estados completos del formulario (vacío, error por campo, enviando, éxito) y mobile-first a 390px

## Fuera de alcance de este ticket

- Subida y compresión de foto (E1-3, con ADR-006 — el modelo ya tiene `fotoUrl`)
- Panel de revisión del admin (E3): los registros solo quedan en la cola
- Enlace de gestión y flujo "Perdí mi enlace" (E8/P1)
- Páginas legales (E6): el link al aviso integral se conecta cuando esa página exista — sin enlaces muertos mientras tanto
- Pin de mapa sofisticado: si entra, con la solución más simple posible (ver Notas)

## Notas

- Hallazgos heredados de la corrida de T-001 que este ticket DEBE resolver: M1 (unicidad de WhatsApp solo por cadena exacta — la normalización del servidor es obligatoria antes de insertar) y el bajo de URLs (`facebookUrl` solo http(s)).
- "Teléfono fijo y dirección o referencias" lleva "pin opcional en mapa" en el PRD; decidir en la spec la forma más simple (p. ej. pegar un link de Google Maps del que se extraen coordenadas, o posponer el pin) — no cargar un mapa interactivo por esto.
- El placeholder dinámico por categoría es interacción real: JS de cliente justificado y acotado a ese campo.
- La prueba del enlace "Registra tu negocio gratis" romperá el test de lista blanca de hrefs (`tests/layout.test.ts`, PR #4): actualizarla es parte del cambio.
