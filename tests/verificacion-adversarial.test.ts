import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => {
  const simulado = await import("./admin-mocks");
  return { cookies: simulado.cookies, headers: simulado.headers };
});
vi.mock("next/navigation", async () => {
  const simulado = await import("./admin-mocks");
  const real = await vi.importActual<typeof import("next/navigation")>("next/navigation");
  return { ...real, redirect: simulado.redirect, notFound: simulado.notFound };
});

import { seedCatalogos } from "../prisma/seed";
import type { PrismaClient } from "../src/generated/prisma/client";
import RegistroVerificarPage from "../src/app/(publico)/registro/verificar/page";
import { VERSION_AVISO } from "../src/lib/legales/version";
import {
  ipDeEncabezados,
  reiniciarAvisoDeEncabezado,
  reiniciarLimitePorIp,
} from "../src/lib/registro/limite-ip";
import { procesarRegistro } from "../src/lib/registro/procesar";
import { CAMPO_VERSION_AVISO } from "../src/lib/registro/textos";
import {
  ejecutarConfirmacion,
  ejecutarReenvio,
  type DependenciasVerificacion,
} from "../src/lib/verificacion/acciones";
import { confirmarCodigo, pedirCodigoParaFicha } from "../src/lib/verificacion/flujo";
import {
  reiniciarCupoDeCodigos,
  reiniciarTopeDiario,
  reiniciarTopesPorRegistro,
} from "../src/lib/verificacion/limites";
import { COOKIE_PASO, crearPasoInicial, firmarPaso } from "../src/lib/verificacion/paso";
import {
  crearProveedorSimulado,
  type ProveedorSimulado,
} from "../src/lib/verificacion/proveedor";
import { NoEncontradoSimulado, peticion, reiniciarPeticion, urlDeRedireccion } from "./admin-mocks";
import { crearClientePrueba } from "./db";

/**
 * Spec `registro-negocio` (T-016) · suites ADVERSARIAL y de NO FUGA
 * (tasks.md #18 y #19).
 *
 * Qué se ataca aquí: la cookie de paso (ajena, manipulada, caducada, de otro
 * secreto), el campo del código (arreglos, espacios, letras, larguísimo),
 * campos extra que pretenden fijar `numeroVerificadoEn`, peticiones de mandar
 * código sin registro detrás, y el sitio corriendo sin
 * `REGISTRO_ENCABEZADO_IP`.
 *
 * Ninguna de estas peticiones debe producir un error del servidor, escribir la
 * marca de verificación, mandar un SMS ni delatar si un registro existe.
 *
 * Datos 100% ficticios (repo público + LFPDPPP): serie de pruebas 771994xxxx.
 */

const raiz = join(__dirname, "..");
const PREFIJO = "771994";
const SECRETO = "secreto-de-pruebas-de-32-caracteres-o-mas";
const OTRO_SECRETO = "otro-secreto-de-pruebas-de-32-caracteres";
const IP = "203.0.113.88"; // TEST-NET-3
const AHORA = new Date("2026-09-05T12:00:00.000Z");

let prisma: PrismaClient;
let categoriaId: number;
let coloniaId: number;
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
      nombre: "Lavandería Ficticia La Espuma",
      categoriaId,
      whatsapp,
      consintioAvisoEn: AHORA,
    },
    select: { id: true },
  });
  return negocio.id;
}

const conCodigo = (codigo: unknown) => {
  const formData = new FormData();
  formData.set("codigo", codigo as string);
  return formData;
};

beforeAll(async () => {
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (
    await prisma.categoria.findUniqueOrThrow({ where: { slug: "servicios-del-hogar" } })
  ).id;
  coloniaId = (
    await prisma.colonia.findUniqueOrThrow({ where: { slug: "haciendas-de-tizayuca" } })
  ).id;
});

beforeEach(async () => {
  reiniciarPeticion();
  reiniciarCupoDeCodigos();
  reiniciarTopeDiario();
  reiniciarTopesPorRegistro();
  await prisma.intentoDeCupo.deleteMany({});
  reiniciarLimitePorIp();
  reiniciarAvisoDeEncabezado();
  proveedor = crearProveedorSimulado();
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
});

