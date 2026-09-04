/**
 * Frases curadas de los giros del catálogo (design.md §4 del change
 * `agregar-seo-local`).
 *
 * El nombre del catálogo no siempre es la frase que la gente busca ni la que
 * se lee bien en un `h1`:
 *
 * - deporte (E4-3, PRD §6.5): la búsqueda real es "clases de futbol en
 *   Tizayuca", no "Futbol en Tizayuca";
 * - los nombres con diagonal quedan feos en un encabezado ("Taekwondo /
 *   artes marciales en Tizayuca").
 *
 * La tabla vive en código y no en la base a propósito: es contenido
 * editorial, cambia con lo aprendido en la Fase 0 y no merece una migración.
 * Un giro sin entrada usa su nombre del catálogo tal cual, así que agregar un
 * giro nuevo al Apéndice B nunca rompe una página — a lo sumo su título es
 * mejorable.
 */

/** Lo que se necesita de un giro para presentarlo; lo cumple `GiroCatalogo`. */
export type GiroPresentable = { nombre: string; slug: string };

/** Slug del catálogo → frase con la que se encabeza y titula su página. */
export const FRASES_POR_GIRO: Readonly<Record<string, string>> = {
  // Deporte (E4-3, PRD §6.5): lo que se busca son las clases, no el deporte.
  futbol: "Clases de futbol",
  box: "Clases de box",
  natacion: "Clases de natación",
  basquetbol: "Clases de basquetbol",
  "taekwondo-artes-marciales": "Clases de taekwondo y artes marciales",
  "danza-zumba": "Clases de danza y zumba",
  "atletismo-corredores": "Atletismo y clubes de corredores",
  gimnasio: "Gimnasios",
  ciclismo: "Ciclismo",
  // Nombres del catálogo con diagonal, que en un encabezado se leen mal.
  "fonda-comida-corrida": "Fondas y comida corrida",
};

/**
 * Frase con la que se presenta un giro. Nunca devuelve cadena vacía: si el
 * catálogo trajera un nombre en blanco, queda el slug, que siempre existe.
 */
export function fraseDeGiro(giro: GiroPresentable): string {
  const curada = FRASES_POR_GIRO[giro.slug];
  if (curada) return curada;
  const nombre = giro.nombre.trim();
  return nombre === "" ? giro.slug : nombre;
}
