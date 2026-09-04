/**
 * URL de la ficha de un negocio: `/negocio/<nombre-en-slug>-<id>`
 * (design.md §2 del change `agregar-directorio-publico`).
 *
 * La parte legible es decorativa —está para que el enlace se entienda cuando
 * alguien lo pega en un WhatsApp— y lo que resuelve la ficha es SIEMPRE el
 * identificador, que es lo que va después del último guion (los `cuid` de
 * Prisma no llevan guiones). Así, si el negocio cambia de nombre, los
 * enlaces que la gente ya compartió siguen abriendo su ficha.
 */
import { slugify } from "@/lib/slug";
import { tieneByteNulo } from "@/lib/texto";

/**
 * Segmento canónico de la ficha, con el nombre actual del negocio.
 *
 * OJO al repartir responsabilidades: el NOMBRE se slugifica aquí (queda en
 * `[a-z0-9-]`), pero el `id` se interpola TAL CUAL. Que el segmento resultante
 * sea seguro para meterlo en una URL —y, desde el change
 * `agregar-boton-reportar`, en el `Path` de una cookie— depende de que todo id
 * de `Negocio` sea un cuid, que es lo que garantiza `@default(cuid())` porque
 * nada en `src/` fija ids a mano. El día que algo permita elegir el id habrá
 * que sanearlo aquí (`tests/reportes-seguridad-adversarial.test.ts` vigila ese
 * invariante contra la base).
 */
export function construirSegmentoFicha(nombre: string, id: string): string {
  const legible = slugify(nombre);
  // Un nombre que se queda vacío al slugificarse (puros signos) no puede
  // aportar un prefijo: la URL queda solo con el identificador.
  return legible ? `${legible}-${id}` : id;
}

/**
 * Identificador contenido en el segmento recibido, o `null` si el segmento no
 * trae ninguno (cadena vacía, o nada después del último guion).
 * Un segmento sin guiones se toma completo como identificador: es la forma
 * que produce `construirSegmentoFicha` cuando el nombre no deja parte legible.
 *
 * Un segmento con un BYTE NULO tampoco trae identificador. Ningún cuid lo
 * lleva, así que solo puede venir de una URL fabricada a mano (`%00`); y desde
 * que la base es PostgreSQL (change `preparar-deploy-produccion`) buscarlo
 * abortaría la consulta con un error del motor. Filtrarlo aquí es lo que hace
 * que esa URL siga respondiendo el mismo 404 que cualquier otra inventada, en
 * vez de un error del servidor.
 */
export function extraerIdDeSegmentoFicha(segmento: string): string | null {
  const id = segmento.slice(segmento.lastIndexOf("-") + 1);
  if (id === "" || tieneByteNulo(id)) return null;
  return id;
}
