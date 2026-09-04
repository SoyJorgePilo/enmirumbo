import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import ListadoCategoriaPage from "../src/app/(publico)/[categoria]/page";
import AvisoDePrivacidadPage from "../src/app/(publico)/aviso-de-privacidad/page";
import BuscarPage from "../src/app/(publico)/buscar/page";
import FichaNegocioPage from "../src/app/(publico)/negocio/[ficha]/page";
import Home from "../src/app/(publico)/page";
import RegistroPage from "../src/app/(publico)/registro/page";
import RegistroGraciasPage from "../src/app/(publico)/registro/gracias/page";
import TerminosPage from "../src/app/(publico)/terminos/page";
import type { PrismaClient } from "../src/generated/prisma/client";
import { VARIABLE_SRC, VARIABLE_WEBSITE_ID } from "../src/lib/analitica/config";
import { datosDeBusqueda } from "../src/lib/busqueda";
import { construirSegmentoFicha } from "../src/lib/ficha-url";
import { crearClientePrueba } from "./db";

/**
 * Etapa adversarial de privacidad del change `agregar-analitica-cookieless`
 * (tasks.md #17 y #18).
 *
 * Spec: layout-base · requirements "La medición no lleva datos personales ni
 * el texto que escribe la gente" y "Un solo script diferido y cero JavaScript
 * propio de cliente".
 *
 * La pregunta no es "¿funciona la medición?" sino "¿puede escaparse un dato
 * del negocio dentro de un atributo de medición?". Por eso el negocio de
 * prueba llena TODOS los campos con texto reconocible —incluida una colonia
 * "Otra" con referencias de domicilio— y la suite revisa el HTML servido.
 *
 * Datos 100% ficticios (repo público + LFPDPPP): la serie `7719999xxx` es
 * exclusiva de este archivo y se borra al terminar.
 */

const PREFIJO = "7719999";

const NEGOCIO = {
  nombre: "Cerrajería Adversarial Analítica (ficticia)",
  whatsapp: `${PREFIJO}101`,
  telefonoFijo: "7717779101",
  direccion: "Atrás del panteón viejo, casa sin número",
  horario: "Lunes a domingo de 8 a 9",
  queOfreces: "Aperturas y copias de llave inventadas para la auditoría.",
  coloniaOtra: "Fraccionamiento Los Sauces Imaginarios, junto a la tienda",
  facebookUrl: "https://ejemplo.invalid/cerrajeria-ficticia",
};

let prisma: PrismaClient;
let id = "";
let htmlListado = "";
let htmlBuscar = "";
let htmlFicha = "";
let htmlHome = "";
let htmlRegistro = "";
let htmlGracias = "";
let htmlAviso = "";
let htmlTerminos = "";

/** Todo lo que un atributo de medición NO puede contener. */
function valoresProhibidos(): string[] {
  return [
    NEGOCIO.nombre,
    NEGOCIO.whatsapp,
    NEGOCIO.telefonoFijo,
    NEGOCIO.direccion,
    NEGOCIO.horario,
    NEGOCIO.queOfreces,
    NEGOCIO.coloniaOtra,
    NEGOCIO.facebookUrl,
    id,
    // Y también sus trozos, no solo la cadena completa.
    "panteón",
    "Sauces",
    "Cerrajería",
    "llave",
  ];
}

/** Cada atributo `data-umami-event*` del HTML, como pares nombre/valor. */
function atributosDeMedicion(html: string): Array<[string, string]> {
  return [...html.matchAll(/(data-umami-event(?:-[a-z-]+)?)="([^"]*)"/g)].map((m) => [
    m[1],
    m[2],
  ]);
}

async function render(pagina: unknown): Promise<string> {
  const resuelta = (await pagina) as React.ReactElement;
  return renderToStaticMarkup(createElement(() => resuelta));
}

