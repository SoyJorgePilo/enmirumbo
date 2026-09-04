/**
 * Normalización del número de WhatsApp (design.md §3 del change
 * `agregar-formulario-registro`).
 *
 * Única puerta de entrada del número al modelo: el valor persistido es
 * SIEMPRE la forma de 10 dígitos. Sin esto, la unicidad `@unique` de
 * `Negocio.whatsapp` solo protege la cadena exacta y "una sola ficha por
 * número" (PRD §6.1) se brinca escribiendo "+52 771 123 4567" en vez de
 * "7711234567" (hallazgo M1 de T-001).
 *
 * El panel (E3), los seeds y la edición (E8) deben reutilizar esta función.
 */

/** Prefijos de país que se descartan cuando al quitarlos quedan 10 dígitos. */
const PREFIJOS_PAIS = ["521", "52"] as const;

const DIGITOS_NACIONALES = 10;

/**
 * Devuelve el número en su forma nacional de 10 dígitos, o `null` si la
 * entrada no corresponde a un número mexicano de 10 dígitos.
 *
 * Descarta espacios, guiones, puntos, paréntesis y el `+`, y quita el
 * prefijo de país `52`/`521` cuando al hacerlo quedan exactamente 10.
 */
export function normalizarWhatsapp(entrada: string): string | null {
  const digitos = entrada.replace(/\D/g, "");

  if (digitos.length === DIGITOS_NACIONALES) return digitos;

  for (const prefijo of PREFIJOS_PAIS) {
    if (
      digitos.length === prefijo.length + DIGITOS_NACIONALES &&
      digitos.startsWith(prefijo)
    ) {
      return digitos.slice(prefijo.length);
    }
  }

  return null;
}
