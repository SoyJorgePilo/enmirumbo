/**
 * Lo que los metadatos necesitan saber de la imagen de marca (design.md §3 y
 * §6 del change `migrar-lectura-publica-astro`): texto alternativo, medidas y
 * tipo. Separado del árbol y del generador para que la función del servidor
 * solo cargue estas tres constantes.
 *
 * Duplicadas respecto a `src/app/opengraph-image.tsx` hasta el corte (T-027),
 * que retira la copia de Next.
 */
export const ALT_IMAGEN_DE_MARCA =
  "EnMiRumbo: encuentra negocios y servicios de Tizayuca y contáctalos por WhatsApp";

export const TAMANO_IMAGEN_DE_MARCA = { width: 1200, height: 630 } as const;

export const TIPO_IMAGEN_DE_MARCA = "image/png";
