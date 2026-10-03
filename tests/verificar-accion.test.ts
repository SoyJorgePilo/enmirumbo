/**
 * `src/astro/verificar.ts` y las Actions `confirmar` y `reenviar` con un
 * contexto FALSO (change `migrar-verificacion-sms-astro`, tasks.md #9 y #10;
 * spec `plataforma-astro`, requirements "Confirmar y reenviar el código sin
 * JavaScript se comportan igual que en Next", "Sin una credencial de paso
 * válida…" y el MODIFIED de la tabla de Actions). Sin servidor y sin `next/*`:
 * se llama la Action real (`src/actions/index.ts`) como la llama el
 * middleware y su resultado se traduce con la tabla (`src/astro/acciones.ts`).
 *
 * El adaptador REAL de Twilio con el `fetch` falso de
 * `tests/fixtures/twilio-falso.mjs` instalado en el proceso: nada sale a la
 * red. Datos ficticios: WhatsApp 77199987[5-9]x, credenciales `ACtest…`.
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
  DESTINOS_DE_VERIFICAR,
  RUTA_DE_VERIFICAR,
  almacenDe,
  cargarPantalla,
  destinoDeVerificar,
  type ContextoDeVerificar,
} from "../src/astro/verificar";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  VARIABLE_BANDERA,
  VARIABLE_SECRETO,
  VARIABLE_TWILIO_AUTH_TOKEN,
  VARIABLE_TWILIO_SERVICE_SID,
  VARIABLE_TWILIO_SID,
  reiniciarAvisoDeVerificacion,
} from "../src/lib/verificacion/config";
import { reiniciarCupoDeCodigos, reiniciarTopeDiario, reiniciarTopesPorRegistro } from "../src/lib/verificacion/limites";
import { COOKIE_PASO } from "../src/lib/verificacion/paso";
import { crearClientePrueba } from "./db";
import { instalarTwilioFalso } from "./fixtures/twilio-falso.mjs";
import { borrarNegociosSembrados } from "./limpieza";
import { cookieDePaso, leerLlamadas } from "./verificar-astro";

const SECRETO = "secreto-ficticio-de-pruebas-de-32-caracteres-o-mas";
const WHATSAPP = Array.from({ length: 10 }, (_, i) => `771999875${i}`);
const VARIABLES = [VARIABLE_BANDERA, VARIABLE_TWILIO_SID, VARIABLE_TWILIO_AUTH_TOKEN, VARIABLE_TWILIO_SERVICE_SID, VARIABLE_SECRETO];

let prisma: PrismaClient;
let categoriaId = 0;
let dir = "";
let deshacer: (() => void) | undefined;

type Puesta = { nombre: string; valor: string; opciones: Record<string, unknown> };

/** Un `Astro.cookies` falso: lo que trae la petición y lo que se pone en la respuesta. */
function frascoFalso(entrantes: Record<string, string> = {}) {
  const puestas: Puesta[] = [];
  const lecturas: string[] = [];
  return {
    puestas,
    lecturas,
    cookies: {
      get: (nombre: string) => {
        lecturas.push(nombre);
        return nombre in entrantes ? { value: entrantes[nombre] } : undefined;
      },
      set: (nombre: string, valor: string, opciones: Record<string, unknown> = {}) => {
        puestas.push({ nombre, valor, opciones });
      },
    },
  };
}

function contexto(cookie: string | undefined, routePattern = RUTA_DE_VERIFICAR, cabeceras: Record<string, string> = { "x-forwarded-proto": "https" }) {
  const frasco = frascoFalso(cookie ? { [COOKIE_PASO]: cookie } : {});
  const ctx: ContextoDeVerificar = {
    routePattern,
    request: new Request("https://enmirumbo.example/registro/verificar?_action=confirmar", { method: "POST", headers: cabeceras }),
    cookies: frasco.cookies,
  };
  Reflect.set(ctx, Symbol.for("astro.actionAPIContext"), true);
  return { ctx, ...frasco };
}

