import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { obtenerRegistroParaPanel } from "@/lib/admin/consultas";
import { requerirSesionAdmin } from "@/lib/admin/guarda";
import { MENSAJE_YA_RESUELTO, TEXTO_VOLVER_A_LA_COLA } from "@/lib/admin/textos";
import { ESTADO_NEGOCIO_DEFAULT } from "@/lib/negocio";
import { obtenerPrisma } from "@/lib/prisma";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Pantalla de "ya resuelto" (requirement "Una transición solo se aplica sobre
 * un registro que sigue en revisión"): a dónde llega una segunda
 * aprobación/rechazo sobre un registro que otra pestaña ya resolvió. No
 * ofrece deshacer nada — la resolución original queda intacta.
 */
export default async function RegistroYaResueltoPage({
  params,
}: PageProps<"/admin/registros/[id]/ya-resuelto">) {
  await requerirSesionAdmin();

  const { id } = await params;
  const registro = await obtenerRegistroParaPanel(obtenerPrisma(), id);
  if (!registro) notFound();
  // Si sigue en revisión no lo había resuelto nadie: al detalle.
  if (registro.estado === ESTADO_NEGOCIO_DEFAULT) redirect(`/admin/registros/${id}`);

  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-6 py-12 text-center">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        {MENSAJE_YA_RESUELTO}
      </h1>
      <Link
        href="/admin/cola"
        className="inline-flex min-h-11 items-center px-4 text-base font-semibold text-accion-fuerte underline underline-offset-4"
      >
        {TEXTO_VOLVER_A_LA_COLA}
      </Link>
    </section>
  );
}
