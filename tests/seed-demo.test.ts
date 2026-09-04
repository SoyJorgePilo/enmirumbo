import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { NEGOCIOS_DEMO, sembrarNegociosDemo } from "../prisma/seed-demo";
import { seedCatalogos } from "../prisma/seed";
import { PrismaClient } from "../src/generated/prisma/client";

// Spec: modelo-datos · Requirement "Seed de negocios ficticios para
// desarrollo, separado del de catálogos" (tasks.md #5, design.md §6).
//
// Este archivo usa una base propia y recién migrada, no la compartida por el
// resto de la suite: el scenario "el seed de catálogos no crea negocios"
// necesita una base donde nadie más haya escrito.

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const archivoDb = path.join(raiz, "prisma/test-seed-demo.db");
const urlDb = "file:./prisma/test-seed-demo.db";

let prisma: PrismaClient;

function borrarBase() {
  rmSync(archivoDb, { force: true });
  rmSync(`${archivoDb}-journal`, { force: true });
}

beforeAll(async () => {
  borrarBase();
  execSync("npx prisma migrate deploy", {
    cwd: raiz,
    env: { ...process.env, DATABASE_URL: urlDb },
    stdio: "pipe",
  });
  prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: urlDb }) });
}, 60_000);

afterAll(async () => {
  await prisma.$disconnect();
  borrarBase();
});

