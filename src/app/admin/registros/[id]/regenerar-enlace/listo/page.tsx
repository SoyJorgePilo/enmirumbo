import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { BotonWhatsapp } from "@/components/admin/boton-whatsapp";
import { obtenerRegistroParaPanel } from "@/lib/admin/consultas";
import { requerirSesionAdmin } from "@/lib/admin/guarda";
import {
  BOTON_MANDAR_ENLACE_WHATSAPP,
  MENSAJE_ENLACE_REGENERADO,
  MENSAJE_SIN_URL_DEL_SITIO,
  TEXTO_VOLVER_A_LA_COLA,
  mensajeEnlaceNuevo,
} from "@/lib/admin/textos";
import { leerSobre } from "@/lib/gestion/sobre";
import { construirEnlaceDeGestion } from "@/lib/gestion/token";
import { ESTADO_NEGOCIO_PUBLICADO } from "@/lib/negocio";
import { obtenerPrisma } from "@/lib/prisma";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Confirmación de "Generar un enlace nuevo" (spec `revision-admin`): el ÚNICO
 * momento en que ese enlace se muestra en el panel (design.md §3) — de aquí
 * sale el mensaje de WhatsApp con el enlace ya escrito. Si el admin sale sin
 * mandarlo, para volver a tenerlo hay que generar otro, y entonces este deja
 * de servir.
 *
 * El enlace no está en la base ni en la URL: se lee del sobre de un solo uso
 * que dejó la acción, atado a ESTE negocio. Sin sobre —caducado, de otro
 * negocio, o alguien pegó la URL a pelo— se vuelve al detalle: nada que
 * confirmar y nada que mostrar.
 *
 * Mismo patrón POST→GET que el resto del panel: aquí ya no hay ningún
 * `<form>`, así que recargar no genera un enlace distinto.
 */
export default async function RegenerarEnlaceListoPage({
  params,
}: PageProps<"/admin/registros/[id]/regenerar-enlace/listo">) {
  await requerirSesionAdmin();

  const { id } = await params;
  const registro = await obtenerRegistroParaPanel(obtenerPrisma(), id);
  if (!registro) notFound();
  if (registro.estado !== ESTADO_NEGOCIO_PUBLICADO) redirect(`/admin/registros/${id}`);

  const token = leerSobre(await cookies(), id);
  if (!token) redirect(`/admin/registros/${id}`);

  const enlace = construirEnlaceDeGestion(token);

  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-6 py-12 text-center">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        {MENSAJE_ENLACE_REGENERADO}
      </h1>
      {enlace ? (
        <BotonWhatsapp
          whatsapp={registro.whatsapp}
          mensaje={mensajeEnlaceNuevo(registro.nombre, enlace)}
          etiqueta={BOTON_MANDAR_ENLACE_WHATSAPP}
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
