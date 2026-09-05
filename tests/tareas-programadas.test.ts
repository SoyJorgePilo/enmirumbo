import { readFileSync } from "node:fs";
import { mkdir, rm, utimes, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { GET as barrerFotosHuerfanasRuta } from "../src/app/api/tareas/barrer-fotos-huerfanas/route";
import type { PrismaClient } from "../src/generated/prisma/client";
import { directorioDeFotos } from "../src/lib/fotos/almacen";
import { generarClaveFoto } from "../src/lib/fotos/clave";
import { crearClientePrueba } from "./db";

/**
 * Spec `despliegue` · Requirement "El barrido de fotos huérfanas también corre
 * solo, y se nota cuando no barre" (encargo del orquestador sobre el change
 * `preparar-deploy-produccion`).
 *
 * El barrido en sí ya tiene su suite (`tests/fotos-huerfanas.test.ts`). Aquí
 * se prueba SOLO la puerta y —lo que motivó el encargo— que un barrido que NO
 * se hizo se note: si respondiera 200, el programador de tareas lo daría por
 * bueno y las fotos huérfanas se acumularían en silencio para siempre.
 *
 * Datos 100% ficticios (repo público + LFPDPPP): serie 771999 4xxx.
 */

const PREFIJO = "7719994";
const SECRETO = "otro-secreto-de-pruebas-que-no-sirve-en-ningun-lado";

let prisma: PrismaClient;
let categoriaId: number;

const pedir = (encabezados: Record<string, string> = {}) =>
  barrerFotosHuerfanasRuta(
    new Request("https://enmirumbo.example/api/tareas/barrer-fotos-huerfanas", {
      headers: encabezados,
    }),
  );

/**
 * Deja en el almacén una foto que no es de ninguna ficha, con fecha vieja: el
 * barrido no juzga archivos recién escritos (podrían ser un alta en curso), y
 * la ruta no recibe "ahora" de nadie porque en producción tampoco lo recibe.
 */
async function fotoHuerfana(): Promise<string> {
  const clave = generarClaveFoto();
  const directorio = directorioDeFotos();
  await mkdir(directorio, { recursive: true });
  const archivo = path.join(directorio, `${clave}.tarjeta.webp`);
  await writeFile(archivo, "bytes de mentiras");
  const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000);
  await utimes(archivo, haceUnaHora, haceUnaHora);
  return clave;
}

beforeAll(async () => {
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (
    await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })
  ).id;
});

afterAll(async () => {
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  await rm(directorioDeFotos(), { recursive: true, force: true });
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.CRON_SECRET;
});

describe("tareas · la puerta del barrido de fotos huérfanas", () => {
  it.each([
    ["sin secreto configurado", undefined, `Bearer ${SECRETO}`],
    ["sin encabezado", SECRETO, undefined],
    ["con el secreto equivocado", SECRETO, "Bearer otra-cosa"],
    ["sin el prefijo Bearer", SECRETO, SECRETO],
  ])("%s responde como una ruta que no existe", async (_caso, configurado, encabezado) => {
    if (configurado) process.env.CRON_SECRET = configurado;
    // ITERACIÓN 2 (hallazgo M1): la ruta ya no fabrica un 404 propio de texto
    // plano —que la delataba frente a cualquier dirección inventada— sino que
    // delega en `notFound()`, que lanza y sirve LA página 404 del sitio.
    await expect(pedir(encabezado ? { authorization: encabezado } : {})).rejects.toThrow(
      /NEXT_HTTP_ERROR_FALLBACK;404/,
    );
  });

  it("con el secreto correcto barre y responde 200 con puros conteos", async () => {
    process.env.CRON_SECRET = SECRETO;
    // Con la base poblada, la salvaguarda de "base plausible" no salta.
    await prisma.negocio.create({
      data: {
        nombre: "Taller Ficticio con Ficha",
        categoriaId,
        whatsapp: `${PREFIJO}001`,
        consintioAvisoEn: new Date(),
      },
    });

    const respuesta = await pedir({ authorization: `Bearer ${SECRETO}` });

    expect(respuesta.status).toBe(200);
    const cuerpo = (await respuesta.json()) as Record<string, unknown>;
    expect(cuerpo.barrido).toBe(true);
    // Ni una clave de foto: una clave es la dirección de un archivo con la
    // cara del negocio de alguien.
    expect(Object.keys(cuerpo).sort()).toEqual(
      [
        "barrido",
        "borradas",
        "enPeriodoDeGracia",
        "huerfanas",
        "ignoradas",
        "noBorrables",
        "revisadas",
      ].sort(),
    );
  });

  /**
   * EL PUNTO DEL ENCARGO. Con la base vacía y fotos en el almacén, la
   * salvaguarda de "base plausible" detiene el barrido: casi seguro se está
   * apuntando a la base equivocada. El comando de consola lo dice con
   * `process.exitCode = 1`; por HTTP tiene que decirlo con un código de error,
   * o nadie se entera nunca.
   */
  it("si una salvaguarda detiene el barrido, la respuesta NO es 200", async () => {
    process.env.CRON_SECRET = SECRETO;
    await fotoHuerfana();
    expect(await prisma.negocio.count()).toBe(0);

    const respuesta = await pedir({ authorization: `Bearer ${SECRETO}` });

    expect(respuesta.status).toBe(500);
    expect(((await respuesta.json()) as { barrido: boolean }).barrido).toBe(false);
  });

  it("y lo deja en el log como error, no como una nota al pie", async () => {
    process.env.CRON_SECRET = SECRETO;
    await fotoHuerfana();
    const errores = vi.spyOn(console, "error").mockImplementation(() => {});

    await pedir({ authorization: `Bearer ${SECRETO}` });

    expect(errores.mock.calls.flat().join(" ")).toContain("DETENIDO");
  });

  it("la respuesta pide que no se indexe", async () => {
    process.env.CRON_SECRET = SECRETO;
    const respuesta = await pedir({ authorization: `Bearer ${SECRETO}` });
    expect(respuesta.headers.get("X-Robots-Tag")).toContain("noindex");
  });
});

