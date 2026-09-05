/**
 * Parámetros de la URL del listado "Todos los negocios" (spec `revision-
 * admin`, requirements "El listado se filtra por estado sin salir de la
 * vista" y "El listado se corta en páginas..."; tasks.md #2).
 *
 * Módulo puro: sin acceso a datos, sin Prisma, sin `cookies()`/`headers()`.
 * A prueba de manoseo por diseño — nunca lanza, siempre cae al valor por
 * defecto ante cualquier entrada rara (letras, cero, negativos, decimales,
 * vacíos o repetidos/arreglos de `searchParams`).
 *
 * La tabla completa de entradas raras vive en
 * `tests/admin-listado-parametros.test.ts`, y las codificaciones que no son
 * ASCII (dígitos de ancho completo, árabes orientales, byte nulo…) en
 * `tests/admin-listado-seguridad-adversarial.test.ts`.
 */
import { ESTADO_NEGOCIO_DEFAULT, ESTADO_NEGOCIO_PUBLICADO, ESTADO_NEGOCIO_RECHAZADO } from "@/lib/negocio";

export const FILTRO_TODOS = "todos" as const;

export const FILTROS_ESTADO_LISTADO = [
  FILTRO_TODOS,
  ESTADO_NEGOCIO_DEFAULT,
  ESTADO_NEGOCIO_PUBLICADO,
  ESTADO_NEGOCIO_RECHAZADO,
] as const;

export type FiltroEstadoListado = (typeof FILTROS_ESTADO_LISTADO)[number];

export const PORPAGINA_LISTADO = 25;

/**
 * Hasta dónde se puede pedir página. Un millón de páginas son 25 millones de
 * fichas: nadie va a llegar ahí, y sin cota `skip = (pagina - 1) * 25` se sale
 * del entero de 32 bits que PostgreSQL acepta como OFFSET —o del entero
 * seguro de JavaScript— y `?pagina=999999999999999999999` respondería con un
 * error del servidor. El requirement pide justo lo contrario: una página más
 * allá de la última se ve vacía, con "Ver más nuevos" para regresar.
 */
export const PAGINA_MAXIMA = 1_000_000;

/**
 * `estado` fuera del conjunto conocido, vacío, repetido (arreglo) o ausente
 * → "todos" (equivalente al filtro "Todos" de la spec).
 */
export function normalizarFiltroEstado(
  valor: string | string[] | undefined,
): FiltroEstadoListado {
  if (typeof valor !== "string") return FILTRO_TODOS;
  return (FILTROS_ESTADO_LISTADO as readonly string[]).includes(valor)
    ? (valor as FiltroEstadoListado)
    : FILTRO_TODOS;
}

/**
 * `pagina` con letras, `0`, negativa, decimal, repetida (arreglo) o vacía →
 * 1. Solo enteros positivos en base 10 pasan, y recortados a `PAGINA_MAXIMA`:
 * un número enorme sí se puede interpretar (no es basura), así que no cae en
 * la primera página, cae en la cota y se ve como cualquier otra página más
 * allá de la última.
 */
export function normalizarPagina(valor: string | string[] | undefined): number {
  if (typeof valor !== "string") return 1;
  if (!/^[1-9][0-9]*$/.test(valor)) return 1;
  return Math.min(Number(valor), PAGINA_MAXIMA);
}

/**
 * Href del listado para un filtro y una página dados. Omite los parámetros
 * en su valor por defecto para que las URLs se queden chicas y legibles
 * (`/admin/negocios`, no `/admin/negocios?estado=todos&pagina=1`). Es el
 * único lugar que arma esta URL: filtros, paginación y el enlace de entrada
 * desde la cola lo reutilizan, así que nunca se desincronizan entre sí.
 */
export function hrefListadoDeNegocios(
  estado: FiltroEstadoListado,
  pagina: number,
): string {
  const parametros = new URLSearchParams();
  if (estado !== FILTRO_TODOS) parametros.set("estado", estado);
  if (pagina > 1) parametros.set("pagina", String(pagina));
  const query = parametros.toString();
  return query ? `/admin/negocios?${query}` : "/admin/negocios";
}
