/**
 * Textos literales del botón "Reportar" y su mini-formulario (spec
 * `directorio-publico`, delta del change `agregar-boton-reportar`; tasks.md
 * #3). Son contenido aprobado, no copy libre — comparados carácter por
 * carácter contra la spec. Español mexicano coloquial (CLAUDE.md).
 *
 * Módulo puro: sin acceso a datos, sin Prisma, sin `process.env`.
 */

/** Texto del control discreto en la ficha Y del `h1` de la página del formulario. */
export const CONTROL_REPORTAR = "Reportar este negocio";

export const FRASE_REPORTAR =
  "Dinos qué pasa y lo revisamos. No te pedimos ningún dato tuyo.";

export const ETIQUETA_QUE_PASA = "¿Qué pasa?";

export const ETIQUETA_COMENTARIO_REPORTE = "¿Nos quieres contar más? (opcional)";
export const AYUDA_COMENTARIO_REPORTE = "Máximo 300 caracteres.";

export const BOTON_ENVIAR_REPORTE = "Enviar reporte";
export const ENLACE_VOLVER_A_LA_FICHA = "Volver a la ficha";

export const MENSAJE_REPORTE_ENVIADO =
  "¡Gracias por avisarnos! Vamos a revisar este negocio.";

// ── Errores (validación server-side, requirement "El servidor valida el
// motivo y el comentario del reporte") ─────────────────────────────────────
export const ERROR_MOTIVO_REPORTE = "Dinos qué pasa con este negocio";

/** Cota de caracteres del comentario (duda 3 resuelta en la aprobación: 300). */
export const LIMITE_COMENTARIO_REPORTE = 300;
export const ERROR_COMENTARIO_LARGO_REPORTE =
  "El comentario es muy largo (máximo 300 caracteres)";
export const ERROR_GUARDADO_REPORTE =
  "No pudimos enviar tu reporte. Vuelve a intentarlo en un momento.";

/** Cupo por IP agotado (design.md §2: 3 reportes por hora, contador propio). */
export const ERROR_CUPO_REPORTES =
  "Ya recibimos varios reportes desde aquí. Espera un rato y vuelve a intentar.";
