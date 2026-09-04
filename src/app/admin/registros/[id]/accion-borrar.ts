"use server";

/**
 * Server Action del borrado definitivo (spec
 * `agregar-despublicar-y-borrado-arco`, requirements "El borrado definitivo se
 * confirma en dos pasos, escribiendo una palabra, y no depende de JavaScript"
 * y "El borrado definitivo se lleva todo y no deja rastro de datos
 * personales").
 *
 * Es el paso 2: el paso 1 es la pantalla `borrar/page.tsx`, un GET que no
 * borra nada. La palabra de confirmación se valida AQUÍ, en el servidor, no en
 * el navegador: el panel funciona con el JavaScript de cliente deshabilitado,
 * así que ninguna regla puede sostenerse en el formulario (design.md §4). Se
 * ignoran mayúsculas y espacios de sobra; ninguna otra palabra sirve.
 *
 * Después de borrar ya no hay fila que leer, así que la pantalla final NO vive
 * bajo `/admin/registros/<id>/…`: es una ruta propia y sin ningún dato del
 * negocio, porque una URL viaja al log de acceso del hosting. Lo único que
 * viaja es el desenlace (`borrado` | `ya-no-existe`), que no es un dato
 * personal.
 */
import { redirect } from "next/navigation";

import { requerirSesionAdmin } from "@/lib/admin/guarda";
import { PALABRA_CONFIRMACION_BORRADO } from "@/lib/admin/textos";
import { borrarNegocio } from "@/lib/admin/transiciones";
import { obtenerPrisma } from "@/lib/prisma";

export async function borrarRegistroAccion(
  id: string,
  formData: FormData,
): Promise<void> {
  await requerirSesionAdmin();

  const enviado = formData.get("confirmarBorrado");
  const palabra = typeof enviado === "string" ? enviado.trim().toUpperCase() : "";

  if (palabra !== PALABRA_CONFIRMACION_BORRADO) {
    redirect(`/admin/registros/${id}/borrar?errorBorrar=palabra`);
  }

  const resultado = await borrarNegocio(obtenerPrisma(), id);

  redirect(`/admin/borrado-hecho?resultado=${resultado.resultado}`);
}
