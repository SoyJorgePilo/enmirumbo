import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  apartarCupoDeReportes,
  reiniciarCupoDeReportes,
} from "../src/lib/reportes/limite";
import {
  ipBloqueada,
  ipDeEncabezados,
  registrarAlta,
  reiniciarAvisoDeEncabezado,
  reiniciarLimitePorIp,
} from "../src/lib/registro/limite-ip";
import { RETENCION_MAXIMA_DE_CUPOS_MS } from "../src/lib/cupos/compartido";
import {
  COOLDOWN_REENVIO_MS,
  CODIGOS_POR_IP_POR_HORA,
  MAX_INTENTOS_POR_REGISTRO,
  MAX_REENVIOS_POR_REGISTRO,
  VENTANA_CODIGOS_MS,
  VENTANA_TOPES_POR_REGISTRO_MS,
  apartarCupoDeCodigos,
  apartarEnvioSeguido,
  apartarReenvioDelRegistro,
  apartarTopeDiario,
  apuntarIntentoDelRegistro,
  cupoDeCodigosAgotado,
  intentosDelRegistroAgotados,
  reiniciarCupoDeCodigos,
  reiniciarTopeDiario,
  reiniciarTopesPorRegistro,
  topeDiarioAlcanzado,
} from "../src/lib/verificacion/limites";
import { DURACION_PASO_MS } from "../src/lib/verificacion/paso";
import { crearClientePrueba } from "./db";

/**
 * Spec `registro-negocio` (T-016) · Requirement "El canal de SMS cuesta dinero
 * y está acotado por cupo, cooldown y tope diario" (tasks.md #7).
 *
 * Cada SMS se paga por mensaje (ADR-011), así que estas cotas no son cosmética:
 * son la diferencia entre una noche mala y una factura.
 *
 * IPs de los rangos reservados para documentación: no son de nadie.
 */

const IP = "203.0.113.77"; // TEST-NET-3
const OTRA_IP = "198.51.100.77"; // TEST-NET-2
const AHORA = new Date("2026-09-04T12:00:00.000Z");
const enMinutos = (minutos: number) => new Date(AHORA.getTime() + minutos * 60_000);

/** Secreto de mentiras: solo sirve para derivar claves en esta suite. */
const SECRETO = "secreto-de-pruebas-de-32-caracteres-o-mas";
const NEGOCIO = "cln00000ficha00000001";
const OTRO_NEGOCIO = "cln00000ficha00000002";

const prisma = crearClientePrueba();

const topes = (negocioId = NEGOCIO, ahora = AHORA) => ({
  cupos: prisma,
  negocioId,
  secreto: SECRETO,
  ahora,
});

beforeEach(async () => {
  reiniciarCupoDeCodigos();
  reiniciarTopeDiario();
  reiniciarTopesPorRegistro();
  await prisma.intentoDeCupo.deleteMany({});
  reiniciarLimitePorIp();
  reiniciarCupoDeReportes();
  reiniciarAvisoDeEncabezado();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await prisma.intentoDeCupo.deleteMany({});
  await prisma.$disconnect();
});

