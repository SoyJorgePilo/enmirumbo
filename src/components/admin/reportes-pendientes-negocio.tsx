import type { ReportePendienteDetalle } from "@/lib/admin/reportes";
import {
  BOTON_MARCAR_ATENDIDO,
  TEXTO_REPORTES_SIN_ATENDER_ENCABEZADO,
} from "@/lib/admin/textos";
import { CLASE_BOTON_SECUNDARIO } from "@/lib/estilos-boton";

export type ReportesPendientesNegocioProps = {
  reportes: ReportePendienteDetalle[];
  /** Server Action del panel, ya con el id del NEGOCIO ligado con `.bind`; recibe el id del REPORTE. */
  action: (reporteId: string, formData: FormData) => void | Promise<void>;
};

/**
 * Sección "Reportes sin atender" del detalle (requirement "El detalle del
 * negocio lista sus reportes sin atender"): motivo con su etiqueta legible,
 * desde cuándo espera (misma forma en palabras que la cola) y el comentario
 * solo si el vecino escribió uno — como texto plano (JSX escapa por
 * construcción, sin `dangerouslySetInnerHTML`) y con `break-words` para que
 * una palabra larguísima no saque el layout a 390px. NO se muestra ningún
 * dato de quien reportó, porque no existe ninguno.
 *
 * Cada reporte lleva su propio `<form>` con "Marcar como atendido"
 * (requirement "Marcar un reporte como atendido, una sola vez"). La página
 * solo renderiza esta sección si `reportes.length > 0`. Server Component,
 * sin JS.
 *
 * **La confirmación de "Marcar como atendido" NO vive aquí**, aunque sea el
 * sitio natural: esta sección desaparece cuando el negocio se queda sin
 * pendientes, y entonces atender el ÚLTIMO reporte no confirmaba nada
 * (hallazgo M1 de la etapa D). El aviso lo pinta el detalle, exista o no esta
 * sección.
 */
export function ReportesPendientesNegocio({
  reportes,
  action,
}: ReportesPendientesNegocioProps) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-borde p-4">
      <h2 className="font-semibold text-tinta">{TEXTO_REPORTES_SIN_ATENDER_ENCABEZADO}</h2>

      <ul className="flex flex-col gap-4">
        {reportes.map((reporte) => (
          <li
            key={reporte.id}
            className="flex flex-col gap-2 border-b border-borde pb-4 last:border-0 last:pb-0"
          >
            <p className="font-semibold text-tinta">{reporte.motivoEtiqueta}</p>
            <p className="text-sm text-tinta-suave">{reporte.esperaTexto}</p>
            {reporte.comentario && (
              <p className="break-words text-tinta-suave">{reporte.comentario}</p>
            )}
            <form action={action.bind(null, reporte.id)}>
              <button type="submit" className={`${CLASE_BOTON_SECUNDARIO} w-full sm:w-auto`}>
                {BOTON_MARCAR_ATENDIDO}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
