import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  VARIABLE_PERMISO_BACKFILL,
  rellenarTextoDeBusqueda,
} from "../prisma/backfill-busqueda";
import { seedCatalogos } from "../prisma/seed";
import { NEGOCIOS_DEMO, sembrarNegociosDemo } from "../prisma/seed-demo";
import type { PrismaClient } from "../src/generated/prisma/client";
import { datosDeBusqueda } from "../src/lib/busqueda";
import { reiniciarLimitePorIp } from "../src/lib/registro/limite-ip";
import { procesarRegistro } from "../src/lib/registro/procesar";
import { crearClientePrueba } from "./db";
import { VERSION_AVISO } from "../src/lib/legales/version";
import { CAMPO_VERSION_AVISO } from "../src/lib/registro/textos";

/**
 * Change `agregar-buscador`, tasks.md #3 a #7.
 *
 * Spec `modelo-datos` · requirement "El negocio guarda una versión
 * normalizada de su nombre y de '¿Qué ofreces?' para el buscador" y
 * requirement "Seed de negocios ficticios para desarrollo..." (MODIFIED).
 * Spec `registro-negocio` · requirement "El alta deja la ficha lista para el
 * buscador".
 *
 * Datos 100% ficticios (repo público + LFPDPPP): WhatsApp de la serie
 * reservada `771999xxxx`.
 */

const IP = "203.0.113.44"; // TEST-NET-3, reservado para documentación

let prisma: PrismaClient;
let categoriaId: number;
let coloniaId: number;

/** FormData equivalente al que manda el navegador. */
function envio(campos: Record<string, string> = {}): FormData {
  const formData = new FormData();
  const base: Record<string, string> = {
    nombre: "Plomería Güicho (ficticia)",
    categoriaId: String(categoriaId),
    whatsapp: "7719994101",
    coloniaId: String(coloniaId),
    consentimiento: "on",
    // Campo oculto con la versión del aviso que pintó el formulario
    // (change `versionar-aviso-privacidad`): sin él, el envío se rechaza.
    [CAMPO_VERSION_AVISO]: VERSION_AVISO,
    ...campos,
  };
  for (const [clave, valor] of Object.entries(base)) {
    if (valor !== "") formData.append(clave, valor);
  }
  return formData;
}

/**
 * Negocios cuyas columnas de búsqueda NO son el reflejo exacto de sus campos
 * fuente. Devuelve la lista (y no un booleano) para poder probar que la red
 * de verdad atrapa a un intruso, no solo que hoy pasa (design.md §1).
 */
function inconsistentes(
  negocios: Array<{
    nombre: string;
    queOfreces: string | null;
    nombreNormalizado: string;
    queOfrecesNormalizado: string;
  }>,
): string[] {
  return negocios
    .filter((negocio) => {
      const esperado = datosDeBusqueda(negocio.nombre, negocio.queOfreces);
      return (
        negocio.nombreNormalizado !== esperado.nombreNormalizado ||
        negocio.queOfrecesNormalizado !== esperado.queOfrecesNormalizado
      );
    })
    .map((negocio) => negocio.nombre);
}

beforeAll(async () => {
  prisma = crearClientePrueba();
  await prisma.negocio.deleteMany();
  await seedCatalogos(prisma);
  categoriaId = (
    await prisma.categoria.findUniqueOrThrow({ where: { slug: "servicios-del-hogar" } })
  ).id;
  coloniaId = (
    await prisma.colonia.findUniqueOrThrow({ where: { slug: "haciendas-de-tizayuca" } })
  ).id;
  reiniciarLimitePorIp();
});

afterAll(async () => {
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: "771999" } } });
  await prisma.$disconnect();
});

