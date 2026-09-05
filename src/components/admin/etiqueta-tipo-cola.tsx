import type { TipoRenglonCola } from "@/lib/admin/consultas";
import { ETIQUETA_ALTA_NUEVA, ETIQUETA_EDICION } from "@/lib/admin/textos";

/**
 * Etiqueta "Alta nueva" / "Edición" de un renglón de la cola mezclada (spec
 * `revision-admin`, requirement "Cola de revisión con los registros
 * pendientes, más antiguos primero" MODIFIED: "la distinción NO DEBE
 * depender solo del color... DEBE ser legible como texto"). Mismo criterio
 * que `IndicadorAtrasado` y `ETIQUETA_COLA_DESPUBLICADA`: texto dentro de una
 * píldora con borde neutro, sin token de color nuevo. Server Component, sin JS.
 */
export function EtiquetaTipoCola({ tipo }: { tipo: TipoRenglonCola }) {
  return (
    <p className="inline-flex w-fit items-center gap-1.5 rounded-full border border-tinta px-2.5 py-1 text-xs font-semibold text-tinta">
      {tipo === "edicion" ? ETIQUETA_EDICION : ETIQUETA_ALTA_NUEVA}
    </p>
  );
}
