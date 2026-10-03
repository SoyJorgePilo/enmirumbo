/**
 * Etapa C (seguridad) del change `migrar-enlace-gestion-astro` (T-025, Fase
 * 4): pruebas adversariales sobre la SALIDA SERVIDA que el camino feliz y las
 * pruebas del dev no cubren.
 *
 * - variantes de la ruta (`//editar/`, mayúsculas, `%65ditar`, `%2F`, barra
 *   final, `/./`, token codificado): ninguna pinta el formulario o la 404 del
 *   enlace sin `strict-origin`, ninguna mide y ninguna hace eco del token;
 * - segmentos hostiles (largos, unicode, `%00`, `..`, `__proto__`,
 *   codificación rota) en GET, POST y en `/gracias`: nunca 500, nunca eco;
 * - valores de la ficha con HTML/script/comillas/unicode raro: escapados;
 * - otras Actions, métodos y `_action` raros contra `/editar/T`: nada se escribe;
 * - cuerpos rotos (multipart sin boundary o malformado, chunked de más de 6 MiB
 *   sin `Content-Length`): nunca 500 ni escritura;
 * - categoría o colonia inexistentes: error, sin pendiente;
 * - ráfaga de diez (PostgreSQL real): nunca más de una pendiente ni un 500;
 * - una excepción tras resolver el token (tabla renombrada): 500 y el log sin
 *   el token ni su prefijo.
 *
 * Todo ficticio: WhatsApp 77199963xx, IPs de documentación, dominios `.example`.
 */
import pg from "pg";
import { parse } from "node-html-parser";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import type { PrismaClient } from "../src/generated/prisma/client";
import { VERSION_AVISO } from "../src/lib/legales/version";
import { ERROR_GUARDAR_EDICION } from "../src/lib/gestion/textos";
import { crearClientePrueba } from "./db";
import { urlDeLaBaseDePrueba } from "./esquemas";
import { type SembradoDe4, apariciones, borrarFichasDe4, sembrarFichasDe4 } from "./gestion-astro";
import { type Emulador, construirSiHaceFalta, levantarEmulador } from "./salida-astro";

const URL_PUBLICA = "https://enmirumbo.example";
const SERIE = "77199963";
const UMAMI = { NEXT_PUBLIC_UMAMI_SRC: "https://cloud.umami.is/script.js", NEXT_PUBLIC_UMAMI_WEBSITE_ID: "00000000-0000-0000-0000-000000000000" };

async function hayBackendsIndependientes(): Promise<boolean> {
  const a = new pg.Client({ connectionString: urlDeLaBaseDePrueba() });
  const b = new pg.Client({ connectionString: urlDeLaBaseDePrueba() });
  try {
    await a.connect();
    await b.connect();
    const [x, y] = await Promise.all([a.query("SELECT pg_backend_pid() AS p"), b.query("SELECT pg_backend_pid() AS p")]);
    return x.rows[0].p !== y.rows[0].p;
  } catch {
    return false;
  } finally {
    await a.end().catch(() => {});
    await b.end().catch(() => {});
  }
}
const backendsIndependientes = await hayBackendsIndependientes();

let prisma: PrismaClient;
let s: SembradoDe4;
let e: Emulador;
let medido: Emulador;
let categoriaId = 0;
let coloniaId = 0;
let ipSiguiente = 1;

const consultar = (sql: string, params: unknown[]) => prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(sql, ...params);
const ip = () => `198.51.100.${ipSiguiente++ % 250}`;
const pendientes = (negocioId: string) => prisma.edicionPendiente.count({ where: { negocioId, estado: "pendiente" } });

