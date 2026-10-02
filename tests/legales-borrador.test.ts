import { describe, expect, it, vi } from "vitest";

// Spec: paginas-legales · requirement "Placeholders visibles y marca de
// borrador mientras falten datos del responsable", scenario "marca de
// borrador visible" — la otra mitad: cuando el humano complete los datos y la
// revisión legal (E6-3) vacíe `PLACEHOLDERS_LEGALES`, la marca tiene que
// desaparecer sola de las dos páginas. Ese es el interruptor de lanzamiento
// (design.md §3), así que se prueba, no se asume.
//
// Se simula el módulo de textos con la lista ya vacía: es la única forma de
// ver el futuro estado sin borrar el contenido de verdad. El archivo va
// aparte porque `vi.mock` aplica a todo el archivo, y
// `tests/legales-paginas.test.ts` necesita el módulo real.
vi.mock("@/lib/legales/textos", async () => {
  const real = await vi.importActual<typeof import("@/lib/legales/textos")>(
    "@/lib/legales/textos",
  );
  return { ...real, PLACEHOLDERS_LEGALES: [], HAY_PLACEHOLDERS_PENDIENTES: false };
});

// Las legales ya se sirven con Astro (change `migrar-lectura-publica-astro`,
// tasks.md #15): se mira lo que pintaba la página, el contenido de <main>.
import { TEXTO_MARCA_BORRADOR } from "../src/lib/legales/textos";
import AvisoDePrivacidadPage from "../src/pages/aviso-de-privacidad.astro";
import TerminosPage from "../src/pages/terminos.astro";
import { contenidoDelMain, pintarPagina } from "./astro-paginas";

describe("paginas-legales · la marca de borrador se apaga sola", () => {
  it("sin placeholders pendientes, ninguna de las dos páginas la muestra", async () => {
    for (const pagina of [AvisoDePrivacidadPage, TerminosPage]) {
      const html = contenidoDelMain(await pintarPagina(pagina));
      expect(html).not.toContain(TEXTO_MARCA_BORRADOR);
      expect(html).not.toContain("todavía es un borrador");
      // Y el documento sigue completo: lo único que se va es la marca.
      expect(html).toMatch(/<h1[\s>]/);
      expect(html.match(/<h2[\s>]/g)).toHaveLength(10);
    }
  });
});
