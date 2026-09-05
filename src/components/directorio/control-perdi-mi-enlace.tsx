import {
  CONTROL_PERDI_MI_ENLACE,
  ENCABEZADO_ES_TU_NEGOCIO,
} from "@/lib/gestion/textos";

export type ControlPerdiMiEnlaceProps = {
  /** `null` cuando `WHATSAPP_ADMIN` falta o no se normaliza: no se pinta nada. */
  href: string | null;
};

/**
 * Bloque "¿Es tu negocio?" con el control "Perdí mi enlace" (spec
 * `directorio-publico`, requirement "Botón 'Perdí mi enlace' en la ficha,
 * hacia el WhatsApp del admin"): al final de la ficha, después del bloque de
 * contacto, en jerarquía claramente menor que "Enviar WhatsApp" — mismo
 * criterio visual que `BotonReportar` (enlace de texto subrayado, sin el
 * verde de acción), área táctil ≥44px aunque se vea pequeño.
 *
 * Fail-safe (requirement "sin número de admin configurado"): sin `href` no
 * se pinta NADA, ni el encabezado, ni un enlace roto, ni un número inventado.
 * Server Component, sin JS. Abre pestaña nueva con `rel="noopener noreferrer"`
 * porque sale del sitio (misma regla que el resto de los `wa.me`).
 */
export function ControlPerdiMiEnlace({ href }: ControlPerdiMiEnlaceProps) {
  if (!href) return null;

  return (
    // Sin borde propio (design: reports/a-ui.md): comparte el separador con
    // el resto de los controles discretos del pie de la ficha (p. ej.
    // `BotonReportar`), que ya abren esa línea — dos reglas horizontales
    // seguidas se verían como un error de maquetación, no como dos secciones.
    <div className="flex flex-col gap-1">
      <p className="text-sm font-semibold text-tinta">{ENCABEZADO_ES_TU_NEGOCIO}</p>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center text-sm text-tinta-suave underline underline-offset-4 hover:text-tinta"
      >
        {CONTROL_PERDI_MI_ENLACE}
      </a>
    </div>
  );
}
