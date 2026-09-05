import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LONGITUD_MINIMA_SECRETO_VERIFICACION,
  TOPE_DIARIO_POR_DEFECTO,
  VALOR_BANDERA_ENCENDIDA,
  VARIABLE_BANDERA,
  VARIABLE_SECRETO,
  VARIABLE_TOPE_DIARIO,
  VARIABLE_TWILIO_AUTH_TOKEN,
  VARIABLE_TWILIO_SERVICE_SID,
  VARIABLE_TWILIO_SID,
  leerConfiguracionVerificacion,
  motivoConfiguracionIncompleta,
  reiniciarAvisoDeVerificacion,
  verificacionEncendida,
  type EntornoVerificacion,
} from "../src/lib/verificacion/config";

/**
 * Spec `registro-negocio` (T-016) · Requirement "La verificación por SMS solo
 * existe si está encendida y completamente configurada" — el requirement rey
 * (tasks.md #3).
 *
 * Todo se prueba con un entorno INYECTADO: nada aquí toca `process.env`, y
 * ninguna prueba de la suite necesita credenciales de nadie.
 *
 * Credenciales de mentira, imposibles de confundir con verdaderas: los SID de
 * Twilio de verdad empiezan por `AC`/`VA` y traen 32 hexadecimales.
 */

const SID_FALSO = "AC00000000000000000000000000000000-de-mentiras";
const TOKEN_FALSO = "token-de-mentiras-que-no-sirve-para-nada";
const SERVICE_FALSO = "VA00000000000000000000000000000000-de-mentiras";
const SECRETO_FALSO = "secreto-de-pruebas-de-32-caracteres-o-mas";

const COMPLETO: EntornoVerificacion = {
  [VARIABLE_BANDERA]: "1",
  [VARIABLE_TWILIO_SID]: SID_FALSO,
  [VARIABLE_TWILIO_AUTH_TOKEN]: TOKEN_FALSO,
  [VARIABLE_TWILIO_SERVICE_SID]: SERVICE_FALSO,
  [VARIABLE_SECRETO]: SECRETO_FALSO,
};

afterEach(() => {
  reiniciarAvisoDeVerificacion();
  vi.restoreAllMocks();
});

describe("registro-negocio · la capacidad solo existe con todo puesto", () => {
  it("con las cinco variables completas, la capacidad está encendida", () => {
    const configuracion = leerConfiguracionVerificacion(COMPLETO);
    expect(configuracion).not.toBeNull();
    expect(configuracion?.cuentaSid).toBe(SID_FALSO);
    expect(configuracion?.authToken).toBe(TOKEN_FALSO);
    expect(configuracion?.servicioSid).toBe(SERVICE_FALSO);
    expect(configuracion?.secreto).toBe(SECRETO_FALSO);
    expect(configuracion?.topeDiario).toBe(TOPE_DIARIO_POR_DEFECTO);
    expect(verificacionEncendida(COMPLETO)).toBe(true);
  });

  // Scenario: sin configuración, el sitio de hoy
  it("sin ninguna variable, apagada y SIN advertencia (no es un error)", () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(leerConfiguracionVerificacion({})).toBeNull();
    expect(motivoConfiguracionIncompleta({})).toBeNull();
    expect(aviso).not.toHaveBeenCalled();
  });

  // La bandera vale `1` y nada más: un valor tipeado a medias no enciende un
  // canal que cuesta dinero (design.md §4).
  it.each(["true", "sí", "si", "on", "yes", "0", "1 ", "01", "TRUE", "verdadero"])(
    "la bandera con el valor %j deja la capacidad apagada",
    (valor) => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(leerConfiguracionVerificacion({ ...COMPLETO, [VARIABLE_BANDERA]: valor })).toBeNull();
    },
  );

  it("solo el valor exacto de la bandera enciende", () => {
    expect(VALOR_BANDERA_ENCENDIDA).toBe("1");
  });

  // Scenario: configuración a medias
  it.each([
    VARIABLE_TWILIO_SID,
    VARIABLE_TWILIO_AUTH_TOKEN,
    VARIABLE_TWILIO_SERVICE_SID,
    VARIABLE_SECRETO,
  ])("sin %s la capacidad queda apagada y avisa qué falta", (faltante) => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const env = { ...COMPLETO };
    delete env[faltante];

    expect(leerConfiguracionVerificacion(env)).toBeNull();
    expect(motivoConfiguracionIncompleta(env)).toContain(faltante);
    expect(aviso).toHaveBeenCalledTimes(1);
  });

  it.each(["", "   ", "\t\n"])(
    "una credencial vacía o de puros espacios (%j) no cuenta como puesta",
    (vacio) => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const env = { ...COMPLETO, [VARIABLE_TWILIO_SERVICE_SID]: vacio };
      expect(leerConfiguracionVerificacion(env)).toBeNull();
      expect(motivoConfiguracionIncompleta(env)).toContain(VARIABLE_TWILIO_SERVICE_SID);
    },
  );

  it("un secreto de menos de 32 caracteres no sirve", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const corto = "x".repeat(LONGITUD_MINIMA_SECRETO_VERIFICACION - 1);
    const env = { ...COMPLETO, [VARIABLE_SECRETO]: corto };
    expect(leerConfiguracionVerificacion(env)).toBeNull();
    expect(motivoConfiguracionIncompleta(env)).toContain(VARIABLE_SECRETO);
  });

  it("con el secreto justo en el mínimo sí sirve", () => {
    const justo = "x".repeat(LONGITUD_MINIMA_SECRETO_VERIFICACION);
    expect(leerConfiguracionVerificacion({ ...COMPLETO, [VARIABLE_SECRETO]: justo })).not.toBeNull();
  });

  // Credenciales completas SIN la bandera: no es un error de configuración,
  // es el estado normal de quien preparó las variables y todavía no enciende.
  it("credenciales completas sin la bandera: apagada, sin advertencia", () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const env = { ...COMPLETO };
    delete env[VARIABLE_BANDERA];
    expect(leerConfiguracionVerificacion(env)).toBeNull();
    expect(aviso).not.toHaveBeenCalled();
  });
});