function cuerpo(ficha: keyof SembradoDe4["tokens"], extra: Record<string, string> = {}): FormData {
  const datos = new FormData();
  for (const [k, v] of Object.entries({
    nombre: "Cerrajería Ficticia Adversarial",
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

const post = (ruta: string, body: BodyInit, cabeceras: Record<string, string> = {}, base = e) =>
  base.pedir(ruta, { method: "POST", body, headers: { origin: base.base, "x-forwarded-for": ip(), ...cabeceras } });

beforeAll(async () => {
  construirSiHaceFalta();
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })).id;
  coloniaId = (await prisma.colonia.findFirstOrThrow({ orderBy: { id: "asc" } })).id;
  s = await sembrarFichasDe4(consultar, { categoriaId, coloniaId, serie: SERIE });
  [e, medido] = await Promise.all([
    levantarEmulador({ SITIO_URL: URL_PUBLICA, REGISTRO_ENCABEZADO_IP: "x-forwarded-for" }),
    levantarEmulador({ SITIO_URL: URL_PUBLICA, REGISTRO_ENCABEZADO_IP: "x-forwarded-for", ...UMAMI }),
  ]);
}, 300_000);

afterAll(async () => {
  e?.detener();
  medido?.detener();
  await borrarFichasDe4(consultar, SERIE);
  await prisma.$disconnect();
});

// ── Variantes de la ruta ────────────────────────────────────────────────────

describe("C · ninguna variante de la ruta evita la política ni mide", () => {
  const codificado = (t: string) => [...t].map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`).join("");

  it("si pinta el formulario o es una respuesta de la función bajo /editar/, lleva strict-origin; nunca el script de la medición ni eco del token", async () => {
    const T = s.tokens.publicada;
    const D = s.tokens.despublicada;
    const variantes = [
      `/editar/${T}`, `/editar/${T}/`, `/./editar/${T}`, `/x/../editar/${T}`, `/editar/${codificado(T)}`,
      `//editar/${T}`, `/EDITAR/${T}`, `/Editar/${T}`, `/editar%2F${T}`, `/%65ditar/${T}`, `/%2565ditar/${T}`,
      `/editar//${T}`, `/editar/${T}%2F`, `/editar/${T};x`, `/editar/${T}/x/y`, `/editar/${D}`, `/editar/${D}/`,
      `//editar/${D}`, `/editar/${T}/gracias/`, `//editar/${T}/gracias`, "/editar", "/editar/",
    ];
    let conFormulario = 0;
    for (const ruta of variantes) {
      const r = await medido.pedir(ruta);
      const html = await r.text();
      expect(r.status, ruta).not.toBe(500);
      expect(html, ruta).not.toMatch(/umami|data-website-id/);
      expect(apariciones(html, T), ruta).toEqual([]);
      for (const [nombre, valor] of r.headers) expect(apariciones(valor, T), `${ruta} · ${nombre}`).toEqual([]);
      const tieneFormulario = /<form/.test(html);
      if (tieneFormulario) conFormulario++;
      if (tieneFormulario || r.status === 200) {
        expect(r.headers.get("referrer-policy"), ruta).toBe("strict-origin");
        expect(parse(html).querySelector('meta[name="referrer"]')?.getAttribute("content"), ruta).toBe("strict-origin");
      }
      // Lo que SÍ responde la función con la ruta pedida bajo /editar/: la cabecera.
      if (new URL(ruta, medido.base).pathname.startsWith("/editar/") && r.headers.get("cache-control")?.includes("no-store")) {
        expect(r.headers.get("referrer-policy"), ruta).toBe("strict-origin");
      }
    }
    // Control: sí se pintó el formulario por al menos cinco formas equivalentes.
    expect(conFormulario).toBeGreaterThanOrEqual(5);
  });

  it("POST por una variante que sí llega a la página (barra final, token codificado): el 303 lleva strict-origin y va a la confirmación canónica", async () => {
    s = await sembrarFichasDe4(consultar, { categoriaId, coloniaId, serie: SERIE });
    const T = s.tokens.envios;
    for (const ruta of [`/editar/${T}/?_action=editar`, `/editar/${codificado(T)}?_action=editar`]) {
      const r = await post(ruta, cuerpo("envios", { horario: `variante ${ruta.length}` }));
      expect(r.status, ruta).toBe(303);
      expect(r.headers.get("location"), ruta).toBe(`/editar/${T}/gracias`);
      expect(r.headers.get("referrer-policy"), ruta).toBe("strict-origin");
      expect(r.headers.getSetCookie(), ruta).toEqual([]);
      expect(r.headers.get("link"), ruta).toBeNull();
    }
    // Las que no llegan a la página no escriben.
    for (const ruta of [`//editar/${T}?_action=editar`, `/%65ditar/${T}?_action=editar`, `/EDITAR/${T}?_action=editar`]) {
      const r = await post(ruta, cuerpo("envios", { horario: "no debe llegar" }));
      expect(r.status, ruta).not.toBe(303);
      expect(r.status, ruta).not.toBe(500);
    }
    expect((await prisma.edicionPendiente.findFirstOrThrow({ where: { negocioId: s.ids.envios, estado: "pendiente" } })).horario).not.toBe("no debe llegar");
  });
});

