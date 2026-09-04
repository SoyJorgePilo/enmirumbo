/**
 * Dirección pública de una foto: `/api/foto/<clave>/<variante>`.
 *
 * Sirve ÚNICAMENTE la foto de un negocio `publicado`. La de un registro en
 * revisión o rechazado, la de un negocio que ya no existe y la de una clave
 * inventada responden el mismo 404, para no delatar que ese archivo existe
 * (spec `directorio-publico`, requirement "La foto de un negocio no publicado
 * no es accesible públicamente").
 *
 * Aquí no hay ninguna rama de sesión: lo que el panel necesita vive en
 * `/admin/foto/…`, dentro del alcance de su cookie. Un endpoint público sin
 * lógica de autorización es un endpoint público que no la puede equivocar.
 */
import { almacenDeFotos } from "@/lib/fotos/almacen";
import { servirFoto } from "@/lib/fotos/servir";
import { obtenerPrisma } from "@/lib/prisma";

// Consulta el estado del negocio en cada petición: nunca se prerenderiza.
export const dynamic = "force-dynamic";

export async function GET(
  _peticion: Request,
  contexto: RouteContext<"/api/foto/[clave]/[variante]">,
): Promise<Response> {
  const { clave, variante } = await contexto.params;
  return servirFoto({
    clave,
    variante,
    prisma: obtenerPrisma(),
    almacen: almacenDeFotos(),
  });
}
