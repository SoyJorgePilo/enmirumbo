import type { RegistroAdminDetalle } from "@/lib/admin/consultas";

const FORMATO_FECHA = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

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
 */
export function DetalleRegistro({ registro }: { registro: RegistroAdminDetalle }) {
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
            valor={FORMATO_FECHA.format(registro.consintioAvisoEn)}
          />
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
        </dl>
      </div>
    </div>
  );
}