describe("modelo-datos · seed de demostración", () => {
  // Scenario: el seed de catálogos no crea negocios
  it("`db:seed` deja los catálogos poblados y la tabla de negocios vacía", async () => {
    await seedCatalogos(prisma);
    expect(await prisma.categoria.count()).toBe(8);
    expect(await prisma.negocio.count()).toBe(0);
  });

  // Scenario: sembrar negocios de demostración
  it("siembra los negocios ficticios que el directorio necesita probar", async () => {
    const resultado = await sembrarNegociosDemo(prisma, { NODE_ENV: "development" });
    expect(resultado.sembrado).toBe(true);
    expect(resultado.mensaje.toLowerCase()).toContain("mentira");

    const negocios = await prisma.negocio.findMany({
      include: { categoria: true, colonia: true },
    });
    expect(negocios).toHaveLength(NEGOCIOS_DEMO.length);

    const publicados = negocios.filter((n) => n.estado === "publicado");
    const categoriasConPublicados = new Set(publicados.map((n) => n.categoria.slug));
    expect(categoriasConPublicados.size).toBeGreaterThanOrEqual(4);
    expect(categoriasConPublicados).toContain("clubes-y-escuelas-deportivas");

    const coloniasConPublicados = new Set(
      publicados.map((n) => n.colonia?.slug).filter(Boolean),
    );
    expect(coloniasConPublicados.size).toBeGreaterThanOrEqual(4);

    expect(publicados.some((n) => n.entregaADomicilio)).toBe(true);
    expect(publicados.some((n) => !n.entregaADomicilio)).toBe(true);

    // Uno con todos los opcionales y otro con solo los obligatorios
    expect(
      publicados.some(
        (n) =>
          n.queOfreces && n.telefonoFijo && n.direccion && n.horario && n.facebookUrl,
      ),
    ).toBe(true);
    expect(
      publicados.some(
        (n) =>
          !n.queOfreces &&
          !n.telefonoFijo &&
          !n.direccion &&
          !n.horario &&
          !n.facebookUrl,
      ),
    ).toBe(true);

    // Publicado con colonia "Otra" sin normalizar
    expect(
      publicados.some((n) => n.coloniaId === null && (n.coloniaOtra ?? "") !== ""),
    ).toBe(true);

    expect(negocios.some((n) => n.estado === "en_revision")).toBe(true);
    expect(negocios.some((n) => n.estado === "rechazado")).toBe(true);

    // Todo publicado tiene fecha de publicación: el orden del listado depende de ella
    expect(publicados.every((n) => n.publicadoEn instanceof Date)).toBe(true);
  });

  // modelo-datos MODIFIED por agregar-panel-admin ·
  // Scenario: el seed de demostración incluye un rechazo con motivo
  it("el negocio rechazado trae fecha y motivo de rechazo ficticios", async () => {
    const rechazados = await prisma.negocio.findMany({ where: { estado: "rechazado" } });
    expect(rechazados.length).toBeGreaterThanOrEqual(1);
    for (const rechazado of rechazados) {
      expect(rechazado.rechazadoEn).toBeInstanceOf(Date);
      expect((rechazado.motivoRechazo ?? "").trim().length).toBeGreaterThan(0);
      // El rechazo llegó después del registro, como en la operación real.
      expect(rechazado.rechazadoEn!.getTime()).toBeGreaterThanOrEqual(
        rechazado.registradoEn.getTime(),
      );
    }

    // Los que no están rechazados no arrastran rastro de rechazo.
    const otros = await prisma.negocio.findMany({
      where: { estado: { not: "rechazado" } },
    });
    for (const negocio of otros) {
      expect(negocio.rechazadoEn).toBeNull();
      expect(negocio.motivoRechazo).toBeNull();
    }
  });

  // Scenario: datos ficticios y nada real
  it("todos los WhatsApp son de la serie de pruebas 771999xxxx", async () => {
    const negocios = await prisma.negocio.findMany();
    for (const negocio of negocios) {
      expect(negocio.whatsapp).toMatch(/^771999\d{4}$/);
    }
    for (const negocio of NEGOCIOS_DEMO) {
      expect(negocio.whatsapp).toMatch(/^771999\d{4}$/);
      expect(negocio.telefonoFijo ?? "7717770000").toMatch(/^771777\d{4}$/);
    }
  });

  // Scenario: seed de demostración idempotente
  it("correrlo dos veces no cambia el número de negocios", async () => {
    const antes = await prisma.negocio.count();
    await sembrarNegociosDemo(prisma, { NODE_ENV: "development" });
    expect(await prisma.negocio.count()).toBe(antes);
  });

  // Scenario: nunca contra producción
  it("en producción no siembra nada y lo dice", async () => {
    await prisma.negocio.deleteMany();
    const resultado = await sembrarNegociosDemo(prisma, { NODE_ENV: "production" });
    expect(resultado.sembrado).toBe(false);
    expect(resultado.mensaje.toLowerCase()).toContain("producción");
    expect(await prisma.negocio.count()).toBe(0);

    const enVercel = await sembrarNegociosDemo(prisma, { VERCEL_ENV: "production" });
    expect(enVercel.sembrado).toBe(false);
    expect(await prisma.negocio.count()).toBe(0);
  });

  // Hallazgo M4 de la etapa C: la guarda miraba el entorno, no la base. En
  // local `NODE_ENV` no vale "production", así que
  // `DATABASE_URL=<base real> npm run db:seed:demo` sembraba negocios de
  // mentira en el directorio de verdad (y el upsert por WhatsApp podía pisar
  // fichas reales).
  describe("guarda por DATABASE_URL (hallazgo M4)", () => {
    beforeAll(async () => {
      await prisma.negocio.deleteMany();
    });

    it.each([
      ["postgresql://usuario:clave@servidor:5432/necesitouno", "postgresql"],
      ["postgres://usuario:clave@servidor:5432/necesitouno", "postgres"],
      ["mysql://usuario:clave@servidor:3306/necesitouno", "mysql"],
      ["prisma://accelerate.prisma-data.net/?api_key=xxx", "prisma accelerate"],
      ["libsql://necesitouno.turso.io?authToken=xxx", "libsql remoto"],
      ["https://necesitouno.example/db", "https"],
    ])("no siembra si DATABASE_URL apunta a %s (%s)", async (url) => {
      const resultado = await sembrarNegociosDemo(prisma, {
        NODE_ENV: "development",
        DATABASE_URL: url,
      });
      expect(resultado.sembrado).toBe(false);
      expect(resultado.mensaje).toContain("DATABASE_URL");
      expect(resultado.mensaje).toContain("SEED_DEMO_PERMITIR=1");
      expect(await prisma.negocio.count()).toBe(0);
    });

    it("sí siembra contra un archivo SQLite local (ADR-001)", async () => {
      const resultado = await sembrarNegociosDemo(prisma, {
        NODE_ENV: "development",
        DATABASE_URL: urlDb,
      });
      expect(resultado.sembrado).toBe(true);
      expect(await prisma.negocio.count()).toBe(NEGOCIOS_DEMO.length);
    });

    it("sin DATABASE_URL usa la base de dev por default y siembra", async () => {
      const resultado = await sembrarNegociosDemo(prisma, { NODE_ENV: "development" });
      expect(resultado.sembrado).toBe(true);
    });

    it("acepta el esquema en mayúsculas y con espacios alrededor", async () => {
      const resultado = await sembrarNegociosDemo(prisma, {
        NODE_ENV: "development",
        DATABASE_URL: "  FILE:./prisma/test-seed-demo.db  ",
      });
      expect(resultado.sembrado).toBe(true);
    });

    it("una base remota solo se siembra con el permiso explícito", async () => {
      const resultado = await sembrarNegociosDemo(prisma, {
        NODE_ENV: "development",
        DATABASE_URL: "postgresql://usuario:clave@servidor:5432/necesitouno",
        SEED_DEMO_PERMITIR: "1",
      });
      expect(resultado.sembrado).toBe(true);
    });

    it("el permiso explícito NO abre la puerta de producción", async () => {
      await prisma.negocio.deleteMany();
      const resultado = await sembrarNegociosDemo(prisma, {
        NODE_ENV: "production",
        DATABASE_URL: "file:./prisma/test-seed-demo.db",
        SEED_DEMO_PERMITIR: "1",
      });
      expect(resultado.sembrado).toBe(false);
      expect(resultado.mensaje.toLowerCase()).toContain("producción");
      expect(await prisma.negocio.count()).toBe(0);
    });

    it("'Production' con mayúscula sigue siendo producción", async () => {
      const resultado = await sembrarNegociosDemo(prisma, { NODE_ENV: " Production " });
      expect(resultado.sembrado).toBe(false);
      expect(resultado.mensaje.toLowerCase()).toContain("producción");
      expect(await prisma.negocio.count()).toBe(0);
    });
  });
});
