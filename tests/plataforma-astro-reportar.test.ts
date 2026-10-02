/**
 * Spec `plataforma-astro` (change `migrar-formularios-publicos-astro`, T-024,
 * Fase 3a). tasks.md #5: una prueba por scenario de los requirements de la
 * página de reporte, de su envío, de la confirmación, del PRG y de las
 * Actions atadas a su ruta.
 *
 * Contra la SALIDA SERVIDA (build real + emulador del Build Output API) y con
 * el arnés de envío sin JS (`scripts/enviar-formulario.mjs`). Lo de Next sale
 * de los fixtures de la tarea 2 (`tests/fixtures/next-3a`), capturados con la
 * base semilla: por eso la ficha publicada lleva el MISMO nombre ficticio que
 * la del seed demo, con otro WhatsApp.
 *
 * Todo ficticio: WhatsApp 77199974xx, IPs de documentación (RFC 5737),
 * dominios `.example`.
 */
import { readFileSync } from "node:fs";
import { request } from "node:http";
import path from "node:path";

import { parse } from "node-html-parser";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { NORMALIZACIONES_FORMULARIO, compararRespuestas } from "../scripts/diff-html/nucleo.mjs";
import { enviarFormulario, leerSetCookie, resumenDelDesenlace } from "../scripts/enviar-formulario.mjs";
import type { PrismaClient } from "../src/generated/prisma/client";
import { VARIABLE_SRC, VARIABLE_WEBSITE_ID } from "../src/lib/analitica/config";
import { construirSegmentoFicha } from "../src/lib/ficha-url";
import { NOMBRE_COOKIE_BORRADOR, codificarBorrador } from "../src/lib/reportes/borrador";
import {
  ERROR_COMENTARIO_LARGO_REPORTE,
  ERROR_CUPO_REPORTES,
  ERROR_GUARDADO_REPORTE,
  ERROR_MOTIVO_REPORTE,
  MENSAJE_REPORTE_ENVIADO,
} from "../src/lib/reportes/textos";
import { cabecerasDeSeguridad } from "../src/lib/seguridad/csp";
import { crearClientePrueba } from "./db";
import { borrarNegociosSembrados } from "./limpieza";
import { type Emulador, construirSiHaceFalta, levantarEmulador } from "./salida-astro";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FIXTURES = path.join(raiz, "tests/fixtures/next-3a");
const URL_PUBLICA = "https://enmirumbo.example";
const NOMBRE = "Plomería Hermanos Rosales (ficticio)"; // el del seed demo (fixtures)
const NOMBRE_TOPE = "Taller Ficticio Del Tope";
const WHATSAPP = { publicado: "7719997401", revision: "7719997402", rechazado: "7719997403", despublicado: "7719997404", tope: "7719997405" };
const IP_DE_LOS_CUPOS = "203.0.113.99";
const CACHE_DINAMICO = "private, no-cache, no-store, max-age=0, must-revalidate";
const CACHE_DE_ACCION = "no-cache, no-store, max-age=0, must-revalidate";

let prisma: PrismaClient;
/** Con `SITIO_URL` y el cupo por IP declarado (lo de los fixtures `con-sitio-url`). */
let conSitio: Emulador;
/** Sin `SITIO_URL` (fixtures `sin-sitio-url`, y lo que se compara con la 404 estática). */
let sinSitio: Emulador;
/** Con la medición configurada. */
let medido: Emulador;
const ids = { publicado: "", revision: "", rechazado: "", despublicado: "", tope: "" };

const seg = () => construirSegmentoFicha(NOMBRE, ids.publicado);
const formulario = () => `/negocio/${seg()}/reportar`;
const accion = (ruta = formulario()) => `${ruta}?_action=reportar`;
const deEstos = () => ({ negocioId: { in: Object.values(ids) } });
const cuantos = () => prisma.reporte.count({ where: deEstos() });
const limpiarReportes = () => prisma.reporte.deleteMany({ where: { negocioId: { in: [ids.publicado, ids.revision, ids.rechazado, ids.despublicado] } } });

