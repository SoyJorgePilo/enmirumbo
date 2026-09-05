import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => {
  const simulado = await import("./admin-mocks");
  return { cookies: simulado.cookies, headers: simulado.headers };
});
vi.mock("next/navigation", async () => {
  const simulado = await import("./admin-mocks");
  return { redirect: simulado.redirect, notFound: simulado.notFound };
});

import { seedCatalogos } from "../prisma/seed";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  ejecutarConfirmacion,
  ejecutarReenvio,
  type DependenciasVerificacion,
} from "../src/lib/verificacion/acciones";
import {
  CODIGOS_POR_IP_POR_HORA,
  CUPO_INTENTOS_POR_REGISTRO,
  MAX_INTENTOS_POR_REGISTRO,
  MAX_REENVIOS_POR_REGISTRO,
  apartarCupoDeCodigos,
  apartarEnvioSeguido,
  intentosDelRegistroAgotados,
  reiniciarCupoDeCodigos,
  reiniciarTopeDiario,
  reiniciarTopesPorRegistro,
} from "../src/lib/verificacion/limites";
import { claveDeCupo } from "../src/lib/cupos/compartido";
import {
  COOKIE_PASO,
  crearPasoInicial,
  firmarPaso,
  type PasoVerificacion,
} from "../src/lib/verificacion/paso";
import {
  crearProveedorSimulado,
  type ProveedorSimulado,
  type ResultadoComprobar,
  type ResultadoIniciar,
} from "../src/lib/verificacion/proveedor";
import {
  NoEncontradoSimulado,
  peticion,
  reiniciarPeticion,
  urlDeRedireccion,
} from "./admin-mocks";
import { crearClientePrueba } from "./db";

/**
 * Spec `registro-negocio` (T-016) · las dos Server Actions de
 * `/registro/verificar` (tasks.md #11 y #12), con el request de Next.js
 * simulado (`tests/admin-mocks.ts`): la cookie que se firma, la que se lee y
 * las consultas a la base son las de producción; solo el proveedor es el
 * adaptador simulado, así que ninguna prueba manda un SMS.
 *
 * Datos 100% ficticios (repo público + LFPDPPP): serie de pruebas 771997xxxx.
 */

const SECRETO = "secreto-de-pruebas-de-32-caracteres-o-mas";
const IP = "203.0.113.66"; // TEST-NET-3
const AHORA = new Date("2026-09-04T12:00:00.000Z");
const PREFIJO = "771997";

let prisma: PrismaClient;
let categoriaId: number;
let proveedor: ProveedorSimulado;

function dependencias(cambios: Partial<DependenciasVerificacion> = {}): DependenciasVerificacion {
  return {
    prisma,
    contexto: { proveedor, cupos: prisma, secreto: SECRETO, topeDiario: 50, ip: IP, ahora: AHORA },
    esHttps: false,
    ...cambios,
  };
}

async function crearFicha(whatsapp: string): Promise<string> {
  const negocio = await prisma.negocio.create({
    data: {
      nombre: "Estética Ficticia Tijeras de Mentira",
      categoriaId,
      whatsapp,
      consintioAvisoEn: AHORA,
    },
    select: { id: true },
  });
  return negocio.id;
}

/** Deja puesta en el "navegador" la cookie de paso firmada de este paso. */
function ponerCookie(paso: PasoVerificacion): void {
  peticion.cookies[COOKIE_PASO] = firmarPaso(paso, SECRETO);
}

/** Los topes por registro de esta ficha, tal como los ve el servidor. */
function topesDelRegistro(negocioId: string) {
  return { cupos: prisma, negocioId, secreto: SECRETO, ahora: AHORA };
}

/** Cuántos intentos lleva apuntados el servidor para esta ficha. */
async function intentosGastados(negocioId: string): Promise<number> {
  return prisma.intentoDeCupo.count({
    where: { clave: claveDeCupo(CUPO_INTENTOS_POR_REGISTRO, negocioId, SECRETO) },
  });
}

