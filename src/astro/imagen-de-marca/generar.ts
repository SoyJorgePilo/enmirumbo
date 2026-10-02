import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Resvg } from "@resvg/resvg-js";
import satori from "satori";

import { arbolDeLaImagenDeMarca } from "./arbol";
import { TAMANO_IMAGEN_DE_MARCA } from "./datos";

/**
 * Genera el PNG de la imagen de marca (design.md §6 del change
 * `migrar-lectura-publica-astro`): `satori` (árbol → SVG) y `@resvg/resvg-js`
 * (SVG → PNG), con la tipografía que traía `next/og`, Geist Regular (licencia
 * SIL OFL, `OFL.txt` junto a ella).
 *
 * SOLO corre al construir (y en las pruebas): lo llama la integración
 * `src/astro/integraciones/imagen-de-marca.ts`, que corre en Node y entrega el
 * resultado como módulo virtual. Ningún dato de una petición llega aquí: la
 * entrada es constante, y la función del servidor no incluye este código.
 */
export async function generarImagenDeMarca(): Promise<Buffer> {
  const fuente = readFileSync(fileURLToPath(new URL("./Geist-Regular.ttf", import.meta.url)));
  const svg = await satori(arbolDeLaImagenDeMarca(), {
    ...TAMANO_IMAGEN_DE_MARCA,
    // Las mismas opciones que `next/og`: una sola fuente, peso 400.
    fonts: [{ name: "geist", data: fuente, weight: 400, style: "normal" }],
  });
  return new Resvg(svg, { fitTo: { mode: "width", value: TAMANO_IMAGEN_DE_MARCA.width } })
    .render()
    .asPng();
}
