import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  HORAS_META_REVISION,
  contarAtrasados,
  obtenerColaDeRevision,
  obtenerRegistroParaPanel,
} from "../src/lib/admin/consultas";
import { crearClientePrueba } from "./db";

// Spec: revision-admin · Requirements "Cola de revisión con los registros
// pendientes, más antiguos primero", "Indicador visible de los registros con
// más de 48 horas esperando" y "Detalle del registro con todos los datos
// capturados, solo dentro del panel" (tasks.md #13 y #15).
//
// Datos 100% ficticios (repo público + LFPDPPP): serie de pruebas 7719991xxx.

const AHORA = new Date("2026-09-03T12:00:00.000Z");
const HORA_MS = 60 * 60 * 1000;
const haceHoras = (horas: number) => new Date(AHORA.getTime() - horas * HORA_MS);

let prisma: PrismaClient;
let categoriaId: number;
let coloniaId: number;

const PREFIJO = "7719991";

beforeAll(async () => {
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (
    await prisma.categoria.findUniqueOrThrow({ where: { slug: "servicios-del-hogar" } })
  ).id;
  coloniaId = (
    await prisma.colonia.findUniqueOrThrow({ where: { slug: "haciendas-de-tizayuca" } })
  ).id;
});

afterAll(async () => {
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.negocio.deleteMany();
});

type Alta = {
  nombre: string;
  whatsapp: string;
  horasEsperando: number;
  estado?: string;
  coloniaOtra?: string;
  conColonia?: boolean;
};

async function alta({
  nombre,
  whatsapp,
  horasEsperando,
  estado = "en_revision",
  coloniaOtra,
  conColonia = true,
}: Alta) {
  return prisma.negocio.create({
    data: {
      nombre,
      categoriaId,
      whatsapp,
      coloniaId: conColonia ? coloniaId : null,
      coloniaOtra: coloniaOtra ?? null,
      consintioAvisoEn: haceHoras(horasEsperando),
      registradoEn: haceHoras(horasEsperando),
      estado,
    },
  });
}

