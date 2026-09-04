# T-017 · Centralizar la localidad como configuración (preparar la réplica a otras poblaciones)

**Estado:** pendiente
**Prioridad:** P2 — post-validación (PRD §10: no antes de los umbrales de 60 días; §6.6 mantiene "otras ciudades" fuera del MVP)
**Épica:** derivada de PRD §11 (marca neutral) y §12 (fases posteriores)
**Referencias PRD:** §11, §12
**Depende de:** lanzamiento validado
**OpenSpec change:** —
**PR:** —

## Contexto

Idea del fundador (2026-09-04): la marca NecesitoUno ya es neutral (decisión v0.7) precisamente para poder replicar a otros municipios. El posicionamiento "Tizayuca" NO se quita del producto actual — el hiperlocal es la apuesta de confianza y SEO del lanzamiento — pero la referencia a la localidad debe dejar de estar regada por el código para que una segunda instancia ("NecesitoUno Pachuca") sea un problema de datos y configuración, no una reescritura.

## Inventario de dónde vive "Tizayuca" hoy (censo inicial, verificar al especificar)

- Metadata base y plantilla de títulos (`layout-base`): "NecesitoUno Tizayuca — …", "«Giro» en Tizayuca"
- Header (posicionamiento junto al wordmark)
- Textos del formulario, home, deporte ("¿Qué necesitas en Tizayuca?", "Deporte en Tizayuca")
- Enlaces a Google Maps: sufijo "Tizayuca, Hidalgo"
- JSON-LD (`addressLocality`/`addressRegion` implícitos)
- Lista de muletillas del buscador (incluye "tizayuca")
- Textos legales (aviso y términos mencionan la ciudad)
- Catálogo de colonias (ya es dato en base — el seed sería por localidad)
- `SITIO_URL` y dominio

## Criterios de aceptación (borrador — afinar al especificar)

- [ ] Módulo único de localidad (nombre, estado, frase de posicionamiento, sufijo de Maps, muletillas locales) consumido por todas las superficies del censo
- [ ] El seed de colonias parametrizado por localidad
- [ ] Una instancia nueva se levanta con: variables de localidad + seed propio + dominio — cero cambios de código
- [ ] Los textos legales parametrizan la ciudad sin romper el guardián de versiones del aviso (coordinar con T-012: cambiar la ciudad del texto ES estrenar versión en esa instancia)
- [ ] La instancia de Tizayuca queda byte a byte igual tras la refactorización (los ~2,400 tests como red)

## Fuera de alcance

- Multi-ciudad en una sola base/instancia (el modelo operativo es una instancia por ciudad, cada una con su admin y su siembra — replica la operación, que es el verdadero motor)
- Selector de ciudad en la UI
- Lanzar cualquier segunda ciudad (decisión de negocio post-validación)

## Notas

La discusión completa y la recomendación están en la sesión del 2026-09-04: validar Tizayuca primero; genericar la UI antes del lanzamiento debilitaría el diferenciador hiperlocal y el SEO local que son la apuesta del PRD.
