/**
 * Enlace `wa.me` con mensaje prellenado propio del panel (design.md §8 del
 * change `agregar-panel-admin`: "el mensaje del vecino no sirve aquí").
 * Módulo hermano de `src/lib/enlaces.ts`, misma regla: el número SIEMPRE pasa
 * por `normalizarWhatsapp` (T-003) antes de armar el enlace;
 * si no se puede interpretar como número mexicano de 10 dígitos, no hay
 * enlace — quien llama decide qué mostrar en su lugar (requirement "Botón de
 * verificación...", scenario "número que no se puede interpretar").
 */
import { normalizarWhatsapp } from "@/lib/whatsapp";

export function construirEnlaceWhatsappPanel(
  whatsapp: string,
  mensaje: string,
): string | null {
  const digitos = normalizarWhatsapp(whatsapp);
  if (!digitos) return null;
  return `https://wa.me/52${digitos}?text=${encodeURIComponent(mensaje)}`;
}