// ── Segmentos hostiles ──────────────────────────────────────────────────────

describe("C · segmentos hostiles: la 404 del enlace, sin 500 y sin eco", () => {
  const hostiles = [
    "a".repeat(4000),
    "Z".repeat(42) + "ñ",
    "%C3%B1".repeat(43),
    "%00",
    `${"A".repeat(42)}%00`,
    "__proto__",
    "constructor",
    "%E0%A4%A",
    "%3Cscript%3Ealert(1)%3C%2Fscript%3E",
    "%22%3E%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E",
  ];

  it("GET, POST ?_action=editar y /gracias: estado esperado, sin eco del segmento y con strict-origin", async () => {
    const referencia = await (await e.pedir(`/editar/${"Z".repeat(43)}`)).text();
    for (const seg of hostiles) {
      const g = await e.pedir(`/editar/${seg}`);
      const cuerpoG = await g.text();
      expect([400, 404], `GET ${seg.slice(0, 30)}`).toContain(g.status);
      if (g.status === 404 && g.headers.get("cache-control")?.includes("no-store")) {
        expect(cuerpoG, `GET ${seg.slice(0, 30)}`).toBe(referencia);
        expect(g.headers.get("referrer-policy")).toBe("strict-origin");
      }
      expect(cuerpoG).not.toMatch(/<script>alert|onerror=alert/);

      const p = await post(`/editar/${seg}?_action=editar`, cuerpo("publicada", { sitio_web: "trampa" }));
      const cuerpoP = await p.text();
      expect([400, 403, 404], `POST ${seg.slice(0, 30)}`).toContain(p.status);
      expect(p.headers.get("location"), `POST ${seg.slice(0, 30)}`).toBeNull();
      expect(cuerpoP).not.toMatch(/<script>alert|onerror=alert/);

      const gr = await e.pedir(`/editar/${seg}/gracias`);
      const cuerpoGr = await gr.text();
      expect(gr.status, `gracias ${seg.slice(0, 30)}`).not.toBe(500);
      expect(cuerpoGr).not.toMatch(/<script>alert|onerror=alert|aaaaaaaaaa/);
      if (gr.status === 200) {
        expect(gr.headers.get("cache-control")).toMatch(/no-store/);
        expect(gr.headers.get("referrer-policy")).toBe("strict-origin");
      }
    }
    expect(await pendientes(s.ids.publicada)).toBe(0);
    // Consulta hostil (`?error=`, `?next=`) sobre la ruta buena y la 404: sin eco ni redirección.
    const veneno = "%3Cscript%3Ealert(9)%3C%2Fscript%3Ehttps%3A%2F%2Fevil.example";
    for (const ruta of [
      `/editar/${s.tokens.publicada}?error=${veneno}`,
      `/editar/${s.tokens.publicada}?next=${veneno}&redirect=${veneno}`,
      `/editar/${s.tokens.publicada}/gracias?error=${veneno}`,
      `/editar/${"Z".repeat(43)}?error=${veneno}`,
    ]) {
      const r = await e.pedir(ruta);
      const html = await r.text();
      expect(r.status, ruta).not.toBe(500);
      expect(html, ruta).not.toMatch(/alert\(9\)|evil\.example/);
      expect(r.headers.get("location"), ruta).toBeNull();
    }
    const conVeneno = await post(`/editar/${s.tokens.publicada}?_action=editar&error=${veneno}&next=${veneno}`, cuerpo("publicada", { whatsapp: "12" }));
    expect(conVeneno.status).toBe(200);
    expect(await conVeneno.text()).not.toMatch(/alert\(9\)|evil\.example/);
    expect(e.registro()).not.toMatch(/<script>alert/);
  });
});

// ── XSS en lo prellenado ────────────────────────────────────────────────────

