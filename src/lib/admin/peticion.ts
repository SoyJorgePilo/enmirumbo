/**
 * Lo que el acceso al panel necesita de la petición, SIN Next (change
 * `migrar-panel-admin-base-astro`, design.md §2.2 y §2.3): la regla de HTTPS
 * de la cookie y la forma del almacén de cookies que cumplen `cookies()` de
 * Next y `Astro.cookies`. Lo usan `src/lib/admin/entrar.ts` y, por delegación,
 * `sirviendoPorHttps()` de `guarda.ts`.
 */

/**
 * ¿El sitio se está sirviendo por HTTPS? Decide el atributo `Secure` de la
 * cookie. Se mira el encabezado que pone el proxy (su primer valor) y, además,
 * el entorno: en producción la cookie va siempre marcada, aunque el proxy no
 * lo declare. Es la regla de siempre de `guarda.ts`, sin cambios.
 */
export function esPeticionHttps(
  encabezados: Pick<Headers, "get">,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const protocolo = encabezados.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return protocolo === "https" || env.NODE_ENV === "production" || env.VERCEL_ENV === "production";
}

/** Las opciones con las que se pone o se caduca la cookie de sesión (`opcionesCookieSesion`). */
export type OpcionesCookiePanel = {
  httpOnly: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
  secure: boolean;
};

/** Lo que el acceso usa del almacén de cookies: lo cumplen `cookies()` de Next y `Astro.cookies`. */
export type AlmacenCookiesPanel = {
  get(nombre: string): { value: string } | undefined;
  set(nombre: string, valor: string, opciones: OpcionesCookiePanel): void;
};
