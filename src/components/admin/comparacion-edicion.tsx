import {
  ETIQUETA_LO_PROPUESTO,
  ETIQUETA_LO_PUBLICADO,
  MARCA_CAMBIO,
} from "@/lib/admin/textos";
import type { CampoComparado } from "@/lib/admin/ediciones";

/**
 * Un campo comparado: publicado vs. propuesto, con la marca "Cambió" cuando
 * difieren (spec `revision-admin`, requirement "El detalle de una edición
 * compara lo publicado con lo propuesto"). Apilado en vertical (no en
 * columnas lado a lado): a 390px dos columnas de texto libre obligarían a
 * desplazarse o a truncar — la spec exige que se lea "sin desplazarse a los
 * lados" (requirement "El panel se opera desde el celular...").
 *
 * La marca es TEXTO, no un color: "Cambió" al lado del rótulo, visible con
 * lector de pantalla y en escala de grises. Server Component, sin JS.
 */
function FilaComparada({ campo }: { campo: CampoComparado }) {
  return (
    <div className="flex flex-col gap-1 border-b border-borde py-3 last:border-0">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-tinta">{campo.etiqueta}</p>
        {campo.cambio && (
          <span className="inline-flex items-center rounded-full border border-tinta px-2 py-0.5 text-xs font-semibold text-tinta">
            {MARCA_CAMBIO}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-0.5">
          <p className="text-xs font-semibold text-tinta-suave">{ETIQUETA_LO_PUBLICADO}</p>
          <p className="break-words text-tinta-suave">{campo.publicado}</p>
        </div>
        <div className="flex flex-col gap-0.5">
          <p className="text-xs font-semibold text-tinta-suave">{ETIQUETA_LO_PROPUESTO}</p>
          <p className={`break-words ${campo.cambio ? "font-semibold text-tinta" : "text-tinta-suave"}`}>
            {campo.propuesto}
          </p>
        </div>
      </div>
    </div>
  );
}

export function ComparacionEdicion({ campos }: { campos: CampoComparado[] }) {
  return (
    <div className="flex flex-col">
      {campos.map((campo) => (
        <FilaComparada key={campo.clave} campo={campo} />
      ))}
    </div>
  );
}
