import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  CAMPOS_EDITABLES,
  CAMPOS_PROHIBIDOS_EN_EDICION,
  COLUMNAS_CICLO_EDICION,
  soloCamposEditables,
} from "../src/lib/gestion/campos";
import { borrarNegocioDefinitivamente } from "../src/lib/negocio";
import { columnasDeTabla, consultarConPrisma } from "./catalogo-db";
import { crearClientePrueba } from "./db";

/**
 * Spec `modelo-datos` (delta del change `agregar-enlace-de-gestion`) ·
 * Requirements "El negocio guarda su enlace de gestión como huella, nunca en
 * claro", "Una edición pendiente guarda el contenido completo de lo que se
 * quiere publicar" y el MODIFIED del borrado ARCO (tasks.md #1-#4).
 *
 * Se le pregunta a la BASE, no al archivo del esquema: qué columnas hay, qué
 * rechaza y qué se lleva un borrado. Datos 100% ficticios (repo público +
 * LFPDPPP): números 771000 9xxx.
 */

const PREFIJO = "7710009";

describe("modelo-datos · la huella del enlace de gestión", () => {
  let prisma: PrismaClient;
  let categoriaId: number;

  const alta = (whatsapp: string, extra: Record<string, unknown> = {}) =>
    prisma.negocio.create({
      data: {
        nombre: "Negocio Ficticio con Enlace",
        categoriaId,
        whatsapp,
        consintioAvisoEn: new Date(),
        ...extra,
      },
    });

  beforeAll(async () => {
    prisma = crearClientePrueba();
    await seedCatalogos(prisma);
    categoriaId = (
      await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })
    ).id;
    await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
  });

  afterAll(async () => {
    await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
    await prisma.$disconnect();
  });

  // Scenario: negocio recién registrado
  it("un negocio recién creado nace sin huella y sin fecha de generación", async () => {
    const creado = await alta(`${PREFIJO}001`);
    expect(creado.tokenGestionHash).toBeNull();
    expect(creado.tokenGestionCreadoEn).toBeNull();
  });

  // Scenario: la base no guarda el token
  it("la tabla Negocio ya no tiene ninguna columna de token en claro", async () => {
    const columnas = await columnasDeTabla(consultarConPrisma(prisma), "Negocio");
    expect(columnas).not.toContain("tokenGestion");
    expect(columnas).toContain("tokenGestionHash");
    expect(columnas).toContain("tokenGestionCreadoEn");
  });

  // Scenario: dos negocios no pueden compartir huella
  it("dos negocios no pueden compartir huella", async () => {
    const huella = "a".repeat(64);
    await alta(`${PREFIJO}002`, { tokenGestionHash: huella });
    await expect(alta(`${PREFIJO}003`, { tokenGestionHash: huella })).rejects.toThrow();
  });

  // Scenario: regenerar sustituye
  it("regenerar deja una sola huella, la nueva, con su fecha actualizada", async () => {
    const antes = new Date("2026-09-01T10:00:00.000Z");
    const despues = new Date("2026-09-05T10:00:00.000Z");
    const creado = await alta(`${PREFIJO}004`, {
      tokenGestionHash: "b".repeat(64),
      tokenGestionCreadoEn: antes,
    });

    const actualizado = await prisma.negocio.update({
      where: { id: creado.id },
      data: { tokenGestionHash: "c".repeat(64), tokenGestionCreadoEn: despues },
    });

    expect(actualizado.tokenGestionHash).toBe("c".repeat(64));
    expect(actualizado.tokenGestionCreadoEn).toEqual(despues);
    // Y la vieja ya no existe en ninguna fila: nadie conserva dos enlaces.
    const conLaVieja = await prisma.negocio.findUnique({
      where: { tokenGestionHash: "b".repeat(64) },
    });
    expect(conLaVieja).toBeNull();
  });
});

