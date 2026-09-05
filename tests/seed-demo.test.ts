import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { NEGOCIOS_DEMO, sembrarNegociosDemo } from "../prisma/seed-demo";
import { seedCatalogos } from "../prisma/seed";
import { PrismaClient } from "../src/generated/prisma/client";
import { almacenDeFotos, directorioDeFotos } from "../src/lib/fotos/almacen";
import { esClaveFotoValida } from "../src/lib/fotos/clave";
import {
  VERSION_AVISO,
  versionAvisoEsPosterior,
} from "../src/lib/legales/version";
import {
  crearClienteEnEsquema,
  ESQUEMA_SEED_DEMO,
  restaurarEsquemaCompartido,
  urlDeEsquema,
} from "./db";

/** Lo que hay ahora mismo en el almacén de fotos de las pruebas. */
async function archivosDelAlmacen(): Promise<string[]> {
  try {
    return (await readdir(directorioDeFotos())).sort();
  } catch {
    return [];
  }
}

// Spec: modelo-datos · Requirement "Seed de negocios ficticios para
// desarrollo, separado del de catálogos" (tasks.md #5, design.md §6).
//
// Este archivo usa una base propia y recién migrada, no la compartida por el
// resto de la suite: el scenario "el seed de catálogos no crea negocios"
// necesita una base donde nadie más haya escrito.

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

let prisma: PrismaClient;

beforeAll(async () => {
  // El esquema lo dejó vacío `tests/global-setup.ts`; aquí se le aplica el
  // árbol de migraciones, igual que en un despliegue.
  execSync("npx prisma migrate deploy", {
    cwd: raiz,
    env: { ...process.env, DATABASE_URL: urlDeEsquema(ESQUEMA_SEED_DEMO) },
    stdio: "pipe",
  });
  // La CLI de Prisma dejó el `search_path` de la sesión —que en el servidor
  // local es COMPARTIDA— apuntando a este esquema de juguete.
  await restaurarEsquemaCompartido();
  prisma = crearClienteEnEsquema(ESQUEMA_SEED_DEMO);
}, 120_000);

