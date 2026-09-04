import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  LIMITE_GIROS,
  LIMITE_MOTIVO_DESPUBLICACION,
  LIMITE_MOTIVO_RECHAZO,
  aprobarRegistro,
  borrarNegocio,
  despublicarFicha,
  rechazarRegistro,
} from "../src/lib/admin/transiciones";
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

// ── Despublicar y borrado definitivo (change agregar-despublicar-y-borrado-arco) ──

/** Deja el negocio publicado, que es de donde parte toda despublicación. */
async function altaPublicada(extra: Record<string, unknown> = {}) {
  const creado = await altaEnRevision(extra);
  await aprobarRegistro(
    prisma,
    creado.id,
    { girosIds: girosIds.slice(0, 3), coloniaId: null, origen: "siembra" },
    new Date(AHORA.getTime() - 24 * 60 * 60 * 1000),
  );
  return creado;
}

describe("revision-admin · despublicar una ficha publicada", () => {
  // Scenario: despublicar con motivo
  it("deja la ficha en revisión con su fecha y su motivo, y fuera del directorio", async () => {
    const creado = await altaPublicada();
    const motivo = "El dueño nos pidió por WhatsApp que la bajáramos";

    const resultado = await despublicarFicha(prisma, creado.id, motivo, AHORA);
    expect(resultado).toEqual({ resultado: "despublicada" });

    const negocio = await leer(creado.id);
    expect(negocio.estado).toBe("en_revision");
    expect(negocio.despublicadoEn?.toISOString()).toBe(AHORA.toISOString());
    expect(negocio.motivoDespublicacion).toBe(motivo);

    const listado = await obtenerNegociosPublicados("servicios-del-hogar");
    expect(listado.map((n) => n.id)).not.toContain(creado.id);
  });

  // Scenario: despublicar sin motivo
  it.each([["vacío", ""], ["solo espacios", "   \n "]])(
    "con el motivo %s no cambia nada y la ficha sigue publicada",
    async (_caso, motivo) => {
      const creado = await altaPublicada();
      const resultado = await despublicarFicha(prisma, creado.id, motivo, AHORA);

      expect(resultado).toEqual({ resultado: "error", error: "motivo" });
      const negocio = await leer(creado.id);
      expect(negocio.estado).toBe("publicado");
      expect(negocio.despublicadoEn).toBeNull();
      expect(negocio.motivoDespublicacion).toBeNull();
    },
  );

  // Scenario: despublicar algo que ya no estaba publicado
  it.each([
    ["en_revision", "en_revision"],
    ["rechazado", "rechazado"],
  ])("sobre un registro %s no guarda nada y avisa que ya no estaba publicada", async (
    _caso,
    estado,
  ) => {
    const creado = await altaEnRevision({ estado });

    const resultado = await despublicarFicha(prisma, creado.id, "Motivo ficticio", AHORA);
    expect(resultado).toEqual({ resultado: "ya-no-publicada" });

    const negocio = await leer(creado.id);
    expect(negocio.estado).toBe(estado);
    expect(negocio.despublicadoEn).toBeNull();
    expect(negocio.motivoDespublicacion).toBeNull();
  });

  // Scenario: doble despublicación
  it("la segunda despublicación no pisa la fecha ni el motivo de la primera", async () => {
    const creado = await altaPublicada();
    await despublicarFicha(prisma, creado.id, "Motivo original ficticio", AHORA);

    const segunda = await despublicarFicha(
      prisma,
      creado.id,
      "Motivo distinto",
      new Date(AHORA.getTime() + 60_000),
    );

    expect(segunda).toEqual({ resultado: "ya-no-publicada" });
    const negocio = await leer(creado.id);
    expect(negocio.motivoDespublicacion).toBe("Motivo original ficticio");
    expect(negocio.despublicadoEn?.toISOString()).toBe(AHORA.toISOString());
  });

  // Scenario: despublicar no borra el trabajo hecho
  it("conserva giros, colonia, origen, publicadoEn y todo lo que capturó el negocio", async () => {
    const creado = await altaPublicada();
    const publicado = await leer(creado.id);

    await despublicarFicha(prisma, creado.id, "El negocio cerró", AHORA);

    const negocio = await leer(creado.id);
    expect(negocio.giros.map((g) => g.id).sort()).toEqual(girosIds.slice(0, 3).sort());
    expect(negocio.coloniaId).toBe(coloniaId);
    expect(negocio.origen).toBe("siembra");
    expect(negocio.publicadoEn?.toISOString()).toBe(publicado.publicadoEn?.toISOString());
    for (const [campo, valor] of Object.entries(DATOS_CAPTURADOS)) {
      expect(negocio[campo as keyof typeof negocio]).toBe(valor);
    }
    expect(negocio.registradoEn.toISOString()).toBe(creado.registradoEn.toISOString());
    expect(negocio.consintioAvisoEn.toISOString()).toBe(
      creado.consintioAvisoEn.toISOString(),
    );
  });

  it("no toca el motivo ni la fecha de un rechazo anterior", async () => {
    const creado = await altaPublicada();
    await prisma.negocio.update({
      where: { id: creado.id },
      data: {
        rechazadoEn: new Date("2026-08-01T10:00:00.000Z"),
        motivoRechazo: "Motivo ficticio de un rechazo anterior",
      },
    });

    await despublicarFicha(prisma, creado.id, "El negocio cerró", AHORA);

    const negocio = await leer(creado.id);
    expect(negocio.rechazadoEn?.toISOString()).toBe("2026-08-01T10:00:00.000Z");
    expect(negocio.motivoRechazo).toBe("Motivo ficticio de un rechazo anterior");
  });

  // Scenario: el rastro refleja la última despublicación (modelo-datos)
  it("republicar y volver a despublicar deja el rastro de la segunda vez", async () => {
    const creado = await altaPublicada();
    await despublicarFicha(prisma, creado.id, "Primera bajada", AHORA);

    const despues = new Date(AHORA.getTime() + 3 * 60 * 60 * 1000);
    await aprobarRegistro(
      prisma,
      creado.id,
      { girosIds: girosIds.slice(0, 3), coloniaId: null, origen: "siembra" },
      despues,
    );
    // Scenario: republicar actualiza la fecha de publicación (modelo-datos)
    expect((await leer(creado.id)).publicadoEn?.toISOString()).toBe(despues.toISOString());
    // Scenario: el rastro sobrevive a las demás transiciones (modelo-datos)
    expect((await leer(creado.id)).motivoDespublicacion).toBe("Primera bajada");

    const otraVez = new Date(AHORA.getTime() + 4 * 60 * 60 * 1000);
    await despublicarFicha(prisma, creado.id, "Segunda bajada", otraVez);

    const negocio = await leer(creado.id);
    expect(negocio.motivoDespublicacion).toBe("Segunda bajada");
    expect(negocio.despublicadoEn?.toISOString()).toBe(otraVez.toISOString());
  });

  it("el rastro sobrevive a un rechazo posterior", async () => {
    const creado = await altaPublicada();
    await despublicarFicha(prisma, creado.id, "El negocio cerró", AHORA);
    await rechazarRegistro(prisma, creado.id, "Ya no opera", AHORA);

    const negocio = await leer(creado.id);
    expect(negocio.estado).toBe("rechazado");
    expect(negocio.motivoDespublicacion).toBe("El negocio cerró");
    expect(negocio.despublicadoEn?.toISOString()).toBe(AHORA.toISOString());
  });

  /**
   * Hallazgo BAJO 3 de la etapa C: a diferencia del motivo del rechazo, este
   * NO se recorta en silencio. El texto viaja dentro del WhatsApp que se le
   * manda al negocio, así que un recorte llega como una frase cortada a media
   * palabra a un tercero: mejor pedirle al admin que lo acorte él.
   */
  it("un motivo que se pasa de la cota se rechaza, no se recorta ni se guarda", async () => {
    const creado = await altaPublicada();

    const resultado = await despublicarFicha(prisma, creado.id, "x".repeat(5000), AHORA);

    expect(resultado).toEqual({ resultado: "error", error: "longitud" });
    const negocio = await leer(creado.id);
    expect(negocio.estado).toBe("publicado");
    expect(negocio.motivoDespublicacion).toBeNull();
    expect(negocio.despublicadoEn).toBeNull();
    expect(LIMITE_MOTIVO_DESPUBLICACION).toBe(LIMITE_MOTIVO_RECHAZO);
  });

  it("justo en la cota sí despublica; un carácter más, no", async () => {
    const creado = await altaPublicada();

    const enLaCota = "x".repeat(LIMITE_MOTIVO_DESPUBLICACION);
    expect(await despublicarFicha(prisma, creado.id, enLaCota, AHORA)).toEqual({
      resultado: "despublicada",
    });
    expect((await leer(creado.id)).motivoDespublicacion).toBe(enLaCota);

    const otro = await altaPublicada({ whatsapp: `${PREFIJO}778`, nombre: "Otro Ficticio" });
    expect(
      await despublicarFicha(
        prisma,
        otro.id,
        "x".repeat(LIMITE_MOTIVO_DESPUBLICACION + 1),
        AHORA,
      ),
    ).toEqual({ resultado: "error", error: "longitud" });
    expect((await leer(otro.id)).estado).toBe("publicado");
  });

  it("los espacios de sobra no cuentan para la cota", async () => {
    const creado = await altaPublicada();
    const motivo = `   ${"x".repeat(LIMITE_MOTIVO_DESPUBLICACION)}   `;

    expect(await despublicarFicha(prisma, creado.id, motivo, AHORA)).toEqual({
      resultado: "despublicada",
    });
    expect((await leer(creado.id)).motivoDespublicacion).toBe(motivo.trim());
  });

  it("un identificador que no existe no despublica nada", async () => {
    expect(await despublicarFicha(prisma, "no-existe-este-id", "Motivo", AHORA)).toEqual({
      resultado: "no-encontrado",
    });
    expect(await despublicarFicha(prisma, "", "Motivo", AHORA)).toEqual({
      resultado: "no-encontrado",
    });
  });
});