describe("revision-admin · cola de revisión", () => {
  // Scenario: orden de la cola + Scenario: registro atrasado / dentro de la meta
  it("ordena del más antiguo al más reciente y marca los de más de 48 horas", async () => {
    await alta({ nombre: "Ficticio 200 horas", whatsapp: `${PREFIJO}200`, horasEsperando: 200 });
    await alta({ nombre: "Ficticio 3 horas", whatsapp: `${PREFIJO}003`, horasEsperando: 3 });
    await alta({ nombre: "Ficticio 49 horas", whatsapp: `${PREFIJO}049`, horasEsperando: 49 });
    await alta({ nombre: "Ficticio 47 horas", whatsapp: `${PREFIJO}047`, horasEsperando: 47 });

    const cola = await obtenerColaDeRevision(prisma, AHORA);

    expect(cola.map((registro) => registro.nombre)).toEqual([
      "Ficticio 200 horas",
      "Ficticio 49 horas",
      "Ficticio 47 horas",
      "Ficticio 3 horas",
    ]);
    expect(cola.map((registro) => registro.atrasado)).toEqual([true, true, false, false]);
    expect(cola.map((registro) => registro.esperaTexto)).toEqual([
      "Hace 8 días",
      "Hace 2 días",
      "Hace 47 horas",
      "Hace 3 horas",
    ]);
    expect(contarAtrasados(cola)).toBe(2);
    expect(HORAS_META_REVISION).toBe(48);
  });

  it("un registro de exactamente 48 horas todavía no está atrasado", async () => {
    await alta({ nombre: "Ficticio 48 horas", whatsapp: `${PREFIJO}048`, horasEsperando: 48 });
    const [registro] = await obtenerColaDeRevision(prisma, AHORA);
    expect(registro.atrasado).toBe(false);
  });

  // Scenario: la cola solo trae pendientes
  it("no devuelve los publicados ni los rechazados", async () => {
    await alta({ nombre: "Ficticio en revisión", whatsapp: `${PREFIJO}101`, horasEsperando: 5 });
    await alta({
      nombre: "Ficticio publicado",
      whatsapp: `${PREFIJO}102`,
      horasEsperando: 5,
      estado: "publicado",
    });
    await alta({
      nombre: "Ficticio rechazado",
      whatsapp: `${PREFIJO}103`,
      horasEsperando: 5,
      estado: "rechazado",
    });

    const cola = await obtenerColaDeRevision(prisma, AHORA);
    expect(cola.map((registro) => registro.nombre)).toEqual(["Ficticio en revisión"]);
  });

  // Scenario: cola vacía
  it("con nada en revisión devuelve una lista vacía y cero atrasados", async () => {
    const cola = await obtenerColaDeRevision(prisma, AHORA);
    expect(cola).toEqual([]);
    expect(contarAtrasados(cola)).toBe(0);
  });

  it("muestra la colonia del catálogo o, si no la hay, el texto libre capturado", async () => {
    await alta({ nombre: "Ficticio con catálogo", whatsapp: `${PREFIJO}104`, horasEsperando: 2 });
    await alta({
      nombre: "Ficticio con Otra",
      whatsapp: `${PREFIJO}105`,
      horasEsperando: 1,
      conColonia: false,
      coloniaOtra: "Rinconada del Venado (inventada)",
    });

    const cola = await obtenerColaDeRevision(prisma, AHORA);
    expect(cola.map((registro) => registro.coloniaTexto)).toEqual([
      "Haciendas de Tizayuca",
      "Rinconada del Venado (inventada)",
    ]);
  });

  it("redondea la espera reciente sin inventar precisión", async () => {
    await alta({ nombre: "Ficticio recién llegado", whatsapp: `${PREFIJO}106`, horasEsperando: 0 });
    const [registro] = await obtenerColaDeRevision(prisma, AHORA);
    expect(registro.esperaTexto).toBe("Hace menos de una hora");
  });
});

