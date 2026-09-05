import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  type ClientePanel,
  type RegistroListadoItem,
  obtenerListadoDeNegocios,
} from "../src/lib/admin/consultas";
import { FILTRO_TODOS, PORPAGINA_LISTADO } from "../src/lib/admin/listado-parametros";
import { crearClientePrueba } from "./db";

// Spec: revision-admin (change `agregar-listado-gestion-panel`) · Requirements
// "Vista 'Todos los negocios'...", "El listado se filtra por estado sin salir
// de la vista", "El listado se corta en páginas y no se degrada cuando hay
// muchos registros" y "El listado hereda... la mínima exposición de datos del
// panel" (tasks.md #3 y #4).
//
// Datos 100% ficticios (repo público + LFPDPPP): serie de pruebas 7719998xxx.

const PREFIJO = "7719998";
const BASE = new Date("2026-09-03T12:00:00.000Z");
const DIA_MS = 24 * 60 * 60 * 1000;
const haceDias = (dias: number) => new Date(BASE.getTime() - dias * DIA_MS);

/** Campos personales que el listado NO debe traer nunca (requirement). */
const CAMPOS_PROHIBIDOS = [
  "whatsapp",
  "telefonoFijo",
  "direccion",
  "fotoClave",
  "motivoRechazo",
  "motivoDespublicacion",
  "consintioAvisoEn",
  "queOfreces",
  "horario",
  "facebookUrl",
] as const;

/** Las seis llaves —y solo esas seis— de un renglón del listado. */
const LLAVES_DEL_RENGLON = [
  "coloniaTexto",
  "estado",
  "id",
  "nombre",
  "registradoEn",
  "vieneDeDespublicacion",
];

let prisma: PrismaClient;
let categoriaId: number;
let coloniaId: number;

type Alta = {
  nombre: string;
  whatsapp: string;
  diasAtras: number;
  estado?: string;
  registradoEn?: Date;
  conColonia?: boolean;
  coloniaOtra?: string;
};

async function alta({
  nombre,
  whatsapp,
  diasAtras,
  estado = "en_revision",
  registradoEn,
  conColonia = true,
  coloniaOtra,
}: Alta) {
  return prisma.negocio.create({
    data: {
      nombre,
      categoriaId,
      whatsapp,
      coloniaId: conColonia ? coloniaId : null,
      coloniaOtra: coloniaOtra ?? null,
      // Datos personales de sobra: el listado tiene que dejarlos fuera.
      telefonoFijo: "7717770000",
      direccion: "Andador inventado sin número",
      queOfreces: "Servicio ficticio de prueba.",
      horario: "L-V 9am-6pm",
      motivoRechazo: estado === "rechazado" ? "Motivo ficticio de rechazo" : null,
      rechazadoEn: estado === "rechazado" ? haceDias(diasAtras) : null,
      consintioAvisoEn: registradoEn ?? haceDias(diasAtras),
      registradoEn: registradoEn ?? haceDias(diasAtras),
      estado,
    },
  });
}

const listar = (
  estado: Parameters<typeof obtenerListadoDeNegocios>[1]["estado"],
  pagina = 1,
  porPagina = PORPAGINA_LISTADO,
) => obtenerListadoDeNegocios(prisma, { estado, pagina, porPagina });

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
  await prisma.negocio.deleteMany();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.negocio.deleteMany();
});

