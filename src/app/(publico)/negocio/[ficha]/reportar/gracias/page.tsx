import type { Metadata } from "next";
import Link from "next/link";

import {
  ENLACE_VOLVER_A_LA_FICHA,
  MENSAJE_REPORTE_ENVIADO,
} from "@/lib/reportes/textos";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Confirmación del reporte (requirement "El envío del reporte confirma en
 * español llano y no delata nada"): destino del `redirect` tras un envío
 * aceptado (patrón POST-Redirect-GET, igual que `/registro/gracias` y las
 * pantallas del panel) — recargar esta página no reenvía el formulario
 * porque aquí ya no hay ningún `<form>` que lo haga, y no repite el reporte.
 *
 * No vuelve a consultar el negocio: `ficha` es el mismo segmento con el que
 * se llegó al formulario, así que "Volver a la ficha" no necesita otra
 * lectura a la base y no puede confirmar ni negar nada del estado del
 * negocio (requirement "la confirmación no cuenta nada del negocio").
 * Server Component, sin JS.
 */
export default async function ReportarGraciasPage({
  params,
}: PageProps<"/negocio/[ficha]/reportar/gracias">) {
  const { ficha } = await params;

  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-6 py-12 text-center">
      <h1 className="max-w-md text-2xl font-bold tracking-tight sm:text-3xl">
        {MENSAJE_REPORTE_ENVIADO}
      </h1>
      <Link
        href={`/negocio/${ficha}`}
        className="inline-flex min-h-11 items-center justify-center px-4 text-base font-semibold text-accion-fuerte underline underline-offset-4"
      >
        {ENLACE_VOLVER_A_LA_FICHA}
      </Link>
    </section>
  );
}
