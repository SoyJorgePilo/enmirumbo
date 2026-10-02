/**
 * Lo propio de `/buscar` que no es marcado (change `migrar-directorio-publico-astro`,
 * design.md §4): el título estático, la metadata y el eco saneado de la
 * consulta. Movido SIN CAMBIOS desde `src/app/(publico)/buscar/page.tsx` para
 * que la página `.astro` y sus pruebas lo compartan.
 */
import type { MetadatosDePagina } from "@/astro/metadatos";

/**
 * Título ESTÁTICO a propósito (hallazgo M-2 de la etapa C del change
 * `agregar-analitica-cookieless`): el tracker de analítica manda
 * `document.title` en cada envío, además de la URL. Si esta página estrenara
 * el patrón habitual «Resultados para "…" — EnMiRumbo», el texto que
 * escribió el vecino saldría al proveedor por el título, esquivando por
 * completo la exclusión de la cadena de consulta (`data-exclude-search`).
 *
 * El eco de la consulta sigue estando donde le sirve al vecino —el `h1` y el
 * campo del buscador—, que no viajan a ningún lado. `/buscar` no es
 * indexable, así que un título dinámico no aporta nada de SEO y sí filtraría
 * texto libre.
 *
 * Nota de paridad: con la plantilla del sitio, el título servido es
 * "Buscar — EnMiRumbo — EnMiRumbo", igual que en Next (fixture
 * `tests/fixtures/next-2b/*\/head-buscar.html`); el arreglo de la marca
 * repetida va aparte, por `/rapido` en `main`.
 */
export const TITULO_BUSCAR = "Buscar — EnMiRumbo";

export const METADATOS_BUSCAR: MetadatosDePagina = {
  title: TITULO_BUSCAR,
  robots: { index: false, follow: true },
};

export const LONGITUD_MAXIMA_CONSULTA_MOSTRADA = 80;

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
 * El escapado de HTML no es lo que impide el XSS aquí; esto evita dos cosas
 * que el escapado no cubre (hallazgo M-1 de la etapa C del buscador):
 *
 * - **Byte NUL y demás controles crudos en el cuerpo de la respuesta.**
 * - **Spoofing visual del encabezado** con `U+202E`.
 *
 * El recorte se hace **por puntos de código** (`[...texto]`), no por unidades
 * UTF-16: cortar a la mitad una pareja suplente dejaba medio emoji suelto.
 *
 * El título lleva puntos suspensivos y el campo no (para que al corregir no se
 * le cuele el "…"). No se pierde nada buscable: la búsqueda mira menos
 * caracteres aún (`LONGITUD_MAXIMA_CONSULTA` de `src/lib/busqueda.ts`).
 */
export function recortarConsulta(texto: string): { enElCampo: string; enElTitulo: string } {
  const limpia = texto.replace(INVISIBLES, " ").replace(/\s+/g, " ").trim();
  const puntosDeCodigo = [...limpia];
  if (puntosDeCodigo.length <= LONGITUD_MAXIMA_CONSULTA_MOSTRADA) {
    return { enElCampo: limpia, enElTitulo: limpia };
  }
  const recortada = puntosDeCodigo.slice(0, LONGITUD_MAXIMA_CONSULTA_MOSTRADA).join("");
  return { enElCampo: recortada, enElTitulo: `${recortada}…` };
}