afterAll(async () => {
  await prisma.$disconnect();
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

  // modelo-datos (change `versionar-aviso-privacidad`) ·
  // Scenario: el seed de demostración siembra la versión
  //
  // ITERACIÓN 2 (hallazgos MEDIO-3 y MEDIO-4 de la etapa C): la reaceptación
  // solo se anota cuando la vigente es POSTERIOR a la de la constancia, así
  // que ya no puede colgar de la ficha sin versión. El seed deja los tres
  // casos que el panel tiene que saber pintar, cada uno en un negocio: la
  // versión vigente a secas, "versión no registrada" y la reaceptación.
  it("siembra la versión vigente y deja los tres casos del panel, cada uno coherente", async () => {
    const negocios = await prisma.negocio.findMany();

    const vigentes = negocios.filter(
      (n) => n.consintioAvisoVersion === VERSION_AVISO,
    );
    expect(vigentes.length).toBe(negocios.length - 2);
    for (const negocio of vigentes) {
      expect(negocio.reconsintioAvisoEn, negocio.nombre).toBeNull();
      expect(negocio.reconsintioAvisoVersion, negocio.nombre).toBeNull();
    }

    // 1) La ficha anterior al versionado: sin versión y SIN reaceptación
    //    ("no consta" no es comparable, así que un reenvío no le estrena
    //    evidencia).
    const sinVersion = negocios.filter((n) => n.consintioAvisoVersion === null);
    expect(sinVersion).toHaveLength(1);
    expect(sinVersion[0].reconsintioAvisoEn).toBeNull();
    expect(sinVersion[0].reconsintioAvisoVersion).toBeNull();

    // 2) La ficha con reaceptación: su constancia es de una versión ANTERIOR
    //    a la vigente, que es la única forma de que la reaceptación exista.
    const conReaceptacion = negocios.filter((n) => n.reconsintioAvisoEn !== null);
    expect(conReaceptacion).toHaveLength(1);
    const ficha = conReaceptacion[0];
    expect(ficha.reconsintioAvisoVersion).toBe(VERSION_AVISO);
    expect(
      versionAvisoEsPosterior(VERSION_AVISO, ficha.consintioAvisoVersion),
      "la reaceptación sembrada tiene que ser de una versión posterior",
    ).toBe(true);
    // Y llegó después de la constancia original, como en la operación real.
    expect(ficha.reconsintioAvisoEn!.getTime()).toBeGreaterThan(
      ficha.consintioAvisoEn.getTime(),
    );

    // La constancia nunca viaja a medias: la reaceptación está completa o no
    // está.
    for (const negocio of negocios) {
      expect(negocio.consintioAvisoEn).toBeInstanceOf(Date);
      expect(negocio.reconsintioAvisoEn === null).toBe(
        negocio.reconsintioAvisoVersion === null,
      );
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

  // ── Fotos sembradas (change `agregar-foto-negocio`, tasks.md #22) ──────────

  // Scenario: sembrar con fotos
  it("deja al menos un publicado con foto y al menos uno sin foto", async () => {
    const publicados = await prisma.negocio.findMany({ where: { estado: "publicado" } });
    const conFoto = publicados.filter((n) => n.fotoClave !== null);
    const sinFoto = publicados.filter((n) => n.fotoClave === null);

    expect(conFoto.length).toBeGreaterThanOrEqual(1);
    expect(sinFoto.length).toBeGreaterThanOrEqual(1);

    for (const negocio of conFoto) {
      // La referencia es una clave del servidor, no una URL.
      expect(esClaveFotoValida(negocio.fotoClave)).toBe(true);
      // Y sus dos variantes existen de verdad en el almacén.
      for (const variante of ["tarjeta", "ficha"] as const) {
        const bytes = await almacenDeFotos().leer(negocio.fotoClave as string, variante);
        expect(bytes, `${negocio.nombre}/${variante}`).not.toBeNull();
        expect((bytes as Buffer).length).toBeGreaterThan(0);
      }
    }
  });

  // Scenario: seed de demostración idempotente con fotos
  it("dos corridas dejan una sola foto por negocio y ningún archivo suelto", async () => {
    const antes = await prisma.negocio.findMany({
      where: { fotoClave: { not: null } },
      select: { whatsapp: true, fotoClave: true },
      orderBy: { whatsapp: "asc" },
    });
    const archivosAntes = await archivosDelAlmacen();

    await sembrarNegociosDemo(prisma, { NODE_ENV: "development" });

    const despues = await prisma.negocio.findMany({
      where: { fotoClave: { not: null } },
      select: { whatsapp: true, fotoClave: true },
      orderBy: { whatsapp: "asc" },
    });
    // Misma clave que antes: no se generó una foto nueva ni quedó la vieja.
    expect(despues).toEqual(antes);
    expect(await archivosDelAlmacen()).toEqual(archivosAntes);
  });

  // Scenario: nada de imágenes en el repositorio
  it("los archivos generados caen fuera del árbol versionado", async () => {
    const directorio = directorioDeFotos();
    expect(directorio.startsWith(path.join(raiz, "src"))).toBe(false);
    expect(directorio.startsWith(path.join(raiz, "public"))).toBe(false);
    expect(directorio.startsWith(path.join(raiz, "prisma"))).toBe(false);
    // Y lo que hay ahí son las variantes WebP que genera el servidor.
    for (const archivo of await archivosDelAlmacen()) {
      expect(archivo).toMatch(/^[0-9a-f]{32}\.(tarjeta|ficha)\.webp$/);
    }

    // El .gitignore del repo deja fuera el directorio por defecto.
    const gitignore = readFileSync(path.join(raiz, ".gitignore"), "utf8");
    expect(gitignore).toContain("/.fotos/");
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
      ["postgresql://usuario:clave@servidor:5432/enmirumbo", "postgresql"],
      ["postgres://usuario:clave@servidor:5432/enmirumbo", "postgres"],
      ["mysql://usuario:clave@servidor:3306/enmirumbo", "mysql"],
      ["prisma://accelerate.prisma-data.net/?api_key=xxx", "prisma accelerate"],
      ["libsql://enmirumbo.turso.io?authToken=xxx", "libsql remoto"],
      ["https://enmirumbo.example/db", "https"],
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

    it("sí siembra contra un PostgreSQL de esta máquina (ADR-004)", async () => {
      const resultado = await sembrarNegociosDemo(prisma, {
        NODE_ENV: "development",
        DATABASE_URL: "postgresql://postgres:postgres@localhost:51214/template1",
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
        DATABASE_URL: "  POSTGRESQL://postgres:postgres@LOCALHOST:51214/template1  ",
      });
      expect(resultado.sembrado).toBe(true);
    });

    it("una base remota solo se siembra con el permiso explícito", async () => {
      const resultado = await sembrarNegociosDemo(prisma, {
        NODE_ENV: "development",
        DATABASE_URL: "postgresql://usuario:clave@servidor:5432/enmirumbo",
        SEED_DEMO_PERMITIR: "1",
      });
      expect(resultado.sembrado).toBe(true);
    });

    it("el permiso explícito NO abre la puerta de producción", async () => {
      await prisma.negocio.deleteMany();
      const resultado = await sembrarNegociosDemo(prisma, {
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/enmirumbo",
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