function conCodigo(codigo: string | File) {
  const formData = new FormData();
  formData.append("codigo", codigo);
  return formData;
}

async function confirmar(cookie: string | undefined, codigo: string | File, routePattern?: string) {
  const c = contexto(cookie, routePattern);
  const seguro = await server.confirmar.call(c.ctx as never, conCodigo(codigo));
  return { resultado: await resolverAccion("confirmar", seguro, c.ctx as never), ...c };
}

async function reenviar(cookie: string | undefined, routePattern?: string) {
  const c = contexto(cookie, routePattern);
  const seguro = await server.reenviar.call(c.ctx as never, new FormData());
  return { resultado: await resolverAccion("reenviar", seguro, c.ctx as never), ...c };
}

const llamadas = () => leerLlamadas(path.join(dir, "llamadas.jsonl"));
const encender = (guion: string) => {
  deshacer?.();
  writeFileSync(path.join(dir, "llamadas.jsonl"), "");
  deshacer = instalarTwilioFalso({ TWILIO_FALSO_GUION: guion, TWILIO_FALSO_REGISTRO: path.join(dir, "llamadas.jsonl") });
  process.env[VARIABLE_BANDERA] = "1";
  process.env[VARIABLE_TWILIO_SID] = "ACtest00000000000000000000000000";
  process.env[VARIABLE_TWILIO_AUTH_TOKEN] = "token-ficticio-de-pruebas";
  process.env[VARIABLE_TWILIO_SERVICE_SID] = "VAtest00000000000000000000000000";
  process.env[VARIABLE_SECRETO] = SECRETO;
};

async function ficha(i: number) {
  await prisma.negocio.deleteMany({ where: { whatsapp: WHATSAPP[i] } });
  return prisma.negocio.create({ data: { nombre: "Abarrotes Ficticios De La Action", categoriaId, whatsapp: WHATSAPP[i], consintioAvisoEn: new Date() } });
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "verificar-accion-"));
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (await prisma.categoria.findFirstOrThrow({ orderBy: { id: "asc" } })).id;
});

beforeEach(async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  reiniciarAvisoDeVerificacion();
  reiniciarCupoDeCodigos();
  reiniciarTopeDiario();
  reiniciarTopesPorRegistro();
  await prisma.intentoDeCupo.deleteMany({});
});

afterEach(async () => {
  deshacer?.();
  deshacer = undefined;
  for (const v of VARIABLES) delete process.env[v];
  vi.restoreAllMocks();
  await prisma.intentoDeCupo.deleteMany({});
});

