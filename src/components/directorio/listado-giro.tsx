import Link from "next/link";

import { ListaNegocios } from "@/components/directorio/lista-negocios";
import { NavegacionColonias } from "@/components/directorio/navegacion-colonias";
import type {
  ColoniaCatalogo,
  GiroCatalogo,
  NegocioListado,
} from "@/lib/directorio";
import { CLASE_BOTON_PRIMARIO } from "@/lib/estilos-boton";
import { fraseDeGiro } from "@/lib/seo/frases-giro";
import { encabezadoGiro, encabezadoGiroColonia } from "@/lib/seo/titulos";

export type ListadoGiroProps = {
  giro: GiroCatalogo;
  /** Colonia de la URL, o `null` en la página del giro completo. */
  colonia: ColoniaCatalogo | null;
  negocios: NegocioListado[];
  /** Colonias con al menos un negocio publicado de este giro. */
  coloniasConNegocios: ColoniaCatalogo[];
};

/**
 * Página de giro (`/plomeria`) y de giro+colonia (`/plomeria-huicalco`), spec
 * `directorio-publico`, requirements "Página indexable por giro en la raíz,
 * generada del catálogo cerrado", "Página indexable por giro y colonia" y
 * "Las páginas de giro sin negocios publicados no se indexan ni se enlazan,
 * pero tampoco son 404".
 *
 * Es la misma pantalla con y sin colonia —mismas tarjetas, misma navegación—
 * porque para el vecino es el mismo listado más acotado; lo único que cambia
 * es el encabezado, el destino de la navegación y el texto de lo vacío.
 *
 * Sin negocios publicados NO responde 404 (el giro existe, la colonia existe:
 * simplemente todavía nadie se registró): muestra un estado vacío útil, y el
 * `noindex` lo declara la metadata de la página (design.md §3).
 */
export function ListadoGiro({
  giro,
  colonia,
  negocios,
  coloniasConNegocios,
}: ListadoGiroProps) {
  const frase = fraseDeGiro(giro);
  const encabezado = colonia
    ? encabezadoGiroColonia(frase, colonia.nombre)
    : encabezadoGiro(frase);

  return (
    <section className="flex flex-col gap-6 py-4">
      {/* Un solo nodo de texto (mismo motivo que el listado por categoría). */}
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{encabezado}</h1>

      <NavegacionColonias
        hrefTodas={`/${giro.slug}`}
        todasActiva={colonia === null}
        opciones={coloniasConNegocios.map((opcion) => ({
          nombre: opcion.nombre,
          // URL propia e indexable, nunca un parámetro de consulta (PRD §8).
          href: `/${giro.slug}-${opcion.slug}`,
          activa: colonia?.slug === opcion.slug,
        }))}
      />

      {negocios.length === 0 && (
        <div className="flex flex-col items-start gap-4 rounded-xl border border-borde bg-superficie p-6">
          <p className="text-tinta-suave">
            {colonia
              ? "Todavía no hay negocios publicados de esto en esta colonia."
              : "Todavía no hay negocios publicados de esto en Tizayuca."}
          </p>
          <Link href="/registro" className={CLASE_BOTON_PRIMARIO}>
            Registra tu negocio gratis
          </Link>
          {colonia && (
            <Link
              href={`/${giro.slug}`}
              className="inline-flex min-h-11 items-center text-base font-semibold text-accion-fuerte underline underline-offset-4"
            >
              Ver todas las colonias
            </Link>
          )}
        </div>
      )}

      <ListaNegocios negocios={negocios} />
    </section>
  );
}
