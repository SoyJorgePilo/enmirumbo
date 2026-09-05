"use server";

/**
 * Server Action del modo edición, `/editar/<token>` (change
 * `agregar-enlace-de-gestion`, spec `registro-negocio`, requirement "Enviar la
 * edición no toca la ficha pública: crea una revisión pendiente").
 *
 * Hermana de `src/app/(publico)/registro/accion.ts` y con el mismo reparto:
 * aquí solo se saca la IP de los encabezados y se redirige; toda la regla vive
 * en `src/lib/gestion/procesar-edicion.ts`, que se puede probar sin un request
 * de Next.js.
 *
 * El token llega ligado con `.bind(null, token)`, es decir en el CUERPO del
 * envío y no como parámetro de consulta del POST (design.md §4). El
 * `redirect` a la confirmación cierra el POST-Redirect-GET: recargar esa
 * pantalla no manda los cambios otra vez.
 *
 * El token NO se escribe en el log en ninguna rama.
 */
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { procesarEdicion } from "@/lib/gestion/procesar-edicion";
import { obtenerPrisma } from "@/lib/prisma";
import { ipDeEncabezados } from "@/lib/registro/limite-ip";
import type { EstadoAccionRegistro } from "@/lib/registro/tipos";

export async function enviarEdicion(
  token: string,
  _estadoPrevio: EstadoAccionRegistro,
  formData: FormData,
): Promise<EstadoAccionRegistro> {
  const ip = ipDeEncabezados(await headers());

  const resultado = await procesarEdicion(token, formData, {
    prisma: obtenerPrisma(),
    ip,
  });

  // Token que no resuelve: el 404 del sitio, el mismo de cualquier URL que no
  // existe. No se distingue de "nunca existió" ni por el texto ni por el
  // código.
  if (!resultado.exito && resultado.noEncontrado) notFound();

  // `redirect` lanza: nada de lo que venga después se ejecuta.
  if (resultado.exito) redirect(`/editar/${token}/gracias`);

  return resultado.estado;
}
