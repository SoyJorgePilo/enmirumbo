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
 * ficha, en el botón "Buscar" y en la entrada "Ver clubes y escuelas
 * deportivas" de la home.
 *
 * ENMENDADO (decisión B1 del paquete visual, enmienda aprobada por el fundador
 * en la revisión visual lote 2): el borde sube de `borde` (decorativo, ~1.1:1)
 * a `borde-control` (4.83:1 sobre fondo). Un botón es un componente de
 * interfaz, no un adorno: WCAG 2.1 1.4.11 le exige ≥3:1 igual que a un input,
 * y con el borde antiguo el botón secundario apenas se recortaba del fondo
 * blanco. La jerarquía no se toca: el secundario sigue sin el token `accion`
 * en ningún papel —ni fondo, ni texto, ni borde—, así que el único relleno
 * verde de la pantalla sigue siendo el de la acción principal.
 */
export const CLASE_BOTON_SECUNDARIO =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-borde-control bg-fondo px-6 py-3 text-base font-semibold text-tinta transition-colors hover:bg-superficie focus:outline-none focus:ring-2 focus:ring-accion-fuerte focus:ring-offset-2";
