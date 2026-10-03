/**
 * Spec `plataforma-astro` (change `migrar-enlace-gestion-astro`, T-025, Fase
 * 4). tasks.md #4: las pantallas del enlace de gestión y su 404 sobre la
 * SALIDA SERVIDA (build real + emulador del Build Output API):
 *
 * - "La pantalla de edición y su confirmación responden desde Astro el mismo
 *   HTML que Next" (contra `tests/fixtures/next-4`, capturados con
 *   `scripts/diff-html.mjs --capturar-4` y la MISMA siembra que aquí:
 *   `sembrarFichasDe4`, con tokens generados en cada lado y `<T…>` en los
 *   fixtures);
 * - "Un enlace que no resuelve responde la misma 404, sin delatar el motivo";
 * - el peso del JavaScript propio de `/editar/T` (≤ 5 KB con gzip).
 *
 * Todo ficticio: WhatsApp 77199966xx, dominios `.example`.
 */
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";

import { parse } from "node-html-parser";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import {
  DIFERENCIAS_ACEPTADAS_GESTION,
  NORMALIZACIONES_REGISTRO,
  compararRespuestas,
  idsDeCatalogoPorNombre,
  sinDiferenciasAceptadasDeGestion,
} from "../scripts/diff-html/nucleo.mjs";
import { PANTALLAS_DE_4, motivosDe404 } from "../scripts/enviar-formulario.mjs";
import type { PrismaClient } from "../src/generated/prisma/client";
import { VARIABLE_SRC, VARIABLE_WEBSITE_ID } from "../src/lib/analitica/config";
import {
  AVISO_EDICION_PENDIENTE,
  BOTON_ENVIAR_CAMBIOS,
  FRASE_EDICION,
  MENSAJE_CAMBIOS_RECIBIDOS,
  NOTA_PRIVACIDAD_VIGENTE,
  TITULO_EDICION,
} from "../src/lib/gestion/textos";
import { generarTokenGestion } from "../src/lib/gestion/token";
import { COLONIA_OTRA_VALOR } from "../src/lib/registro/textos";
import { cabecerasDeSeguridad } from "../src/lib/seguridad/csp";
import { crearClientePrueba } from "./db";
import { COLONIA_OTRA_TEXTO, HORARIO_PENDIENTE, type SembradoDe4, borrarFichasDe4, regenerarEnlace, sembrarFichasDe4, sinTokens } from "./gestion-astro";
import { type Emulador, construirSiHaceFalta, levantarEmulador } from "./salida-astro";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FIXTURES = path.join(raiz, "tests/fixtures/next-4");
const URL_PUBLICA = "https://enmirumbo.example";
const SERIE = "77199966";
const CACHE_DINAMICO = "private, no-cache, no-store, max-age=0, must-revalidate";
const CACHE_DE_ACCION = "no-cache, no-store, max-age=0, must-revalidate";
const BASE_CAIDA = "postgresql://usuario:claveFicticia4@127.0.0.1:1/ninguna";

type Variante = "con-sitio-url" | "sin-sitio-url" | "medido";

let prisma: PrismaClient;
let s: SembradoDe4;
let inventado = "";
const emuladores = {} as Record<Variante, Emulador>;
/** Con la base inalcanzable: la confirmación no consulta la base. */
let caida: Emulador;
let categoriaId = 0;
let coloniaId = 0;

const consultar = (sql: string, params: unknown[]) => prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(sql, ...params);

/** Las tres cabeceras globales y la política del grupo de gestión. */
function cabecerasDeGestion(h: Headers, etiqueta: string) {
  for (const { key, value } of cabecerasDeSeguridad()) {
    expect(h.get(key), `${etiqueta} · ${key}`).toBe(key.toLowerCase() === "referrer-policy" ? "strict-origin" : value);
  }
  expect(h.get("x-powered-by"), etiqueta).toBeNull();
}

const seguridadDeNext = () => Object.fromEntries(cabecerasDeSeguridad().map(({ key, value }) => [key.toLowerCase(), value]));

