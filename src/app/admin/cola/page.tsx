import type { Metadata } from "next";

import { salirDelPanel } from "@/app/admin/accion-salir";
import { BotonSalir } from "@/components/admin/boton-salir";
import { SeccionNegociosReportados } from "@/components/admin/negocios-reportados";
import { TarjetaCola } from "@/components/admin/tarjeta-cola";
import { contarAtrasados, obtenerColaDeRevision } from "@/lib/admin/consultas";
import { requerirSesionAdmin } from "@/lib/admin/guarda";
import { obtenerNegociosReportados } from "@/lib/admin/reportes";
import {
  TEXTO_COLA_ENCABEZADO,
  TEXTO_COLA_VACIA,
  textoConteoAtrasados,
} from "@/lib/admin/textos";
import { obtenerPrisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Registros por revisar — Panel de revisión",
  robots: { index: false, follow: false },
};

/**
 * Cola de revisión (requirement "Cola de revisión con los registros
 * pendientes, más antiguos primero"): solo `en_revision`, del más antiguo al
 * más reciente, con el conteo de atrasados y el estado vacío.
 *
 * La guarda va ANTES de tocar la base: sin sesión válida no se lee ni un
 * registro y la respuesta es la redirección a la pantalla de acceso.
 */
export default async function ColaAdminPage() {
  await requerirSesionAdmin();

  const prisma = obtenerPrisma();
  const [cola, negociosReportados] = await Promise.all([
    obtenerColaDeRevision(prisma),
    obtenerNegociosReportados(prisma),
  ]);
  const atrasados = contarAtrasados(cola);

  return (
    <section className="flex flex-col gap-6 py-4">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {TEXTO_COLA_ENCABEZADO}
        </h1>
        <BotonSalir action={salirDelPanel} />
      </div>

      {atrasados > 0 && (
        <p className="text-sm font-semibold text-tinta">
          {textoConteoAtrasados(atrasados)}
        </p>
      )}

      {cola.length === 0 ? (
        <p className="text-tinta-suave">{TEXTO_COLA_VACIA}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {cola.map((registro) => (
            <li key={registro.id}>
              <TarjetaCola {...registro} />
            </li>
          ))}
        </ul>
      )}

      {/* Debajo de "Registros por revisar", invisible sin pendientes
          (requirement "La cola avisa qué negocios tienen reportes sin
          atender", scenario "sin reportes pendientes no hay sección"). */}
      {negociosReportados.length > 0 && (
        <SeccionNegociosReportados negocios={negociosReportados} />
      )}
    </section>
  );
}
