"use server";

/**
 * Server Action del acceso al panel (spec `revision-admin`, requirement
 * "Acceso al panel con contraseña única de entorno y sesión firmada").
 *
 * Envoltorio de Next (change `migrar-panel-admin-base-astro`, design.md
 * §2.3): la lógica —fail-safe, límite de intentos, comparación, cookie— vive
 * en `src/lib/admin/entrar.ts`, sin Next, y la comparte la Action `entrar` de
 * Astro. Aquí solo se traduce el destino a `redirect()`. Se retira en T-027.
 */
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { ejecutarAcceso } from "@/lib/admin/entrar";

export async function entrarAlPanel(formData: FormData): Promise<void> {
  redirect((await ejecutarAcceso(formData, await headers(), await cookies())).ruta);
}
