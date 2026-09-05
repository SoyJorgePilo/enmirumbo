import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => {
  const simulado = await import("./admin-mocks");
  return { cookies: simulado.cookies, headers: simulado.headers };
});
vi.mock("next/navigation", async () => {
  const simulado = await import("./admin-mocks");
  const real = await vi.importActual<typeof import("next/navigation")>(
    "next/navigation",
  );
  return { ...real, redirect: simulado.redirect, notFound: simulado.notFound };
});

import { seedCatalogos } from "../prisma/seed";
import { sembrarNegociosDemo } from "../prisma/seed-demo";
import ListadoCategoriaPage from "../src/app/(publico)/[destino]/page";
import AvisoDePrivacidadPage from "../src/app/(publico)/aviso-de-privacidad/page";
import BuscarPage from "../src/app/(publico)/buscar/page";
import FichaNegocioPage from "../src/app/(publico)/negocio/[ficha]/page";
import ReportarNegocioPage from "../src/app/(publico)/negocio/[ficha]/reportar/page";
import EditarPage from "../src/app/(gestion)/editar/[token]/page";
import EditarGraciasPage from "../src/app/(gestion)/editar/[token]/gracias/page";
import Home from "../src/app/(publico)/page";
import RegistroPage from "../src/app/(publico)/registro/page";
import TerminosPage from "../src/app/(publico)/terminos/page";
import NotFoundPage from "../src/app/not-found";
import { Footer } from "../src/components/footer";
import { Header } from "../src/components/header";
import type { PrismaClient } from "../src/generated/prisma/client";
import { construirSegmentoFicha } from "../src/lib/ficha-url";
import { huellaDeToken } from "../src/lib/gestion/token";
import { crearClientePrueba } from "./db";

/**
 * GUARDIÁN DEL COLAPSO RESPONSIVO — spec `layout-base`, requirement "Diseño
 * mobile-first sin scroll horizontal" (enmienda aprobada por el fundador,
 * revisión visual lote 2).
 *
 * Por qué existe: el fundador reportó "desbordamiento horizontal a 390px" con
 * capturas donde el botón "Buscar", los nombres de categoría y el botón
 * "Enviar WhatsApp" salían cortados. Medido con el viewport EMULADO en 390px
 * (`Emulation.setDeviceMetricsOverride` por CDP), `document.documentElement.
 * scrollWidth` daba exactamente 390 en las seis pantallas: no había
 * desbordamiento. Lo que fallaba era la forma de capturar: pedirle a Chrome
 * `--headless=new --window-size=390,844` en macOS deja `innerWidth` en **500**
 * (el sistema no achica más la ventana), la página maqueta a 500 y la captura
 * se recorta a los 390 pedidos — o sea, corta lo que en un celular real cabe.
 * Quien vuelva a verificar anchos: emula el dispositivo y compara
 * `scrollWidth` contra `clientWidth`; no confíes en `--window-size`.
 *
 * Aun así, la revisión encontró defectos reales de colapso (retícula de
 * categorías sin fila de una sola columna, buscador en fila apretada, hueco de
 * foto estirado, etiqueta "A domicilio" a todo lo ancho). La verificación
 * anterior era "por construcción" —un comentario en el código— y no mordió.
 * Este guardián muerde: revisa el HTML SERVIDO de las pantallas públicas y el
 * código de sus componentes, y falla si aparece una clase que impide el
 * colapso.
 */

const raiz = join(__dirname, "..");
const fuente = (ruta: string) => readFileSync(join(raiz, ruta), "utf8");

