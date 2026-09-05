import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { aplicarEdicionAccion } from "@/app/admin/ediciones/[id]/accion-aplicar";
import { descartarEdicionAccion } from "@/app/admin/ediciones/[id]/accion-descartar";
import { BotonWhatsapp } from "@/components/admin/boton-whatsapp";
import { ComparacionEdicion } from "@/components/admin/comparacion-edicion";
import { FormularioAplicarEdicion } from "@/components/admin/formulario-aplicar-edicion";
import { FormularioDescartarEdicion } from "@/components/admin/formulario-descartar-edicion";
import { obtenerEdicionParaPanel, siguePendiente } from "@/lib/admin/ediciones";
import { requerirSesionAdmin } from "@/lib/admin/guarda";
import {
  ADVERTENCIA_CAMBIO_WHATSAPP,
  BOTON_WHATSAPP_VERIFICACION,
  MENSAJE_EDICION_FICHA_NO_PUBLICADA,
  MENSAJE_EDICION_REEMPLAZADA,
  MENSAJE_EDICION_YA_RESUELTA,
  MENSAJE_ERROR_AL_RESOLVER_EDICION,
  TITULO_CAMBIOS_POR_REVISAR,
  errorMotivoDescarteLargo,
  mensajeVerificacion,
} from "@/lib/admin/textos";
import { LIMITE_MOTIVO_DESCARTE } from "@/lib/gestion/ediciones";
import { obtenerPrisma } from "@/lib/prisma";

export const metadata: Metadata = { robots: { index: false, follow: false } };

function primeraCadena(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

/**
 * Detalle comparativo de una edición, `/admin/ediciones/<id>` (spec
 * `revision-admin`, requirement "El detalle de una edición compara lo
 * publicado con lo propuesto"; ticket T-014, tasks.md #20).
 *
 * La guarda va ANTES de leer nada: sin sesión válida la respuesta es la
 * redirección al acceso, sin ni un dato de lo publicado ni de lo propuesto.
 *
 * Los avisos de concurrencia y los errores de los formularios viajan por
 * `searchParams` (POST→GET del `redirect` de las acciones) para no necesitar
 * ningún Client Component. Lo que DECIDE si una acción se aplica no es esa
 * URL: es la escritura condicionada de `src/lib/gestion/ediciones.ts`.
 *
 * Una edición ya resuelta se sigue pudiendo abrir —el admin llega desde el
 * historial— pero sin los formularios: no hay nada que aplicar ni que
 * descartar.
 */
export default async function DetalleEdicionAdminPage({
  params,
  searchParams,
}: PageProps<"/admin/ediciones/[id]">) {
  await requerirSesionAdmin();

  const { id } = await params;
  const sp = await searchParams;

  const edicion = await obtenerEdicionParaPanel(obtenerPrisma(), id);
  if (!edicion) notFound();

  // Solo los valores que producen las acciones; cualquier otra cosa en la URL
  // (la escribe quien quiera) no pinta ningún aviso.
  const avisoCrudo = primeraCadena(sp.aviso);
  const avisoConcurrencia =
    avisoCrudo === "ya-resuelta"
      ? MENSAJE_EDICION_YA_RESUELTA
      : avisoCrudo === "reemplazada"
        ? MENSAJE_EDICION_REEMPLAZADA
        : undefined;
  const errorDescartarCrudo = primeraCadena(sp.errorDescartar);
  const errorAplicarCrudo = primeraCadena(sp.errorAplicar);
  const pendiente = siguePendiente(edicion);

  return (
    <article className="flex flex-col gap-8 py-4">
      {avisoConcurrencia && (
        <p
          role="status"
          className="rounded-xl border border-tinta p-4 text-base font-semibold text-tinta"
        >
          {avisoConcurrencia}
        </p>
      )}

      {errorAplicarCrudo === "servidor" && (
        <p role="alert" className="rounded-xl border border-tinta p-4 text-base font-semibold text-tinta">
          {MENSAJE_ERROR_AL_RESOLVER_EDICION}
        </p>
      )}

      {errorAplicarCrudo === "no-publicada" && (
        <p role="alert" className="rounded-xl border border-tinta p-4 text-base font-semibold text-tinta">
          {MENSAJE_EDICION_FICHA_NO_PUBLICADA}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold break-words tracking-tight sm:text-3xl">
          {TITULO_CAMBIOS_POR_REVISAR}
        </h1>
        <p className="text-tinta-suave">{edicion.negocioNombre}</p>
      </div>

      <ComparacionEdicion campos={edicion.campos} />

      {/* Re-verificación obligatoria al número NUEVO (duda 1 de la propuesta,
          aprobada): el botón abre la conversación con el número propuesto, que
          es a quien hay que confirmarle que el cambio es suyo. */}
      {edicion.cambiaWhatsapp && (
        <div className="flex flex-col gap-3 rounded-xl border-2 border-tinta p-4">
          <p className="text-sm font-semibold text-tinta">
            <span aria-hidden="true">⚠ </span>
            {ADVERTENCIA_CAMBIO_WHATSAPP}
          </p>
          <BotonWhatsapp
            whatsapp={edicion.whatsappPropuesto}
            mensaje={mensajeVerificacion(edicion.negocioNombre)}
            etiqueta={BOTON_WHATSAPP_VERIFICACION}
          />
        </div>
      )}

      {pendiente && (
        <>
          <FormularioAplicarEdicion
            action={aplicarEdicionAccion.bind(null, id)}
            errorWhatsappOcupado={errorAplicarCrudo === "whatsapp"}
          />

          <FormularioDescartarEdicion
            action={descartarEdicionAccion.bind(null, id)}
            error={errorDescartarCrudo === "motivo"}
            errorLargo={
              errorDescartarCrudo === "longitud"
                ? errorMotivoDescarteLargo(LIMITE_MOTIVO_DESCARTE)
                : undefined
            }
          />
        </>
      )}
    </article>
  );
}
