import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  marcarReporteAtendido,
  obtenerNegociosReportados,
  obtenerReportesPendientesDeNegocio,
} from "../src/lib/admin/reportes";
import { crearClientePrueba } from "./db";

// Spec: revision-admin · Requirements "La cola avisa qué negocios tienen
// reportes sin atender", "El detalle del negocio lista sus reportes sin
// atender" y "Marcar un reporte como atendido, una sola vez" (tasks.md #6 y
// #14).
//
// Datos 100% ficticios (repo público + LFPDPPP): números 771000 6xxx.

const PREFIJO = "7710006";
const BASE = new Date("2026-09-01T10:00:00.000Z").getTime();
const HORA_MS = 60 * 60 * 1000;
const horas = (n: number) => new Date(BASE + n * HORA_MS);
/** "Ahora" fijo del panel: 30 horas después del primer reporte. */
const AHORA = new Date(BASE + 30 * HORA_MS);

let prisma: PrismaClient;
let categoriaId: number;
let idTres = "";
let idUno = "";
let idSinReportes = "";

async function alta(nombre: string, whatsapp: string): Promise<string> {
  const creado = await prisma.negocio.create({
    data: {
      nombre,
      categoriaId,
      whatsapp,
      consintioAvisoEn: new Date(),
      estado: "publicado",
      publicadoEn: new Date("2026-08-01T10:00:00.000Z"),
    },
  });
  return creado.id;
}

beforeAll(async () => {
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (
    await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })
  ).id;
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });

  idTres = await alta("Cocina Ficticia Doña Mode", `${PREFIJO}001`);
  idUno = await alta("Vidriería Ficticia El Reflejo", `${PREFIJO}002`);
  idSinReportes = await alta("Ferretería Ficticia El Clavo", `${PREFIJO}003`);
});

afterAll(async () => {
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.reporte.deleteMany();

  // El negocio con tres pendientes tiene además uno ya atendido: no debe
  // contar ni aparecer en ningún lado.
  await prisma.reporte.createMany({
    data: [
      { negocioId: idTres, motivo: "cerrado", creadoEn: horas(0), comentario: "Ya no abren." },
      { negocioId: idTres, motivo: "no_real", creadoEn: horas(2) },
      { negocioId: idTres, motivo: "datos_incorrectos", creadoEn: horas(1) },
      {
        negocioId: idTres,
        motivo: "inapropiado",
        creadoEn: horas(-5),
        estado: "atendido",
        atendidoEn: horas(-4),
      },
      // El otro negocio: un solo pendiente, y más reciente que los de arriba.
      { negocioId: idUno, motivo: "inapropiado", creadoEn: horas(6) },
    ],
  });
});

describe("revision-admin · negocios reportados en la cola", () => {
  // Scenario: cola con negocios reportados
  it("lista solo los que tienen pendientes, con su conteo y su nombre", async () => {
    const reportados = await obtenerNegociosReportados(prisma);

    expect(reportados).toEqual([
      { id: idTres, nombre: "Cocina Ficticia Doña Mode", totalPendientes: 3 },
      { id: idUno, nombre: "Vidriería Ficticia El Reflejo", totalPendientes: 1 },
    ]);
    expect(reportados.map((negocio) => negocio.id)).not.toContain(idSinReportes);
  });

  // Scenario: el orden es por antigüedad del reporte sin atender
  it("va del que lleva más tiempo con un reporte sin atender al más reciente", async () => {
    // Se atienden los tres del primero y le llega uno nuevo, más reciente que
    // el pendiente del segundo: entonces se invierte el orden.
    const pendientes = await prisma.reporte.findMany({
      where: { negocioId: idTres, estado: "pendiente" },
    });
    for (const reporte of pendientes) await marcarReporteAtendido(prisma, reporte.id);
    await prisma.reporte.create({
      data: { negocioId: idTres, motivo: "cerrado", creadoEn: horas(20) },
    });

    expect((await obtenerNegociosReportados(prisma)).map((n) => n.id)).toEqual([
      idUno,
      idTres,
    ]);
  });

  // Scenario: sin reportes pendientes no hay sección
  it("sin ningún pendiente devuelve la lista vacía", async () => {
    await prisma.reporte.deleteMany();
    expect(await obtenerNegociosReportados(prisma)).toEqual([]);
  });

  it("un negocio con todos sus reportes atendidos desaparece de la lista", async () => {
    const pendientes = await prisma.reporte.findMany({
      where: { negocioId: idUno, estado: "pendiente" },
    });
    for (const reporte of pendientes) await marcarReporteAtendido(prisma, reporte.id);

    expect((await obtenerNegociosReportados(prisma)).map((n) => n.id)).toEqual([idTres]);
  });
});

