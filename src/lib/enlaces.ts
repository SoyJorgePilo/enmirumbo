/**
 * Enlaces que sacan al vecino del sitio (design.md §4 del change
 * `agregar-directorio-publico`): WhatsApp, Google Maps y la página que
 * registró el negocio. Se arman aquí y no en el JSX para que las reglas
 * (normalizar el número, no inventar direcciones, no prometer Facebook) sean
 * probables sin renderizar una página.
 *
 * Todos los enlaces que abren pestaña nueva llevan `rel="noopener noreferrer"`
 * en el JSX que los pinta; `tel:` no abre pestaña, así que no lo necesita.
 */
import { normalizarWhatsapp } from "@/lib/whatsapp";

/**
 * Mensaje prellenado del WhatsApp (spec `directorio-publico`, requirement "El
 * mensaje prellenado del WhatsApp nombra al directorio con la marca vigente").
 *
 * Va SIN descriptor geográfico a propósito: el negocio que lo recibe está en
 * Tizayuca y ya sabe dónde está, así que decírselo solo alarga un mensaje que
 * se lee en el celular (resolución del fundador del 2026-09-04).
 */
export const MENSAJE_WHATSAPP_PRELLENADO =
  "Hola, te vi en EnMiRumbo. ¿Me das informes?";

/** Lo que se muestra de la página registrada: a dónde lleva y qué dominio es. */
export type PaginaRegistrada = {
  href: string;
  /** Dominio real al que apunta, sin `www.` (hallazgo M4 de T-003). */
  dominio: string;
};

/**
 * Conversación de WhatsApp con el negocio, con el mensaje ya escrito.
 *
 * El número se pasa por `normalizarWhatsapp` (T-003) antes de armar el
 * enlace: una fila sembrada a mano con formato raro ("+52 771 123 4567") no
 * tiene por qué generar un `wa.me` roto. Si ni así se puede interpretar,
 * devuelve `null` y quien llama decide qué hacer — nunca un enlace inventado.
 */
export function construirEnlaceWhatsapp(whatsapp: string): string | null {
  const digitos = normalizarWhatsapp(whatsapp);
  if (!digitos) return null;
  return `https://wa.me/52${digitos}?text=${encodeURIComponent(
    MENSAJE_WHATSAPP_PRELLENADO,
  )}`;
}

/**
 * Enlace de llamada al teléfono fijo, en forma internacional (`tel:+52…`).
 *
 * Hallazgo M2 de la etapa C: el fijo se pintaba crudo en el `href`. En el
 * registro ese campo solo tiene cota de longitud —no se valida que sean
 * dígitos—, así que en la base puede haber texto, HTML o una secuencia de
 * marcación (`*21*…#` desvía las llamadas de quien la marca). Se aplica el
 * mismo criterio que al WhatsApp: se normaliza a los 10 dígitos nacionales
 * (misma regla mexicana, por eso se reutiliza `normalizarWhatsapp`) y, si no
 * quedan 10, no hay enlace. La ficha entonces muestra el texto que capturó el
 * negocio, pero sin botón "Llamar": nadie marca algo que no es un número.
 */
export function construirEnlaceTelefono(
  telefono: string | null | undefined,
): string | null {
  if (!telefono) return null;
  const digitos = normalizarWhatsapp(telefono);
  return digitos ? `tel:+52${digitos}` : null;
}

/**
 * Búsqueda en Google Maps con lo que capturó el negocio + su colonia +
 * "Tizayuca, Hidalgo". No hay coordenadas (el pin sigue pospuesto) y no se
 * inventa domicilio: sin dirección ni referencias no hay enlace (`null`), y
 * la ficha simplemente no pinta el botón "Cómo llegar".
 */
export function construirEnlaceComoLlegar(
  direccion: string | null | undefined,
  coloniaNombre?: string | null,
): string | null {
  const referencia = direccion?.trim();
  if (!referencia) return null;

  const partes = [referencia, coloniaNombre?.trim(), "Tizayuca, Hidalgo"].filter(
    (parte): parte is string => Boolean(parte),
  );
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    partes.join(", "),
  )}`;
}

/**
 * Página que el negocio registró (columna `facebookUrl`), con el dominio al
 * que de verdad apunta: la validación del registro solo garantiza `http(s)`,
 * así que la ficha no puede afirmar que es Facebook (hallazgo M4 de T-003).
 * Si la URL guardada no se puede interpretar, o no es `http(s)`, devuelve
 * `null` y el enlace no se pinta.
 */
export function obtenerPaginaRegistrada(
  url: string | null | undefined,
): PaginaRegistrada | null {
  if (!url) return null;

  let interpretada: URL;
  try {
    interpretada = new URL(url);
  } catch {
    return null;
  }

  if (interpretada.protocol !== "http:" && interpretada.protocol !== "https:") {
    return null;
  }

  return { href: url, dominio: interpretada.hostname.replace(/^www\./, "") };
}
