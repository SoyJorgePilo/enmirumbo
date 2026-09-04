import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { sembrarNegociosDemo } from "../prisma/seed-demo";
import { generateMetadata as metadataDestino } from "../src/app/(publico)/[destino]/page";
import { generateMetadata as metadataFicha } from "../src/app/(publico)/negocio/[ficha]/page";
import { metadata as metadataLayout } from "../src/app/layout";
import type { PrismaClient } from "../src/generated/prisma/client";
import { construirSegmentoFicha } from "../src/lib/ficha-url";
import {
  DESCRIPCION_DEL_SITIO,
  NOMBRE_DEL_SITIO,
  PLANTILLA_DE_TITULO,
  RUTA_IMAGEN_DE_MARCA,
  TITULO_DEL_SITIO,
  metadataDelSitio,
} from "../src/lib/seo/metadata";
import { URL_SITIO_LOCAL, VARIABLE_URL_SITIO } from "../src/lib/sitio";
import { crearClientePrueba } from "./db";
import { CLAVE_FOTO_SEO, sembrarNegociosSeo } from "./seo-fixtures";

// Spec: layout-base · requirement "Server Component con documento en es-MX y
// metadata base" (MODIFIED) y directorio-publico · requirements "Título y
// descripción propios en cada página del directorio, con su canónica", "La
// ficha se ve bien al compartirla por WhatsApp o Facebook" y "Las páginas de
// giro sin negocios publicados… declarar `noindex`" (tasks.md #13 a #16).

const URL_SITIO = "https://necesitouno.example";

let prisma: PrismaClient;
let idPorWhatsapp: Record<string, string> = {};

const props = (destino: string, colonia?: string) => ({
  params: Promise.resolve({ destino }),
  searchParams: Promise.resolve(colonia === undefined ? {} : { colonia }),
});

const propsFicha = (whatsapp: string, nombre: string) => ({
  params: Promise.resolve({
    ficha: construirSegmentoFicha(nombre, idPorWhatsapp[whatsapp]),
  }),
  searchParams: Promise.resolve({}),
});

beforeAll(async () => {
  process.env[VARIABLE_URL_SITIO] = URL_SITIO;
  prisma = crearClientePrueba();
  await prisma.negocio.deleteMany();
  await seedCatalogos(prisma);
  await sembrarNegociosDemo(prisma, { NODE_ENV: "test" });
  await sembrarNegociosSeo(prisma);
  const negocios = await prisma.negocio.findMany({
    select: { id: true, whatsapp: true },
  });
  idPorWhatsapp = Object.fromEntries(negocios.map((n) => [n.whatsapp, n.id]));
});

afterAll(async () => {
  delete process.env[VARIABLE_URL_SITIO];
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: "7719995" } } });
  await prisma.$disconnect();
});

describe("layout-base · metadata base del sitio (tasks #13)", () => {
  // Scenario: la home conserva el título del sitio + una página con título
  // propio lleva la marca al final
  it("declara el título del sitio como default y la plantilla con la marca", () => {
    expect(metadataLayout.title).toEqual({
      default: TITULO_DEL_SITIO,
      template: PLANTILLA_DE_TITULO,
    });
    expect(TITULO_DEL_SITIO).toBe(
      "NecesitoUno Tizayuca — Encuentra negocios y servicios en Tizayuca",
    );
    expect(PLANTILLA_DE_TITULO).toBe("%s — NecesitoUno");
    expect(metadataLayout.description).toBe(DESCRIPCION_DEL_SITIO);
  });

  // Scenario: URL base declarada
  it("con la URL pública declarada, la base de las URLs absolutas es ese origen", () => {
    const metadata = metadataDelSitio({ [VARIABLE_URL_SITIO]: URL_SITIO });
    expect(metadata.metadataBase?.toString()).toBe(`${URL_SITIO}/`);
    expect(metadata.openGraph).toMatchObject({
      siteName: NOMBRE_DEL_SITIO,
      locale: "es_MX",
      type: "website",
    });
    // Sin `images` propias: hereda la imagen de marca del sitio.
    expect(metadata.openGraph).not.toHaveProperty("images");
  });

  it("fuera de producción sin variable usa la dirección local de desarrollo", () => {
    const metadata = metadataDelSitio({ NODE_ENV: "development" });
    expect(metadata.metadataBase?.toString()).toBe(`${URL_SITIO_LOCAL}/`);
  });

  // Scenario: producción sin URL pública declarada
  it("en producción sin variable no publica ninguna URL absoluta a localhost", () => {
    const metadata = metadataDelSitio({ NODE_ENV: "production" });
    expect(metadata.metadataBase).toBeUndefined();
    // `images: []` no es un descuido: es lo que impide que Next resuelva la
    // imagen de marca contra `http://localhost:3000` (design.md §5).
    expect(metadata.openGraph?.images).toEqual([]);
    expect(JSON.stringify(metadata)).not.toContain("localhost");
  });
});

