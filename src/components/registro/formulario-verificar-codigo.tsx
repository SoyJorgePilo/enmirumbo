import Link from "next/link";

import { CLASE_BOTON_PRIMARIO, CLASE_BOTON_SECUNDARIO } from "@/lib/estilos-boton";
import {
  BOTON_CONFIRMAR_NUMERO,
  BOTON_REENVIAR_CODIGO,
  BOTON_SALIR_VERIFICAR,
  ERRORES_CODIGO_VERIFICAR,
  ETIQUETA_CODIGO_VERIFICAR,
  TEXTO_CUPO_IP_CODIGOS,
  TEXTO_ESPERA_REENVIO,
} from "@/lib/verificacion/textos";

export type ErrorFormularioVerificar = "incompleto" | "no-coincide" | "vencido" | "proveedor";
export type ErrorReenvioVerificar = "espera-reenvio" | "cupo";

const TEXTO_ERROR_CODIGO: Record<ErrorFormularioVerificar, string> = {
  incompleto: ERRORES_CODIGO_VERIFICAR.incompleto,
  "no-coincide": ERRORES_CODIGO_VERIFICAR.noCoincide,
  vencido: ERRORES_CODIGO_VERIFICAR.vencido,
  proveedor: ERRORES_CODIGO_VERIFICAR.proveedorFallo,
};

const TEXTO_ERROR_REENVIO: Record<ErrorReenvioVerificar, string> = {
  "espera-reenvio": TEXTO_ESPERA_REENVIO,
  cupo: TEXTO_CUPO_IP_CODIGOS,
};

export type FormularioVerificarCodigoProps = {
  /** Server Action de `accion-confirmar.ts`, lista para el `action` del form. */
  accionConfirmar: (formData: FormData) => void | Promise<void>;
  /** Server Action de `accion-reenviar.ts`. */
  accionReenviar: (formData: FormData) => void | Promise<void>;
  errorCodigo?: ErrorFormularioVerificar;
  errorReenvio?: ErrorReenvioVerificar;
};

/**
 * Cuerpo de la pantalla "Confirma tu número" (spec `registro-negocio`,
 * requirement del mismo nombre): campo de 6 dígitos, "Confirmar mi número",
 * "Reenviar el código" y la salida "Mejor luego, mi registro ya quedó", en
 * ese orden. Dos `<form>` separados porque son dos acciones del servidor
 * distintas (mismo patrón que `FormularioAprobar`/`FormularioRechazar` en el
 * detalle del panel). Server Component, sin JavaScript de cliente — cada
 * botón es un submit normal.
 */
export function FormularioVerificarCodigo({
  accionConfirmar,
  accionReenviar,
  errorCodigo,
  errorReenvio,
}: FormularioVerificarCodigoProps) {
  return (
    <div className="flex flex-col gap-6">
      <form action={accionConfirmar} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="codigo" className="text-sm font-semibold text-tinta">
            {ETIQUETA_CODIGO_VERIFICAR}
          </label>
          {errorCodigo && (
            <p id="codigo-error" role="alert" className="text-sm font-semibold text-tinta">
              ⚠ {TEXTO_ERROR_CODIGO[errorCodigo]}
            </p>
          )}
          <input
            id="codigo"
            name="codigo"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            aria-invalid={Boolean(errorCodigo)}
            aria-describedby={errorCodigo ? "codigo-error" : undefined}
            className="w-full rounded-lg border border-borde-control bg-fondo px-4 py-3 text-center text-2xl tracking-[0.5em] text-tinta focus:outline-none focus:ring-2 focus:ring-accion-fuerte"
          />
        </div>
        <button type="submit" className={`${CLASE_BOTON_PRIMARIO} w-full`}>
          {BOTON_CONFIRMAR_NUMERO}
        </button>
      </form>

      <form action={accionReenviar} className="flex flex-col gap-2">
        {errorReenvio && (
          <p role="alert" className="text-sm font-semibold text-tinta">
            ⚠ {TEXTO_ERROR_REENVIO[errorReenvio]}
          </p>
        )}
        <button type="submit" className={`${CLASE_BOTON_SECUNDARIO} w-full`}>
          {BOTON_REENVIAR_CODIGO}
        </button>
      </form>

      <Link
        href="/registro/gracias"
        className="inline-flex min-h-11 items-center justify-center text-center text-base font-semibold text-accion-fuerte underline underline-offset-4"
      >
        {BOTON_SALIR_VERIFICAR}
      </Link>
    </div>
  );
}
