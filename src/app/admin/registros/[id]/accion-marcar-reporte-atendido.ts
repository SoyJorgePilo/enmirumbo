"use server";

/**
 * Server Action de "Marcar como atendido" (spec `revision-admin`, requirement
 * "Marcar un reporte como atendido, una sola vez").
 *
 * Primero la guarda de sesión, antes de leer o escribir nada (design.md §3:
 * una Server Action es un endpoint propio, no una parte de la página): sin
 * cookie válida el reporte sigue `pendiente` y la respuesta es la redirección
 * al acceso, sin su motivo, su comentario ni dato alguno del negocio.
 *
 * La escritura condicionada al estado vive en `marcarReporteAtendido`
 * (`src/lib/admin/reportes.ts`), igual que las transiciones del negocio.
 * Termina siempre en un `redirect` (POST-Redirect-GET): recargar la pantalla
 * de después no repite la acción.
 *
 * A diferencia de aprobar/rechazar, la confirmación es un aviso en la MISMA
 * pantalla del detalle (`?reporte=atendido|ya-atendido`) y no una sub-página:
 * atender reportes es una acción que se repite sobre la misma pantalla, donde
 * pueden quedar más pendientes debajo.
 */
import { redirect } from "next/navigation";

import { requerirSesionAdmin } from "@/lib/admin/guarda";
import { marcarReporteAtendido } from "@/lib/admin/reportes";
import { obtenerPrisma } from "@/lib/prisma";

export async function marcarReporteAtendidoAccion(
  negocioId: string,
  reporteId: string,
  formData: FormData,
): Promise<void> {
  void formData; // El botón no manda campos: el reporte va ligado con `.bind`.
  await requerirSesionAdmin();

  // El `undefined` deja el reloj de siempre; el último argumento condiciona la
  // escritura a que el reporte sea del negocio de ESTE detalle, para que un
  // identificador cambiado a mano no atienda un reporte que la pantalla nunca
  // mostró (hallazgo B1 de la etapa C).
  const resultado = await marcarReporteAtendido(
    obtenerPrisma(),
    reporteId,
    undefined,
    negocioId,
  );

  redirect(`/admin/registros/${negocioId}?reporte=${resultado}`);
}