describe("registro-negocio · el tope diario configurable", () => {
  it("toma el valor del entorno cuando es un entero positivo", () => {
    const configuracion = leerConfiguracionVerificacion({
      ...COMPLETO,
      [VARIABLE_TOPE_DIARIO]: "120",
    });
    expect(configuracion?.topeDiario).toBe(120);
  });

  it.each(["", "  ", "muchos", "-5", "0", "12.5", "1e3", "NaN", "Infinity"])(
    "con el tope %j cae en el valor por defecto sin apagar la capacidad",
    (valor) => {
      const configuracion = leerConfiguracionVerificacion({
        ...COMPLETO,
        [VARIABLE_TOPE_DIARIO]: valor,
      });
      expect(configuracion).not.toBeNull();
      expect(configuracion?.topeDiario).toBe(TOPE_DIARIO_POR_DEFECTO);
    },
  );

  it("el tope por defecto es 50 (duda 2 aprobada en la propuesta)", () => {
    expect(TOPE_DIARIO_POR_DEFECTO).toBe(50);
  });
});

describe("registro-negocio · el aviso es único y no delata credenciales", () => {
  // Scenario: configuración a medias — "una sola advertencia por proceso"
  it("avisa una sola vez aunque se pregunte muchas veces", () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const env = { ...COMPLETO };
    delete env[VARIABLE_SECRETO];

    for (let i = 0; i < 25; i += 1) leerConfiguracionVerificacion(env);
    expect(aviso).toHaveBeenCalledTimes(1);
  });

  it("la advertencia nombra la variable, nunca el valor de ninguna credencial", () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const env = { ...COMPLETO };
    delete env[VARIABLE_TWILIO_SERVICE_SID];
    leerConfiguracionVerificacion(env);

    const escrito = aviso.mock.calls.map((llamada) => llamada.join(" ")).join("\n");
    expect(escrito).toContain(VARIABLE_TWILIO_SERVICE_SID);
    for (const secreto of [SID_FALSO, TOKEN_FALSO, SERVICE_FALSO, SECRETO_FALSO]) {
      expect(escrito).not.toContain(secreto);
      // Ni un trozo: ocho caracteres de una credencial ya son una filtración.
      expect(escrito).not.toContain(secreto.slice(0, 8));
    }
  });

  it("la advertencia no rompe nada: la lectura devuelve null y sigue el flujo", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const env = { ...COMPLETO, [VARIABLE_TWILIO_AUTH_TOKEN]: "" };
    expect(() => leerConfiguracionVerificacion(env)).not.toThrow();
    expect(verificacionEncendida(env)).toBe(false);
  });
});
