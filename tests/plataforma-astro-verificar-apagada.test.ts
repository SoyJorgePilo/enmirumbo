/**
 * Spec `plataforma-astro` (change `migrar-verificacion-sms-astro`, Fase 3b-2;
 * tasks.md #4): requirement "Con la verificación apagada, `/registro/verificar`
 * responde como una dirección que no existe" y el scenario "la compuerta va
 * antes del manejador" del MODIFIED de la tabla de Actions.
 *
 * Sobre la SALIDA SERVIDA, con el Twilio FALSO precargado (registro de
 * llamadas) y, en la configuración con credenciales, la sonda de lecturas
 * (`tests/fixtures/contar-lecturas.mjs`). Las tres configuraciones apagadas
 * se levantan de una en una (con PGlite, varias funciones a la vez agotan sus
 * conexiones). La build y el emulador comparten entorno (sin `SITIO_URL`),
 * así que `/a/b/c` (la 404 de la CDN) también se compara byte a byte.
 *
 * Todo ficticio: WhatsApp 77199986xx, credenciales `ACtest…`, secreto
 * generado aquí, IPs de documentación (RFC 5737).
 */
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { CACHE_DE_ACCION } from "../src/astro/acciones";
import { CACHE_DE_HTML_DINAMICO } from "../src/astro/cabeceras";
import type { PrismaClient } from "../src/generated/prisma/client";
import { cabecerasDeSeguridad } from "../src/lib/seguridad/csp";
import {
  VARIABLE_BANDERA,
  VARIABLE_SECRETO,
  VARIABLE_TWILIO_AUTH_TOKEN,
  VARIABLE_TWILIO_SERVICE_SID,
  VARIABLE_TWILIO_SID,
} from "../src/lib/verificacion/config";
import { COOKIE_PASO } from "../src/lib/verificacion/paso";
import { crearClientePrueba } from "./db";
import { borrarNegociosSembrados } from "./limpieza";
import { postearPorTrozos } from "./postear-por-trozos";
import { type Emulador, construirSiHaceFalta, levantarEmulador } from "./salida-astro";
import { cookieDePaso, leerLlamadas } from "./verificar-astro";

const SECRETO = randomBytes(32).toString("hex");
const CREDENCIALES = {
  [VARIABLE_TWILIO_SID]: "ACtest00000000000000000000000000",
  [VARIABLE_TWILIO_AUTH_TOKEN]: "token-ficticio-de-pruebas",
  [VARIABLE_TWILIO_SERVICE_SID]: "VAtest00000000000000000000000000",
};
const SIN_VERIFICACION = Object.fromEntries(
  [VARIABLE_BANDERA, VARIABLE_SECRETO, VARIABLE_TWILIO_SID, VARIABLE_TWILIO_AUTH_TOKEN, VARIABLE_TWILIO_SERVICE_SID].map((v) => [v, undefined]),
);
const CONFIGURACIONES = {
  "sin-variables": {},
  "sin-bandera": { [VARIABLE_SECRETO]: SECRETO, ...CREDENCIALES },
  "secreto-corto": { [VARIABLE_BANDERA]: "1", [VARIABLE_SECRETO]: "secreto-de-20-caract", ...CREDENCIALES },
} as const;
type Configuracion = keyof typeof CONFIGURACIONES;
const WHATSAPP = "7719998601";
const RUTA = "/registro/verificar";
const MIB = 1024 * 1024;

let prisma: PrismaClient;
let dir = "";
let negocioId = "";

const sinFecha = (h: Headers) => Object.fromEntries([...h].filter(([k]) => k !== "date"));

/** Las cuatro cabeceras de seguridad, y nada que anuncie el marco. */
function lasCuatro(h: Headers, etiqueta: string) {
  for (const { key, value } of cabecerasDeSeguridad()) expect(h.get(key), `${etiqueta} · ${key}`).toBe(value);
  expect(h.get("x-powered-by"), etiqueta).toBeNull();
}

/** Un `<script>` que no sea JSON-LD. */
const SCRIPT_PROPIO = /<script(?![^>]*application\/ld\+json)[\s>]/i;

type Levantado = { e: Emulador; llamadas: () => unknown[]; sonda: string };

async function levantar(nombre: Configuracion, conSonda = false): Promise<Levantado> {
  const registro = path.join(dir, `${nombre}.jsonl`);
  const sonda = path.join(dir, `${nombre}-sonda.json`);
  writeFileSync(registro, "");
  const e = await levantarEmulador(
    {
      ...SIN_VERIFICACION,
      ...CONFIGURACIONES[nombre],
      SITIO_URL: undefined,
      REGISTRO_ENCABEZADO_IP: "x-forwarded-for",
      TWILIO_FALSO_GUION: "enviado,approved",
      TWILIO_FALSO_REGISTRO: registro,
      ...(conSonda ? { CONTAR_LECTURAS_ARCHIVO: sonda } : {}),
    },
    { precargas: ["tests/fixtures/twilio-falso.mjs", ...(conSonda ? ["tests/fixtures/contar-lecturas.mjs"] : [])] },
  );
  return { e, llamadas: () => leerLlamadas(registro), sonda };
}

