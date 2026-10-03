/**
 * La guarda de sesión del panel, POR CONSTRUCCIÓN (change
 * `migrar-panel-admin-base-astro`, Fase 5a, design.md §1; spec
 * `plataforma-astro`, requirement "Toda ruta del panel exige sesión por
 * construcción, no por lista").
 *
 * En Next cada archivo de `src/app/admin/` llamaba a `requerirSesionAdmin()`
 * y un guardián de texto lo vigilaba. Aquí el middleware clasifica cada
 * petición por el patrón de ruta que Astro VA A PINTAR (`routePattern`), con
 * una tabla cerrada:
 *
 * - `/admin`: la pantalla de acceso; pasa y la página decide;
 * - `/admin/[...resto]`: "no existe" para nadie; pasa SIN leer la cookie;
 * - todo lo demás que empiece con `/admin/` exige sesión, INCLUIDA una ruta
 *   nueva que nadie dio de alta (falla cerrada). Además, una prueba enumera
 *   las rutas reales de la build y falla si alguna no tiene política escrita.
 *
 * Sin sesión, una pantalla responde el 307 que responde Next y un envío de
 * Action el 303 de la guarda dentro de una Server Action (medidos, tarea 2),
 * siempre a `/admin` sin parámetros, sin leer la base ni el cuerpo y sin
 * ejecutar nada. Las únicas Actions que pasan sin sesión son `entrar` en
 * `/admin` y `salir` en `/admin/cola` (paridad, decisión 3 del fundador).
 *
 * La sesión es la de siempre: `haySesionValida` de `src/lib/admin/sesion.ts`
 * (misma firma HMAC, mismo secreto, misma cookie `nu_panel`). Sin panel
 * configurado nunca hay sesión.
 */
import { CACHE_DE_ACCION } from "@/astro/acciones";
import { CACHE_DE_HTML_DINAMICO } from "@/astro/cabeceras";
import { NOMBRE_COOKIE_SESION, haySesionValida } from "@/lib/admin/sesion";

export type PoliticaDelPanel = "acceso" | "no-existe" | "exige-sesion";

/** La tabla cerrada: cada patrón de ruta del panel que existe, con su política. */
export const POLITICAS_DEL_PANEL: Readonly<Record<string, PoliticaDelPanel>> = Object.freeze({
  "/admin": "acceso",
  "/admin/[...resto]": "no-existe",
  "/admin/cola": "exige-sesion",
  "/admin/negocios": "exige-sesion",
});

/** Las ÚNICAS Actions que corren sin sesión (lista cerrada de pares). */
export const ACCIONES_SIN_SESION: ReadonlyArray<Readonly<{ ruta: string; nombre: string }>> = Object.freeze([
  Object.freeze({ ruta: "/admin", nombre: "entrar" }),
  Object.freeze({ ruta: "/admin/cola", nombre: "salir" }),
]);

/** La pantalla de acceso: el único destino de la guarda, siempre sin parámetros. */
const RUTA_DEL_ACCESO = "/admin";

/** ¿Este patrón de ruta es del panel? */
function esDelPanel(routePattern: string): boolean {
  return routePattern === "/admin" || routePattern.startsWith("/admin/");
}

/**
 * La política de un patrón de ruta, o `undefined` si no es del panel. Un
 * patrón del panel que no está en la tabla EXIGE SESIÓN (falla cerrada).
 */
export function politicaDe(routePattern: string): PoliticaDelPanel | undefined {
  if (!esDelPanel(routePattern)) return undefined;
  return Object.hasOwn(POLITICAS_DEL_PANEL, routePattern) ? POLITICAS_DEL_PANEL[routePattern] : "exige-sesion";
}

/** Los patrones del panel que la build sabe pintar y que no tienen política escrita. */
export function rutasSinPolitica(patrones: Iterable<string>): string[] {
  return [...new Set(patrones)].filter((p) => esDelPanel(p) && !Object.hasOwn(POLITICAS_DEL_PANEL, p)).sort();
}

/** Las políticas escritas cuyo patrón ya no existe en la build (entradas viejas). */
export function politicasSinRuta(patrones: Iterable<string>): string[] {
  const existentes = new Set(patrones);
  return Object.keys(POLITICAS_DEL_PANEL).filter((p) => !existentes.has(p)).sort();
}

type LectorDeCookies = { get(nombre: string): { value: string } | undefined };

/** ¿La petición trae una sesión vigente? Relee la cookie cada vez (nunca `locals`). */
export function haySesionDelPanel(cookies: LectorDeCookies): boolean {
  return haySesionValida(cookies.get(NOMBRE_COOKIE_SESION)?.value, process.env, new Date());
}

