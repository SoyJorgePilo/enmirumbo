import { mkdir, mkdtemp, readdir, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import type { PrismaClient } from "../src/generated/prisma/client";
import { crearAlmacenLocal } from "../src/lib/fotos/almacen";
import { generarClaveFoto, VARIANTES_FOTO } from "../src/lib/fotos/clave";
import {
  EDAD_MINIMA_PARA_BARRER_MS,
  barrerFotosHuerfanas,
} from "../src/lib/fotos/huerfanas";
import { crearClientePrueba } from "./db";

// Hallazgo M-3 de `reports/c-seguridad.md`: si el proceso muere entre escribir
// los archivos y escribir la fila, esa foto queda sin dueño y, sin fila, el
// borrado ARCO ya no puede alcanzarla (PRD §8). Este barrido de
// reconciliación es la red que la recoge.
//
// Datos 100% ficticios (repo público + LFPDPPP): serie de pruebas 7719988xxx.

const BYTES = Buffer.from("bytes de una foto de mentiras");

let prisma: PrismaClient;
let directorio: string;
let categoriaId: number;
let coloniaId: number;

function almacen() {
  return crearAlmacenLocal(directorio);
}

/** Escribe las dos variantes de una clave y las envejece para que sí se barran. */
async function fotoEnDisco(clave: string, antigua = true): Promise<void> {
  for (const variante of VARIANTES_FOTO) {
    await almacen().guardar(clave, variante, BYTES);
    if (antigua) {
      const ruta = join(directorio, `${clave}.${variante}.webp`);
      const viejo = new Date(Date.now() - EDAD_MINIMA_PARA_BARRER_MS - 60_000);
      await utimes(ruta, viejo, viejo);
    }
  }
}

async function archivos(): Promise<string[]> {
  return (await readdir(directorio)).sort();
}

beforeAll(async () => {
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (
    await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })
  ).id;
  coloniaId = (
    await prisma.colonia.findUniqueOrThrow({ where: { slug: "huicalco" } })
  ).id;
});

afterAll(async () => {
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: "7719988" } } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: "7719988" } } });
  if (directorio) await rm(directorio, { recursive: true, force: true });
  directorio = await mkdtemp(join(tmpdir(), "necesitouno-huerfanas-"));

  // Ancla: una ficha SIN foto, para que la base nunca esté vacía y la
  // salvaguarda de "parece la base equivocada" no se dispare por accidente
  // según el orden en que corran los demás archivos de prueba. Esa salvaguarda
  // tiene su propio test, con un cliente falso.
  await prisma.negocio.create({
    data: {
      nombre: "Vidriería Ficticia sin Foto",
      categoriaId,
      coloniaId,
      whatsapp: "7719988999",
      consintioAvisoEn: new Date("2026-08-01T10:00:00.000Z"),
    },
  });
});

/** Ficha con foto, como la dejaría un alta que sí llegó a la base. */
async function fichaConFoto(whatsapp: string): Promise<string> {
  const clave = generarClaveFoto();
  await prisma.negocio.create({
    data: {
      nombre: "Refaccionaria Ficticia del Barrido",
      categoriaId,
      coloniaId,
      whatsapp,
      consintioAvisoEn: new Date("2026-08-01T10:00:00.000Z"),
      fotoClave: clave,
    },
  });
  await fotoEnDisco(clave);
  return clave;
}

