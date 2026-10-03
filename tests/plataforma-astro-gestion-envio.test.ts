/**
 * Spec `plataforma-astro` (change `migrar-enlace-gestion-astro`, T-025, Fase
 * 4). tasks.md #5: "El envío de la edición sin JavaScript se comporta igual
 * que en Next" y los MODIFIED de Actions y PRG, contra la SALIDA SERVIDA y con
 * el arnés sin JS (`scripts/enviar-formulario.mjs`):
 *
 * - la tabla de desenlaces entera contra los fixtures de Next
 *   (`tests/fixtures/next-4/con-sitio-url/respuestas.json`, misma siembra,
 *   mismos envíos de `enviosDe4`);
 * - campos prohibidos y foto fabricada (cero escrituras en el almacén);
 * - la ráfaga de cinco con PostgreSQL (con PGlite se salta con aviso);
 * - el cupo propio por el ÚLTIMO valor de `x-forwarded-for`;
 * - el guardado que falla (disparador de prueba) y la base caída (500, O1);
 * - recargar la confirmación; el `Referer` no decide; Actions fuera de ruta.
 *
 * Limpieza: las fichas de la serie y el disparador se quitan en `afterAll`
 * (`tests/gestion-astro.ts`); el disparador solo muerde un horario marcado.
 * Todo ficticio: WhatsApp 77199966xx, IPs de documentación, dominios `.example`.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import {
  NORMALIZACIONES_REGISTRO,
  compararRespuestas,
  sinDiferenciasAceptadasDeGestion,
} from "../scripts/diff-html/nucleo.mjs";
import { enviarFormulario, enviosDe4, recorrerEnvioDe4 } from "../scripts/enviar-formulario.mjs";
import type { PrismaClient } from "../src/generated/prisma/client";
import { VERSION_AVISO } from "../src/lib/legales/version";
import { ERROR_CUPO_EDICION, ERROR_GUARDAR_EDICION, MENSAJE_CAMBIOS_RECIBIDOS } from "../src/lib/gestion/textos";
import { generarTokenGestion } from "../src/lib/gestion/token";
import { MENSAJE_GRACIAS } from "../src/lib/registro/textos";
import { cabecerasDeSeguridad } from "../src/lib/seguridad/csp";
import { crearClientePrueba } from "./db";
import { urlDeLaBaseDePrueba } from "./esquemas";
import { jpegDePrueba } from "./fotos-fixtures";
import {
  type SembradoDe4,
  borrarFichasDe4,
  contextoDeEnviosDe4,
  hayFallaDeGuardado,
  instalarFallaDeGuardado,
  quitarFallaDeGuardado,
  sembrarFichasDe4,
} from "./gestion-astro";
import { type Emulador, construirSiHaceFalta, levantarEmulador } from "./salida-astro";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FIXTURES = path.join(raiz, "tests/fixtures/next-4/con-sitio-url");
const FOTOS_DIR = path.resolve(raiz, process.env.FOTOS_DIR ?? ".fotos-test");
const URL_PUBLICA = "https://enmirumbo.example";
const SERIE = "77199966";
const BASE_CAIDA = "postgresql://usuario:claveFicticia4@127.0.0.1:1/ninguna";
const ALGO_FALLO = "Algo falló de nuestro lado";

/** Igual que en `plataforma-astro-cupos`: PGlite multiplexa una sola sesión. */
async function hayBackendsIndependientes(): Promise<boolean> {
  const a = new pg.Client({ connectionString: urlDeLaBaseDePrueba() });
  const b = new pg.Client({ connectionString: urlDeLaBaseDePrueba() });
  try {
    await a.connect();
    await b.connect();
    const pidA = (await a.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    const pidB = (await b.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    return pidA !== pidB;
  } catch {
    return false;
  } finally {
    await a.end().catch(() => {});
    await b.end().catch(() => {});
  }
}

const backendsIndependientes = await hayBackendsIndependientes();
if (!backendsIndependientes) {
  console.warn("[gestión] PGlite (una sola sesión): la ráfaga de cinco envíos simultáneos se salta; corre con PostgreSQL real.");
}

let prisma: PrismaClient;
let s: SembradoDe4;
let inventado = "";
let conSitio: Emulador;
let caida: Emulador;
let categoriaId = 0;
let coloniaId = 0;

const consultar = (sql: string, params: unknown[]) => prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(sql, ...params);
const envios4 = () => contextoDeEnviosDe4(consultar, () => s, inventado);
const archivosDelAlmacen = () => (existsSync(FOTOS_DIR) ? readdirSync(FOTOS_DIR).length : 0);
const pendientesDe = (negocioId: string) => prisma.edicionPendiente.findMany({ where: { negocioId, estado: "pendiente" } });
const respuestasNext = () => JSON.parse(readFileSync(path.join(FIXTURES, "respuestas.json"), "utf8"));
const fixture = (nombre: string) => readFileSync(path.join(FIXTURES, nombre), "utf8").replace(/>\n</g, "><");
const seguridadDeNext = () => Object.fromEntries(cabecerasDeSeguridad().map(({ key, value }) => [key.toLowerCase(), value]));

/** Un envío válido de la ficha armado a mano (multipart), con `Origin` del sitio. */
function envioValido(e: Emulador, ficha: keyof SembradoDe4["tokens"], extra: Record<string, string> = {}, cabeceras: Record<string, string> = {}) {
  const cuerpo = new FormData();
  for (const [k, v] of Object.entries({
    nombre: "Cerrajería Ficticia",
    categoriaId: String(categoriaId),
    whatsapp: s.whatsapps[ficha],
    coloniaId: String(coloniaId),
    horario: "L-V 9am-5pm",
    ...extra,
  })) {
    cuerpo.append(k, v);
  }
  return e.pedir(`/editar/${s.tokens[ficha]}?_action=editar`, { method: "POST", body: cuerpo, headers: { origin: e.base, ...cabeceras } });
}

beforeAll(async () => {
  construirSiHaceFalta();
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })).id;
  coloniaId = (await prisma.colonia.findFirstOrThrow({ orderBy: { id: "asc" } })).id;
  await instalarFallaDeGuardado(consultar);
  s = await sembrarFichasDe4(consultar, { categoriaId, coloniaId, serie: SERIE });
  inventado = generarTokenGestion();
  [conSitio, caida] = await Promise.all([
    levantarEmulador({ SITIO_URL: URL_PUBLICA, FOTOS_DIR, REGISTRO_ENCABEZADO_IP: "x-forwarded-for" }),
    levantarEmulador({ SITIO_URL: URL_PUBLICA, DATABASE_URL: BASE_CAIDA }),
  ]);
}, 300_000);

