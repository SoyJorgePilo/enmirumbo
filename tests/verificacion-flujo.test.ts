import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  confirmarCodigo,
  gastaIntento,
  pedirCodigoParaFicha,
  reenviarCodigo,
  type ContextoVerificacion,
  type FichaParaVerificar,
} from "../src/lib/verificacion/flujo";
import {
  CODIGOS_POR_IP_POR_HORA,
  MAX_REENVIOS_POR_REGISTRO,
  reiniciarCupoDeCodigos,
  reiniciarTopeDiario,
  reiniciarTopesPorRegistro,
} from "../src/lib/verificacion/limites";
import { crearPasoInicial, type PasoVerificacion } from "../src/lib/verificacion/paso";
import {
  crearProveedorSimulado,
  type ProveedorSimulado,
} from "../src/lib/verificacion/proveedor";
import { crearClientePrueba } from "./db";

/**
 * Spec `registro-negocio` (T-016) · Requirements "Con la bandera encendida, el
 * registro se guarda antes de pedir el código", "La pantalla 'Confirma tu
 * número'…" y "El canal de SMS cuesta dinero…" (tasks.md #9, #11 y #12).
 *
 * Todo con el adaptador SIMULADO: cero red, cero credenciales.
 *
 * Datos 100% ficticios (repo público + LFPDPPP): serie de pruebas 771998xxxx.
 */

const IP = "203.0.113.55"; // TEST-NET-3
const AHORA = new Date("2026-09-04T12:00:00.000Z");
const SECRETO = "secreto-de-pruebas-de-32-caracteres-o-mas";
const PREFIJO = "771998";

let prisma: PrismaClient;
let categoriaId: number;
let proveedor: ProveedorSimulado;

function contexto(cambios: Partial<ContextoVerificacion> = {}): ContextoVerificacion {
  return {
    proveedor,
    cupos: prisma,
    secreto: SECRETO,
    topeDiario: 50,
    ip: IP,
    ahora: AHORA,
    ...cambios,
  };
}

async function crearFicha(
  whatsapp: string,
  numeroVerificadoEn: Date | null = null,
): Promise<FichaParaVerificar> {
  const negocio = await prisma.negocio.create({
    data: {
      nombre: "Tortillería Ficticia La Masa Alegre",
      categoriaId,
      whatsapp,
      consintioAvisoEn: AHORA,
      numeroVerificadoEn,
    },
    select: { id: true },
  });
  return { id: negocio.id, whatsapp, yaVerificado: numeroVerificadoEn !== null };
}

beforeAll(async () => {
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (
    await prisma.categoria.findUniqueOrThrow({ where: { slug: "servicios-del-hogar" } })
  ).id;
});

beforeEach(async () => {
  reiniciarCupoDeCodigos();
  reiniciarTopeDiario();
  reiniciarTopesPorRegistro();
  await prisma.intentoDeCupo.deleteMany({});
  proveedor = crearProveedorSimulado();
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
});

afterEach(() => vi.restoreAllMocks());

afterAll(async () => {
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
  await prisma.$disconnect();
});

