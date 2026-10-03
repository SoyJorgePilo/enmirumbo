/**
 * Spec `plataforma-astro` (change `migrar-enlace-gestion-astro`, T-025, Fase
 * 4). tasks.md #6, sobre la SALIDA SERVIDA:
 *
 * - "El token del enlace no sale por ningún canal": el recorrido completo
 *   (apertura, envío con errores, envío válido, confirmación, otro origen,
 *   guardado que falla y base caída) buscando `T` y su prefijo de 8 en
 *   cuerpos, cabeceras y en TODO lo que escribe el emulador (`stdout` y
 *   `stderr`); sitemap y robots; caché sin copias compartidas.
 * - "Las pantallas del enlace llevan su política de referente y quedan fuera
 *   de la medición": `strict-origin` en las siete formas de respuesta, la
 *   `<meta>` en las 200, la global en `/` y `/loquesea`, y ninguna pantalla
 *   del enlace con el script de la medición aunque esté configurada.
 * - "Editar el WhatsApp no toca la verificación por SMS" (Twilio falso).
 *
 * Todo ficticio: WhatsApp 77199965xx, IPs de documentación, dominios `.example`.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";

import { parse } from "node-html-parser";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { enviarFormulario } from "../scripts/enviar-formulario.mjs";
import type { PrismaClient } from "../src/generated/prisma/client";
import { VARIABLE_SRC, VARIABLE_WEBSITE_ID } from "../src/lib/analitica/config";
import { aplicarEdicion } from "../src/lib/gestion/ediciones";
import { cabecerasDeSeguridad } from "../src/lib/seguridad/csp";
import {
  VARIABLE_BANDERA,
  VARIABLE_SECRETO,
  VARIABLE_TWILIO_AUTH_TOKEN,
  VARIABLE_TWILIO_SERVICE_SID,
  VARIABLE_TWILIO_SID,
} from "../src/lib/verificacion/config";
import { crearClientePrueba } from "./db";
import {
  MARCA_FALLA_GUARDADO,
  type SembradoDe4,
  apariciones,
  borrarFichasDe4,
  instalarFallaDeGuardado,
  quitarFallaDeGuardado,
  sembrarFichasDe4,
} from "./gestion-astro";
import { type Emulador, construirSiHaceFalta, levantarEmulador } from "./salida-astro";

const URL_PUBLICA = "https://enmirumbo.example";
const SERIE = "77199965";
const BASE_CAIDA = "postgresql://usuario:claveFicticia4@127.0.0.1:1/ninguna";
const PRECARGA = "tests/fixtures/twilio-falso.mjs";
const GLOBAL = cabecerasDeSeguridad().find(({ key }) => key.toLowerCase() === "referrer-policy")!.value;

let prisma: PrismaClient;
let s: SembradoDe4;
let conSitio: Emulador;
let caida: Emulador;
let medido: Emulador;
let bandera: Emulador;
let dir = "";
let registroTwilio = "";
let categoriaId = 0;
let coloniaId = 0;

const consultar = (sql: string, params: unknown[]) => prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(sql, ...params);

type Visto = { etiqueta: string; status: number; cabeceras: Array<[string, string]>; cuerpo: string; location: string | null };

/** Una petición y todo lo que volvió (cuerpo y cabeceras), para buscar el token después. */
async function ver(e: Emulador, etiqueta: string, ruta: string, init: RequestInit = {}): Promise<Visto> {
  const r = await e.pedir(ruta, init);
  return { etiqueta, status: r.status, cabeceras: [...r.headers], cuerpo: await r.text(), location: r.headers.get("location") };
}

function cuerpoDeEdicion(extra: Record<string, string> = {}, ficha: keyof SembradoDe4["tokens"] = "publicada") {
  const datos = new FormData();
  for (const [k, v] of Object.entries({
    nombre: "Cerrajería Ficticia",
    categoriaId: String(categoriaId),
    whatsapp: s.whatsapps[ficha],
    coloniaId: String(coloniaId),
    horario: "L-V 9am-5pm",
    ...extra,
  })) {
    datos.append(k, v);
  }
  return datos;
}

const postEdicion = (e: Emulador, ficha: keyof SembradoDe4["tokens"], extra: Record<string, string> = {}, cabeceras: Record<string, string> = {}) =>
  ({ method: "POST", body: cuerpoDeEdicion(extra, ficha), headers: { origin: e.base, ...cabeceras } }) as RequestInit;