afterEach(() => vi.restoreAllMocks());

afterAll(async () => {
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
  await prisma.$disconnect();
});

// Scenario: la pantalla no se abre de a gratis
describe("adversarial · la credencial de paso no se puede falsificar", () => {
  let id: string;

  beforeEach(async () => {
    id = await crearFicha(`${PREFIJO}0001`);
  });

  /**
   * Se arma con un paso FIJO (no el del `beforeEach`) porque `it.each` se
   * evalúa al recolectar las pruebas, antes de que corra ningún `beforeEach`.
   * La ficha a la que apunte da igual: ninguna de estas cookies pasa la firma.
   */
  const paso = crearPasoInicial("ficha-de-la-tabla-0001", `${PREFIJO}0001`, AHORA);

  const cookiesHostiles = (): Array<[string, string | undefined]> => [
    ["ninguna", undefined],
    ["vacía", ""],
    ["basura", "no-soy-una-cookie"],
    ["con la firma cambiada", `${firmarPaso(paso, SECRETO).slice(0, -4)}zzzz`],
    ["firmada con otro secreto", firmarPaso(paso, OTRO_SECRETO)],
    [
      "con los intentos puestos a cero a mano",
      (() => {
        const gastado = { ...paso, intentos: 4 };
        const [, firma] = firmarPaso(gastado, SECRETO).split(".");
        const contenido = Buffer.from(
          JSON.stringify({ ...gastado, intentos: 0 }),
          "utf8",
        ).toString("base64url");
        return `${contenido}.${firma}`;
      })(),
    ],
    [
      "apuntada a otra ficha",
      (() => {
        const [, firma] = firmarPaso(paso, SECRETO).split(".");
        const contenido = Buffer.from(
          JSON.stringify({ ...paso, negocioId: "ficha-ajena-0001" }),
          "utf8",
        ).toString("base64url");
        return `${contenido}.${firma}`;
      })(),
    ],
    ["de un JSON que no es un paso", `${Buffer.from('{"hola":1}').toString("base64url")}.x`],
  ];

  it.each(cookiesHostiles())(
    "la pantalla responde no encontrado con una cookie %s",
    async (_caso, valor) => {
      process.env.VERIFICACION_SMS_ACTIVA = "1";
      process.env.TWILIO_ACCOUNT_SID = "AC-de-mentiras-000";
      process.env.TWILIO_AUTH_TOKEN = "token-de-mentiras-000";
      process.env.TWILIO_VERIFY_SERVICE_SID = "VA-de-mentiras-000";
      process.env.VERIFICACION_SMS_SECRETO = SECRETO;
      try {
        if (valor === undefined) delete peticion.cookies[COOKIE_PASO];
        else peticion.cookies[COOKIE_PASO] = valor;

        await expect(
          RegistroVerificarPage({
            searchParams: Promise.resolve({}),
          } as unknown as Parameters<typeof RegistroVerificarPage>[0]),
        ).rejects.toBeInstanceOf(NoEncontradoSimulado);
      } finally {
        for (const v of [
          "VERIFICACION_SMS_ACTIVA",
          "TWILIO_ACCOUNT_SID",
          "TWILIO_AUTH_TOKEN",
          "TWILIO_VERIFY_SERVICE_SID",
          "VERIFICACION_SMS_SECRETO",
        ]) {
          delete process.env[v];
        }
      }
    },
  );

  it.each(cookiesHostiles())(
    "las dos acciones responden no encontrado con una cookie %s, sin tocar la ficha",
    async (_caso, valor) => {
      if (valor === undefined) delete peticion.cookies[COOKIE_PASO];
      else peticion.cookies[COOKIE_PASO] = valor;

      await expect(
        ejecutarConfirmacion(conCodigo("123456"), dependencias()),
      ).rejects.toBeInstanceOf(NoEncontradoSimulado);
      await expect(ejecutarReenvio(dependencias())).rejects.toBeInstanceOf(NoEncontradoSimulado);

      expect(proveedor.comprobados).toEqual([]);
      expect(proveedor.iniciados).toEqual([]);
      const guardada = await prisma.negocio.findUniqueOrThrow({ where: { id } });
      expect(guardada.numeroVerificadoEn).toBeNull();
    },
  );

  it("una cookie caducada tampoco confirma nada", async () => {
    peticion.cookies[COOKIE_PASO] = firmarPaso(
      crearPasoInicial(id, `${PREFIJO}0001`, AHORA),
      SECRETO,
    );
    const tarde = new Date(AHORA.getTime() + 16 * 60 * 1000);
    await expect(
      ejecutarConfirmacion(
        conCodigo("123456"),
        dependencias({ contexto: { ...dependencias().contexto, ahora: tarde } }),
      ),
    ).rejects.toBeInstanceOf(NoEncontradoSimulado);
  });

  it("una cookie válida de OTRA ficha solo gasta los intentos de ESA ficha", async () => {
    const otroId = await crearFicha(`${PREFIJO}0002`);
    peticion.cookies[COOKIE_PASO] = firmarPaso(
      crearPasoInicial(otroId, `${PREFIJO}0002`, AHORA),
      SECRETO,
    );
    proveedor = crearProveedorSimulado({ alComprobar: "confirmado" });
    await urlDeRedireccion(() => ejecutarConfirmacion(conCodigo("123456"), dependencias()));

    // La ficha del `beforeEach` no se tocó.
    expect((await prisma.negocio.findUniqueOrThrow({ where: { id } })).numeroVerificadoEn).toBeNull();
    expect(
      (await prisma.negocio.findUniqueOrThrow({ where: { id: otroId } })).numeroVerificadoEn,
    ).not.toBeNull();
  });
});

