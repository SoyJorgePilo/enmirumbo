/**
 * El aviso diario de pendientes, de punta a punta (T-020; spec
 * `revision-admin`, requirements del aviso y del contenido del correo).
 *
 * Lo llama la tarea programada de la purga después de su trabajo y de forma
 * independiente de su resultado (design.md §1): dos obligaciones distintas
 * —una de la LFPDPPP y otra de la operación— que no se pueden tumbar entre
 * ellas.
 *
 * El orden importa:
 *
 * 1. **Primero la configuración.** Sin ella no hay nada que hacer, y así ni
 *    siquiera se leen datos personales que no se van a poder usar.
 * 2. **Después los conteos.** Si no hay nada esperando, no sale nada: el
 *    silencio significa "todo al día", y un correo diario de "no hay nada"
 *    acabaría en la carpeta de ignorados junto con el que sí importa.
 * 3. **Y al final el envío**, con la marca del día para que un segundo disparo
 *    no mande un segundo correo (design.md §3).
 *
 * Nada de lo que esta función escribe en el log lleva datos de nadie: conteos
 * y estados, nunca nombres, números ni identificadores.
 */
import { correoDeAvisos } from "@/lib/correo/correo";
import {
  avisarCorreoSinConfigurarUnaVez,
  configuracionDeCorreo,
  type EntornoCorreo,
} from "@/lib/correo/configuracion";
import type { PuertoCorreo } from "@/lib/correo/puerto";

import { claveDelDia } from "./dia";
import { contarPendientes, type ClienteAviso } from "./pendientes";
import { asuntoDelAviso, cuerpoDelAviso, NOMBRE_REMITENTE_AVISO } from "./textos";

/**
 * En qué quedó el aviso del día. Es lo único que el operador puede mirar para
 * saber si el correo salió, y es un ESTADO: la regla de "solo conteos" sigue
 * intacta.
 */
export type EstadoAviso = "mandado" | "sin-pendientes" | "sin-configurar" | "fallido";

export type OpcionesAviso = {
  prisma: ClienteAviso;
  env?: EntornoCorreo;
  ahora?: Date;
  /** El puerto de correo. Por defecto, el que salga de la configuración. */
  correo?: PuertoCorreo;
};

export async function avisarPendientes({
  prisma,
  env = process.env,
  ahora = new Date(),
  correo,
}: OpcionesAviso): Promise<EstadoAviso> {
  const configuracion = configuracionDeCorreo(env);
  if (configuracion === null) {
    avisarCorreoSinConfigurarUnaVez(env);
    return "sin-configurar";
  }

  try {
    const conteo = await contarPendientes(prisma);
    if (conteo.total === 0) {
      console.log("[aviso] no hay pendientes en la cola: hoy no sale correo");
      return "sin-pendientes";
    }

    const resultado = await (correo ?? correoDeAvisos(env)).mandar({
      asunto: asuntoDelAviso(conteo.total),
      texto: cuerpoDelAviso(conteo, configuracion.urlPanel),
      remitenteVisible: NOMBRE_REMITENTE_AVISO,
      claveDelDia: claveDelDia(ahora),
    });

    if (resultado === "no-configurado") {
      avisarCorreoSinConfigurarUnaVez(env);
      return "sin-configurar";
    }
    if (resultado === "fallido") return "fallido";

    console.log(
      `[aviso] avisados ${conteo.total} pendientes (altas ${conteo.altas}, ` +
        `ediciones ${conteo.ediciones}, reportes ${conteo.reportes})`,
    );
    return "mandado";
  } catch (error) {
    // Contar los pendientes pudo fallar (la base caída, por ejemplo). No se
    // sabe si había algo que avisar, así que se cuenta como fallido y se ve:
    // callarlo dejaría al admin sin avisos y sin enterarse.
    console.error(
      `[aviso] no se pudo preparar el aviso del día: ${
        error instanceof Error ? error.name : "error desconocido"
      }`,
    );
    return "fallido";
  }
}