beforeAll(async () => {
  // SIN medición configurada: así se comprueba a la vez que los atributos son
  // marcado inerte y que sin variables no sale ninguna petición externa.
  delete process.env[VARIABLE_SRC];
  delete process.env[VARIABLE_WEBSITE_ID];

  prisma = crearClientePrueba();
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
  await seedCatalogos(prisma);
  const categoria = await prisma.categoria.findUniqueOrThrow({
    where: { slug: "servicios-del-hogar" },
  });

  const creado = await prisma.negocio.create({
    data: {
      nombre: NEGOCIO.nombre,
      whatsapp: NEGOCIO.whatsapp,
      categoriaId: categoria.id,
      // Colonia "Otra" sin normalizar: el peor caso para la propiedad.
      coloniaId: null,
      coloniaOtra: NEGOCIO.coloniaOtra,
      queOfreces: NEGOCIO.queOfreces,
      telefonoFijo: NEGOCIO.telefonoFijo,
      direccion: NEGOCIO.direccion,
      horario: NEGOCIO.horario,
      facebookUrl: NEGOCIO.facebookUrl,
      entregaADomicilio: true,
      estado: "publicado",
      origen: "siembra",
      publicadoEn: new Date("2026-08-20T10:00:00.000Z"),
      consintioAvisoEn: new Date("2026-08-19T10:00:00.000Z"),
      ...datosDeBusqueda(NEGOCIO.nombre, NEGOCIO.queOfreces),
    },
    select: { id: true },
  });
  id = creado.id;

  htmlListado = await render(
    ListadoCategoriaPage({
      params: Promise.resolve({ categoria: "servicios-del-hogar" }),
      searchParams: Promise.resolve({}),
    }),
  );
  htmlBuscar = await render(
    BuscarPage({
      searchParams: Promise.resolve({ q: "cerrajeria adversarial" }),
    } as unknown as Parameters<typeof BuscarPage>[0]),
  );
  htmlFicha = await render(
    FichaNegocioPage({
      params: Promise.resolve({ ficha: construirSegmentoFicha(NEGOCIO.nombre, id) }),
      searchParams: Promise.resolve({}),
    }),
  );
  htmlHome = await render(Home());
  htmlRegistro = await render(RegistroPage());
  htmlGracias = renderToStaticMarkup(createElement(RegistroGraciasPage));
  htmlAviso = renderToStaticMarkup(createElement(AvisoDePrivacidadPage));
  htmlTerminos = renderToStaticMarkup(createElement(TerminosPage));
});

afterAll(async () => {
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
  await prisma.$disconnect();
});

const paginasConEventos = () =>
  [
    ["listado", htmlListado],
    ["resultados", htmlBuscar],
    ["ficha", htmlFicha],
  ] as const;

const todasLasPublicas = () =>
  [
    ["home", htmlHome],
    ["listado", htmlListado],
    ["resultados", htmlBuscar],
    ["ficha", htmlFicha],
    ["registro", htmlRegistro],
    ["gracias", htmlGracias],
    ["aviso de privacidad", htmlAviso],
    ["términos", htmlTerminos],
  ] as const;

describe("analitica · ningún dato del negocio dentro de un atributo (tasks #17)", () => {
  it("las páginas de prueba de verdad traen eventos que revisar", () => {
    for (const [nombre, html] of paginasConEventos()) {
      expect(atributosDeMedicion(html).length, nombre).toBeGreaterThan(0);
    }
    // Y el HTML sí trae los datos del negocio (si no, la prueba sería vacía).
    expect(htmlFicha).toContain(NEGOCIO.direccion);
    expect(htmlFicha).toContain(NEGOCIO.horario);
  });

  // Scenario: ningún dato del negocio dentro de un atributo de medición
  it.each(["listado", "resultados", "ficha"])(
    "en %s ningún atributo de medición trae datos del negocio",
    (pagina) => {
      const html = Object.fromEntries(paginasConEventos())[pagina];
      for (const [nombre, valor] of atributosDeMedicion(html)) {
        for (const prohibido of valoresProhibidos()) {
          expect(
            valor.toLowerCase(),
            `${nombre} filtró "${prohibido}"`,
          ).not.toContain(prohibido.toLowerCase());
        }
      }
    },
  );

  // Scenario: propiedades de un evento
  it("las únicas propiedades que existen son categoria y colonia", () => {
    for (const [pagina, html] of paginasConEventos()) {
      const nombres = new Set(atributosDeMedicion(html).map(([nombre]) => nombre));
      expect([...nombres].sort(), pagina).toEqual([
        "data-umami-event",
        "data-umami-event-categoria",
        "data-umami-event-colonia",
      ]);
    }
  });

  it("ningún valor de propiedad tiene espacios, acentos ni signos", () => {
    for (const [pagina, html] of paginasConEventos()) {
      for (const [nombre, valor] of atributosDeMedicion(html)) {
        expect(valor, `${pagina} · ${nombre}`).toMatch(/^[a-z0-9-]+$/);
      }
    }
  });

  // Scenario: negocio con colonia "Otra" sin normalizar
  it("la colonia de texto libre viaja como 'otra' y su texto no sale", () => {
    const colonias = atributosDeMedicion(htmlFicha)
      .filter(([nombre]) => nombre === "data-umami-event-colonia")
      .map(([, valor]) => valor);
    expect(colonias.length).toBeGreaterThan(0);
    expect(new Set(colonias)).toEqual(new Set(["otra"]));
    // El texto libre sí se ve en la ficha (es su colonia), pero no como dato
    // de medición.
    expect(htmlFicha).toContain(NEGOCIO.coloniaOtra);
  });
});