describe("directorio-publico · metadata del listado por categoría (tasks #14)", () => {
  // Scenario: cada página con su propio título
  it("título, descripción y canónica de dos categorías", async () => {
    const servicios = await metadataDestino(props("servicios-del-hogar"));
    expect(servicios.title).toBe("Servicios del hogar en Tizayuca");
    expect(servicios.description).toBe(
      "Servicios del hogar en Tizayuca: negocios de aquí, verificados uno por uno, que contactas directo por WhatsApp.",
    );
    expect(servicios.alternates?.canonical).toBe(`${URL_SITIO}/servicios-del-hogar`);

    const belleza = await metadataDestino(props("belleza"));
    expect(belleza.title).toBe("Belleza en Tizayuca");
    expect(belleza.title).not.toBe(servicios.title);
    expect(belleza.description).not.toBe(servicios.description);
  });

  // Scenario: el listado filtrado no compite con las páginas de giro
  it("con ?colonia= la canónica es el listado sin filtro", async () => {
    const filtrado = await metadataDestino(props("servicios-del-hogar", "huicalco"));
    expect(filtrado.alternates?.canonical).toBe(`${URL_SITIO}/servicios-del-hogar`);
    expect(String(filtrado.alternates?.canonical)).not.toContain("colonia=");
  });
});

describe("directorio-publico · metadata de las páginas de giro (tasks #15)", () => {
  it("la página de giro trae su frase curada, su descripción y su canónica", async () => {
    const futbol = await metadataDestino(props("futbol"));
    expect(futbol.title).toBe("Clases de futbol en Tizayuca");
    expect(futbol.description).toBe(
      "Clases de futbol en Tizayuca: negocios verificados que contactas directo por WhatsApp, sin intermediarios.",
    );
    expect(futbol.alternates?.canonical).toBe(`${URL_SITIO}/futbol`);
  });

  it("la página de giro y colonia canoniza a su propia URL", async () => {
    const metadata = await metadataDestino(props("plomeria-huicalco"));
    expect(metadata.title).toBe("Plomería en Huicalco, Tizayuca");
    expect(metadata.description).toBe(
      "Plomería en Huicalco: negocios verificados de Tizayuca que contactas directo por WhatsApp.",
    );
    expect(metadata.alternates?.canonical).toBe(`${URL_SITIO}/plomeria-huicalco`);
  });

  // Scenario: lo que sí tiene contenido sí se indexa
  it("con negocios publicados no declara noindex", async () => {
    for (const destino of ["plomeria", "plomeria-huicalco", "servicios-del-hogar"]) {
      const metadata = await metadataDestino(props(destino));
      expect(metadata.robots, destino).toBeUndefined();
    }
  });

  // Scenario: lo vacío no se indexa
  it("sin negocios publicados declara noindex y deja seguir los enlaces", async () => {
    for (const destino of ["box", "box-huicalco", "plomeria-nacozari"]) {
      const metadata = await metadataDestino(props(destino));
      expect(metadata.robots, destino).toEqual({ index: false, follow: true });
    }
  });

  it("un destino que no existe no inventa metadata", async () => {
    expect(await metadataDestino(props("plomeros-baratos"))).toEqual({});
  });
});

