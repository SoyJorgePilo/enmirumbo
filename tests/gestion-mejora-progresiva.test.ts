/**
 * Las decisiones PURAS de la mejora progresiva de `/editar/[token]` (change
 * `migrar-enlace-gestion-astro`, design.md §4.2–4.4; tasks.md #7): el mismo
 * módulo de `/registro` (`src/astro/registro-cliente.ts`) con la
 * configuración de la edición. Sin navegador; la capa del DOM la prueba
 * `gestion-mejora-dom.test.ts`. Las pruebas de `/registro` no se tocan.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { configDeEdicion } from "../src/astro/gestion-cliente";
import { CONFIG_DE_REGISTRO, decidirTrasEnvio } from "../src/astro/registro-cliente";
import { ERROR_GUARDAR_EDICION } from "../src/lib/gestion/textos";
import { MENSAJES_ERROR_REGISTRO } from "../src/lib/registro/textos";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ORIGEN = "https://enmirumbo.example";
const T = "Tok3n_Ficticio-0123456789abcdefghijklmnopqrst".slice(0, 43);
const OTRO = "0tro_Token-Ficticio-0123456789abcdefghijklmn".slice(0, 43);
const ACCION = `${ORIGEN}/editar/${T}?_action=editar`;

describe("mejora de la edición · la configuración sale del propio formulario", () => {
  it("de form.action: su ruta (sin la consulta), su única confirmación, el texto de la edición, sin ejemplo al abrir y recargar ante la 404", () => {
    expect(configDeEdicion(ACCION, ERROR_GUARDAR_EDICION)).toEqual({
      rutaDelFormulario: `/editar/${T}`,
      rutasDeExito: [`/editar/${T}/gracias`],
      textoErrorGeneral: ERROR_GUARDAR_EDICION,
      ejemploAlCargar: false,
      alNoEncontrado: "recargar",
    });
  });

  it("una acción que no es la de un enlace de gestión no configura nada", () => {
    for (const accion of [`${ORIGEN}/registro?_action=registrar`, `${ORIGEN}/editar/${T}/gracias`, `${ORIGEN}/editar/`, `${ORIGEN}/editar`, "no es una url", "", `${ORIGEN}/editar/a%2Fb`]) {
      expect(configDeEdicion(accion, ERROR_GUARDAR_EDICION), accion).toBeNull();
    }
  });

  it("la de /registro es exactamente la de hoy", () => {
    expect(CONFIG_DE_REGISTRO).toEqual({
      rutaDelFormulario: "/registro",
      rutasDeExito: ["/registro/gracias", "/registro/verificar"],
      textoErrorGeneral: MENSAJES_ERROR_REGISTRO.servidor,
      ejemploAlCargar: true,
      alNoEncontrado: "error",
    });
  });
});

describe("mejora de la edición · qué hacer con la respuesta", () => {
  const config = configDeEdicion(ACCION, ERROR_GUARDAR_EDICION)!;
  const decidir = (status: number, url: string, tieneFormulario = false) => decidirTrasEnvio({ status, url, tieneFormulario }, ORIGEN, config);

  it("terminó en /editar/<el mismo token>/gracias del mismo origen: navega ahí, sin consulta ni fragmento", () => {
    expect(decidir(200, `${ORIGEN}/editar/${T}/gracias`)).toEqual({ tipo: "navegar", ruta: `/editar/${T}/gracias` });
    expect(decidir(200, `${ORIGEN}/editar/${T}/gracias?x=1#y`)).toEqual({ tipo: "navegar", ruta: `/editar/${T}/gracias` });
  });

  it("la misma página con el formulario: reemplazar en el sitio", () => {
    expect(decidir(200, ACCION, true)).toEqual({ tipo: "reemplazar" });
    expect(decidir(200, `${ORIGEN}/editar/${T}`, true)).toEqual({ tipo: "reemplazar" });
  });

  it("destinos fuera de la lista (otro token, /registro/gracias, otro origen, //evil.example): error, sin navegar", () => {
    const casos = [
      `${ORIGEN}/editar/${OTRO}/gracias`,
      `${ORIGEN}/registro/gracias`,
      `${ORIGEN}/registro/verificar`,
      `https://evil.example/editar/${T}/gracias`,
      new URL("//evil.example", ORIGEN).toString(),
      `${ORIGEN}/editar/${T}/gracias/otra`,
      `${ORIGEN}/editar/${T.toLowerCase()}/gracias`,
      `${ORIGEN}/editar/${OTRO}?_action=editar`,
      "",
      "javascript:alert(1)",
    ];
    for (const url of casos) expect(decidir(200, url, true), url).toEqual({ tipo: "error" });
  });

  it("la 404 de su propia dirección: recargar (el dueño ve la 404, como sin JS); una 404 de otra dirección es error", () => {
    expect(decidir(404, ACCION, false)).toEqual({ tipo: "recargar" });
    expect(decidir(404, `${ORIGEN}/editar/${T}`, false)).toEqual({ tipo: "recargar" });
    expect(decidir(404, `${ORIGEN}/editar/${OTRO}?_action=editar`, false)).toEqual({ tipo: "error" });
    expect(decidir(404, `https://evil.example/editar/${T}`, false)).toEqual({ tipo: "error" });
  });

  it("500, 403, 413 y cualquier otro estado: error con lo capturado", () => {
    for (const status of [500, 403, 413, 502, 0, 303]) {
      expect(decidir(status, ACCION, true), String(status)).toEqual({ tipo: "error" });
      expect(decidir(status, `${ORIGEN}/editar/${T}/gracias`), String(status)).toEqual({ tipo: "error" });
    }
  });

  it("/registro sigue sin recargar: una 404 ahí es error, como hoy", () => {
    expect(decidirTrasEnvio({ status: 404, url: `${ORIGEN}/registro?_action=registrar`, tieneFormulario: false }, ORIGEN)).toEqual({ tipo: "error" });
    expect(decidirTrasEnvio({ status: 404, url: `${ORIGEN}/registro`, tieneFormulario: false }, ORIGEN, CONFIG_DE_REGISTRO)).toEqual({ tipo: "error" });
  });
});

describe("mejora de la edición · el módulo de la página", () => {
  const fuente = (archivo: string) =>
    readFileSync(path.join(raiz, archivo), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

  it("el texto de la edición viaja en el módulo de la edición, no en un atributo ni en el de /registro", () => {
    expect(fuente("src/astro/gestion-cliente.ts")).toMatch(/import \{[^}]*ERROR_GUARDAR_EDICION[^}]*\} from "@\/lib\/gestion\/textos"/);
    expect(fuente("src/astro/registro-cliente.ts")).not.toContain("gestion");
  });

  it("no mide, no guarda nada en el navegador y no pide nada fuera de form.action", () => {
    for (const archivo of ["src/astro/gestion-cliente.ts", "src/astro/registro-cliente.ts"]) {
      const codigo = fuente(archivo);
      expect(codigo, archivo).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|umami|sendBeacon|history\./);
      expect(codigo.match(/\.fetch\(/g) ?? [], archivo).toHaveLength(archivo.includes("registro") ? 1 : 0);
    }
    expect(fuente("src/astro/registro-cliente.ts")).toMatch(/\.fetch\(formulario\.action,/);
  });
});
