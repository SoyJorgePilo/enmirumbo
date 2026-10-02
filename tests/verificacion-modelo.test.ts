import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { columnasDeTabla, consultarConPrisma } from "./catalogo-db";
import { crearClientePrueba } from "./db";

/**
 * Spec `modelo-datos` (delta de T-016 / ADR-011) · Requirement "El negocio
 * guarda cuándo se verificó su número por SMS" — tasks.md #1 y #2.
 *
 * Lo que se fija aquí: la columna existe, es NULABLE y sin default, nace nula,
 * sobrevive a todas las transiciones del panel, no hay ninguna columna donde
 * viva un código, no sale por ninguna proyección pública y el borrado
 * definitivo se la lleva con la fila.
 *
 * El árbol de migraciones aplicado sobre un esquema vacío lo cubre
 * `tests/modelo-migraciones.test.ts` (donde vive la comprobación de que
 * ninguna fila anterior estrena fecha de relleno).
 *
 * Datos 100% ficticios (repo público + LFPDPPP).
 */

const prisma = crearClientePrueba();

/** Números de la serie de pruebas: no corresponden a ningún negocio real. */
const WHATSAPP_VERIFICADO = "7710000161";
const WHATSAPP_SIN_VERIFICAR = "7710000162";
const WHATSAPP_BORRABLE = "7710000163";

const VERIFICADO_EN = new Date("2026-09-04T18:30:00.000Z");

let categoriaId: number;

async function crearNegocio(
  whatsapp: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const negocio = await prisma.negocio.create({
    data: {
      nombre: "Taller Ficticio de Pruebas",
      categoriaId,
      whatsapp,
      consintioAvisoEn: new Date("2026-09-01T10:00:00.000Z"),
      ...extra,
    },
    select: { id: true },
  });
  return negocio.id;
}