describe("revision-admin · borrado definitivo (ARCO)", () => {
  // Scenario: borrar un negocio publicado con todo colgando
  it("borra un publicado con giros y no deja ni la fila ni sus vínculos", async () => {
    const creado = await altaPublicada();

    const resultado = await borrarNegocio(prisma, creado.id);
    expect(resultado).toEqual({ resultado: "borrado" });

    expect(await prisma.negocio.findUnique({ where: { id: creado.id } })).toBeNull();
    const vinculos = await prisma.$queryRawUnsafe<Array<{ B: string }>>(
      `SELECT "B" FROM "_GiroToNegocio" WHERE "B" = $1`,
      creado.id,
    );
    expect(vinculos).toEqual([]);
    const listado = await obtenerNegociosPublicados("servicios-del-hogar");
    expect(listado.map((n) => n.id)).not.toContain(creado.id);
  });

  // Scenario: borrar en cualquier estado
  it.each([
    ["en_revision", "en_revision"],
    ["rechazado", "rechazado"],
  ])("borra igual un registro %s", async (_caso, estado) => {
    const creado = await altaEnRevision({ estado });
    expect(await borrarNegocio(prisma, creado.id)).toEqual({ resultado: "borrado" });
    expect(await prisma.negocio.findUnique({ where: { id: creado.id } })).toBeNull();
  });

  // Scenario: borrar dos veces
  it("el segundo borrado no lanza: devuelve que ya no existe", async () => {
    const creado = await altaEnRevision();
    expect(await borrarNegocio(prisma, creado.id)).toEqual({ resultado: "borrado" });
    expect(await borrarNegocio(prisma, creado.id)).toEqual({ resultado: "ya-no-existe" });
  });

  // Scenario: borrado idempotente (modelo-datos)
  it.each([["inventado", "no-existe-este-id"], ["vacío", ""]])(
    "un identificador %s se queda sin efecto, sin error",
    async (_caso, id) => {
      expect(await borrarNegocio(prisma, id)).toEqual({ resultado: "ya-no-existe" });
    },
  );

  it("no se lleva por delante ningún otro registro", async () => {
    const uno = await altaEnRevision();
    const dos = await altaEnRevision({ whatsapp: `${PREFIJO}777`, nombre: "Otro Ficticio" });

    await borrarNegocio(prisma, uno.id);

    expect(await prisma.negocio.findUnique({ where: { id: dos.id } })).not.toBeNull();
  });
});

