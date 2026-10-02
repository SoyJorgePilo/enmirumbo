/**
 * Adaptador real del puerto de verificación: **Twilio Verify** (ADR-011,
 * design.md §5). Es el único archivo del proyecto que habla con el proveedor.
 *
 * Se usa su API REST con `fetch` y no el SDK oficial: son dos peticiones POST
 * con autenticación básica, y una dependencia de decenas de megas —que además
 * habría que instalar en producción aunque la bandera esté apagada— no se paga
 * por eso. Menos superficie, menos que auditar, cero dependencias nuevas.
 *
 * Reglas que este adaptador cumple porque la spec las fija:
 *
 * - **No genera, no guarda y no compara códigos.** Los produce, los caduca y
 *   los compara Twilio; aquí solo se pregunta.
 * - **No reintenta solo.** Un reintento automático contra un canal que cobra
 *   por mensaje es una factura que crece sin que nadie la mire (design.md §5);
 *   si falla, el flujo degrada y el dueño puede pedir reenvío a mano, con su
 *   cooldown.
 * - **La espera está acotada.** El envío del formulario no se queda colgado
 *   esperando al proveedor: pasado el tiempo corto, se aborta y se toma como
 *   que el código no salió.
 * - **Ninguna excepción escapa.** Todo error —red, DNS, JSON raro, credencial
 *   rechazada— se traduce a `"error"`.
 * - **El log solo lleva eventos.** Nunca el código, nunca el número, nunca una
 *   credencial ni un trozo de la respuesta del proveedor.
 */

import { aE164, type ProveedorVerificacion } from "./proveedor";
import type { ConfiguracionVerificacion } from "./config";

/** Raíz de la API de Verify. */
const BASE_VERIFY = "https://verify.twilio.com/v2/Services";

/**
 * Cuánto se espera al proveedor. Corto a propósito: este puerto se llama en
 * medio del envío del formulario, y lo que el dueño no puede es quedarse
 * mirando una pantalla en blanco por un SMS que además es opcional.
 */
export const ESPERA_MAXIMA_MS = 5_000;

export type OpcionesProveedorTwilio = {
  /** Se inyecta en pruebas: la suite nunca sale a la red. */
  fetch?: typeof fetch;
  esperaMaximaMs?: number;
};

/** Autenticación básica de Twilio: `AccountSid:AuthToken`. */
function encabezadoDeAutenticacion(configuracion: ConfiguracionVerificacion): string {
  const credencial = `${configuracion.cuentaSid}:${configuracion.authToken}`;
  return `Basic ${Buffer.from(credencial, "utf8").toString("base64")}`;
}

/**
 * Identificación del fallo apta para el log: nunca datos del negocio, del
 * código ni de la credencial. Mismo criterio que `resumenDeError` en
 * `src/lib/registro/procesar.ts`.
 */
function resumenDeError(error: unknown): string {
  if (error instanceof Error) {
    return error.name === "AbortError" ? "se agotó la espera" : error.name;
  }
  return "desconocido";
}

/** El `status` que trae la respuesta, o `null` si no vino o no se pudo leer. */
async function estadoDeVerificacion(respuesta: Response): Promise<string | null> {
  try {
    const cuerpo = (await respuesta.json()) as { status?: unknown };
    return typeof cuerpo.status === "string" ? cuerpo.status : null;
  } catch {
    return null;
  }
}

export function crearProveedorTwilio(
  configuracion: ConfiguracionVerificacion,
  opciones: OpcionesProveedorTwilio = {},
): ProveedorVerificacion {
  const pedir = opciones.fetch ?? fetch;
  const esperaMaximaMs = opciones.esperaMaximaMs ?? ESPERA_MAXIMA_MS;
  const raiz = `${BASE_VERIFY}/${encodeURIComponent(configuracion.servicioSid)}`;

  /** Una petición, con su tiempo acotado y sin reintento. */
  async function postear(ruta: string, cuerpo: URLSearchParams): Promise<Response> {
    const abortador = new AbortController();
    const reloj = setTimeout(() => abortador.abort(), esperaMaximaMs);
    try {
      return await pedir(`${raiz}${ruta}`, {
        method: "POST",
        headers: {
          Authorization: encabezadoDeAutenticacion(configuracion),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: cuerpo.toString(),
        signal: abortador.signal,
      });
    } finally {
      clearTimeout(reloj);
    }
  }

  return {
    async iniciar(numero) {
      const e164 = aE164(numero);
      // Un número sin forma válida no se le manda al proveedor: cobra por
      // intentarlo y la respuesta sería la misma.
      if (e164 === null) return "rechazado-por-el-proveedor";

      let respuesta: Response;
      try {
        respuesta = await postear(
          "/Verifications",
          new URLSearchParams({ To: e164, Channel: "sms" }),
        );
      } catch (error) {
        console.warn(`[verificacion] no se pudo pedir el código: ${resumenDeError(error)}`);
        return "error";
      }

      if (respuesta.ok) return "enviado";
      // 4xx: el proveedor no acepta este número (formato, bloqueo, país sin
      // habilitar). No es una falla nuestra ni se va a arreglar reintentando.
      if (respuesta.status >= 400 && respuesta.status < 500) {
        console.warn("[verificacion] el proveedor no aceptó el número");
        return "rechazado-por-el-proveedor";
      }
      console.warn(`[verificacion] el proveedor respondió ${respuesta.status} al pedir el código`);
      return "error";
    },

    async comprobar(numero, codigo) {
      const e164 = aE164(numero);
      if (e164 === null) return "error";

      let respuesta: Response;
      try {
        respuesta = await postear(
          "/VerificationCheck",
          new URLSearchParams({ To: e164, Code: codigo }),
        );
      } catch (error) {
        console.warn(`[verificacion] no se pudo comprobar el código: ${resumenDeError(error)}`);
        return "error";
      }

      // 404: la verificación ya no existe del lado del proveedor —caducó o se
      // consumió—, que para el dueño es "ese código ya venció".
      if (respuesta.status === 404) return "vencido";
      if (!respuesta.ok) {
        console.warn(
          `[verificacion] el proveedor respondió ${respuesta.status} al comprobar el código`,
        );
        return "error";
      }

      const estado = await estadoDeVerificacion(respuesta);
      if (estado === "approved") return "confirmado";
      // Twilio marca `canceled` cuando la verificación se agotó o se anuló.
      if (estado === "canceled" || estado === null) return "vencido";
      return "no-coincide";
    },
  };
}
