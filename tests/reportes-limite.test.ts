import { beforeEach, describe, expect, it } from "vitest";

import {
  ipBloqueada as altaBloqueada,
  registrarAlta,
  reiniciarLimitePorIp,
} from "../src/lib/registro/limite-ip";
import {
  REPORTES_POR_IP_POR_HORA,
  TOPE_REPORTES_PENDIENTES_POR_NEGOCIO,
  apartarCupoDeReportes,
  cupoDeReportesAgotado,
  registrarReporteEnCupo,
  reiniciarCupoDeReportes,
  tamanoCupoDeReportes,
} from "../src/lib/reportes/limite";

// Spec: directorio-publico · Requirement "Anti-abuso del reporte sin captcha:
// honeypot, cupo por IP y tope de pendientes por negocio" y registro-negocio ·
// Requirement "Anti-abuso sin captcha en el formulario público" (los cupos no
// se comparten entre superficies). design.md §2 y §3, tasks.md #4.
//
// IPs de los rangos reservados para documentación: no son de nadie.

const IP = "203.0.113.10"; // TEST-NET-3
const OTRA_IP = "198.51.100.7"; // TEST-NET-2

const AHORA = new Date("2026-09-04T12:00:00Z");
const enMinutos = (minutos: number) => new Date(AHORA.getTime() + minutos * 60_000);

describe("reportes · cupo por IP", () => {
  beforeEach(() => {
    reiniciarCupoDeReportes();
    reiniciarLimitePorIp();
  });

  it("son 3 reportes por hora (duda 3 resuelta en la aprobación)", () => {
    expect(REPORTES_POR_IP_POR_HORA).toBe(3);
  });

  // Scenario: cupo por IP agotado
  it("permite 3 reportes y bloquea el cuarto dentro de la misma hora", () => {
    for (let i = 0; i < 3; i++) {
      expect(cupoDeReportesAgotado(IP, enMinutos(i))).toBe(false);
      registrarReporteEnCupo(IP, enMinutos(i));
    }
    expect(cupoDeReportesAgotado(IP, enMinutos(10))).toBe(true);
  });

  it("libera el cupo cuando los reportes salen de la ventana de una hora", () => {
    for (let i = 0; i < 3; i++) registrarReporteEnCupo(IP, enMinutos(i));
    expect(cupoDeReportesAgotado(IP, enMinutos(59))).toBe(true);
    expect(cupoDeReportesAgotado(IP, enMinutos(61))).toBe(false);
  });

  it("cada IP lleva su propio cupo", () => {
    for (let i = 0; i < 3; i++) registrarReporteEnCupo(IP, enMinutos(i));
    expect(cupoDeReportesAgotado(OTRA_IP, enMinutos(5))).toBe(false);
  });

  // Scenario: sin encabezado de IP declarado (ipDeEncabezados devuelve null)
  it("sin IP conocida no bloquea a nadie ni rastrea nada", () => {
    for (let i = 0; i < 10; i++) registrarReporteEnCupo(null, enMinutos(i));
    expect(cupoDeReportesAgotado(null, enMinutos(11))).toBe(false);
    expect(tamanoCupoDeReportes()).toBe(0);
  });
});

// Iteración 2 (hallazgo A2 de la etapa C): comprobar y apartar tienen que ser
// una sola operación síncrona. Si fueran dos llamadas con un `await` en medio,
// ocho peticiones simultáneas leerían todas el mismo "sí hay cupo".
describe("reportes · apartar cupo es comprobar y apartar de un tirón", () => {
  beforeEach(() => reiniciarCupoDeReportes());

  it("aparta las tres primeras y niega la cuarta", () => {
    expect(apartarCupoDeReportes(IP, enMinutos(0))).toBe(true);
    expect(apartarCupoDeReportes(IP, enMinutos(1))).toBe(true);
    expect(apartarCupoDeReportes(IP, enMinutos(2))).toBe(true);
    expect(apartarCupoDeReportes(IP, enMinutos(3))).toBe(false);
  });

  it("apartar de verdad mueve el contador (no es solo una consulta)", () => {
    apartarCupoDeReportes(IP, enMinutos(0));
    apartarCupoDeReportes(IP, enMinutos(0));
    apartarCupoDeReportes(IP, enMinutos(0));
    expect(cupoDeReportesAgotado(IP, enMinutos(0))).toBe(true);
  });

  it("negar el cupo no gasta un intento de más ni libera ninguno", () => {
    for (let i = 0; i < 3; i++) apartarCupoDeReportes(IP, enMinutos(0));
    for (let i = 0; i < 5; i++) expect(apartarCupoDeReportes(IP, enMinutos(0))).toBe(false);
    // Pasada la hora, el cupo vuelve completo: los intentos negados no
    // alargaron el castigo.
    expect(apartarCupoDeReportes(IP, enMinutos(61))).toBe(true);
  });

  it("sin IP conocida siempre hay cupo y no se rastrea nada", () => {
    for (let i = 0; i < 10; i++) expect(apartarCupoDeReportes(null, enMinutos(i))).toBe(true);
    expect(tamanoCupoDeReportes()).toBe(0);
  });

  it("no le quita el cupo a otra IP ni al de altas", () => {
    for (let i = 0; i < 3; i++) apartarCupoDeReportes(IP, enMinutos(0));
    expect(apartarCupoDeReportes(OTRA_IP, enMinutos(0))).toBe(true);
    expect(altaBloqueada(IP, enMinutos(0))).toBe(false);
  });
});

describe("reportes · el cupo de reportes es un contador propio (design.md §2)", () => {
  beforeEach(() => {
    reiniciarCupoDeReportes();
    reiniciarLimitePorIp();
  });

  // Scenario: el cupo de reportes no consume el de altas
  it("agotar el cupo de reportes no impide registrar un negocio desde la misma IP", () => {
    for (let i = 0; i < 3; i++) registrarReporteEnCupo(IP, enMinutos(i));
    expect(cupoDeReportesAgotado(IP, enMinutos(5))).toBe(true);
    expect(altaBloqueada(IP, enMinutos(5))).toBe(false);
  });

  // Scenario: los cupos no se comparten entre superficies (registro-negocio)
  it("agotar el cupo de altas no impide reportar una ficha desde la misma IP", () => {
    for (let i = 0; i < 3; i++) registrarAlta(IP, enMinutos(i));
    expect(altaBloqueada(IP, enMinutos(5))).toBe(true);
    expect(cupoDeReportesAgotado(IP, enMinutos(5))).toBe(false);
  });

  it("reiniciar un cupo no vacía el otro (son dos mapas distintos)", () => {
    registrarReporteEnCupo(IP, enMinutos(0));
    registrarAlta(IP, enMinutos(0));
    reiniciarCupoDeReportes();
    expect(tamanoCupoDeReportes()).toBe(0);
    registrarAlta(IP, enMinutos(1));
    registrarAlta(IP, enMinutos(2));
    expect(altaBloqueada(IP, enMinutos(3))).toBe(true);
  });
});

describe("reportes · tope de pendientes por negocio", () => {
  it("son 10 reportes sin atender (design.md §3)", () => {
    expect(TOPE_REPORTES_PENDIENTES_POR_NEGOCIO).toBe(10);
  });
});
