/**
 * El "sobre": cómo viaja el enlace de gestión EN CLARO desde la Server Action
 * que lo genera hasta la pantalla que lo muestra, una sola vez (change
 * `agregar-enlace-de-gestion`, design.md §3 y §4).
 *
 * El problema: la base guarda la huella, no el token, así que la pantalla de
 * confirmación no lo puede volver a leer de ningún lado. Y el panel es
 * POST-Redirect-GET sin JavaScript, así que la acción no puede devolverle un
 * valor a la página.
 *
 * Lo que NO se hizo, y por qué:
 *
 * - **Pasarlo por la URL** (`?enlace=…`) sería meter el secreto en el
 *   historial, en los logs del proxy y —sobre todo— en el `Referer` que el
 *   navegador manda al tocar el botón de WhatsApp, que es justo la fuga que
 *   design.md §4 cierra en el lado público. Es la peor opción disponible.
 * - **Guardarlo en la base** contradiría el requirement entero ("la base nunca
 *   guarda el secreto").
 *
 * Lo que se hizo: una cookie `httpOnly` de vida corta, con `Path=/admin`
 * (nunca viaja a una página pública), `SameSite=Lax` y `Secure` con el mismo
 * criterio que la sesión del panel. La lee la pantalla de confirmación, que ya
 * exige sesión de admin, y caduca sola a los dos minutos.
 *
 * Limitación asumida y documentada (reports/b-dev.md): Next.js solo permite
 * BORRAR una cookie desde una Server Function o un Route Handler, no al
 * renderizar una página, así que el "una sola vez" del requirement lo sostiene
 * la caducidad, no un borrado explícito. Dentro de esos dos minutos, recargar
 * la pantalla de confirmación vuelve a mostrar el mismo enlace al mismo admin
 * que acaba de generarlo; pasados, el enlace ya no aparece en ninguna pantalla
 * y para volver a mandarlo hay que generar otro, que es lo que la spec exige.
 *
 * El sobre va atado al negocio (`<negocioId>.<token>`): el enlace de un
 * negocio no se puede mostrar en la pantalla de otro.
 */

/** Nombre neutro, como el de la cookie de sesión: no anuncia qué guarda. */
export const NOMBRE_COOKIE_SOBRE = "nu_sobre";

/** La cookie no se manda a ninguna ruta pública del sitio. */
export const RUTA_COOKIE_SOBRE = "/admin";

/** Dos minutos: lo que tarda un admin en tocar "Mandarle el enlace". */
export const SEGUNDOS_SOBRE = 120;

/** Lo poco que este módulo necesita del almacén de cookies de Next. */
export type AlmacenCookies = {
  get(nombre: string): { value: string } | undefined;
  set(nombre: string, valor: string, opciones: Record<string, unknown>): void;
};

export function opcionesCookieSobre(esHttps: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: RUTA_COOKIE_SOBRE,
    maxAge: SEGUNDOS_SOBRE,
    secure: esHttps,
  };
}

/** Guarda el enlace en claro para la pantalla de confirmación que sigue. */
export function guardarSobre(
  almacen: AlmacenCookies,
  negocioId: string,
  token: string,
  esHttps: boolean,
): void {
  almacen.set(NOMBRE_COOKIE_SOBRE, `${negocioId}.${token}`, opcionesCookieSobre(esHttps));
}

/**
 * El token que el sobre traía para ESTE negocio, o `null`. Un sobre de otro
 * negocio, vacío, mal formado o caducado devuelve `null` sin distinguirse.
 */
export function leerSobre(almacen: AlmacenCookies, negocioId: string): string | null {
  const valor = almacen.get(NOMBRE_COOKIE_SOBRE)?.value;
  if (!valor || !negocioId) return null;

  const separador = valor.indexOf(".");
  if (separador <= 0) return null;
  if (valor.slice(0, separador) !== negocioId) return null;

  const token = valor.slice(separador + 1);
  return token === "" ? null : token;
}
