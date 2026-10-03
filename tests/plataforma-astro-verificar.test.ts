/**
 * Spec `plataforma-astro` (change `migrar-verificacion-sms-astro`, Fase 3b-2;
 * tasks.md #5), sobre la SALIDA SERVIDA con el Twilio FALSO precargado:
 *
 * - "Con la verificación encendida, la pantalla 'Confirma tu número' responde
 *   desde Astro el mismo HTML que Next" (contra `tests/fixtures/next-3b2`);
 * - "Sin una credencial de paso válida, la pantalla y sus envíos no dicen
 *   nada" (la tabla de design.md §2.3, byte a byte por fila);
 * - "Confirmar y reenviar el código sin JavaScript se comportan igual que en
 *   Next" (las secuencias de `secuenciasDe3b2` contra las de Next);
 * - el MODIFIED de la tabla de Actions (RPC cerrado, Action desde otra ruta).
 *
 * **La bandera no se enciende en ningún entorno de `migracion-astro`**: aquí
 * solo vive dentro de estos procesos. Todo ficticio: WhatsApp 77199984xx (las
 * secuencias) y 77199987xx, credenciales `ACtest…`, secreto generado aquí,
 * IPs de documentación (RFC 5737).
 */
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { NORMALIZACIONES_FORMULARIO, compararRespuestas } from "../scripts/diff-html/nucleo.mjs";
import {
  BOTON_CONFIRMAR,
  Frasco,
  PANTALLAS_DE_VERIFICAR,
  enviarFormulario,
  recorrerSecuencia3b2,
  secuenciasDe3b2,
} from "../scripts/enviar-formulario.mjs";
import type { PrismaClient } from "../src/generated/prisma/client";
import { MENSAJE_GRACIAS } from "../src/lib/registro/textos";
import { cabecerasDeSeguridad } from "../src/lib/seguridad/csp";
import {
  VARIABLE_BANDERA,
  VARIABLE_SECRETO,
  VARIABLE_TOPE_DIARIO,
  VARIABLE_TWILIO_AUTH_TOKEN,
  VARIABLE_TWILIO_SERVICE_SID,
  VARIABLE_TWILIO_SID,
} from "../src/lib/verificacion/config";
import { COOKIE_PASO } from "../src/lib/verificacion/paso";
import { LINEA_CONFIRMACION_NUMERO_GRACIAS } from "../src/lib/verificacion/textos";
import { crearClientePrueba } from "./db";
import { borrarNegociosSembrados } from "./limpieza";
import { enTrozos, postearPorTrozos } from "./postear-por-trozos";
import { type Emulador, construirSiHaceFalta, levantarEmulador } from "./salida-astro";
import { type TipoDeCookie, clavesDeLosTopes, contextoDe3b2, cookieDePaso, cuposDeLaFicha, leerLlamadas } from "./verificar-astro";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FIXTURES = path.join(raiz, "tests/fixtures/next-3b2");
const URL_PUBLICA = "https://enmirumbo.example";
const RUTA = "/registro/verificar";
const SECRETO = randomBytes(32).toString("hex");
const CREDENCIALES = {
  [VARIABLE_TWILIO_SID]: "ACtest00000000000000000000000000",
  [VARIABLE_TWILIO_AUTH_TOKEN]: "token-ficticio-de-pruebas",
  [VARIABLE_TWILIO_SERVICE_SID]: "VAtest00000000000000000000000000",
};
const ENCENDIDA = { [VARIABLE_BANDERA]: "1", [VARIABLE_SECRETO]: SECRETO, [VARIABLE_TOPE_DIARIO]: "1000", ...CREDENCIALES };
const APAGADA = { [VARIABLE_BANDERA]: undefined, [VARIABLE_SECRETO]: SECRETO, ...CREDENCIALES };
const SECUENCIAS = secuenciasDe3b2();
const propio = (i: number) => `77199987${String(i).padStart(2, "0")}`;
const WHATSAPP = [
  ...SECUENCIAS.flatMap((s) => [s.whatsapp, ...(s.previos ?? []).map(([w]) => w)]),
  ...Array.from({ length: 30 }, (_, i) => propio(i)),
];
const INVALIDAS: Array<Exclude<TipoDeCookie, "vigente"> | "sin"> = ["sin", "alterada", "otro-secreto", "malformada", "caducada"];
const NO_EXISTE = "cnoexiste0000000000000000";

let prisma: PrismaClient;
let dir = "";
let categoriaId = 0;
let coloniaId = 0;
let ip = 0;
const otraIp = () => `203.0.113.${10 + (ip++ % 200)}`;

