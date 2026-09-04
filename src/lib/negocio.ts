/**
 * Valores válidos de `Negocio.estado` y `Negocio.origen`.
 *
 * SQLite no soporta enums (ADR-001): en la base son columnas TEXT con
 * constraint CHECK (ver la migración inicial). Estas constantes son la única
 * fuente de esos literales en el código — formulario, panel y seeds deben
 * importarlas de aquí, sin strings mágicos.
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

/** Lo poco que el borrado definitivo necesita de Prisma. */
export type ClienteBorrado = {
  negocio: {
    findUnique(args: {
      where: { id: string };
      select: { fotoClave: true };
    }): Promise<{ fotoClave: string | null } | null>;
    delete(args: { where: { id: string } }): Promise<unknown>;
  };
};

/**
 * Borrado definitivo de un negocio (operación ARCO del PRD §8): se va la fila,
 * se van sus vínculos con giros —de eso se encarga el `ON DELETE CASCADE` de
 * la tabla puente— y se van **los archivos de su foto**, todas las variantes.
 * Un borrado que dejara la imagen servida no sería un borrado.
 *
 * Los archivos se borran DESPUÉS de que la fila desaparece: si el borrado de
 * la fila fallara, la ficha seguiría existiendo y quedarse sin foto sería
 * peor. Y si los archivos ya no estaban, la operación se completa igual (spec
 * `modelo-datos`, scenario "borrado con el archivo ya ausente").
 *
 * Devuelve `false` si ese identificador no existía; no lanza por eso.
 */
export async function borrarNegocioDefinitivamente(
  prisma: ClienteBorrado,
  id: string,
  almacen: AlmacenFotos = almacenDeFotos(),
): Promise<boolean> {
  const negocio = await prisma.negocio.findUnique({
    where: { id },
    select: { fotoClave: true },
  });
  if (!negocio) return false;

  await prisma.negocio.delete({ where: { id } });

  if (negocio.fotoClave) {
    await almacen.borrar(negocio.fotoClave);
  }
  return true;
}
