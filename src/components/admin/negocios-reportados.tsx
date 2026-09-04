import { TarjetaNegocioReportado } from "@/components/admin/tarjeta-negocio-reportado";
import type { NegocioReportadoColaItem } from "@/lib/admin/reportes";
import {
  TEXTO_NEGOCIOS_REPORTADOS_ENCABEZADO,
  textoConteoNegociosReportados,
} from "@/lib/admin/textos";

/**
 * Sección "Negocios reportados" de la cola (requirement "La cola avisa qué
 * negocios tienen reportes sin atender"): debajo de "Registros por revisar",
 * ordenada del que lleva más tiempo con un reporte sin atender al más
 * reciente (el orden ya viene resuelto en `negocios`, ver
 * `obtenerNegociosReportados` en `src/lib/admin/reportes.ts`).
 *
 * La página SOLO la renderiza si `negocios.length > 0` (requirement "sin
 * reportes pendientes no hay sección"): este componente no vuelve a
 * comprobarlo para no duplicar la regla en dos lugares. Server Component,
 * sin JS.
 */
export function SeccionNegociosReportados({
  negocios,
}: {
  negocios: NegocioReportadoColaItem[];
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold tracking-tight text-tinta">
          {TEXTO_NEGOCIOS_REPORTADOS_ENCABEZADO}
        </h2>
        <p className="text-sm font-semibold text-tinta">
          {textoConteoNegociosReportados(negocios.length)}
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {negocios.map((negocio) => (
          <li key={negocio.id}>
            <TarjetaNegocioReportado {...negocio} />
          </li>
        ))}
      </ul>
    </section>
  );
}
