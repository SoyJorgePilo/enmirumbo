"use server";

/**
 * Server Action de "Reenviar el código" (spec `registro-negocio` de T-016,
 * tasks.md #12). Envoltura de tres líneas, misma razón que
 * `accion-confirmar.ts`: la lógica y sus pruebas viven en
 * `src/lib/verificacion/acciones.ts`.
 */
import { dependenciasDeVerificacion, ejecutarReenvio } from "@/lib/verificacion/acciones";

export async function reenviarCodigoVerificarAccion(): Promise<void> {
  await ejecutarReenvio(await dependenciasDeVerificacion());
}
