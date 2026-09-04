import Link from "next/link";

import { CONTROL_REPORTAR } from "@/lib/reportes/textos";

export type BotonReportarProps = {
  /** Nombre del negocio, para que la etiqueta accesible diga a quién se reporta. */
  nombre: string;
  /** Ruta al mini-formulario, `/negocio/<segmento>/reportar`. */
  href: string;
};

/**
 * Control discreto "Reportar este negocio" (spec `directorio-publico`,
 * requirement "Control discreto 'Reportar este negocio' en la ficha"): va al
 * final de la ficha, después del bloque de contacto, y en jerarquía
 * claramente menor que "Enviar WhatsApp" — sin el verde de acción, sin
 * tamaño de botón principal, solo un enlace de texto subrayado. Área táctil
 * ≥44px (`min-h-11`) aunque visualmente sea pequeño. Server Component, sin JS.
 *
 * La etiqueta accesible nombra al negocio (requirement "etiqueta accesible
 * con el nombre del negocio"): un lector de pantalla no debe anunciar solo
 * "Reportar" sin decir de qué ficha se trata.
 */
export function BotonReportar({ nombre, href }: BotonReportarProps) {
  return (
    <div className="border-t border-borde pt-4">
      <Link
        href={href}
        aria-label={`${CONTROL_REPORTAR}: ${nombre}`}
        className="inline-flex min-h-11 items-center text-sm text-tinta-suave underline underline-offset-4 hover:text-tinta"
      >
        {CONTROL_REPORTAR}
      </Link>
    </div>
  );
}