function cookieBorrada(): boolean {
  return peticion.puestas.some((c) => c.nombre === COOKIE_PASO && c.opciones.maxAge === 0);
}

const conCodigo = (codigo: string) => {
  const formData = new FormData();
  formData.set("codigo", codigo);
  return formData;
};

beforeAll(async () => {
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (
    await prisma.categoria.findUniqueOrThrow({ where: { slug: "servicios-del-hogar" } })
  ).id;
});

beforeEach(async () => {
  reiniciarPeticion();
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

describe("registro-negocio · confirmar el código desde la acción", () => {
  let id: string;
  let paso: PasoVerificacion;

  beforeEach(async () => {
    id = await crearFicha(`${PREFIJO}0001`);
    paso = crearPasoInicial(id, `${PREFIJO}0001`, AHORA);
    ponerCookie(paso);
  });

  // Scenario: código correcto
  it("el código correcto lleva a gracias con la bandera de confirmación", async () => {
    proveedor = crearProveedorSimulado({ alComprobar: "confirmado" });
    const destino = await urlDeRedireccion(() =>
      ejecutarConfirmacion(conCodigo("123456"), dependencias()),
    );
    expect(destino).toBe("/registro/gracias?verificado=1");
    expect(cookieBorrada()).toBe(true);

    const guardada = await prisma.negocio.findUniqueOrThrow({ where: { id } });
    expect(guardada.numeroVerificadoEn).not.toBeNull();
    expect(guardada.estado).toBe("en_revision");
  });

  // Scenario: nada sensible en la URL
  it.each<[ResultadoComprobar, string]>([
    ["no-coincide", "no-coincide"],
    ["vencido", "vencido"],
    ["error", "proveedor"],
  ])("con %s vuelve a la pantalla con su código de error, y nada más", async (respuesta, codigo) => {
    proveedor = crearProveedorSimulado({ alComprobar: respuesta });
    const destino = await urlDeRedireccion(() =>
      ejecutarConfirmacion(conCodigo("654321"), dependencias()),
    );
    expect(destino).toBe(`/registro/verificar?error=${codigo}`);
    // Ni el código escrito, ni el número, ni el identificador de la ficha.
    expect(destino).not.toContain("654321");
    expect(destino).not.toContain(id);
    expect(destino).not.toContain(PREFIJO);
  });

  // Scenario: código incompleto
  it("un campo incompleto no llega al proveedor ni gasta intento", async () => {
    const destino = await urlDeRedireccion(() =>
      ejecutarConfirmacion(conCodigo("1234"), dependencias()),
    );
    expect(destino).toBe("/registro/verificar?error=incompleto");
    expect(proveedor.comprobados).toEqual([]);
    // Los intentos se cuentan en el servidor (hallazgo [C-2]): ninguno gastado.
    expect(await intentosDelRegistroAgotados(topesDelRegistro(id))).toBe(false);
    expect(await intentosGastados(id)).toBe(0);
  });

  it("un código que ni siquiera es texto (un archivo colado) es incompleto", async () => {
    const formData = new FormData();
    formData.set("codigo", new File(["123456"], "codigo.txt", { type: "text/plain" }));
    const destino = await urlDeRedireccion(() => ejecutarConfirmacion(formData, dependencias()));
    expect(destino).toBe("/registro/verificar?error=incompleto");
    expect(proveedor.comprobados).toEqual([]);
  });

  it("un código equivocado gasta uno de los cinco intentos", async () => {
    proveedor = crearProveedorSimulado({ alComprobar: "no-coincide" });
    await urlDeRedireccion(() => ejecutarConfirmacion(conCodigo("111111"), dependencias()));
    expect(await intentosGastados(id)).toBe(1);
  });

  it("una falla del proveedor NO gasta intento", async () => {
    proveedor = crearProveedorSimulado({ alComprobar: "error" });
    await urlDeRedireccion(() => ejecutarConfirmacion(conCodigo("111111"), dependencias()));
    expect(await intentosGastados(id)).toBe(0);
  });

  // Scenario: se acaban los intentos
  it("al quinto fallo va a gracias con el aviso y ya no se puede pedir más", async () => {
    proveedor = crearProveedorSimulado({ alComprobar: "no-coincide" });
    let destino = "";
    // Se presenta SIEMPRE la misma cookie: el conteo ya no vive en ella, así
    // que rebobinarla no revive ningún intento (hallazgo [C-2]).
    for (let i = 0; i < MAX_INTENTOS_POR_REGISTRO; i += 1) {
      destino = await urlDeRedireccion(() =>
        ejecutarConfirmacion(conCodigo("111111"), dependencias()),
      );
    }
    expect(destino).toBe("/registro/gracias?agotado=1");
    expect(cookieBorrada()).toBe(true);

    const guardada = await prisma.negocio.findUniqueOrThrow({ where: { id } });
    expect(guardada.numeroVerificadoEn).toBeNull();
  });

  // Scenario: la pantalla no se abre de a gratis
  it.each([
    ["sin cookie", () => delete peticion.cookies[COOKIE_PASO]],
    ["con la cookie alterada", () => (peticion.cookies[COOKIE_PASO] += "x")],
    [
      "con la cookie firmada con otro secreto",
      () => (peticion.cookies[COOKIE_PASO] = firmarPaso(crearPasoInicial("otra", "7719990000", AHORA), "otro-secreto-de-pruebas-de-32-caracteres")),
    ],
    ["con basura en la cookie", () => (peticion.cookies[COOKIE_PASO] = "no.soy")],
  ])("un POST directo %s responde no encontrado", async (_caso, preparar) => {
    preparar();
    await expect(ejecutarConfirmacion(conCodigo("123456"), dependencias())).rejects.toBeInstanceOf(
      NoEncontradoSimulado,
    );
    expect(proveedor.comprobados).toEqual([]);
  });

  // Fail-safe: con la capacidad apagada la acción no existe.
  it("sin dependencias (capacidad apagada) responde no encontrado", async () => {
    await expect(ejecutarConfirmacion(conCodigo("123456"), null)).rejects.toBeInstanceOf(
      NoEncontradoSimulado,
    );
  });

  it("una cookie caducada no confirma nada", async () => {
    const tarde = new Date(AHORA.getTime() + 16 * 60 * 1000);
    await expect(
      ejecutarConfirmacion(
        conCodigo("123456"),
        dependencias({ contexto: { ...dependencias().contexto, ahora: tarde } }),
      ),
    ).rejects.toBeInstanceOf(NoEncontradoSimulado);
  });

  it("la cookie que se borra es HttpOnly, con Path acotado y sin Secure fuera de HTTPS", async () => {
    proveedor = crearProveedorSimulado({ alComprobar: "confirmado" });
    await urlDeRedireccion(() => ejecutarConfirmacion(conCodigo("123456"), dependencias()));
    const puesta = peticion.puestas.at(-1)!;
    expect(puesta.opciones).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/registro/verificar",
      secure: false,
    });
    expect(puesta.valor).not.toContain("123456");
  });

  it("un fallo NO reescribe la cookie: ya no lleva nada que actualizar", async () => {
    proveedor = crearProveedorSimulado({ alComprobar: "no-coincide" });
    await urlDeRedireccion(() => ejecutarConfirmacion(conCodigo("111111"), dependencias()));
    expect(peticion.puestas).toEqual([]);
  });
});

