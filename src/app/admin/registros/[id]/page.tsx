import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { aprobarRegistroAccion } from "@/app/admin/registros/[id]/accion-aprobar";
import { marcarReporteAtendidoAccion } from "@/app/admin/registros/[id]/accion-marcar-reporte-atendido";
import { rechazarRegistroAccion } from "@/app/admin/registros/[id]/accion-rechazar";
import { BotonWhatsapp } from "@/components/admin/boton-whatsapp";
import { DetalleRegistro } from "@/components/admin/detalle-registro";
import { FormularioAprobar } from "@/components/admin/formulario-aprobar";
import { FormularioRechazar } from "@/components/admin/formulario-rechazar";
import { ReportesPendientesNegocio } from "@/components/admin/reportes-pendientes-negocio";
import { obtenerRegistroParaPanel } from "@/lib/admin/consultas";
import { requerirSesionAdmin } from "@/lib/admin/guarda";
import { obtenerReportesPendientesDeNegocio } from "@/lib/admin/reportes";
import {
  BOTON_WHATSAPP_VERIFICACION,
  MENSAJE_REPORTE_ATENDIDO,
  MENSAJE_REPORTE_YA_ATENDIDO,
  mensajeVerificacion,
} from "@/lib/admin/textos";
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
  // Solo los dos valores que produce la acción; cualquier otra cosa en la URL
  // (la escribe quien quiera) no pinta ningún aviso.
  const reporteCrudo = primeraCadena(sp.reporte);
  const avisoDeReporte =
    reporteCrudo === "atendido" || reporteCrudo === "ya-atendido" ? reporteCrudo : undefined;

  const enRevision = registro.estado === ESTADO_NEGOCIO_DEFAULT;
  const [giros, colonias, reportesPendientes] = await Promise.all([
    enRevision ? prisma.giro.findMany({ orderBy: { id: "asc" } }) : Promise.resolve([]),
    enRevision ? prisma.colonia.findMany({ orderBy: { id: "asc" } }) : Promise.resolve([]),
    obtenerReportesPendientesDeNegocio(prisma, id),
  ]);

  return (
    <article className="flex flex-col gap-8 py-4">
      <DetalleRegistro registro={registro} />

      <BotonWhatsapp
        whatsapp={registro.whatsapp}
        mensaje={mensajeVerificacion(registro.nombre)}
        etiqueta={BOTON_WHATSAPP_VERIFICACION}
      />

      {/* Requirement "Marcar un reporte como atendido, una sola vez": el
          panel DEBE confirmar, sin condición. Va AQUÍ y no dentro de la
          sección de pendientes porque esa sección desaparece cuando ya no
          queda ninguno, y entonces atender el ÚLTIMO reporte de un negocio no
          confirmaba nada — que es justo cuando más falta hace saber si el
          toque contó (hallazgo M1 de la etapa D). */}
      {avisoDeReporte && (
        <p role="status" className="text-sm font-semibold text-tinta">
          {avisoDeReporte === "atendido"
            ? MENSAJE_REPORTE_ATENDIDO
            : MENSAJE_REPORTE_YA_ATENDIDO}
        </p>
      )}

      {/* Requirement "El detalle del negocio lista sus reportes sin
          atender": sección propia, invisible si no hay pendientes. No
          depende de `enRevision` — un negocio `publicado` es justo el caso
          normal que reciben reportes. */}
      {reportesPendientes.length > 0 && (
        <ReportesPendientesNegocio
          reportes={reportesPendientes}
          action={marcarReporteAtendidoAccion.bind(null, id)}
        />
      )}

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
