import { describe, expect, it } from "vitest";

import {
  ESTADOS_REPORTE,
  ESTADO_REPORTE_ATENDIDO,
  ESTADO_REPORTE_PENDIENTE,
} from "../src/lib/reportes/estados";
import {
  ETIQUETA_MOTIVO_REPORTE,
  MOTIVOS_REPORTE,
  esMotivoReporteValido,
} from "../src/lib/reportes/motivos";

// Spec: directorio-publico · Requirement "Mini-formulario de reporte sin
// cuenta, con motivo de lista cerrada y comentario opcional" y modelo-datos ·
// Requirement "El modelo `Reporte`…" (tasks.md #2).
//
// Los valores guardados son estables e independientes del copy (design.md §4):
// este test es el que hace ruido si alguien los cambia de paso.

describe("reportes · lista cerrada de motivos", () => {
  it("son exactamente los cuatro valores estables de la spec, en orden", () => {
    expect([...MOTIVOS_REPORTE]).toEqual([
      "cerrado",
      "no_real",
      "datos_incorrectos",
      "inapropiado",
    ]);
  });

  it("cada motivo trae su etiqueta coloquial, carácter por carácter", () => {
    expect(ETIQUETA_MOTIVO_REPORTE).toEqual({
      cerrado: "Ya cerró",
      no_real: "No es real",
      datos_incorrectos: "Los datos están mal",
      inapropiado: "Contenido ofensivo o inapropiado",
    });
  });

  it("no existe la opción 'Otro' ni ningún motivo de texto libre", () => {
    expect(MOTIVOS_REPORTE).toHaveLength(4);
    expect(Object.keys(ETIQUETA_MOTIVO_REPORTE)).toHaveLength(4);
    for (const etiqueta of Object.values(ETIQUETA_MOTIVO_REPORTE)) {
      expect(etiqueta.toLowerCase()).not.toBe("otro");
    }
  });

  it.each([...MOTIVOS_REPORTE])("acepta el motivo válido %s", (motivo) => {
    expect(esMotivoReporteValido(motivo)).toBe(true);
  });

  // Scenario: motivo fuera de la lista (lo que puede llegar de un FormData
  // manipulado: inventado, vacío, ausente, repetido —arreglo—, o un File).
  it.each([
    ["un motivo inventado", "porque si"],
    ["cadena vacía", ""],
    ["undefined (campo ausente)", undefined],
    ["null", null],
    ["un arreglo de motivos repetidos", ["cerrado", "no_real"]],
    ["un arreglo con un solo motivo válido", ["cerrado"]],
    ["un número", 1],
    ["un objeto", { motivo: "cerrado" }],
    ["mayúsculas", "CERRADO"],
    ["con espacios alrededor", " cerrado "],
  ])("rechaza %s", (_caso, valor) => {
    expect(esMotivoReporteValido(valor)).toBe(false);
  });
});

describe("reportes · estados del reporte", () => {
  it("son exactamente pendiente y atendido", () => {
    expect([...ESTADOS_REPORTE]).toEqual(["pendiente", "atendido"]);
    expect(ESTADO_REPORTE_PENDIENTE).toBe("pendiente");
    expect(ESTADO_REPORTE_ATENDIDO).toBe("atendido");
  });
});
