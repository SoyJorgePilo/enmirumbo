import type { Metadata } from "next";

import { Buscador } from "@/components/directorio/buscador";
import { CategoriasGrid } from "@/components/directorio/categorias-grid";
import { TarjetaNegocio } from "@/components/directorio/tarjeta-negocio";
import { terminosDeBusqueda } from "@/lib/busqueda";
import { buscarNegociosPublicados, listarCategorias } from "@/lib/directorio";
import { construirEnlaceWhatsapp } from "@/lib/enlaces";
import { construirSegmentoFicha } from "@/lib/ficha-url";

/**
 * Página de resultados del buscador (spec `directorio-publico`, requirements
 * "Página de resultados con las mismas tarjetas del listado", "Sin
 * resultados, la página ofrece las categorías como alternativa", "Consulta
 * vacía y términos hostiles acotados, sin error" y "La página de resultados
 * no es indexable"; change `agregar-buscador`, tasks.md #11-#14).
 *
 * La búsqueda la resuelve `buscarNegociosPublicados` (`src/lib/directorio.ts`),
 * el único módulo que lee negocios para mostrarlos: aplica `estado:
 * publicado` por construcción y selecciona campo por campo lo que es público.
 * La página no arma ninguna consulta propia.
 *
 * Es dinámica por leer `searchParams` (igual que el resto del directorio,
 * `force-dynamic` no hace falta: `searchParams` ya opta a render dinámico).
 */
/**
 * Título ESTÁTICO a propósito (hallazgo M-2 de la etapa C del change
 * `agregar-analitica-cookieless`): el tracker de analítica manda
 * `document.title` en cada envío, además de la URL. Si esta página estrenara
 * el patrón habitual «Resultados para "…" — NecesitoUno», el texto que
 * escribió el vecino saldría al proveedor por el título, esquivando por
 * completo la exclusión de la cadena de consulta (`data-exclude-search`), que
 * la aprobación de la spec declaró innegociable.
 *
 * El eco de la consulta sigue estando donde le sirve al vecino —el `h1` y el
 * campo del buscador—, que no viajan a ningún lado. Quien vaya a darle
 * metadata propia a las páginas del directorio (E5, SEO local) tiene que
 * respetar esta excepción: `/buscar` no es indexable, así que un título
 * dinámico no aporta nada de SEO y sí filtraría texto libre.
 */
export const TITULO_BUSCAR = "Buscar — NecesitoUno Tizayuca";

export const metadata: Metadata = {
  title: TITULO_BUSCAR,
  robots: { index: false, follow: true },
};

const LONGITUD_MAXIMA_CONSULTA_MOSTRADA = 80;

/** `?q` puede llegar repetido (`?q=a&q=b`): se usa el primer valor. */
function primerValorDeConsulta(valor: string | string[] | undefined): string {
  if (Array.isArray(valor)) return valor[0] ?? "";
  return valor ?? "";
}

/**
 * Caracteres invisibles que no tienen nada que hacer en el eco de la
 * consulta: controles (`Cc`, incluido el byte NUL y los saltos de línea) y
 * formato (`Cf`, donde viven las marcas bidi como RIGHT-TO-LEFT OVERRIDE).
 * Se sustituyen por un espacio en vez de borrarse, para no pegar palabras
 * que el vecino escribió separadas.
 */
const INVISIBLES = /[\p{Cc}\p{Cf}]/gu;

/**
 * Lo que se le devuelve al vecino de su propia consulta, saneado y acotado.
 *
 * React ya escapa `< > " &`, así que esto no es lo que impide el XSS; es lo
 * que evita dos cosas que el escapado no cubre (hallazgo M-1 de la etapa C):
 *
 * - **Byte NUL y demás controles crudos en el cuerpo de la respuesta.** El
 *   navegador los tolera, pero es una respuesta no conforme que WAFs, proxies
 *   y pipelines de log tratan como fin de cadena o como payload sospechoso.
 * - **Spoofing visual del encabezado.** `U+202E` llegaba íntegro al `h1`, así
 *   que un enlace difundido por WhatsApp podía servir, desde el dominio
 *   legítimo, un `Resultados para "…"` que se lee al revés.
 *
 * El recorte se hace **por puntos de código** (`[...texto]`), no por unidades
 * UTF-16: cortar a la mitad una pareja suplente dejaba medio emoji suelto en
 * el `h1` y dentro del `value` que el vecino reenvía al corregir.
 *
 * La página nunca repite una cadena kilométrica que él mismo mandó: el título
 * lleva puntos suspensivos y el campo no (para que al corregir no se le cuele
 * el "…"). No se pierde nada buscable: la búsqueda mira menos caracteres aún
 * (`LONGITUD_MAXIMA_CONSULTA` de `src/lib/busqueda.ts`).
 */
