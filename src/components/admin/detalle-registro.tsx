import { MarcadorFoto } from "@/components/directorio/marcador-foto";
import {
  ETIQUETA_CUANDO_DESPUBLICO,
  ETIQUETA_POR_QUE_DESPUBLICO,
  textoTieneEnlaceGestion,
} from "@/lib/admin/textos";
import type { RegistroAdminDetalle } from "@/lib/admin/consultas";
import { urlDeFoto } from "@/lib/fotos/url";

const FORMATO_FECHA = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Constancia del consentimiento, con la versión del aviso entre paréntesis
 * (spec `revision-admin`, change `versionar-aviso-privacidad`). Una ficha
 * anterior al versionado lo dice con el literal "versión no registrada": el
 * panel nunca inventa una versión que nadie puede sostener.
 */
function constanciaConVersion(cuando: Date, version: string | null): string {
  return `${FORMATO_FECHA.format(cuando)} (${
    version ? `versión ${version}` : "versión no registrada"
  })`;
}

/**
 * Etiqueta de la reaceptación (hallazgo MEDIO-4 de la etapa C).
 *
 * Describe EL HECHO —un reenvío del formulario público aceptó la versión N—
 * en vez de atribuírselo al titular ("Aceptó una versión más nueva…"). El
 * formulario de registro es anónimo: quien reenvía puede no ser el dueño, y
 * esta línea es evidencia que se lee ante una reclamación. La versión va en la
 * etiqueta porque es lo que se aceptó; el valor es cuándo pasó.
 */
function etiquetaReaceptacion(version: string | null): string {
  return version
    ? `El reenvío aceptó la versión ${version} del aviso`
    : "El reenvío volvió a aceptar el aviso";
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-borde py-2.5 last:border-0">
      <dt className="text-sm font-semibold text-tinta">{etiqueta}</dt>
      <dd className="break-words text-tinta-suave">
        {valor ?? <span className="italic">No capturado</span>}
      </dd>
    </div>
  );
}

/**
 * Detalle completo de un registro (requirement "Detalle del registro con
 * todos los datos capturados, solo dentro del panel"): todo lo que el
 * negocio escribió, más los datos internos que el admin necesita (estado,
 * origen, fecha de registro, constancia del consentimiento). Los opcionales
 * no capturados se marcan como tales, nunca se inventa contenido (scenario
 * "detalle de un registro con solo obligatorios"). Server Component, sin JS.
 *
 * La foto se pide por la dirección del PANEL (`/admin/foto/…`), que es la
 * única que vive dentro del alcance de la cookie de sesión y la única que
 * sirve la foto de un registro que todavía no está publicado. Sin sesión, esa
 * dirección responde el mismo "no encontrado" que el sitio público.
 */