describe("registro-negocio · cuándo se pide el código y cuándo no", () => {
  // Scenario: registro exitoso con la verificación encendida
  it("con todo en orden se pide el código y sale el paso hacia la pantalla", async () => {
    const ficha = await crearFicha(`${PREFIJO}0001`);
    const paso = await pedirCodigoParaFicha(ficha, contexto());

    expect(paso).not.toBeNull();
    expect(paso?.negocioId).toBe(ficha.id);
    expect(paso?.ultimosCuatroDigitos).toBe("0001");
    expect(proveedor.iniciados).toEqual([ficha.whatsapp]);

    // La ficha sigue exactamente como estaba: verificar no es publicar.
    const guardada = await prisma.negocio.findUniqueOrThrow({ where: { id: ficha.id } });
    expect(guardada.estado).toBe("en_revision");
    expect(guardada.numeroVerificadoEn).toBeNull();
    expect(guardada.publicadoEn).toBeNull();
  });

  // Scenario: sin configuración, el sitio de hoy / apagar la bandera devuelve
  // el flujo de siempre
  it("sin proveedor (capacidad apagada) no se pide nada", async () => {
    const ficha = await crearFicha(`${PREFIJO}0002`);
    expect(await pedirCodigoParaFicha(ficha, contexto({ proveedor: null }))).toBeNull();
  });

  // Scenario: el formulario no sirve para mandarle mensajes a un tercero /
  // no se puede pedir un SMS sin registro
  it("sin ficha detrás (campo trampa o duplicado) no se manda ningún SMS", async () => {
    expect(await pedirCodigoParaFicha(null, contexto())).toBeNull();
    expect(proveedor.iniciados).toEqual([]);
  });

  // Scenario: el reenvío conserva la verificación del número
  it("una ficha ya verificada no vuelve a pedir código", async () => {
    const ficha = await crearFicha(`${PREFIJO}0003`, AHORA);
    expect(await pedirCodigoParaFicha(ficha, contexto())).toBeNull();
    expect(proveedor.iniciados).toEqual([]);
  });

  // Scenario: el registro existe aunque el SMS no salga
  it.each(["rechazado-por-el-proveedor", "error"] as const)(
    "si el proveedor responde %s, el registro queda igual y no hay paso",
    async (respuesta) => {
      proveedor = crearProveedorSimulado({ alIniciar: respuesta });
      const ficha = await crearFicha(`${PREFIJO}0004`);
      expect(await pedirCodigoParaFicha(ficha, contexto())).toBeNull();

      const guardada = await prisma.negocio.findUniqueOrThrow({ where: { id: ficha.id } });
      expect(guardada.estado).toBe("en_revision");
      expect(guardada.numeroVerificadoEn).toBeNull();
    },
  );

  // Scenario: cupo por IP agotado
  it("con el cupo por IP agotado el registro se guarda igual y no hay paso", async () => {
    for (let i = 0; i < CODIGOS_POR_IP_POR_HORA; i += 1) {
      await pedirCodigoParaFicha(await crearFicha(`${PREFIJO}01${i}0`), contexto());
    }
    const cuarta = await crearFicha(`${PREFIJO}0199`);
    expect(await pedirCodigoParaFicha(cuarta, contexto())).toBeNull();
    expect(proveedor.iniciados).toHaveLength(CODIGOS_POR_IP_POR_HORA);
  });

  // Scenario: tope diario alcanzado
  it("con el tope diario alcanzado deja de pedir códigos y avisa una vez", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const chico = contexto({ topeDiario: 2 });
    for (let i = 0; i < 2; i += 1) {
      await pedirCodigoParaFicha(await crearFicha(`${PREFIJO}02${i}0`), chico);
    }
    const tercera = await crearFicha(`${PREFIJO}0299`);
    expect(await pedirCodigoParaFicha(tercera, chico)).toBeNull();
    expect(proveedor.iniciados).toHaveLength(2);
    expect(
      aviso.mock.calls.filter((llamada) => llamada.join(" ").includes("tope diario")),
    ).toHaveLength(1);
  });

  // Scenario: sin encabezado de IP declarado
  it("sin IP declarada el cupo no aplica y el resto de cotas sigue", async () => {
    const sinIp = contexto({ ip: null });
    for (let i = 0; i < 6; i += 1) {
      const paso = await pedirCodigoParaFicha(await crearFicha(`${PREFIJO}03${i}0`), sinIp);
      expect(paso, `envío ${i + 1}`).not.toBeNull();
    }
  });
});

