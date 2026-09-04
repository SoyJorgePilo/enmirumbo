/**
 * Normalización de texto del buscador (change `agregar-buscador`,
 * design.md §2; spec `directorio-publico`, requirements "Coincidencia
 * insensible a mayúsculas y acentos, y parcial por raíz de la palabra" y
 * "Consulta vacía y términos hostiles acotados, sin error").
 *
 * Dos responsabilidades, las dos puras (no tocan la base ni el request):
 *
 * 1. `datosDeBusqueda`: lo que se GUARDA. Es la única función que calcula las
 *    columnas `nombreNormalizado` y `queOfrecesNormalizado`; todo camino de
 *    escritura (registro, seeds, relleno) pasa por aquí, y un test de
 *    consistencia recorre la base exigiendo que así sea (design.md §1).
 * 2. `terminosDeBusqueda`: lo que se BUSCA. Acota la consulta antes de que
 *    toque la base: recorte de longitud, tope de términos y borrado de todo
 *    lo que no sea letra o dígito —incluidos `%` y `_`, que en un `LIKE`
 *    serían comodines (design.md §4)—. Lista vacía significa "no hay nada
 *    que buscar": la página muestra el aviso en vez de listar el directorio.
 *
 * Las dos usan la MISMA normalización, que es lo que hace que la comparación
 * funcione: "PLOMERÍA" guardado y "plomeria" escrito terminan igual.
 *
 * Import relativo de `./texto` (no `@/…`): este módulo lo cargan también
 * `prisma/seed-demo.ts` y `prisma/backfill-busqueda.ts` con `tsx`, fuera del
 * resolvedor de alias de Next.
 */
import { quitarAcentos } from "./texto";

/**
 * Caracteres de la consulta **ya normalizada** que se miran; el resto se
 * ignora (design.md §2).
 *
 * Iteración 2 (hallazgo M-2 de la etapa C): antes el recorte se aplicaba a la
 * cadena CRUDA, así que 58 caracteres de relleno no alfanumérico al principio
 * (espacios, puntos, emojis, otro alfabeto) se comían la cuota y descartaban
 * la palabra que el vecino sí escribió: `/buscar` contestaba "¿Qué estás
 * buscando?" ante una consulta legítima. Ahora primero se normaliza —lo que
 * borra todo ese relleno— y el tope se aplica a lo que queda.
 */
export const LONGITUD_MAXIMA_CONSULTA = 60;

/** Términos que se exigen como máximo en una búsqueda. */
export const MAXIMO_TERMINOS = 4;

/**
 * Longitud de la raíz con la que se compara cada término. Cinco es el
 * compromiso que cumple el ejemplo del PRD §6.2 ("plomero" encuentra
 * "plomería") sin el ruido que traería una raíz más corta (design.md §2).
 */
export const LONGITUD_RAIZ = 5;

/** Un término de un solo carácter coincide con casi todo: no aporta. */
const LONGITUD_MINIMA_TERMINO = 2;

/**
 * Muletillas: las palabras con las que el vecino **enuncia la pregunta**, no
 * las que describen el negocio que busca (iteración 2, hallazgo M-3 de la
 * etapa C).
 *
 * El requirement "varias palabras se exigen todas" está pensado para palabras
 * con contenido ("futbol infantil"). Pero el vecino del PRD §7 escribe con
 * prisa desde el celular: "quien me arregla la cerrajeria". Con el tope de 4
 * términos tomados por orden de aparición, la única palabra útil quedaba
 * fuera de la cuota y, como todos se exigen con `AND`, el resultado era cero.
 *
 * Quitar estas palabras solo puede DEVOLVER MÁS, nunca menos: se deja de
 * exigir una condición. En un directorio de barrio ese es el lado bueno del
 * error (design.md §2 ya asume falsos positivos y no hace ranking). Incluye
 * los verbos genéricos de "¿quién hace X?" porque describen la pregunta, no
 * al negocio: quien busca "quien repara lavadoras" quiere lavadoras.
 *
 * Se comparan YA normalizadas (sin acentos), y solo se descartan si queda
 * algún otro término: una consulta de puras muletillas se busca tal cual, así
 * el vecino ve "no encontramos" y no "¿qué estás buscando?".
 */
