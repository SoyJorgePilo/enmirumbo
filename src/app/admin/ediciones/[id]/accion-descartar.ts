"use server";

/**
 * Server Action de "Descartar los cambios" (spec `revision-admin`, requirement
 * "Descartar la edición exige motivo, no toca la ficha y ofrece avisar por
 * WhatsApp"; change `agregar-enlace-de-gestion`, tasks.md #22 y #23).
 *
 * El motivo se GUARDA en la fila y la pantalla de confirmación lo lee de ahí,
 * nunca de la URL: mismo criterio que `rechazado/page.tsx` con
 * `motivoRechazo`. Descartar no toca ni un dato de la ficha, ni su estado, ni
 * su enlace de gestión.
 */
import { redirect } from "next/navigation";

import { RUTA_COLA_ADMIN, requerirSesionAdmin } from "@/lib/admin/guarda";
import { descartarEdicion } from "@/lib/gestion/ediciones";
import { obtenerPrisma } from "@/lib/prisma";

export async function descartarEdicionAccion(
  id: string,
  formData: FormData,
): Promise<void> {
  await requerirSesionAdmin();

  const motivo = String(formData.get("motivo") ?? "");
  const resultado = await descartarEdicion(obtenerPrisma(), id, motivo);

  if (resultado.resultado === "descartada") {
    redirect(`/admin/ediciones/${id}/descartada`);
  }
  if (resultado.resultado === "no-encontrada") {
    redirect(RUTA_COLA_ADMIN);
  }
  if (resultado.resultado === "error") {
    redirect(`/admin/ediciones/${id}?errorDescartar=${resultado.error}`);
  }

  redirect(`/admin/ediciones/${id}?aviso=${resultado.resultado}`);
}