describe("adversarial · el campo del código aguanta cualquier cosa", () => {
  let id: string;

  beforeEach(async () => {
    id = await crearFicha(`${PREFIJO}0003`);
    peticion.cookies[COOKIE_PASO] = firmarPaso(
      crearPasoInicial(id, `${PREFIJO}0003`, AHORA),
      SECRETO,
    );
  });

  it("un campo repetido (arreglo) se toma como una sola cadena y no truena", async () => {
    const formData = new FormData();
    formData.append("codigo", "123456");
    formData.append("codigo", "999999");
    const destino = await urlDeRedireccion(() => ejecutarConfirmacion(formData, dependencias()));
    expect(destino).toMatch(/^\/registro\/(verificar|gracias)/);
  });

  it.each([
    ["con espacios alrededor", "  123456  ", true],
    ["con espacios dentro", "12 34 56", false],
    ["con letras", "12a456", false],
    ["larguísimo", "1".repeat(5000), false],
    ["vacío", "", false],
    ["con byte nulo", "123 456", false],
    ["con dígitos de otro alfabeto", "١٢٣٤٥٦", false],
    ["con signos", "+123456", false],
  ])("un código %s no rompe nada", async (_caso, codigo, llegaAlProveedor) => {
    proveedor = crearProveedorSimulado({ alComprobar: "no-coincide" });
    const destino = await urlDeRedireccion(() =>
      ejecutarConfirmacion(conCodigo(codigo), dependencias()),
    );
    expect(destino.startsWith("/registro/")).toBe(true);
    expect(proveedor.comprobados.length > 0).toBe(llegaAlProveedor);
    // Y en ningún caso la ficha quedó marcada.
    expect(
      (await prisma.negocio.findUniqueOrThrow({ where: { id } })).numeroVerificadoEn,
    ).toBeNull();
  });

  it("el código nunca vuelve en la URL, pase lo que pase", async () => {
    proveedor = crearProveedorSimulado({ alComprobar: "no-coincide" });
    for (const codigo of ["424242", "  424242  ", "42424a"]) {
      const destino = await urlDeRedireccion(() =>
        ejecutarConfirmacion(conCodigo(codigo), dependencias()),
      );
      expect(destino).not.toContain("424242");
      expect(destino).not.toContain(id);
      expect(destino).not.toContain(PREFIJO);
    }
  });
});

