import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { aprobarRegistroAccion } from "@/app/admin/registros/[id]/accion-aprobar";
import { despublicarRegistroAccion } from "@/app/admin/registros/[id]/accion-despublicar";
import { rechazarRegistroAccion } from "@/app/admin/registros/[id]/accion-rechazar";
import { BotonWhatsapp } from "@/components/admin/boton-whatsapp";
import { ControlBorrar } from "@/components/admin/control-borrar";
import { DetalleRegistro } from "@/components/admin/detalle-registro";
import { FormularioAprobar } from "@/components/admin/formulario-aprobar";
import { FormularioDespublicar } from "@/components/admin/formulario-despublicar";
import { FormularioRechazar } from "@/components/admin/formulario-rechazar";
import { obtenerRegistroParaPanel } from "@/lib/admin/consultas";
import { requerirSesionAdmin } from "@/lib/admin/guarda";
import {
  BOTON_WHATSAPP_VERIFICACION,
  MENSAJE_YA_NO_PUBLICADA,
  mensajeVerificacion,
} from "@/lib/admin/textos";
import { ESTADO_NEGOCIO_DEFAULT, ESTADO_NEGOCIO_PUBLICADO } from "@/lib/negocio";
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
  // `motivo` (no escribió nada) y `longitud` (se pasó de la cota) son los dos
  // errores que devuelve `despublicarFicha`; cualquier otro valor en la URL se
  // ignora en vez de pintar un error inventado.
  const errorDespublicarCrudo = primeraCadena(sp.errorDespublicar);
  const errorDespublicar =
    errorDespublicarCrudo === "motivo" || errorDespublicarCrudo === "longitud"
      ? errorDespublicarCrudo
      : undefined;
  // La despublicación llegó tarde: otra pestaña ya la había bajado, o la ficha
  // nunca llegó a publicarse. El literal es propio (no el de "ya resuelto") y
  // el detalle es donde el admin ve en qué estado quedó de verdad.
  const yaNoEstabaPublicada =
    primeraCadena(sp.avisoDespublicar) === "ya-no-publicada";
  // Republicar es aprobar de nuevo (design.md §2): si no hay error que
  // conservar, los giros que ya llegan del registro (asignados en una
  // publicación anterior, ver `RegistroAdminDetalle.girosIds`) se
  // premarcan, para que el admin no los borre sin darse cuenta.
  const girosSeleccionados = sp.giro
    ? listaCadenas(sp.giro).map(Number)
    : (registro.girosIds ?? []);
  const coloniaSeleccionada = primeraCadena(sp.colonia);
  const origenSeleccionado = primeraCadena(sp.origen) === "siembra" ? "siembra" : "organico";

  const enRevision = registro.estado === ESTADO_NEGOCIO_DEFAULT;
  const publicado = registro.estado === ESTADO_NEGOCIO_PUBLICADO;
  const [giros, colonias] = enRevision
    ? await Promise.all([
        prisma.giro.findMany({ orderBy: { id: "asc" } }),
        prisma.colonia.findMany({ orderBy: { id: "asc" } }),
      ])
    : [[], []];

  return (
    <article className="flex flex-col gap-8 py-4">
      {yaNoEstabaPublicada && (
        <p
          role="status"
          className="rounded-xl border border-tinta p-4 text-base font-semibold text-tinta"
        >
          {MENSAJE_YA_NO_PUBLICADA}
        </p>
      )}

      <DetalleRegistro registro={registro} />

      {/* Reportes sin atender (agregar-boton-reportar, T-011): se integran
          aquí, entre los datos y las acciones, cuando esa capacidad exista
          (requirement "El detalle ofrece las acciones que corresponden al
          estado, con el contexto a la vista"). */}

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

      {publicado && (
        <FormularioDespublicar
          action={despublicarRegistroAccion.bind(null, id)}
          error={errorDespublicar}
        />
      )}

      <ControlBorrar id={id} />
    </article>
  );
}
