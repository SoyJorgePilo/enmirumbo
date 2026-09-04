import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { BotonWhatsapp } from "@/components/admin/boton-whatsapp";
import { obtenerRegistroParaPanel } from "@/lib/admin/consultas";
import { requerirSesionAdmin } from "@/lib/admin/guarda";
import {
  BOTON_AVISAR_WHATSAPP,
  MENSAJE_RECHAZADO,
  TEXTO_VOLVER_A_LA_COLA,
  mensajeAvisoRechazo,
} from "@/lib/admin/textos";
import { ESTADO_NEGOCIO_RECHAZADO } from "@/lib/negocio";
import { obtenerPrisma } from "@/lib/prisma";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Confirmación tras rechazar (requirement "Rechazar exige motivo, lo guarda
 * con su fecha y ofrece avisar por WhatsApp"). Mismo patrón POST→GET que
 * `aprobado/page.tsx`.
 *
 * El motivo se lee de la fila YA GUARDADA (`motivoRechazo`), nunca de la URL:
 * un `searchParams` queda en el historial del navegador y en los logs del
 * proxy, y este dato solo vive dentro del panel.
 */
export default async function RegistroRechazadoPage({
  params,
}: PageProps<"/admin/registros/[id]/rechazado">) {
  await requerirSesionAdmin();

  const { id } = await params;
  const registro = await obtenerRegistroParaPanel(obtenerPrisma(), id);
  if (!registro) notFound();
  // Mismo criterio que la pantalla de aprobado: sin rechazo de verdad no hay
  // nada que confirmar (y el aviso de WhatsApp saldría con el motivo vacío).
  if (registro.estado !== ESTADO_NEGOCIO_RECHAZADO) redirect(`/admin/registros/${id}`);

  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-6 py-12 text-center">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        {MENSAJE_RECHAZADO}
      </h1>
      <BotonWhatsapp
        whatsapp={registro.whatsapp}
        mensaje={mensajeAvisoRechazo(registro.nombre, registro.motivoRechazo ?? "")}
        etiqueta={BOTON_AVISAR_WHATSAPP}
      />
      <Link
        href="/admin/cola"
        className="inline-flex min-h-11 items-center px-4 text-base font-semibold text-accion-fuerte underline underline-offset-4"
      >
        {TEXTO_VOLVER_A_LA_COLA}
      </Link>
    </section>
  );
}