describe("C · lo prellenado con HTML, comillas y unicode raro sale escapado", () => {
  const HOSTIL = {
    nombre: `"><script>alert(1)</script>' onfocus='x`,
    queOfreces: `</textarea><script>alert(2)</script><img src=x onerror=alert(3)>`,
    direccion: `' autofocus onfocus=alert(4) x='`,
    horario: `L-V ‮evil‬ 🔑 ​<b>9</b>`,
  };

  it("de la ficha publicada y de una pendiente: ningún script ni manejador inyectado; el valor llega tal cual", async () => {
    s = await sembrarFichasDe4(consultar, { categoriaId, coloniaId, serie: SERIE });
    await prisma.negocio.update({ where: { id: s.ids.publicada }, data: HOSTIL });
    await prisma.edicionPendiente.updateMany({ where: { negocioId: s.ids.pendiente }, data: HOSTIL });
    for (const ficha of ["publicada", "pendiente"] as const) {
      const r = await e.pedir(`/editar/${s.tokens[ficha]}`);
      expect(r.status).toBe(200);
      const html = await r.text();
      const doc = parse(html);
      expect(doc.querySelectorAll("script").length, ficha).toBe(1);
      expect(doc.querySelectorAll("script")[0].getAttribute("src"), ficha).toMatch(/^\/_astro\//);
      expect(doc.querySelectorAll("img").length, ficha).toBe(0);
      for (const el of doc.querySelectorAll("*")) {
        for (const nombre of Object.keys(el.attributes)) expect(nombre.toLowerCase(), ficha).not.toMatch(/^on/);
      }
      expect(doc.querySelector("#nombre")?.getAttribute("value"), ficha).toBe(HOSTIL.nombre);
      expect(doc.querySelector("#direccion")?.textContent, ficha).toBe(HOSTIL.direccion);
      expect(doc.querySelector("#horario")?.getAttribute("value"), ficha).toBe(HOSTIL.horario);
      expect(doc.querySelector("#queOfreces")?.textContent, ficha).toBe(HOSTIL.queOfreces);
      // Canal Referer: todo enlace/recurso es del propio sitio y ninguno afloja la política por elemento.
      for (const el of doc.querySelectorAll("[href], [src], [action], [formaction]")) {
        for (const attr of ["href", "src", "action", "formaction"]) {
          const valor = el.getAttribute(attr);
          if (valor === undefined) continue;
          expect(valor, `${ficha} ${attr}`).toMatch(/^(\/(?!\/)|\?|#)/);
          expect(apariciones(valor, s.tokens[ficha]), `${ficha} ${attr}`).toEqual([]);
        }
      }
      expect(html, ficha).not.toMatch(/referrerpolicy|rel="?[^"]*\b(prefetch|preconnect|dns-prefetch)\b/i);
    }
  });

  it("el re-pintado de un envío con error devuelve lo capturado escapado", async () => {
    const r = await post(`/editar/${s.tokens.envios}?_action=editar`, cuerpo("envios", { ...HOSTIL, whatsapp: "12" }));
    expect(r.status).toBe(200);
    const doc = parse(await r.text());
    expect(doc.querySelectorAll("script").length).toBe(1);
    expect(doc.querySelectorAll("img").length).toBe(0);
    expect(doc.querySelector("#nombre")?.getAttribute("value")).toBe(HOSTIL.nombre);
    expect(doc.querySelector("#queOfreces")?.textContent).toBe(HOSTIL.queOfreces);
  });
});

// ── Otras Actions, métodos y _action raros ──────────────────────────────────

describe("C · contra /editar/T solo corre editar, y solo por POST", () => {
  it("registrar/reportar/confirmar/reenviar, mayúsculas, duplicado o con NUL en _action: nada se escribe, nada es 500 ni 303", async () => {
    s = await sembrarFichasDe4(consultar, { categoriaId, coloniaId, serie: SERIE });
    const T = s.tokens.publicada;
    const negociosAntes = await prisma.negocio.count();
    const reportesAntes = await prisma.reporte.count();
    const registro = cuerpo("publicada", { whatsapp: `${SERIE}95`, consentimiento: "on", avisoVersion: VERSION_AVISO, motivo: "cerrado", codigo: "123456" });
    for (const accion of ["registrar", "reportar", "confirmar", "reenviar", "EDITAR", "editar%00", "registrar&_action=editar", "editar.extra"]) {
      const r = await post(`/editar/${T}?_action=${accion}`, registro);
      expect(r.status, accion).not.toBe(500);
      expect(r.status, accion).not.toBe(303);
      expect(r.headers.get("location"), accion).toBeNull();
      expect(r.headers.getSetCookie(), accion).toEqual([]);
    }
    // `_action` en el cuerpo (sin consulta) tampoco corre nada.
    const enCuerpo = cuerpo("publicada");
    enCuerpo.append("_action", "editar");
    expect((await post(`/editar/${T}`, enCuerpo)).status).not.toBe(303);
    for (const metodo of ["PUT", "PATCH", "DELETE"]) {
      const r = await e.pedir(`/editar/${T}?_action=editar`, { method: metodo, body: cuerpo("publicada"), headers: { origin: e.base, "x-forwarded-for": ip() } });
      expect(r.status, metodo).not.toBe(500);
      expect(r.status, metodo).not.toBe(303);
    }
    expect(await prisma.negocio.count()).toBe(negociosAntes);
    expect(await prisma.reporte.count()).toBe(reportesAntes);
    expect(await pendientes(s.ids.publicada)).toBe(0);
    // `_action` duplicado: el middleware y Astro leen el PRIMERO, los dos; corre
    // `editar` (su propio 303) y nunca `registrar`.
    const doble = await post(`/editar/${T}?_action=editar&_action=registrar`, registro);
    expect(doble.status).toBe(303);
    expect(doble.headers.get("location")).toBe(`/editar/${T}/gracias`);
    expect(await prisma.negocio.count()).toBe(negociosAntes);
    await prisma.edicionPendiente.deleteMany({ where: { negocioId: s.ids.publicada } });
  });

  it("categoría o colonia inexistentes: error en el sitio, sin pendiente", async () => {
    const variantes: Array<Record<string, string>> = [{ categoriaId: "999999" }, { coloniaId: "999999" }, { categoriaId: "-1" }, { categoriaId: "1e3" }];
    for (const extra of variantes) {
      const r = await post(`/editar/${s.tokens.publicada}?_action=editar`, cuerpo("publicada", extra));
      expect(r.status, JSON.stringify(extra)).toBe(200);
    }
    expect(await pendientes(s.ids.publicada)).toBe(0);
  });
});

// ── Cuerpos rotos ───────────────────────────────────────────────────────────

describe("C · cuerpos rotos o desmedidos", () => {
  it("multipart sin boundary, malformado o chunked de 7 MiB sin Content-Length: nunca 500, 303 ni escritura; el log sin el token", async () => {
    s = await sembrarFichasDe4(consultar, { categoriaId, coloniaId, serie: SERIE });
    const T = s.tokens.publicada;
    const ruta = `/editar/${T}?_action=editar`;
    const casos: Array<[string, BodyInit, Record<string, string>]> = [
      ["sin boundary", "nombre=x", { "content-type": "multipart/form-data" }],
      ["malformado", "--X\r\nContent-Disposition: form-data; name=\"nombre\"\r\n\r\nsin cierre", { "content-type": "multipart/form-data; boundary=X" }],
      ["boundary que no casa", "--Y\r\n\r\n--Y--", { "content-type": "multipart/form-data; boundary=X" }],
      ["urlencoded", `nombre=x&categoriaId=${categoriaId}&whatsapp=${s.whatsapps.publicada}&coloniaId=${coloniaId}&horario=urlencoded`, { "content-type": "application/x-www-form-urlencoded" }],
      ["json", JSON.stringify({ horario: "json" }), { "content-type": "application/json" }],
    ];
    for (const [nombre, body, cabeceras] of casos) {
      const r = await post(ruta, body, cabeceras);
      expect(r.status, nombre).not.toBe(500);
      if (nombre !== "urlencoded") expect(r.status, nombre).not.toBe(303);
    }
    // Chunked: un ReadableStream sin longitud declarada. En un emulador aparte:
    // el servidor responde sin leer todo el cuerpo y la conexión keep-alive
    // queda reseteada (artefacto de node:http, no del producto; en Vercel el
    // cuerpo de una función se corta en 4.5 MB antes de llegar).
    const aparte = await levantarEmulador({ SITIO_URL: URL_PUBLICA, REGISTRO_ENCABEZADO_IP: "x-forwarded-for" });
    const MiB = 1024 * 1024;
    const trozo = new TextEncoder().encode("a".repeat(64 * 1024));
    let enviados = 0;
    const flujo = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('--X\r\nContent-Disposition: form-data; name="queOfreces"\r\n\r\n'));
      },
      pull(c) {
        if (enviados >= 7 * MiB) {
          c.enqueue(new TextEncoder().encode("\r\n--X--\r\n"));
          c.close();
          return;
        }
        enviados += trozo.length;
        c.enqueue(trozo);
      },
    });
    const grande = await aparte
      .pedir(ruta, {
        method: "POST",
        body: flujo,
        headers: { origin: aparte.base, "x-forwarded-for": ip(), "content-type": "multipart/form-data; boundary=X" },
        duplex: "half",
      } as RequestInit)
      .catch((error: unknown) => ({ status: -1, error }) as const);
    expect(grande.status, "chunked 7 MiB").not.toBe(500);
    expect(grande.status, "chunked 7 MiB").not.toBe(303);
    // Solo el urlencoded bien formado pudo dejar algo (con su propio horario).
    for (const p of await prisma.edicionPendiente.findMany({ where: { negocioId: s.ids.publicada } })) expect(p.horario).toBe("urlencoded");
    expect(apariciones(e.registro(), T)).toEqual([]);
    expect(apariciones(aparte.registro(), T)).toEqual([]);
    aparte.detener();
  });
});

