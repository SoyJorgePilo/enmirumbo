import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { AstroIntegration } from "astro";

import { generarImagenDeMarca } from "../imagen-de-marca/generar";

/**
 * Imagen de marca y versiones de los recursos del `<head>`, como módulos
 * virtuales (design.md §3 y §6 del change `migrar-lectura-publica-astro`).
 *
 * - `virtual:enmirumbo/imagen-de-marca-png`: el PNG ya generado, en base64.
 *   Lo importa SOLO `src/pages/opengraph-image.ts`, que está prerenderizada:
 *   el archivo sale a la CDN y no queda nada que renderizar por petición.
 * - `virtual:enmirumbo/versiones`: el hash del PNG y el del icono. Lo importan
 *   los metadatos de todas las páginas, también las dinámicas: Next le ponía a
 *   la imagen heredada `/opengraph-image?<hash>` para que WhatsApp y Facebook
 *   refresquen la vista previa cuando cambia, y al icono `?<hash>`.
 *
 * El PNG se genera aquí, en Node, una vez por build: `satori` y `resvg` nunca
 * entran al grafo de módulos de la aplicación, así que tampoco a la función.
 */
const ID_VERSIONES = "virtual:enmirumbo/versiones";
const ID_PNG = "virtual:enmirumbo/imagen-de-marca-png";

const hash16 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex").slice(0, 16);

export function imagenDeMarca(): AstroIntegration {
  return {
    name: "enmirumbo:imagen-de-marca",
    hooks: {
      "astro:config:setup": ({ config, updateConfig }) => {
        const icono = fileURLToPath(new URL("./favicon.ico", config.publicDir));
        let png: Promise<Buffer> | undefined;
        const obtenerPng = () => (png ??= generarImagenDeMarca());
        updateConfig({
          vite: {
            plugins: [
              {
                name: "enmirumbo:imagen-de-marca",
                resolveId(id: string) {
                  return id === ID_VERSIONES || id === ID_PNG ? `\0${id}` : undefined;
                },
                async load(id: string) {
                  if (id === `\0${ID_VERSIONES}`) {
                    const versiones = {
                      versionImagenDeMarca: hash16(await obtenerPng()),
                      versionIcono: hash16(readFileSync(icono)),
                    };
                    return Object.entries(versiones)
                      .map(([nombre, valor]) => `export const ${nombre} = ${JSON.stringify(valor)};`)
                      .join("\n");
                  }
                  if (id === `\0${ID_PNG}`) {
                    return `export const pngBase64 = ${JSON.stringify((await obtenerPng()).toString("base64"))};`;
                  }
                  return undefined;
                },
              },
            ],
          },
        });
      },
    },
  };
}
