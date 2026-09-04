import {
  EVENTO_COMO_LLEGAR,
  EVENTO_LLAMAR,
  EVENTO_WHATSAPP_FICHA,
  atributosDeEvento,
} from "@/lib/analitica/eventos";
import { CLASE_BOTON_PRIMARIO, CLASE_BOTON_SECUNDARIO } from "@/lib/estilos-boton";

export type PaginaRegistrada = {
  /** URL completa registrada por el negocio (no necesariamente Facebook). */
  href: string;
  /** Dominio visible, sin `www.` (hallazgo M4 de T-003: nunca decir "Facebook"). */
  dominio: string;
};

export type BotonesContactoProps = {
  nombre: string;
  /** Slug de la categoría del negocio, para el evento de medición. */
  categoriaSlug: string;
  /** Slug de la colonia del catálogo; `null` si capturó "Otra" (→ `otra`). */
  coloniaSlug: string | null;
  /**
   * Href ya armado hacia `wa.me` (con el mensaje prellenado codificado), o
   * `null` si el número guardado no se pudo interpretar (fila sembrada a
   * mano con formato raro): mejor sin botón que con un enlace roto.
   */
  hrefWhatsapp: string | null;
  /**
   * Href `tel:` ya armado y normalizado, o `null`/`undefined` si el negocio
   * no registró teléfono fijo o lo que registró no es un número marcable
   * (hallazgo M2): en ese caso la ficha muestra el texto capturado, pero sin
   * botón "Llamar".
   */
  hrefLlamar?: string | null;
  /** Href ya armado hacia Google Maps, o `null` si no capturó dirección/referencias. */
  hrefComoLlegar?: string | null;
  /** `null`/`undefined` si no registró página o la URL no se pudo interpretar. */
  pagina?: PaginaRegistrada | null;
};

/**
 * Botones de contacto de la ficha (spec directorio-publico, requirement
 * "Botones de contacto de la ficha con el WhatsApp como acción principal"):
 * "Enviar WhatsApp" siempre, como única acción principal en verde; "Llamar",
 * "Cómo llegar" y el enlace a la página registrada solo si el negocio
 * capturó ese dato, todos con el estilo secundario (neutro) para que nada
 * compita en jerarquía visual con el verde. Server Component, sin JS.
 *
 * `tel:` no abre pestaña nueva (el celular cambia de app) y por eso no lleva
 * `target` ni `rel`; los demás externos sí, con `rel="noopener noreferrer"`.
 *
 * Los eventos de medición son atributos de marcado, sin JavaScript propio.
 * Van en el propio enlace en los botones que abren pestaña nueva, y en una
 * envoltura en "Llamar" — la razón, medida, está junto a ese botón.
 */
export function BotonesContacto({
  nombre,
  categoriaSlug,
  coloniaSlug,
  hrefWhatsapp,
  hrefLlamar,
  hrefComoLlegar,
  pagina,
}: BotonesContactoProps) {
  const hayBotonesSecundarios = Boolean(hrefLlamar || hrefComoLlegar || pagina);
  // Los tres eventos de la ficha llevan los MISMOS dos slugs; el enlace a la
  // página que registró el negocio no se mide (PRD §9 no lo lista).
  const slugs = { categoriaSlug, coloniaSlug };

  return (
    <div className="flex flex-col gap-3">
      {hrefWhatsapp && (
        <a
          href={hrefWhatsapp}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Enviar WhatsApp a ${nombre}`}
          className={`${CLASE_BOTON_PRIMARIO} w-full text-lg`}
          {...atributosDeEvento(EVENTO_WHATSAPP_FICHA, slugs)}
        >
          Enviar WhatsApp
        </a>
      )}

      {hayBotonesSecundarios && (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {hrefLlamar && (
            // El evento de "Llamar" va en una ENVOLTURA, no en el enlace
            // (hallazgo M-4 de la etapa C). El tracker del proveedor, cuando
            // el elemento que lleva el evento es un `<a>` con `href` que NO
            // abre pestaña nueva, cancela el clic, manda el evento y recién
            // entonces navega: medido con el tracker real y un proveedor
            // falso, la llamada se retrasó 3.0 s con 3 s de latencia — en 4G
            // malo, un botón que "no hace nada" justo en la acción más
            // urgente de la ficha. Con el evento en un elemento que no es
            // enlace, el tracker manda exactamente el mismo evento (`llamar`
            // con sus dos slugs, verificado en el envío capturado) y no toca
            // la navegación: el clic marca de inmediato. `contents` hace que
            // la envoltura no exista para el diseño, así que el botón sigue
            // siendo un hijo directo de la fila de botones.
            <span className="contents" {...atributosDeEvento(EVENTO_LLAMAR, slugs)}>
              <a href={hrefLlamar} className={CLASE_BOTON_SECUNDARIO}>
                Llamar
              </a>
            </span>
          )}
          {hrefComoLlegar && (
            <a
              href={hrefComoLlegar}
              target="_blank"
              rel="noopener noreferrer"
              className={CLASE_BOTON_SECUNDARIO}
              {...atributosDeEvento(EVENTO_COMO_LLEGAR, slugs)}
            >
              Cómo llegar
            </a>
          )}
          {pagina && (
            <a
              href={pagina.href}
              target="_blank"
              rel="noopener noreferrer"
              // El dominio lo escribió el negocio: `break-all` evita que uno
              // larguísimo saque el botón de la pantalla a 390px.
              className={`${CLASE_BOTON_SECUNDARIO} max-w-full break-all`}
            >
              {`Ver su página (${pagina.dominio})`}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
