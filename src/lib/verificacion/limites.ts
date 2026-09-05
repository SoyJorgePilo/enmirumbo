/**
 * Anti-abuso del canal de SMS (spec `registro-negocio` de T-016, requirement
 * "El canal de SMS cuesta dinero y está acotado por cupo, cooldown y tope
 * diario"; design.md §6).
 *
 * Cada verificación se paga POR MENSAJE (ADR-011, ~$0.05 USD a México más los
 * requisitos A2P). Eso cambia el criterio respecto de los otros cupos del
 * sitio: el umbral de altas diarias del PRD §8 solo AVISA, y aquí el tope
 * diario además CORTA, porque lo que se protege es dinero que se gasta solo y
 * cortar degrada al flujo manual, que es un flujo completo y bueno.
 *
 * Qué acota qué (design.md §6, con la corrección del hallazgo [C-2] de la
 * etapa C: los tres topes POR REGISTRO ya no viven en la cookie del cliente):
 *
 *   | Defensa                        | Qué evita                        | Dónde vive        |
 *   | Cupo de códigos por IP (3/h)   | multiplicar SMS desde una IP     | aquí, en memoria  |
 *   | Cooldown 60 s, máx. 2 reenvíos | machacar "Reenviar"              | aquí, en la base  |
 *   | Máx. 5 códigos escritos        | adivinar el código a fuerza bruta| aquí, en la base  |
 *   | Tope diario global (50)        | una noche mala = una factura     | aquí, en memoria  |
 *
 * CONTADOR PROPIO, separado del de altas y del de reportes (requirement "con
 * su propio conteo… agotar uno no consume los otros"): en un municipio con
 * mucho NAT compartido, compartirlo dejaría a un vecino sin poder registrar su
 * negocio porque otro pidió códigos desde la misma casa.
 *
 * PROVISIONAL A SABIENDAS, igual que los otros dos cupos en memoria: el
 * conteo vive en la memoria del proceso, así que con varias instancias el
 * gasto real puede ser hasta N veces el tope. Queda escrito como advertencia
 * de costo en la sección de activación de `docs/despliegue.md`, y se paga
 * junto con los demás cuando E0-3 defina almacén compartido.
 *
 * No se registra ningún dato del negocio: solo marcas de tiempo por IP y un
 * conteo del día.
 */

import {
  apartarCupoCompartido,
  cupoCompartidoAgotado,
  type ClienteCupos,
  type SolicitudDeCupo,
} from "@/lib/cupos/compartido";
import { crearCupoPorIp, VENTANA_LIMITE_MS, type CupoPorIp } from "@/lib/registro/limite-ip";

/** Códigos pedidos por hora y por IP (duda 2 aprobada en la propuesta). */
export const CODIGOS_POR_IP_POR_HORA = 3;

/** Misma ventana de una hora que el cupo de altas y el de reportes. */
export const VENTANA_CODIGOS_MS = VENTANA_LIMITE_MS;

/** Espera mínima entre un SMS y el siguiente para el mismo registro. */
export const COOLDOWN_REENVIO_MS = 60_000;

/** Reenvíos que admite un registro, sin contar el SMS inicial. */
export const MAX_REENVIOS_POR_REGISTRO = 2;

/** Códigos que se pueden escribir para un mismo registro. */
export const MAX_INTENTOS_POR_REGISTRO = 5;

/**
 * Ventana de los topes POR REGISTRO. Es —a propósito— la misma que dura la
 * cookie de paso: pasados los 15 minutos no queda pantalla del código desde la
 * que intentar nada, así que "por registro" y "en esta ventana" son lo mismo.
 * `paso.ts` toma su caducidad de aquí para que las dos no se puedan separar.
 */
export const VENTANA_TOPES_POR_REGISTRO_MS = 15 * 60 * 1000;

/** Mapa propio, separado del de altas, el de reportes y el del panel. */
const cupoDeCodigos = crearCupoPorIp({
  maximo: CODIGOS_POR_IP_POR_HORA,
  ventanaMs: VENTANA_CODIGOS_MS,
});

/**
 * Comprueba el cupo de códigos de esta IP Y lo aparta **en un solo paso
 * síncrono**. Es la única forma de pedir cupo que debe usar el servidor.
 *
 * Sin `await` entre comprobar y apartar no se cede el turno a la mitad: ocho
 * peticiones simultáneas no leen todas el mismo "sí hay" (mismo criterio y
 * misma razón que `apartarCupoDeReportes`).
 *
 * Sin IP —`REGISTRO_ENCABEZADO_IP` sin declarar— este cupo simplemente no
 * aplica, como ya pasa con el de altas: confiar en un encabezado que escribe
 * quien manda la petición es peor que no tener límite. El cooldown, el tope de
 * reenvíos y el tope diario siguen operando (scenario "sin encabezado de IP
 * declarado").
 */
