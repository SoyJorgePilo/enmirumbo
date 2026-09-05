import type { Metadata } from "next";
import Link from "next/link";

import { MENSAJE_CAMBIOS_RECIBIDOS } from "@/lib/gestion/textos";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Confirmación tras enviar cambios (spec `registro-negocio`, requirement
 * "Enviar la edición no toca la ficha pública: crea una revisión pendiente").
 * Destino del `redirect` de la Server Action (POST-Redirect-GET, mismo patrón
 * que `/registro/gracias`): recargar esta pantalla no reenvía nada porque
 * aquí ya no hay ningún `<form>`.
 *
 * Sin enlace de vuelta a "editar" (el token no se repite en ningún href de
 * esta página, design.md §4: nada de fugarlo por un enlace de más). Vuelve a
 * la home, igual que la confirmación del registro.
 *
 * Vive en el grupo `(gestion)`, fuera de la medición, por la misma razón que
 * la pantalla de edición: la URL que el navegador tiene delante al llegar aquí
 * —`/editar/<token>/gracias`— sigue llevando el secreto, y el tracker manda el
 * `pathname` (hallazgo ALTO 1). De ese layout hereda también la política de
 * referente, así que el enlace "Volver al inicio" no se lleva la ruta.
 */
export default function EditarGraciasPage() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-6 py-12 text-center">
      <h1 className="max-w-md text-2xl font-bold tracking-tight sm:text-3xl">
        {MENSAJE_CAMBIOS_RECIBIDOS}
      </h1>
      <Link
        href="/"
        className="inline-flex min-h-11 items-center justify-center px-4 text-base font-semibold text-accion-fuerte underline underline-offset-4"
      >
        Volver al inicio
      </Link>
    </section>
  );
}