function lasCuatro(r: Response | Headers, etiqueta: string) {
  const h = r instanceof Headers ? r : r.headers;
  for (const { key, value } of cabecerasDeSeguridad()) expect(h.get(key), `${etiqueta} · ${key}`).toBe(value);
  expect(h.get("x-powered-by"), etiqueta).toBeNull();
}

function post(e: Emulador, destino: string, cuerpo: BodyInit, cabeceras: Record<string, string> = {}) {
  return e.pedir(destino, {
    method: "POST",
    body: cuerpo,
    headers: { "content-type": "application/x-www-form-urlencoded", origin: e.base, ...cabeceras },
    duplex: "half",
  } as RequestInit);
}

const anonimo = (texto: string) => Object.values(ids).reduce((t, id) => (id ? t.replaceAll(id, "<id>") : t), texto);

type Variante = "con-sitio-url" | "sin-sitio-url";

/** El fixture de Next con los `<id>` puestos de vuelta (la ficha publicada de esta base). */
function fixture(variante: Variante, nombre: string): string {
  // Los fixtures se guardan legibles (un salto entre etiquetas, `--capturar-3a`): se deshace.
  return readFileSync(path.join(FIXTURES, variante, nombre), "utf8").replace(/>\n</g, "><").replaceAll("<id>", ids.publicado);
}

function respuestasNext(variante: Variante) {
  return JSON.parse(readFileSync(path.join(FIXTURES, variante, "respuestas.json"), "utf8"));
}

/** Compara una pantalla de Astro contra su fixture de Next, con las normalizaciones del formulario. */
async function contraNext(e: Emulador, variante: Variante, nombre: string, ruta: string, cookie?: string) {
  const r = await e.pedir(ruta, cookie ? { headers: { cookie } } : {});
  const medidoNext = respuestasNext(variante).pantallas[nombre];
  const seguridad = Object.fromEntries(cabecerasDeSeguridad().map(({ key, value }) => [key.toLowerCase(), value]));
  const aplicadas: string[] = [];
  const astroCuerpo = await r.text();
  const diferencias = compararRespuestas(
    `${variante} ${ruta}`,
    { status: medidoNext.status, headers: { ...seguridad, "content-type": medidoNext["content-type"], "cache-control": medidoNext["cache-control"] }, cuerpo: fixture(variante, nombre) },
    { status: r.status, headers: Object.fromEntries(r.headers), cuerpo: astroCuerpo },
    { dinamica: true, formulario: { urlPagina: new URL(ruta, e.base).toString(), aplicadas } },
  );
  return { diferencias, aplicadas, cuerpo: astroCuerpo, r };
}

beforeAll(async () => {
  construirSiHaceFalta();
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  await borrarNegociosSembrados(prisma, Object.values(WHATSAPP));
  const categoriaId = (await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })).id;
  const alta = async (nombre: string, whatsapp: string, estado: string, extra: Record<string, unknown> = {}) =>
    (await prisma.negocio.create({ data: { nombre, categoriaId, whatsapp, estado, consintioAvisoEn: new Date(), ...extra } })).id;
  ids.publicado = await alta(NOMBRE, WHATSAPP.publicado, "publicado", { publicadoEn: new Date() });
  ids.revision = await alta("Marcadorreporte Revisión Ficticia", WHATSAPP.revision, "en_revision");
  ids.rechazado = await alta("Marcadorreporte Rechazo Ficticio", WHATSAPP.rechazado, "rechazado", { rechazadoEn: new Date() });
  ids.despublicado = await alta("Marcadorreporte Despublicado Ficticio", WHATSAPP.despublicado, "en_revision", {
    publicadoEn: new Date("2026-08-01T10:00:00.000Z"),
    despublicadoEn: new Date("2026-09-01T10:00:00.000Z"),
  });
  ids.tope = await alta(NOMBRE_TOPE, WHATSAPP.tope, "publicado", { publicadoEn: new Date() });
  await prisma.reporte.createMany({ data: Array.from({ length: 10 }, () => ({ negocioId: ids.tope, motivo: "cerrado" })) });
  [conSitio, sinSitio, medido] = await Promise.all([
    levantarEmulador({ SITIO_URL: URL_PUBLICA, REGISTRO_ENCABEZADO_IP: "x-forwarded-for" }),
    levantarEmulador({ SITIO_URL: undefined, REGISTRO_ENCABEZADO_IP: "x-forwarded-for" }),
    levantarEmulador({ SITIO_URL: URL_PUBLICA, [VARIABLE_SRC]: "https://cloud.umami.is/script.js", [VARIABLE_WEBSITE_ID]: "00000000-0000-0000-0000-000000000000" }),
  ]);
}, 300_000);

