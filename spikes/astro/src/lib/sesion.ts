/**
 * Sesión firmada del spike (spec `spike-astro`, requirement "La sesión del
 * spike viaja en una cookie firmada leída en middleware").
 *
 * Mismo formato que el panel real (`src/lib/admin/sesion.ts`):
 * `<caducidad>.<HMAC-SHA256>`. No se importa ese módulo porque arrastra la
 * configuración del panel (contraseña, URL del sitio); aquí solo se prueba
 * que Astro emite y lee la cookie en middleware.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const VARIABLE_SECRETO = "SPIKE_SESION_SECRETO";
export const NOMBRE_COOKIE = "spike_sesion";
export const DURACION_SESION_MS = 8 * 60 * 60 * 1000;
const LONGITUD_MINIMA_SECRETO = 32;

/** El secreto, o `null` si no sirve: sin secreto no se emite ninguna cookie. */
export function secretoDeSesion(valor: string | undefined): string | null {
  return valor !== undefined && valor.length >= LONGITUD_MINIMA_SECRETO ? valor : null;
}

function firmar(caducidad: number, secreto: string): string {
  return createHmac("sha256", secreto).update(`v1.${caducidad}`).digest("base64url");
}

export function crearValorDeSesion(secreto: string, ahora: Date = new Date()): string {
  const caducidad = ahora.getTime() + DURACION_SESION_MS;
  return `${caducidad}.${firmar(caducidad, secreto)}`;
}

export function esSesionValida(
  valor: string | null | undefined,
  secreto: string,
  ahora: Date = new Date(),
): boolean {
  if (!valor) return false;
  const partes = valor.split(".");
  if (partes.length !== 2) return false;
  const [texto, firma] = partes;
  if (!/^\d{1,15}$/.test(texto) || firma === "") return false;
  const caducidad = Number(texto);
  if (String(caducidad) !== texto) return false;

  const esperada = Buffer.from(firmar(caducidad, secreto));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return false;
  return caducidad > ahora.getTime();
}

/** Atributos de la cookie: `Secure` siempre, el preview es HTTPS. */
export const OPCIONES_COOKIE = {
  httpOnly: true,
  sameSite: "lax",
  secure: true,
  path: "/",
  maxAge: DURACION_SESION_MS / 1000,
} as const;
