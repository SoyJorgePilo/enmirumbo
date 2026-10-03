/**
 * La Action `registrar` con un contexto FALSO (change `migrar-registro-astro`,
 * tasks.md #11; spec `plataforma-astro`, requirements "El envío del registro
 * sin JavaScript se comporta igual que en Next" y "Con la bandera encendida,
 * el registro llega a la verificación igual que en Next"). Sin servidor y sin
 * `next/*`: se llama la Action real (`src/actions/index.ts`) como la llama el
 * middleware y su resultado se traduce con la tabla (`src/astro/acciones.ts`).
 *
 * La rama encendida usa el adaptador REAL de Twilio con el `fetch` falso de
 * `tests/fixtures/twilio-falso.mjs` instalado en el proceso: ninguna prueba
 * sale a la red. Datos ficticios: WhatsApp 77199982xx, IPs de documentación
 * (RFC 5737), credenciales `ACtest…`.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { ActionError } from "astro:actions";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { server } from "../src/actions/index";
import { ACCIONES, resolverAccion } from "../src/astro/acciones";
import {
  RUTA_DE_REGISTRO,
  estadoDelEnvio,
  type ContextoDeRegistrar,
} from "../src/astro/registro";
import type { PrismaClient } from "../src/generated/prisma/client";
import { VERSION_AVISO } from "../src/lib/legales/version";
import { reiniciarLimitePorIp } from "../src/lib/registro/limite-ip";
import { MENSAJES_ERROR_FOTO, MENSAJES_ERROR_REGISTRO } from "../src/lib/registro/textos";
import { ESTADO_INICIAL_REGISTRO, VALORES_VACIOS_REGISTRO } from "../src/lib/registro/tipos";
import {
  VARIABLE_BANDERA,
  VARIABLE_SECRETO,
  VARIABLE_TWILIO_AUTH_TOKEN,
  VARIABLE_TWILIO_SERVICE_SID,
  VARIABLE_TWILIO_SID,
  reiniciarAvisoDeVerificacion,
} from "../src/lib/verificacion/config";
import { reiniciarCupoDeCodigos, reiniciarTopeDiario, reiniciarTopesPorRegistro } from "../src/lib/verificacion/limites";
import { COOKIE_PASO, leerPaso } from "../src/lib/verificacion/paso";
import { crearClientePrueba } from "./db";
import { instalarTwilioFalso } from "./fixtures/twilio-falso.mjs";
import { borrarNegociosSembrados } from "./limpieza";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PREFIJO = "77199982";
const WHATSAPP = Array.from({ length: 30 }, (_, i) => `${PREFIJO}${String(i).padStart(2, "0")}`);
const SECRETO = "secreto-ficticio-de-pruebas-de-32-caracteres-o-mas";

let prisma: PrismaClient;
let categoriaId = 0;
let coloniaId = 0;

type Puesta = { nombre: string; valor: string; opciones: Record<string, unknown> };

function contexto(cabeceras: Record<string, string> = {}, routePattern = RUTA_DE_REGISTRO) {
  const puestas: Puesta[] = [];
  const ctx: ContextoDeRegistrar = {
    routePattern,
    request: new Request("https://enmirumbo.example/registro?_action=registrar", { method: "POST", headers: cabeceras }),
    cookies: {
      set: (nombre: string, valor: string, opciones: Record<string, unknown> = {}) => {
        puestas.push({ nombre, valor, opciones });
      },
    },
  };
  return { ctx, puestas };
}

function formulario(campos: Record<string, string | string[] | File>) {
  const formData = new FormData();
  for (const [clave, valor] of Object.entries(campos)) {
    if (valor instanceof File) formData.append(clave, valor);
    else for (const v of [valor].flat()) formData.append(clave, v);
  }
  return formData;
}

const valido = (whatsapp: string, extra: Record<string, string | string[] | File> = {}) => ({
  nombre: "Fonda Ficticia De La Action",
  categoriaId: String(categoriaId),
  whatsapp,
  coloniaId: String(coloniaId),
  consentimiento: "on",
  avisoVersion: VERSION_AVISO,
  ...extra,
});

async function enviar(campos: Record<string, string | string[] | File>, cabeceras: Record<string, string> = {}, routePattern?: string) {
  const { ctx, puestas } = contexto(cabeceras, routePattern);
  Reflect.set(ctx, Symbol.for("astro.actionAPIContext"), true);
  const seguro = await server.registrar.call(ctx as never, formulario(campos));
  return { resultado: await resolverAccion("registrar", seguro, ctx as never), puestas };
}

const ficha = (whatsapp: string) => prisma.negocio.findUnique({ where: { whatsapp } });

beforeAll(async () => {
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })).id;
  coloniaId = (await prisma.colonia.findFirstOrThrow({ orderBy: { id: "asc" } })).id;
});

beforeEach(async () => {
  reiniciarLimitePorIp();
  await borrarNegociosSembrados(prisma, WHATSAPP);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.REGISTRO_ENCABEZADO_IP;
});

afterAll(async () => {
  await borrarNegociosSembrados(prisma, WHATSAPP);
  await prisma.$disconnect();
});

describe("Action registrar · desenlaces", () => {
  it("éxito: 303 a gracias, ficha en revisión, orgánica, con la constancia y la versión que pone el servidor, sin cookies", async () => {
    const { resultado, puestas } = await enviar(valido(WHATSAPP[0]));
    expect(resultado).toEqual({ tipo: "redirigir", ruta: "/registro/gracias" });
    expect(puestas).toEqual([]);
    const guardada = await ficha(WHATSAPP[0]);
    expect(guardada).toMatchObject({ estado: "en_revision", origen: "organico", consintioAvisoVersion: VERSION_AVISO, numeroVerificadoEn: null });
    expect(guardada?.consintioAvisoEn).toBeInstanceOf(Date);
  });

  it("campo trampa lleno: el MISMO 303 a gracias, sin ficha", async () => {
    const { resultado } = await enviar(valido(WHATSAPP[1], { sitio_web: "http://spam.example" }));
    expect(resultado).toEqual({ tipo: "redirigir", ruta: "/registro/gracias" });
    expect(await ficha(WHATSAPP[1])).toBeNull();
  });

  it("error de validación: repintar con el mensaje junto a su campo y lo capturado, sin la casilla, sin ficha y sin cookies", async () => {
    const { resultado, puestas } = await enviar(valido("77199982", { queOfreces: "a".repeat(250), direccion: "a un lado (ficticio)" }));
    expect(resultado.tipo).toBe("repintar");
    if (resultado.tipo !== "repintar") return;
    expect(resultado.estado.errores).toEqual({
      whatsapp: MENSAJES_ERROR_REGISTRO.whatsapp,
      queOfreces: MENSAJES_ERROR_REGISTRO.queOfreces,
    });
    expect(resultado.estado.valores).toMatchObject({ nombre: "Fonda Ficticia De La Action", whatsapp: "77199982", direccion: "a un lado (ficticio)" });
    expect(Object.keys(resultado.estado.valores)).not.toContain("consentimiento");
    expect(puestas).toEqual([]);
    expect(await prisma.negocio.count({ where: { whatsapp: { startsWith: PREFIJO } } })).toBe(0);
  });

  it("con foto y un error de otro campo: avisa que hay que volver a elegirla", async () => {
    const foto = new File([new Uint8Array([0xff, 0xd8, 0xff])], "local.jpg", { type: "image/jpeg" });
    const { resultado } = await enviar(valido("123", { foto }));
    expect(resultado).toMatchObject({ tipo: "repintar", estado: { errores: { foto: "Tu foto no se quedó guardada: vuelve a elegirla antes de enviar." } } });
  });

  it("los campos que pretenden fijar estado, origen, constancia, foto, búsqueda, verificación o destino se ignoran", async () => {
    const { resultado } = await enviar(
      valido(WHATSAPP[2], {
        estado: "publicado",
        origen: "admin",
        fotoClave: "0123456789abcdef0123456789abcdef",
        nombreNormalizado: "otro",
        numeroVerificadoEn: "2026-01-01T00:00:00.000Z",
        consintioAvisoVersion: "9",
        "$ACTION_1:0": '{"destino":"https://evil.example"}',
        destino: ["https://evil.example/", "//evil.example"],
      }),
    );
    expect(resultado).toEqual({ tipo: "redirigir", ruta: "/registro/gracias" });
    expect(await ficha(WHATSAPP[2])).toMatchObject({
      estado: "en_revision",
      origen: "organico",
      fotoClave: null,
      numeroVerificadoEn: null,
      consintioAvisoVersion: VERSION_AVISO,
    });
  });

  it("la IP sale del encabezado declarado (el ÚLTIMO valor): el cuarto válido de la hora vuelve con el cupo", async () => {
    process.env.REGISTRO_ENCABEZADO_IP = "x-forwarded-for";
    for (let i = 0; i < 3; i++) {
      const { resultado } = await enviar(valido(WHATSAPP[10 + i]), { "x-forwarded-for": `198.51.100.${i}, 203.0.113.7` });
      expect(resultado, `envío ${i + 1}`).toEqual({ tipo: "redirigir", ruta: "/registro/gracias" });
    }
    const { resultado } = await enviar(valido(WHATSAPP[13]), { "x-forwarded-for": "198.51.100.99, 203.0.113.7" });
    expect(resultado).toMatchObject({ tipo: "repintar", estado: { errores: { general: MENSAJES_ERROR_REGISTRO.limiteIp } } });
    expect(await ficha(WHATSAPP[13])).toBeNull();
  });

  it("la Action comprueba su propia ruta: desde otra, ni escribe ni redirige", async () => {
    for (const ruta of ["/", "/negocio/[ficha]/reportar", "/500"]) {
      const { resultado, puestas } = await enviar(valido(WHATSAPP[3]), {}, ruta);
      expect(resultado, ruta).toEqual({ tipo: "fuera-de-ruta" });
      expect(puestas, ruta).toEqual([]);
    }
    expect(await ficha(WHATSAPP[3])).toBeNull();
  });

  it("el log no lleva la IP, el número, el nombre ni lo capturado", async () => {
    process.env.REGISTRO_ENCABEZADO_IP = "x-forwarded-for";
    const lineas: string[] = [];
    for (const nivel of ["log", "info", "warn", "error"] as const) {
      vi.spyOn(console, nivel).mockImplementation((...args: unknown[]) => void lineas.push(args.map(String).join(" ")));
    }
    await enviar(valido(WHATSAPP[4], { sitio_web: "x" }), { "x-forwarded-for": "203.0.113.45" });
    await enviar(valido("12", { horario: "horario-ficticio-secreto" }), { "x-forwarded-for": "203.0.113.45" });
    await enviar(valido(WHATSAPP[5]), { "x-forwarded-for": "203.0.113.45" });
    const registro = lineas.join("\n");
    for (const prohibido of ["203.0.113.45", WHATSAPP[4], WHATSAPP[5], "Fonda Ficticia De La Action", "horario-ficticio-secreto"]) {
      expect(registro, prohibido).not.toContain(prohibido);
    }
  });
});

describe("Action registrar · con la bandera encendida (Twilio falso en el proceso)", () => {
  let dir = "";
  let deshacer: (() => void) | undefined;
  const llamadas = () => {
    const archivo = path.join(dir, "llamadas.jsonl");
    try {
      return readFileSync(archivo, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as { ruta: string; parametros: Record<string, string> });
    } catch {
      return [];
    }
  };
  const encender = (guion: string) => {
    deshacer?.();
    writeFileSync(path.join(dir, "llamadas.jsonl"), "");
    deshacer = instalarTwilioFalso({ TWILIO_FALSO_GUION: guion, TWILIO_FALSO_REGISTRO: path.join(dir, "llamadas.jsonl") });
  };

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "registrar-accion-"));
  });

  beforeEach(async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    reiniciarAvisoDeVerificacion();
    reiniciarCupoDeCodigos();
    reiniciarTopeDiario();
    reiniciarTopesPorRegistro();
    await prisma.intentoDeCupo.deleteMany({});
    process.env[VARIABLE_BANDERA] = "1";
    process.env[VARIABLE_TWILIO_SID] = "ACtest00000000000000000000000000";
    process.env[VARIABLE_TWILIO_AUTH_TOKEN] = "token-ficticio-de-pruebas";
    process.env[VARIABLE_TWILIO_SERVICE_SID] = "VAtest00000000000000000000000000";
    process.env[VARIABLE_SECRETO] = SECRETO;
  });

  afterEach(async () => {
    deshacer?.();
    deshacer = undefined;
    for (const v of [VARIABLE_BANDERA, VARIABLE_TWILIO_SID, VARIABLE_TWILIO_AUTH_TOKEN, VARIABLE_TWILIO_SERVICE_SID, VARIABLE_SECRETO]) delete process.env[v];
    await prisma.intentoDeCupo.deleteMany({});
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("código pedido: 303 a verificar con la cookie de paso firmada y sus atributos; la ficha ya existe sin verificar", async () => {
    encender("enviado");
    const { resultado, puestas } = await enviar(valido(WHATSAPP[20]), { "x-forwarded-proto": "https" });
    expect(resultado).toEqual({ tipo: "redirigir", ruta: "/registro/verificar" });
    expect(puestas).toHaveLength(1);
    const [cookie] = puestas;
    expect(cookie.nombre).toBe(COOKIE_PASO);
    expect(cookie.opciones).toEqual({ httpOnly: true, sameSite: "lax", path: "/registro/verificar", maxAge: 900, secure: true });
    const guardada = await ficha(WHATSAPP[20]);
    expect(guardada).toMatchObject({ estado: "en_revision", numeroVerificadoEn: null });
    const paso = leerPaso(cookie.valor, SECRETO);
    expect(paso?.negocioId).toBe(guardada?.id);
    // El identificador viaja DENTRO de la cookie firmada, nunca en la ruta.
    expect(cookie.valor).not.toContain(WHATSAPP[20]);
    expect(llamadas()).toEqual([{ ruta: "/Verifications", parametros: { To: `+52${WHATSAPP[20]}`, Channel: "sms" } }]);
  });

  it.each(["error", "rechazado"])("si el SMS no sale (%s): 303 a gracias sin cookie, con la ficha guardada", async (guion) => {
    encender(guion);
    const { resultado, puestas } = await enviar(valido(WHATSAPP[21]));
    expect(resultado).toEqual({ tipo: "redirigir", ruta: "/registro/gracias" });
    expect(puestas).toEqual([]);
    expect(await ficha(WHATSAPP[21])).toMatchObject({ estado: "en_revision", numeroVerificadoEn: null });
  });

  it("duplicado y campo trampa: no piden código", async () => {
    encender("enviado");
    await prisma.negocio.create({ data: { nombre: "Ficha Ficticia Previa", categoriaId, whatsapp: WHATSAPP[22], consintioAvisoEn: new Date() } });
    const duplicado = await enviar(valido(WHATSAPP[22]));
    expect(duplicado.resultado).toMatchObject({ tipo: "repintar", estado: { errores: { whatsapp: MENSAJES_ERROR_REGISTRO.whatsappDuplicado } } });
    const trampa = await enviar(valido(WHATSAPP[23], { sitio_web: "x" }));
    expect(trampa.resultado).toEqual({ tipo: "redirigir", ruta: "/registro/gracias" });
    expect([...duplicado.puestas, ...trampa.puestas]).toEqual([]);
    expect(llamadas()).toEqual([]);
  });

  it("reenvío de una ficha rechazada ya verificada: 303 a gracias y ninguna llamada", async () => {
    encender("enviado");
    await prisma.negocio.create({
      data: { nombre: "Ficha Ficticia Verificada", categoriaId, whatsapp: WHATSAPP[24], estado: "rechazado", rechazadoEn: new Date(), consintioAvisoEn: new Date(), numeroVerificadoEn: new Date() },
    });
    const { resultado, puestas } = await enviar(valido(WHATSAPP[24]));
    expect(resultado).toEqual({ tipo: "redirigir", ruta: "/registro/gracias" });
    expect(puestas).toEqual([]);
    expect(llamadas()).toEqual([]);
  });

  it("con las credenciales y sin bandera: ni una llamada ni una fila de cupos", async () => {
    encender("enviado");
    delete process.env[VARIABLE_BANDERA];
    const { resultado, puestas } = await enviar(valido(WHATSAPP[25]));
    expect(resultado).toEqual({ tipo: "redirigir", ruta: "/registro/gracias" });
    expect(puestas).toEqual([]);
    expect(llamadas()).toEqual([]);
    expect(await prisma.intentoDeCupo.count()).toBe(0);
  });
});

describe("tabla de Actions · registrar", () => {
  // 3b-2 (change `migrar-verificacion-sms-astro`): la tabla suma `confirmar` y `reenviar`.
  it("cuatro Actions en la tabla, cada una atada a su ruta", () => {
    expect(Object.keys(ACCIONES)).toEqual(["reportar", "registrar", "confirmar", "reenviar"]);
    expect(ACCIONES.registrar.ruta).toBe("/registro");
  });

  it("cuerpo de más de 6 MiB: repintar con el mensaje de la foto y los valores vacíos, sin leer la base", async () => {
    const lectura = vi.spyOn(prisma.negocio, "findUnique");
    const { ctx } = contexto();
    const resultado = await resolverAccion("registrar", { data: undefined, error: new ActionError({ code: "CONTENT_TOO_LARGE" }) }, ctx as never);
    expect(resultado).toEqual({ tipo: "repintar", estado: { errores: { foto: MENSAJES_ERROR_FOTO.demasiadoGrande }, valores: VALORES_VACIOS_REGISTRO } });
    expect(lectura).not.toHaveBeenCalled();
  });

  it("cualquier otro ActionError: repintar con el error general de siempre", async () => {
    for (const code of ["UNSUPPORTED_MEDIA_TYPE", "INTERNAL_SERVER_ERROR", "BAD_REQUEST"] as const) {
      const { ctx } = contexto();
      const resultado = await resolverAccion("registrar", { data: undefined, error: new ActionError({ code }) }, ctx as never);
      expect(resultado, code).toEqual({ tipo: "repintar", estado: { errores: { general: MENSAJES_ERROR_REGISTRO.servidor }, valores: VALORES_VACIOS_REGISTRO } });
    }
  });

  it("un resultado con otra forma no se obedece: fuera de ruta", async () => {
    const { ctx } = contexto();
    const raros = [
      { tipo: "redirigir", ruta: "https://evil.example" },
      { tipo: "redirigir", ruta: "//evil.example" },
      { tipo: "repintar" },
      { tipo: "repintar", estado: { errores: { nombre: 3 }, valores: VALORES_VACIOS_REGISTRO } },
      { tipo: "repintar", estado: { errores: {}, valores: { nombre: { html: "<b>" } } } },
      { tipo: "repintar", estado: { errores: {} } },
      { tipo: "repintar", estado: { errores: [], valores: [] } },
      "texto",
      null,
    ];
    for (const raro of raros) {
      expect(await resolverAccion("registrar", { data: raro, error: undefined }, ctx as never), JSON.stringify(raro)).toEqual({ tipo: "fuera-de-ruta" });
    }
  });

  it("lo que la página pinta: el estado de la Action si es válido, si no el vacío", () => {
    const estado = { errores: { whatsapp: MENSAJES_ERROR_REGISTRO.whatsapp }, valores: { ...VALORES_VACIOS_REGISTRO, nombre: "x" } };
    expect(estadoDelEnvio({ data: estado, error: undefined })).toEqual(estado);
    expect(estadoDelEnvio(undefined)).toEqual(ESTADO_INICIAL_REGISTRO);
    expect(estadoDelEnvio({ data: undefined, error: new ActionError({ code: "INTERNAL_SERVER_ERROR" }) })).toEqual(ESTADO_INICIAL_REGISTRO);
    expect(estadoDelEnvio({ data: { errores: { nombre: 1 }, valores: {} }, error: undefined })).toEqual(ESTADO_INICIAL_REGISTRO);
  });
});

describe("Action registrar · sin Next", () => {
  it("ni la Action, ni la tabla, ni el pegamento, ni src/lib/verificacion importan next/*", () => {
    for (const archivo of ["src/actions/index.ts", "src/astro/acciones.ts", "src/astro/registro.ts", "src/lib/verificacion/acciones.ts"]) {
      expect(readFileSync(path.join(raiz, archivo), "utf8"), archivo).not.toMatch(/from ["']next\//);
    }
  });

  it("la IP se lee de las cabeceras, nunca de clientAddress", () => {
    const fuente = readFileSync(path.join(raiz, "src/astro/registro.ts"), "utf8");
    expect(fuente).toContain("ipDeEncabezados(");
    expect(fuente).not.toMatch(/clientAddress|getClientIpAddress/);
  });
});
