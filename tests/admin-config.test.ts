import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  LONGITUD_MINIMA_SECRETO,
  URL_SITIO_LOCAL,
  VARIABLE_CONTRASENA,
  VARIABLE_SECRETO_SESION,
  VARIABLE_URL_SITIO,
  estaConfigurado,
  leerConfiguracionPanel,
  motivoSinConfigurar,
  urlSitio,
} from "../src/lib/admin/config";

// Spec: revision-admin · Requirement "Sin contraseña configurada el panel no
// abre (fail-safe)" y design.md §2 y §7 del change agregar-panel-admin.

const raiz = join(__dirname, "..");
const fuente = (ruta: string) => readFileSync(join(raiz, ruta), "utf8");

const SECRETO_DE_PRUEBA = "x".repeat(LONGITUD_MINIMA_SECRETO);
const COMPLETO = {
  [VARIABLE_CONTRASENA]: "contrasena-solo-de-prueba",
  [VARIABLE_SECRETO_SESION]: SECRETO_DE_PRUEBA,
};

describe("revision-admin · el panel solo está configurado con contraseña y secreto", () => {
  it("con las dos variables completas, el panel está configurado", () => {
    expect(estaConfigurado(COMPLETO)).toBe(true);
    expect(motivoSinConfigurar(COMPLETO)).toBeNull();
    expect(leerConfiguracionPanel(COMPLETO)).toEqual({
      contrasena: "contrasena-solo-de-prueba",
      secreto: SECRETO_DE_PRUEBA,
    });
  });

  // Scenario: sin contraseña configurada
  it.each([
    ["sin la variable", undefined],
    ["vacía", ""],
    ["solo espacios", "   "],
  ])("con la contraseña %s no está configurado", (_caso, contrasena) => {
    const env: Record<string, string | undefined> = {
      [VARIABLE_SECRETO_SESION]: SECRETO_DE_PRUEBA,
      [VARIABLE_CONTRASENA]: contrasena,
    };
    expect(estaConfigurado(env)).toBe(false);
    expect(leerConfiguracionPanel(env)).toBeNull();
    expect(motivoSinConfigurar(env)).toContain(VARIABLE_CONTRASENA);
  });

  // Scenario: sin secreto de firma
  it("sin secreto de firma no está configurado", () => {
    const env = { [VARIABLE_CONTRASENA]: "contrasena-solo-de-prueba" };
    expect(estaConfigurado(env)).toBe(false);
    expect(leerConfiguracionPanel(env)).toBeNull();
    expect(motivoSinConfigurar(env)).toContain(VARIABLE_SECRETO_SESION);
  });

  it("un secreto demasiado corto no sirve para firmar sesiones", () => {
    const env = {
      ...COMPLETO,
      [VARIABLE_SECRETO_SESION]: "x".repeat(LONGITUD_MINIMA_SECRETO - 1),
    };
    expect(estaConfigurado(env)).toBe(false);
    expect(motivoSinConfigurar(env)).toContain(VARIABLE_SECRETO_SESION);
  });

  it("el motivo de la falta es para el log, no para la respuesta: dice qué falta", () => {
    expect(motivoSinConfigurar({})).toContain(VARIABLE_CONTRASENA);
    expect(motivoSinConfigurar({})).toContain(VARIABLE_SECRETO_SESION);
  });
});

// Scenario: nada de contraseñas por defecto
describe("revision-admin · ninguna contraseña por defecto ni atajo de desarrollo", () => {
  const archivosDelPanel = [
    ...readdirSync(join(raiz, "src/lib/admin")).map((n) => `src/lib/admin/${n}`),
  ];

  it("sin variables de entorno el panel no abre, ni siquiera en desarrollo", () => {
    for (const nodeEnv of ["development", "test", "production", undefined]) {
      expect(estaConfigurado({ NODE_ENV: nodeEnv })).toBe(false);
    }
  });

  it("ningún módulo del panel usa un valor por defecto para contraseña o secreto", () => {
    for (const ruta of archivosDelPanel) {
      const codigo = fuente(ruta);
      // Un `??` o un `||` pegado a la lectura de estas variables sería
      // exactamente el valor por defecto que la spec prohíbe.
      expect(codigo, ruta).not.toMatch(
        new RegExp(`${VARIABLE_CONTRASENA}\\]?\\s*(\\?\\?|\\|\\|)`),
      );
      expect(codigo, ruta).not.toMatch(
        new RegExp(`${VARIABLE_SECRETO_SESION}\\]?\\s*(\\?\\?|\\|\\|)`),
      );
      expect(codigo, ruta).not.toMatch(/NODE_ENV\s*[=!]==?\s*["']development["']/);
    }
  });

  it(".env.example documenta las tres variables sin darles ningún valor real", () => {
    const ejemplo = fuente(".env.example");
    for (const variable of [
      VARIABLE_CONTRASENA,
      VARIABLE_SECRETO_SESION,
      VARIABLE_URL_SITIO,
    ]) {
      expect(ejemplo).toContain(variable);
    }
    // Ni contraseña ni secreto quedan asignados a algo utilizable: las líneas
    // que los mencionan están comentadas o vacías.
    for (const linea of ejemplo.split("\n")) {
      const activa = !linea.trimStart().startsWith("#");
      if (!activa) continue;
      expect(linea).not.toContain(VARIABLE_CONTRASENA);
      expect(linea).not.toContain(VARIABLE_SECRETO_SESION);
    }
    expect(fuente(".gitignore")).toMatch(/^\.env/m);
  });
});

// design.md §7: el aviso de publicación manda la URL ABSOLUTA de la ficha.
describe("revision-admin · URL pública del sitio para el link de la ficha", () => {
  it("usa la configurada, sin diagonal final", () => {
    expect(urlSitio({ [VARIABLE_URL_SITIO]: "https://necesitouno.mx/" })).toBe(
      "https://necesitouno.mx",
    );
    expect(urlSitio({ [VARIABLE_URL_SITIO]: "https://necesitouno.mx" })).toBe(
      "https://necesitouno.mx",
    );
  });

  it("fuera de producción, sin variable, cae en la dirección local", () => {
    expect(urlSitio({ NODE_ENV: "development" })).toBe(URL_SITIO_LOCAL);
    expect(urlSitio({})).toBe(URL_SITIO_LOCAL);
  });

  it("en producción, sin variable, NO inventa un link (nada de localhost)", () => {
    expect(urlSitio({ NODE_ENV: "production" })).toBeNull();
    expect(urlSitio({ VERCEL_ENV: "production" })).toBeNull();
  });

  it("una URL que no es http(s) no se usa", () => {
    expect(urlSitio({ [VARIABLE_URL_SITIO]: "javascript:alert(1)" })).toBe(
      URL_SITIO_LOCAL,
    );
    expect(
      urlSitio({ [VARIABLE_URL_SITIO]: "no-es-una-url", NODE_ENV: "production" }),
    ).toBeNull();
  });
});
