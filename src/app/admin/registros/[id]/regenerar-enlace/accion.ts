"use server";

/**
 * Server Action de "Generar un enlace nuevo" (spec `revision-admin`,
 * requirement "El admin puede generar un enlace nuevo, y el anterior deja de
 * servir"; change `agregar-enlace-de-gestion`, tasks.md #25).
 *
 * Toda la regla vive en `src/lib/gestion/enlace.ts`: 32 bytes de
 * `crypto.randomBytes`, huella SHA-256 y SOBRESCRITURA de la huella anterior,
 * condicionada a que la ficha siga publicada. El anterior deja de resolver por
 * construcción (design.md §3), sin lista de enlaces revocados.
 *
 * El enlace EN CLARO no se escribe en la base, ni en la URL, ni en el log:
 * viaja hasta la pantalla de confirmación dentro del sobre de un solo uso
 * (`src/lib/gestion/sobre.ts`), que es una cookie `httpOnly` de dos minutos
 * con `Path=/admin`. Meterlo en la URL lo filtraría por el `Referer` al tocar
 * el botón de WhatsApp, que es justo la fuga que design.md §4 cierra.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { requerirSesionAdmin, sirviendoPorHttps } from "@/lib/admin/guarda";
import { regenerarEnlaceDeGestion } from "@/lib/gestion/enlace";
import { guardarSobre } from "@/lib/gestion/sobre";
import { obtenerPrisma } from "@/lib/prisma";

export async function regenerarEnlaceAccion(id: string): Promise<void> {
  await requerirSesionAdmin();

  const resultado = await regenerarEnlaceDeGestion(obtenerPrisma(), id);

  // La ficha ya no está publicada (otra pestaña la despublicó o la borraron):
  // no hay enlace que regenerar y el detalle dice en qué estado quedó.
  if (resultado.resultado !== "regenerado") redirect(`/admin/registros/${id}`);

  guardarSobre(await cookies(), id, resultado.token, await sirviendoPorHttps());

  redirect(`/admin/registros/${id}/regenerar-enlace/listo`);
}
