/**
 * Acceso al panel: comparación de la contraseña y antifuerza bruta
 * (spec `revision-admin`, requirement "Acceso al panel con contraseña única
 * de entorno y sesión firmada"; design.md §1 y §4).
 *
 * Módulo puro: no lee cookies, no redirige y NUNCA escribe la contraseña
 * —ni la configurada ni la intentada— en el log.
 */
import { createHash, timingSafeEqual } from "node:crypto";

import { VARIABLE_ENCABEZADO_IP, crearCupoPorIp } from "@/lib/registro/limite-ip";

/**
 * Intentos fallidos que se toleran por procedencia dentro de la ventana. Una
 * sola contraseña sin límite de intentos es una invitación (design.md §4).
 */
export const INTENTOS_ACCESO_POR_VENTANA = 5;

/**
 * Ventana propia del acceso, más corta que la hora del formulario público:
 * el admin que se equivoca al teclear no debería quedarse fuera media
 * jornada, y 5 intentos cada 10 minutos deja la fuerza bruta fuera de rango.
 */
export const VENTANA_INTENTOS_ACCESO_MS = 10 * 60 * 1000;

/**
 * Mismo módulo de cupo por IP que el formulario público (T-003), con ventana
 * y máximo propios y su propio conteo. Vale la misma advertencia que allá:
 * sin `REGISTRO_ENCABEZADO_IP` no hay a quién atribuir los intentos, así que
 * en producción esa variable es parte del despliegue, no un extra.
 */
const cupoDeIntentos = crearCupoPorIp({
  maximo: INTENTOS_ACCESO_POR_VENTANA,
  ventanaMs: VENTANA_INTENTOS_ACCESO_MS,
});

/** ¿Esta procedencia ya agotó sus intentos dentro de la ventana? */
export function accesoBloqueado(ip: string | null, ahora: Date = new Date()): boolean {
  return cupoDeIntentos.bloqueada(ip, ahora);
}

/** Apunta un intento fallido contra la procedencia. */
export function registrarIntentoFallido(ip: string | null, ahora: Date = new Date()): void {
  cupoDeIntentos.registrar(ip, ahora);
}

/** Solo para pruebas: vacía el conteo de intentos del proceso. */
export function reiniciarIntentosDeAcceso(): void {
  cupoDeIntentos.reiniciar();
  yaSeAvisoSinCupo = false;
}

let yaSeAvisoSinCupo = false;

/**
 * Avisa —una sola vez por proceso— que el límite de intentos NO está activo
 * porque no hay IP atribuible (hallazgo MEDIO 3 de la etapa C).
 *
 * Sin `REGISTRO_ENCABEZADO_IP` declarada, o con un último salto que no tiene
 * forma de IP, no hay a quién contarle los intentos y la única credencial del
 * sitio queda sin freno de fuerza bruta. El módulo del registro ya avisa de lo
 * suyo, pero ese aviso habla de "altas por IP" y se consume en la primera
 * petición del formulario público, que puede haber pasado horas antes: el
 * panel necesita decirlo por su cuenta, con su propio nombre, para que un
 * despliegue mal configurado no se entere el día del ataque.
 */
export function avisarSiElLimiteDeAccesoNoAplica(ip: string | null): void {
  if (ip || yaSeAvisoSinCupo) return;
  yaSeAvisoSinCupo = true;
  console.warn(
    `[panel] sin IP atribuible (${VARIABLE_ENCABEZADO_IP} sin configurar o encabezado sin forma de IP): ` +
      "el límite de intentos de acceso al panel queda INACTIVO. Ver .env.example.",
  );
}

/**
 * ¿La contraseña recibida es la configurada? Se comparan los HASHES de ambas
 * cadenas en tiempo constante: así ni el tiempo de respuesta ni la longitud
 * del intento filtran nada de la contraseña real (design.md §1).
 */
export function contrasenaCorrecta(intento: string, configurada: string): boolean {
  const resumen = (valor: string) => createHash("sha256").update(valor, "utf8").digest();
  return timingSafeEqual(resumen(intento), resumen(configurada));
}
