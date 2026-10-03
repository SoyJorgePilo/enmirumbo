/**
 * Spec `plataforma-astro` (change `migrar-panel-admin-base-astro`, Fase 5a;
 * tasks.md #3), requirement "Toda ruta del panel exige sesión por
 * construcción, no por lista", y el MODIFIED "Cada Action corre solo por
 * envío de formulario y solo desde su ruta" (la guarda va antes que la tabla).
 *
 * Dos partes:
 *
 * - **Sin build:** la tabla cerrada de políticas (`POLITICAS_DEL_PANEL`), la
 *   falla cerrada de una ruta nueva sin alta, la exención de exactamente dos
 *   Actions, la guarda que no lee la cookie donde no la necesita.
 * - **Sobre la SALIDA SERVIDA, con PostgreSQL:** las rutas reales de la build
 *   contra la tabla, nada del panel prerenderizado, el recorrido sin sesión
 *   (con cada cookie que no es sesión y con el panel sin configurar) contra lo
 *   medido en Next (`tests/fixtures/next-5a/respuestas.json`), las Actions sin
 *   sesión y el comodín.
 *
 * Todo ficticio: contraseña y secreto generados aquí, WhatsApp 77199951xx,
 * IPs de documentación (RFC 5737).
 */
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { compararRedireccion, resumenDeRespuesta, RUTAS_CON_SESION, RUTAS_DEL_COMODIN, FORMAS_SIN_ACCION } from "../scripts/diff-html/panel.mjs";
import { ACCIONES, CACHE_DE_ACCION } from "../src/astro/acciones";
import { CACHE_DE_HTML_DINAMICO } from "../src/astro/cabeceras";
import {
  ACCIONES_SIN_SESION,
  POLITICAS_DEL_PANEL,
  exigirSesionAdmin,
  guardiaDelPanel,
  politicaDe,
  politicasSinRuta,
  rutasSinPolitica,
} from "../src/astro/panel/guardia";
import type { PrismaClient } from "../src/generated/prisma/client";
import { VARIABLE_CONTRASENA, VARIABLE_SECRETO_SESION } from "../src/lib/admin/config";
import { MENSAJE_PANEL_NO_DISPONIBLE } from "../src/lib/admin/textos";
import { crearClientePrueba } from "./db";
import {
  COLA_5A,
  SEMBRADO_COLA,
  SESIONES_INVALIDAS,
  borrarIntentos,
  borrarLoDe5a,
  cookieDeSesion,
  cuantosDe5a,
  intentosDe,
  sembrarCola,
} from "./panel-astro";
import { enTrozos, postearPorTrozos } from "./postear-por-trozos";
import { type Emulador, construirSiHaceFalta, levantarEmulador } from "./salida-astro";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const MEDIDO = JSON.parse(readFileSync(path.join(raiz, "tests/fixtures/next-5a/respuestas.json"), "utf8"));
const CONTRASENA = `clave-ficticia-${randomBytes(6).toString("hex")}`;
const SECRETO = randomBytes(32).toString("hex");
const PANEL = { [VARIABLE_CONTRASENA]: CONTRASENA, [VARIABLE_SECRETO_SESION]: SECRETO, REGISTRO_ENCABEZADO_IP: "x-forwarded-for" };
const MIB = 1024 * 1024;

// ── Sin build ────────────────────────────────────────────────────────────────

/** Un almacén de cookies que cuenta sus lecturas. */
function frascoQueCuenta(valor?: string) {
  const frasco = { lecturas: 0, get: () => (frasco.lecturas++, valor === undefined ? undefined : { value: valor }) };
  return frasco;
}

const contexto = (routePattern: string, metodo = "GET", valor?: string) => ({
  routePattern,
  request: new Request("https://enmirumbo.example/x", { method: metodo }),
  cookies: frascoQueCuenta(valor),
});

