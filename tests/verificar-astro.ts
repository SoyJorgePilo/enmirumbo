/**
 * Ayudantes de las pruebas de `/registro/verificar` sobre la build y de la
 * captura de fixtures de Next (change `migrar-verificacion-sms-astro`,
 * tasks.md #3). Los usan `tests/plataforma-astro-verificar*.test.ts` y
 * `scripts/diff-html.mjs --capturar-3b2` (con `tsx`).
 *
 * - Cookies de paso firmadas EN LA PRUEBA (vigente, caducada, alterada, con
 *   otro secreto, malformada), con el `firmarPaso` real.
 * - Envejecer las filas de `IntentoDeCupo` de un registro para vencer la
 *   espera de 60 s sin dormir y sin tocar el reloj de `src/lib/`: el
 *   emulador sigue con su reloj real (design.md §6).
 * - El contexto de `recorrerSecuencia3b2` (`scripts/enviar-formulario.mjs`).
 *
 * Todo ficticio: secretos generados, WhatsApp 771999xxxx.
 */
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

import { claveDeCupo } from "../src/lib/cupos/compartido";
import {
  CUPO_ENVIOS_SEGUIDOS,
  CUPO_INTENTOS_POR_REGISTRO,
  CUPO_REENVIOS_POR_REGISTRO,
} from "../src/lib/verificacion/limites";
import { DURACION_PASO_MS, firmarPaso } from "../src/lib/verificacion/paso";

export type TipoDeCookie = "vigente" | "caducada" | "alterada" | "otro-secreto" | "malformada";

/** El valor de una cookie `nu_paso` para esa ficha, del tipo pedido. */
export function cookieDePaso(tipo: TipoDeCookie, negocioId: string, secreto: string, ultimos = "0000"): string {
  const ahora = Date.now();
  const paso = { negocioId, ultimosCuatroDigitos: ultimos, creadaEnMs: ahora };
  switch (tipo) {
    case "vigente":
      return firmarPaso(paso, secreto);
    case "caducada":
      // Caducó hace un segundo (la ventana es de 15 minutos).
      return firmarPaso({ ...paso, creadaEnMs: ahora - DURACION_PASO_MS - 1000 }, secreto);
    case "alterada": {
      const valor = firmarPaso(paso, secreto);
      const ultimo = valor.at(-1) === "A" ? "B" : "A";
      return `${valor.slice(0, -1)}${ultimo}`;
    }
    case "otro-secreto":
      return firmarPaso(paso, randomBytes(32).toString("hex"));
    case "malformada": {
      // Firma CORRECTA (el mismo HMAC `v1.<contenido>` de `paso.ts`, que no
      // exporta su `firma()`) sobre un contenido que no es JSON.
      const sinJson = Buffer.from("esto no es json", "utf8").toString("base64url");
      return `${sinJson}.${createHmac("sha256", secreto).update(`v1.${sinJson}`).digest("base64url")}`;
    }
  }
}

/** Las tres claves de los topes por registro de una ficha. */
export function clavesDeLosTopes(negocioId: string, secreto: string) {
  return {
    intentos: claveDeCupo(CUPO_INTENTOS_POR_REGISTRO, negocioId, secreto),
    reenvios: claveDeCupo(CUPO_REENVIOS_POR_REGISTRO, negocioId, secreto),
    espera: claveDeCupo(CUPO_ENVIOS_SEGUIDOS, negocioId, secreto),
  };
}

type Consultar = (sql: string, params: unknown[]) => Promise<Array<Record<string, unknown>>>;

/** Vence la espera de 60 s de esa ficha: corre 61 s hacia atrás sus filas de la espera. */
export async function envejecerEspera(consultar: Consultar, negocioId: string, secreto: string): Promise<void> {
  await consultar(`UPDATE "IntentoDeCupo" SET "ocurrioEn" = "ocurrioEn" - interval '61 seconds' WHERE clave = $1`, [
    clavesDeLosTopes(negocioId, secreto).espera,
  ]);
}

/** Cuántas filas tiene cada tope de esa ficha. */
export async function cuposDeLaFicha(consultar: Consultar, negocioId: string, secreto: string) {
  const claves = clavesDeLosTopes(negocioId, secreto);
  const contar = async (clave: string) =>
    Number((await consultar(`SELECT count(*)::int AS n FROM "IntentoDeCupo" WHERE clave = $1`, [clave]))[0]?.n ?? 0);
  return { intentos: await contar(claves.intentos), reenvios: await contar(claves.reenvios), espera: await contar(claves.espera) };
}

export type Llamada = { ruta: string; parametros: Record<string, string> };

/** Lo que apuntó el Twilio falso en su archivo de registro. */
export function leerLlamadas(archivo: string): Llamada[] {
  return readFileSync(archivo, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((linea) => JSON.parse(linea) as Llamada);
}

/** El contexto de `recorrerSecuencia3b2` contra una base y un Twilio falso. */
export function contextoDe3b2(opciones: {
  consultar: Consultar;
  secreto: string;
  archivoGuion: string;
  archivoLlamadas: string;
  categoriaId: number;
  coloniaId: number;
}) {
  const { consultar, secreto } = opciones;
  return {
    categoriaId: opciones.categoriaId,
    coloniaId: opciones.coloniaId,
    consultar,
    usarGuion: (texto: string) => writeFileSync(opciones.archivoGuion, texto),
    llamadas: () => leerLlamadas(opciones.archivoLlamadas),
    envejecer: (negocioId: string) => envejecerEspera(consultar, negocioId, secreto),
    cupos: (negocioId: string) => cuposDeLaFicha(consultar, negocioId, secreto),
    cookieInvalida: (tipo: Exclude<TipoDeCookie, "vigente">, negocioId: string) => cookieDePaso(tipo, negocioId ?? "cnoexiste0000000000000000", secreto),
  };
}