afterAll(async () => {
  for (const e of [conSitio, caida]) e?.detener();
  await quitarFallaDeGuardado(consultar);
  await borrarFichasDe4(consultar, SERIE);
  expect(await hayFallaDeGuardado(consultar)).toBe(false);
  await prisma.$disconnect();
});

// ── La tabla entera contra Next ─────────────────────────────────────────────

describe("gestión · mismos desenlaces que Next (arnés sin JS contra los fixtures)", () => {
  it("cada envío: misma cadena, mismo Location, mismos avisos, errores y valores, mismo HTML re-pintado y lo mismo en la base", async () => {
    const next = respuestasNext().desenlaces;
    const { ctx, datosDeEnvios } = envios4();
    const foto = { nombre: "foto-ficticia.jpg", tipo: "image/jpeg", bytes: await jpegDePrueba(64, 48) };
    const envios = enviosDe4(datosDeEnvios(), foto);
    expect(envios.map((e) => e.nombre)).toEqual(Object.keys(next).filter((n) => n !== "recargar-gracias" && n !== "base-caida"));
    const fotosAntes = archivosDelAlmacen();
    for (const envio of envios) {
      const a = await recorrerEnvioDe4(conSitio.base, envio, ctx);
      const esperado = next[envio.nombre];
      if (envio.aceptada) {
        // La única diferencia aceptada (3a): origen ajeno o null, Next 500 y Astro 403.
        expect(esperado.post.status, envio.nombre).toBe(500);
        expect(a.post.status, envio.nombre).toBe(403);
        expect(a.base, envio.nombre).toEqual(esperado.base);
        expect(a.post["referrer-policy"], envio.nombre).toBe("strict-origin");
        continue;
      }
      expect(a.cadena, envio.nombre).toEqual(esperado.cadena);
      expect(a.avisos, envio.nombre).toEqual(esperado.avisos);
      expect(a.errores, envio.nombre).toEqual(esperado.errores);
      expect(a.valores, envio.nombre).toEqual(esperado.valores);
      expect(a.base, envio.nombre).toEqual(esperado.base);
      expect(a.post.status, envio.nombre).toBe(esperado.post.status);
      expect(a.post["cache-control"], envio.nombre).toBe(esperado.post["cache-control"]);
      expect(a.post["content-type"], envio.nombre).toBe(esperado.post["content-type"]);
      expect(a.post.cookies, envio.nombre).toBe(0);
      // Diferencia aceptada: la política del grupo en la cabecera.
      expect(esperado.post["referrer-policy"], envio.nombre).toBe("strict-origin-when-cross-origin");
      expect(a.post["referrer-policy"], envio.nombre).toBe("strict-origin");
      if (a.html) {
        const aplicadas: string[] = [];
        const aceptadas: string[] = [];
        const diferencias = compararRespuestas(
          `POST ${envio.nombre}`,
          { status: 200, headers: { ...seguridadDeNext(), "content-type": esperado.post["content-type"] ?? "", "cache-control": esperado.post["cache-control"] ?? "" }, cuerpo: fixture(`repintado-${envio.nombre}.html`) },
          { status: 200, headers: { ...seguridadDeNext(), "referrer-policy": "strict-origin", "content-type": a.post["content-type"] ?? "", "cache-control": a.post["cache-control"] ?? "" }, cuerpo: a.html },
          { dinamica: true, registro: { urlPagina: new URL("/editar/<T>", conSitio.base).toString(), aplicadas, repintada: true } },
        );
        expect(sinDiferenciasAceptadasDeGestion(diferencias, aceptadas), envio.nombre).toEqual([]);
        const conCampo = Object.keys(a.errores ?? {}).some((c) => c !== "general");
        expect(aplicadas, envio.nombre).toEqual(NORMALIZACIONES_REGISTRO.map((n) => n.id).filter((id) => conCampo || id !== "autofocus-del-primer-error"));
      }
    }
    // La foto fabricada en `campos-prohibidos` no se procesó ni se guardó.
    expect(archivosDelAlmacen()).toBe(fotosAntes);
    const gracias = `/editar/${s.tokens.publicada}/gracias`;
    for (let i = 0; i < 2; i++) expect((await conSitio.pedir(gracias)).status).toBe(200);
    expect({ ediciones: JSON.parse(ctx.anonimizar(JSON.stringify(await ctx.ediciones(s.ids.publicada)))) }).toEqual(next["recargar-gracias"].base);
  }, 180_000);
});

