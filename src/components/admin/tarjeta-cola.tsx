import Link from "next/link";

import { IndicadorAtrasado } from "@/components/admin/indicador-atrasado";
import { TEXTO_REVISAR } from "@/lib/admin/textos";
import type { RegistroColaItem } from "@/lib/admin/consultas";

/**
 * Renglón de la cola (requirement "Cola de revisión..."): nombre, colonia,
 * desde cuándo espera, el indicador de 48 horas si aplica, y la entrada al
 * detalle. Una sola acción por renglón ("Revisar"), así que todo el
 * `<article>` es el enlace (patrón "stretched link" de `tarjeta-negocio`),
 * lo que además hace el área táctil más grande que el mínimo de 44px.
 * Server Component, sin JS.
 */
export function TarjetaCola({
  id,
  nombre,
  coloniaTexto,
  esperaTexto,
  atrasado,
}: RegistroColaItem) {
  return (
    <article className="relative flex min-h-11 flex-col gap-1.5 rounded-xl border border-borde bg-fondo p-4">
      <h2 className="font-semibold break-words text-tinta">
        <Link
          href={`/admin/registros/${id}`}
          className="after:absolute after:inset-0"
        >
          {nombre}
        </Link>
      </h2>
      <p className="break-words text-sm text-tinta-suave">{coloniaTexto}</p>
      <p className="text-sm text-tinta-suave">{esperaTexto}</p>
      {atrasado && <IndicadorAtrasado />}
      <span aria-hidden="true" className="text-sm font-semibold text-accion-fuerte">
        {TEXTO_REVISAR} →
      </span>
    </article>
  );
}
