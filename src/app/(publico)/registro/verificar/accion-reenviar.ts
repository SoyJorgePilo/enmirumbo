"use server";

/**
 * Server Action de "Reenviar el código" (spec `registro-negocio` de T-016,
 * tasks.md #12). Envoltura de pocas líneas, misma razón que
 * `accion-confirmar.ts`: la lógica y sus pruebas viven en
 * `src/lib/verificacion/acciones.ts`, que devuelve el destino; aquí solo se
 * traduce a `redirect`/`notFound` (change `migrar-registro-astro`, design.md §4).
 */
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { dependenciasDeVerificacion, ejecutarReenvio } from "@/lib/verificacion/acciones";

export async function reenviarCodigoVerificarAccion(): Promise<void> {
  const destino = await ejecutarReenvio(await dependenciasDeVerificacion(await headers()), await cookies());
  if (destino.tipo === "no-encontrado") notFound();
  redirect(destino.ruta);
}
