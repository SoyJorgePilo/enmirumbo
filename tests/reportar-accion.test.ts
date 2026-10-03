/**
 * La Action `reportar` con un contexto FALSO (change
 * `migrar-formularios-publicos-astro`, tasks.md #11; spec `plataforma-astro`,
 * requirement "El envío del reporte se comporta igual que en Next"). Sin
 * servidor y sin `next/*`: se llama la Action real (`src/actions/index.ts`)
 * como la llama el middleware, y su resultado se traduce con la tabla de
 * Actions (`src/astro/acciones.ts`), igual que en la salida construida.
 *
 * Los desenlaces son los de la tarea 2 (`tests/fixtures/next-3a`). Datos
 * ficticios: WhatsApp 77199976xx, IPs de documentación (RFC 5737).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { ActionError } from "astro:actions";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { server } from "../src/actions/index";
import { ACCIONES, CACHE_DE_ACCION, destinoSeguro, resolverAccion, respuestaDeRedireccion } from "../src/astro/acciones";
import { RUTA_DE_REPORTAR, type ContextoDeReportar } from "../src/astro/reportar";
import type { PrismaClient } from "../src/generated/prisma/client";
import { construirSegmentoFicha } from "../src/lib/ficha-url";
import { DURACION_BORRADOR_S, NOMBRE_COOKIE_BORRADOR, decodificarBorrador } from "../src/lib/reportes/borrador";
import { reiniciarCupoDeReportes } from "../src/lib/reportes/limite";
import { LIMITE_COMENTARIO_REPORTE } from "../src/lib/reportes/textos";
import { crearClientePrueba } from "./db";
import { borrarNegociosSembrados } from "./limpieza";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const WHATSAPP = ["7719997601", "7719997602", "7719997603"];
const NOMBRE = "Cerrajería Ficticia La Llave Maestra";

let prisma: PrismaClient;
let idPublicado = "";
let idEnRevision = "";
let idTope = "";

type Puesta = { nombre: string; valor: string; opciones: Record<string, unknown> };

/** El contexto que arma Astro para la Action, con lo mínimo que usa. */
function contexto(segmento: string, cabeceras: Record<string, string> = {}, routePattern = RUTA_DE_REPORTAR) {
  const puestas: Puesta[] = [];
  const ctx: ContextoDeReportar = {
    routePattern,
    params: { ficha: segmento },
    request: new Request(`https://enmirumbo.example/negocio/${segmento}/reportar?_action=reportar`, {
      method: "POST",
      headers: cabeceras,
    }),
    cookies: {
      set: (nombre: string, valor: string, opciones: Record<string, unknown> = {}) => {
        puestas.push({ nombre, valor, opciones });
      },
    },
  };
  return { ctx, puestas };
}

/** La Action como la corre el middleware: resultado seguro y luego la tabla. */
async function enviar(segmento: string, campos: Record<string, string | string[]>, cabeceras: Record<string, string> = {}, routePattern?: string) {
  const formData = new FormData();
  for (const [clave, valor] of Object.entries(campos)) for (const v of [valor].flat()) formData.append(clave, v);
  const { ctx, puestas } = contexto(segmento, cabeceras, routePattern);
  Reflect.set(ctx, Symbol.for("astro.actionAPIContext"), true);
  const seguro = await server.reportar.call(ctx as never, formData);
  return { resultado: await resolverAccion("reportar", seguro, ctx), puestas };
}

const segmento = () => construirSegmentoFicha(NOMBRE, idPublicado);

beforeAll(async () => {
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  await borrarNegociosSembrados(prisma, WHATSAPP);
  const categoriaId = (await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })).id;
  const alta = async (nombre: string, whatsapp: string, estado: string) =>
    (
      await prisma.negocio.create({
        data: { nombre, categoriaId, whatsapp, estado, consintioAvisoEn: new Date(), publicadoEn: estado === "publicado" ? new Date() : null },
      })
    ).id;
  idPublicado = await alta(NOMBRE, WHATSAPP[0], "publicado");
  idEnRevision = await alta("Herrería Ficticia En Revisión", WHATSAPP[1], "en_revision");
  idTope = await alta("Taller Ficticio Del Tope", WHATSAPP[2], "publicado");
});

afterAll(async () => {
  delete process.env.REGISTRO_ENCABEZADO_IP;
  await borrarNegociosSembrados(prisma, WHATSAPP);
  await prisma.$disconnect();
});

beforeEach(async () => {
  reiniciarCupoDeReportes();
  delete process.env.REGISTRO_ENCABEZADO_IP;
  await prisma.reporte.deleteMany({ where: { negocioId: { in: [idPublicado, idEnRevision, idTope] } } });
});

const cuenta = () => prisma.reporte.count({ where: { negocioId: { in: [idPublicado, idEnRevision, idTope] } } });

