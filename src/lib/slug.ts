/**
 * Convierte un nombre en un slug apto para URL SEO:
 * minúsculas, sin acentos, sin signos, con guiones simples.
 *
 * "Plomería" → "plomeria"
 * "Haciendas de Tizayuca" → "haciendas-de-tizayuca"
 * "Fonda / comida corrida" → "fonda-comida-corrida"
 *
 * El quitado de acentos vive en `src/lib/texto.ts` (change
 * `agregar-buscador`, tasks.md #1) porque el buscador necesita exactamente el
 * mismo: así el `slug` de un giro del catálogo se puede comparar contra un
 * término de búsqueda ya normalizado, sin denormalizar nada (design.md §3).
 */
// Import relativo (no `@/…`): este módulo lo carga también `prisma/seed.ts`
// con `tsx`, fuera del resolvedor de alias de Next.
import { quitarAcentos } from "./texto";

export function slugify(nombre: string): string {
  return quitarAcentos(nombre)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // todo lo que no sea letra o dígito → guion
    .replace(/^-+|-+$/g, ""); // sin guiones en los extremos
}
