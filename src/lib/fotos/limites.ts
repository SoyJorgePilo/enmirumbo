/**
 * Cotas de la foto (spec `registro-negocio`, "El servidor solo acepta la foto
 * si es una imagen real de máximo 5 MB"; spec `directorio-publico`, "El peso
 * de las fotos no rompe el presupuesto de 4G").
 *
 * Viven aparte de `procesar.ts` porque la validación de campos del formulario
 * necesita el tope de tamaño —que es una comprobación de un número, no de una
 * imagen— y no tiene por qué arrastrar `sharp` por ello.
 */
import type { VarianteFoto } from "./clave";

/** Máximo de entrada del PRD §6.1: 5 MB reales, medidos en bytes. */
export const LIMITE_BYTES_FOTO = 5 * 1024 * 1024;

/** Tope de dimensiones: la forma barata de tumbar al servidor con poco peso. */
export const MEGAPIXELES_MAXIMOS = 40;

export type ParametrosVariante = {
  /** Lado mayor en píxeles; nunca se amplía una foto más chica. */
  ladoMayor: number;
  /** Tope de peso servido (presupuesto de <2s en 4G del PRD §8). */
  pesoMaximo: number;
};

export const PARAMETROS_VARIANTES: Record<VarianteFoto, ParametrosVariante> = {
  tarjeta: { ladoMayor: 400, pesoMaximo: 60 * 1024 },
  ficha: { ladoMayor: 1200, pesoMaximo: 250 * 1024 },
};