describe("revision-admin · el listado trae todos los registros, sin importar su estado", () => {
  // Scenario: la lista trae los cuatro casos
  it("los cuatro casos aparecen, y el despublicado viene marcado", async () => {
    await alta({ nombre: "Ficticio en revisión", whatsapp: `${PREFIJO}001`, diasAtras: 1 });
    await alta({
      nombre: "Ficticio publicado",
      whatsapp: `${PREFIJO}002`,
      diasAtras: 2,
      estado: "publicado",
    });
    await alta({
      nombre: "Ficticio rechazado",
      whatsapp: `${PREFIJO}003`,
      diasAtras: 3,
      estado: "rechazado",
    });
    const despublicado = await alta({
      nombre: "Ficticio despublicado",
      whatsapp: `${PREFIJO}004`,
      diasAtras: 4,
    });
    await prisma.negocio.update({
      where: { id: despublicado.id },
      data: {
        despublicadoEn: haceDias(1),
        motivoDespublicacion: "Motivo ficticio de despublicación",
        publicadoEn: haceDias(3),
      },
    });

    const { registros, total } = await listar(FILTRO_TODOS);

    expect(total).toBe(4);
    expect(registros.map((registro) => registro.nombre)).toEqual([
      "Ficticio en revisión",
      "Ficticio publicado",
      "Ficticio rechazado",
      "Ficticio despublicado",
    ]);
    expect(registros.map((registro) => registro.estado)).toEqual([
      "en_revision",
      "publicado",
      "rechazado",
      "en_revision",
    ]);
    expect(registros.map((registro) => registro.vieneDeDespublicacion)).toEqual([
      false,
      false,
      false,
      true,
    ]);
  });

  // Mismo criterio que la cola: si después de despublicarla el negocio reenvió,
  // lo último que le pasó fue el reenvío y la etiqueta no aplica.
  it("una ficha despublicada y luego reenviada no viene marcada", async () => {
    const reenviada = await alta({
      nombre: "Ficticio reenviado",
      whatsapp: `${PREFIJO}005`,
      diasAtras: 1,
    });
    await prisma.negocio.update({
      where: { id: reenviada.id },
      data: { despublicadoEn: haceDias(30), motivoDespublicacion: "Motivo ficticio" },
    });

    const { registros } = await listar(FILTRO_TODOS);
    expect(registros[0].vieneDeDespublicacion).toBe(false);
  });

  // Scenario: lo más reciente arriba
  it("ordena por la fecha de registro, de la más reciente a la más antigua", async () => {
    await alta({ nombre: "Ficticio de hace 5 días", whatsapp: `${PREFIJO}010`, diasAtras: 5 });
    await alta({ nombre: "Ficticio de hoy", whatsapp: `${PREFIJO}011`, diasAtras: 0 });
    await alta({ nombre: "Ficticio de hace 2 días", whatsapp: `${PREFIJO}012`, diasAtras: 2 });

    const { registros } = await listar(FILTRO_TODOS);
    expect(registros.map((registro) => registro.nombre)).toEqual([
      "Ficticio de hoy",
      "Ficticio de hace 2 días",
      "Ficticio de hace 5 días",
    ]);
    // La fecha que muestra el renglón es exactamente la del orden.
    const fechas = registros.map((registro) => registro.registradoEn.getTime());
    expect(fechas).toEqual([...fechas].sort((uno, otro) => otro - uno));
  });

  // El reloj del listado NO es el de la cola: una ficha vieja despublicada
  // ayer se queda donde su fecha de registro la puso (design.md §2).
  it("una despublicación reciente no adelanta a la ficha en el listado", async () => {
    const vieja = await alta({
      nombre: "Ficticio viejo despublicado ayer",
      whatsapp: `${PREFIJO}013`,
      diasAtras: 300,
    });
    await prisma.negocio.update({
      where: { id: vieja.id },
      data: { despublicadoEn: haceDias(1), motivoDespublicacion: "Motivo ficticio" },
    });
    await alta({ nombre: "Ficticio de hace 3 días", whatsapp: `${PREFIJO}014`, diasAtras: 3 });

    const { registros } = await listar(FILTRO_TODOS);
    expect(registros.map((registro) => registro.nombre)).toEqual([
      "Ficticio de hace 3 días",
      "Ficticio viejo despublicado ayer",
    ]);
  });

  it("muestra la colonia del catálogo o, si no la hay, el texto libre capturado", async () => {
    await alta({ nombre: "Ficticio con catálogo", whatsapp: `${PREFIJO}015`, diasAtras: 1 });
    await alta({
      nombre: "Ficticio con Otra",
      whatsapp: `${PREFIJO}016`,
      diasAtras: 2,
      conColonia: false,
      coloniaOtra: "Rinconada del Venado (inventada)",
    });

    const { registros } = await listar(FILTRO_TODOS);
    expect(registros.map((registro) => registro.coloniaTexto)).toEqual([
      "Haciendas de Tizayuca",
      "Rinconada del Venado (inventada)",
    ]);
  });

  // Scenario: base sin negocios
  it("con la base vacía devuelve cero renglones y cero total", async () => {
    expect(await listar(FILTRO_TODOS)).toEqual({ registros: [], total: 0 });
  });
});

describe("revision-admin · el desempate del orden es estable", () => {
  // Requirement: "Entre dos registros con la misma fecha el orden DEBE ser
  // estable, de modo que un mismo registro no aparezca dos veces ni
  // desaparezca al pasar de página".
  it("dos registros con la misma fecha salen siempre en el mismo orden", async () => {
    const mismoInstante = haceDias(7);
    await alta({
      nombre: "Ficticio empatado A",
      whatsapp: `${PREFIJO}020`,
      diasAtras: 0,
      registradoEn: mismoInstante,
    });
    await alta({
      nombre: "Ficticio empatado B",
      whatsapp: `${PREFIJO}021`,
      diasAtras: 0,
      registradoEn: mismoInstante,
    });
    await alta({
      nombre: "Ficticio empatado C",
      whatsapp: `${PREFIJO}022`,
      diasAtras: 0,
      registradoEn: mismoInstante,
    });

    const corridas = await Promise.all([
      listar(FILTRO_TODOS),
      listar(FILTRO_TODOS),
      listar(FILTRO_TODOS),
    ]);
    const ids = corridas.map(({ registros }) => registros.map((r) => r.id));
    expect(ids[1]).toEqual(ids[0]);
    expect(ids[2]).toEqual(ids[0]);
  });

  it("con la misma fecha, nadie se repite ni se pierde al pasar de página", async () => {
    const mismoInstante = haceDias(9);
    for (let i = 0; i < 6; i += 1) {
      await alta({
        nombre: `Ficticio empatado ${i}`,
        whatsapp: `${PREFIJO}03${i}`,
        diasAtras: 0,
        registradoEn: mismoInstante,
      });
    }

    const recorridos: string[] = [];
    for (const pagina of [1, 2, 3]) {
      const { registros } = await listar(FILTRO_TODOS, pagina, 2);
      expect(registros).toHaveLength(2);
      recorridos.push(...registros.map((registro) => registro.id));
    }
    expect(new Set(recorridos).size).toBe(6);
  });
});

