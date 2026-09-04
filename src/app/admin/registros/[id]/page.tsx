import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { aprobarRegistroAccion } from "@/app/admin/registros/[id]/accion-aprobar";
import { rechazarRegistroAccion } from "@/app/admin/registros/[id]/accion-rechazar";
import { BotonWhatsapp } from "@/components/admin/boton-whatsapp";
import { DetalleRegistro } from "@/components/admin/detalle-registro";
import { FormularioAprobar } from "@/components/admin/formulario-aprobar";
import { FormularioRechazar } from "@/components/admin/formulario-rechazar";
import { obtenerRegistroParaPanel } from "@/lib/admin/consultas";
import { requerirSesionAdmin } from "@/lib/admin/guarda";
import { BOTON_WHATSAPP_VERIFICACION, mensajeVerificacion } from "@/lib/admin/textos";
import { ESTADO_NEGOCIO_DEFAULT } from "@/lib/negocio";
import { obtenerPrisma } from "@/lib/prisma";

export const metadata: Metadata = { robots: { index: false, follow: false } };

function primeraCadena(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

function listaCadenas(valor: string | string[] | undefined): string[] {
  if (!valor) return [];
  return Array.isArray(valor) ? valor : [valor];
}

/**
 * Detalle de un registro (requirement "Detalle del registro con todos los
 * datos capturados, solo dentro del panel"): datos completos, botón de
 * verificación por WhatsApp y, si sigue `en_revision`, los formularios de
 * aprobar y rechazar.
 *
 * La guarda va antes de leer nada: sin sesión válida la respuesta es la
 * redirección al acceso, sin decir siquiera si ese identificador existe.
 *
 * Los errores de los formularios viajan por `searchParams` (POST→GET del
 * `redirect` de las acciones) para no necesitar ningún Client Component
 * (`useActionState` exige que el `<form>` sea de cliente, y el requirement
 * "sin JavaScript de cliente propio" es estricto para este panel).
 */
export default async function DetalleRegistroAdminPage({
  params,
  searchParams,
}: PageProps<"/admin/registros/[id]">) {
  await requerirSesionAdmin();

  const { id } = await params;
  const sp = await searchParams;

  const prisma = obtenerPrisma();
  const registro = await obtenerRegistroParaPanel(prisma, id);
  if (!registro) notFound();

  const errorAprobar = primeraCadena(sp.errorAprobar);
  const errorRechazar = primeraCadena(sp.errorRechazar);
  const girosSeleccionados = listaCadenas(sp.giro).map(Number);
  const coloniaSeleccionada = primeraCadena(sp.colonia);
  const origenSeleccionado = primeraCadena(sp.origen) === "siembra" ? "siembra" : "organico";

  const enRevision = registro.estado === ESTADO_NEGOCIO_DEFAULT;
  const [giros, colonias] = enRevision
    ? await Promise.all([
        prisma.giro.findMany({ orderBy: { id: "asc" } }),
        prisma.colonia.findMany({ orderBy: { id: "asc" } }),
      ])
    : [[], []];

  return (
    <article className="flex flex-col gap-8 py-4">
      <DetalleRegistro registro={registro} />

      <BotonWhatsapp
        whatsapp={registro.whatsapp}
        mensaje={mensajeVerificacion(registro.nombre)}
        etiqueta={BOTON_WHATSAPP_VERIFICACION}
      />

      {enRevision && (
        <>
          <FormularioAprobar
            action={aprobarRegistroAccion.bind(null, id)}
            giros={giros}
            girosSeleccionados={girosSeleccionados}
            colonias={colonias}
            coloniaSeleccionada={coloniaSeleccionada}
            coloniaPendienteTexto={registro.coloniaPendiente ? registro.coloniaOtra : null}
            origenSeleccionado={origenSeleccionado}
            errorGiros={errorAprobar === "giros"}
            errorColonia={errorAprobar === "colonia"}
          />

          <FormularioRechazar
            action={rechazarRegistroAccion.bind(null, id)}
            error={errorRechazar === "motivo"}
          />
        </>
      )}
    </article>
  );
}
