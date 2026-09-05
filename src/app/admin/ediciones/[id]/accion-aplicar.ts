"use server";

/**
 * Server Action de "Aplicar los cambios" (spec `revision-admin`, requirement
 * "Aplicar la edición actualiza la ficha publicada y solo eso"; change
 * `agregar-enlace-de-gestion`, tasks.md #21 y #23).
 *
 * Primero la guarda de sesión (una Server Action es un endpoint propio, no una
 * parte de la página), luego toda la regla en `src/lib/gestion/ediciones.ts`.
 * Termina siempre en un `redirect` (POST-Redirect-GET): recargar la pantalla
 * de confirmación no repite la aplicación.
 *
 * La escritura va CONDICIONADA a que esta edición siga siendo la pendiente de
 * ese negocio (design.md §2). Si no lo es, el panel distingue los dos casos
 * con sus literales: "ya la habías resuelto" y "el negocio mandó otros más
 * nuevos".
 */
import { redirect } from "next/navigation";

import { RUTA_COLA_ADMIN, requerirSesionAdmin } from "@/lib/admin/guarda";
import { aplicarEdicion } from "@/lib/gestion/ediciones";
import { obtenerPrisma } from "@/lib/prisma";

export async function aplicarEdicionAccion(id: string): Promise<void> {
  await requerirSesionAdmin();

  const resultado = await aplicarEdicion(obtenerPrisma(), id);

  if (resultado.resultado === "aplicada") {
    redirect(`/admin/ediciones/${id}/aplicada`);
  }
  if (resultado.resultado === "no-encontrada") {
    redirect(RUTA_COLA_ADMIN);
  }
  if (resultado.resultado === "whatsapp-ocupado") {
    // La edición sigue pendiente: el admin vuelve al detalle con el aviso.
    redirect(`/admin/ediciones/${id}?errorAplicar=whatsapp`);
  }
  // La ficha dejó de estar publicada mientras el admin miraba (hallazgo MEDIO
  // 1 de la etapa C): no se aplicó nada y la edición sigue pendiente, así que
  // el panel lo dice en vez de celebrar una publicación que no ocurrió.
  if (resultado.resultado === "ficha-no-publicada") {
    redirect(`/admin/ediciones/${id}?errorAplicar=no-publicada`);
  }
  if (resultado.resultado === "error") {
    redirect(`/admin/ediciones/${id}?errorAplicar=servidor`);
  }

  redirect(`/admin/ediciones/${id}?aviso=${resultado.resultado}`);
}
