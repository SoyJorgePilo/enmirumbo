/**
 * Datos estructurados Schema.org de la ficha (spec `directorio-publico`,
 * requirement "Cada ficha publicada emite Schema.org LocalBusiness";
 * design.md §6 del change `agregar-seo-local`).
 *
 * El PRD §8 fija la expectativa y la spec la cita: *"al publicar colonia (no
 * dirección exacta) y horario en texto libre, el markup será parcial; el
 * horario estructurado queda para fases posteriores (§12)"*. En consecuencia
 * este módulo emite lo que es honesto publicar y NO emite:
 *
 * - `telephone`: el WhatsApp y el fijo en formato legible por máquina son
 *   exactamente el regalo al scraper que el hallazgo M5 de T-004 evita; el
 *   botón de WhatsApp ya está a un toque para las personas. Y no basta con no
 *   leer esos campos: el número que el negocio escribió DENTRO del "¿Qué
 *   ofreces?" también se oculta antes de publicarlo aquí (iteración 2,
 *   hallazgo M2 de la etapa C);
 * - el texto de dirección o referencias que capturó el negocio, ni
 *   coordenadas: la colonia es lo único de ubicación que el directorio
 *   publica por defecto;
 * - `openingHours`: el horario se captura en texto libre (§12).
 *
 * `@type` es el `LocalBusiness` genérico que nombra el PRD, sin mapear
 * categorías a subtipos: marcar como otra cosa a un negocio que no lo es sería
 * peor que no marcarlo.
 */
import type { GiroCatalogo, NegocioFicha } from "@/lib/directorio";
import { urlDeFoto } from "@/lib/fotos/url";
import { ocultarNumerosDeContacto } from "@/lib/seo/saneo";
import { type EntornoSitio, urlAbsoluta } from "@/lib/sitio";

export type DatosEstructuradosDeFicha = {
  "@context": "https://schema.org";
  "@type": "LocalBusiness";
  name: string;
  url?: string;
  description?: string;
  image?: string[];
  address: {
    "@type": "PostalAddress";
    streetAddress?: string;
    addressLocality: "Tizayuca";
    addressRegion: "Hidalgo";
    addressCountry: "MX";
  };
  knowsAbout: string[];
};

/**
 * El bloque de datos de un negocio PUBLICADO. Quien llama solo tiene la ficha
 * publicada en la mano (`obtenerNegocioPublicado` no devuelve otra cosa), así
 * que aquí no hay que volver a filtrar por estado.
 */
export function datosEstructuradosDeFicha(
  negocio: NegocioFicha,
  giros: GiroCatalogo[],
  rutaFicha: string,
  env: EntornoSitio = process.env,
): DatosEstructuradosDeFicha {
  const url = urlAbsoluta(rutaFicha, env);
  const descripcion = negocio.queOfreces
    ? ocultarNumerosDeContacto(negocio.queOfreces)
    : "";
  // Solo la colonia DEL CATÁLOGO entra como referencia de ubicación: el texto
  // libre de "Otra" es lo que el negocio escribió y no se publica aquí.
  const colonia = negocio.coloniaSlug ? negocio.coloniaNombre : null;
  const foto = imagenAbsoluta(negocio.fotoClave, env);

  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: negocio.nombre,
    ...(url ? { url } : {}),
    ...(descripcion ? { description: descripcion } : {}),
    ...(foto ? { image: [foto] } : {}),
    address: {
      "@type": "PostalAddress",
      ...(colonia ? { streetAddress: `Col. ${colonia}` } : {}),
      addressLocality: "Tizayuca",
      addressRegion: "Hidalgo",
      addressCountry: "MX",
    },
    // `knowsAbout` es la propiedad válida para "de qué sabe" esta ficha;
    // `keywords` no aplica a un negocio.
    knowsAbout: [negocio.categoriaNombre, ...giros.map((giro) => giro.nombre)],
  };
}

/**
 * La `image` del JSON-LD se construye a partir de la referencia interna que
 * generó el servidor (`Negocio.fotoClave`), nunca a partir de una dirección
 * guardada: `urlDeFoto` devuelve la ruta interna o `null`, y solo entonces se
 * hace absoluta con la URL pública del sitio.
 *
 * Cierra el hallazgo **M3 de T-009** (`fotoUrl` sin lista blanca de dominio):
 * ya no hace falta lista blanca, porque no hay forma de que un dominio ajeno
 * entre — lo que se guarda no es una URL. Una fila con basura en esa columna
 * emite una ficha sin `image`, que es lo mismo que hace la vista.
 */
function imagenAbsoluta(fotoClave: string | null, env: EntornoSitio): string | null {
  const ruta = urlDeFoto(fotoClave, "ficha");
  return ruta ? urlAbsoluta(ruta, env) : null;
}

/**
 * Serializa el bloque para inyectarlo en el HTML.
 *
 * `JSON.stringify` NO protege de un `</script>` incrustado en un dato que
 * escribió el negocio, así que cada `<` se sustituye por su escape unicode,
 * exactamente como muestra la guía de Next (`01-app/02-guides/json-ld.md`).
 * Con eso, un nombre con marcado adentro queda como texto dentro del dato y
 * no puede cerrar el bloque ni ejecutar nada.
 */
export function serializarJsonLd(datos: unknown): string {
  return JSON.stringify(datos).replace(/</g, "\\u003c");
}
