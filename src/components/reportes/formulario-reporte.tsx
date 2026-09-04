import { CampoHoneypot } from "@/components/registro/campo-honeypot";
import { CLASE_BOTON_SECUNDARIO } from "@/lib/estilos-boton";
import { ETIQUETA_MOTIVO_REPORTE, MOTIVOS_REPORTE } from "@/lib/reportes/motivos";
import {
  AYUDA_COMENTARIO_REPORTE,
  BOTON_ENVIAR_REPORTE,
  ERROR_COMENTARIO_LARGO_REPORTE,
  ERROR_CUPO_REPORTES,
  ERROR_GUARDADO_REPORTE,
  ERROR_MOTIVO_REPORTE,
  ETIQUETA_COMENTARIO_REPORTE,
  ETIQUETA_QUE_PASA,
  LIMITE_COMENTARIO_REPORTE,
} from "@/lib/reportes/textos";

/** Los cuatro estados de error que puede devolver el envío (design.md §2, §3). */
export type ErrorFormularioReporte = "motivo" | "comentario" | "cupo" | "servidor";

const TEXTO_POR_ERROR: Record<ErrorFormularioReporte, string> = {
  motivo: ERROR_MOTIVO_REPORTE,
  comentario: ERROR_COMENTARIO_LARGO_REPORTE,
  cupo: ERROR_CUPO_REPORTES,
  servidor: ERROR_GUARDADO_REPORTE,
};

export type FormularioReporteProps = {
  /** Server Action ya ligada al negocio con `.bind`. */
  action: (formData: FormData) => void | Promise<void>;
  /** Lo que ya se había escrito, para no perderlo si el envío regresa con error. */
  comentarioPrevio?: string;
  error?: ErrorFormularioReporte;
};

/**
 * Mini-formulario de reporte (spec `directorio-publico`, requirement
 * "Mini-formulario de reporte sin cuenta..."): motivo de lista cerrada (sin
 * ninguna opción marcada por defecto), comentario opcional ≤300 caracteres,
 * honeypot y el botón "Enviar reporte".
 *
 * Server Component puro (sin directiva de cliente): el `<form>` postea directo a la
 * Server Action (patrón POST→redirect→GET, igual que el panel de admin, NO el
 * `useActionState` del formulario de registro) — el requirement "Directorio
 * en Server Components... y usable sin JavaScript" es estricto para esta
 * página, así que los errores viajan por `searchParams`, no por un hook de
 * cliente. El botón usa el estilo SECUNDARIO (neutro) a propósito: reportar
 * no es una acción para celebrar en verde, y en esta página no hay ningún
 * botón de WhatsApp con el que evitar competir (decisión de UI sin respaldo
 * explícito en la spec, ver reports/a-ui.md).
 */
export function FormularioReporte({
  action,
  comentarioPrevio = "",
  error,
}: FormularioReporteProps) {
  const errorEsDeMotivo = error === "motivo";
  const errorEsDeComentario = error === "comentario";

  return (
    <form action={action} className="flex flex-col gap-6">
      <CampoHoneypot />

      {(error === "cupo" || error === "servidor") && (
        <p id="general-error" role="alert" className="text-sm font-semibold text-tinta">
          ⚠ {TEXTO_POR_ERROR[error]}
        </p>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold text-tinta">{ETIQUETA_QUE_PASA}</legend>
        {errorEsDeMotivo && (
          <p id="motivo-error" role="alert" className="text-sm font-semibold text-tinta">
            ⚠ {TEXTO_POR_ERROR.motivo}
          </p>
        )}
        <div
          className="flex flex-col gap-1"
          aria-describedby={errorEsDeMotivo ? "motivo-error" : undefined}
        >
          {MOTIVOS_REPORTE.map((motivo) => (
            <label
              key={motivo}
              className="flex min-h-11 cursor-pointer items-center gap-3 text-base text-tinta"
            >
              <input
                type="radio"
                name="motivo"
                value={motivo}
                className="h-5 w-5 shrink-0 border-borde"
              />
              {ETIQUETA_MOTIVO_REPORTE[motivo]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="comentario" className="text-sm font-semibold text-tinta">
          {ETIQUETA_COMENTARIO_REPORTE}
        </label>
        <textarea
          id="comentario"
          name="comentario"
          rows={3}
          maxLength={LIMITE_COMENTARIO_REPORTE}
          defaultValue={comentarioPrevio}
          aria-invalid={errorEsDeComentario}
          aria-describedby={
            errorEsDeComentario ? "comentario-error comentario-ayuda" : "comentario-ayuda"
          }
          className={
            errorEsDeComentario
              ? "w-full rounded-lg border-2 border-tinta bg-fondo px-4 py-3 text-base text-tinta focus:outline-none focus:ring-2 focus:ring-accion-fuerte"
              : "w-full rounded-lg border border-borde bg-fondo px-4 py-3 text-base text-tinta focus:outline-none focus:ring-2 focus:ring-accion-fuerte"
          }
        />
        <p id="comentario-ayuda" className="text-sm text-tinta-suave">
          {AYUDA_COMENTARIO_REPORTE}
        </p>
        {errorEsDeComentario && (
          <p id="comentario-error" role="alert" className="text-sm font-semibold text-tinta">
            ⚠ {TEXTO_POR_ERROR.comentario}
          </p>
        )}
      </div>

      <button type="submit" className={`${CLASE_BOTON_SECUNDARIO} w-full`}>
        {BOTON_ENVIAR_REPORTE}
      </button>
    </form>
  );
}
