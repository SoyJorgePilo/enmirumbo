import {
  BOTON_DESCARTAR_CAMBIOS,
  ERROR_MOTIVO_DESCARTE_VACIO,
  ETIQUETA_MOTIVO_DESCARTE,
} from "@/lib/admin/textos";
import { CLASE_BOTON_SECUNDARIO } from "@/lib/estilos-boton";

export type FormularioDescartarEdicionProps = {
  /** Server Action del panel, ya con el id de la edición ligado con `.bind`. */
  action: (formData: FormData) => void | Promise<void>;
  motivoPrevio?: string;
  error?: boolean;
  /**
   * Mensaje de "el motivo se pasó de la cota", ya armado con su número. El
   * motivo NO se recorta en silencio: viaja dentro del WhatsApp que se le
   * manda al negocio (mismo criterio que el motivo de la despublicación).
   */
  errorLargo?: string;
};

/**
 * Formulario de descartar la edición (spec `revision-admin`, requirement
 * "Descartar la edición exige motivo, no toca la ficha y ofrece avisar por
 * WhatsApp"): motivo obligatorio en texto libre y el botón "Descartar los
 * cambios". Mismo patrón que `formulario-rechazar.tsx`. Server Component,
 * sin JS.
 */
export function FormularioDescartarEdicion({
  action,
  motivoPrevio = "",
  error,
  errorLargo,
}: FormularioDescartarEdicionProps) {
  const mensaje = errorLargo ?? (error ? ERROR_MOTIVO_DESCARTE_VACIO : undefined);
  return (
    <form action={action} className="flex flex-col gap-3 rounded-xl border border-borde p-4">
      <h2 className="font-semibold text-tinta">{BOTON_DESCARTAR_CAMBIOS}</h2>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="motivoDescarte" className="text-sm font-semibold text-tinta">
          {ETIQUETA_MOTIVO_DESCARTE}
        </label>
        {mensaje && (
          <p id="motivoDescarte-error" role="alert" className="text-sm font-semibold text-tinta">
            ⚠ {mensaje}
          </p>
        )}
        <textarea
          id="motivoDescarte"
          name="motivo"
          rows={3}
          defaultValue={motivoPrevio}
          aria-invalid={Boolean(mensaje)}
          aria-describedby={mensaje ? "motivoDescarte-error" : undefined}
          className="w-full rounded-lg border border-borde bg-fondo px-4 py-3 text-base text-tinta focus:outline-none focus:ring-2 focus:ring-accion-fuerte"
        />
      </div>

      <button type="submit" className={`${CLASE_BOTON_SECUNDARIO} w-full`}>
        {BOTON_DESCARTAR_CAMBIOS}
      </button>
    </form>
  );
}
