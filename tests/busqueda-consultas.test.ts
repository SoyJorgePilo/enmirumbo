import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import type { PrismaClient } from "../src/generated/prisma/client";
import { datosDeBusqueda } from "../src/lib/busqueda";
import { buscarNegociosPublicados } from "../src/lib/directorio";
import { obtenerPrisma } from "../src/lib/prisma";
import { crearClientePrueba } from "./db";

/**
 * Change `agregar-buscador`, tasks.md #8.
 *
 * Spec `directorio-publico` · requirements "La búsqueda cubre nombre,
 * palabras clave y giros, y solo lo publicado", "Coincidencia insensible a
 * mayúsculas y acentos, y parcial por raíz de la palabra" y "Página de
 * resultados..." (la parte del orden determinista).
 *
 * Fixtures propias en vez del seed de demostración: la búsqueda se prueba
 * mejor con un conjunto chico y con fechas controladas. TODO es ficticio
 * (repo público + LFPDPPP): la serie de WhatsApp `7719998xxx` es exclusiva de
 * este archivo y se borra al terminar.
 */

const PREFIJO = "7719998";

type Fixture = {
  whatsapp: string;
  nombre: string;
  categoriaSlug: string;
  queOfreces?: string;
  giros?: string[];
  estado?: "publicado" | "en_revision" | "rechazado";
  publicadoEn?: string;
};

/**
 * Todas menos la piñatería llevan "fictici*" en el nombre: eso da un término
 * ("ficti") que barre a todo el conjunto y deja ver el orden completo.
 */
const FIXTURES: Fixture[] = [
  {
    whatsapp: `${PREFIJO}001`,
    nombre: "Plomería Los Ándeles (ficticia)",
    categoriaSlug: "servicios-del-hogar",
    queOfreces: "Destape de drenajes y bombas de agua.",
    giros: ["plomeria"],
    publicadoEn: "2026-08-15T10:00:00.000Z",
  },
  {
    whatsapp: `${PREFIJO}002`,
    // A propósito SIN acento: "plomero" tiene que encontrar a los dos.
    nombre: "El Tubo Ficticio",
    categoriaSlug: "servicios-del-hogar",
    queOfreces: "Reparacion de plomeria, boilers y calentadores.",
    // Sin giros: el admin todavía no lo revisó (scenario "negocio publicado
    // sin giros").
    publicadoEn: "2026-08-12T10:00:00.000Z",
  },
  {
    whatsapp: `${PREFIJO}003`,
    // Ni el nombre ni "¿Qué ofreces?" dicen "comida": solo su giro lo dice.
    nombre: "Fonda Sazón de Mamá (ficticia)",
    categoriaSlug: "restaurantes-y-fondas",
    queOfreces: "Guisados caseros y agua fresca de sabor.",
    giros: ["fonda-comida-corrida"],
    publicadoEn: "2026-08-10T10:00:00.000Z",
  },
  {
    whatsapp: `${PREFIJO}004`,
    nombre: "Academia de Fútbol Rayos (ficticia)",
    categoriaSlug: "clubes-y-escuelas-deportivas",
    queOfreces: "Fútbol infantil de 6 a 12 años.",
    giros: ["futbol"],
    publicadoEn: "2026-08-08T10:00:00.000Z",
  },
  {
    whatsapp: `${PREFIJO}005`,
    nombre: "Liga de Veteranos Ficticia",
    categoriaSlug: "clubes-y-escuelas-deportivas",
    // Coincide con "futbol" pero no con "infantil".
    queOfreces: "Futbol para adultos los domingos.",
    publicadoEn: "2026-08-07T10:00:00.000Z",
  },
  {
    whatsapp: `${PREFIJO}006`,
    nombre: "Piñatería Fiesta Inventada",
    categoriaSlug: "abarrotes-y-comercio",
    queOfreces: "Piñatas personalizadas y dulceros.",
    publicadoEn: "2026-08-06T10:00:00.000Z",
  },
  {
    whatsapp: `${PREFIJO}007`,
    nombre: "Plomería Escondida (ficticia)",
    categoriaSlug: "servicios-del-hogar",
    queOfreces: "Plomería y destapes, todavía en revisión.",
    giros: ["plomeria"],
    estado: "en_revision",
  },
  {
    whatsapp: `${PREFIJO}008`,
    nombre: "Plomería Rechazada (ficticia)",
    categoriaSlug: "servicios-del-hogar",
    queOfreces: "Plomería que el admin rechazó.",
    giros: ["plomeria"],
    estado: "rechazado",
  },
  {
    whatsapp: `${PREFIJO}009`,
    // Mismo instante de publicación que la plomería: desempata el nombre.
    nombre: "Taquería Tres Hermanos Ficticia",
    categoriaSlug: "restaurantes-y-fondas",
    publicadoEn: "2026-08-15T10:00:00.000Z",
  },
];