// ── El 404 no delata la ruta (hallazgo M1 de la etapa C) ────────────────────

describe("tareas · el 404 de una tarea no se distingue del de las demás rutas", () => {
  /**
   * MEDIDO CONTRA EL SITIO SERVIDO, y por eso vale la pena escribirlo: el
   * marco devuelve dos 404 distintos.
   *
   *   dirección inexistente          → 11 090 bytes de HTML, `text/html`
   *   ruta que existe y no encuentra → 0 bytes, sin `content-type`
   *
   * Ninguna ruta de este sistema puede emitir el primero (no hay forma de
   * renderizar esa página desde un Route Handler). Lo que se exige es que
   * emita el segundo SIN NADA SUYO ENCIMA. Antes de la iteración 2 emitía
   * `Not Found` en texto plano con un `X-Robots-Tag` propio: un escáner
   * separaba las dos rutas de tareas del resto del sitio en una sola pasada.
   */
  it("responde igual que la ruta pública de fotos cuando el archivo no está", async () => {
    process.env.CRON_SECRET = SECRETO;

    await expect(pedir({ authorization: "Bearer equivocado" })).rejects.toThrow(
      /NEXT_HTTP_ERROR_FALLBACK;404/,
    );

    // Y la ruta pública de fotos, con una clave que no existe, hace lo mismo:
    // es el 404 "normal" de este sistema, y es al que hay que parecerse.
    const { GET: servirFotoPublica } = await import(
      "../src/app/api/foto/[clave]/[variante]/route"
    );
    const respuestaFoto = await servirFotoPublica(
      new Request("https://enmirumbo.example/api/foto/x/ficha"),
      { params: Promise.resolve({ clave: "0".repeat(32), variante: "ficha" }) } as never,
    );
    expect(respuestaFoto.status).toBe(404);
    expect(await respuestaFoto.text()).toBe("");
    expect(respuestaFoto.headers.get("content-type")).toBeNull();
  });

  it("el código ya no fabrica un 404 propio en ninguna de las dos rutas", () => {
    // Guardián barato: si alguien vuelve a escribir un `new Response("Not
    // Found", …)` en una ruta de tareas, esto lo dice.
    for (const ruta of [
      "../src/app/api/tareas/purgar-rechazados/route.ts",
      "../src/app/api/tareas/barrer-fotos-huerfanas/route.ts",
      "../src/lib/tareas/secreto.ts",
    ]) {
      const fuente = readFileSync(new URL(ruta, import.meta.url), "utf8");
      expect(fuente, ruta).not.toMatch(/status:\s*404/);
      expect(fuente, ruta).not.toMatch(/"Not Found"/);
    }
  });
});