describe("registro-negocio · confirmar el código", () => {
  let ficha: FichaParaVerificar;
  let paso: PasoVerificacion;

  beforeEach(async () => {
    ficha = await crearFicha(`${PREFIJO}0500`);
    paso = crearPasoInicial(ficha.id, ficha.whatsapp, AHORA);
  });

  // Scenario: código correcto / verificar no publica
  it("el código correcto escribe la fecha y NO publica la ficha", async () => {
    proveedor = crearProveedorSimulado({ alComprobar: "confirmado" });
    expect(await confirmarCodigo(prisma, paso, "123456", contexto())).toEqual({
      resultado: "confirmado",
    });

    const guardada = await prisma.negocio.findUniqueOrThrow({ where: { id: ficha.id } });
    expect(guardada.numeroVerificadoEn?.toISOString()).toBe(AHORA.toISOString());
    expect(guardada.estado).toBe("en_revision");
    expect(guardada.publicadoEn).toBeNull();
    expect(guardada.origen).toBe("organico");
    // El número entero se le manda al proveedor, no un trozo.
    expect(proveedor.comprobados).toEqual([{ numero: ficha.whatsapp, codigo: "123456" }]);
  });

  // Scenario: código equivocado
  it("un código que no coincide deja la ficha sin verificar", async () => {
    proveedor = crearProveedorSimulado({ alComprobar: "no-coincide" });
    expect(await confirmarCodigo(prisma, paso, "111111", contexto())).toEqual({
      resultado: "no-coincide",
    });
    const guardada = await prisma.negocio.findUniqueOrThrow({ where: { id: ficha.id } });
    expect(guardada.numeroVerificadoEn).toBeNull();
  });

  // Scenario: código incompleto
  it.each(["", "1234", "12345678", "12 34 56", "abcdef", "12345a", "١٢٣٤٥٦"])(
    "el campo %j ni siquiera llega al proveedor",
    async (codigo) => {
      expect(await confirmarCodigo(prisma, paso, codigo, contexto())).toEqual({
        resultado: "incompleto",
      });
      expect(proveedor.comprobados).toEqual([]);
    },
  );

  it("un código vencido se distingue de uno equivocado", async () => {
    proveedor = crearProveedorSimulado({ alComprobar: "vencido" });
    expect(await confirmarCodigo(prisma, paso, "000000", contexto())).toEqual({
      resultado: "vencido",
    });
  });

  // Scenario: el error del proveedor no se filtra
  it("un error del proveedor se traduce a un desenlace propio, sin detalles", async () => {
    proveedor = crearProveedorSimulado({ alComprobar: "error" });
    const resultado = await confirmarCodigo(prisma, paso, "123456", contexto());
    expect(resultado).toEqual({ resultado: "error-proveedor" });
    // El desenlace es un literal cerrado nuestro: nada del proveedor viaja.
    expect(JSON.stringify(resultado)).not.toMatch(/twilio|http|\d{3}/i);
  });

  it("qué gasta uno de los 5 intentos y qué no", () => {
    expect(gastaIntento("no-coincide")).toBe(true);
    expect(gastaIntento("vencido")).toBe(true);
    // Un campo que ni se le mandó al proveedor, y una falla que no es del
    // dueño, no le cuestan un intento.
    expect(gastaIntento("incompleto")).toBe(false);
    expect(gastaIntento("error-proveedor")).toBe(false);
    expect(gastaIntento("confirmado")).toBe(false);
  });

  it("confirmar dos veces no pisa la fecha original ni cuesta otra consulta", async () => {
    proveedor = crearProveedorSimulado({ alComprobar: "confirmado" });
    await confirmarCodigo(prisma, paso, "123456", contexto());
    const despues = new Date(AHORA.getTime() + 60_000);
    await confirmarCodigo(prisma, paso, "123456", contexto({ ahora: despues }));

    const guardada = await prisma.negocio.findUniqueOrThrow({ where: { id: ficha.id } });
    expect(guardada.numeroVerificadoEn?.toISOString()).toBe(AHORA.toISOString());
    // La segunda vez ni se le pregunta al proveedor: ya era cierto.
    expect(proveedor.comprobados).toHaveLength(1);
  });

  it("una credencial de paso de una ficha que ya no existe no confirma nada", async () => {
    const huerfano = crearPasoInicial("no-existe-esta-ficha", `${PREFIJO}0999`, AHORA);
    expect(await confirmarCodigo(prisma, huerfano, "123456", contexto())).toEqual({
      resultado: "sin-ficha",
    });
    expect(proveedor.comprobados).toEqual([]);
  });
});

