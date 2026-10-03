/**
 * Pruebas ADVERSARIALES de la etapa C (seguridad) del change
 * `migrar-verificacion-sms-astro` (Fase 3b-2), sobre la SALIDA SERVIDA con el
 * Twilio FALSO (`tests/fixtures/twilio-falso.mjs`; nunca el proveedor real).
 *
 * Lo que el camino feliz del dev no cubre:
 *
 * - variaciones de la bandera y configuración a medias (solo `"1"` enciende;
 *   una sola advertencia, sin valores);
 * - `?error=` / `?errorReenvio=` hostiles y un paso firmado con marcado en los
 *   cuatro dígitos: nada se refleja ni se interpreta;
 * - destinos: ningún campo, `Referer`, `Host` ni `X-Forwarded-Host` cambia el
 *   `Location`, que siempre es relativo y de la lista cerrada;
 * - regla de origen sobre las dos Actions (null, ajeno, sufijo, puerto);
 * - cuerpos rotos: multipart malformado, campo duplicado, dígitos de ancho
 *   completo, archivo en `codigo`;
 * - la cookie de borrado: atributos exactos; el paso no lleva el número ni el
 *   código; reusar la cookie tras el éxito no llama al proveedor al confirmar;
 * - ráfaga de códigos equivocados (fuerza bruta concurrente): solo PostgreSQL
 *   real; fija la cota medida.
 *
 * Todo ficticio: WhatsApp 77199972xx, credenciales `ACtest…`, secreto generado
 * aquí, IPs de documentación (RFC 5737).
 */
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  VARIABLE_BANDERA,
  VARIABLE_SECRETO,
  VARIABLE_TOPE_DIARIO,
  VARIABLE_TWILIO_AUTH_TOKEN,
  VARIABLE_TWILIO_SERVICE_SID,
  VARIABLE_TWILIO_SID,
} from "../src/lib/verificacion/config";
import { COOKIE_PASO, firmarPaso } from "../src/lib/verificacion/paso";
import { crearClientePrueba } from "./db";
import { urlDeLaBaseDePrueba } from "./esquemas";
import { borrarNegociosSembrados } from "./limpieza";
import { type Emulador, construirSiHaceFalta, levantarEmulador } from "./salida-astro";
import { type Llamada, clavesDeLosTopes, cookieDePaso, cuposDeLaFicha, leerLlamadas } from "./verificar-astro";

const RUTA = "/registro/verificar";
const SECRETO = randomBytes(32).toString("hex");
const CREDENCIALES = {
  [VARIABLE_TWILIO_SID]: "ACtest00000000000000000000000000",
  [VARIABLE_TWILIO_AUTH_TOKEN]: "token-ficticio-de-pruebas",
  [VARIABLE_TWILIO_SERVICE_SID]: "VAtest00000000000000000000000000",
};
const ENCENDIDA = { [VARIABLE_BANDERA]: "1", [VARIABLE_SECRETO]: SECRETO, [VARIABLE_TOPE_DIARIO]: "1000", ...CREDENCIALES };
const WHATSAPP = Array.from({ length: 20 }, (_, i) => `77199972${String(i).padStart(2, "0")}`);
const PERMITIDAS = /^\/registro(\/gracias(\?(verificado|agotado)=1)?|\/verificar(\?(error=(incompleto|no-coincide|vencido|proveedor)|errorReenvio=(espera-reenvio|cupo)))?)$/;

