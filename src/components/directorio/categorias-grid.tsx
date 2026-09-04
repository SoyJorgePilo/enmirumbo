/**
 * Grilla de las 8 categorías como botones grandes (spec `directorio-publico`,
 * requirement "La home muestra las 8 categorías como botones grandes").
 *
 * Extraída de la home (change `agregar-buscador`) porque el estado "sin
 * resultados" y el de "consulta vacía" de `/buscar` DEBEN ofrecer "las 8
 * categorías del catálogo... iguales a las de la home" (requirements "Sin
 * resultados, la página ofrece las categorías como alternativa" y "Consulta
 * vacía y términos hostiles acotados, sin error"): un solo lugar con el
 * marcado evita que las dos pantallas se desincronicen.
 *
 * Sin encabezado propio: quien la monta decide su título (la home la titula
 * con su `h2` "Busca por categoría"; `/buscar` la ofrece bajo su propio texto).
 */
import Link from "next/link";

import type { CategoriaCatalogo } from "@/lib/directorio";

export type CategoriasGridProps = {
  categorias: CategoriaCatalogo[];
};

export function CategoriasGrid({ categorias }: CategoriasGridProps) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {categorias.map((categoria) => (
        <li key={categoria.slug}>
          <Link
            href={`/${categoria.slug}`}
            className="flex min-h-16 items-center justify-center rounded-xl border border-borde bg-superficie px-3 py-4 text-center text-sm font-semibold text-tinta transition-colors hover:bg-borde"
          >
            {categoria.nombre}
          </Link>
        </li>
      ))}
    </ul>
  );
}
