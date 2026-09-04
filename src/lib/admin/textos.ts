/**
 * Textos literales del panel de revisión (spec `revision-admin`) y las tres
 * plantillas de mensaje de WhatsApp aprobadas en la propuesta (duda 1). Son
 * contenido aprobado, no copy libre — se comparan carácter por carácter
 * contra la spec (tasks.md #7 y #26). Todo en español mexicano coloquial
 * (CLAUDE.md). Módulo puro: sin acceso a datos, sin lectura de sesión ni de
 * variables de entorno.
 */

// ── Acceso (requirement "Acceso al panel...") ───────────────────────────────
export const TEXTO_ENCABEZADO_ACCESO = "Panel de revisión";
export const ETIQUETA_CONTRASENA = "Contraseña";
export const BOTON_ENTRAR = "Entrar";
export const ERROR_CONTRASENA_INCORRECTA = "Contraseña incorrecta.";
export const ERROR_DEMASIADOS_INTENTOS =
  "Demasiados intentos. Espera unos minutos y vuelve a intentar.";
export const MENSAJE_SESION_CERRADA = "Cerraste sesión.";
export const BOTON_SALIR = "Salir";

// ── Fail-safe (requirement "Sin contraseña configurada el panel no abre") ──
export const MENSAJE_PANEL_NO_DISPONIBLE = "El panel no está disponible por ahora.";

// ── Cola (requirement "Cola de revisión...") ────────────────────────────────
export const TEXTO_COLA_ENCABEZADO = "Registros por revisar";
export const TEXTO_COLA_VACIA = "No hay registros esperando. Todo al día.";
export const TEXTO_REVISAR = "Revisar";

// ── Indicador de 48 horas ────────────────────────────────────────────────────
export const TEXTO_INDICADOR_ATRASADO = "Lleva más de 48 horas";

/**
 * Conteo de atrasados en la cabecera de la cola. No hay literal en la spec
 * para esta frase (solo dice "la cola DEBE decir cuántos están en esa
 * condición") — copy propuesto, ver reports/a-ui.md.
 */
export function textoConteoAtrasados(cantidad: number): string {
  const plural = cantidad === 1 ? "registro lleva" : "registros llevan";
  return `${cantidad} ${plural} más de 48 horas esperando.`;
}

// ── Verificación por WhatsApp ────────────────────────────────────────────────
export const BOTON_WHATSAPP_VERIFICACION = "Escribirle por WhatsApp";

export function mensajeVerificacion(nombreNegocio: string): string {
  return `Hola, te escribo de NecesitoUno Tizayuca, el directorio de negocios del municipio. Recibimos el registro de «${nombreNegocio}». ¿Nos confirmas que el negocio es tuyo y que este es tu WhatsApp?`;
}

// ── Aprobar ──────────────────────────────────────────────────────────────────
export const ETIQUETA_GIROS = "Giros (de 1 a 3, o ninguno si no embona)";
export const ETIQUETA_COLONIA_APROBAR = "¿En qué colonia está?";
export const ETIQUETA_ORIGEN = "¿De dónde salió?";
export const OPCION_ORIGEN_ORGANICO = "Se registró solo";
export const OPCION_ORIGEN_SIEMBRA = "Lo sembramos nosotros";
export const BOTON_APROBAR = "Aprobar y publicar";
export const ERROR_MAX_GIROS = "Elige máximo 3 giros";
export const ERROR_COLONIA_PENDIENTE = "Elige la colonia de este negocio";

export const MENSAJE_APROBADO = "Ya quedó publicado.";
export const BOTON_AVISAR_WHATSAPP = "Avisarle por WhatsApp";

export function mensajeAvisoPublicacion(
  nombreNegocio: string,
  linkFicha: string,
): string {
  return `¡Listo! Ya quedó publicado «${nombreNegocio}» en NecesitoUno Tizayuca. Esta es tu ficha: ${linkFicha} — compártela con tus clientes.`;
}

// ── Rechazar ─────────────────────────────────────────────────────────────────
export const ETIQUETA_MOTIVO_RECHAZO = "¿Por qué lo rechazas?";
export const BOTON_RECHAZAR = "Rechazar";
export const ERROR_MOTIVO_VACIO = "Escribe por qué lo rechazas";
export const MENSAJE_RECHAZADO = "Registro rechazado.";

export function mensajeAvisoRechazo(nombreNegocio: string, motivo: string): string {
  return `Hola, revisamos el registro de «${nombreNegocio}» en NecesitoUno Tizayuca y por ahora no lo pudimos publicar: ${motivo}. Si lo corriges, lo puedes volver a enviar desde el mismo formulario con este mismo número.`;
}

// ── Transición sobre un registro ya resuelto ────────────────────────────────
export const MENSAJE_YA_RESUELTO = "Este registro ya lo habías resuelto.";

// ── Navegación y avisos operativos del panel ────────────────────────────────
// Sin literal en la spec: copy propuesto (ver reports/a-ui.md y b-dev.md).
export const TEXTO_VOLVER_A_LA_COLA = "Volver a la cola";

/**
 * Falta la URL pública del sitio en producción, así que no se puede armar el
 * link absoluto de la ficha. El panel lo dice a la vista en vez de mandarle a
 * un negocio real un enlace a `localhost` (design.md §7).
 */
export const MENSAJE_SIN_URL_DEL_SITIO =
  "No se pudo armar el link de la ficha porque falta configurar la dirección pública del sitio. El negocio ya quedó publicado; avísale cuando esté configurada.";
