import { TEXTO_INDICADOR_ATRASADO } from "@/lib/admin/textos";

/**
 * Indicador de "más de 48 horas esperando" (requirement "Indicador visible
 * de los registros con más de 48 horas esperando"): la señal es el TEXTO,
 * no el color — el ícono es decorativo (`aria-hidden`) y el borde neutro
 * (`border-tinta`, sin token de color nuevo) es solo refuerzo visual, nunca
 * el único portador del significado. Server Component, sin JS.
 */
export function IndicadorAtrasado() {
  return (
    <p className="inline-flex w-fit items-center gap-1.5 rounded-full border border-tinta px-2.5 py-1 text-xs font-semibold text-tinta">
      <span aria-hidden="true">⏰</span>
      {TEXTO_INDICADOR_ATRASADO}
    </p>
  );
}
