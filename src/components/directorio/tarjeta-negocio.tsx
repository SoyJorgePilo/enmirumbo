import Link from "next/link";

import { EtiquetaADomicilio } from "@/components/directorio/etiqueta-domicilio";
import { MarcadorFoto } from "@/components/directorio/marcador-foto";
import { EVENTO_WHATSAPP_TARJETA, atributosDeEvento } from "@/lib/analitica/eventos";
import { CLASE_BOTON_PRIMARIO } from "@/lib/estilos-boton";

export type TarjetaNegocioProps = {
  nombre: string;
  /** `null` solo si el negocio no tiene colonia ni texto libre guardado. */
  coloniaNombre: string | null;
  /**
   * Slug de la categoría DEL NEGOCIO, para el evento de medición. En `/buscar`
   * conviven categorías distintas, así que no puede salir de la página.
   */
  categoriaSlug: string;
  /** Slug de la colonia del catálogo; `null` si capturó "Otra" (→ `otra`). */
  coloniaSlug: string | null;
  entregaADomicilio: boolean;
  /**
   * Lo guardado en `Negocio.fotoClave`, tal cual: `MarcadorFoto` lo pasa por
   * el validador de render antes de pintarlo (M1 de T-004).
   */
  fotoClave?: string | null;
  /**
   * Solo en `true` para la primera tarjeta visible del listado (spec
   * `directorio-publico`, "El peso de las fotos no rompe el presupuesto de
   * 4G": el resto carga diferido). Por defecto `false`.
   */
  prioridad?: boolean;
  /** Href ya armado hacia la ficha (`/negocio/<slug>-<id>`). */
  hrefFicha: string;
  /**
   * Href ya armado hacia `wa.me` (con el mensaje prellenado codificado), o
   * `null` si el número guardado no se pudo interpretar (fila sembrada a
   * mano con formato raro): mejor sin botón que con un enlace roto.
   */
  hrefWhatsapp: string | null;
};

/**
 * Tarjeta del listado por categoría (spec directorio-publico, requirement
 * "La tarjeta del listado trae lo esencial y el WhatsApp sin clics extra"):
 * foto/marcador, nombre, colonia, etiqueta "A domicilio" si aplica, y un
 * botón verde de WhatsApp que sale directo sin pasar por la ficha.
 *
 * El resto de la tarjeta lleva a la ficha con el patrón "stretched link": el
 * nombre es un `<Link>` con `after:absolute after:inset-0` que cubre toda la
 * tarjeta, y el botón de WhatsApp queda por encima (`z-10`) para seguir
 * siendo un enlace independiente sin anidar un `<a>` dentro de otro `<a>`.
 * Server Component, sin JS.
 */
export function TarjetaNegocio({
  nombre,
  coloniaNombre,
  categoriaSlug,
  coloniaSlug,
  entregaADomicilio,
  fotoClave,
  prioridad = false,
  hrefFicha,
  hrefWhatsapp,
}: TarjetaNegocioProps) {
  return (
    <article className="relative flex gap-4 rounded-xl border border-borde bg-fondo p-4">
      {/* `self-start`: sin él, el `align-items: stretch` del `<article>` flex
          estira este contenedor a lo alto de la columna de texto y el
          "cuadrado" de la foto deja de serlo (a 390px, con el nombre en dos
          renglones, medía 80×165). Con `self-start` el hueco conserva su
          proporción, que es justamente lo que reserva el espacio y evita el
          salto de maquetación. */}
      <div className="relative aspect-square w-20 shrink-0 self-start overflow-hidden rounded-lg">
        <MarcadorFoto
          fotoClave={fotoClave}
          categoriaSlug={categoriaSlug}
          variante="tarjeta"
          alt={`Foto de ${nombre}`}
          prioridad={prioridad}
        />
      </div>

      {/* `min-w-0`: un hijo flex no baja de su ancho mínimo de contenido salvo
          que se le diga; sin esto, un nombre larguísimo de una sola palabra
          empujaba la tarjeta más allá de la pantalla. */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {/* `break-words`: el nombre y la colonia los escribe el negocio y
            pueden traer una palabra larguísima; a 390px no puede sacar la
            tarjeta de la pantalla. */}
        <h3 className="font-semibold break-words text-tinta">
          <Link href={hrefFicha} className="after:absolute after:inset-0">
            {nombre}
          </Link>
        </h3>
        {coloniaNombre && (
          <p className="text-sm break-words text-tinta-suave">{coloniaNombre}</p>
        )}
        {entregaADomicilio && <EtiquetaADomicilio />}
        {hrefWhatsapp && (
          <a
            href={hrefWhatsapp}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Enviar WhatsApp a ${nombre}`}
            className={`${CLASE_BOTON_PRIMARIO} relative z-10 mt-1 w-fit px-4 py-2 text-sm`}
            // Marcado inerte: sin el script del proveedor no hace nada, y con
            // él manda solo los dos slugs (`src/lib/analitica/eventos.ts`).
            {...atributosDeEvento(EVENTO_WHATSAPP_TARJETA, {
              categoriaSlug,
              coloniaSlug,
            })}
          >
            WhatsApp
          </a>
        )}
      </div>
    </article>
  );
}
