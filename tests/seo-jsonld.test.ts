import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { sembrarNegociosDemo } from "../prisma/seed-demo";
import DestinoPage from "../src/app/(publico)/[destino]/page";
import FichaNegocioPage from "../src/app/(publico)/negocio/[ficha]/page";
import type { PrismaClient } from "../src/generated/prisma/client";
import { datosDeBusqueda } from "../src/lib/busqueda";
import { construirSegmentoFicha } from "../src/lib/ficha-url";
import { VARIABLE_URL_SITIO } from "../src/lib/sitio";
import { crearClientePrueba } from "./db";
import { CLAVE_FOTO_SEO, sembrarNegociosSeo } from "./seo-fixtures";

// Spec: directorio-publico · requirement "Cada ficha publicada emite
// Schema.org LocalBusiness" (tasks.md #18, design.md §6).

const URL_SITIO = "https://necesitouno.example";
/** Nombre adversarial: el marcado tiene que quedar como texto, no ejecutarse. */
const NOMBRE_HOSTIL = "Tacos </script><script>alert(1)</script>";

let prisma: PrismaClient;
let idPorWhatsapp: Record<string, string> = {};

async function renderFicha(whatsapp: string, nombre: string): Promise<string> {
  const elemento = await FichaNegocioPage({
    params: Promise.resolve({
      ficha: construirSegmentoFicha(nombre, idPorWhatsapp[whatsapp]),
    }),
    searchParams: Promise.resolve({}),
  });
  return renderToStaticMarkup(createElement(() => elemento));
}

/** Bloques `application/ld+json` del HTML, ya interpretados. */
function bloquesJsonLd(html: string): unknown[] {
  return [
    ...html.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    ),
  ].map((m) => JSON.parse(m[1]));
}

