import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VENTANA_INTENTOS_ACCESO_MS } from "../src/lib/admin/acceso";
import {
  apartarCupoCompartido,
  claveDeCupo,
  cupoCompartidoAgotado,
  limpiarCuposCaducados,
  MAX_FILAS_DE_CUPOS,
  reiniciarAvisoDeRespaldo,
  RETENCION_MAXIMA_DE_CUPOS_MS,
  type ClienteCupos,
  type SolicitudDeCupo,
} from "../src/lib/cupos/compartido";
import { crearCupoPorIp, MAX_IPS_RASTREADAS } from "../src/lib/registro/limite-ip";
import { crearClientePrueba } from "./db";

/**
 * Spec `despliegue` · Requirement "Los límites anti-abuso que protegen
 * credenciales se cuentan en un almacén compartido" (iteración 2 del change
 * `preparar-deploy-produccion`, hallazgo A4 de la etapa C).
 *
 * IPs de los rangos reservados para documentación: no son de nadie.
 */

const IP = "203.0.113.44"; // TEST-NET-3
const OTRA_IP = "198.51.100.44"; // TEST-NET-2
const SECRETO = "secreto-de-pruebas-para-derivar-claves-de-cupo";
const AHORA = new Date("2026-09-04T12:00:00.000Z");
const VENTANA_MS = 10 * 60 * 1000;
const MAXIMO = 3;

const prisma = crearClientePrueba();

function solicitud(cambios: Partial<SolicitudDeCupo> = {}): SolicitudDeCupo {
  return {
    cupo: "cupo-de-prueba",
    ip: IP,
    maximo: MAXIMO,
    ventanaMs: VENTANA_MS,
    ahora: AHORA,
    secreto: SECRETO,
    respaldo: crearCupoPorIp({ maximo: MAXIMO, ventanaMs: VENTANA_MS }),
    ...cambios,
  };
}

const enMinutos = (minutos: number) => new Date(AHORA.getTime() + minutos * 60_000);

beforeEach(async () => {
  reiniciarAvisoDeRespaldo();
  await prisma.intentoDeCupo.deleteMany();
});

afterEach(() => vi.restoreAllMocks());

describe("cupos compartidos · el conteo vive en la base", () => {
  it("deja pasar hasta el máximo y bloquea el siguiente", async () => {
    const base = solicitud();
    for (let i = 0; i < MAXIMO; i += 1) {
      expect(await apartarCupoCompartido(prisma, base)).toBe(true);
    }
    expect(await apartarCupoCompartido(prisma, base)).toBe(false);
    expect(await cupoCompartidoAgotado(prisma, base)).toBe(true);
  });

  it("cada procedencia lleva su propia cuenta", async () => {
    const base = solicitud();
    for (let i = 0; i < MAXIMO; i += 1) await apartarCupoCompartido(prisma, base);
    expect(await apartarCupoCompartido(prisma, solicitud({ ip: OTRA_IP }))).toBe(true);
  });

  it("cada cupo lleva la suya: agotar uno no gasta el otro", async () => {
    const base = solicitud();
    for (let i = 0; i < MAXIMO; i += 1) await apartarCupoCompartido(prisma, base);
    expect(await apartarCupoCompartido(prisma, solicitud({ cupo: "otro-cupo" }))).toBe(true);
  });

  it("la ventana es DESLIZANTE, no fija: no regala el doble en el borde", async () => {
    // Tres eventos repartidos en la ventana; al pasar el primero de largo,
    // vuelve a haber UN hueco, no tres.
    await apartarCupoCompartido(prisma, solicitud({ ahora: AHORA }));
    await apartarCupoCompartido(prisma, solicitud({ ahora: enMinutos(9) }));
    await apartarCupoCompartido(prisma, solicitud({ ahora: enMinutos(9) }));

    expect(await apartarCupoCompartido(prisma, solicitud({ ahora: enMinutos(9) }))).toBe(false);
    // Justo después de que caduque el primero: cabe uno, y sólo uno.
    expect(await apartarCupoCompartido(prisma, solicitud({ ahora: enMinutos(11) }))).toBe(true);
    expect(await apartarCupoCompartido(prisma, solicitud({ ahora: enMinutos(11) }))).toBe(false);
  });

  it("lo que sale de la ventana se borra de la base, no se acumula", async () => {
    await apartarCupoCompartido(prisma, solicitud({ ahora: AHORA }));
    expect(await prisma.intentoDeCupo.count()).toBe(1);
    await apartarCupoCompartido(prisma, solicitud({ ahora: enMinutos(60) }));
    // El viejo se fue con el nuevo: queda uno, no dos.
    expect(await prisma.intentoDeCupo.count()).toBe(1);
  });

  it("sin procedencia no hay a quién contarle nada: se concede", async () => {
    const base = solicitud({ ip: null });
    for (let i = 0; i < MAXIMO * 4; i += 1) {
      expect(await apartarCupoCompartido(prisma, base)).toBe(true);
    }
    expect(await cupoCompartidoAgotado(prisma, base)).toBe(false);
    expect(await prisma.intentoDeCupo.count()).toBe(0);
  });
});

