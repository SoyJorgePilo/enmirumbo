/**
 * Techo de trabajo de imagen simultáneo (spec `registro-negocio`, requirement
 * "El trabajo de imagen tiene un techo y el que no cabe se va con un mensaje,
 * no a una cola"; enmienda de la iteración 2 por el hallazgo A-1 de la
 * auditoría de seguridad).
 *
 * El problema que resuelve: una imagen PERFECTAMENTE VÁLIDA de 39 megapíxeles
 * pesa ~123 KB comprimida y cuesta ~120 MB de memoria al abrirse. El tope de
 * 5 MB acota los bytes que entran, no el trabajo que provocan, y las defensas
 * previas (campo trampa, cupo por IP) no ven nada raro en un envío bien
 * formado. Sin un techo, unas decenas de peticiones concurrentes —desde una
 * sola máquina— agotan la memoria del contenedor.
 *
 * Dos decisiones deliberadas:
 *
 * 1. **No se encola.** Una cola convierte el problema de memoria en un
 *    problema de latencia y sigue acumulando peticiones vivas. Quien no cabe
 *    se va de inmediato con un mensaje amable y sus datos intactos.
 * 2. **El contador es por proceso.** No pretende ser un límite global del
 *    despliegue (para eso haría falta un almacén compartido, E0-3); es el
 *    techo de lo que ESTE proceso se compromete a tener abierto a la vez, que
 *    es exactamente la variable que hacía crecer la memoria sin cota.
 */

/**
 * Cuántas imágenes se abren a la vez. Dos, no una, para que el segundo envío
 * simultáneo de un día normal no se rechace, y no más, porque el techo de
 * memoria del proceso es este número por el tamaño del mapa de píxeles más
 * grande que aceptamos (40 MP).
 */
export const MAXIMO_FOTOS_EN_PROCESO = 2;

let enProceso = 0;

/** Cuántas imágenes se están procesando ahora mismo (diagnóstico y pruebas). */
export function fotosEnProceso(): number {
  return enProceso;
}

/**
 * Corre `trabajo` si hay turno libre. Si no lo hay devuelve `{ ok: false }`
 * **de inmediato**: no espera, no encola. El turno se libera siempre, incluso
 * si el trabajo lanza.
 */
export async function conCupoDeImagen<T>(
  trabajo: () => Promise<T>,
): Promise<{ ok: true; valor: T } | { ok: false }> {
  if (enProceso >= MAXIMO_FOTOS_EN_PROCESO) return { ok: false };

  enProceso += 1;
  try {
    return { ok: true, valor: await trabajo() };
  } finally {
    enProceso -= 1;
  }
}