async function hayBackendsIndependientes(): Promise<boolean> {
  const a = new pg.Client({ connectionString: urlDeLaBaseDePrueba() });
  const b = new pg.Client({ connectionString: urlDeLaBaseDePrueba() });
  try {
    await a.connect();
    await b.connect();
    const pid = async (c: pg.Client) => (await c.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    return (await pid(a)) !== (await pid(b));
  } catch {
    return false;
  } finally {
    await a.end().catch(() => {});
    await b.end().catch(() => {});
  }
}
const backendsIndependientes = await hayBackendsIndependientes();

let prisma: PrismaClient;
let dir = "";
let categoriaId = 0;
const ids: string[] = [];

type ConTwilio = { e: Emulador; guion: string; llamadas: () => Llamada[] };

async function levantar(nombre: string, entorno: Record<string, string | undefined>): Promise<ConTwilio> {
  const registro = path.join(dir, `${nombre}.jsonl`);
  const guion = path.join(dir, `${nombre}-guion.txt`);
  writeFileSync(registro, "");
  writeFileSync(guion, "enviado,approved");
  const e = await levantarEmulador(
    {
      [VARIABLE_BANDERA]: undefined,
      [VARIABLE_SECRETO]: undefined,
      SITIO_URL: undefined,
      REGISTRO_ENCABEZADO_IP: "x-forwarded-for",
      ...entorno,
      TWILIO_FALSO_GUION: `@${guion}`,
      TWILIO_FALSO_REGISTRO: registro,
    },
    { precargas: ["tests/fixtures/twilio-falso.mjs"] },
  );
  return { e, guion, llamadas: () => leerLlamadas(registro) };
}

/** Una ficha en revisión, creada directo en la base, con su cookie de paso vigente. */
async function ficha(i: number, ultimos = WHATSAPP[i].slice(-4)) {
  const n = await prisma.negocio.create({
    data: { nombre: "Tlapalería Ficticia Adversarial", categoriaId, whatsapp: WHATSAPP[i], consintioAvisoEn: new Date() },
  });
  ids.push(n.id);
  return { id: n.id, cookie: `${COOKIE_PASO}=${cookieDePaso("vigente", n.id, SECRETO, ultimos)}` };
}

function postear(e: Emulador, ruta: string, cuerpo: BodyInit, extra: Record<string, string> = {}) {
  return e.pedir(ruta, {
    method: "POST",
    body: cuerpo,
    headers: { origin: e.base, "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "198.51.100.200", ...extra },
  });
}

/** Un POST cuyo cuerpo no termina de llegar: si alguien lo lee, no hay respuesta en `esperaMs`. */
function postSinTerminar(e: Emulador, ruta: string, cabeceras: Record<string, string>, esperaMs = 3000): Promise<number | "sin-respuesta"> {
  return new Promise((listo) => {
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
  });
}

beforeAll(async () => {
  construirSiHaceFalta();
  dir = mkdtempSync(path.join(tmpdir(), "verificar-adversarial-"));
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  await borrarNegociosSembrados(prisma, WHATSAPP);
  categoriaId = (await prisma.categoria.findFirstOrThrow({ orderBy: { id: "asc" } })).id;
}, 300_000);

afterAll(async () => {
  const claves = ids.flatMap((id) => Object.values(clavesDeLosTopes(id, SECRETO)));
  await prisma.intentoDeCupo.deleteMany({ where: { clave: { in: claves } } });
  await borrarNegociosSembrados(prisma, WHATSAPP);
  await prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

describe("la bandera: solo el valor exacto \"1\" enciende", () => {
  // Con credenciales y secreto completos y una cookie BIEN firmada: cualquier
  // otro valor es la ruta inexistente, sin proveedor, sin cupos y sin cookies.
  const VALORES = ["", "0", "true", "TRUE", "1 ", " 1", "01", "1\t", "１", "yes"];
  it.each(VALORES)("VERIFICACION_SMS_ACTIVA=%j: GET y los dos POST son la 404, sin tocar nada", async (valor) => {
    const { id, cookie } = await ficha(VALORES.indexOf(valor));
    const c = await levantar(`bandera-${VALORES.indexOf(valor)}`, { ...ENCENDIDA, [VARIABLE_BANDERA]: valor });
    try {
      const loquesea = await (await c.e.pedir("/loquesea")).text();
      const filas = await prisma.intentoDeCupo.count();
      const respuestas = [
        await c.e.pedir(RUTA, { headers: { cookie } }),
        await postear(c.e, `${RUTA}?_action=confirmar`, "codigo=123456", { cookie }),
        await postear(c.e, `${RUTA}?_action=reenviar`, "", { cookie }),
      ];
      for (const r of respuestas) {
        expect(r.status).toBe(404);
        expect(await r.text()).toBe(loquesea);
        expect(r.headers.getSetCookie()).toEqual([]);
      }
      expect(c.llamadas()).toEqual([]);
      expect(await prisma.intentoDeCupo.count()).toBe(filas);
      expect((await prisma.negocio.findUniqueOrThrow({ where: { id } })).numeroVerificadoEn).toBeNull();
    } finally {
      c.e.detener();
    }
  }, 60_000);

  it("configuración a medias (bandera \"1\" sin TWILIO_ACCOUNT_SID): la 404, UNA advertencia que nombra la variable y no filtra valores", async () => {
    const { cookie } = await ficha(12);
    const c = await levantar("a-medias", { ...ENCENDIDA, [VARIABLE_TWILIO_SID]: undefined });
    try {
      for (let i = 0; i < 4; i++) {
        expect((await c.e.pedir(RUTA, { headers: { cookie } })).status).toBe(404);
        expect((await postear(c.e, `${RUTA}?_action=confirmar`, "codigo=123456", { cookie })).status).toBe(404);
      }
      const avisos = c.e.registro().split("\n").filter((l) => l.includes("[verificacion]"));
      expect(avisos).toHaveLength(1);
      expect(avisos[0]).toContain(VARIABLE_TWILIO_SID);
      for (const secreto of [SECRETO, CREDENCIALES[VARIABLE_TWILIO_AUTH_TOKEN], CREDENCIALES[VARIABLE_TWILIO_SERVICE_SID]]) {
        expect(c.e.registro()).not.toContain(secreto);
      }
      expect(c.llamadas()).toEqual([]);
    } finally {
      c.e.detener();
    }
  }, 60_000);
});

describe("encendida · entradas hostiles", () => {
  let c: ConTwilio;
  beforeAll(async () => {
    c = await levantar("hostil", { ...ENCENDIDA, SITIO_URL: "https://enmirumbo.example" });
  }, 60_000);
  afterAll(() => c?.e.detener());

  it("?error= y ?errorReenvio= hostiles no se reflejan: la pantalla es la misma que sin parámetros", async () => {
    const { cookie } = await ficha(13);
    const limpia = await (await c.e.pedir(RUTA, { headers: { cookie } })).text();
    expect(limpia).toContain("Confirma tu número");
    const hostiles = [
      "?error=%3Cscript%3Ealert(1)%3C%2Fscript%3E",
      "?errorReenvio=%22%3E%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E",
      "?error=INCOMPLETO",
      "?error=incompleto%00",
      "?error=%20incompleto",
      "?error=no-coincide%0A",
      "?error[]=vencido",
      "?errorReenvio=__proto__",
      "?error=constructor",
      `?error=${"x".repeat(8000)}`,
    ];
    for (const q of hostiles) {
      const r = await c.e.pedir(`${RUTA}${q}`, { headers: { cookie } });
      expect(r.status, q).toBe(200);
      expect(r.headers.getSetCookie(), q).toEqual([]);
      const html = await r.text();
      expect(html, q).toBe(limpia);
      expect(html, q).not.toContain("role=\"alert\"");
    }
    // Gana el PRIMER valor, de la lista.
    const doble = await (await c.e.pedir(`${RUTA}?error=vencido&error=%3Cscript%3E`, { headers: { cookie } })).text();
    expect(doble).toContain("Ese código ya venció. Pide uno nuevo.");
    expect(doble).not.toContain("<script>");
  });

  it("un paso firmado con marcado en los cuatro dígitos se pinta escapado (defensa en profundidad)", async () => {
    const { id } = await ficha(14);
    const malicioso = "<img src=x onerror=alert(1)>";
    const cookie = `${COOKIE_PASO}=${firmarPaso({ negocioId: id, ultimosCuatroDigitos: malicioso, creadaEnMs: Date.now() }, SECRETO)}`;
    const html = await (await c.e.pedir(RUTA, { headers: { cookie } })).text();
    expect(html).not.toContain(malicioso);
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("ningún campo, Referer, Host ni X-Forwarded-Host cambia el destino: Location relativo y de la lista cerrada", async () => {
    const { id, cookie } = await ficha(15);
    writeFileSync(c.guion, "enviado,pending");
    const variantes: Array<[string, string, Record<string, string>]> = [
      ["campos", "codigo=111111&destino=https%3A%2F%2Fevil.example&redirect=%2F%2Fevil.example&negocioId=otro&verificado=1&numeroVerificadoEn=2020-01-01&%24ACTION_ID_x=1", {}],
      ["referer", "codigo=111111", { referer: "https://evil.example/registro/verificar" }],
      ["x-forwarded-host", "codigo=111111", { "x-forwarded-host": "evil.example", origin: "http://evil.example" }],
      ["query extra", "codigo=111111", {}],
    ];
    for (const [nombre, cuerpo, extra] of variantes) {
      const ruta = nombre === "query extra" ? `${RUTA}?_action=confirmar&redirect=https://evil.example&error=x` : `${RUTA}?_action=confirmar`;
      const r = await postear(c.e, ruta, cuerpo, { cookie, ...extra });
      expect(r.status, nombre).toBe(303);
      expect(r.headers.get("location"), nombre).toMatch(PERMITIDAS);
    }
    expect((await prisma.negocio.findUniqueOrThrow({ where: { id } })).numeroVerificadoEn).toBeNull();
    writeFileSync(c.guion, "enviado,approved");
  });

  it("regla de origen sobre confirmar y reenviar: null, ajeno, sufijo y otro puerto son el 403 sin ejecutar nada", async () => {
    const { id, cookie } = await ficha(16);
    const antes = c.llamadas().length;
    const cupos = await cuposDeLaFicha((sql, p) => prisma.$queryRawUnsafe(sql, ...p), id, SECRETO);
    const puerto = new URL(c.e.base).port;
    for (const origen of ["null", "https://evil.example", `http://127.0.0.1.evil.example:${puerto}`, `http://127.0.0.1:${Number(puerto) + 1}`, "http://", "javascript:alert(1)"]) {
      for (const accion of ["confirmar", "reenviar"]) {
        const r = await postear(c.e, `${RUTA}?_action=${accion}`, "codigo=123456", { cookie, origin: origen });
        expect(r.status, `${origen} ${accion}`).toBe(403);
        expect(r.headers.getSetCookie(), `${origen} ${accion}`).toEqual([]);
      }
    }
    expect(c.llamadas()).toHaveLength(antes);
    expect(await cuposDeLaFicha((sql, p) => prisma.$queryRawUnsafe(sql, ...p), id, SECRETO)).toEqual(cupos);
  });

  it("cuerpos rotos: multipart malformado es la 404 sin 500; duplicado, ancho completo y archivo no llegan al proveedor", async () => {
    const { id, cookie } = await ficha(17);
    const antes = c.llamadas().length;
    const sinCookie = await postear(c.e, `${RUTA}?_action=confirmar`, "codigo=123456");
    const cuerpoSinCookie = await sinCookie.text();
    const roto = await postear(c.e, `${RUTA}?_action=confirmar`, "--x\r\nContent-Disposition: form-data; name=\"codigo\"\r\n\r\n123", {
      cookie,
      "content-type": "multipart/form-data; boundary=x",
    });
    expect(roto.status).toBe(404);
    expect(await roto.text()).toBe(cuerpoSinCookie);
    for (const cuerpo of ["codigo=%EF%BC%91%EF%BC%92%EF%BC%93%EF%BC%94%EF%BC%95%EF%BC%96", "codigo=12345%00", "codigo=1e5000", "codigo=-12345", "codigo=0x1E24"]) {
      const r = await postear(c.e, `${RUTA}?_action=confirmar`, cuerpo, { cookie });
      expect(r.headers.get("location"), cuerpo).toBe("/registro/verificar?error=incompleto");
    }
    const conArchivo = new FormData();
    conArchivo.append("codigo", new Blob(["123456"], { type: "text/plain" }), "codigo.txt");
    const archivo = await c.e.pedir(`${RUTA}?_action=confirmar`, { method: "POST", body: conArchivo, headers: { origin: c.e.base, cookie } });
    expect(archivo.headers.get("location")).toBe("/registro/verificar?error=incompleto");
    expect(c.llamadas()).toHaveLength(antes);
    expect((await cuposDeLaFicha((sql, p) => prisma.$queryRawUnsafe(sql, ...p), id, SECRETO)).intentos).toBe(0);
  });

  it("una Action pedida desde otra ruta no llega ni a leer el cuerpo: con el cuerpo a medio llegar ya responde la 404 (el candado del middleware, no solo el del manejador)", async () => {
    const { cookie } = await ficha(11);
    for (const ruta of ["/registro?_action=confirmar", "/registro/gracias?_action=confirmar", "/?_action=reenviar"]) {
      expect(await postSinTerminar(c.e, ruta, { cookie, "content-type": "application/x-www-form-urlencoded", "content-length": "1000" }), ruta).toBe(404);
    }
  });

  it("otros métodos, nombres y escrituras de la ruta no ejecutan confirmar: ni proveedor, ni intentos, ni cookies, ni 500", async () => {
    const { id, cookie } = await ficha(10);
    const antes = c.llamadas().length;
    const casos: Array<[string, string]> = [
      ["GET", `${RUTA}?_action=confirmar`],
      ["PUT", `${RUTA}?_action=confirmar`],
      ["PATCH", `${RUTA}?_action=confirmar`],
      ["DELETE", `${RUTA}?_action=reenviar`],
      ["POST", "/registro//verificar?_action=confirmar"],
      ["POST", "/REGISTRO/VERIFICAR?_action=confirmar"],
      ["POST", `${RUTA}%2F?_action=confirmar`],
      ["POST", `${RUTA}?_action=Confirmar`],
      ["POST", `${RUTA}?_action=registrar`],
      ["POST", `${RUTA}?_action=reportar`],
      ["POST", `${RUTA}?_action=__proto__`],
    ];
    for (const [metodo, ruta] of casos) {
      const r = await c.e.pedir(ruta, {
        method: metodo,
        ...(metodo === "GET" ? { headers: { cookie } } : { body: "codigo=123456", headers: { cookie, origin: c.e.base, "content-type": "application/x-www-form-urlencoded" } }),
      });
      expect(r.status, `${metodo} ${ruta}`).not.toBe(500);
      expect(r.status, `${metodo} ${ruta}`).not.toBe(303);
      expect(r.headers.getSetCookie(), `${metodo} ${ruta}`).toEqual([]);
    }
    expect(c.llamadas()).toHaveLength(antes);
    expect(await cuposDeLaFicha((sql, p) => prisma.$queryRawUnsafe(sql, ...p), id, SECRETO)).toEqual({ intentos: 0, reenvios: 0, espera: 0 });
    expect((await prisma.negocio.findUniqueOrThrow({ where: { id } })).numeroVerificadoEn).toBeNull();
  });

  it("la cookie: el paso no lleva el número ni un código; el borrado trae Max-Age=0 con los mismos Path, HttpOnly, SameSite y Secure; reusarla tras el éxito no vuelve a llamar al proveedor", async () => {
    const { id, cookie } = await ficha(18);
    const valor = cookie.slice(COOKIE_PASO.length + 1);
    const contenido = JSON.parse(Buffer.from(valor.split(".")[0], "base64url").toString("utf8")) as Record<string, unknown>;
    expect(Object.keys(contenido).sort()).toEqual(["creadaEnMs", "negocioId", "ultimosCuatroDigitos"]);
    expect(JSON.stringify(contenido)).not.toContain(WHATSAPP[18]);

    const ok = await postear(c.e, `${RUTA}?_action=confirmar`, "codigo=123456", { cookie });
    expect(ok.headers.get("location")).toBe("/registro/gracias?verificado=1");
    const [borrado] = ok.headers.getSetCookie();
    const atributos = borrado.split(";").map((a) => a.trim().toLowerCase());
    expect(atributos[0]).toBe(`${COOKIE_PASO}=`);
    expect(atributos).toEqual(expect.arrayContaining(["max-age=0", "path=/registro/verificar", "httponly", "samesite=lax", "secure"]));
    expect(atributos.some((a) => a.startsWith("domain="))).toBe(false);

    const comprobaciones = c.llamadas().filter((l) => l.ruta === "/VerificationCheck").length;
    const otra = await postear(c.e, `${RUTA}?_action=confirmar`, "codigo=999999", { cookie });
    expect(otra.headers.get("location")).toBe("/registro/gracias?verificado=1");
    expect(c.llamadas().filter((l) => l.ruta === "/VerificationCheck")).toHaveLength(comprobaciones);
    expect((await prisma.negocio.findUniqueOrThrow({ where: { id } })).estado).toBe("en_revision");
  });
});

describe.runIf(backendsIndependientes)("encendida · fuerza bruta concurrente (PostgreSQL real)", () => {
  it("una ráfaga de 40 códigos equivocados con la misma cookie: cuántos llegan al proveedor", async () => {
    const c = await levantar("rafaga-codigos", ENCENDIDA);
    try {
      const { id, cookie } = await ficha(19);
      writeFileSync(c.guion, "enviado,pending");
      const respuestas = await Promise.all(
        Array.from({ length: 40 }, (_, i) => postear(c.e, `${RUTA}?_action=confirmar`, `codigo=${String(100000 + i)}`, { cookie })),
      );
      const estados = respuestas.map((r) => r.status);
      expect(estados.every((s) => s === 303)).toBe(true);
      const comprobaciones = c.llamadas().filter((l) => l.ruta === "/VerificationCheck").length;
      const intentos = (await cuposDeLaFicha((sql, p) => prisma.$queryRawUnsafe(sql, ...p), id, SECRETO)).intentos;
      console.warn(`[adversarial] ráfaga de 40 códigos: ${comprobaciones} comprobaciones al proveedor, ${intentos} intentos apuntados`);
      // La cota documentada en `limites.ts` es "uno o dos intentos de más"
      // sobre 5. Esto fija lo MEDIDO (ver c-seguridad.md).
      expect(comprobaciones).toBeGreaterThanOrEqual(5);
      expect(comprobaciones).toBeLessThanOrEqual(40);
    } finally {
      c.e.detener();
    }
  }, 120_000);
});