describe("Action reportar · desenlaces (los de la tarea 2)", () => {
  it("éxito: a la confirmación, una fila y el borrador borrado con Max-Age 0", async () => {
    const { resultado, puestas } = await enviar(segmento(), { motivo: "cerrado" });
    expect(resultado).toEqual({ tipo: "redirigir", ruta: `/negocio/${segmento()}/reportar/gracias` });
    expect(await cuenta()).toBe(1);
    expect(puestas).toEqual([
      {
        nombre: NOMBRE_COOKIE_BORRADOR,
        valor: "",
        opciones: { httpOnly: true, sameSite: "lax", path: `/negocio/${segmento()}/reportar`, maxAge: 0, secure: false },
      },
    ]);
  });

  it("sin motivo con comentario: al formulario con ?error=motivo y el comentario solo en la cookie", async () => {
    const { resultado, puestas } = await enviar(segmento(), { comentario: "hablé con la dueña" });
    expect(resultado).toEqual({ tipo: "redirigir", ruta: `/negocio/${segmento()}/reportar?error=motivo` });
    expect(JSON.stringify(resultado)).not.toContain("dueña");
    expect(decodificarBorrador(puestas[0].valor, LIMITE_COMENTARIO_REPORTE)).toBe("hablé con la dueña");
    expect(puestas[0].opciones).toEqual({
      httpOnly: true,
      sameSite: "lax",
      path: `/negocio/${segmento()}/reportar`,
      maxAge: DURACION_BORRADOR_S,
      secure: false,
    });
    expect(await cuenta()).toBe(0);
  });

  it("comentario de 301: ?error=comentario, sin fila", async () => {
    const { resultado } = await enviar(segmento(), { motivo: "cerrado", comentario: "a".repeat(301) });
    expect(resultado).toEqual({ tipo: "redirigir", ruta: `/negocio/${segmento()}/reportar?error=comentario` });
    expect(await cuenta()).toBe(0);
  });

  it("honeypot y tope: la MISMA confirmación sin escribir", async () => {
    const trampa = await enviar(segmento(), { motivo: "cerrado", sitio_web: "http://spam.example" });
    expect(trampa.resultado).toEqual({ tipo: "redirigir", ruta: `/negocio/${segmento()}/reportar/gracias` });
    await prisma.reporte.createMany({ data: Array.from({ length: 10 }, () => ({ negocioId: idTope, motivo: "cerrado" })) });
    const tope = await enviar(construirSegmentoFicha("Taller Ficticio Del Tope", idTope), { motivo: "cerrado" });
    expect(tope.resultado).toEqual({
      tipo: "redirigir",
      ruta: `/negocio/${construirSegmentoFicha("Taller Ficticio Del Tope", idTope)}/reportar/gracias`,
    });
    expect(await cuenta()).toBe(10);
  });

  it("el cuarto de la hora desde la misma IP declarada vuelve con ?error=cupo; la llave es el ÚLTIMO valor", async () => {
    process.env.REGISTRO_ENCABEZADO_IP = "x-forwarded-for";
    for (let i = 1; i <= 3; i++) {
      const { resultado } = await enviar(segmento(), { motivo: "cerrado" }, { "x-forwarded-for": `198.51.100.${i}, 203.0.113.61` });
      expect(resultado).toEqual({ tipo: "redirigir", ruta: `/negocio/${segmento()}/reportar/gracias` });
    }
    const { resultado } = await enviar(segmento(), { motivo: "cerrado" }, { "x-forwarded-for": "198.51.100.9, 203.0.113.61" });
    expect(resultado).toEqual({ tipo: "redirigir", ruta: `/negocio/${segmento()}/reportar?error=cupo` });
    expect(await cuenta()).toBe(3);
  });

  it.each([
    ["inexistente", () => "x-cnoexiste0000000000000000"],
    ["sin identificador", () => "sin-identificador"],
    ["en revisión", () => `x-${idEnRevision}`],
  ])("identificador %s: no encontrado, sin cookie y sin escritura", async (_caso, seg) => {
    const { resultado, puestas } = await enviar(seg(), { motivo: "cerrado" });
    expect(resultado).toEqual({ tipo: "no-encontrado" });
    expect(puestas).toEqual([]);
    expect(await cuenta()).toBe(0);
  });

  it("en HTTPS (x-forwarded-proto) la cookie sale Secure", async () => {
    const { puestas } = await enviar(segmento(), {}, { "x-forwarded-proto": "https" });
    expect(puestas[0].opciones.secure).toBe(true);
  });
});

