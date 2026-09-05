/**
 * Enlace `wa.me` de "Perdí mi enlace" (spec `directorio-publico`, requirement
 * "Botón 'Perdí mi enlace' en la ficha, hacia el WhatsApp del admin").
 * Hermano de `src/lib/enlaces.ts` (el vecino que contacta al negocio) y de
 * `src/lib/admin/whatsapp.ts` (el panel): mismo patrón, número siempre
 * normalizado antes de armar el enlace.
 */
import { mensajePerdiMiEnlace } from "@/lib/gestion/textos";
import { normalizarWhatsapp } from "@/lib/whatsapp";

/**
 * Conversación de WhatsApp hacia el ADMIN, con el mensaje ya escrito (spec,
 * scenario "pedir el enlace desde la ficha"). `whatsappAdmin` ya debe venir
 * normalizado (`leerWhatsappAdmin`); si no se puede interpretar, no hay
 * enlace y quien llama no pinta el control.
 */
export function construirEnlacePerdiMiEnlace(
  nombreNegocio: string,
  whatsappAdmin: string | null,
): string | null {
  const digitos = whatsappAdmin ? normalizarWhatsapp(whatsappAdmin) : null;
  if (!digitos) return null;
  return `https://wa.me/52${digitos}?text=${encodeURIComponent(
    mensajePerdiMiEnlace(nombreNegocio),
  )}`;
}