describe("registro-negocio · cupo de códigos por IP (3 por hora)", () => {
  it("los números son los aprobados en la propuesta", () => {
    expect(CODIGOS_POR_IP_POR_HORA).toBe(3);
    expect(VENTANA_CODIGOS_MS).toBe(60 * 60 * 1000);
    expect(COOLDOWN_REENVIO_MS).toBe(60_000);
    expect(MAX_REENVIOS_POR_REGISTRO).toBe(2);
    expect(MAX_INTENTOS_POR_REGISTRO).toBe(5);
  });

  // Scenario: cupo por IP agotado
  it("deja pasar tres códigos en una hora y corta el cuarto", () => {
    for (let i = 0; i < CODIGOS_POR_IP_POR_HORA; i += 1) {
      expect(apartarCupoDeCodigos(IP, AHORA), `código ${i + 1}`).toBe(true);
    }
    expect(apartarCupoDeCodigos(IP, AHORA)).toBe(false);
    expect(cupoDeCodigosAgotado(IP, AHORA)).toBe(true);
  });

  it("la ventana se libera: pasada la hora, vuelve a haber cupo", () => {
    for (let i = 0; i < CODIGOS_POR_IP_POR_HORA; i += 1) apartarCupoDeCodigos(IP, AHORA);
    expect(apartarCupoDeCodigos(IP, enMinutos(59))).toBe(false);
    expect(apartarCupoDeCodigos(IP, enMinutos(61))).toBe(true);
  });

  it("cada IP tiene su propio cupo", () => {
    for (let i = 0; i < CODIGOS_POR_IP_POR_HORA; i += 1) apartarCupoDeCodigos(IP, AHORA);
    expect(apartarCupoDeCodigos(IP, AHORA)).toBe(false);
    expect(apartarCupoDeCodigos(OTRA_IP, AHORA)).toBe(true);
  });

  // Scenario: sin encabezado de IP declarado
  it("sin IP (encabezado no declarado) el cupo simplemente no aplica", () => {
    for (let i = 0; i < 20; i += 1) {
      expect(apartarCupoDeCodigos(null, AHORA)).toBe(true);
    }
    expect(cupoDeCodigosAgotado(null, AHORA)).toBe(false);
  });

  it("sin REGISTRO_ENCABEZADO_IP configurado, `ipDeEncabezados` no da clave", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const encabezados = new Headers({ "x-forwarded-for": IP });
    expect(ipDeEncabezados(encabezados, undefined)).toBeNull();
  });

  it("comprobar y apartar van en un solo paso, sin ventana entre medias", () => {
    // Ocho "peticiones" seguidas sin ceder el turno: solo tres pasan.
    const desenlaces = Array.from({ length: 8 }, () => apartarCupoDeCodigos(IP, AHORA));
    expect(desenlaces.filter(Boolean)).toHaveLength(CODIGOS_POR_IP_POR_HORA);
  });
});

// Scenario: los cupos no se comparten
describe("registro-negocio · los tres cupos por IP son independientes", () => {
  it("agotar el de códigos no consume el de altas ni el de reportes", () => {
    for (let i = 0; i < CODIGOS_POR_IP_POR_HORA; i += 1) apartarCupoDeCodigos(IP, AHORA);
    expect(apartarCupoDeCodigos(IP, AHORA)).toBe(false);

    expect(ipBloqueada(IP, AHORA)).toBe(false);
    expect(apartarCupoDeReportes(IP, AHORA)).toBe(true);
  });

  it("agotar el de altas no consume el de códigos", () => {
    for (let i = 0; i < 3; i += 1) registrarAlta(IP, AHORA);
    expect(ipBloqueada(IP, AHORA)).toBe(true);
    expect(apartarCupoDeCodigos(IP, AHORA)).toBe(true);
  });

  it("agotar el de reportes no consume el de códigos", () => {
    for (let i = 0; i < 3; i += 1) apartarCupoDeReportes(IP, AHORA);
    expect(apartarCupoDeReportes(IP, AHORA)).toBe(false);
    expect(apartarCupoDeCodigos(IP, AHORA)).toBe(true);
  });
});

// Scenario: tope diario alcanzado
describe("registro-negocio · tope diario global (corta, no solo avisa)", () => {
  it("deja iniciar hasta el tope y a partir de ahí corta", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (let i = 0; i < 3; i += 1) {
      expect(apartarTopeDiario(3, AHORA), `verificación ${i + 1}`).toBe(true);
    }
    expect(apartarTopeDiario(3, AHORA)).toBe(false);
    expect(topeDiarioAlcanzado(3, AHORA)).toBe(true);
  });

  it("deja UNA alerta en el log al alcanzarlo, no una por petición", () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (let i = 0; i < 3; i += 1) apartarTopeDiario(3, AHORA);
    for (let i = 0; i < 10; i += 1) apartarTopeDiario(3, AHORA);

    const alertas = aviso.mock.calls.filter((llamada) =>
      llamada.join(" ").includes("tope diario"),
    );
    expect(alertas).toHaveLength(1);
  });

  it("la alerta no lleva ningún número de nadie, solo el conteo y el tope", () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (let i = 0; i < 4; i += 1) apartarTopeDiario(3, AHORA);
    const escrito = aviso.mock.calls.map((llamada) => llamada.join(" ")).join("\n");
    expect(escrito).toContain("3");
    expect(escrito).not.toMatch(/\d{10}/);
  });

  it("el contador se reinicia con el día natural", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (let i = 0; i < 3; i += 1) apartarTopeDiario(3, AHORA);
    expect(apartarTopeDiario(3, AHORA)).toBe(false);

    const manana = new Date(AHORA.getTime() + 24 * 60 * 60 * 1000);
    expect(apartarTopeDiario(3, manana)).toBe(true);
  });

  it("un tope de cero no manda ningún SMS", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(apartarTopeDiario(0, AHORA)).toBe(false);
  });
});

