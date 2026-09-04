import { TarjetaNegocio } from "@/components/directorio/tarjeta-negocio";
import type { NegocioListado } from "@/lib/directorio";
import { construirEnlaceWhatsapp } from "@/lib/enlaces";
import { construirSegmentoFicha } from "@/lib/ficha-url";

/**
 * La lista de tarjetas del directorio, compartida por el listado por
 * categoría, las páginas de giro y las de giro+colonia (change
 * `agregar-seo-local`): "la misma tarjeta y el mismo orden" del requirement
 * no es una coincidencia de estilo, es el mismo componente.
 *
 * El orden lo decide la consulta (`src/lib/directorio.ts`), no este
 * componente. Server Component, sin JS.
 */
export function ListaNegocios({ negocios }: { negocios: NegocioListado[] }) {
  if (negocios.length === 0) return null;

  return (
    <ul className="flex flex-col gap-4">
      {negocios.map((negocio, indice) => (
        <li key={negocio.id}>
          <TarjetaNegocio
            nombre={negocio.nombre}
            coloniaNombre={negocio.coloniaNombre}
            // Los dos slugs del evento de medición (change
            // `agregar-analitica-cookieless`) salen del NEGOCIO, no de la
            // página: esta misma lista pinta el listado por categoría, el de
            // giro y el de giro+colonia, donde conviven categorías distintas.
            categoriaSlug={negocio.categoriaSlug}
            coloniaSlug={negocio.coloniaSlug}
            entregaADomicilio={negocio.entregaADomicilio}
            fotoClave={negocio.fotoClave}
            // Listado en una sola columna: la "primera fila" (spec
            // `directorio-publico`, "El peso de las fotos no rompe el
            // presupuesto de 4G") es la primera tarjeta; el resto carga
            // diferido. Vale igual para la categoría, el giro y giro+colonia,
            // porque las tres pintan esta misma lista.
            prioridad={indice === 0}
            hrefFicha={`/negocio/${construirSegmentoFicha(negocio.nombre, negocio.id)}`}
            hrefWhatsapp={construirEnlaceWhatsapp(negocio.whatsapp)}
          />
        </li>
      ))}
    </ul>
  );
}