describe("revision-admin · detalle de un registro", () => {
  // Scenario: detalle completo
  it("trae todo lo capturado más estado, origen, fecha de registro y consentimiento", async () => {
    const creado = await prisma.negocio.create({
      data: {
        nombre: "Refaccionaria Ficticia El Tornillo",
        categoriaId,
        whatsapp: `${PREFIJO}201`,
        coloniaId,
        queOfreces: "Refacciones inventadas para carro y moto.",
        entregaADomicilio: true,
        telefonoFijo: "7717771201",
        direccion: "Local 4 de un andador inventado",
        horario: "L-S 9am-7pm",
        facebookUrl: "https://www.facebook.com/tornilloficticio",
        consintioAvisoEn: haceHoras(10),
        registradoEn: haceHoras(10),
      },
    });

    const detalle = await obtenerRegistroParaPanel(prisma, creado.id);

    expect(detalle).toMatchObject({
      id: creado.id,
      nombre: "Refaccionaria Ficticia El Tornillo",
      categoriaNombre: "Servicios del hogar",
      whatsapp: `${PREFIJO}201`,
      coloniaNombre: "Haciendas de Tizayuca",
      coloniaOtra: null,
      coloniaPendiente: false,
      queOfreces: "Refacciones inventadas para carro y moto.",
      entregaADomicilio: true,
      telefonoFijo: "7717771201",
      direccion: "Local 4 de un andador inventado",
      horario: "L-S 9am-7pm",
      facebookUrl: "https://www.facebook.com/tornilloficticio",
      estado: "en_revision",
      origen: "organico",
      publicadoEn: null,
      rechazadoEn: null,
      motivoRechazo: null,
    });
    expect(detalle?.registradoEn).toBeInstanceOf(Date);
    expect(detalle?.consintioAvisoEn).toBeInstanceOf(Date);
  });

  // Scenario: detalle completo (la constancia con su versión, change
  // `versionar-aviso-privacidad`)
  it("trae la versión de la constancia y la reaceptación cuando existen", async () => {
    const conVersion = await prisma.negocio.create({
      data: {
        nombre: "Cerrajería Ficticia de la Versión",
        categoriaId,
        whatsapp: `${PREFIJO}205`,
        coloniaId,
        consintioAvisoEn: haceHoras(10),
        consintioAvisoVersion: "1",
        reconsintioAvisoEn: haceHoras(2),
        reconsintioAvisoVersion: "2",
        registradoEn: haceHoras(10),
      },
    });

    const detalle = await obtenerRegistroParaPanel(prisma, conVersion.id);
    expect(detalle?.consintioAvisoVersion).toBe("1");
    expect(detalle?.reconsintioAvisoEn).toBeInstanceOf(Date);
    expect(detalle?.reconsintioAvisoVersion).toBe("2");

    // Y una ficha anterior al versionado los trae nulos, sin inventar nada.
    const sinVersion = await prisma.negocio.create({
      data: {
        nombre: "Cerrajería Ficticia Sin Versión",
        categoriaId,
        whatsapp: `${PREFIJO}206`,
        coloniaId,
        consintioAvisoEn: haceHoras(10),
        registradoEn: haceHoras(10),
      },
    });
    const viejo = await obtenerRegistroParaPanel(prisma, sinVersion.id);
    expect(viejo?.consintioAvisoVersion).toBeNull();
    expect(viejo?.reconsintioAvisoEn).toBeNull();
    expect(viejo?.reconsintioAvisoVersion).toBeNull();
  });

  // Scenario: detalle de un registro con solo obligatorios
  it("con solo los obligatorios deja los opcionales nulos, sin inventar contenido", async () => {
    const creado = await alta({
      nombre: "Yoga Ficticia Luna",
      whatsapp: `${PREFIJO}202`,
      horasEsperando: 4,
    });

    const detalle = await obtenerRegistroParaPanel(prisma, creado.id);
    expect(detalle).toMatchObject({
      queOfreces: null,
      entregaADomicilio: false,
      telefonoFijo: null,
      direccion: null,
      horario: null,
      facebookUrl: null,
    });
  });

  it("marca la colonia pendiente de normalizar cuando el negocio escribió 'Otra'", async () => {
    const creado = await alta({
      nombre: "Ficticio con colonia Otra",
      whatsapp: `${PREFIJO}203`,
      horasEsperando: 4,
      conColonia: false,
      coloniaOtra: "Rinconada del Venado (inventada)",
    });

    const detalle = await obtenerRegistroParaPanel(prisma, creado.id);
    expect(detalle?.coloniaNombre).toBeNull();
    expect(detalle?.coloniaOtra).toBe("Rinconada del Venado (inventada)");
    expect(detalle?.coloniaPendiente).toBe(true);
  });

  // Scenario: registro inexistente
  it("un identificador que no existe devuelve null", async () => {
    expect(await obtenerRegistroParaPanel(prisma, "no-existe-este-id")).toBeNull();
    expect(await obtenerRegistroParaPanel(prisma, "")).toBeNull();
  });

  it("el detalle sí alcanza a los ya resueltos, con su rastro de rechazo", async () => {
    const creado = await alta({
      nombre: "Ficticio rechazado",
      whatsapp: `${PREFIJO}204`,
      horasEsperando: 30,
      estado: "rechazado",
    });
    await prisma.negocio.update({
      where: { id: creado.id },
      data: { rechazadoEn: haceHoras(20), motivoRechazo: "Motivo ficticio de prueba" },
    });

    const detalle = await obtenerRegistroParaPanel(prisma, creado.id);
    expect(detalle?.estado).toBe("rechazado");
    expect(detalle?.rechazadoEn).toBeInstanceOf(Date);
    expect(detalle?.motivoRechazo).toBe("Motivo ficticio de prueba");
  });
});
