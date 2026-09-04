/**
 * Purga de los registros rechazados a los 90 días (PRD §8; spec `modelo-datos`,
 * requirement "Los registros rechazados se eliminan definitivamente a los 90
 * días"; change `preparar-deploy-produccion`, design.md §7).
 *
 * El aviso de privacidad publicado ya promete este borrado, así que no es una
 * mejora: es una obligación que hasta ahora estaba declarada como pendiente
 * operativo y se hacía a mano contra la base (o no se hacía).
 *
 * La lógica vive aquí, en el sistema, y no en la configuración del hosting: lo
 * único que pone el hosting es QUIÉN llama y CADA CUÁNTO (ADR-007). Cualquier
 * programador de tareas que sepa hacer una petición con encabezado sirve.
 */
import { almacenDeFotos, type AlmacenFotos } from "@/lib/fotos/almacen";
import {
  limpiarCuposCaducados,
  type ClienteLimpiezaDeCupos,
} from "@/lib/cupos/compartido";
import {
  borrarNegocioDefinitivamente,
  ESTADO_NEGOCIO_RECHAZADO,
  type ClienteBorrado,
} from "@/lib/negocio";

/** Los días que un registro rechazado se conserva antes de borrarse (PRD §8). */
export const DIAS_PARA_PURGAR_RECHAZADOS = 90;

const MILISEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * Fecha a partir de la cual un rechazo YA cumplió el plazo.
 *
 * Función pura y aparte porque es la única aritmética del asunto y el borde
 * exacto (89 no, 90 sí) es lo que decide si se borra el registro de una
 * persona antes de tiempo. Se compara con `<=`: un rechazo de hace exactamente
 * 90 días entra.
 */
export function fechaDeCorteDePurga(
  ahora: Date,
  dias: number = DIAS_PARA_PURGAR_RECHAZADOS,
): Date {
  return new Date(ahora.getTime() - dias * MILISEGUNDOS_POR_DIA);
}

/** Lo poco que la purga necesita de Prisma (así se puede probar en aislado). */
export type ClientePurga = ClienteBorrado &
  ClienteLimpiezaDeCupos & {
    negocio: {
      findMany(args: unknown): Promise<Array<{ id: string }>>;
    };
  };

export type ResultadoPurga = {
  /** Cuántos registros se eliminaron. */
  eliminados: number;
  /**
   * Cuántos registros seguían ahí después de intentarlo. Se cuentan, no se
   * callan: una purga que deja fichas atrás sigue siendo un incumplimiento del
   * aviso de privacidad, y quien mira el cron tiene que poder verlo — por eso
   * la ruta responde 500 si esto no es cero. Como todo lo que sale de aquí, es
   * un CONTEO: ni un dato de nadie.
   */
  fallidos: number;
  /**
   * Marcas del cupo anti-abuso borradas por caducadas o por techo de filas.
   *
   * Va aquí porque esta es LA tarea de retención del sistema: la que corre una
   * vez al día para que no se guarde nada que ya no sirve. Ver
   * `limpiarCuposCaducados`. Conteos, como todo lo demás.
   */
  cuposLimpiados: number;
};

/**
 * La tarea de RETENCIÓN diaria del sistema. Hace dos cosas, y las dos son la
 * misma obligación (LFPDPPP art. 11: no conservar datos cuya finalidad ya se
 * cumplió):
 *
 * 1. Elimina definitivamente los negocios `rechazado` cuya fecha de rechazo ya
 *    cumplió el plazo de 90 días (PRD §8).
 * 2. Recoge las marcas del cupo anti-abuso que ya salieron de su ventana, y
 *    poda la tabla si superó su techo de filas (iteración 3, hallazgo R1 de la
 *    etapa C: la limpieza vivía solo dentro de `apartarCupoCompartido`, así que
 *    la procedencia que probaba una vez y no volvía dejaba su fila para
 *    siempre — y la migración y el documento prometían lo contrario).
 *
 * Lo primero no toca ningún otro estado, ni un rechazado reciente, ni uno sin
 * fecha de rechazo —que es el que corrigió y volvió a la cola—.
 *
 * Borra uno por uno con `borrarNegocioDefinitivamente`, el MISMO borrado de la
 * operación ARCO del panel, para que se vayan también los archivos de su foto
 * y sus reportes (cascada). Un `deleteMany` en bloque sería más corto y
 * dejaría las fotos huérfanas en el almacén.
 *
 * Idempotente: en la segunda corrida no queda nada que cumpla la condición y
 * devuelve cero sin fallar.
 */