afterAll(async () => {
  for (const e of [conSitio, sinSitio, medido]) e?.detener();
  await borrarNegociosSembrados(prisma, Object.values(WHATSAPP));
  await prisma.$disconnect();
});

// ── La página de reporte responde desde Astro el mismo HTML que Next ────────

describe("reportar · formulario igual al de hoy (contra los fixtures de Next)", () => {
  const pantallas = (): Array<[string, string, string?]> => [
    ["formulario.html", formulario()],
    ...["motivo", "comentario", "cupo", "servidor", "inventado"].map((e): [string, string] => [`formulario-error-${e}.html`, `${formulario()}?error=${e}`]),
    ["formulario-borrador.html", `${formulario()}?error=motivo`, `${NOMBRE_COOKIE_BORRADOR}=${codificarBorrador("texto ficticio del borrador", 300)}`],
    ["formulario-segmento-viejo.html", `/negocio/nombre-anterior-${ids.publicado}/reportar`],
  ];

  for (const variante of ["con-sitio-url", "sin-sitio-url"] as const) {
    it(`${variante}: sin diferencias fuera de las dos normalizaciones del formulario, y dice dónde aplicó cada una`, async () => {
      const e = variante === "con-sitio-url" ? conSitio : sinSitio;
      for (const [nombre, ruta, cookie] of pantallas()) {
        const { diferencias, aplicadas, r } = await contraNext(e, variante, nombre, ruta, cookie);
        expect(diferencias, nombre).toEqual([]);
        expect(r.status, nombre).toBe(200);
        expect(aplicadas, nombre).toEqual(NORMALIZACIONES_FORMULARIO.map((n) => n.id));
      }
    });
  }

  it("un campo oculto de más en el formulario de Astro SÍ sale como diferencia", async () => {
    const r = await conSitio.pedir(formulario());
    const conExtra = (await r.text()).replace("<fieldset", '<input type="hidden" name="negocioId" value="x"><fieldset');
    const aplicadas: string[] = [];
    const seguridad = Object.fromEntries(cabecerasDeSeguridad().map(({ key, value }) => [key.toLowerCase(), value]));
    const diferencias = compararRespuestas(
      "inyectado",
      { status: 200, headers: { ...seguridad, "content-type": "text/html; charset=utf-8" }, cuerpo: fixture("con-sitio-url", "formulario.html") },
      { status: 200, headers: { ...seguridad, "content-type": "text/html; charset=utf-8" }, cuerpo: conExtra },
      { formulario: { urlPagina: new URL(formulario(), conSitio.base).toString(), aplicadas } },
    );
    expect(diferencias.join("\n")).toMatch(/negocioId/);
  });

  it("los cuatro errores pintan su texto y uno inventado no pinta ninguno", async () => {
    const textos = { motivo: ERROR_MOTIVO_REPORTE, comentario: ERROR_COMENTARIO_LARGO_REPORTE, cupo: ERROR_CUPO_REPORTES, servidor: ERROR_GUARDADO_REPORTE };
    for (const [error, texto] of Object.entries(textos)) {
      expect(await (await conSitio.pedir(`${formulario()}?error=${error}`)).text(), error).toContain(texto);
    }
    const inventado = await (await conSitio.pedir(`${formulario()}?error=inventado`)).text();
    for (const texto of Object.values(textos)) expect(inventado).not.toContain(texto);
  });

  it("el identificador ya no viaja en el formulario: ningún campo oculto salvo el honeypot", async () => {
    const html = await (await conSitio.pedir(formulario())).text();
    const form = parse(html).querySelector("form")!;
    const ocultos = form.querySelectorAll("input").filter((i) => (i.getAttribute("type") ?? "text") === "hidden");
    expect(ocultos).toEqual([]);
    const nombres = [...new Set(form.querySelectorAll("[name]").map((n) => n.getAttribute("name")))].sort();
    expect(nombres).toEqual(["comentario", "motivo", "sitio_web"]);
    expect(form.toString()).not.toContain(ids.publicado);
    expect(form.getAttribute("action")).toBe("?_action=reportar");
    expect(form.getAttribute("method")).toBe("post");
  });

  it("sin <script> propio, modulepreload ni islas; la medición en su lugar", async () => {
    const html = await (await medido.pedir(formulario())).text();
    expect(html).not.toMatch(/<script(?![^>]*umami)/);
    expect(html).not.toMatch(/modulepreload|astro-island/);
    expect(html.match(/umami/g)?.length).toBeGreaterThan(0);
  });
});

