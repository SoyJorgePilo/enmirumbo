import {
  AYUDA_MOTIVO_DESPUBLICAR,
  BOTON_DESPUBLICAR,
  ERROR_MOTIVO_DESPUBLICAR_VACIO,
  ETIQUETA_MOTIVO_DESPUBLICAR,
  errorMotivoDespublicarLargo,
} from "@/lib/admin/textos";
import { LIMITE_MOTIVO_DESPUBLICACION } from "@/lib/admin/transiciones";
import { CLASE_BOTON_SECUNDARIO } from "@/lib/estilos-boton";

export type FormularioDespublicarProps = {
  /** Server Action del panel, ya con el id del registro ligado con `.bind`. */
  action: (formData: FormData) => void | Promise<void>;
  /** Lo que se había escrito, para no perderlo si la acción regresa con error. */
  motivoPrevio?: string;
  /** Qué falló al despublicar, con el mismo nombre que devuelve la transición. */
  error?: "motivo" | "longitud";
};

const MENSAJES_ERROR = {
  motivo: ERROR_MOTIVO_DESPUBLICAR_VACIO,
  longitud: errorMotivoDespublicarLargo(LIMITE_MOTIVO_DESPUBLICACION),
} as const;

/**
 * Formulario de despublicar (spec `agregar-despublicar-y-borrado-arco`,
 * requirement "Despublicar una ficha publicada, con motivo obligatorio y
 * condicionada al estado"): motivo obligatorio en texto libre, con el texto
 * de ayuda literal aprobado en la duda 2 de la propuesta ("Este motivo se le
 * enviará al negocio por WhatsApp.") para que ninguna nota interna viaje por
 * accidente, y el botón "Despublicar". Solo se muestra en el detalle de una
 * ficha `publicado` (requirement "El detalle ofrece las acciones que
 * corresponden al estado..."). Server Component, sin JavaScript de cliente
 * (mismo requirement que `formulario-rechazar.tsx`).
 */
export function FormularioDespublicar({
  action,
  motivoPrevio = "",
  error,
}: FormularioDespublicarProps) {
  return (
    <form
      action={action}
      className="flex flex-col gap-3 rounded-xl border border-borde p-4"
    >
      <h2 className="font-semibold text-tinta">Despublicar</h2>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="motivoDespublicar" className="text-sm font-semibold text-tinta">
          {ETIQUETA_MOTIVO_DESPUBLICAR}
        </label>
        <p id="motivoDespublicar-ayuda" className="text-sm text-tinta-suave">
          {AYUDA_MOTIVO_DESPUBLICAR}
        </p>
        {error && (
          <p
            id="motivoDespublicar-error"
            role="alert"
            className="text-sm font-semibold text-tinta"
          >
            ⚠ {MENSAJES_ERROR[error]}
          </p>
        )}
        <textarea
          id="motivoDespublicar"
          name="motivo"
          rows={3}
          // La cota se hace cumplir en el servidor (el panel funciona sin
          // JavaScript); `maxLength` es cortesía para que el admin no escriba
          // de más y pierda el texto, igual que en el formulario público.
          maxLength={LIMITE_MOTIVO_DESPUBLICACION}
          defaultValue={motivoPrevio}
          aria-invalid={Boolean(error)}
          aria-describedby={
            error
              ? "motivoDespublicar-ayuda motivoDespublicar-error"
              : "motivoDespublicar-ayuda"
          }
          className="w-full rounded-lg border border-borde-control bg-fondo px-4 py-3 text-base text-tinta focus:outline-none focus:ring-2 focus:ring-accion-fuerte"
        />
      </div>

      <button type="submit" className={`${CLASE_BOTON_SECUNDARIO} w-full`}>
        {BOTON_DESPUBLICAR}
      </button>
    </form>
  );
}
