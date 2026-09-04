# T-010 · Conectar la analítica cookieless

**Estado:** en-review
**Prioridad:** P0
**Épica:** E7-1, E7-2 (docs/backlog.md)
**Referencias PRD:** §9-10 (analítica desde el día 1, eventos definidos, exclusión de bots, sin banner), ADR-005
**Depende de:** T-004 (directorio), T-003 (formulario)
**OpenSpec change:** `agregar-analitica-cookieless`
**PR:** [#14](https://github.com/SoyJorgePilo/necesitouno/pull/14)

## Contexto

Las métricas del PRD §10 deciden el destino del MVP y hay que medir desde el primer día. ADR-005 recomienda Umami Cloud (gratuito, cookieless, sin banner). La implementación debe ser configurable por variables de entorno y fail-safe: sin configuración no carga nada ni rompe nada — el humano crea la cuenta y pega las llaves cuando quiera.

## Criterios de aceptación

- [x] El script de Umami se inyecta en el layout SOLO si las variables (`NEXT_PUBLIC_UMAMI_SRC`, `NEXT_PUBLIC_UMAMI_WEBSITE_ID` o las que la spec defina) están configuradas; sin ellas, cero bytes agregados
- [x] Eventos del PRD §9 instrumentados con los atributos data-* de Umami (sin JS propio): clic a WhatsApp (tarjeta y ficha, con categoría/colonia como propiedades), clic a Llamar/Cómo llegar, envío del formulario (la pantalla de gracias como proxy de conversión), y las vistas de página que Umami mide solo
- [x] Ningún dato personal viaja en eventos ni propiedades (ni nombres de negocio, ni números — solo slugs de categoría/colonia)
- [x] El panel del admin (`/admin`) queda EXCLUIDO de la medición
- [x] El peso agregado respeta el presupuesto (<2s en 4G): script de Umami diferido, nada más
- [x] `.env.example` documenta las variables y el paso de crear la cuenta (con el link)

## Fuera de alcance de este ticket

- La vista propia de métricas contra umbrales (E7-2 se cubre con la UI de Umami al inicio, como permite el backlog)
- Contadores en base propia
- Cambiar de proveedor (la migración Umami→Plausible del ADR-005 sería otro change)

## Notas

- El script externo choca conceptualmente con "cero JS de cliente": está justificado por el PRD §9 ("desde el día 1") y ADR-005; la spec debe acotarlo (async/defer, un solo script, dominio del proveedor documentado).
- Los atributos `data-umami-event` en Server Components no requieren `"use client"`.