describe("reportar · ficha no publicada", () => {
  it("las cinco responden la 404 dinámica, idénticas entre sí y a la de la ficha, sin medición, sin cookie y sin datos", async () => {
    const referencia = await medido.pedir(`/negocio/x-${ids.revision}`);
    expect(referencia.status).toBe(404);
    const cuerpoReferencia = await referencia.text();
    const rutas = [
      `/negocio/x-${ids.revision}/reportar`,
      `/negocio/x-${ids.rechazado}/reportar`,
      `/negocio/x-${ids.despublicado}/reportar`,
      "/negocio/x-cnoexiste0000000000000000/reportar",
      "/negocio/sin-identificador/reportar",
    ];
    for (const ruta of rutas) {
      const r = await medido.pedir(ruta);
      const cuerpo = await r.text();
      expect(r.status, ruta).toBe(404);
      expect(cuerpo, ruta).toBe(cuerpoReferencia);
      expect(cuerpo, ruta).toContain("No encontramos esta página");
      expect(cuerpo, ruta).not.toMatch(/umami|Marcadorreporte|<form/);
      for (const id of Object.values(ids)) expect(cuerpo, ruta).not.toContain(id);
      expect(r.headers.getSetCookie(), ruta).toEqual([]);
      lasCuatro(r, ruta);
      expect(r.headers.get("cache-control"), ruta).toBe(CACHE_DINAMICO);
    }
  });

  it("un envío a una ficha en revisión o sin identificador: la MISMA 404 que el GET, sin cookie ni escritura", async () => {
    for (const ruta of [`/negocio/x-${ids.revision}/reportar`, "/negocio/sin-identificador/reportar"]) {
      const get = await (await medido.pedir(ruta)).text();
      const r = await post(medido, accion(ruta), "motivo=cerrado&comentario=hola");
      expect(r.status, ruta).toBe(404);
      expect(await r.text(), ruta).toBe(get);
      expect(r.headers.getSetCookie(), ruta).toEqual([]);
      lasCuatro(r, `POST ${ruta}`);
      // El que manda Next al atender una Action que termina en notFound() (fixture).
      expect(r.headers.get("cache-control"), ruta).toBe(respuestasNext("con-sitio-url").desenlaces["identificador-inexistente"].post["cache-control"]);
    }
    expect(await cuantos()).toBe(10); // solo los del tope
  });
});

describe("reportar · borrador hostil", () => {
  it("un borrador con </textarea><script> sale escapado dentro del campo; uno basura deja el campo vacío", async () => {
    const hostil = codificarBorrador("</textarea><script>ficticio()</script>", 300);
    const html = await (await conSitio.pedir(`${formulario()}?error=motivo`, { headers: { cookie: `${NOMBRE_COOKIE_BORRADOR}=${hostil}` } })).text();
    expect(html).toContain("&lt;/textarea&gt;&lt;script&gt;ficticio()&lt;/script&gt;</textarea>");
    expect(html).not.toContain("<script>ficticio()");
    const basura = await conSitio.pedir(`${formulario()}?error=motivo`, { headers: { cookie: `${NOMBRE_COOKIE_BORRADOR}=%%%no;es=base64` } });
    expect(basura.status).toBe(200);
    expect(await basura.text()).toMatch(/<textarea[^>]*><\/textarea>/);
  });
});

