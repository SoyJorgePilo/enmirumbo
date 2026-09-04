import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ALTAS_POR_IP_POR_HORA,
  MAX_IPS_RASTREADAS,
  ipBloqueada,
  ipDeEncabezados,
  registrarAlta,
  reiniciarAvisoDeEncabezado,
  reiniciarLimitePorIp,
  tamanoLimitePorIp,
} from "../src/lib/registro/limite-ip";

// Spec: registro-negocio · "Anti-abuso sin captcha en el formulario público"
// (límite de 3 envíos por hora por IP). IPs de ejemplo, no de personas reales.

const IP = "203.0.113.10"; // rango TEST-NET-3, reservado para documentación
const OTRA_IP = "198.51.100.7"; // rango TEST-NET-2

const AHORA = new Date("2026-09-03T12:00:00Z");
const enMinutos = (minutos: number) =>
  new Date(AHORA.getTime() + minutos * 60_000);

describe("límite de altas por IP", () => {
  beforeEach(() => reiniciarLimitePorIp());

  it("son 3 altas por hora (design.md §4: 3 y no 1 por el NAT compartido)", () => {
    expect(ALTAS_POR_IP_POR_HORA).toBe(3);
  });

  // Scenario: límite por IP
  it("permite 3 altas y bloquea la cuarta dentro de la misma hora", () => {
    for (let i = 0; i < 3; i++) {
      expect(ipBloqueada(IP, enMinutos(i))).toBe(false);
      registrarAlta(IP, enMinutos(i));
    }
    expect(ipBloqueada(IP, enMinutos(10))).toBe(true);
  });

  it("libera el cupo cuando las altas salen de la ventana de una hora", () => {
    for (let i = 0; i < 3; i++) registrarAlta(IP, enMinutos(i));
    expect(ipBloqueada(IP, enMinutos(59))).toBe(true);
    expect(ipBloqueada(IP, enMinutos(61))).toBe(false);
  });

  it("cada IP lleva su propio cupo", () => {
    for (let i = 0; i < 3; i++) registrarAlta(IP, enMinutos(i));
    expect(ipBloqueada(OTRA_IP, enMinutos(5))).toBe(false);
  });

  it("sin IP conocida no se bloquea a nadie (no hay a quién atribuirlo)", () => {
    for (let i = 0; i < 5; i++) registrarAlta(null, enMinutos(i));
    expect(ipBloqueada(null, enMinutos(6))).toBe(false);
  });
});

describe("ipDeEncabezados (corrección del hallazgo ALTO 1)", () => {
  const encabezados = (pares: Record<string, string>) => new Headers(pares);

  it("sin encabezado declarado por configuración no confía en ninguno", () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    reiniciarAvisoDeEncabezado();

    expect(
      ipDeEncabezados(encabezados({ "x-forwarded-for": "203.0.113.10" })),
      "un encabezado sin proxy de confianza lo escribe quien envía",
    ).toBeNull();
    expect(ipDeEncabezados(encabezados({ "x-real-ip": "198.51.100.7" }))).toBeNull();
    // Se avisa una sola vez, para que no pase inadvertido en el despliegue
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(aviso.mock.calls.flat().join(" ")).toContain("REGISTRO_ENCABEZADO_IP");

    ipDeEncabezados(encabezados({}));
    expect(aviso).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it("con el encabezado declarado toma el ÚLTIMO salto, no el que eligió el cliente", () => {
    // nginx/HAProxy añaden la IP real al final; lo de antes lo mandó el cliente
    expect(
      ipDeEncabezados(
        encabezados({ "x-forwarded-for": "10.0.0.1, 203.0.113.10" }),
        "x-forwarded-for",
      ),
    ).toBe("203.0.113.10");
  });

  it("admite un encabezado de un solo valor (proxies que sobrescriben)", () => {
    expect(
      ipDeEncabezados(encabezados({ "cf-connecting-ip": "198.51.100.7" }), "cf-connecting-ip"),
    ).toBe("198.51.100.7");
  });

  it.each([
    ["texto que no es IP", "no-es-una-ip"],
    ["clave gigante", "a".repeat(5000)],
    ["octetos fuera de rango", "999.999.999.999"],
    ["vacío", ""],
    ["marcador de proxy", "unknown"],
  ])("descarta %s como clave de cupo", (_caso, valor) => {
    expect(
      ipDeEncabezados(encabezados({ "x-forwarded-for": valor }), "x-forwarded-for"),
    ).toBeNull();
  });

  it("acepta IPv6 y quita el puerto de IPv4", () => {
    expect(
      ipDeEncabezados(
        encabezados({ "x-forwarded-for": "2001:db8::1428:57ab" }),
        "x-forwarded-for",
      ),
    ).toBe("2001:db8::1428:57ab");
    expect(
      ipDeEncabezados(
        encabezados({ "x-forwarded-for": "203.0.113.10:54321" }),
        "x-forwarded-for",
      ),
    ).toBe("203.0.113.10");
  });

  it("devuelve null si el encabezado configurado no viene en la petición", () => {
    expect(ipDeEncabezados(encabezados({}), "x-forwarded-for")).toBeNull();
  });
});

describe("cota del mapa de IPs (corrección del MEDIO 1)", () => {
  beforeEach(() => reiniciarLimitePorIp());

  it("purga las entradas caducadas aunque esa IP no vuelva a aparecer", () => {
    for (let i = 0; i < 20; i += 1) registrarAlta(`198.51.100.${i}`, AHORA);
    expect(tamanoLimitePorIp()).toBe(20);

    // Una sola alta posterior a la ventana basta para barrer lo caducado
    registrarAlta(IP, enMinutos(61));
    expect(tamanoLimitePorIp()).toBe(1);
  });

  it("nunca rastrea más de MAX_IPS_RASTREADAS y desaloja lo menos reciente", () => {
    for (let i = 0; i < MAX_IPS_RASTREADAS + 50; i += 1) {
      registrarAlta(`10.0.${Math.floor(i / 256)}.${i % 256}`, enMinutos(i / 1000));
    }

    expect(tamanoLimitePorIp()).toBe(MAX_IPS_RASTREADAS);
    // La primera IP (la más vieja) ya no ocupa lugar; la última sigue contada
    expect(ipBloqueada("10.0.0.0", enMinutos(1))).toBe(false);
  });
});