export function apartarCupoDeCodigos(ip: string | null, ahora: Date = new Date()): boolean {
  if (cupoDeCodigos.bloqueada(ip, ahora)) return false;
  cupoDeCodigos.registrar(ip, ahora);
  return true;
}

/** Solo lectura, para pruebas y diagnóstico. Para decidir, `apartar…`. */
export function cupoDeCodigosAgotado(ip: string | null, ahora: Date = new Date()): boolean {
  return cupoDeCodigos.bloqueada(ip, ahora);
}

/** Solo para pruebas: vacía el conteo de códigos del proceso. */
export function reiniciarCupoDeCodigos(): void {
  cupoDeCodigos.reiniciar();
}

// ── Tope diario global ─────────────────────────────────────────────────────

/** Conteo del día en curso, en memoria del proceso. */
let diaEnCurso = "";
let verificacionesDelDia = 0;
let yaSeAvisoDelTope = false;

/** Clave del día natural del servidor: dos fechas distintas, dos contadores. */
function claveDelDia(ahora: Date): string {
  return `${ahora.getFullYear()}-${ahora.getMonth()}-${ahora.getDate()}`;
}

function ponerseAlDia(ahora: Date): void {
  const dia = claveDelDia(ahora);
  if (dia === diaEnCurso) return;
  diaEnCurso = dia;
  verificacionesDelDia = 0;
  yaSeAvisoDelTope = false;
}

/**
 * ¿Ya se llegó al tope diario? Solo lectura; para decidir, `apartarTopeDiario`.
 */
export function topeDiarioAlcanzado(tope: number, ahora: Date = new Date()): boolean {
  ponerseAlDia(ahora);
  return verificacionesDelDia >= tope;
}

/**
 * Aparta una verificación del tope del día, o devuelve `false` si ya se
 * alcanzó. Al alcanzarlo deja UNA alerta en el log —con la misma forma que la
 * alerta de altas diarias del PRD §8—, y a partir de ahí deja de pedir códigos:
 * los envíos siguientes terminan en la pantalla de gracias, como si la
 * capacidad estuviera apagada.
 *
 * La alerta lleva conteos, nunca un número de nadie.
 */
export function apartarTopeDiario(tope: number, ahora: Date = new Date()): boolean {
  ponerseAlDia(ahora);
  if (verificacionesDelDia >= tope) {
    if (!yaSeAvisoDelTope) {
      yaSeAvisoDelTope = true;
      console.warn(
        `[verificacion] alerta: se alcanzó el tope diario de ${tope} verificaciones; no se piden más códigos hoy y el registro sigue funcionando igual.`,
      );
    }
    return false;
  }
  verificacionesDelDia += 1;
  return true;
}

/** Solo para pruebas: vuelve a empezar el día. */
export function reiniciarTopeDiario(): void {
  diaEnCurso = "";
  verificacionesDelDia = 0;
  yaSeAvisoDelTope = false;
}

// ── Topes POR REGISTRO, anclados en el servidor ────────────────────────────
//
// HALLAZGO [C-2] de la etapa C, cerrado aquí. Antes, los contadores de
// intentos y reenvíos —y la marca del último envío— vivían ÍNTEGROS dentro de
// la cookie firmada que se le entrega al cliente. La firma impide fabricar una
// cookie, pero no impide **reusar la que el propio servidor emitió**: quien
// guardaba su primera cookie (`intentos: 0`, `reenvios: 0`) y la reenviaba
// siempre, rebobinaba los tres contadores. Con `REGISTRO_ENCABEZADO_IP` sin
// declarar —un despliegue válido según la propia spec— eso permitía consumir
// el TOPE DIARIO GLOBAL entero desde un solo registro: dinero del fundador, y
// todos los dueños legítimos sin código hasta la medianoche.
//
// La corrección no inventa mecanismo nuevo: reutiliza el ALMACÉN COMPARTIDO de
// cupos que ya existe y ya está auditado (`src/lib/cupos/compartido.ts`,
// tabla `IntentoDeCupo`, ventana deslizante, cerrojo consultivo por clave,
// respaldo en memoria si la base no responde). Lo único distinto es la
// procedencia: aquí la clave no se deriva de una IP sino del IDENTIFICADOR DEL
// REGISTRO, que es exactamente "un tope por registro".
//
// LFPDPPP: lo que se guarda es un HMAC del identificador con
// `VERIFICACION_SMS_SECRETO`, no el identificador ni el número, y se borra al
// salir de la ventana (más la limpieza diaria de §6 del despliegue). No se
// guarda ninguna IP, así que la frase del aviso de privacidad ya publicado
// ("la IP… solo en su memoria… No la guardamos en la base de datos") sigue
// siendo cierta palabra por palabra.

/** Nombres de los tres cupos. Cada uno lleva su contador, sin mezclarse. */
export const CUPO_INTENTOS_POR_REGISTRO = "verificacion-intentos";
export const CUPO_REENVIOS_POR_REGISTRO = "verificacion-reenvios";
export const CUPO_ENVIOS_SEGUIDOS = "verificacion-cooldown";

