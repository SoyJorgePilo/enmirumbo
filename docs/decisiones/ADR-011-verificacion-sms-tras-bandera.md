# ADR-011 · Verificación por SMS (Twilio) como capacidad tras bandera

**Fecha:** 2026-09-04 · **Estado:** aceptada (decisión del fundador, registrada en sesión)

## Contexto y problema

El fundador decidió incorporar verificación por SMS (Twilio) al flujo de registro. El PRD hasta v0.8 la listaba explícitamente fuera de alcance (§6.6) porque la verificación manual por WhatsApp es el diferenciador de confianza declarado (§6.3): un SMS prueba la propiedad del número, pero no que el negocio exista ni filtra contenido — eso lo hace la revisión humana, que además produce la evidencia de consentimiento.

## Decisión

**Híbrido tras bandera, apagado en el lanzamiento:**

1. Se construye la capacidad de verificación de propiedad del número por SMS (Twilio Verify) detrás de una bandera de entorno (`VERIFICACION_SMS_ACTIVA` o equivalente que la spec defina). **Apagada por defecto y en el lanzamiento**: el flujo del MVP sigue siendo 100% el manual del PRD §6.3.
2. Cuando se active, el modelo es **híbrido**: el SMS verifica el número automáticamente al registrarse (el registro queda marcado "número verificado"), y **el admin conserva la aprobación de la publicación** desde el panel — la moderación, el sello "Negocio verificado" y la curaduría no cambian de dueño. La verificación por SMS le ahorra al admin el paso de confirmar el número, no lo sustituye en la decisión.
3. La migración a activarla es operativa (cuenta Twilio + variables + prender bandera), no de código.

## Drivers

1. Fail-safe idéntico al patrón ya probado (Umami, panel): sin variables/bandera, cero comportamiento nuevo, cero dependencias activas.
2. El diferenciador del PRD se conserva: ninguna ficha se publica sin decisión humana.
3. Costo: Twilio Verify cobra por verificación (~$0.05 USD por SMS a México + requisitos A2P). Con la bandera apagada, costo $0; se evalúa con volumen real de la siembra.
4. Reversibilidad: apagar la bandera regresa al flujo manual sin migración.

## Fuera de esta decisión

- Publicación automática sin admin (el fundador optó por conservar el panel de gestión; reabrir esto exigiría PRD nuevo).
- WhatsApp Business API como canal (Twilio SMS primero; canal alternativo sería otra iteración de la misma bandera).
- La migración del stack web a Astro: **diferida por decisión del fundador** (2026-09-04) — se evaluará después del lanzamiento como decisión propia (ADR futuro); ninguna inversión actual se detiene por ella.

## Cuándo revisarla

Al activar la bandera por primera vez (con datos de costo por verificación y fricción real de los negocios), y a los 60 días del lanzamiento junto con las métricas del PRD §10.