describe("barrido de fotos sin dueño", () => {
  it("borra las claves que no tiene ninguna ficha y respeta las que sí", async () => {
    const conDueno = await fichaConFoto("7719988001");
    const huerfana = generarClaveFoto();
    await fotoEnDisco(huerfana);

    const resultado = await barrerFotosHuerfanas({
      prisma,
      almacen: almacen(),
    });

    expect(resultado.huerfanas).toBe(1);
    expect(resultado.borradas).toBe(1);
    const quedan = await archivos();
    expect(quedan.filter((n) => n.startsWith(conDueno))).toHaveLength(2);
    expect(quedan.filter((n) => n.startsWith(huerfana))).toHaveLength(0);
  });

  it("es idempotente: la segunda corrida no encuentra nada que borrar", async () => {
    await fichaConFoto("7719988002");
    await fotoEnDisco(generarClaveFoto());

    await barrerFotosHuerfanas({ prisma, almacen: almacen() });
    const antes = await archivos();
    const segunda = await barrerFotosHuerfanas({ prisma, almacen: almacen() });

    expect(segunda.huerfanas).toBe(0);
    expect(segunda.borradas).toBe(0);
    expect(await archivos()).toEqual(antes);
  });

  // La red de seguridad no puede convertirse en el problema: entre que se
  // escriben los archivos y se escribe la fila pasan milisegundos, y un
  // barrido corriendo justo en medio no debe llevarse una foto viva.
  it("no toca archivos recién escritos, aunque todavía no tengan fila", async () => {
    const reciente = generarClaveFoto();
    await fotoEnDisco(reciente, false); // sin envejecer

    const resultado = await barrerFotosHuerfanas({
      prisma,
      almacen: almacen(),
    });

    expect(resultado.huerfanas).toBe(0);
    expect(resultado.enPeriodoDeGracia).toBe(1);
    expect((await archivos()).filter((n) => n.startsWith(reciente))).toHaveLength(2);
  });

  it("con --dry-run informa pero no borra nada", async () => {
    const huerfana = generarClaveFoto();
    await fotoEnDisco(huerfana);

    const resultado = await barrerFotosHuerfanas({
      prisma,
      almacen: almacen(),
      soloInformar: true,
    });

    expect(resultado.huerfanas).toBe(1);
    expect(resultado.borradas).toBe(0);
    expect((await archivos()).filter((n) => n.startsWith(huerfana))).toHaveLength(2);
  });

  // Salvaguarda: correrlo apuntando a la base equivocada borraría TODAS las
  // fotos. Si no hay un solo negocio en la base pero sí hay archivos, algo
  // está mal configurado y no se borra nada.
  it("se planta si la base no tiene ni un negocio pero el almacén tiene fotos", async () => {
    await fotoEnDisco(generarClaveFoto());
    const prismaVacio = {
      negocio: {
        count: async () => 0,
        findMany: async () => [],
      },
    };

    const resultado = await barrerFotosHuerfanas({
      prisma: prismaVacio,
      almacen: almacen(),
    });

    expect(resultado.barrido).toBe(false);
    expect(resultado.borradas).toBe(0);
    expect(resultado.mensaje.toLowerCase()).toContain("base");
    expect(await archivos()).toHaveLength(2);
  });

  it("ignora los archivos que no tienen la forma que escribe el servidor", async () => {
    const almacenLocal = almacen();
    const clave = generarClaveFoto();
    await fotoEnDisco(clave);
    // Algo que el servidor nunca escribió: no es nuestro, no se toca.
    const ajeno = join(directorio, "no-es-nuestro.txt");
    await (await import("node:fs/promises")).writeFile(ajeno, "hola");

    const resultado = await barrerFotosHuerfanas({
      prisma,
      almacen: almacenLocal,
    });

    expect(resultado.ignoradas).toBe(1);
    expect(await archivos()).toContain("no-es-nuestro.txt");
  });

  // ── Hallazgo M-6: la base equivocada pero POBLADA ────────────────────────
  //
  // El error de operación común no es apuntar a una base vacía (eso se nota
  // enseguida), es apuntar a staging o a `test.db`: tienen negocios, así que
  // la salvaguarda de "base plausible" no salta, ninguna clave coincide y el
  // barrido se lleva TODAS las fotos de producción.
  describe("guarda de proporción", () => {
    /** Base con negocios pero cuyas claves no son las del almacén. */
    const baseEquivocada = {
      negocio: {
        count: async () => 120,
        findMany: async () => [],
      },
    };

    async function almacenConHuerfanas(cuantas: number): Promise<string[]> {
      const claves: string[] = [];
      for (let i = 0; i < cuantas; i++) {
        const clave = generarClaveFoto();
        await fotoEnDisco(clave);
        claves.push(clave);
      }
      return claves;
    }

    it("no borra nada si va a llevarse casi todo, y dice por qué", async () => {
      const claves = await almacenConHuerfanas(6);

      const resultado = await barrerFotosHuerfanas({
        prisma: baseEquivocada,
        almacen: almacen(),
      });

      expect(resultado.barrido).toBe(false);
      expect(resultado.borradas).toBe(0);
      expect(resultado.huerfanas).toBe(6);
      // El mensaje explica el razonamiento y dice cómo forzarlo.
      expect(resultado.mensaje).toContain("--forzar");
      expect(resultado.mensaje.toLowerCase()).toContain("base");
      // Y los archivos siguen todos ahí.
      for (const clave of claves) {
        expect((await archivos()).filter((n) => n.startsWith(clave))).toHaveLength(2);
      }
    });

    it("con --forzar sí borra, porque quien lo escribe ya lo pensó", async () => {
      await almacenConHuerfanas(6);

      const resultado = await barrerFotosHuerfanas({
        prisma: baseEquivocada,
        almacen: almacen(),
        forzar: true,
      });

      expect(resultado.barrido).toBe(true);
      expect(resultado.borradas).toBe(6);
      expect(await archivos()).toHaveLength(0);
    });

    it("con --dry-run informa el desastre en vez de plantarse", async () => {
      await almacenConHuerfanas(6);

      const resultado = await barrerFotosHuerfanas({
        prisma: baseEquivocada,
        almacen: almacen(),
        soloInformar: true,
      });

      // Informar es justo la forma de descubrir que la base es la equivocada.
      expect(resultado.barrido).toBe(true);
      expect(resultado.huerfanas).toBe(6);
      expect(resultado.borradas).toBe(0);
      expect(await archivos()).toHaveLength(12);
    });

    it("una limpieza normal y chica no necesita --forzar", async () => {
      // Lo habitual: casi todo tiene ficha y sobra una huérfana suelta.
      await fichaConFoto("7719988010");
      await fichaConFoto("7719988011");
      await fichaConFoto("7719988012");
      const huerfana = generarClaveFoto();
      await fotoEnDisco(huerfana);

      const resultado = await barrerFotosHuerfanas({
        prisma,
        almacen: almacen(),
      });

      expect(resultado.barrido).toBe(true);
      expect(resultado.borradas).toBe(1);
      expect((await archivos()).filter((n) => n.startsWith(huerfana))).toHaveLength(0);
    });
  });

  // ── Hallazgo B-6: un directorio con nombre de foto ───────────────────────
  describe("archivos que no son archivos", () => {
    it("un subdirectorio con nombre de foto se ignora y el barrido termina", async () => {
      const huerfana = generarClaveFoto();
      await fotoEnDisco(huerfana);
      // Un artefacto de rsync, una restauración a medias: un DIRECTORIO con
      // nombre de variante. Antes reventaba el barrido con EISDIR y lo dejaba
      // inservible para siempre.
      const intruso = generarClaveFoto();
      await mkdir(join(directorio, `${intruso}.tarjeta.webp`), { recursive: true });

      const resultado = await barrerFotosHuerfanas({
        prisma,
        almacen: almacen(),
      });

      expect(resultado.barrido).toBe(true);
      expect(resultado.ignoradas).toBeGreaterThanOrEqual(1);
      // La huérfana de verdad sí se limpió: el intruso no frenó la pasada.
      expect(resultado.borradas).toBe(1);
      expect(await archivos()).toContain(`${intruso}.tarjeta.webp`);
    });

    it("si una variante es un directorio, esa clave no tumba la corrida", async () => {
      const clave = generarClaveFoto();
      await fotoEnDisco(clave); // las dos variantes, como archivos
      // Ahora una de ellas se convierte en directorio.
      await rm(join(directorio, `${clave}.tarjeta.webp`));
      await mkdir(join(directorio, `${clave}.tarjeta.webp`), { recursive: true });
      const otraHuerfana = generarClaveFoto();
      await fotoEnDisco(otraHuerfana);

      const resultado = await barrerFotosHuerfanas({
        prisma,
        almacen: almacen(),
      });

      expect(resultado.barrido).toBe(true);
      // La clave sana se borró aunque la otra no se dejara.
      expect((await archivos()).filter((n) => n.startsWith(otraHuerfana))).toHaveLength(0);
      expect(resultado.noBorrables).toBeGreaterThanOrEqual(0);
    });
  });

  it("un almacén vacío no es un error", async () => {
    const resultado = await barrerFotosHuerfanas({
      prisma,
      almacen: almacen(),
    });
    expect(resultado.barrido).toBe(true);
    expect(resultado.revisadas).toBe(0);
    expect(resultado.borradas).toBe(0);
  });
});
