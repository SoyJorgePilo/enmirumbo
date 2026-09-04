# T-019 · Renombrar el sitio a "EnMiRumbo" (rebrand completo)

**Estado:** pendiente <!-- pendiente | en-spec | en-desarrollo | en-review | hecho -->
**Prioridad:** P0
**Épica:** E6 (docs/backlog.md)
**Referencias PRD:** §2, §6.2, §9
**Depende de:** T-014
**OpenSpec change:** —
**PR:** —

## Contexto

El fundador compró el dominio definitivo `enmirumbo.com` y decidió (2026-09-04) que la marca acompañe al dominio: el sitio deja de llamarse "NecesitoUno" y pasa a ser **"EnMiRumbo"** (así, junto y con mayúsculas internas). "Rumbo" además abona a la visión de adaptarlo a otras poblaciones (T-017). El nombre viejo está fijado en literales de UI, títulos SEO, textos legales y documentación, así que el cambio debe ser completo y consistente antes del lanzamiento.

## Criterios de aceptación

- [ ] Ningún texto visible al público dice "NecesitoUno": encabezado, pie, títulos y descripciones SEO (`<title>`, OG, manifest si existe), páginas legales, mensajes del panel y de WhatsApp generados.
- [ ] La línea del pie "Hecho para los vecinos de Tizayuca, Hidalgo." se conserva tal cual (al fundador le gusta).
- [ ] El aviso de privacidad y los términos nombran al responsable/sitio como EnMiRumbo sin romper la versión del aviso salvo que el texto legal cambie de fondo; si cambia, se sigue la mecánica de versionado existente (reaceptación solo hacia adelante).
- [ ] Documentación del repo actualizada: README, PRD (nota de rebrand), CLAUDE.md, docs/despliegue.md (ejemplos de dominio → `enmirumbo.com`), estrategia de lanzamiento.
- [ ] Los seeds/tests que fijen el nombre viejo quedan actualizados; suite completa en verde.

## Fuera de alcance de este ticket

- Renombrar el repositorio de GitHub o el proyecto de Vercel (decisión operativa del fundador, no de código).
- T-017 (localidad configurable): el rebrand no generaliza "Tizayuca", solo cambia la marca.
- Logo/identidad gráfica (hoy el sitio es tipográfico; si algún día hay logo, será otro ticket).

## Notas

- Decisión del fundador vía revisión 2026-09-04; el dominio ya está comprado.
- ¡Ojo con el versionado del aviso! `VERSION_AVISO` y la huella: cambiar el nombre del sitio dentro del texto legal probablemente cambia la huella del aviso → la spec debe decidir si eso amerita subir la versión (mecánica de T-012).
- Tocará el layout y los legales: coordinar con T-014 (en desarrollo) — este ticket depende de su merge para no pisarse.