describe("revision-admin · reportes pendientes de un negocio", () => {
  // Scenario: detalle con reportes
  it("los trae del más antiguo al más reciente, con etiqueta legible y espera", async () => {
    const reportes = await obtenerReportesPendientesDeNegocio(prisma, idTres, AHORA);

    expect(reportes).toHaveLength(3);
    expect(reportes.map((reporte) => reporte.motivoEtiqueta)).toEqual([
      "Ya cerró",
      "Los datos están mal",
      "No es real",
    ]);
    expect(reportes.map((reporte) => reporte.esperaTexto)).toEqual([
      "Hace 30 horas",
      "Hace 29 horas",
      "Hace 28 horas",
    ]);
    // El comentario solo en el que lo trae; los demás, nulo (no cadena vacía).
    expect(reportes.map((reporte) => reporte.comentario)).toEqual([
      "Ya no abren.",
      null,
      null,
    ]);
  });

  it("el reporte ya atendido no aparece en la lista", async () => {
    const reportes = await obtenerReportesPendientesDeNegocio(prisma, idTres, AHORA);
    expect(reportes.map((reporte) => reporte.motivoEtiqueta)).not.toContain(
      "Contenido ofensivo o inapropiado",
    );
  });

  // Scenario: negocio sin reportes
  it.each([
    ["un negocio sin reportes", () => idSinReportes],
    ["un id que no existe", () => "id-que-no-existe-jamas"],
    ["un id vacío", () => ""],
  ])("%s devuelve la lista vacía", async (_caso, id) => {
    expect(await obtenerReportesPendientesDeNegocio(prisma, id(), AHORA)).toEqual([]);
  });

  it("no devuelve ningún dato de quien reportó, porque no existe ninguno", async () => {
    const reportes = await obtenerReportesPendientesDeNegocio(prisma, idTres, AHORA);
    for (const reporte of reportes) {
      expect(Object.keys(reporte).sort()).toEqual([
        "comentario",
        "esperaTexto",
        "id",
        "motivoEtiqueta",
      ]);
    }
  });
});

