/**
 * Textos literales del enlace de gestión (change `agregar-enlace-de-gestion`,
 * ticket T-014, tasks.md #8): el modo edición del formulario de registro
 * (`/editar/<token>`) y el control "Perdí mi enlace" de la ficha pública. Son
 * contenido aprobado, no copy libre — comparados carácter por carácter contra
 * la spec. Español mexicano coloquial (CLAUDE.md).
 *
 * Módulo puro: sin acceso a datos, sin Prisma, sin `process.env`. Hermano de
 * `src/lib/registro/textos.ts` y `src/lib/admin/textos.ts` (los literales del
 * panel de revisión de ediciones viven allá, extendidos, no duplicados aquí).
 */

// ── Modo edición (spec `registro-negocio`, requirement "El enlace de gestión
// abre la ficha en modo edición con el mismo formulario prellenado") ───────

export const TITULO_EDICION = "Edita tu ficha";

export const FRASE_EDICION =
  "Cambia lo que necesites y lo revisamos antes de publicarlo. Mientras tanto tu ficha sigue como está.";

export const BOTON_ENVIAR_CAMBIOS = "Enviar cambios";

/** Nota que sustituye al bloque de consentimiento en el modo edición. */
export const NOTA_PRIVACIDAD_VIGENTE =
  "Tus datos siguen protegidos por el mismo aviso de privacidad que aceptaste al registrarte.";

// El enlace "Lee el aviso de privacidad completo" es el mismo literal que el
// registro (`TEXTO_ENLACE_AVISO_INTEGRAL` en `src/lib/registro/textos.ts`):
// no se duplica aquí, se reexporta desde el componente que lo pinta.

/**
 * Requirement "Mandar cambios cuando ya hay otros esperando reemplaza a los
 * anteriores", scenario "aviso al abrir con cambios pendientes".
 */
export const AVISO_EDICION_PENDIENTE =
  "Ojo: ya tienes cambios esperando revisión. Si mandas otros, estos reemplazan a los anteriores.";

/**
 * Requirement "Enviar la edición no toca la ficha pública: crea una revisión
 * pendiente".
 */
export const MENSAJE_CAMBIOS_RECIBIDOS =
  "¡Gracias! Ya recibimos tus cambios. Los revisamos y en cuanto los aprobemos tu ficha se actualiza. Mientras tanto sigue publicada como está.";

export const ERROR_GUARDAR_EDICION =
  "No pudimos guardar tus cambios. Vuelve a intentarlo en un momento.";

/**
 * Requirement "La edición pasa por las mismas validaciones del registro y no
 * puede fijar lo que no le toca", scenario "WhatsApp que ya tiene otra
 * ficha". Mismo texto que el registro reutiliza tal cual (design.md §5), pero
 * declarado también aquí porque la edición lo compara contra OTRA ficha
 * (no consigo misma): el dev decide en `src/lib/gestion/` cuál usar según el
 * caso.
 */
export const ERROR_WHATSAPP_DUPLICADO_EDICION =
  "Ese número ya está en otra ficha del directorio.";

/** Requirement "Anti-abuso del envío de ediciones, con cupo propio". */
export const ERROR_CUPO_EDICION =
  "Ya recibimos varios cambios desde aquí. Espera un rato y vuelve a intentar.";

// ── "Perdí mi enlace" (spec `directorio-publico`) ───────────────────────────

export const ENCABEZADO_ES_TU_NEGOCIO = "¿Es tu negocio?";
export const CONTROL_PERDI_MI_ENLACE = "Perdí mi enlace";

export function mensajePerdiMiEnlace(nombreNegocio: string): string {
  return `Hola, soy de «${nombreNegocio}» en EnMiRumbo y perdí el enlace para editar mi ficha. Les escribo desde el número que registré, ¿me lo pueden pasar?`;
}
