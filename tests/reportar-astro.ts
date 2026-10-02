/**
 * El reporte servido por Astro, con la forma que tenían la Server Action y las
 * páginas de Next en las pruebas (change `migrar-formularios-publicos-astro`,
 * tasks.md #15). Así las pruebas que importaban
 * `src/app/(publico)/negocio/[ficha]/reportar` conservan sus aserciones y
 * ahora prueban lo que se sirve.
 *
 * - `reportarNegocio(id, formData)` corre la Action REAL (`src/actions`) con
 *   el contexto que arma Astro y traduce su desenlace con la tabla de Actions
 *   (`src/astro/acciones.ts`), igual que el middleware: lanza
 *   `RedireccionSimulada` (el 303) o `NoEncontradoSimulado` (la 404), como
 *   antes lanzaban `redirect()`/`notFound()`. El identificador va en el
 *   segmento de la URL (`x-<id>`), que es de donde lo lee la Action.
 * - Lee la petición de `peticion` (`tests/admin-mocks.ts`): cabeceras y
 *   cookies; y anota ahí las cookies que pone, con las mismas opciones.
 * - `pintarReportar` y `pintarGracias` pintan las páginas `.astro` reales
 *   con la Container API y devuelven lo que hay en `<main>`; la 404 lanza
 *   `NoEncontradoSimulado`, como el `notFound()` de antes.
 */
import { server } from "../src/actions/index";
import { resolverAccion } from "../src/astro/acciones";
import { RUTA_DE_REPORTAR, type ContextoDeReportar } from "../src/astro/reportar";
import Reportar from "../src/pages/negocio/[ficha]/reportar.astro";
import Gracias from "../src/pages/negocio/[ficha]/reportar/gracias.astro";
import { NoEncontradoSimulado, RedireccionSimulada, peticion } from "./admin-mocks";
import { contenidoDelMain, pintarRespuesta } from "./astro-paginas";

/** El segmento de la URL con el que se pide el reporte de ese identificador. */
export const segmentoDe = (negocioId: unknown) => `x-${String(negocioId)}`;

/** Envía el formulario a la Action; lanza como lanzaban `redirect()`/`notFound()`. */
export async function reportarNegocio(negocioId: unknown, formData: unknown): Promise<never> {
  const segmento = segmentoDe(negocioId);
  const contexto: ContextoDeReportar = {
    routePattern: RUTA_DE_REPORTAR,
    params: { ficha: segmento },
    request: new Request(`https://enmirumbo.example/negocio/${encodeURIComponent(segmento)}/reportar?_action=reportar`, {
      method: "POST",
      headers: new Headers(peticion.encabezados),
    }),
    cookies: {
      set: (nombre, valor, opciones = {}) => {
        peticion.puestas.push({ nombre, valor, opciones: { ...opciones } });
      },
    },
  };
  Reflect.set(contexto, Symbol.for("astro.actionAPIContext"), true);
  const seguro = await server.reportar.call(contexto as never, formData as FormData);
  const resultado = await resolverAccion("reportar", seguro, contexto);
  if (resultado.tipo === "redirigir") throw new RedireccionSimulada(resultado.ruta);
  if (resultado.tipo === "no-encontrado") throw new NoEncontradoSimulado();
  throw new Error("la Action se pidió fuera de su ruta");
}

function cabeceraDeCookies(): Record<string, string> {
  const pares = Object.entries(peticion.cookies).map(([nombre, valor]) => `${nombre}=${valor}`);
  return pares.length ? { cookie: pares.join("; ") } : {};
}

function consulta(parametros: Record<string, string | string[]>): string {
  const p = new URLSearchParams();
  for (const [clave, valor] of Object.entries(parametros)) for (const v of [valor].flat()) p.append(clave, v);
  const texto = p.toString();
  return texto ? `?${texto}` : "";
}

/** El documento y el estado de `/negocio/<segmento>/reportar`. */
export async function respuestaDeReportar(segmento: string, parametros: Record<string, string | string[]> = {}) {
  return pintarRespuesta(Reportar, {
    ruta: `/negocio/${encodeURIComponent(segmento)}/reportar${consulta(parametros)}`,
    params: { ficha: segmento },
    cabeceras: cabeceraDeCookies(),
  });
}

/** Lo que hay en `<main>` del formulario; lanza `NoEncontradoSimulado` si responde 404. */
export async function pintarReportar(segmento: string, parametros: Record<string, string | string[]> = {}): Promise<string> {
  const { status, html } = await respuestaDeReportar(segmento, parametros);
  if (status === 404) throw new NoEncontradoSimulado();
  if (status !== 200) throw new Error(`/negocio/${segmento}/reportar respondió ${status}`);
  return contenidoDelMain(html);
}

/** Lo que hay en `<main>` de la confirmación. `segmento` va tal cual en la URL (se codifica). */
export async function pintarGracias(segmento: string): Promise<string> {
  const { status, html } = await pintarRespuesta(Gracias, {
    ruta: `/negocio/${encodeURIComponent(segmento)}/reportar/gracias`,
    params: { ficha: segmento },
  });
  if (status !== 200) throw new Error(`la confirmación respondió ${status}`);
  return contenidoDelMain(html);
}
