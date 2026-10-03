/**
 * Spec `plataforma-astro` (change `migrar-panel-admin-base-astro`, Fase 5a;
 * tasks.md #4), sobre la SALIDA SERVIDA con PostgreSQL:
 *
 * - "La pantalla de acceso responde desde Astro el mismo HTML que Next"
 *   (contra `tests/fixtures/next-5a/acceso*.html`, con las dos
 *   normalizaciones de formulario de 3a y la diferencia aceptada de la
 *   cabecera de referente);
 * - "Entrar y salir sin JavaScript se comportan igual que en Next" (los
 *   envíos de `enviosDe5a` contra los de Next, el recorrido completo con un
 *   frasco de cookies, el envío que Astro no pudo leer, nada sensible fuera
 *   de su lugar);
 * - el MODIFIED de la tabla de Actions: `entrar` y `salir` solo desde su ruta.
 *
 * Todo ficticio: contraseña y secreto generados aquí; IPs de documentación.
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { NORMALIZACIONES_FORMULARIO } from "../scripts/diff-html/nucleo.mjs";
import {
  ACCESO_SIN_CONFIGURAR,
  PANTALLAS_DE_ACCESO,
  compararPantallaDelPanel,
  compararRedireccion,
  enviosDe5a,
  resumenDeRespuesta,
} from "../scripts/diff-html/panel.mjs";
import { Frasco, enviarFormulario, leerSetCookie } from "../scripts/enviar-formulario.mjs";
import { CACHE_DE_ACCION } from "../src/astro/acciones";
import type { PrismaClient } from "../src/generated/prisma/client";
import { VARIABLE_CONTRASENA, VARIABLE_SECRETO_SESION } from "../src/lib/admin/config";
import { NOMBRE_COOKIE_SESION, haySesionValida } from "../src/lib/admin/sesion";
import {
  ERROR_CONTRASENA_INCORRECTA,
  ERROR_DEMASIADOS_INTENTOS,
  MENSAJE_PANEL_NO_DISPONIBLE,
  MENSAJE_SESION_CERRADA,
  TEXTO_COLA_ENCABEZADO,
} from "../src/lib/admin/textos";
import { crearClientePrueba } from "./db";
import * as panel from "./panel-astro";
import { enTrozos, postearPorTrozos } from "./postear-por-trozos";
import { type Emulador, construirSiHaceFalta, levantarEmulador } from "./salida-astro";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FIXTURES = path.join(raiz, "tests/fixtures/next-5a");
const MEDIDO = JSON.parse(readFileSync(path.join(FIXTURES, "respuestas.json"), "utf8"));
const CONTRASENA = `clave-ficticia-${randomBytes(6).toString("hex")}`;
const SECRETO = randomBytes(32).toString("hex");
const PANEL = { [VARIABLE_CONTRASENA]: CONTRASENA, [VARIABLE_SECRETO_SESION]: SECRETO, REGISTRO_ENCABEZADO_IP: "x-forwarded-for", SITIO_URL: "https://enmirumbo.example" };
const SIN_CONFIGURAR: Record<string, Record<string, string | undefined>> = {
  "sin-configurar": { [VARIABLE_CONTRASENA]: undefined, [VARIABLE_SECRETO_SESION]: undefined },
  "sin-secreto": { [VARIABLE_SECRETO_SESION]: undefined },
  "secreto-corto": { [VARIABLE_SECRETO_SESION]: "k".repeat(31) },
};
const MIB = 1024 * 1024;

let prisma: PrismaClient;
let astro: Emulador;
const incompletos: Record<string, Emulador> = {};
const ipsUsadas = new Set<string>();
let n = 0;
const otraIp = () => {
  const ip = `192.0.2.${10 + (n++ % 200)}`;
  ipsUsadas.add(ip);
  return ip;
};

beforeAll(async () => {
  construirSiHaceFalta();
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  const [a, ...resto] = await Promise.all([
    levantarEmulador(PANEL),
    ...Object.values(SIN_CONFIGURAR).map((extra) => levantarEmulador({ ...PANEL, ...extra })),
  ]);
  astro = a;
  Object.keys(SIN_CONFIGURAR).forEach((nombre, i) => (incompletos[nombre] = resto[i]));
}, 300_000);

afterAll(async () => {
  astro?.detener();
  for (const e of Object.values(incompletos)) e?.detener();
  await panel.borrarIntentos(prisma, ipsUsadas, SECRETO);
  await prisma.$disconnect();
});

const fixture = (nombre: string) => readFileSync(path.join(FIXTURES, nombre), "utf8").replace(/>\n</g, "><");

async function documento(e: Emulador, ruta: string, cookie?: string) {
  const r = await e.pedir(ruta, { headers: cookie ? { cookie } : {} });
  return { status: r.status, headers: Object.fromEntries(r.headers), cuerpo: await r.text() };
}

function comoNext(nombre: string) {
  const medido = MEDIDO.pantallas[nombre];
  return {
    status: medido.status,
    headers: {
      "content-type": medido["content-type"],
      "cache-control": medido["cache-control"],
      "referrer-policy": medido["referrer-policy"],
      "x-content-type-options": medido["x-content-type-options"],
      "x-frame-options": medido["x-frame-options"],
    },
    cuerpo: fixture(nombre),
  };
}

/** Las cabeceras de seguridad de Next que el fixture no guarda (la CSP) se toman de Astro: la CSP es la misma función. */
function conCsp(next: ReturnType<typeof comoNext>, astroH: Record<string, string>) {
  return { ...next, headers: { ...next.headers, "content-security-policy": astroH["content-security-policy"] } };
}