describe("modelo-datos · columnas normalizadas en la base (tasks #3)", () => {
  it("el cliente de Prisma expone los dos campos y arrancan vacíos, no nulos", async () => {
    const creado = await prisma.negocio.create({
      data: {
        nombre: "Ferretería Sin Normalizar (ficticia)",
        categoriaId,
        whatsapp: "7719994001",
        consintioAvisoEn: new Date("2026-07-31T10:00:00.000Z"),
      },
      select: { nombreNormalizado: true, queOfrecesNormalizado: true },
    });
    // El default "" es lo que permite migrar filas ya guardadas (design.md §1).
    expect(creado.nombreNormalizado).toBe("");
    expect(creado.queOfrecesNormalizado).toBe("");
    await prisma.negocio.delete({ where: { whatsapp: "7719994001" } });
  });
});

describe("registro-negocio · el alta deja la ficha lista para el buscador (tasks #4)", () => {
  // Scenario: registro con acentos, encontrable después
  it("guarda el nombre y el '¿Qué ofreces?' normalizados", async () => {
    reiniciarLimitePorIp();
    const resultado = await procesarRegistro(
      envio({ queOfreces: "Destape de drenajes y BOMBAS de agua" }),
      { prisma, ip: IP },
    );
    expect(resultado.exito).toBe(true);

    const creado = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: "7719994101" },
    });
    expect(creado.nombreNormalizado).toBe("plomeria guicho ficticia");
    expect(creado.queOfrecesNormalizado).toBe("destape de drenajes y bombas de agua");
    // Los textos originales se guardan tal como los escribió el negocio.
    expect(creado.nombre).toBe("Plomería Güicho (ficticia)");
  });

  // Scenario (modelo-datos): negocio sin "¿Qué ofreces?"
  it("un alta sin '¿Qué ofreces?' queda con cadena vacía, no nula", async () => {
    reiniciarLimitePorIp();
    const resultado = await procesarRegistro(
      envio({ nombre: "Cerrajería Sin Palabras (ficticia)", whatsapp: "7719994102" }),
      { prisma, ip: IP },
    );
    expect(resultado.exito).toBe(true);

    const creado = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: "7719994102" },
    });
    expect(creado.queOfreces).toBeNull();
    expect(creado.queOfrecesNormalizado).toBe("");
  });

  // Scenario: el cliente no puede fijar el texto de búsqueda
  it("ignora los campos extra que pretendan fijar el texto de búsqueda", async () => {
    reiniciarLimitePorIp();
    const resultado = await procesarRegistro(
      envio({
        nombre: "Estética Impostora (ficticia)",
        whatsapp: "7719994103",
        queOfreces: "Corte y tinte",
        nombreNormalizado: "plomero gratis urgente",
        queOfrecesNormalizado: "plomero tacos futbol doctor",
      }),
      { prisma, ip: IP },
    );
    expect(resultado.exito).toBe(true);

    const creado = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: "7719994103" },
    });
    expect(creado.nombreNormalizado).toBe("estetica impostora ficticia");
    expect(creado.queOfrecesNormalizado).toBe("corte y tinte");
  });
});