// ── Ráfaga ──────────────────────────────────────────────────────────────────

describe("C · ráfaga de diez del mismo token (PostgreSQL real)", () => {
  it.runIf(backendsIndependientes)("tres rondas de diez: exactamente una pendiente, ningún 500, cada respuesta 303 o el error de guardado", async () => {
    s = await sembrarFichasDe4(consultar, { categoriaId, coloniaId, serie: SERIE });
    for (let ronda = 0; ronda < 3; ronda++) {
      const horarios = Array.from({ length: 10 }, (_, i) => `ráfaga C ${ronda}-${i}`);
      const respuestas = await Promise.all(horarios.map((horario) => post(`/editar/${s.tokens.publicada}?_action=editar`, cuerpo("publicada", { horario }))));
      for (const r of respuestas) {
        expect(r.status, `ronda ${ronda}`).not.toBe(500);
        if (r.status !== 303) {
          expect(r.status).toBe(200);
          const html = await r.text();
          expect(html).toContain(ERROR_GUARDAR_EDICION);
          expect(html).not.toMatch(/P2002|prisma|postgres|unique/i);
        }
      }
      const vivas = await prisma.edicionPendiente.findMany({ where: { negocioId: s.ids.publicada, estado: "pendiente" } });
      expect(vivas, `ronda ${ronda}`).toHaveLength(1);
      expect(horarios).toContain(vivas[0].horario);
    }
  }, 120_000);
});