describe("modelo-datos · la tabla EdicionPendiente", () => {
  let prisma: PrismaClient;
  let categoriaId: number;
  let coloniaId: number;
  let negocioId = "";

  const edicion = (datos: Record<string, unknown> = {}) =>
    prisma.edicionPendiente.create({
      data: {
        negocioId,
        nombre: "Negocio Ficticio Editado",
        categoriaId,
        whatsapp: `${PREFIJO}101`,
        coloniaId,
        ...datos,
      },
    });

  beforeAll(async () => {
    prisma = crearClientePrueba();
    await seedCatalogos(prisma);
    categoriaId = (
      await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })
    ).id;
    coloniaId = (await prisma.colonia.findFirstOrThrow({ orderBy: { id: "asc" } })).id;
    await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
    negocioId = (
      await prisma.negocio.create({
        data: {
          nombre: "Negocio Ficticio Publicado",
          categoriaId,
          coloniaId,
          whatsapp: `${PREFIJO}100`,
          consintioAvisoEn: new Date(),
          estado: "publicado",
          publicadoEn: new Date(),
          origen: "organico",
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
    await prisma.$disconnect();
  });

  // Scenario: la edición no puede cargar campos que no son editables
  it("sus columnas son las editables más las de su ciclo de vida, y ninguna prohibida", async () => {
    const columnas = await columnasDeTabla(consultarConPrisma(prisma), "EdicionPendiente");
    // Exhaustivo: ni una columna de más. Agregar una obliga a declararla como
    // campo editable o como parte del ciclo de vida de la edición.
    expect([...columnas].sort()).toEqual(
      [...CAMPOS_EDITABLES, ...COLUMNAS_CICLO_EDICION].sort(),
    );
    // Y ninguna de las prohibidas del NEGOCIO. `estado` queda fuera del bucle
    // porque la edición tiene el suyo (pendiente | aplicada | descartada), que
    // no es el del negocio: la exhaustividad de arriba ya cubre ese caso.
    const propias = new Set<string>(COLUMNAS_CICLO_EDICION);
    for (const prohibido of CAMPOS_PROHIBIDOS_EN_EDICION) {
      if (propias.has(prohibido)) continue;
      expect(columnas, prohibido).not.toContain(prohibido);
    }
  });

  // tasks.md #3: el guardián de la lista única de campos editables.
  it("la lista de campos editables no incluye ningún campo prohibido", () => {
    for (const prohibido of CAMPOS_PROHIBIDOS_EN_EDICION) {
      expect(CAMPOS_EDITABLES as readonly string[], prohibido).not.toContain(prohibido);
    }
    // Y la copia por lista blanca deja fuera lo que no está declarado.
    const copiada = soloCamposEditables({
      nombre: "Ficticio",
      estado: "publicado",
      origen: "siembra",
      tokenGestionHash: "no",
    });
    expect(Object.keys(copiada).sort()).toEqual([...CAMPOS_EDITABLES].sort());
    expect(copiada).not.toHaveProperty("estado");
  });

  // Scenario: edición guardada sin tocar la ficha
  it("guardar una edición no mueve ni una columna del negocio", async () => {
    const antes = await prisma.negocio.findUniqueOrThrow({ where: { id: negocioId } });
    await edicion({ nombre: "Otro Nombre Ficticio", horario: "L-D 8am-10pm" });
    const despues = await prisma.negocio.findUniqueOrThrow({ where: { id: negocioId } });
    expect(despues).toEqual(antes);
    await prisma.edicionPendiente.deleteMany({ where: { negocioId } });
  });

  // Scenario: una sola pendiente por negocio
  it("la base impide dos ediciones pendientes del mismo negocio", async () => {
    await edicion();
    await expect(edicion()).rejects.toThrow();
    await prisma.edicionPendiente.deleteMany({ where: { negocioId } });
  });

  // Scenario: estados fuera del conjunto
  it("rechaza un estado que no es pendiente, aplicada ni descartada", async () => {
    await expect(edicion({ estado: "inventada" })).rejects.toThrow();
    await expect(edicion({ estado: "PENDIENTE" })).rejects.toThrow();
    await expect(edicion({ estado: "" })).rejects.toThrow();
  });

  // Scenario: una edición resuelta deja de bloquear
  it("una edición aplicada o descartada deja de ocupar el lugar de la pendiente", async () => {
    await edicion({ estado: "aplicada", resueltaEn: new Date() });
    await edicion({ estado: "descartada", resueltaEn: new Date(), motivoDescarte: "no" });
    await expect(edicion()).resolves.toBeDefined();
    expect(
      await prisma.edicionPendiente.count({ where: { negocioId, estado: "pendiente" } }),
    ).toBe(1);
    await prisma.edicionPendiente.deleteMany({ where: { negocioId } });
  });
});

describe("modelo-datos · el borrado ARCO se lleva las ediciones", () => {
  let prisma: PrismaClient;
  let categoriaId: number;

  beforeAll(async () => {
    prisma = crearClientePrueba();
    await seedCatalogos(prisma);
    categoriaId = (
      await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })
    ).id;
    await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
  });

  afterAll(async () => {
    await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
    await prisma.$disconnect();
  });

  // Scenario: el borrado se lleva las ediciones
  it("borrar un negocio con una pendiente y dos resueltas no deja rastro de sus datos", async () => {
    const negocio = await prisma.negocio.create({
      data: {
        nombre: "Negocio Ficticio a Borrar",
        categoriaId,
        whatsapp: `${PREFIJO}200`,
        consintioAvisoEn: new Date(),
        estado: "publicado",
        publicadoEn: new Date(),
        tokenGestionHash: "d".repeat(64),
        tokenGestionCreadoEn: new Date(),
      },
    });

    const DATOS = {
      nombre: "Estética Ficticia Borrada",
      whatsapp: `${PREFIJO}201`,
      telefonoFijo: "7717770201",
      direccion: "Calle Ficticia 12, junto a la nada",
    };
    for (const estado of ["pendiente", "aplicada", "descartada"] as const) {
      await prisma.edicionPendiente.create({
        data: {
          negocioId: negocio.id,
          categoriaId,
          ...DATOS,
          estado,
          ...(estado === "pendiente" ? {} : { resueltaEn: new Date() }),
        },
      });
    }
    expect(await prisma.edicionPendiente.count({ where: { negocioId: negocio.id } })).toBe(3);

    const desenlace = await borrarNegocioDefinitivamente(prisma, negocio.id);
    expect(desenlace).toBe("borrado");

    expect(await prisma.edicionPendiente.count({ where: { negocioId: negocio.id } })).toBe(0);
    for (const valor of Object.values(DATOS)) {
      expect(
        await prisma.edicionPendiente.count({
          where: {
            OR: [
              { nombre: valor },
              { whatsapp: valor },
              { telefonoFijo: valor },
              { direccion: valor },
            ],
          },
        }),
        valor,
      ).toBe(0);
    }
    // Scenario: el enlace de un negocio borrado no resuelve.
    expect(
      await prisma.negocio.findUnique({ where: { tokenGestionHash: "d".repeat(64) } }),
    ).toBeNull();
  });
});
