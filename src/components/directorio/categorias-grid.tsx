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
import { iconoDeCategoria } from "@/lib/ui/iconos-categorias";

export type CategoriasGridProps = {
  categorias: CategoriaCatalogo[];
};

export function CategoriasGrid({ categorias }: CategoriasGridProps) {
  return (
    /*
     * Colapso 1 → 2 → 3 (enmienda aprobada por el fundador, revisión visual
     * lote 2): dos columnas eran el PISO, así que en un celular angosto
     * ("Clubes y escuelas deportivas" en 140px) el nombre se partía en tres
     * renglones. Ahora arranca en una sola columna, pasa a dos en cuanto el
     * viewport da 352px y llega a tres de `sm` para arriba.
     */
    <ul className="grid grid-cols-1 gap-3 min-[22rem]:grid-cols-2 sm:grid-cols-3">
      {categorias.map((categoria) => (
        <li key={categoria.slug}>
          <Link
            href={`/${categoria.slug}`}
            className="flex h-full min-h-16 flex-col items-center justify-center gap-1 rounded-xl border border-borde bg-superficie px-3 py-4 text-center text-sm font-semibold text-tinta transition-colors hover:bg-borde"
          >
            <span aria-hidden="true" className="text-2xl leading-none">
              {iconoDeCategoria(categoria.slug)}
            </span>
            {categoria.nombre}
          </Link>
        </li>
      ))}
    </ul>
  );
}
