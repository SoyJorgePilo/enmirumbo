/**
 * Pintar páginas de Astro en las pruebas (change `migrar-lectura-publica-astro`,
 * tasks.md #15): la Container API con el renderizador de React, sin levantar
 * servidor. Es lo que reemplaza, para las rutas de la Fase 2a, al
 * `renderToStaticMarkup(createElement(Pagina))` de las páginas de `src/app/`.
 *
 * `pintarPagina` devuelve el DOCUMENTO completo (layout incluido). Las
 * aserciones que antes miraban solo la página usan `contenidoDelMain`: lo que
 * hay dentro de `<main>`, que es lo que pintaba la página de Next más lo que
 * agrega el tronco (el script de la medición, si está configurada).
 */
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { loadRenderers } from "astro:container";
import { getContainerRenderer } from "@astrojs/react/container-renderer";

type ComponenteAstro = Parameters<AstroContainer["renderToString"]>[0];

export const URL_DE_PRUEBA = "https://enmirumbo.example";

let contenedor: Promise<AstroContainer> | undefined;

function contenedorAstro(): Promise<AstroContainer> {
  contenedor ??= (async () =>
    AstroContainer.create({ renderers: await loadRenderers([getContainerRenderer()]) }))();
  return contenedor;
}

type OpcionesDePintado = {
  ruta?: string;
  slots?: Record<string, string>;
  props?: Record<string, unknown>;
  /** Parámetros de una ruta dinámica (`[destino]`, `[ficha]`), ya decodificados. */
  params?: Record<string, string>;
  /** Cabeceras de la petición (p. ej. la `cookie` del borrador del reporte, 3a). */
  cabeceras?: Record<string, string>;
};

function opcionesDelContenedor(opciones: OpcionesDePintado) {
  return {
    partial: false,
    request: new Request(`${URL_DE_PRUEBA}${opciones.ruta ?? "/"}`, { headers: opciones.cabeceras ?? {} }),
    ...(opciones.slots ? { slots: opciones.slots } : {}),
    ...(opciones.props ? { props: opciones.props } : {}),
    ...(opciones.params ? { params: opciones.params } : {}),
  };
}

/** El documento HTML completo de una página de `src/pages/` o de un layout. */
export async function pintarPagina(pagina: ComponenteAstro, opciones: OpcionesDePintado = {}): Promise<string> {
  const c = await contenedorAstro();
  return c.renderToString(pagina, opcionesDelContenedor(opciones));
}

/**
 * La respuesta completa (estado y documento) de una página: lo que necesitan
 * las rutas que responden 404 pintando la página de no encontrado (2b).
 */
export async function pintarRespuesta(
  pagina: ComponenteAstro,
  opciones: OpcionesDePintado = {},
): Promise<{ status: number; html: string }> {
  const c = await contenedorAstro();
  const respuesta = await c.renderToResponse(pagina, opcionesDelContenedor(opciones));
  return { status: respuesta.status, html: await respuesta.text() };
}

/** Lo que hay DENTRO de `<main …>…</main>` (lo que pintaba la página en Next). */
export function contenidoDelMain(documento: string): string {
  const inicio = documento.search(/<main[\s>]/);
  if (inicio === -1) throw new Error("el documento no tiene <main>");
  const apertura = documento.indexOf(">", inicio) + 1;
  const cierre = documento.lastIndexOf("</main>");
  return documento.slice(apertura, cierre);
}

/** El `<head>` del documento, sin las etiquetas que lo abren y lo cierran. */
export function cabezaDe(documento: string): string {
  return /<head>([\s\S]*?)<\/head>/.exec(documento)?.[1] ?? "";
}

/** Pide un endpoint (`GET`) de `src/pages/` como lo haría el servidor. */
export async function pedirEndpoint(
  modulo: { GET: (contexto: never) => Response | Promise<Response> },
  ruta: string,
  params: Record<string, string> = {},
): Promise<Response> {
  const request = new Request(`${URL_DE_PRUEBA}${ruta}`);
  return modulo.GET({ request, url: new URL(request.url), params } as never);
}
