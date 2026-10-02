/**
 * Spec `plataforma-astro` (change `migrar-registro-astro`, Fase 3b-1),
 * tasks.md #5: la foto en la función de Astro, los cupos por IP y la carrera
 * por el mismo número, contra la SALIDA SERVIDA. Es la primera vez que una
 * ruta de Astro carga `sharp`: se exige que viaje en la función y que una foto
 * de verdad (generada aquí, con EXIF y GPS inventados) salga en sus dos
 * variantes, sin metadatos.
 *
 * Las fotos se generan en la prueba; el repositorio no lleva ninguna. Todo
 * ficticio: WhatsApp 77199984xx, IPs de documentación (RFC 5737).
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import pg from "pg";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { enviarFormulario, erroresDelFormulario, valoresDelFormulario } from "../scripts/enviar-formulario.mjs";
import type { PrismaClient } from "../src/generated/prisma/client";
import { construirSegmentoFicha } from "../src/lib/ficha-url";
import { nombreDeObjeto } from "../src/lib/fotos/almacen";
import { PARAMETROS_VARIANTES } from "../src/lib/fotos/limites";
import { MAXIMO_FOTOS_EN_PROCESO } from "../src/lib/fotos/semaforo";
import { VERSION_AVISO } from "../src/lib/legales/version";
import { MENSAJES_ERROR_FOTO, MENSAJES_ERROR_REGISTRO, MENSAJE_GRACIAS } from "../src/lib/registro/textos";
import { crearClientePrueba } from "./db";
import { urlDeLaBaseDePrueba } from "./esquemas";
import { bytesDeRelleno, htmlDisfrazadoDeJpg, jpegDePrueba, pngBombaDePixeles, svgDePrueba } from "./fotos-fixtures";
import { borrarNegociosSembrados } from "./limpieza";
import { type Emulador, construirSiHaceFalta, levantarEmulador } from "./salida-astro";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FOTOS_DIR = path.resolve(raiz, process.env.FOTOS_DIR ?? ".fotos-test");
const FUNCION = path.join(raiz, ".vercel/output/functions/_render.func");
const WHATSAPP = Array.from({ length: 40 }, (_, i) => `77199984${String(i).padStart(2, "0")}`);
const PUBLICADO = WHATSAPP[39];

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
  console.warn(
    "[registro-fotos] la base de esta corrida multiplexa todas las conexiones sobre un solo backend " +
      "(`npx prisma dev`): la carrera por el mismo número sobre la build se salta aquí y corre en el CI, " +
      "contra el servicio postgres:17.",
  );
}

let prisma: PrismaClient;
let emulador: Emulador;
let categoriaId = 0;
let coloniaId = 0;
let idPublicado = "";

const valido = (whatsapp: string, extra: Record<string, string> = {}) => ({
  nombre: "Taller Ficticio De Fotos",
  categoriaId: String(categoriaId),
  whatsapp,
  coloniaId: String(coloniaId),
  consentimiento: "on",
  ...extra,
});

type Archivo = { nombre: string; tipo: string; bytes: Buffer };
const archivo = (bytes: Buffer, nombre = "foto.jpg", tipo = "image/jpeg"): Archivo => ({ nombre, tipo, bytes });

function registrar(whatsapp: string, foto?: Archivo, cabeceras: Record<string, string> = {}, extra: Record<string, string> = {}) {
  return enviarFormulario({
    urlPagina: new URL("/registro", emulador.base).toString(),
    elecciones: valido(whatsapp, extra),
    archivos: foto ? { foto } : {},
    cabecerasExtra: cabeceras,
  });
}

/** Archivos del almacén de pruebas (sin subcarpetas). */
const archivosDelAlmacen = () => (existsSync(FOTOS_DIR) ? readdirSync(FOTOS_DIR).filter((n) => statSync(path.join(FOTOS_DIR, n)).isFile()) : []);

/** Las claves de foto de las fichas de este archivo. */
async function clavesDeEsteArchivo(): Promise<string[]> {
  const filas = await prisma.negocio.findMany({ where: { whatsapp: { in: WHATSAPP } }, select: { fotoClave: true } });
  return filas.map((f) => f.fotoClave).filter((c): c is string => Boolean(c));
}

