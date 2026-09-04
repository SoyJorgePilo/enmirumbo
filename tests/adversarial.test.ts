import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CATEGORIAS, COLONIAS, GIROS, seedCatalogos } from "../prisma/seed";
import { slugify } from "../src/lib/slug";
import type { PrismaClient } from "../src/generated/prisma/client";
import { crearClientePrueba } from "./db";

// Tests adversariales (etapa C, seguridad): entradas hostiles, transiciones
// ilegales por escritura directa, colisiones de slug e idempotencia del seed
// bajo datos modificados. Datos 100% ficticios (repo público + LFPDPPP):
// números 771999xxxx inventados.

describe("adversarial: modelo de datos", () => {
  let prisma: PrismaClient;
  let categoriaId: number;

  beforeAll(async () => {
    prisma = crearClientePrueba();
    await seedCatalogos(prisma);
    categoriaId = (
      await prisma.categoria.findUniqueOrThrow({
        where: { slug: "servicios-del-hogar" },
      })
    ).id;
  });

  afterAll(async () => {
    // Solo lo creado por este archivo (prefijo ficticio propio)
    await prisma.negocio.deleteMany({
      where: { whatsapp: { startsWith: "771999" } },
    });
    await prisma.$disconnect();
  });

  // ── CHECKs también en UPDATE (el dev solo probó el CREATE) ────────────────

  it("el CHECK de estado también rechaza la escritura vía UPDATE", async () => {
    const { id } = await prisma.negocio.create({
      data: {
        nombre: "Negocio Ficticio Update Ilegal",
        categoriaId,
        whatsapp: "7719990001",
        consintioAvisoEn: new Date(),
        coloniaOtra: "Colonia Ficticia",
      },
    });

    await expect(
      prisma.negocio.update({ where: { id }, data: { estado: "publicadisimo" } }),
    ).rejects.toThrowError(/CHECK/i);
    await expect(
      prisma.negocio.update({ where: { id }, data: { origen: "importado" } }),
    ).rejects.toThrowError(/CHECK/i);

    // Cadena vacía tampoco pasa (no es un cuarto estado "fantasma")
    await expect(
      prisma.negocio.update({ where: { id }, data: { estado: "" } }),
    ).rejects.toThrowError(/CHECK/i);

    const intacto = await prisma.negocio.findUniqueOrThrow({ where: { id } });
    expect(intacto.estado).toBe("en_revision");
    expect(intacto.origen).toBe("organico");
  });

  it("el CHECK rechaza estado con mayúsculas o espacios (variantes del literal)", async () => {
    for (const estadoHostil of ["Publicado", "publicado ", "EN_REVISION"]) {
      await expect(
        prisma.negocio.create({
          data: {
            nombre: `Negocio Ficticio Estado ${estadoHostil}`,
            categoriaId,
            whatsapp: "7719990002",
            consintioAvisoEn: new Date(),
            estado: estadoHostil,
          },
        }),
      ).rejects.toThrowError(/CHECK/i);
    }
  });

  // ── Unicidad de WhatsApp: solo por cadena exacta ──────────────────────────

  it("CARACTERIZACIÓN: la unicidad de WhatsApp NO detecta variantes (+52, espacios) — normalizar en E1", async () => {
    await prisma.negocio.create({
      data: {
        nombre: "Ficticio WhatsApp Base",
        categoriaId,
        whatsapp: "7719990010",
        consintioAvisoEn: new Date(),
      },
    });

    // Mismo número real, otra representación: la base HOY lo acepta como ficha
    // distinta. La constraint garantiza unicidad por cadena exacta; el
    // formulario (E1) DEBE normalizar a 10 dígitos antes de insertar, o
    // "una sola ficha por número" (PRD §6.1) se brinca con "+52 771 999 0010".
    const variante = await prisma.negocio.create({
      data: {
        nombre: "Ficticio WhatsApp Variante",
        categoriaId,
        whatsapp: "+52 771 999 0010",
        consintioAvisoEn: new Date(),
      },
    });
    expect(variante.id).toBeTruthy();
    await prisma.negocio.delete({ where: { id: variante.id } });
  });

  // ── Entradas hostiles: el modelo persiste sin mutar (defensa va en bordes) ─

  it("persiste intactas entradas hostiles (HTML, unicode raro, 10k chars) — escapar/limitar es del formulario y el render", async () => {
    const hostil = {
      nombre: '<script>alert("xss")</script> Tienda Ficticia 🌮 اليمين',
      queOfreces: "x".repeat(10_000), // la columna es TEXT sin cota: el máx. 200 vive en E1
      direccion: "Calle Ficticia '; DROP TABLE Negocio;--",
      // La columna guarda la clave que genera el servidor; el modelo no
      // valida su forma (de eso se encarga el validador de render, M1 de
      // T-004), así que una cadena hostil se persiste tal cual.
      fotoClave: "javascript:alert(1)",
      facebookUrl: "file:///etc/passwd",
    };
    const { id } = await prisma.negocio.create({
      data: {
        ...hostil,
        categoriaId,
        whatsapp: "7719990003",
        consintioAvisoEn: new Date(),
      },
    });

    // Round-trip exacto: nada se trunca ni se "sanitiza" en silencio, y la
    // tabla Negocio sigue existiendo (Prisma parametriza: no hay SQL injection)
    const leido = await prisma.negocio.findUniqueOrThrow({ where: { id } });
    expect(leido).toMatchObject(hostil);
    expect(leido.queOfreces).toHaveLength(10_000);

    // Hard delete también con datos hostiles: ni una fila queda (SQL crudo)
    await prisma.negocio.delete({ where: { id } });
    const filas = await prisma.$queryRaw<
      { total: bigint }[]
    >`SELECT COUNT(*) as total FROM "Negocio" WHERE "id" = ${id}`;
    expect(Number(filas[0].total)).toBe(0);
  });

  // ── Slugs: colisiones, unicode y entradas degeneradas ─────────────────────

  it("slugify es estable ante NFC/NFD (mismo slug para 'Plomería' en ambas formas)", () => {
    const nfc = "Plomería".normalize("NFC");
    const nfd = "Plomería".normalize("NFD");
    expect(slugify(nfc)).toBe("plomeria");
    expect(slugify(nfd)).toBe("plomeria");
  });

  it("CARACTERIZACIÓN: slugify colisiona con nombres que solo difieren en acentos y devuelve '' con entradas sin ASCII", () => {
    // "Uñas" y "Unas" producirían la misma URL: aceptable en catálogos
    // curados; a vigilar si algún día se generan slugs de texto de usuarios
    expect(slugify("Uñas")).toBe(slugify("Unas"));
    // Entrada sin letras ASCII → slug vacío: cualquier consumidor futuro
    // debe rechazar slug "" antes de persistir o armar URLs
    expect(slugify("🌮🌮🌮")).toBe("");
    expect(slugify("日本語")).toBe("");
    expect(slugify(" --- /// ")).toBe("");
  });

  it("los catálogos del seed no tienen slugs vacíos ni colisiones internas", () => {
    for (const catalogo of [CATEGORIAS, COLONIAS, GIROS]) {
      const slugs = catalogo.map((nombre) => slugify(nombre));
      expect(slugs.every((s) => s.length > 0)).toBe(true);
      expect(new Set(slugs).size).toBe(slugs.length); // sin duplicados
    }
    // Giro y colonia componen URLs /giro-colonia (PRD §SEO): ningún slug de
    // giro duplica uno de colonia, lo que evitaría ambigüedad al parsear
    const girosSet = new Set(GIROS.map((n) => slugify(n)));
    for (const colonia of COLONIAS) {
      expect(girosSet.has(slugify(colonia))).toBe(false);
    }
  });

  // ── Seed: idempotencia bajo datos modificados ─────────────────────────────

  it("el seed restaura un nombre de catálogo alterado sin duplicar filas (upsert por slug)", async () => {
    await prisma.giro.update({
      where: { slug: "plomeria" },
      data: { nombre: "Plomería Vandalizada" },
    });

    await seedCatalogos(prisma);

    const restaurado = await prisma.giro.findUniqueOrThrow({
      where: { slug: "plomeria" },
    });
    expect(restaurado.nombre).toBe("Plomería");
    expect(await prisma.giro.count()).toBe(49);
    expect(await prisma.categoria.count()).toBe(8);
    expect(await prisma.colonia.count()).toBe(21);
  });
});
