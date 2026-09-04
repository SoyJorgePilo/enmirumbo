import Link from "next/link";

import type { NegocioReportadoColaItem } from "@/lib/admin/reportes";
import { TEXTO_VER_REPORTES, textoReportesSinAtender } from "@/lib/admin/textos";

/**
 * Renglón de "Negocios reportados" (requirement "La cola avisa qué negocios
 * tienen reportes sin atender"): nombre, cuántos reportes sin atender y la
 * entrada "Ver reportes" al detalle. Mismo patrón "stretched link" que
 * `tarjeta-cola.tsx`: una sola acción por renglón, así que todo el
 * `<article>` es el enlace. Server Component, sin JS.
 */
export function TarjetaNegocioReportado({
  id,
  nombre,
  totalPendientes,
}: NegocioReportadoColaItem) {
  return (
    <article className="relative flex min-h-11 flex-col gap-1.5 rounded-xl border border-borde bg-fondo p-4">
      <h3 className="font-semibold break-words text-tinta">
        <Link href={`/admin/registros/${id}`} className="after:absolute after:inset-0">
          {nombre}
        </Link>
      </h3>
      <p className="text-sm text-tinta-suave">{textoReportesSinAtender(totalPendientes)}</p>
      <span aria-hidden="true" className="text-sm font-semibold text-accion-fuerte">
        {TEXTO_VER_REPORTES} →
      </span>
    </article>
  );
}
