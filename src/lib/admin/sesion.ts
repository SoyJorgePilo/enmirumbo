/**
 * Sesión del panel de revisión (spec `revision-admin`, requirement "Acceso al
 * panel con contraseña única de entorno y sesión firmada"; design.md §1).
 *
 * El panel tiene un solo usuario y un solo secreto, así que la sesión es un
 * VALOR FIRMADO, no una base de sesiones: `<caducidad en epoch>.<firma>`,
 * donde la firma es un HMAC-SHA256 de la caducidad (con un identificador de
 * versión del formato) hecho con el secreto de entorno. No lleva la
 * contraseña ni ningún dato personal.
 *
 * Cualquier fallo —firma alterada, secreto distinto, formato raro, fecha
 * vencida, panel sin configurar— se trata igual: "no hay sesión". La
 * respuesta nunca distingue el motivo.
 *
 * Módulo puro (`node:crypto` y nada más): no lee cookies ni redirige. De eso
 * se encarga `src/lib/admin/guarda.ts`.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { leerConfiguracionPanel, type EntornoPanel } from "./config";

/** Nombre de la cookie. Neutro a propósito: no anuncia qué panel protege. */
export const NOMBRE_COOKIE_SESION = "nu_panel";

/** La cookie no se manda a ninguna ruta pública del sitio. */
export const RUTA_COOKIE_SESION = "/admin";

/** 8 horas: una jornada de revisión sin re-login (duda 4 de la propuesta). */
export const DURACION_SESION_MS = 8 * 60 * 60 * 1000;

/** Versión del formato del valor firmado; entra en el HMAC. */
const VERSION_FORMATO = "v1";

function firmar(caducidad: number, secreto: string): string {
  return createHmac("sha256", secreto)
    .update(`${VERSION_FORMATO}.${caducidad}`)
    .digest("base64url");
}

/** Comparación en tiempo constante de dos firmas en texto. */
function firmasIguales(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  // `timingSafeEqual` exige la misma longitud; una firma de otra longitud es
  // inválida por construcción y no revela nada del secreto.
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/** Valor de la cookie para una sesión que empieza ahora. */
export function crearValorDeSesion(secreto: string, ahora: Date = new Date()): string {
  const caducidad = ahora.getTime() + DURACION_SESION_MS;
  return `${caducidad}.${firmar(caducidad, secreto)}`;
}

/**
 * Atributos de la cookie de sesión. `SameSite=Lax` y no `Strict` porque el
 * admin va a abrir el panel desde un enlace pegado en su propio WhatsApp, y
 * con `Strict` esa navegación entrante lo dejaría fuera; el CSRF que `Strict`
 * cubriría de más ya lo cubren las Server Actions de Next (verifican el
 * origen) y que ninguna transición es un GET (design.md §1).
 */
export function opcionesCookieSesion(esHttps: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: RUTA_COOKIE_SESION,
    maxAge: DURACION_SESION_MS / 1000,
    secure: esHttps,
  };
}

/**
 * ¿Este valor de cookie es una sesión vigente? Sin panel configurado siempre
 * es `false`, aunque alguien traiga una cookie bien firmada: el fail-safe
 * apaga el panel entero (design.md §2).
 */
export function haySesionValida(
  valor: string | null | undefined,
  env: EntornoPanel = process.env,
  ahora: Date = new Date(),
): boolean {
  const configuracion = leerConfiguracionPanel(env);
  if (!configuracion) return false;
  if (!valor) return false;

  const partes = valor.split(".");
  if (partes.length !== 2) return false;

  const [caducidadTexto, firmaRecibida] = partes;
  if (!/^\d{1,15}$/.test(caducidadTexto) || firmaRecibida === "") return false;

  // La caducidad tiene que estar en su forma canónica (hallazgo BAJO 1 de la
  // etapa C): sin esto, `0001788…` y `1788…` son la misma sesión con dos
  // cookies distintas, y una cadena de dígitos suficientemente larga colapsa a
  // `Infinity`, que compara mayor que cualquier fecha — una sesión eterna.
  const caducidad = Number(caducidadTexto);
  if (!Number.isSafeInteger(caducidad) || String(caducidad) !== caducidadTexto) {
    return false;
  }

  if (!firmasIguales(firmaRecibida, firmar(caducidad, configuracion.secreto))) {
    return false;
  }

  return caducidad > ahora.getTime();
}