function postear(e: Emulador, ruta: string, cuerpo: string, extra: Record<string, string> = {}) {
  return e.pedir(ruta, {
    method: "POST",
    body: cuerpo,
    headers: { origin: e.base, "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "198.51.100.60", ...extra },
  });
}

/**
 * Un POST cuyo cuerpo NO termina de llegar: manda el principio y espera la
 * respuesta sin mandar el resto. Si alguien lee el cuerpo, se queda esperando
 * y no hay respuesta en `esperaMs`.
 */
function postSinTerminar(e: Emulador, ruta: string, cabeceras: Record<string, string>, esperaMs = 3000): Promise<number | "sin-respuesta"> {
  return new Promise((listo, falla) => {
    const peticion = http.request(new URL(ruta, e.base), { method: "POST", headers: { origin: e.base, ...cabeceras } }, (r) => {
      r.resume();
      listo(r.statusCode ?? 0);
      peticion.destroy();
    });
    peticion.on("error", () => undefined);
    peticion.write("codigo=12");
    setTimeout(() => {
      listo("sin-respuesta");
      peticion.destroy();
    }, esperaMs);
    peticion.on("timeout", () => falla(new Error("timeout")));
  });
}

/** 200 MB por trozos, sin `Content-Length`; deja de escribir en cuanto llega la respuesta (`tests/postear-por-trozos.ts`). */
async function enviar200Mb(e: Emulador, cookie: string): Promise<{ status: number; escritos: number }> {
  const trozo = Buffer.alloc(MIB, 0x41);
  const { status, escritos } = await postearPorTrozos(
    new URL(`${RUTA}?_action=confirmar`, e.base),
    { origin: e.base, cookie, "content-type": "application/x-www-form-urlencoded", "transfer-encoding": "chunked" },
    {
      *trozos() {
        yield "codigo=";
        for (let i = 0; i < 200; i++) yield trozo;
      },
    },
  );
  return { status, escritos };
}

beforeAll(async () => {
  construirSiHaceFalta();
  dir = mkdtempSync(path.join(tmpdir(), "verificar-apagada-"));
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  await borrarNegociosSembrados(prisma, [WHATSAPP]);
  const categoria = await prisma.categoria.findFirstOrThrow({ orderBy: { id: "asc" } });
  negocioId = (
    await prisma.negocio.create({ data: { nombre: "Papelería Ficticia Apagada", categoriaId: categoria.id, whatsapp: WHATSAPP, consintioAvisoEn: new Date() } })
  ).id;
}, 300_000);

afterAll(async () => {
  await borrarNegociosSembrados(prisma, [WHATSAPP]);
  await prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

/** Lo que respondió cada configuración, para compararlas al final. */
const cuerpos: Record<string, Record<string, string>> = {};

describe("apagada en las tres configuraciones", () => {
  for (const nombre of Object.keys(CONFIGURACIONES) as Configuracion[]) {
    it(`${nombre}: GET, HEAD y los POST responden la 404 de no encontrado, igual que /loquesea, sin script, sin medición y sin cookies`, async () => {
      const { e, llamadas } = await levantar(nombre);
      try {
        const filasAntes = await prisma.intentoDeCupo.count();
        const loquesea = await (await e.pedir("/loquesea")).text();
        expect(loquesea).toContain("No encontramos esta página");

        const get = await e.pedir(RUTA, { headers: { "x-forwarded-for": "198.51.100.61" } });
        const html = await get.text();
        expect(get.status).toBe(404);
        expect(html).toBe(loquesea);
        expect(html).not.toMatch(SCRIPT_PROPIO);
        expect(html.toLowerCase()).not.toContain("umami");
        expect(html).toMatch(/<meta name="robots" content="noindex/);
        expect(get.headers.getSetCookie()).toEqual([]);
        expect(get.headers.get("cache-control")).toBe(CACHE_DE_HTML_DINAMICO);
        lasCuatro(get.headers, `${nombre} GET`);

        const head = await e.pedir(RUTA, { method: "HEAD" });
        expect(head.status).toBe(404);
        expect(head.headers.getSetCookie()).toEqual([]);

        const formas = {
          confirmar: await postear(e, `${RUTA}?_action=confirmar`, "codigo=123456"),
          reenviar: await postear(e, `${RUTA}?_action=reenviar`, ""),
          "sin-accion": await postear(e, RUTA, "codigo=123456"),
          json: await e.pedir(`${RUTA}?_action=confirmar`, { method: "POST", body: '{"codigo":"123456"}', headers: { origin: e.base, "content-type": "application/json" } }),
        };
        for (const [forma, r] of Object.entries(formas)) {
          expect(r.status, forma).toBe(404);
          expect(await r.text(), forma).toBe(loquesea);
          expect(r.headers.getSetCookie(), forma).toEqual([]);
          lasCuatro(r.headers, `${nombre} POST ${forma}`);
        }
        expect(formas.confirmar.headers.get("cache-control")).toBe(CACHE_DE_ACCION);
        expect(formas["sin-accion"].headers.get("cache-control")).toBe(CACHE_DE_HTML_DINAMICO);

        expect(llamadas()).toEqual([]);
        expect(await prisma.intentoDeCupo.count()).toBe(filasAntes);
        cuerpos[nombre] = { get: html, loquesea };
      } finally {
        e.detener();
      }
    }, 60_000);
  }

  it("las tres configuraciones responden el mismo documento", () => {
    const [a, b, c] = (Object.keys(CONFIGURACIONES) as Configuracion[]).map((n) => cuerpos[n]?.get);
    expect(a).toBeTruthy();
    expect(b).toBe(a);
    expect(c).toBe(a);
  });
});

describe("con credenciales y secreto pero sin bandera", () => {
  let c: Levantado;
  beforeAll(async () => {
    c = await levantar("sin-bandera", true);
  }, 60_000);
  afterAll(() => c?.e.detener());

  it("una cookie bien firmada no abre nada: 404 en GET y en los dos POST, sin proveedor, sin cupos, sin tocar la ficha y sin cookies", async () => {
    const cookie = `${COOKIE_PASO}=${cookieDePaso("vigente", negocioId, SECRETO, "8601")}`;
    const antes = await prisma.negocio.findUniqueOrThrow({ where: { id: negocioId } });
    const filasAntes = await prisma.intentoDeCupo.count();
    const respuestas = [
      await c.e.pedir(RUTA, { headers: { cookie } }),
      await postear(c.e, `${RUTA}?_action=confirmar`, "codigo=123456", { cookie }),
      await postear(c.e, `${RUTA}?_action=reenviar`, "", { cookie }),
    ];
    for (const r of respuestas) {
      expect(r.status).toBe(404);
      expect(await r.text()).toContain("No encontramos esta página");
      expect(r.headers.getSetCookie()).toEqual([]);
    }
    expect(c.llamadas()).toEqual([]);
    expect(await prisma.intentoDeCupo.count()).toBe(filasAntes);
    expect(await prisma.negocio.findUniqueOrThrow({ where: { id: negocioId } })).toEqual(antes);
  });

  it("la compuerta va antes del manejador: con el cuerpo a medio llegar ya responde la 404 (con y sin Content-Length)", async () => {
    const cookie = `${COOKIE_PASO}=${cookieDePaso("vigente", negocioId, SECRETO)}`;
    const base = { cookie, "content-type": "application/x-www-form-urlencoded" };
    expect(await postSinTerminar(c.e, `${RUTA}?_action=confirmar`, { ...base, "content-length": "1000" })).toBe(404);
    expect(await postSinTerminar(c.e, `${RUTA}?_action=reenviar`, { ...base, "transfer-encoding": "chunked" })).toBe(404);
  });

  it("el cuerpo no se lee: 200 MB por trozos responden la misma 404, sin 500, sin lecturas y sin que suba la memoria", async () => {
    const cookie = `${COOKIE_PASO}=${cookieDePaso("vigente", negocioId, SECRETO)}`;
    const antes = JSON.parse(readFileSync(c.sonda, "utf8")) as { lecturas: number; picoRssMb: number };
    const { status, escritos } = await enviar200Mb(c.e, cookie);
    expect(status).toBe(404);
    expect(escritos).toBeLessThan(200 * MIB);
    const despues = JSON.parse(readFileSync(c.sonda, "utf8")) as { lecturas: number; picoRssMb: number };
    expect(despues.lecturas).toBe(antes.lecturas);
    expect(despues.picoRssMb - antes.picoRssMb).toBeLessThan(100);
    expect(c.llamadas()).toEqual([]);
  }, 60_000);
});

describe("igual a una dirección inventada", () => {
  it("con la build y la ejecución compartiendo entorno: /registro/verificar, /registro/loquesea y /a/b/c, mismo cuerpo; las cabeceras solo difieren en Cache-Control", async () => {
    const { e } = await levantar("sin-variables");
    try {
      const [verificar, otra, abc] = await Promise.all([RUTA, "/registro/loquesea", "/a/b/c"].map((r) => e.pedir(r)));
      const [cv, co, ca] = await Promise.all([verificar.text(), otra.text(), abc.text()]);
      expect([verificar.status, otra.status, abc.status]).toEqual([404, 404, 404]);
      expect(cv).toBe(ca);
      expect(co).toBe(ca);
      const hv = sinFecha(verificar.headers);
      const ha = sinFecha(abc.headers);
      const distintas = [...new Set([...Object.keys(hv), ...Object.keys(ha)])].filter((k) => hv[k] !== ha[k]);
      expect(distintas).toEqual(["cache-control"]);
    } finally {
      e.detener();
    }
  }, 60_000);
});
