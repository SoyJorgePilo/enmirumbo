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

/**
 * El byte nulo, que PostgreSQL NO puede guardar en una columna de texto:
 * intentarlo aborta la consulta con `invalid byte sequence for encoding UTF8`.
 *
 * En SQLite sí cabía, así que hasta el change `preparar-deploy-produccion`
 * este carácter no era más que un dato raro. Ahora, si llega a una consulta,
 * la reventaría: una URL con `%00` devolvería un error del servidor en vez de
 * un 404, y un comentario pegado con basura tumbaría el envío. Por eso se
 * trata en el BORDE —donde entra el dato— y no cerca de la base.
 */
const BYTE_NULO = String.fromCharCode(0);

/** ¿Este texto trae un byte nulo? Ninguno legítimo lo lleva. */
export function tieneByteNulo(texto: string): boolean {
  return texto.includes(BYTE_NULO);
}

/** El mismo texto sin bytes nulos. Nada legítimo se pierde por el camino. */
export function sinBytesNulos(texto: string): string {
  return texto.split(BYTE_NULO).join("");
}
