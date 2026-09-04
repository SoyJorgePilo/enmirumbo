import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { sembrarNegociosDemo } from "../prisma/seed-demo";
import DestinoPage, { generateMetadata as metadataDestino } from "../src/app/(publico)/[destino]/page";
import { metadata as metadataDeLa404 } from "../src/app/not-found";
import FichaNegocioPage, {
  generateMetadata as metadataFicha,
} from "../src/app/(publico)/negocio/[ficha]/page";
import type { PrismaClient } from "../src/generated/prisma/client";
import { datosDeBusqueda } from "../src/lib/busqueda";
import {
  VIGENCIA_CATALOGOS_MS,
  obtenerCatalogosDeLaRaiz,
  reiniciarMemoriaDeCatalogos,
} from "../src/lib/directorio";
import { construirSegmentoFicha } from "../src/lib/ficha-url";
import { imagenesDeMarca, metadataDelSitio } from "../src/lib/seo/metadata";
import {
  MARCA_DE_NUMERO_OCULTO,
  ocultarNumerosDeContacto,
} from "../src/lib/seo/saneo";
import { descripcionFicha } from "../src/lib/seo/titulos";
import { VARIABLE_URL_SITIO } from "../src/lib/sitio";
import { crearClientePrueba } from "./db";

/**
 * Iteración 2 del change `agregar-seo-local`: los tres hallazgos medios y la
 * observación baja del reporte de la etapa C (`reports/c-seguridad.md`).
 *
 * - M1 · construir sin `SITIO_URL` publicaba una `og:image` a `localhost` en
 *   la 404 (spec `layout-base`, scenario "producción sin URL pública
 *   declarada");
 * - M2 · el "¿Qué ofreces?" viajaba literal a la meta descripción, a
 *   `og:description` y al JSON-LD, número de teléfono incluido (spec
 *   `directorio-publico`: "La descripción NO DEBE incluir el WhatsApp ni el
 *   teléfono del negocio"; hallazgo M5 de T-004);
 * - M4 · los tres catálogos se leían dos veces por petición.
 *
 * Los contadores de consultas usan el mismo cliente de la base que la
 * aplicación, envuelto para contar (igual que `tests/seo-consultas.test.ts`).
 */

const URL_SITIO = "https://necesitouno.example";
const PREFIJO = "7719997";

const consultas: string[] = [];
vi.mock("../src/lib/prisma", async () => {
  const { crearClientePrueba: crear } = await import("./db");
  const real = crear();
  const contado = new Proxy(real, {
    get(objetivo, modelo: string) {
      const valor = Reflect.get(objetivo, modelo);
      if (!valor || typeof valor !== "object" || modelo.startsWith("$")) return valor;
      return new Proxy(valor, {
        get(delegado, metodo: string) {
          const fn = Reflect.get(delegado, metodo);
          if (typeof fn !== "function") return fn;
          return (...args: unknown[]) => {
            consultas.push(`${modelo}.${metodo}`);
            return fn.apply(delegado, args);
          };
        },
      });
    },
  });
  return { obtenerPrisma: () => contado };
});

let prisma: PrismaClient;
let idPorWhatsapp: Record<string, string> = {};

/** "¿Qué ofreces?" con un teléfono adentro, como lo escribe medio directorio. */
const OFRECE_CON_NUMERO =
  "Plomería 24 horas, llámanos al 771 000 0000 o al 7717770000.";

