import {
  BOTON_APROBAR,
  ERROR_COLONIA_PENDIENTE,
  ERROR_MAX_GIROS,
  ETIQUETA_COLONIA_APROBAR,
  ETIQUETA_GIROS,
  ETIQUETA_ORIGEN,
  OPCION_ORIGEN_ORGANICO,
  OPCION_ORIGEN_SIEMBRA,
} from "@/lib/admin/textos";
import { CLASE_BOTON_SECUNDARIO } from "@/lib/estilos-boton";
import type { OrigenNegocio } from "@/lib/negocio";
import type { ElementoCatalogo } from "@/lib/registro/tipos";

export type FormularioAprobarProps = {
  /** Server Action del panel, ya con el id del registro ligado con `.bind`. */
  action: (formData: FormData) => void | Promise<void>;
  giros: ElementoCatalogo[];
  /** Ids ya elegidos, para conservarlos si la acción regresa con error. */
  girosSeleccionados: number[];
  colonias: ElementoCatalogo[];
  coloniaSeleccionada?: string;
  /** Texto libre "Otra" del negocio, o `null`/`undefined` si no aplica. */
  coloniaPendienteTexto?: string | null;
  origenSeleccionado: OrigenNegocio;
  errorGiros?: boolean;
  errorColonia?: boolean;
};

function MensajeError({ id, texto }: { id: string; texto?: string }) {
  if (!texto) return null;
  return (
    <p id={id} role="alert" className="text-sm font-semibold text-tinta">
      ⚠ {texto}
    </p>
  );
}

/**
 * Formulario de aprobar (requirement "Aprobar asigna giros, normaliza la
 * colonia, marca el origen y publica la ficha"): giros de 0 a 3, colonia
 * solo cuando está pendiente de normalizar, origen y el botón "Aprobar y
 * publicar". Server Component: el `<form>` postea a una Server Action, sin
 * ningún JavaScript de cliente (requirement "El panel se opera desde el
 * celular y sin JavaScript de cliente innecesario", scenario "sin JS de
 * cliente propio").
 */
export function FormularioAprobar({
  action,
  giros,
  girosSeleccionados,
  colonias,
  coloniaSeleccionada,
  coloniaPendienteTexto,
  origenSeleccionado,
  errorGiros,
  errorColonia,
}: FormularioAprobarProps) {
  return (
    <form
      action={action}
      className="flex flex-col gap-5 rounded-xl border border-borde p-4"
    >
      <h2 className="font-semibold text-tinta">Aprobar</h2>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold text-tinta">{ETIQUETA_GIROS}</legend>
        <MensajeError id="giros-error" texto={errorGiros ? ERROR_MAX_GIROS : undefined} />
        <div
          className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-lg border border-borde p-2"
          aria-describedby={errorGiros ? "giros-error" : undefined}
        >
          {giros.map((giro) => (
            <label
              key={giro.id}
              className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-tinta"
            >
              <input
                type="checkbox"
                name="giro"
                value={giro.id}
                defaultChecked={girosSeleccionados.includes(giro.id)}
                className="h-5 w-5 shrink-0 rounded border-borde"
              />
              {giro.nombre}
            </label>
          ))}
        </div>
      </fieldset>

      {coloniaPendienteTexto && (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm text-tinta-suave">
            El negocio escribió su colonia como &quot;Otra&quot;:{" "}
            <span className="font-semibold text-tinta">{coloniaPendienteTexto}</span>
          </p>
          <label htmlFor="coloniaId" className="text-sm font-semibold text-tinta">
            {ETIQUETA_COLONIA_APROBAR}
          </label>
          <MensajeError
            id="colonia-error"
            texto={errorColonia ? ERROR_COLONIA_PENDIENTE : undefined}
          />
          <select
            id="coloniaId"
            name="coloniaId"
            defaultValue={coloniaSeleccionada ?? ""}
            aria-invalid={Boolean(errorColonia)}
            aria-describedby={errorColonia ? "colonia-error" : undefined}
            className="w-full rounded-lg border border-borde bg-fondo px-4 py-3 text-base text-tinta focus:outline-none focus:ring-2 focus:ring-accion-fuerte"
          >
            <option value="">Elige la colonia</option>
            {colonias.map((colonia) => (
              <option key={colonia.id} value={colonia.id}>
                {colonia.nombre}
              </option>
            ))}
          </select>
        </div>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold text-tinta">{ETIQUETA_ORIGEN}</legend>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-tinta">
          <input
            type="radio"
            name="origen"
            value="organico"
            defaultChecked={origenSeleccionado === "organico"}
            className="h-5 w-5 shrink-0 border-borde"
          />
          {OPCION_ORIGEN_ORGANICO}
        </label>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-tinta">
          <input
            type="radio"
            name="origen"
            value="siembra"
            defaultChecked={origenSeleccionado === "siembra"}
            className="h-5 w-5 shrink-0 border-borde"
          />
          {OPCION_ORIGEN_SIEMBRA}
        </label>
      </fieldset>

      <button type="submit" className={`${CLASE_BOTON_SECUNDARIO} w-full`}>
        {BOTON_APROBAR}
      </button>
    </form>
  );
}
