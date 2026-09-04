/**
 * Cómo interpreta el DRIVER la dirección de la base, en un solo lugar.
 *
 * Iteración 2 del change `preparar-deploy-produccion`, hallazgos A1 y A2 de la
 * etapa C. Las dos preguntas que este módulo contesta —"¿a qué host se conecta
 * de verdad?" y "¿va cifrado?"— parecen de leer una URL y no lo son:
 *
 * 1. **El host de la URL no es necesariamente el host al que se conecta.** Una
 *    cadena de conexión de PostgreSQL admite el parámetro `?host=`, y el
 *    driver le hace caso por encima del `hostname` de la URL. Es decir:
 *    `postgresql://…@localhost:5432/x?host=db.supabase.co` **se conecta a
 *    Supabase** mientras `new URL(...).hostname` dice `localhost`. Con esa
 *    ambigüedad, la guarda que impide sembrar negocios de mentira en la base
 *    de verdad se saltaba con un parámetro estándar.
 * 2. **`pg` NO cifra salvo que la cadena lo pida** (`pg.defaults.ssl === false`).
 *    El motor Rust de Prisma usaba `sslmode=prefer`; al mudarnos al adaptador
 *    de driver heredamos el default de `pg`, que es texto claro.
 *
 * Por eso aquí no se parsea a mano: se usa `pg-connection-string`, que es
 * literalmente el parser que `pg` tiene debajo. Si algún día el driver cambia
 * de opinión, cambia con él y no con nuestra copia.
 */
import { parse } from "pg-connection-string";

/** Lo que el driver entiende de una dirección de base de datos. */
export type ConexionInterpretada = {
  /** El host al que se conectaría de verdad, ya resuelto el `?host=`. */
  host: string | null;
  /** ¿La cadena pide TLS **de verdad**? `pg` no lo negocia si no se lo piden. */
  cifrada: boolean;
  /** `true` si la cadena trae algo que no sabemos interpretar con seguridad. */
  sospechosa: boolean;
  /**
   * ¿El "host" es en realidad la ruta de un socket Unix?
   *
   * Un socket es un archivo de esta máquina: los bytes no llegan a ninguna
   * tarjeta de red, así que exigirle TLS no tiene sentido (hallazgo B8). NO
   * cuenta como "base local" para las guardas de los comandos que escriben en
   * masa — eso se decide por el host, y de una ruta de socket no se sabe a qué
   * servidor lleva (ver `esBaseLocal`).
   */
  esSocketUnix: boolean;
};

/** Hosts que cuentan como "la máquina de quien corre el comando". */
const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Modos de `sslmode` que NO garantizan cifrado, aunque `pg` los acepte hoy.
 *
 * Hallazgo B7: en la versión actual de `pg`, `prefer` y `allow` se tratan como
 * `verify-full` —el propio driver avisa por consola de que es temporal— pero
 * **en `pg` v9 adoptarán la semántica de libpq**, donde `prefer` intenta
 * cifrar y, si el servidor dice que no, **sigue en texto claro**. El día de esa
 * actualización una cadena con `prefer` pasaría el filtro sin cifrar nada, y el
 * fallo sería silencioso: exactamente el mismo agujero de A2, reabierto por una
 * subida de versión. Se rechazan desde ahora.
 */
const MODOS_QUE_NO_GARANTIZAN_CIFRADO = new Set(["prefer", "allow", "disable"]);

