import {
  BOTON_RECHAZAR,
  ERROR_MOTIVO_VACIO,
  ETIQUETA_MOTIVO_RECHAZO,
} from "@/lib/admin/textos";
import { CLASE_BOTON_SECUNDARIO } from "@/lib/estilos-boton";

export type FormularioRechazarProps = {
  /** Server Action del panel, ya con el id del registro ligado con `.bind`. */
  action: (formData: FormData) => void | Promise<void>;
  /** Lo que se había escrito, para no perderlo si la acción regresa con error. */
  motivoPrevio?: string;
  error?: boolean;
};

/**
 * Formulario de rechazar (requirement "Rechazar exige motivo, lo guarda con
 * su fecha y ofrece avisar por WhatsApp"): motivo obligatorio en texto libre
 * y el botón "Rechazar". Server Component, sin JavaScript de cliente (mismo
 * requirement que `formulario-aprobar.tsx`).
 */
export function FormularioRechazar({
  action,
  motivoPrevio = "",
  error,
}: FormularioRechazarProps) {
  return (
    <form
      action={action}
      className="flex flex-col gap-3 rounded-xl border border-borde p-4"
    >
      <h2 className="font-semibold text-tinta">Rechazar</h2>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="motivo" className="text-sm font-semibold text-tinta">
          {ETIQUETA_MOTIVO_RECHAZO}
        </label>
        {error && (
          <p id="motivo-error" role="alert" className="text-sm font-semibold text-tinta">
            ⚠ {ERROR_MOTIVO_VACIO}
          </p>
        )}
        <textarea
          id="motivo"
          name="motivo"
          rows={3}
          defaultValue={motivoPrevio}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "motivo-error" : undefined}
          className="w-full rounded-lg border border-borde bg-fondo px-4 py-3 text-base text-tinta focus:outline-none focus:ring-2 focus:ring-accion-fuerte"
        />
      </div>

      <button type="submit" className={`${CLASE_BOTON_SECUNDARIO} w-full`}>
        {BOTON_RECHAZAR}
      </button>
    </form>
  );
}