afterAll(async () => {
  await borrarNegociosSembrados(prisma, WHATSAPP);
  await prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

describe("verificar · la lista cerrada de destinos", () => {
  it("son exactamente los nueve de la spec", () => {
    expect([...DESTINOS_DE_VERIFICAR].sort()).toEqual(
      [
        "/registro/gracias?verificado=1",
        "/registro/gracias?agotado=1",
        "/registro/verificar",
        "/registro/verificar?error=incompleto",
        "/registro/verificar?error=no-coincide",
        "/registro/verificar?error=vencido",
        "/registro/verificar?error=proveedor",
        "/registro/verificar?errorReenvio=espera-reenvio",
        "/registro/verificar?errorReenvio=cupo",
      ].sort(),
    );
  });

  it("un destino de la lista se obedece; cualquier otro es 'no encontrado'", () => {
    for (const ruta of DESTINOS_DE_VERIFICAR) expect(destinoDeVerificar({ tipo: "redirigir", ruta })).toEqual({ tipo: "redirigir", ruta });
    for (const ruta of ["/registro/gracias", "/registro/verificar?error=otro", "/registro/verificar?error=vencido&x=1", "//evil.example", "https://evil.example/", "/negocio/x/reportar"]) {
      expect(destinoDeVerificar({ tipo: "redirigir", ruta }), ruta).toEqual({ tipo: "no-encontrado" });
    }
    expect(destinoDeVerificar({ tipo: "no-encontrado" })).toEqual({ tipo: "no-encontrado" });
  });
});

describe("verificar · el adaptador de cookies", () => {
  it("lee el valor y pone la cookie con las MISMAS opciones que arma src/lib (sin agregar ninguna)", () => {
    const { cookies, puestas } = frascoFalso({ [COOKIE_PASO]: "valor" });
    const almacen = almacenDe(cookies);
    expect(almacen.get(COOKIE_PASO)?.value).toBe("valor");
    expect(almacen.get("otra")).toBeUndefined();
    const opciones = { httpOnly: true, sameSite: "lax", path: "/registro/verificar", maxAge: 0, secure: true };
    almacen.set(COOKIE_PASO, "", opciones);
    expect(puestas).toEqual([{ nombre: COOKIE_PASO, valor: "", opciones }]);
  });
});

describe("verificar · la pantalla (cargarPantalla)", () => {
  const url = (consulta = "") => new URL(`https://enmirumbo.example/registro/verificar${consulta}`);

  it("apagada: 'no encontrado' SIN leer la cookie, aunque traiga una bien firmada", () => {
    const { cookies, lecturas } = frascoFalso({ [COOKIE_PASO]: cookieDePaso("vigente", "cualquiera", SECRETO) });
    process.env[VARIABLE_SECRETO] = SECRETO;
    expect(cargarPantalla(url(), cookies, undefined)).toEqual({ tipo: "no-encontrado" });
    expect(lecturas).toEqual([]);
  });

  it("encendida: con la Action en 'no encontrado' (ficha borrada) pinta la 404 aunque la cookie valga, sin leerla", () => {
    encender("enviado");
    const { cookies, lecturas } = frascoFalso({ [COOKIE_PASO]: cookieDePaso("vigente", "cualquiera", SECRETO) });
    expect(cargarPantalla(url(), cookies, { error: new ActionError({ code: "NOT_FOUND" }) })).toEqual({ tipo: "no-encontrado" });
    expect(lecturas).toEqual([]);
  });

  it("encendida: cada cookie inválida es 'no encontrado'; la vigente da los cuatro últimos dígitos", () => {
    encender("enviado");
    for (const tipo of ["caducada", "alterada", "otro-secreto", "malformada"] as const) {
      expect(cargarPantalla(url(), frascoFalso({ [COOKIE_PASO]: cookieDePaso(tipo, "x", SECRETO) }).cookies, undefined), tipo).toEqual({ tipo: "no-encontrado" });
    }
    expect(cargarPantalla(url(), frascoFalso().cookies, undefined)).toEqual({ tipo: "no-encontrado" });
    expect(cargarPantalla(url(), frascoFalso({ [COOKIE_PASO]: cookieDePaso("vigente", "x", SECRETO, "4321") }).cookies, undefined)).toEqual({
      tipo: "pantalla",
      ultimosCuatroDigitos: "4321",
      errorCodigo: undefined,
      errorReenvio: undefined,
    });
  });

  it("los errores: primer valor y lista cerrada; cualquier otro se ignora", () => {
    encender("enviado");
    const { cookies } = frascoFalso({ [COOKIE_PASO]: cookieDePaso("vigente", "x", SECRETO, "4321") });
    const de = (consulta: string) => {
      const p = cargarPantalla(url(consulta), cookies, undefined);
      return p.tipo === "pantalla" ? [p.errorCodigo, p.errorReenvio] : p.tipo;
    };
    for (const e of ["incompleto", "no-coincide", "vencido", "proveedor"]) expect(de(`?error=${e}`)).toEqual([e, undefined]);
    for (const e of ["espera-reenvio", "cupo"]) expect(de(`?errorReenvio=${e}`)).toEqual([undefined, e]);
    expect(de("?error=x")).toEqual([undefined, undefined]);
    expect(de("?error=x&error=vencido")).toEqual([undefined, undefined]);
    expect(de("?error=vencido&error=x")).toEqual(["vencido", undefined]);
    expect(de("?error=no-coincide&errorReenvio=cupo")).toEqual(["no-coincide", "cupo"]);
    expect(de("?error=%3Cscript%3E")).toEqual([undefined, undefined]);
  });
});

describe("Actions confirmar y reenviar · desenlaces", () => {
  it("código correcto: 303 a gracias?verificado=1, la cookie borrada con los mismos atributos y Max-Age=0, la ficha con su fecha", async () => {
    encender("enviado,approved");
    const { id } = await ficha(0);
    const { resultado, puestas } = await confirmar(cookieDePaso("vigente", id, SECRETO), "123456");
    expect(resultado).toEqual({ tipo: "redirigir", ruta: "/registro/gracias?verificado=1" });
    expect(puestas).toEqual([{ nombre: COOKIE_PASO, valor: "", opciones: { httpOnly: true, sameSite: "lax", path: "/registro/verificar", maxAge: 0, secure: true } }]);
    expect((await prisma.negocio.findUniqueOrThrow({ where: { id } })).numeroVerificadoEn).toBeInstanceOf(Date);
    expect(llamadas().map((l) => l.ruta)).toEqual(["/VerificationCheck"]);
  });

  it("un archivo colado en el campo, o un código que no son 6 dígitos: ?error=incompleto, sin proveedor ni cookie", async () => {
    encender("enviado,approved");
    const { id } = await ficha(1);
    for (const codigo of [new File(["123456"], "codigo.txt", { type: "text/plain" }), "", "1234", "12ab56", "1234567"]) {
      const { resultado, puestas } = await confirmar(cookieDePaso("vigente", id, SECRETO), codigo);
      expect(resultado).toEqual({ tipo: "redirigir", ruta: "/registro/verificar?error=incompleto" });
      expect(puestas).toEqual([]);
    }
    expect(llamadas()).toEqual([]);
  });

  it("sin credencial válida, o de una ficha borrada: 'no encontrado', sin proveedor ni cookie", async () => {
    encender("enviado,approved");
    for (const cookie of [undefined, cookieDePaso("alterada", "x", SECRETO), cookieDePaso("vigente", "cnoexiste0000000000000000", SECRETO)]) {
      const { resultado, puestas } = await confirmar(cookie, "123456");
      expect(resultado).toEqual({ tipo: "no-encontrado" });
      expect(puestas).toEqual([]);
    }
    expect((await reenviar(undefined)).resultado).toEqual({ tipo: "no-encontrado" });
    expect(llamadas()).toEqual([]);
  });

  it("apagada: 'no encontrado' aunque la cookie esté bien firmada", async () => {
    const { id } = await ficha(2);
    process.env[VARIABLE_SECRETO] = SECRETO;
    expect((await confirmar(cookieDePaso("vigente", id, SECRETO), "123456")).resultado).toEqual({ tipo: "no-encontrado" });
    expect((await reenviar(cookieDePaso("vigente", id, SECRETO))).resultado).toEqual({ tipo: "no-encontrado" });
  });

  it("reenvío inmediato tras el código: ?errorReenvio=espera-reenvio sin SMS", async () => {
    encender("enviado");
    const { id } = await ficha(3);
    // El primer código (lo que hace el registro) aparta la espera de 60 s.
    const primero = await reenviar(cookieDePaso("vigente", id, SECRETO));
    expect(primero.resultado).toEqual({ tipo: "redirigir", ruta: "/registro/verificar" });
    const segundo = await reenviar(cookieDePaso("vigente", id, SECRETO));
    expect(segundo.resultado).toEqual({ tipo: "redirigir", ruta: "/registro/verificar?errorReenvio=espera-reenvio" });
    expect(llamadas().map((l) => l.ruta)).toEqual(["/Verifications"]);
  });

  it("cada Action comprueba su propia ruta: desde otra, ni consulta ni escribe ni pide nada", async () => {
    encender("enviado,approved");
    const { id } = await ficha(4);
    for (const ruta of ["/", "/registro", "/registro/gracias", "/500"]) {
      expect((await confirmar(cookieDePaso("vigente", id, SECRETO), "123456", ruta)).resultado, ruta).toEqual({ tipo: "fuera-de-ruta" });
      expect((await reenviar(cookieDePaso("vigente", id, SECRETO), ruta)).resultado, ruta).toEqual({ tipo: "fuera-de-ruta" });
    }
    expect(llamadas()).toEqual([]);
    expect(await prisma.intentoDeCupo.count()).toBe(0);
  });
});

describe("tabla de Actions · confirmar y reenviar", () => {
  // Fase 4 (change `migrar-enlace-gestion-astro`, MODIFIED): la tabla suma `editar` → `/editar/[token]` (lo prueba `editar-accion`).
  // 5a (change `migrar-panel-admin-base-astro`): siete, con entrar y salir del panel (sin compuerta).
  it("siete Actions; confirmar y reenviar atadas a /registro/verificar, con la compuerta de la capacidad", () => {
    expect(Object.keys(ACCIONES)).toEqual(["reportar", "registrar", "confirmar", "reenviar", "editar", "entrar", "salir"]);
    expect(ACCIONES.entrar.puedeCorrer).toBeUndefined();
    expect(ACCIONES.salir.puedeCorrer).toBeUndefined();
    for (const nombre of ["confirmar", "reenviar"]) {
      expect(ACCIONES[nombre].ruta).toBe("/registro/verificar");
      expect(ACCIONES[nombre].puedeCorrer?.()).toBe(false);
    }
    encender("enviado");
    expect(ACCIONES.confirmar.puedeCorrer?.()).toBe(true);
    expect(ACCIONES.reportar.puedeCorrer).toBeUndefined();
    expect(ACCIONES.registrar.puedeCorrer).toBeUndefined();
  });

  it("un ActionError (cuerpo desmedido, no formulario, falla interna) es 'no encontrado', sin leer la base", async () => {
    const lectura = vi.spyOn(prisma.negocio, "findUnique");
    const { ctx } = contexto(undefined);
    for (const codigo of ["CONTENT_TOO_LARGE", "UNSUPPORTED_MEDIA_TYPE", "INTERNAL_SERVER_ERROR", "BAD_REQUEST"] as const) {
      for (const nombre of ["confirmar", "reenviar"]) {
        expect(await resolverAccion(nombre, { data: undefined, error: new ActionError({ code: codigo }) }, ctx as never), `${nombre} ${codigo}`).toEqual({ tipo: "no-encontrado" });
      }
    }
    expect(lectura).not.toHaveBeenCalled();
  });

  it("la tabla vuelve a validar la lista cerrada: un destino fuera de ella no se obedece", async () => {
    const { ctx } = contexto(undefined);
    for (const ruta of ["/negocio/x/reportar/gracias", "/registro/gracias", "/registro/verificar?error=otro"]) {
      expect(await resolverAccion("confirmar", { data: { tipo: "redirigir", ruta }, error: undefined }, ctx as never), ruta).toEqual({ tipo: "no-encontrado" });
    }
    expect(await resolverAccion("reenviar", { data: { tipo: "redirigir", ruta: "/registro/verificar" }, error: undefined }, ctx as never)).toEqual({
      tipo: "redirigir",
      ruta: "/registro/verificar",
    });
  });

  it("guardián: src/astro/verificar.ts no usa clientAddress (la IP sale de las cabeceras)", () => {
    expect(readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "../src/astro/verificar.ts"), "utf8")).not.toContain("clientAddress");
  });
});