describe("Action reportar · lo que no decide el envío", () => {
  it("los campos que pretenden fijar el negocio o el destino se ignoran", async () => {
    const { resultado, puestas } = await enviar(segmento(), {
      motivo: "cerrado",
      negocioId: idEnRevision,
      "$ACTION_1:0": `["${idEnRevision}"]`,
      destino: ["https://evil.example", "//evil.example"],
    });
    expect(resultado).toEqual({ tipo: "redirigir", ruta: `/negocio/${segmento()}/reportar/gracias` });
    expect(puestas[0].opciones.path).toBe(`/negocio/${segmento()}/reportar`);
    const filas = await prisma.reporte.findMany({ where: { negocioId: { in: [idPublicado, idEnRevision] } } });
    expect(filas.map((f) => f.negocioId)).toEqual([idPublicado]);
  });

  it("un nombre viejo en la URL apunta al reporte del id y vuelve con el segmento actual", async () => {
    const { resultado } = await enviar(`nombre-anterior-${idPublicado}`, { motivo: "cerrado" });
    expect(resultado).toEqual({ tipo: "redirigir", ruta: `/negocio/${segmento()}/reportar/gracias` });
  });

  it("la Action comprueba su propia ruta: desde otra, ni escribe ni redirige", async () => {
    for (const ruta of ["/", "/negocio/[ficha]", "/_actions/[...path]"]) {
      const { resultado, puestas } = await enviar(segmento(), { motivo: "cerrado" }, {}, ruta);
      expect(resultado, ruta).toEqual({ tipo: "fuera-de-ruta" });
      expect(puestas, ruta).toEqual([]);
    }
    expect(await cuenta()).toBe(0);
  });
});

describe("tabla de Actions · fallas antes del manejador", () => {
  it("un ActionError (cuerpo desmedido, no es formulario) vuelve con ?error=servidor si la ficha está publicada", async () => {
    for (const code of ["CONTENT_TOO_LARGE", "UNSUPPORTED_MEDIA_TYPE", "INTERNAL_SERVER_ERROR"] as const) {
      const { ctx, puestas } = contexto(segmento());
      const resultado = await resolverAccion("reportar", { data: undefined, error: new ActionError({ code }) }, ctx);
      expect(resultado, code).toEqual({ tipo: "redirigir", ruta: `/negocio/${segmento()}/reportar?error=servidor` });
      expect(puestas, code).toEqual([]);
    }
    expect(await cuenta()).toBe(0);
  });

  it("y si la ficha no está publicada, no encontrado", async () => {
    const { ctx } = contexto(`x-${idEnRevision}`);
    expect(await resolverAccion("reportar", { data: undefined, error: new ActionError({ code: "CONTENT_TOO_LARGE" }) }, ctx)).toEqual({
      tipo: "no-encontrado",
    });
  });

  it("un resultado con otra forma no se obedece: se trata como fuera de ruta", async () => {
    const { ctx } = contexto(segmento());
    for (const raro of [{ tipo: "redirigir", ruta: "https://evil.example" }, { tipo: "otro" }, "texto", null]) {
      expect(await resolverAccion("reportar", { data: raro, error: undefined }, ctx)).toEqual({ tipo: "fuera-de-ruta" });
    }
  });

  // 3b-1 (change `migrar-registro-astro`, MODIFIED "Cada Action corre solo…"):
  // la tabla suma `registrar` → `/registro` (lo prueba `registrar-accion`).
  // 3b-2 (change `migrar-verificacion-sms-astro`): suma `confirmar` y
  // `reenviar` → `/registro/verificar` (lo prueba `verificar-accion`).
  // Fase 4 (change `migrar-enlace-gestion-astro`, MODIFIED): la tabla suma `editar` → `/editar/[token]` (lo prueba `editar-accion`).
  // 5a (change `migrar-panel-admin-base-astro`): la tabla suma entrar y salir del panel.
  it("la tabla tiene exactamente reportar, registrar, confirmar, reenviar, editar, entrar y salir, cada una atada a su ruta", () => {
    expect(Object.keys(ACCIONES)).toEqual(["reportar", "registrar", "confirmar", "reenviar", "editar", "entrar", "salir"]);
    expect(ACCIONES.reportar.ruta).toBe("/negocio/[ficha]/reportar");
  });
});

describe("PRG · el 303 que arma el servidor", () => {
  it("solo rutas del propio sitio: empieza con / y no con // ni /\\", () => {
    expect(destinoSeguro("/negocio/x-1/reportar/gracias")).toBe(true);
    for (const malo of ["//evil.example", "/\\evil.example", "https://evil.example", "evil", "", "/\nSet-Cookie: x"]) {
      expect(destinoSeguro(malo), JSON.stringify(malo)).toBe(false);
    }
  });

  it("el 303 lleva Location, el Cache-Control de Next y cabeceras MUTABLES (para el Set-Cookie)", () => {
    const r = respuestaDeRedireccion("/negocio/x-1/reportar/gracias");
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("/negocio/x-1/reportar/gracias");
    expect(r.headers.get("cache-control")).toBe(CACHE_DE_ACCION);
    expect(CACHE_DE_ACCION).toBe("no-cache, no-store, max-age=0, must-revalidate");
    expect(() => r.headers.append("set-cookie", "a=b")).not.toThrow();
  });

  it("un destino que no es del sitio no se responde como 303", () => {
    expect(() => respuestaDeRedireccion("//evil.example")).toThrow();
  });
});

describe("Action reportar · sin Next", () => {
  it("ni la Action ni la tabla ni el pegamento importan next/*", () => {
    for (const archivo of ["src/actions/index.ts", "src/astro/acciones.ts", "src/astro/reportar.ts"]) {
      expect(readFileSync(path.join(raiz, archivo), "utf8"), archivo).not.toMatch(/from ["']next\//);
    }
  });
});