let prisma: PrismaClient;

const nombresDe = async (consulta: string) =>
  (await buscarNegociosPublicados(consulta)).map((negocio) => negocio.nombre);

beforeAll(async () => {
  prisma = crearClientePrueba();
  await prisma.negocio.deleteMany();
  await seedCatalogos(prisma);

  for (const fixture of FIXTURES) {
    const categoria = await prisma.categoria.findUniqueOrThrow({
      where: { slug: fixture.categoriaSlug },
    });
    await prisma.negocio.create({
      data: {
        nombre: fixture.nombre,
        queOfreces: fixture.queOfreces ?? null,
        ...datosDeBusqueda(fixture.nombre, fixture.queOfreces),
        categoriaId: categoria.id,
        whatsapp: fixture.whatsapp,
        estado: fixture.estado ?? "publicado",
        origen: "siembra",
        publicadoEn: fixture.publicadoEn ? new Date(fixture.publicadoEn) : null,
        consintioAvisoEn: new Date("2026-07-31T10:00:00.000Z"),
        registradoEn: new Date("2026-07-31T10:00:00.000Z"),
        giros: { connect: (fixture.giros ?? []).map((slug) => ({ slug })) },
      },
    });
  }
});

afterAll(async () => {
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
  await prisma.$disconnect();
});

describe("directorio-publico · qué encuentra la búsqueda (tasks #8)", () => {
  // Scenario: "plomero" encuentra a "plomería"
  it('"plomero" encuentra al de "plomería" y al de "plomeria"', async () => {
    expect(await nombresDe("plomero")).toEqual([
      "Plomería Los Ándeles (ficticia)",
      "El Tubo Ficticio",
    ]);
  });

  // Scenario: mayúsculas y acentos dan igual
  it('"PLOMERÍA", "plomeria" y "Plomería" devuelven lo mismo', async () => {
    const conAcento = await nombresDe("PLOMERÍA");
    expect(await nombresDe("plomeria")).toEqual(conAcento);
    expect(await nombresDe("Plomería")).toEqual(conAcento);
    expect(conAcento).toEqual([
      "Plomería Los Ándeles (ficticia)",
      "El Tubo Ficticio",
    ]);
  });

  // Scenario: encuentra por nombre del negocio
  it("encuentra por una palabra del nombre aunque no esté en las palabras clave", async () => {
    // "Taquería Tres Hermanos Ficticia" no tiene "¿Qué ofreces?" ni giros.
    expect(await nombresDe("taqueria")).toEqual(["Taquería Tres Hermanos Ficticia"]);
  });

  // Scenario: encuentra por palabras clave aunque la categoría sea otra
  it("encuentra por las palabras clave de '¿Qué ofreces?'", async () => {
    expect(await nombresDe("drenajes")).toEqual(["Plomería Los Ándeles (ficticia)"]);
    expect(await nombresDe("boilers")).toEqual(["El Tubo Ficticio"]);
  });

  // Scenario: encuentra por giro asignado por el admin
  it('"comida" encuentra a la fonda por su giro, no por su texto', async () => {
    const fonda = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: `${PREFIJO}003` },
    });
    expect(fonda.nombreNormalizado).not.toContain("comid");
    expect(fonda.queOfrecesNormalizado).not.toContain("comid");

    expect(await nombresDe("comida")).toEqual(["Fonda Sazón de Mamá (ficticia)"]);
    expect(await nombresDe("comida corrida")).toEqual(["Fonda Sazón de Mamá (ficticia)"]);
  });

  // Scenario: negocio publicado sin giros
  it("un publicado sin giros se sigue encontrando por nombre y palabras clave", async () => {
    const sinGiros = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: `${PREFIJO}002` },
      include: { giros: true },
    });
    expect(sinGiros.giros).toHaveLength(0);
    expect(await nombresDe("tubo")).toEqual(["El Tubo Ficticio"]);
  });

  // Scenario: "futbol" encuentra al club de "fútbol"
  it('"futbol" encuentra al club que escribió "fútbol"', async () => {
    expect(await nombresDe("futbol")).toEqual([
      "Academia de Fútbol Rayos (ficticia)",
      "Liga de Veteranos Ficticia",
    ]);
  });

  // Scenario: la "ñ" no rompe la búsqueda
  it('"pinatas" encuentra al de "piñatas"', async () => {
    expect(await nombresDe("pinatas")).toEqual(["Piñatería Fiesta Inventada"]);
    expect(await nombresDe("piñatas")).toEqual(["Piñatería Fiesta Inventada"]);
  });

  // Scenario: varias palabras se exigen todas
  it("con varias palabras solo vuelve el que coincide con todas", async () => {
    expect(await nombresDe("futbol infantil")).toEqual([
      "Academia de Fútbol Rayos (ficticia)",
    ]);
    // Los términos se pueden repartir entre campos distintos: "plomeria" está
    // en el nombre y "drenajes" en las palabras clave.
    expect(await nombresDe("plomeria drenajes")).toEqual([
      "Plomería Los Ándeles (ficticia)",
    ]);
    expect(await nombresDe("futbol tacos")).toEqual([]);
  });

  // Consecuencia asumida de la raíz de 5 (design.md §2): sin ranking ni
  // sinónimos, dos palabras que comparten raíz se confunden. Se documenta
  // aquí para que el día que alguien cambie la regla, se vea qué se rompe.
  it('la raíz de 5 confunde palabras parecidas ("veterinario" pega con "veteranos")', async () => {
    expect(await nombresDe("veterinario")).toEqual(["Liga de Veteranos Ficticia"]);
  });
});

