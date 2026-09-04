"use server";

/**
 * Server Action de "Rechazar" (spec `revision-admin`, requirement "Rechazar
 * exige motivo, lo guarda con su fecha y ofrece avisar por WhatsApp").
 *
 * Mismo patrón que la de aprobar: guarda de sesión primero, regla de negocio
 * en `src/lib/admin/transiciones.ts` y POST-Redirect-GET al terminar.
 *
 * El motivo NO viaja en la URL de la confirmación: esa pantalla lo lee de la
 * fila ya guardada. Un `searchParams` no es lugar para un dato que queda en
 * el historial del navegador y en los logs del proxy.
 */
import { redirect } from "next/navigation";

import { RUTA_COLA_ADMIN, requerirSesionAdmin } from "@/lib/admin/guarda";
import { rechazarRegistro } from "@/lib/admin/transiciones";
import { obtenerPrisma } from "@/lib/prisma";

export async function rechazarRegistroAccion(
  id: string,
  formData: FormData,
): Promise<void> {
  await requerirSesionAdmin();

  const enviado = formData.get("motivo");
  const motivo = typeof enviado === "string" ? enviado : "";

  const resultado = await rechazarRegistro(obtenerPrisma(), id, motivo);

  if (resultado.resultado === "rechazado") {
    redirect(`/admin/registros/${id}/rechazado`);
  }
  if (resultado.resultado === "ya-resuelto") {
    redirect(`/admin/registros/${id}/ya-resuelto`);
  }
  if (resultado.resultado === "no-encontrado") {
    redirect(RUTA_COLA_ADMIN);
  }

  redirect(`/admin/registros/${id}?errorRechazar=${resultado.error}`);
}
