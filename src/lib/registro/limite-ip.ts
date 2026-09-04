/**
 * Límite de altas por IP del formulario público (PRD §8: anti-abuso sin
 * captcha; design.md §4).
 *
 * PROVISIONAL A SABIENDAS: el conteo vive en memoria del proceso. Se reinicia
 * con el proceso, no se comparte entre instancias y varios vecinos detrás del
 * mismo NAT comparten cupo — por eso el límite es 3 por hora y no 1. Cuando
 * se decida la base de producción (E0-3) esto se mueve a un almacén
 * compartido.
 *
 * Solo se cuentan los envíos que llegaron a intentar un alta (ya validados):
 * un vecino que se equivoca al escribir su número puede corregir y reenviar
 * sin gastar cupo, mientras que el barrido de números que menciona design.md
 * §5 sí lo gasta, porque necesita envíos completos y válidos para leer el
 * mensaje de "número ya registrado".
 *
 * No se registra ningún dato del negocio: solo marcas de tiempo por IP.
 */

export const ALTAS_POR_IP_POR_HORA = 3;
export const VENTANA_LIMITE_MS = 60 * 60 * 1000;

/**
 * Techo de IPs rastreadas a la vez. Con la ventana de una hora y el volumen
 * esperado (decenas de altas), 5000 sobra; existe para que el mapa no crezca
 * sin cota si alguien manda envíos desde muchas IPs distintas.
 */
export const MAX_IPS_RASTREADAS = 5000;

/**
 * IP → marcas de tiempo (ms) de sus altas recientes. El orden de inserción es
 * el de uso más reciente (cada alta borra y vuelve a insertar la clave), así
 * que desalojar por el frente desaloja lo más viejo.
 */
const altasPorIp = new Map<string, number[]>();

function recientes(ip: string, ahora: Date): number[] {
  const desde = ahora.getTime() - VENTANA_LIMITE_MS;
  const marcas = (altasPorIp.get(ip) ?? []).filter((marca) => marca > desde);
  if (marcas.length > 0) altasPorIp.set(ip, marcas);
  else altasPorIp.delete(ip);
  return marcas;
}

/** Tira lo caducado y, si aún sobra, desaloja las IPs menos recientes. */
function podar(ahora: Date): void {
  const desde = ahora.getTime() - VENTANA_LIMITE_MS;
  for (const [ip, marcas] of altasPorIp) {
    const vigentes = marcas.filter((marca) => marca > desde);
    if (vigentes.length === 0) altasPorIp.delete(ip);
    else if (vigentes.length !== marcas.length) altasPorIp.set(ip, vigentes);
  }
  while (altasPorIp.size > MAX_IPS_RASTREADAS) {
    const masVieja = altasPorIp.keys().next();
    if (masVieja.done) break;
    altasPorIp.delete(masVieja.value);
  }
}

/** ¿Esta IP ya agotó su cupo de la última hora? */
export function ipBloqueada(ip: string | null, ahora: Date = new Date()): boolean {
  if (!ip) return false;
  return recientes(ip, ahora).length >= ALTAS_POR_IP_POR_HORA;
}

/** Apunta un alta contra el cupo de la IP. */
export function registrarAlta(ip: string | null, ahora: Date = new Date()): void {
  if (!ip) return;
  const marcas = [...recientes(ip, ahora), ahora.getTime()];
  // Borrar antes de insertar mueve la clave al final: orden = uso reciente.
  altasPorIp.delete(ip);
  altasPorIp.set(ip, marcas);
  podar(ahora);
}

/** Solo para pruebas: vacía el conteo del proceso. */
export function reiniciarLimitePorIp(): void {
  altasPorIp.clear();
}

/** Solo para pruebas: cuántas IPs se están rastreando ahora mismo. */
export function tamanoLimitePorIp(): number {
  return altasPorIp.size;
}

/**
 * Nombre del encabezado en el que el proxy de confianza del despliegue
 * publica la IP del cliente. Sin este valor NO se confía en ningún
 * encabezado: los pone quien manda la petición.
 *
 * Ejemplos según hosting: `x-forwarded-for` (nginx, HAProxy y la mayoría de
 * las plataformas), `cf-connecting-ip` (Cloudflare), `x-real-ip`. El valor
 * correcto de cada hosting se documenta en `.env.example`.
 */
