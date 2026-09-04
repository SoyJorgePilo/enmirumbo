import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import ListadoCategoriaPage from "../src/app/(publico)/[destino]/page";
import BuscarPage from "../src/app/(publico)/buscar/page";
import FichaNegocioPage from "../src/app/(publico)/negocio/[ficha]/page";
import type { PrismaClient } from "../src/generated/prisma/client";
import { datosDeBusqueda } from "../src/lib/busqueda";
import { construirSegmentoFicha } from "../src/lib/ficha-url";
import { crearReporte } from "../src/lib/reportes/crear";
import { reiniciarCupoDeReportes } from "../src/lib/reportes/limite";
import { ETIQUETA_MOTIVO_REPORTE, MOTIVOS_REPORTE } from "../src/lib/reportes/motivos";
import { crearClientePrueba } from "./db";

// Spec: directorio-publico · Requirements "Del reportante no se pide ni se
// guarda ningún dato" y "Un reporte no cambia nada de lo público", y
// revision-admin · "los reportes no salen del panel" (tasks.md #16).
//
// Datos 100% ficticios (repo público + LFPDPPP): números 771000 2xxx.

const raiz = join(__dirname, "..");
const PREFIJO = "7710002";
const IP = "203.0.113.50"; // TEST-NET-3, reservado para documentación
const COMENTARIO = "Me contestó otra persona, dice que ese negocio ya no existe.";
const normalizado = (html: string) => html.replace(/\s+/g, " ");

const NOMBRE = "Cerrajería Ficticia Puerta Segura";
const NOMBRE_VECINO = "Cerrajería Ficticia Doble Llave";

let prisma: PrismaClient;
let categoriaId: number;
let coloniaId: number;
let idReportado = "";
let idVecino = "";
let segmento = "";

async function alta(nombre: string, whatsapp: string, publicadoEn: string): Promise<string> {
  const creado = await prisma.negocio.create({
    data: {
      nombre,
      categoriaId,
      coloniaId,
      whatsapp,
      queOfreces: "Cambio de chapas y copias de llave (negocio inventado).",
      consintioAvisoEn: new Date(),
      estado: "publicado",
      publicadoEn: new Date(publicadoEn),
      ...datosDeBusqueda(nombre, "Cambio de chapas y copias de llave (negocio inventado)."),
    },
  });
  return creado.id;
}

const renderFicha = async (seg: string) => {
  const elemento = await FichaNegocioPage({
    params: Promise.resolve({ ficha: seg }),
    searchParams: Promise.resolve({}),
  });
  return renderToStaticMarkup(createElement(() => elemento));
};

const renderListado = async () => {
  const elemento = await ListadoCategoriaPage({
    params: Promise.resolve({ destino: "servicios-del-hogar" }),
    searchParams: Promise.resolve({}),
  });
  return renderToStaticMarkup(createElement(() => elemento));
};

const renderBuscar = async (q: string) => {
  const elemento = await BuscarPage({
    searchParams: Promise.resolve({ q }),
  } as unknown as Parameters<typeof BuscarPage>[0]);
  return renderToStaticMarkup(createElement(() => elemento));
};

beforeAll(async () => {
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (
    await prisma.categoria.findUniqueOrThrow({ where: { slug: "servicios-del-hogar" } })
  ).id;
  coloniaId = (
    await prisma.colonia.findUniqueOrThrow({ where: { slug: "haciendas-de-tizayuca" } })
  ).id;
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });

  idReportado = await alta(NOMBRE, `${PREFIJO}001`, "2026-08-20T10:00:00.000Z");
  idVecino = await alta(NOMBRE_VECINO, `${PREFIJO}002`, "2026-08-19T10:00:00.000Z");
  segmento = construirSegmentoFicha(NOMBRE, idReportado);
});

afterAll(async () => {
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  reiniciarCupoDeReportes();
  await prisma.reporte.deleteMany();
});

afterEach(() => vi.restoreAllMocks());

describe("privacidad · la tabla no puede guardar nada del reportante", () => {
  // Scenario: nada del reportante en el esquema
  it("ninguna columna del modelo huele a identidad de quien reportó", async () => {
    const columnas = (
      await prisma.$queryRawUnsafe<Array<{ name: string }>>('PRAGMA table_info("Reporte")')
    ).map((columna) => columna.name);

    expect(columnas).toHaveLength(7);
    for (const prohibida of [
      "ip",
      "ipHash",
      "huella",
      "sesion",
      "usuario",
      "correo",
      "telefono",
      "whatsapp",
      "nombre",
      "userAgent",
    ]) {
      expect(columnas.map((c) => c.toLowerCase())).not.toContain(prohibida.toLowerCase());
    }
  });

  it("el modelo del schema tampoco declara ninguna", () => {
    const schema = readFileSync(join(raiz, "prisma/schema.prisma"), "utf8");
    const modelo = schema.slice(schema.indexOf("model Reporte"));
    expect(modelo).toContain("motivo");
    expect(modelo).not.toMatch(/\bip\b|userAgent|huella|reportante|correo|telefono/i);
  });

  // Scenario: nada del reportante queda guardado
  it("un reporte recién creado solo trae negocio, motivo, comentario, estado y fechas", async () => {
    await crearReporte(prisma, {
      negocioId: idReportado,
      motivo: "cerrado",
      comentario: COMENTARIO,
      trampa: "",
      ip: IP,
    });

    const guardado = (await prisma.reporte.findMany())[0];
    expect(Object.keys(guardado).sort()).toEqual([
      "atendidoEn",
      "comentario",
      "creadoEn",
      "estado",
      "id",
      "motivo",
      "negocioId",
    ]);
    // Y en ningún valor guardado aparece la IP.
    expect(JSON.stringify(guardado)).not.toContain(IP);
  });

  // Scenario: la IP no se persiste ni se registra
  it("ni la IP ni el comentario llegan al log del servidor", async () => {
    const capturado: string[] = [];
    for (const nivel of ["log", "warn", "error", "info", "debug"] as const) {
      vi.spyOn(console, nivel).mockImplementation((...args: unknown[]) => {
        capturado.push(args.map(String).join(" "));
      });
    }

    const base = { negocioId: idReportado, trampa: "", ip: IP } as const;
    // Uno bueno, uno con trampa, uno con motivo inválido, uno con cupo
    // agotado y uno con el tope alcanzado: todos los caminos que loguean.
    await crearReporte(prisma, { ...base, motivo: "cerrado", comentario: COMENTARIO });
    await crearReporte(prisma, {
      ...base,
      motivo: "cerrado",
      comentario: COMENTARIO,
      trampa: "bot",
    });
    await crearReporte(prisma, { ...base, motivo: "inventado", comentario: COMENTARIO });
    await crearReporte(prisma, { ...base, motivo: "cerrado", comentario: COMENTARIO });
    await crearReporte(prisma, { ...base, motivo: "cerrado", comentario: COMENTARIO });
    await crearReporte(prisma, { ...base, motivo: "cerrado", comentario: COMENTARIO });

    const log = capturado.join("\n");
    expect(log).not.toContain(IP);
    expect(log).not.toContain(COMENTARIO);
    expect(log).not.toContain(idReportado);
    expect(log).not.toContain(NOMBRE);
  });
});