// ── Scenarios sueltos ───────────────────────────────────────────────────────

describe("gestión · recorrido completo sin JS", () => {
  it("200 → 303 → 200 con el mensaje, Origin del sitio, una pendiente, la ficha pública igual y recargar dos veces no crea otra", async () => {
    s = await sembrarFichasDe4(consultar, { categoriaId, coloniaId, serie: SERIE });
    const enviados: Array<Record<string, string>> = [];
    const pedir = (url: string | URL | Request, init: RequestInit = {}) => {
      enviados.push((init.headers ?? {}) as Record<string, string>);
      return fetch(url, init);
    };
    const r = await enviarFormulario({
      urlPagina: new URL(`/editar/${s.tokens.publicada}`, conSitio.base).toString(),
      elecciones: { horario: "L-D 6am-11pm", direccion: "Otra dirección ficticia" },
      cabecerasExtra: { "x-forwarded-for": "198.51.100.200" },
      pedir: pedir as typeof fetch,
    });
    expect(r.cadena.map((p) => `${p.metodo} ${p.status}`)).toEqual(["GET 200", "POST 303", "GET 200"]);
    expect(r.cadena[1].location).toBe(`/editar/${s.tokens.publicada}/gracias`);
    expect(enviados[1].origin).toBe(conSitio.base);
    // La página manda `strict-origin`: el navegador manda solo el origen.
    expect(enviados[1].referer).toBe(`${conSitio.base}/`);
    expect(r.final.html).toContain(MENSAJE_CAMBIOS_RECIBIDOS);
    expect((await pendientesDe(s.ids.publicada)).map((p) => [p.horario, p.direccion])).toEqual([["L-D 6am-11pm", "Otra dirección ficticia"]]);
    const ficha = await (await conSitio.pedir(`/negocio/x-${s.ids.publicada}`)).text();
    expect(ficha).toContain("L-S 9am-6pm");
    expect(ficha).not.toContain("L-D 6am-11pm");
    for (let i = 0; i < 2; i++) await conSitio.pedir(`/editar/${s.tokens.publicada}/gracias`);
    expect(await prisma.edicionPendiente.count({ where: { negocioId: s.ids.publicada } })).toBe(1);
  });
});

