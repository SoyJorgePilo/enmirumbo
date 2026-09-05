import Link from "next/link";

import {
  FILTRO_TODOS,
  hrefListadoDeNegocios,
  type FiltroEstadoListado,
} from "@/lib/admin/listado-parametros";
import {
  TEXTO_FILTRAR_POR_ESTADO,
  TEXTO_FILTRO_EN_REVISION,
  TEXTO_FILTRO_PUBLICADOS,
  TEXTO_FILTRO_RECHAZADOS,
  TEXTO_FILTRO_TODOS,
} from "@/lib/admin/textos";
import { ESTADO_NEGOCIO_DEFAULT, ESTADO_NEGOCIO_PUBLICADO, ESTADO_NEGOCIO_RECHAZADO } from "@/lib/negocio";

const OPCIONES: ReadonlyArray<{ valor: FiltroEstadoListado; texto: string }> = [
  { valor: FILTRO_TODOS, texto: TEXTO_FILTRO_TODOS },
  { valor: ESTADO_NEGOCIO_DEFAULT, texto: TEXTO_FILTRO_EN_REVISION },
  { valor: ESTADO_NEGOCIO_PUBLICADO, texto: TEXTO_FILTRO_PUBLICADOS },
  { valor: ESTADO_NEGOCIO_RECHAZADO, texto: TEXTO_FILTRO_RECHAZADOS },
];

/**
 * Tira de filtros del listado (delta `revision-admin`, requirement "El
 * listado se filtra por estado sin salir de la vista"): cuatro enlaces que
 * solo cambian el querystring, siempre a la página 1 (cambiar de filtro
 * DEBE volver al principio). El activo se señala con `aria-current="true"`
 * más un subrayado grueso y negritas — nunca solo con color (requirement:
 * "señalado de forma legible, no solo por color").
 *
 * Server Component, sin JS: son `<a>` normales por debajo de `next/link`.
 */
export function FiltrosListadoNegocios({
  filtroActivo,
}: {
  filtroActivo: FiltroEstadoListado;
}) {
  return (
    <nav aria-label={TEXTO_FILTRAR_POR_ESTADO} className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-tinta">{TEXTO_FILTRAR_POR_ESTADO}</p>
      <ul className="flex flex-wrap gap-2">
        {OPCIONES.map(({ valor, texto }) => {
          const activo = valor === filtroActivo;
          return (
            <li key={valor}>
              <Link
                href={hrefListadoDeNegocios(valor, 1)}
                aria-current={activo ? "true" : undefined}
                className={
                  activo
                    ? "inline-flex min-h-11 items-center rounded-full border-2 border-tinta px-3.5 py-1.5 text-sm font-bold text-tinta underline underline-offset-4"
                    : "inline-flex min-h-11 items-center rounded-full border border-borde px-3.5 py-1.5 text-sm font-semibold text-tinta-suave"
                }
              >
                {texto}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