/** JPEG de ~3 MB con EXIF de cámara y coordenadas GPS INVENTADAS. */
function jpegRealConGps(): Promise<Buffer> {
  return sharp({ create: { width: 2600, height: 1950, channels: 3, background: { r: 190, g: 150, b: 90 }, noise: { type: "gaussian", mean: 128, sigma: 60 } } })
    .withExif({
      IFD0: { Make: "MarcaFicticia", Model: "ModeloDeMentiras", DateTime: "2026:09:01 12:00:00" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "19/1 50/1 12/1", GPSLongitudeRef: "W", GPSLongitude: "98/1 58/1 54/1" },
    })
    .jpeg({ quality: 85 })
    .toBuffer();
}

beforeAll(async () => {
  construirSiHaceFalta();
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  await borrarNegociosSembrados(prisma, WHATSAPP);
  categoriaId = (await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })).id;
  coloniaId = (await prisma.colonia.findFirstOrThrow({ orderBy: { id: "asc" } })).id;
  idPublicado = (
    await prisma.negocio.create({
      data: { nombre: "Taller Ficticio Reportable", categoriaId, whatsapp: PUBLICADO, estado: "publicado", publicadoEn: new Date(), consintioAvisoEn: new Date() },
    })
  ).id;
  emulador = await levantarEmulador({ NODE_ENV: "development", SITIO_URL: "https://enmirumbo.example", FOTOS_DIR, REGISTRO_ENCABEZADO_IP: "x-forwarded-for" });
}, 300_000);

afterAll(async () => {
  emulador?.detener();
  await borrarNegociosSembrados(prisma, WHATSAPP);
  await prisma.$disconnect();
});

describe("registro-fotos · sharp viaja en la función", () => {
  it("la salida trae sharp y al menos un binario de plataforma (.node) dentro de _render.func", () => {
    expect(existsSync(path.join(FUNCION, "node_modules/sharp/package.json"))).toBe(true);
    const img = path.join(FUNCION, "node_modules/@img");
    const binarios = existsSync(img)
      ? readdirSync(img)
          .filter((n) => n.startsWith("sharp-"))
          .flatMap((n) => {
            const lib = path.join(img, n, "lib");
            return existsSync(lib) ? readdirSync(lib).filter((f) => f.endsWith(".node")) : [];
          })
      : [];
    expect(binarios.length).toBeGreaterThan(0);
  });
});

describe("registro-fotos · foto real con GPS", () => {
  it("una foto de ~3 MB con EXIF: clave del servidor y dos variantes WebP en su tamaño, sin metadatos y sin original", async () => {
    const bytes = await jpegRealConGps();
    expect(bytes.length).toBeGreaterThan(3 * 1024 * 1024);
    expect(bytes.length).toBeLessThan(5 * 1024 * 1024);
    expect((await sharp(bytes).metadata()).exif).toBeDefined();
    const antes = new Set(archivosDelAlmacen());

    const r = await registrar(WHATSAPP[0], archivo(bytes, "IMG_0001.jpg"));
    expect(r.cadena.map((p) => p.status)).toEqual([200, 303, 200]);
    expect(r.final.html).toContain(MENSAJE_GRACIAS);

    const ficha = await prisma.negocio.findUniqueOrThrow({ where: { whatsapp: WHATSAPP[0] } });
    expect(ficha.fotoClave).toMatch(/^[0-9a-f]{32}$/);
    const nuevos = archivosDelAlmacen().filter((n) => !antes.has(n)).sort();
    expect(nuevos).toEqual([nombreDeObjeto(ficha.fotoClave!, "ficha"), nombreDeObjeto(ficha.fotoClave!, "tarjeta")].sort());
    for (const variante of ["tarjeta", "ficha"] as const) {
      const guardado = path.join(FOTOS_DIR, nombreDeObjeto(ficha.fotoClave!, variante));
      const meta = await sharp(guardado).metadata();
      expect(meta.format, variante).toBe("webp");
      expect(Math.max(meta.width ?? 0, meta.height ?? 0), variante).toBeLessThanOrEqual(PARAMETROS_VARIANTES[variante].ladoMayor);
      expect(statSync(guardado).size, variante).toBeLessThanOrEqual(PARAMETROS_VARIANTES[variante].pesoMaximo);
      expect(meta.exif, variante).toBeUndefined();
      expect(meta.xmp, variante).toBeUndefined();
      expect(meta.icc, variante).toBeUndefined();
    }
    // Ni el nombre del archivo ni el original llegan a ninguna parte.
    expect(nuevos.join(" ")).not.toMatch(/IMG_0001|original/);
  }, 60_000);
});

