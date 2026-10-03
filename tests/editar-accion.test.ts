/**
 * La Action `editar` con un contexto FALSO (change `migrar-enlace-gestion-astro`,
 * Fase 4, tasks.md #10 y #11; spec `plataforma-astro`, requirements "El envío
 * de la edición sin JavaScript se comporta igual que en Next" y los MODIFIED
 * "Cada Action corre solo por envío de formulario y solo desde su ruta" y
 * "Los formularios siguen el patrón POST → 303 → GET…"). Sin servidor y sin
 * `next/*`: se llama la Action real (`src/actions/index.ts`) como la llama el
 * middleware y su resultado se traduce con la tabla (`src/astro/acciones.ts`).
 * También lo que lee la página (`cargarEdicion`): el token SIEMPRE antes que
 * el resultado de la Action.
 *
 * Todo ficticio: WhatsApp 77199967xx, IPs de documentación (RFC 5737).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { ActionError } from "astro:actions";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { server } from "../src/actions/index";
import { ACCIONES, resolverAccion } from "../src/astro/acciones";
import {
  METADATOS_EDICION,
  METADATOS_GRACIAS_EDICION,
  RUTA_DE_EDITAR,
  type ContextoDeEditar,
  cargarEdicion,
  destinoDeEditar,
} from "../src/astro/editar";
import type { PrismaClient } from "../src/generated/prisma/client";
import { reiniciarCupoDeEdiciones } from "../src/lib/gestion/limite-ip";
import { ERROR_CUPO_EDICION, ERROR_GUARDAR_EDICION, TITULO_EDICION } from "../src/lib/gestion/textos";
import { generarTokenGestion } from "../src/lib/gestion/token";
import { MENSAJES_ERROR_REGISTRO } from "../src/lib/registro/textos";
import { VALORES_VACIOS_REGISTRO } from "../src/lib/registro/tipos";
import { crearClientePrueba } from "./db";
import { type SembradoDe4, borrarFichasDe4, sembrarFichasDe4 } from "./gestion-astro";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SERIE = "77199967";

let prisma: PrismaClient;
let categoriaId = 0;
let coloniaId = 0;
let s: SembradoDe4;

const consultar = (sql: string, params: unknown[]) => prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(sql, ...params);

function contexto(token: string | undefined, cabeceras: Record<string, string> = {}, routePattern = RUTA_DE_EDITAR) {
  const ctx: ContextoDeEditar & { clientAddress: string } = {
    routePattern,
    request: new Request(`https://enmirumbo.example/editar/${token ?? ""}?_action=editar`, { method: "POST", headers: cabeceras }),
    params: { token },
    // Si alguien leyera esto en vez de las cabeceras, el cupo dejaría de contar por IP.
    clientAddress: "192.0.2.250",
  };
  return ctx;
}

function formulario(campos: Record<string, string | File>) {
  const formData = new FormData();
  for (const [clave, valor] of Object.entries(campos)) formData.append(clave, valor);
  return formData;
}

const valido = (extra: Record<string, string | File> = {}) => ({
  nombre: "Cerrajería Ficticia La Llave 1",
  categoriaId: String(categoriaId),
  whatsapp: s.whatsapps.publicada,
  coloniaId: String(coloniaId),
  horario: "L-D 8am-9pm",
  ...extra,
});

async function enviar(token: string | undefined, campos: Record<string, string | File>, cabeceras: Record<string, string> = {}, routePattern?: string) {
  const ctx = contexto(token, cabeceras, routePattern);
  Reflect.set(ctx, Symbol.for("astro.actionAPIContext"), true);
  const seguro = await server.editar.call(ctx as never, formulario(campos));
  return resolverAccion("editar", seguro, ctx as never);
}

const pendientes = (negocioId: string) => prisma.edicionPendiente.count({ where: { negocioId, estado: "pendiente" } });

beforeAll(async () => {
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })).id;
  coloniaId = (await prisma.colonia.findFirstOrThrow({ orderBy: { id: "asc" } })).id;
});

beforeEach(async () => {
  reiniciarCupoDeEdiciones();
  s = await sembrarFichasDe4(consultar, { categoriaId, coloniaId, serie: SERIE });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.REGISTRO_ENCABEZADO_IP;
});

afterAll(async () => {
  await borrarFichasDe4(consultar, SERIE);
  await prisma.$disconnect();
});

describe("Action editar · desenlaces", () => {
  it("éxito: 303 a /editar/<el mismo token>/gracias y una pendiente; la ficha no cambia", async () => {
    const antes = await prisma.negocio.findUniqueOrThrow({ where: { id: s.ids.publicada } });
    const resultado = await enviar(s.tokens.publicada, valido());
    expect(resultado).toEqual({ tipo: "redirigir", ruta: `/editar/${s.tokens.publicada}/gracias` });
    expect(await pendientes(s.ids.publicada)).toBe(1);
    expect(await prisma.negocio.findUniqueOrThrow({ where: { id: s.ids.publicada } })).toEqual(antes);
  });

  it("error de validación: repintar con el mensaje junto a su campo y lo capturado, sin pendiente", async () => {
    const resultado = await enviar(s.tokens.publicada, valido({ whatsapp: "771999670", horario: "lo que escribió" }));
    expect(resultado.tipo).toBe("repintar");
    if (resultado.tipo !== "repintar") return;
    expect(resultado.estado.errores.whatsapp).toBe(MENSAJES_ERROR_REGISTRO.whatsapp);
    expect(resultado.estado.valores.horario).toBe("lo que escribió");
    expect(await pendientes(s.ids.publicada)).toBe(0);
  });

  it("token que no resuelve (inventado, regenerado, no publicada, borrada, sin forma): no encontrado y nada escrito", async () => {
    const tokens = [generarTokenGestion(), s.tokens.regenerada, s.tokens.revision, s.tokens.rechazada, s.tokens.despublicada, s.tokens.borrada, "abc", "", undefined];
    for (const token of tokens) {
      expect(await enviar(token, valido()), String(token)).toEqual({ tipo: "no-encontrado" });
    }
    expect(await prisma.edicionPendiente.count({ where: { negocio: { whatsapp: { startsWith: SERIE } }, estado: "pendiente" } })).toBe(1);
  });

  it("campo trampa: el MISMO 303 a su confirmación, sin escribir nada", async () => {
    expect(await enviar(s.tokens.publicada, valido({ sitio_web: "http://spam.example" }))).toEqual({
      tipo: "redirigir",
      ruta: `/editar/${s.tokens.publicada}/gracias`,
    });
    expect(await pendientes(s.ids.publicada)).toBe(0);
  });

  it("campo trampa con un segmento hostil: no encontrado, nunca un Location armado con él", async () => {
    for (const segmento of ["//evil.example", "/evil.example", "https:%2F%2Fevil.example", "a".repeat(44), "x/../../registro"]) {
      expect(await enviar(segmento, valido({ sitio_web: "http://spam.example" })), segmento).toEqual({ tipo: "no-encontrado" });
    }
  });

  it("el token sale del segmento de la ruta: un token o un negocioId en el cuerpo se ignoran", async () => {
    const resultado = await enviar(s.tokens.publicada, valido({ token: s.tokens.pendiente, negocioId: s.ids.pendiente }));
    expect(resultado).toEqual({ tipo: "redirigir", ruta: `/editar/${s.tokens.publicada}/gracias` });
    expect(await pendientes(s.ids.publicada)).toBe(1);
    // La de la otra ficha sigue siendo la que sembró la prueba, sola.
    expect(await prisma.edicionPendiente.findFirstOrThrow({ where: { negocioId: s.ids.pendiente, estado: "pendiente" } })).toMatchObject({
      horario: "L-D 7am-10pm (pendiente ficticia)",
    });
  });

  it("un archivo foto en el cuerpo se descarta: ni foto en la ficha ni en la pendiente", async () => {
    const foto = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "foto.jpg", { type: "image/jpeg" });
    expect((await enviar(s.tokens.publicada, valido({ foto }))).tipo).toBe("redirigir");
    expect((await prisma.negocio.findUniqueOrThrow({ where: { id: s.ids.publicada } })).fotoClave).toBeNull();
  });

  it("la IP sale del encabezado declarado (el ÚLTIMO valor), nunca de clientAddress: el cuarto válido vuelve con el cupo", async () => {
    process.env.REGISTRO_ENCABEZADO_IP = "x-forwarded-for";
    for (let i = 1; i <= 3; i++) {
      const r = await enviar(s.tokens.cupo, valido({ whatsapp: s.whatsapps.cupo, horario: `cupo ${i}` }), { "x-forwarded-for": `198.51.100.${i}, 203.0.113.7` });
      expect(r.tipo, `envío ${i}`).toBe("redirigir");
    }
    const cuarto = await enviar(s.tokens.cupo, valido({ whatsapp: s.whatsapps.cupo, horario: "cupo 4" }), { "x-forwarded-for": "198.51.100.4, 203.0.113.7" });
    expect(cuarto.tipo).toBe("repintar");
    if (cuarto.tipo === "repintar") expect(cuarto.estado.errores.general).toBe(ERROR_CUPO_EDICION);
    // Otra IP (último valor distinto) sí pasa.
    expect((await enviar(s.tokens.cupo, valido({ whatsapp: s.whatsapps.cupo, horario: "otra ip" }), { "x-forwarded-for": "203.0.113.8" })).tipo).toBe("redirigir");
  });

  it("la Action comprueba su propia ruta: desde otra, ni escribe ni redirige", async () => {
    for (const ruta of ["/", "/registro", "/editar/[token]/gracias", "/negocio/[ficha]/reportar"]) {
      expect(await enviar(s.tokens.publicada, valido(), {}, ruta), ruta).toEqual({ tipo: "fuera-de-ruta" });
    }
    expect(await pendientes(s.ids.publicada)).toBe(0);
  });

  it("el log no lleva el token ni su prefijo", async () => {
    const escrito: string[] = [];
    for (const nivel of ["log", "warn", "error", "info", "debug"] as const) {
      vi.spyOn(console, nivel).mockImplementation((...args: unknown[]) => void escrito.push(args.map(String).join(" ")));
    }
    await enviar(s.tokens.publicada, valido({ sitio_web: "http://spam.example" }));
    await enviar(s.tokens.publicada, valido({ whatsapp: "1" }));
    await enviar(s.tokens.publicada, valido());
    await enviar(s.tokens.regenerada, valido());
    for (const linea of escrito) {
      for (const token of [s.tokens.publicada, s.tokens.regenerada]) expect(linea).not.toContain(token.slice(0, 8));
    }
  });
});

describe("tabla de Actions · editar (MODIFIED de 3a)", () => {
  // 5a (change `migrar-panel-admin-base-astro`) suma entrar y salir del panel.
  it("siete Actions en la tabla; editar atada a /editar/[token], sin compuerta", () => {
    expect(Object.keys(ACCIONES)).toEqual(["reportar", "registrar", "confirmar", "reenviar", "editar", "entrar", "salir"]);
    expect(ACCIONES.editar.puedeCorrer).toBeUndefined();
    expect(ACCIONES.editar.ruta).toBe("/editar/[token]");
    expect(RUTA_DE_EDITAR).toBe("/editar/[token]");
  });

  it("el destino se valida contra la ruta pedida: solo /editar/<el mismo token>/gracias", async () => {
    const ctx = contexto(s.tokens.publicada);
    const otro = generarTokenGestion();
    const raros = [
      `/editar/${otro}/gracias`,
      `/editar/${s.tokens.publicada}`,
      `/editar/${s.tokens.publicada}/gracias?x=1`,
      "/registro/gracias",
      `/editar/${s.tokens.publicada}/gracias/`,
    ];
    for (const ruta of raros) {
      expect(await resolverAccion("editar", { data: { tipo: "redirigir", ruta }, error: undefined }, ctx as never), ruta).toEqual({ tipo: "no-encontrado" });
    }
    expect(
      await resolverAccion("editar", { data: { tipo: "redirigir", ruta: `/editar/${s.tokens.publicada}/gracias` }, error: undefined }, ctx as never),
    ).toEqual({ tipo: "redirigir", ruta: `/editar/${s.tokens.publicada}/gracias` });
    // Con un segmento que no tiene forma de token no se obedece ni su propio "gracias".
    const hostil = contexto("abc");
    expect(await resolverAccion("editar", { data: { tipo: "redirigir", ruta: "/editar/abc/gracias" }, error: undefined }, hostil as never)).toEqual({
      tipo: "no-encontrado",
    });
  });

  it("destinoDeEditar: el único destino de un token con forma; null para todo lo demás", () => {
    expect(destinoDeEditar(s.tokens.publicada)).toBe(`/editar/${s.tokens.publicada}/gracias`);
    for (const raro of ["", "abc", "//evil.example", `${s.tokens.publicada}/x`, undefined]) expect(destinoDeEditar(raro), String(raro)).toBeNull();
  });

  it("un ActionError (cuerpo desmedido o que no es formulario): repintar con el error de la edición y los valores vacíos, sin leer la base", async () => {
    const lectura = vi.spyOn(prisma.negocio, "findUnique");
    for (const code of ["CONTENT_TOO_LARGE", "UNSUPPORTED_MEDIA_TYPE", "INTERNAL_SERVER_ERROR"] as const) {
      const resultado = await resolverAccion("editar", { data: undefined, error: new ActionError({ code }) }, contexto(s.tokens.publicada) as never);
      expect(resultado, code).toEqual({ tipo: "repintar", estado: { errores: { general: ERROR_GUARDAR_EDICION }, valores: VALORES_VACIOS_REGISTRO } });
    }
    expect(lectura).not.toHaveBeenCalled();
  });
});

describe("lo que pinta /editar/[token] · cargarEdicion", () => {
  it("con un token vigente y sin envío: lo publicado, sin aviso", async () => {
    const pantalla = await cargarEdicion(s.tokens.publicada, undefined);
    expect(pantalla.tipo).toBe("pantalla");
    if (pantalla.tipo !== "pantalla") return;
    expect(pantalla.tieneEdicionPendiente).toBe(false);
    expect(pantalla.estado).toEqual({ errores: {}, valores: expect.objectContaining({ horario: "L-S 9am-6pm", whatsapp: s.whatsapps.publicada }) });
    expect(pantalla.categorias.length).toBeGreaterThan(0);
  });

  it("con pendiente: lo que el dueño mandó y el aviso", async () => {
    const pantalla = await cargarEdicion(s.tokens.pendiente, undefined);
    expect(pantalla).toMatchObject({ tipo: "pantalla", tieneEdicionPendiente: true, estado: { valores: { horario: "L-D 7am-10pm (pendiente ficticia)" } } });
  });

  it("el token va PRIMERO: un repintado nunca pinta el formulario de un enlace que no resuelve", async () => {
    const repintado = { data: { errores: { whatsapp: "x" }, valores: VALORES_VACIOS_REGISTRO }, error: undefined };
    for (const token of [generarTokenGestion(), s.tokens.regenerada, s.tokens.despublicada, s.tokens.borrada, "abc"]) {
      expect(await cargarEdicion(token, repintado), token.slice(0, 3)).toEqual({ tipo: "no-encontrado" });
    }
  });

  it("si la Action dijo no encontrado (el token dejó de valer al enviar), la 404 aunque el token abra", async () => {
    expect(await cargarEdicion(s.tokens.publicada, { data: undefined, error: new ActionError({ code: "NOT_FOUND" }) })).toEqual({ tipo: "no-encontrado" });
  });

  it("con un repintado válido: el estado de la Action, no lo de la base", async () => {
    const estado = { errores: { whatsapp: MENSAJES_ERROR_REGISTRO.whatsapp }, valores: { ...VALORES_VACIOS_REGISTRO, horario: "capturado" } };
    expect(await cargarEdicion(s.tokens.publicada, { data: estado, error: undefined })).toMatchObject({ tipo: "pantalla", estado });
    // Con otra forma, se ignora y se pinta lo de la base.
    expect(await cargarEdicion(s.tokens.publicada, { data: { errores: { x: 1 } }, error: undefined })).toMatchObject({
      tipo: "pantalla",
      estado: { errores: {} },
    });
  });

  it("los metadatos: 'Edita tu ficha' y noindex, nofollow; la confirmación, noindex, nofollow", () => {
    expect(METADATOS_EDICION).toEqual({ title: TITULO_EDICION, robots: { index: false, follow: false } });
    expect(METADATOS_GRACIAS_EDICION).toEqual({ robots: { index: false, follow: false } });
  });
});

describe("Action editar · sin Next y sin clientAddress", () => {
  it("ni la Action, ni la tabla, ni el pegamento importan next/*, y src/lib/gestion tampoco", () => {
    for (const archivo of ["src/actions/index.ts", "src/astro/acciones.ts", "src/astro/editar.ts"]) {
      expect(readFileSync(path.join(raiz, archivo), "utf8"), archivo).not.toMatch(/from ["']next\//);
    }
  });

  it("la IP se lee de las cabeceras de la petición, nunca de clientAddress", () => {
    const fuente = readFileSync(path.join(raiz, "src/astro/editar.ts"), "utf8");
    expect(fuente).toMatch(/ipDeEncabezados\(\s*contexto\.request\.headers\s*\)/);
    expect(fuente).not.toMatch(/clientAddress|getClientIpAddress/);
  });

  it("el pegamento no escribe nada al log (ni la ruta, ni los parámetros, ni el cuerpo)", () => {
    const fuente = readFileSync(path.join(raiz, "src/astro/editar.ts"), "utf8");
    expect(fuente).not.toMatch(/console\./);
  });
});
