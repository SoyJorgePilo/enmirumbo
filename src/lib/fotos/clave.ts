/**
 * La referencia interna de la foto (design.md §4 del change
 * `agregar-foto-negocio`).
 *
 * Lo que se guarda en `Negocio.fotoClave` NO es una dirección: es una clave
 * OPACA que genera el servidor. No se deriva del id del negocio ni de su
 * nombre (si se derivara, quien conoce la ficha adivina la foto), y cambia
 * cada vez que se sube una foto nueva, para que la anterior no siga
 * alcanzable por su URL vieja.
 *
 * Módulo puro (`node:crypto` y nada más): no toca la base, ni el disco, ni el
 * request. Lo importan tanto el servidor como los componentes que arman la
 * dirección de la imagen.
 */
import { randomBytes } from "node:crypto";

/** Los dos tamaños que el sistema genera y sirve (design.md §2). */
export const VARIANTES_FOTO = ["tarjeta", "ficha"] as const;
export type VarianteFoto = (typeof VARIANTES_FOTO)[number];

/**
 * 16 bytes al azar en hexadecimal: 32 caracteres de `[0-9a-f]`. No es
 * enumerable (2^128) y el alfabeto es tan estrecho que ninguna cadena con
 * `..`, `/`, `:` o un byte nulo puede pasar por una clave.
 */
export function generarClaveFoto(): string {
  return randomBytes(16).toString("hex");
}

const FORMA_CLAVE = /^[0-9a-f]{32}$/;

/**
 * ¿Este valor guardado es una clave de las que genera el servidor?
 *
 * Es la comprobación que cierra el hallazgo M1 de T-004: quien lea la columna
 * no puede asumir que lo escribió el servidor (una fila sembrada a mano, una
 * migración de datos, un bug futuro), así que se valida la FORMA antes de
 * construir con ella cualquier dirección o cualquier ruta de archivo.
 */
export function esClaveFotoValida(valor: unknown): valor is string {
  return typeof valor === "string" && FORMA_CLAVE.test(valor);
}

export function esVarianteFoto(valor: unknown): valor is VarianteFoto {
  return (
    typeof valor === "string" &&
    (VARIANTES_FOTO as readonly string[]).includes(valor)
  );
}