describe("registro-fotos · fotos que no pasan", () => {
  it("HTML llamado foto.jpg, SVG y PNG de 100 MP: el mensaje de la foto, con lo capturado, sin ficha ni archivos", async () => {
    const antes = archivosDelAlmacen().length;
    const casos: Array<[string, Archivo]> = [
      ["html", archivo(htmlDisfrazadoDeJpg(), "foto.jpg")],
      ["svg", archivo(svgDePrueba(), "foto.svg", "image/svg+xml")],
      ["png-100mp", archivo(pngBombaDePixeles(10_000, 10_000), "bomba.png", "image/png")],
    ];
    for (const [i, [nombre, foto]] of casos.entries()) {
      const r = await registrar(WHATSAPP[1 + i], foto, { "x-forwarded-for": `198.51.100.${30 + i}` });
      expect(r.cadena.map((p) => p.status), nombre).toEqual([200, 200]);
      expect(erroresDelFormulario(r.final.html), nombre).toEqual({ foto: MENSAJES_ERROR_FOTO.noEsImagen });
      expect(valoresDelFormulario(r.final.html, emulador.base).whatsapp, nombre).toBe(WHATSAPP[1 + i]);
      expect(await prisma.negocio.count({ where: { whatsapp: WHATSAPP[1 + i] } }), nombre).toBe(0);
    }
    expect(archivosDelAlmacen().length).toBe(antes);
  });

  it("el campo trampa con una foto de 5 MB llega a gracias, sin ficha, sin archivos", async () => {
    const antes = archivosDelAlmacen().length;
    const r = await registrar(WHATSAPP[5], archivo(bytesDeRelleno(5 * 1024 * 1024)), {}, { sitio_web: "http://spam.example" });
    expect(r.cadena.map((p) => p.status)).toEqual([200, 303, 200]);
    expect(r.final.html).toContain(MENSAJE_GRACIAS);
    expect(await prisma.negocio.count({ where: { whatsapp: WHATSAPP[5] } })).toBe(0);
    expect(archivosDelAlmacen().length).toBe(antes);
  });

  it("varios archivos en el campo: una sola foto por ficha (la primera con contenido)", async () => {
    const antes = new Set(archivosDelAlmacen());
    const r = await enviarFormulario({
      urlPagina: new URL("/registro", emulador.base).toString(),
      elecciones: valido(WHATSAPP[6]),
      archivos: { foto: [archivo(await jpegDePrueba(320, 240), "a.jpg"), archivo(await jpegDePrueba(640, 480), "b.jpg")] },
      cabecerasExtra: { "x-forwarded-for": "198.51.100.36" },
    });
    expect(r.cadena.map((p) => p.status)).toEqual([200, 303, 200]);
    const ficha = await prisma.negocio.findUniqueOrThrow({ where: { whatsapp: WHATSAPP[6] } });
    expect(archivosDelAlmacen().filter((n) => !antes.has(n))).toHaveLength(2);
    expect((await sharp(path.join(FOTOS_DIR, nombreDeObjeto(ficha.fotoClave!, "ficha"))).metadata()).width).toBe(320);
  });
});

describe("registro-fotos · muchas fotos a la vez", () => {
  it(`más envíos con foto que los ${MAXIMO_FOTOS_EN_PROCESO} que se abren a la vez: los que caben se registran, el resto ve el aviso con lo capturado, y no queda ningún archivo sin ficha`, async () => {
    const foto = archivo(await jpegRealConGps(), "grande.jpg");
    const antes = new Set(archivosDelAlmacen());
    const simultaneos = 6;
    const resultados = await Promise.all(
      Array.from({ length: simultaneos }, (_, i) => registrar(WHATSAPP[10 + i], foto, { "x-forwarded-for": `198.51.100.${40 + i}` })),
    );
    const aceptados = resultados.filter((r) => r.cadena[1].status === 303);
    const ocupados = resultados.filter((r) => r.cadena[1].status === 200);
    expect(aceptados.length + ocupados.length).toBe(simultaneos);
    expect(aceptados.length).toBeGreaterThanOrEqual(1);
    expect(ocupados.length).toBeGreaterThanOrEqual(1);
    for (const r of ocupados) {
      expect(erroresDelFormulario(r.final.html)).toEqual({ foto: MENSAJES_ERROR_FOTO.servidorOcupado });
      expect(valoresDelFormulario(r.final.html, emulador.base).nombre).toBe("Taller Ficticio De Fotos");
    }
    for (const r of resultados) expect(r.cadena.map((p) => p.status)).not.toContain(500);
    const conFoto = await prisma.negocio.count({ where: { whatsapp: { in: WHATSAPP.slice(10, 10 + simultaneos) }, fotoClave: { not: null } } });
    expect(conFoto).toBe(aceptados.length);
    // Cada archivo que dejó esta ráfaga tiene su ficha: dos por aceptado, ninguno huérfano.
    const claves = new Set(await clavesDeEsteArchivo());
    const nuevos = archivosDelAlmacen().filter((n) => !antes.has(n));
    expect(nuevos).toHaveLength(2 * aceptados.length);
    expect(nuevos.filter((n) => !claves.has(n.split(".")[0]))).toEqual([]);
  }, 120_000);
});

