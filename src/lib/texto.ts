/**
 * Primitivas de texto compartidas por los dos lugares que necesitan comparar
 * o publicar cadenas sin acentos: los slugs del catálogo (`src/lib/slug.ts`)
 * y el buscador (`src/lib/busqueda.ts`, change `agregar-buscador`).
 *
 * Vive aparte para que la búsqueda no dependa del módulo de slugs (ni al
 * revés): las dos usan el mismo quitado de acentos, y por eso el `slug` de un
 * giro del catálogo se puede comparar directo contra un término de búsqueda
 * ya normalizado (design.md §3).
 */

/** Marcas combinantes de acento y diéresis (bloque Unicode "Combining Diacritical Marks"). */
const MARCAS_COMBINANTES = /[\u0300-\u036f]/g;

/**
 * Quita acentos, diéresis y la virgulilla de la "ñ" descomponiendo en NFD y
 * borrando las marcas combinantes. No cambia mayúsculas ni ningún otro
 * carácter: "Plomería Güicho" → "Plomeria Guicho", "piñatas" → "pinatas".
 */
export function quitarAcentos(texto: string): string {
  return texto.normalize("NFD").replace(MARCAS_COMBINANTES, "");
}