describe("revision-admin · un borrado a mitad de la aprobación no revienta la acción", () => {
  /**
   * Hallazgo MEDIO 1 de la etapa C: `aprobarRegistro` escribe dos veces (el
   * `updateMany` condicionado y, en seguida, los giros, que son una relación y
   * no caben en él). El borrado definitivo estrena la posibilidad de que la
   * fila desaparezca entre las dos; un `update` sobre una fila que ya no existe
   * lanza P2025, y dentro de una Server Action eso es un 500.
   */
  function clienteQueBorraEntreLasDosEscrituras(id: string) {
    return {
      negocio: {
        findUnique: (args: unknown) => prisma.negocio.findUnique(args as never),
        updateMany: async (args: unknown) => {
          const resultado = await prisma.negocio.updateMany(args as never);
          // La otra pestaña confirma el borrado ARCO justo aquí.
          await prisma.negocio.deleteMany({ where: { id } });
          return resultado;
        },
        update: (args: unknown) => prisma.negocio.update(args as never),
        deleteMany: (args: unknown) => prisma.negocio.deleteMany(args as never),
      },
      giro: { findMany: (args: unknown) => prisma.giro.findMany(args as never) },
      colonia: { findUnique: (args: unknown) => prisma.colonia.findUnique(args as never) },
    };
  }

  it("responde 'no-encontrado' en vez de lanzar, y la fila no resucita", async () => {
    const creado = await altaEnRevision();

    const resultado = await aprobarRegistro(
      clienteQueBorraEntreLasDosEscrituras(creado.id),
      creado.id,
      { girosIds: girosIds.slice(0, 2), coloniaId: null, origen: "organico" },
      AHORA,
    );

    expect(resultado).toEqual({ resultado: "no-encontrado" });
    expect(await prisma.negocio.findUnique({ where: { id: creado.id } })).toBeNull();
    const vinculos = await prisma.$queryRawUnsafe<Array<{ B: string }>>(
      `SELECT "B" FROM "_GiroToNegocio" WHERE "B" = $1`,
      creado.id,
    );
    expect(vinculos).toEqual([]);
  });

  it("cualquier otro error de la base se sigue propagando, no se silencia", async () => {
    const creado = await altaEnRevision();
    const explosion = Object.assign(new Error("la base se cayó"), { code: "P1001" });
    const cliente = {
      negocio: {
        findUnique: (args: unknown) => prisma.negocio.findUnique(args as never),
        updateMany: (args: unknown) => prisma.negocio.updateMany(args as never),
        update: () => Promise.reject(explosion),
        deleteMany: (args: unknown) => prisma.negocio.deleteMany(args as never),
      },
      giro: { findMany: (args: unknown) => prisma.giro.findMany(args as never) },
      colonia: { findUnique: (args: unknown) => prisma.colonia.findUnique(args as never) },
    };

    await expect(
      aprobarRegistro(
        cliente,
        creado.id,
        { girosIds: [], coloniaId: null, origen: "organico" },
        AHORA,
      ),
    ).rejects.toThrow("la base se cayó");
  });
});