/**
 * Hallazgo [C-2] de la etapa C, cerrado: los topes POR REGISTRO se cuentan en
 * el servidor (almacén compartido, tabla `IntentoDeCupo`), no en la cookie que
 * se le entrega al cliente. Aquí se prueban contra la base de verdad.
 */
describe("registro-negocio · los topes por registro viven en el servidor", () => {
  it("la ventana de los topes es la misma que dura la credencial de paso", () => {
    expect(VENTANA_TOPES_POR_REGISTRO_MS).toBe(DURACION_PASO_MS);
    // Invariante de la limpieza diaria: ninguna ventana puede pasarse del
    // horizonte de retención, o la tarea borraría marcas todavía vigentes.
    expect(VENTANA_TOPES_POR_REGISTRO_MS).toBeLessThan(RETENCION_MAXIMA_DE_CUPOS_MS);
  });

  it("los 5 intentos se agotan al quinto, y el conteo NO depende del cliente", async () => {
    for (let i = 0; i < MAX_INTENTOS_POR_REGISTRO; i += 1) {
      expect(await intentosDelRegistroAgotados(topes()), `intento ${i + 1}`).toBe(false);
      await apuntarIntentoDelRegistro(topes());
    }
    expect(await intentosDelRegistroAgotados(topes())).toBe(true);
  });

  it("cada registro lleva su propia cuenta de intentos", async () => {
    for (let i = 0; i < MAX_INTENTOS_POR_REGISTRO; i += 1) {
      await apuntarIntentoDelRegistro(topes());
    }
    expect(await intentosDelRegistroAgotados(topes())).toBe(true);
    expect(await intentosDelRegistroAgotados(topes(OTRO_NEGOCIO))).toBe(false);
  });

  it("los 2 reenvíos se apartan de forma atómica y el tercero se corta", async () => {
    expect(await apartarReenvioDelRegistro(topes())).toBe(true);
    expect(await apartarReenvioDelRegistro(topes())).toBe(true);
    expect(await apartarReenvioDelRegistro(topes())).toBe(false);
    // Y otro registro no se ve afectado.
    expect(await apartarReenvioDelRegistro(topes(OTRO_NEGOCIO))).toBe(true);
  });

  it("el turno de envío es de uno cada 60 segundos", async () => {
    expect(await apartarEnvioSeguido(topes())).toBe(true);
    expect(await apartarEnvioSeguido(topes(NEGOCIO, new Date(AHORA.getTime() + 59_000)))).toBe(
      false,
    );
    expect(await apartarEnvioSeguido(topes(NEGOCIO, new Date(AHORA.getTime() + 60_001)))).toBe(
      true,
    );
    expect(COOLDOWN_REENVIO_MS).toBe(60_000);
  });

  it("pasada la ventana, los topes del registro se liberan", async () => {
    for (let i = 0; i < MAX_REENVIOS_POR_REGISTRO; i += 1) {
      await apartarReenvioDelRegistro(topes());
    }
    expect(await apartarReenvioDelRegistro(topes())).toBe(false);
    const despues = new Date(AHORA.getTime() + VENTANA_TOPES_POR_REGISTRO_MS + 1_000);
    expect(await apartarReenvioDelRegistro(topes(NEGOCIO, despues))).toBe(true);
  });

  it("lo que se guarda es una huella, nunca el identificador del registro", async () => {
    await apuntarIntentoDelRegistro(topes());
    const filas = await prisma.intentoDeCupo.findMany({ select: { clave: true } });
    expect(filas.length).toBeGreaterThan(0);
    for (const fila of filas) {
      expect(fila.clave).not.toContain(NEGOCIO);
      expect(fila.clave).toMatch(/^[0-9a-f]{32}$/);
    }
  });

  it("los tres cupos por registro no se mezclan entre sí", async () => {
    for (let i = 0; i < MAX_REENVIOS_POR_REGISTRO; i += 1) {
      await apartarReenvioDelRegistro(topes());
    }
    expect(await apartarReenvioDelRegistro(topes())).toBe(false);
    // Agotar los reenvíos no gasta intentos ni el turno de envío.
    expect(await intentosDelRegistroAgotados(topes())).toBe(false);
    expect(await apartarEnvioSeguido(topes())).toBe(true);
  });
});
