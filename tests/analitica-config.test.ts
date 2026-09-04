import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  VARIABLE_SRC,
  VARIABLE_WEBSITE_ID,
  configuracionAnalitica,
  motivoConfiguracionIncompleta,
  reiniciarAvisoDeAnalitica,
} from "../src/lib/analitica/config";

// Spec: layout-base · requirement "La medición cookieless se carga solo si
// está configurada, y sin ella el sitio funciona igual" (tasks.md #1 y #2).
//
// El módulo es puro: recibe el entorno como parámetro, así que la suite no
// ensucia `process.env` (y de paso comprueba que nadie lee las variables por
// acceso dinámico, que Next no sustituye en el build; design.md §2).

const SRC_VALIDO = "https://cloud.umami.is/script.js";
const ID_VALIDO = "00000000-0000-4000-8000-000000000000";

const completo = {
  [VARIABLE_SRC]: SRC_VALIDO,
  [VARIABLE_WEBSITE_ID]: ID_VALIDO,
};

let avisos: string[] = [];

beforeEach(() => {
  reiniciarAvisoDeAnalitica();
  avisos = [];
  vi.spyOn(console, "warn").mockImplementation((mensaje: unknown) => {
    avisos.push(String(mensaje));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  reiniciarAvisoDeAnalitica();
});

describe("analitica · configuración fail-safe (tasks #1)", () => {
  // Scenario: con las dos variables se carga el script del proveedor
  it("devuelve src e identificador cuando las dos variables son válidas", () => {
    expect(configuracionAnalitica(completo)).toEqual({
      src: SRC_VALIDO,
      websiteId: ID_VALIDO,
    });
    expect(motivoConfiguracionIncompleta(completo)).toBeNull();
  });

  it("recorta los espacios de alrededor sin alterar los valores", () => {
    expect(
      configuracionAnalitica({
        [VARIABLE_SRC]: `  ${SRC_VALIDO}  `,
        [VARIABLE_WEBSITE_ID]: `  ${ID_VALIDO}\n`,
      }),
    ).toEqual({ src: SRC_VALIDO, websiteId: ID_VALIDO });
  });

  // Scenario: sin variables configuradas no se carga nada
  it("devuelve null sin ninguna de las dos variables, y sin avisar nada", () => {
    expect(configuracionAnalitica({})).toBeNull();
    expect(configuracionAnalitica({ [VARIABLE_SRC]: "", [VARIABLE_WEBSITE_ID]: "  " })).toBeNull();
    expect(avisos).toEqual([]);
  });

  // Scenario: configuración a medias
  it.each([
    ["solo el src", { [VARIABLE_SRC]: SRC_VALIDO }],
    ["solo el identificador", { [VARIABLE_WEBSITE_ID]: ID_VALIDO }],
    ["identificador de puros espacios", { ...completo, [VARIABLE_WEBSITE_ID]: "   " }],
    ["src relativo", { ...completo, [VARIABLE_SRC]: "/script.js" }],
    ["src por http", { ...completo, [VARIABLE_SRC]: "http://cloud.umami.is/script.js" }],
    ["src sin esquema", { ...completo, [VARIABLE_SRC]: "cloud.umami.is/script.js" }],
    ["src que no es URL", { ...completo, [VARIABLE_SRC]: "no es una url" }],
    ["src javascript:", { ...completo, [VARIABLE_SRC]: "javascript:alert(1)" }],
  ])("devuelve null con %s", (_caso, entorno) => {
    expect(configuracionAnalitica(entorno)).toBeNull();
    expect(motivoConfiguracionIncompleta(entorno)).not.toBeNull();
  });

  it("el motivo dice qué falta, nombrando la variable", () => {
    expect(motivoConfiguracionIncompleta({ [VARIABLE_SRC]: SRC_VALIDO })).toContain(
      VARIABLE_WEBSITE_ID,
    );
    expect(motivoConfiguracionIncompleta({ [VARIABLE_WEBSITE_ID]: ID_VALIDO })).toContain(
      VARIABLE_SRC,
    );
  });

  it("avisa UNA sola vez por proceso, aunque se pregunte muchas veces", () => {
    const aMedias = { [VARIABLE_SRC]: SRC_VALIDO };
    configuracionAnalitica(aMedias);
    configuracionAnalitica(aMedias);
    configuracionAnalitica(aMedias);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain("[analitica]");
    expect(avisos[0]).toContain(VARIABLE_WEBSITE_ID);
  });

  it("la advertencia no repite el valor configurado, solo el nombre de la variable", () => {
    configuracionAnalitica({ ...completo, [VARIABLE_SRC]: "http://interno.example/x.js" });
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).not.toContain("interno.example");
  });

  it("con la configuración completa no avisa nada", () => {
    configuracionAnalitica(completo);
    expect(avisos).toEqual([]);
  });
});

// Spec: layout-base · requirement "`.env.example` explica la analítica y el
// paso que le toca al humano" (tasks.md #21).
describe("analitica · .env.example le dice al humano qué hacer", () => {
  const ejemplo = readFileSync(join(__dirname, "..", ".env.example"), "utf8");

  // Scenario: el humano sabe qué hacer
  it("documenta las dos variables, el enlace de la cuenta y el valor típico", () => {
    expect(ejemplo).toContain(VARIABLE_SRC);
    expect(ejemplo).toContain(VARIABLE_WEBSITE_ID);
    expect(ejemplo).toContain("https://cloud.umami.is");
    expect(ejemplo).toContain("https://cloud.umami.is/script.js");
  });

  it("avisa que no son secretos, que se inyectan al construir y que sin ellas nada se rompe", () => {
    expect(ejemplo).toContain("NO SON SECRETOS");
    expect(ejemplo).toMatch(/volver a desplegar|redesplegar/);
    expect(ejemplo).toContain("EL SITIO CORRE IGUAL");
    expect(ejemplo).toMatch(/FILTRADO DE BOTS/);
  });

  // M-3 de la etapa C: el modelo de confianza y la deuda de CSP tienen que
  // vivir en archivos que sobrevivan al merge, no en un reporte que se
  // archiva. Y con LOS DOS dominios: el script y el destino de los datos no
  // son el mismo, y una CSP a medias rompe la medición en silencio.
  it("documenta a dónde van los datos y la CSP que hace falta al desplegar", () => {
    expect(ejemplo).toContain("https://gateway.umami.is/api/send");
    expect(ejemplo).toContain("script-src https://cloud.umami.is");
    expect(ejemplo).toContain("connect-src https://gateway.umami.is");
    expect(ejemplo).toMatch(/T-013|E0-3/);
    expect(ejemplo).toContain("MODELO DE CONFIANZA");
  });

  it("la misma deuda queda en el ADR, que no se archiva con el change", () => {
    const adr = readFileSync(
      join(__dirname, "..", "docs/decisiones/ADR-005-analitica.md"),
      "utf8",
    );
    expect(adr).toContain("connect-src https://gateway.umami.is");
    expect(adr).toContain("script-src https://cloud.umami.is");
    expect(adr).toContain("preparar-deploy-produccion");
    // Y los tres canales del tracker, no solo la URL y las propiedades.
    expect(adr).toContain("document.title");
    expect(adr).toContain("document.referrer");
  });

  it("no trae ningún valor real pegado: las dos líneas están comentadas", () => {
    for (const linea of ejemplo.split("\n")) {
      const asignacion = linea.match(/^\s*(NEXT_PUBLIC_UMAMI_[A-Z_]+)=(.*)$/);
      expect(asignacion, `variable sin comentar: ${linea}`).toBeNull();
    }
    // Y las versiones comentadas existen, vacías.
    expect(ejemplo).toContain(`# ${VARIABLE_SRC}=""`);
    expect(ejemplo).toContain(`# ${VARIABLE_WEBSITE_ID}=""`);
  });
});

describe("analitica · las variables se leen por su nombre literal (design.md §2)", () => {
  it("por defecto lee del proceso, y sin variables no hay configuración", () => {
    const anterior = {
      src: process.env[VARIABLE_SRC],
      id: process.env[VARIABLE_WEBSITE_ID],
    };
    delete process.env[VARIABLE_SRC];
    delete process.env[VARIABLE_WEBSITE_ID];
    try {
      expect(configuracionAnalitica()).toBeNull();
      process.env[VARIABLE_SRC] = SRC_VALIDO;
      process.env[VARIABLE_WEBSITE_ID] = ID_VALIDO;
      expect(configuracionAnalitica()).toEqual({ src: SRC_VALIDO, websiteId: ID_VALIDO });
    } finally {
      if (anterior.src === undefined) delete process.env[VARIABLE_SRC];
      else process.env[VARIABLE_SRC] = anterior.src;
      if (anterior.id === undefined) delete process.env[VARIABLE_WEBSITE_ID];
      else process.env[VARIABLE_WEBSITE_ID] = anterior.id;
    }
  });

  it("los nombres de las variables son los del contrato", () => {
    expect(VARIABLE_SRC).toBe("NEXT_PUBLIC_UMAMI_SRC");
    expect(VARIABLE_WEBSITE_ID).toBe("NEXT_PUBLIC_UMAMI_WEBSITE_ID");
  });
});
