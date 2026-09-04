import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { ScriptAnalitica } from "../src/components/analitica/script-analitica";
import { VARIABLE_SRC, VARIABLE_WEBSITE_ID } from "../src/lib/analitica/config";

// Spec: layout-base · requirements "La medición cookieless se carga solo si
// está configurada…" y "Un solo script diferido y cero JavaScript propio de
// cliente" (tasks.md #3 y #4).

const raiz = join(__dirname, "..");
const SRC = "https://cloud.umami.is/script.js";
const ID = "00000000-0000-4000-8000-000000000000";

function marcado(): string {
  return renderToStaticMarkup(createElement(ScriptAnalitica));
}

function conMedicion(): string {
  process.env[VARIABLE_SRC] = SRC;
  process.env[VARIABLE_WEBSITE_ID] = ID;
  return marcado();
}

afterEach(() => {
  delete process.env[VARIABLE_SRC];
  delete process.env[VARIABLE_WEBSITE_ID];
});

describe("analitica · componente del script (tasks #3)", () => {
  // Scenario: sin variables configuradas no se carga nada
  it("sin configuración no pinta absolutamente nada", () => {
    delete process.env[VARIABLE_SRC];
    delete process.env[VARIABLE_WEBSITE_ID];
    expect(marcado()).toBe("");
  });

  it("con la configuración a medias tampoco pinta nada", () => {
    process.env[VARIABLE_SRC] = SRC;
    delete process.env[VARIABLE_WEBSITE_ID];
    expect(marcado()).toBe("");

    delete process.env[VARIABLE_SRC];
    process.env[VARIABLE_WEBSITE_ID] = ID;
    expect(marcado()).toBe("");

    process.env[VARIABLE_SRC] = "http://cloud.umami.is/script.js";
    process.env[VARIABLE_WEBSITE_ID] = ID;
    expect(marcado()).toBe("");
  });

  // Scenario: con las dos variables se carga el script del proveedor
  // Scenario: un solo script y diferido
  it("con configuración pinta exactamente un script diferido del proveedor", () => {
    const html = conMedicion();
    const etiquetas = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
    expect(etiquetas).toHaveLength(1);
    expect(etiquetas[0]).toContain(`src="${SRC}"`);
    expect(etiquetas[0]).toContain("defer");
    expect(etiquetas[0]).toContain(`data-website-id="${ID}"`);
  });

  // Scenario: lo que escribe el vecino no viaja (design.md §3)
  it("pide al tracker excluir la cadena de consulta de las URLs medidas", () => {
    expect(conMedicion()).toContain('data-exclude-search="true"');
  });

  it("no lleva código en línea: solo la etiqueta con su src", () => {
    const html = conMedicion();
    // Entre la etiqueta de apertura y la de cierre no hay nada: ni una línea
    // de código propio de medición.
    expect(html).toMatch(/^<script\b[^>]*><\/script>$/);
    expect(html).not.toMatch(/function|window\.|document\./);
  });

  it("no carga scripts encadenados ni un gestor de etiquetas", () => {
    const html = conMedicion();
    expect([...html.matchAll(/src="/g)]).toHaveLength(1);
    expect(html).not.toMatch(/gtm|googletagmanager|tagmanager/i);
  });
});

describe("analitica · el componente es de servidor (tasks #4)", () => {
  const fuenteScript = readFileSync(
    join(raiz, "src/components/analitica/script-analitica.tsx"),
    "utf8",
  );
  const fuenteConfig = readFileSync(join(raiz, "src/lib/analitica/config.ts"), "utf8");

  // Scenario: sin componentes de cliente
  it('ningún archivo nuevo de la analítica declara "use client" ni usa next/script', () => {
    for (const fuente of [fuenteScript, fuenteConfig]) {
      expect(fuente).not.toMatch(/["']use client["']/);
      // `next/script` es un componente de cliente: importarlo sumaría bundle.
      expect(fuente).not.toMatch(/from\s+["']next\/script["']/);
    }
  });

  it("deja anotado que el atributo se confirmó contra la documentación de Umami", () => {
    expect(fuenteScript).toContain("data-exclude-search");
    expect(fuenteScript).toMatch(/umami\.is\/docs/);
  });
});
