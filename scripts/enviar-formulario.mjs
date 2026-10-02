/**
 * Arnés de envío SIN JavaScript (change `migrar-formularios-publicos-astro`,
 * tasks.md #3; spec `plataforma-astro`, requirement "El envío sin JavaScript
 * funciona contra la salida construida").
 *
 * Hace lo que hace un navegador con el JS apagado:
 *
 * 1. lee el `<form>` del HTML servido;
 * 2. manda TODOS sus campos (incluidos los ocultos, p. ej. los `$ACTION_*` de
 *    Next) con el `method`, el `action` y el `enctype` que declara;
 * 3. pone el `Origin` y el `Referer` que pondría el navegador con la política
 *    de referente de la página;
 * 4. sigue el 303 a mano, con un `GET` y las cookies que le dejaron.
 *
 * Funciones puras más `enviarFormulario`, que hace las peticiones. Las prueba
 * `tests/arnes-formulario.test.ts` y las usan las pruebas sobre la build
 * (`tests/plataforma-astro-reportar.test.ts`). Desde la terminal compara
 * Next y Astro (tasks.md #17):
 *
 *   node scripts/enviar-formulario.mjs <baseNext> <baseAstro> --datos <json>
 *
 * Todo lo que manda es ficticio.
 */
import { parse } from "node-html-parser";

/**
 * @typedef {{ nombre: string, valor: string, tipo: string, marcado: boolean }} Campo
 * @typedef {{ metodo: string, accion: string, codificacion: string, campos: Campo[] }} Formulario
 */

/**
 * El formulario número `indice` del HTML, con su destino resuelto contra la
 * URL de la página (un `action` vacío o ausente es la propia URL, con su
 * consulta, como dice el estándar).
 *
 * @param {string} html
 * @param {string} urlPagina
 * @param {number} [indice]
 * @returns {Formulario}
 */
export function leerFormulario(html, urlPagina, indice = 0) {
  const formulario = parse(html).querySelectorAll("form")[indice];
  if (!formulario) throw new Error(`la página no tiene el formulario #${indice}`);
  const atributo = (nodo, nombre) => {
    const entrada = Object.entries(nodo.attributes).find(([clave]) => clave.toLowerCase() === nombre);
    return entrada ? entrada[1] : undefined;
  };
  const metodo = (atributo(formulario, "method") ?? "get").toUpperCase() === "POST" ? "POST" : "GET";
  const crudo = atributo(formulario, "action");
  const accion = crudo ? new URL(crudo, urlPagina).toString() : urlPagina;
  const codificacion = (atributo(formulario, "enctype") ?? "application/x-www-form-urlencoded").toLowerCase();
  /** @type {Campo[]} */
  const campos = [];
  for (const nodo of formulario.querySelectorAll("input, textarea, select")) {
    const nombre = atributo(nodo, "name");
    if (!nombre || atributo(nodo, "disabled") !== undefined) continue;
    const etiqueta = nodo.rawTagName.toLowerCase();
    if (etiqueta === "textarea") {
      campos.push({ nombre, valor: nodo.text, tipo: "textarea", marcado: true });
    } else if (etiqueta === "select") {
      const opcion = nodo.querySelectorAll("option").find((o) => atributo(o, "selected") !== undefined) ?? nodo.querySelector("option");
      campos.push({ nombre, valor: opcion ? (atributo(opcion, "value") ?? opcion.text) : "", tipo: "select", marcado: true });
    } else {
      const tipo = (atributo(nodo, "type") ?? "text").toLowerCase();
      if (["submit", "button", "reset", "image", "file"].includes(tipo)) continue;
      const marcable = tipo === "radio" || tipo === "checkbox";
      campos.push({
        nombre,
        valor: atributo(nodo, "value") ?? (marcable ? "on" : ""),
        tipo,
        marcado: marcable ? atributo(nodo, "checked") !== undefined : true,
      });
    }
  }
  return { metodo, accion, codificacion, campos };
}

/**
 * Los pares `[nombre, valor]` que manda el navegador, en orden de documento.
 * `elecciones` hace lo que haría el vecino: marca el radio con ese valor o
 * escribe en el campo de texto. `extras` se agregan al final (campos que el
 * formulario NO trae: lo que mandaría alguien a mano).
 *
 * @param {Formulario} formulario
 * @param {Record<string, string>} [elecciones]
 * @param {Array<[string, string]>} [extras]
 * @returns {Array<[string, string]>}
 */
