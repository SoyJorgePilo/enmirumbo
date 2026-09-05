/**
 * Versión del aviso de privacidad (spec `paginas-legales`, requirements "El
 * aviso de privacidad tiene una versión estable declarada en un solo lugar" y
 * "Cambiar el texto del aviso sin subir la versión rompe la verificación").
 *
 * Este módulo es la FUENTE ÚNICA de la versión: la página del aviso, el bloque
 * de consentimiento del formulario y el servidor que sella la constancia la
 * leen de aquí, sin copias.
 *
 * `src/lib/legales/textos.ts` (el contenido) NO importa este módulo: es al
 * revés (design.md §1). El texto no sabe de versiones; la versión sí sabe del
 * texto, porque tiene que poder hashearlo.
 */

import {
  AVISO_PRIVACIDAD,
  HAY_PLACEHOLDERS_PENDIENTES,
  TEXTO_MARCA_BORRADOR,
  type DocumentoLegal,
} from "@/lib/legales/textos";
import { TEXTO_AVISO_PRIVACIDAD, TEXTO_CONSENTIMIENTO } from "@/lib/registro/textos";

/**
 * Identificador de la versión vigente del aviso de privacidad. Entero
 * creciente escrito como cadena (design.md §1): estable, comparable y legible
 * en el panel. Una versión ya publicada NUNCA se reutiliza para otro texto.
 *
 * Subirla obliga a anclar la huella nueva en `tests/aviso-version.test.ts`.
 *
 * La `2` la estrena el rebrand a "EnMiRumbo" (T-019): cambió el nombre del
 * sitio dentro del texto publicado —la introducción del aviso, la sección
 * "Quién es responsable de tus datos" y el aviso simplificado— y se publicó el
 * correo del directorio en lugar de sus dos placeholders. Los dos cambios se
 * despliegan juntos, así que estrenan UNA sola versión. La huella de la `1`
 * NO se volvió a anclar: es la prueba de contra qué texto se firmaron las
 * constancias que la citan.
 */
export const VERSION_AVISO = "2";

/**
 * Entero de una versión, o `null` si esa cadena no es comparable.
 *
 * La versión es un entero creciente escrito como cadena (design.md §1), pero
 * el propio diseño deja la puerta abierta a un `"2-legal"` sin migración de
 * por medio. Lo que no se puede ordenar no se ordena a la fuerza: devuelve
 * `null` y quien pregunte decide (hoy, no anotar nada).
 */
function enteroDeVersion(version: string | null): number | null {
  if (version === null || !/^\d+$/.test(version)) return null;
  return Number(version);
}

/**
 * ¿`vigente` es POSTERIOR a `anterior`? (hallazgos MEDIO-3 y MEDIO-4 de la
 * etapa C).
 *
 * Se usa para decidir si un reenvío aceptó una versión más nueva que la de la
 * constancia original. Compara por ORDEN y no por desigualdad, por dos
 * motivos:
 *
 * - **Rollback:** si se estrenó la `2`, un negocio consintió con ella y luego
 *   el despliegue se revierte a la `1`, un `!==` anotaría una "reaceptación"
 *   de una versión más VIEJA. La evidencia mentiría sobre el sentido del
 *   cambio, que es justo lo que design.md §2 descartó.
 * - **"No consta" no es comparable:** una constancia sin versión (ficha
 *   anterior al versionado) devuelve `false`, así que un reenvío no le fabrica
 *   una reaceptación. El formulario es anónimo: quien reenvía puede no ser el
 *   titular, y no puede estrenar evidencia de consentimiento sobre una ficha
 *   de la que no consta qué texto tuvo enfrente.
 */
export function versionAvisoEsPosterior(
  vigente: string,
  anterior: string | null,
): boolean {
  const nuevaEntera = enteroDeVersion(vigente);
  const anteriorEntera = enteroDeVersion(anterior);
  if (nuevaEntera === null || anteriorEntera === null) return false;
  return nuevaEntera > anteriorEntera;
}

/**
 * Las tres piezas inseparables que la versión identifica: el aviso
 * simplificado del formulario, el literal de la casilla de consentimiento y
 * el aviso integral de `/aviso-de-privacidad`. Los términos y condiciones no
 * entran.
 */
export type PiezasDelAviso = {
  /** Aviso simplificado que se lee dentro del formulario. */
  simplificado: string;
  /** Literal de la casilla que el dueño marca. */
  casilla: string;
  /** Documento integral publicado en `/aviso-de-privacidad`. */
  integral: DocumentoLegal;
  /**
   * Marca de borrador que la página pinta DENTRO del documento, debajo del
   * `h1`, mientras queden placeholders sin completar, o `null` si ya no se
   * publica (hallazgo MEDIO-1 de la etapa C).
   *
   * Es contenido publicado como cualquier otro: advierte al titular de que el
   * texto que está aceptando todavía no pasó la revisión legal. Si quedara
   * fuera de la huella, vaciar `PLACEHOLDERS_LEGALES` retiraría esa
   * advertencia de la página sin estrenar versión y con la suite en verde.
   */
  marcaBorrador: string | null;
};

/** Las piezas que hoy se publican. */
export const PIEZAS_VIGENTES_DEL_AVISO: PiezasDelAviso = {
  simplificado: TEXTO_AVISO_PRIVACIDAD,
  casilla: TEXTO_CONSENTIMIENTO,
  integral: AVISO_PRIVACIDAD,
  marcaBorrador: HAY_PLACEHOLDERS_PENDIENTES ? TEXTO_MARCA_BORRADOR : null,
};

/**
 * Todo el contenido que la versión identifica, en orden de lectura y ya como
 * texto plano: es lo que el guardián de `tests/aviso-version.test.ts` hashea.
 *
 * Se hashea el CONTENIDO PUBLICADO y no el archivo fuente (design.md §4): el
 * guardián tiene que saltar cuando cambia lo que el titular lee, no cuando
 * cambia un comentario o el orden de un `import`.
 *
 * La propia versión queda fuera a propósito: si entrara, subirla cambiaría la
 * huella y el guardián no probaría nada sobre el texto. Por eso la línea
 * "Versión N · " se antepone al pintar (`documento-legal.tsx`) y no vive en
 * `AVISO_PRIVACIDAD`.
 *
 * El parámetro existe para poder probar el guardián por mutación (tasks.md
 * #5): con un doble del módulo de textos, alterar una frase tiene que dejar la
 * verificación en rojo.
 */
export function contenidoVersionadoDelAviso(
  piezas: PiezasDelAviso = PIEZAS_VIGENTES_DEL_AVISO,
): string[] {
  const contenido = [piezas.simplificado, piezas.casilla];

  const { integral } = piezas;
  contenido.push(integral.h1);
  // En su lugar de lectura: `DocumentoLegalView` la pinta entre el `h1` y la
  // línea de última actualización.
  if (piezas.marcaBorrador) contenido.push(piezas.marcaBorrador);
  contenido.push(integral.ultimaActualizacion, integral.introduccion);
  for (const seccion of integral.secciones) {
    contenido.push(seccion.encabezado);
    for (const bloque of seccion.bloques) {
      if (bloque.tipo === "lista") contenido.push(...bloque.items);
      else contenido.push(bloque.texto);
    }
  }
  if (integral.enlaceCierre) contenido.push(integral.enlaceCierre.texto);

  return contenido;
}