function fixture(variante: Variante, nombre: string): string {
  return readFileSync(path.join(FIXTURES, variante, nombre), "utf8").replace(/>\n</g, "><");
}

function respuestasNext(variante: Variante) {
  return JSON.parse(readFileSync(path.join(FIXTURES, variante, "respuestas.json"), "utf8"));
}

/** El HTML de Astro con los tokens cambiados por las mismas marcas de los fixtures. */
function anonimo(html: string): string {
  return sinTokens(html, {
    "<T>": s.tokens.publicada,
    "<T-pendiente>": s.tokens.pendiente,
    "<T-colonia-otra>": s.tokens.coloniaOtra,
    "<T-inventado>": inventado,
  });
}

const tokenDe = (ficha: string) => (ficha === "inventado" ? inventado : s.tokens[ficha as keyof SembradoDe4["tokens"]]);
const ediciones = () => prisma.edicionPendiente.count({ where: { negocio: { whatsapp: { startsWith: SERIE } } } });

beforeAll(async () => {
  construirSiHaceFalta();
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })).id;
  coloniaId = (await prisma.colonia.findFirstOrThrow({ orderBy: { id: "asc" } })).id;
  s = await sembrarFichasDe4(consultar, { categoriaId, coloniaId, serie: SERIE });
  inventado = generarTokenGestion();
  [emuladores["con-sitio-url"], emuladores["sin-sitio-url"], emuladores.medido, caida] = await Promise.all([
    levantarEmulador({ SITIO_URL: URL_PUBLICA, REGISTRO_ENCABEZADO_IP: "x-forwarded-for" }),
    levantarEmulador({ SITIO_URL: undefined, REGISTRO_ENCABEZADO_IP: "x-forwarded-for" }),
    levantarEmulador({ SITIO_URL: URL_PUBLICA, [VARIABLE_SRC]: "https://cloud.umami.is/script.js", [VARIABLE_WEBSITE_ID]: "00000000-0000-0000-0000-000000000000" }),
    levantarEmulador({ SITIO_URL: URL_PUBLICA, DATABASE_URL: BASE_CAIDA }),
  ]);
}, 300_000);

afterAll(async () => {
  for (const e of [...Object.values(emuladores), caida]) e?.detener();
  await borrarFichasDe4(consultar, SERIE);
  await prisma.$disconnect();
});

// ── La pantalla de edición y su confirmación: el mismo HTML que Next ────────