export const VARIABLE_ENCABEZADO_IP = "REGISTRO_ENCABEZADO_IP";

let yaSeAvisoSinEncabezado = false;

/** Forma de IPv4 con octetos válidos. */
function esIpv4(valor: string): boolean {
  const partes = valor.split(".");
  return (
    partes.length === 4 &&
    partes.every(
      (parte) =>
        /^\d{1,3}$/.test(parte) && Number(parte) <= 255,
    )
  );
}

/** Forma de IPv6 (comprobación de forma, no de asignación). */
function esIpv6(valor: string): boolean {
  if (valor.length > 45 || !valor.includes(":")) return false;
  if (!/^[0-9a-fA-F:.]+$/.test(valor)) return false;
  const [posibleIpv4] = valor.split(":").slice(-1);
  if (posibleIpv4.includes(".")) return esIpv4(posibleIpv4);
  return true;
}

/**
 * ¿La cadena tiene forma de IP? Sirve para que la clave del cupo no sea texto
 * arbitrario elegido por quien envía (evita claves gigantes o infinitas).
 */
export function esIpValida(valor: string): boolean {
  const limpio = valor.replace(/^\[|\]$/g, "");
  // Algunos proxies añaden el puerto: "203.0.113.10:54321".
  const sinPuerto = /^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(limpio)
    ? limpio.slice(0, limpio.lastIndexOf(":"))
    : limpio;
  return esIpv4(sinPuerto) || esIpv6(sinPuerto);
}

/** Normaliza a la forma que se usa como clave del cupo. */
function claveDeIp(valor: string): string | null {
  const limpio = valor.trim().replace(/^\[|\]$/g, "");
  const sinPuerto = /^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(limpio)
    ? limpio.slice(0, limpio.lastIndexOf(":"))
    : limpio;
  return esIpValida(sinPuerto) ? sinPuerto.toLowerCase() : null;
}

/**
 * IP del cliente para el cupo, leída SOLO del encabezado declarado en
 * `REGISTRO_ENCABEZADO_IP` (hallazgo ALTO 1 de la etapa C).
 *
 * Reglas, en este orden:
 *
 * 1. Sin variable configurada no se confía en ningún encabezado y se devuelve
 *    `null` (sin cupo). Es deliberado: un encabezado que escribe quien envía
 *    la petición deja al cliente elegir su propia clave, con lo que el límite
 *    de 3/hora — y la mitigación del oráculo de números registrados de
 *    design.md §5 — dejan de existir, además de dar una falsa sensación de
 *    protección.
 * 2. Con la variable configurada se toma el ÚLTIMO valor de la lista, que es
 *    el que agrega el salto más cercano (nginx/HAProxy añaden al final; los
 *    proxies que sobrescriben el encabezado mandan un solo valor). Los
 *    valores anteriores de la lista sí los puede escribir el cliente.
 * 3. El valor debe tener forma de IP; si no, `null`.
 *
 * Sigue sin ser una identidad: acota el abuso casual cuando hay exactamente
 * un proxy de confianza al frente. Verificar cuál es el encabezado correcto
 * del hosting es parte de E0-3.
 */
export function ipDeEncabezados(
  encabezados: Headers,
  encabezadoConfiable: string | undefined = process.env[VARIABLE_ENCABEZADO_IP],
): string | null {
  const nombre = encabezadoConfiable?.trim().toLowerCase();
  if (!nombre) {
    if (!yaSeAvisoSinEncabezado) {
      yaSeAvisoSinEncabezado = true;
      console.warn(
        `[registro] ${VARIABLE_ENCABEZADO_IP} sin configurar: el límite de altas por IP queda inactivo (ver .env.example).`,
      );
    }
    return null;
  }

  const crudo = encabezados.get(nombre);
  if (!crudo) return null;

  const ultimoSalto = crudo.split(",").at(-1) ?? "";
  return claveDeIp(ultimoSalto);
}

/** Solo para pruebas: permite volver a observar el aviso de configuración. */
export function reiniciarAvisoDeEncabezado(): void {
  yaSeAvisoSinEncabezado = false;
}