const MULETILLAS = new Set([
  // Artículos, preposiciones y conjunciones
  "el", "la", "los", "las", "un", "una", "unos", "unas", "lo",
  "de", "del", "al", "en", "con", "por", "para", "y", "o", "que",
  // Pronombres y adverbios con los que se pregunta
  "me", "te", "se", "mi", "tu", "su", "quien", "quienes", "donde", "cual",
  "aqui", "cerca", "hay", "algun", "alguna", "alguien",
  // Verbos con los que se enuncia la pregunta
  "necesito", "busco", "quiero", "ocupo", "conoces", "sabes", "recomiendan",
  "arregla", "arreglan", "arreglo", "repara", "reparan", "reparen",
  "hace", "hacen", "haga", "vende", "venden", "venda", "da", "dan", "puede",
  // El sitio ENTERO es de Tizayuca: la palabra no discrimina ningún negocio,
  // pero exigirla con `AND` dejaba en cero "cerrajeria en Tizayuca", que es
  // como la gente escribe cuando llega de una búsqueda de Google.
  "tizayuca",
]);

/**
 * Forma comparable de un texto: sin acentos, en minúsculas, con todo lo que
 * no sea `a-z0-9` convertido en espacio y los espacios colapsados.
 *
 * "Plomería Güicho" → "plomeria guicho"
 * "Piñatas" → "pinatas"
 * "100%_seguro" → "100 seguro"
 * "🎉 Привет" → ""
 */
export function normalizarTexto(texto: string): string {
  return quitarAcentos(texto)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Raíces con las que se va a comparar lo que escribió el vecino, o lista
 * vacía si no queda nada buscable.
 *
 * El orden importa y es el de la iteración 2 (hallazgos M-2 y M-3):
 *
 * 1. **normalizar primero**, que es lo que borra el relleno (signos, emojis,
 *    otro alfabeto, comodines de `LIKE`);
 * 2. **recortar a 60 caracteres** lo que quedó, que ya es todo buscable;
 * 3. tirar los términos de un solo carácter;
 * 4. tirar las muletillas de la pregunta, si queda alguna palabra con
 *    contenido;
 * 5. quedarse con los primeros 4 y reducir cada uno a su raíz.
 *
 * Normalizar la consulta entera cuesta menos de 2 ms hasta un millón de
 * caracteres (medido), y de todos modos el largo real está acotado antes por
 * el límite de la línea de petición HTTP. Lo que se acota aquí es lo que
 * llega a la base: como mucho 4 raíces de 5 caracteres `[a-z0-9]`.
 */
export function terminosDeBusqueda(consultaCruda: string): string[] {
  const normalizada = normalizarTexto(consultaCruda).slice(
    0,
    LONGITUD_MAXIMA_CONSULTA,
  );
  if (normalizada === "") return [];

  const palabras = normalizada
    .split(" ")
    .filter((termino) => termino.length >= LONGITUD_MINIMA_TERMINO);

  const conContenido = palabras.filter((termino) => !MULETILLAS.has(termino));
  const utiles = conContenido.length > 0 ? conContenido : palabras;

  return utiles
    .slice(0, MAXIMO_TERMINOS)
    .map((termino) => termino.slice(0, LONGITUD_RAIZ));
}

/** Las dos columnas de búsqueda de un negocio, listas para guardar. */
export type DatosDeBusqueda = {
  nombreNormalizado: string;
  queOfrecesNormalizado: string;
};

/**
 * Valores derivados que acompañan a cada escritura de un negocio. Un negocio
 * sin "¿Qué ofreces?" queda con cadena vacía, nunca con nulo (spec
 * `modelo-datos`): así ninguna consulta del buscador tiene que contemplar
 * nulos.
 */
export function datosDeBusqueda(
  nombre: string,
  queOfreces: string | null | undefined,
): DatosDeBusqueda {
  return {
    nombreNormalizado: normalizarTexto(nombre),
    queOfrecesNormalizado: normalizarTexto(queOfreces ?? ""),
  };
}
