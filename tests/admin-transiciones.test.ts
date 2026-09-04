import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import type { PrismaClient } from "../src/generated/prisma/client";
import { LIMITE_GIROS, aprobarRegistro, rechazarRegistro } from "../src/lib/admin/transiciones";
import { obtenerNegociosPublicados } from "../src/lib/directorio";
import { crearClientePrueba } from "./db";

// Spec: revision-admin · Requirements "Aprobar asigna giros, normaliza la
// colonia, marca el origen y publica la ficha", "Rechazar exige motivo, lo
// guarda con su fecha y ofrece avisar por WhatsApp" y "Una transición solo se
// aplica sobre un registro que sigue en revisión" (tasks.md #17, #20, #21).
//
// Datos 100% ficticios (repo público + LFPDPPP): serie de pruebas 7719992xxx.

const AHORA = new Date("2026-09-03T12:00:00.000Z");
const PREFIJO = "7719992";

let prisma: PrismaClient;
let categoriaId: number;
let coloniaId: number;
let otraColoniaId: number;
let girosIds: number[];

beforeAll(async () => {
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (
    await prisma.categoria.findUniqueOrThrow({ where: { slug: "servicios-del-hogar" } })
  ).id;
  coloniaId = (
    await prisma.colonia.findUniqueOrThrow({ where: { slug: "haciendas-de-tizayuca" } })
  ).id;
  otraColoniaId = (
    await prisma.colonia.findUniqueOrThrow({ where: { slug: "atempa" } })
  ).id;
  girosIds = (await prisma.giro.findMany({ orderBy: { id: "asc" }, take: 5 })).map(
    (giro) => giro.id,
  );
});

afterAll(async () => {
  await prisma.negocio.deleteMany();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.negocio.deleteMany();
});

const DATOS_CAPTURADOS = {
  nombre: "Plomería Ficticia El Tubo Feliz",
  whatsapp: `${PREFIJO}001`,
  queOfreces: "Destape de drenajes inventado.",
  telefonoFijo: "7717772001",
  direccion: "Calle Inventada 12",
  horario: "L-S 9am-7pm",
  facebookUrl: "https://www.facebook.com/tuboficticio",
};

async function altaEnRevision(extra: Record<string, unknown> = {}) {
  return prisma.negocio.create({
    data: {
      ...DATOS_CAPTURADOS,
      categoriaId,
      coloniaId,
      consintioAvisoEn: new Date("2026-09-01T09:00:00.000Z"),
      registradoEn: new Date("2026-09-01T09:00:00.000Z"),
      ...extra,
    },
  });
}

const leer = (id: string) =>
  prisma.negocio.findUniqueOrThrow({ where: { id }, include: { giros: true } });