/** El `sslmode` que pide la cadena, en minúsculas, o `null` si no lo declara. */
function modoTlsDeclarado(cadena: string): string | null {
  const encontrado = /[?&]sslmode=([^&#]*)/i.exec(cadena);
  return encontrado ? decodeURIComponent(encontrado[1]).trim().toLowerCase() : null;
}

/** Lo que se responde cuando la dirección no se puede interpretar con seguridad. */
const NO_INTERPRETABLE: ConexionInterpretada = {
  host: null,
  cifrada: false,
  sospechosa: true,
  esSocketUnix: false,
};

/**
 * Qué entiende el driver de esta dirección.
 *
 * Ante cualquier duda —una cadena que no se puede interpretar, o que trae
 * `hostaddr`, que `pg` no honra pero libpq sí— se responde de la forma CARA:
 * host desconocido (o sea, no local) y sin cifrar. Una guarda que falla
 * abierta no es una guarda.
 */
export function interpretarConexion(url: string | undefined): ConexionInterpretada {
  const cadena = (url ?? "").trim();
  if (cadena === "") return NO_INTERPRETABLE;

  // `hostaddr` es sintaxis válida de libpq que fija la dirección numérica y
  // deja `host` como mero nombre para el certificado. `pg` no lo implementa,
  // así que una cadena que lo traiga significa cosas distintas según quién la
  // lea: se rechaza en vez de adivinar.
  if (/[?&]hostaddr=/i.test(cadena)) return NO_INTERPRETABLE;

  // Este proyecto solo habla PostgreSQL (ADR-004). Cualquier otro esquema
  // —`mysql:`, `prisma:`, `libsql:`, `https:`, o el `file:` de la era SQLite—
  // es una dirección que el driver no sabría usar, y `pg-connection-string`
  // la parsearía igual devolviendo un host que no significa nada.
  if (!/^postgres(ql)?:\/\//i.test(cadena)) return NO_INTERPRETABLE;

  try {
    const configuracion = parse(cadena);
    const host = (configuracion.host ?? "").trim();
    const esSocketUnix = host.startsWith("/");
    const modo = modoTlsDeclarado(cadena);
    return {
      // Una ruta de socket distingue mayúsculas y un nombre de host no: la
      // ruta se deja tal cual y el nombre se normaliza.
      host: host === "" ? null : esSocketUnix ? host : host.toLowerCase(),
      cifrada:
        Boolean(configuracion.ssl) &&
        (modo === null || !MODOS_QUE_NO_GARANTIZAN_CIFRADO.has(modo)),
      sospechosa: false,
      esSocketUnix,
    };
  } catch {
    return NO_INTERPRETABLE;
  }
}

/**
 * ¿La base a la que apunta esta dirección vive en la máquina de quien la usa?
 *
 * Se pregunta por el host EFECTIVO —el que resolvería el driver—, no por el
 * que se lee en la URL (hallazgo A1).
 *
 * UN SOCKET UNIX NO CUENTA COMO LOCAL, y es una decisión, no un descuido
 * (hallazgo B8). Un socket no sale de la máquina, cierto; pero esta función la
 * usan las guardas de los comandos que escriben EN MASA —sembrar doce negocios
 * de mentira, reescribir el texto de búsqueda de TODAS las fichas—, y ahí lo
 * que se pregunta de verdad es "¿estoy seguro de que esta base es de juguete?".
 * De una ruta de socket no se puede saber a qué servidor lleva: puede ser un
 * túnel SSH, un contenedor con la base de producción montada o un `pgbouncer`
 * delante de Supabase. Quien de verdad trabaje por socket tiene la salida
 * documentada y explícita —`SEED_DEMO_PERMITIR=1` / `BACKFILL_PERMITIR=1`,
 * `docs/despliegue.md` §3.4—, que es una decisión consciente en vez de un
 * default silencioso. Para el TLS sí se trata como lo que es y no se le exige
 * cifrado (ver `motivoDeConexionInsegura`).
 */
export function esBaseLocal(url: string | undefined): boolean {
  const { host, sospechosa } = interpretarConexion(url);
  if (sospechosa || host === null) return false;
  return HOSTS_LOCALES.has(host);
}

/** Nombre del parámetro que enciende TLS, para nombrarlo en los mensajes. */
export const PARAMETRO_TLS = "sslmode";

/**
 * Razón por la que esta dirección NO se puede usar sin cifrar, o `null` si no
 * hay problema.
 *
 * Contra una base de esta máquina no hace falta TLS: los bytes no salen del
 * equipo. Contra cualquier otra, sí: por ese canal viajan los nombres, los
 * WhatsApp, las direcciones y los motivos de rechazo de todos los negocios del
 * directorio (PRD §8, LFPDPPP), y además la contraseña de la base cada vez que
 * alguien corre una migración.
 */
export function motivoDeConexionInsegura(url: string | undefined): string | null {
  const { host, cifrada, sospechosa, esSocketUnix } = interpretarConexion(url);
  if (!sospechosa && host !== null && HOSTS_LOCALES.has(host)) return null;
  // Un socket Unix es un archivo de esta máquina: los bytes no llegan a ninguna
  // tarjeta de red, así que no hay nada que cifrar (hallazgo B8). Exigirle TLS
  // dejaba al sistema sin arrancar y con una instrucción que no arregla nada,
  // que es peor que no comprobar: quien la siga acaba poniendo `sslmode` a algo
  // para que el error desaparezca.
  if (!sospechosa && esSocketUnix) return null;
  if (cifrada) return null;

  const donde = sospechosa || host === null ? "una dirección que no se puede interpretar" : host;
  const porque =
    modoTlsDeclarado((url ?? "").trim()) !== null
      ? `el ${PARAMETRO_TLS} que trae no garantiza cifrado ("disable" no cifra; "prefer" y ` +
        '"allow" aceptan texto claro como respaldo, y así se van a comportar en pg v9)'
      : `el driver pg no negocia TLS salvo que la dirección lo pida`;

  return (
    `la conexión a la base (${donde}) viajaría SIN CIFRAR: ${porque}. ` +
    `Agrega ${PARAMETRO_TLS}=require a DATABASE_URL (ver docs/despliegue.md §3.4). ` +
    "Por ese canal van los datos personales de todos los negocios. " +
    "Si tu base es un socket Unix, pon su ruta en ?host= (por ejemplo " +
    "?host=/var/run/postgresql): así no se pide cifrado, porque la conexión no " +
    "sale de la máquina."
  );
}