/** Respaldos en memoria, uno por cupo (los usa el almacén si la base falla). */
const respaldoIntentos = crearCupoPorIp({
  maximo: MAX_INTENTOS_POR_REGISTRO,
  ventanaMs: VENTANA_TOPES_POR_REGISTRO_MS,
});
const respaldoReenvios = crearCupoPorIp({
  maximo: MAX_REENVIOS_POR_REGISTRO,
  ventanaMs: VENTANA_TOPES_POR_REGISTRO_MS,
});
const respaldoEnviosSeguidos = crearCupoPorIp({
  maximo: 1,
  ventanaMs: COOLDOWN_REENVIO_MS,
});

/** Lo que estos topes necesitan de fuera para poder anclarse. */
export type ContextoTopesPorRegistro = {
  cupos: ClienteCupos;
  /** El identificador del negocio: la "procedencia" de estos cupos. */
  negocioId: string;
  /** Con qué se deriva la clave. El mismo secreto que firma la cookie. */
  secreto: string;
  ahora?: Date;
};

function solicitud(
  contexto: ContextoTopesPorRegistro,
  cupo: string,
  maximo: number,
  ventanaMs: number,
  respaldo: CupoPorIp,
): SolicitudDeCupo {
  return {
    cupo,
    // `ip` es el nombre que el almacén le da a la procedencia; aquí la
    // procedencia es el registro. Nunca sale en claro: se le hace HMAC.
    ip: contexto.negocioId,
    maximo,
    ventanaMs,
    ahora: contexto.ahora ?? new Date(),
    secreto: contexto.secreto,
    respaldo,
  };
}

/**
 * ¿Este registro ya gastó sus 5 intentos? Se pregunta ANTES de llamar al
 * proveedor, para que un registro agotado no le cueste ni una petición.
 */
export function intentosDelRegistroAgotados(
  contexto: ContextoTopesPorRegistro,
): Promise<boolean> {
  return cupoCompartidoAgotado(
    contexto.cupos,
    solicitud(
      contexto,
      CUPO_INTENTOS_POR_REGISTRO,
      MAX_INTENTOS_POR_REGISTRO,
      VENTANA_TOPES_POR_REGISTRO_MS,
      respaldoIntentos,
    ),
  );
}

/**
 * Apunta un intento gastado. Se llama DESPUÉS de que el proveedor contestó,
 * porque solo gasta intento un código que de verdad se probó contra él (un
 * campo incompleto o una falla del proveedor no son culpa del dueño).
 *
 * Que la comprobación y el apunte no sean atómicos aquí es deliberado y
 * acotado: lo peor que consigue una carrera son uno o dos intentos de más
 * contra un espacio de 10⁶, y el proveedor lleva su propio tope. Lo que se
 * cerró es el rebobinado ilimitado, que sí era ilimitado.
 */
export async function apuntarIntentoDelRegistro(
  contexto: ContextoTopesPorRegistro,
): Promise<void> {
  await apartarCupoCompartido(
    contexto.cupos,
    solicitud(
      contexto,
      CUPO_INTENTOS_POR_REGISTRO,
      MAX_INTENTOS_POR_REGISTRO,
      VENTANA_TOPES_POR_REGISTRO_MS,
      respaldoIntentos,
    ),
  );
}

/**
 * Aparta uno de los 2 reenvíos del registro, o `false` si ya no quedan. Aquí
 * comprobar y apartar SÍ son atómicos (los hace el almacén dentro de una
 * transacción con cerrojo por clave): esto es el camino que cuesta dinero.
 */
export function apartarReenvioDelRegistro(
  contexto: ContextoTopesPorRegistro,
): Promise<boolean> {
  return apartarCupoCompartido(
    contexto.cupos,
    solicitud(
      contexto,
      CUPO_REENVIOS_POR_REGISTRO,
      MAX_REENVIOS_POR_REGISTRO,
      VENTANA_TOPES_POR_REGISTRO_MS,
      respaldoReenvios,
    ),
  );
}

/**
 * Aparta el turno de envío de este registro: como mucho UN SMS cada 60
 * segundos. Es el cooldown, escrito como cupo de 1 en una ventana de 60 s, y
 * lo aparta también el PRIMER envío (el que sale del formulario), para que el
 * reenvío inmediato no se salte la espera.
 */
export function apartarEnvioSeguido(
  contexto: ContextoTopesPorRegistro,
): Promise<boolean> {
  return apartarCupoCompartido(
    contexto.cupos,
    solicitud(
      contexto,
      CUPO_ENVIOS_SEGUIDOS,
      1,
      COOLDOWN_REENVIO_MS,
      respaldoEnviosSeguidos,
    ),
  );
}

/** Solo para pruebas: vacía los respaldos en memoria de los tres cupos. */
export function reiniciarTopesPorRegistro(): void {
  respaldoIntentos.reiniciar();
  respaldoReenvios.reiniciar();
  respaldoEnviosSeguidos.reiniciar();
}