describe("revision-admin · aprobar publica la ficha", () => {
  // Scenario: aprobación completa
  it("con 2 giros y origen orgánico deja la ficha publicada y visible en el listado", async () => {
    const creado = await altaEnRevision();

    const resultado = await aprobarRegistro(
      prisma,
      creado.id,
      { girosIds: girosIds.slice(0, 2), coloniaId: null, origen: "organico" },
      AHORA,
    );

    expect(resultado).toEqual({ resultado: "aprobado" });

    const negocio = await leer(creado.id);
    expect(negocio.estado).toBe("publicado");
    expect(negocio.publicadoEn?.toISOString()).toBe(AHORA.toISOString());
    expect(negocio.origen).toBe("organico");
    expect(negocio.giros.map((giro) => giro.id).sort()).toEqual(
      girosIds.slice(0, 2).sort(),
    );

    const listado = await obtenerNegociosPublicados("servicios-del-hogar");
    expect(listado.map((n) => n.id)).toContain(creado.id);
  });

  // Scenario: aprobación sin giros
  it("sin ningún giro se publica igual", async () => {
    const creado = await altaEnRevision();
    const resultado = await aprobarRegistro(
      prisma,
      creado.id,
      { girosIds: [], coloniaId: null, origen: "organico" },
      AHORA,
    );

    expect(resultado).toEqual({ resultado: "aprobado" });
    const negocio = await leer(creado.id);
    expect(negocio.estado).toBe("publicado");
    expect(negocio.giros).toEqual([]);
  });

  // Scenario: más de tres giros
  it("con 4 giros no publica nada y devuelve el error de giros", async () => {
    const creado = await altaEnRevision();
    const resultado = await aprobarRegistro(
      prisma,
      creado.id,
      { girosIds: girosIds.slice(0, 4), coloniaId: null, origen: "organico" },
      AHORA,
    );

    expect(resultado).toEqual({ resultado: "error", error: "giros" });
    const negocio = await leer(creado.id);
    expect(negocio.estado).toBe("en_revision");
    expect(negocio.publicadoEn).toBeNull();
    expect(negocio.giros).toEqual([]);
    expect(LIMITE_GIROS).toBe(3);
  });

  /**
   * Hallazgo MEDIO 1 de la etapa C: un id que no cabe en el entero de 64 bits
   * de la columna hace que Prisma LANCE en vez de decir "no existe", y dentro
   * de una Server Action eso es un 500. La cota vive en el borde
   * (`accion-aprobar.ts`) y también aquí, para cualquier otro llamador.
   */
  it.each([
    ["desbordado", 99_999_999_999_999_999_999],
    ["negativo", -1],
    ["cero", 0],
    ["decimal", 1.5],
    ["infinito", Number.POSITIVE_INFINITY],
    ["NaN", Number.NaN],
  ])("un id de giro %s se rechaza sin llegar a la base", async (etiqueta, giroId) => {
    const creado = await altaEnRevision();
    const resultado = await aprobarRegistro(
      prisma,
      creado.id,
      { girosIds: [giroId], coloniaId: null, origen: "organico" },
      AHORA,
    );

    expect(resultado, etiqueta).toEqual({ resultado: "error", error: "giros" });
    expect((await leer(creado.id)).estado).toBe("en_revision");
  });

  it("una colonia con un id desbordado se rechaza sin llegar a la base", async () => {
    const creado = await altaEnRevision();
    const resultado = await aprobarRegistro(
      prisma,
      creado.id,
      { girosIds: [], coloniaId: 99_999_999_999_999_999_999, origen: "organico" },
      AHORA,
    );

    expect(resultado).toEqual({ resultado: "error", error: "colonia" });
    expect((await leer(creado.id)).estado).toBe("en_revision");
  });

  it("un giro que no está en el catálogo tampoco publica nada", async () => {
    const creado = await altaEnRevision();
    const resultado = await aprobarRegistro(
      prisma,
      creado.id,
      { girosIds: [999_999], coloniaId: null, origen: "organico" },
      AHORA,
    );

    expect(resultado).toEqual({ resultado: "error", error: "giros" });
    expect((await leer(creado.id)).estado).toBe("en_revision");
  });

  // Scenario: aprobar sin normalizar la colonia pendiente
  it("con colonia 'Otra' sin elegir del catálogo no publica y pide la colonia", async () => {
    const creado = await altaEnRevision({
      coloniaId: null,
      coloniaOtra: "Rinconada del Venado (inventada)",
    });

    const resultado = await aprobarRegistro(
      prisma,
      creado.id,
      { girosIds: [], coloniaId: null, origen: "organico" },
      AHORA,
    );

    expect(resultado).toEqual({ resultado: "error", error: "colonia" });
    expect((await leer(creado.id)).estado).toBe("en_revision");
  });

  // Scenario: normalizar la colonia "Otra"
  it("al elegir una colonia del catálogo, el negocio queda vinculado a esa colonia", async () => {
    const creado = await altaEnRevision({
      coloniaId: null,
      coloniaOtra: "Rinconada del Venado (inventada)",
    });

    const resultado = await aprobarRegistro(
      prisma,
      creado.id,
      { girosIds: [], coloniaId: otraColoniaId, origen: "organico" },
      AHORA,
    );

    expect(resultado).toEqual({ resultado: "aprobado" });
    const negocio = await leer(creado.id);
    expect(negocio.estado).toBe("publicado");
    expect(negocio.coloniaId).toBe(otraColoniaId);
    // Lo que el negocio escribió se conserva: normalizar no es borrar.
    expect(negocio.coloniaOtra).toBe("Rinconada del Venado (inventada)");
  });

  it("una colonia que no está en el catálogo se rechaza como colonia inválida", async () => {
    const creado = await altaEnRevision({
      coloniaId: null,
      coloniaOtra: "Rinconada del Venado (inventada)",
    });
    const resultado = await aprobarRegistro(
      prisma,
      creado.id,
      { girosIds: [], coloniaId: 999_999, origen: "organico" },
      AHORA,
    );

    expect(resultado).toEqual({ resultado: "error", error: "colonia" });
    expect((await leer(creado.id)).estado).toBe("en_revision");
  });

  // Scenario: marcar el origen de siembra
  it("marca el origen de siembra cuando el admin lo elige", async () => {
    const creado = await altaEnRevision();
    await aprobarRegistro(
      prisma,
      creado.id,
      { girosIds: [], coloniaId: null, origen: "siembra" },
      AHORA,
    );
    expect((await leer(creado.id)).origen).toBe("siembra");
  });

  // Scenario: aprobar no edita los datos del negocio
  it("no toca ningún dato capturado por el negocio", async () => {
    const creado = await altaEnRevision();
    await aprobarRegistro(
      prisma,
      creado.id,
      { girosIds: girosIds.slice(0, 1), coloniaId: null, origen: "organico" },
      AHORA,
    );

    const negocio = await leer(creado.id);
    for (const [campo, valor] of Object.entries(DATOS_CAPTURADOS)) {
      expect(negocio[campo as keyof typeof negocio]).toBe(valor);
    }
    expect(negocio.consintioAvisoEn.toISOString()).toBe(
      creado.consintioAvisoEn.toISOString(),
    );
    expect(negocio.registradoEn.toISOString()).toBe(creado.registradoEn.toISOString());
  });

  it("un identificador que no existe no publica nada", async () => {
    const resultado = await aprobarRegistro(
      prisma,
      "no-existe-este-id",
      { girosIds: [], coloniaId: null, origen: "organico" },
      AHORA,
    );
    expect(resultado).toEqual({ resultado: "no-encontrado" });
  });
});

