/**
 * Resend FALSO, solo para pruebas (change `migrar-tareas-programadas-astro`,
 * design.md §5.1; molde de `tests/fixtures/twilio-falso.mjs`). Se carga ANTES
 * que el servidor, en su mismo proceso:
 *
 *   node --import ./tests/fixtures/resend-falso.mjs scripts/servir-salida-vercel.mjs
 *   NODE_OPTIONS=--import=<ruta absoluta> next start      (el lado de Next en el diff)
 *
 * Envuelve `globalThis.fetch`. El adaptador real (`crearCorreoResend`) llama a
 * `fetch(URL_API_RESEND, …)`, así que cae aquí sin tocar `src/lib/`, sin red y
 * sin una variable de producción que cambie la URL del proveedor.
 *
 * - `RESEND_FALSO_GUION`: `aceptado` (200; recuerda la clave del día y, como
 *   el proveedor, responde 409 `invalid_idempotent_request` a la segunda
 *   petición con la misma `Idempotency-Key`), `rechazado` (422), `repetido`
 *   (409 en frío), `error` (503) o `tarda` (no contesta; el `AbortController`
 *   de 5 s del adaptador lo corta). O `@<archivo>` para leerlo en CADA llamada.
 * - `RESEND_FALSO_REGISTRO`: archivo donde se apunta cada llamada al
 *   proveedor, una línea JSON: método, URL, si había `Authorization` (`sí` o
 *   `no`, NUNCA el valor), `Idempotency-Key`, `User-Agent`, el cuerpo
 *   (`from`, `to`, `subject`, `text`) y el estado con el que se respondió.
 *   Los buzones de las pruebas son `@ejemplo.invalid` (RFC 2606).
 * - **Cualquier otro host externo LANZA** (Twilio, el bucket, cualquiera).
 *   Solo pasan las direcciones locales (`localhost`, `127.0.0.1`, `::1`).
 *
 * Nada de `src/` ni de la build lo menciona (lo vigila
 * `tests/resend-falso.test.ts`).
 */
import { appendFileSync, readFileSync } from "node:fs";

const HOST_PROVEEDOR = "api.resend.com";
const RUTA_DE_ENVIO = "/emails";
const LOCALES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const GUIONES = ["aceptado", "rechazado", "repetido", "error", "tarda"];

/** `"aceptado"` → `"aceptado"`; cualquier otro valor que no esté en la lista, falla. */
export function leerGuion(texto = "aceptado") {
  const guion = (texto ?? "aceptado").trim() || "aceptado";
  if (!GUIONES.includes(guion)) throw new Error(`guion desconocido del resend falso: ${guion}`);
  return guion;
}

function json(status, cuerpo) {
  return new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });
}

/** Una promesa que solo termina si la abortan (el caso `tarda`). */
function sinRespuesta(senal) {
  return new Promise((_, falla) => {
    const abortar = () => falla(senal.reason ?? new DOMException("Abortado", "AbortError"));
    if (senal?.aborted) abortar();
    else senal?.addEventListener("abort", abortar, { once: true });
  });
}

function cabecera(init, nombre) {
  return new Headers(init.headers ?? {}).get(nombre);
}

function cuerpoDelEnvio(init) {
  try {
    const { from, to, subject, text } = JSON.parse(typeof init.body === "string" ? init.body : "{}");
    return { from, to, subject, text };
  } catch {
    return {};
  }
}

/**
 * El `fetch` falso. `original` atiende lo local; `apuntar` recibe cada
 * llamada al proveedor. `guionFijo` puede ser una función que lo da en cada
 * llamada.
 *
 * @param {string | (() => string)} guionFijo
 * @param {(llamada: Record<string, unknown>) => void} apuntar
 * @param {typeof fetch} original
 * @returns {typeof fetch}
 */
export function crearFetchFalso(guionFijo, apuntar, original) {
  /** Claves con un envío aceptado, como las guarda el proveedor (24 h). */
  const aceptadas = new Set();
  return async function fetchFalso(entrada, init = {}) {
    const url = new URL(entrada instanceof Request ? entrada.url : String(entrada));
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new TypeError(`resend-falso: esquema no permitido (${url.protocol})`);
    }
    if (LOCALES.has(url.hostname)) return original(entrada, init);
    if (url.hostname !== HOST_PROVEEDOR) {
      throw new TypeError(`resend-falso: petición a un host externo bloqueada (${url.hostname})`);
    }

    const guion = typeof guionFijo === "function" ? guionFijo() : guionFijo;
    const clave = cabecera(init, "idempotency-key");
    const llamada = {
      metodo: (init.method ?? "GET").toUpperCase(),
      url: url.href,
      autorizacion: cabecera(init, "authorization") ? "sí" : "no",
      idempotencyKey: clave,
      userAgent: cabecera(init, "user-agent"),
      cuerpo: cuerpoDelEnvio(init),
    };
    const responder = (status, cuerpo) => {
      apuntar({ ...llamada, respuesta: status });
      return json(status, cuerpo);
    };

    if (url.pathname !== RUTA_DE_ENVIO || llamada.metodo !== "POST") return responder(404, { name: "not_found" });
    if (guion === "tarda") {
      apuntar({ ...llamada, respuesta: "sin-respuesta" });
      return sinRespuesta(init.signal);
    }
    if (guion === "rechazado") return responder(422, { name: "validation_error", message: "Invalid `from` field." });
    if (guion === "error") return responder(503, { name: "internal_server_error" });
    if (guion === "repetido" || (clave && aceptadas.has(clave))) {
      return responder(409, { name: "invalid_idempotent_request" });
    }
    if (clave) aceptadas.add(clave);
    return responder(200, { id: "00000000-0000-0000-0000-000000000000" });
  };
}

/**
 * Instala el `fetch` falso en el proceso. Devuelve cómo deshacerlo.
 *
 * @param {Record<string, string | undefined>} [entorno]
 * @returns {() => void}
 */
export function instalarResendFalso(entorno = process.env) {
  const original = globalThis.fetch;
  const valor = entorno.RESEND_FALSO_GUION ?? "aceptado";
  const guion = valor.startsWith("@") ? () => leerGuion(readFileSync(valor.slice(1), "utf8")) : leerGuion(valor);
  const registro = entorno.RESEND_FALSO_REGISTRO;
  const apuntar = (llamada) => {
    if (registro) appendFileSync(registro, `${JSON.stringify(llamada)}\n`);
  };
  globalThis.fetch = crearFetchFalso(guion, apuntar, original.bind(globalThis));
  return () => {
    globalThis.fetch = original;
  };
}

/** La línea que deja en la consola al instalarse con `--import`: el helper la exige. */
export const LINEA_DE_INSTALADO = "[resend-falso] instalado";

// Cargado con `node --import`, se instala solo y lo dice (el helper de las
// pruebas falla si no ve esa línea). Importado por una prueba (sin
// `RESEND_FALSO_GUION`), no toca nada.
if (process.env.RESEND_FALSO_GUION !== undefined) {
  instalarResendFalso();
  console.log(LINEA_DE_INSTALADO);
}