describe("gestión · campos que no le tocan y la constancia del consentimiento", () => {
  it("la pendiente es de la ficha del token y solo trae capturables; ninguna columna de ninguna ficha cambió; la otra sin pendiente; sin fotos", async () => {
    s = await sembrarFichasDe4(consultar, { categoriaId, coloniaId, serie: SERIE });
    const fichas = await prisma.negocio.findMany({ where: { whatsapp: { startsWith: SERIE } }, orderBy: { id: "asc" } });
    const fotosAntes = archivosDelAlmacen();
    const cuerpo = new FormData();
    for (const [k, v] of Object.entries({
      nombre: "Cerrajería Ficticia Envíos",
      categoriaId: String(categoriaId),
      whatsapp: s.whatsapps.envios,
      coloniaId: String(coloniaId),
      horario: "con todo de más",
      estado: "publicado",
      origen: "siembra",
      giros: "1",
      publicadoEn: "2020-01-01",
      registradoEn: "2020-01-01",
      consintioAvisoEn: "2020-01-01",
      consintioAvisoVersion: "9",
      reconsintioAvisoVersion: "9",
      consentimiento: "on",
      versionAviso: "9",
      avisoVersion: "9",
      fotoClave: "0123456789abcdef0123456789abcdef",
      tokenGestionHash: "huella-falsificada",
      numeroVerificadoEn: "2020-01-01",
      latitud: "19.8",
      longitud: "-98.9",
      negocioId: s.ids.revision,
      token: s.tokens.revision,
    })) {
      cuerpo.append(k, v);
    }
    cuerpo.append("foto", new File([new Uint8Array(await jpegDePrueba(64, 48))], "foto.jpg", { type: "image/jpeg" }));
    const r = await conSitio.pedir(`/editar/${s.tokens.envios}?_action=editar`, { method: "POST", body: cuerpo, headers: { origin: conSitio.base, "x-forwarded-for": "198.51.100.201" } });
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe(`/editar/${s.tokens.envios}/gracias`);
    expect(await prisma.negocio.findMany({ where: { whatsapp: { startsWith: SERIE } }, orderBy: { id: "asc" } })).toEqual(fichas);
    const [pendiente] = await pendientesDe(s.ids.envios);
    expect(pendiente).toMatchObject({ negocioId: s.ids.envios, horario: "con todo de más", estado: "pendiente", motivoDescarte: null, resueltaEn: null });
    expect(await prisma.edicionPendiente.count({ where: { negocioId: s.ids.revision } })).toBe(0);
    expect(archivosDelAlmacen()).toBe(fotosAntes);
    const ficha = fichas.find((f) => f.id === s.ids.envios)!;
    expect(ficha).toMatchObject({ consintioAvisoVersion: "1", reconsintioAvisoEn: null, reconsintioAvisoVersion: null, fotoClave: null });
  });
});