// Scenario: el cliente no puede fijar la verificación
describe("adversarial · el cliente no puede marcar su ficha como verificada", () => {
  function envioConTrampas(campos: Record<string, string>): FormData {
    const formData = new FormData();
    for (const [clave, valor] of Object.entries({
      nombre: "Cerrajería Ficticia El Llavero",
      categoriaId: String(categoriaId),
      whatsapp: `${PREFIJO}0010`,
      coloniaId: String(coloniaId),
      consentimiento: "on",
      [CAMPO_VERSION_AVISO]: VERSION_AVISO,
      ...campos,
    })) {
      formData.append(clave, valor);
    }
    return formData;
  }

  it("los campos extra que pretenden fijar la marca se ignoran", async () => {
    const resultado = await procesarRegistro(
      envioConTrampas({
        numeroVerificadoEn: "2020-01-01T00:00:00.000Z",
        verificado: "1",
        codigo: "123456",
        numeroVerificado: "true",
      }),
      { prisma, ip: IP, ahora: AHORA },
    );
    expect(resultado).toMatchObject({ exito: true });

    const guardada = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: `${PREFIJO}0010` },
    });
    expect(guardada.numeroVerificadoEn).toBeNull();
    expect(guardada.estado).toBe("en_revision");
  });

  it("tampoco en un reenvío tras rechazo", async () => {
    await procesarRegistro(envioConTrampas({}), { prisma, ip: IP, ahora: AHORA });
    await prisma.negocio.update({
      where: { whatsapp: `${PREFIJO}0010` },
      data: { estado: "rechazado", rechazadoEn: AHORA, motivoRechazo: "Datos incompletos" },
    });
    reiniciarLimitePorIp();

    await procesarRegistro(envioConTrampas({ numeroVerificadoEn: "2020-01-01T00:00:00.000Z" }), {
      prisma,
      ip: IP,
      ahora: AHORA,
    });
    const guardada = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: `${PREFIJO}0010` },
    });
    expect(guardada.numeroVerificadoEn).toBeNull();
    expect(guardada.estado).toBe("en_revision");
  });
});

// Scenario: no se puede pedir un SMS sin registro
describe("adversarial · no hay forma de mandar un SMS a un número suelto", () => {
  it("sin ficha detrás, `pedirCodigoParaFicha` no llama al proveedor", async () => {
    const paso = await pedirCodigoParaFicha(null, {
      proveedor,
      cupos: prisma,
      secreto: SECRETO,
      topeDiario: 50,
      ip: IP,
      ahora: AHORA,
    });
    expect(paso).toBeNull();
    expect(proveedor.iniciados).toEqual([]);
  });

  it("un envío rechazado por duplicado no provoca ningún SMS", async () => {
    const formData = new FormData();
    for (const [clave, valor] of Object.entries({
      nombre: "Panadería Ficticia El Bolillo",
      categoriaId: String(categoriaId),
      whatsapp: `${PREFIJO}0020`,
      coloniaId: String(coloniaId),
      consentimiento: "on",
      [CAMPO_VERSION_AVISO]: VERSION_AVISO,
    })) {
      formData.append(clave, valor);
    }
    await procesarRegistro(formData, { prisma, ip: IP, ahora: AHORA });

    const segundo = new FormData();
    for (const [clave, valor] of formData.entries()) segundo.append(clave, valor as string);
    const resultado = await procesarRegistro(segundo, { prisma, ip: IP, ahora: AHORA });

    expect(resultado.exito).toBe(false);
    // `procesarRegistro` no devolvió ficha, así que no hay nada que verificar.
    if (!resultado.exito) {
      expect(await pedirCodigoParaFicha(null, {
        proveedor,
        cupos: prisma,
        secreto: SECRETO,
        topeDiario: 50,
        ip: IP,
        ahora: AHORA,
      })).toBeNull();
    }
    expect(proveedor.iniciados).toEqual([]);
  });
});

