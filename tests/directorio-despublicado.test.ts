import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import ListadoCategoriaPage from "../src/app/[categoria]/page";
import BuscarPage from "../src/app/buscar/page";
import FichaNegocioPage from "../src/app/negocio/[ficha]/page";
import Home from "../src/app/page";
import type { PrismaClient } from "../src/generated/prisma/client";
import { borrarNegocio, despublicarFicha } from "../src/lib/admin/transiciones";
import { datosDeBusqueda } from "../src/lib/busqueda";
import {
  buscarNegociosPublicados,
  obtenerColoniasConNegociosPublicados,
  obtenerNegocioPublicado,
  obtenerNegociosPublicados,
} from "../src/lib/directorio";
import { construirSegmentoFicha } from "../src/lib/ficha-url";
import { crearClientePrueba } from "./db";

// Spec: directorio-publico (delta `agregar-despublicar-y-borrado-arco`) ·
// Requirement "Solo se muestra lo que está publicado", scenarios de la ficha
// despublicada y de la borrada (tasks.md #15).
//
// Datos 100% ficticios (repo público + LFPDPPP): serie de pruebas 7719999xxx.

const PREFIJO = "7719999";
const CATEGORIA = "belleza";
const COLONIA = "tizayuca-centro";
const NOMBRE = "Estética Ficticia La Trenza de Oro";
const QUE_OFRECE = "Cortes, tintes y peinados inventados para toda la familia.";
const TELEFONO = "7717779001";
const DIRECCION = "Local 7 de una plaza inventada";
const HORARIO = "L-S 10am-8pm";
const MOTIVO = "El dueño nos pidió por WhatsApp que la bajáramos";

/** Todo lo que jamás puede aparecer en una pantalla pública tras la bajada. */
const DATOS_DEL_NEGOCIO = [
  NOMBRE,
  `${PREFIJO}001`,
  QUE_OFRECE,
  TELEFONO,
  DIRECCION,
  HORARIO,
];

let prisma: PrismaClient;
let categoriaId: number;
let coloniaId: number;
let id = "";
let segmento = "";

async function render(pagina: Promise<React.ReactElement>): Promise<string> {
  const elemento = await pagina;
  return renderToStaticMarkup(createElement(() => elemento));
}

const abrirHome = () => render(Home() as Promise<React.ReactElement>);

const abrirListado = (colonia?: string) =>
  render(
    ListadoCategoriaPage({
      params: Promise.resolve({ categoria: CATEGORIA }),
      searchParams: Promise.resolve(colonia === undefined ? {} : { colonia }),
    }) as Promise<React.ReactElement>,
  );

const abrirBuscador = (q: string) =>
  render(
    BuscarPage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({ q }),
    }) as Promise<React.ReactElement>,
  );

const abrirFicha = (segmentoFicha: string) =>
  render(
    FichaNegocioPage({
      params: Promise.resolve({ ficha: segmentoFicha }),
      searchParams: Promise.resolve({}),
    }) as Promise<React.ReactElement>,
  );

/** Digest del 404 de Next (`NEXT_HTTP_ERROR_FALLBACK;404`) o `null`. */
async function digestDe(promesa: Promise<unknown>): Promise<string | null> {
  try {
    await promesa;
    return null;
  } catch (error) {
    const digest = (error as { digest?: unknown }).digest;
    return typeof digest === "string" ? digest : null;
  }
}

/** Home, listado con y sin filtro de colonia, y buscador, en un solo tiro. */
async function pantallasPublicas(): Promise<Record<string, string>> {
  return {
    home: await abrirHome(),
    listado: await abrirListado(),
    "listado filtrado": await abrirListado(COLONIA),
    buscador: await abrirBuscador("estetica"),
  };
}

beforeAll(async () => {
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (await prisma.categoria.findUniqueOrThrow({ where: { slug: CATEGORIA } })).id;
  coloniaId = (await prisma.colonia.findUniqueOrThrow({ where: { slug: COLONIA } })).id;
});

afterAll(async () => {
  await prisma.negocio.deleteMany();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.negocio.deleteMany();
  const creado = await prisma.negocio.create({
    data: {
      nombre: NOMBRE,
      categoriaId,
      coloniaId,
      whatsapp: `${PREFIJO}001`,
      queOfreces: QUE_OFRECE,
      telefonoFijo: TELEFONO,
      direccion: DIRECCION,
      horario: HORARIO,
      consintioAvisoEn: new Date("2026-08-01T10:00:00.000Z"),
      registradoEn: new Date("2026-08-01T10:00:00.000Z"),
      estado: "publicado",
      publicadoEn: new Date("2026-08-02T10:00:00.000Z"),
      ...datosDeBusqueda(NOMBRE, QUE_OFRECE),
    },
  });
  id = creado.id;
  segmento = construirSegmentoFicha(NOMBRE, id);
});

describe("directorio-publico · mientras está publicada, la ficha sí se ve", () => {
  it("aparece en el listado, en el filtro de colonia, en el buscador y en su ficha", async () => {
    const pantallas = await pantallasPublicas();
    expect(pantallas.listado).toContain(NOMBRE);
    expect(pantallas["listado filtrado"]).toContain(NOMBRE);
    expect(pantallas.buscador).toContain(NOMBRE);
    expect(await abrirFicha(segmento)).toContain(NOMBRE);
    expect((await obtenerColoniasConNegociosPublicados(CATEGORIA)).map((c) => c.slug))
      .toContain(COLONIA);
  });
});

