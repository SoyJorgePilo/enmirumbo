/**
 * Cabeceras de seguridad para lo que Vercel sirve directo de la CDN (change
 * `migrar-lectura-publica-astro`, design.md §5; patrón del spike T-021,
 * `spikes/astro/src/integraciones/cabeceras-en-la-cdn.ts`).
 *
 * POR QUÉ HACE FALTA: en Vercel el middleware de Astro NO corre para un
 * archivo estático (páginas prerenderizadas, la 404, la imagen de marca, las
 * hojas de `/_astro/`, lo de `public/`). Next lo resolvía con `headers()` en
 * `next.config.ts`; aquí, en `astro:build:done` y DESPUÉS del adaptador, se
 * agregan a `.vercel/output/config.json`:
 *
 * - antes de `handle: filesystem`, una ruta `{ src, headers, continue: true }`
 *   por archivo estático;
 * - las cabeceras en la propia ruta comodín que manda las URLs desconocidas a
 *   `/404.html` (las rutas de cabeceras se evalúan contra la URL pedida, no
 *   contra el destino, así que la 404 necesita las suyas);
 * - `Content-Type: image/png` para `/opengraph-image`, que no tiene extensión;
 * - las cuatro (sin tipo) en las URLs de una ruta PRERENDERIZADA que la CDN no
 *   sirve y que acaban en la función: la barra final de un estático sin
 *   extensión (`/opengraph-image/`) y la página suelta de la raíz sin `.html`
 *   (`/404`). Desde la Fase 2b la ruta `^/([^/]+?)/?$` de `/[destino]` las
 *   manda a la función, y Astro, al reconocerlas como prerenderizadas,
 *   responde SIN pasar por el middleware (change
 *   `migrar-directorio-publico-astro`, `reports/b-dev.md`).
 *
 * No toca ninguna ruta de la función: así una ruta que ponga una política de
 * referente más estricta (fases 4 y 5) no queda pisada por esta.
 *
 * SALVEDAD: solo un preview de Vercel confirma que Vercel las aplica
 * (tasks.md #19). En local lo emula `scripts/servir-salida-vercel.mjs`.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { AstroIntegration } from "astro";

import { cabecerasComoObjeto } from "../cabeceras";

export type RutaVercel = Record<string, unknown>;

/** Archivos estáticos que necesitan un tipo de contenido explícito. */
const TIPOS_EXPLICITOS: Record<string, string> = { "opengraph-image": "image/png" };

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

/**
 * Variantes de la URL de un archivo de la raíz que la CDN no sirve y que la
 * función atiende sin middleware: `/<archivo>/` si no tiene extensión, y
 * `/404` o `/404/` para la 404 (el único `.html` suelto que publica Astro).
 * Nada más: una variante más amplia podría alcanzar una ruta de la función y
 * pisarle una política más estricta (`astro-seguridad-adversarial`).
 */
function patronDeVariante(archivo: string): string | null {
  if (archivo === "404.html") return "^/404/?$";
  if (archivo.includes("/") || archivo.includes(".")) return null;
  return `^/${escapar(archivo)}/$`;
}

/** La tabla de rutas del adaptador, con las cabeceras de la CDN agregadas. */
export function rutasConCabecerasEnLaCdn(rutas: RutaVercel[], archivos: string[]): RutaVercel[] {
  const indice = rutas.findIndex((r) => r.handle === "filesystem");
  if (indice === -1) throw new Error("config.json sin `handle: filesystem`: el adaptador cambió de forma");
  const indice404 = rutas.findIndex((r) => r.dest === "/404.html" && r.status === 404);
  if (indice404 === -1) {
    throw new Error("config.json sin la ruta comodín a /404.html: ¿la 404 dejó de estar prerenderizada?");
  }

  const seguridad = cabecerasComoObjeto();
  const porArchivo = archivos.map((archivo) => ({
    src: patronDe(archivo),
    headers: {
      ...seguridad,
      ...(TIPOS_EXPLICITOS[archivo] ? { "Content-Type": TIPOS_EXPLICITOS[archivo] } : {}),
    },
    continue: true,
  }));
  const porVariante = archivos.flatMap((archivo) => {
    const src = patronDeVariante(archivo);
    return src ? [{ src, headers: { ...seguridad }, continue: true }] : [];
  });
  const conCabeceras = rutas.map((ruta, i) =>
    i === indice404 ? { ...ruta, headers: { ...((ruta.headers as Record<string, string>) ?? {}), ...seguridad } } : ruta,
  );
  return [...conCabeceras.slice(0, indice), ...porArchivo, ...porVariante, ...conCabeceras.slice(indice)];
}

export function cabecerasEnLaCdn(): AstroIntegration {
  let raiz: URL;
  let cliente: URL;
  return {
    name: "enmirumbo:cabeceras-en-la-cdn",
    hooks: {
      "astro:config:done": ({ config }) => {
        raiz = config.root;
        // Lo que el adaptador publica en `.vercel/output/static/` sale de aquí.
        cliente = config.build.client;
      },
      "astro:build:done": ({ logger }) => {
        const archivoConfig = fileURLToPath(new URL("./.vercel/output/config.json", raiz));
        if (!existsSync(archivoConfig)) {
          throw new Error(`No existe ${archivoConfig}: esta integración corrió antes que el adaptador`);
        }
        const dirCliente = fileURLToPath(cliente);
        const archivos = readdirSync(dirCliente, { recursive: true, withFileTypes: true })
          .filter((entrada) => entrada.isFile())
          .map((entrada) => `${entrada.parentPath}/${entrada.name}`.slice(dirCliente.length).replace(/^\//, ""));
        const config = JSON.parse(readFileSync(archivoConfig, "utf8")) as { routes: RutaVercel[] };
        config.routes = rutasConCabecerasEnLaCdn(config.routes, archivos);
        writeFileSync(archivoConfig, JSON.stringify(config, null, "\t"));
        logger.info(`cabeceras de seguridad en ${archivos.length} archivos de la CDN y en la 404`);
      },
    },
  };
}
