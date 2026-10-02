import type { APIRoute } from "astro";

import { almacenDeFotos } from "@/lib/fotos/almacen";
import { servirFoto } from "@/lib/fotos/servir";
import { obtenerPrisma } from "@/lib/prisma";

/**
 * Dirección pública de una foto: `/api/foto/<clave>/<variante>` (lo que era
 * `src/app/api/foto/[clave]/[variante]/route.ts`; change
 * `migrar-directorio-publico-astro`, design.md §3).
 *
 * Sirve ÚNICAMENTE la foto de un negocio `publicado`. La de un registro en
 * revisión o rechazado, la de un negocio que ya no existe y la de una clave
 * inventada responden el mismo 404 vacío, para no delatar que ese archivo
 * existe (spec `directorio-publico`, "La foto de un negocio no publicado no es
 * accesible públicamente"). Quien decide es `servirFoto`, sin cambios: aquí no
 * hay ninguna rama de sesión, ni redirección al almacén, ni reprocesado.
 *
 * Dinámica: consulta el estado del negocio en cada petición.
 */
export const prerender = false;

export const GET: APIRoute = ({ params }) =>
  servirFoto({
    clave: params.clave ?? "",
    variante: params.variante ?? "",
    prisma: obtenerPrisma(),
    almacen: almacenDeFotos(),
  });

/** `HEAD` como `GET`; Astro quita el cuerpo (Next hacía lo mismo). */
export const HEAD: APIRoute = (contexto) => GET(contexto);

/**
 * Los demás métodos, como los respondía Next para un manejador con solo `GET`
 * (medido en la build de `main`): `OPTIONS` → 204 con los métodos permitidos y
 * el resto → 405, los dos sin cuerpo. Sin esto, Astro respondería un 404 sin cuerpo que reencamina a la
 * 404 prerenderizada, fuera del middleware.
 */
export const ALL: APIRoute = ({ request }) =>
  request.method === "OPTIONS"
    ? new Response(null, { status: 204, headers: { Allow: "GET, HEAD, OPTIONS" } })
    : new Response(null, { status: 405 });
