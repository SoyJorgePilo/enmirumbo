import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { BotonWhatsapp } from "@/components/admin/boton-whatsapp";
import { urlSitio } from "@/lib/admin/config";
import { obtenerRegistroParaPanel } from "@/lib/admin/consultas";
import { requerirSesionAdmin } from "@/lib/admin/guarda";
import {
  BOTON_AVISAR_WHATSAPP,
  MENSAJE_APROBADO,
  MENSAJE_SIN_URL_DEL_SITIO,
  TEXTO_VOLVER_A_LA_COLA,
  mensajeAvisoPublicacion,
  mensajeAvisoPublicacionConEnlace,
} from "@/lib/admin/textos";
import { construirSegmentoFicha } from "@/lib/ficha-url";
import { leerSobre } from "@/lib/gestion/sobre";
import { construirEnlaceDeGestion } from "@/lib/gestion/token";
import { ESTADO_NEGOCIO_PUBLICADO } from "@/lib/negocio";
import { obtenerPrisma } from "@/lib/prisma";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Confirmación tras aprobar (requirement "Al aprobar se ofrece avisarle al
 * negocio por WhatsApp con el link de su ficha"). Destino del `redirect` de
 * la Server Action (POST→GET, design.md §5): recargar esta pantalla no repite
 * la aprobación porque aquí ya no hay ningún `<form>` que lo haga.
 *
 * El link de la ficha es ABSOLUTO, porque va a viajar fuera del sitio, y sale
 * de la URL pública configurada (design.md §7). Si en producción falta esa
 * variable, el panel lo dice a la vista en vez de mandarle a un negocio real
 * un enlace a `localhost`.
 *
 * ESTA ES LA ÚNICA PANTALLA EN LA QUE SE VE EL ENLACE DE GESTIÓN (change
 * `agregar-enlace-de-gestion`, design.md §3): la base solo guarda su huella,
 * así que el enlace en claro llega aquí dentro del sobre de un solo uso que
 * dejó la acción de aprobar. Si el admin la abandona sin mandar el mensaje,
 * para volver a tenerlo tiene que generar uno nuevo — y entonces este deja de
 * servir. Sin sobre (URL pegada a pelo, o caducado) el mensaje se ofrece igual
 * pero SOLO con el link de la ficha: el aviso de publicación no se pierde.
 */
export default async function RegistroAprobadoPage({
  params,
}: PageProps<"/admin/registros/[id]/aprobado">) {
  await requerirSesionAdmin();

  const { id } = await params;
  const registro = await obtenerRegistroParaPanel(obtenerPrisma(), id);
  if (!registro) notFound();
  // Una confirmación tiene que confirmar algo que pasó: si este registro no
  // está publicado (alguien pegó la URL a pelo), se vuelve al detalle en vez
  // de anunciar una publicación que no existe.
  if (registro.estado !== ESTADO_NEGOCIO_PUBLICADO) redirect(`/admin/registros/${id}`);

  const origen = urlSitio();
  const linkFicha = origen
    ? `${origen}/negocio/${construirSegmentoFicha(registro.nombre, registro.id)}`
    : null;

  const token = leerSobre(await cookies(), id);
  const enlaceGestion = token ? construirEnlaceDeGestion(token) : null;

  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-6 py-12 text-center">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        {MENSAJE_APROBADO}
      </h1>
      {linkFicha ? (
        <BotonWhatsapp
          whatsapp={registro.whatsapp}
          mensaje={
            enlaceGestion
              ? mensajeAvisoPublicacionConEnlace(
                  registro.nombre,
                  linkFicha,
                  enlaceGestion,
                )
              : mensajeAvisoPublicacion(registro.nombre, linkFicha)
          }
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
