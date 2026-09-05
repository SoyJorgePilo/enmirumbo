import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  VARIABLE_BANDERA,
  VARIABLE_SECRETO,
  VARIABLE_TOPE_DIARIO,
  VARIABLE_TWILIO_AUTH_TOKEN,
  VARIABLE_TWILIO_SERVICE_SID,
  VARIABLE_TWILIO_SID,
} from "../src/lib/verificacion/config";

/**
 * Spec `despliegue` (delta de T-016) · Requirements "La activación de la
 * verificación por SMS está documentada como paso opcional posterior al
 * lanzamiento" y "`.env.example` documenta el bloque de la verificación por
 * SMS y su fail-safe" (tasks.md #21 y #22).
 */

const raiz = join(__dirname, "..");
const despliegue = readFileSync(join(raiz, "docs/despliegue.md"), "utf8");
const envExample = readFileSync(join(raiz, ".env.example"), "utf8");

const VARIABLES = [
  VARIABLE_BANDERA,
  VARIABLE_TWILIO_SID,
  VARIABLE_TWILIO_AUTH_TOKEN,
  VARIABLE_TWILIO_SERVICE_SID,
  VARIABLE_SECRETO,
  VARIABLE_TOPE_DIARIO,
];

/** El cuerpo de la sección 11, sin el resto del documento. */
const seccionActivacion = despliegue.slice(
  despliegue.indexOf("## 11. Verificación del número por SMS"),
);

/** El texto sin saltos de línea: el ajuste del Markdown no es contenido. */
const corrido = (texto: string) => texto.replace(/\s+/g, " ");
const seccionCorrida = corrido(seccionActivacion);

describe("despliegue · la sección de activación existe y es opcional", () => {
  // Scenario: el humano decide con los números a la vista
  it("está marcada como opcional y posterior al lanzamiento", () => {
    expect(seccionActivacion).not.toBe("");
    expect(seccionActivacion).toContain("OPCIONAL Y POSTERIOR AL LANZAMIENTO");
    expect(seccionActivacion).toContain("no es parte del despliegue");
  });

  it("trae el costo por verificación y los requisitos A2P", () => {
    expect(seccionActivacion).toContain("$0.05 USD");
    expect(seccionActivacion).toContain("A2P");
  });

  it("nombra las variables y dice que la bandera va al final", () => {
    for (const variable of VARIABLES) {
      expect(seccionActivacion, variable).toContain(variable);
    }
    expect(seccionActivacion).toContain("Al final, la bandera");
  });

  it("dice cómo apagarla, sin migración ni pérdida de datos", () => {
    expect(seccionActivacion).toContain("Cómo apagarla");
    expect(seccionCorrida).toContain("No hay migración que revertir");
    expect(seccionCorrida).toContain("conservan su marca");
  });

  // Scenario: la advertencia del gasto está escrita
  it("dice con todas sus letras que el tope diario se cuenta por proceso", () => {
    expect(seccionCorrida).toContain("POR PROCESO");
    expect(seccionCorrida).toContain("múltiplo del tope configurado");
  });

  it("advierte del efecto en el embudo del PRD §10", () => {
    expect(seccionCorrida).toContain("embudo del PRD §10");
    expect(seccionCorrida).toContain("no genera vista de `/registro/gracias`");
    expect(seccionCorrida).toContain("**no significa** una caída de registros");
  });

  it("deja claro que la publicación sigue siendo del admin", () => {
    expect(seccionCorrida).toContain(
      "Ninguna ficha se publica por haber verificado su número",
    );
    expect(seccionCorrida).toContain("la revisión por WhatsApp no se elimina");
  });

  // Scenario: el checklist del lanzamiento no la pide
  it("el checklist obligatorio y la prueba de humo NO la incluyen", () => {
    const antesDeLaSeccion = despliegue.slice(
      0,
      despliegue.indexOf("## 11. Verificación del número por SMS"),
    );
    // La única mención fuera de §11 es el renglón de la tabla de OPCIONALES
    // que remite a §11: ni el checklist (§4) ni la prueba de humo (§9) piden
    // configurar nada del proveedor.
    const obligatorias = antesDeLaSeccion.slice(
      antesDeLaSeccion.indexOf("### 3.1 Obligatorias en producción"),
      antesDeLaSeccion.indexOf("### 3.2 Opcionales"),
    );
    for (const variable of VARIABLES) {
      expect(obligatorias, variable).not.toContain(variable);
    }
    const checklist = antesDeLaSeccion.slice(
      antesDeLaSeccion.indexOf("## 4. Orden de operaciones del despliegue"),
    );
    for (const variable of VARIABLES) {
      expect(checklist, variable).not.toContain(variable);
    }
  });
});

describe("despliegue · `.env.example` documenta el bloque y su fail-safe", () => {
  // Scenario: el humano sabe qué poner y qué no
  it("trae las seis variables comentadas, con su explicación", () => {
    for (const variable of VARIABLES) {
      expect(envExample, variable).toContain(variable);
    }
    expect(envExample).toContain("APAGADA POR DEFECTO");
    expect(envExample).toContain("LAS TRES SON SECRETOS");
    expect(envExample).toContain("CADA SMS CUESTA DINERO");
    expect(envExample).toContain("docs/despliegue.md §11");
  });

  it("dice que sin la bandera nada se rompe y no se gasta nada", () => {
    expect(envExample).toContain("el sitio corre EXACTAMENTE igual que hoy");
    expect(envExample).toContain("UNA advertencia en el log");
  });

  it("dice que la bandera va al final y que solo vale el `1` exacto", () => {
    expect(envExample).toContain("LA BANDERA AL FINAL");
    expect(envExample).toContain('Solo el valor exacto "1"');
  });

  // Scenario: ningún secreto de verdad en el repositorio
  it("ninguna variable de la verificación trae un valor funcional", () => {
    for (const linea of envExample.split("\n")) {
      const limpia = linea.trim();
      if (!VARIABLES.some((variable) => limpia.includes(`${variable}=`))) continue;
      // Toda línea con una de estas variables está comentada…
      expect(limpia.startsWith("#"), linea).toBe(true);
      // …y su valor es vacío o el tope numérico por defecto.
      const valor = limpia.split("=").slice(1).join("=").trim();
      expect(['""', '"50"', '"1"'], linea).toContain(valor);
    }
  });

  it("no hay ningún SID ni token con forma de credencial real de Twilio", () => {
    // Los SID de verdad son `AC`/`VA` + 32 hexadecimales.
    expect(envExample).not.toMatch(/\b(AC|VA)[0-9a-f]{32}\b/);
    expect(despliegue).not.toMatch(/\b(AC|VA)[0-9a-f]{32}\b/);
  });

  it("copiar `.env.example` a `.env` no enciende nada", () => {
    // Todas las líneas de la verificación están comentadas, así que un `.env`
    // copiado tal cual deja la capacidad apagada.
    const activas = envExample
      .split("\n")
      .filter((linea) => !linea.trim().startsWith("#") && linea.includes("VERIFICACION_SMS"));
    expect(activas).toEqual([]);
  });
});