describe("cupos compartidos · lo que se guarda no es la IP", () => {
  it("la clave es un HMAC: no contiene la IP y depende del secreto", async () => {
    await apartarCupoCompartido(prisma, solicitud());
    const [fila] = await prisma.intentoDeCupo.findMany();

    expect(fila.clave).not.toContain(IP);
    expect(fila.clave).toMatch(/^[0-9a-f]{32}$/);
    expect(claveDeCupo("cupo-de-prueba", IP, SECRETO)).toBe(fila.clave);
    // Rotar el secreto invalida el histórico entero, que es lo que se quiere.
    expect(claveDeCupo("cupo-de-prueba", IP, "otro-secreto")).not.toBe(fila.clave);
  });

  it("sin secreto NO se escribe nada en la base: se cuenta en memoria", async () => {
    const respaldo = crearCupoPorIp({ maximo: MAXIMO, ventanaMs: VENTANA_MS });
    const base = solicitud({ secreto: "  ", respaldo });

    for (let i = 0; i < MAXIMO; i += 1) {
      expect(await apartarCupoCompartido(prisma, base)).toBe(true);
    }
    expect(await apartarCupoCompartido(prisma, base)).toBe(false);
    expect(await prisma.intentoDeCupo.count()).toBe(0);
  });

  it("la fila guarda solo la clave y la hora: ninguna columna del visitante", async () => {
    await apartarCupoCompartido(prisma, solicitud());
    const [fila] = await prisma.intentoDeCupo.findMany();
    expect(Object.keys(fila).sort()).toEqual(["clave", "id", "ocurrioEn"]);
  });
});

describe("cupos compartidos · si la base no responde, el límite no desaparece", () => {
  /** Un cliente que siempre falla, como una base caída. */
  const baseCaida = {
    $transaction: () => Promise.reject(new Error("base caída")),
    intentoDeCupo: { deleteMany: () => Promise.reject(new Error("base caída")) },
  } as unknown as ClienteCupos;

  it("cae al contador en memoria y lo dice UNA vez, como error", async () => {
    const errores = vi.spyOn(console, "error").mockImplementation(() => {});
    const respaldo = crearCupoPorIp({ maximo: MAXIMO, ventanaMs: VENTANA_MS });
    const base = solicitud({ respaldo });

    for (let i = 0; i < MAXIMO; i += 1) {
      expect(await apartarCupoCompartido(baseCaida, base)).toBe(true);
    }
    // El límite SIGUE operando, aunque más flojo (por instancia).
    expect(await apartarCupoCompartido(baseCaida, base)).toBe(false);
    expect(await cupoCompartidoAgotado(baseCaida, base)).toBe(true);

    expect(errores).toHaveBeenCalledTimes(1);
    const dicho = String(errores.mock.calls[0][0]);
    expect(dicho).toContain("memoria");
    expect(dicho).not.toContain(IP);
  });

  it("mientras la base sí responde, el respaldo se mantiene caliente", async () => {
    // Para que una caída a media fuerza bruta no arranque el conteo de cero.
    const respaldo = crearCupoPorIp({ maximo: MAXIMO, ventanaMs: VENTANA_MS });
    const base = solicitud({ respaldo });
    for (let i = 0; i < MAXIMO; i += 1) await apartarCupoCompartido(prisma, base);

    expect(respaldo.bloqueada(IP, AHORA)).toBe(true);
  });
});

