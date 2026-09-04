/**
 * Quién puede ver una foto (spec `directorio-publico`, requirement "La foto de
 * un negocio no publicado no es accesible públicamente"; spec `revision-admin`,
 * "la dirección con la que el panel muestra la foto de un registro no publicado
 * NO DEBE servir nada sin sesión válida"; design.md §3).
 *
 * El criterio duro del ticket —"la foto de un registro no publicado no es
 * accesible públicamente"— no se puede cumplir con un archivo estático, porque
 * la URL sobrevive al cambio de estado. Por eso cada petición vuelve a
 * preguntarle a la base en qué estado está el negocio dueño de esa clave.
 *
 * Esta función es el ÚNICO lugar que decide; las dos rutas que la usan
 * (`/api/foto/…` pública y `/admin/foto/…` del panel) solo le dicen si la
 * petición trae sesión. Así las dos respuestas de "no encontrado" son
 * literalmente la misma, que es lo que impide distinguir "no existe" de
 * "existe pero no está publicado".
 */
import { ESTADO_NEGOCIO_PUBLICADO } from "@/lib/negocio";

import { esClaveFotoValida, esVarianteFoto } from "./clave";
import type { AlmacenFotos } from "./almacen";

/** Lo poco que servir una foto necesita de Prisma (facilita probarlo). */
export type ClienteFotos = {
  negocio: {
    findFirst(args: {
      where: { fotoClave: string };
      select: { estado: true };
    }): Promise<{ estado: string } | null>;
  };
};

export type EntradaServirFoto = {
  /** Tal cual viene en la URL: puede ser cualquier cosa. */
  clave: string;
  /** Tal cual viene en la URL: puede ser cualquier cosa. */
  variante: string;
  prisma: ClienteFotos;
  almacen: AlmacenFotos;
  /**
   * La petición llegó por la ruta del panel Y con sesión válida. Solo entonces
   * se sirve la foto de un registro que no está publicado, y siempre con
   * `no-store`.
   */
  conSesionAdmin?: boolean;
};

/**
 * Caché de una foto publicada.
 *
 * `private` a propósito, en vez del `public` que proponía design.md §3: la
 * spec pide que "una foto que dejó de estar publicada NO DEBE quedar
 * disponible por haberse guardado antes en una caché pública", y con `public`
 * cualquier proxy o CDN intermedio podría seguir sirviéndola después de
 * despublicar la ficha. El navegador del vecino sí la guarda una hora, que es
 * lo que hace que volver al listado no vuelva a descargar todo.
 */
const CACHE_PUBLICADO = "private, max-age=3600";

/**
 * La MISMA respuesta para los cuatro casos que la spec exige indistinguibles:
 * clave inventada, negocio inexistente, registro sin publicar sin sesión y
 * archivo ausente. Sin cuerpo y sin encabezados que delaten nada.
 */
function noEncontrado(): Response {
  return new Response(null, {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function servirFoto({
  clave,
  variante,
  prisma,
  almacen,
  conSesionAdmin = false,
}: EntradaServirFoto): Promise<Response> {
  // Ni se consulta la base con algo que el servidor nunca pudo haber escrito.
  if (!esClaveFotoValida(clave) || !esVarianteFoto(variante)) {
    return noEncontrado();
  }

  let negocio: { estado: string } | null;
  try {
    negocio = await prisma.negocio.findFirst({
      where: { fotoClave: clave },
      select: { estado: true },
    });
  } catch (error) {
    // Un fallo de la base no se convierte en un 500 que delate el camino: se
    // responde como si esa foto no existiera y el motivo se queda en el log.
    console.error(
      `[fotos] no se pudo resolver la foto: ${error instanceof Error ? error.name : "desconocido"}`,
    );
    return noEncontrado();
  }

  if (!negocio) return noEncontrado();

  const publicado = negocio.estado === ESTADO_NEGOCIO_PUBLICADO;
  if (!publicado && !conSesionAdmin) return noEncontrado();

  let bytes: Buffer | null;
  try {
    bytes = await almacen.leer(clave, variante);
  } catch (error) {
    console.error(
      `[fotos] no se pudo leer del almacén: ${error instanceof Error ? error.name : "desconocido"}`,
    );
    return noEncontrado();
  }
  if (!bytes) return noEncontrado();

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(bytes.length),
      // Dentro del panel nunca se cachea: son datos personales de un registro
      // que puede no estar publicado.
      "Cache-Control": conSesionAdmin ? "no-store" : CACHE_PUBLICADO,
      // Lo que servimos siempre es WebP generado por nosotros; que el
      // navegador no intente adivinar otra cosa.
      "X-Content-Type-Options": "nosniff",
    },
  });
}
