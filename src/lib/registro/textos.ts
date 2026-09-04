/**
 * Textos literales del registro (spec `registro-negocio`) y cotas de longitud
 * (design.md §3). Son contenido aprobado, no copy libre: cambiarlos aquí
 * cambia lo que dice la spec, así que se editan junto con ella.
 *
 * Todo texto va en español mexicano coloquial (CLAUDE.md).
 */

/** Valor centinela del `<option>` "Otra" del select de colonia (no es un id). */
export const COLONIA_OTRA_VALOR = "otra";

/**
 * Máximos de caracteres de cada campo del formulario (design.md §3).
 * Solo el 200 de "¿Qué ofreces?" viene del PRD §6.1; el resto son cotas
 * defensivas del servidor.
 *
 * `whatsapp`, `categoriaId` y `coloniaId` también llevan cota (hallazgo MEDIO
 * 3 de la etapa C): sin ella un POST crudo podía mandar 100 KB en un campo que
 * el formulario devuelve tal cual al pintar el error, o sea amplificación de
 * respuesta gratis. Son cortas porque esos tres campos solo admiten un número
 * de 10 dígitos con separadores o un id de catálogo.
 */
export const LIMITES_LONGITUD = {
  nombre: 80,
  categoriaId: 10,
  whatsapp: 30,
  coloniaId: 10,
  coloniaOtra: 80,
  queOfreces: 200,
  telefonoFijo: 20,
  direccion: 200,
  horario: 100,
  facebookUrl: 300,
} as const;

/**
 * Mensaje de campo demasiado largo. Con 200 produce exactamente el literal
 * de la spec para "¿Qué ofreces?", así que un solo molde cubre todos los
 * campos sin inventar variantes de redacción.
 */
export function mensajeLimiteLongitud(maximo: number): string {
  return `Deja esto en ${maximo} caracteres o menos`;
}

export const MENSAJES_ERROR_REGISTRO = {
  nombre: "Escribe el nombre de tu negocio",
  categoriaId: "Elige una categoría",
  whatsapp: "Revisa tu número de WhatsApp: deben ser 10 dígitos",
  coloniaId: "Elige tu colonia",
  coloniaOtra: "Escribe el nombre de tu colonia",
  consentimiento: "Marca la casilla para poder registrar tu negocio",
  queOfreces: mensajeLimiteLongitud(LIMITES_LONGITUD.queOfreces),
  facebookUrl: "El link de Facebook debe empezar con http:// o https://",
  whatsappDuplicado:
    "Este número ya tiene una ficha registrada. Si es tu negocio, no hace falta registrarlo otra vez: te vamos a pasar por WhatsApp el enlace para editarlo.",
  limiteIp:
    "Ya recibimos varios registros desde aquí. Espera un rato y vuelve a intentar.",
  servidor: "No pudimos guardar tu registro. Vuelve a intentarlo en un momento.",
} as const;

export const MENSAJE_GRACIAS =
  "¡Gracias! Tu negocio está en revisión. Te contactaremos por WhatsApp para confirmar tus datos antes de publicarlo.";

// Aviso simplificado (E1-6 / hallazgo M3 de T-004, spec `registro-negocio`
// delta de `agregar-paginas-legales`, requirement "Consentimiento con aviso
// simplificado visible y constancia"): avisa de forma llana que el WhatsApp
// y el teléfono quedan públicos, antes de que el dueño marque la casilla.
export const TEXTO_AVISO_PRIVACIDAD =
  "Aviso de privacidad (resumen): NecesitoUno Tizayuca usa los datos que escribes aquí para revisar tu negocio, contactarte por WhatsApp y publicar tu ficha en el directorio. Ojo con esto: si publicamos tu ficha, el nombre de tu negocio, tu WhatsApp, tu teléfono fijo y lo demás que escribas quedan a la vista de cualquiera que entre al directorio, con botones para escribirte o marcarte directo. Publicamos tu colonia, no tu domicilio exacto, salvo que tú escribas la dirección. No vendemos ni compartimos tus datos con nadie más. Puedes pedirnos que corrijamos o borremos tu ficha cuando quieras, por el mismo WhatsApp con el que te contactemos; lo atendemos en máximo 20 días hábiles.";

// Enlace del bloque de consentimiento hacia el aviso integral (E6, ya existe
// en /aviso-de-privacidad). Misma pestaña: no es un enlace externo.
export const TEXTO_ENLACE_AVISO_INTEGRAL = "Lee el aviso de privacidad completo";

export const TEXTO_CONSENTIMIENTO =
  "Acepto el aviso de privacidad y confirmo que este negocio es mío o que tengo permiso para registrarlo.";