describe("modelo-datos · la marca de verificación por SMS", () => {
  beforeAll(async () => {
    await seedCatalogos(prisma);
    categoriaId = (
      await prisma.categoria.findUniqueOrThrow({ where: { slug: "servicios-del-hogar" } })
    ).id;
    await prisma.negocio.deleteMany({
      where: {
        whatsapp: { in: [WHATSAPP_VERIFICADO, WHATSAPP_SIN_VERIFICAR, WHATSAPP_BORRABLE] },
      },
    });
  });

  afterAll(async () => {
    await prisma.negocio.deleteMany({
      where: {
        whatsapp: { in: [WHATSAPP_VERIFICADO, WHATSAPP_SIN_VERIFICAR, WHATSAPP_BORRABLE] },
      },
    });
    await prisma.$disconnect();
  });

  // Scenario: negocio recién registrado
  it("un negocio recién creado nace sin fecha de verificación", async () => {
    const id = await crearNegocio(WHATSAPP_SIN_VERIFICAR);
    const fila = await prisma.negocio.findUniqueOrThrow({
      where: { id },
      select: { numeroVerificadoEn: true },
    });
    expect(fila.numeroVerificadoEn).toBeNull();
  });

  // Scenario: migración sobre una base con datos — la columna es nulable y
  // NO tiene valor por defecto: nadie le inventa una fecha a lo ya guardado.
  it("la columna es nulable y sin valor por defecto", async () => {
    const columnas = await columnasDeTabla(consultarConPrisma(prisma), "Negocio");
    expect(columnas).toContain("numeroVerificadoEn");

    const [fila] = (await prisma.$queryRawUnsafe(
      `SELECT is_nullable, column_default
         FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'Negocio'
          AND column_name = 'numeroVerificadoEn'`,
    )) as Array<{ is_nullable: string; column_default: string | null }>;
    expect(fila.is_nullable).toBe("YES");
    expect(fila.column_default).toBeNull();
  });

  // Scenario: verificación confirmada
  it("al confirmar se persiste la fecha y el negocio sigue en revisión", async () => {
    const id = await crearNegocio(WHATSAPP_VERIFICADO);
    await prisma.negocio.update({
      where: { id },
      data: { numeroVerificadoEn: VERIFICADO_EN },
    });
    const fila = await prisma.negocio.findUniqueOrThrow({
      where: { id },
      select: { numeroVerificadoEn: true, estado: true, publicadoEn: true },
    });
    expect(fila.numeroVerificadoEn?.toISOString()).toBe(VERIFICADO_EN.toISOString());
    expect(fila.estado).toBe("en_revision");
    expect(fila.publicadoEn).toBeNull();
  });

  // Scenario: la marca sobrevive a las transiciones
  it("aprobar, despublicar, rechazar y reenviar no tocan la fecha", async () => {
    const id = await prisma.negocio
      .findUniqueOrThrow({ where: { whatsapp: WHATSAPP_VERIFICADO }, select: { id: true } })
      .then((fila) => fila.id);

    const transiciones: Array<Record<string, unknown>> = [
      { estado: "publicado", publicadoEn: new Date() },
      { estado: "en_revision", despublicadoEn: new Date(), motivoDespublicacion: "Cerró" },
      { estado: "rechazado", rechazadoEn: new Date(), motivoRechazo: "Datos incompletos" },
      // Reenvío tras rechazo: el mismo número, así que la marca se conserva.
      { estado: "en_revision", rechazadoEn: null, motivoRechazo: null, registradoEn: new Date() },
    ];

    for (const data of transiciones) {
      await prisma.negocio.update({ where: { id }, data });
      const fila = await prisma.negocio.findUniqueOrThrow({
        where: { id },
        select: { numeroVerificadoEn: true },
      });
      expect(fila.numeroVerificadoEn?.toISOString(), JSON.stringify(data)).toBe(
        VERIFICADO_EN.toISOString(),
      );
    }
  });

  // Scenario: el código no vive en la base
  it("no existe ninguna columna donde se guarde un código de verificación", async () => {
    const columnas = await columnasDeTabla(consultarConPrisma(prisma), "Negocio");
    const sospechosas = columnas.filter((columna) =>
      /codigo|sid|verificacionId|otp/i.test(columna),
    );
    expect(sospechosas).toEqual([]);
  });

  // Scenario: el borrado se la lleva
  it("el borrado definitivo se lleva la marca con la fila", async () => {
    const id = await crearNegocio(WHATSAPP_BORRABLE, { numeroVerificadoEn: VERIFICADO_EN });
    await prisma.negocio.delete({ where: { id } });
    expect(await prisma.negocio.findUnique({ where: { id } })).toBeNull();
  });
});

/**
 * Scenario "dato interno": la columna no puede colarse a ninguna proyección
 * pública. Se comprueba sobre el CÓDIGO, no sobre una consulta: la suite falla
 * en cuanto alguien la agregue a un `select` del directorio, del buscador, del
 * sitemap o de los datos estructurados, aunque no haya fila verificada con la
 * que notarlo.
 */
describe("modelo-datos · la marca de verificación no sale a lo público", () => {
  it("ningún módulo de proyección pública nombra la columna", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const path = await import("node:path");
    const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

    const publicos = [
      "src/lib/directorio.ts",
      "src/lib/busqueda.ts",
      "src/lib/seo",
      "src/app/(publico)",
      "src/app/sitemap.ts",
    ];

    const archivos: string[] = [];
    const recorrer = (relativo: string) => {
      const absoluto = path.join(raiz, relativo);
      let entradas;
      try {
        entradas = readdirSync(absoluto, { withFileTypes: true });
      } catch {
        archivos.push(absoluto); // era un archivo, no un directorio
        return;
      }
      for (const entrada of entradas) {
        recorrer(path.join(relativo, entrada.name));
      }
    };
    for (const ruta of publicos) recorrer(ruta);

    // La pantalla del código y sus acciones sí son públicas y SÍ escriben la
    // marca: es el único camino de escritura que la spec permite.
    const excepciones = ["registro/verificar", "registro/accion.ts"];

    for (const archivo of archivos) {
      if (!/\.tsx?$/.test(archivo)) continue;
      if (excepciones.some((excepcion) => archivo.includes(excepcion))) continue;
      expect(readFileSync(archivo, "utf8"), archivo).not.toContain("numeroVerificadoEn");
    }
  });
});