export function camposAEnviar(formulario, elecciones = {}, extras = []) {
  /** @type {Array<[string, string]>} */
  const pares = [];
  for (const campo of formulario.campos) {
    const elegido = Object.hasOwn(elecciones, campo.nombre) ? elecciones[campo.nombre] : undefined;
    if (campo.tipo === "radio" || campo.tipo === "checkbox") {
      const marcado = elegido === undefined ? campo.marcado : elegido === campo.valor;
      if (marcado) pares.push([campo.nombre, campo.valor]);
    } else {
      pares.push([campo.nombre, elegido ?? campo.valor]);
    }
  }
  return [...pares, ...extras];
}

/**
 * El cuerpo con la codificación que declara el formulario.
 *
 * @param {Array<[string, string]>} pares
 * @param {string} codificacion
 * @returns {FormData | URLSearchParams}
 */
export function cuerpoDelEnvio(pares, codificacion) {
  if (codificacion === "multipart/form-data") {
    const datos = new FormData();
    for (const [nombre, valor] of pares) datos.append(nombre, valor);
    return datos;
  }
  if (codificacion !== "application/x-www-form-urlencoded") {
    throw new Error(`codificación no soportada por el arnés: ${codificacion}`);
  }
  return new URLSearchParams(pares);
}

/**
 * `Origin` y `Referer` de un navegador para un POST de formulario desde
 * `urlPagina` hacia `urlDestino` con la política de referente de la página.
 * El `Origin` va siempre en un POST (salvo `no-referrer`, que lo vuelve
 * `null`); el `Referer`, según la política.
 *
 * @param {string} urlPagina
 * @param {string} urlDestino
 * @param {string} [politica]
 * @returns {{ origin: string, referer?: string }}
 */
export function cabecerasDeNavegador(urlPagina, urlDestino, politica = "strict-origin-when-cross-origin") {
  const pagina = new URL(urlPagina);
  pagina.hash = "";
  const mismoOrigen = pagina.origin === new URL(urlDestino).origin;
  switch (politica.split(",").at(-1)?.trim().toLowerCase()) {
    case "no-referrer":
      return { origin: "null" };
    case "same-origin":
      return mismoOrigen ? { origin: pagina.origin, referer: pagina.toString() } : { origin: pagina.origin };
    case "origin":
    case "strict-origin":
      return { origin: pagina.origin, referer: `${pagina.origin}/` };
    case "unsafe-url":
    case "no-referrer-when-downgrade":
      return { origin: pagina.origin, referer: pagina.toString() };
    default:
      // strict-origin-when-cross-origin / origin-when-cross-origin.
      return { origin: pagina.origin, referer: mismoOrigen ? pagina.toString() : `${pagina.origin}/` };
  }
}

/**
 * Atributos de un `Set-Cookie`, con los nombres en minúsculas (se comparan
 * sin distinguir mayúsculas, design.md §3).
 *
 * @param {string} linea
 * @returns {{ nombre: string, valor: string, atributos: Record<string, string> }}
 */
export function leerSetCookie(linea) {
  const [par, ...resto] = linea.split(";");
  const igual = par.indexOf("=");
  const atributos = {};
  for (const trozo of resto) {
    const [clave, ...valor] = trozo.trim().split("=");
    if (clave) atributos[clave.toLowerCase()] = valor.join("=");
  }
  return { nombre: par.slice(0, igual).trim(), valor: par.slice(igual + 1).trim(), atributos };
}

/** Frasco de cookies mínimo: nombre, valor y `Path` (prefijo de ruta). */
export class Frasco {
  /** @type {Map<string, { valor: string, ruta: string }>} */
  #galletas = new Map();

  /** @param {string[]} lineas */
  guardar(lineas) {
    for (const linea of lineas) {
      const { nombre, valor, atributos } = leerSetCookie(linea);
      const vida = atributos["max-age"];
      if (vida !== undefined && Number(vida) <= 0) this.#galletas.delete(nombre);
      else this.#galletas.set(nombre, { valor, ruta: atributos.path || "/" });
    }
  }

