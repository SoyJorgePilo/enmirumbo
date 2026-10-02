/**
 * Qué día es en Tizayuca, y con qué marca se le pide al proveedor de correo
 * que no mande dos veces lo mismo (design.md §3 y §4).
 *
 * Tizayuca está en la zona Centro de México, UTC−6 todo el año desde que el
 * país eliminó el horario de verano en 2022. Aun así la fecha se saca con
 * `Intl.DateTimeFormat` sobre `America/Mexico_City` y no restándole seis horas
 * al reloj a mano: si algún día vuelve el horario de verano, el sistema se
 * entera solo y nadie tiene que acordarse de nada.
 *
 * Importa porque la tarea corre a las 13:17 UTC —el mismo día local— pero un
 * disparo manual de tarde-noche (20:00 local = 02:00 UTC del día siguiente)
 * mandaría un segundo correo si la fecha saliera del reloj UTC.
 *
 * Módulo puro: solo recibe un instante y devuelve texto.
 */

/** La zona horaria de Tizayuca. */
export const ZONA_TIZAYUCA = "America/Mexico_City";

/** Prefijo de la marca del día que viaja al proveedor. */
export const CLAVE_AVISO_PREFIJO = "enmirumbo-pendientes-";

const FORMATO = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA_TIZAYUCA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** La fecha local de Tizayuca en formato `AAAA-MM-DD`. */
export function fechaEnTizayuca(instante: Date = new Date()): string {
  return FORMATO.format(instante);
}

/**
 * La marca del día: `enmirumbo-pendientes-<AAAA-MM-DD>`.
 *
 * Depende SOLO de la fecha, nunca de lo que el correo diga: si dependiera de
 * los conteos, un pendiente nuevo a media tarde abriría la puerta a un segundo
 * correo el mismo día.
 */
export function claveDelDia(instante: Date = new Date()): string {
  return `${CLAVE_AVISO_PREFIJO}${fechaEnTizayuca(instante)}`;
}
