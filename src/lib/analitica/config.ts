/**
 * Configuración de la medición cookieless (spec `layout-base`, requirement
 * "La medición cookieless se carga solo si está configurada, y sin ella el
 * sitio funciona igual"; design.md §2 del change `agregar-analitica-cookieless`).
 *
 * Fail-safe, con la misma disciplina que `src/lib/admin/config.ts`: una sola
 * función decide si hay medición. Si dice que no, el sitio no pinta ninguna
 * etiqueta `<script>`, no pide nada a ningún dominio externo y responde igual
 * que antes de este change.
 *
 * Dos detalles que NO son cosmética:
 *
 * 1. Las variables se leen con su NOMBRE LITERAL (`process.env.NEXT_PUBLIC_…`).
 *    Next sustituye las `NEXT_PUBLIC_*` por texto al construir el sitio; un
 *    acceso dinámico (`process.env[nombre]`) no se sustituye y quedaría
 *    `undefined` en el navegador. Por eso el módulo arma su propio objeto de
 *    entorno con las dos expresiones literales.
 * 2. `src` DEBE ser una URL absoluta `https:`. Una relativa no cargaría nada
 *    útil y `http:` dejaría el sitio pidiendo un script por texto claro.
 */

/** URL del script del proveedor (Umami Cloud: https://cloud.umami.is/script.js). */
export const VARIABLE_SRC = "NEXT_PUBLIC_UMAMI_SRC";
/** Identificador del sitio en el proveedor. No es un secreto: viaja en el HTML. */
export const VARIABLE_WEBSITE_ID = "NEXT_PUBLIC_UMAMI_WEBSITE_ID";

/** Lo poco que este módulo necesita del entorno. */
export type EntornoAnalitica = Record<string, string | undefined>;

export type ConfiguracionAnalitica = {
  /** URL absoluta `https:` del script del proveedor. */
  src: string;
  /** Identificador del sitio, tal como lo da el proveedor. */
  websiteId: string;
};

/**
 * El entorno visible para este módulo. Las dos lecturas literales viven aquí
 * y en ningún otro lado, para que Next las sustituya en el build.
 */
function entornoDelProceso(): EntornoAnalitica {
  return {
    [VARIABLE_SRC]: process.env.NEXT_PUBLIC_UMAMI_SRC,
    [VARIABLE_WEBSITE_ID]: process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID,
  };
}

function valor(env: EntornoAnalitica, nombre: string): string {
  return (env[nombre] ?? "").trim();
}

function esSrcValido(src: string): boolean {
  try {
    return new URL(src).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * `true` cuando ninguna de las dos variables está puesta: el caso normal de un
 * sitio que todavía no conecta la analítica. No se avisa nada, porque no hay
 * ningún error que reportar.
 */
function sinConfigurarDeltodo(env: EntornoAnalitica): boolean {
  return valor(env, VARIABLE_SRC) === "" && valor(env, VARIABLE_WEBSITE_ID) === "";
}

/**
 * Qué falta o qué está mal, o `null` si la configuración está completa o si
 * simplemente no hay ninguna variable puesta (que no es un error).
 *
 * Nombra la VARIABLE, nunca su valor: el mensaje va al log del servidor y no
 * tiene por qué repetir lo que alguien configuró mal.
 */
export function motivoConfiguracionIncompleta(
  env: EntornoAnalitica = entornoDelProceso(),
): string | null {
  if (sinConfigurarDeltodo(env)) return null;

  const problemas: string[] = [];
  const src = valor(env, VARIABLE_SRC);
  if (src === "") {
    problemas.push(`${VARIABLE_SRC} (sin definir o vacía)`);
  } else if (!esSrcValido(src)) {
    problemas.push(`${VARIABLE_SRC} (no es una URL absoluta https:)`);
  }
  if (valor(env, VARIABLE_WEBSITE_ID) === "") {
    problemas.push(`${VARIABLE_WEBSITE_ID} (sin definir o vacía)`);
  }
  return problemas.length === 0 ? null : `revisa ${problemas.join(", ")}`;
}

let yaSeAvisoConfiguracionIncompleta = false;

/**
 * Deja en el log —UNA SOLA VEZ por proceso— que la configuración quedó a
 * medias. Una vez y no por petición: todas las páginas públicas pasan por
 * aquí, así que un despliegue mal configurado inundaría el log. Mismo criterio
 * que `src/lib/admin/config.ts` y `src/lib/registro/limite-ip.ts`.
 */
function avisarUnaVez(motivo: string): void {
  if (yaSeAvisoConfiguracionIncompleta) return;
  yaSeAvisoConfiguracionIncompleta = true;
  console.warn(`[analitica] no se carga la medición, ${motivo}`);
}

/**
 * La configuración de la medición, o `null` si no hay que cargar nada. Es la
 * ÚNICA puerta de entrada a esas dos variables: nadie más las lee.
 */
export function configuracionAnalitica(
  env: EntornoAnalitica = entornoDelProceso(),
): ConfiguracionAnalitica | null {
  const motivo = motivoConfiguracionIncompleta(env);
  if (motivo !== null) {
    avisarUnaVez(motivo);
    return null;
  }
  if (sinConfigurarDeltodo(env)) return null;

  return {
    src: valor(env, VARIABLE_SRC),
    websiteId: valor(env, VARIABLE_WEBSITE_ID),
  };
}

/** Solo para pruebas: permite volver a observar el aviso de configuración. */
export function reiniciarAvisoDeAnalitica(): void {
  yaSeAvisoConfiguracionIncompleta = false;
}
