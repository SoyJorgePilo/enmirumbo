/**
 * Contrato de eventos de la medición (spec `layout-base`, requirement "La
 * medición no lleva datos personales ni el texto que escribe la gente";
 * design.md §3 del change `agregar-analitica-cookieless`).
 *
 * FUENTE ÚNICA: este es el único archivo del código donde se escribe el
 * prefijo `data-umami-event`. Los componentes piden los atributos aquí, así
 * que el día que se cambie de proveedor (ADR-005) se toca un archivo, no
 * cinco. Módulo puro: sin base de datos, sin entorno, sin JavaScript de
 * cliente.
 *
 * REGLA DE PRIVACIDAD, sin excepciones: un evento lleva su nombre y DOS
 * propiedades, `categoria` y `colonia`, y el valor de cada una es un slug del
 * catálogo o la palabra `otra`. Nunca el nombre del negocio, su WhatsApp, su
 * teléfono, su dirección, su horario, su identificador ni el texto libre que
 * escribió. Todo lo que no sea un slug limpio se convierte en `otra`: una
 * regla única es más fácil de probar que una lista de excepciones, y garantiza
 * que un dato con espacios, acentos o signos no pueda salir del sitio.
 */

/** Clic al botón de WhatsApp de una tarjeta del listado o de los resultados. */
export const EVENTO_WHATSAPP_TARJETA = "whatsapp-tarjeta";
/** Clic a "Enviar WhatsApp" en la ficha: el numerador de la métrica del §10. */
export const EVENTO_WHATSAPP_FICHA = "whatsapp-ficha";
/** Clic a "Llamar" en la ficha. */
export const EVENTO_LLAMAR = "llamar";
/** Clic a "Cómo llegar" en la ficha. */
export const EVENTO_COMO_LLEGAR = "como-llegar";

/** Valor de una propiedad cuando no hay slug del catálogo que mandar. */
export const VALOR_FUERA_DEL_CATALOGO = "otra";

export type EventoDeContacto =
  | typeof EVENTO_WHATSAPP_TARJETA
  | typeof EVENTO_WHATSAPP_FICHA
  | typeof EVENTO_LLAMAR
  | typeof EVENTO_COMO_LLEGAR;

/** Los dos únicos datos del negocio que pueden viajar, y solo como slug. */
export type SlugsDelNegocio = {
  /** Slug de la categoría DEL NEGOCIO, no la de la página que se está viendo. */
  categoriaSlug?: string | null;
  /** Slug de la colonia del catálogo; `null` cuando capturó "Otra". */
  coloniaSlug?: string | null;
};

/** Atributos de marcado, inertes sin el script del proveedor. */
export type AtributosDeEvento = {
  "data-umami-event": EventoDeContacto;
  "data-umami-event-categoria": string;
  "data-umami-event-colonia": string;
};

const ES_SLUG = /^[a-z0-9-]+$/;

/** El slug tal cual si de verdad lo es; si no, `otra`. Sin medias tintas. */
function soloSlug(valor: string | null | undefined): string {
  const limpio = (valor ?? "").trim();
  return ES_SLUG.test(limpio) ? limpio : VALOR_FUERA_DEL_CATALOGO;
}

/**
 * Atributos que declaran un evento en el marcado. Se esparcen en el enlace
 * (`{...atributosDeEvento(...)}`): no hay JavaScript propio de por medio y el
 * botón se comporta igual con o sin medición configurada.
 */
export function atributosDeEvento(
  evento: EventoDeContacto,
  { categoriaSlug, coloniaSlug }: SlugsDelNegocio,
): AtributosDeEvento {
  return {
    "data-umami-event": evento,
    "data-umami-event-categoria": soloSlug(categoriaSlug),
    "data-umami-event-colonia": soloSlug(coloniaSlug),
  };
}