describe("acceso · la pantalla responde lo mismo que Next", () => {
  it("los seis estados con el panel configurado: solo las normalizaciones del formulario", async () => {
    const aplicadas: string[] = [];
    for (const [nombre, ruta] of PANTALLAS_DE_ACCESO) {
      const a = await documento(astro, ruta);
      const d = compararPantallaDelPanel(ruta, conCsp(comoNext(nombre), a.headers), a, {
        dinamica: true,
        formulario: { urlPagina: new URL(ruta, astro.base).toString(), aplicadas },
      });
      expect(d, ruta).toEqual([]);
      expect(a.cuerpo, ruta).not.toMatch(/<script|astro-island|modulepreload/);
    }
    // Las dos normalizaciones de 3a, una vez por pantalla; ninguna otra.
    expect(new Set(aplicadas)).toEqual(new Set(NORMALIZACIONES_FORMULARIO.map((x) => x.id)));
  });

  it("?error=x&error=intentos no pinta ningún mensaje (repetido no vale, lista cerrada; decisión 7)", async () => {
    const a = await documento(astro, "/admin?error=x&error=intentos");
    expect(a.cuerpo).not.toContain(ERROR_DEMASIADOS_INTENTOS);
    expect(a.cuerpo).not.toContain('role="alert"');
    expect(a.cuerpo).not.toContain("aria-invalid=\"true\"");
  });

  it("sin contraseña, sin secreto o con secreto de 31: el mismo HTML que Next, sin campo", async () => {
    for (const [nombre, variante] of ACCESO_SIN_CONFIGURAR) {
      const a = await documento(incompletos[variante], "/admin");
      expect(compararPantallaDelPanel(`/admin (${variante})`, conCsp(comoNext(nombre), a.headers), a, { dinamica: true }), variante).toEqual([]);
      expect(a.cuerpo).toContain(MENSAJE_PANEL_NO_DISPONIBLE);
      expect(a.cuerpo).not.toContain("<input");
    }
  });

  it("el panel sin configurar abierto diez veces: el log lo dice una sola vez y la respuesta no dice qué falta", async () => {
    const e = incompletos["sin-configurar"];
    for (let i = 0; i < 10; i++) {
      const a = await documento(e, "/admin");
      expect(a.cuerpo).toContain(MENSAJE_PANEL_NO_DISPONIBLE);
      for (const variable of [VARIABLE_CONTRASENA, VARIABLE_SECRETO_SESION]) {
        expect(a.cuerpo).not.toContain(variable);
        expect(JSON.stringify(a.headers)).not.toContain(variable);
      }
    }
    const avisos = e.registro().split("\n").filter((l) => l.includes("[panel] el panel no abre"));
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain(VARIABLE_CONTRASENA);
  });

  it("con sesión, /admin responde la redirección medida a la cola", async () => {
    const r = await astro.pedir("/admin", { headers: { cookie: panel.cookieDeSesion("vigente", SECRETO) } });
    const clave = "GET /admin (con sesión)";
    expect(compararRedireccion(clave, MEDIDO.sinSesion[clave], resumenDeRespuesta(r.status, r.headers, r.headers.getSetCookie()))).toEqual([]);
  });
});