beforeAll(async () => {
  construirSiHaceFalta();
  dir = mkdtempSync(path.join(tmpdir(), "gestion-fugas-"));
  registroTwilio = path.join(dir, "twilio.jsonl");
  writeFileSync(registroTwilio, "");
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })).id;
  coloniaId = (await prisma.colonia.findFirstOrThrow({ orderBy: { id: "asc" } })).id;
  await instalarFallaDeGuardado(consultar);
  s = await sembrarFichasDe4(consultar, { categoriaId, coloniaId, serie: SERIE });
  [conSitio, caida, medido, bandera] = await Promise.all([
    levantarEmulador({ SITIO_URL: URL_PUBLICA, REGISTRO_ENCABEZADO_IP: "x-forwarded-for" }),
    levantarEmulador({ SITIO_URL: URL_PUBLICA, DATABASE_URL: BASE_CAIDA }),
    levantarEmulador({ SITIO_URL: URL_PUBLICA, [VARIABLE_SRC]: "https://cloud.umami.is/script.js", [VARIABLE_WEBSITE_ID]: "00000000-0000-0000-0000-000000000000" }),
    levantarEmulador(
      {
        SITIO_URL: URL_PUBLICA,
        [VARIABLE_BANDERA]: "1",
        [VARIABLE_SECRETO]: randomBytes(32).toString("hex"),
        [VARIABLE_TWILIO_SID]: "ACtest00000000000000000000000000",
        [VARIABLE_TWILIO_AUTH_TOKEN]: "token-ficticio-de-pruebas",
        [VARIABLE_TWILIO_SERVICE_SID]: "VAtest00000000000000000000000000",
        TWILIO_FALSO_GUION: "enviado",
        TWILIO_FALSO_REGISTRO: registroTwilio,
      },
      { precargas: [PRECARGA] },
    ),
  ]);
}, 300_000);