describe("gestión · dos envíos casi simultáneos (PostgreSQL)", () => {
  it("el motor de la suite está identificado", () => {
    expect(typeof backendsIndependientes).toBe("boolean");
  });

  it.runIf(backendsIndependientes)("dos envíos válidos simultáneos del mismo token desde IPs distintas: una pendiente, dos 303 y ningún error", async () => {
    s = await sembrarFichasDe4(consultar, { categoriaId, coloniaId, serie: SERIE });
    for (let ronda = 0; ronda < 5; ronda++) {
      const horarios = [1, 2].map((i) => `par ficticio ${ronda}-${i}`);
      const respuestas = await Promise.all(horarios.map((horario, i) => envioValido(conSitio, "publicada", { horario }, { "x-forwarded-for": `198.51.100.${170 + ronda * 2 + i}` })));
      expect(respuestas.map((r) => r.status), `ronda ${ronda}`).toEqual([303, 303]);
      const pendientes = await pendientesDe(s.ids.publicada);
      expect(pendientes, `ronda ${ronda}`).toHaveLength(1);
      expect(horarios).toContain(pendientes[0].horario);
    }
  });

  /**
   * DESVIACIÓN MEDIDA (reports/b-dev.md): con CINCO simultáneos, `guardarEdicion`
   * (`src/lib/gestion/ediciones.ts`, sin cambios en este change) reintenta UNA
   * vez ante el índice único parcial, y en la segunda vuelta vuelven a chocar:
   * 2 o 3 de los 5 responden "No pudimos guardar tus cambios…". Next de
   * `main` hace exactamente lo mismo (10 rondas: 8 con 3 y 2 con 2). Lo que
   * sí se exige aquí es lo invariante: UNA pendiente, ningún 500, ningún error
   * técnico, y cada respuesta es el 303 a su confirmación o ese mensaje.
   */
  it.runIf(backendsIndependientes)("cinco simultáneos: una pendiente, ningún 500; cada uno, 303 a su confirmación o 'No pudimos guardar tus cambios…' (como Next)", async () => {
    s = await sembrarFichasDe4(consultar, { categoriaId, coloniaId, serie: SERIE });
    const horarios = [1, 2, 3, 4, 5].map((i) => `ráfaga ficticia ${i}`);
    const respuestas = await Promise.all(horarios.map((horario, i) => envioValido(conSitio, "publicada", { horario }, { "x-forwarded-for": `198.51.100.${210 + i}` })));
    let exitos = 0;
    for (const r of respuestas) {
      expect(r.status).not.toBe(500);
      if (r.status === 303) {
        exitos += 1;
        expect(r.headers.get("location")).toBe(`/editar/${s.tokens.publicada}/gracias`);
      } else {
        expect(r.status).toBe(200);
        const html = await r.text();
        expect(html).toContain(ERROR_GUARDAR_EDICION);
        expect(html).not.toMatch(/P2002|prisma|postgres|unique/i);
      }
    }
    expect(exitos).toBeGreaterThanOrEqual(1);
    const pendientes = await pendientesDe(s.ids.publicada);
    expect(pendientes).toHaveLength(1);
    expect(horarios).toContain(pendientes[0].horario);
  });
});

describe("gestión · el cupo es propio y se lee del encabezado declarado", () => {
  it("el cuarto con el primer valor rotado vuelve con el cupo sin guardar; el registro y el reporte desde esa IP pasan", async () => {
    s = await sembrarFichasDe4(consultar, { categoriaId, coloniaId, serie: SERIE });
    const ip = "203.0.113.17";
    for (let i = 1; i <= 3; i++) {
      expect((await envioValido(conSitio, "cupo", { horario: `cupo ${i}` }, { "x-forwarded-for": `198.51.100.${220 + i}, ${ip}` })).status).toBe(303);
    }
    const cuarto = await envioValido(conSitio, "cupo", { horario: "cupo 4" }, { "x-forwarded-for": `198.51.100.224, ${ip}` });
    expect(cuarto.status).toBe(200);
    expect(await cuarto.text()).toContain(ERROR_CUPO_EDICION);
    expect((await pendientesDe(s.ids.cupo)).map((p) => p.horario)).toEqual(["cupo 3"]);
    // Un registro desde esa IP.
    const registro = new FormData();
    for (const [k, v] of Object.entries({ nombre: "Fonda Ficticia Del Cupo", categoriaId: String(categoriaId), whatsapp: `${SERIE}90`, coloniaId: String(coloniaId), consentimiento: "on", avisoVersion: VERSION_AVISO })) registro.append(k, v);
    const alta = await conSitio.pedir("/registro?_action=registrar", { method: "POST", body: registro, headers: { origin: conSitio.base, "x-forwarded-for": `198.51.100.225, ${ip}` } });
    expect(alta.status).toBe(303);
    expect(alta.headers.get("location")).toBe("/registro/gracias");
    // Un reporte desde esa IP.
    const reporte = new FormData();
    reporte.append("motivo", "cerrado");
    const reportado = await conSitio.pedir(`/negocio/x-${s.ids.publicada}/reportar?_action=reportar`, { method: "POST", body: reporte, headers: { origin: conSitio.base, "x-forwarded-for": `198.51.100.226, ${ip}` } });
    expect(reportado.status).toBe(303);
    expect(await prisma.reporte.count({ where: { negocioId: s.ids.publicada } })).toBe(1);
    expect(await getRegistro()).toBe(1);
    async function getRegistro() {
      return prisma.negocio.count({ where: { whatsapp: `${SERIE}90` } });
    }
  });
});