describe("privacidad · un reporte no cambia nada de lo público", () => {
  /** Deja el negocio con tres reportes pendientes, uno por motivo distinto. */
  async function sembrarReportes(): Promise<void> {
    await prisma.reporte.createMany({
      data: [
        { negocioId: idReportado, motivo: "cerrado", comentario: COMENTARIO },
        { negocioId: idReportado, motivo: "no_real", comentario: "No existe ese local." },
        { negocioId: idReportado, motivo: "datos_incorrectos" },
      ],
    });
  }

  // Scenario: la ficha reportada sigue igual
  it("la ficha se ve exactamente igual antes y después de los reportes", async () => {
    const antes = await renderFicha(segmento);
    await sembrarReportes();
    const despues = await renderFicha(segmento);

    expect(despues).toBe(antes);
    expect(despues).toContain("Negocio verificado");
  });

  // Scenario: sin rastro de reportes en el HTML público
  it.each([
    ["la ficha", () => renderFicha(segmento)],
    ["el listado", () => renderListado()],
    ["la página de resultados", () => renderBuscar("cerrajeria")],
  ])("%s no trae conteos, motivos ni comentarios", async (_caso, render) => {
    await sembrarReportes();
    const html = normalizado(await render());

    expect(html).toContain(NOMBRE); // el negocio sigue ahí
    expect(html).not.toContain(COMENTARIO);
    expect(html).not.toContain("No existe ese local.");
    for (const motivo of MOTIVOS_REPORTE) {
      expect(html).not.toContain(ETIQUETA_MOTIVO_REPORTE[motivo]);
      expect(html).not.toContain(`"${motivo}"`);
    }
    expect(html).not.toMatch(/\d+\s+reportes?/i);
    expect(html.toLowerCase()).not.toContain("reportado");
  });

  // Scenario: nada de auto-despublicar
  it("con el tope de pendientes el negocio sigue publicado y en su mismo lugar", async () => {
    const listadoAntes = await renderListado();
    const posicionAntes = listadoAntes.indexOf(NOMBRE) < listadoAntes.indexOf(NOMBRE_VECINO);

    await prisma.reporte.createMany({
      data: Array.from({ length: 10 }, () => ({ negocioId: idReportado, motivo: "cerrado" })),
    });

    const negocio = await prisma.negocio.findUniqueOrThrow({ where: { id: idReportado } });
    expect(negocio.estado).toBe("publicado");
    expect(negocio.publicadoEn).not.toBeNull();

    const listadoDespues = await renderListado();
    expect(listadoDespues).toContain(NOMBRE);
    expect(listadoDespues.indexOf(NOMBRE) < listadoDespues.indexOf(NOMBRE_VECINO)).toBe(
      posicionAntes,
    );
    expect(listadoDespues).toBe(listadoAntes);
    expect(idVecino).not.toBe("");
  });
});

describe("privacidad · los reportes solo se leen desde el panel", () => {
  it("ninguna superficie pública importa el módulo de reportes del panel", () => {
    const publicas = [
      ...archivosDe(join(raiz, "src/app")).filter(
        (ruta) => !ruta.startsWith(join(raiz, "src/app/admin")),
      ),
      ...archivosDe(join(raiz, "src/components")).filter(
        (ruta) => !ruta.startsWith(join(raiz, "src/components/admin")),
      ),
    ];
    expect(publicas.length).toBeGreaterThanOrEqual(10);

    for (const ruta of publicas) {
      const fuente = readFileSync(ruta, "utf8");
      expect(fuente, ruta).not.toContain("@/lib/admin/reportes");
      expect(fuente, ruta).not.toContain("@/lib/admin/consultas");
    }
  });

  it("las consultas públicas del directorio no leen la tabla de reportes", () => {
    for (const ruta of [
      "src/lib/directorio.ts",
      "src/lib/busqueda.ts",
      "src/lib/seo/datos-estructurados.ts",
    ]) {
      expect(readFileSync(join(raiz, ruta), "utf8"), ruta).not.toMatch(/\breporte\b/i);
    }
  });
});

function archivosDe(dir: string): string[] {
  const rutas: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) rutas.push(...archivosDe(ruta));
    else if (/\.tsx?$/.test(entrada.name)) rutas.push(ruta);
  }
  return rutas;
}