// ── Retención: la tarea diaria recoge lo que el conteo deja atrás ───────────

describe("cupos compartidos · retención y cota (hallazgo R1)", () => {
  /** Deja `cuantas` marcas de una clave inventada, con la fecha que se pida. */
  async function marcas(cuantas: number, ocurrioEn: Date, prefijo = "r1") {
    await prisma.intentoDeCupo.createMany({
      data: Array.from({ length: cuantas }, (_, i) => ({
        clave: `${prefijo}${String(i).padStart(30, "0")}`,
        ocurrioEn,
      })),
    });
  }

  it("la ventana más larga que el sistema usa cabe dentro de la retención", () => {
    // El invariante que hace segura la limpieza: si algún cupo tuviera una
    // ventana MAYOR que el horizonte de retención, la tarea diaria le borraría
    // marcas todavía vigentes y lo debilitaría en silencio.
    expect(VENTANA_INTENTOS_ACCESO_MS).toBeLessThan(RETENCION_MAXIMA_DE_CUPOS_MS);
  });

  it("borra lo que ya salió de la retención y respeta lo reciente", async () => {
    await marcas(3, new Date(AHORA.getTime() - 30 * 24 * 60 * 60 * 1000), "vieja");
    await marcas(2, new Date(AHORA.getTime() - 60_000), "nueva");

    const resultado = await limpiarCuposCaducados(prisma, { ahora: AHORA });

    expect(resultado).toEqual({ caducadas: 3, podadas: 0 });
    expect(await prisma.intentoDeCupo.count()).toBe(2);
  });

  it("por encima del techo poda las MÁS VIEJAS y deja el techo exacto", async () => {
    // Con el techo real serían 5000 filas; se prueba la lógica con uno chico.
    const reciente = new Date(AHORA.getTime() - 1_000);
    const menosReciente = new Date(AHORA.getTime() - 2_000);
    await marcas(3, menosReciente, "antigua");
    await marcas(2, reciente, "moderna");

    const resultado = await limpiarCuposCaducados(prisma, {
      ahora: AHORA,
      maximoFilas: 2,
    });

    expect(resultado).toEqual({ caducadas: 0, podadas: 3 });
    const quedan = await prisma.intentoDeCupo.findMany();
    expect(quedan).toHaveLength(2);
    expect(quedan.every((fila) => fila.clave.startsWith("moderna"))).toBe(true);
  });

  it("por debajo del techo no poda nada", async () => {
    await marcas(2, new Date(AHORA.getTime() - 1_000));
    expect(await limpiarCuposCaducados(prisma, { ahora: AHORA })).toEqual({
      caducadas: 0,
      podadas: 0,
    });
    expect(await prisma.intentoDeCupo.count()).toBe(2);
  });

  it("el techo es el mismo número que tenía el contador en memoria", () => {
    // Paridad declarada: allá eran IPs distintas y aquí son FILAS, así que este
    // es el más estricto de los dos.
    expect(MAX_FILAS_DE_CUPOS).toBe(MAX_IPS_RASTREADAS);
  });

  it("informa conteos, sin una sola clave", async () => {
    await marcas(1, new Date(AHORA.getTime() - 30 * 24 * 60 * 60 * 1000), "secreta");
    const resultado = await limpiarCuposCaducados(prisma, { ahora: AHORA });
    expect(Object.keys(resultado).sort()).toEqual(["caducadas", "podadas"]);
    expect(JSON.stringify(resultado)).not.toContain("secreta");
  });
});