type ConTwilio = { e: Emulador; guion: string; registro: string; llamadas: () => Array<{ ruta: string }> };
let conSitio: ConTwilio;
let sinSitio: ConTwilio;
let apagada: ConTwilio;

async function levantar(nombre: string, entorno: Record<string, string | undefined>): Promise<ConTwilio> {
  const registro = path.join(dir, `${nombre}.jsonl`);
  const guion = path.join(dir, `${nombre}-guion.txt`);
  writeFileSync(registro, "");
  writeFileSync(guion, "enviado,approved");
  const e = await levantarEmulador(
    { REGISTRO_ENCABEZADO_IP: "x-forwarded-for", ...entorno, TWILIO_FALSO_GUION: `@${guion}`, TWILIO_FALSO_REGISTRO: registro },
    { precargas: ["tests/fixtures/twilio-falso.mjs"] },
  );
  return { e, guion, registro, llamadas: () => leerLlamadas(registro) };
}

const consultar = (sql: string, params: unknown[]) => prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(sql, ...params);
const ctxDe = (c: ConTwilio) => contextoDe3b2({ consultar, secreto: SECRETO, archivoGuion: c.guion, archivoLlamadas: c.registro, categoriaId, coloniaId });
/** Las cabeceras sin la fecha ni las de transporte (`connection`/`keep-alive`: el servidor cierra si no leyó todo el cuerpo). */
const sinFecha = (h: Headers) => Object.fromEntries([...h].filter(([k]) => !["date", "connection", "keep-alive"].includes(k)));
const cookieDe = (tipo: TipoDeCookie | "sin", id: string) => (tipo === "sin" ? undefined : `${COOKIE_PASO}=${cookieDePaso(tipo, id, SECRETO, "8299")}`);

function fixture(variante: string, nombre: string): string {
  return readFileSync(path.join(FIXTURES, variante, nombre), "utf8").replace(/>\n</g, "><");
}
const respuestasNext = (variante: string) => JSON.parse(readFileSync(path.join(FIXTURES, variante, "respuestas.json"), "utf8"));

/** Registra una ficha por `/registro` (la bandera encendida pide el código y pone la cookie). */
async function registrar(c: ConTwilio, whatsapp: string) {
  const frasco = new Frasco();
  const r = await enviarFormulario({
    urlPagina: new URL("/registro", c.e.base).toString(),
    elecciones: { nombre: "Cocina Ficticia De La Prueba", categoriaId: String(categoriaId), whatsapp, coloniaId: String(coloniaId), consentimiento: "on" },
    cabecerasExtra: { "x-forwarded-for": otraIp() },
    frasco,
  });
  const ficha = await prisma.negocio.findUniqueOrThrow({ where: { whatsapp } });
  return { r, frasco, id: ficha.id, cookie: `${COOKIE_PASO}=${frasco.valor(COOKIE_PASO)}` };
}

/** Un POST que deja de mandar el cuerpo en cuanto llega la respuesta (como un navegador); ver `tests/postear-por-trozos.ts`. */
const postearComoNavegador = (e: Emulador, ruta: string, cabeceras: Record<string, string>, cuerpo: Buffer) =>
  postearPorTrozos(new URL(ruta, e.base), cabeceras, { trozos: () => enTrozos(cuerpo) });

/** Las cuatro formas de petición de la tabla de design.md §2.3. */
async function formas(e: Emulador, cookie: string | undefined) {
  const cabeceras = (extra: Record<string, string> = {}) => ({ ...(cookie ? { cookie } : {}), "x-forwarded-for": otraIp(), ...extra });
  const post = (ruta: string, cuerpo: string) =>
    e.pedir(ruta, { method: "POST", body: cuerpo, headers: cabeceras({ origin: e.base, "content-type": "application/x-www-form-urlencoded" }) });
  const resultado: Record<string, { status: number; cuerpo: string; cabeceras: Record<string, string>; cookies: string[] }> = {};
  for (const [forma, peticion] of [
    ["GET", () => e.pedir(RUTA, { headers: cabeceras() })],
    ["HEAD", () => e.pedir(RUTA, { method: "HEAD", headers: cabeceras() })],
    ["POST confirmar", () => post(`${RUTA}?_action=confirmar`, "codigo=123456")],
    ["POST reenviar", () => post(`${RUTA}?_action=reenviar`, "")],
    ["POST sin accion", () => post(RUTA, "codigo=123456")],
  ] as const) {
    const r = await peticion();
    resultado[forma] = { status: r.status, cuerpo: await r.text(), cabeceras: sinFecha(r.headers), cookies: r.headers.getSetCookie() };
  }
  return resultado;
}

