import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { BotonWhatsapp } from "@/components/admin/boton-whatsapp";
import { obtenerRegistroParaPanel } from "@/lib/admin/consultas";
import { requerirSesionAdmin } from "@/lib/admin/guarda";
import {
  BOTON_AVISAR_WHATSAPP,
  MENSAJE_DESPUBLICADO,
  TEXTO_VOLVER_A_LA_COLA,
  mensajeAvisoDespublicacion,
} from "@/lib/admin/textos";
import { ESTADO_NEGOCIO_DEFAULT } from "@/lib/negocio";
import { obtenerPrisma } from "@/lib/prisma";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Confirmación tras despublicar (spec `agregar-despublicar-y-borrado-arco`,
 * requirement "Al despublicar se ofrece avisarle al negocio por
 * WhatsApp"). Mismo patrón POST→GET que `aprobado/page.tsx` y
 * `rechazado/page.tsx`: recargar esta pantalla no repite ninguna acción
 * porque aquí no hay ningún `<form>`.
 *
 * La guarda exige el RASTRO REAL de la despublicación, no solo el estado
 * (hallazgo BAJO 1 de la etapa C; la etapa UI ya lo había dejado anotado como
 * endurecimiento posible). Mirar solo `en_revision` dejaba abrir esta pantalla
 * sobre un alta recién llegada del formulario público: el admin veía "Ya la
 * despublicaste." y un botón de WhatsApp cargado con el mensaje a medias
 * ("Bajamos del directorio la ficha de «…»: ." con el motivo vacío), a un toque
 * de mandarle una falsedad a un negocio que nunca se publicó. Como
 * `despublicarFicha` escribe fecha y motivo juntos, exigir los dos no descarta
 * ninguna despublicación real.
 *
 * El motivo se lee de la fila YA GUARDADA (`motivoDespublicacion`), nunca de
 * la URL: un `searchParams` queda en el historial del navegador y en los logs
 * del proxy, y este dato solo vive dentro del panel (mismo criterio que
 * `rechazado/page.tsx` con `motivoRechazo`).
 */
export default async function RegistroDespublicadoPage({
  params,
}: PageProps<"/admin/registros/[id]/despublicado">) {
  await requerirSesionAdmin();

  const { id } = await params;

  const registro = await obtenerRegistroParaPanel(obtenerPrisma(), id);
  if (!registro) notFound();

  const motivo = registro.motivoDespublicacion?.trim() ?? "";
  const seDespublico =
    registro.estado === ESTADO_NEGOCIO_DEFAULT &&
    registro.despublicadoEn !== null &&
    motivo !== "";
  if (!seDespublico) redirect(`/admin/registros/${id}`);

  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-6 py-12 text-center">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        {MENSAJE_DESPUBLICADO}
      </h1>
      <BotonWhatsapp
        whatsapp={registro.whatsapp}
        mensaje={mensajeAvisoDespublicacion(registro.nombre, motivo)}
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