// ── El envío del reporte se comporta igual que en Next ──────────────────────

describe("reportar · mismo desenlace que Next (arnés sin JS contra los fixtures)", () => {
  it("éxito, sin motivo, comentario largo, honeypot, cupo y tope: misma cadena, mismo Location y mismas cookies", async () => {
    await limpiarReportes();
    const next = respuestasNext("con-sitio-url").desenlaces;
    const casos: Array<[string, Record<string, string>, Record<string, string>?, string?]> = [
      ["exito", { motivo: "cerrado" }],
      ["sin-motivo-con-comentario", { comentario: "hablé con la dueña" }],
      ["comentario-301", { motivo: "cerrado", comentario: "a".repeat(301) }],
      ["honeypot", { motivo: "cerrado", sitio_web: "http://spam.example" }],
      ...[1, 2, 3, 4].map((i): [string, Record<string, string>, Record<string, string>] => [
        `cupo-${i}`,
        { motivo: "cerrado" },
        { "x-forwarded-for": `198.51.100.${i}, ${IP_DE_LOS_CUPOS}` },
      ]),
      ["tope", { motivo: "cerrado" }, {}, `/negocio/x-${ids.tope}/reportar`],
      ["sin-origen", { motivo: "cerrado" }, { origin: null as unknown as string }],
    ];
    const minusculas = (c: Record<string, string>) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, k === "samesite" ? v.toLowerCase() : v]));
    for (const [nombre, elecciones, cabeceras = {}, ruta = `/negocio/x-${ids.publicado}/reportar`] of casos) {
      const resultado = await enviarFormulario({ urlPagina: new URL(ruta, conSitio.base).toString(), elecciones, cabecerasExtra: cabeceras });
      const astro = JSON.parse(anonimo(JSON.stringify(resumenDelDesenlace(resultado))));
      expect(astro, nombre).toEqual(next[nombre].cadena);
      const postAstro = resultado.cadena[1];
      expect(postAstro.cabeceras.get("cache-control"), nombre).toBe(next[nombre].post["cache-control"]);
      expect(postAstro.cabeceras.get("content-type"), nombre).toBe(next[nombre].post["content-type"]);
      lasCuatro(postAstro.cabeceras, `POST ${nombre}`);
      const cookiesAstro = postAstro.setCookie.map((l: string) => minusculas(JSON.parse(anonimo(JSON.stringify(leerSetCookie(l).atributos)))));
      expect(cookiesAstro, nombre).toEqual(next[nombre].post.cookies.map(minusculas));
      expect(resultado.final.status, nombre).toBe(200);
    }
  });

  it("identificador inexistente al enviar: Next responde su 404 y Astro la 404 dinámica, con el mismo Cache-Control", async () => {
    const r = await post(conSitio, accion("/negocio/x-cnoexiste0000000000000000/reportar"), "motivo=cerrado");
    const next = respuestasNext("con-sitio-url").desenlaces["identificador-inexistente"].post;
    expect(r.status).toBe(next.status);
    expect(r.headers.get("cache-control")).toBe(next["cache-control"]);
    expect(r.headers.get("content-type")).toBe(next["content-type"]);
    expect(await r.text()).toContain("No encontramos esta página");
  });

  it("la única diferencia aceptada: el origen ajeno o null es un 500 en Next y un 403 en Astro", async () => {
    const next = respuestasNext("con-sitio-url").desenlaces;
    expect(next["origen-ajeno"].post.status).toBe(500);
    expect(next["origen-null"].post.status).toBe(500);
    for (const origin of ["https://ajeno.example", "null"]) {
      const r = await post(conSitio, accion(), "motivo=cerrado", { origin });
      expect(r.status, origin).toBe(403);
    }
  });
});

