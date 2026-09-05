/**
 * Regenerar el enlace de gestión de una ficha publicada (change
 * `agregar-enlace-de-gestion`, spec `revision-admin`, requirement "El admin
 * puede generar un enlace nuevo, y el anterior deja de servir"; PRD §6.4).
 *
 * Vive en `src/lib/gestion/` y no en `src/lib/admin/` a propósito: así ningún
 * archivo del panel tiene que nombrar la columna de la huella, y el guardián
 * de `tests/admin-adversarial.test.ts` puede seguir prohibiéndola ahí.
 *
 * No hay lista de tokens revocados porque no hace falta: generar SOBRESCRIBE
 * la huella, la anterior deja de existir y su enlace pasa a responder el mismo
 * 404 que un token inventado (design.md §3). Regenerar no toca ni un dato de
 * la ficha ni las ediciones que estuvieran esperando.
 *
 * Nada de lo que pasa por aquí se escribe en el log, y el token en claro solo
 * sale por el resultado.
 */
import { ESTADO_NEGOCIO_PUBLICADO } from "@/lib/negocio";

import { generarEnlaceDeGestion } from "./token";

/** Lo poco que esta transición necesita de Prisma (facilita probarla). */
export type ClienteEnlaceGestion = {
  negocio: {
    updateMany(args: unknown): Promise<{ count: number }>;
  };
};

export type ResultadoRegeneracion =
  /** Enlace nuevo listo; el anterior ya no sirve. `token` es el secreto. */
  | { resultado: "regenerado"; token: string }
  /**
   * Ese identificador no existe, o la ficha no está publicada: una ficha sin
   * publicar no tiene enlace que regenerar. Se responde igual en los dos
   * casos, como el resto del panel con lo que no encuentra.
   */
  | { resultado: "no-publicado" };

export async function regenerarEnlaceDeGestion(
  prisma: ClienteEnlaceGestion,
  id: string,
  ahora: Date = new Date(),
): Promise<ResultadoRegeneracion> {
  if (!id) return { resultado: "no-publicado" };

  const enlace = generarEnlaceDeGestion(ahora);

  // Escritura condicionada al estado, igual que las transiciones del panel: si
  // la ficha ya no está publicada (otra pestaña la despublicó, o la borraron)
  // no se escribe nada y el enlace anterior sigue como estaba.
  const { count } = await prisma.negocio.updateMany({
    where: { id, estado: ESTADO_NEGOCIO_PUBLICADO },
    data: enlace.columnas,
  });

  return count === 0
    ? { resultado: "no-publicado" }
    : { resultado: "regenerado", token: enlace.token };
}