// ── El borrado ARCO se niega a mentir (iteración 4, hallazgo R4) ───────────

describe("revision-admin · borrar con el almacén de fotos inalcanzable", () => {
  const almacenCaido = () => ({
    guardar: () => Promise.reject(new Error("EACCES")),
    leer: () => Promise.resolve(null),
    borrar: () => Promise.reject(new Error("EACCES: el almacén no responde")),
    listar: () => Promise.reject(new Error("EACCES")),
    descripcion: () => "almacén caído de mentiras",
  });

  /**
   * Decisión del fundador sobre R4: *el borrado se niega a mentir*. Si la ficha
   * tiene foto y el almacén no se deja alcanzar, la fila NO se toca y el panel
   * lo dice, en vez de responder "borrado" con la foto —un dato personal—
   * todavía en el almacén y sin ninguna fila que la nombre.
   */
  it("no borra la fila y devuelve 'almacen-inalcanzable'", async () => {
    const creado = await altaPublicada();
    await prisma.negocio.update({
      where: { id: creado.id },
      data: { fotoClave: "c".repeat(32) },
    });

    expect(await borrarNegocio(prisma, creado.id, almacenCaido())).toEqual({
      resultado: "almacen-inalcanzable",
    });
    // Lo importante: la ficha sigue completa, para reintentar.
    const sigue = await prisma.negocio.findUnique({ where: { id: creado.id } });
    expect(sigue).not.toBeNull();
    expect(sigue!.fotoClave).toBe("c".repeat(32));
  });

  it("una ficha sin foto sí se borra aunque el almacén esté caído", async () => {
    const creado = await altaPublicada();

    expect(await borrarNegocio(prisma, creado.id, almacenCaido())).toEqual({
      resultado: "borrado",
    });
    expect(await prisma.negocio.findUnique({ where: { id: creado.id } })).toBeNull();
  });

  it("los archivos se borran ANTES que la fila, no después", async () => {
    // El orden es lo que hace posible negarse: con la fila borrada primero, ya
    // no habría a qué volver. Se comprueba en el camino real, apuntando cuándo
    // ocurre cada cosa.
    const creado = await altaPublicada();
    await prisma.negocio.update({
      where: { id: creado.id },
      data: { fotoClave: "d".repeat(32) },
    });

    const orden: string[] = [];
    const espia = {
      guardar: async () => {},
      leer: async () => null,
      borrar: async () => {
        orden.push("archivos");
      },
      listar: async () => [],
      descripcion: () => "espía",
    };
    const clienteEspia = {
      ...prisma,
      negocio: {
        findUnique: (args: unknown) => prisma.negocio.findUnique(args as never),
        deleteMany: (args: unknown) => {
          orden.push("fila");
          return prisma.negocio.deleteMany(args as never);
        },
      },
    } as unknown as typeof prisma;

    expect(await borrarNegocio(clienteEspia, creado.id, espia)).toEqual({
      resultado: "borrado",
    });
    expect(orden).toEqual(["archivos", "fila"]);
  });
});