afterAll(async () => {
  for (const e of [conSitio, caida, medido, bandera]) e?.detener();
  await quitarFallaDeGuardado(consultar);
  await borrarFichasDe4(consultar, SERIE);
  await prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

// ── El token del enlace no sale por ningún canal ────────────────────────────

describe("gestión · el token no sale por ningún canal", () => {
  it("recorrido completo: T y su prefijo solo en las URLs pedidas y en el Location del 303; ni cuerpos, ni otra cabecera, ni el log", async () => {
    const T = s.tokens.publicada;
    const F = s.tokens.falla;
    const vistos: Visto[] = [];
    const base = { "x-forwarded-for": "198.51.100.60" };
    vistos.push(await ver(conSitio, "apertura", `/editar/${T}`));
    vistos.push(await ver(conSitio, "HEAD", `/editar/${T}`, { method: "HEAD" }));
    vistos.push(await ver(conSitio, "con errores", `/editar/${T}?_action=editar`, postEdicion(conSitio, "publicada", { whatsapp: "12" }, base)));
    const valido = await ver(conSitio, "válido", `/editar/${T}?_action=editar`, postEdicion(conSitio, "publicada", { horario: "L-D 9am-1pm" }, base));
    vistos.push(valido);
    vistos.push(await ver(conSitio, "confirmación", `/editar/${T}/gracias`));
    vistos.push(await ver(conSitio, "otro origen", `/editar/${T}?_action=editar`, postEdicion(conSitio, "publicada", {}, { ...base, origin: "https://ajeno.example" })));
    vistos.push(await ver(conSitio, "origen null", `/editar/${T}?_action=editar`, postEdicion(conSitio, "publicada", {}, { ...base, origin: "null" })));
    vistos.push(await ver(conSitio, "guardado falla", `/editar/${F}?_action=editar`, postEdicion(conSitio, "falla", { horario: MARCA_FALLA_GUARDADO }, base)));
    vistos.push(await ver(caida, "base caída al abrir", `/editar/${T}`));
    vistos.push(await ver(caida, "base caída al enviar", `/editar/${T}?_action=editar`, postEdicion(caida, "publicada", {}, base)));
    vistos.push(await ver(conSitio, "ActionError", `/editar/${T}?_action=editar`, { method: "POST", body: "x", headers: { origin: conSitio.base, "content-type": "text/plain" } }));

    expect(valido.status).toBe(303);
    expect(vistos.map((v) => `${v.etiqueta} ${v.status}`)).toEqual([
      "apertura 200",
      "HEAD 200",
      "con errores 200",
      "válido 303",
      "confirmación 200",
      "otro origen 403",
      "origen null 403",
      "guardado falla 200",
      "base caída al abrir 500",
      "base caída al enviar 500",
      "ActionError 200",
    ]);
    for (const v of vistos) {
      const token = v.etiqueta === "guardado falla" ? F : T;
      expect(apariciones(v.cuerpo, token), `${v.etiqueta} · cuerpo`).toEqual([]);
      for (const [nombre, valor] of v.cabeceras) {
        if (nombre === "location") {
          expect(valor, v.etiqueta).toBe(`/editar/${T}/gracias`);
          continue;
        }
        expect(apariciones(valor, token), `${v.etiqueta} · ${nombre}`).toEqual([]);
      }
      // Sin copias del token en metadatos, canónica, og:url ni JSON-LD.
      expect(v.cuerpo, v.etiqueta).not.toMatch(/rel="canonical"|og:url|application\/ld\+json/);
      // Ninguna respuesta bajo /editar/ permite caché compartida.
      const cache = v.cabeceras.find(([n]) => n === "cache-control")?.[1] ?? "";
      expect(cache, v.etiqueta).toMatch(/no-store/);
      expect(cache, v.etiqueta).not.toMatch(/public|s-maxage/);
    }
    // Lo que escribió la función (el marco incluido): ni T, ni su prefijo, ni el de F.
    const log = `${conSitio.registro()}\n${caida.registro()}`;
    expect(apariciones(log, T), "log").toEqual([]);
    expect(apariciones(log, F), "log").toEqual([]);
    // Y sí registró algo (si no, la búsqueda no significaría nada).
    expect(caida.registro().length).toBeGreaterThan(0);
  });

  it("tras un error sin JS, la dirección es /editar/T?_action=editar: el token solo en la ruta", async () => {
    const r = await enviarFormulario({
      urlPagina: new URL(`/editar/${s.tokens.envios}`, conSitio.base).toString(),
      elecciones: { whatsapp: "771" },
      cabecerasExtra: { "x-forwarded-for": "198.51.100.61" },
    });
    expect(r.cadena[1].status).toBe(200);
    expect(new URL(r.final.url).pathname + new URL(r.final.url).search).toBe(`/editar/${s.tokens.envios}?_action=editar`);
    expect(apariciones(r.final.html, s.tokens.envios)).toEqual([]);
  });

  it("un eco inyectado se detecta: un atributo con el token reprueba la búsqueda", () => {
    const html = `<form><input id="whatsapp" data-token="${s.tokens.publicada}"></form>`;
    expect(apariciones(html, s.tokens.publicada).length).toBeGreaterThan(0);
    expect(apariciones(`<a href="/editar/${s.tokens.publicada.slice(0, 8)}">`, s.tokens.publicada).length).toBeGreaterThan(0);
  });

  it("sitemap.xml y robots.txt no mencionan /editar", async () => {
    for (const ruta of ["/sitemap.xml", "/robots.txt"]) {
      const cuerpo = await (await conSitio.pedir(ruta)).text();
      expect(cuerpo, ruta).not.toContain("/editar");
      expect(cuerpo, ruta).not.toContain(s.tokens.publicada.slice(0, 8));
    }
  });
});

// ── La política de referente y la medición del grupo ────────────────────────

describe("gestión · la política de referente del grupo y la medición", () => {
  it("strict-origin en las siete formas de respuesta; la <meta> en las 200; la global en / y /loquesea", async () => {
    const T = s.tokens.envios;
    // Una petición a la vez (antes salían las siete juntas): con PGlite
    // (`prisma dev`) el pool de la función multiplexa UNA sesión y dos envíos
    // simultáneos mezclan el protocolo ("bind message supplies N parameters,
    // but prepared statement \"\" requires 0") → la 500 de una lectura sana. Lo
    // que se mide aquí son cabeceras y `<meta>` por forma, no concurrencia
    // (la ráfaga real vive en `plataforma-astro-gestion-envio`, con PostgreSQL).
    const formas: Array<[string, () => Promise<Response>, boolean]> = [
      ["GET /editar/T", () => conSitio.pedir(`/editar/${T}`), true],
      ["GET /editar/T/gracias", () => conSitio.pedir(`/editar/${T}/gracias`), true],
      ["GET /editar/<inventado>", () => conSitio.pedir(`/editar/${"Z".repeat(43)}`), false],
      ["303", () => conSitio.pedir(`/editar/${T}?_action=editar`, postEdicion(conSitio, "envios", { horario: "forma 303" }, { "x-forwarded-for": "198.51.100.62" })), false],
      ["200 con errores", () => conSitio.pedir(`/editar/${T}?_action=editar`, postEdicion(conSitio, "envios", { whatsapp: "1" }, { "x-forwarded-for": "198.51.100.63" })), true],
      ["403", () => conSitio.pedir(`/editar/${T}?_action=editar`, postEdicion(conSitio, "envios", {}, { origin: "https://ajeno.example" })), false],
      ["500", () => caida.pedir(`/editar/${T}?_action=editar`, postEdicion(caida, "envios")), false],
    ];
    const esperados: Record<string, number> = {
      "GET /editar/T": 200,
      "GET /editar/T/gracias": 200,
      "GET /editar/<inventado>": 404,
      "303": 303,
      "200 con errores": 200,
      "403": 403,
      "500": 500,
    };
    for (const [nombre, pedir, conMeta] of formas) {
      const r = await pedir();
      expect(r.status, nombre).toBe(esperados[nombre]);
      expect(r.headers.get("referrer-policy"), nombre).toBe("strict-origin");
      const html = await r.text();
      const meta = parse(html).querySelector('meta[name="referrer"]')?.getAttribute("content") ?? null;
      expect(meta, nombre).toBe(conMeta ? "strict-origin" : null);
    }
    for (const ruta of ["/", "/loquesea"]) {
      expect((await conSitio.pedir(ruta)).headers.get("referrer-policy"), ruta).toBe(GLOBAL);
    }
  });

  it("un envío con el Origin del sitio y el Referer reducido al origen (lo que manda strict-origin) llega al 303", async () => {
    const r = await conSitio.pedir(
      `/editar/${s.tokens.envios}?_action=editar`,
      postEdicion(conSitio, "envios", { horario: "referer reducido" }, { referer: `${conSitio.base}/`, "x-forwarded-for": "198.51.100.64" }),
    );
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe(`/editar/${s.tokens.envios}/gracias`);
  });

  it("con la medición configurada, ninguna pantalla del enlace trae el script, su dominio ni data-umami-*", async () => {
    const T = s.tokens.coloniaOtra;
    const respuestas = [
      await medido.pedir(`/editar/${T}`),
      await medido.pedir(`/editar/${T}?_action=editar`, postEdicion(medido, "coloniaOtra", { whatsapp: "1" })),
      await medido.pedir(`/editar/${T}/gracias`),
      await medido.pedir(`/editar/${"Z".repeat(43)}`),
      await medido.pedir("/editar/abc"),
    ];
    expect(respuestas.map((r) => r.status)).toEqual([200, 200, 200, 404, 404]);
    for (const r of respuestas) {
      const html = await r.text();
      expect(html).not.toMatch(/umami|data-website-id|data-umami-/);
    }
    // Control: la portada sí mide (la configuración llegó).
    expect(await (await medido.pedir("/")).text()).toContain("cloud.umami.is/script.js");
  });
});

// ── Editar el WhatsApp no toca la verificación por SMS ──────────────────────

describe("gestión · editar el WhatsApp no toca la verificación por SMS", () => {
  it("con la bandera encendida: ninguna petición al proveedor, ninguna cookie, las marcas intactas; al aplicar solo la del número nuevo la pierde", async () => {
    const verificada = new Date("2026-08-05T10:00:00.000Z");
    await prisma.negocio.updateMany({ where: { id: { in: [s.ids.envios, s.ids.cupo] } }, data: { numeroVerificadoEn: verificada } });
    const antes = readFileSync(registroTwilio, "utf8");
    const nuevoNumero = `${SERIE}80`;
    const cambiaNumero = await bandera.pedir(
      `/editar/${s.tokens.envios}?_action=editar`,
      postEdicion(bandera, "envios", { whatsapp: nuevoNumero }, { cookie: "nu_paso=fabricada.cualquiera" }),
    );
    const soloHorario = await bandera.pedir(`/editar/${s.tokens.cupo}?_action=editar`, postEdicion(bandera, "cupo", { horario: "solo cambia el horario" }));
    for (const r of [cambiaNumero, soloHorario]) {
      expect(r.status).toBe(303);
      expect(r.headers.getSetCookie()).toEqual([]);
    }
    expect(readFileSync(registroTwilio, "utf8")).toBe(antes);
    for (const id of [s.ids.envios, s.ids.cupo]) {
      expect((await prisma.negocio.findUniqueOrThrow({ where: { id } })).numeroVerificadoEn).toEqual(verificada);
    }
    const [deNumero] = await prisma.edicionPendiente.findMany({ where: { negocioId: s.ids.envios, estado: "pendiente" } });
    const [deHorario] = await prisma.edicionPendiente.findMany({ where: { negocioId: s.ids.cupo, estado: "pendiente" } });
    expect(deNumero.whatsapp).toBe(nuevoNumero);
    expect((await aplicarEdicion(prisma, deNumero.id)).resultado).toBe("aplicada");
    expect((await aplicarEdicion(prisma, deHorario.id)).resultado).toBe("aplicada");
    expect((await prisma.negocio.findUniqueOrThrow({ where: { id: s.ids.envios } })).numeroVerificadoEn).toBeNull();
    expect((await prisma.negocio.findUniqueOrThrow({ where: { id: s.ids.cupo } })).numeroVerificadoEn).toEqual(verificada);
  });
});