/** Clases prohibidas en superficies públicas fluidas, con su porqué. */
const CLASES_PROHIBIDAS: Array<[RegExp, string]> = [
  [/\bwhitespace-nowrap\b/, "fuerza el texto a una sola línea"],
  [/\btext-nowrap\b/, "fuerza el texto a una sola línea"],
  [/\btruncate\b/, "amputa la etiqueta con puntos suspensivos"],
  [/\btext-ellipsis\b/, "amputa la etiqueta con puntos suspensivos"],
  [/\boverflow-x-(auto|scroll)\b/, "esconde el desbordamiento en vez de colapsar"],
  [/\bflex-nowrap\b/, "impide que la fila baje a la siguiente línea"],
  [/(^|:)min-w-(?!0\b)/, "fija un ancho mínimo que impide colapsar"],
  // Anchos arbitrarios en PÍXELES: un `max-w-[65ch]` para medir una línea de
  // lectura es legítimo; `w-[420px]` en una pantalla de 390px no.
  [/(^|:)(min-|max-)?w-\[[^\]]*px\]/, "fija un ancho en píxeles"],
];

/** `grid-cols-N` con N ≥ 2 y SIN prefijo de punto de quiebre. */
const COLUMNAS_FIJAS = /^grid-cols-([2-9]|1[0-2])$/;

/** Archivos de las pantallas públicas (lo que ve un vecino, no `/admin`). */
function archivosPublicos(): string[] {
  const rutas: string[] = [];
  const recorrer = (dir: string) => {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      const ruta = join(dir, entrada.name);
      if (entrada.isDirectory()) recorrer(ruta);
      else if (ruta.endsWith(".tsx")) rutas.push(ruta);
    }
  };
  recorrer(join(raiz, "src/app/(publico)"));
  recorrer(join(raiz, "src/components/directorio"));
  recorrer(join(raiz, "src/components/registro"));
  // Modo edición del enlace de gestión (change `agregar-enlace-de-gestion`).
  recorrer(join(raiz, "src/components/gestion"));
  recorrer(join(raiz, "src/components/reportes"));
  recorrer(join(raiz, "src/components/legales"));
  rutas.push(
    join(raiz, "src/components/header.tsx"),
    join(raiz, "src/components/footer.tsx"),
    join(raiz, "src/app/layout.tsx"),
    join(raiz, "src/app/not-found.tsx"),
  );
  return rutas;
}

/** Todas las clases sueltas de un HTML servido. */
function clasesDelHtml(html: string): string[] {
  return [...html.matchAll(/class="([^"]*)"/g)].flatMap((m) =>
    m[1].split(/\s+/).filter(Boolean),
  );
}

