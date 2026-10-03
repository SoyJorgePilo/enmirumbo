/**
 * Las decisiones PURAS de la mejora progresiva de `/registro` (change
 * `migrar-registro-astro`, design.md §1.3 y §1.4; tasks.md #8): qué hacer con
 * la respuesta del envío, qué ejemplo poner y cuándo no tocar nada. Sin
 * navegador. La capa del DOM la prueba `registro-mejora-dom.test.ts`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  RUTAS_DE_EXITO,
  decidirTrasEnvio,
  ejemploPara,
  puedeMejorar,
} from "../src/astro/registro-cliente";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ORIGEN = "https://enmirumbo.example";

describe("mejora progresiva · qué hacer con la respuesta (design.md §1.3, paso 4)", () => {
  it("terminó en gracias o en verificar, del mismo origen: navega a ESA ruta", () => {
    expect(RUTAS_DE_EXITO).toEqual(["/registro/gracias", "/registro/verificar"]);
    expect(decidirTrasEnvio({ status: 200, url: `${ORIGEN}/registro/gracias`, tieneFormulario: false }, ORIGEN)).toEqual({ tipo: "navegar", ruta: "/registro/gracias" });
    expect(decidirTrasEnvio({ status: 200, url: `${ORIGEN}/registro/verificar`, tieneFormulario: true }, ORIGEN)).toEqual({ tipo: "navegar", ruta: "/registro/verificar" });
  });

  it("navega a la ruta sola: la consulta o el fragmento de la respuesta no viajan", () => {
    expect(decidirTrasEnvio({ status: 200, url: `${ORIGEN}/registro/gracias?x=%3Cscript%3E#y`, tieneFormulario: false }, ORIGEN)).toEqual({ tipo: "navegar", ruta: "/registro/gracias" });
  });

  it("la página con el formulario de registro: reemplazar en el sitio", () => {
    expect(decidirTrasEnvio({ status: 200, url: `${ORIGEN}/registro?_action=registrar`, tieneFormulario: true }, ORIGEN)).toEqual({ tipo: "reemplazar" });
  });

  it("destinos fuera de la lista: error general, sin navegar", () => {
    const casos = [
      "https://evil.example/registro/gracias",
      "https://evil.example/",
      "http://enmirumbo.example/registro/gracias", // otro esquema = otro origen
      "https://enmirumbo.example.evil.example/registro/gracias",
      `${ORIGEN}/negocios`,
      `${ORIGEN}/registro/gracias/otra`,
      `${ORIGEN}/REGISTRO/GRACIAS`,
      "",
      "no es una url",
      "javascript:alert(1)",
    ];
    for (const url of casos) {
      expect(decidirTrasEnvio({ status: 200, url, tieneFormulario: true }, ORIGEN), url).toEqual({ tipo: "error" });
    }
    // `//evil.example` como Location: el navegador lo resuelve a otro origen.
    expect(decidirTrasEnvio({ status: 200, url: new URL("//evil.example", ORIGEN).toString(), tieneFormulario: true }, ORIGEN)).toEqual({ tipo: "error" });
  });

  it("500, 403, 404 y el 413 de la plataforma: error general aunque vengan del sitio", () => {
    for (const status of [500, 403, 404, 413, 502, 0]) {
      expect(decidirTrasEnvio({ status, url: `${ORIGEN}/registro?_action=registrar`, tieneFormulario: true }, ORIGEN), String(status)).toEqual({ tipo: "error" });
      expect(decidirTrasEnvio({ status, url: `${ORIGEN}/registro/gracias`, tieneFormulario: false }, ORIGEN), String(status)).toEqual({ tipo: "error" });
    }
  });

  it("un 200 de /registro sin el formulario (otro documento): error general", () => {
    expect(decidirTrasEnvio({ status: 200, url: `${ORIGEN}/registro?_action=registrar`, tieneFormulario: false }, ORIGEN)).toEqual({ tipo: "error" });
  });
});

describe("mejora progresiva · el ejemplo de '¿Qué ofreces?'", () => {
  const tabla = JSON.stringify({ "": "ej. genérico", "2": "ej. plomería", "7": "ej. futbol infantil" });

  it("el de la categoría elegida, el genérico sin categoría o con una desconocida", () => {
    expect(ejemploPara(tabla, "2")).toBe("ej. plomería");
    expect(ejemploPara(tabla, "")).toBe("ej. genérico");
    expect(ejemploPara(tabla, "999")).toBe("ej. genérico");
    // Una clave heredada no es un ejemplo.
    expect(ejemploPara(tabla, "constructor")).toBe("ej. genérico");
    expect(ejemploPara(tabla, "__proto__")).toBe("ej. genérico");
  });

  it("una tabla ausente o rota no cambia nada (null)", () => {
    for (const rota of [null, undefined, "", "no es json", "[]", "3", '{"2": 5}', '{"": null}']) {
      expect(ejemploPara(rota, "2"), String(rota)).toBeNull();
    }
  });
});

describe("mejora progresiva · solo con las tres APIs", () => {
  it("fetch, FormData y DOMParser: con las tres sí, sin cualquiera no", () => {
    const completa = { fetch: () => undefined, FormData: class {}, DOMParser: class {} };
    expect(puedeMejorar(completa)).toBe(true);
    for (const falta of ["fetch", "FormData", "DOMParser"] as const) {
      const sinUna: Record<string, unknown> = { ...completa };
      delete sinUna[falta];
      expect(puedeMejorar(sinUna), falta).toBe(false);
    }
  });
});

describe("mejora progresiva · lo que el módulo NO hace (design.md §1.3, paso 5)", () => {
  const fuente = readFileSync(path.join(raiz, "src/astro/registro-cliente.ts"), "utf8");
  const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("un solo fetch, a form.action; sin otras peticiones, sin almacenamiento, sin medición, sin historial", () => {
    expect(codigo.match(/\bfetch\(/g)).toHaveLength(1);
    expect(codigo).toMatch(/fetch\(\s*formulario\.action\b/);
    for (const prohibido of [/XMLHttpRequest/, /sendBeacon/, /localStorage|sessionStorage|indexedDB|document\.cookie/, /umami|analitica|data-umami/i, /history\.|pushState|replaceState/, /new\s+Image\(/, /\beval\(|new\s+Function\(/, /innerHTML|outerHTML|insertAdjacentHTML/]) {
      expect(codigo, String(prohibido)).not.toMatch(prohibido);
    }
  });

  it("no toca el campo de foto: ni lo lee, ni lo previsualiza, ni lo comprime", () => {
    expect(codigo).not.toMatch(/["'#]foto\b|FileReader|createObjectURL|canvas|\.files\b/);
  });

  it("no importa React ni nada de src/lib más que textos", () => {
    const importes = [...codigo.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    expect(importes.every((i) => i === "@/lib/registro/textos")).toBe(true);
  });
});
