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

/**
 * Política de foto del PRD §6.1, texto de ayuda visible ANTES de elegir el
 * archivo (spec `registro-negocio`, requirement "El campo de foto explica la
 * política del PRD §6.1 y abre la galería del celular").
 */
export const TEXTO_POLITICA_FOTO =
  "Una foto de tu local, de tus productos o de tu trabajo. Que no salgan personas que se puedan reconocer. Máximo 5 MB (JPG, PNG o WebP); nosotros la comprimimos para que cargue rápido.";

/** Casilla siempre visible, mismo texto para cualquiera (anti-oráculo). */
export const TEXTO_CASILLA_SIN_FOTO = "Dejar mi ficha sin foto";

/**
 * Tipos MIME que el campo declara aceptar (`accept` del `<input>`): es una
 * ayuda del navegador para filtrar la galería, no la validación real — esa
 * la hace el servidor por contenido (requirement "El servidor solo acepta la
 * foto si es una imagen real de máximo 5 MB").
 */
export const ACCEPT_FOTO = "image/jpeg,image/png,image/webp";

/**
 * Los tres mensajes de error de la foto en sí (spec `registro-negocio`,
 * requirement "El servidor solo acepta la foto si es una imagen real de
 * máximo 5 MB"): cada uno va, literal, junto al campo de foto. Vive aquí, no
 * repartido en el código del dev, para que el texto no se desvíe de la spec
 * (mismo criterio que `MENSAJES_ERROR_REGISTRO`).
 */
export const MENSAJES_ERROR_FOTO = {
  demasiadoGrande: "Esa foto pesa más de 5 MB. Sube una más ligera.",
  noEsImagen: "No pudimos leer esa foto. Sube una imagen JPG, PNG o WebP.",
  errorProcesamiento: "No pudimos preparar tu foto. Intenta con otra.",
  /**
   * El servidor ya estaba abriendo todas las fotos que se compromete a abrir a
   * la vez (spec `registro-negocio`, requirement "El trabajo de imagen tiene un
   * techo y el que no cabe se va con un mensaje, no a una cola"). No dice nada
   * de la carga real ni del motivo técnico: solo que se reintente.
   */
  servidorOcupado: "Estamos recibiendo muchas fotos, intenta de nuevo en un momento",
} as const;

/**
 * Cuando el envío traía foto pero se rechazó por OTRO campo (requirement "El
 * servidor valida todos los campos...", scenario "hay que volver a elegir la
 * foto"): ningún navegador repuebla un `<input type="file">`, así que hay que
 * decirlo.
 */
export const AVISO_FOTO_NO_GUARDADA =
  "Tu foto no se quedó guardada: vuelve a elegirla antes de enviar.";

export const MENSAJE_GRACIAS =
  "¡Gracias! Tu negocio está en revisión. Te contactaremos por WhatsApp para confirmar tus datos antes de publicarlo.";

// El aviso integral es E6: mientras no exista, este texto no lleva enlaces
// (cero enlaces muertos) y anuncia que el enlace llegará.
export const TEXTO_AVISO_PRIVACIDAD =
  "Aviso de privacidad (resumen): NecesitoUno Tizayuca usa los datos que escribes aquí solo para revisar tu negocio, contactarte por WhatsApp y publicar tu ficha en el directorio. Publicamos tu colonia, no tu domicilio exacto, salvo que tú escribas la dirección. No vendemos ni compartimos tus datos con nadie más. Puedes pedirnos que corrijamos o borremos tu ficha cuando quieras, por el mismo WhatsApp con el que te contactemos; lo atendemos en máximo 20 días hábiles. Cuando publiquemos el aviso completo, aquí va a estar el enlace.";

export const TEXTO_CONSENTIMIENTO =
  "Acepto el aviso de privacidad y confirmo que este negocio es mío o que tengo permiso para registrarlo.";