describe("reportar · cookies del borrador", () => {
  it("al fallar: HttpOnly, SameSite=Lax, Secure, Path del formulario de ESA ficha y 120 segundos; al salir bien, Max-Age=0", async () => {
    const error = await post(conSitio, accion(), "comentario=hablé con la dueña");
    expect(error.status).toBe(303);
    const [linea] = error.headers.getSetCookie();
    const { nombre, atributos } = leerSetCookie(linea);
    expect(nombre).toBe(NOMBRE_COOKIE_BORRADOR);
    expect(atributos).toMatchObject({ httponly: "", secure: "", path: formulario(), "max-age": "120" });
    expect(atributos.samesite.toLowerCase()).toBe("lax");
    expect(atributos.domain).toBeUndefined();
    expect(error.headers.get("location")).toBe(`${formulario()}?error=motivo`);
    expect(error.headers.get("location")).not.toContain("dueña");

    const bien = await post(conSitio, accion(), "motivo=cerrado");
    const borrado = leerSetCookie(bien.headers.getSetCookie()[0]);
    expect(borrado.nombre).toBe(NOMBRE_COOKIE_BORRADOR);
    expect(borrado.valor).toBe("");
    expect(borrado.atributos["max-age"]).toBe("0");
    expect(borrado.atributos.path).toBe(formulario());
    await limpiarReportes();
  });

  it("al seguir el 303 con error se ve el aviso y el comentario de vuelta en el campo", async () => {
    const resultado = await enviarFormulario({ urlPagina: new URL(formulario(), conSitio.base).toString(), elecciones: { comentario: "hablé con la dueña" } });
    expect(resultado.final.html).toContain(ERROR_MOTIVO_REPORTE);
    expect(resultado.final.html).toMatch(/<textarea[^>]*>hablé con la dueña<\/textarea>/);
  });
});

describe("reportar · campos que intentan dictar el destino", () => {
  it("negocioId, $ACTION_1:0 y destino se ignoran: el reporte va a la ficha de la URL y el Location es su confirmación", async () => {
    await limpiarReportes();
    const cuerpo = new URLSearchParams([
      ["motivo", "cerrado"],
      ["negocioId", ids.revision],
      ["$ACTION_1:0", `["${ids.revision}"]`],
      ["destino", "https://evil.example"],
      ["destino", "//evil.example"],
    ]);
    const r = await post(conSitio, accion(), cuerpo);
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe(`${formulario()}/gracias`);
    for (const linea of r.headers.getSetCookie()) {
      const { atributos } = leerSetCookie(linea);
      expect(atributos.path).toBe(formulario());
      expect(atributos.domain).toBeUndefined();
    }
    const filas = await prisma.reporte.findMany({ where: deEstos() });
    expect(filas.filter((f) => f.negocioId !== ids.tope).map((f) => f.negocioId)).toEqual([ids.publicado]);
    await limpiarReportes();
  });

  it("un valor con ; o salto de línea no agrega atributos a la cookie", async () => {
    const r = await post(conSitio, accion(), new URLSearchParams([["comentario", "x; Domain=evil.example\r\nSet-Cookie: otra=1"]]));
    const lineas = r.headers.getSetCookie();
    expect(lineas).toHaveLength(1);
    expect(lineas[0]).not.toMatch(/evil|otra=1/i);
  });
});