describe("revision-admin · marcar un reporte como atendido", () => {
  // Scenario: atender un reporte
  it("lo pasa a atendido con su fecha y lo saca de los pendientes", async () => {
    const [primero, segundo] = await obtenerReportesPendientesDeNegocio(
      prisma,
      idTres,
      AHORA,
    );
    const cuando = new Date("2026-09-03T09:00:00.000Z");

    expect(await marcarReporteAtendido(prisma, primero.id, cuando)).toBe("atendido");

    const guardado = await prisma.reporte.findUniqueOrThrow({ where: { id: primero.id } });
    expect(guardado.estado).toBe("atendido");
    expect(guardado.atendidoEn?.toISOString()).toBe(cuando.toISOString());

    const quedan = await obtenerReportesPendientesDeNegocio(prisma, idTres, AHORA);
    expect(quedan).toHaveLength(2);
    expect(quedan[0].id).toBe(segundo.id);
    // Y la cola cuenta uno menos para ese negocio.
    const enCola = await obtenerNegociosReportados(prisma);
    expect(enCola.find((negocio) => negocio.id === idTres)?.totalPendientes).toBe(2);
  });

  // Scenario: el último reporte atendido saca al negocio de la sección
  it("atendido el único pendiente, el negocio sale de la cola de reportados", async () => {
    const [unico] = await obtenerReportesPendientesDeNegocio(prisma, idUno, AHORA);
    expect(await marcarReporteAtendido(prisma, unico.id)).toBe("atendido");

    expect((await obtenerNegociosReportados(prisma)).map((n) => n.id)).not.toContain(idUno);
  });

  // Scenario: doble marcado
  it("la segunda vez no pisa la fecha original y avisa que ya estaba atendido", async () => {
    const [primero] = await obtenerReportesPendientesDeNegocio(prisma, idTres, AHORA);
    const primeraVez = new Date("2026-09-03T09:00:00.000Z");
    const segundaVez = new Date("2026-09-03T18:00:00.000Z");

    expect(await marcarReporteAtendido(prisma, primero.id, primeraVez)).toBe("atendido");
    expect(await marcarReporteAtendido(prisma, primero.id, segundaVez)).toBe("ya-atendido");

    const guardado = await prisma.reporte.findUniqueOrThrow({ where: { id: primero.id } });
    expect(guardado.atendidoEn?.toISOString()).toBe(primeraVez.toISOString());
  });

  // Scenario: reporte inexistente
  it.each([
    ["un id inventado", "reporte-que-no-existe"],
    ["un id vacío", ""],
  ])("%s no cambia nada y responde como ya atendido", async (_caso, id) => {
    const antes = await prisma.reporte.findMany({ orderBy: { id: "asc" } });

    expect(await marcarReporteAtendido(prisma, id)).toBe("ya-atendido");

    expect(await prisma.reporte.findMany({ orderBy: { id: "asc" } })).toEqual(antes);
  });

  // Hallazgo B1 de la etapa C: cuando la acción viene del detalle de un
  // negocio, la escritura queda condicionada también a que el reporte sea de
  // ESE negocio.
  it("con el negocio puesto, un reporte de otra ficha no se puede atender", async () => {
    const [ajeno] = await obtenerReportesPendientesDeNegocio(prisma, idUno, AHORA);

    expect(await marcarReporteAtendido(prisma, ajeno.id, undefined, idTres)).toBe(
      "ya-atendido",
    );

    const releido = await prisma.reporte.findUniqueOrThrow({ where: { id: ajeno.id } });
    expect(releido.estado).toBe("pendiente");
    expect(releido.atendidoEn).toBeNull();
  });

  it("con el negocio puesto, el reporte propio sí se atiende", async () => {
    const [propio] = await obtenerReportesPendientesDeNegocio(prisma, idTres, AHORA);

    expect(await marcarReporteAtendido(prisma, propio.id, undefined, idTres)).toBe(
      "atendido",
    );
    expect(
      (await prisma.reporte.findUniqueOrThrow({ where: { id: propio.id } })).estado,
    ).toBe("atendido");
  });

  it("un negocio inventado no atiende nada de nadie", async () => {
    const [propio] = await obtenerReportesPendientesDeNegocio(prisma, idTres, AHORA);

    expect(
      await marcarReporteAtendido(prisma, propio.id, undefined, "negocio-que-no-existe"),
    ).toBe("ya-atendido");
    expect(
      (await prisma.reporte.findUniqueOrThrow({ where: { id: propio.id } })).estado,
    ).toBe("pendiente");
  });

  // Scenario: atender no cambia el negocio
  it("el negocio queda intacto: estado, giros, fechas y datos", async () => {
    const antes = await prisma.negocio.findUniqueOrThrow({
      where: { id: idTres },
      include: { giros: true },
    });
    const [primero] = await obtenerReportesPendientesDeNegocio(prisma, idTres, AHORA);

    await marcarReporteAtendido(prisma, primero.id);

    const despues = await prisma.negocio.findUniqueOrThrow({
      where: { id: idTres },
      include: { giros: true },
    });
    expect(despues).toEqual(antes);
    expect(despues.estado).toBe("publicado");
  });
});
