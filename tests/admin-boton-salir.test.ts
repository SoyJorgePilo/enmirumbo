/**
 * `BotonSalir` en las dos versiones (change `migrar-panel-admin-base-astro`,
 * Fase 5a; tasks.md #13; spec `plataforma-astro`, requirement "La mitad 5a no
 * pierde dureza ni altera producto"): con una función (Next) el HTML es el
 * mismo, byte a byte, que antes del change (`tests/fixtures/boton-salir-head/`,
 * capturado en HEAD); con texto (Astro) hace un POST nativo a la Action
 * `salir` y lo demás no cambia. Mismo patrón que `FormularioReporte` (3a).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BotonSalir } from "../src/components/admin/boton-salir";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const HEAD = readFileSync(path.join(raiz, "tests/fixtures/boton-salir-head/con-funcion.html"), "utf8");

describe("BotonSalir", () => {
  it("con una función (Next): el mismo HTML que en HEAD, byte a byte, sin method", () => {
    const html = renderToStaticMarkup(createElement(BotonSalir, { action: async () => {} }));
    expect(`${html}\n`).toBe(HEAD);
    expect(html).not.toContain('method="post"');
  });

  it("con texto (Astro): un POST nativo a ?_action=salir, sin ocultos ni script; el resto, igual", () => {
    const html = renderToStaticMarkup(createElement(BotonSalir, { action: "?_action=salir" }));
    expect(html.match(/<form [^>]*>/g)).toEqual(['<form action="?_action=salir" method="post">']);
    expect(html).not.toContain('type="hidden"');
    expect(html).not.toContain("<script");
    const sinForm = (h: string) => h.replace(/<form [^>]*>/g, "<form>").replace(/<script>[\s\S]*<\/script>\n?$/, "");
    expect(sinForm(html)).toBe(sinForm(HEAD));
  });
});
