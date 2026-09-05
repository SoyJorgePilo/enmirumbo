import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { regenerarEnlaceAccion } from "@/app/admin/registros/[id]/regenerar-enlace/accion";
import { BOTON_GENERAR_ENLACE_NUEVO, TEXTO_MEJOR_NO_REGRESAR } from "@/lib/admin/textos";
import { obtenerRegistroParaPanel } from "@/lib/admin/consultas";
import { requerirSesionAdmin } from "@/lib/admin/guarda";
import { CLASE_BOTON_SECUNDARIO } from "@/lib/estilos-boton";
import { ESTADO_NEGOCIO_PUBLICADO } from "@/lib/negocio";
import { obtenerPrisma } from "@/lib/prisma";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Paso 1 de "Generar un enlace nuevo" (spec `revision-admin`, requirement del
 * mismo nombre; ticket T-014): confirma antes de invalidar el enlace vigente,
 * mismo criterio de dos pasos que `ConfirmacionBorrado` — abrir o recargar
 * esta pantalla no ejecuta nada porque el GET no trae ningún `<form>` que ya
 * haya postead.
 *
 * Solo se ofrece para una ficha PUBLICADA: una que no lo está no tiene enlace
 * que regenerar. El enlace nuevo no se muestra aquí sino en `/listo`, que es
 * el único momento en que se ve (design.md §3).
 */
export default async function RegenerarEnlacePage({
  params,
}: PageProps<"/admin/registros/[id]/regenerar-enlace">) {
  await requerirSesionAdmin();

  const { id } = await params;
  const registro = await obtenerRegistroParaPanel(obtenerPrisma(), id);
  if (!registro) notFound();
  if (registro.estado !== ESTADO_NEGOCIO_PUBLICADO) redirect(`/admin/registros/${id}`);

  return (
    <div className="flex flex-col gap-6 py-4">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        {BOTON_GENERAR_ENLACE_NUEVO}
      </h1>

      <p className="break-words text-tinta">
        El enlace que «{registro.nombre}» tiene guardado hoy va a dejar de
        funcionar de inmediato. Solo hazlo si sospechas que alguien más lo
        tiene, o si el dueño lo perdió y no aparece en su chat.
      </p>

      <form action={regenerarEnlaceAccion.bind(null, id)} className="flex flex-col gap-3">
        <button type="submit" className={`${CLASE_BOTON_SECUNDARIO} w-full`}>
          {BOTON_GENERAR_ENLACE_NUEVO}
        </button>
      </form>

      <Link
        href={`/admin/registros/${id}`}
        className="inline-flex min-h-11 items-center justify-center px-4 text-base font-semibold text-accion-fuerte underline underline-offset-4"
      >
        {TEXTO_MEJOR_NO_REGRESAR}
      </Link>
    </div>
  );
}
