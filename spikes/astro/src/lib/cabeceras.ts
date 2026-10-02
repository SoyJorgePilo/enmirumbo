/**
 * Cabeceras de seguridad del spike (spec `spike-astro`, requirement "El spike
 * sirve las mismas cabeceras de seguridad que producción").
 *
 * La fuente es la MISMA función que usa `next.config.ts` en producción,
 * importada en solo lectura desde `src/lib/seguridad/csp.ts`: si el spike
 * pasara con una copia, no probaría nada. La única excepción es la página del
 * formulario, que va con `strict-origin` como hoy gestión y admin.
 */
import { cabecerasDeSeguridad } from "../../../../src/lib/seguridad/csp";

export const RUTA_FORMULARIO = "/reportar";

/** Referente más estricto, el que hoy usan gestión y admin. */
export const REFERENTE_ESTRICTO = "strict-origin";

function esPaginaDelFormulario(ruta: string): boolean {
  return ruta === RUTA_FORMULARIO || ruta === `${RUTA_FORMULARIO}/`;
}

/** Las cuatro cabeceras, con sus valores, para la ruta pedida. */
export function cabecerasPara(ruta: string): Record<string, string> {
  const cabeceras = Object.fromEntries(cabecerasDeSeguridad().map(({ key, value }) => [key, value]));
  if (esPaginaDelFormulario(ruta)) cabeceras["Referrer-Policy"] = REFERENTE_ESTRICTO;
  return cabeceras;
}

/**
 * Pone las cabeceras en la respuesta. Si la respuesta trae cabeceras
 * inmutables (p. ej. `Response.redirect`), se copia en una nueva en vez de
 * reventar con un 500.
 */
export function aplicarCabeceras(respuesta: Response, ruta: string): Response {
  const cabeceras = cabecerasPara(ruta);
  try {
    for (const [nombre, valor] of Object.entries(cabeceras)) respuesta.headers.set(nombre, valor);
    return respuesta;
  } catch {
    const copia = new Response(respuesta.body, respuesta);
    for (const [nombre, valor] of Object.entries(cabeceras)) copia.headers.set(nombre, valor);
    return copia;
  }
}