describe("revision-admin · rechazar guarda motivo y fecha", () => {
  // Scenario: rechazo con motivo
  it("guarda estado, fecha y motivo, y el registro sale de la cola", async () => {
    const creado = await altaEnRevision();
    const motivo = "El número no contesta y no pudimos confirmar que el negocio exista";

    const resultado = await rechazarRegistro(prisma, creado.id, motivo, AHORA);
    expect(resultado).toEqual({ resultado: "rechazado" });

    const negocio = await leer(creado.id);
    expect(negocio.estado).toBe("rechazado");
    expect(negocio.rechazadoEn?.toISOString()).toBe(AHORA.toISOString());
    expect(negocio.motivoRechazo).toBe(motivo);
    expect(negocio.publicadoEn).toBeNull();
  });

  // Scenario: rechazo sin motivo
  it.each([["vacío", ""], ["solo espacios", "   \n "]])(
    "con el motivo %s no cambia nada",
    async (_caso, motivo) => {
      const creado = await altaEnRevision();
      const resultado = await rechazarRegistro(prisma, creado.id, motivo, AHORA);

      expect(resultado).toEqual({ resultado: "error", error: "motivo" });
      const negocio = await leer(creado.id);
      expect(negocio.estado).toBe("en_revision");
      expect(negocio.rechazadoEn).toBeNull();
      expect(negocio.motivoRechazo).toBeNull();
    },
  );

  // Scenario: el rechazado no se publica
  it("un rechazado no aparece en el listado público", async () => {
    const creado = await altaEnRevision();
    await rechazarRegistro(prisma, creado.id, "No publicamos préstamos informales", AHORA);

    const listado = await obtenerNegociosPublicados("servicios-del-hogar");
    expect(listado.map((n) => n.id)).not.toContain(creado.id);
  });

  it("recorta un motivo desmedido en vez de guardarlo entero", async () => {
    const creado = await altaEnRevision();
    await rechazarRegistro(prisma, creado.id, "x".repeat(5000), AHORA);
    const negocio = await leer(creado.id);
    expect(negocio.motivoRechazo?.length).toBeLessThanOrEqual(500);
  });
});

