import Link from "next/link";

import { hrefListadoDeNegocios, type FiltroEstadoListado } from "@/lib/admin/listado-parametros";
import { TEXTO_VER_MAS_ANTIGUOS, TEXTO_VER_MAS_NUEVOS, textoPaginaDe } from "@/lib/admin/textos";

/**
 * Controles de paginación del listado (delta `revision-admin`, requirement
 * "El listado se corta en páginas..."): "Página X de Y" y los enlaces "Ver
 * más antiguos" (página siguiente, porque el orden es de recientes primero)
 * / "Ver más nuevos" (página anterior), cada uno visible solo cuando lleva a
 * algún lado, los dos conservando el filtro. Con una sola página el
 * componente no se pinta — lo decide quien lo usa (`page.tsx`), no este
 * componente, para que quede a la vista en el JSX de la pantalla que aquí no
 * hay nada que ocultar por accidente.
 *
 * `fueraDeRango` es el caso del scenario "página más allá de la última": el
 * admin pidió la página 99 de una lista que tiene 3. Ahí NO se está en
 * ninguna página, así que no se dice cuál —"Página 3 de 3" con la pantalla
 * sin renglones sería mentira— y lo único que se ofrece es "Ver más nuevos"
 * de regreso a la última página que sí tiene contenido. Ese enlace tiene que
 * salir aunque la lista sea de una sola página, que es la única razón por la
 * que este componente se pinta en ese caso.
 *
 * Server Component, sin JS: son enlaces normales.
 */
export function PaginacionListadoNegocios({
  filtroActivo,
  paginaActual,
  totalPaginas,
  fueraDeRango = false,
}: {
  filtroActivo: FiltroEstadoListado;
  paginaActual: number;
  totalPaginas: number;
  fueraDeRango?: boolean;
}) {
  const hayAnterior = fueraDeRango || paginaActual > 1;
  const haySiguiente = !fueraDeRango && paginaActual < totalPaginas;
  /** Fuera de rango, "más nuevos" es la última página con renglones. */
  const paginaAnterior = fueraDeRango ? totalPaginas : paginaActual - 1;

  return (
    <nav
      aria-label="Paginación del listado"
      className="flex flex-wrap items-center justify-between gap-3"
    >
      {!fueraDeRango && (
        <p className="text-sm font-semibold text-tinta">
          {textoPaginaDe(paginaActual, totalPaginas)}
        </p>
      )}
      <div className="flex gap-3">
        {hayAnterior && (
          <Link
            href={hrefListadoDeNegocios(filtroActivo, paginaAnterior)}
            className="inline-flex min-h-11 items-center rounded-full border border-borde px-3.5 py-1.5 text-sm font-semibold text-accion-fuerte"
          >
            {TEXTO_VER_MAS_NUEVOS}
          </Link>
        )}
        {haySiguiente && (
          <Link
            href={hrefListadoDeNegocios(filtroActivo, paginaActual + 1)}
            className="inline-flex min-h-11 items-center rounded-full border border-borde px-3.5 py-1.5 text-sm font-semibold text-accion-fuerte"
          >
            {TEXTO_VER_MAS_ANTIGUOS}
          </Link>
        )}
      </div>
    </nav>
  );
}