describe("revision-admin · el filtro por estado y su conteo", () => {
  beforeEach(async () => {
    await alta({ nombre: "Ficticio pendiente 1", whatsapp: `${PREFIJO}101`, diasAtras: 1 });
    await alta({ nombre: "Ficticio pendiente 2", whatsapp: `${PREFIJO}102`, diasAtras: 2 });
    await alta({
      nombre: "Ficticio publicado 1",
      whatsapp: `${PREFIJO}103`,
      diasAtras: 3,
      estado: "publicado",
    });
    await alta({
      nombre: "Ficticio publicado 2",
      whatsapp: `${PREFIJO}104`,
      diasAtras: 4,
      estado: "publicado",
    });
    await alta({
      nombre: "Ficticio publicado 3",
      whatsapp: `${PREFIJO}105`,
      diasAtras: 5,
      estado: "publicado",
    });
    await alta({
      nombre: "Ficticio rechazado 1",
      whatsapp: `${PREFIJO}106`,
      diasAtras: 6,
      estado: "rechazado",
    });
  });

  // Scenario: ver solo lo publicado
  it.each([
    ["todos" as const, 6],
    ["en_revision" as const, 2],
    ["publicado" as const, 3],
    ["rechazado" as const, 1],
  ])("el filtro %s trae %i registros, y el total es el del filtro", async (filtro, cuantos) => {
    const { registros, total } = await listar(filtro);
    expect(total).toBe(cuantos);
    expect(registros).toHaveLength(cuantos);
    if (filtro !== "todos") {
      expect(registros.every((registro) => registro.estado === filtro)).toBe(true);
    }
  });

  // Scenario: un filtro sin resultados
  it("un filtro sin registros devuelve lista vacía y total cero, sin error", async () => {
    await prisma.negocio.deleteMany({ where: { estado: "rechazado" } });
    expect(await listar("rechazado")).toEqual({ registros: [], total: 0 });
  });
});

describe("revision-admin · el listado no pinta más datos de los necesarios", () => {
  // Scenario: el listado no pinta más datos de los necesarios
  it("cada renglón trae exactamente seis campos, y ninguno es personal de más", async () => {
    const rechazado = await alta({
      nombre: "Ficticio con todo capturado",
      whatsapp: `${PREFIJO}200`,
      diasAtras: 1,
      estado: "rechazado",
    });
    await prisma.negocio.update({
      where: { id: rechazado.id },
      data: {
        fotoClave: "ficticia/clave-de-prueba.webp",
        facebookUrl: "https://www.facebook.com/ficticio",
        despublicadoEn: haceDias(0),
        motivoDespublicacion: "Motivo ficticio de despublicación",
      },
    });

    const { registros } = await listar(FILTRO_TODOS);
    const [renglon] = registros;

    expect(Object.keys(renglon).sort()).toEqual(LLAVES_DEL_RENGLON);
    for (const campo of CAMPOS_PROHIBIDOS) {
      expect(renglon, campo).not.toHaveProperty(campo);
    }
    // Y tampoco de refilón, dentro de algún valor serializado.
    const serializado = JSON.stringify(registros);
    expect(serializado).not.toContain(`${PREFIJO}200`);
    expect(serializado).not.toContain("7717770000");
    expect(serializado).not.toContain("Andador inventado sin número");
    expect(serializado).not.toContain("Motivo ficticio");
    expect(serializado).not.toContain("clave-de-prueba");
  });
});

// ── Que el corte lo haga la base, no la memoria (tasks.md #4) ──────────────

/**
 * Cliente de paso que anota qué le pidió la consulta a la base y cuántas filas
 * le devolvió. Si alguien sustituyera el `skip`/`take` por un `slice` en
 * memoria, `findMany` traería las 200 filas y estas pruebas se pondrían rojas.
 */
