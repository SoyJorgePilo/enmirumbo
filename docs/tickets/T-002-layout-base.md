# T-002 · Construir el layout base mobile-first

**Estado:** en-review
**Prioridad:** P0
**Épica:** E0-2 (docs/backlog.md)
**Referencias PRD:** §6.2, §8 (rendimiento y accesibilidad), §11 (marca "NecesitoUno Tizayuca")
**Depende de:** —
**OpenSpec change:** `agregar-layout-base`
**PR:** https://github.com/SoyJorgePilo/necesitouno/pull/3

## Contexto

Todas las pantallas del MVP (home, listados, fichas, formulario, panel) comparten header, footer, tipografía y paleta. Definir ese marco visual antes de las features evita retrabajo de estilos y fija desde el inicio la identidad: marca neutral "NecesitoUno" con posicionamiento hiperlocal "Tizayuca" cargado en la comunicación (PRD §11), y el verde de WhatsApp reservado como color de acción principal — nada compite con él.

## Criterios de aceptación

- [x] Existe un layout global con header (marca "NecesitoUno" como wordmark tipográfico + posicionamiento "Tizayuca") y footer presente en todas las páginas
- [x] La paleta y la tipografía quedan definidas como tokens reutilizables (config de Tailwind), con el verde WhatsApp como color de acción principal documentado como tal
- [x] Diseño mobile-first: correcto a 390px y adaptado hacia arriba (tablet/escritorio) sin scroll horizontal
- [x] Accesibilidad base del PRD §8: HTML semántico (header/main/footer, jerarquía de encabezados), contraste AA en los tokens de la paleta, áreas táctiles ≥44px
- [x] El layout es Server Component sin JS de cliente; `lang` del documento en `es-MX` y metadata base del sitio (título y descripción con "Tizayuca")
- [x] Una página de inicio provisional usa el layout para poder verlo funcionando (contenido mínimo; la home real llega con E2-1)

## Fuera de alcance de este ticket

- La home real con buscador, categorías y bloque de deporte (E2-1)
- Páginas legales del footer (E6) — el footer puede dejar el espacio previsto sin enlaces muertos
- Logo gráfico definitivo (wordmark tipográfico por ahora; la marca visual se decide fuera del código)
- Cualquier componente de feature (tarjetas, formularios, botones de WhatsApp concretos)

## Notas

Tailwind ya está en el stack (ADR-001). El público usa celulares de gama media en 4G: presupuesto <2s en página principal (PRD §8), así que sin fuentes web pesadas ni librerías de UI nuevas. El nombre no dice "Tizayuca", por eso el posicionamiento hiperlocal va en título, header y metadata (PRD §11).
