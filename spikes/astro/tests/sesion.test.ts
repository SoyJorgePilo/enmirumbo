import { describe, expect, it } from "vitest";

import {
  crearValorDeSesion,
  esSesionValida,
  secretoDeSesion,
  VARIABLE_SECRETO,
} from "../src/lib/sesion";

const SECRETO = "s".repeat(32);
const AHORA = new Date("2026-10-01T12:00:00Z");

describe("sesión firmada del spike", () => {
  it("una sesión recién emitida es válida", () => {
    expect(esSesionValida(crearValorDeSesion(SECRETO, AHORA), SECRETO, AHORA)).toBe(true);
  });

  it("una cookie alterada a mano no es válida", () => {
    const valor = crearValorDeSesion(SECRETO, AHORA);
    const [caducidad, firma] = valor.split(".");
    expect(esSesionValida(`${Number(caducidad) + 1}.${firma}`, SECRETO, AHORA)).toBe(false);
    const ultimo = firma.at(-1) === "A" ? "B" : "A";
    expect(esSesionValida(`${caducidad}.${firma.slice(0, -1)}${ultimo}`, SECRETO, AHORA)).toBe(false);
  });

  it("firmada con otro secreto no es válida", () => {
    expect(esSesionValida(crearValorDeSesion("o".repeat(32), AHORA), SECRETO, AHORA)).toBe(false);
  });

  it("vencida no es válida", () => {
    const valor = crearValorDeSesion(SECRETO, AHORA);
    expect(esSesionValida(valor, SECRETO, new Date(AHORA.getTime() + 9 * 3600 * 1000))).toBe(false);
  });

  it("sin cookie o con basura no hay sesión", () => {
    for (const valor of [undefined, null, "", "abc", "1.2.3", "01.x", "9".repeat(20) + ".x"]) {
      expect(esSesionValida(valor, SECRETO, AHORA)).toBe(false);
    }
  });

  it("sin secreto (o con uno corto) no hay secreto usable: falla a la vista", () => {
    expect(VARIABLE_SECRETO).toBe("SPIKE_SESION_SECRETO");
    expect(secretoDeSesion(undefined)).toBeNull();
    expect(secretoDeSesion("")).toBeNull();
    expect(secretoDeSesion("corto")).toBeNull();
    expect(secretoDeSesion(SECRETO)).toBe(SECRETO);
  });
});