function clienteEspia(real: PrismaClient) {
  const llamadas: Array<{ args: Record<string, unknown>; filas: number }> = [];
  const espia: ClientePanel = {
    negocio: {
      async findMany(args: unknown) {
        const filas = (await real.negocio.findMany(
          args as Parameters<typeof real.negocio.findMany>[0],
        )) as unknown[];
        llamadas.push({ args: args as Record<string, unknown>, filas: filas.length });
        return filas;
      },
      findUnique: (args: unknown) =>
        real.negocio.findUnique(args as Parameters<typeof real.negocio.findUnique>[0]),
      count: (args: unknown) =>
        real.negocio.count(args as Parameters<typeof real.negocio.count>[0]),
    },
    // El listado no lee ediciones, pero `ClientePanel` las declara desde
    // T-014 (la cola mezcla altas y ediciones): el espía delega a la base
    // real para no fingir un cliente que no existe.
    edicionPendiente: {
      findMany: (args: unknown) =>
        real.edicionPendiente.findMany(
          args as Parameters<typeof real.edicionPendiente.findMany>[0],
        ) as Promise<unknown[]>,
    },
  };
  return { espia, llamadas };
}

describe("revision-admin · el corte de la página lo hace la base", () => {
  const TOTAL = 200;
  let esperados: RegistroListadoItem[] = [];

  beforeEach(async () => {
    const datos = Array.from({ length: TOTAL }, (_, i) => ({
      nombre: `Ficticio de volumen ${String(i).padStart(3, "0")}`,
      categoriaId,
      coloniaId,
      // El índice manda el orden: el 000 es el más reciente.
      whatsapp: `${PREFIJO}${String(i).padStart(3, "0")}`,
      consintioAvisoEn: haceDias(i),
      registradoEn: haceDias(i),
    }));
    await prisma.negocio.createMany({ data: datos });
    esperados = datos.map((dato) => ({
      id: "",
      nombre: dato.nombre,
      coloniaTexto: "Haciendas de Tizayuca",
      registradoEn: dato.registradoEn,
      estado: "en_revision" as const,
      vieneDeDespublicacion: false,
    }));
  });

  // Scenario: la lista larga se corta + Scenario: el HTML no crece con la base
  it("pide 25 filas a la base y 25 filas es lo que la base devuelve", async () => {
    const { espia, llamadas } = clienteEspia(prisma);
    const { registros, total } = await obtenerListadoDeNegocios(espia, {
      estado: FILTRO_TODOS,
      pagina: 1,
      porPagina: PORPAGINA_LISTADO,
    });

    expect(total).toBe(TOTAL);
    expect(registros).toHaveLength(PORPAGINA_LISTADO);
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].args).toMatchObject({ skip: 0, take: PORPAGINA_LISTADO });
    // La base trajo la página, no la tabla: aquí muere el `slice` en memoria.
    expect(llamadas[0].filas).toBe(PORPAGINA_LISTADO);
  });

  it("la página 3 son las filas 51 a 75 del mismo orden, pedidas con skip", async () => {
    const { espia, llamadas } = clienteEspia(prisma);
    const { registros } = await obtenerListadoDeNegocios(espia, {
      estado: FILTRO_TODOS,
      pagina: 3,
      porPagina: PORPAGINA_LISTADO,
    });

    expect(llamadas[0].args).toMatchObject({ skip: 50, take: PORPAGINA_LISTADO });
    expect(llamadas[0].filas).toBe(PORPAGINA_LISTADO);
    expect(registros.map((registro) => registro.nombre)).toEqual(
      esperados.slice(50, 75).map((registro) => registro.nombre),
    );
  });

  // Scenario: página más allá de la última
  it("una página más allá de la última devuelve vacío, sin error y con el total intacto", async () => {
    const { registros, total } = await listar(FILTRO_TODOS, 99);
    expect(registros).toEqual([]);
    expect(total).toBe(TOTAL);
  });

  it("ni siquiera la página más grande que la URL admite revienta la consulta", async () => {
    const { registros, total } = await listar(FILTRO_TODOS, 1_000_000);
    expect(registros).toEqual([]);
    expect(total).toBe(TOTAL);
  });

  it("el conteo del filtro se le pide a la base, no se cuenta en memoria", async () => {
    await prisma.negocio.updateMany({
      where: { nombre: { startsWith: "Ficticio de volumen 00" } },
      data: { estado: "publicado" },
    });
    const { espia, llamadas } = clienteEspia(prisma);
    const { registros, total } = await obtenerListadoDeNegocios(espia, {
      estado: "publicado",
      pagina: 1,
      porPagina: PORPAGINA_LISTADO,
    });

    expect(total).toBe(10);
    expect(registros).toHaveLength(10);
    expect(llamadas[0].args).toMatchObject({ where: { estado: "publicado" } });
  });
});
