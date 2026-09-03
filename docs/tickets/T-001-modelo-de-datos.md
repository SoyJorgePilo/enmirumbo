# T-001 · Definir el modelo de datos del directorio

**Estado:** hecho
**Prioridad:** P0
**Épica:** E0-1 (docs/backlog.md)
**Referencias PRD:** §6.1, §6.3, §6.4, Apéndice A
**Depende de:** —
**OpenSpec change:** agregar-modelo-datos
**PR:** [#2](https://github.com/SoyJorgePilo/necesitouno/pull/2)

## Contexto

Todo el MVP gira alrededor de una sola entidad (el negocio) y dos catálogos (categorías y colonias). Definir el modelo primero desbloquea el formulario de registro, el directorio público y el panel de revisión. Debe contemplar desde ahora los estados de revisión y el terreno para las ediciones supervisadas (P1), aunque estas no se implementen todavía.

## Criterios de aceptación

- [ ] Existe un esquema Prisma con el modelo `Negocio` cubriendo los 5 campos obligatorios y 5 opcionales del PRD §6.1
- [ ] El WhatsApp es único por negocio (constraint de base de datos, PRD §6.1)
- [ ] Categorías (8), colonias (Apéndice A) y giros (Apéndice B, asignables 1-3 por negocio por el admin) existen como catálogos con slug estable para URLs SEO
- [ ] El negocio tiene estado `en_revision | publicado | rechazado`, origen `siembra | organico` (PRD §6.3 y §10) y timestamps de registro y publicación
- [ ] La colonia admite el caso "Otra" con texto libre pendiente de normalizar
- [ ] El borrado definitivo es posible (hard delete real, no solo despublicar — operación ARCO del PRD §8)
- [ ] Migración inicial aplicada y seed con categorías, colonias y giros funcionando (`npm run db:seed` o equivalente)
- [ ] El diseño deja espacio para: enlace de gestión (token) y revisiones de edición (P1), sin implementarlos

## Fuera de alcance de este ticket

- UI de cualquier tipo
- Lógica del enlace de gestión y ediciones (E8)
- Elección del proveedor de base de datos en producción (se decide en E0-3)

## Notas

SQLite local vía Prisma (ver ADR-001). Los slugs de categoría+colonia alimentarán URLs tipo `/plomeria-haciendas-de-tizayuca` (E5-1): pensarlos desde ahora.