describe("directorio-publico · la búsqueda solo devuelve lo publicado (tasks #8)", () => {
  // Scenario: los negocios no publicados nunca aparecen
  it("ni el en_revision ni el rechazado vuelven, aunque coincidan", async () => {
    const encontrados = await nombresDe("plomeria");
    expect(encontrados).not.toContain("Plomería Escondida (ficticia)");
    expect(encontrados).not.toContain("Plomería Rechazada (ficticia)");

    // Tampoco por su giro ni por una palabra exclusiva suya.
    expect(await nombresDe("revision")).toEqual([]);
    expect(await nombresDe("rechazo")).toEqual([]);
  });
});

describe("directorio-publico · orden y proyección de la búsqueda (tasks #8)", () => {
  // Scenario: orden determinista
  it("ordena por publicación reciente y desempata por nombre", async () => {
    const esperado = [
      "Plomería Los Ándeles (ficticia)", // 08-15, empata y gana por nombre
      "Taquería Tres Hermanos Ficticia", // 08-15
      "El Tubo Ficticio", // 08-12
      "Fonda Sazón de Mamá (ficticia)", // 08-10
      "Academia de Fútbol Rayos (ficticia)", // 08-08
      "Liga de Veteranos Ficticia", // 08-07
    ];
    expect(await nombresDe("ficticia")).toEqual(esperado);
    // El mismo orden cada vez que se repite la búsqueda.
    expect(await nombresDe("ficticia")).toEqual(esperado);
  });

  it("devuelve los mismos campos públicos que el listado, sin las columnas del buscador", async () => {
    const [negocio] = await buscarNegociosPublicados("taqueria");
    expect(Object.keys(negocio).sort()).toEqual(
      [
        "coloniaNombre",
        "coloniaSlug",
        "entregaADomicilio",
        "fotoClave",
        "id",
        "nombre",
        "whatsapp",
      ].sort(),
    );
  });
});

describe("directorio-publico · consulta sin nada buscable (tasks #8)", () => {
  // Scenario: consulta vacía o de puros espacios / caracteres comodín
  it.each(["", "   ", "%", "_", "%_%", "🎉", "!!!", "a"])(
    "la consulta %j devuelve lista vacía sin tocar la base",
    async (consulta) => {
      const espia = vi.spyOn(obtenerPrisma().negocio, "findMany");
      expect(await buscarNegociosPublicados(consulta)).toEqual([]);
      expect(espia).not.toHaveBeenCalled();
      espia.mockRestore();
    },
  );
});
