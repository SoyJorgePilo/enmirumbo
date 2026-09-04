/**
 * Anti-abuso del botón "Reportar" (spec `directorio-publico`, requirement
 * "Anti-abuso del reporte sin captcha: honeypot, cupo por IP y tope de
 * pendientes por negocio"; design.md §2 y §3).
 *
 * Dos defensas viven aquí; la tercera (el honeypot) es un campo del
 * formulario y la resuelve `crearReporte`.
 *
 * 1. **Cupo por IP, con CONTADOR PROPIO.** Se construye con la misma fábrica
 *    que el cupo de altas (`crearCupoPorIp`), pero con su propio mapa: agotar
 *    el cupo de reportes NO debe dejar a un vecino sin poder registrar su
 *    negocio desde la misma casa, ni al revés (design.md §2). En un municipio
 *    con mucho NAT compartido, compartir el contador sería un bloqueo real de
 *    la conversión que persigue el proyecto.
 *
 *    Igual que el de altas, el conteo vive EN MEMORIA del proceso
 *    (PROVISIONAL a sabiendas hasta E0-3) y depende de que el despliegue
 *    declare `REGISTRO_ENCABEZADO_IP`: sin esa variable `ipDeEncabezados`
 *    devuelve `null` y este cupo simplemente no opera, porque confiar en un
 *    encabezado que escribe quien envía la petición es peor que no tener
 *    límite.
 *
 * 2. **Tope de reportes PENDIENTES por negocio.** Es la defensa que sigue en
 *    pie cuando el cupo por IP no opera. Acota lo único que un atacante puede
 *    lograr: llenar el panel de ruido sobre una ficha concreta. Se cuentan
 *    solo los pendientes, así que en cuanto el admin atiende, el negocio
 *    vuelve a admitir reportes.
 *
 * No se guarda ningún dato del reportante: solo marcas de tiempo por IP, en
 * memoria (PRD §8 y LFPDPPP).
 */
import { crearCupoPorIp, VENTANA_LIMITE_MS } from "@/lib/registro/limite-ip";

/** Reportes por hora y por IP (duda 3 resuelta al aprobar la propuesta). */
export const REPORTES_POR_IP_POR_HORA = 3;

/** Misma ventana de una hora que el cupo de altas. */
export const VENTANA_REPORTES_MS = VENTANA_LIMITE_MS;

/**
 * Reportes sin atender que admite un negocio antes de dejar de guardarlos.
 * Pasado ese punto el admin ya tiene toda la señal que necesita, y quien
 * reporta ve la confirmación de siempre (design.md §3).
 */
export const TOPE_REPORTES_PENDIENTES_POR_NEGOCIO = 10;

/** Mapa propio, separado del de altas y del de intentos de acceso al panel. */
const cupoDeReportes = crearCupoPorIp({
  maximo: REPORTES_POR_IP_POR_HORA,
  ventanaMs: VENTANA_REPORTES_MS,
});

/**
 * Comprueba el cupo Y lo aparta **en un solo paso síncrono**. Es la única
 * forma de pedir cupo que debe usar el servidor (corrección del hallazgo A2
 * de la etapa C).
 *
 * Devuelve `true` si quedaba cupo —y entonces YA lo apartó— y `false` si
 * estaba agotado.
 *
 * Por qué importa que sea una sola función y no dos llamadas: Node atiende
 * varias peticiones a la vez y **cede el turno en cada `await`**. Preguntar
 * "¿hay cupo?", ceder el turno y apartar después deja a ocho peticiones
 * simultáneas leyendo el mismo "sí hay" y pasando las ocho. Aquí no hay
 * `await` entre comprobar y apartar, así que el turno no se cede a la mitad:
 * la primera que entra aparta y las demás ven el contador ya movido.
 */
export function apartarCupoDeReportes(
  ip: string | null,
  ahora: Date = new Date(),
): boolean {
  if (cupoDeReportes.bloqueada(ip, ahora)) return false;
  cupoDeReportes.registrar(ip, ahora);
  return true;
}

/**
 * ¿Esta IP ya agotó su cupo de reportes de la última hora? Consulta de solo
 * lectura: sirve para pruebas y diagnóstico, NO para decidir si se acepta un
 * envío — para eso está `apartarCupoDeReportes`, que no deja ventana entre la
 * pregunta y la respuesta.
 */
export function cupoDeReportesAgotado(
  ip: string | null,
  ahora: Date = new Date(),
): boolean {
  return cupoDeReportes.bloqueada(ip, ahora);
}

/**
 * Apunta un reporte contra el cupo de la IP sin comprobar nada. Solo para
 * pruebas que necesitan dejar el contador en un estado concreto.
 */
export function registrarReporteEnCupo(
  ip: string | null,
  ahora: Date = new Date(),
): void {
  cupoDeReportes.registrar(ip, ahora);
}

/** Solo para pruebas: vacía el conteo de reportes del proceso. */
export function reiniciarCupoDeReportes(): void {
  cupoDeReportes.reiniciar();
}

/** Solo para pruebas: cuántas IPs se están rastreando ahora mismo. */
export function tamanoCupoDeReportes(): number {
  return cupoDeReportes.tamano();
}
