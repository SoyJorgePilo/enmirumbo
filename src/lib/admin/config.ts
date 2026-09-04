/**
 * Configuración del panel de revisión (spec `revision-admin`, requirement
 * "Sin contraseña configurada el panel no abre (fail-safe)"; design.md §2 y
 * §7 del change `agregar-panel-admin`).
 *
 * Una sola función decide si el panel está configurado. Si dice que no:
 * ninguna pantalla se muestra, ninguna sesión se crea y ninguna transición se
 * ejecuta. NO existe contraseña por defecto ni modo que salte el acceso en
 * desarrollo: un panel que se abre solo en algún modo es un panel abierto, y
 * el error de configuración en producción es justo lo que esto atrapa.
 *
 * Módulo puro: recibe el entorno como parámetro (por defecto `process.env`),
 * así que se puede probar sin ensuciar el proceso. Nunca escribe la
 * contraseña ni el secreto en el log — solo el NOMBRE de la variable que
 * falta, y eso solo va al log del servidor, jamás a la respuesta.
 */

import { URL_SITIO_LOCAL, VARIABLE_URL_SITIO, urlSitio } from "@/lib/sitio";

/** Contraseña única del panel (PRD §6.3): sin cuentas, sin correo. */
export const VARIABLE_CONTRASENA = "PANEL_CONTRASENA";
/** Secreto con el que se firman las cookies de sesión (HMAC-SHA256). */
export const VARIABLE_SECRETO_SESION = "PANEL_SESION_SECRETO";

/**
 * La URL pública del sitio se mudó a `src/lib/sitio.ts` (change
 * `agregar-seo-local`, design.md §5): el panel ya no es el único que la
 * necesita —también el sitemap, las canónicas y la vista previa al
 * compartir—, y su comportamiento no cambió. Se reexporta para que quien
 * llamaba al panel siga llamando igual.
 */
export { URL_SITIO_LOCAL, VARIABLE_URL_SITIO, urlSitio };

/**
 * Longitud mínima del secreto de firma. 32 caracteres es lo que produce
 * `openssl rand -base64 24`; por debajo de eso el HMAC se puede adivinar por
 * fuerza bruta con el token público en la mano.
 */
export const LONGITUD_MINIMA_SECRETO = 32;

/** Lo poco que este módulo necesita del entorno. */
export type EntornoPanel = Record<string, string | undefined>;

export type ConfiguracionPanel = {
  contrasena: string;
  secreto: string;
};

function valor(env: EntornoPanel, nombre: string): string {
  return env[nombre] ?? "";
}

/**
 * Nombres de las variables que faltan (para el log del servidor), o `null` si
 * el panel está completo. El detalle NUNCA viaja en la respuesta: a quien
 * está afuera no se le dice si falta la contraseña o el secreto, que es
 * información gratis para preparar un ataque (design.md §2).
 */
export function motivoSinConfigurar(env: EntornoPanel = process.env): string | null {
  const faltantes: string[] = [];
  if (valor(env, VARIABLE_CONTRASENA).trim() === "") {
    faltantes.push(`${VARIABLE_CONTRASENA} (sin definir o vacía)`);
  }
  if (valor(env, VARIABLE_SECRETO_SESION).length < LONGITUD_MINIMA_SECRETO) {
    faltantes.push(
      `${VARIABLE_SECRETO_SESION} (sin definir o de menos de ${LONGITUD_MINIMA_SECRETO} caracteres)`,
    );
  }
  return faltantes.length === 0 ? null : `falta configurar: ${faltantes.join(", ")}`;
}

/**
 * Contraseña y secreto, o `null` si el panel no está configurado. Es la
 * ÚNICA puerta de entrada a esos dos valores: nadie más los lee del entorno.
 */
export function leerConfiguracionPanel(
  env: EntornoPanel = process.env,
): ConfiguracionPanel | null {
  if (motivoSinConfigurar(env) !== null) return null;
  return {
    // Sin `.trim()`: una contraseña puede llevar espacios a propósito y
    // recortarlos silenciosamente cambiaría la que el admin escribió.
    contrasena: valor(env, VARIABLE_CONTRASENA),
    secreto: valor(env, VARIABLE_SECRETO_SESION),
  };
}

export function estaConfigurado(env: EntornoPanel = process.env): boolean {
  return leerConfiguracionPanel(env) !== null;
}

let yaSeAvisoSinConfigurar = false;

/**
 * Deja en el log —UNA SOLA VEZ por proceso— qué falta por configurar.
 *
 * Una vez y no por petición (hallazgo BAJO 3 de la etapa C): la pantalla de
 * acceso es pública, así que un despliegue mal configurado le daría a
 * cualquiera una forma de inundar el log del servidor sin autenticarse. Mismo
 * criterio que el aviso de `src/lib/registro/limite-ip.ts`.
 */
export function avisarSinConfigurarUnaVez(env: EntornoPanel = process.env): void {
  const motivo = motivoSinConfigurar(env);
  if (!motivo || yaSeAvisoSinConfigurar) return;
  yaSeAvisoSinConfigurar = true;
  console.warn(`[panel] el panel no abre, ${motivo}`);
}

/** Solo para pruebas: permite volver a observar el aviso de configuración. */
export function reiniciarAvisoDeConfiguracion(): void {
  yaSeAvisoSinConfigurar = false;
}

