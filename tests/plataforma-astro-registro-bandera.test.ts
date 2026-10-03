/**
 * Spec `plataforma-astro` (change `migrar-registro-astro`, Fase 3b-1),
 * requirement "Con la bandera encendida, el registro llega a la verificación
 * igual que en Next" (tasks.md #6). Sobre la SALIDA SERVIDA, con el Twilio
 * FALSO de `tests/fixtures/twilio-falso.mjs` precargado en el proceso del
 * emulador: sin red (cualquier otro host externo falla), sin credenciales
 * reales y sin tocar `src/lib/`.
 *
 * **La bandera no se enciende en ningún entorno de `migracion-astro` hasta
 * 3b-2**: aquí solo vive dentro de estos procesos de prueba.
 *
 * Todo ficticio: WhatsApp 77199985xx, credenciales `ACtest…`, el secreto se
 * genera aquí, IPs de documentación (RFC 5737).
 */
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { enviarFormulario, erroresDelFormulario, leerSetCookie } from "../scripts/enviar-formulario.mjs";
import type { PrismaClient } from "../src/generated/prisma/client";
import { MENSAJES_ERROR_REGISTRO, MENSAJE_GRACIAS } from "../src/lib/registro/textos";
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
import { type Emulador, construirSiHaceFalta, levantarEmulador } from "./salida-astro";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PRECARGA = "tests/fixtures/twilio-falso.mjs";
const WHATSAPP = Array.from({ length: 40 }, (_, i) => `77199985${String(i).padStart(2, "0")}`);
const SECRETO = randomBytes(32).toString("hex");
const CREDENCIALES = {
  [VARIABLE_TWILIO_SID]: "ACtest00000000000000000000000000",
  [VARIABLE_TWILIO_AUTH_TOKEN]: "token-ficticio-de-pruebas",
  [VARIABLE_TWILIO_SERVICE_SID]: "VAtest00000000000000000000000000",
};
const SIN_VERIFICACION = Object.fromEntries(
  [VARIABLE_BANDERA, VARIABLE_SECRETO, VARIABLE_TWILIO_SID, VARIABLE_TWILIO_AUTH_TOKEN, VARIABLE_TWILIO_SERVICE_SID].map((v) => [v, undefined]),
);

let prisma: PrismaClient;
let categoriaId = 0;
let coloniaId = 0;
let dir = "";

type Llamada = { ruta: string; parametros: Record<string, string> };
type ConTwilio = { emulador: Emulador; registro: string; llamadas: () => Llamada[] };

/** Una sola salida con la bandera encendida: el guion se cambia en su archivo (`@…`), sin otro emulador. */
let encendida: ConTwilio | undefined;
let guionEncendida = "";
const usarGuion = (guion: "enviado" | "error" | "rechazado" | "tarda") => writeFileSync(guionEncendida, guion);

/**
 * Las tres apagadas se levantan de UNA en UNA (en su prueba) y se detienen al
 * terminar: con PGlite (`prisma dev`), varias funciones a la vez agotan sus
 * conexiones.
 */
const CASOS_APAGADA = {
  "sin-variables": {},
  "sin-bandera": { [VARIABLE_SECRETO]: SECRETO, ...CREDENCIALES },
  "sin-secreto": { [VARIABLE_BANDERA]: "1", ...CREDENCIALES },
} as const;

async function conTwilioFalso(nombre: string, guion: string, entorno: Record<string, string | undefined>): Promise<ConTwilio> {
  const registro = path.join(dir, `${nombre}.jsonl`);
  writeFileSync(registro, "");
  const emulador = await levantarEmulador(
    { SITIO_URL: "https://enmirumbo.example", ...SIN_VERIFICACION, ...entorno, TWILIO_FALSO_GUION: guion, TWILIO_FALSO_REGISTRO: registro },
    { precargas: [PRECARGA] },
  );
  return {
    emulador,
    registro,
    llamadas: () =>
      readFileSync(registro, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l) as Llamada),
  };
}

const valido = (whatsapp: string, extra: Record<string, string> = {}) => ({
  nombre: "Estética Ficticia De La Bandera",
  categoriaId: String(categoriaId),
  whatsapp,
  coloniaId: String(coloniaId),
  consentimiento: "on",
  ...extra,
});

function registrar(e: Emulador, whatsapp: string, extra: Record<string, string> = {}, ip = "198.51.100.10") {
  return enviarFormulario({
    urlPagina: new URL("/registro", e.base).toString(),
    elecciones: valido(whatsapp, extra),
    cabecerasExtra: { "x-forwarded-for": ip },
  });
}

