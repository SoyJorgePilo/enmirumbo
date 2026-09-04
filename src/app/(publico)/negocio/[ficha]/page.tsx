import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BotonesContacto } from "@/components/directorio/botones-contacto";
import { EtiquetaADomicilio } from "@/components/directorio/etiqueta-domicilio";
import { MarcadorFoto } from "@/components/directorio/marcador-foto";
import { SelloVerificado } from "@/components/directorio/sello-verificado";
import {
  obtenerGirosDeNegocioPublicado,
  obtenerNegocioPublicado,
} from "@/lib/directorio";
import {
  datosEstructuradosDeFicha,
  serializarJsonLd,
} from "@/lib/seo/datos-estructurados";
import { fraseDeGiro } from "@/lib/seo/frases-giro";
import {
  NOMBRE_DEL_SITIO,
  canonicaDe,
  imagenesDeLaFicha,
} from "@/lib/seo/metadata";
import { descripcionFicha, tituloFicha } from "@/lib/seo/titulos";
import { urlAbsoluta } from "@/lib/sitio";
import {
  construirEnlaceComoLlegar,
  construirEnlaceTelefono,
  construirEnlaceWhatsapp,
  obtenerPaginaRegistrada,
} from "@/lib/enlaces";
import {
  construirSegmentoFicha,
  extraerIdDeSegmentoFicha,
} from "@/lib/ficha-url";
import { urlDeFoto } from "@/lib/fotos/url";

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

/**
 * Título, descripción, canónica y vista previa al compartir (spec
 * `directorio-publico`, requirements "Título y descripción propios…" y "La
 * ficha se ve bien al compartirla por WhatsApp o Facebook").
 *
 * La descripción es lo que el negocio escribió en "¿Qué ofreces?" (recortado)
 * o la frase de respaldo con su nombre y su colonia; nunca su WhatsApp ni su
 * teléfono. La imagen es su foto y, si no tiene, la imagen de marca del sitio:
 * ninguna ficha se comparte sin imagen (PRD §9).
 */
export async function generateMetadata({
  params,
}: PageProps<"/negocio/[ficha]">): Promise<Metadata> {
  const { ficha } = await params;
  const id = extraerIdDeSegmentoFicha(ficha);
  const negocio = id ? await obtenerNegocioPublicado(id) : null;
  // Lo que no existe (o no está publicado) no declara nada: la página
  // responde el mismo 404 en los dos casos.
  if (!negocio) return {};

  // La canónica es SIEMPRE el segmento con el nombre actual: la parte legible
  // es decorativa y un enlace viejo (con el nombre anterior) sigue abriendo
  // la ficha, pero no puede indexarse como una segunda URL.
  const ruta = `/negocio/${construirSegmentoFicha(negocio.nombre, negocio.id)}`;
  const titulo = tituloFicha(negocio.nombre, negocio.coloniaNombre);
  const descripcion = descripcionFicha(negocio);
  const url = urlAbsoluta(ruta);

  return {
    title: titulo,
    description: descripcion,
    alternates: canonicaDe(ruta),
    openGraph: {
      type: "article",
      title: titulo,
      description: descripcion,
      siteName: NOMBRE_DEL_SITIO,
      locale: "es_MX",
      ...(url ? { url } : {}),
      // La vista previa se arma con la referencia interna de la foto, no con
      // una dirección guardada: `imagenesDeLaFicha` la pasa por `urlDeFoto`,
      // así que a `og:image` solo puede llegar una URL de este sitio (cierre
      // del hallazgo M3 de T-009).
      images: imagenesDeLaFicha(negocio.fotoClave),
    },
  };
}

export default async function FichaNegocioPage({
  params,
}: PageProps<"/negocio/[ficha]">) {
  const { ficha } = await params;
  const id = extraerIdDeSegmentoFicha(ficha);
  const negocio = id ? await obtenerNegocioPublicado(id) : null;

  if (!negocio) notFound();

  // Giros que el admin le asignó al aprobar: son los que hacen alcanzables (y
  // rastreables) las páginas de giro sin depender solo del sitemap.
  const giros = await obtenerGirosDeNegocioPublicado(negocio.id);

  const hrefComoLlegar = construirEnlaceComoLlegar(
    negocio.direccion,
    negocio.coloniaNombre,
  );
  const hrefLlamar = construirEnlaceTelefono(negocio.telefonoFijo);
  const pagina = obtenerPaginaRegistrada(negocio.facebookUrl);
  // "Tiene foto" = lo guardado es una clave que generó el servidor. Una
  // referencia hostil escrita a mano se trata como "no tiene" (M1 de T-004).
  const tieneFoto = urlDeFoto(negocio.fotoClave, "ficha") !== null;
  // Registró algo en "teléfono fijo", pero no es un número marcable
  // (hallazgo M2): se muestra tal cual lo escribió, sin botón "Llamar".
  const telefonoNoMarcable = negocio.telefonoFijo && !hrefLlamar
    ? negocio.telefonoFijo
    : null;

  // Datos estructurados de la ficha (design.md §6). Se renderizan como un
  // `<script type="application/ld+json">` del propio Server Component, que es
  // lo que recomienda la guía de Next: es un bloque de DATOS, no código
  // ejecutable, así que no cuenta como JavaScript de cliente.
  const jsonLd = serializarJsonLd(
    datosEstructuradosDeFicha(
      negocio,
      giros,
      `/negocio/${construirSegmentoFicha(negocio.nombre, negocio.id)}`,
    ),
  );

  return (
    <article className="flex flex-col gap-6 py-4">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />

      {/* Sin foto, la ficha no muestra hueco ni marco vacío ni texto que
          hable de una imagen inexistente (spec `directorio-publico`,
          requirement "La ficha muestra la foto del negocio cuando la tiene",
          scenario "ficha sin foto"): simplemente no hay bloque, igual que con
          el resto de los campos opcionales. Eso la distingue de la tarjeta
          del listado, donde el marcador SÍ se pinta para que todas ocupen lo
          mismo. */}
      {tieneFoto && (
        <div className="relative aspect-video w-full overflow-hidden rounded-xl">
          <MarcadorFoto
            fotoClave={negocio.fotoClave}
            variante="ficha"
            alt={`Foto de ${negocio.nombre}`}
            prioridad
          />
        </div>
      )}

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

      {/* Giros asignados: cada uno lleva a su página de giro, que por
          construcción tiene al menos a este negocio (nunca a una de las
          páginas vacías no indexables). Sin giros no se pinta nada: ninguna
          sección vacía, igual que el resto de los campos que el negocio no
          llenó. */}
      {giros.length > 0 && (
        <nav aria-label="Lo que hace este negocio" className="flex flex-wrap gap-2">
          {giros.map((giro) => (
            <Link
              key={giro.slug}
              href={`/${giro.slug}`}
              className="inline-flex min-h-11 items-center rounded-full border border-borde px-4 text-sm font-semibold text-tinta-suave transition-colors hover:bg-superficie"
            >
              {fraseDeGiro(giro)}
            </Link>
          ))}
        </nav>
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
