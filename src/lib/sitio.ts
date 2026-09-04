/**
 * URL pública del sitio (design.md §7 del change `agregar-panel-admin` y §5
 * del change `agregar-seo-local`).
 *
 * En el servidor no hay forma confiable de deducir el dominio —los
 * encabezados de host los escribe quien pide—, así que se declara en una sola
 * variable de entorno. Vivía en `src/lib/admin/config.ts`, donde nació para
 * el link de la ficha del aviso de aprobación; ahora también la necesitan el
 * sitemap, `robots.txt`, las canónicas y la vista previa al compartir, así
 * que se mudó aquí SIN cambiar su comportamiento (`admin/config.ts` la
 * reexporta y su suite sigue pasando igual).
 *
 * Módulo puro: recibe el entorno como parámetro (por defecto `process.env`).
 */

/** Nombre de la variable con la URL pública, sin diagonal final. */
export const VARIABLE_URL_SITIO = "SITIO_URL";

/** Dirección local de desarrollo, el único default admitido. */
export const URL_SITIO_LOCAL = "http://localhost:3000";

/** Lo poco que este módulo necesita del entorno. */
export type EntornoSitio = Record<string, string | undefined>;

const normalizar = (valor?: string) => valor?.trim().toLowerCase() ?? "";

export function esProduccion(env: EntornoSitio): boolean {
  return (
    normalizar(env.NODE_ENV) === "production" ||
    normalizar(env.VERCEL_ENV) === "production"
  );
}

/**
 * Origen público del sitio, sin diagonal final, o `null`.
 *
 * Fuera de producción, sin variable, se usa la dirección local; en producción
 * se devuelve `null` para que el sitio falle A LA VISTA (sitemap vacío, sin
 * canónicas, sin imagen absoluta) en vez de publicar URLs a `localhost` que
 * Google intentaría rastrear y que un negocio real recibiría por WhatsApp.
 */
export function urlSitio(env: EntornoSitio = process.env): string | null {
  const declarada = (env[VARIABLE_URL_SITIO] ?? "").trim();
  if (declarada !== "") {
    try {
      const interpretada = new URL(declarada);
      if (interpretada.protocol === "http:" || interpretada.protocol === "https:") {
        return interpretada.origin;
      }
    } catch {
      // URL ilegible: se trata como si no estuviera declarada.
    }
  }
  return esProduccion(env) ? null : URL_SITIO_LOCAL;
}

/**
 * URL absoluta de una ruta del sitio, o `null` si no hay URL pública
 * declarada. La ruta va con diagonal inicial (`/plomeria`).
 */
export function urlAbsoluta(
  ruta: string,
  env: EntornoSitio = process.env,
): string | null {
  const origen = urlSitio(env);
  if (!origen) return null;
  return ruta === "/" ? origen : `${origen}${ruta}`;
}

let yaSeAvisoSinUrl = false;

/**
 * Deja constancia en el log —UNA SOLA VEZ por proceso— de que el sitio corre
 * en producción sin URL pública declarada.
 *
 * Una vez y no por petición: `robots.txt` y `sitemap.xml` son públicos, así
 * que avisar en cada lectura le daría a cualquiera una forma gratis de
 * inundar el log del servidor. Mismo criterio que el panel y el límite por IP.
 */
export function avisarSinUrlSitioUnaVez(env: EntornoSitio = process.env): void {
  if (yaSeAvisoSinUrl || urlSitio(env) !== null) return;
  yaSeAvisoSinUrl = true;
  console.warn(
    `[sitio] falta ${VARIABLE_URL_SITIO}: el sitemap va vacío y no se publican canónicas ni vista previa absolutas (antes que apuntar a localhost).`,
  );
}

/** Solo para pruebas: permite volver a observar el aviso. */
export function reiniciarAvisoDeUrlSitio(): void {
  yaSeAvisoSinUrl = false;
}
