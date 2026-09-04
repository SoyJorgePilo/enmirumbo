/**
 * Encabezados, títulos y descripciones de las páginas del directorio (spec
 * `directorio-publico`, requirement "Título y descripción propios en cada
 * página del directorio, con su canónica"; design.md §4).
 *
 * Módulo puro: recibe nombres y frases ya resueltos, no toca la base ni el
 * entorno. Los literales son los de la spec, carácter por carácter.
 */
import { ocultarNumerosDeContacto } from "@/lib/seo/saneo";
import { quitarAcentos } from "@/lib/texto";

/** La ciudad del directorio; una sola en el MVP (PRD §8). */
const CIUDAD = "Tizayuca";

/**
 * ¿El nombre de la colonia ya dice "Tizayuca"? Son 5 del catálogo (Tizayuca
 * Centro, Nuevo Tizayuca, Haciendas de Tizayuca, Fuentes de Tizayuca y Los
 * Héroes Tizayuca) y en ellas el ", Tizayuca" final sobra: "Plomería en
 * Haciendas de Tizayuca" es el título correcto (duda 1 de la propuesta).
 */
export function coloniaYaDiceTizayuca(coloniaNombre: string): boolean {
  return quitarAcentos(coloniaNombre).toLowerCase().includes("tizayuca");
}

/** "«Colonia», Tizayuca", o solo la colonia cuando ya lo dice. */
function ubicacionDeColonia(coloniaNombre: string): string {
  const colonia = coloniaNombre.trim();
  return coloniaYaDiceTizayuca(colonia) ? colonia : `${colonia}, ${CIUDAD}`;
}

/** "Servicios del hogar en Tizayuca" (listado por categoría). */
export function encabezadoCategoria(nombreCategoria: string): string {
  return `${nombreCategoria.trim()} en ${CIUDAD}`;
}

/** "Clases de futbol en Tizayuca" (página de giro). */
export function encabezadoGiro(fraseGiro: string): string {
  return `${fraseGiro.trim()} en ${CIUDAD}`;
}

/** "Plomería en Huicalco, Tizayuca" / "Plomería en Haciendas de Tizayuca". */
export function encabezadoGiroColonia(
  fraseGiro: string,
  coloniaNombre: string,
): string {
  return `${fraseGiro.trim()} en ${ubicacionDeColonia(coloniaNombre)}`;
}

/** "«Negocio» en «Colonia», Tizayuca" o "«Negocio» en Tizayuca" sin colonia. */
export function tituloFicha(
  nombreNegocio: string,
  coloniaNombre: string | null,
): string {
  const colonia = coloniaNombre?.trim();
  const ubicacion = colonia ? ubicacionDeColonia(colonia) : CIUDAD;
  return `${nombreNegocio.trim()} en ${ubicacion}`;
}

export function descripcionCategoria(nombreCategoria: string): string {
  return `${encabezadoCategoria(nombreCategoria)}: negocios de aquí, verificados uno por uno, que contactas directo por WhatsApp.`;
}

export function descripcionGiro(fraseGiro: string): string {
  return `${encabezadoGiro(fraseGiro)}: negocios verificados que contactas directo por WhatsApp, sin intermediarios.`;
}

export function descripcionGiroColonia(
  fraseGiro: string,
  coloniaNombre: string,
): string {
  return `${fraseGiro.trim()} en ${coloniaNombre.trim()}: negocios verificados de ${CIUDAD} que contactas directo por WhatsApp.`;
}

/**
 * Largo máximo de la descripción de una ficha. Google recorta alrededor de
 * los 160 caracteres y el "¿Qué ofreces?" admite 200: lo que sobra se corta
 * en el último espacio para no partir una palabra a la mitad.
 */
export const LONGITUD_MAXIMA_DESCRIPCION = 160;

function recortar(texto: string): string {
  if (texto.length <= LONGITUD_MAXIMA_DESCRIPCION) return texto;
  const cortado = texto.slice(0, LONGITUD_MAXIMA_DESCRIPCION);
  const ultimoEspacio = cortado.lastIndexOf(" ");
  const base = ultimoEspacio > 0 ? cortado.slice(0, ultimoEspacio) : cortado;
  return `${base.trimEnd()}…`;
}

/**
 * Descripción de la ficha: lo que escribió el negocio en "¿Qué ofreces?"
 * (recortado si es largo) y, si no escribió nada, la frase de respaldo con su
 * nombre y su colonia.
 *
 * Nunca incluye WhatsApp ni teléfono, y eso se cuida en dos niveles: por
 * CAMPO (aquí solo entran estos tres, nunca `whatsapp` ni `telefonoFijo`) y
 * por CONTENIDO (iteración 2, hallazgo M2: si el negocio escribió un número
 * dentro del "¿Qué ofreces?", se oculta antes de publicarlo).
 */
export function descripcionFicha(negocio: {
  nombre: string;
  coloniaNombre: string | null;
  queOfreces: string | null;
}): string {
  // `ocultarNumerosDeContacto` colapsa además los espacios de más (saltos de
  // línea incluidos): en una meta descripción no significan nada y sí se ven
  // en el resultado de búsqueda.
  const ofrece = negocio.queOfreces
    ? ocultarNumerosDeContacto(negocio.queOfreces)
    : "";
  if (ofrece) return recortar(ofrece);
  return `${tituloFicha(negocio.nombre, negocio.coloniaNombre)}. Negocio verificado que contactas directo por WhatsApp.`;
}
