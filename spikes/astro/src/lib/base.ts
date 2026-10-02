/**
 * ¿Se puede abrir la base sin caer a una conexión sin verificar? (spec
 * `spike-astro`, requirement "El spike lee de PostgreSQL con TLS
 * verificado"). Contra una base remota se exige `sslmode=verify-full` y un
 * `sslrootcert` que exista en el disco de la función; si falta cualquiera, la
 * página falla a la vista. Contra una base de esta máquina no se exige TLS,
 * igual que en la app (`src/lib/base-datos/conexion.ts`).
 */
export type MotivoSinBase = "sin-url" | "sin-verificacion" | "sin-certificado" | "no-interpretable";
export type RevisionConexion = { ok: true } | { ok: false; motivo: MotivoSinBase };

const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function revisarConexion(
  url: string | undefined,
  existeArchivo: (ruta: string) => boolean,
): RevisionConexion {
  const cadena = (url ?? "").trim();
  if (cadena === "") return { ok: false, motivo: "sin-url" };

  let interpretada: URL;
  try {
    interpretada = new URL(cadena);
  } catch {
    return { ok: false, motivo: "no-interpretable" };
  }
  const parametros = interpretada.searchParams;
  // `?host=` y `?hostaddr=` cambian el destino real sin cambiar el hostname
  // de la URL (hallazgo A1 de la app): ante la duda, no se abre.
  if (!/^postgres(ql)?:$/.test(interpretada.protocol) || parametros.has("host") || parametros.has("hostaddr")) {
    return { ok: false, motivo: "no-interpretable" };
  }
  // `pg` se queda con el ÚLTIMO valor de un parámetro repetido y aquí se lee
  // el primero (hallazgo M1): un `sslmode`/`sslrootcert` repetido no se abre.
  if (parametros.getAll("sslmode").length > 1 || parametros.getAll("sslrootcert").length > 1) {
    return { ok: false, motivo: "no-interpretable" };
  }
  if (HOSTS_LOCALES.has(interpretada.hostname.toLowerCase())) return { ok: true };

  if (parametros.get("sslmode") !== "verify-full") return { ok: false, motivo: "sin-verificacion" };
  const certificado = parametros.get("sslrootcert");
  if (!certificado || !existeArchivo(certificado)) return { ok: false, motivo: "sin-certificado" };
  return { ok: true };
}

/** Lo que ve quien abre la página cuando la base no se puede abrir. */
export const MENSAJE_SIN_BASE = "No pudimos leer los negocios en este momento.";