describe("panel · la tabla de políticas es cerrada", () => {
  it("tiene exactamente las cuatro rutas de 5a, con su política, y no se puede cambiar", () => {
    expect(POLITICAS_DEL_PANEL).toEqual({
      "/admin": "acceso",
      "/admin/[...resto]": "no-existe",
      "/admin/cola": "exige-sesion",
      "/admin/negocios": "exige-sesion",
    });
    expect(Object.isFrozen(POLITICAS_DEL_PANEL)).toBe(true);
  });

  it("una ruta del panel sin alta exige sesión (falla cerrada); lo que no es del panel no tiene política", () => {
    for (const patron of ["/admin/nueva", "/admin/registros/[id]", "/admin/foto/[clave]/[variante]", "/admin/cola/[x]"]) {
      expect(politicaDe(patron), patron).toBe("exige-sesion");
    }
    for (const patron of ["/", "/administracion", "/[destino]", "/negocio/[ficha]", "/envio-rechazado", "/500", "/404", "/_actions/[...path]"]) {
      expect(politicaDe(patron), patron).toBeUndefined();
    }
  });

  it("la verificación nombra la ruta nueva sin alta y la entrada vieja sin ruta", () => {
    const deLaBuild = ["/", "/admin", "/admin/[...resto]", "/admin/cola", "/admin/negocios"];
    expect(rutasSinPolitica(deLaBuild)).toEqual([]);
    expect(politicasSinRuta(deLaBuild)).toEqual([]);
    expect(rutasSinPolitica([...deLaBuild, "/admin/nueva"])).toEqual(["/admin/nueva"]);
    expect(politicasSinRuta(deLaBuild.filter((p) => p !== "/admin/negocios"))).toEqual(["/admin/negocios"]);
  });

  it("solo dos Actions corren sin sesión: entrar en /admin y salir en /admin/cola", () => {
    expect(ACCIONES_SIN_SESION).toEqual([
      { ruta: "/admin", nombre: "entrar" },
      { ruta: "/admin/cola", nombre: "salir" },
    ]);
    expect(Object.isFrozen(ACCIONES_SIN_SESION)).toBe(true);
  });

  it("toda Action de la tabla con ruta del panel queda detrás de la guarda, salvo las dos exentas", () => {
    const delPanel = Object.entries(ACCIONES).filter(([, entrada]) => entrada.ruta === "/admin" || entrada.ruta.startsWith("/admin/"));
    expect(delPanel.map(([nombre]) => nombre).sort()).toEqual(["entrar", "salir"]);
    for (const [nombre, entrada] of delPanel) {
      const exenta = ACCIONES_SIN_SESION.some((a) => a.ruta === entrada.ruta && a.nombre === nombre);
      // Desde su ruta y sin sesión: solo pasa si está exenta.
      const r = guardiaDelPanel(contexto(entrada.ruta, "POST"), nombre);
      expect(r === undefined, `${nombre} en ${entrada.ruta}`).toBe(exenta || POLITICAS_DEL_PANEL[entrada.ruta] === "acceso");
      // Desde cualquier OTRA ruta que exige sesión: la guarda responde antes que la tabla.
      for (const otra of ["/admin/cola", "/admin/negocios", "/admin/nueva"].filter((r) => r !== entrada.ruta)) {
        const respuesta = guardiaDelPanel(contexto(otra, "POST"), nombre);
        expect(respuesta?.status, `${nombre} desde ${otra}`).toBe(303);
        expect(respuesta?.headers.get("location")).toBe("/admin");
      }
    }
  });
});

