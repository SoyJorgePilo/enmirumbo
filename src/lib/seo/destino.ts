/**
 * La puerta de entrada de la raíz del sitio: qué es `/algo` (design.md §1 y
 * §2 del change `agregar-seo-local`).
 *
 * Junta el resolvedor puro (`src/lib/seo/rutas.ts`) con los catálogos de la
 * base. Vive aparte de la página para que las páginas de giro, su metadata y
 * las pruebas usen exactamente la misma decisión, y para que el orden
 * —categoría, giro, giro+colonia— esté escrito una sola vez.
 */
import { obtenerCatalogosDeLaRaiz } from "@/lib/directorio";
import {
  type DestinoRaiz,
  resolverSlugDeLaRaiz,
  tieneFormaDeSlugDeLaRaiz,
} from "@/lib/seo/rutas";

export type { DestinoRaiz };

/**
 * Qué es este segmento de la raíz. Un segmento que ni siquiera tiene forma de
 * slug (con `%`, `..`, espacios, otro alfabeto o kilobytes de largo) se
 * descarta sin consultar la base: es 404 igual, y así una URL basura no
 * cuesta ni una lectura.
 */
export async function resolverDestinoDeLaRaiz(
  slug: string,
): Promise<DestinoRaiz> {
  if (!tieneFormaDeSlugDeLaRaiz(slug)) return { tipo: "desconocido" };
  return resolverSlugDeLaRaiz(slug, await obtenerCatalogosDeLaRaiz());
}