describe("acceso · entrar y salir, iguales a Next", () => {
  it("cada envío coincide en la cadena, el Location, los atributos de Set-Cookie y las filas de intentos", async () => {
    type Envio = { cadena: unknown; intentos: number; post: Record<string, unknown>; atras?: unknown };
    const deAstro = await enviosDe5a(astro.base, incompletos["sin-configurar"].base, { prisma, panel, secreto: SECRETO, contrasena: CONTRASENA });
    expect(Object.keys(deAstro)).toEqual(Object.keys(MEDIDO.envios));
    for (const [nombre, n] of Object.entries(MEDIDO.envios) as Array<[string, Envio]>) {
      const a = deAstro[nombre];
      expect(a.cadena, nombre).toEqual(n.cadena);
      expect(a.intentos, nombre).toBe(n.intentos);
      expect(a.atras, nombre).toEqual(n.atras);
      expect(compararRedireccion(`POST ${nombre}`, n.post, a.post), nombre).toEqual([]);
      expect(a.post["cache-control"], nombre).toBe(CACHE_DE_ACCION);
    }
  });

  it("recorrido completo sin JS: 200 → 303 → 200 incorrecta → 303 → 200 cola → 303 → 200 «Cerraste sesión.» y «atrás» pide la cola sin cookie", async () => {
    const frasco = new Frasco();
    const ip = otraIp();
    const acceso = new URL("/admin", astro.base).toString();
    const mal = await enviarFormulario({ urlPagina: acceso, elecciones: { contrasena: "equivocada-ficticia" }, frasco, cabecerasExtra: { "x-forwarded-for": ip } });
    expect(mal.cadena.map((p) => p.status)).toEqual([200, 303, 200]);
    expect(mal.cadena[1].cabeceras.get("referrer-policy")).toBe("strict-origin");
    expect(mal.final.html).toContain(ERROR_CONTRASENA_INCORRECTA);
    const bien = await enviarFormulario({ urlPagina: acceso, elecciones: { contrasena: CONTRASENA }, frasco, cabecerasExtra: { "x-forwarded-for": ip } });
    expect(bien.cadena.map((p) => p.status)).toEqual([200, 303, 200]);
    expect(bien.final.html).toContain(TEXTO_COLA_ENCABEZADO);
    expect(frasco.tiene(NOMBRE_COOKIE_SESION)).toBe(true);
    // La cookie que emite Astro es una sesión de Next (mismo formato, mismo secreto).
    expect(haySesionValida(frasco.valor(NOMBRE_COOKIE_SESION), { [VARIABLE_CONTRASENA]: CONTRASENA, [VARIABLE_SECRETO_SESION]: SECRETO })).toBe(true);
    const cola = new URL("/admin/cola", astro.base).toString();
    const salir = await enviarFormulario({ urlPagina: cola, frasco });
    expect(salir.cadena.map((p) => p.status)).toEqual([200, 303, 200]);
    expect(salir.cadena[1].url).toBe(`${cola}?_action=salir`);
    expect(salir.final.html).toContain(MENSAJE_SESION_CERRADA);
    expect(frasco.tiene(NOMBRE_COOKIE_SESION)).toBe(false);
    const atras = await astro.pedir("/admin/cola", { headers: frasco.cabecera(cola) ? { cookie: frasco.cabecera(cola)! } : {} });
    expect(atras.status).toBe(307);
    expect(atras.headers.get("location")).toBe("/admin");
    expect(atras.headers.get("cache-control")).toContain("no-store");
  });

  it("recargar la pantalla de destino no repite la Action", async () => {
    const ip = otraIp();
    await enviarFormulario({ urlPagina: new URL("/admin", astro.base).toString(), elecciones: { contrasena: "equivocada-ficticia" }, cabecerasExtra: { "x-forwarded-for": ip } });
    expect(await panel.intentosDe(prisma, ip, SECRETO)).toBe(1);
    for (let i = 0; i < 3; i++) await astro.pedir("/admin?error=incorrecta", { headers: { "x-forwarded-for": ip } });
    expect(await panel.intentosDe(prisma, ip, SECRETO)).toBe(1);
  });

  it("las respuestas de error son idénticas para cualquier contraseña equivocada", async () => {
    const ip = otraIp();
    const firmas: string[] = [];
    for (const clave of ["a", "x".repeat(10_000), CONTRASENA.slice(0, -1), `${CONTRASENA} `]) {
      await panel.borrarIntentos(prisma, [ip], SECRETO);
      const r = await enviarFormulario({ urlPagina: new URL("/admin", astro.base).toString(), elecciones: { contrasena: clave }, cabecerasExtra: { "x-forwarded-for": ip } });
      const post = r.cadena[1];
      firmas.push(JSON.stringify([post.status, post.location, post.setCookie, [...post.cabeceras].filter(([k]) => k !== "date")]));
    }
    expect(new Set(firmas).size).toBe(1);
  });

  it("nada sensible fuera de su lugar: ni la contraseña, ni la intentada, ni la cookie, ni la IP en el log, las URLs o las cabeceras", async () => {
    const ip = otraIp();
    const intentada = `intentada-ficticia-${randomBytes(4).toString("hex")}`;
    const vistos: string[] = [];
    const guardar = (r: Awaited<ReturnType<typeof enviarFormulario>>) => {
      for (const p of r.cadena) vistos.push(p.url, p.location ?? "", JSON.stringify([...p.cabeceras].filter(([k]) => k !== "set-cookie")));
    };
    const frasco = new Frasco();
    guardar(await enviarFormulario({ urlPagina: new URL("/admin", astro.base).toString(), elecciones: { contrasena: intentada }, frasco, cabecerasExtra: { "x-forwarded-for": ip } }));
    guardar(await enviarFormulario({ urlPagina: new URL("/admin", astro.base).toString(), elecciones: { contrasena: CONTRASENA }, frasco, cabecerasExtra: { "x-forwarded-for": ip } }));
    const valor = frasco.valor(NOMBRE_COOKIE_SESION)!;
    for (let i = 0; i < 5; i++) {
      guardar(await enviarFormulario({ urlPagina: new URL("/admin", astro.base).toString(), elecciones: { contrasena: intentada }, cabecerasExtra: { "x-forwarded-for": ip } }));
    }
    const todo = `${astro.registro()}\n${vistos.join("\n")}`;
    expect(todo).toContain("[panel] acceso rechazado: demasiados intentos");
    for (const secreto of [CONTRASENA, intentada, valor, ip, SECRETO]) expect(todo).not.toContain(secreto);
  });
});

