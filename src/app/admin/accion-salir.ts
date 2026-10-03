"use server";

/**
 * Server Action del botón "Salir" (spec `revision-admin`, requirement "Acceso
 * al panel…"): caduca la cookie de sesión y manda a la pantalla de acceso con
 * el mensaje "Cerraste sesión.".
 *
 * Envoltorio de Next (change `migrar-panel-admin-base-astro`, design.md
 * §2.3): la lógica vive en `ejecutarSalida` (`src/lib/admin/entrar.ts`) y la
 * comparte la Action `salir` de Astro. Sin guarda a propósito: salir sin
 * sesión es simplemente salir. Se retira en T-027.
 */
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { ejecutarSalida } from "@/lib/admin/entrar";

export async function salirDelPanel(): Promise<void> {
  redirect(ejecutarSalida(await headers(), await cookies()).ruta);
}
