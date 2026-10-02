/**
 * Integración del spike: después de que `@astrojs/vercel` escribe
 * `.vercel/output/config.json`, le agrega las cabeceras de seguridad para cada
 * archivo que sirve la CDN (ver `src/lib/cabeceras-estaticas.ts`).
 *
 * Corre en `astro:build:done`, que Astro llama en el orden de las
 * integraciones; el adaptador se registra antes que las del usuario. Si algún
 * día el orden cambia, el build truena en vez de publicar sin cabeceras.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";

import { rutasConCabecerasEstaticas, type RutaVercel } from "../lib/cabeceras-estaticas";

export function cabecerasEnLaCdn(): AstroIntegration {
  let raiz: URL;
  let cliente: URL;
  return {
    name: "spike:cabeceras-en-la-cdn",
    hooks: {
      "astro:config:done": ({ config }) => {
        raiz = config.root;
        // Lo que el adaptador copia a `.vercel/output/static/` sale de aquí;
        // la copia ocurre DESPUÉS de este hook, así que se lee el origen.
        cliente = config.build.client;
      },
      "astro:build:done": ({ logger }) => {
        const salida = fileURLToPath(new URL("./.vercel/output/", raiz));
        const archivoConfig = `${salida}config.json`;
        if (!existsSync(archivoConfig)) {
          throw new Error(`[spike] no existe ${archivoConfig}: esta integración corrió antes que el adaptador`);
        }
        const dirCliente = fileURLToPath(cliente);
        const estaticos = readdirSync(dirCliente, { recursive: true, withFileTypes: true })
          .filter((entrada) => entrada.isFile())
          .map((entrada) => `${entrada.parentPath}/${entrada.name}`.slice(dirCliente.length).replace(/^\//, ""));
        const config = JSON.parse(readFileSync(archivoConfig, "utf8")) as { routes: RutaVercel[] };
        config.routes = rutasConCabecerasEstaticas(config.routes, estaticos);
        writeFileSync(archivoConfig, JSON.stringify(config, null, "\t"));
        logger.info(`cabeceras de seguridad agregadas a ${estaticos.length} archivos de la CDN`);
      },
    },
  };
}
