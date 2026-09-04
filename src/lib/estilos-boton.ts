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

/**
 * Clase Tailwind del botón/enlace de acción SECUNDARIA (agregar-directorio-
 * publico, spec directorio-publico: "Ningún otro botón DEBE competir en
 * jerarquía visual con el de WhatsApp"). Mismo tamaño y área táctil que el
 * primario para no perder accesibilidad, pero neutro: sin el token `accion`.
 * Se usa en "Llamar", "Cómo llegar" y el enlace a la página registrada de la
 * ficha, y en la entrada "Ver clubes y escuelas deportivas" de la home.
 */
export const CLASE_BOTON_SECUNDARIO =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-borde bg-fondo px-6 py-3 text-base font-semibold text-tinta transition-colors hover:bg-superficie focus:outline-none focus:ring-2 focus:ring-accion-fuerte focus:ring-offset-2";
