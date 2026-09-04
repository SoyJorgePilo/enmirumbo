/**
 * Guarda de sesión del panel (spec `revision-admin`, requirement "Toda
 * pantalla y toda acción del panel exigen sesión válida"; design.md §3).
 *
 * Vive aquí y no en un `middleware.ts` por dos razones: el middleware corre
 * en un runtime donde `node:crypto` no es de fiar, y —más importante— dejaría
 * las Server Actions protegidas solo por la ruta desde la que se invocan,
 * cuando en realidad son endpoints propios. Cada página y cada acción llaman
 * primero a `requerirSesionAdmin()`.
 *
 * La redirección va a la ruta de acceso SIN parámetros: nada de `?destino=`
 * ni de identificadores de registro en la URL, que es donde se filtran datos
 * por accidente (y donde quedan guardados en el historial y en los logs del
 * proxy).
 */
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { NOMBRE_COOKIE_SESION, haySesionValida } from "./sesion";

/** Pantalla de acceso: único destino de la redirección, siempre sin parámetros. */
export const RUTA_ACCESO_ADMIN = "/admin";
/** Pantalla principal del panel una vez dentro. */
export const RUTA_COLA_ADMIN = "/admin/cola";

/** ¿La petición trae una sesión vigente? No redirige: solo responde. */
export async function haySesionAdmin(ahora: Date = new Date()): Promise<boolean> {
  const almacen = await cookies();
  return haySesionValida(almacen.get(NOMBRE_COOKIE_SESION)?.value, process.env, ahora);
}

/**
 * Corta la ejecución si no hay sesión válida. Se llama ANTES de leer o
 * escribir nada, así que una petición sin cookie no toca la base ni deja
 * ningún dato del registro en la respuesta.
 */
export async function requerirSesionAdmin(): Promise<void> {
  if (!(await haySesionAdmin())) {
    // `redirect` lanza para cortar el flujo: nada de lo que venga después se
    // ejecuta, ni siquiera por descuido de quien llame.
    redirect(RUTA_ACCESO_ADMIN);
  }
}

/**
 * ¿El sitio se está sirviendo por HTTPS? Decide el atributo `Secure` de la
 * cookie. Se mira el encabezado que pone el proxy y, además, el entorno: en
 * producción la cookie va siempre marcada, aunque el proxy no lo declare.
 */
export async function sirviendoPorHttps(): Promise<boolean> {
  const encabezados = await headers();
  const protocolo = encabezados.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return (
    protocolo === "https" ||
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  );
}