describe("gestión · el guardado falla y la base caída", () => {
  it("el guardado falla: 200 con el mensaje y los datos, sin detalle técnico, y la ficha sin cambios", async () => {
    s = await sembrarFichasDe4(consultar, { categoriaId, coloniaId, serie: SERIE });
    const antes = await prisma.negocio.findUniqueOrThrow({ where: { id: s.ids.falla } });
    const { datosDeEnvios } = envios4();
    const r = await envioValido(conSitio, "falla", { horario: datosDeEnvios().marcaFalla, direccion: "Capturado por el dueño" }, { "x-forwarded-for": "198.51.100.230" });
    const html = await r.text();
    expect(r.status).toBe(200);
    expect(html).toContain("No pudimos guardar tus cambios. Vuelve a intentarlo en un momento.");
    expect(html).toContain("Capturado por el dueño");
    expect(html).not.toMatch(/falla de guardado de prueba|P20|prisma|postgres|stack/i);
    expect(await prisma.negocio.findUniqueOrThrow({ where: { id: s.ids.falla } })).toEqual(antes);
    expect(await prisma.edicionPendiente.count({ where: { negocioId: s.ids.falla } })).toBe(0);
  });

  it("la base caída al enviar: 500 'Algo falló de nuestro lado', sin el token ni detalle técnico, como Next", async () => {
    const r = await envioValido(caida, "publicada", {}, { "x-forwarded-for": "198.51.100.231" });
    const html = await r.text();
    expect(r.status).toBe(500);
    expect(html).toContain(ALGO_FALLO);
    expect(html).not.toContain(s.tokens.publicada.slice(0, 8));
    expect(html).not.toMatch(/127\.0\.0\.1|ECONNREFUSED|prisma|postgres|claveFicticia4/i);
    expect(r.headers.get("referrer-policy")).toBe("strict-origin");
    const next = respuestasNext().desenlaces["base-caida"];
    expect(next.status).toBe(500);
    // Sin caché compartida en los dos. El valor exacto es el de la 500 de Astro
    // desde 3b-1 (`plataforma-astro-falla-servidor`); Next manda el de una Action.
    expect(r.headers.get("cache-control")).toBe("private, no-cache, no-store, max-age=0, must-revalidate");
    expect(next["cache-control"]).toBe("no-cache, no-store, max-age=0, must-revalidate");
  });
});

