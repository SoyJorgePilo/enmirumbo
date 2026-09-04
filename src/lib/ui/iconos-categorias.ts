/**
 * Icono decorativo por categoría (encargo del fundador con captura: "los
 * botones de categoría se ven planos"). Presupuesto de rendimiento: EMOJI,
 * cero bytes descargados y cero dependencia nueva de íconos — el emoji ya
 * vive en la fuente del sistema (`--font-sans`, globals.css).
 *
 * El nombre de la categoría sigue siendo el contenido accesible del botón; el
 * emoji se pinta con `aria-hidden="true"` donde se usa (decorativo puro,
 * spec `directorio-publico`, requirement "La home muestra las 8 categorías
 * como botones grandes" — enmienda del fundador).
 *
 * Las claves son los slugs reales del catálogo (`prisma/seed.ts`,
 * `CATEGORIAS`, vía `slugify`). Un slug nuevo que el catálogo estrene después
 * (categoría futura) no rompe nada: cae al icono por defecto.
 */
const ICONOS_POR_SLUG: Record<string, string> = {
  "restaurantes-y-fondas": "🍽️",
  "servicios-del-hogar": "🔧",
  belleza: "💇",
  salud: "🩺",
  "abarrotes-y-comercio": "🛒",
  talleres: "🛠️",
  "clubes-y-escuelas-deportivas": "⚽",
  otro: "✨",
};

/** Icono por defecto para un slug que el mapa todavía no conoce. */
const ICONO_POR_DEFECTO = "✨";

/** Icono decorativo de una categoría, por su slug. Nunca falla: cae al genérico. */
export function iconoDeCategoria(slug: string): string {
  return ICONOS_POR_SLUG[slug] ?? ICONO_POR_DEFECTO;
}
