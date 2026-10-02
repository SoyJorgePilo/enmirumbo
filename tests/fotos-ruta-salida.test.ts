/**
 * Spec `plataforma-astro` (change `migrar-directorio-publico-astro`, T-023,
 * Fase 2b), requirement "La ruta de fotos responde igual que en Next y no
 * expone el almacén" (design.md §3). tasks.md #4 y #7.
 *
 * Contra la SALIDA SERVIDA (build real + emulador): `/api/foto/<clave>/<variante>`
 * de Astro, con `servirFoto` sin cambios.
 *
 * El almacén: la función corre en modo desarrollo (`NODE_ENV=development`) para
 * que use el disco local de la suite (`FOTOS_DIR`). En modo producción el
 * sitio exige Supabase y no cae al disco (`src/lib/fotos/almacen.ts`); la
 * paridad de bytes contra Next en ese modo la mide el diff
 * (`scripts/diff-html.mjs`, `reports/b-dev.md`). Aquí "los bytes de Next" son
 * los guardados en el almacén: Next los servía tal cual (`servirFoto`).
 *
 * Los estados y tipos de las rutas adversariales son los MEDIDOS en la build
 * de Next de `main` (tabla `NEXT_MEDIDO`).
 */
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import type { PrismaClient } from "../src/generated/prisma/client";
import { almacenDeFotos } from "../src/lib/fotos/almacen";
import { generarClaveFoto } from "../src/lib/fotos/clave";
import { procesarFoto } from "../src/lib/fotos/procesar";
import { cabecerasDeSeguridad } from "../src/lib/seguridad/csp";
import { crearClientePrueba } from "./db";
import { jpegDePrueba } from "./fotos-fixtures";
import { type Emulador, construirSiHaceFalta, levantarEmulador } from "./salida-astro";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FOTOS_DIR = path.resolve(raiz, process.env.FOTOS_DIR ?? ".fotos-test");
const URL_PUBLICA = "https://enmirumbo.example";

let prisma: PrismaClient;
let emulador: Emulador;
let baseCaida: Emulador;
let almacenCaido: Emulador;
const claves = { publicada: "", revision: "", rechazada: "", sinArchivo: "" };
/** Un "almacén" que no se puede leer, fuera del repositorio. */
const dirRoto = mkdtempSync(path.join(tmpdir(), "enmirumbo-almacen-roto-"));
const almacenRoto = path.join(dirRoto, "no-soy-un-directorio");
const bytesGuardados: Record<string, Buffer> = {};

const WHATSAPP = ["7719996201", "7719996202", "7719996203", "7719996204"];

async function negocioConFoto(nombre: string, whatsapp: string, estado: string, guardar = true): Promise<string> {
  const categoria = await prisma.categoria.findFirstOrThrow({ where: { slug: "talleres" } });
  const clave = generarClaveFoto();
  await prisma.negocio.create({
    data: {
      nombre,
      categoriaId: categoria.id,
      whatsapp,
      estado,
      consintioAvisoEn: new Date("2026-08-01T10:00:00.000Z"),
      fotoClave: clave,
      ...(estado === "publicado" ? { publicadoEn: new Date("2026-08-02T10:00:00.000Z") } : {}),
    },
  });
  if (guardar) {
    const procesada = await procesarFoto(await jpegDePrueba(1200, 900));
    if (!procesada.ok) throw new Error(procesada.motivo);
    const almacen = almacenDeFotos();
    await almacen.guardar(clave, "tarjeta", procesada.variantes.tarjeta);
    await almacen.guardar(clave, "ficha", procesada.variantes.ficha);
    bytesGuardados[`${clave}/tarjeta`] = procesada.variantes.tarjeta;
    bytesGuardados[`${clave}/ficha`] = procesada.variantes.ficha;
  }
  return clave;
}

beforeAll(async () => {
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  await prisma.negocio.deleteMany({ where: { whatsapp: { in: WHATSAPP } } });
  claves.publicada = await negocioConFoto("Taller Fotoruta Publicado (ficticio)", WHATSAPP[0], "publicado");
  claves.revision = await negocioConFoto("Taller Fotoruta Revisión (ficticio)", WHATSAPP[1], "en_revision");
  claves.rechazada = await negocioConFoto("Taller Fotoruta Rechazado (ficticio)", WHATSAPP[2], "rechazado");
  claves.sinArchivo = await negocioConFoto("Taller Fotoruta Sin Archivo (ficticio)", WHATSAPP[3], "publicado", false);

  // Un "almacén" que no se puede leer: un archivo donde debería haber un directorio.
  writeFileSync(almacenRoto, "no soy un directorio");

  construirSiHaceFalta();
  const comun = { NODE_ENV: "development", SITIO_URL: URL_PUBLICA };
  emulador = await levantarEmulador({ ...comun, FOTOS_DIR });
  baseCaida = await levantarEmulador({ ...comun, FOTOS_DIR, DATABASE_URL: "postgresql://usuario:claveFicticia@127.0.0.1:1/ninguna" });
  almacenCaido = await levantarEmulador({ ...comun, FOTOS_DIR: almacenRoto });
}, 240_000);