describe("revision-admin · una transición solo aplica sobre lo que sigue en revisión", () => {
  // Scenario: doble aprobación
  it("la segunda aprobación no pisa la primera y avisa que ya estaba resuelto", async () => {
    const creado = await altaEnRevision();
    await aprobarRegistro(
      prisma,
      creado.id,
      { girosIds: girosIds.slice(0, 2), coloniaId: null, origen: "organico" },
      AHORA,
    );
    const publicado = await leer(creado.id);

    const segunda = await aprobarRegistro(
      prisma,
      creado.id,
      { girosIds: girosIds.slice(2, 3), coloniaId: null, origen: "siembra" },
      new Date(AHORA.getTime() + 60_000),
    );

    expect(segunda).toEqual({ resultado: "ya-resuelto" });
    const despues = await leer(creado.id);
    expect(despues.publicadoEn?.toISOString()).toBe(publicado.publicadoEn?.toISOString());
    expect(despues.origen).toBe("organico");
    expect(despues.giros.map((g) => g.id).sort()).toEqual(girosIds.slice(0, 2).sort());
  });

  // Scenario: rechazar algo ya publicado
  it("rechazar un publicado no lo despublica ni guarda motivo", async () => {
    const creado = await altaEnRevision();
    await aprobarRegistro(
      prisma,
      creado.id,
      { girosIds: [], coloniaId: null, origen: "organico" },
      AHORA,
    );

    const resultado = await rechazarRegistro(prisma, creado.id, "Ya no me gustó", AHORA);

    expect(resultado).toEqual({ resultado: "ya-resuelto" });
    const negocio = await leer(creado.id);
    expect(negocio.estado).toBe("publicado");
    expect(negocio.motivoRechazo).toBeNull();
    expect(negocio.rechazadoEn).toBeNull();
  });

  it("aprobar algo ya rechazado tampoco lo publica", async () => {
    const creado = await altaEnRevision();
    await rechazarRegistro(prisma, creado.id, "Motivo ficticio", AHORA);

    const resultado = await aprobarRegistro(
      prisma,
      creado.id,
      { girosIds: [], coloniaId: null, origen: "organico" },
      AHORA,
    );

    expect(resultado).toEqual({ resultado: "ya-resuelto" });
    const negocio = await leer(creado.id);
    expect(negocio.estado).toBe("rechazado");
    expect(negocio.publicadoEn).toBeNull();
  });

  it("el doble rechazo conserva el motivo y la fecha originales", async () => {
    const creado = await altaEnRevision();
    await rechazarRegistro(prisma, creado.id, "Motivo original ficticio", AHORA);

    const segunda = await rechazarRegistro(
      prisma,
      creado.id,
      "Motivo distinto",
      new Date(AHORA.getTime() + 60_000),
    );

    expect(segunda).toEqual({ resultado: "ya-resuelto" });
    const negocio = await leer(creado.id);
    expect(negocio.motivoRechazo).toBe("Motivo original ficticio");
    expect(negocio.rechazadoEn?.toISOString()).toBe(AHORA.toISOString());
  });
});
