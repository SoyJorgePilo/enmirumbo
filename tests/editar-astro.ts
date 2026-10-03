/**
 * Pintar y enviar el modo edición de Astro en las pruebas, sin servidor
 * (change `migrar-enlace-gestion-astro`, tasks.md #15). Es lo que reemplaza,
 * en las pruebas re-apuntadas, a pintar `src/app/(gestion)/editar/[token]/page.tsx`
 * y a llamar `accion.ts` con `next/headers` simulado:
 *
 * - `abrirEdicion(token)`: la página de Astro con la Container API (estado y
 *   documento completo, tronco incluido). Un token que no abre responde 404
 *   con la 404 dinámica, no una excepción.
 * - `enviarEdicion(token, formData, ip)`: el manejador real de la Action
 *   (`editarDesdeElFormulario`) con el contexto que arma Astro (la ruta, el
 *   segmento y las cabeceras), traducido por la tabla como lo hace el
 *   middleware (`resolverAccion`).
 */
import { resolverAccion } from "../src/astro/acciones";
import { RUTA_DE_EDITAR, type ResultadoDeEditar, editarDesdeElFormulario } from "../src/astro/editar";
import GraciasEdicion from "../src/pages/editar/[token]/gracias.astro";
import EditarPage from "../src/pages/editar/[token].astro";
import { pintarPagina, pintarRespuesta } from "./astro-paginas";

/** La pantalla `/editar/<token>`: estado y documento. */
export function abrirEdicion(token: string): Promise<{ status: number; html: string }> {
  return pintarRespuesta(EditarPage, { ruta: `/editar/${encodeURIComponent(token)}`, params: { token } });
}

/** La confirmación `/editar/<token>/gracias` (documento completo). */
export function pintarGraciasEdicion(token: string): Promise<string> {
  return pintarPagina(GraciasEdicion, { ruta: `/editar/${encodeURIComponent(token)}/gracias`, params: { token } });
}

/** Un envío de la edición, como lo corre el middleware, con la IP en el encabezado declarado. */
export async function enviarEdicion(
  token: string,
  formData: FormData,
  cabeceras: Record<string, string> = {},
): Promise<ResultadoDeEditar> {
  const contexto = {
    routePattern: RUTA_DE_EDITAR,
    request: new Request(`https://enmirumbo.example/editar/${encodeURIComponent(token)}?_action=editar`, { method: "POST", headers: cabeceras }),
    params: { token },
  };
  const resultado = await editarDesdeElFormulario(formData, contexto);
  return (await resolverAccion("editar", { data: resultado, error: undefined }, contexto)) as ResultadoDeEditar;
}

/** El destino del 303 de un envío; lanza si el desenlace no fue un 303. */
export function destinoDe(resultado: ResultadoDeEditar): string {
  if (resultado.tipo !== "redirigir") throw new Error(`se esperaba un 303 y llegó ${resultado.tipo}`);
  return resultado.ruta;
}

/** El estado re-pintado de un envío; lanza si el desenlace no fue un re-pintado. */
export function estadoDe(resultado: ResultadoDeEditar) {
  if (resultado.tipo !== "repintar") throw new Error(`se esperaba un re-pintado y llegó ${resultado.tipo}`);
  return resultado.estado;
}
