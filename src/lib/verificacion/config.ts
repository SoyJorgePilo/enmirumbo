/**
 * Configuración de la verificación del número por SMS (spec `registro-negocio`
 * de T-016, requirement "La verificación por SMS solo existe si está encendida
 * y completamente configurada"; ADR-011, design.md §4).
 *
 * ES EL REQUIREMENT REY DEL CHANGE. Una sola función decide si la capacidad
 * existe, y todo lo demás le pregunta a ella UNA vez: no hay ningún
 * `if (process.env.…)` regado por el código. Si dice "apagada", no existe la
 * ruta del código, no se construye el adaptador del proveedor, no se importa
 * su SDK, no sale ninguna petición a la red y ninguna pantalla —pública o del
 * panel— cambia un byte respecto de hoy.
 *
 * Mismo molde que `src/lib/admin/config.ts` y `src/lib/analitica/config.ts`,
 * con dos diferencias que sí son del requirement:
 *
 * 1. **La bandera vale `1` y nada más.** Ni "true", ni "sí", ni "cualquier
 *    cosa no vacía": un valor tipeado a medias no debe encender un canal que
 *    cuesta dinero por mensaje (design.md §4).
 * 2. **Sin bandera no hay advertencia.** Tener las credenciales puestas y la
 *    bandera apagada es el estado normal de quien preparó el despliegue y
 *    todavía no enciende — no es un error que reportar. La advertencia es
 *    solo para la configuración A MEDIAS: bandera encendida y algo faltando.
 *
 * El log nombra la VARIABLE, nunca su valor ni parte de él (requirement "Ni el
 * código ni las credenciales aparecen en URLs, logs ni pantallas"), y avisa
 * UNA SOLA VEZ por proceso: el formulario de registro es público, así que un
 * despliegue mal configurado no puede convertirse en una forma de inundar el
 * log del servidor sin autenticarse.
 *
 * Módulo puro: recibe el entorno como parámetro (por defecto `process.env`),
 * así que se prueba sin ensuciar el proceso ni exigir credenciales de nadie.
 */

/** Interruptor de la capacidad. Solo el valor exacto `1` la enciende. */
export const VARIABLE_BANDERA = "VERIFICACION_SMS_ACTIVA";
/** El único valor que enciende la capacidad. */
export const VALOR_BANDERA_ENCENDIDA = "1";

/** Identificador de la cuenta del proveedor. SECRETO: nunca se commitea. */
export const VARIABLE_TWILIO_SID = "TWILIO_ACCOUNT_SID";
/** Token de la cuenta del proveedor. SECRETO. */
export const VARIABLE_TWILIO_AUTH_TOKEN = "TWILIO_AUTH_TOKEN";
/** Identificador del servicio de Verify. SECRETO. */
export const VARIABLE_TWILIO_SERVICE_SID = "TWILIO_VERIFY_SERVICE_SID";

/**
 * Secreto con el que el servidor firma la cookie de paso (HMAC-SHA256).
 *
 * PROPIO, no derivado del token del proveedor (design.md §3, duda 1 resuelta
 * en la aprobación): rotar una credencial de Twilio no tiene por qué tirar
 * verificaciones en curso, ni al revés, y usar un secreto de un tercero para
 * un propósito que ese tercero no conoce es el tipo de acoplamiento que
 * después nadie recuerda.
 */
export const VARIABLE_SECRETO = "VERIFICACION_SMS_SECRETO";

/** Cuántas verificaciones se pueden iniciar por día. Opcional. */
export const VARIABLE_TOPE_DIARIO = "VERIFICACION_SMS_TOPE_DIARIO";

/**
 * Mismo mínimo que el secreto de sesión del panel: 32 caracteres es lo que
 * produce `openssl rand -base64 24`. Por debajo, el HMAC se adivina por fuerza
 * bruta con una cookie en la mano.
 */
export const LONGITUD_MINIMA_SECRETO_VERIFICACION = 32;

/** Tope diario global por defecto (duda 2 aprobada en la propuesta). */
export const TOPE_DIARIO_POR_DEFECTO = 50;

/** Lo poco que este módulo necesita del entorno. */
export type EntornoVerificacion = Record<string, string | undefined>;

export type ConfiguracionVerificacion = {
  cuentaSid: string;
  authToken: string;
  servicioSid: string;
  /** Secreto de firma de la cookie de paso. */
  secreto: string;
  /** Verificaciones que se pueden iniciar en un día, en este proceso. */
  topeDiario: number;
};

