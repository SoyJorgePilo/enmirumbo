import { describe, expect, it } from "vitest";

import { avisoDesdeCookie, textoDeAviso, validarReporte } from "../src/lib/reporte";

function formulario(campos: Record<string, string>): FormData {
  const datos = new FormData();
  for (const [nombre, valor] of Object.entries(campos)) datos.append(nombre, valor);
  return datos;
}

describe("validación del reporte del spike", () => {
  it("sin motivo, el aviso es el de motivo con el literal de la spec", () => {
    expect(validarReporte(formulario({}))).toEqual({ ok: false, aviso: "motivo" });
    expect(textoDeAviso("motivo")).toBe("Dinos qué pasa con este negocio");
  });

  it("un motivo inventado tampoco pasa", () => {
    expect(validarReporte(formulario({ motivo: "otro" }))).toEqual({ ok: false, aviso: "motivo" });
  });

  it("un comentario de más de 300 caracteres no pasa", () => {
    const resultado = validarReporte(formulario({ motivo: "cerrado", comentario: "x".repeat(301) }));
    expect(resultado).toEqual({ ok: false, aviso: "comentario" });
  });

  it("un motivo válido pasa", () => {
    expect(validarReporte(formulario({ motivo: "cerrado" }))).toEqual({ ok: true, motivo: "cerrado" });
  });

  it("de la cookie del aviso solo se aceptan códigos conocidos, nunca texto libre", () => {
    expect(avisoDesdeCookie("motivo")).toBe("motivo");
    expect(avisoDesdeCookie("comentario")).toBe("comentario");
    expect(avisoDesdeCookie("<script>alert(1)</script>")).toBeNull();
    expect(avisoDesdeCookie(undefined)).toBeNull();
  });
});