describe("registro-fotos · el cupo por IP se lee del encabezado declarado", () => {
  it("rotar el primer valor de x-forwarded-for no evade el cupo, y agotarlo no impide reportar desde la misma IP", async () => {
    for (let i = 0; i < 3; i++) {
      const r = await registrar(WHATSAPP[20 + i], undefined, { "x-forwarded-for": `198.51.100.${60 + i}, 203.0.113.7` });
      expect(r.cadena[1].status, `envío ${i + 1}`).toBe(303);
    }
    const cuarto = await registrar(WHATSAPP[23], undefined, { "x-forwarded-for": "198.51.100.99, 203.0.113.7" });
    expect(cuarto.cadena[1].status).toBe(200);
    expect(erroresDelFormulario(cuarto.final.html)).toEqual({ general: MENSAJES_ERROR_REGISTRO.limiteIp });
    expect(await prisma.negocio.count({ where: { whatsapp: WHATSAPP[23] } })).toBe(0);

    // Los cupos de registro y de reportes son distintos.
    const reporte = await emulador.pedir(`/negocio/${construirSegmentoFicha("Taller Ficticio Reportable", idPublicado)}/reportar?_action=reportar`, {
      method: "POST",
      body: "motivo=cerrado",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: emulador.base, "x-forwarded-for": "198.51.100.98, 203.0.113.7" },
    });
    expect(reporte.status).toBe(303);
    expect(reporte.headers.get("location")).toMatch(/\/reportar\/gracias$/);
    expect(await prisma.reporte.count({ where: { negocioId: idPublicado } })).toBe(1);
  });
});

describe("registro-fotos · carrera por el mismo número sobre la build", () => {
  it("la corrida sabe si puede probar concurrencia de verdad (y lo dice si no)", () => {
    expect(typeof backendsIndependientes).toBe("boolean");
  });

  it.runIf(backendsIndependientes)("dos registros simultáneos con el mismo WhatsApp y foto: una ficha, el otro ve 'número ya registrado', sin 500 ni archivos huérfanos", async () => {
    const foto = archivo(await jpegDePrueba(1600, 1200));
    const antes = new Set(archivosDelAlmacen());
    const [a, b] = await Promise.all([
      registrar(WHATSAPP[30], foto, { "x-forwarded-for": "198.51.100.80" }),
      registrar(WHATSAPP[30], foto, { "x-forwarded-for": "198.51.100.81" }),
    ]);
    const estados = [a, b].map((r) => r.cadena[1].status).sort();
    expect(estados).toEqual([200, 303]);
    const perdedor = [a, b].find((r) => r.cadena[1].status === 200)!;
    expect(erroresDelFormulario(perdedor.final.html)).toMatchObject({ whatsapp: MENSAJES_ERROR_REGISTRO.whatsappDuplicado });
    expect(await prisma.negocio.count({ where: { whatsapp: WHATSAPP[30] } })).toBe(1);
    const ficha = await prisma.negocio.findUniqueOrThrow({ where: { whatsapp: WHATSAPP[30] } });
    expect(archivosDelAlmacen().filter((n) => !antes.has(n)).sort()).toEqual(
      [nombreDeObjeto(ficha.fotoClave!, "ficha"), nombreDeObjeto(ficha.fotoClave!, "tarjeta")].sort(),
    );
    expect(VERSION_AVISO).toBe(ficha.consintioAvisoVersion);
  }, 60_000);
});
