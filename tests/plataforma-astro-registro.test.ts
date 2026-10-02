/**
 * Spec `plataforma-astro` (change `migrar-registro-astro`, T-024, Fase 3b-1).
 * tasks.md #4: una prueba por scenario de "La página de registro responde
 * desde Astro el mismo HTML que Next", "El envío del registro sin JavaScript
 * se comporta igual que en Next", "La pantalla de gracias responde desde
 * Astro igual que en Next" y de los MODIFIED de Actions y PRG.
 *
 * Contra la SALIDA SERVIDA (build real + emulador del Build Output API) y con
 * el arnés de envío sin JS (`scripts/enviar-formulario.mjs`). Lo de Next sale
 * de los fixtures de la tarea 2 (`tests/fixtures/next-3b`), capturados con la
 * misma siembra que aquí: las cuatro fichas llevan los MISMOS WhatsApp
 * ficticios. Los ids de catálogo se comparan por nombre
 * (`idsDeCatalogoPorNombre`).
 *
 * Todo ficticio: WhatsApp 77199981xx/77199983xx, IPs de documentación (RFC
 * 5737), dominios `.example`, fotos generadas aquí.
 */
import { existsSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { request } from "node:http";
import path from "node:path";

import { parse } from "node-html-parser";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { NORMALIZACIONES_REGISTRO, compararRespuestas, idsDeCatalogoPorNombre } from "../scripts/diff-html/nucleo.mjs";
import {
  SEMBRADAS_3B,
  enviarFormulario,
  enviosDe3b,
  erroresDelFormulario,
  resumenDeLaBase,
  resumenDelDesenlace,
  valoresDelFormulario,
  whatsappDelEnvio,
} from "../scripts/enviar-formulario.mjs";
import type { PrismaClient } from "../src/generated/prisma/client";
import { VARIABLE_SRC, VARIABLE_WEBSITE_ID } from "../src/lib/analitica/config";
import { almacenDeFotos, nombreDeObjeto } from "../src/lib/fotos/almacen";
import { VERSION_AVISO } from "../src/lib/legales/version";
import { AVISO_FOTO_NO_GUARDADA, MENSAJES_ERROR_FOTO, MENSAJES_ERROR_REGISTRO, MENSAJE_GRACIAS } from "../src/lib/registro/textos";
import { cabecerasDeSeguridad } from "../src/lib/seguridad/csp";
import { crearClientePrueba } from "./db";
import { fotosDelArnes, jpegDePrueba } from "./fotos-fixtures";
import { borrarNegociosSembrados } from "./limpieza";
import { type Emulador, construirSiHaceFalta, levantarEmulador } from "./salida-astro";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FIXTURES = path.join(raiz, "tests/fixtures/next-3b");
const FOTOS_DIR = path.resolve(raiz, process.env.FOTOS_DIR ?? ".fotos-test");
const URL_PUBLICA = "https://enmirumbo.example";
const CACHE_DINAMICO = "private, no-cache, no-store, max-age=0, must-revalidate";
const CACHE_DE_ACCION = "no-cache, no-store, max-age=0, must-revalidate";
const SEMBRADAS = SEMBRADAS_3B;
const CLAVE_RECHAZADA = "ab".repeat(16);
/** Los WhatsApp que usa este archivo (los de `enviosDe3b`, 77199981xx, y los propios, 77199983xx). */
const WHATSAPP = [
  ...Array.from({ length: 50 }, (_, i) => `77199981${String(i).padStart(2, "0")}`),
  ...Array.from({ length: 30 }, (_, i) => `77199983${String(i).padStart(2, "0")}`),
];
const propio = (i: number) => `77199983${String(i).padStart(2, "0")}`;

let prisma: PrismaClient;
/** Con `SITIO_URL`, fotos en disco (desarrollo) y el cupo por `x-forwarded-for`: lo de los fixtures `con-sitio-url`. */
let conSitio: Emulador;
/** Producción sin `SITIO_URL` (fixtures `sin-sitio-url` y la 404 estática). */
let sinSitio: Emulador;
/** Con la medición configurada. */
let medido: Emulador;
let categoriaId = 0;
let coloniaId = 0;
const clavesExtra: string[] = [];

type Variante = "con-sitio-url" | "sin-sitio-url";

function lasCuatro(r: Response | Headers, etiqueta: string) {
  const h = r instanceof Headers ? r : r.headers;
  for (const { key, value } of cabecerasDeSeguridad()) expect(h.get(key), `${etiqueta} · ${key}`).toBe(value);
  expect(h.get("x-powered-by"), etiqueta).toBeNull();
}

const seguridad = () => Object.fromEntries(cabecerasDeSeguridad().map(({ key, value }) => [key.toLowerCase(), value]));

function fixture(variante: Variante, nombre: string): string {
  return readFileSync(path.join(FIXTURES, variante, nombre), "utf8").replace(/>\n</g, "><");
}

function respuestasNext(variante: Variante) {
  return JSON.parse(readFileSync(path.join(FIXTURES, variante, "respuestas.json"), "utf8"));
}

const consultar = (sql: string, params: unknown[]) => prisma.$queryRawUnsafe<Record<string, unknown>[]>(sql, ...params);
const archivosDe = (clave: string) =>
  (["tarjeta", "ficha"] as const).filter((v) => existsSync(path.join(FOTOS_DIR, nombreDeObjeto(clave, v))));

/** Vuelve a dejar la base como la de los fixtures: las cuatro fichas sembradas, nada más. */
async function sembrar() {
  await borrarNegociosSembrados(prisma, WHATSAPP);
  const alta = (nombre: string, whatsapp: string, estado: string, extra: Record<string, unknown> = {}) =>
    prisma.negocio.create({ data: { nombre, categoriaId, whatsapp, consintioAvisoEn: new Date("2026-08-01T10:00:00Z"), estado, ...extra } });
  for (const v of ["tarjeta", "ficha"] as const) {
    await almacenDeFotos().guardar(CLAVE_RECHAZADA, v, await jpegDePrueba(64, 48));
  }
  await alta("Taller Ficticio Publicado 3b", SEMBRADAS.publicado, "publicado", { publicadoEn: new Date() });
  await alta("Taller Ficticio En Revisión 3b", SEMBRADAS.revision, "en_revision");
  await alta("Taller Ficticio Rechazado 3b", SEMBRADAS.rechazado, "rechazado", { rechazadoEn: new Date(), consintioAvisoVersion: "1", fotoClave: CLAVE_RECHAZADA });
  await alta("Taller Ficticio Verificado 3b", SEMBRADAS.verificado, "rechazado", {
    rechazadoEn: new Date(),
    consintioAvisoVersion: "2",
    numeroVerificadoEn: new Date("2026-08-02T10:00:00Z"),
  });
}

/** Lo que ya no tiene dueño en el almacén (fotos de fichas que esta prueba creó y borró). */
async function clavesDeFichas(): Promise<string[]> {
  const filas = await prisma.negocio.findMany({ where: { whatsapp: { in: WHATSAPP } }, select: { fotoClave: true } });
  return filas.map((f) => f.fotoClave).filter((c): c is string => Boolean(c));
}

const valido = (whatsapp: string, extra: Record<string, string> = {}) => ({
  nombre: "Fonda Ficticia Del Arnés",
  categoriaId: String(categoriaId),
  whatsapp,
  coloniaId: String(coloniaId),
  consentimiento: "on",
  ...extra,
});

/** Un POST de formulario hecho a mano (multipart), con `Origin` del sitio. */
function post(e: Emulador, destino: string, campos: Record<string, string | File>, cabeceras: Record<string, string> = {}) {
  const cuerpo = new FormData();
  for (const [k, v] of Object.entries({ avisoVersion: VERSION_AVISO, ...campos })) cuerpo.append(k, v);
  return e.pedir(destino, { method: "POST", body: cuerpo, headers: { origin: e.base, ...cabeceras } });
}

beforeAll(async () => {
  construirSiHaceFalta();
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })).id;
  coloniaId = (await prisma.colonia.findFirstOrThrow({ orderBy: { id: "asc" } })).id;
  await sembrar();
  [conSitio, sinSitio, medido] = await Promise.all([
    levantarEmulador({ NODE_ENV: "development", SITIO_URL: URL_PUBLICA, FOTOS_DIR, REGISTRO_ENCABEZADO_IP: "x-forwarded-for" }),
    levantarEmulador({ SITIO_URL: undefined, REGISTRO_ENCABEZADO_IP: "x-forwarded-for" }),
    levantarEmulador({ SITIO_URL: URL_PUBLICA, [VARIABLE_SRC]: "https://cloud.umami.is/script.js", [VARIABLE_WEBSITE_ID]: "00000000-0000-0000-0000-000000000000" }),
  ]);
}, 300_000);

