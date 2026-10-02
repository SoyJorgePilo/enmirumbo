/**
 * Cabeceras para lo que Vercel sirve directo de la CDN (páginas con
 * `prerender = true` y archivos de `_astro/`).
 *
 * POR QUÉ HACE FALTA: en Vercel el middleware de Astro NO corre para un
 * archivo estático, y `@astrojs/vercel` solo copia a `config.json` la CSP que
 * genera la función `security.csp` de Astro (y solo con `staticHeaders`). Las
 * otras tres cabeceras —y nuestra CSP, que no es la de Astro— no llegarían.
 * Next lo resuelve con `headers()` en `next.config.ts`; aquí es esta función,
 * que agrega rutas `{ src, headers, continue: true }` al Build Output API.
 */
import { cabecerasPara } from "./cabeceras";

export type RutaVercel = Record<string, unknown>;

function escapar(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Patrón del Build Output API para un archivo de `.vercel/output/static/`. */
function patronDe(archivo: string): string {
  if (archivo === "index.html") return "^/(?:index\\.html)?$";
  if (archivo.endsWith("/index.html")) {
    const carpeta = escapar(archivo.slice(0, -"/index.html".length));
    return `^/${carpeta}(?:/|/index\\.html)?$`;
  }
  return `^/${escapar(archivo)}$`;
}

export function rutasConCabecerasEstaticas(rutas: RutaVercel[], archivos: string[]): RutaVercel[] {
  const indice = rutas.findIndex((r) => r.handle === "filesystem");
  if (indice === -1) throw new Error("config.json sin `handle: filesystem`: el adaptador cambió de forma");
  const nuevas = archivos.map((archivo) => ({
    src: patronDe(archivo),
    // Ninguna página de la CDN es la del formulario: valen las de producción.
    headers: cabecerasPara(`/${archivo}`),
    continue: true,
  }));
  return [...rutas.slice(0, indice), ...nuevas, ...rutas.slice(indice)];
}
