import Link from "next/link";
import { notFound } from "next/navigation";

import { TarjetaNegocio } from "@/components/directorio/tarjeta-negocio";
import {
  obtenerCategoriaPorSlug,
  obtenerColoniaPorSlug,
  obtenerColoniasConNegociosPublicados,
  obtenerNegociosPublicados,
} from "@/lib/directorio";
import { construirEnlaceWhatsapp } from "@/lib/enlaces";
import { CLASE_BOTON_PRIMARIO } from "@/lib/estilos-boton";
import { construirSegmentoFicha } from "@/lib/ficha-url";

/**
 * Listado por categoría (spec directorio-publico, requirement "Listado por
 * categoría en URL limpia con el slug del catálogo").
 *
 * La ruta es dinámica y vive en la raíz (design.md §1): solo responde si el
 * slug está en el catálogo de categorías; cualquier otra cosa es 404, sin
 * sugerir parecidos. Las rutas propias del sitio le ganan al segmento
 * dinámico y además están reservadas en `src/lib/rutas-reservadas.ts`.
 *
 * Lee la base en cada request (`force-dynamic`): el contenido depende de lo
 * que el admin publique y en CI no hay base al construir.
 */
export const dynamic = "force-dynamic";

function claseFiltro(activo: boolean): string {
  const base =
    "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold transition-colors";
  return activo
    ? `${base} border-accion-fuerte bg-superficie text-tinta`
    : `${base} border-borde text-tinta-suave hover:bg-superficie`;
}

export default async function ListadoCategoriaPage({
  params,
  searchParams,
}: PageProps<"/[categoria]">) {
  const { categoria: categoriaSlug } = await params;
  const { colonia: coloniaParam } = await searchParams;

  const categoria = await obtenerCategoriaPorSlug(categoriaSlug);
  if (!categoria) notFound();

  // "Colonia desconocida en la URL" (scenario): un slug que no está en el
  // catálogo de colonias se ignora, sin 404 y sin romper la página.
  const coloniaParamTexto =
    typeof coloniaParam === "string" ? coloniaParam : undefined;
  const coloniaDelCatalogo = coloniaParamTexto
    ? await obtenerColoniaPorSlug(coloniaParamTexto)
    : null;
  const coloniaFiltro = coloniaDelCatalogo?.slug;

  const [negocios, coloniasConNegocios] = await Promise.all([
    obtenerNegociosPublicados(categoria.slug, coloniaFiltro),
    obtenerColoniasConNegociosPublicados(categoria.slug),
  ]);

  return (
    <section className="flex flex-col gap-6 py-4">
      {/* Un solo nodo de texto: interpolar el nombre por separado mete un
          comentario de React en medio del encabezado servido. */}
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        {`${categoria.nombre} en Tizayuca`}
      </h1>

      {coloniasConNegocios.length > 0 && (
        <nav aria-label="Filtrar por colonia" className="flex flex-wrap gap-2">
          <Link
            href={`/${categoria.slug}`}
            aria-current={!coloniaFiltro ? "true" : undefined}
            className={claseFiltro(!coloniaFiltro)}
          >
            Todas las colonias
          </Link>
          {coloniasConNegocios.map((colonia) => (
            <Link
              key={colonia.slug}
              href={`/${categoria.slug}?colonia=${colonia.slug}`}
              aria-current={coloniaFiltro === colonia.slug ? "true" : undefined}
              className={claseFiltro(coloniaFiltro === colonia.slug)}
            >
              {colonia.nombre}
            </Link>
          ))}
        </nav>
      )}

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

      {negocios.length > 0 && (
        <ul className="flex flex-col gap-4">
          {negocios.map((negocio) => (
            <li key={negocio.id}>
              <TarjetaNegocio
                nombre={negocio.nombre}
                coloniaNombre={negocio.coloniaNombre}
                categoriaSlug={negocio.categoriaSlug}
                coloniaSlug={negocio.coloniaSlug}
                entregaADomicilio={negocio.entregaADomicilio}
                fotoUrl={negocio.fotoUrl}
                hrefFicha={`/negocio/${construirSegmentoFicha(negocio.nombre, negocio.id)}`}
                hrefWhatsapp={construirEnlaceWhatsapp(negocio.whatsapp)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