afterAll(async () => {
  for (const e of [conSitio, sinSitio, medido]) e?.detener();
  await borrarNegociosSembrados(prisma, WHATSAPP, [CLAVE_RECHAZADA, ...clavesExtra]);
  await prisma.$disconnect();
});

// ── La página de registro responde desde Astro el mismo HTML que Next ───────

describe("registro · formulario igual al de hoy (contra los fixtures de Next)", () => {
  for (const variante of ["con-sitio-url", "sin-sitio-url"] as const) {
    it(`${variante}: /registro sin diferencias fuera de las normalizaciones del registro, y dice dónde aplicó cada una`, async () => {
      const e = variante === "con-sitio-url" ? conSitio : sinSitio;
      const r = await e.pedir("/registro");
      const next = respuestasNext(variante).pantallas["registro.html"];
      const aplicadas: string[] = [];
      const diferencias = compararRespuestas(
        `${variante} /registro`,
        { status: next.status, headers: { ...seguridad(), "content-type": next["content-type"], "cache-control": next["cache-control"] }, cuerpo: fixture(variante, "registro.html") },
        { status: r.status, headers: Object.fromEntries(r.headers), cuerpo: idsDeCatalogoPorNombre(await r.text()) },
        { dinamica: true, registro: { urlPagina: new URL("/registro", e.base).toString(), aplicadas, repintada: false } },
      );
      expect(diferencias).toEqual([]);
      expect(r.status).toBe(200);
      // Al abrir no hay error: el autofocus no aplica.
      expect(aplicadas).toEqual(NORMALIZACIONES_REGISTRO.slice(0, 4).map((n) => n.id));
    });
  }

  it("un campo oculto de más o un atributo data- distinto en el formulario de Astro SÍ salen como diferencia", async () => {
    const html = idsDeCatalogoPorNombre(await (await conSitio.pedir("/registro")).text());
    const casos = [
      html.replace('<input type="hidden" name="avisoVersion"', '<input type="hidden" name="estado" value="publicado"><input type="hidden" name="avisoVersion"'),
      html.replace('id="categoriaId"', 'id="categoriaId" data-otro="x"'),
      html.replace('id="whatsapp"', 'id="whatsapp" data-ejemplos="x"'),
    ];
    for (const inyectado of casos) {
      const diferencias = compararRespuestas(
        "inyectado",
        { status: 200, headers: { ...seguridad(), "content-type": "text/html; charset=utf-8" }, cuerpo: fixture("con-sitio-url", "registro.html") },
        { status: 200, headers: { ...seguridad(), "content-type": "text/html; charset=utf-8" }, cuerpo: inyectado },
        { registro: { urlPagina: new URL("/registro", conSitio.base).toString(), aplicadas: [] } },
      );
      expect(diferencias.length).toBeGreaterThan(0);
    }
  });

  it("los 12 controles, las 8 categorías, las 21 colonias más 'Otra', el aviso con su versión y la casilla sin marcar", async () => {
    const html = await (await conSitio.pedir("/registro")).text();
    const raizHtml = parse(html);
    expect(raizHtml.querySelectorAll("h1").map((h) => h.text.trim())).toEqual(["Registra tu negocio gratis"]);
    expect(html).toContain("Llena este formulario en un par de minutos, sin cuenta ni contraseña. En cuanto lo revisemos, te contactamos por WhatsApp.");
    const form = raizHtml.querySelector("form")!;
    expect(form.querySelectorAll("#categoriaId option")).toHaveLength(8 + 1);
    expect(form.querySelectorAll("#coloniaId option")).toHaveLength(21 + 2);
    expect(form.querySelector("#coloniaId option:last-child")?.text).toBe("Otra");
    expect(form.querySelector('input[name="avisoVersion"]')?.getAttribute("value")).toBe(VERSION_AVISO);
    expect(form.querySelector("#consentimiento")?.getAttribute("checked")).toBeUndefined();
    expect(form.querySelector("#sitio_web")).not.toBeNull();
    expect(html).toContain("Dejar mi ficha sin foto");
    expect(form.querySelector('button[type="submit"]')?.text.trim()).toBe("Registrar mi negocio");
    const nombres = [...new Set(form.querySelectorAll("[name]").map((n) => n.getAttribute("name")))];
    expect(nombres.filter((n) => n?.startsWith("$ACTION_"))).toEqual([]);
    expect(form.getAttribute("action")).toBe("?_action=registrar");
  });

  it("sin isla ni runtime de React; la medición en su lugar", async () => {
    const html = await (await medido.pedir("/registro")).text();
    expect(html).not.toMatch(/astro-island|modulepreload|react-dom|client\.[\w-]+\.js/);
    expect(html.match(/umami/g)?.length).toBeGreaterThan(0);
  });
});