afterAll(async () => {
  emulador?.detener();
  baseCaida?.detener();
  almacenCaido?.detener();
  await prisma?.negocio.deleteMany({ where: { whatsapp: { in: WHATSAPP } } });
  await prisma?.$disconnect();
  rmSync(dirRoto, { recursive: true, force: true });
});

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const foto = (clave: string, variante: string) => `/api/foto/${clave}/${variante}`;

function lasCuatro(r: Response, etiqueta: string) {
  for (const { key, value } of cabecerasDeSeguridad()) expect(r.headers.get(key), `${etiqueta} · ${key}`).toBe(value);
  expect(r.headers.get("x-powered-by"), etiqueta).toBeNull();
}

/** Lo observable de un 404, sin la fecha. */
async function huella(r: Response) {
  return {
    status: r.status,
    cabeceras: [...r.headers.entries()].filter(([n]) => n !== "date").sort(),
    cuerpo: Buffer.from(await r.arrayBuffer()).toString("hex"),
  };
}

describe("fotos en la salida · foto publicada idéntica", () => {
  for (const variante of ["tarjeta", "ficha"]) {
    it(`${variante}: 200, los mismos bytes que el almacén, webp, tamaño y caché de Next`, async () => {
      const r = await emulador.pedir(foto(claves.publicada, variante));
      expect(r.status).toBe(200);
      const cuerpo = new Uint8Array(await r.arrayBuffer());
      expect(sha256(cuerpo)).toBe(sha256(bytesGuardados[`${claves.publicada}/${variante}`]));
      expect(r.headers.get("content-type")).toBe("image/webp");
      expect(r.headers.get("content-length")).toBe(String(cuerpo.length));
      expect(r.headers.get("cache-control")).toBe("private, max-age=3600");
      lasCuatro(r, variante);
      // Sin metadatos EXIF: los bytes son los de `procesarFoto`, que los quita.
      expect(Buffer.from(cuerpo).includes(Buffer.from("EXIF"))).toBe(false);
      expect(Buffer.from(cuerpo).includes(Buffer.from("Exif"))).toBe(false);
    });
  }

  it("HEAD responde como GET, sin cuerpo (como Next)", async () => {
    const r = await emulador.pedir(foto(claves.publicada, "ficha"), { method: "HEAD" });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/webp");
    expect(r.headers.get("cache-control")).toBe("private, max-age=3600");
    expect((await r.arrayBuffer()).byteLength).toBe(0);
    lasCuatro(r, "HEAD");
  });
});

describe("fotos en la salida · los cuatro 404 son el mismo", () => {
  it("en revisión, rechazado, clave inventada y variante original: 404 vacío, no-store, idénticos", async () => {
    const rutas = [
      foto(claves.revision, "ficha"),
      foto(claves.rechazada, "ficha"),
      foto("0123456789abcdef0123456789abcdef", "ficha"),
      foto(claves.publicada, "original"),
      // Y los que la spec también declara indistinguibles.
      foto(claves.sinArchivo, "ficha"),
      foto(claves.publicada, "inexistente"),
    ];
    const huellas = [];
    for (const ruta of rutas) {
      const r = await emulador.pedir(ruta);
      lasCuatro(r, ruta);
      expect(r.headers.get("cache-control"), ruta).toBe("no-store");
      expect(r.headers.get("content-type"), ruta).toBeNull();
      const h = await huella(r);
      expect(h.status, ruta).toBe(404);
      expect(h.cuerpo, ruta).toBe("");
      huellas.push(h);
    }
    for (const h of huellas.slice(1)) expect(h).toEqual(huellas[0]);
  });
});

/**
 * Lo que respondió la build de Next de `main` a cada ruta (medido con la base
 * del diff; `reports/b-dev.md`). `tipo: ""` = sin `Content-Type` (el 404
 * vacío de `servirFoto`); `text/html` = la 404 global del sitio.
 */
const NEXT_MEDIDO: Array<{ ruta: (c: typeof claves) => string; init?: RequestInit; status: number; tipo: string }> = [
  { ruta: () => "/api/foto/..%2F..%2Fpackage.json/ficha", status: 404, tipo: "" },
  { ruta: (c) => `/api/foto/${c.publicada}%2Fficha/ficha`, status: 404, tipo: "" },
  { ruta: (c) => `/api/foto/${c.publicada}%00/ficha`, status: 404, tipo: "" },
  { ruta: (c) => `/api/foto/${c.publicada}/..%2F..%2Fpackage.json`, status: 404, tipo: "" },
  { ruta: (c) => `/api/foto/${c.publicada.toUpperCase()}/ficha`, status: 404, tipo: "" },
  { ruta: (c) => `/api/foto/${c.publicada}/FICHA`, status: 404, tipo: "" },
  { ruta: (c) => foto(c.revision, "tarjeta"), status: 404, tipo: "" },
  // `fetch` normaliza `%2e%2e` a `..`: llega como `/api/ficha`, que no es ninguna ruta.
  { ruta: () => "/api/foto/%2e%2e/ficha", status: 404, tipo: "text/html; charset=utf-8" },
  { ruta: (c) => `/api/foto/${c.publicada}/ficha/extra`, status: 404, tipo: "text/html; charset=utf-8" },
  { ruta: () => "/api/foto", status: 404, tipo: "text/html; charset=utf-8" },
  // Con `Origin` del propio sitio (un navegador lo manda); sin él, ver la
  // prueba "[T-024] POST sin Origin" abajo.
  { ruta: (c) => foto(c.publicada, "ficha"), init: { method: "POST", headers: { origin: "MISMO" } }, status: 405, tipo: "" },
  { ruta: (c) => foto(c.publicada, "ficha"), init: { method: "DELETE", headers: { origin: "MISMO" } }, status: 405, tipo: "" },
  { ruta: (c) => foto(c.publicada, "ficha"), init: { method: "OPTIONS" }, status: 204, tipo: "" },
];