describe("panel · la guarda en el middleware", () => {
  it("sin sesión, una pantalla responde el 307 medido a /admin, sin parámetros, con no-store", () => {
    for (const metodo of ["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]) {
      const r = guardiaDelPanel(contexto("/admin/cola", metodo), undefined);
      expect(r?.status, metodo).toBe(307);
      expect(r?.headers.get("location")).toBe("/admin");
      expect(r?.headers.get("cache-control")).toBe(CACHE_DE_HTML_DINAMICO);
      expect(r?.headers.get("set-cookie")).toBeNull();
    }
  });

  it("sin sesión, un envío de Action responde el 303 medido a /admin con el Cache-Control de una Action", () => {
    for (const nombre of ["inventada", "aprobar", "entrar", "reportar"]) {
      const r = guardiaDelPanel(contexto("/admin/cola", "POST"), nombre);
      expect(r?.status, nombre).toBe(303);
      expect(r?.headers.get("location")).toBe("/admin");
      expect(r?.headers.get("cache-control")).toBe(CACHE_DE_ACCION);
    }
    // salir solo está exenta en la cola.
    expect(guardiaDelPanel(contexto("/admin/cola", "POST"), "salir")).toBeUndefined();
    expect(guardiaDelPanel(contexto("/admin/negocios", "POST"), "salir")?.status).toBe(303);
  });

  it("una ruta nueva sin alta, servida sin sesión, responde la redirección (no su contenido)", () => {
    const r = guardiaDelPanel(contexto("/admin/nueva"), undefined);
    expect(r?.status).toBe(307);
    expect(r?.headers.get("location")).toBe("/admin");
  });

  it("con una sesión válida deja pasar", () => {
    const anterior = { ...process.env };
    Object.assign(process.env, PANEL);
    try {
      const valor = cookieDeSesion("vigente", SECRETO).split("=")[1];
      expect(guardiaDelPanel(contexto("/admin/cola", "GET", valor), undefined)).toBeUndefined();
      expect(guardiaDelPanel(contexto("/admin/negocios", "POST", valor), "inventada")).toBeUndefined();
      for (const tipo of SESIONES_INVALIDAS) {
        const invalida = cookieDeSesion(tipo, SECRETO).split("=").slice(1).join("=");
        expect(guardiaDelPanel(contexto("/admin/cola", "GET", invalida), undefined)?.status, tipo).toBe(307);
      }
    } finally {
      for (const clave of Object.keys(PANEL)) if (!(clave in anterior)) delete process.env[clave];
      Object.assign(process.env, anterior);
    }
  });

  it("el acceso, el comodín y lo que no es del panel pasan sin leer la cookie", () => {
    for (const patron of ["/admin", "/admin/[...resto]", "/", "/registro", "/envio-rechazado", "/500"]) {
      const c = contexto(patron, "POST", "lo-que-sea");
      expect(guardiaDelPanel(c, "inventada"), patron).toBeUndefined();
      expect(c.cookies.lecturas, patron).toBe(0);
    }
  });

  it("exigirSesionAdmin relee la cookie (no confía en locals) y sin sesión da el mismo 307", () => {
    const c = { cookies: frascoQueCuenta(undefined), locals: { sesionDelPanel: true } };
    const r = exigirSesionAdmin(c);
    expect(c.cookies.lecturas).toBe(1);
    expect(r?.status).toBe(307);
    expect(r?.headers.get("location")).toBe("/admin");
  });
});

/** Archivos bajo `rutas` (archivo o carpeta) con `"use client"` o una directiva `client:` (fuera de comentarios). */
function archivosQueSeHidratan(base: string, rutas: string[]): string[] {
  const encontrados: string[] = [];
  const revisar = (ruta: string) => {
    if (statSync(ruta).isDirectory()) {
      for (const nombre of readdirSync(ruta)) revisar(path.join(ruta, nombre));
      return;
    }
    const codigo = readFileSync(ruta, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    if (/["']use client["']|\sclient:[a-z]+/.test(codigo)) encontrados.push(path.relative(base, ruta));
  };
  for (const ruta of rutas) revisar(path.join(base, ruta));
  return encontrados.sort();
}

describe("panel · disciplina por archivo", () => {
  const paginas = readdirSync(path.join(raiz, "src/pages/admin"), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => path.relative(raiz, path.join(e.parentPath, e.name)));

  it("ninguna página del panel se prerenderiza", () => {
    expect(paginas.length).toBeGreaterThanOrEqual(4);
    for (const archivo of paginas) {
      const codigo = readFileSync(path.join(raiz, archivo), "utf8");
      expect(codigo, archivo).not.toMatch(/prerender\s*=\s*true/);
      expect(codigo, archivo).toMatch(/export const prerender = false;/);
    }
  });

  // Spec `revision-admin` (MODIFIED de 5a), scenario "sin JS de cliente
  // propio": ni `"use client"` ni una directiva `client:` de Astro.
  it("ningún archivo del panel en Astro se hidrata en el navegador", () => {
    expect(archivosQueSeHidratan(raiz, ["src/pages/admin", "src/astro/panel", "src/layouts/DocumentoPanel.astro", "src/astro/componentes/NoEncontradoDelPanel.astro"])).toEqual([]);
    // Y el guardián reprueba una directiva inyectada (fixture de 2a).
    expect(archivosQueSeHidratan(raiz, ["tests/fixtures/humo-client.astro"])).toEqual(["tests/fixtures/humo-client.astro"]);
  });

  /**
   * design.md §9: ninguna prueba importa ya las piezas de 5a de Next, salvo
   * las que solo usan la cola de Next para comprobar una pantalla POSTERIOR
   * (5b–5d). Esta lista la achican los changes siguientes; el último la deja
   * vacía. Una prueba nueva que importe una pieza de 5a de Next reprueba aquí.
   */
  const EXCEPCIONES_DE_LA_COLA_DE_NEXT = ["tests/admin-despublicar-borrado.test.ts", "tests/gestion-panel.test.ts"];

  it("solo las pruebas de la lista de excepciones importan la cola de Next; nadie importa las otras piezas de 5a", () => {
    const importa = (pieza: string) =>
      readdirSync(path.join(raiz, "tests"))
        .filter((nombre) => nombre.endsWith(".ts"))
        .filter((nombre) => new RegExp(`(from|import\\()\\s*"[./]*src/app/admin/${pieza}"`).test(readFileSync(path.join(raiz, "tests", nombre), "utf8")))
        .map((nombre) => `tests/${nombre}`)
        .sort();
    expect(importa("cola/page")).toEqual(EXCEPCIONES_DE_LA_COLA_DE_NEXT);
    for (const pieza of ["page", "accion-acceso", "accion-salir", "layout", "negocios/page", "\\[\\.\\.\\.resto\\]/page"]) {
      expect(importa(pieza), pieza).toEqual([]);
    }
  });

  it("el comodín no lee la cookie, ni la petición, ni la base", () => {
    const codigo = readFileSync(path.join(raiz, "src/pages/admin/[...resto].astro"), "utf8");
    for (const prohibido of ["cookies", "Astro.request", "Astro.url", "obtenerPrisma", "exigirSesionAdmin", "locals"]) {
      expect(codigo, prohibido).not.toContain(prohibido);
    }
  });
});

// ── Sobre la build ───────────────────────────────────────────────────────────

/** Las rutas que la build sabe pintar, con su marca de prerenderizado (manifiesto del servidor). */
function rutasDeLaBuild(): Array<{ ruta: string; prerender: boolean }> {
  const trozos = path.join(raiz, ".vercel/output/_functions/chunks");
  const rutas: Array<{ ruta: string; prerender: boolean }> = [];
  for (const archivo of readdirSync(trozos)) {
    const codigo = readFileSync(path.join(trozos, archivo), "utf8");
    for (const m of codigo.matchAll(/"routeData":\{"route":"([^"]+)"[\s\S]*?"prerender":(true|false)/g)) {
      rutas.push({ ruta: m[1], prerender: m[2] === "true" });
    }
  }
  return rutas;
}

let prisma: PrismaClient;
let configurado: Emulador;
const sinConfigurar: Record<string, Emulador> = {};
let dir = "";
const ipsUsadas = new Set<string>();
let n = 0;
const otraIp = () => {
  const ip = `198.51.100.${10 + (n++ % 200)}`;
  ipsUsadas.add(ip);
  return ip;
};

beforeAll(async () => {
  construirSiHaceFalta();
  dir = mkdtempSync(path.join(tmpdir(), "panel-guardia-"));
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  await borrarLoDe5a(prisma);
  await sembrarCola(prisma);
  [configurado, sinConfigurar["sin-configurar"], sinConfigurar["sin-secreto"], sinConfigurar["secreto-corto"]] = await Promise.all([
    levantarEmulador({ ...PANEL, CONTAR_LECTURAS_ARCHIVO: path.join(dir, "sonda.json") }, { precargas: ["tests/fixtures/contar-lecturas.mjs"] }),
    levantarEmulador({ ...PANEL, [VARIABLE_CONTRASENA]: undefined, [VARIABLE_SECRETO_SESION]: undefined }),
    levantarEmulador({ ...PANEL, [VARIABLE_SECRETO_SESION]: undefined }),
    levantarEmulador({ ...PANEL, [VARIABLE_SECRETO_SESION]: "k".repeat(31) }),
  ]);
}, 300_000);

afterAll(async () => {
  configurado?.detener();
  for (const e of Object.values(sinConfigurar)) e?.detener();
  await borrarIntentos(prisma, ipsUsadas, SECRETO);
  await borrarLoDe5a(prisma);
  expect(await cuantosDe5a(prisma)).toBe(0);
  await prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

const lecturas = () => JSON.parse(readFileSync(path.join(dir, "sonda.json"), "utf8")).lecturas as number;

/** Nada sembrado en la respuesta: ni nombres, ni WhatsApp, ni identificadores, ni conteos de la cola. */
function sinDatos(texto: string, etiqueta: string) {
  for (const dato of [...SEMBRADO_COLA.nombres, ...SEMBRADO_COLA.whatsapps, ...Object.values(COLA_5A)]) {
    expect(texto, `${etiqueta}: ${dato}`).not.toContain(dato);
  }
  expect(texto, etiqueta).not.toMatch(/Lleva más de 48 horas|registros? (atrasado|esperando)/);
}

async function pedir(e: Emulador, ruta: string, init: RequestInit = {}) {
  const r = await e.pedir(ruta, init);
  const cuerpo = init.method === "HEAD" ? "" : await r.text();
  return { r, cuerpo, resumen: resumenDeRespuesta(r.status, r.headers, r.headers.getSetCookie()) };
}

describe("panel · la build contra la tabla", () => {
  it("cada ruta del panel que la build sabe pintar tiene política escrita, y la tabla no tiene rutas viejas", () => {
    const rutas = rutasDeLaBuild().map((r) => r.ruta);
    expect(rutas).toContain("/registro/verificar");
    expect(rutasSinPolitica(rutas)).toEqual([]);
    expect(politicasSinRuta(rutas)).toEqual([]);
  });

  it("ninguna ruta del panel se prerenderiza (lo prerenderizado no pasa por el middleware)", () => {
    const delPanel = rutasDeLaBuild().filter((r) => politicaDe(r.ruta) !== undefined);
    expect(delPanel.length).toBe(Object.keys(POLITICAS_DEL_PANEL).length);
    expect(delPanel.filter((r) => r.prerender)).toEqual([]);
  });
});

describe("panel · pantallas sin sesión, iguales a lo medido en Next", () => {
  it("GET, HEAD, POST, PUT y DELETE de cada pantalla: la redirección medida, sin datos", async () => {
    for (const ruta of RUTAS_CON_SESION) {
      for (const forma of FORMAS_SIN_ACCION) {
        const { cuerpo, resumen } = await pedir(configurado, ruta, {
          method: forma.metodo,
          body: forma.cuerpo,
          headers: { "x-forwarded-for": otraIp(), ...(forma.cuerpo ? { origin: configurado.base, "content-type": "application/x-www-form-urlencoded" } : {}) },
        });
        const clave = `${forma.metodo} ${ruta}`;
        expect(compararRedireccion(clave, MEDIDO.sinSesion[clave], resumen)).toEqual([]);
        sinDatos(cuerpo, clave);
      }
    }
  });

  it("cookies que no son sesión: la misma redirección que sin cookie", async () => {
    for (const tipo of SESIONES_INVALIDAS) {
      const { cuerpo, resumen } = await pedir(configurado, "/admin/cola", { headers: { cookie: cookieDeSesion(tipo, SECRETO) } });
      const clave = `GET /admin/cola (${tipo})`;
      expect(compararRedireccion(clave, MEDIDO.sinSesion[clave], resumen)).toEqual([]);
      sinDatos(cuerpo, clave);
    }
  });

  it("con el panel sin contraseña, sin secreto o con un secreto de 31: una cookie bien firmada no es sesión y el acceso no ofrece campo", async () => {
    for (const [nombre, e] of Object.entries(sinConfigurar)) {
      const firmada = nombre === "secreto-corto" ? cookieDeSesion("vigente", "k".repeat(31)) : cookieDeSesion("vigente", SECRETO);
      const { cuerpo, resumen } = await pedir(e, "/admin/cola", { headers: { cookie: firmada } });
      const clave = `GET /admin/cola (vigente, ${nombre})`;
      expect(compararRedireccion(clave, MEDIDO.sinSesion[clave], resumen)).toEqual([]);
      sinDatos(cuerpo, clave);
      const acceso = await pedir(e, "/admin", { headers: { cookie: firmada } });
      expect(acceso.r.status, nombre).toBe(200);
      expect(acceso.cuerpo, nombre).toContain(MENSAJE_PANEL_NO_DISPONIBLE);
      expect(acceso.cuerpo, nombre).not.toContain("<input");
    }
  });
});

describe("panel · Actions sin sesión", () => {
  it("una Action del panel sin sesión no lee nada: 7 MiB por trozos responden el 303 a /admin sin leer el cuerpo", async () => {
    const antes = lecturas();
    const r = await postearPorTrozos(
      new URL("/admin/cola?_action=inventada", configurado.base),
      { origin: configurado.base, "content-type": "application/x-www-form-urlencoded", "transfer-encoding": "chunked", "x-forwarded-for": otraIp() },
      { trozos: () => enTrozos(Buffer.alloc(7 * MIB, "a")) },
    );
    expect(r.status).toBe(303);
    expect(r.cabeceras.get("location")).toBe("/admin");
    expect(r.cabeceras.get("cache-control")).toBe(CACHE_DE_ACCION);
    expect(r.cabeceras.get("set-cookie")).toBeNull();
    expect(lecturas()).toBe(antes);
    expect(r.escritos).toBeLessThan(7 * MIB);
  });

  it("la guarda del panel va antes de la tabla: entrar en la cola y salir en el listado no hacen nada", async () => {
    const ip = otraIp();
    const entrar = await pedir(configurado, "/admin/cola?_action=entrar", {
      method: "POST",
      body: `contrasena=${encodeURIComponent(CONTRASENA)}`,
      headers: { origin: configurado.base, "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip },
    });
    const salir = await pedir(configurado, "/admin/negocios?_action=salir", {
      method: "POST",
      body: "",
      headers: { origin: configurado.base, "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip },
    });
    for (const [nombre, { r }] of [["entrar", entrar], ["salir", salir]] as const) {
      expect(r.status, nombre).toBe(303);
      expect(r.headers.get("location"), nombre).toBe("/admin");
      expect(r.headers.getSetCookie(), nombre).toEqual([]);
    }
    expect(await intentosDe(prisma, ip, SECRETO)).toBe(0);
  });

  it("salir sin sesión desde la cola sigue exento (paridad con Next: igual lleva a «Cerraste sesión.»)", async () => {
    const { r } = await pedir(configurado, "/admin/cola?_action=salir", {
      method: "POST",
      body: "",
      headers: { origin: configurado.base, "content-type": "application/x-www-form-urlencoded" },
    });
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("/admin?salida=1");
    expect(r.headers.getSetCookie()).toHaveLength(1);
  });
});

describe("panel · lo que no existe no exige sesión", () => {
  it("el comodín responde la misma 404 del panel con sesión y sin ella", async () => {
    const sinFecha = (h: Headers) => JSON.stringify([...h].filter(([k]) => k !== "date"));
    for (const ruta of RUTAS_DEL_COMODIN) {
      const sin = await pedir(configurado, ruta);
      const con = await pedir(configurado, ruta, { headers: { cookie: cookieDeSesion("vigente", SECRETO) } });
      expect(sin.r.status, ruta).toBe(404);
      expect(con.r.status, ruta).toBe(404);
      expect(con.cuerpo, ruta).toBe(sin.cuerpo);
      expect(sinFecha(con.r.headers), ruta).toBe(sinFecha(sin.r.headers));
      expect(sin.cuerpo, ruta).toContain("No encontramos esta página");
      expect(sin.cuerpo, ruta).toContain('<meta name="referrer" content="strict-origin">');
    }
  });
});
