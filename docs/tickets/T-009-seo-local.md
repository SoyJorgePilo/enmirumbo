# T-009 · Construir el SEO local: páginas por giro, Schema, sitemap y metadata

**Estado:** en-review
**Prioridad:** P0
**Épica:** E5-1, E5-2, E5-3, E5-5, E4-3 (docs/backlog.md)
**Referencias PRD:** §8 (SEO local, páginas por giro generadas del catálogo cerrado), §6.5 (oportunidad SEO de deporte sin competencia), §6.2, §10 (tráfico orgánico como métrica)
**Depende de:** T-004 (directorio), T-005 (giros asignados por el admin), T-006 (buscador)
**OpenSpec change:** `agregar-seo-local`
**PR:** —

## Contexto

El SEO local es la apuesta de adquisición del PRD: que "plomero en Tizayuca" y "clases de futbol en Tizayuca" lleguen al directorio sin pagar un peso. La base ya existe — slugs estables en los tres catálogos, URLs limpias por categoría, giros asignables — pero faltan las páginas indexables por giro, los datos estructurados, el sitemap y la metadata por página. Las fichas se comparten por WhatsApp y Facebook: la vista previa (Open Graph) es parte del producto, no adorno.

## Criterios de aceptación

- [x] Existen páginas indexables por giro (`/plomeria`) y giro+colonia (`/plomeria-haciendas-de-tizayuca`) generadas desde el catálogo cerrado (PRD §8): listan negocios publicados con ese giro asignado, con título "«Giro» en Tizayuca" / "«Giro» en «Colonia», Tizayuca"; las combinaciones sin negocios publicados no se indexan ni enlazan (evitar thin content), sin romper con 404 confuso
- [x] Las páginas de giros deportivos cubren E4-3 con el mismo mecanismo ("clases de futbol en Tizayuca" debe tener página aterrizable); si el título natural del giro deportivo pide otra fórmula, la spec la define
- [x] Cada ficha publicada emite Schema.org LocalBusiness (JSON-LD) con lo que el PRD §8 considere honesto emitir (nombre, categoría/giro, colonia — no domicilio exacto), y las expectativas realistas del PRD v0.8 quedan citadas en la spec
- [x] Existe `sitemap.xml` generado con home, categorías, giros/giro+colonia con contenido, y fichas publicadas; se actualiza sin intervención manual
- [x] Existe `robots.txt` (E5-5): permite lo público, excluye `/admin`, `/buscar` y lo que la spec determine
- [x] Metadata por página: título y descripción propios para listados de categoría, páginas de giro y fichas (hoy heredan la del sitio); Open Graph en la ficha (título, descripción, imagen — la foto del negocio si T-008 ya se mergeó, o el fallback que la spec defina)
- [x] Los slugs de giro no chocan con rutas propias ni con slugs de categoría (hoy comparten la raíz `/[categoria]`): la spec resuelve la convivencia de rutas sin ambigüedad
- [x] Todo Server Components, sin dependencias nuevas salvo justificación, sin degradar el presupuesto <2s en 4G

## Fuera de alcance de este ticket

- Medición Lighthouse y optimización de rendimiento (E5-4 — se mide con el deploy, E0-3)
- Anti-flood de lectura más allá de robots.txt (queda en E5-5 como deuda con el rate limit de infraestructura de E0-3)
- Analítica de tráfico (E7)
- Canonicals multi-ciudad o hreflang (una sola ciudad en el MVP)

## Notas

- Los giros con negocios: en dev casi ninguno tiene asignación (la hace el admin al aprobar). El seed demo ya asigna algunos (T-006); la spec debe apoyarse en eso para scenarios verificables.
- La colisión de rutas `/[categoria]` vs `/[giro]` vs `/[giro]-[colonia]` es el problema técnico central — resolverlo en design.md (¿un solo catch-all que resuelve contra los tres catálogos en orden? ¿prefijos?) sin romper las URLs ya publicadas de categoría.
- Este pipeline correrá en paralelo con T-007/T-008: toca ficha (JSON-LD/OG) que T-008 también toca (foto) — conflicto esperado y asumido; se resuelve al mergear.