describe("acceso · un envío que Astro no pudo leer va a /admin sin tocar nada", () => {
  it("7 MiB, un JSON con la contraseña correcta y un text/plain: 303 a /admin, sin cookie, sin 500, sin intentos", async () => {
    const ip = otraIp();
    const base = { origin: astro.base, "x-forwarded-for": ip };
    const grande = await postearPorTrozos(new URL("/admin?_action=entrar", astro.base), { ...base, "content-type": "application/x-www-form-urlencoded", "transfer-encoding": "chunked" }, {
      trozos: () => enTrozos(Buffer.from(`contrasena=${CONTRASENA}&relleno=${"a".repeat(7 * MIB)}`)),
    });
    const json = await astro.pedir("/admin?_action=entrar", { method: "POST", headers: { ...base, "content-type": "application/json" }, body: JSON.stringify({ contrasena: CONTRASENA }) });
    const texto = await astro.pedir("/admin?_action=entrar", { method: "POST", headers: { ...base, "content-type": "text/plain" }, body: `contrasena=${CONTRASENA}` });
    for (const [nombre, status, location, cookies] of [
      ["7 MiB", grande.status, grande.cabeceras.get("location"), grande.cabeceras.get("set-cookie")],
      ["JSON", json.status, json.headers.get("location"), json.headers.get("set-cookie")],
      ["text/plain", texto.status, texto.headers.get("location"), texto.headers.get("set-cookie")],
    ] as const) {
      expect(status, nombre).toBe(303);
      expect(location, nombre).toBe("/admin");
      expect(cookies, nombre).toBeNull();
    }
    expect(await panel.intentosDe(prisma, ip, SECRETO)).toBe(0);
  });

  it("salir que no se pudo leer tampoco borra la cookie", async () => {
    const r = await astro.pedir("/admin/cola?_action=salir", {
      method: "POST",
      headers: { origin: astro.base, "content-type": "application/json", cookie: panel.cookieDeSesion("vigente", SECRETO) },
      body: "{}",
    });
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("/admin");
    expect(r.headers.getSetCookie()).toEqual([]);
  });
});

