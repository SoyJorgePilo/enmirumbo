/**
 * La tabla de Actions y el PRG (change `migrar-formularios-publicos-astro`,
 * design.md §2 y §3; spec `plataforma-astro`, requirements "Cada Action corre
 * solo por envío de formulario y solo desde su ruta" y "Los formularios
 * siguen el patrón POST → 303 → GET con destinos que arma el servidor").
 *
 * - **Solo por formulario y solo desde su ruta.** Astro, solo, ejecuta
 *   cualquier `?_action=<nombre>` en CUALQUIER página y además publica la vía
 *   RPC `/_actions/<nombre>`. Aquí cada Action tiene UNA ruta; pedida por RPC,
 *   desde otra ruta o con un nombre que no está en la tabla, responde igual
 *   que una dirección que no existe, sin ejecutar nada.
 * - **PRG sin `Referer`.** El 303 va a una ruta que arma el servidor con lo
 *   que devolvió la base; nunca sale del `Referer` (con `strict-origin` es
 *   solo el origen; ADR-013-spike, costo 1b), del `Origin` ni de un campo.
 * - **El 303 se arma con cabeceras MUTABLES** (no con `Response.redirect`):
 *   el adaptador de Vercel le agrega después el `Set-Cookie` del borrador.
 */
import type { APIContext, MiddlewareNext } from "astro";
import { ActionError, getActionContext } from "astro:actions";

import {
  type ContextoDeReportar,
  RUTA_DE_REPORTAR,
  type ResultadoDeReportar,
  destinoTrasUnaFalla,
} from "@/astro/reportar";

/**
 * El `Cache-Control` que manda Next al atender una Server Action (medido en
 * la build de `main`: el 303 y la 404 de un envío; fixtures
 * `tests/fixtures/next-3a/*\/respuestas.json`).
 */
export const CACHE_DE_ACCION = "no-cache, no-store, max-age=0, must-revalidate";

/**
 * Página de las respuestas que arma el middleware: el 403 de origen (con la
 * marca `locals.envioRechazado`) y "como una dirección inexistente" (sin ella).
 */
export const RUTA_DE_RESPUESTAS_DEL_MIDDLEWARE = "/envio-rechazado";

/** El patrón de la vía RPC que Astro inyecta (`ACTION_RPC_ROUTE_PATTERN`). */
const PATRON_RPC = "/_actions/[...path]";

type EntradaDeAccion = {
  /** El patrón de ruta (`routePattern`) desde el que se permite. */
  ruta: string;
  /** Destino cuando la Action no llegó a correr (`ActionError` de Astro). */
  trasFallar: (contexto: Pick<ContextoDeReportar, "params">) => Promise<ResultadoDeReportar>;
};

/** Una entrada por Action. En 3a, solo `reportar`. */
export const ACCIONES: Readonly<Record<string, EntradaDeAccion>> = Object.freeze({
  reportar: { ruta: RUTA_DE_REPORTAR, trasFallar: destinoTrasUnaFalla },
});

function entradaDe(nombre: string): EntradaDeAccion | undefined {
  return Object.hasOwn(ACCIONES, nombre) ? ACCIONES[nombre] : undefined;
}

/** ¿Es una ruta del propio sitio? Empieza con `/`, no con `//` ni `/\`, sin espacios ni controles. */
export function destinoSeguro(ruta: string): boolean {
  return /^\/(?![/\\])[A-Za-z0-9\-._~/?=&%]*$/.test(ruta);
}

/** El 303 del PRG. Lanza si el destino no es del sitio (el constructor ya lo garantiza). */
export function respuestaDeRedireccion(ruta: string): Response {
  if (!destinoSeguro(ruta)) throw new Error("destino de redirección fuera del sitio");
  return new Response(null, { status: 303, headers: { Location: ruta, "Cache-Control": CACHE_DE_ACCION } });
}

function esResultado(valor: unknown): valor is ResultadoDeReportar {
  if (typeof valor !== "object" || valor === null || !("tipo" in valor)) return false;
  if (valor.tipo === "no-encontrado" || valor.tipo === "fuera-de-ruta") return true;
  return valor.tipo === "redirigir" && "ruta" in valor && typeof valor.ruta === "string" && destinoSeguro(valor.ruta);
}

/**
 * El desenlace de una Action a partir de su resultado seguro (`{ data, error }`
 * de Astro). Un `ActionError` (cuerpo desmedido, cuerpo que no es formulario,
 * falla interna) significa que el manejador no corrió o no terminó: decide la
 * entrada de la tabla con su propia lectura de la base. Un resultado con otra
 * forma no se obedece.
 */
export async function resolverAccion(
  nombre: string,
  seguro: { data?: unknown; error?: unknown },
  contexto: Pick<ContextoDeReportar, "params">,
): Promise<ResultadoDeReportar> {
  const entrada = entradaDe(nombre);
  if (!entrada) return { tipo: "fuera-de-ruta" };
  if (seguro.error) return entrada.trasFallar(contexto);
  return esResultado(seguro.data) ? seguro.data : { tipo: "fuera-de-ruta" };
}

/** Igual que una dirección que no existe: la 404 de no encontrado, sin ejecutar nada. */
function comoDireccionInexistente(contexto: APIContext): Promise<Response> {
  return contexto.rewrite(RUTA_DE_RESPUESTAS_DEL_MIDDLEWARE);
}

/** La respuesta con el `Cache-Control` de una Action, aunque sus cabeceras sean inmutables. */
function conCacheDeAccion(respuesta: Response): Response {
  try {
    respuesta.headers.set("cache-control", CACHE_DE_ACCION);
    return respuesta;
  } catch {
    const copia = new Response(respuesta.body, respuesta);
    copia.headers.set("cache-control", CACHE_DE_ACCION);
    return copia;
  }
}

/**
 * La parte del middleware que atiende las Actions (design.md §1, pasos 2 y 3):
 * la tabla, la ejecución y el PRG. Lo demás sigue con `siguiente()`.
 */
export async function atenderAcciones(contexto: APIContext, siguiente: MiddlewareNext): Promise<Response> {
  if (contexto.routePattern === PATRON_RPC) return comoDireccionInexistente(contexto);

  const { action, setActionResult, serializeActionResult } = getActionContext(contexto);
  if (!action) return siguiente();

  const entrada = entradaDe(action.name);
  if (action.calledFrom !== "form" || !entrada || contexto.routePattern !== entrada.ruta) {
    return comoDireccionInexistente(contexto);
  }

  const resultado = await resolverAccion(action.name, await action.handler(), contexto);
  if (resultado.tipo === "redirigir") return respuestaDeRedireccion(resultado.ruta);
  if (resultado.tipo === "no-encontrado") {
    // La página vuelve a leer la ficha y pinta la 404; con el resultado ya
    // fijado, Astro no ejecuta la Action otra vez.
    setActionResult(action.name, serializeActionResult({ data: undefined, error: new ActionError({ code: "NOT_FOUND" }) }));
    return conCacheDeAccion(await siguiente());
  }
  return comoDireccionInexistente(contexto);
}
