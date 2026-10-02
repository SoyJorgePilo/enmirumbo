import { ActionError, defineAction } from "astro:actions";
import { getSecret } from "astro:env/server";

import { validarReporte } from "../lib/reporte";
import { crearValorDeSesion, NOMBRE_COOKIE, OPCIONES_COOKIE, secretoDeSesion, VARIABLE_SECRETO } from "../lib/sesion";

/** Envíos procesados por esta instancia: evidencia de que recargar no reenvía. */
let reportesProcesados = 0;
export function cuantosReportes(): number {
  return reportesProcesados;
}

export const server = {
  reportar: defineAction({
    accept: "form",
    handler: async (datos) => {
      const resultado = validarReporte(datos);
      // El mensaje es un código cerrado ("motivo" | "comentario"), nunca texto
      // del vecino: es lo único que viaja en la cookie del aviso.
      if (!resultado.ok) throw new ActionError({ code: "BAD_REQUEST", message: resultado.aviso });
      reportesProcesados += 1;
      console.info(`[spike] reporte procesado (#${reportesProcesados}) motivo=${resultado.motivo}`);
      return { procesados: reportesProcesados };
    },
  }),

  entrar: defineAction({
    accept: "form",
    handler: async (_datos, context) => {
      const secreto = secretoDeSesion(getSecret(VARIABLE_SECRETO));
      if (secreto === null) {
        // Falla a la vista (PRD v2 §2.5): sin secreto no hay cookie sin firma.
        console.error(`[spike] falta ${VARIABLE_SECRETO} (o tiene menos de 32 caracteres): no se emite sesión`);
        throw new ActionError({ code: "INTERNAL_SERVER_ERROR", message: "sin-secreto" });
      }
      context.cookies.set(NOMBRE_COOKIE, crearValorDeSesion(secreto), OPCIONES_COOKIE);
      return { ok: true };
    },
  }),
};
