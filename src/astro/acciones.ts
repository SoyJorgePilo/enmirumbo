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
 * - **La excepción del registro (3b-1, design.md §3):** su error no pasa por
 *   un 303. La tabla fija el estado como resultado de la Action y la página
 *   vuelve a pintar el formulario en la misma respuesta, como Next sin JS.
 * - **La compuerta (3b-2, change `migrar-verificacion-sms-astro`, design.md
 *   §2.3):** una entrada puede declarar `puedeCorrer`. Si dice que no
 *   (`confirmar` y `reenviar` con la verificación apagada), el manejador NO
 *   se llama —ni el cuerpo, ni la cookie, ni la base, ni el proveedor— y la
 *   respuesta es la misma que su "no encontrado".
 * - **La pasada de la página de error (O1, design.md §5):** cuando una página
 *   o una Action lanzan, Astro pinta `/500` con la MISMA petición. Ahí no se
 *   ejecuta ninguna Action ni se deja que Astro la ejecute: se sigue a la 500.
 */
import type { APIContext, MiddlewareNext } from "astro";
import { ActionError, getActionContext } from "astro:actions";

import {
  RUTA_DE_REGISTRO,
  type ResultadoDeRegistrar,
  esEstadoDeRegistro,
  estadoTrasUnaFalla,
} from "@/astro/registro";
import {
  type ContextoDeReportar,
  RUTA_DE_REPORTAR,
  type ResultadoDeReportar,
  destinoTrasUnaFalla,
} from "@/astro/reportar";
import { DESTINOS_DE_VERIFICAR, RUTA_DE_VERIFICAR, type ResultadoDeVerificar } from "@/astro/verificar";
import { DESTINOS_DEL_ACCESO, RUTA_DE_LA_COLA, RUTA_DEL_ACCESO, type ResultadoDelAcceso } from "@/astro/panel/acceso";
import { verificacionEncendida } from "@/lib/verificacion/config";

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

/** El patrón de la página de error, por la que Astro vuelve a pasar al fallar (O1). */
const PATRON_ERROR = "/500";

/** El desenlace de cualquier Action de la tabla, cerrado. */
export type ResultadoDeAccion = ResultadoDeReportar | ResultadoDeRegistrar | ResultadoDeVerificar | ResultadoDelAcceso;

/** Lo que la tabla usa del contexto para decidir tras una falla. */
type ContextoDeLaTabla = Pick<ContextoDeReportar, "params">;

type EntradaDeAccion = {
  /** El patrón de ruta (`routePattern`) desde el que se permite. */
  ruta: string;
  /** Destino cuando la Action no llegó a correr (`ActionError` de Astro, con su código). */
  trasFallar: (contexto: ContextoDeLaTabla, codigo: string | undefined) => Promise<ResultadoDeAccion>;
  /** La compuerta: si dice que no, el manejador no se llama y la respuesta es su "no encontrado". */
  puedeCorrer?: () => boolean;
  /** Si está, los ÚNICOS destinos de 303 que se obedecen; cualquier otro es "no encontrado". */
  destinos?: ReadonlySet<string>;
};

/**
 * `confirmar` y `reenviar` (3b-2): con la capacidad apagada no corren, y si
 * Astro no pudo leer el envío, "no encontrado" sin leer la base (design.md §3).
 */
const ENTRADA_DE_VERIFICAR: EntradaDeAccion = {
  ruta: RUTA_DE_VERIFICAR,
  trasFallar: async () => ({ tipo: "no-encontrado" as const }),
  puedeCorrer: () => verificacionEncendida(),
  destinos: DESTINOS_DE_VERIFICAR,
};

