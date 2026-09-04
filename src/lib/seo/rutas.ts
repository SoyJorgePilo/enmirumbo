/**
 * Resolución del único segmento dinámico de la raíz (design.md §1 y §2 del
 * change `agregar-seo-local`).
 *
 * En App Router no pueden coexistir dos segmentos dinámicos con nombres
 * distintos en el mismo nivel, así que `/[categoria]`, `/[giro]` y
 * `/[giro]-[colonia]` viven en una sola carpeta (`src/app/[destino]`) y la
 * decisión de qué es cada URL se toma aquí, en un módulo puro que no toca la
 * base ni el entorno.
 *
 * El orden es parte de la spec y no se puede alterar: **la categoría gana
 * siempre**, para que ningún catálogo futuro pueda secuestrar una URL de
 * categoría ya publicada.
 */

/** Entrada de catálogo con lo que las páginas necesitan para presentarse. */
export type EntradaDeCatalogo = { nombre: string; slug: string };

export type CatalogosDeLaRaiz = {
  categorias: readonly EntradaDeCatalogo[];
  giros: readonly EntradaDeCatalogo[];
  colonias: readonly EntradaDeCatalogo[];
};

export type DestinoRaiz =
  | { tipo: "categoria"; categoria: EntradaDeCatalogo }
  | { tipo: "giro"; giro: EntradaDeCatalogo }
  | { tipo: "giro-colonia"; giro: EntradaDeCatalogo; colonia: EntradaDeCatalogo }
  | { tipo: "desconocido" };

/**
 * Forma de un slug del catálogo, tal como lo produce `slugify`: minúsculas,
 * dígitos y guiones simples entre partes no vacías.
 *
 * Se valida ANTES de tocar los catálogos, y a propósito sin normalizar nada:
 * `/Plomeria` no es `/plomeria`, igual que hoy `/SERVICIOS-DEL-HOGAR` ya
 * responde 404. Publicar la misma página en dos URLs distintas es contenido
 * duplicado, que es justo lo que este change viene a evitar. De paso, todo lo
 * hostil (`%`, `..`, `//`, espacios, otros alfabetos) muere aquí.
 */
const FORMA_DE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Tope de largo del segmento. El compuesto más largo que el catálogo puede
 * producir hoy tiene 68 caracteres; 120 deja aire de sobra y evita recorrer
 * los cortes de una cadena de kilobytes que alguien mande a propósito.
 */
export const LARGO_MAXIMO_DE_SLUG = 120;

/**
 * Los cortes posibles de un compuesto `«giro»-«colonia»`: uno por cada guion.
 * Los slugs de los dos catálogos llevan guiones (`taekwondo-artes-marciales`,
 * `haciendas-de-tizayuca`), así que "partir por el guion" no está definido de
 * una sola manera: hay que probarlos todos y quedarse con el par válido.
 */
/**
 * ¿Este segmento puede ser siquiera un slug del catálogo? Se pregunta ANTES
 * de tocar la base: así una URL basura (o larguísima, mandada a propósito) no
 * cuesta ni una consulta.
 */
export function tieneFormaDeSlugDeLaRaiz(slug: string): boolean {
  return slug.length <= LARGO_MAXIMO_DE_SLUG && FORMA_DE_SLUG.test(slug);
}

export function cortesDeCompuesto(
  slug: string,
): Array<{ giro: string; colonia: string }> {
  const cortes: Array<{ giro: string; colonia: string }> = [];
  for (let i = 0; i < slug.length; i++) {
    if (slug[i] !== "-") continue;
    const giro = slug.slice(0, i);
    const colonia = slug.slice(i + 1);
    if (giro === "" || colonia === "") continue;
    cortes.push({ giro, colonia });
  }
  return cortes;
}

function buscar(
  entradas: readonly EntradaDeCatalogo[],
  slug: string,
): EntradaDeCatalogo | undefined {
  return entradas.find((entrada) => entrada.slug === slug);
}

/**
 * Qué es este slug de la raíz: categoría, giro, par giro+colonia o nada.
 *
 * Nunca lanza: cualquier entrada rara (vacía, con caracteres de otro
 * alfabeto, larguísima) resuelve a `desconocido`, que quien llama traduce a
 * la 404 en español del sitio.
 */
export function resolverSlugDeLaRaiz(
  slug: string,
  catalogos: CatalogosDeLaRaiz,
): DestinoRaiz {
  if (!tieneFormaDeSlugDeLaRaiz(slug)) return { tipo: "desconocido" };

  // 1. La categoría gana siempre (ninguna URL publicada cambia de significado).
  const categoria = buscar(catalogos.categorias, slug);
  if (categoria) return { tipo: "categoria", categoria };

  // 2. Giro completo.
  const giro = buscar(catalogos.giros, slug);
  if (giro) return { tipo: "giro", giro };

  // 3. Par giro+colonia, y solo si se lee de EXACTAMENTE una manera: dos
  //    lecturas son un error de datos que la invariante de catálogo atrapa
  //    (design.md §2), y mientras tanto una URL ambigua no se sirve.
  const pares = cortesDeCompuesto(slug)
    .map((corte) => ({
      giro: buscar(catalogos.giros, corte.giro),
      colonia: buscar(catalogos.colonias, corte.colonia),
    }))
    .filter(
      (par): par is { giro: EntradaDeCatalogo; colonia: EntradaDeCatalogo } =>
        par.giro !== undefined && par.colonia !== undefined,
    );

  if (pares.length !== 1) return { tipo: "desconocido" };
  return { tipo: "giro-colonia", giro: pares[0].giro, colonia: pares[0].colonia };
}
