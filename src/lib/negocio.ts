/**
 * Valores válidos de `Negocio.estado` y `Negocio.origen`.
 *
 * En la base son columnas de texto con constraint CHECK escrita a mano (ver
 * la migración inicial). Se prefieren a un enum de PostgreSQL a propósito:
 * agregar un valor a un enum es DDL que bloquea la tabla, y el vocabulario ya
 * vive aquí. Estas constantes son la única fuente de esos literales en el
 * código — formulario, panel y seeds deben importarlas de aquí, sin strings
 * mágicos.
 */
import { almacenDeFotos, type AlmacenFotos } from "@/lib/fotos/almacen";

export const ESTADOS_NEGOCIO = ["en_revision", "publicado", "rechazado"] as const;
export type EstadoNegocio = (typeof ESTADOS_NEGOCIO)[number];

export const ORIGENES_NEGOCIO = ["siembra", "organico"] as const;
export type OrigenNegocio = (typeof ORIGENES_NEGOCIO)[number];

export const ESTADO_NEGOCIO_DEFAULT: EstadoNegocio = "en_revision";
/** Único estado que el directorio público puede mostrar (PRD §6.3 y §8). */
export const ESTADO_NEGOCIO_PUBLICADO: EstadoNegocio = "publicado";
/** Estado al que lleva el rechazo del admin (PRD §6.3). */
export const ESTADO_NEGOCIO_RECHAZADO: EstadoNegocio = "rechazado";
export const ORIGEN_NEGOCIO_DEFAULT: OrigenNegocio = "organico";

/**
 * Lo poco que el borrado definitivo necesita de Prisma. Estructural y laxo (el
 * mismo molde que `ClienteTransiciones`) para que el panel pueda pasarle su
 * propio cliente y las pruebas, uno de mentiras.
 */
export type ClienteBorrado = {
  negocio: {
    findUnique(args: unknown): Promise<unknown>;
    deleteMany(args: unknown): Promise<{ count: number }>;
  };
};

/** Los tres desenlaces posibles de un borrado definitivo. */
export type ResultadoBorradoDefinitivo =
  /** La fila y sus archivos ya no están. */
  | "borrado"
  /** Ese identificador ya no existía: el borrado es idempotente, no lanza. */
  | "no-encontrado"
  /**
   * La ficha tenía foto y el almacén no se dejó alcanzar. **No se tocó la
   * fila.** Ver el comentario de abajo: es una decisión, no un fallo a medias.
   */
  | "almacen-inalcanzable";

/**
 * Borrado definitivo de un negocio (operación ARCO del PRD §8): se van **los
 * archivos de su foto** —todas las variantes—, se va la fila y se van sus
 * vínculos con giros, de eso último se encarga el `ON DELETE CASCADE` de la
 * tabla puente. Un borrado que dejara la imagen servida no sería un borrado.
 *
 * EL ORDEN ES LO IMPORTANTE, Y CAMBIÓ (iteración 4, hallazgo R4 de la etapa C;
 * decisión del fundador, opción (a): *el borrado se niega a mentir*).
 *
 * Antes se borraba la fila primero y los archivos después, con este
 * razonamiento: "si la fila fallara, quedarse sin foto sería peor". El
 * razonamiento tenía un agujero que sólo se ve en producción: cuando el
 * almacén NO se deja alcanzar —una llave rotada y no propagada, un deploy sin
 * las variables, un `staging` apuntando a la base real—, la fila desaparecía,
 * la función decía `true`, el panel contestaba "borrado" y al titular se le
 * informaba que su solicitud ARCO estaba cumplida… con su foto todavía en el
 * almacén y **sin ninguna fila que la nombre**, así que ni el barrido de
 * huérfanas podría volver a identificarla. Es un dato personal que sobrevive a
 * un derecho ejercido, y encima con acuse de recibo.
 *
 * Ahora: si la ficha tiene `fotoClave`, **primero se borran los archivos**. Si
 * eso no se puede, la fila NO se toca y se devuelve `"almacen-inalcanzable"`,
 * para que quien llamó lo diga en voz alta y se pueda reintentar cuando la
 * configuración esté bien. Una ficha SIN foto no tiene nada que alcanzar y se
 * borra normal aunque el almacén esté caído.
 *
 * El riesgo que se acepta a cambio, con los ojos abiertos: si los archivos se
 * borran y luego falla el `deleteMany`, la ficha se queda sin foto pero viva.
 * Eso es reparable —el dueño vuelve a subirla, y mientras tanto la ficha
 * muestra su marcador— y no incumple ninguna ley. Lo otro no era reparable.
 *
 * Si los archivos ya no estaban, la operación se completa igual (spec
 * `modelo-datos`, scenario "borrado con el archivo ya ausente"): el adaptador
 * distingue "no estaba" (no es error) de "no pude" (sí lo es).
 *
 * `deleteMany` y no `delete` (T-015, `agregar-despublicar-y-borrado-arco`):
 * desde que esta función tiene un botón detrás —el borrado ARCO del panel—,
 * borrar dos veces es un caso real (otra pestaña, un doble toque), y una
 * excepción dentro de una Server Action es un HTTP 500. `deleteMany` sobre una
 * fila que ya no está devuelve `count: 0` en vez de lanzar P2025, así que la
 * idempotencia la sostiene la consulta y no una comprobación previa que otra
 * petición puede invalidar en el intervalo.
 */
export async function borrarNegocioDefinitivamente(
  prisma: ClienteBorrado,
  id: string,
  almacen: AlmacenFotos = almacenDeFotos(),
): Promise<ResultadoBorradoDefinitivo> {
  // La clave se lee ANTES que nada: es de donde salen los archivos que hay que
  // alcanzar, y después de borrar la fila ya no habría de dónde sacarla.
  const negocio = (await prisma.negocio.findUnique({
    where: { id },
    select: { fotoClave: true },
  })) as { fotoClave?: string | null } | null;

  if (negocio?.fotoClave) {
    try {
      await almacen.borrar(negocio.fotoClave);
    } catch (error) {
      // Ni el id, ni la clave de la foto: sólo el tipo de fallo.
      console.error(
        `[borrado] no se pudo alcanzar el almacén de fotos, la ficha NO se borró: ${
          error instanceof Error ? error.name : "error desconocido"
        }`,
      );
      return "almacen-inalcanzable";
    }
  }

  const { count } = await prisma.negocio.deleteMany({ where: { id } });
  return count === 0 ? "no-encontrado" : "borrado";
}
