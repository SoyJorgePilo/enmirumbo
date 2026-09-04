import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import DestinoPage from "../src/app/[destino]/page";
import BuscarPage from "../src/app/buscar/page";
import FichaNegocioPage from "../src/app/negocio/[ficha]/page";
import Home from "../src/app/page";
import sitemap from "../src/app/sitemap";
import type { PrismaClient } from "../src/generated/prisma/client";
import { borrarNegocio, despublicarFicha } from "../src/lib/admin/transiciones";
import { datosDeBusqueda } from "../src/lib/busqueda";
import {
  buscarNegociosPublicados,
  obtenerColoniasConNegociosPublicados,
  obtenerNegocioPublicado,
  obtenerNegociosPublicados,
  obtenerNegociosPublicadosPorGiro,
} from "../src/lib/directorio";
import { construirSegmentoFicha } from "../src/lib/ficha-url";
import { VARIABLE_URL_SITIO } from "../src/lib/sitio";
import { crearClientePrueba } from "./db";

// Spec: directorio-publico (delta `agregar-despublicar-y-borrado-arco`) ·
// Requirement "Solo se muestra lo que está publicado", scenarios de la ficha
// despublicada y de la borrada (tasks.md #15).
//
// El delta dejó fijada la regla para "cualquier índice que el sitio genere a
// partir de lo publicado (el sitemap, el día que exista)". Ese día llegó con
// T-009 (`agregar-seo-local`), así que esta suite cubre también las tres
// superficies nuevas: la página de giro, la de giro+colonia y el sitemap.
//
// Datos 100% ficticios (repo público + LFPDPPP): serie de pruebas 7719999xxx.

const PREFIJO = "7719999";
const CATEGORIA = "belleza";
const COLONIA = "tizayuca-centro";
const GIRO = "estetica";
const URL_SITIO = "https://despublicar.example";
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
let giroId: number;
let urlSitioPrevia: string | undefined;
let id = "";
let segmento = "";

async function render(pagina: Promise<React.ReactElement>): Promise<string> {
  const elemento = await pagina;
  return renderToStaticMarkup(createElement(() => elemento));
}

const abrirHome = () => render(Home() as Promise<React.ReactElement>);

/** Cualquiera de las tres páginas del segmento de la raíz (T-009). */
const abrirDestino = (destino: string, colonia?: string) =>
  render(
    DestinoPage({
      params: Promise.resolve({ destino }),
      searchParams: Promise.resolve(colonia === undefined ? {} : { colonia }),
    }) as Promise<React.ReactElement>,
  );

const abrirListado = (colonia?: string) => abrirDestino(CATEGORIA, colonia);

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

/**
 * Todas las pantallas públicas que pueden mostrar a este negocio, en un solo
 * tiro: home, listado por categoría con y sin filtro de colonia, buscador y
 * —desde T-009— la página del giro y la de giro+colonia.
 */
async function pantallasPublicas(): Promise<Record<string, string>> {
  return {
    home: await abrirHome(),
    listado: await abrirListado(),
    "listado filtrado": await abrirListado(COLONIA),
    buscador: await abrirBuscador("estetica"),
    giro: await abrirDestino(GIRO),
    "giro y colonia": await abrirDestino(`${GIRO}-${COLONIA}`),
  };
}

/** Las URLs del sitemap, que se arma de lo publicado en cada petición. */
async function urlsDelSitemap(): Promise<string[]> {
  return (await sitemap()).map((entrada) => entrada.url);
}

beforeAll(async () => {
  urlSitioPrevia = process.env[VARIABLE_URL_SITIO];
  process.env[VARIABLE_URL_SITIO] = URL_SITIO;
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (await prisma.categoria.findUniqueOrThrow({ where: { slug: CATEGORIA } })).id;
  coloniaId = (await prisma.colonia.findUniqueOrThrow({ where: { slug: COLONIA } })).id;
  giroId = (await prisma.giro.findUniqueOrThrow({ where: { slug: GIRO } })).id;
});

afterAll(async () => {
  await prisma.negocio.deleteMany();
  await prisma.$disconnect();
  if (urlSitioPrevia === undefined) delete process.env[VARIABLE_URL_SITIO];
  else process.env[VARIABLE_URL_SITIO] = urlSitioPrevia;
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
      // Con giro asignado: sin él no existirían ni la página del giro ni la de
      // giro+colonia ni sus renglones del sitemap (T-009).
      giros: { connect: { id: giroId } },
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
    expect(pantallas.giro).toContain(NOMBRE);
    expect(pantallas["giro y colonia"]).toContain(NOMBRE);
    expect(await abrirFicha(segmento)).toContain(NOMBRE);
    expect((await obtenerColoniasConNegociosPublicados(CATEGORIA)).map((c) => c.slug))
      .toContain(COLONIA);
    expect(await obtenerNegociosPublicadosPorGiro(GIRO)).toHaveLength(1);
  });

  // La otra mitad del control: si el sitemap no la trajera estando publicada,
  // las pruebas de abajo pasarían por la razón equivocada.
  it("el sitemap trae su ficha, su giro y su par giro+colonia", async () => {
    const urls = await urlsDelSitemap();
    expect(urls).toContain(`${URL_SITIO}/negocio/${segmento}`);
    expect(urls).toContain(`${URL_SITIO}/${GIRO}`);
    expect(urls).toContain(`${URL_SITIO}/${GIRO}-${COLONIA}`);
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
    expect(await obtenerNegociosPublicadosPorGiro(GIRO)).toEqual([]);
  });

  // Scenario: la ficha despublicada sale del directorio en la siguiente
  // petición — "de cualquier índice que el sitio genere a partir de lo
  // publicado (el sitemap, el día que exista)". Ese día es T-009.
  it("sale del sitemap en la siguiente petición, con su giro y su par", async () => {
    await despublicarFicha(prisma, id, MOTIVO);

    const urls = await urlsDelSitemap();
    expect(urls).not.toContain(`${URL_SITIO}/negocio/${segmento}`);
    // El giro y el par se caen porque ya no les queda ningún publicado: eran
    // suyos y de nadie más.
    expect(urls).not.toContain(`${URL_SITIO}/${GIRO}`);
    expect(urls).not.toContain(`${URL_SITIO}/${GIRO}-${COLONIA}`);
    const serializado = JSON.stringify(await sitemap());
    expect(serializado).not.toContain(id);
    expect(serializado).not.toContain(MOTIVO);
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
    expect(await obtenerNegociosPublicadosPorGiro(GIRO)).toEqual([]);

    const urls = await urlsDelSitemap();
    expect(urls).not.toContain(`${URL_SITIO}/negocio/${segmento}`);
    expect(urls).not.toContain(`${URL_SITIO}/${GIRO}`);
    expect(urls).not.toContain(`${URL_SITIO}/${GIRO}-${COLONIA}`);
    expect(JSON.stringify(await sitemap())).not.toContain(id);

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