describe("acceso · entrar y salir solo desde su ruta (MODIFIED de la tabla de Actions)", () => {
  async function postear(ruta: string, cuerpo: string, cookie?: string, ip = otraIp()) {
    return astro.pedir(ruta, {
      method: "POST",
      body: cuerpo,
      headers: { origin: astro.base, "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip, ...(cookie ? { cookie } : {}) },
    });
  }
  const sinFecha = (h: Headers) => JSON.stringify([...h].filter(([k]) => !["date", "connection", "keep-alive"].includes(k)));

  it("la contraseña correcta como POST /?_action=entrar y POST /admin/negocios?_action=entrar con sesión: nada, ni intentos ni cookie", async () => {
    const ip = otraIp();
    const desdeLaPortada = await postear("/?_action=entrar", `contrasena=${CONTRASENA}`, undefined, ip);
    const desdeElListado = await postear("/admin/negocios?_action=entrar", `contrasena=${CONTRASENA}`, panel.cookieDeSesion("vigente", SECRETO), ip);
    const salirDesdeElAcceso = await postear("/admin?_action=salir", "", panel.cookieDeSesion("vigente", SECRETO), ip);
    for (const [nombre, r] of [["portada", desdeLaPortada], ["listado", desdeElListado], ["salir en /admin", salirDesdeElAcceso]] as const) {
      expect(r.status, nombre).toBe(404);
      expect(r.headers.getSetCookie(), nombre).toEqual([]);
      expect(await r.text(), nombre).toContain("No encontramos esta página");
    }
    expect(await panel.intentosDe(prisma, ip, SECRETO)).toBe(0);
  });

  it("RPC cerrado: /_actions/entrar y /_actions/salir responden igual que /a/b/c, sin intentos ni cookie", async () => {
    const ip = otraIp();
    const referencia = await astro.pedir("/a/b/c");
    const cuerpoReferencia = await referencia.text();
    for (const ruta of ["/_actions/entrar", "/_actions/salir"]) {
      for (const [tipo, cuerpo] of [
        ["application/x-www-form-urlencoded", `contrasena=${CONTRASENA}`],
        ["application/json", JSON.stringify({ contrasena: CONTRASENA })],
      ]) {
        const r = await astro.pedir(ruta, { method: "POST", body: cuerpo, headers: { origin: astro.base, "content-type": tipo, "x-forwarded-for": ip, cookie: panel.cookieDeSesion("vigente", SECRETO) } });
        expect(r.status, ruta).toBe(referencia.status);
        expect(await r.text(), ruta).toBe(cuerpoReferencia);
        expect(sinFecha(r.headers), ruta).toBe(sinFecha(referencia.headers));
      }
    }
    expect(await panel.intentosDe(prisma, ip, SECRETO)).toBe(0);
  });

  it("un envío de otro origen a /admin responde el 403 sin apartar intento (login CSRF)", async () => {
    const ip = otraIp();
    for (const origin of ["https://evil.example", "null"]) {
      const r = await astro.pedir("/admin?_action=entrar", {
        method: "POST",
        body: `contrasena=${CONTRASENA}`,
        headers: { origin, "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip },
      });
      expect(r.status, origin).toBe(403);
      expect(r.headers.getSetCookie(), origin).toEqual([]);
    }
    expect(await panel.intentosDe(prisma, ip, SECRETO)).toBe(0);
  });

  it("la cookie que pone Astro lleva exactamente los atributos de Next (HttpOnly, SameSite=Lax, Path=/admin, Max-Age=28800, Secure)", async () => {
    const r = await enviarFormulario({ urlPagina: new URL("/admin", astro.base).toString(), elecciones: { contrasena: CONTRASENA }, cabecerasExtra: { "x-forwarded-for": otraIp() } });
    const [linea] = r.cadena[1].setCookie;
    const { nombre, atributos } = leerSetCookie(linea);
    expect(nombre).toBe(NOMBRE_COOKIE_SESION);
    const sinFecha = Object.fromEntries(Object.entries(atributos).filter(([clave]) => clave !== "expires"));
    expect({ ...sinFecha, samesite: sinFecha.samesite?.toLowerCase() }).toEqual({ httponly: "", samesite: "lax", path: "/admin", "max-age": "28800", secure: "" });
  });
});
