/**
 * Dirección con la que el PANEL muestra la foto de un registro:
 * `/admin/foto/<clave>/<variante>` (spec `revision-admin`, requirement
 * "Detalle del registro con todos los datos capturados, solo dentro del
 * panel").
 *
 * Con sesión válida sirve la foto esté el negocio publicado o no, siempre con
 * `Cache-Control: no-store`. SIN sesión responde exactamente el mismo 404 que
 * la ruta pública: ni la imagen, ni una redirección al acceso, ni ninguna
 * pista de que ese registro exista.
 *
 * Por qué es una ruta aparte y no una rama de `/api/foto/…`, como proponía
 * design.md §3: la cookie de sesión del panel está limitada a `Path=/admin`
 * (decisión de T-005 para que no viaje en ninguna petición pública), así que
 * el navegador nunca la mandaría a `/api/foto/…` y la rama "con sesión" sería
 * inalcanzable en un navegador real. Las dos rutas comparten la misma función
 * de decisión (`src/lib/fotos/servir.ts`), así que la respuesta de "no
 * encontrado" es literalmente la misma en las dos.
 */
import { haySesionAdmin } from "@/lib/admin/guarda";
import { almacenDeFotos } from "@/lib/fotos/almacen";
import { servirFoto } from "@/lib/fotos/servir";
import { obtenerPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _peticion: Request,
  contexto: RouteContext<"/admin/foto/[clave]/[variante]">,
): Promise<Response> {
  // La sesión se resuelve ANTES que nada, igual que la guarda del resto del
  // panel; lo único distinto es qué se hace sin ella (404 en vez de redirigir
  // al acceso). Quien decide qué se sirve es `servirFoto`.
  const conSesionAdmin = await haySesionAdmin();
  const { clave, variante } = await contexto.params;

  return servirFoto({
    clave,
    variante,
    prisma: obtenerPrisma(),
    almacen: almacenDeFotos(),
    conSesionAdmin,
  });
}