describe("reportar · cuerpo desmedido", () => {
  const sieteMiB = () => Buffer.from(`motivo=cerrado&comentario=${"a".repeat(7 * 1024 * 1024)}`);

  /**
   * POST por `node:http` en un socket propio que se cierra al llegar la
   * respuesta: el servidor contesta sin leer los 7 MiB, y con el `fetch` de
   * siempre el resto de la subida dejaba ocupada la conexión compartida y
   * colgaba las pruebas siguientes (artefacto del cliente, no del sitio).
   */
  function subirSinLeer(cuerpo: Buffer, conLongitud: boolean): Promise<{ status: number; location: string | undefined; cabeceras: Headers }> {
    const destino = new URL(accion(), conSitio.base);
    return new Promise((listo, falla) => {
      const peticion = request(
        destino,
        {
          method: "POST",
          agent: false,
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            origin: conSitio.base,
            ...(conLongitud ? { "content-length": String(cuerpo.length) } : { "transfer-encoding": "chunked" }),
          },
        },
        (respuesta) => {
          const cabeceras = new Headers();
          for (const [k, v] of Object.entries(respuesta.headers)) if (typeof v === "string") cabeceras.set(k, v);
          listo({ status: respuesta.statusCode ?? 0, location: respuesta.headers.location, cabeceras });
          respuesta.resume();
          peticion.destroy();
        },
      );
      peticion.on("error", (e: NodeJS.ErrnoException) => {
        // Cerrar el socket a media subida es lo que se quiere; el resto, no.
        if (e.code !== "ECONNRESET" && e.code !== "EPIPE") falla(e);
      });
      for (let i = 0; i < cuerpo.length; i += 65_536) peticion.write(cuerpo.subarray(i, i + 65_536));
      peticion.end();
    });
  }

  it("con Content-Length: sin escribir, sin 500, 303 al formulario con ?error=servidor", async () => {
    await limpiarReportes();
    const r = await subirSinLeer(sieteMiB(), true);
    expect(r.status).toBe(303);
    expect(r.location).toBe(`${formulario()}?error=servidor`);
    lasCuatro(r.cabeceras, "7 MiB");
    expect(await cuantos()).toBe(10);
  });

  it("sin Content-Length (por trozos): lo mismo", async () => {
    const r = await subirSinLeer(sieteMiB(), false);
    expect(r.status).toBe(303);
    expect(r.location).toBe(`${formulario()}?error=servidor`);
    expect(await cuantos()).toBe(10);
  });

  it("y el servidor sigue atendiendo después", async () => {
    expect((await conSitio.pedir(formulario())).status).toBe(200);
  });
});

// ── PRG con destinos que arma el servidor ───────────────────────────────────

describe("reportar · PRG", () => {
  it("el Referer no decide nada: cuatro Referer, el mismo 303 a la confirmación", async () => {
    await limpiarReportes();
    const referers: Array<string | null> = [new URL(formulario(), conSitio.base).toString(), `${conSitio.base}/`, "https://evil.example/", null];
    for (const referer of referers) {
      const r = await post(conSitio, accion(), "motivo=cerrado", referer ? { referer } : {});
      expect(r.status, String(referer)).toBe(303);
      expect(r.headers.get("location"), String(referer)).toBe(`${formulario()}/gracias`);
      expect(r.headers.get("cache-control"), String(referer)).toBe(CACHE_DE_ACCION);
    }
    await limpiarReportes();
  });

  it("recargar la confirmación dos veces no crea otro reporte", async () => {
    await limpiarReportes();
    const resultado = await enviarFormulario({ urlPagina: new URL(formulario(), conSitio.base).toString(), elecciones: { motivo: "no_real" } });
    expect(resultado.final.html).toContain(MENSAJE_REPORTE_ENVIADO);
    for (let i = 0; i < 2; i++) expect((await conSitio.pedir(new URL(resultado.final.url).pathname)).status).toBe(200);
    expect(await prisma.reporte.count({ where: { negocioId: ids.publicado } })).toBe(1);
    await limpiarReportes();
  });
});

// ── Recorrido completo sin JavaScript ───────────────────────────────────────

describe("reportar · recorrido completo sin JS", () => {
  it("ficha → 'Reportar este negocio' → 'Ya cerró' → Enviar: 200 → 303 → 200, Origin del sitio, un solo reporte", async () => {
    await limpiarReportes();
    const ficha = await (await conSitio.pedir(`/negocio/${seg()}`)).text();
    const enlace = parse(ficha).querySelectorAll("a").find((a) => (a.getAttribute("aria-label") ?? "").startsWith("Reportar este negocio"));
    expect(enlace?.getAttribute("href")).toBe(formulario());
    const enviados: Array<Record<string, string>> = [];
    const pedir = (url: string | URL | Request, init: RequestInit = {}) => {
      enviados.push((init.headers ?? {}) as Record<string, string>);
      return fetch(url, init);
    };
    const resultado = await enviarFormulario({
      urlPagina: new URL(enlace!.getAttribute("href")!, conSitio.base).toString(),
      elecciones: { motivo: "cerrado" },
      pedir: pedir as typeof fetch,
    });
    expect(resultado.cadena.map((p) => `${p.metodo} ${p.status}`)).toEqual(["GET 200", "POST 303", "GET 200"]);
    expect(enviados[1].origin).toBe(conSitio.base);
    expect(resultado.final.html).toContain(MENSAJE_REPORTE_ENVIADO);
    expect(await prisma.reporte.count({ where: { negocioId: ids.publicado } })).toBe(1);
    await limpiarReportes();
  });
});

