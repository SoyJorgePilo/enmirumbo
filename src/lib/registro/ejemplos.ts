/**
 * Ejemplos de palabras clave del campo "¿Qué ofreces?" por categoría
 * (PRD §6.1 y §6.5: el mismo formulario recibe negocios y deporte, solo
 * cambia el ejemplo). Se muestran como `placeholder`, nunca como valor.
 *
 * Los de "servicios-del-hogar" y "clubes-y-escuelas-deportivas" son literales
 * del PRD y de la spec: no se editan. Los otros seis son copy propuesto en la
 * etapa de interfaz, pendiente de visto bueno en el PR.
 *
 * Las claves son los slugs de `Categoria` (los del seed).
 */

export const EJEMPLO_QUE_OFRECES_GENERICO =
  "ej. palabras clave de lo que ofreces";

export const EJEMPLOS_QUE_OFRECES: Record<string, string> = {
  "restaurantes-y-fondas": "ej. comida corrida, tacos al pastor, para llevar",
  "servicios-del-hogar": "ej. plomería, destape de drenajes, bombas de agua",
  belleza: "ej. corte de cabello, uñas acrílicas, maquillaje para eventos",
  salud: "ej. consulta general, limpieza dental, vacunas",
  "abarrotes-y-comercio": "ej. abarrotes, tortillas, recargas y paquetería",
  talleres: "ej. afinación, hojalatería y pintura, cambio de llantas",
  "clubes-y-escuelas-deportivas":
    "ej. futbol infantil 6-12 años, entrenamientos martes y jueves",
  otro: "ej. lo que ofrece tu negocio, en pocas palabras",
};

/**
 * Ejemplo de la categoría elegida; el genérico mientras no haya categoría
 * (que es también lo que se ve sin JavaScript de cliente).
 *
 * Se consulta con `Object.hasOwn` para que una clave heredada de
 * `Object.prototype` (`"constructor"`, `"toString"`) caiga en el genérico y no
 * devuelva una función (nota menor de la etapa C).
 */
export function ejemploQueOfreces(slugCategoria: string | undefined): string {
  if (!slugCategoria || !Object.hasOwn(EJEMPLOS_QUE_OFRECES, slugCategoria)) {
    return EJEMPLO_QUE_OFRECES_GENERICO;
  }
  return EJEMPLOS_QUE_OFRECES[slugCategoria];
}

/**
 * Ejemplo que corresponde al `value` elegido en el `select` de categoría.
 * Es la regla completa del scenario "el ejemplo cambia al cambiar de
 * categoría": el componente de cliente solo guarda el `value` y llama aquí,
 * así que la lógica se prueba sin navegador.
 */
export function ejemploParaCategoriaElegida(
  categorias: ReadonlyArray<{ id: number; slug: string }>,
  categoriaId: string,
): string {
  const elegida = categorias.find(
    (categoria) => String(categoria.id) === categoriaId,
  );
  return ejemploQueOfreces(elegida?.slug);
}
