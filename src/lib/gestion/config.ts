/**
 * Configuración del enlace de gestión (spec `directorio-publico`, requirement
 * "Botón 'Perdí mi enlace' en la ficha, hacia el WhatsApp del admin"; ticket
 * T-014, tasks.md #28).
 *
 * Mismo criterio fail-safe que `src/lib/admin/config.ts` y `src/lib/sitio.ts`:
 * el número del admin vive SOLO en una variable de entorno del servidor. Sin
 * ella, o si no se puede normalizar a 10 dígitos mexicanos, no hay número que
 * mostrar — el bloque "¿Es tu negocio?" no se pinta (`leerWhatsappAdmin`
 * devuelve `null` y quien llama decide no renderizar nada).
 *
 * Módulo puro: recibe el entorno como parámetro, así que se puede probar sin
 * ensuciar el proceso. El número NUNCA se escribe en el log.
 */
import { normalizarWhatsapp } from "@/lib/whatsapp";

/** Nombre de la variable con el WhatsApp del admin. */
export const VARIABLE_WHATSAPP_ADMIN = "WHATSAPP_ADMIN";

/** Lo poco que este módulo necesita del entorno. */
export type EntornoGestion = Record<string, string | undefined>;

/**
 * WhatsApp del admin ya normalizado a 10 dígitos, o `null` si la variable
 * falta o no se puede interpretar como un número mexicano.
 */
export function leerWhatsappAdmin(
  env: EntornoGestion = process.env,
): string | null {
  const declarado = env[VARIABLE_WHATSAPP_ADMIN];
  if (!declarado) return null;
  return normalizarWhatsapp(declarado);
}