/** `origin: "MISMO"` → el origen del emulador. */
function conOrigen(init: RequestInit | undefined): RequestInit | undefined {
  const cabeceras = init?.headers as Record<string, string> | undefined;
  if (cabeceras?.origin !== "MISMO") return init;
  return { ...init, headers: { ...cabeceras, origin: emulador.base } };
}

describe("fotos en la salida · rutas adversariales", () => {
  it("ninguna responde 200 ni un byte de imagen o de un archivo del servidor; estado y tipo como Next", async () => {
    for (const { ruta, init, status, tipo } of NEXT_MEDIDO) {
      const url = ruta(claves);
      const etiqueta = `${init?.method ?? "GET"} ${url}`;
      const r = await emulador.pedir(url, conOrigen(init));
      const cuerpo = Buffer.from(await r.arrayBuffer());
      expect(r.status, etiqueta).toBe(status);
      expect(r.headers.get("content-type") ?? "", etiqueta).toBe(tipo);
      expect(cuerpo.includes(Buffer.from("RIFF")), etiqueta).toBe(false);
      expect(cuerpo.includes(Buffer.from("WEBP")), etiqueta).toBe(false);
      expect(cuerpo.toString(), etiqueta).not.toMatch(/"dependencies"|"devDependencies"|DATABASE_URL/);
      lasCuatro(r, etiqueta);
    }
  });

  // Brecha de 2a (c-seguridad obs. 1), cerrada en T-024: `checkOrigin` está
  // apagado y la regla del middleware deja pasar un POST sin `Origin`, como
  // Next, que respondía 405.
  it("[T-024] POST sin Origin responde como Next (405 con las cuatro)", async () => {
    const r = await emulador.pedir(foto(claves.publicada, "ficha"), { method: "POST" });
    expect(r.status).toBe(405);
    lasCuatro(r, "POST sin Origin");
  });

  it("OPTIONS anuncia los mismos métodos que Next", async () => {
    const r = await emulador.pedir(foto(claves.publicada, "ficha"), { method: "OPTIONS" });
    expect(r.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
  });
});

describe("fotos en la salida · fallas y el bucket", () => {
  it("con la base caída: el mismo 404 vacío, no una página de error, y el log no trae la clave", async () => {
    const r = await baseCaida.pedir(foto(claves.publicada, "ficha"));
    const referencia = await huella(await emulador.pedir(foto(claves.revision, "ficha")));
    expect(await huella(r)).toEqual(referencia);
    expect(baseCaida.registro()).not.toContain(claves.publicada);
    expect(baseCaida.registro()).not.toContain("claveFicticia");
  });

  it("con el almacén caído: el mismo 404 vacío, y el log no trae la clave ni la ruta del almacén", async () => {
    const r = await almacenCaido.pedir(foto(claves.publicada, "ficha"));
    const referencia = await huella(await emulador.pedir(foto(claves.revision, "ficha")));
    expect(await huella(r)).toEqual(referencia);
    expect(almacenCaido.registro()).not.toContain(claves.publicada);
    expect(almacenCaido.registro()).not.toContain("no-soy-un-directorio");
    expect(almacenCaido.registro()).not.toContain(dirRoto);
  });

  it("ninguna respuesta trae Location, el dominio del almacenamiento ni una firma", async () => {
    const rutas = [foto(claves.publicada, "ficha"), foto(claves.revision, "ficha"), foto("0123456789abcdef0123456789abcdef", "tarjeta")];
    for (const ruta of rutas) {
      const r = await emulador.pedir(ruta);
      expect(r.headers.get("location"), ruta).toBeNull();
      const todo = `${JSON.stringify([...r.headers.entries()])}${Buffer.from(await r.arrayBuffer()).toString("latin1")}`;
      expect(todo, ruta).not.toMatch(/supabase|storage\/v1|token=|X-Amz-Signature|\.fotos-test/i);
    }
  });

  it("los bytes guardados no se tocaron (el endpoint no reprocesa)", () => {
    const enDisco = readFileSync(path.join(FOTOS_DIR, `${claves.publicada}.ficha.webp`));
    expect(sha256(enDisco)).toBe(sha256(bytesGuardados[`${claves.publicada}/ficha`]));
  });
});