beforeAll(async () => {
  construirSiHaceFalta();
  dir = mkdtempSync(path.join(tmpdir(), "verificar-encendida-"));
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  await borrarNegociosSembrados(prisma, WHATSAPP);
  await prisma.intentoDeCupo.deleteMany({});
  categoriaId = (await prisma.categoria.findFirstOrThrow({ orderBy: { id: "asc" } })).id;
  coloniaId = (await prisma.colonia.findFirstOrThrow({ orderBy: { id: "asc" } })).id;
  conSitio = await levantar("con-sitio", { SITIO_URL: URL_PUBLICA, ...ENCENDIDA });
  sinSitio = await levantar("sin-sitio", { SITIO_URL: undefined, ...ENCENDIDA });
  apagada = await levantar("apagada", { SITIO_URL: URL_PUBLICA, ...APAGADA });
}, 300_000);

afterAll(async () => {
  for (const c of [conSitio, sinSitio, apagada]) c?.e.detener();
  await borrarNegociosSembrados(prisma, WHATSAPP);
  await prisma.intentoDeCupo.deleteMany({});
  await prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

describe("encendida · la pantalla igual a la de hoy", () => {
  for (const variante of ["con-sitio-url", "sin-sitio-url"] as const) {
    it(`${variante}: las nueve pantallas contra Next, solo con las dos normalizaciones de formulario (en los dos formularios)`, async () => {
      const c = variante === "con-sitio-url" ? conSitio : sinSitio;
      const cookie = cookieDe("vigente", "cficticia0000000000000000");
      const pantallas = respuestasNext(variante).pantallas;
      for (const [nombre, ruta] of PANTALLAS_DE_VERIFICAR) {
        const r = await c.e.pedir(ruta, { headers: { cookie: cookie! } });
        const cuerpo = await r.text();
        expect(r.headers.getSetCookie(), nombre).toEqual([]);
        const aplicadas: string[] = [];
        const next = { status: pantallas[nombre].status, headers: { ...seguridadDe(r), "content-type": pantallas[nombre]["content-type"], "cache-control": pantallas[nombre]["cache-control"] }, cuerpo: fixture(variante, nombre) };
        const diferencias = compararRespuestas(`${variante} ${nombre}`, next, { status: r.status, headers: Object.fromEntries(r.headers), cuerpo }, {
          dinamica: true,
          formulario: { urlPagina: new URL(ruta, URL_PUBLICA).toString(), aplicadas },
        });
        expect(diferencias, nombre).toEqual([]);
        for (const { key, value } of cabecerasDeSeguridad()) expect(r.headers.get(key), `${nombre} · ${key}`).toBe(value);
        const [porForm, ocultos] = NORMALIZACIONES_FORMULARIO.map((n) => aplicadas.filter((a) => a === n.id).length);
        expect([porForm, ocultos], nombre).toEqual([2, 2]);
      }
    });
  }

  it("sin JavaScript y sin datos de más: sin isla, sin precargas, sin script propio, sin ocultos; los cuatro últimos dígitos y nada más del número", async () => {
    const { r, frasco, id } = await registrar(conSitio, propio(1));
    expect(r.final.url).toBe(new URL(RUTA, conSitio.e.base).toString());
    expect(r.final.status).toBe(200);
    const html = r.final.html;
    expect(html).not.toContain("astro-island");
    expect(html).not.toContain("modulepreload");
    expect(html).not.toMatch(/<script(?![^>]*application\/ld\+json)[\s>]/i);
    expect(html).not.toMatch(/type="hidden"/);
    expect(html).toContain("termina en 8701");
    for (const prohibido of [propio(1), `+52${propio(1)}`, `52${propio(1)}`, id]) expect(html, prohibido).not.toContain(prohibido);
    expect(html).toMatch(/<meta name="robots" content="noindex, nofollow"/);
    expect(html).toMatch(/inputmode="numeric"/i);
    expect(html).toMatch(/autocomplete="one-time-code"/i);
    expect(html).toMatch(/maxlength="6"/i);
    expect(frasco.tiene(COOKIE_PASO)).toBe(true);
  });
});

describe("encendida · sin credencial válida no se dice nada (design.md §2.3)", () => {
  it("cada forma de petición responde igual con la bandera apagada y con cada cookie inválida, sin cookies, sin proveedor y sin escribir", async () => {
    const id = (await registrar(conSitio, propio(2))).id;
    const antesLlamadas = conSitio.llamadas().length;
    const antesFilas = await prisma.intentoDeCupo.count();
    const referencia = await formas(apagada.e, undefined);
    for (const tipo of INVALIDAS) {
      const encendida = await formas(conSitio.e, cookieDe(tipo, id));
      const conBanderaApagada = await formas(apagada.e, cookieDe(tipo, id));
      for (const forma of Object.keys(referencia)) {
        expect(encendida[forma].status, `${tipo} ${forma}`).toBe(404);
        expect(encendida[forma], `${tipo} ${forma} (encendida)`).toEqual(referencia[forma]);
        expect(conBanderaApagada[forma], `${tipo} ${forma} (apagada)`).toEqual(referencia[forma]);
        expect(encendida[forma].cookies, `${tipo} ${forma}`).toEqual([]);
      }
    }
    expect(referencia["POST confirmar"].cuerpo).toBe(referencia.GET.cuerpo);
    expect(conSitio.llamadas()).toHaveLength(antesLlamadas);
    expect(await prisma.intentoDeCupo.count()).toBe(antesFilas);
  });

  it("credencial de una ficha borrada: confirmar responde la misma 404 que sin cookie, sin proveedor ni escritura; el GET sigue pintando la pantalla (como Next)", async () => {
    const sinCookie = await formas(conSitio.e, undefined);
    const cookie = cookieDe("vigente", NO_EXISTE)!;
    const antes = conSitio.llamadas().length;
    const filas = await prisma.intentoDeCupo.count();
    const confirmar = await conSitio.e.pedir(`${RUTA}?_action=confirmar`, {
      method: "POST",
      body: "codigo=123456",
      headers: { cookie, origin: conSitio.e.base, "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": otraIp() },
    });
    expect({ status: confirmar.status, cuerpo: await confirmar.text(), cabeceras: sinFecha(confirmar.headers), cookies: confirmar.headers.getSetCookie() }).toEqual(
      sinCookie["POST confirmar"],
    );
    expect(await prisma.intentoDeCupo.count()).toBe(filas);
    const get = await conSitio.e.pedir(RUTA, { headers: { cookie } });
    expect(get.status).toBe(200);
    expect(await get.text()).toContain("Confirma tu número");
    // El reenvío de una ficha borrada (con la espera vencida) también es la
    // misma 404; `src/lib/` aparta la espera y el reenvío ANTES de buscar la
    // ficha (preexistente, igual que Next: fixture `ficha-borrada`).
    const reenviar = await conSitio.e.pedir(`${RUTA}?_action=reenviar`, {
      method: "POST",
      body: "",
      headers: { cookie, origin: conSitio.e.base, "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": otraIp() },
    });
    expect({ status: reenviar.status, cuerpo: await reenviar.text(), cabeceras: sinFecha(reenviar.headers), cookies: reenviar.headers.getSetCookie() }).toEqual(
      sinCookie["POST reenviar"],
    );
    expect(await cuposDeLaFicha(consultar, NO_EXISTE, SECRETO)).toEqual({ intentos: 0, reenvios: 1, espera: 1 });
    expect(conSitio.llamadas()).toHaveLength(antes);
    await prisma.intentoDeCupo.deleteMany({ where: { clave: { in: Object.values(clavesDeLosTopes(NO_EXISTE, SECRETO)) } } });
  });

  it("un envío que Astro no pudo leer (7 MiB con y sin Content-Length, JSON, text/plain) es la misma 404, sin 500, sin proveedor y sin gastar intentos", async () => {
    const { id, cookie } = await registrar(conSitio, propio(3));
    const sinCookie = (await formas(conSitio.e, undefined))["POST confirmar"];
    const antes = conSitio.llamadas().length;
    const grande = Buffer.from(`codigo=123456&relleno=${"a".repeat(7 * 1024 * 1024)}`);
    const casos: Array<[string, Record<string, string>, Buffer]> = [
      ["7 MiB con Content-Length", { "content-type": "application/x-www-form-urlencoded", "content-length": String(grande.length) }, grande],
      ["7 MiB por trozos", { "content-type": "application/x-www-form-urlencoded", "transfer-encoding": "chunked" }, grande],
      ["JSON", { "content-type": "application/json" }, Buffer.from('{"codigo":"123456"}')],
      ["text/plain", { "content-type": "text/plain" }, Buffer.from("codigo=123456")],
    ];
    for (const [nombre, cabeceras, cuerpo] of casos) {
      const r = await postearComoNavegador(conSitio.e, `${RUTA}?_action=confirmar`, { ...cabeceras, cookie, origin: conSitio.e.base, "x-forwarded-for": otraIp() }, cuerpo);
      expect({ status: r.status, cuerpo: r.cuerpo, cabeceras: sinFecha(r.cabeceras), cookies: r.cabeceras.getSetCookie() }, nombre).toEqual(sinCookie);
    }
    expect(conSitio.llamadas()).toHaveLength(antes);
    expect((await cuposDeLaFicha(consultar, id, SECRETO)).intentos).toBe(0);
  }, 60_000);
});

describe("encendida · confirmar y reenviar igual que Next", () => {
  /** Lo que respondió Astro a cada secuencia, para las pruebas de abajo. */
  const deAstro: Record<string, Awaited<ReturnType<typeof recorrerSecuencia3b2>>> = {};

  it("cada secuencia coincide con Next (cadena, Location, atributos de Set-Cookie, avisos, llamadas al simulador, ficha y cupos), salvo el origen ajeno o null (Next 500, Astro 403)", async () => {
    const deNext = respuestasNext("con-sitio-url").envios;
    const ctx = ctxDe(conSitio);
    const distintas: string[] = [];
    for (const secuencia of SECUENCIAS) {
      const astro = await recorrerSecuencia3b2(conSitio.e.base, secuencia, ctx);
      deAstro[secuencia.nombre] = astro;
      const next = deNext[secuencia.nombre];
      if (JSON.stringify(astro) === JSON.stringify(next)) continue;
      if (secuencia.aceptada?.(next, astro)) continue;
      distintas.push(`${secuencia.nombre}:\n  Next : ${JSON.stringify(next)}\n  Astro: ${JSON.stringify(astro)}`);
    }
    expect(distintas).toEqual([]);
    for (const nombre of ["origen-ajeno", "origen-null"]) {
      expect(deAstro[nombre].pasos[0].cadena[0].status, nombre).toBe(403);
      expect(deAstro[nombre].ficha?.verificado, nombre).toBe(false);
      expect(deAstro[nombre].pasos[0].llamadas, nombre).toEqual([]);
    }
  }, 120_000);

  it("recorrido completo sin JS: 200 → 303 → 200 → 303 → 200, gracias con la línea de confirmación, la ficha en revisión y verificada, y la cookie borrada", async () => {
    const { r: registro, frasco, id } = await registrar(conSitio, propio(4));
    writeFileSync(conSitio.guion, "enviado,approved");
    const r = await enviarFormulario({ urlPagina: new URL(RUTA, conSitio.e.base).toString(), boton: BOTON_CONFIRMAR, elecciones: { codigo: "123456" }, frasco, cabecerasExtra: { "x-forwarded-for": otraIp() } });
    const cadena = [...registro.cadena.slice(1), ...r.cadena.slice(1)].map((p) => p.status);
    expect([registro.cadena[0].status, ...cadena]).toEqual([200, 303, 200, 303, 200]);
    expect(r.cadena[1].location).toBe("/registro/gracias?verificado=1");
    const html = r.final.html;
    expect(html.indexOf(LINEA_CONFIRMACION_NUMERO_GRACIAS)).toBeGreaterThan(-1);
    expect(html.indexOf(LINEA_CONFIRMACION_NUMERO_GRACIAS)).toBeLessThan(html.indexOf(MENSAJE_GRACIAS));
    expect(await prisma.negocio.findUniqueOrThrow({ where: { id } })).toMatchObject({ estado: "en_revision", numeroVerificadoEn: expect.any(Date) });
    expect(frasco.tiene(COOKIE_PASO)).toBe(false);
    // El siguiente GET, con lo que quedó en el frasco (nada), ya es la 404.
    expect(frasco.cabecera(new URL(RUTA, conSitio.e.base).toString())).toBeUndefined();
    expect((await conSitio.e.pedir(RUTA)).status).toBe(404);
  });

  it("equivocarse y recargar: las recargas no gastan intentos ni llaman al proveedor", () => {
    const s = deAstro["equivocado-recargar-correcto"];
    expect(s.pasos.map((p) => p.llamadas)).toEqual([["/VerificationCheck"], [], [], ["/VerificationCheck"]]);
    expect(s.pasos[1].cadena[0]).toMatchObject({ status: 200, cookies: 0 });
    expect(s.pasos[1].avisos).toContain("Ese código no es. Revísalo y vuelve a escribirlo.");
    expect(s.pasos[3].cadena[0].location).toBe("/registro/gracias?verificado=1");
    expect(s.cupos?.intentos).toBe(1);
  });

  it("nada sensible: solo las rutas de la lista, y ni el log ni las cabeceras traen el código, el número, el identificador ni las credenciales", async () => {
    const permitidas = /^\/registro(\/gracias(\?(verificado|agotado)=1)?|\/verificar(\?(error=(incompleto|no-coincide|vencido|proveedor)|errorReenvio=(espera-reenvio|cupo)))?)?$/;
    for (const [nombre, s] of Object.entries(deAstro)) {
      for (const paso of [...s.registro.cadena, ...s.pasos.flatMap((p) => p.cadena)]) {
        if (paso.location) expect(paso.location, nombre).toMatch(permitidas);
      }
    }
    const ids = (await prisma.negocio.findMany({ where: { whatsapp: { in: WHATSAPP } }, select: { id: true } })).map((n) => n.id);
    const log = conSitio.e.registro();
    for (const prohibido of ["123456", "111111", ...WHATSAPP.filter((w) => w.startsWith("77199984")), ...ids, SECRETO, CREDENCIALES[VARIABLE_TWILIO_AUTH_TOKEN], CREDENCIALES[VARIABLE_TWILIO_SID], CREDENCIALES[VARIABLE_TWILIO_SERVICE_SID]]) {
      expect(log, prohibido).not.toContain(prohibido);
    }
  });
});

describe("encendida · la tabla de Actions (MODIFIED)", () => {
  it("RPC cerrado: /_actions/confirmar y /_actions/reenviar (formulario y JSON) responden igual que /a/b/c, sin proveedor ni escritura", async () => {
    const { id, cookie } = await registrar(conSitio, propio(5));
    const abc = await conSitio.e.pedir("/a/b/c");
    const referencia = { status: abc.status, cuerpo: await abc.text(), cabeceras: sinFecha(abc.headers) };
    const antes = conSitio.llamadas().length;
    const filas = await prisma.intentoDeCupo.count();
    for (const nombre of ["confirmar", "reenviar"]) {
      for (const [tipo, cuerpo] of [["application/x-www-form-urlencoded", "codigo=123456"], ["application/json", '{"codigo":"123456"}']]) {
        const r = await conSitio.e.pedir(`/_actions/${nombre}`, { method: "POST", body: cuerpo, headers: { cookie, origin: conSitio.e.base, "content-type": tipo } });
        expect({ status: r.status, cuerpo: await r.text(), cabeceras: sinFecha(r.headers) }, `${nombre} ${tipo}`).toEqual(referencia);
      }
    }
    expect(conSitio.llamadas()).toHaveLength(antes);
    expect(await prisma.intentoDeCupo.count()).toBe(filas);
    expect((await prisma.negocio.findUniqueOrThrow({ where: { id } })).numeroVerificadoEn).toBeNull();
  });

  it("Action desde una ruta ajena con una cookie válida: no se gasta nada, el simulador no recibe peticiones y no hay 500", async () => {
    const { id, cookie } = await registrar(conSitio, propio(6));
    const antes = conSitio.llamadas().length;
    const cupos = await cuposDeLaFicha(consultar, id, SECRETO);
    for (const ruta of ["/registro?_action=confirmar", "/registro/gracias?_action=confirmar", "/?_action=reenviar", "/registro/verificar/otra?_action=confirmar"]) {
      const r = await conSitio.e.pedir(ruta, {
        method: "POST",
        body: "codigo=123456",
        headers: { cookie, origin: conSitio.e.base, "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": otraIp() },
      });
      expect(r.status, ruta).not.toBe(500);
      expect(r.status, ruta).toBe(404);
    }
    expect(conSitio.llamadas()).toHaveLength(antes);
    expect(await cuposDeLaFicha(consultar, id, SECRETO)).toEqual(cupos);
    expect((await prisma.negocio.findUniqueOrThrow({ where: { id } })).numeroVerificadoEn).toBeNull();
  });
});

/** Las cuatro cabeceras de seguridad de una respuesta (para el lado Next del fixture, que solo guardó estado y caché). */
function seguridadDe(r: Response): Record<string, string> {
  return Object.fromEntries(["content-security-policy", "x-content-type-options", "x-frame-options", "referrer-policy"].map((k) => [k, r.headers.get(k) ?? ""]));
}
