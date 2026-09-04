import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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

import AvisoDePrivacidadPage from "../src/app/(publico)/aviso-de-privacidad/page";
import TerminosPage from "../src/app/(publico)/terminos/page";
import { TEXTO_MARCA_BORRADOR } from "../src/lib/legales/textos";

describe("paginas-legales · la marca de borrador se apaga sola", () => {
  it("sin placeholders pendientes, ninguna de las dos páginas la muestra", () => {
    for (const pagina of [AvisoDePrivacidadPage, TerminosPage]) {
      const html = renderToStaticMarkup(createElement(pagina));
      expect(html).not.toContain(TEXTO_MARCA_BORRADOR);
      expect(html).not.toContain("todavía es un borrador");
      // Y el documento sigue completo: lo único que se va es la marca.
      expect(html).toMatch(/<h1[\s>]/);
      expect(html.match(/<h2[\s>]/g)).toHaveLength(10);
    }
  });
});