describe("gestión · pantallas iguales a las de hoy (contra los fixtures de Next)", () => {
  for (const variante of ["con-sitio-url", "sin-sitio-url", "medido"] as const) {
    for (const [nombre, ficha, sufijo] of PANTALLAS_DE_4) {
      it(`${variante}: ${nombre} sin diferencias fuera de las normalizaciones declaradas y la política de referente`, async () => {
        const e = emuladores[variante];
        const ruta = `/editar/${tokenDe(ficha)}${sufijo}`;
        const r = await e.pedir(ruta);
        const next = respuestasNext(variante).pantallas[nombre];
        const aplicadas: string[] = [];
        const aceptadas: string[] = [];
        const esFormulario = sufijo === "";
        const diferencias = compararRespuestas(
          `${variante} ${nombre}`,
          { status: next.status, headers: { ...seguridadDeNext(), "content-type": next["content-type"], "cache-control": next["cache-control"] }, cuerpo: fixture(variante, nombre) },
          { status: r.status, headers: Object.fromEntries(r.headers), cuerpo: anonimo(idsDeCatalogoPorNombre(await r.text())) },
          {
            dinamica: true,
            ...(esFormulario ? { registro: { urlPagina: new URL(`/editar/<T>`, e.base).toString(), aplicadas, repintada: false } } : {}),
          },
        );
        expect(sinDiferenciasAceptadasDeGestion(diferencias, aceptadas)).toEqual([]);
        expect(r.status).toBe(200);
        // La política del grupo: la cabecera (Astro) en vez de la global (Next), siempre.
        expect(aceptadas).toEqual(["cabecera-referrer-policy"]);
        cabecerasDeGestion(r.headers, `${variante} ${nombre}`);
        expect(r.headers.get("cache-control")).toBe(CACHE_DINAMICO);
        expect(next.metaReferrer).toBe("strict-origin");
        if (esFormulario) expect(aplicadas).toEqual(NORMALIZACIONES_REGISTRO.slice(0, 4).map((n) => n.id));
      });
    }
  }

  it("un campo oculto de más o un atributo data- en el formulario de Astro SÍ salen como diferencia", async () => {
    const e = emuladores["con-sitio-url"];
    const html = anonimo(idsDeCatalogoPorNombre(await (await e.pedir(`/editar/${s.tokens.publicada}`)).text()));
    const casos = [
      html.replace('id="categoriaId"', 'id="categoriaId" data-otro="x"'),
      html.replace('<button type="submit"', '<input type="hidden" name="token" value="x"><button type="submit"'),
      html.replace('id="whatsapp"', 'id="whatsapp" data-token="<T>"'),
    ];
    for (const inyectado of casos) {
      expect(inyectado).not.toBe(html);
      const diferencias = compararRespuestas(
        "inyectado",
        { status: 200, headers: { ...seguridadDeNext(), "content-type": "text/html; charset=utf-8" }, cuerpo: fixture("con-sitio-url", "editar-publicada.html") },
        { status: 200, headers: { ...seguridadDeNext(), "content-type": "text/html; charset=utf-8" }, cuerpo: inyectado },
        { registro: { urlPagina: new URL("/editar/<T>", e.base).toString(), aplicadas: [] } },
      );
      expect(diferencias.length).toBeGreaterThan(0);
    }
  });

  it("la pantalla: un solo h1 'Edita tu ficha', su frase, la nota del aviso, 'Enviar cambios', sin foto, sin casilla, sin ocultos y noindex", async () => {
    const html = await (await emuladores["con-sitio-url"].pedir(`/editar/${s.tokens.publicada}`)).text();
    const documento = parse(html);
    expect(documento.querySelectorAll("h1").map((h) => h.text.trim())).toEqual([TITULO_EDICION]);
    expect(documento.querySelector("title")?.text).toBe(`${TITULO_EDICION} — EnMiRumbo`);
    expect(html).toContain(FRASE_EDICION);
    expect(html).toContain(NOTA_PRIVACIDAD_VIGENTE);
    expect(html).not.toContain(AVISO_EDICION_PENDIENTE);
    const aviso = documento.querySelectorAll("a").find((a) => a.text.trim() === "Lee el aviso de privacidad completo");
    expect(aviso?.getAttribute("href")).toBe("/aviso-de-privacidad");
    const form = documento.querySelector("form")!;
    expect(documento.querySelectorAll("form")).toHaveLength(1);
    expect(form.getAttribute("action")).toBe("?_action=editar");
    expect(form.getAttribute("method")).toBe("post");
    expect(form.getAttribute("enctype")).toBe("multipart/form-data");
    expect(form.querySelector('button[type="submit"]')?.text.trim()).toBe(BOTON_ENVIAR_CAMBIOS);
    expect(form.querySelectorAll('input[type="hidden"]')).toHaveLength(0);
    expect(form.querySelectorAll('input[type="file"], #foto, #sinFoto, #consentimiento')).toHaveLength(0);
    expect(html).not.toContain("Dejar mi ficha sin foto");
    expect(documento.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex, nofollow");
    expect(documento.querySelector('meta[name="referrer"]')?.getAttribute("content")).toBe("strict-origin");
    expect(form.querySelector("#whatsapp")?.getAttribute("value")).toBe(s.whatsapps.publicada);
    expect(form.querySelector("#horario")?.getAttribute("value")).toBe("L-S 9am-6pm");
  });

  it("colonia 'Otra' sin normalizar: elegida 'Otra' con su texto libre", async () => {
    const form = parse(await (await emuladores["con-sitio-url"].pedir(`/editar/${s.tokens.coloniaOtra}`)).text()).querySelector("form")!;
    const elegida = form.querySelectorAll("#coloniaId option").filter((o) => o.getAttribute("selected") !== undefined);
    expect(elegida.map((o) => o.getAttribute("value"))).toEqual([COLONIA_OTRA_VALOR]);
    expect(form.querySelector("#coloniaOtra")?.getAttribute("value")).toBe(COLONIA_OTRA_TEXTO);
  });

  it("con pendiente: el aviso y lo que el dueño mandó, no lo publicado", async () => {
    const html = await (await emuladores["con-sitio-url"].pedir(`/editar/${s.tokens.pendiente}`)).text();
    expect(html).toContain(AVISO_EDICION_PENDIENTE);
    expect(parse(html).querySelector("#horario")?.getAttribute("value")).toBe(HORARIO_PENDIENTE);
  });

  it("la confirmación: 200 sin <form>, el mensaje, 'Volver al inicio' a /, noindex, con token válido e inventado, y sin consultar la base", async () => {
    for (const [e, token] of [
      [emuladores["con-sitio-url"], s.tokens.publicada],
      [emuladores["con-sitio-url"], inventado],
      [emuladores["con-sitio-url"], "cualquier-cosa"],
      [caida, s.tokens.publicada],
    ] as const) {
      const r = await e.pedir(`/editar/${token}/gracias`);
      const html = await r.text();
      expect(r.status, token.slice(0, 4)).toBe(200);
      const documento = parse(html);
      expect(documento.querySelectorAll("form")).toHaveLength(0);
      expect(documento.querySelector("h1")?.text.trim()).toBe(MENSAJE_CAMBIOS_RECIBIDOS);
      expect(documento.querySelectorAll("a").find((a) => a.text.trim() === "Volver al inicio")?.getAttribute("href")).toBe("/");
      expect(documento.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex, nofollow");
      expect(documento.querySelectorAll("script")).toHaveLength(0);
      cabecerasDeGestion(r.headers, `gracias ${token.slice(0, 4)}`);
    }
  });
});

// ── Un enlace que no resuelve responde la misma 404, sin delatar el motivo ──

describe("gestión · la 404 indistinguible del enlace", () => {
  const sinFecha = (h: Headers) => Object.fromEntries([...h].filter(([n]) => !["date", "connection", "keep-alive", "transfer-encoding"].includes(n)));

  async function formas(e: Emulador, segmento: string) {
    const cuerpo = () => {
      const datos = new FormData();
      for (const [k, v] of Object.entries({ nombre: "Cerrajería Ficticia", categoriaId: String(categoriaId), whatsapp: s.whatsapps.publicada, coloniaId: String(coloniaId), horario: "x" })) datos.append(k, v);
      return datos;
    };
    const salida: Record<string, { status: number; cabeceras: Record<string, string>; cuerpo: string; cookies: number }> = {};
    for (const [forma, ruta, init] of [
      ["GET", `/editar/${segmento}`, {}],
      ["HEAD", `/editar/${segmento}`, { method: "HEAD" }],
      ["POST ?_action=editar", `/editar/${segmento}?_action=editar`, { method: "POST", body: cuerpo(), headers: { origin: e.base } }],
      ["POST", `/editar/${segmento}`, { method: "POST", body: cuerpo(), headers: { origin: e.base } }],
    ] as const) {
      const r = await e.pedir(ruta, init as RequestInit);
      salida[forma] = { status: r.status, cabeceras: sinFecha(r.headers), cuerpo: await r.text(), cookies: r.headers.getSetCookie().length };
    }
    return salida;
  }

  it("los once motivos: 404 idénticos entre sí por forma de petición, con el cuerpo de /loquesea, sin cookies, sin 500 y sin escribir", async () => {
    const e = emuladores["con-sitio-url"];
    const antes = await ediciones();
    const loquesea = await e.pedir("/loquesea");
    const cuerpoLoquesea = await loquesea.text();
    expect(loquesea.status).toBe(404);
    const motivos = motivosDe404(s.tokens, inventado);
    const porMotivo = [];
    for (const [nombre, segmento] of motivos) porMotivo.push([nombre, await formas(e, segmento)] as const);
    const [, primero] = porMotivo[0];
    for (const [nombre, respuestas] of porMotivo) {
      for (const [forma, r] of Object.entries(respuestas)) {
        expect(r.status, `${nombre} ${forma}`).toBe(404);
        expect(r.cookies, `${nombre} ${forma}`).toBe(0);
        expect(r.cabeceras, `${nombre} ${forma}`).toEqual(primero[forma as keyof typeof primero].cabeceras);
        expect(r.cuerpo, `${nombre} ${forma}`).toBe(forma === "HEAD" ? "" : cuerpoLoquesea);
        expect(r.cabeceras["referrer-policy"], `${nombre} ${forma}`).toBe("strict-origin");
      }
      expect(respuestas.GET.cabeceras["cache-control"]).toBe(CACHE_DINAMICO);
      expect(respuestas["POST ?_action=editar"].cabeceras["cache-control"]).toBe(CACHE_DE_ACCION);
    }
    // Difiere de /loquesea SOLO en la política de referente (a propósito).
    const deLoquesea = sinFecha(loquesea.headers);
    expect({ ...primero.GET.cabeceras, "referrer-policy": deLoquesea["referrer-policy"] }).toEqual(deLoquesea);
    expect(deLoquesea["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(await ediciones()).toBe(antes);
    // Y Next responde 404 en todos (su documento de error), como Astro.
    const next = respuestasNext("con-sitio-url").motivos;
    for (const [nombre] of motivos) for (const forma of ["GET", "HEAD", "POST-sin-accion"]) expect(next[`${forma} ${nombre}`].status, `${forma} ${nombre}`).toBe(404);
  });

  it("el cuerpo de la 404 no lleva el token, ni el formulario, ni el script de la mejora", async () => {
    const e = emuladores.medido;
    for (const [, segmento] of motivosDe404(s.tokens, inventado)) {
      const html = await (await e.pedir(`/editar/${segmento}`)).text();
      if (segmento.length >= 8) expect(html).not.toContain(segmento.slice(0, 8));
      expect(html).not.toMatch(/<form|<script|umami/);
    }
  });

  it("/editar/ (sin token) y /editar responden la 404 de una dirección que no existe, sin 500", async () => {
    const e = emuladores["con-sitio-url"];
    const cuerpoLoquesea = await (await e.pedir("/loquesea")).text();
    for (const ruta of ["/editar/", "/editar"]) {
      const r = await e.pedir(ruta, { redirect: "follow" });
      expect(r.status, ruta).toBe(404);
      expect(await r.text(), ruta).toBe(cuerpoLoquesea);
    }
  });

  it("el token regenerado deja de abrir, el nuevo abre, y la ficha pública no cambió", async () => {
    const e = emuladores["con-sitio-url"];
    const antes = await prisma.negocio.findUniqueOrThrow({ where: { id: s.ids.regenerable } });
    const viejo = s.tokens.regenerable;
    expect((await e.pedir(`/editar/${viejo}`)).status).toBe(200);
    const nuevo = await regenerarEnlace(consultar, s.ids.regenerable);
    expect((await e.pedir(`/editar/${viejo}`)).status).toBe(404);
    const r = await e.pedir(`/editar/${nuevo}`);
    expect(r.status).toBe(200);
    expect(await r.text()).toContain(TITULO_EDICION);
    const despues = await prisma.negocio.findUniqueOrThrow({ where: { id: s.ids.regenerable } });
    expect({ ...despues, tokenGestionHash: null, tokenGestionCreadoEn: null }).toEqual({ ...antes, tokenGestionHash: null, tokenGestionCreadoEn: null });
  });
});

// ── El JavaScript propio de /editar/T ───────────────────────────────────────

describe("gestión · sin isla y con poco JavaScript", () => {
  /** Los `.js` que baja una página: el del `<script>` y los que importa (estáticos y `import()`). */
  async function moduloDeLaPagina(e: Emulador, ruta: string) {
    const html = await (await e.pedir(ruta)).text();
    const propios = parse(html).querySelectorAll("script").filter((n) => n.getAttribute("type") !== "application/ld+json");
    expect(propios, ruta).toHaveLength(1);
    expect(propios[0].getAttribute("type")).toBe("module");
    expect(propios[0].rawText.trim()).toBe("");
    const pendientes = [propios[0].getAttribute("src")!];
    expect(pendientes[0]).toMatch(/^\/_astro\/[\w.-]+\.js$/);
    const vistos: Array<{ ruta: string; bytes: number; gzip: number; codigo: string }> = [];
    while (pendientes.length) {
      const archivo = pendientes.shift()!;
      if (vistos.some((v) => v.ruta === archivo)) continue;
      const r = await e.pedir(archivo);
      expect(r.status, archivo).toBe(200);
      const codigo = await r.text();
      vistos.push({ ruta: archivo, bytes: Buffer.byteLength(codigo), gzip: gzipSync(codigo, { level: 9 }).length, codigo });
      for (const m of codigo.matchAll(/(?:import\(|from)\s*[`'"](\.\/[\w.-]+\.js)[`'"]/g)) pendientes.push(new URL(m[1], `http://x${archivo}`).pathname);
    }
    return vistos;
  }

  it("/registro y /editar/T: un solo <script type=module> de /_astro/ cada una, y ≤ 5 KB con gzip POR PÁGINA", async () => {
    const e = emuladores["con-sitio-url"];
    for (const ruta of ["/registro", `/editar/${s.tokens.publicada}`]) {
      const modulos = await moduloDeLaPagina(e, ruta);
      const total = modulos.reduce((suma, m) => suma + m.gzip, 0);
      console.info(`[gestión] JS propio de ${ruta.replace(s.tokens.publicada, "<T>")}: ${modulos.map((m) => `${m.ruta} ${m.bytes} B (${m.gzip} B gzip)`).join(", ")}; total ${total} B gzip`);
      expect(total, ruta).toBeLessThanOrEqual(5 * 1024);
      expect(modulos.some((m) => m.codigo.includes("general-error") && m.codigo.includes("data-ejemplos")), ruta).toBe(true);
      for (const { codigo } of modulos) {
        expect(codigo).not.toMatch(/react\.transitional\.element|__REACT_DEVTOOLS|astro-island|localStorage|sessionStorage|umami/);
        expect(codigo).not.toContain(s.tokens.publicada.slice(0, 8));
      }
    }
    // El texto del error de la edición viaja SOLO en el módulo de la edición.
    const registro = (await moduloDeLaPagina(e, "/registro")).map((m) => m.codigo).join("\n");
    const edicion = (await moduloDeLaPagina(e, `/editar/${s.tokens.publicada}`)).map((m) => m.codigo).join("\n");
    expect(edicion).toContain("No pudimos guardar tus cambios");
    expect(registro).not.toContain("No pudimos guardar tus cambios");
  });

  it("la confirmación y la 404 del enlace no cargan ningún <script>", async () => {
    const e = emuladores["con-sitio-url"];
    for (const ruta of [`/editar/${s.tokens.publicada}/gracias`, `/editar/${inventado}`]) {
      expect(parse(await (await e.pedir(ruta)).text()).querySelectorAll("script"), ruta).toHaveLength(0);
    }
  });
});

describe("gestión · diferencias aceptadas declaradas", () => {
  it("son exactamente la política de referente del grupo (cabecera) y su <meta> en la 404 de Next", () => {
    expect(DIFERENCIAS_ACEPTADAS_GESTION.map((d: { id: string }) => d.id)).toEqual(["cabecera-referrer-policy", "meta-referrer-en-la-404"]);
  });
});