describe("directorio-publico · cada página del directorio con lo suyo (tasks #14 a #16)", () => {
  // Scenario: cada página con su propio título
  it("listado, giro, giro+colonia y ficha declaran títulos y descripciones distintos entre sí y del sitio", async () => {
    const paginas = await Promise.all([
      metadataDestino(props("servicios-del-hogar")),
      metadataDestino(props("plomeria")),
      metadataDestino(props("plomeria-huicalco")),
      metadataFicha(propsFicha("7719995001", "Plomería Hermanos Rosales (ficticio)")),
    ]);

    const titulos = paginas.map((m) => m.title as string);
    const descripciones = paginas.map((m) => m.description as string);

    expect(new Set(titulos).size).toBe(4);
    expect(new Set(descripciones).size).toBe(4);
    for (const [i, titulo] of titulos.entries()) {
      expect(titulo, `título ${i}`).toBeTruthy();
      expect(titulo, `título ${i}`).not.toBe(TITULO_DEL_SITIO);
      expect(descripciones[i], `descripción ${i}`).toBeTruthy();
      expect(descripciones[i], `descripción ${i}`).not.toBe(DESCRIPCION_DEL_SITIO);
    }
    // Y ninguna se queda sin canónica absoluta
    for (const pagina of paginas) {
      expect(String(pagina.alternates?.canonical).startsWith(URL_SITIO)).toBe(true);
    }
  });
});

describe("directorio-publico · metadata de la ficha (tasks #16)", () => {
  // Scenario: descripción de la ficha con lo que escribió el negocio
  it("usa el '¿Qué ofreces?' del negocio y nunca su WhatsApp ni su teléfono", async () => {
    const metadata = await metadataFicha(
      propsFicha("7719995001", "Plomería Hermanos Rosales (ficticio)"),
    );
    expect(metadata.title).toBe(
      "Plomería Hermanos Rosales (ficticio) en Huicalco, Tizayuca",
    );
    expect(metadata.description).toBe(
      "Plomería, destape de drenajes y bombas de agua.",
    );
    const serializada = JSON.stringify(metadata);
    expect(serializada).not.toContain("7719995001");
    expect(serializada).not.toContain("7717775001");
  });

  // Scenario: ficha sin "¿Qué ofreces?"
  it("sin '¿Qué ofreces?' usa la frase de respaldo", async () => {
    const metadata = await metadataFicha(
      propsFicha("7719995004", "Fonda Doña Cuquita (ficticia)"),
    );
    expect(metadata.description).toBe(
      "Fonda Doña Cuquita (ficticia) en Tizayuca Centro. Negocio verificado que contactas directo por WhatsApp.",
    );
  });

  // Scenario: canónicas absolutas + la imagen se declara con URL absoluta
  it("canónica y Open Graph absolutos, con el nombre del sitio y es_MX", async () => {
    const segmento = construirSegmentoFicha(
      "Fonda Doña Cuquita (ficticia)",
      idPorWhatsapp["7719995004"],
    );
    const metadata = await metadataFicha(
      propsFicha("7719995004", "Fonda Doña Cuquita (ficticia)"),
    );
    expect(metadata.alternates?.canonical).toBe(`${URL_SITIO}/negocio/${segmento}`);
    expect(metadata.openGraph).toMatchObject({
      url: `${URL_SITIO}/negocio/${segmento}`,
      siteName: NOMBRE_DEL_SITIO,
      locale: "es_MX",
      type: "article",
    });
  });

  // Scenario: ficha sin foto
  it("sin foto hereda la imagen de marca del sitio, nunca se queda sin imagen", async () => {
    const metadata = await metadataFicha(
      propsFicha("7719995004", "Fonda Doña Cuquita (ficticia)"),
    );
    expect(metadata.openGraph?.images).toEqual([
      `${URL_SITIO}${RUTA_IMAGEN_DE_MARCA}`,
    ]);
  });

  // Scenario: ficha con foto
  it("con foto usa la foto del negocio, en absoluto", async () => {
    const metadata = await metadataFicha(
      propsFicha("7719995023", "Panadería La Foto Ficticia"),
    );
    // La URL de la foto la arma el servidor con la clave interna (T-008): a
    // `og:image` no puede llegar una dirección guardada en la base.
    expect(metadata.openGraph?.images).toEqual([
      `${URL_SITIO}/api/foto/${CLAVE_FOTO_SEO}/ficha`,
    ]);
  });

  it("una ficha que no existe o no está publicada no inventa metadata", async () => {
    expect(
      await metadataFicha({
        params: Promise.resolve({ ficha: "negocio-inventado-noexiste123" }),
        searchParams: Promise.resolve({}),
      }),
    ).toEqual({});
    expect(
      await metadataFicha(
        propsFicha("7719995011", "Barbería El Buen Corte Imaginario"),
      ),
    ).toEqual({});
  });
});
