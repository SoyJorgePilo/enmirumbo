"use server";

/**
 * Server Action de "Despublicar" (spec `agregar-despublicar-y-borrado-arco`,
 * requirement "Despublicar una ficha publicada, con motivo obligatorio y
 * condicionada al estado").
 *
 * Mismo patrón que aprobar y rechazar: guarda de sesión primero, regla de
 * negocio en `src/lib/admin/transiciones.ts` y POST-Redirect-GET al terminar,
 * para que recargar la pantalla de confirmación no repita nada.
 *
 * El motivo NO viaja en la URL: la pantalla de confirmación lo lee de la fila
 * ya guardada. Un `searchParams` queda en el historial del navegador y en los
 * logs del proxy, y este dato solo vive dentro del panel.
 *
 * `ya-no-publicada` vuelve al detalle con un aviso en vez de ir a
 * `ya-resuelto/`: el literal que exige la spec para este caso es distinto
 * ("Esta ficha ya no estaba publicada.", no "Este registro ya lo habías
 * resuelto.") y el detalle es donde el admin puede ver en qué estado quedó.
 */
import { redirect } from "next/navigation";

import { RUTA_COLA_ADMIN, requerirSesionAdmin } from "@/lib/admin/guarda";
import { despublicarFicha } from "@/lib/admin/transiciones";
import { obtenerPrisma } from "@/lib/prisma";

export async function despublicarRegistroAccion(
  id: string,
  formData: FormData,
): Promise<void> {
  await requerirSesionAdmin();

  const enviado = formData.get("motivo");
  const motivo = typeof enviado === "string" ? enviado : "";

  const resultado = await despublicarFicha(obtenerPrisma(), id, motivo);

  if (resultado.resultado === "despublicada") {
    redirect(`/admin/registros/${id}/despublicado`);
  }
  if (resultado.resultado === "ya-no-publicada") {
    redirect(`/admin/registros/${id}?avisoDespublicar=ya-no-publicada`);
  }
  if (resultado.resultado === "no-encontrado") {
    redirect(RUTA_COLA_ADMIN);
  }

  redirect(`/admin/registros/${id}?errorDespublicar=${resultado.error}`);
}