describe("registro-negocio · reenviar el código desde la acción", () => {
  let id: string;
  let paso: PasoVerificacion;

  beforeEach(async () => {
    id = await crearFicha(`${PREFIJO}0002`);
    paso = crearPasoInicial(id, `${PREFIJO}0002`, AHORA);
    ponerCookie(paso);
  });

  const enMs = (ms: number) => new Date(AHORA.getTime() + ms);
  const conReloj = (ms: number) =>
    dependencias({ contexto: { ...dependencias().contexto, ahora: enMs(ms) } });

  it("un reenvío legítimo vuelve a la pantalla, limpia y sin reescribir la cookie", async () => {
    const destino = await urlDeRedireccion(() => ejecutarReenvio(conReloj(61_000)));
    expect(destino).toBe("/registro/verificar");
    expect(proveedor.iniciados).toEqual([`${PREFIJO}0002`]);
    // La cookie ya no lleva contadores: no hay nada que reescribir.
    expect(peticion.puestas).toEqual([]);
  });

  // Scenario: reenviar demasiado pronto
  it("antes de los 60 segundos responde con el aviso de espera y no manda SMS", async () => {
    // El primer envío (el del formulario) ya apartó el turno de 60 s.
    await apartarEnvioSeguido(topesDelRegistro(id));
    const destino = await urlDeRedireccion(() => ejecutarReenvio(conReloj(30_000)));
    expect(destino).toBe("/registro/verificar?errorReenvio=espera-reenvio");
    expect(proveedor.iniciados).toEqual([]);
  });

  it("el tercer reenvío manda a gracias con el aviso de intentos agotados", async () => {
    for (let i = 0; i < MAX_REENVIOS_POR_REGISTRO; i += 1) {
      await urlDeRedireccion(() => ejecutarReenvio(conReloj((i + 1) * 61_000)));
    }
    proveedor.iniciados.length = 0;
    const destino = await urlDeRedireccion(() => ejecutarReenvio(conReloj(600_000)));
    expect(destino).toBe("/registro/gracias?agotado=1");
    expect(cookieBorrada()).toBe(true);
    expect(proveedor.iniciados).toEqual([]);
  });

  it("con el cupo por IP agotado responde 'cupo' y no manda SMS", async () => {
    // Se agota el cupo de 3 códigos/hora de esta IP con OTRAS fichas, para que
    // lo que corte aquí sea el cupo por IP y no el tope de 2 reenvíos.
    for (let i = 0; i < CODIGOS_POR_IP_POR_HORA; i += 1) {
      expect(apartarCupoDeCodigos(IP, AHORA), `cupo ${i + 1}`).toBe(true);
    }
    const destino = await urlDeRedireccion(() => ejecutarReenvio(conReloj(61_000)));
    expect(destino).toBe("/registro/verificar?errorReenvio=cupo");
    expect(proveedor.iniciados).toEqual([]);
  });

  it.each<ResultadoIniciar>(["error", "rechazado-por-el-proveedor"])(
    "si el proveedor responde %s, el dueño ve el aviso de espera",
    async (respuesta) => {
      proveedor = crearProveedorSimulado({ alIniciar: respuesta });
      const destino = await urlDeRedireccion(() => ejecutarReenvio(conReloj(61_000)));
      expect(destino).toBe("/registro/verificar?errorReenvio=espera-reenvio");
    },
  );

  // Hallazgo [C-2]: el ataque concreto, desde la Server Action.
  it("[C-2] reusar la cookie del principio no revive los reenvíos", async () => {
    let enviados = 0;
    // 10 vueltas de 61 s = 610 s, dentro de los 15 min de la credencial (pasados
    // esos, caduca sola y la acción responde 404, que también corta).
    for (let i = 0; i < 10; i += 1) {
      ponerCookie(paso); // SIEMPRE la primera
      const destino = await urlDeRedireccion(() => ejecutarReenvio(conReloj((i + 1) * 61_000)));
      if (destino === "/registro/verificar") enviados += 1;
    }
    expect(enviados).toBe(MAX_REENVIOS_POR_REGISTRO);
    expect(proveedor.iniciados).toHaveLength(MAX_REENVIOS_POR_REGISTRO);
  });

  it("un POST directo sin cookie responde no encontrado", async () => {
    delete peticion.cookies[COOKIE_PASO];
    await expect(ejecutarReenvio(dependencias())).rejects.toBeInstanceOf(NoEncontradoSimulado);
    expect(proveedor.iniciados).toEqual([]);
  });

  it("sin dependencias (capacidad apagada) responde no encontrado", async () => {
    await expect(ejecutarReenvio(null)).rejects.toBeInstanceOf(NoEncontradoSimulado);
  });
});
