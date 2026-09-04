import { CLASE_BOTON_PRIMARIO, CLASE_BOTON_SECUNDARIO } from "@/lib/estilos-boton";

export type PaginaRegistrada = {
  /** URL completa registrada por el negocio (no necesariamente Facebook). */
  href: string;
  /** Dominio visible, sin `www.` (hallazgo M4 de T-003: nunca decir "Facebook"). */
  dominio: string;
};

export type BotonesContactoProps = {
  nombre: string;
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
 */
export function BotonesContacto({
  nombre,
  hrefWhatsapp,
  hrefLlamar,
  hrefComoLlegar,
  pagina,
}: BotonesContactoProps) {
  const hayBotonesSecundarios = Boolean(hrefLlamar || hrefComoLlegar || pagina);

  return (
    <div className="flex flex-col gap-3">
      {hrefWhatsapp && (
        <a
          href={hrefWhatsapp}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Enviar WhatsApp a ${nombre}`}
          className={`${CLASE_BOTON_PRIMARIO} w-full text-lg`}
        >
          Enviar WhatsApp
        </a>
      )}

      {hayBotonesSecundarios && (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {hrefLlamar && (
            <a href={hrefLlamar} className={CLASE_BOTON_SECUNDARIO}>
              Llamar
            </a>
          )}
          {hrefComoLlegar && (
            <a
              href={hrefComoLlegar}
              target="_blank"
              rel="noopener noreferrer"
              className={CLASE_BOTON_SECUNDARIO}
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
