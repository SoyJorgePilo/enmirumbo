import Link from "next/link";

import { BOTON_BORRAR_DEFINITIVAMENTE } from "@/lib/admin/textos";
import { CLASE_BOTON_SECUNDARIO } from "@/lib/estilos-boton";

export type ControlBorrarProps = {
  id: string;
};

/**
 * Control "Borrar definitivamente" del detalle (spec
 * `agregar-despublicar-y-borrado-arco`, requirement "El borrado definitivo
 * se confirma en dos pasos..."): un enlace de NAVEGACIÓN (GET) a la pantalla
 * de confirmación propia, nunca un botón que borre directo — "ese primer
 * paso NO DEBE borrar nada". Disponible en cualquier estado del registro
 * (requirement "El detalle ofrece las acciones que corresponden al
 * estado...").
 *
 * Se distingue visualmente de las demás acciones como lo que es —la
 * irreversible— sin introducir un color nuevo a la paleta (globals.css: "un
 * solo verde de acción, neutrales para todo lo demás"): un borde `tinta`
 * más fuerte que el resto de las tarjetas del panel y un aviso de texto
 * (⚠, decorativo) en vez de depender del color, mismo criterio que
 * `indicador-atrasado.tsx`. Server Component, sin JS.
 */
export function ControlBorrar({ id }: ControlBorrarProps) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border-2 border-tinta p-4">
      <p className="text-sm font-semibold text-tinta">
        <span aria-hidden="true">⚠ </span>
        Acción irreversible
      </p>
      <Link
        href={`/admin/registros/${id}/borrar`}
        className={`${CLASE_BOTON_SECUNDARIO} w-full`}
      >
        {BOTON_BORRAR_DEFINITIVAMENTE}
      </Link>
    </section>
  );
}