describe("modelo-datos · relleno de las fichas que ya existían (tasks #5)", () => {
  // Scenario: las fichas que ya existían quedan encontrables
  it("llena las columnas en blanco de las filas previas", async () => {
    await prisma.negocio.create({
      data: {
        nombre: "Panadería Antigua (ficticia)",
        queOfreces: "Pan de muerto, conchas y café",
        categoriaId,
        whatsapp: "7719994201",
        consintioAvisoEn: new Date("2026-07-31T10:00:00.000Z"),
      },
    });

    const primera = await rellenarTextoDeBusqueda(prisma);
    expect(primera.actualizados).toBeGreaterThanOrEqual(1);
    expect(primera.mensaje).toContain(String(primera.actualizados));

    const rellenado = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: "7719994201" },
    });
    expect(rellenado.nombreNormalizado).toBe("panaderia antigua ficticia");
    expect(rellenado.queOfrecesNormalizado).toBe("pan de muerto conchas y cafe");
  });

  // Iteración 2 · hallazgo B-1 de la etapa C: el relleno escribe en TODAS las
  // filas de la base a la que apunte `DATABASE_URL`, igual que el seed de
  // demostración, así que lleva la misma clase de guarda.
  describe("guarda de entorno del relleno (B-1)", () => {
    it.each([
      ["producción por NODE_ENV", { NODE_ENV: "production" }],
      ["producción con mayúscula y espacios", { NODE_ENV: " Production " }],
      ["producción en Vercel", { VERCEL_ENV: "production" }],
      ["base remota de Postgres", { DATABASE_URL: "postgresql://u:c@host:5432/necesitouno" }],
      ["base remota de Prisma", { DATABASE_URL: "prisma://accelerate.prisma-data.net/?api_key=x" }],
      ["base remota de libsql", { DATABASE_URL: "libsql://necesitouno.turso.io?authToken=x" }],
      ["dirección ilegible", { DATABASE_URL: "no-es-una-url" }],
    ])("no rellena en %s y lo dice", async (_caso, env) => {
      const antes = await prisma.negocio.findMany({ orderBy: { whatsapp: "asc" } });

      const resultado = await rellenarTextoDeBusqueda(prisma, env);
      expect(resultado.rellenado).toBe(false);
      expect(resultado.actualizados).toBe(0);
      expect(resultado.mensaje).toContain(VARIABLE_PERMISO_BACKFILL);

      expect(await prisma.negocio.findMany({ orderBy: { whatsapp: "asc" } })).toEqual(
        antes,
      );
    });

    it.each([
      ["localhost", "postgresql://postgres:postgres@localhost:51214/template1"],
      ["127.0.0.1", "postgresql://postgres:postgres@127.0.0.1:5432/necesitouno"],
      ["IPv6 local", "postgresql://postgres:postgres@[::1]:5432/necesitouno"],
      ["esquema postgres://", "postgres://postgres:postgres@localhost:5432/necesitouno"],
      ["mayúsculas y espacios", "  POSTGRESQL://postgres@LOCALHOST:5432/necesitouno  "],
    ])("sí rellena contra un PostgreSQL de esta máquina (%s)", async (_caso, url) => {
      const resultado = await rellenarTextoDeBusqueda(prisma, {
        NODE_ENV: "development",
        DATABASE_URL: url,
      });
      expect(resultado.rellenado).toBe(true);
    });

    // A diferencia del seed de demostración —que NUNCA debe correr en
    // producción, ni con permiso—, el relleno sí hace falta ahí: es lo que
    // deja encontrables las fichas que ya existían cuando se aplicó la
    // migración. Por eso el permiso explícito sí abre esa puerta.
    it("con el permiso explícito sí corre, incluso en producción", async () => {
      const enProduccion = await rellenarTextoDeBusqueda(prisma, {
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://u:c@host:5432/necesitouno",
        [VARIABLE_PERMISO_BACKFILL]: "1",
      });
      expect(enProduccion.rellenado).toBe(true);
    });
  });

  // Scenario: el relleno se puede repetir
  it("correrlo dos veces no cambia nada ni toca otros campos", async () => {
    const antes = await prisma.negocio.findMany({ orderBy: { whatsapp: "asc" } });

    const segunda = await rellenarTextoDeBusqueda(prisma);
    expect(segunda.actualizados).toBe(0);

    const despues = await prisma.negocio.findMany({ orderBy: { whatsapp: "asc" } });
    expect(despues).toEqual(antes);
  });
});

