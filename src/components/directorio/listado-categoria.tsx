import Link from "next/link";

import { ListaNegocios } from "@/components/directorio/lista-negocios";
import { NavegacionColonias } from "@/components/directorio/navegacion-colonias";
import type {
  CategoriaCatalogo,
  ColoniaCatalogo,
  NegocioListado,
} from "@/lib/directorio";
import { CLASE_BOTON_PRIMARIO } from "@/lib/estilos-boton";
import { encabezadoCategoria } from "@/lib/seo/titulos";

export type ListadoCategoriaProps = {
  categoria: CategoriaCatalogo;
  /** Slug de la colonia aplicada, o `undefined` sin filtro. */
  coloniaFiltro?: string;
  negocios: NegocioListado[];
  coloniasConNegocios: ColoniaCatalogo[];
};

/**
 * Listado por categoría (spec `directorio-publico`, requirement "Listado por
 * categoría en URL limpia con el slug del catálogo").
 *
 * Salió de `src/app/[categoria]/page.tsx` a un componente cuando la raíz pasó
 * a resolver tres tipos de URL (change `agregar-seo-local`, design.md §1): la
 * página decide QUÉ es cada URL y consulta la base; esto solo pinta. El
 * marcado y los literales son los mismos de antes: ninguna URL de categoría
 * publicada cambia de aspecto.
 */
export function ListadoCategoria({
  categoria,
  coloniaFiltro,
  negocios,
  coloniasConNegocios,
}: ListadoCategoriaProps) {
  return (
    <section className="flex flex-col gap-6 py-4">
      {/* Un solo nodo de texto: interpolar el nombre por separado mete un
          comentario de React en medio del encabezado servido. */}
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        {encabezadoCategoria(categoria.nombre)}
      </h1>

      <NavegacionColonias
        hrefTodas={`/${categoria.slug}`}
        todasActiva={!coloniaFiltro}
        opciones={coloniasConNegocios.map((colonia) => ({
          nombre: colonia.nombre,
          href: `/${categoria.slug}?colonia=${colonia.slug}`,
          activa: coloniaFiltro === colonia.slug,
        }))}
      />

      {negocios.length === 0 && !coloniaFiltro && (
        <div className="flex flex-col items-start gap-4 rounded-xl border border-borde bg-superficie p-6">
          <p className="text-tinta-suave">
            Todavía no hay negocios publicados en esta categoría.
          </p>
          <Link href="/registro" className={CLASE_BOTON_PRIMARIO}>
            Registra tu negocio gratis
          </Link>
        </div>
      )}

      {negocios.length === 0 && coloniaFiltro && (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-borde bg-superficie p-6">
          <p className="text-tinta-suave">
            No encontramos negocios de esta categoría en esa colonia.
          </p>
          <Link
            href={`/${categoria.slug}`}
            className="inline-flex min-h-11 items-center text-base font-semibold text-accion-fuerte underline underline-offset-4"
          >
            Ver todas las colonias
          </Link>
        </div>
      )}

      <ListaNegocios negocios={negocios} />
    </section>
  );
}
