import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { almacenDeFotos } from "../src/lib/fotos/almacen";
import { generarClaveFoto, VARIANTES_FOTO } from "../src/lib/fotos/clave";
import {
  borrarNegocioDefinitivamente,
  ESTADO_NEGOCIO_DEFAULT,
  ORIGEN_NEGOCIO_DEFAULT,
} from "../src/lib/negocio";
import type { PrismaClient } from "../src/generated/prisma/client";
import { crearClientePrueba } from "./db";

// Datos 100% ficticios (repo público + LFPDPPP): números 771000xxxx inventados.

describe("modelo Negocio", () => {
  let prisma: PrismaClient;
  let categoriaId: number;
  let coloniaId: number;

  beforeAll(async () => {
    prisma = crearClientePrueba();
    await seedCatalogos(prisma);
    categoriaId = (await prisma.categoria.findUniqueOrThrow({
      where: { slug: "servicios-del-hogar" },
    })).id;
    coloniaId = (await prisma.colonia.findUniqueOrThrow({
      where: { slug: "haciendas-de-tizayuca" },
    })).id;
  });

  afterAll(async () => {
    await prisma.negocio.deleteMany();
    await prisma.$disconnect();
  });

  // Requirement "El modelo Negocio cubre los campos del registro"
  // + "Estado de revisión, origen y timestamps" + "terreno para la gestión P1"
  // Scenarios: alta mínima con solo obligatorios / negocio recién creado /
  //            negocio recién registrado sin giros / espacio reservado sin comportamiento
  it("alta mínima: solo obligatorios, opcionales vacíos y ciclo de vida inicial", async () => {
    const antes = new Date();
    const creado = await prisma.negocio.create({
      data: {
        nombre: "Plomería Ficticia El Tubo Feliz",
        categoriaId,
        whatsapp: "7710000001",
        coloniaId,
        consintioAvisoEn: new Date(),
      },
      include: { giros: true },
    });

    // Opcionales vacíos
    expect(creado.queOfreces).toBeNull();
    expect(creado.entregaADomicilio).toBe(false);
    expect(creado.telefonoFijo).toBeNull();
    expect(creado.direccion).toBeNull();
    expect(creado.latitud).toBeNull();
    expect(creado.longitud).toBeNull();
    expect(creado.horario).toBeNull();
    expect(creado.fotoClave).toBeNull();
    expect(creado.facebookUrl).toBeNull();

    // Ciclo de vida inicial
    expect(creado.estado).toBe(ESTADO_NEGOCIO_DEFAULT);
    expect(creado.origen).toBe(ORIGEN_NEGOCIO_DEFAULT);
    expect(creado.registradoEn.getTime()).toBeGreaterThanOrEqual(antes.getTime() - 1000);
    expect(creado.publicadoEn).toBeNull();

    // Sin giros al registrarse; token de gestión reservado y nulo
    expect(creado.giros).toHaveLength(0);
    expect(creado.tokenGestion).toBeNull();
  });

  // Scenario: alta completa con opcionales
  it("alta completa: los 5 opcionales persisten tal cual, incluido el pin", async () => {
    const datos = {
      nombre: "Fonda Ficticia Doña Ejemplo",
      categoriaId,
      whatsapp: "7710000002",
      coloniaId,
      consintioAvisoEn: new Date("2026-09-01T12:00:00Z"),
      queOfreces: "comida corrida, guisados caseros, comida para llevar",
      entregaADomicilio: true,
      telefonoFijo: "7797000000",
      direccion: "Frente al parque, portón azul (datos ficticios)",
      latitud: 19.8367,
      longitud: -98.9817,
      horario: "L-S 9am-6pm",
      // Clave con la forma que genera el servidor (32 hex).
      fotoClave: "0123456789abcdef0123456789abcdef",
      facebookUrl: "https://facebook.com/negocio-ficticio",
    };
    const { id } = await prisma.negocio.create({ data: datos });

    const leido = await prisma.negocio.findUniqueOrThrow({ where: { id } });
    expect(leido).toMatchObject(datos);
  });

  // Requirement "Una sola ficha por número de WhatsApp" · Scenario: WhatsApp duplicado
  it("rechaza un segundo negocio con el mismo WhatsApp", async () => {
    await prisma.negocio.create({
      data: {
        nombre: "Estética Ficticia Uno",
        categoriaId,
        whatsapp: "7710000003",
        coloniaId,
        consintioAvisoEn: new Date(),
      },
    });

    await expect(
      prisma.negocio.create({
        data: {
          nombre: "Estética Ficticia Dos",
          categoriaId,
          whatsapp: "7710000003",
          coloniaId,
          consintioAvisoEn: new Date(),
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  // Requirement "Giros asignables al negocio por el admin" · Scenario: asignación de giros
  it("el admin puede vincular 3 giros, consultables en ambas direcciones", async () => {
    const giros = await prisma.giro.findMany({
      where: { slug: { in: ["plomeria", "electricidad", "cerrajeria"] } },
    });
    expect(giros).toHaveLength(3);

    const negocio = await prisma.negocio.create({
      data: {
        nombre: "Multiservicios Ficticios García",
        categoriaId,
        whatsapp: "7710000004",
        coloniaId,
        consintioAvisoEn: new Date(),
        giros: { connect: giros.map((g) => ({ id: g.id })) },
      },
      include: { giros: true },
    });
    expect(negocio.giros.map((g) => g.slug).sort()).toEqual([
      "cerrajeria",
      "electricidad",
      "plomeria",
    ]);

    // Desde el giro también se ve el negocio
    const plomeria = await prisma.giro.findUniqueOrThrow({
      where: { slug: "plomeria" },
      include: { negocios: true },
    });
    expect(plomeria.negocios.map((n) => n.id)).toContain(negocio.id);
  });

  // Requirement "Estado de revisión, origen y timestamps" · Scenario: publicación
  it("publicación: estado y fecha de publicación persisten", async () => {
    const { id } = await prisma.negocio.create({
      data: {
        nombre: "Taller Ficticio El Ejemplo",
        categoriaId,
        whatsapp: "7710000005",
        coloniaId,
        consintioAvisoEn: new Date(),
      },
    });

    const fecha = new Date("2026-09-02T18:30:00Z");
    await prisma.negocio.update({
      where: { id },
      data: { estado: "publicado", publicadoEn: fecha, origen: "siembra" },
    });

    const publicado = await prisma.negocio.findUniqueOrThrow({ where: { id } });
    expect(publicado.estado).toBe("publicado");
    expect(publicado.publicadoEn).toEqual(fecha);
    expect(publicado.origen).toBe("siembra");
  });

  // Scenario: valores fuera del conjunto (CHECK en la migración)
  it("la base rechaza un estado fuera del conjunto", async () => {
    await expect(
      prisma.negocio.create({
        data: {
          nombre: "Negocio Ficticio Estado Inválido",
          categoriaId,
          whatsapp: "7710000006",
          coloniaId,
          consintioAvisoEn: new Date(),
          estado: "aprobadisimo",
        },
      }),
    ).rejects.toThrowError(/CHECK/i);
  });

  it("la base rechaza un origen fuera del conjunto", async () => {
    await expect(
      prisma.negocio.create({
        data: {
          nombre: "Negocio Ficticio Origen Inválido",
          categoriaId,
          whatsapp: "7710000007",
          coloniaId,
          consintioAvisoEn: new Date(),
          origen: "marciano",
        },
      }),
    ).rejects.toThrowError(/CHECK/i);
  });

  // Requirement "La colonia admite Otra" · Scenarios: registro con colonia "Otra" /
  // normalización por el admin
  it('colonia "Otra": texto libre sin colonia de catálogo, normalizable después', async () => {
    const creado = await prisma.negocio.create({
      data: {
        nombre: "Abarrotes Ficticios La Esquina",
        categoriaId,
        whatsapp: "7710000008",
        consintioAvisoEn: new Date(),
        coloniaOtra: "Rinconada del Venado",
      },
    });
    expect(creado.coloniaId).toBeNull();
    expect(creado.coloniaOtra).toBe("Rinconada del Venado");

    // El admin la normaliza asignando una colonia del catálogo
    const normalizado = await prisma.negocio.update({
      where: { id: creado.id },
      data: { coloniaId },
      include: { colonia: true },
    });
    expect(normalizado.colonia?.slug).toBe("haciendas-de-tizayuca");
  });

  // Requirement "El modelo Negocio cubre los campos del registro" MODIFIED por
  // `agregar-foto-negocio` · Scenario: dos negocios no comparten la misma foto
  it("la base rechaza dos negocios con la misma referencia de foto", async () => {
    const clave = generarClaveFoto();
    await prisma.negocio.create({
      data: {
        nombre: "Panadería Ficticia de la Foto Única",
        categoriaId,
        whatsapp: "7710000012",
        coloniaId,
        consintioAvisoEn: new Date(),
        fotoClave: clave,
      },
    });

    await expect(
      prisma.negocio.create({
        data: {
          nombre: "Copia Ficticia de la Foto",
          categoriaId,
          whatsapp: "7710000013",
          coloniaId,
          consintioAvisoEn: new Date(),
          fotoClave: clave,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    // Varias fichas SIN foto sí conviven: el índice único admite nulos.
    for (const whatsapp of ["7710000014", "7710000015"]) {
      await prisma.negocio.create({
        data: {
          nombre: `Negocio Ficticio sin Foto ${whatsapp}`,
          categoriaId,
          whatsapp,
          coloniaId,
          consintioAvisoEn: new Date(),
        },
      });
    }
    expect(
      await prisma.negocio.count({ where: { fotoClave: null } }),
    ).toBeGreaterThanOrEqual(2);
  });

  // Requirement "Borrado definitivo de un negocio (ARCO)" · Scenario: hard delete
  it("hard delete: desaparecen la fila y sus vínculos con giros", async () => {
    const giro = await prisma.giro.findUniqueOrThrow({ where: { slug: "tacos" } });
    const { id } = await prisma.negocio.create({
      data: {
        nombre: "Tacos Ficticios El Borrado",
        categoriaId,
        whatsapp: "7710000009",
        coloniaId,
        consintioAvisoEn: new Date(),
        giros: { connect: { id: giro.id } },
      },
    });

    await prisma.negocio.delete({ where: { id } });

    expect(await prisma.negocio.findUnique({ where: { id } })).toBeNull();
    const desdeGiro = await prisma.giro.findUniqueOrThrow({
      where: { slug: "tacos" },
      include: { negocios: true },
    });
    expect(desdeGiro.negocios.map((n) => n.id)).not.toContain(id);
    // Ni siquiera quedan filas huérfanas en la tabla puente
    const vinculos = await prisma.$queryRaw<
      { total: bigint }[]
    >`SELECT COUNT(*) as total FROM "_GiroToNegocio" WHERE "B" = ${id}`;
    expect(Number(vinculos[0].total)).toBe(0);
  });

  // Requirement "Borrado definitivo de un negocio (ARCO)" MODIFIED por
  // `agregar-foto-negocio` · Scenario: hard delete (con foto)
  it("el borrado definitivo se lleva también todas las variantes de su foto", async () => {
    const almacen = almacenDeFotos();
    const clave = generarClaveFoto();
    for (const variante of VARIANTES_FOTO) {
      await almacen.guardar(clave, variante, Buffer.from("foto de mentiras"));
    }
    const giro = await prisma.giro.findUniqueOrThrow({ where: { slug: "tacos" } });
    const { id } = await prisma.negocio.create({
      data: {
        nombre: "Taquería Ficticia con Foto Borrable",
        categoriaId,
        whatsapp: "7710000010",
        coloniaId,
        consintioAvisoEn: new Date(),
        fotoClave: clave,
        giros: { connect: { id: giro.id } },
      },
    });

    expect(await borrarNegocioDefinitivamente(prisma, id, almacen)).toBe(true);

    expect(await prisma.negocio.findUnique({ where: { id } })).toBeNull();
    for (const variante of VARIANTES_FOTO) {
      expect(await almacen.leer(clave, variante)).toBeNull();
    }
    const vinculos = await prisma.$queryRaw<
      { total: bigint }[]
    >`SELECT COUNT(*) as total FROM "_GiroToNegocio" WHERE "B" = ${id}`;
    expect(Number(vinculos[0].total)).toBe(0);
  });

  // Scenario: borrado con el archivo ya ausente
  it("borrar un negocio cuya foto ya no está en el almacén no truena", async () => {
    const clave = generarClaveFoto(); // nunca se escribió ningún archivo
    const { id } = await prisma.negocio.create({
      data: {
        nombre: "Estética Ficticia sin Archivos",
        categoriaId,
        whatsapp: "7710000011",
        coloniaId,
        consintioAvisoEn: new Date(),
        fotoClave: clave,
      },
    });

    await expect(borrarNegocioDefinitivamente(prisma, id)).resolves.toBe(true);
    expect(await prisma.negocio.findUnique({ where: { id } })).toBeNull();
  });

  it("borrar un identificador que no existe devuelve false, sin error", async () => {
    await expect(
      borrarNegocioDefinitivamente(prisma, "no-existe-este-id"),
    ).resolves.toBe(false);
  });
});
