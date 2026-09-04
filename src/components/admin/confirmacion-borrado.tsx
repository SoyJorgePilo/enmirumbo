import Link from "next/link";

import {
  BOTON_CONFIRMAR_BORRADO,
  ENCABEZADO_CONFIRMAR_BORRADO,
  ERROR_PALABRA_BORRAR,
  ETIQUETA_CONFIRMAR_BORRAR,
  RECORDATORIO_TRAMITE_ARCO,
  TEXTO_MEJOR_NO_REGRESAR,
  textoAdvertenciaBorrado,
} from "@/lib/admin/textos";
import { CLASE_BOTON_SECUNDARIO } from "@/lib/estilos-boton";

export type ConfirmacionBorradoProps = {
  nombreNegocio: string;
  /** Server Action del panel, ya con el id del registro ligado con `.bind`. */
  action: (formData: FormData) => void | Promise<void>;
  /** A dónde vuelve "Mejor no, regresar": el detalle de este registro. */
  volverHref: string;
  error?: boolean;
};

/**
 * Paso 2 del borrado definitivo (spec `agregar-despublicar-y-borrado-arco`,
 * requirement "El borrado definitivo se confirma en dos pasos, escribiendo
 * una palabra, y no depende de JavaScript"): encabezado, advertencia con el
 * nombre del negocio, recordatorio del trámite ARCO, campo para teclear
 * `BORRAR` y las dos salidas, en ese orden exacto. Server Component: el
 * `<form>` postea a una Server Action, sin declarar el modo de cliente ni
 * usar `confirm()` (design.md §4) — abrir esta pantalla, recargarla o navegar hacia atrás no
 * ejecuta nada porque no hay ningún `<form>` en el GET que la sirve.
 */
export function ConfirmacionBorrado({
  nombreNegocio,
  action,
  volverHref,
  error,
}: ConfirmacionBorradoProps) {
  return (
    <div className="flex flex-col gap-6 py-4">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        {ENCABEZADO_CONFIRMAR_BORRADO}
      </h1>

      <p className="break-words text-tinta">{textoAdvertenciaBorrado(nombreNegocio)}</p>

      <p className="rounded-lg border border-tinta bg-superficie p-4 text-sm text-tinta">
        {RECORDATORIO_TRAMITE_ARCO}
      </p>

      <form action={action} className="flex flex-col gap-3">
        <label htmlFor="confirmarBorrado" className="text-sm font-semibold text-tinta">
          {ETIQUETA_CONFIRMAR_BORRAR}
        </label>
        {error && (
          <p
            id="confirmarBorrado-error"
            role="alert"
            className="text-sm font-semibold text-tinta"
          >
            ⚠ {ERROR_PALABRA_BORRAR}
          </p>
        )}
        <input
          id="confirmarBorrado"
          name="confirmarBorrado"
          type="text"
          autoComplete="off"
          autoCapitalize="characters"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "confirmarBorrado-error" : undefined}
          className="w-full rounded-lg border border-borde bg-fondo px-4 py-3 text-base text-tinta focus:outline-none focus:ring-2 focus:ring-accion-fuerte"
        />
        <button type="submit" className={`${CLASE_BOTON_SECUNDARIO} w-full`}>
          {BOTON_CONFIRMAR_BORRADO}
        </button>
      </form>

      <Link
        href={volverHref}
        className="inline-flex min-h-11 items-center justify-center px-4 text-base font-semibold text-accion-fuerte underline underline-offset-4"
      >
        {TEXTO_MEJOR_NO_REGRESAR}
      </Link>
    </div>
  );
}
