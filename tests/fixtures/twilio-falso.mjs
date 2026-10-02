/**
 * Twilio FALSO, solo para pruebas (change `migrar-registro-astro`, design.md
 * §7). Se carga ANTES que el emulador, en su mismo proceso:
 *
 *   node --import ./tests/fixtures/twilio-falso.mjs scripts/servir-salida-vercel.mjs
 *
 * Envuelve `globalThis.fetch`. El adaptador real (`crearProveedorTwilio`) toma
 * `fetch` del global al construirse en cada petición, así que sus llamadas a
 * `https://verify.twilio.com/v2/Services/<sid>/Verifications` y
 * `/VerificationCheck` caen aquí sin tocar `src/lib/`. Sin red, sin
 * credenciales reales y sin una variable de producción que cambie la URL del
 * proveedor.
 *
 * - `TWILIO_FALSO_GUION`: `<al pedir>[,<al comprobar>]`, o `@<archivo>` para
 *   leer el guion de ese archivo en CADA llamada (así una prueba cambia el
 *   guion sin levantar otro emulador).
 *   - Al pedir: `enviado` (201), `rechazado` (400), `error` (503) o `tarda`
 *     (no contesta nunca; la espera acotada del adaptador la corta).
 *   - Al comprobar: `approved`, `pending` o `404`. Por defecto, `approved`.
 * - `TWILIO_FALSO_REGISTRO`: archivo donde se apunta cada llamada al
 *   proveedor, una línea JSON por llamada (ruta y parámetros). Los números de
 *   las pruebas son de la serie ficticia `771999xxxx`.
 * - **Cualquier otro host externo LANZA.** Solo pasan las direcciones locales
 *   (`localhost`, `127.0.0.1`, `::1`), que el propio Astro usa para pedirse
 *   sus páginas prerenderizadas.
 *
 * Nada de `src/` ni de la build lo menciona (lo vigila
 * `tests/twilio-falso.test.ts`).
 */
import { appendFileSync, readFileSync } from "node:fs";

const HOST_PROVEEDOR = "verify.twilio.com";
const LOCALES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

const RESPUESTAS_AL_PEDIR = {
  enviado: { status: 201, cuerpo: { status: "pending" } },
  rechazado: { status: 400, cuerpo: { code: 60200, message: "Invalid parameter" } },
  error: { status: 503, cuerpo: { message: "Service unavailable" } },
};

/** `"enviado,approved"` → `{ alPedir: "enviado", alComprobar: "approved" }`. */
export function leerGuion(texto = "enviado") {
  const [alPedir = "enviado", alComprobar = "approved"] = texto.split(",").map((t) => t.trim());
  if (!["enviado", "rechazado", "error", "tarda"].includes(alPedir)) throw new Error(`guion desconocido al pedir: ${alPedir}`);
  if (!["approved", "pending", "404"].includes(alComprobar)) throw new Error(`guion desconocido al comprobar: ${alComprobar}`);
  return { alPedir, alComprobar };
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

/**
 * El `fetch` falso. `original` atiende lo local; `apuntar` recibe cada
 * llamada al proveedor. `guion` puede ser una función que lo da en cada
 * llamada.
 *
 * @param {{ alPedir: string, alComprobar: string } | (() => { alPedir: string, alComprobar: string })} guionFijo
 * @param {(llamada: { ruta: string, parametros: Record<string, string> }) => void} apuntar
 * @param {typeof fetch} original
 * @returns {typeof fetch}
 */
export function crearFetchFalso(guionFijo, apuntar, original) {
  return async function fetchFalso(entrada, init = {}) {
    const guion = typeof guionFijo === "function" ? guionFijo() : guionFijo;
    const url = new URL(entrada instanceof Request ? entrada.url : String(entrada));
    if (url.protocol === "http:" || url.protocol === "https:") {
      if (LOCALES.has(url.hostname)) return original(entrada, init);
      if (url.hostname !== HOST_PROVEEDOR) {
        throw new TypeError(`twilio-falso: petición a un host externo bloqueada (${url.hostname})`);
      }
    } else {
      throw new TypeError(`twilio-falso: esquema no permitido (${url.protocol})`);
    }

    const cuerpo = typeof init.body === "string" ? init.body : "";
    const parametros = Object.fromEntries(new URLSearchParams(cuerpo));
    const ruta = url.pathname.replace(/^\/v2\/Services\/[^/]+/, "");
    apuntar({ ruta, parametros });

    if (ruta === "/Verifications") {
      if (guion.alPedir === "tarda") return sinRespuesta(init.signal);
      const { status, cuerpo: respuesta } = RESPUESTAS_AL_PEDIR[guion.alPedir];
      return json(status, respuesta);
    }
    if (ruta === "/VerificationCheck") {
      if (guion.alComprobar === "404") return json(404, { message: "Not found" });
      return json(200, { status: guion.alComprobar });
    }
    return json(404, { message: "Not found" });
  };
}

/**
 * Instala el `fetch` falso en el proceso. Devuelve cómo deshacerlo.
 *
 * @param {Record<string, string | undefined>} [entorno]
 * @returns {() => void}
 */
export function instalarTwilioFalso(entorno = process.env) {
  const original = globalThis.fetch;
  const valor = entorno.TWILIO_FALSO_GUION ?? "enviado";
  const guion = valor.startsWith("@") ? () => leerGuion(readFileSync(valor.slice(1), "utf8").trim()) : leerGuion(valor);
  const registro = entorno.TWILIO_FALSO_REGISTRO;
  const apuntar = (llamada) => {
    if (registro) appendFileSync(registro, `${JSON.stringify(llamada)}\n`);
  };
  globalThis.fetch = crearFetchFalso(guion, apuntar, original.bind(globalThis));
  return () => {
    globalThis.fetch = original;
  };
}

// Cargado con `node --import`, se instala solo. Importado por una prueba
// (sin `TWILIO_FALSO_GUION`), no toca nada.
if (process.env.TWILIO_FALSO_GUION !== undefined) instalarTwilioFalso();
