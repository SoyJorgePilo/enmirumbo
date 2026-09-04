# T-004 · Construir el directorio público: categorías, listados y ficha

**Estado:** en-review
**Prioridad:** P0
**Épica:** E2-1 (parcial: categorías y bloque deporte, sin buscador), E2-2, E2-3, E4-1 (docs/backlog.md)
**Referencias PRD:** §6.2, §6.5, §7 Flujo B, §8 (rendimiento, publicar colonia y no domicilio exacto)
**Depende de:** T-001 (modelo de datos), T-002 (layout base)
**OpenSpec change:** `agregar-directorio-publico`
**PR:** [#6](https://github.com/SoyJorgePilo/necesitouno/pull/6)

## Contexto

Con el registro funcionando, falta la otra mitad del Flujo B: que el vecino encuentre y contacte. Este ticket construye el camino completo home → categoría → ficha → WhatsApp, que es el éxito del producto ("salió del sitio hablando con el negocio"). El buscador (E2-4) llega en el siguiente ticket; mientras tanto las categorías como botones grandes son la navegación principal, como las usa la mayoría según el PRD.

## Criterios de aceptación

- [x] La home muestra las 8 categorías como botones grandes y el bloque "Deporte en Tizayuca" al mismo nivel visual (PRD §6.2 y §6.5); se conserva el enlace "Registra tu negocio gratis"
- [x] Existe el listado por categoría en URL limpia con el slug del catálogo (ej. `/servicios-del-hogar`), con filtro por colonia; solo aparecen negocios en estado `publicado`
- [x] Las tarjetas del listado muestran foto (o placeholder), nombre, colonia, etiqueta "A domicilio" cuando aplique y botón verde de WhatsApp directo (wa.me), sin clics extra (PRD §6.2)
- [x] Existe la ficha de negocio en URL propia con la información completa registrada, sello "Negocio verificado", y botones: "Enviar WhatsApp" (acción principal), "Llamar" (si hay teléfono), "Cómo llegar" (abre Google Maps, si hay dirección/referencias) y Facebook (si lo registró)
- [x] La ficha y el listado NUNCA muestran datos de negocios no publicados (`en_revision`/`rechazado` → 404), y la colonia se muestra sin domicilio exacto salvo lo que el negocio capturó como dirección/referencias (PRD §8)
- [x] Categoría o negocio inexistente → 404 en español (crear `not-found.tsx` global en español si hace falta)
- [x] Todo Server Components sin JS de cliente nuevo; mobile-first a 390px; áreas táctiles ≥44px; el botón de WhatsApp no compite con nada en jerarquía visual
- [x] Los enlaces externos (wa.me, tel:, maps, Facebook) llevan `rel="noopener noreferrer"` cuando abren en pestaña nueva, y el link de Facebook se muestra sin prometer que el dominio es Facebook (hallazgo M4 de T-003)

## Fuera de alcance de este ticket

- Buscador y búsqueda por palabras clave (E2-4 → siguiente ticket; el input NO aparece aún para no tener controles muertos)
- Páginas por giro y giro+colonia (E5-1) y Schema Markup (E5-2): las URLs de categoría ya usan slugs para no migrar después
- Botón "Reportar" en ficha (E3-4)
- Analítica de vistas y clics (E7)
- Foto real de negocios (E1-3): el listado usa placeholder si no hay foto

## Notas

- Un negocio publicado sin colonia de catálogo normalizada (caso "Otra" no normalizado) no debería existir según el flujo del admin, pero el listado debe tolerarlo sin romperse.
- Para desarrollo hacen falta negocios `publicado` de mentira: extender el seed con 3-5 negocios ficticios claramente marcados (nombres inventados, WhatsApp `7719990001…`) es parte del cambio — jamás datos reales (LFPDPPP).
- La lista blanca de hrefs de `tests/layout.test.ts` crecerá con las rutas nuevas; los enlaces externos (wa.me, tel:) necesitarán su propio tratamiento en ese test.