describe("directorio-publico · la ficha despublicada sale del directorio en la siguiente petición", () => {
  // Scenario: la ficha despublicada sale del directorio en la siguiente petición
  it("no aparece en la home, el listado, el filtro de colonia ni el buscador", async () => {
    await despublicarFicha(prisma, id, MOTIVO);

    for (const [pantalla, html] of Object.entries(await pantallasPublicas())) {
      for (const dato of DATOS_DEL_NEGOCIO) {
        expect(html, `${pantalla} filtra ${dato}`).not.toContain(dato);
      }
    }

    // Y los conteos y catálogos derivados de lo publicado tampoco la incluyen.
    expect(await obtenerNegociosPublicados(CATEGORIA)).toHaveLength(0);
    expect(await obtenerNegociosPublicados(CATEGORIA, COLONIA)).toHaveLength(0);
    expect(await obtenerColoniasConNegociosPublicados(CATEGORIA)).toEqual([]);
    expect(await buscarNegociosPublicados("estetica")).toEqual([]);
    expect(await obtenerNegocioPublicado(id)).toBeNull();
  });

  // Scenario: la URL de una ficha despublicada no delata nada
  it("su URL responde el mismo 404 que un identificador que nunca existió", async () => {
    await despublicarFicha(prisma, id, MOTIVO);

    const despublicada = await digestDe(abrirFicha(segmento));
    const inexistente = await digestDe(
      abrirFicha(construirSegmentoFicha("Negocio Que No Existe", "id-inventado-xyz")),
    );

    expect(despublicada).toBe("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(despublicada).toBe(inexistente);
  });

  // Scenario: la despublicación no se publica
  it("ninguna pantalla pública muestra la fecha ni el motivo de la despublicación", async () => {
    await despublicarFicha(prisma, id, MOTIVO);

    const pantallas = await pantallasPublicas();
    for (const [pantalla, html] of Object.entries(pantallas)) {
      expect(html, pantalla).not.toContain(MOTIVO);
      expect(html.toLowerCase(), pantalla).not.toContain("despublic");
    }
  });

  it("volver a publicarla la devuelve al directorio, sin arrastrar el motivo", async () => {
    await despublicarFicha(prisma, id, MOTIVO);
    await prisma.negocio.update({
      where: { id },
      data: { estado: "publicado", publicadoEn: new Date() },
    });

    const listado = await abrirListado();
    expect(listado).toContain(NOMBRE);
    expect(listado).not.toContain(MOTIVO);
  });
});

describe("directorio-publico · la ficha borrada tampoco deja rastro", () => {
  // Scenario: la ficha borrada tampoco deja rastro
  it("desaparece de todas las pantallas y su URL responde el mismo 404", async () => {
    await borrarNegocio(prisma, id);

    for (const [pantalla, html] of Object.entries(await pantallasPublicas())) {
      for (const dato of DATOS_DEL_NEGOCIO) {
        expect(html, `${pantalla} filtra ${dato}`).not.toContain(dato);
      }
    }

    expect(await obtenerNegociosPublicados(CATEGORIA)).toHaveLength(0);
    expect(await obtenerColoniasConNegociosPublicados(CATEGORIA)).toEqual([]);
    expect(await buscarNegociosPublicados("estetica")).toEqual([]);
    expect(await obtenerNegocioPublicado(id)).toBeNull();

    const borrada = await digestDe(abrirFicha(segmento));
    const inexistente = await digestDe(
      abrirFicha(construirSegmentoFicha("Negocio Que No Existe", "id-inventado-xyz")),
    );
    expect(borrada).toBe("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(borrada).toBe(inexistente);
  });

  it("borrar una despublicada no revive nada ni deja el motivo en ningún lado", async () => {
    await despublicarFicha(prisma, id, MOTIVO);
    await borrarNegocio(prisma, id);

    expect(await prisma.negocio.findUnique({ where: { id } })).toBeNull();
    for (const html of Object.values(await pantallasPublicas())) {
      expect(html).not.toContain(MOTIVO);
    }
  });
});

describe("directorio-publico · ninguna superficie pública despublica ni borra", () => {
  // Scenario: ninguna de las dos acciones vive en lo público
  it("ninguna página fuera de /admin importa las transiciones del panel", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const raiz = join(__dirname, "..");

    function archivosDe(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
        const ruta = join(dir, entrada.name);
        if (entrada.isDirectory()) return archivosDe(ruta);
        return /\.tsx?$/.test(entrada.name) ? [ruta] : [];
      });
    }

    const publicos = archivosDe(join(raiz, "src/app"))
      .filter((ruta) => !ruta.includes(`${join("src", "app", "admin")}`))
      .concat(archivosDe(join(raiz, "src/components/directorio")))
      .concat(archivosDe(join(raiz, "src/components/registro")));

    expect(publicos.length).toBeGreaterThan(5);
    for (const ruta of publicos) {
      const codigo = readFileSync(ruta, "utf8");
      expect(codigo, ruta).not.toContain("@/lib/admin/transiciones");
      expect(codigo, ruta).not.toContain("despublicarFicha");
      expect(codigo, ruta).not.toContain("borrarNegocio");
      expect(codigo, ruta).not.toContain("deleteMany");
    }
  });
});
