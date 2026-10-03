"use server";

/**
 * Server Action de "Confirmar mi número" (spec `registro-negocio` de T-016,
 * tasks.md #11).
 *
 * Pocas líneas a propósito: en un módulo `"use server"` **todo lo exportado es
 * un endpoint** al que el navegador puede llamar con los argumentos que
 * quiera, así que aquí no vive ninguna función que reciba dependencias. La
 * lógica —y sus pruebas— están en `src/lib/verificacion/acciones.ts`, que
 * devuelve el destino; aquí solo se traduce a `redirect`/`notFound` (change
 * `migrar-registro-astro`, design.md §4).
 */
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import {
  dependenciasDeVerificacion,
  ejecutarConfirmacion,
} from "@/lib/verificacion/acciones";

export async function confirmarCodigoVerificarAccion(formData: FormData): Promise<void> {
  const destino = await ejecutarConfirmacion(
    formData,
    await dependenciasDeVerificacion(await headers()),
    await cookies(),
  );
  if (destino.tipo === "no-encontrado") notFound();
  redirect(destino.ruta);
}