/** Todas las clases sueltas de un archivo fuente (cualquier literal de clase). */
function clasesDelFuente(codigo: string): string[] {
  return [...codigo.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)]
    .flatMap((m) => (m[1] ?? m[2] ?? "").split(/[\s`]+/))
    .filter((clase) => Boolean(clase) && !clase.includes("$"));
}

let prisma: PrismaClient;
/** HTML servido de cada pantalla pública, por nombre legible. */
const pantallas = new Map<string, string>();

beforeAll(async () => {
  prisma = crearClientePrueba();
  await prisma.negocio.deleteMany();
  await seedCatalogos(prisma);
  await sembrarNegociosDemo(prisma, { NODE_ENV: "test" });

  const publicado = await prisma.negocio.findFirstOrThrow({
    where: { estado: "publicado" },
    select: { id: true, nombre: true },
  });
  // Modo edición (change `agregar-enlace-de-gestion`): se le pone enlace a
  // esta ficha para poder servir la pantalla y medirla como las demás.
  const TOKEN_RESPONSIVO = "R".repeat(43);
  await prisma.negocio.update({
    where: { id: publicado.id },
    data: {
      tokenGestionHash: huellaDeToken(TOKEN_RESPONSIVO),
      tokenGestionCreadoEn: new Date(),
    },
  });
  const segmento = construirSegmentoFicha(publicado.nombre, publicado.id);

  const render = async (elemento: unknown) =>
    renderToStaticMarkup(createElement(() => elemento as never));

  pantallas.set("home", await render(await Home()));
  pantallas.set(
    "listado",
    await render(
      await ListadoCategoriaPage({
        params: Promise.resolve({ destino: "servicios-del-hogar" }),
        searchParams: Promise.resolve({}),
      }),
    ),
  );
  pantallas.set(
    "ficha",
    await render(
      await FichaNegocioPage({
        params: Promise.resolve({ ficha: segmento }),
        searchParams: Promise.resolve({}),
      }),
    ),
  );
  pantallas.set(
    "reportar",
    await render(
      await ReportarNegocioPage({
        params: Promise.resolve({ ficha: segmento }),
        searchParams: Promise.resolve({}),
      }),
    ),
  );
  pantallas.set(
    "buscar",
    await render(
      await BuscarPage({
        searchParams: Promise.resolve({ q: "plomero" }),
      } as unknown as Parameters<typeof BuscarPage>[0]),
    ),
  );
  pantallas.set("registro", await render(await RegistroPage()));
  pantallas.set(
    "editar",
    await render(
      await EditarPage({
        params: Promise.resolve({ token: TOKEN_RESPONSIVO }),
      } as Parameters<typeof EditarPage>[0]),
    ),
  );
  pantallas.set("editar-gracias", renderToStaticMarkup(createElement(EditarGraciasPage)));
  pantallas.set("aviso", renderToStaticMarkup(createElement(AvisoDePrivacidadPage)));
  pantallas.set("terminos", renderToStaticMarkup(createElement(TerminosPage)));
  pantallas.set("404", renderToStaticMarkup(createElement(NotFoundPage)));
  pantallas.set("header", renderToStaticMarkup(createElement(Header)));
  pantallas.set("footer", renderToStaticMarkup(createElement(Footer)));
});

afterAll(async () => {
  await prisma.negocio.deleteMany();
  await prisma.$disconnect();
});

// Scenario: ninguna pantalla pública bloquea el colapso responsivo
describe("layout-base · guardián del colapso responsivo (HTML servido)", () => {
  it("ninguna pantalla pública usa clases que impidan colapsar", () => {
    const hallazgos: string[] = [];
    for (const [nombre, html] of pantallas) {
      for (const clase of clasesDelHtml(html)) {
        for (const [patron, porque] of CLASES_PROHIBIDAS) {
          if (patron.test(clase)) hallazgos.push(`${nombre}: "${clase}" ${porque}`);
        }
      }
    }
    expect(hallazgos).toEqual([]);
  });

  it("ninguna retícula pública fija columnas sin punto de quiebre", () => {
    const hallazgos: string[] = [];
    for (const [nombre, html] of pantallas) {
      for (const clase of clasesDelHtml(html)) {
        if (COLUMNAS_FIJAS.test(clase)) {
          hallazgos.push(`${nombre}: "${clase}" sin prefijo de punto de quiebre`);
        }
      }
    }
    expect(hallazgos).toEqual([]);
  });

  it("toda retícula pública declara una sola columna como base", () => {
    const hallazgos: string[] = [];
    for (const [nombre, html] of pantallas) {
      for (const lista of [...html.matchAll(/class="([^"]*)"/g)].map((m) => m[1])) {
        const clases = lista.split(/\s+/).filter(Boolean);
        if (!clases.includes("grid")) continue;
        if (!clases.some((c) => c.includes("grid-cols-"))) continue;
        if (!clases.includes("grid-cols-1")) {
          hallazgos.push(`${nombre}: "${lista}" no arranca en una columna`);
        }
      }
    }
    expect(hallazgos).toEqual([]);
  });
});

describe("layout-base · guardián del colapso responsivo (código fuente)", () => {
  const archivos = archivosPublicos();

  it("cubre las pantallas públicas y sus componentes", () => {
    expect(archivos.length).toBeGreaterThanOrEqual(20);
  });

  it("ningún componente público escribe una clase que impida colapsar", () => {
    const hallazgos: string[] = [];
    for (const archivo of archivos) {
      for (const clase of clasesDelFuente(readFileSync(archivo, "utf8"))) {
        for (const [patron, porque] of CLASES_PROHIBIDAS) {
          if (patron.test(clase)) {
            hallazgos.push(`${archivo.slice(raiz.length + 1)}: "${clase}" ${porque}`);
          }
        }
        if (COLUMNAS_FIJAS.test(clase)) {
          hallazgos.push(
            `${archivo.slice(raiz.length + 1)}: "${clase}" fija columnas sin punto de quiebre`,
          );
        }
      }
    }
    expect(hallazgos).toEqual([]);
  });

  it("las clases de botón compartidas tampoco fuerzan una sola línea", () => {
    const botones = fuente("src/lib/estilos-boton.ts");
    for (const [patron] of CLASES_PROHIBIDAS) {
      expect(botones).not.toMatch(patron);
    }
  });
});

// Scenario: el buscador se apila en celular (spec `directorio-publico`)
describe("directorio-publico · el buscador se apila en celular", () => {
  const buscador = fuente("src/components/directorio/buscador.tsx");

  it("la fila arranca apilada y solo se pone en línea con espacio", () => {
    expect(buscador).toMatch(/className="[^"]*\bflex-col\b[^"]*"/);
    expect(buscador).toMatch(/\bsm:flex-row\b/);
  });

  it("el botón Buscar ocupa todo el ancho en celular", () => {
    expect(buscador).toMatch(/\bw-full\b[^"]*\bsm:w-auto\b|\bsm:w-auto\b/);
  });

  it("el campo y el botón siguen midiendo al menos 44px", () => {
    expect(buscador).toMatch(/\bmin-h-11\b/);
  });
});

// Scenario: la retícula colapsa a una sola columna en pantallas muy angostas
// y Scenario: dos columnas en celular y tres en pantalla ancha
describe("directorio-publico · la retícula de categorías colapsa 1 → 2 → 3", () => {
  const grid = fuente("src/components/directorio/categorias-grid.tsx");

  it("arranca en una columna, pasa a dos y llega a tres", () => {
    expect(grid).toMatch(/\bgrid-cols-1\b/);
    expect(grid).toMatch(/min-\[[^\]]+\]:grid-cols-2\b/);
    expect(grid).toMatch(/\bsm:grid-cols-3\b/);
  });

  it("el nombre de la categoría puede quebrar en varias líneas", () => {
    for (const [patron] of CLASES_PROHIBIDAS) expect(grid).not.toMatch(patron);
  });

  // Scenario: todos los botones de una fila conservan la misma altura.
  // La celda (li) la estira la retícula, pero el enlace visible necesita
  // h-full o el botón corto de la fila deja un escalón muerto debajo
  // (hallazgo V-1 del validador del lote 2).
  it("el enlace de categoría llena su celda para igualar alturas por fila", () => {
    expect(grid).toMatch(/<Link[\s\S]*?className="[^"]*\bh-full\b/);
  });
});

// Scenario: la tarjeta no se estira ni se aprieta (spec `directorio-publico`)
describe("directorio-publico · la tarjeta del listado es fluida", () => {
  const tarjeta = fuente("src/components/directorio/tarjeta-negocio.tsx");
  const etiqueta = fuente("src/components/directorio/etiqueta-domicilio.tsx");

  it("el hueco de la foto conserva su proporción cuadrada y no se estira", () => {
    expect(tarjeta).toMatch(/\baspect-square\b/);
    // Sin `self-start`, el `align-items: stretch` del contenedor flex estira
    // el hueco a lo alto del texto y el cuadrado deja de ser cuadrado.
    expect(tarjeta).toMatch(/\bself-start\b/);
  });

  it("la columna de texto puede encogerse (min-w-0) y quebrar palabras", () => {
    expect(tarjeta).toMatch(/\bmin-w-0\b/);
    expect(tarjeta).toMatch(/\bbreak-words\b/);
  });

  it('la etiqueta "A domicilio" mide solo su texto', () => {
    expect(etiqueta).toMatch(/\bw-fit\b/);
  });
});
