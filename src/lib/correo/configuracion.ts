/**
 * Lo que hace falta para que el aviso diario pueda salir (spec `despliegue`,
 * requirement "Sin la configuración del correo, el aviso no se manda y se nota
 * en el log").
 *
 * Cuatro variables, y las cuatro son obligatorias para mandar: la credencial
 * del proveedor, la dirección desde la que sale, el buzón que lo recibe y la
 * `SITIO_URL` de la que se arma el único enlace del correo. Falte la que
 * falte, no se manda nada y el log dice CUÁL falta — una sola vez por proceso,
 * como el aviso del secreto de tareas (`src/lib/tareas/secreto.ts`).
 *
 * **Aquí no hay valores por defecto de ninguna clase**: ni buzón de respaldo,
 * ni el remitente de pruebas del proveedor, ni un enlace a `localhost`. Es el
 * mismo criterio del requirement "En producción ninguna configuración
 * requerida falta en silencio": una configuración a medias se trata igual que
 * la falta total.
 *
 * Módulo puro: recibe el entorno como parámetro (por defecto `process.env`).
 */
import { urlSitio, VARIABLE_URL_SITIO } from "@/lib/sitio";

/** Credencial del proveedor de correo. **Secreto.** */
export const VARIABLE_CORREO_API_KEY = "RESEND_API_KEY";

/** Dirección desde la que sale el aviso, en un dominio verificado. */
export const VARIABLE_CORREO_REMITENTE = "AVISOS_CORREO_REMITENTE";

/**
 * Buzón del directorio que recibe el aviso. Es un dato personal en un repo
 * público (LFPDPPP, PRD §8): su VALOR no vive en el código, ni en los seeds,
 * ni en las pruebas, ni en `.env.example` — solo el nombre de la variable,
 * con el mismo trato que `WHATSAPP_ADMIN`.
 */
export const VARIABLE_CORREO_DESTINO = "AVISOS_CORREO_DESTINO";

/** Lo poco que este módulo necesita del entorno. */
export type EntornoCorreo = Record<string, string | undefined>;

/** Todo lo que hace falta para mandar, ya leído y normalizado. */
export type ConfiguracionCorreo = {
  apiKey: string;
  remitente: string;
  destino: string;
  /** Dirección absoluta del panel: el único enlace que el correo lleva. */
  urlPanel: string;
};

const leer = (env: EntornoCorreo, nombre: string): string => (env[nombre] ?? "").trim();

/** Bloques IPv4 que no salen de la máquina, de la casa o de la oficina. */
const IPV4_NO_PUBLICA = [
  /^127\./, // loopback
  /^10\./, // privada clase A
  /^192\.168\./, // privada clase C
  /^172\.(1[6-9]|2\d|3[01])\./, // privada clase B
  /^169\.254\./, // link-local (APIPA)
  /^0\./, // "esta red": 0.0.0.0 y compañía
];

/** Sufijos de nombre que solo existen dentro de una red. */
const SUFIJOS_NO_PUBLICOS = [".localhost", ".local", ".internal", ".home", ".lan"];

/**
 * ¿Este host se puede abrir desde el celular del admin, con datos móviles?
 *
 * Es la pregunta que de verdad importa para el enlace del correo, y es más
 * estricta que "¿es localhost?": `http://localhost:3001` (porque el 3000
 * estaba ocupado), `http://127.0.0.1:3000`, `http://[::1]:3000` y
 * `http://192.168.1.50:3000` son igual de inservibles en la bandeja de
 * entrada, y una comparación contra la cadena literal del default los dejaba
 * pasar a todos (hallazgo MEDIO-2 de la etapa C).
 *
 * NO se reutiliza `esBaseLocal` de `src/lib/base-datos/conexion.ts` aunque se
 * parezca: aquella responde otra pregunta —"¿esta cadena de conexión de
 * PostgreSQL apunta a una base de juguete?"—, interpreta parámetros como
 * `?host=` y sockets Unix que aquí no existen, y su lista de hosts locales se
 * queda corta para esto (una IP privada no es "local" para ella, y aquí sí lo
 * es). Compartir la función acoplaría dos criterios que tienen que poder
 * cambiar por separado.
 *
 * Un nombre sin ningún punto (`http://mi-laptop/`) tampoco cuenta: los
 * dominios públicos siempre tienen al menos uno.
 */