describe("registro · sin isla y con poco JavaScript", () => {
  /** Los `.js` que baja `/registro`: el del `<script>` y los que importa (estáticos y `import()`). */
  async function moduloDeLaPagina(): Promise<Array<{ ruta: string; bytes: number; gzip: number; codigo: string }>> {
    const html = await (await conSitio.pedir("/registro")).text();
    const propios = parse(html).querySelectorAll("script").filter((n) => n.getAttribute("type") !== "application/ld+json");
    expect(propios).toHaveLength(1);
    expect(propios[0].getAttribute("type")).toBe("module");
    expect(propios[0].rawText.trim()).toBe("");
    const pendientes = [propios[0].getAttribute("src")!];
    expect(pendientes[0]).toMatch(/^\/_astro\/[\w.-]+\.js$/);
    const vistos: Array<{ ruta: string; bytes: number; gzip: number; codigo: string }> = [];
    while (pendientes.length) {
      const ruta = pendientes.shift()!;
      if (vistos.some((v) => v.ruta === ruta)) continue;
      const r = await conSitio.pedir(ruta);
      expect(r.status, ruta).toBe(200);
      const codigo = await r.text();
      vistos.push({ ruta, bytes: Buffer.byteLength(codigo), gzip: gzipSync(codigo, { level: 9 }).length, codigo });
      for (const m of codigo.matchAll(/(?:import\(|from)\s*[`'"](\.\/[\w.-]+\.js)[`'"]/g)) pendientes.push(new URL(m[1], `http://x${ruta}`).pathname);
    }
    return vistos;
  }

  it("un solo <script type=module> de /_astro/, sin islas, y todo su JavaScript pesa 5 KB o menos con gzip", async () => {
    const modulos = await moduloDeLaPagina();
    const total = modulos.reduce((suma, m) => suma + m.gzip, 0);
    console.info(`[registro] JS propio de /registro: ${modulos.map((m) => `${m.ruta} ${m.bytes} B (${m.gzip} B gzip)`).join(", ")}; total ${total} B gzip`);
    expect(total).toBeLessThanOrEqual(5 * 1024);
    // El conteo incluye el módulo de verdad (el que se baja con `import()`), no solo el arranque.
    expect(modulos.some((m) => m.codigo.includes("general-error") && m.codigo.includes("data-ejemplos"))).toBe(true);
    for (const { ruta, codigo } of modulos) {
      expect(codigo, ruta).not.toMatch(/react\.transitional\.element|__REACT_DEVTOOLS|astro-island/);
    }
  });

  it("ninguna otra página gana <script> propio", async () => {
    const publicado = await prisma.negocio.findUniqueOrThrow({ where: { whatsapp: SEMBRADAS.publicado } });
    for (const ruta of ["/", "/terminos", "/aviso-de-privacidad", "/buscar?q=taller", "/registro/gracias", `/negocio/x-${publicado.id}`, `/negocio/x-${publicado.id}/reportar`, "/a/b/c", "/loquesea"]) {
      const html = await (await conSitio.pedir(ruta)).text();
      const propios = parse(html).querySelectorAll("script").filter((n) => n.getAttribute("type") !== "application/ld+json");
      expect(propios.map((n) => n.toString().slice(0, 80)), ruta).toEqual([]);
    }
  });
});

// ── El envío del registro sin JavaScript se comporta igual que en Next ──────

describe("registro · mismos desenlaces que Next (arnés sin JS contra los fixtures)", () => {
  it("cada envío: misma cadena, mismo Location, mismos mensajes, mismos valores, mismo HTML re-pintado y lo mismo en la base", async () => {
    await sembrar();
    const next = respuestasNext("con-sitio-url").desenlaces;
    const fotos = await fotosDelArnes();
    const envios = enviosDe3b({ categoriaId, coloniaId, ...SEMBRADAS }, fotos);
    expect(envios.map((e) => e.nombre)).toEqual(Object.keys(next));
    const urlPagina = new URL("/registro", conSitio.base).toString();
    for (const envio of envios) {
      const r = await enviarFormulario({ urlPagina, elecciones: envio.elecciones, archivos: envio.archivos, extras: envio.extras, cabecerasExtra: envio.cabeceras });
      const esperado = next[envio.nombre];
      const resumen = resumenDelDesenlace(r);
      const post = r.cadena[1];
      if (envio.aceptada) {
        // La única diferencia aceptada (3a): origen ajeno o null, Next 500 y Astro 403.
        expect(esperado.post.status, envio.nombre).toBe(500);
        expect(post.status, envio.nombre).toBe(403);
        expect(await prisma.negocio.count({ where: { whatsapp: whatsappDelEnvio(envio) } }), envio.nombre).toBe(0);
        continue;
      }
      expect(resumen, envio.nombre).toEqual(esperado.cadena);
      expect(post.cabeceras.get("cache-control"), envio.nombre).toBe(esperado.post["cache-control"]);
      expect(post.cabeceras.get("content-type"), envio.nombre).toBe(esperado.post["content-type"]);
      lasCuatro(post.cabeceras, `POST ${envio.nombre}`);
      expect(post.setCookie, envio.nombre).toEqual([]);
      if (post.status === 200) {
        expect(erroresDelFormulario(r.final.html), envio.nombre).toEqual(esperado.errores);
        expect(valoresDelFormulario(idsDeCatalogoPorNombre(r.final.html), urlPagina), envio.nombre).toEqual(esperado.valores);
        const aplicadas: string[] = [];
        const diferencias = compararRespuestas(
          `POST ${envio.nombre}`,
          { status: 200, headers: { ...seguridad(), "content-type": esperado.post["content-type"], "cache-control": esperado.post["cache-control"] }, cuerpo: fixture("con-sitio-url", `repintado-${envio.nombre}.html`) },
          { status: post.status, headers: Object.fromEntries(post.cabeceras), cuerpo: idsDeCatalogoPorNombre(r.final.html) },
          { dinamica: true, registro: { urlPagina, aplicadas, repintada: true } },
        );
        expect(diferencias, envio.nombre).toEqual([]);
        // `autofocus` solo aplica si hay un CAMPO con error (el general no es un
        // campo, y la casilla del aviso no lo lleva desde el servidor).
        const conCampo = Object.keys(esperado.errores).some((c) => c !== "general" && c !== "consentimiento");
        expect(aplicadas, envio.nombre).toEqual(NORMALIZACIONES_REGISTRO.map((n) => n.id).filter((id) => conCampo || id !== "autofocus-del-primer-error"));
      }
      expect(await resumenDeLaBase(consultar, whatsappDelEnvio(envio)), envio.nombre).toEqual(esperado.base);
    }
    clavesExtra.push(...(await clavesDeFichas()));
  }, 120_000);
});

describe("registro · alta sin JS", () => {
  it("200 → POST 303 → 200 con el mensaje de gracias, Origin del sitio, sin 500, y la ficha que puso el servidor", async () => {
    const enviados: Array<Record<string, string>> = [];
    const pedir = (url: string | URL | Request, init: RequestInit = {}) => {
      enviados.push((init.headers ?? {}) as Record<string, string>);
      return fetch(url, init);
    };
    const r = await enviarFormulario({ urlPagina: new URL("/registro", conSitio.base).toString(), elecciones: valido(propio(0)), pedir: pedir as typeof fetch });
    expect(r.cadena.map((p) => `${p.metodo} ${p.status}`)).toEqual(["GET 200", "POST 303", "GET 200"]);
    expect(enviados[1].origin).toBe(conSitio.base);
    expect(r.final.html).toContain(MENSAJE_GRACIAS);
    const ficha = await prisma.negocio.findUniqueOrThrow({ where: { whatsapp: propio(0) } });
    expect(ficha).toMatchObject({ estado: "en_revision", origen: "organico", consintioAvisoVersion: VERSION_AVISO, fotoClave: null });
    expect(ficha.consintioAvisoEn).toBeInstanceOf(Date);
  });
});

describe("registro · errores con lo capturado", () => {
  it("WhatsApp de 8 dígitos y 250 caracteres con foto: 200 en la misma ruta, cada mensaje en su campo, autofocus en el WhatsApp, sin ficha ni archivos", async () => {
    const antes = existsSync(FOTOS_DIR) ? (await import("node:fs")).readdirSync(FOTOS_DIR).length : 0;
    const fotos = await fotosDelArnes();
    const r = await enviarFormulario({
      urlPagina: new URL("/registro", conSitio.base).toString(),
      elecciones: valido("77199983", { queOfreces: "a".repeat(250), direccion: "a un lado de la primaria (ficticia)", entregaADomicilio: "on" }),
      archivos: { foto: fotos.valida },
    });
    expect(r.cadena.map((p) => p.status)).toEqual([200, 200]);
    expect(new URL(r.final.url).pathname).toBe("/registro");
    expect(erroresDelFormulario(r.final.html)).toEqual({
      whatsapp: MENSAJES_ERROR_REGISTRO.whatsapp,
      queOfreces: MENSAJES_ERROR_REGISTRO.queOfreces,
      foto: AVISO_FOTO_NO_GUARDADA,
    });
    const form = parse(r.final.html).querySelector("form")!;
    expect(form.querySelectorAll("[autofocus]").map((n) => n.getAttribute("id"))).toEqual(["whatsapp"]);
    expect(form.querySelector("#direccion")?.text).toBe("a un lado de la primaria (ficticia)");
    expect(form.querySelector("#entregaADomicilio")?.getAttribute("checked")).toBe("");
    expect(form.querySelector("#consentimiento")?.getAttribute("checked")).toBeUndefined();
    expect(form.querySelector("#foto")?.getAttribute("value")).toBeUndefined();
    expect(await prisma.negocio.count({ where: { whatsapp: "77199983" } })).toBe(0);
    const despues = existsSync(FOTOS_DIR) ? (await import("node:fs")).readdirSync(FOTOS_DIR).length : 0;
    expect(despues).toBe(antes);
  });
});

describe("registro · reenvío tras rechazo con foto", () => {
  it("vuelve a en_revision con los datos nuevos, la constancia original intacta, la reaceptación de la vigente y sin los archivos viejos", async () => {
    await sembrar();
    const antes = await prisma.negocio.findUniqueOrThrow({ where: { whatsapp: SEMBRADAS.rechazado } });
    expect(archivosDe(CLAVE_RECHAZADA)).toEqual(["tarjeta", "ficha"]);
    const fotos = await fotosDelArnes();
    const r = await enviarFormulario({
      urlPagina: new URL("/registro", conSitio.base).toString(),
      elecciones: valido(SEMBRADAS.rechazado, { nombre: "Taller Ficticio Corregido" }),
      archivos: { foto: fotos.valida },
    });
    expect(r.final.html).toContain(MENSAJE_GRACIAS);
    const despues = await prisma.negocio.findUniqueOrThrow({ where: { whatsapp: SEMBRADAS.rechazado } });
    expect(despues).toMatchObject({ estado: "en_revision", nombre: "Taller Ficticio Corregido", consintioAvisoVersion: "1", reconsintioAvisoVersion: VERSION_AVISO, rechazadoEn: null });
    expect(despues.consintioAvisoEn).toEqual(antes.consintioAvisoEn);
    expect(despues.fotoClave).toMatch(/^[0-9a-f]{32}$/);
    expect(despues.fotoClave).not.toBe(CLAVE_RECHAZADA);
    expect(archivosDe(CLAVE_RECHAZADA)).toEqual([]);
    expect(archivosDe(despues.fotoClave!)).toEqual(["tarjeta", "ficha"]);
    clavesExtra.push(despues.fotoClave!);
  });
});

describe("registro · campos que intentan dictar el resultado", () => {
  it("estado, origen, fotoClave, nombreNormalizado, numeroVerificadoEn, $ACTION_… y destino se ignoran", async () => {
    const r = await post(conSitio, "/registro?_action=registrar", {
      ...valido(propio(1)),
      estado: "publicado",
      origen: "admin",
      fotoClave: "0123456789abcdef0123456789abcdef",
      nombreNormalizado: "otro",
      numeroVerificadoEn: "2026-01-01T00:00:00.000Z",
      "$ACTION_REF_1": "",
      "$ACTION_1:0": '{"destino":"https://evil.example"}',
      "$ACTION_KEY": "k0",
      destino: "//evil.example",
    });
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("/registro/gracias");
    expect(await prisma.negocio.findUniqueOrThrow({ where: { whatsapp: propio(1) } })).toMatchObject({
      estado: "en_revision",
      origen: "organico",
      fotoClave: null,
      numeroVerificadoEn: null,
      publicadoEn: null,
    });
  });
});

describe("registro · cuerpo desmedido", () => {
  const sieteMiB = () => {
    const limite = "----limite-ficticio";
    return {
      tipo: `multipart/form-data; boundary=${limite}`,
      cuerpo: Buffer.concat([
        Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="whatsapp"\r\n\r\n${propio(2)}\r\n--${limite}\r\nContent-Disposition: form-data; name="foto"; filename="grande.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
        Buffer.alloc(7 * 1024 * 1024, 0x61),
        Buffer.from(`\r\n--${limite}--\r\n`),
      ]),
    };
  };

  /** POST por `node:http` en un socket propio (ver la misma función en la prueba de 3a); lee la respuesta entera. */
  function subir(conLongitud: boolean): Promise<{ status: number; cabeceras: Headers; html: string }> {
    const { tipo, cuerpo } = sieteMiB();
    const destino = new URL("/registro?_action=registrar", conSitio.base);
    return new Promise((listo, falla) => {
      const peticion = request(
        destino,
        {
          method: "POST",
          agent: false,
          headers: { "content-type": tipo, origin: conSitio.base, ...(conLongitud ? { "content-length": String(cuerpo.length) } : { "transfer-encoding": "chunked" }) },
        },
        (respuesta) => {
          const cabeceras = new Headers();
          for (const [k, v] of Object.entries(respuesta.headers)) if (typeof v === "string") cabeceras.set(k, v);
          const trozos: Buffer[] = [];
          respuesta.on("data", (t: Buffer) => trozos.push(t));
          respuesta.on("end", () => {
            listo({ status: respuesta.statusCode ?? 0, cabeceras, html: Buffer.concat(trozos).toString("utf8") });
            peticion.destroy();
          });
        },
      );
      peticion.on("error", (e: NodeJS.ErrnoException) => {
        if (e.code !== "ECONNRESET" && e.code !== "EPIPE") falla(e);
      });
      for (let i = 0; i < cuerpo.length; i += 65_536) peticion.write(cuerpo.subarray(i, i + 65_536));
      peticion.end();
    });
  }

  for (const conLongitud of [true, false]) {
    it(`${conLongitud ? "con" : "sin"} Content-Length: 200 con el formulario y el mensaje de la foto junto a su campo, sin 500, sin ficha ni archivos`, async () => {
      const r = await subir(conLongitud);
      expect(r.status).toBe(200);
      expect(r.cabeceras.get("location")).toBeNull();
      expect(r.cabeceras.get("cache-control")).toBe(CACHE_DE_ACCION);
      lasCuatro(r.cabeceras, "7 MiB");
      expect(erroresDelFormulario(r.html)).toEqual({ foto: MENSAJES_ERROR_FOTO.demasiadoGrande });
      expect(parse(r.html).querySelectorAll("[autofocus]").map((n) => n.getAttribute("id"))).toEqual(["foto"]);
      expect(await prisma.negocio.count({ where: { whatsapp: propio(2) } })).toBe(0);
    });
  }

  it("y el servidor sigue atendiendo después", async () => {
    expect((await conSitio.pedir("/registro")).status).toBe(200);
  });
});

// ── PRG y el error sin PRG ──────────────────────────────────────────────────

describe("registro · PRG", () => {
  it("el Referer no decide nada: cuatro Referer, el mismo 303 a gracias con el Cache-Control de Next", async () => {
    const referers: Array<string | null> = [new URL("/registro", conSitio.base).toString(), `${conSitio.base}/`, "https://evil.example/", null];
    for (const [i, referer] of referers.entries()) {
      const r = await post(conSitio, "/registro?_action=registrar", valido(propio(10 + i)), referer ? { referer } : {});
      expect(r.status, String(referer)).toBe(303);
      expect(r.headers.get("location"), String(referer)).toBe("/registro/gracias");
      expect(r.headers.get("cache-control"), String(referer)).toBe(CACHE_DE_ACCION);
      lasCuatro(r, `303 ${referer}`);
    }
  });

  it("recargar gracias dos veces no crea otra ficha ni marca nada", async () => {
    const r = await enviarFormulario({ urlPagina: new URL("/registro", conSitio.base).toString(), elecciones: valido(propio(20)) });
    expect(r.final.html).toContain(MENSAJE_GRACIAS);
    for (let i = 0; i < 2; i++) expect((await conSitio.pedir(new URL(r.final.url).pathname)).status).toBe(200);
    expect(await prisma.negocio.count({ where: { whatsapp: propio(20) } })).toBe(1);
    expect((await prisma.negocio.findUniqueOrThrow({ where: { whatsapp: propio(20) } })).numeroVerificadoEn).toBeNull();
  });

  it("el error del registro no pasa por un 303: 200, sin Location y sin Set-Cookie", async () => {
    const r = await post(conSitio, "/registro?_action=registrar", { ...valido("12"), nombre: "Nombre Ficticio Que No Debe Salir" });
    expect(r.status).toBe(200);
    expect(r.headers.get("location")).toBeNull();
    expect(r.headers.getSetCookie()).toEqual([]);
    expect(r.headers.get("cache-control")).toBe(CACHE_DE_ACCION);
    lasCuatro(r, "200 re-pintado");
    expect(await r.text()).toContain(MENSAJES_ERROR_REGISTRO.whatsapp);
  });

  it("un envío de otro origen: 403 en español, con las cuatro cabeceras y sin escribir", async () => {
    const r = await post(conSitio, "/registro?_action=registrar", valido(propio(21)), { origin: "https://ajeno.example" });
    expect(r.status).toBe(403);
    lasCuatro(r, "403");
    expect(await prisma.negocio.count({ where: { whatsapp: propio(21) } })).toBe(0);
  });

  it("el formulario y gracias por GET llevan las cuatro cabeceras y el Cache-Control dinámico", async () => {
    for (const ruta of ["/registro", "/registro/gracias"]) {
      const r = await conSitio.pedir(ruta);
      expect(r.status, ruta).toBe(200);
      lasCuatro(r, ruta);
      expect(r.headers.get("cache-control"), ruta).toBe(CACHE_DINAMICO);
    }
  });
});

// ── Cada Action corre solo por formulario y solo desde su ruta ──────────────

describe("registro · la Action fuera de su ruta", () => {
  it("RPC cerrado: /_actions/registrar (formulario y JSON) responde como /a/b/c", async () => {
    const referencia = await sinSitio.pedir("/a/b/c");
    const cuerpoReferencia = await referencia.text();
    const sinFecha = (h: Headers) => Object.fromEntries([...h].filter(([k]) => k !== "date"));
    const intentos = [
      post(sinSitio, "/_actions/registrar", valido(propio(22))),
      sinSitio.pedir("/_actions/registrar", { method: "POST", body: JSON.stringify(valido(propio(22))), headers: { "content-type": "application/json", origin: sinSitio.base } }),
    ];
    for (const r of await Promise.all(intentos)) {
      expect(r.status).toBe(referencia.status);
      expect(await r.text()).toBe(cuerpoReferencia);
      expect(sinFecha(r.headers)).toEqual(sinFecha(referencia.headers));
    }
    expect(await prisma.negocio.count({ where: { whatsapp: propio(22) } })).toBe(0);
  });

  it("desde / o desde el formulario de reporte: no crea ficha ni archivo, no es 500 y responde la página de no encontrado", async () => {
    const referencia = await (await sinSitio.pedir("/a/b/c")).text();
    const publicado = await prisma.negocio.findUniqueOrThrow({ where: { whatsapp: SEMBRADAS.publicado } });
    const fotos = await fotosDelArnes();
    for (const destino of ["/?_action=registrar", `/negocio/x-${publicado.id}/reportar?_action=registrar`]) {
      const r = await post(sinSitio, destino, { ...valido(propio(23)), foto: new File([new Uint8Array(fotos.valida.bytes)], "local.jpg", { type: "image/jpeg" }) });
      expect(r.status, destino).toBe(404);
      expect(await r.text(), destino).toBe(referencia);
      lasCuatro(r, destino);
      expect(r.headers.getSetCookie(), destino).toEqual([]);
    }
    expect(await prisma.negocio.count({ where: { whatsapp: propio(23) } })).toBe(0);
  });
});

// ── La pantalla de gracias ───────────────────────────────────────────────────

describe("registro · gracias igual a la de hoy", () => {
  const casos: Array<[string, string]> = [
    ["gracias.html", "/registro/gracias"],
    ["gracias-verificado.html", "/registro/gracias?verificado=1"],
    ["gracias-agotado.html", "/registro/gracias?agotado=1"],
    ["gracias-ambos.html", "/registro/gracias?verificado=1&agotado=1"],
    ["gracias-verificado-x.html", "/registro/gracias?verificado=x"],
    ["gracias-verificado-1-0.html", "/registro/gracias?verificado=1&verificado=0"],
  ];

  for (const variante of ["con-sitio-url", "sin-sitio-url"] as const) {
    it(`${variante}: los seis casos sin ninguna diferencia`, async () => {
      const e = variante === "con-sitio-url" ? conSitio : sinSitio;
      for (const [nombre, ruta] of casos) {
        const r = await e.pedir(ruta);
        const next = respuestasNext(variante).pantallas[nombre];
        const diferencias = compararRespuestas(
          `${variante} ${ruta}`,
          { status: next.status, headers: { ...seguridad(), "content-type": next["content-type"], "cache-control": next["cache-control"] }, cuerpo: fixture(variante, nombre) },
          { status: r.status, headers: Object.fromEntries(r.headers), cuerpo: await r.text() },
          { dinamica: true },
        );
        expect(diferencias, nombre).toEqual([]);
      }
    });
  }

  it("sin <form>, sin JavaScript propio y con 'Volver al inicio' hacia /", async () => {
    const html = await (await medido.pedir("/registro/gracias?verificado=1&agotado=1")).text();
    expect(html).not.toMatch(/<form[\s>]/);
    expect(html).not.toMatch(/<script(?![^>]*(umami|application\/ld\+json))/);
    const volver = parse(html).querySelectorAll("a").find((a) => a.text.trim() === "Volver al inicio");
    expect(volver?.getAttribute("href")).toBe("/");
  });
});

// ── Privacidad del log ───────────────────────────────────────────────────────

describe("registro · el log no guarda datos del envío", () => {
  it("ni la IP, ni el número, ni el nombre, ni lo capturado aparecen en la consola del servidor", () => {
    for (const e of [conSitio, sinSitio, medido]) {
      const registro = e.registro();
      for (const prohibido of ["203.0.113.77", "198.51.100.", "Fonda Ficticia", "Taller Ficticio", "77199981", "77199983", "a un lado de la primaria"]) {
        expect(registro, prohibido).not.toContain(prohibido);
      }
    }
  });
});