describe("modelo-datos · seed de demostración con giros (tasks #6)", () => {
  beforeAll(async () => {
    await prisma.negocio.deleteMany();
    await sembrarNegociosDemo(prisma, { NODE_ENV: "test" });
  });

  // Scenario: fixtures con acentos
  it("cada negocio sembrado queda con sus columnas normalizadas escritas", async () => {
    const negocios = await prisma.negocio.findMany();
    expect(negocios).toHaveLength(NEGOCIOS_DEMO.length);
    expect(inconsistentes(negocios)).toEqual([]);

    const conAcentos = negocios.filter(
      (n) =>
        n.estado === "publicado" &&
        /[áéíóúñÁÉÍÓÚÑ]/.test(`${n.nombre} ${n.queOfreces ?? ""}`),
    );
    expect(conAcentos.length).toBeGreaterThan(0);
    for (const negocio of conAcentos) {
      expect(negocio.nombreNormalizado).not.toMatch(/[áéíóúñ]/);
      expect(negocio.queOfrecesNormalizado).not.toMatch(/[áéíóúñ]/);
    }
  });

  // Scenario: fixtures para la búsqueda por giro
  it("al menos un publicado tiene giros y uno de ellos no está en su texto", async () => {
    const publicados = await prisma.negocio.findMany({
      where: { estado: "publicado" },
      include: { giros: true },
    });
    const conGiros = publicados.filter((n) => n.giros.length > 0);
    expect(conGiros.length).toBeGreaterThanOrEqual(2);

    // El caso que de verdad demuestra la búsqueda por giro (design.md §3):
    // alguna palabra buscable del giro NO está ni en el nombre ni en "¿Qué
    // ofreces?", así que solo se puede llegar a ese negocio por su giro.
    const soloPorGiro = conGiros.filter((negocio) =>
      negocio.giros.some((giro) =>
        giro.slug
          .split("-")
          .some(
            (palabra) =>
              palabra.length >= 5 &&
              !negocio.nombreNormalizado.includes(palabra) &&
              !negocio.queOfrecesNormalizado.includes(palabra),
          ),
      ),
    );
    expect(soloPorGiro.map((n) => n.nombre)).toContain("Fonda Doña Cuquita (ficticia)");
  });

  // Scenario: seed de demostración idempotente
  it("correrlo dos veces no duplica negocios ni vínculos de giro", async () => {
    const antes = await prisma.negocio.findMany({
      include: { giros: { select: { slug: true } } },
      orderBy: { whatsapp: "asc" },
    });

    await sembrarNegociosDemo(prisma, { NODE_ENV: "test" });

    const despues = await prisma.negocio.findMany({
      include: { giros: { select: { slug: true } } },
      orderBy: { whatsapp: "asc" },
    });
    expect(despues).toHaveLength(antes.length);
    for (const negocio of despues) {
      const slugs = negocio.giros.map((g) => g.slug);
      expect(new Set(slugs).size, negocio.nombre).toBe(slugs.length);
    }
    expect(despues).toEqual(antes);
  });
});

describe("modelo-datos · valores consistentes con su origen (tasks #7)", () => {
  // Scenario: valores consistentes con su origen
  it("toda la base cumple que lo guardado es datosDeBusqueda de sus fuentes", async () => {
    reiniciarLimitePorIp();
    await procesarRegistro(
      envio({ nombre: "Tortería Recién Dada de Alta", whatsapp: "7719994301" }),
      { prisma, ip: IP },
    );

    const negocios = await prisma.negocio.findMany();
    expect(negocios.length).toBeGreaterThan(NEGOCIOS_DEMO.length);
    expect(inconsistentes(negocios)).toEqual([]);
  });

  // La red que protege al buscador de una escritura futura que se salte
  // `datosDeBusqueda`: si alguien crea un negocio por otro camino, se ve.
  it("señala un negocio creado por un camino que no usa datosDeBusqueda", async () => {
    await prisma.negocio.create({
      data: {
        nombre: "Vulcanizadora Colada (ficticia)",
        queOfreces: "Parches y montaje",
        categoriaId,
        whatsapp: "7719994401",
        consintioAvisoEn: new Date("2026-07-31T10:00:00.000Z"),
      },
    });

    const negocios = await prisma.negocio.findMany();
    expect(inconsistentes(negocios)).toEqual(["Vulcanizadora Colada (ficticia)"]);

    await prisma.negocio.delete({ where: { whatsapp: "7719994401" } });
    expect(inconsistentes(await prisma.negocio.findMany())).toEqual([]);
  });
});