describe("analitica · sin configuración no sale nada del sitio (tasks #18)", () => {
  // Scenario: sin variables configuradas no se carga nada
  it.each(todasLasPublicas().map(([nombre]) => nombre))(
    "la página %s no trae script externo ni el dominio del proveedor",
    (pagina) => {
      const html = Object.fromEntries(todasLasPublicas())[pagina];
      expect([...html.matchAll(/<script\b[^>]*\bsrc=/g)], pagina).toHaveLength(0);
      expect(html, pagina).not.toContain("cloud.umami.is");
      expect(html, pagina).not.toContain("data-website-id");
      expect(html, pagina).not.toContain("data-exclude-search");
      // La única mención al proveedor son los atributos de evento, que son
      // marcado inerte: nada que apunte a un dominio suyo.
      expect(html.replace(/data-umami-event[a-z-]*="[^"]*"/g, ""), pagina).not.toContain(
        "umami",
      );
    },
  );

  // Scenario: los atributos no ejecutan nada por sí solos
  it("los botones conservan href, pestaña nueva y rel aunque no haya medición", () => {
    const boton = [...htmlFicha.matchAll(/<a\s[^>]*>/g)]
      .map((m) => m[0])
      .find((a) => a.includes("wa.me"))!;
    expect(boton).toContain('href="https://wa.me/52');
    expect(boton).toContain('target="_blank"');
    expect(boton).toContain('rel="noopener noreferrer"');
    expect(boton).toContain('data-umami-event="whatsapp-ficha"');
  });

  it("ninguna página pública muestra banner ni interruptor de cookies", () => {
    for (const [pagina, html] of todasLasPublicas()) {
      // El aviso de privacidad SÍ habla de cookies como documento legal; lo
      // que no puede existir es un banner o un interruptor de consentimiento.
      expect(html.toLowerCase(), pagina).not.toContain("aceptar cookies");
      expect(html.toLowerCase(), pagina).not.toContain("consentimiento de cookies");
      expect(html.toLowerCase(), pagina).not.toContain("banner");
    }
  });
});

describe("analitica · el servidor no lleva contadores (tasks #17)", () => {
  // Scenario: el servidor no lleva contadores / un crawler que no ejecuta JS
  it("ver una ficha no escribe nada en la base", async () => {
    const antes = await prisma.negocio.findUniqueOrThrow({
      where: { id },
      select: { publicadoEn: true, registradoEn: true },
    });
    await render(
      FichaNegocioPage({
        params: Promise.resolve({ ficha: construirSegmentoFicha(NEGOCIO.nombre, id) }),
        searchParams: Promise.resolve({}),
      }),
    );
    const despues = await prisma.negocio.findUniqueOrThrow({
      where: { id },
      select: { publicadoEn: true, registradoEn: true },
    });
    expect(despues).toEqual(antes);
  });
});
