import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { BotonWhatsapp } from "@/components/admin/boton-whatsapp";
import { obtenerEdicionParaPanel } from "@/lib/admin/ediciones";
import { requerirSesionAdmin } from "@/lib/admin/guarda";
import {
  BOTON_AVISAR_WHATSAPP,
  MENSAJE_CAMBIOS_DESCARTADOS,
  TEXTO_VOLVER_A_LA_COLA,
  mensajeAvisoCambiosDescartados,
} from "@/lib/admin/textos";
import { ESTADO_EDICION_DESCARTADA } from "@/lib/gestion/estados";
import { obtenerPrisma } from "@/lib/prisma";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Confirmación tras descartar (spec `revision-admin`, requirement "Descartar
 * la edición exige motivo, no toca la ficha y ofrece avisar por WhatsApp").
 *
 * El motivo se lee de la fila YA GUARDADA, nunca de la URL: mismo criterio que
 * `rechazado/page.tsx` con `motivoRechazo`. De ahí sale la condición doble:
 * sin motivo guardado esto no fue un descarte del admin sino un REEMPLAZO del
 * dueño (`src/lib/gestion/ediciones.ts` cierra la anterior sin motivo), y
 * entonces no hay nada que confirmar ni de qué avisarle a nadie.
 *
 * El WhatsApp del aviso es el PUBLICADO: los cambios no se aplicaron, así que
 * el número propuesto puede no ser suyo todavía.
 */
export default async function EdicionDescartadaPage({
  params,
}: PageProps<"/admin/ediciones/[id]/descartada">) {
  await requerirSesionAdmin();

  const { id } = await params;
  const edicion = await obtenerEdicionParaPanel(obtenerPrisma(), id);
  if (!edicion) notFound();
  if (edicion.estado !== ESTADO_EDICION_DESCARTADA || !edicion.motivoDescarte) {
    redirect(`/admin/ediciones/${id}`);
  }

  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-6 py-12 text-center">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        {MENSAJE_CAMBIOS_DESCARTADOS}
      </h1>
      <BotonWhatsapp
        whatsapp={edicion.whatsappPublicado}
        mensaje={mensajeAvisoCambiosDescartados(
          edicion.negocioNombre,
          edicion.motivoDescarte,
        )}
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