describe("gestión · MODIFIED: el Referer no decide, el error no pasa por un 303", () => {
  it("con Referer de la página, solo el origen, uno hostil y ninguno: el mismo 303 a /editar/T/gracias", async () => {
    s = await sembrarFichasDe4(consultar, { categoriaId, coloniaId, serie: SERIE });
    const variantes: Array<Record<string, string>> = [
      { referer: `${conSitio.base}/editar/${s.tokens.envios}` },
      { referer: `${conSitio.base}/` },
      { referer: "https://evil.example/" },
      {},
    ];
    for (const [i, referer] of variantes.entries()) {
      const r = await envioValido(conSitio, "envios", { horario: `referer ${i}` }, { ...referer, "x-forwarded-for": `198.51.100.${240 + i}` });
      expect(r.status, JSON.stringify(referer)).toBe(303);
      expect(r.headers.get("location"), JSON.stringify(referer)).toBe(`/editar/${s.tokens.envios}/gracias`);
    }
  });

  it("un envío con errores: 200 en la misma ruta, sin Location y sin Set-Cookie", async () => {
    const r = await envioValido(conSitio, "envios", { whatsapp: "123" }, { "x-forwarded-for": "198.51.100.245" });
    expect(r.status).toBe(200);
    expect(r.headers.get("location")).toBeNull();
    expect(r.headers.getSetCookie()).toEqual([]);
  });
});

describe("gestión · MODIFIED: la Action solo desde su ruta y nunca por RPC", () => {
  const sinFecha = (h: Headers) => Object.fromEntries([...h].filter(([n]) => !["date", "connection", "keep-alive", "transfer-encoding"].includes(n)));

  it("una edición válida desde /, /editar/T/gracias o /registro: nada se crea y nada es 500", async () => {
    s = await sembrarFichasDe4(consultar, { categoriaId, coloniaId, serie: SERIE });
    const cuerpo = () => {
      const datos = new FormData();
      for (const [k, v] of Object.entries({ nombre: "Cerrajería Ficticia", categoriaId: String(categoriaId), whatsapp: s.whatsapps.publicada, coloniaId: String(coloniaId), horario: "fuera de ruta" })) datos.append(k, v);
      return datos;
    };
    for (const ruta of ["/?_action=editar", `/editar/${s.tokens.publicada}/gracias?_action=editar`, "/registro?_action=editar"]) {
      const r = await conSitio.pedir(ruta, { method: "POST", body: cuerpo(), headers: { origin: conSitio.base } });
      expect(r.status, ruta).not.toBe(500);
      expect(r.status, ruta).not.toBe(303);
    }
    expect(await prisma.edicionPendiente.count({ where: { negocioId: s.ids.publicada } })).toBe(0);
  });

  it("POST /_actions/editar (formulario y JSON): igual que /a/b/c, sin crear nada", async () => {
    const referencia = await conSitio.pedir("/a/b/c", { method: "POST", headers: { origin: conSitio.base } });
    const cuerpoRef = await referencia.text();
    const formulario = new FormData();
    formulario.append("horario", "rpc");
    const casos: Array<[string, BodyInit, Record<string, string>]> = [
      ["/_actions/editar", formulario, {}],
      ["/_actions/editar", JSON.stringify({ horario: "rpc" }), { "content-type": "application/json" }],
      ["/_actions/inventada", "x", {}],
    ];
    for (const [ruta, body, cabeceras] of casos) {
      const r = await conSitio.pedir(ruta, { method: "POST", body, headers: { origin: conSitio.base, ...cabeceras } });
      expect(r.status, ruta).toBe(referencia.status);
      expect(await r.text(), ruta).toBe(cuerpoRef);
      expect(sinFecha(r.headers), ruta).toEqual(sinFecha(referencia.headers));
    }
    expect(await prisma.edicionPendiente.count({ where: { negocio: { whatsapp: { startsWith: SERIE } }, estado: "pendiente" } })).toBe(1);
  });
});

describe("gestión · el registro sigue igual tras el cupo de ediciones", () => {
  it("un registro válido nuevo responde su gracias de siempre", async () => {
    const registro = new FormData();
    for (const [k, v] of Object.entries({ nombre: "Fonda Ficticia Posterior", categoriaId: String(categoriaId), whatsapp: `${SERIE}91`, coloniaId: String(coloniaId), consentimiento: "on", avisoVersion: VERSION_AVISO })) registro.append(k, v);
    const r = await enviarFormulario({ urlPagina: new URL("/registro", conSitio.base).toString(), elecciones: Object.fromEntries([...registro].map(([k, v]) => [k, String(v)])), cabecerasExtra: { "x-forwarded-for": "198.51.100.250" } });
    expect(r.final.html).toContain(MENSAJE_GRACIAS);
  });
});