function valor(env: EntornoVerificacion, nombre: string): string {
  return (env[nombre] ?? "").trim();
}

/** La bandera está en el único valor que enciende la capacidad. */
function banderaEncendida(env: EntornoVerificacion): boolean {
  // Sin `.trim()` en la comparación: `"1 "` es un valor tipeado a medias y no
  // enciende nada. Se lee crudo a propósito.
  return (env[VARIABLE_BANDERA] ?? "") === VALOR_BANDERA_ENCENDIDA;
}

/**
 * Qué falta cuando la bandera está encendida, o `null` si está todo puesto —
 * o si la bandera está apagada, que no es un error.
 *
 * Nombra la VARIABLE, nunca su valor: esto va al log del servidor y jamás a
 * una respuesta.
 */
export function motivoConfiguracionIncompleta(
  env: EntornoVerificacion = process.env,
): string | null {
  if (!banderaEncendida(env)) return null;

  const faltantes: string[] = [];
  for (const nombre of [
    VARIABLE_TWILIO_SID,
    VARIABLE_TWILIO_AUTH_TOKEN,
    VARIABLE_TWILIO_SERVICE_SID,
  ]) {
    if (valor(env, nombre) === "") faltantes.push(`${nombre} (sin definir o vacía)`);
  }
  if (valor(env, VARIABLE_SECRETO).length < LONGITUD_MINIMA_SECRETO_VERIFICACION) {
    faltantes.push(
      `${VARIABLE_SECRETO} (sin definir o de menos de ${LONGITUD_MINIMA_SECRETO_VERIFICACION} caracteres)`,
    );
  }
  return faltantes.length === 0 ? null : `falta configurar: ${faltantes.join(", ")}`;
}

/**
 * El tope diario del entorno, o el de por defecto. Un valor inválido NO apaga
 * la capacidad: cae en el default, que es la lectura segura (un tope existe
 * igual). Solo enteros positivos escritos como tales: `12.5`, `1e3` y `-5` no
 * son un tope de mensajes.
 */
function topeDiarioConfigurado(env: EntornoVerificacion): number {
  const crudo = valor(env, VARIABLE_TOPE_DIARIO);
  if (!/^\d+$/.test(crudo)) return TOPE_DIARIO_POR_DEFECTO;
  const numero = Number(crudo);
  return numero > 0 ? numero : TOPE_DIARIO_POR_DEFECTO;
}

let yaSeAvisoConfiguracionIncompleta = false;

/**
 * Deja en el log —UNA SOLA VEZ por proceso— que la configuración quedó a
 * medias, sin detener el arranque y sin romper ninguna página: el
 * comportamiento sigue siendo el de apagado.
 */
function avisarUnaVez(motivo: string): void {
  if (yaSeAvisoConfiguracionIncompleta) return;
  yaSeAvisoConfiguracionIncompleta = true;
  console.warn(`[verificacion] la verificación por SMS queda apagada, ${motivo}`);
}

/**
 * La configuración completa, o `null` si la capacidad está apagada. Es la
 * ÚNICA puerta de entrada a estas variables: nadie más las lee del entorno.
 */
export function leerConfiguracionVerificacion(
  env: EntornoVerificacion = process.env,
): ConfiguracionVerificacion | null {
  if (!banderaEncendida(env)) return null;

  const motivo = motivoConfiguracionIncompleta(env);
  if (motivo !== null) {
    avisarUnaVez(motivo);
    return null;
  }

  return {
    cuentaSid: valor(env, VARIABLE_TWILIO_SID),
    authToken: valor(env, VARIABLE_TWILIO_AUTH_TOKEN),
    servicioSid: valor(env, VARIABLE_TWILIO_SERVICE_SID),
    secreto: valor(env, VARIABLE_SECRETO),
    topeDiario: topeDiarioConfigurado(env),
  };
}

/** Atajo de lectura para las superficies que solo necesitan el sí o el no. */
export function verificacionEncendida(env: EntornoVerificacion = process.env): boolean {
  return leerConfiguracionVerificacion(env) !== null;
}

/** Solo para pruebas: permite volver a observar el aviso de configuración. */
export function reiniciarAvisoDeVerificacion(): void {
  yaSeAvisoConfiguracionIncompleta = false;
}
