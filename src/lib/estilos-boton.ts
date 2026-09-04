/**
 * Clase Tailwind del botón/enlace de acción principal (verde WhatsApp,
 * PRD §11): la única superficie del sitio que usa el token `accion`, con
 * texto en `tinta` (nunca verde como color de texto — ver globals.css).
 * Se comparte entre el CTA "Registra tu negocio gratis" de la home y el
 * botón de envío del formulario de registro para que ambos se lean como la
 * misma acción — "nada compite con el botón de WhatsApp".
 */
export const CLASE_BOTON_PRIMARIO =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accion px-6 py-3 text-base font-semibold text-tinta transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accion-fuerte focus:ring-offset-2";
