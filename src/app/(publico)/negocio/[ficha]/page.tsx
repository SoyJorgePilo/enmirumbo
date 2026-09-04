import { notFound } from "next/navigation";

import { BotonesContacto } from "@/components/directorio/botones-contacto";
import { EtiquetaADomicilio } from "@/components/directorio/etiqueta-domicilio";
import { MarcadorFoto } from "@/components/directorio/marcador-foto";
import { SelloVerificado } from "@/components/directorio/sello-verificado";
import { obtenerNegocioPublicado } from "@/lib/directorio";
import {
  construirEnlaceComoLlegar,
  construirEnlaceTelefono,
  construirEnlaceWhatsapp,
  obtenerPaginaRegistrada,
} from "@/lib/enlaces";
import { extraerIdDeSegmentoFicha } from "@/lib/ficha-url";

/**
 * Ficha de negocio en `/negocio/<slug>-<id>` (spec directorio-publico,
 * requirements "Ficha de negocio..." y "Botones de contacto...").
 *
 * El identificador es lo que sigue al ÚLTIMO guion del segmento (design.md
 * §2): la parte legible es decorativa, así que un enlace viejo con el nombre
 * anterior del negocio sigue abriendo la ficha.
 *
 * `obtenerNegocioPublicado` devuelve `null` tanto si el negocio no existe
 * como si no está publicado, así que ambos casos responden exactamente el
 * mismo 404: nada delata que hay una ficha en revisión.
 */
export const dynamic = "force-dynamic";

export default async function FichaNegocioPage({
  params,
}: PageProps<"/negocio/[ficha]">) {
  const { ficha } = await params;
  const id = extraerIdDeSegmentoFicha(ficha);
  const negocio = id ? await obtenerNegocioPublicado(id) : null;

  if (!negocio) notFound();

  const hrefComoLlegar = construirEnlaceComoLlegar(
    negocio.direccion,
    negocio.coloniaNombre,
  );
  const hrefLlamar = construirEnlaceTelefono(negocio.telefonoFijo);
  const pagina = obtenerPaginaRegistrada(negocio.facebookUrl);
  // Registró algo en "teléfono fijo", pero no es un número marcable
  // (hallazgo M2): se muestra tal cual lo escribió, sin botón "Llamar".
  const telefonoNoMarcable = negocio.telefonoFijo && !hrefLlamar
    ? negocio.telefonoFijo
    : null;

  return (
    <article className="flex flex-col gap-6 py-4">
      <div className="relative aspect-video w-full overflow-hidden rounded-xl">
        <MarcadorFoto fotoUrl={negocio.fotoUrl} />
      </div>

      <div className="flex flex-col gap-2">
        {/* `break-words` en todo lo que escribe el negocio: a 390px una
            palabra larguísima no puede provocar scroll horizontal. */}
        <h1 className="text-2xl font-bold break-words tracking-tight sm:text-3xl">
          {negocio.nombre}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <SelloVerificado />
          {negocio.entregaADomicilio && <EtiquetaADomicilio />}
        </div>
        {negocio.coloniaNombre && (
          <p className="break-words text-tinta-suave">{negocio.coloniaNombre}</p>
        )}
      </div>

      {negocio.queOfreces && (
        <p className="break-words text-tinta">{negocio.queOfreces}</p>
      )}

      {negocio.direccion && (
        <p className="break-words text-tinta-suave">{negocio.direccion}</p>
      )}

      {negocio.horario && (
        <p className="break-words text-tinta-suave">
          <span className="font-semibold text-tinta">Horario: </span>
          {negocio.horario}
        </p>
      )}

      {telefonoNoMarcable && (
        <p className="break-words text-tinta-suave">
          <span className="font-semibold text-tinta">Teléfono: </span>
          {telefonoNoMarcable}
        </p>
      )}

      <BotonesContacto
        nombre={negocio.nombre}
        categoriaSlug={negocio.categoriaSlug}
        coloniaSlug={negocio.coloniaSlug}
        hrefWhatsapp={construirEnlaceWhatsapp(negocio.whatsapp)}
        hrefLlamar={hrefLlamar}
        hrefComoLlegar={hrefComoLlegar}
        pagina={pagina}
      />
    </article>
  );
}
