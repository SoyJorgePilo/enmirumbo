/**
 * Qué puerto de correo usa la aplicación: el del proveedor cuando la
 * configuración está completa, y el que no manda nada cuando no lo está.
 *
 * Misma forma que `almacenDeFotos`: la elección se hace en UN solo lugar, así
 * que nadie más decide si se manda o no.
 */
import {
  configuracionDeCorreo,
  faltantesDeCorreo,
  type EntornoCorreo,
} from "./configuracion";
import type { PuertoCorreo } from "./puerto";
import { crearCorreoResend } from "./resend";

/**
 * El puerto que NO manda: no toca la red, deja constancia una vez y responde
 * "no configurado".
 *
 * No lanza —a diferencia del almacén de fotos sin configurar— porque aquí no
 * se pierde nada de nadie: un correo que no sale es una notificación que no
 * llega, no un dato personal a la deriva. Lo que sí hace es no fingir: quien
 * lo llama recibe "no-configurado", no "mandado".
 *
 * Tampoco escribe en el log: de eso se encarga quien decide avisar
 * (`avisarPendientes`), que es el único sitio donde la constancia se puede dar
 * UNA sola vez por proceso sin repetirse por petición.
 */
export function crearCorreoSinConfigurar(faltantes: string[]): PuertoCorreo {
  const queFalta = `falta ${faltantes.join(", ")}`;
  return {
    mandar: async () => "no-configurado",
    descripcion: () => `SIN CONFIGURAR (${queFalta})`,
  };
}

/** El puerto de correo de los avisos, según lo que haya en el entorno. */
export function correoDeAvisos(env: EntornoCorreo = process.env): PuertoCorreo {
  const configuracion = configuracionDeCorreo(env);
  return configuracion === null
    ? crearCorreoSinConfigurar(faltantesDeCorreo(env))
    : crearCorreoResend(configuracion);
}