export function esHostAlcanzableDesdeFuera(hostname: string): boolean {
  // `new URL(...).hostname` deja el IPv6 entre corchetes.
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "") return false;
  if (host === "localhost" || host === "::1" || host === "::") return false;
  if (SUFIJOS_NO_PUBLICOS.some((sufijo) => host.endsWith(sufijo))) return false;
  if (IPV4_NO_PUBLICA.some((bloque) => bloque.test(host))) return false;
  // IPv6 privadas (`fc00::/7`) y de enlace local (`fe80::/10`).
  if (/^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host)) return false;
  return host.includes(".") || host.includes(":");
}

/**
 * El enlace al panel, o `null` si no hay una URL pública en la que confiar.
 *
 * Ninguna dirección que solo funcione dentro de una red vale, ni siquiera en
 * desarrollo: el aviso llega a la bandeja de alguien y se abre desde un
 * celular. Por eso no basta con `urlSitio()`, que fuera de producción cae a la
 * dirección local a propósito para el resto del sitio.
 */
function urlDelPanel(env: EntornoCorreo): string | null {
  if (leer(env, VARIABLE_URL_SITIO) === "") return null;
  const origen = urlSitio(env);
  if (origen === null) return null;
  try {
    if (!esHostAlcanzableDesdeFuera(new URL(origen).hostname)) return null;
  } catch {
    return null;
  }
  return `${origen}/admin`;
}

/**
 * Las variables que faltan para poder mandar, en el orden en que se explican
 * en `docs/despliegue.md`. Lista vacía = se puede mandar.
 */
export function faltantesDeCorreo(env: EntornoCorreo = process.env): string[] {
  const faltan: string[] = [];
  for (const variable of [
    VARIABLE_CORREO_API_KEY,
    VARIABLE_CORREO_REMITENTE,
    VARIABLE_CORREO_DESTINO,
  ]) {
    if (leer(env, variable) === "") faltan.push(variable);
  }
  if (urlDelPanel(env) === null) faltan.push(VARIABLE_URL_SITIO);
  return faltan;
}

/** La configuración completa, o `null` si falta cualquier pieza. */
export function configuracionDeCorreo(
  env: EntornoCorreo = process.env,
): ConfiguracionCorreo | null {
  if (faltantesDeCorreo(env).length > 0) return null;
  return {
    apiKey: leer(env, VARIABLE_CORREO_API_KEY),
    remitente: leer(env, VARIABLE_CORREO_REMITENTE),
    destino: leer(env, VARIABLE_CORREO_DESTINO),
    urlPanel: urlDelPanel(env)!,
  };
}

let yaSeAvisoSinCorreo = false;

/**
 * Deja constancia en el log —UNA SOLA VEZ por proceso— de que el aviso diario
 * está apagado y de qué le falta para encenderse.
 *
 * Una vez y no por corrida: la tarea programada corre a diario y un proceso
 * puede atender varias peticiones; repetirlo convertiría el log en ruido y
 * entrenaría al operador a no leerlo.
 *
 * Es `warn` y no `error` a propósito (design.md §5): no configurar el correo
 * es una decisión legítima —en la máquina de quien desarrolla es lo normal— y
 * no un fallo que haya que atender.
 */
export function avisarCorreoSinConfigurarUnaVez(env: EntornoCorreo = process.env): void {
  if (yaSeAvisoSinCorreo) return;
  const faltan = faltantesDeCorreo(env);
  if (faltan.length === 0) return;
  yaSeAvisoSinCorreo = true;
  console.warn(
    `[aviso] el aviso diario de pendientes está apagado: falta ${faltan.join(", ")}. ` +
      "No se manda ningún correo; todo lo demás sigue igual (ver docs/despliegue.md §3.2).",
  );
}

/** Solo para pruebas: permite volver a observar el aviso. */
export function reiniciarAvisoDeCorreoSinConfigurar(): void {
  yaSeAvisoSinCorreo = false;
}
