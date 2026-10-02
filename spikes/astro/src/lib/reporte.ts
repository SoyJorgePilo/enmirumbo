/**
 * Validación del formulario de reporte del spike. Reusa la lista cerrada de
 * motivos y los literales de producción (`src/lib/reportes/`), en solo
 * lectura: el literal del error es el de la spec `directorio-publico`.
 */
import { esMotivoReporteValido, type MotivoReporte } from "../../../../src/lib/reportes/motivos";
import {
  ERROR_COMENTARIO_LARGO_REPORTE,
  ERROR_MOTIVO_REPORTE,
  LIMITE_COMENTARIO_REPORTE,
} from "../../../../src/lib/reportes/textos";

export type AvisoReporte = "motivo" | "comentario";

const TEXTO_POR_AVISO: Record<AvisoReporte, string> = {
  motivo: ERROR_MOTIVO_REPORTE,
  comentario: ERROR_COMENTARIO_LARGO_REPORTE,
};

export type ResultadoReporte = { ok: true; motivo: MotivoReporte } | { ok: false; aviso: AvisoReporte };

export function validarReporte(datos: FormData): ResultadoReporte {
  const motivo = datos.get("motivo");
  if (!esMotivoReporteValido(motivo)) return { ok: false, aviso: "motivo" };
  const comentario = datos.get("comentario");
  if (typeof comentario === "string" && comentario.length > LIMITE_COMENTARIO_REPORTE) {
    return { ok: false, aviso: "comentario" };
  }
  return { ok: true, motivo };
}

/** Lo que viaja en la cookie del aviso es un código, nunca texto del vecino. */
export function avisoDesdeCookie(valor: string | undefined): AvisoReporte | null {
  return valor === "motivo" || valor === "comentario" ? valor : null;
}

export function textoDeAviso(aviso: AvisoReporte): string {
  return TEXTO_POR_AVISO[aviso];
}

export const COOKIE_AVISO_REPORTE = "spike_aviso_reporte";
