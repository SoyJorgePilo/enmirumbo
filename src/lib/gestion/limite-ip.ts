/**
 * Cupo de envíos de ediciones por IP (spec `registro-negocio` del change
 * `agregar-enlace-de-gestion`, requirement "Anti-abuso del envío de
 * ediciones, con cupo propio"; PRD §8).
 *
 * CONTADOR PROPIO, construido con el mismo `crearCupoPorIp` que el registro:
 * agotar el de ediciones no consume el de altas ni el de intentos de acceso al
 * panel, y al revés. Cada cupo tiene su propio mapa.
 *
 * Hereda las mismas limitaciones que documenta `src/lib/registro/limite-ip.ts`
 * —vive en la memoria del proceso, se reinicia con él, no se comparte entre
 * instancias y depende de `REGISTRO_ENCABEZADO_IP` para tener a quién
 * atribuirle el cupo—. Es un hallazgo abierto del change, no una omisión: la
 * promesa del aviso de privacidad publicado es que la IP de un vecino no se
 * guarda en la base, así que este contador no puede mudarse a `IntentoDeCupo`
 * sin tocar ese texto.
 *
 * No se registra ningún dato del negocio: solo marcas de tiempo por IP.
 */
import { VENTANA_LIMITE_MS, crearCupoPorIp } from "@/lib/registro/limite-ip";

/** Envíos de edición por hora y por IP (spec: "un límite de 3 por hora"). */
export const EDICIONES_POR_IP_POR_HORA = 3;

const cupoDeEdiciones = crearCupoPorIp({
  maximo: EDICIONES_POR_IP_POR_HORA,
  ventanaMs: VENTANA_LIMITE_MS,
});

/** ¿Esta IP ya agotó su cupo de ediciones de la última hora? */
export function ipSinCupoDeEdiciones(
  ip: string | null,
  ahora: Date = new Date(),
): boolean {
  return cupoDeEdiciones.bloqueada(ip, ahora);
}

/** Apunta un envío de edición contra el cupo de la IP. */
export function registrarEnvioDeEdicion(
  ip: string | null,
  ahora: Date = new Date(),
): void {
  cupoDeEdiciones.registrar(ip, ahora);
}

/** Solo para pruebas: vacía el conteo del proceso. */
export function reiniciarCupoDeEdiciones(): void {
  cupoDeEdiciones.reiniciar();
}
