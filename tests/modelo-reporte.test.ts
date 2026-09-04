import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { PrismaClient } from "../src/generated/prisma/client";
import { borrarNegocioDefinitivamente } from "../src/lib/negocio";
import { columnasDeTabla, consultarConPrisma } from "./catalogo-db";
import { crearClientePrueba } from "./db";

// Spec: modelo-datos (delta del change `agregar-boton-reportar`) · Requirement
// "El modelo `Reporte` guarda el aviso de un vecino sobre una ficha, sin
// ningún dato de quien lo envía" y el MODIFIED del borrado ARCO (tasks.md #1).
//
// Lo que ANTES probaba este archivo replicando migraciones a mano —que crear
// la tabla no se llevaba los CHECK del negocio, y que los CHECK del reporte
// existen— vive ahora en `tests/modelo-migraciones.test.ts`, contra el árbol
// consolidado en PostgreSQL (change `preparar-deploy-produccion`, §4).
//
// Datos 100% ficticios (repo público + LFPDPPP): números 771000 8xxx.

describe("modelo-datos · la tabla Reporte en el cliente Prisma", () => {
  let prisma: PrismaClient;
  let categoriaId: number;
  let negocioId = "";

  const alta = async (whatsapp: string) =>
    (
      await prisma.negocio.create({
        data: {
          nombre: "Negocio Ficticio Reportado",
          categoriaId,
          whatsapp,
          consintioAvisoEn: new Date(),
          estado: "publicado",
          publicadoEn: new Date(),
        },
      })
    ).id;

  beforeAll(async () => {
    prisma = crearClientePrueba();
    await seedCatalogos(prisma);
    categoriaId = (
      await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })
    ).id;
    await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: "7710008" } } });
    negocioId = await alta("7710008101");
  });

  afterAll(async () => {
    await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: "7710008" } } });
    await prisma.$disconnect();
  });

  // Scenario: nada del reportante en el esquema
  it("sus columnas son exactamente las siete de la spec, ninguna del reportante", async () => {
    const columnas = await columnasDeTabla(consultarConPrisma(prisma), "Reporte");
    expect([...columnas].sort()).toEqual(
      [
        "atendidoEn",
        "comentario",
        "creadoEn",
        "estado",
        "id",
        "motivo",
        "negocioId",
      ].sort(),
    );
    // Y ninguna que huela a identidad de quien reportó.
    for (const columna of columnas) {
      expect(columna).not.toMatch(/ip|hash|huella|nombre|contacto|correo|telefono/i);
    }
  });

  // Scenario: reporte recién creado
  it("un reporte recién creado queda pendiente, con fecha y sin comentario", async () => {
    const creado = await prisma.reporte.create({
      data: { negocioId, motivo: "cerrado" },
    });
    expect(creado.motivo).toBe("cerrado");
    expect(creado.comentario).toBeNull();
    expect(creado.estado).toBe("pendiente");
    expect(creado.creadoEn).toBeInstanceOf(Date);
    expect(creado.atendidoEn).toBeNull();
    await prisma.reporte.delete({ where: { id: creado.id } });
  });

  // Scenario: reporte con comentario
  it("el comentario se guarda tal cual y se recupera sin alteraciones", async () => {
    const texto = "<b>ya cerró</b> & se cambiaron, según el vecino de al lado";
    const creado = await prisma.reporte.create({
      data: { negocioId, motivo: "cerrado", comentario: texto },
    });
    const leido = await prisma.reporte.findUniqueOrThrow({ where: { id: creado.id } });
    expect(leido.comentario).toBe(texto);
    await prisma.reporte.delete({ where: { id: creado.id } });
  });

  // Scenario: motivo fuera del conjunto
  it("la base rechaza un motivo que no está en la lista cerrada", async () => {
    await expect(
      prisma.reporte.create({ data: { negocioId, motivo: "porque si" } }),
    ).rejects.toThrow();
  });

  // Scenario: estado fuera del conjunto
  it("la base rechaza un estado distinto de pendiente o atendido", async () => {
    await expect(
      prisma.reporte.create({ data: { negocioId, motivo: "cerrado", estado: "borrado" } }),
    ).rejects.toThrow();
  });

  // Scenario: atender un reporte + Scenario: conteo y lista de pendientes
  it("un negocio con tres pendientes y uno atendido cuenta 3, del más antiguo al más reciente", async () => {
    const otroId = await alta("7710008102");
    const base = new Date("2026-09-01T10:00:00.000Z").getTime();
    const horas = (n: number) => new Date(base + n * 60 * 60 * 1000);

    await prisma.reporte.createMany({
      data: [
        { negocioId: otroId, motivo: "cerrado", creadoEn: horas(0) },
        { negocioId: otroId, motivo: "no_real", creadoEn: horas(2) },
        { negocioId: otroId, motivo: "datos_incorrectos", creadoEn: horas(1) },
      ],
    });
    const atendido = await prisma.reporte.create({
      data: { negocioId: otroId, motivo: "inapropiado", creadoEn: horas(3) },
    });

    const cuando = new Date("2026-09-02T10:00:00.000Z");
    await prisma.reporte.update({
      where: { id: atendido.id },
      data: { estado: "atendido", atendidoEn: cuando },
    });
    const releido = await prisma.reporte.findUniqueOrThrow({ where: { id: atendido.id } });
    expect(releido.estado).toBe("atendido");
    expect(releido.atendidoEn?.toISOString()).toBe(cuando.toISOString());

    expect(
      await prisma.reporte.count({ where: { negocioId: otroId, estado: "pendiente" } }),
    ).toBe(3);

    const pendientes = await prisma.reporte.findMany({
      where: { negocioId: otroId, estado: "pendiente" },
      orderBy: { creadoEn: "asc" },
    });
    expect(pendientes.map((reporte) => reporte.motivo)).toEqual([
      "cerrado",
      "datos_incorrectos",
      "no_real",
    ]);
  });

  // Scenario: hard delete de un negocio con reportes (MODIFIED, operación ARCO)
  it("borrar el negocio se lleva sus reportes pendientes y atendidos", async () => {
    const condenadoId = await alta("7710008103");
    const uno = await prisma.reporte.create({
      data: { negocioId: condenadoId, motivo: "cerrado" },
    });
    const dos = await prisma.reporte.create({
      data: {
        negocioId: condenadoId,
        motivo: "no_real",
        estado: "atendido",
        atendidoEn: new Date(),
      },
    });

    await prisma.negocio.delete({ where: { id: condenadoId } });

    expect(await prisma.negocio.findUnique({ where: { id: condenadoId } })).toBeNull();
    expect(await prisma.reporte.findUnique({ where: { id: uno.id } })).toBeNull();
    expect(await prisma.reporte.findUnique({ where: { id: dos.id } })).toBeNull();
    expect(await prisma.reporte.count({ where: { negocioId: condenadoId } })).toBe(0);
  });

  /**
   * Punto de integración con T-015 (despublicar y borrado ARCO), que fusionó a
   * `main` mientras este change estaba en el pipeline. El test de arriba borra
   * con `prisma.negocio.delete`; el panel NO usa esa ruta: `borrarNegocio`
   * delega en `borrarNegocioDefinitivamente`, que borra con `deleteMany` para
   * que un doble toque no lance. Son dos caminos distintos hasta la base y la
   * cascada tiene que arrastrar los reportes por los dos, así que el camino
   * que de verdad ejecuta el admin se prueba aparte y con filas reales.
   */
  // Scenario: hard delete de un negocio con reportes (por el camino del panel)
  it("el borrado ARCO del panel también se lleva los reportes, sin huérfanos", async () => {
    const condenadoId = await alta("7710008104");
    await prisma.reporte.create({ data: { negocioId: condenadoId, motivo: "cerrado" } });
    await prisma.reporte.create({
      data: {
        negocioId: condenadoId,
        motivo: "datos_incorrectos",
        estado: "atendido",
        atendidoEn: new Date(),
      },
    });
    expect(await prisma.reporte.count({ where: { negocioId: condenadoId } })).toBe(2);

    expect(await borrarNegocioDefinitivamente(prisma, condenadoId)).toBe("borrado");

    expect(await prisma.negocio.findUnique({ where: { id: condenadoId } })).toBeNull();
    // Con SQL crudo, no con Prisma: lo que se vigila es que no queden filas en
    // la tabla, no que el cliente sepa filtrarlas.
    const huerfanos = await prisma.$queryRawUnsafe<Array<{ n: bigint | number }>>(
      `SELECT COUNT(*) AS n FROM "Reporte" WHERE "negocioId" = $1`,
      condenadoId,
    );
    expect(Number(huerfanos[0].n)).toBe(0);
  });
});
