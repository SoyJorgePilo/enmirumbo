/**
 * Convierte un nombre en un slug apto para URL SEO:
 * minúsculas, sin acentos, sin signos, con guiones simples.
 *
 * "Plomería" → "plomeria"
 * "Haciendas de Tizayuca" → "haciendas-de-tizayuca"
 * "Fonda / comida corrida" → "fonda-comida-corrida"
 */
export function slugify(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita acentos y diéresis (marcas combinantes)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // todo lo que no sea letra o dígito → guion
    .replace(/^-+|-+$/g, ""); // sin guiones en los extremos
}
