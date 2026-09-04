# T-012 · Registrar qué versión del aviso de privacidad aceptó cada negocio

**Estado:** en-review
**Prioridad:** P1 (recomendado antes del lanzamiento)
**Épica:** E6 (derivada — hallazgo del validador de T-007)
**Referencias PRD:** §8 (LFPDPPP: constancia de consentimiento)
**Depende de:** T-007 (páginas legales)
**OpenSpec change:** `versionar-aviso-privacidad`
**PR:** —

## Contexto

`consintioAvisoEn` registra CUÁNDO consintió el negocio, pero no QUÉ texto estaba vigente — y el texto legal ya cambió una vez dentro del propio T-007 (enmienda de la auditoría). Si el aviso evoluciona, la constancia pierde valor probatorio. El validador de T-007 lo señaló como ticket recomendado previo al lanzamiento.

## Criterios de aceptación

- [x] El aviso (simplificado e integral) tiene un identificador de versión estable y visible ("Última actualización" ya existe — formalizarlo como versión)
- [x] Al registrar o reenviar, se guarda la versión vigente junto al timestamp (`consintioAvisoVersion` o equivalente — migración)
- [x] Cambiar el texto del aviso sin subir la versión hace fallar un test (la versión no puede quedarse atrás del texto)
- [x] El panel muestra la versión aceptada en el detalle del registro
- [x] El reenvío tras rechazo actualiza la versión aceptada SOLO si el checkbox se marcó con el texto nuevo enfrente (coherente con la protección de `consintioAvisoEn` — la spec define la interacción exacta)

## Fuera de alcance de este ticket

- Historial completo de versiones del texto (el repo git ES el historial)
- Re-solicitar consentimiento a fichas existentes cuando cambie el aviso (decisión legal humana)

## Notas

Chico y quirúrgico: una columna, un literal de versión, un test guardián. Coordinar con la revisión legal (E6-3): si el abogado reescribe el texto, estrena versión.
