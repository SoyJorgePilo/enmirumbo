/**
 * Invariante de los tres catálogos (spec `modelo-datos`, requirement "Los
 * slugs de los tres catálogos no producen URLs ambiguas en la raíz";
 * design.md §2 del change `agregar-seo-local`).
 *
 * Las páginas de categoría (`/servicios-del-hogar`), de giro (`/plomeria`) y
 * de giro+colonia (`/plomeria-haciendas-de-tizayuca`) comparten la raíz, así
 * que cada URL tiene que leerse de una sola manera. Esto no exige campos
 * nuevos ni migraciones: es una verificación sobre los catálogos ya
 * sembrados, que corre en la suite (y por lo tanto en CI) para que el día que
 * alguien agregue un giro al Apéndice B se entere ANTES de que una URL quede
 * secuestrada. Reservar un nombre es gratis; migrar una URL publicada, no.
 */
import { esSegmentoReservado } from "@/lib/rutas-reservadas";
import type { CatalogosDeLaRaiz, EntradaDeCatalogo } from "@/lib/seo/rutas";

/** Misma forma que produce `slugify` (ver `src/lib/seo/rutas.ts`). */
const FORMA_DE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type CatalogoNombrado = {
  /** Cómo se nombra el catálogo en el mensaje del problema. */
  singular: string;
  entradas: readonly EntradaDeCatalogo[];
};

/**
 * Lista de problemas encontrados, vacía si los catálogos son inequívocos.
 * Devuelve textos y no lanza para que quien llame (la suite) pueda enseñar
 * TODOS los conflictos de una vez, cada uno con su slug nombrado.
 */
export function problemasDeAmbiguedadDeCatalogos(
  catalogos: CatalogosDeLaRaiz,
): string[] {
  const problemas: string[] = [];
  const porCatalogo: CatalogoNombrado[] = [
    { singular: "categoría", entradas: catalogos.categorias },
    { singular: "giro", entradas: catalogos.giros },
    { singular: "colonia", entradas: catalogos.colonias },
  ];

  // 0. Un slug que no tiene la forma de un slug no es alcanzable por la raíz:
  //    el resolvedor lo rechaza antes de mirar los catálogos.
  for (const { singular, entradas } of porCatalogo) {
    for (const entrada of entradas) {
      if (!FORMA_DE_SLUG.test(entrada.slug)) {
        problemas.push(
          `el slug de ${singular} "${entrada.slug}" no tiene la forma de un slug de URL y su página nunca sería alcanzable`,
        );
      }
    }
  }

  // 1. Ningún slug de giro ni de colonia coincide con uno de categoría.
  const slugsDeCategoria = new Set(catalogos.categorias.map((c) => c.slug));
  for (const { singular, entradas } of porCatalogo.slice(1)) {
    for (const entrada of entradas) {
      if (slugsDeCategoria.has(entrada.slug)) {
        problemas.push(
          `el ${singular} "${entrada.nombre}" usa el slug "${entrada.slug}", que ya es el de una categoría publicada`,
        );
      }
    }
  }

  // 2. Ningún slug de ningún catálogo tapa una ruta propia del sitio.
  for (const { singular, entradas } of porCatalogo) {
    for (const entrada of entradas) {
      if (esSegmentoReservado(entrada.slug)) {
        problemas.push(
          `el slug de ${singular} "${entrada.slug}" es un segmento reservado del sitio: su página quedaría inalcanzable`,
        );
      }
    }
  }

  // 3 y 4. Los compuestos «giro»-«colonia»: ninguno puede tapar una categoría
  //        ni un giro, y ninguno puede admitir dos lecturas.
  const slugsDeGiro = new Set(catalogos.giros.map((g) => g.slug));
  const lecturasPorCompuesto = new Map<string, string[]>();
  for (const giro of catalogos.giros) {
    for (const colonia of catalogos.colonias) {
      const compuesto = `${giro.slug}-${colonia.slug}`;
      const lecturas = lecturasPorCompuesto.get(compuesto) ?? [];
      lecturas.push(`${giro.slug} + ${colonia.slug}`);
      lecturasPorCompuesto.set(compuesto, lecturas);
    }
  }

  for (const [compuesto, lecturas] of lecturasPorCompuesto) {
    if (slugsDeCategoria.has(compuesto)) {
      problemas.push(
        `el compuesto "${compuesto}" (${lecturas[0]}) coincide con el slug de una categoría`,
      );
    }
    if (slugsDeGiro.has(compuesto)) {
      problemas.push(
        `el compuesto "${compuesto}" (${lecturas[0]}) coincide con el slug de un giro`,
      );
    }
    if (lecturas.length > 1) {
      problemas.push(
        `el compuesto "${compuesto}" se puede leer de ${lecturas.length} maneras: ${lecturas.join(", ")}`,
      );
    }
  }

  return problemas;
}