// ── Una excepción tras resolver el token ────────────────────────────────────

describe("C · una falla después de resolver el token (no la base caída)", () => {
  it("con la tabla Colonia renombrada: 500 sin el token en el cuerpo, las cabeceras ni el log", async () => {
    s = await sembrarFichasDe4(consultar, { categoriaId, coloniaId, serie: SERIE });
    const T = s.tokens.publicada;
    const desde = e.registro().length;
    await consultar(`ALTER TABLE "Colonia" RENAME TO "Colonia_c4g"`, []);
    let vistos: Response[] = [];
    try {
      vistos = [await e.pedir(`/editar/${T}`), await post(`/editar/${T}?_action=editar`, cuerpo("publicada", { whatsapp: "12" }))];
    } finally {
      await consultar(`ALTER TABLE "Colonia_c4g" RENAME TO "Colonia"`, []);
    }
    for (const r of vistos) {
      const html = await r.text();
      expect(r.status).toBe(500);
      expect(r.headers.get("referrer-policy")).toBe("strict-origin");
      expect(apariciones(html, T)).toEqual([]);
      for (const [n, v] of r.headers) expect(apariciones(v, T), n).toEqual([]);
      expect(html).not.toMatch(/Colonia_c4g|prisma|postgres/i);
    }
    const log = e.registro().slice(desde);
    expect(log.length).toBeGreaterThan(0);
    expect(apariciones(log, T)).toEqual([]);
  });
});
