/**
 * Las pantallas del panel de Astro en las pruebas que antes pintaban las de
 * Next (change `migrar-panel-admin-base-astro`, Fase 5a, design.md §9).
 *
 * Abren `src/pages/admin/*.astro` con la Container API y la MISMA sesión
 * simulada de siempre: la cookie de `peticion.cookies` (`tests/admin-mocks.ts`),
 * así que `conSesion()`/`reiniciarPeticion()` de cada prueba siguen valiendo.
 * Devuelven lo que hay dentro de `<main>` (lo que pintaba la página de Next) y
 * el documento entero aparte. Sin sesión, la página responde el 307 a
 * `/admin`; `urlDeRedireccionDelPanel` lo traduce como `urlDeRedireccion`.
 */
import Acceso from "../src/pages/admin/index.astro";
import Cola from "../src/pages/admin/cola.astro";
import Negocios from "../src/pages/admin/negocios.astro";
import { RedireccionSimulada, peticion } from "./admin-mocks";
import { contenidoDelMain, pintarRespuesta } from "./astro-paginas";

const PAGINAS = { acceso: { pagina: Acceso, ruta: "/admin" }, cola: { pagina: Cola, ruta: "/admin/cola" }, negocios: { pagina: Negocios, ruta: "/admin/negocios" } };

export type PantallaDelPanel = keyof typeof PAGINAS;

/** El querystring como lo arma el navegador (un arreglo repite el parámetro). */
function consultaDe(parametros: Record<string, string | string[]>): string {
  const consulta = new URLSearchParams();
  for (const [clave, valor] of Object.entries(parametros)) {
    for (const v of [valor].flat()) consulta.append(clave, v);
  }
  const texto = consulta.toString();
  return texto ? `?${texto}` : "";
}

/** La respuesta de una pantalla del panel, con la cookie simulada de la prueba. */
export async function respuestaDelPanel(pantalla: PantallaDelPanel, parametros: Record<string, string | string[]> = {}) {
  const cookie = Object.entries(peticion.cookies)
    .map(([nombre, valor]) => `${nombre}=${valor}`)
    .join("; ");
  const { pagina, ruta } = PAGINAS[pantalla];
  const r = await pintarRespuesta(pagina, { ruta: `${ruta}${consultaDe(parametros)}`, cabeceras: cookie ? { cookie } : {} });
  return { ...r, documento: r.html, html: r.status === 200 ? contenidoDelMain(r.html) : r.html };
}

/** Lo que pinta la pantalla dentro de `<main>` (exige un 200). */
export async function abrirPantallaDelPanel(pantalla: PantallaDelPanel, parametros: Record<string, string | string[]> = {}): Promise<string> {
  const r = await respuestaDelPanel(pantalla, parametros);
  if (r.status !== 200) throw new Error(`se esperaba un 200 de ${pantalla} y respondió ${r.status} (${r.location ?? "sin Location"})`);
  return r.html;
}

/**
 * La pantalla como se probaba la de Next: el contenido de `<main>` con un 200
 * y, si redirige, lanza la misma `RedireccionSimulada` que `redirect()`
 * simulado, así `urlDeRedireccion(() => pantallaComoNext("cola"))` sigue igual.
 */
export async function pantallaComoNext(pantalla: PantallaDelPanel, parametros: Record<string, string | string[]> = {}): Promise<string> {
  const r = await respuestaDelPanel(pantalla, parametros);
  if (r.status === 307 && r.location) throw new RedireccionSimulada(r.location);
  if (r.status !== 200) throw new Error(`la pantalla ${pantalla} respondió ${r.status}`);
  return r.html;
}

/** El `Location` de la redirección de la pantalla (lanza si no redirige), como `urlDeRedireccion`. */
export async function urlDeRedireccionDelPanel(pantalla: PantallaDelPanel, parametros: Record<string, string | string[]> = {}): Promise<string> {
  const r = await respuestaDelPanel(pantalla, parametros);
  if (r.status !== 307 || !r.location) throw new Error(`se esperaba una redirección de ${pantalla} y respondió ${r.status}`);
  return r.location;
}
