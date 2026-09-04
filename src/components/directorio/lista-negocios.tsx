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
      {negocios.map((negocio) => (
        <li key={negocio.id}>
          <TarjetaNegocio
            nombre={negocio.nombre}
            coloniaNombre={negocio.coloniaNombre}
            entregaADomicilio={negocio.entregaADomicilio}
            fotoUrl={negocio.fotoUrl}
            hrefFicha={`/negocio/${construirSegmentoFicha(negocio.nombre, negocio.id)}`}
            hrefWhatsapp={construirEnlaceWhatsapp(negocio.whatsapp)}
          />
        </li>
      ))}
    </ul>
  );
}