// Scenario: sin encabezado de IP declarado
describe("adversarial · sin REGISTRO_ENCABEZADO_IP el flujo sigue acotado", () => {
  it("no se confía en ningún encabezado y las demás cotas siguen operando", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const encabezados = new Headers({ "x-forwarded-for": "198.51.100.1" });
    expect(ipDeEncabezados(encabezados, undefined)).toBeNull();

    const id = await crearFicha(`${PREFIJO}0030`);
    // Sin cupo por IP, el tope diario sigue cortando.
    const chico = { proveedor, cupos: prisma, secreto: SECRETO, topeDiario: 1, ip: null, ahora: AHORA };
    expect(
      await pedirCodigoParaFicha(
        { id, whatsapp: `${PREFIJO}0030`, yaVerificado: false },
        chico,
      ),
    ).not.toBeNull();
    expect(
      await pedirCodigoParaFicha(
        { id, whatsapp: `${PREFIJO}0030`, yaVerificado: false },
        chico,
      ),
    ).toBeNull();
  });
});

// ── NO FUGA (tasks.md #19) ────────────────────────────────────────────────
describe("no fuga · ni el código, ni las credenciales, ni el número, ni el id", () => {
  // Scenario: nada sensible en el log
  it("una verificación completa no escribe nada sensible en el log", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const id = await crearFicha(`${PREFIJO}0040`);
    const paso = crearPasoInicial(id, `${PREFIJO}0040`, AHORA);
    const contexto = { proveedor, cupos: prisma, secreto: SECRETO, topeDiario: 50, ip: IP, ahora: AHORA };

    await pedirCodigoParaFicha({ id, whatsapp: `${PREFIJO}0040`, yaVerificado: false }, contexto);
    await confirmarCodigo(prisma, paso, "424242", contexto);
    proveedor = crearProveedorSimulado({ alComprobar: "error" });
    await confirmarCodigo(prisma, paso, "999999", {
      ...contexto,
      proveedor,
    });

    const escrito = [...warn.mock.calls, ...error.mock.calls, ...log.mock.calls]
      .map((llamada) => llamada.join(" "))
      .join("\n");
    expect(escrito).not.toContain("424242");
    expect(escrito).not.toContain("999999");
    expect(escrito).not.toContain(`${PREFIJO}0040`);
    expect(escrito).not.toContain(id);
    expect(escrito).not.toContain(SECRETO);
  });

  // Scenario: el código no se guarda en casa
  it("no hay ninguna columna, archivo ni memoria donde viva un código", async () => {
    const columnas = (await prisma.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = current_schema()`,
    )) as Array<{ column_name: string }>;
    const sospechosas = columnas
      .map((fila) => fila.column_name)
      .filter((nombre) => /codigo|otp|verificationSid/i.test(nombre));
    expect(sospechosas).toEqual([]);

    // Y ningún módulo de la capacidad guarda un código en una variable propia.
    for (const nombre of readdirSync(join(raiz, "src/lib/verificacion"))) {
      if (!nombre.endsWith(".ts")) continue;
      const cuerpo = readFileSync(join(raiz, "src/lib/verificacion", nombre), "utf8");
      const sinComentarios = cuerpo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      // Nadie genera un código: eso lo hace el proveedor.
      expect(sinComentarios, nombre).not.toMatch(/Math\.random|randomInt|generarCodigo/);
    }
  });

  it("la cookie de paso no lleva el número completo ni ningún código", async () => {
    const id = await crearFicha(`${PREFIJO}0050`);
    const valor = firmarPaso(crearPasoInicial(id, `${PREFIJO}0050`, AHORA), SECRETO);
    const claro = Buffer.from(valor.split(".")[0], "base64url").toString("utf8");
    expect(claro).not.toContain(`${PREFIJO}0050`);
    expect(claro).toContain("0050"); // solo los cuatro últimos
  });

  it("los mensajes que ve el dueño no traen ni un dato del proveedor", () => {
    const textos = readFileSync(join(raiz, "src/lib/verificacion/textos.ts"), "utf8");
    for (const prohibido of ["Twilio", "twilio", "Verify service", "http"]) {
      const literales = textos
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(literales, prohibido).not.toContain(prohibido);
    }
  });
});
