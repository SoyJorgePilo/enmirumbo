import { BOTON_APLICAR_CAMBIOS, ERROR_WHATSAPP_OCUPADO_EDICION } from "@/lib/admin/textos";
import { CLASE_BOTON_SECUNDARIO } from "@/lib/estilos-boton";

export type FormularioAplicarEdicionProps = {
  /** Server Action del panel, ya con el id de la edición ligado con `.bind`. */
  action: (formData: FormData) => void | Promise<void>;
  errorWhatsappOcupado?: boolean;
};

/**
 * Botón "Aplicar los cambios" (spec `revision-admin`, requirement "Aplicar la
 * edición actualiza la ficha publicada y solo eso"): una sola acción, sin
 * campos. El error de WhatsApp ya tomado por otra ficha se pinta arriba del
 * botón, con el literal exacto de la spec. Server Component, sin JS (mismo
 * requirement que `formulario-aprobar.tsx`).
 */
export function FormularioAplicarEdicion({
  action,
  errorWhatsappOcupado,
}: FormularioAplicarEdicionProps) {
  return (
    <form action={action} className="flex flex-col gap-3 rounded-xl border border-borde p-4">
      <h2 className="font-semibold text-tinta">{BOTON_APLICAR_CAMBIOS}</h2>
      {errorWhatsappOcupado && (
        <p role="alert" className="text-sm font-semibold text-tinta">
          ⚠ {ERROR_WHATSAPP_OCUPADO_EDICION}
        </p>
      )}
      <button type="submit" className={`${CLASE_BOTON_SECUNDARIO} w-full`}>
        {BOTON_APLICAR_CAMBIOS}
      </button>
    </form>
  );
}
