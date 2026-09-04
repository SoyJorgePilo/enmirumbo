import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { borrarRegistroAccion } from "@/app/admin/registros/[id]/accion-borrar";
import { ConfirmacionBorrado } from "@/components/admin/confirmacion-borrado";
import { obtenerRegistroParaPanel } from "@/lib/admin/consultas";
import { requerirSesionAdmin } from "@/lib/admin/guarda";
import { obtenerPrisma } from "@/lib/prisma";

export const metadata: Metadata = { robots: { index: false, follow: false } };

function primeraCadena(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

/**
 * Paso 1 del borrado definitivo (spec `agregar-despublicar-y-borrado-arco`,
 * requirement "El borrado definitivo se confirma en dos pasos..."): un GET
 * puro que NO borra nada, solo muestra la pantalla de confirmación con el
 * nombre del negocio y el recordatorio del trámite ARCO. Disponible para un
 * registro en cualquier estado.
 *
 * La guarda de sesión va antes de leer nada, igual que el resto del panel;
 * sin sesión, la redirección no revela ni siquiera si este id existe.
 *
 * El error de la palabra de confirmación viaja por `searchParams` tras el
 * POST→GET de la Server Action (mismo patrón que `errorRechazar`/
 * `errorAprobar` del detalle): esta pantalla es un Server Component, sin
 * declarar el modo de cliente.
 */
export default async function ConfirmarBorradoPage({
  params,
  searchParams,
}: PageProps<"/admin/registros/[id]/borrar">) {
  await requerirSesionAdmin();

  const { id } = await params;
  const sp = await searchParams;

  const registro = await obtenerRegistroParaPanel(obtenerPrisma(), id);
  if (!registro) notFound();

  const errorBorrar = primeraCadena(sp.errorBorrar);

  return (
    <ConfirmacionBorrado
      nombreNegocio={registro.nombre}
      action={borrarRegistroAccion.bind(null, id)}
      volverHref={`/admin/registros/${id}`}
      error={errorBorrar === "palabra"}
    />
  );
}