beforeAll(async () => {
  construirSiHaceFalta();
  dir = mkdtempSync(path.join(tmpdir(), "registro-bandera-"));
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  await borrarNegociosSembrados(prisma, WHATSAPP);
  await prisma.intentoDeCupo.deleteMany({});
  categoriaId = (await prisma.categoria.findUniqueOrThrow({ where: { slug: "belleza" } })).id;
  coloniaId = (await prisma.colonia.findFirstOrThrow({ orderBy: { id: "asc" } })).id;
  guionEncendida = path.join(dir, "guion.txt");
  usarGuion("enviado");
  encendida = await conTwilioFalso("encendida", `@${guionEncendida}`, { [VARIABLE_BANDERA]: "1", [VARIABLE_SECRETO]: SECRETO, ...CREDENCIALES });
}, 300_000);

afterAll(async () => {
  encendida?.emulador.detener();
  await borrarNegociosSembrados(prisma, WHATSAPP);
  await prisma.intentoDeCupo.deleteMany({});
  await prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

describe("bandera encendida · código pedido", () => {
  it("303 a /registro/verificar con la cookie de paso y sus atributos; la ficha ya está en revisión sin verificar; una sola petición de envío", async () => {
    const c = encendida!;
    usarGuion("enviado");
    const antes = c.llamadas().length;
    const r = await registrar(c.emulador, WHATSAPP[0]);
    const post = r.cadena[1];
    expect(post.status).toBe(303);
    expect(post.location).toBe("/registro/verificar");
    expect(post.setCookie).toHaveLength(1);
    const { nombre, valor, atributos } = leerSetCookie(post.setCookie[0]);
    expect(nombre).toBe(COOKIE_PASO);
    expect(valor).not.toBe("");
    expect(valor).not.toContain(WHATSAPP[0]);
    expect(atributos).toMatchObject({ httponly: "", path: "/registro/verificar", "max-age": "900", secure: "" });
    expect(atributos.samesite.toLowerCase()).toBe("lax");
    expect(atributos.domain).toBeUndefined();
    const ficha = await prisma.negocio.findUniqueOrThrow({ where: { whatsapp: WHATSAPP[0] } });
    expect(ficha).toMatchObject({ estado: "en_revision", numeroVerificadoEn: null });
    expect(c.llamadas().slice(antes)).toEqual([{ ruta: "/Verifications", parametros: { To: `+52${WHATSAPP[0]}`, Channel: "sms" } }]);
  });
});

describe("bandera encendida · el SMS no sale", () => {
  for (const guion of ["error", "rechazado", "tarda"] as const) {
    it(`${guion}: 303 a gracias sin cookie, la ficha guardada sin verificar y nada del proveedor en la respuesta`, async () => {
      const c = encendida!;
      usarGuion(guion);
      const antes = c.llamadas().length;
      const whatsapp = WHATSAPP[{ error: 1, rechazado: 2, tarda: 3 }[guion]];
      const r = await registrar(c.emulador, whatsapp, {}, `198.51.100.${{ error: 1, rechazado: 2, tarda: 3 }[guion]}`);
      const post = r.cadena[1];
      expect(post.status).toBe(303);
      expect(post.location).toBe("/registro/gracias");
      expect(post.setCookie).toEqual([]);
      expect(r.final.html).toContain(MENSAJE_GRACIAS);
      expect(r.final.html.toLowerCase()).not.toMatch(/twilio|verify|proveedor|60200|unavailable/);
      for (const [k, v] of post.cabeceras) expect(`${k}: ${v}`.toLowerCase()).not.toContain("twilio");
      expect(await prisma.negocio.findUniqueOrThrow({ where: { whatsapp } })).toMatchObject({ estado: "en_revision", numeroVerificadoEn: null });
      expect(c.llamadas().slice(antes)).toEqual([{ ruta: "/Verifications", parametros: { To: `+52${whatsapp}`, Channel: "sms" } }]);
    }, 30_000);
  }
});

describe("bandera encendida · lo que no pide código", () => {
  it("el reenvío de una ficha rechazada ya verificada, un duplicado y el campo trampa: cero llamadas", async () => {
    const c = encendida!;
    usarGuion("enviado");
    const antes = c.llamadas().length;
    await prisma.negocio.create({
      data: { nombre: "Estética Ficticia Verificada", categoriaId, whatsapp: WHATSAPP[10], estado: "rechazado", rechazadoEn: new Date(), consintioAvisoEn: new Date(), numeroVerificadoEn: new Date() },
    });
    await prisma.negocio.create({ data: { nombre: "Estética Ficticia Previa", categoriaId, whatsapp: WHATSAPP[11], consintioAvisoEn: new Date() } });

    const reenvio = await registrar(c.emulador, WHATSAPP[10], {}, "198.51.100.11");
    expect(reenvio.cadena[1].status).toBe(303);
    expect(reenvio.cadena[1].location).toBe("/registro/gracias");
    expect(reenvio.cadena[1].setCookie).toEqual([]);

    const duplicado = await registrar(c.emulador, WHATSAPP[11], {}, "198.51.100.12");
    expect(duplicado.cadena[1].status).toBe(200);
    expect(erroresDelFormulario(duplicado.final.html)).toEqual({ whatsapp: MENSAJES_ERROR_REGISTRO.whatsappDuplicado });

    const trampa = await registrar(c.emulador, WHATSAPP[12], { sitio_web: "http://spam.example" }, "198.51.100.13");
    expect(trampa.cadena[1].location).toBe("/registro/gracias");
    expect(trampa.cadena[1].setCookie).toEqual([]);

    expect(c.llamadas()).toHaveLength(antes);
  });
});

describe("bandera apagada · no habla con nadie", () => {
  const casos = Object.keys(CASOS_APAGADA) as Array<keyof typeof CASOS_APAGADA>;
  const rutas = ["/registro", "/registro/gracias", "/registro/gracias?verificado=1&agotado=1"];
  /** El HTML de cada ruta, por caso, para compararlos al final. */
  const html: Record<string, Record<string, string>> = {};

  for (const [i, caso] of casos.entries()) {
    it(`${caso}: cero llamadas, sin cookie de paso, destino gracias y ninguna fila de cupos de verificación`, async () => {
      const c = await conTwilioFalso(caso, "enviado", CASOS_APAGADA[caso]);
      try {
        const filasAntes = await prisma.intentoDeCupo.count();
        const r = await registrar(c.emulador, WHATSAPP[20 + i], {}, `198.51.100.${20 + i}`);
        expect(r.cadena[1].status, caso).toBe(303);
        expect(r.cadena[1].location, caso).toBe("/registro/gracias");
        expect(r.cadena[1].setCookie, caso).toEqual([]);
        expect(c.llamadas(), caso).toEqual([]);
        expect(await prisma.intentoDeCupo.count(), caso).toBe(filasAntes);
        expect(await prisma.negocio.count({ where: { whatsapp: WHATSAPP[20 + i] } }), caso).toBe(1);
        html[caso] = Object.fromEntries(await Promise.all(rutas.map(async (ruta) => [ruta, await (await c.emulador.pedir(ruta)).text()])));
      } finally {
        c.emulador.detener();
      }
    }, 60_000);
  }

  it("el HTML de /registro y de gracias es idéntico en los tres casos", () => {
    for (const ruta of rutas) {
      const cuerpos = casos.map((caso) => html[caso]?.[ruta]);
      expect(cuerpos[0], ruta).toBeTruthy();
      expect(cuerpos[1], ruta).toBe(cuerpos[0]);
      expect(cuerpos[2], ruta).toBe(cuerpos[0]);
      expect(cuerpos[0]!.toLowerCase(), ruta).not.toContain("sms");
    }
  });

  it("con la bandera encendida el HTML de /registro tampoco cambia (el formulario no gana nada)", async () => {
    const conBandera = await (await encendida!.emulador.pedir("/registro")).text();
    expect(conBandera).toBe(html["sin-variables"]?.["/registro"]);
  });
});

describe("twilio falso · guardián de la build", () => {
  function archivos(d: string): string[] {
    return readdirSync(d).flatMap((n) => {
      const ruta = path.join(d, n);
      return statSync(ruta).isDirectory() ? archivos(ruta) : [ruta];
    });
  }

  it("la salida construida (sin node_modules) no menciona el simulador", () => {
    const salida = path.join(raiz, ".vercel/output");
    const propios = archivos(salida).filter((f) => !f.includes(`${path.sep}node_modules${path.sep}`) && /\.(m?js|json|html|css)$/.test(f));
    expect(propios.length).toBeGreaterThan(10);
    const culpables = propios.filter((f) => /twilio-falso|TWILIO_FALSO_/.test(readFileSync(f, "utf8")));
    expect(culpables).toEqual([]);
  });
});
