"use server";

/**
 * Server Action de "Confirmar mi número" (spec `registro-negocio` de T-016,
 * tasks.md #11).
 *
 * Tres líneas a propósito: en un módulo `"use server"` **todo lo exportado es
 * un endpoint** al que el navegador puede llamar con los argumentos que
 * quiera, así que aquí no vive ninguna función que reciba dependencias. La
 * lógica —y sus pruebas— están en `src/lib/verificacion/acciones.ts`.
 */
import {
  dependenciasDeVerificacion,
  ejecutarConfirmacion,
} from "@/lib/verificacion/acciones";

export async function confirmarCodigoVerificarAccion(formData: FormData): Promise<void> {
  await ejecutarConfirmacion(formData, await dependenciasDeVerificacion());
}