beforeAll(async () => {
  process.env[VARIABLE_URL_SITIO] = URL_SITIO;
  prisma = crearClientePrueba();
  await prisma.negocio.deleteMany();
  await seedCatalogos(prisma);
  await sembrarNegociosDemo(prisma, { NODE_ENV: "test" });

  const categoria = await prisma.categoria.findUniqueOrThrow({
    where: { slug: "servicios-del-hogar" },
  });
  const colonia = await prisma.colonia.findUniqueOrThrow({
    where: { slug: "huicalco" },
  });
  await prisma.negocio.upsert({
    where: { whatsapp: `${PREFIJO}001` },
    update: {},
    create: {
      nombre: "Plomería Del Número Ficticia",
      categoriaId: categoria.id,
      coloniaId: colonia.id,
      whatsapp: `${PREFIJO}001`,
      queOfreces: OFRECE_CON_NUMERO,
      ...datosDeBusqueda("Plomería Del Número Ficticia", OFRECE_CON_NUMERO),
      estado: "publicado",
      origen: "siembra",
      publicadoEn: new Date("2026-08-14T10:00:00.000Z"),
      consintioAvisoEn: new Date("2026-07-31T10:00:00.000Z"),
      registradoEn: new Date("2026-07-31T10:00:00.000Z"),
      giros: { connect: [{ slug: "plomeria" }] },
    },
  });

  const negocios = await prisma.negocio.findMany({
    select: { id: true, whatsapp: true },
  });
  idPorWhatsapp = Object.fromEntries(negocios.map((n) => [n.whatsapp, n.id]));
});

afterAll(async () => {
  delete process.env[VARIABLE_URL_SITIO];
  await prisma.negocio.deleteMany({
    where: { whatsapp: { startsWith: "771999" } },
  });
  await prisma.$disconnect();
});

afterEach(() => {
  vi.useRealTimers();
  reiniciarMemoriaDeCatalogos();
});

// ───────────────────────────────────────────────────────────────────────────
// M1 · Ningún nivel de metadata deja resolver la imagen contra localhost
// ───────────────────────────────────────────────────────────────────────────