export function DetalleRegistro({
  registro,
}: {
  registro: RegistroAdminDetalle;
}) {
  // "Sin foto" también cuando lo guardado no es una clave del servidor: el
  // panel no pinta referencias que no generó él (M1 de T-004).
  const tieneFoto = urlDeFoto(registro.fotoClave, "ficha", "panel") !== null;

  const coloniaMostrada = registro.coloniaNombre
    ? registro.coloniaNombre
    : registro.coloniaOtra
      ? `"${registro.coloniaOtra}" (escrito como "Otra", sin normalizar)`
      : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold break-words tracking-tight sm:text-3xl">
          {registro.nombre}
        </h1>
        <p className="text-tinta-suave">{registro.categoriaNombre}</p>
      </div>

      {/* Requirement "Detalle del registro con todos los datos capturados,
          solo dentro del panel": la foto tiene que verse "lo bastante
          grande para poder juzgarla contra la política del PRD §6.1" antes
          de aprobar o rechazar — más grande que la miniatura de la tarjeta,
          por eso va arriba del todo y no dentro de la lista de campos. */}
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-semibold text-tinta">Foto del negocio</p>
        {tieneFoto ? (
          <div className="relative aspect-video w-full max-w-sm overflow-hidden rounded-lg border border-borde">
            <MarcadorFoto
              fotoClave={registro.fotoClave}
              variante="ficha"
              ambito="panel"
              alt={`Foto de ${registro.nombre}`}
            />
          </div>
        ) : (
          <p className="text-tinta-suave italic">Sin foto</p>
        )}
      </div>

      <dl className="flex flex-col">
        <Dato etiqueta="WhatsApp" valor={registro.whatsapp} />
        <Dato etiqueta="Colonia" valor={coloniaMostrada} />
        <Dato etiqueta="¿Qué ofreces?" valor={registro.queOfreces} />
        <Dato
          etiqueta="¿Hace entregas o va a domicilio?"
          valor={registro.entregaADomicilio ? "Sí" : "No"}
        />
        <Dato etiqueta="Teléfono fijo" valor={registro.telefonoFijo} />
        <Dato etiqueta="Dirección o referencias" valor={registro.direccion} />
        <Dato etiqueta="Horario" valor={registro.horario} />
        <Dato etiqueta="Página que registró" valor={registro.facebookUrl} />
      </dl>

      <div className="flex flex-col gap-1 rounded-lg border border-borde bg-superficie p-4">
        <p className="text-sm font-semibold text-tinta">Datos internos del panel</p>
        <dl className="flex flex-col">
          <Dato etiqueta="Estado" valor={registro.estado} />
          <Dato
            etiqueta="Origen"
            valor={
              registro.origen === "siembra"
                ? "Lo sembramos nosotros"
                : "Se registró solo"
            }
          />
          <Dato
            etiqueta="Fecha de registro"
            valor={FORMATO_FECHA.format(registro.registradoEn)}
          />
          <Dato
            etiqueta="Consentimiento del aviso de privacidad"
            valor={constanciaConVersion(
              registro.consintioAvisoEn,
              registro.consintioAvisoVersion,
            )}
          />
          {/* Solo cuando un reenvío aceptó una versión POSTERIOR a la de la
              constancia original: si no la hay, esta línea no aparece. */}
          {registro.reconsintioAvisoEn && (
            <Dato
              etiqueta={etiquetaReaceptacion(registro.reconsintioAvisoVersion)}
              valor={FORMATO_FECHA.format(registro.reconsintioAvisoEn)}
            />
          )}
          {registro.publicadoEn && (
            <Dato
              etiqueta="Fecha de publicación"
              valor={FORMATO_FECHA.format(registro.publicadoEn)}
            />
          )}
          {registro.rechazadoEn && (
            <Dato
              etiqueta="Fecha de rechazo"
              valor={FORMATO_FECHA.format(registro.rechazadoEn)}
            />
          )}
          {registro.motivoRechazo && (
            <Dato etiqueta="Motivo del rechazo" valor={registro.motivoRechazo} />
          )}
          {registro.despublicadoEn && (
            <Dato
              etiqueta={ETIQUETA_CUANDO_DESPUBLICO}
              valor={FORMATO_FECHA.format(registro.despublicadoEn)}
            />
          )}
          {registro.motivoDespublicacion && (
            <Dato
              etiqueta={ETIQUETA_POR_QUE_DESPUBLICO}
              valor={registro.motivoDespublicacion}
            />
          )}
        </dl>

        {/* Enlace de gestión (change `agregar-enlace-de-gestion`, requirement
            "Aprobar un registro genera su enlace de gestión…"): el detalle dice
            que la ficha TIENE enlace y desde cuándo, pero NO el enlace — el
            panel no lo conoce, solo guarda su huella (design.md §3). */}
        {registro.tokenGestionCreadoEn && (
          <p className="text-sm text-tinta-suave">
            {textoTieneEnlaceGestion(FORMATO_FECHA.format(registro.tokenGestionCreadoEn))}
          </p>
        )}
      </div>
    </div>
  );
}
