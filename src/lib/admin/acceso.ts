/**
 * Acceso al panel: comparación de la contraseña y antifuerza bruta
 * (spec `revision-admin`, requirement "Acceso al panel con contraseña única
 * de entorno y sesión firmada"; design.md §1 y §4).
 *
 * Módulo puro: no lee cookies, no redirige y NUNCA escribe la contraseña
 * —ni la configurada ni la intentada— en el log.
 */
import { createHash, timingSafeEqual } from "node:crypto";

import {
  apartarCupoCompartido,
  cupoCompartidoAgotado,
  olvidarCupoCompartido,
  type ClienteCupos,
} from "@/lib/cupos/compartido";
import { obtenerPrisma } from "@/lib/prisma";
import {
  VARIABLE_ENCABEZADO_IP,
  crearCupoPorIp,
  type CupoPorIp,
} from "@/lib/registro/limite-ip";

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

/** Nombre del cupo en el almacén compartido. */
export const CUPO_ACCESO_PANEL = "acceso-panel";

/**
 * Contador en MEMORIA del proceso. Desde la iteración 2 del change
 * `preparar-deploy-produccion` (hallazgo A4 de la etapa C) ya no es el
 * contador: es el RESPALDO. El conteo que manda vive en la base
 * (`src/lib/cupos/compartido.ts`), porque en un hosting serverless cada
 * instancia tiene su propia memoria y "5 intentos por instancia" no es un
 * límite: el atacante consigue tantos como instancias levante la plataforma.
 *
 * Este mapa sigue aquí por dos razones concretas: si la base no responde, el
 * límite sigue operando (más flojo, y dicho en el log), y mientras la base sí
 * responde se mantiene caliente, así que una caída a media fuerza bruta no
 * arranca el conteo de cero.
 */
const respaldoEnMemoria = crearCupoPorIp({
  maximo: INTENTOS_ACCESO_POR_VENTANA,
  ventanaMs: VENTANA_INTENTOS_ACCESO_MS,
});

/** Solo para pruebas: el contador en memoria, para simular una instancia nueva. */
export function respaldoDeIntentosParaPruebas(): CupoPorIp {
  return respaldoEnMemoria;
}

/**
 * Lo que hace falta para contar un intento: la base y el secreto con el que se
 * deriva la clave. El secreto es el mismo con el que se firma la sesión: si no
 * hay panel configurado tampoco hay intentos que contar, y sin él no se guarda
 * nada (se cae al respaldo en memoria) antes que escribir una IP en claro.
 */
function contextoDelCupo(secreto: string, ahora: Date) {
  return {
    cupo: CUPO_ACCESO_PANEL,
    maximo: INTENTOS_ACCESO_POR_VENTANA,
    ventanaMs: VENTANA_INTENTOS_ACCESO_MS,
    ahora,
    secreto,
    respaldo: respaldoEnMemoria,
  };
}

/** La base contra la que se cuenta; separable para las pruebas. */
function baseDeCupos(): ClienteCupos {
  return obtenerPrisma() as unknown as ClienteCupos;
}

/**
 * Comprueba el intento Y lo aparta, en una sola operación atómica y
 * compartida entre instancias.
 *
 * Devuelve `true` si quedaba margen (y ya lo apartó) y `false` si la
 * procedencia agotó sus intentos. Es la única forma que debe usar el servidor:
 * preguntar y apartar por separado deja una ventana entre las dos.
 */
export async function apartarIntentoDeAcceso(
  ip: string | null,
  secreto: string,
  ahora: Date = new Date(),
  prisma: ClienteCupos = baseDeCupos(),
): Promise<boolean> {
  return apartarCupoCompartido(prisma, { ...contextoDelCupo(secreto, ahora), ip });
}

/**
 * ¿Esta procedencia ya agotó sus intentos dentro de la ventana? Solo lectura:
 * para decidir está `apartarIntentoDeAcceso`.
 */
export async function accesoBloqueado(
  ip: string | null,
  secreto: string,
  ahora: Date = new Date(),
  prisma: ClienteCupos = baseDeCupos(),
): Promise<boolean> {
  return cupoCompartidoAgotado(prisma, { ...contextoDelCupo(secreto, ahora), ip });
}

/** Solo para pruebas: vacía el conteo de intentos, en la base y en memoria. */
export async function reiniciarIntentosDeAcceso(
  prisma: ClienteCupos = baseDeCupos(),
): Promise<void> {
  await olvidarCupoCompartido(prisma, CUPO_ACCESO_PANEL, respaldoEnMemoria);
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