describe("iteración 2 · M1 · sin URL pública no se publica ninguna imagen local", () => {
  // Scenario (layout-base): producción sin URL pública declarada
  it("los DOS niveles raíz de metadata declaran sus imágenes, no las heredan", () => {
    // El layout, para todas las páginas del sitio…
    const sitio = metadataDelSitio({ NODE_ENV: "production" });
    expect(sitio.openGraph?.images).toEqual([]);
    expect(JSON.stringify(sitio)).not.toContain("localhost");

    // …y la 404, que es el nivel que se escapaba (su ruta interna no hereda
    // las `images` del layout y recibía la imagen de la convención de archivo
    // resuelta contra http://localhost:3000).
    expect(metadataDeLa404.openGraph).toBeDefined();
    expect(metadataDeLa404.openGraph).toHaveProperty("images");
  });

  it("con URL pública, la imagen de marca es absoluta; sin ella, no hay imagen", () => {
    expect(imagenesDeMarca({ [VARIABLE_URL_SITIO]: URL_SITIO })).toEqual([
      `${URL_SITIO}/opengraph-image`,
    ]);
    expect(imagenesDeMarca({ NODE_ENV: "production" })).toEqual([]);
    expect(imagenesDeMarca({ NODE_ENV: "development" })).toEqual([
      "http://localhost:3000/opengraph-image",
    ]);
  });

  it("la ficha sin foto tampoco inventa una imagen local en producción", async () => {
    delete process.env[VARIABLE_URL_SITIO];
    vi.stubEnv("NODE_ENV", "production");
    try {
      const metadata = await metadataFicha({
        params: Promise.resolve({
          ficha: construirSegmentoFicha(
            "Fonda Doña Cuquita (ficticia)",
            idPorWhatsapp["7719995004"],
          ),
        }),
        searchParams: Promise.resolve({}),
      });
      expect(metadata.openGraph?.images).toEqual([]);
      expect(JSON.stringify(metadata)).not.toContain("localhost");
    } finally {
      vi.unstubAllEnvs();
      process.env[VARIABLE_URL_SITIO] = URL_SITIO;
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// M2 · El número que el negocio escribió en "¿Qué ofreces?" no sale de la ficha
// ───────────────────────────────────────────────────────────────────────────

describe("iteración 2 · M2 · saneo de números de contacto", () => {
  it.each([
    ["Plomería 24 horas, llámanos al 771 000 0000.", "Plomería 24 horas, llámanos al …"],
    ["Escríbenos al 7710000000", "Escríbenos al …"],
    ["Tel +52 (771) 000-00-00 con gusto", "Tel … con gusto"],
    // Dos números pegados por una diagonal se ocultan de una sola vez.
    ["WhatsApp 771.000.0000 / 771 111 1111", "WhatsApp …"],
    ["Marca 7710000", "Marca …"], // 7 dígitos: el mínimo que se oculta
  ])("oculta el número de %o", (texto, esperado) => {
    expect(ocultarNumerosDeContacto(texto)).toBe(esperado);
  });

  it.each([
    "Fútbol infantil de 6 a 12 años, martes y jueves.",
    "Abierto L-S 9am-7pm, domingo 10am-2pm.",
    "Cortes desde $120, tinte desde $1,200.",
    "Servicio 24/7 para 3 o 4 personas.",
    "Pizzas de 30 cm y 45 cm.",
  ])("no toca el texto útil de %o", (texto) => {
    expect(ocultarNumerosDeContacto(texto)).toBe(texto);
    expect(ocultarNumerosDeContacto(texto)).not.toContain(MARCA_DE_NUMERO_OCULTO);
  });

  it("solo oculta 7 dígitos o más (6 se quedan)", () => {
    expect(ocultarNumerosDeContacto("El folio 123456 sigue vigente")).toBe(
      "El folio 123456 sigue vigente",
    );
    expect(ocultarNumerosDeContacto("El folio 1234567 sigue vigente")).toBe(
      "El folio … sigue vigente",
    );
  });

  it("la descripción de la ficha sale ya sin el número", () => {
    expect(
      descripcionFicha({
        nombre: "Plomería Del Número Ficticia",
        coloniaNombre: "Huicalco",
        queOfreces: OFRECE_CON_NUMERO,
      }),
    ).toBe("Plomería 24 horas, llámanos al … o al …");
  });

  // Las tres superficies que sacan el texto de la ficha: meta descripción,
  // og:description y el `description` del JSON-LD.
  it("ni la metadata ni el bloque de datos publican el número", async () => {
    const nombre = "Plomería Del Número Ficticia";
    const props = {
      params: Promise.resolve({
        ficha: construirSegmentoFicha(nombre, idPorWhatsapp[`${PREFIJO}001`]),
      }),
      searchParams: Promise.resolve({}),
    };

    const metadata = await metadataFicha(props);
    const serializada = JSON.stringify(metadata);
    for (const numero of ["771 000 0000", "7717770000", "7710000000"]) {
      expect(serializada, numero).not.toContain(numero);
    }
    expect(metadata.description).toContain(MARCA_DE_NUMERO_OCULTO);
    expect(metadata.openGraph?.description).toBe(metadata.description);

    const elemento = await FichaNegocioPage(props);
    const html = renderToStaticMarkup(createElement(() => elemento));
    const bloque = JSON.parse(
      html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1],
    ) as { description?: string };
    expect(bloque.description).toBe("Plomería 24 horas, llámanos al … o al …");
    for (const numero of ["771 000 0000", "7717770000", "7710000000"]) {
      expect(JSON.stringify(bloque), numero).not.toContain(numero);
    }

    // Y el texto SÍ se le sigue mostrando completo a las personas en la ficha,
    // que es donde el negocio quiso ponerlo.
    expect(html).toContain(OFRECE_CON_NUMERO);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// M4 · Los catálogos se leen una sola vez por petición
// ───────────────────────────────────────────────────────────────────────────

describe("iteración 2 · M4 · memoria de catálogos", () => {
  async function consultasDe(destino: string): Promise<string[]> {
    reiniciarMemoriaDeCatalogos();
    consultas.length = 0;
    await metadataDestino({
      params: Promise.resolve({ destino }),
      searchParams: Promise.resolve({}),
    });
    try {
      const elemento = await DestinoPage({
        params: Promise.resolve({ destino }),
        searchParams: Promise.resolve({}),
      });
      renderToStaticMarkup(createElement(() => elemento));
    } catch (error) {
      if (typeof (error as { digest?: unknown }).digest !== "string") throw error;
    }
    return [...consultas];
  }

  it("un slug bien formado inexistente cuesta 3 consultas (antes 6)", async () => {
    for (const slug of [
      "aaaa-bbbb",
      "plomeria-colonia-inventada",
      "a-b-c-d-e-f-g-h-i-j-k-l-m-n-o-p",
    ]) {
      const hechas = await consultasDe(slug);
      expect(hechas.length, slug).toBeLessThanOrEqual(3);
      // Y las tres son los catálogos, una sola vez cada uno.
      expect(hechas.sort(), slug).toEqual([
        "categoria.findMany",
        "colonia.findMany",
        "giro.findMany",
      ]);
    }
  });

  it("las páginas que sí existen leen los catálogos una vez, no dos", async () => {
    for (const destino of ["servicios-del-hogar", "plomeria", "plomeria-huicalco"]) {
      const hechas = await consultasDe(destino);
      // `categoria.findMany` y `giro.findMany` SOLO los pide el lector de
      // catálogos, así que una vez cada uno es exactamente "una lectura por
      // petición" (antes: dos, una en la metadata y otra en la página).
      // `colonia.findMany` no sirve de testigo: la navegación por colonia usa
      // el mismo modelo para otra cosa.
      const veces = (nombre: string) => hechas.filter((c) => c === nombre).length;
      expect(veces("categoria.findMany"), destino).toBe(1);
      expect(veces("giro.findMany"), destino).toBe(1);
      expect(hechas.length, destino).toBeLessThanOrEqual(6);
    }
  });

  it("dentro de la vigencia no vuelve a preguntarle a la base", async () => {
    reiniciarMemoriaDeCatalogos();
    consultas.length = 0;
    const primera = await obtenerCatalogosDeLaRaiz();
    expect(consultas.length).toBe(3);

    const segunda = await obtenerCatalogosDeLaRaiz();
    expect(consultas.length).toBe(3);
    expect(segunda).toBe(primera); // la misma lectura, no una copia
  });

  it("pasada la vigencia vuelve a leer, así que un catálogo nuevo aparece", async () => {
    reiniciarMemoriaDeCatalogos();
    consultas.length = 0;
    await obtenerCatalogosDeLaRaiz();
    expect(consultas.length).toBe(3);

    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + VIGENCIA_CATALOGOS_MS + 1));
    await obtenerCatalogosDeLaRaiz();
    expect(consultas.length).toBe(6);
  });

  it("los NEGOCIOS nunca se memorizan: publicar uno se ve en la siguiente petición", async () => {
    const antes = await consultasDe("dentista");
    expect(antes.some((c) => c.startsWith("negocio."))).toBe(true);

    const categoria = await prisma.categoria.findUniqueOrThrow({
      where: { slug: "salud" },
    });
    await prisma.negocio.create({
      data: {
        nombre: "Dentista Recién Publicada (ficticia)",
        categoriaId: categoria.id,
        whatsapp: `${PREFIJO}002`,
        estado: "publicado",
        origen: "siembra",
        publicadoEn: new Date("2026-08-30T10:00:00.000Z"),
        consintioAvisoEn: new Date("2026-07-31T10:00:00.000Z"),
        giros: { connect: [{ slug: "dentista" }] },
      },
    });

    const elemento = await DestinoPage({
      params: Promise.resolve({ destino: "dentista" }),
      searchParams: Promise.resolve({}),
    });
    const html = renderToStaticMarkup(createElement(() => elemento));
    expect(html).toContain("Dentista Recién Publicada (ficticia)");

    await prisma.negocio.delete({ where: { whatsapp: `${PREFIJO}002` } });
  });
});
