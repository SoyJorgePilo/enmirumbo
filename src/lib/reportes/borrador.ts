/**
 * Borrador del comentario del reporte, para que un envío con error devuelva el
 * formulario **conservando lo que el vecino ya había escrito** (spec
 * `directorio-publico`, requirement "El servidor valida el motivo y el
 * comentario…") sin que ese texto viaje nunca por la URL.
 *
 * Por qué no va en la query string (hallazgo M2 de la etapa C): cualquier
 * proxy, CDN o balanceador escribe `path + query` en su log de acceso sin que
 * nadie se lo pida, y la URL se queda además en el historial del navegador de
 * un teléfono que en un municipio se comparte. El comentario es texto libre en
 * el que la gente escribe datos de terceros ("hablé con la dueña Fulanita
 * al…"), en una página que le acaba de prometer "No te pedimos ningún dato
 * tuyo." La spec de privacidad es explícita: el contenido del reporte no se
 * escribe en el log.
 *
 * Por qué una cookie y no `useActionState` (que es como el registro conserva
 * lo capturado): ese hook exige que el formulario sea un Client Component, y
 * para ESTA página la spec lo prohíbe ("la página de reporte con su
 * confirmación DEBEN ser Server Components y NO DEBEN agregar JavaScript de
 * cliente propio"), con un test que lo vigila. La cookie consigue lo mismo sin
 * una línea de JavaScript: viaja en el encabezado —que los proxys no
 * registran—, no se puede leer desde el navegador (`httpOnly`), solo se manda
 * a la ruta del formulario y caduca en dos minutos.
 *
 * El valor va en base64url del UTF-8: así el texto no lleva ni comas, ni
 * comillas, ni acentos crudos a un encabezado `Set-Cookie`, sin depender de
 * cómo codifique cada capa.
 */

/** Neutro a propósito: el nombre no cuenta de qué ficha es el borrador. */
export const NOMBRE_COOKIE_BORRADOR = "nu_reporte_borrador";

/**
 * Dos minutos: lo que tarda alguien en corregir el error que le devolvió el
 * formulario. Pasado ese rato el borrador se evapora solo, que es justo lo que
 * se quiere de un texto que no se llegó a enviar.
 */
export const DURACION_BORRADOR_S = 120;

/**
 * Codifica el borrador para la cookie. Devuelve `""` cuando no hay nada que
 * guardar, que es la señal para borrarla.
 */
export function codificarBorrador(comentario: string, limite: number): string {
  let recortado = comentario.trim().slice(0, limite);
  // Recortar por unidades UTF-16 puede partir un emoji a la mitad y dejar una
  // mitad suelta; se tira esa mitad antes de codificar.
  if (/[\uD800-\uDBFF]$/.test(recortado)) recortado = recortado.slice(0, -1);
  if (recortado === "") return "";
  return Buffer.from(recortado, "utf8").toString("base64url");
}

/**
 * Lee el borrador de la cookie. Cualquier valor que no se pueda interpretar
 * —lo que llega de una cookie es tan hostil como lo que llega de un
 * formulario— se trata como "no había borrador": el formulario sale vacío, no
 * roto.
 */
export function decodificarBorrador(valor: string | undefined, limite: number): string {
  if (!valor) return "";
  if (!/^[A-Za-z0-9_-]{1,4096}$/.test(valor)) return "";
  try {
    return Buffer.from(valor, "base64url").toString("utf8").slice(0, limite);
  } catch {
    return "";
  }
}

/**
 * Atributos de la cookie del borrador. `path` la ata a la ruta del formulario
 * de ESE negocio: no se manda en ninguna otra petición del sitio. `sameSite`
 * lax por lo mismo que la del panel (la gente llega a la ficha desde un enlace
 * de WhatsApp).
 */
export function opcionesCookieBorrador(rutaFormulario: string, esHttps: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: rutaFormulario,
    maxAge: DURACION_BORRADOR_S,
    secure: esHttps,
  };
}
