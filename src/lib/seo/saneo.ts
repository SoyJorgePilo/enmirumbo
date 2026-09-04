/**
 * Saneo del texto que el negocio escribe y que este change saca de la ficha
 * (iteración 2, hallazgo M2 de la etapa C).
 *
 * El "¿Qué ofreces?" es texto libre de 200 caracteres y muchos negocios
 * escriben ahí su número ("Plomería 24 horas, llámanos al 771 000 0000").
 * En la ficha eso se le muestra a una persona y no es dato nuevo —el botón de
 * WhatsApp ya está ahí—, pero la metadata y el JSON-LD lo sacan de la ficha:
 * viajan al resultado de Google, a la vista previa de WhatsApp y, en el caso
 * del JSON-LD, en formato legible por máquina. Eso es justo lo que el
 * requirement de la spec prohíbe ("La descripción NO DEBE incluir el WhatsApp
 * ni el teléfono del negocio") y lo que el hallazgo M5 de T-004 quiere evitar.
 *
 * Nadie edita el texto que el negocio escribió: se oculta solo la secuencia de
 * dígitos, y solo en las tres superficies que salen de la ficha.
 */

/** Con qué se sustituye la secuencia de dígitos ocultada. */
export const MARCA_DE_NUMERO_OCULTO = "…";

/**
 * Una secuencia de **7 o más dígitos**, admitiendo entre ellos los separadores
 * con los que se escribe un teléfono (espacios, guiones, puntos, paréntesis,
 * diagonales, `+`). Siete es el largo de un número local; los de México tienen
 * diez.
 *
 * Los separadores NO incluyen letras ni comas, así que lo que la gente sí
 * quiere leer sobrevive: "de 6 a 12 años", "L-S 9am-7pm", "$1,200", "24 horas".
 */
const SECUENCIA_DE_DIGITOS = /\+?\d(?:[\s().\-+/·–—]*\d){6,}/g;

/**
 * El texto sin números de contacto. Si no hay ninguno, devuelve el texto tal
 * cual (colapsando espacios de más, que en una meta descripción no significan
 * nada y sí se ven en el resultado de búsqueda).
 *
 * Es conservador a propósito: puede ocultar de más (un rango de años escrito
 * "2020-2024" son ocho dígitos y también se oculta) y nunca de menos. Ocultar
 * un dato que no era un teléfono es un texto un poco más pobre; no ocultarlo
 * es publicar el número en el snippet de Google.
 */
export function ocultarNumerosDeContacto(texto: string): string {
  return texto
    .replace(SECUENCIA_DE_DIGITOS, MARCA_DE_NUMERO_OCULTO)
    // "llámanos al 771 000 0000." no puede quedar como "llámanos al ….".
    .replace(/…[.,;:!¡¿?\-–—]+/g, MARCA_DE_NUMERO_OCULTO)
    .replace(/\s+/g, " ")
    .trim();
}
