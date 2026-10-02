/**
 * Spec `plataforma-astro` (change `agregar-andamio-astro`, T-022):
 *
 * - "Los componentes de React se pintan en servidor sin JavaScript de
 *   cliente" → scenario "componente React sin JS".
 * - "La suite completa sigue en verde y puede probar Astro" → scenario "las
 *   pruebas pueden pintar Astro".
 *
 * La fixture usa un componente real de `src/components/` sin directiva
 * `client:` y se pinta con la Container API de Astro, sin levantar servidor.
 */
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { loadRenderers } from "astro:container";
import { getContainerRenderer } from "@astrojs/react/container-renderer";
import { describe, expect, it } from "vitest";

import HumoReact from "./fixtures/humo-react.astro";

async function pintar(): Promise<string> {
  const renderers = await loadRenderers([getContainerRenderer()]);
  const contenedor = await AstroContainer.create({ renderers });
  return contenedor.renderToString(HumoReact);
}

describe("plataforma-astro · componente React sin JS", () => {
  it("las pruebas pintan un .astro y obtienen su HTML", async () => {
    const html = await pintar();
    // Sin `>` al cierre: en Vitest (modo dev) Astro anota la etiqueta con
    // `data-astro-source-*`, que el build de producción no emite.
    expect(html).toContain('<main data-prueba="humo-react"');
  });

  it("el componente de React sale como marcado de servidor", async () => {
    const html = await pintar();
    expect(html).toContain("Negocio verificado");
    expect(html).toContain('<span aria-hidden="true">✓</span>');
  });

  it("no agrega script, modulepreload ni isla de hidratación", async () => {
    const html = await pintar();
    expect(html).not.toContain("<script");
    expect(html).not.toContain("modulepreload");
    expect(html).not.toContain("astro-island");
  });
});