describe("registro-negocio · reenviar el código", () => {
  let ficha: FichaParaVerificar;
  let paso: PasoVerificacion;

  beforeEach(async () => {
    ficha = await crearFicha(`${PREFIJO}0600`);
    // El PRIMER envío, el que sale del formulario: deja el paso puesto y —
    // desde el hallazgo [C-2]— aparta también el turno de envío de 60 s, así
    // que un reenvío inmediato tiene que chocar con la espera.
    paso = (await pedirCodigoParaFicha(ficha, contexto()))!;
    expect(paso).not.toBeNull();
    proveedor.iniciados.length = 0;
  });

  it("un reenvío legítimo (pasado el cooldown) sale", async () => {
    const luego = new Date(AHORA.getTime() + 61_000);
    const resultado = await reenviarCodigo(prisma, paso, contexto({ ahora: luego }));
    expect(resultado.resultado).toBe("enviado");
    expect(proveedor.iniciados).toEqual([ficha.whatsapp]);
  });

  // Scenario: reenviar demasiado pronto
  it("antes de los 60 segundos no sale ningún SMS", async () => {
    const pronto = new Date(AHORA.getTime() + 59_000);
    expect(await reenviarCodigo(prisma, paso, contexto({ ahora: pronto }))).toEqual({
      resultado: "espera-reenvio",
    });
    expect(proveedor.iniciados).toEqual([]);
  });

  it("el tercer reenvío se acabó: agotado (y el conteo lo lleva el servidor)", async () => {
    // Se gastan los dos reenvíos de verdad, cada uno pasado su cooldown.
    for (let i = 0; i < MAX_REENVIOS_POR_REGISTRO; i += 1) {
      const cuando = new Date(AHORA.getTime() + (i + 1) * 61_000);
      expect(
        (await reenviarCodigo(prisma, paso, contexto({ ahora: cuando }))).resultado,
        `reenvío ${i + 1}`,
      ).toBe("enviado");
    }
    proveedor.iniciados.length = 0;

    // Y el tercero se corta AUNQUE se presente la credencial del principio:
    // rebobinarla ya no revive nada (hallazgo [C-2]).
    const luego = new Date(AHORA.getTime() + 600_000);
    expect(await reenviarCodigo(prisma, paso, contexto({ ahora: luego }))).toEqual({
      resultado: "agotado",
    });
    expect(proveedor.iniciados).toEqual([]);
  });

  // Scenario: cupo por IP agotado (en la pantalla del código sí se dice)
  it("con el cupo por IP agotado el reenvío responde 'cupo'", async () => {
    const luego = new Date(AHORA.getTime() + 61_000);
    for (let i = 0; i < CODIGOS_POR_IP_POR_HORA; i += 1) {
      await pedirCodigoParaFicha(await crearFicha(`${PREFIJO}06${i}1`), contexto());
    }
    expect(await reenviarCodigo(prisma, paso, contexto({ ahora: luego }))).toEqual({
      resultado: "cupo",
    });
  });

  it("machacar el botón dentro del cooldown no gasta cupo por IP", async () => {
    for (let i = 0; i < 10; i += 1) {
      await reenviarCodigo(prisma, paso, contexto({ ahora: new Date(AHORA.getTime() + 1_000) }));
    }
    expect(proveedor.iniciados).toEqual([]);
    // Los dos códigos que le quedan al cupo por IP siguen intactos (el primer
    // envío de esta ficha ya gastó uno de los tres).
    const ficha2 = await crearFicha(`${PREFIJO}0699`);
    expect(await pedirCodigoParaFicha(ficha2, contexto())).not.toBeNull();
  });

  it("si el proveedor falla, el reenvío SÍ se gasta (iteración 2, [C-2])", async () => {
    // Cambió respecto de la iteración 1: devolver el reenvío convertía un
    // proveedor caído en reintentos gratis contra el canal que cuesta dinero.
    // Entre la comodidad del dueño y el saldo del fundador, se protege el saldo.
    proveedor = crearProveedorSimulado({ alIniciar: "error" });
    const luego = new Date(AHORA.getTime() + 61_000);
    expect(await reenviarCodigo(prisma, paso, contexto({ ahora: luego }))).toEqual({
      resultado: "espera-reenvio",
    });
    const masLuego = new Date(AHORA.getTime() + 122_000);
    expect(await reenviarCodigo(prisma, paso, contexto({ ahora: masLuego }))).toEqual({
      resultado: "espera-reenvio",
    });
    // Gastados los dos, el siguiente ya es "agotado".
    const aunMasLuego = new Date(AHORA.getTime() + 183_000);
    expect(await reenviarCodigo(prisma, paso, contexto({ ahora: aunMasLuego }))).toEqual({
      resultado: "agotado",
    });
  });

  it("un paso de una ficha que ya no existe no manda ningún SMS", async () => {
    const huerfano = crearPasoInicial("no-existe-esta-ficha", `${PREFIJO}0999`, AHORA);
    const luego = new Date(AHORA.getTime() + 61_000);
    expect(await reenviarCodigo(prisma, huerfano, contexto({ ahora: luego }))).toEqual({
      resultado: "sin-ficha",
    });
    expect(proveedor.iniciados).toEqual([]);
  });

  // Hallazgo [C-2], el ataque concreto: reusar la credencial del principio.
  it("[C-2] rebobinar la credencial NO revive los reenvíos ni el cooldown", async () => {
    const credencialDelPrincipio = { ...paso };
    let enviados = 0;
    // 20 intentos presentando SIEMPRE la primera cookie, cada uno pasado un
    // cooldown de sobra para que la espera no sea lo que corte.
    for (let i = 0; i < 20; i += 1) {
      const cuando = new Date(AHORA.getTime() + (i + 1) * 61_000);
      const resultado = await reenviarCodigo(
        prisma,
        credencialDelPrincipio,
        contexto({ ahora: cuando }),
      );
      if (resultado.resultado === "enviado") enviados += 1;
    }
    expect(enviados).toBe(MAX_REENVIOS_POR_REGISTRO);
    expect(proveedor.iniciados).toHaveLength(MAX_REENVIOS_POR_REGISTRO);
  });
});