beforeAll(async () => {
  process.env[VARIABLE_URL_SITIO] = URL_SITIO;
  prisma = crearClientePrueba();
  await prisma.negocio.deleteMany();
  await seedCatalogos(prisma);
  await sembrarNegociosDemo(prisma, { NODE_ENV: "test" });
  await sembrarNegociosSeo(prisma);

  // Negocio adversarial (ficticio): nombre y "¿Qué ofreces?" con marcado.
  const categoria = await prisma.categoria.findUniqueOrThrow({
    where: { slug: "restaurantes-y-fondas" },
  });
  await prisma.negocio.upsert({
    where: { whatsapp: "7719995030" },
    update: {},
    create: {
      nombre: NOMBRE_HOSTIL,
      categoriaId: categoria.id,
      coloniaOtra: "Colonia inventada sin normalizar",
      whatsapp: "7719995030",
      queOfreces: '</script><img src=x onerror="alert(2)">',
      ...datosDeBusqueda(NOMBRE_HOSTIL, '</script><img src=x onerror="alert(2)">'),
      estado: "publicado",
      origen: "siembra",
      publicadoEn: new Date("2026-08-13T10:00:00.000Z"),
      consintioAvisoEn: new Date("2026-07-31T10:00:00.000Z"),
      registradoEn: new Date("2026-07-31T10:00:00.000Z"),
      giros: { connect: [{ slug: "tacos" }] },
    },
  });

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

describe("directorio-publico · JSON-LD de la ficha publicada (tasks #18)", () => {
  // Scenario: ficha publicada con datos estructurados
  it("emite un LocalBusiness con nombre, URL, colonia, ciudad, categoría y giro", async () => {
    const html = await renderFicha(
      "7719995001",
      "Plomería Hermanos Rosales (ficticio)",
    );
    const bloques = bloquesJsonLd(html);
    expect(bloques).toHaveLength(1);

    const segmento = construirSegmentoFicha(
      "Plomería Hermanos Rosales (ficticio)",
      idPorWhatsapp["7719995001"],
    );
    expect(bloques[0]).toEqual({
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: "Plomería Hermanos Rosales (ficticio)",
      url: `${URL_SITIO}/negocio/${segmento}`,
      description: "Plomería, destape de drenajes y bombas de agua.",
      address: {
        "@type": "PostalAddress",
        streetAddress: "Col. Huicalco",
        addressLocality: "Tizayuca",
        addressRegion: "Hidalgo",
        addressCountry: "MX",
      },
      knowsAbout: ["Servicios del hogar", "Plomería"],
    });
  });

  // Scenario: nunca el domicilio exacto ni el número
  it("no publica dirección, referencias, teléfono, WhatsApp ni horario", async () => {
    const html = await renderFicha("7719995023", "Panadería La Foto Ficticia");
    const [bloque] = bloquesJsonLd(html) as Array<Record<string, unknown>>;
    const serializado = JSON.stringify(bloque);

    // Lo que la ficha SÍ le muestra a las personas
    expect(html).toContain("Calle Inventada 99, junto a la nada");
    expect(html).toContain("L-D 7am-9pm");
    // …y que el bloque de datos NO publica
    expect(serializado).not.toContain("Calle Inventada 99");
    expect(serializado).not.toContain("7717775023");
    expect(serializado).not.toContain("7719995023");
    expect(serializado).not.toContain("L-D 7am-9pm");
    for (const campo of [
      "telephone",
      "openingHours",
      "openingHoursSpecification",
      "geo",
      "latitude",
      "longitude",
    ]) {
      expect(bloque, campo).not.toHaveProperty(campo);
    }
    // La foto sí, cuando existe: y su dirección la construye el servidor a
    // partir de la clave interna (T-008), nunca se lee de la base. Es lo que
    // cierra el hallazgo M3 de este change: al JSON-LD solo puede llegar una
    // URL de este sitio.
    expect(bloque.image).toEqual([
      `${URL_SITIO}/api/foto/${CLAVE_FOTO_SEO}/ficha`,
    ]);
  });

  it("un negocio sin foto no declara imagen inventada", async () => {
    const html = await renderFicha("7719995004", "Fonda Doña Cuquita (ficticia)");
    const [bloque] = bloquesJsonLd(html) as Array<Record<string, unknown>>;
    expect(bloque).not.toHaveProperty("image");
    expect(bloque).not.toHaveProperty("description"); // no llenó "¿Qué ofreces?"
    expect(bloque.knowsAbout).toEqual([
      "Restaurantes y fondas",
      "Fonda / comida corrida",
    ]);
  });

  // Scenario: negocio sin colonia del catálogo
  it("un negocio con colonia 'Otra' se emite igual, sin inventar colonia", async () => {
    const html = await renderFicha(
      "7719995008",
      "Abarrotes La Esperanza Inventada",
    );
    const [bloque] = bloquesJsonLd(html) as Array<Record<string, unknown>>;
    expect(bloque.address).toEqual({
      "@type": "PostalAddress",
      addressLocality: "Tizayuca",
      addressRegion: "Hidalgo",
      addressCountry: "MX",
    });
    expect(JSON.stringify(bloque)).not.toContain("Los Sauces Imaginarios");
  });

  // Scenario: nombre con marcado dentro
  it("un nombre con </script> queda como texto y no cierra el bloque", async () => {
    const html = await renderFicha("7719995030", NOMBRE_HOSTIL);
    const bloques = bloquesJsonLd(html) as Array<Record<string, unknown>>;
    expect(bloques).toHaveLength(1);
    expect(bloques[0].name).toBe(NOMBRE_HOSTIL);
    // Ni un solo `<` crudo dentro del bloque: van escapados como <
    const crudo = html.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
    )?.[1];
    expect(crudo).toBeDefined();
    expect(crudo).not.toContain("<");
    expect(crudo).toContain("\\u003c");
    // El "¿Qué ofreces?" hostil viaja como dato, no como marcado
    expect(bloques[0].description).toBe('</script><img src=x onerror="alert(2)">');
    // Y el HTML no gana un <script> ejecutable ni una etiqueta de regalo: el
    // único <script> de la página es el bloque de datos, y lo que el negocio
    // escribió sale escapado por React en el cuerpo.
    expect(html.match(/<script/g)).toHaveLength(1);
    expect(html).toContain('<script type="application/ld+json">');
    expect(html).not.toContain("<img");
    expect(html).not.toContain('onerror="alert(2)"');
  });

  // Scenario: solo en las fichas publicadas
  it("los listados y las páginas de giro no emiten datos estructurados", async () => {
    for (const destino of ["servicios-del-hogar", "plomeria", "plomeria-huicalco"]) {
      const elemento = await DestinoPage({
        params: Promise.resolve({ destino }),
        searchParams: Promise.resolve({}),
      });
      const html = renderToStaticMarkup(createElement(() => elemento));
      expect(bloquesJsonLd(html), destino).toEqual([]);
    }
  });

  it("una ficha en revisión no llega a emitir nada (responde 404)", async () => {
    await expect(
      renderFicha("7719995011", "Barbería El Buen Corte Imaginario"),
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });
});