/** Una entrada por Action. */
export const ACCIONES: Readonly<Record<string, EntradaDeAccion>> = Object.freeze({
  reportar: { ruta: RUTA_DE_REPORTAR, trasFallar: (contexto: ContextoDeLaTabla) => destinoTrasUnaFalla(contexto) },
  // Sin leer la base (a diferencia de reportar): el formulario se pinta igual.
  registrar: {
    ruta: RUTA_DE_REGISTRO,
    trasFallar: async (_contexto: ContextoDeLaTabla, codigo: string | undefined) => ({
      tipo: "repintar" as const,
      estado: estadoTrasUnaFalla(codigo),
    }),
  },
  confirmar: ENTRADA_DE_VERIFICAR,
  reenviar: ENTRADA_DE_VERIFICAR,
  // 5a (change `migrar-panel-admin-base-astro`, design.md §4 y §6): el acceso
  // al panel. Si Astro no pudo leer el envío, a `/admin` sin apartar intento,
  // sin comparar y sin tocar la cookie. La guarda de sesión del panel corre
  // ANTES que esta tabla (`src/middleware.ts`).
  entrar: { ruta: RUTA_DEL_ACCESO, trasFallar: async () => ({ tipo: "redirigir" as const, ruta: RUTA_DEL_ACCESO }), destinos: DESTINOS_DEL_ACCESO },
  salir: { ruta: RUTA_DE_LA_COLA, trasFallar: async () => ({ tipo: "redirigir" as const, ruta: RUTA_DEL_ACCESO }), destinos: DESTINOS_DEL_ACCESO },
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

function esResultado(valor: unknown): valor is ResultadoDeAccion {
  if (typeof valor !== "object" || valor === null || !("tipo" in valor)) return false;
  if (valor.tipo === "no-encontrado" || valor.tipo === "fuera-de-ruta") return true;
  if (valor.tipo === "repintar") return "estado" in valor && esEstadoDeRegistro(valor.estado);
  return valor.tipo === "redirigir" && "ruta" in valor && typeof valor.ruta === "string" && destinoSeguro(valor.ruta);
}

/** El código de un `ActionError` (o de lo que se le parezca), si lo trae. */
function codigoDeError(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : undefined;
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
  contexto: ContextoDeLaTabla,
): Promise<ResultadoDeAccion> {
  const entrada = entradaDe(nombre);
  if (!entrada) return { tipo: "fuera-de-ruta" };
  if (seguro.error) return entrada.trasFallar(contexto, codigoDeError(seguro.error));
  if (!esResultado(seguro.data)) return { tipo: "fuera-de-ruta" };
  // La lista cerrada de la entrada, si la tiene (3b-2): otra ruta no se obedece.
  if (entrada.destinos && seguro.data.tipo === "redirigir" && !entrada.destinos.has(seguro.data.ruta)) return { tipo: "no-encontrado" };
  return seguro.data;
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
 * Sigue a la página sin que nada vuelva a leer el cuerpo del envío (hallazgos
 * M1 y M2 de c-seguridad, 3b-1). Con un resultado de Action fijado y un cuerpo
 * de formulario, el renderizador de React de Astro (`getFormState` de
 * `@astrojs/react`) hace `request.clone().formData()` en CADA componente React
 * de la página: sin tope (el de 6 MiB solo vale en la lectura de la Action) y
 * sin atrapar el error de un multipart malformado, que corta la respuesta
 * después de las cabeceras. Esa lectura solo sirve a las islas con
 * `useActionState`, y aquí no hay ninguna (el formulario es nativo).
 *
 * Por eso, para pintar, la petición deja de declararse formulario: sin
 * `Content-Type`, `getFormState` sale sin leer (`isFormRequest`). La Action ya
 * leyó lo suyo (una sola vez, con el tope al leer en streaming); el resto del
 * cuerpo que no se leyó lo descarta el servidor HTTP.
 */
function pintarSinReleerElCuerpo(contexto: APIContext, siguiente: MiddlewareNext): Promise<Response> {
  contexto.request.headers.delete("content-type");
  return siguiente();
}

/**
 * La parte del middleware que atiende las Actions (design.md §1, pasos 2 y 3):
 * la tabla, la ejecución y el PRG. Lo demás sigue con `siguiente()`.
 */
export async function atenderAcciones(contexto: APIContext, siguiente: MiddlewareNext): Promise<Response> {
  if (contexto.routePattern === PATRON_ERROR) return pasadaDeLaPaginaDeError(contexto, siguiente);
  if (contexto.routePattern === PATRON_RPC) return comoDireccionInexistente(contexto);

  const { action, setActionResult, serializeActionResult } = getActionContext(contexto);
  if (!action) return siguiente();

  const entrada = entradaDe(action.name);
  if (action.calledFrom !== "form" || !entrada || contexto.routePattern !== entrada.ruta) {
    return comoDireccionInexistente(contexto);
  }

  // La compuerta, ANTES del manejador: con ella cerrada no se lee el cuerpo,
  // ni la cookie, ni la base, ni se construye el proveedor (3b-2).
  const resultado =
    entrada.puedeCorrer && !entrada.puedeCorrer()
      ? ({ tipo: "no-encontrado" } as const)
      : await resolverAccion(action.name, await action.handler(), contexto);
  if (resultado.tipo === "redirigir") return respuestaDeRedireccion(resultado.ruta);
  if (resultado.tipo === "no-encontrado") {
    // La página vuelve a leer la ficha (reportar) o la configuración
    // (verificar) y pinta la 404; con el resultado ya fijado, Astro no
    // ejecuta la Action otra vez.
    setActionResult(action.name, serializeActionResult({ data: undefined, error: new ActionError({ code: "NOT_FOUND" }) }));
    return conCacheDeAccion(await pintarSinReleerElCuerpo(contexto, siguiente));
  }
  if (resultado.tipo === "repintar") {
    // El error del registro: la página lee este estado con
    // `Astro.getActionResult` y vuelve a pintar el formulario en el mismo 200,
    // sin PRG y sin guardar lo capturado en ningún lado (design.md §3). Con el
    // resultado ya fijado, Astro no ejecuta la Action otra vez.
    setActionResult(action.name, serializeActionResult({ data: resultado.estado, error: undefined }));
    return conCacheDeAccion(await pintarSinReleerElCuerpo(contexto, siguiente));
  }
  return comoDireccionInexistente(contexto);
}

/**
 * O1 (design.md §5): la pasada por `/500` que hace Astro cuando una página o
 * una Action lanzan, con la MISMA petición `POST …?_action=…`. Sin esto, la
 * tabla la veía como "Action pedida desde otra ruta" y respondía la 404. Aquí
 * no se ejecuta nada: si la petición trae una Action, se fija un error como su
 * resultado (así Astro tampoco la ejecuta al pintar) y se sigue a la 500.
 */
function pasadaDeLaPaginaDeError(contexto: APIContext, siguiente: MiddlewareNext): Promise<Response> {
  const { action, setActionResult, serializeActionResult } = getActionContext(contexto);
  if (action) {
    setActionResult(action.name, serializeActionResult({ data: undefined, error: new ActionError({ code: "INTERNAL_SERVER_ERROR" }) }));
  }
  return pintarSinReleerElCuerpo(contexto, siguiente);
}
