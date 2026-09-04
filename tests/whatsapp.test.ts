import { describe, expect, it } from "vitest";

import { normalizarWhatsapp } from "../src/lib/whatsapp";

// Datos 100% ficticios (repo público + LFPDPPP): números 771999xxxx inventados.
// Spec: registro-negocio · "El servidor normaliza y valida el WhatsApp a 10 dígitos"
// (hallazgo M1 de T-001: la unicidad de la base solo protege la cadena exacta,
// así que el número DEBE llegar normalizado antes de tocar la base).

describe("normalizarWhatsapp", () => {
  // Scenario: variantes del mismo número se guardan igual
  it.each([
    "+52 771 999 4567",
    "771-999-4567",
    "7719994567",
    "(771) 999 4567",
    "771.999.4567",
    "52 771 999 4567",
    "+52 1 771 999 4567",
    "  7719994567  ",
  ])("reduce %s a los mismos 10 dígitos", (entrada) => {
    expect(normalizarWhatsapp(entrada)).toBe("7719994567");
  });

  // Scenario: número con menos de 10 dígitos · Scenario: texto que no es un número
  it.each([
    ["8 dígitos", "77199945"],
    ["parcial con espacios", "771 999 45"],
    ["texto sin dígitos", "no tengo"],
    ["vacío", ""],
    ["solo separadores", "+ - () ."],
    ["11 dígitos sueltos", "77199945671"],
    ["12 dígitos que no empiezan con 52", "137199945671"],
    ["13 dígitos que no empiezan con 521", "1371999456712"],
    ["demasiados dígitos", "5217719994567890"],
  ])("rechaza %s devolviendo null", (_caso, entrada) => {
    expect(normalizarWhatsapp(entrada)).toBeNull();
  });

  it("no confunde un 52 interior con el prefijo de país", () => {
    // 10 dígitos que empiezan con 52: ya están normalizados, se conservan.
    expect(normalizarWhatsapp("5271999456")).toBe("5271999456");
  });
});