function recortarConsulta(texto: string): { enElCampo: string; enElTitulo: string } {
  const limpia = texto.replace(INVISIBLES, " ").replace(/\s+/g, " ").trim();
  const puntosDeCodigo = [...limpia];
  if (puntosDeCodigo.length <= LONGITUD_MAXIMA_CONSULTA_MOSTRADA) {
    return { enElCampo: limpia, enElTitulo: limpia };
  }
  const recortada = puntosDeCodigo
    .slice(0, LONGITUD_MAXIMA_CONSULTA_MOSTRADA)
    .join("");
  return { enElCampo: recortada, enElTitulo: `${recortada}…` };
}

export default async function BuscarPage({
  searchParams,
}: PageProps<"/buscar">) {
  const { q } = await searchParams;
  const consultaCruda = primerValorDeConsulta(q);

  // "Consulta vacía y términos hostiles acotados, sin error": si no queda
  // ningún término buscable (vacía, solo espacios, solo "%"/"_", solo
  // emojis...), NO se toca la base y se muestra el estado "¿Qué estás
  // buscando?" en vez de resultados o de un error.
  const terminos = terminosDeBusqueda(consultaCruda);

  if (terminos.length === 0) {
    const categorias = await listarCategorias();
    return (
      <section className="flex flex-col gap-6 py-4">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            ¿Qué estás buscando?
          </h1>
          <p className="text-tinta-suave">
            Escribe qué necesitas y te decimos quién lo hace en Tizayuca.
          </p>
        </div>
        <Buscador valorInicial="" />
        <CategoriasGrid categorias={categorias} />
      </section>
    );
  }

  const consulta = recortarConsulta(consultaCruda);
  const resultados = await buscarNegociosPublicados(consultaCruda);

  if (resultados.length === 0) {
    const categorias = await listarCategorias();
    return (
      <section className="flex flex-col gap-6 py-4">
        {/* Un solo nodo de texto, como en el listado por categoría: */}
        <h1 className="text-2xl font-bold tracking-tight break-words sm:text-3xl">
          {`Resultados para "${consulta.enElTitulo}"`}
        </h1>
        <Buscador valorInicial={consulta.enElCampo} />
        <div className="flex flex-col gap-4 rounded-xl border border-borde bg-superficie p-6">
          <p className="break-words text-tinta-suave">
            {`No encontramos negocios para "${consulta.enElTitulo}".`}
          </p>
          <p className="text-tinta-suave">
            Prueba con otra palabra o elige una categoría:
          </p>
          <CategoriasGrid categorias={categorias} />
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6 py-4">
      <h1 className="text-2xl font-bold tracking-tight break-words sm:text-3xl">
        {`Resultados para "${consulta.enElTitulo}"`}
      </h1>
      <Buscador valorInicial={consulta.enElCampo} />
      <ul className="flex flex-col gap-4">
        {resultados.map((negocio) => (
          <li key={negocio.id}>
            <TarjetaNegocio
              nombre={negocio.nombre}
              coloniaNombre={negocio.coloniaNombre}
              categoriaSlug={negocio.categoriaSlug}
              coloniaSlug={negocio.coloniaSlug}
              entregaADomicilio={negocio.entregaADomicilio}
              fotoUrl={negocio.fotoUrl}
              hrefFicha={`/negocio/${construirSegmentoFicha(negocio.nombre, negocio.id)}`}
              hrefWhatsapp={construirEnlaceWhatsapp(negocio.whatsapp)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