// ── La confirmación ──────────────────────────────────────────────────────────

describe("reportar · la confirmación", () => {
  it("igual a la de Next (normal y con segmento hostil), 200 y sin tocar la base", async () => {
    for (const variante of ["con-sitio-url", "sin-sitio-url"] as const) {
      const e = variante === "con-sitio-url" ? conSitio : sinSitio;
      for (const [nombre, ruta] of [
        ["gracias.html", `${formulario()}/gracias`],
        ["gracias-hostil.html", "/negocio/%22%3E%3Cscript%3Eficticio()%3C%2Fscript%3E/reportar/gracias"],
      ]) {
        const { diferencias, r } = await contraNext(e, variante, nombre, ruta);
        expect(diferencias, `${variante} ${nombre}`).toEqual([]);
        expect(r.status).toBe(200);
      }
    }
  });

  it("un segmento inventado responde 200 con el mismo texto (no confirma ni niega la ficha)", async () => {
    const r = await conSitio.pedir("/negocio/inventado-xyz/reportar/gracias");
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain(MENSAJE_REPORTE_ENVIADO);
    expect(html).toContain('href="/negocio/inventado-xyz"');
    expect(html).not.toContain("<form");
  });
});

// ── Cada Action corre solo por formulario y solo desde su ruta ──────────────

describe("reportar · Actions fuera de su ruta", () => {
  it("RPC cerrado: /_actions/reportar (formulario y JSON) y /_actions/inventada responden como /a/b/c", async () => {
    const referencia = await sinSitio.pedir("/a/b/c");
    const cuerpoReferencia = await referencia.text();
    const sinFecha = (h: Headers) => Object.fromEntries([...h].filter(([k]) => k !== "date"));
    const intentos = [
      post(sinSitio, "/_actions/reportar", "motivo=cerrado"),
      post(sinSitio, "/_actions/reportar", JSON.stringify({ motivo: "cerrado" }), { "content-type": "application/json" }),
      post(sinSitio, "/_actions/inventada", "motivo=cerrado"),
    ];
    for (const r of await Promise.all(intentos)) {
      expect(r.status).toBe(referencia.status);
      expect(await r.text()).toBe(cuerpoReferencia);
      expect(sinFecha(r.headers)).toEqual(sinFecha(referencia.headers));
    }
    expect(await cuantos()).toBe(10);
  });

  it("una Action pedida desde otra ruta no escribe, no es 500 y responde la página de no encontrado", async () => {
    const referencia = await (await sinSitio.pedir("/a/b/c")).text();
    for (const destino of ["/?_action=reportar", `/negocio/${seg()}?_action=reportar`]) {
      const r = await post(sinSitio, destino, "motivo=cerrado");
      expect(r.status, destino).toBe(404);
      expect(await r.text(), destino).toBe(referencia);
      lasCuatro(r, destino);
      expect(r.headers.getSetCookie(), destino).toEqual([]);
    }
    expect(await cuantos()).toBe(10);
  });
});

// ── Privacidad del log ───────────────────────────────────────────────────────

describe("reportar · el log no guarda datos del envío", () => {
  it("ni la IP, ni el comentario, ni el nombre del negocio aparecen en la consola del servidor", () => {
    for (const e of [conSitio, sinSitio, medido]) {
      const registro = e.registro();
      for (const prohibido of [IP_DE_LOS_CUPOS, "198.51.100.", "hablé con la dueña", NOMBRE, "Marcadorreporte", ids.publicado]) {
        expect(registro, prohibido).not.toContain(prohibido);
      }
    }
  });
});