export async function purgarRechazados(
  prisma: ClientePurga,
  opciones: { ahora?: Date; almacen?: AlmacenFotos } = {},
): Promise<ResultadoPurga> {
  const ahora = opciones.ahora ?? new Date();
  const almacen = opciones.almacen ?? almacenDeFotos();
  const corte = fechaDeCorteDePurga(ahora);

  const condenados = await prisma.negocio.findMany({
    where: {
      estado: ESTADO_NEGOCIO_RECHAZADO,
      // `not: null` es redundante con `lte` para la base, pero deja escrito en
      // el código lo que la spec exige: sin fecha de rechazo no hay plazo que
      // contar y el registro NO se toca.
      rechazadoEn: { not: null, lte: corte },
    },
    select: { id: true },
  });

  let eliminados = 0;
  let fallidos = 0;
  for (const { id } of condenados) {
    // Un fallo con UNA ficha no puede dejar la purga parada para siempre
    // (hallazgo M3 de la etapa C). Si `almacen.borrar` truena —permisos, el
    // almacén remoto caído, un directorio donde debería haber un archivo— y
    // la excepción sube, las demás fichas que ya cumplieron el plazo tampoco
    // se purgan; y como el fallo es estable, mañana tropieza con la misma y
    // pasado también: la obligación del aviso de privacidad no se vuelve a
    // cumplir nunca. Es la lección que el barrido de huérfanas ya había
    // aprendido (hallazgo B-6 de `agregar-foto-negocio`).
    try {
      const desenlace = await borrarNegocioDefinitivamente(prisma, id, almacen);
      if (desenlace === "borrado") eliminados += 1;
      else if (desenlace === "almacen-inalcanzable") {
        // La ficha tenía foto y el almacén no se dejó alcanzar, así que NO se
        // borró nada (iteración 4, hallazgo R4). Cuenta como fallida, que es
        // lo que hace responder 500 al cron: el compromiso de los 90 días NO
        // se cumplió para esa ficha, y mañana volverá a intentarse.
        fallidos += 1;
        console.error(
          "[purga] un registro rechazado no se pudo eliminar: su foto sigue en un almacén inalcanzable",
        );
      }
    } catch (error) {
      // Solo el tipo de error: ni el id, ni el nombre, ni el motivo.
      const tipo = error instanceof Error ? error.name : "error desconocido";
      // Desde la iteración 4 (hallazgo R4) el borrado se lleva los ARCHIVOS
      // ANTES que la fila, así que hay que preguntar qué quedó en pie: si la
      // fila ya no está, el registro sí se purgó —sus archivos se fueron
      // primero— y lo que falló vino después. Si la fila sigue ahí, el
      // registro NO se purgó y eso sí es un incumplimiento; sus archivos
      // pueden haberse ido ya, que es el precio aceptado de invertir el
      // orden: una ficha sin foto es reparable y se ve, y mañana se reintenta.
      const sigueAhi = await prisma.negocio
        .findUnique({ where: { id }, select: { id: true } })
        .catch(() => ({ id }));
      if (sigueAhi === null) {
        eliminados += 1;
        console.error(
          `[purga] el registro se eliminó pero su foto quedó en el almacén (${tipo}); la recogerá el barrido de huérfanas`,
        );
      } else {
        fallidos += 1;
        console.error(`[purga] no se pudo eliminar un registro rechazado: ${tipo}`);
      }
    }
  }

  // La limpieza de cupos va DESPUÉS y aparte: un fallo suyo no puede tumbar la
  // purga de rechazados, que es la que tiene un compromiso publicado detrás.
  let cuposLimpiados = 0;
  try {
    const { caducadas, podadas } = await limpiarCuposCaducados(prisma, { ahora });
    cuposLimpiados = caducadas + podadas;
  } catch (error) {
    console.error(
      `[purga] no se pudieron limpiar las marcas del cupo anti-abuso: ${error instanceof Error ? error.name : "error desconocido"}`,
    );
  }

  return { eliminados, fallidos, cuposLimpiados };
}
