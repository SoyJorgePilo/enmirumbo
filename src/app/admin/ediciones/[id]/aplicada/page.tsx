import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { BotonWhatsapp } from "@/components/admin/boton-whatsapp";
import { urlSitio } from "@/lib/admin/config";
import { obtenerEdicionParaPanel } from "@/lib/admin/ediciones";
import { requerirSesionAdmin } from "@/lib/admin/guarda";
import {
  BOTON_AVISAR_WHATSAPP,
  MENSAJE_CAMBIOS_APLICADOS,
  MENSAJE_SIN_URL_DEL_SITIO,
  TEXTO_VOLVER_A_LA_COLA,
  mensajeAvisoCambiosAplicados,
} from "@/lib/admin/textos";
import { ESTADO_EDICION_APLICADA } from "@/lib/gestion/estados";
import { obtenerPrisma } from "@/lib/prisma";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Confirmación tras aplicar (spec `revision-admin`, requirement "Aplicar la
 * edición actualiza la ficha publicada y solo eso"): mismo patrón POST→GET que
 * `aprobado/page.tsx` — recargar esta pantalla no repite la aplicación porque
 * aquí ya no hay ningún `<form>`.
 *
 * Una confirmación tiene que confirmar algo que pasó: si esta edición no está
 * `aplicada` (alguien pegó la URL a pelo), se vuelve al detalle en vez de
 * anunciar un cambio que no ocurrió.
 *
 * El WhatsApp del aviso es el de la ficha YA ACTUALIZADA —si la edición cambió
 * el número, ese es el vigente— y el link es ABSOLUTO, porque va a viajar
 * fuera del sitio.
 */
export default async function EdicionAplicadaPage({
  params,
}: PageProps<"/admin/ediciones/[id]/aplicada">) {
  await requerirSesionAdmin();

  const { id } = await params;
  const edicion = await obtenerEdicionParaPanel(obtenerPrisma(), id);
  if (!edicion) notFound();
  if (edicion.estado !== ESTADO_EDICION_APLICADA) redirect(`/admin/ediciones/${id}`);

  const origen = urlSitio();
  const linkFicha = origen ? `${origen}/negocio/${edicion.segmentoFicha}` : null;

  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-6 py-12 text-center">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        {MENSAJE_CAMBIOS_APLICADOS}
      </h1>
      {linkFicha ? (
        <BotonWhatsapp
          whatsapp={edicion.whatsappPublicado}
          mensaje={mensajeAvisoCambiosAplicados(edicion.negocioNombre, linkFicha)}
          etiqueta={BOTON_AVISAR_WHATSAPP}
        />
      ) : (
        <p role="alert" className="max-w-sm text-tinta">
          {MENSAJE_SIN_URL_DEL_SITIO}
        </p>
      )}
      <Link
        href="/admin/cola"
        className="inline-flex min-h-11 items-center px-4 text-base font-semibold text-accion-fuerte underline underline-offset-4"
      >
        {TEXTO_VOLVER_A_LA_COLA}
      </Link>
    </section>
  );
}