  /** @param {string} url */
  cabecera(url) {
    const ruta = new URL(url).pathname;
    const valores = [...this.#galletas]
      .filter(([, g]) => ruta === g.ruta || ruta.startsWith(g.ruta.endsWith("/") ? g.ruta : `${g.ruta}/`))
      .map(([nombre, g]) => `${nombre}=${g.valor}`);
    return valores.length ? valores.join("; ") : undefined;
  }

  /** @param {string} nombre */
  tiene(nombre) {
    return this.#galletas.has(nombre);
  }
}

/**
 * Las cabeceras sin las que valen `null` (así se QUITA una que pondría el
 * navegador, p. ej. el `Origin` de un envío hecho a mano).
 *
 * @param {Record<string, string | null | undefined>} cabeceras
 * @returns {Record<string, string>}
 */
function sinNulos(cabeceras) {
  return Object.fromEntries(Object.entries(cabeceras).filter(([, valor]) => typeof valor === "string"));
}

/**
 * Abre la página, envía su formulario y sigue las redirecciones a mano.
 *
 * @param {{
 *   urlPagina: string,
 *   elecciones?: Record<string, string>,
 *   extras?: Array<[string, string]>,
 *   frasco?: Frasco,
 *   cabecerasExtra?: Record<string, string | null>,
 *   indice?: number,
 *   pedir?: typeof fetch,
 * }} opciones
 */
export async function enviarFormulario({
  urlPagina,
  elecciones = {},
  extras = [],
  frasco = new Frasco(),
  cabecerasExtra = {},
  indice = 0,
  pedir = fetch,
}) {
  /** @type {Array<{ metodo: string, url: string, status: number, location: string | null, setCookie: string[], cabeceras: Headers }>} */
  const cadena = [];
  const get = async (url) => {
    const galleta = frasco.cabecera(url);
    const r = await pedir(url, { redirect: "manual", headers: sinNulos({ ...(galleta ? { cookie: galleta } : {}), ...cabecerasExtra }) });
    frasco.guardar(r.headers.getSetCookie());
    cadena.push({ metodo: "GET", url, status: r.status, location: r.headers.get("location"), setCookie: r.headers.getSetCookie(), cabeceras: r.headers });
    return { r, html: await r.text() };
  };

  const pagina = await get(urlPagina);
  const formulario = leerFormulario(pagina.html, urlPagina, indice);
  const politica = pagina.r.headers.get("referrer-policy") ?? undefined;
  const cuerpo = cuerpoDelEnvio(camposAEnviar(formulario, elecciones, extras), formulario.codificacion);
  const galleta = frasco.cabecera(formulario.accion);
  const r = await pedir(formulario.accion, {
    method: formulario.metodo,
    redirect: "manual",
    body: cuerpo,
    headers: sinNulos({
      ...cabecerasDeNavegador(urlPagina, formulario.accion, politica),
      ...(galleta ? { cookie: galleta } : {}),
      ...cabecerasExtra,
    }),
  });
  frasco.guardar(r.headers.getSetCookie());
  cadena.push({ metodo: formulario.metodo, url: formulario.accion, status: r.status, location: r.headers.get("location"), setCookie: r.headers.getSetCookie(), cabeceras: r.headers });
  let final = { status: r.status, html: await r.text(), url: formulario.accion };
  let saltos = 0;
  let actual = cadena.at(-1);
  while (actual && [301, 302, 303, 307, 308].includes(actual.status) && actual.location && saltos++ < 5) {
    const destino = new URL(actual.location, actual.url).toString();
    const siguiente = await get(destino);
    final = { status: siguiente.r.status, html: siguiente.html, url: destino };
    actual = cadena.at(-1);
  }
  return { formulario, cadena, final, frasco };
}

/**
 * Lo comparable de un desenlace: la cadena de estados, la RUTA del `Location`
 * (sin el origen, que es distinto en cada servidor) y los atributos de las
 * cookies, sin su valor (el borrador codifica lo mismo en los dos).
 */
export function resumenDelDesenlace({ cadena }) {
  return cadena.map((paso) => ({
    metodo: paso.metodo,
    status: paso.status,
    location: paso.location ? new URL(paso.location, paso.url).pathname + new URL(paso.location, paso.url).search : null,
    cookies: paso.setCookie.map((linea) => {
      const { nombre, atributos } = leerSetCookie(linea);
      // Sin `Expires` (es la hora del envío; `Max-Age` dice lo mismo) y con
      // el valor de `SameSite` en minúsculas: no distingue mayúsculas
      // (RFC 6265bis §5.4.7). Next manda `lax`; Astro, `Lax`.
      const comparables = Object.entries(atributos)
        .filter(([clave]) => clave !== "expires")
        .map(([clave, valor]) => [clave, clave === "samesite" ? valor.toLowerCase() : valor]);
      return { nombre, ...Object.fromEntries(comparables.sort()) };
    }),
  }));
}

// ── Línea de comandos: el mismo envío contra Next y contra Astro ─────────────

/**
 * Los envíos de la tarea 2 que se comparan contra Next (scenario "mismo
 * desenlace que Next"). `datos`: `{ publicado, tope }` (identificadores).
 * `aceptada`: la única diferencia admitida (origen ajeno: Next 500, Astro 403).
 */
export function enviosDe3a(datos) {
  const ficha = (id) => `/negocio/x-${id}/reportar`;
  const estado = (resumen) => resumen[1]?.status;
  return [
    { nombre: "éxito", ruta: ficha(datos.publicado), elecciones: { motivo: "cerrado" } },
    { nombre: "sin motivo con comentario", ruta: ficha(datos.publicado), elecciones: { comentario: "hablé con la dueña" } },
    { nombre: "comentario de 301", ruta: ficha(datos.publicado), elecciones: { motivo: "cerrado", comentario: "a".repeat(301) } },
    { nombre: "honeypot", ruta: ficha(datos.publicado), elecciones: { motivo: "cerrado", sitio_web: "http://spam.example" } },
    ...(datos.tope ? [{ nombre: "ficha en el tope", ruta: ficha(datos.tope), elecciones: { motivo: "cerrado" } }] : []),
    { nombre: "sin Origin", ruta: ficha(datos.publicado), elecciones: { motivo: "cerrado" }, cabeceras: { origin: null } },
    {
      nombre: "Origin ajeno",
      ruta: ficha(datos.publicado),
      elecciones: { motivo: "cerrado" },
      cabeceras: { origin: "https://ajeno.example" },
      aceptada: (next, astro) => estado(next) === 500 && estado(astro) === 403,
    },
    {
      nombre: "Origin null",
      ruta: ficha(datos.publicado),
      elecciones: { motivo: "cerrado" },
      cabeceras: { origin: "null" },
      aceptada: (next, astro) => estado(next) === 500 && estado(astro) === 403,
    },
  ];
}

async function principal(argumentos) {
  const [baseNext, baseAstro] = argumentos;
  const i = argumentos.indexOf("--datos");
  if (!baseNext || !baseAstro || i === -1) {
    console.error("Uso: node scripts/enviar-formulario.mjs <baseNext> <baseAstro> --datos <json>");
    return 2;
  }
  const { readFileSync } = await import("node:fs");
  const datos = JSON.parse(readFileSync(argumentos[i + 1], "utf8"));
  let diferencias = 0;
  for (const envio of enviosDe3a(datos)) {
    const [n, a] = await Promise.all(
      [baseNext, baseAstro].map((base) =>
        enviarFormulario({ urlPagina: new URL(envio.ruta, base).toString(), elecciones: envio.elecciones, cabecerasExtra: envio.cabeceras ?? {} }).then(
          resumenDelDesenlace,
        ),
      ),
    );
    const anonimo = (x) => JSON.parse([datos.publicado, datos.tope].filter(Boolean).reduce((t, id) => t.replaceAll(id, "<id>"), JSON.stringify(x)));
    const [rn, ra] = [anonimo(n), anonimo(a)];
    const igual = JSON.stringify(rn) === JSON.stringify(ra);
    const aceptada = !igual && Boolean(envio.aceptada?.(rn, ra));
    if (!igual && !aceptada) diferencias++;
    console.log(`${igual ? "igual   " : aceptada ? "ACEPTADA" : "DISTINTA"} ${envio.nombre}`);
    if (!igual && !aceptada) console.log(`  Next : ${JSON.stringify(rn)}\n  Astro: ${JSON.stringify(ra)}`);
  }
  console.log(diferencias ? `\n${diferencias} desenlaces distintos.` : "\nCero diferencias en los desenlaces.");
  return diferencias ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await principal(process.argv.slice(2));
}
