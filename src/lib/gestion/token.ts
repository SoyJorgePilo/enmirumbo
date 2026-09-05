/**
 * El token del enlace de gestión: generación, huella, resolución y URL
 * (change `agregar-enlace-de-gestion`, design.md §3; ticket T-014, tasks.md
 * #5).
 *
 * Cuatro decisiones que sostienen todo lo demás:
 *
 * 1. **Entropía.** 32 bytes de `crypto.randomBytes` (256 bits) en base64url.
 *    Adivinarlo por fuerza bruta no es un escenario, y por eso NO hay cupo por
 *    IP sobre la apertura del enlace: sería teatro. Lo que sí se acota es el
 *    envío de ediciones (`src/lib/gestion/limite-ip.ts`).
 * 2. **Huella, no token.** La base guarda `SHA-256(token)`, sin sal y sin KDF
 *    a propósito: una sal y un `bcrypt` protegen secretos de baja entropía
 *    contra diccionarios; aquí el secreto son 256 bits aleatorios y un KDF
 *    lento solo haría lenta cada apertura del enlace. Lo que hace falta es que
 *    la huella no sea invertible, y SHA-256 lo es.
 * 3. **Comparación segura.** El enlace se resuelve buscando POR LA HUELLA
 *    (índice único), nunca comparando el token en claro contra filas; sobre la
 *    fila encontrada, la confirmación final va con `timingSafeEqual`. Es
 *    cinturón y tirantes barato: cierra la igualdad de JavaScript, que corta
 *    en el primer byte distinto.
 * 4. **El token no se escribe NUNCA en el log**, ni completo ni recortado, ni
 *    en el camino feliz ni al fallar. Este módulo no llama a `console` en
 *    ninguna rama, y esa ausencia es la garantía.
 *
 * Módulo puro salvo la lectura de `SITIO_URL` para armar la URL absoluta.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { urlSitio } from "@/lib/sitio";

/** 32 bytes = 256 bits (spec `revision-admin`: "al menos 256 bits"). */
export const BYTES_TOKEN_GESTION = 32;

/** Prefijo de la ruta pública del modo edición. */
export const RUTA_EDICION = "/editar";

/**
 * Forma que puede tener un token para que valga la pena preguntarle a la
 * base: base64url de 43 caracteres (32 bytes sin relleno). Un segmento de URL
 * de otra forma —una cadena vacía, una ruta con `/`, 100 KB de basura— se
 * descarta antes de tocar la base, sin que eso cambie la respuesta: los dos
 * casos terminan en el mismo 404.
 */
const FORMA_TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** Un token nuevo, criptográficamente aleatorio. Nunca se persiste en claro. */
export function generarTokenGestion(): string {
  return randomBytes(BYTES_TOKEN_GESTION).toString("base64url");
}

/** Huella SHA-256 del token, en hexadecimal. Es lo único que ve la base. */
export function huellaDeToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * ¿Estas dos huellas son la misma? En tiempo constante: `===` sobre cadenas
 * corta en el primer byte distinto, y aunque el atacante ya tendría que
 * conocer la huella para explotarlo, la comparación segura no cuesta nada.
 */
export function huellasIguales(una: string, otra: string): boolean {
  const a = Buffer.from(una, "utf8");
  const b = Buffer.from(otra, "utf8");
  // `timingSafeEqual` exige la misma longitud; otra longitud es inválida por
  // construcción y no revela nada de la huella guardada.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Las dos columnas que estrena un enlace recién generado, listas para
 * cualquier escritura de Prisma, más el token en claro que solo existe en
 * memoria durante esta petición.
 *
 * Existe para que ni `src/lib/admin/` ni `src/app/admin/` tengan que nombrar
 * la columna de la huella: el panel genera enlaces sin poder leerlos
 * (`tests/admin-adversarial.test.ts` lo vigila).
 */
export type EnlaceRecienGenerado = {
  /** El secreto. Se muestra una sola vez y no se guarda en ningún lado. */
  token: string;
  /** Lo que se escribe en `Negocio`: la huella y su fecha. */
  columnas: { tokenGestionHash: string; tokenGestionCreadoEn: Date };
};

export function generarEnlaceDeGestion(ahora: Date = new Date()): EnlaceRecienGenerado {
  const token = generarTokenGestion();
  return {
    token,
    columnas: { tokenGestionHash: huellaDeToken(token), tokenGestionCreadoEn: ahora },
  };
}

/** ¿Este segmento de URL tiene siquiera la forma de un token? */
export function pareceToken(token: string): boolean {
  return FORMA_TOKEN.test(token);
}

/** Lo poco que la resolución del enlace necesita de Prisma. */
export type ClienteEnlace = {
  negocio: {
    findUnique(args: unknown): Promise<unknown>;
  };
};

type FilaDelEnlace = { id: string; tokenGestionHash: string | null; estado: string };

/**
 * Negocio PUBLICADO al que abre este token, o `null`.
 *
 * `null` es la única respuesta para todos los casos que la spec exige
 * indistinguibles: token inventado, alterado en un carácter, invalidado por
 * una regeneración, de un negocio que ya no está publicado o de uno borrado.
 * Quien llama traduce ese `null` en el 404 del sitio, el mismo de cualquier
 * URL que no existe.
 */
export async function negocioDelToken(
  prisma: ClienteEnlace,
  token: string,
  estadoPublicado: string,
): Promise<{ id: string } | null> {
  if (!pareceToken(token)) return null;

  const huella = huellaDeToken(token);
  const fila = (await prisma.negocio.findUnique({
    where: { tokenGestionHash: huella },
    select: { id: true, tokenGestionHash: true, estado: true },
  })) as FilaDelEnlace | null;

  if (!fila?.tokenGestionHash) return null;
  if (!huellasIguales(fila.tokenGestionHash, huella)) return null;
  if (fila.estado !== estadoPublicado) return null;

  return { id: fila.id };
}

/**
 * URL absoluta del enlace de gestión, la que viaja dentro del WhatsApp que el
 * admin le manda al negocio. Sale de `SITIO_URL` (misma fuente que el link de
 * la ficha); sin esa variable en producción no hay URL que armar y quien llama
 * lo dice a la vista, en vez de mandar un enlace a `localhost`.
 */
export function construirEnlaceDeGestion(token: string): string | null {
  const origen = urlSitio();
  return origen ? `${origen}${RUTA_EDICION}/${token}` : null;
}
