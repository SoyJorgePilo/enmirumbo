# T-001 · Definir el modelo de datos del directorio

**Estado:** pendiente
**Prioridad:** P0
**Épica:** E0-1 (docs/backlog.md)
**Referencias PRD:** §6.1, §6.3, §6.4, Apéndice A
**Depende de:** —
**OpenSpec change:** —
**PR:** —

## Contexto

Todo el MVP gira alrededor de una sola entidad (el negocio) y dos catálogos (categorías y colonias). Definir el modelo primero desbloquea el formulario de registro, el directorio público y el panel de revisión. Debe contemplar desde ahora los estados de revisión y el terreno para las ediciones supervisadas (P1), aunque estas no se implementen todavía.

## Criterios de aceptación

- [ ] Existe un esquema Prisma con el modelo `Negocio` cubriendo los 5 campos obligatorios y 5 opcionales del PRD §6.1
- [ ] Categorías (8, lista cerrada del PRD) y colonias (Apéndice A) existen como catálogos con slug estable para URLs SEO
- [ ] El negocio tiene estado `en_revision | publicado | rechazado` y timestamps de registro y publicación
- [ ] La colonia admite el caso "Otra" con texto libre pendiente de normalizar
- [ ] Migración inicial aplicada y seed con categorías y colonias funcionando (`npm run db:seed` o equivalente)
- [ ] El diseño deja espacio para: enlace de gestión (token) y revisiones de edición (P1), sin implementarlos

## Fuera de alcance de este ticket

- UI de cualquier tipo
- Lógica del enlace de gestión y ediciones (E8)
- Elección del proveedor de base de datos en producción (se decide en E0-3)

## Notas

SQLite local vía Prisma (ver ADR-001). Los slugs de categoría+colonia alimentarán URLs tipo `/plomeria-haciendas-de-tizayuca` (E5-1): pensarlos desde ahora.