/**
 * La redirección de una PANTALLA del panel (el 307 de `redirect()` de Next en
 * un render, medido): sin cuerpo, sin cookie y con el `Cache-Control` del
 * HTML dinámico, que incluye `no-store`.
 */
export function redireccionDePantalla(ruta: "/admin" | "/admin/cola"): Response {
  return new Response(null, { status: 307, headers: { Location: ruta, "Cache-Control": CACHE_DE_HTML_DINAMICO } });
}

/** La redirección de un ENVÍO sin sesión (el 303 de la guarda en una Server Action, medido). */
function envioAlAcceso(): Response {
  return new Response(null, { status: 303, headers: { Location: RUTA_DEL_ACCESO, "Cache-Control": CACHE_DE_ACCION } });
}

/** Lo que la guarda usa del contexto de Astro (y lo que arman las pruebas). */
export type ContextoDeLaGuardia = {
  routePattern: string;
  request: Pick<Request, "method">;
  cookies: LectorDeCookies;
};

/**
 * La guarda del middleware (design.md §1.3). `accion` es el nombre de la
 * Action que trae la petición (`getActionContext(…).action?.name`), si trae
 * una. Devuelve la respuesta sin sesión, o `undefined` para seguir.
 *
 * No lee el cuerpo: corre ANTES que la tabla de Actions.
 */
export function guardiaDelPanel(contexto: ContextoDeLaGuardia, accion: string | undefined): Response | undefined {
  // `acceso` y `no-existe` pasan sin leer la cookie (la página decide; el
  // comodín responde lo mismo a cualquiera); lo que no es del panel, también.
  if (politicaDe(contexto.routePattern) !== "exige-sesion") return undefined;
  if (accion !== undefined && ACCIONES_SIN_SESION.some((a) => a.ruta === contexto.routePattern && a.nombre === accion)) {
    return undefined;
  }
  if (haySesionDelPanel(contexto.cookies)) return undefined;
  // Un envío de Action: el 303 de la guarda de una Server Action. Cualquier
  // otra forma de pedir la pantalla (GET, HEAD, POST sin Action, PUT…): el 307.
  return accion !== undefined ? envioAlAcceso() : redireccionDePantalla(RUTA_DEL_ACCESO);
}

/**
 * La guarda de cada PÁGINA del panel, antes del primer acceso a datos
 * (defensa en profundidad, design.md §1.5 punto 4): relee la cookie y, sin
 * sesión, devuelve el mismo 307 que el middleware. Uso:
 *
 *   const sinSesion = exigirSesionAdmin(Astro);
 *   if (sinSesion) return sinSesion;
 */
export function exigirSesionAdmin(contexto: { cookies: LectorDeCookies }): Response | undefined {
  return haySesionDelPanel(contexto.cookies) ? undefined : redireccionDePantalla(RUTA_DEL_ACCESO);
}

/** ¿La ruta pedida es del panel? Sobre-inclusivo a propósito: decodificada, en minúsculas y sin barras dobles. */
function urlDelPanel(url: URL): boolean {
  let ruta = url.pathname;
  try {
    ruta = decodeURIComponent(ruta);
  } catch {
    // Una codificación rota se mira tal cual.
  }
  ruta = ruta.toLowerCase().replace(/\/{2,}/g, "/");
  return ruta === "/admin" || ruta.startsWith("/admin/");
}

/** Políticas tan estrictas o más que `strict-origin` que una respuesta del panel puede traer ya. */
const REFERENTES_QUE_SE_RESPETAN = ["strict-origin", "no-referrer"];

/**
 * `Referrer-Policy: strict-origin` en toda respuesta bajo `/admin` (design.md
 * §5; decisión 1 del fundador), ANTES de `prepararRespuesta`, que ya no la
 * pisa con la global. Cubre las respuestas sin documento del panel (307, 303,
 * 403 de origen, la 404 de una Action pedida desde otra ruta, la 500). Si la
 * respuesta ya trae una política igual de estricta o más, se respeta.
 */
export function conReferenteDelPanel(url: URL, respuesta: Response): Response {
  if (!urlDelPanel(url)) return respuesta;
  const actual = respuesta.headers.get("referrer-policy")?.trim().toLowerCase();
  if (actual && REFERENTES_QUE_SE_RESPETAN.includes(actual)) return respuesta;
  try {
    respuesta.headers.set("referrer-policy", "strict-origin");
    return respuesta;
  } catch {
    const copia = new Response(respuesta.body, respuesta);
    copia.headers.set("referrer-policy", "strict-origin");
    return copia;
  }
}
