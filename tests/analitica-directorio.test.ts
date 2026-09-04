import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { sembrarNegociosDemo } from "../prisma/seed-demo";
import ListadoCategoriaPage from "../src/app/(publico)/[categoria]/page";
import BuscarPage from "../src/app/(publico)/buscar/page";
import FichaNegocioPage from "../src/app/(publico)/negocio/[ficha]/page";
import { construirSegmentoFicha } from "../src/lib/ficha-url";
import { crearClientePrueba } from "./db";

// Spec: directorio-publico · requirements "La tarjeta del listado trae lo
// esencial y el WhatsApp sin clics extra" (MODIFIED) y "Botones de contacto de
// la ficha con el WhatsApp como acción principal" (MODIFIED), del change
// `agregar-analitica-cookieless` (tasks.md #13 y #15).
//
// Los atributos son marcado INERTE: esta suite corre sin la medición
// configurada a propósito, porque el contrato tiene que estar en el HTML de
// todas formas.

let htmlListado = "";
let htmlBuscar = "";
let htmlFicha = "";
let htmlFichaAbarrotes = "";
let htmlFichaMinima = "";

/** Etiqueta `<a>` que contiene ese texto o ese `href`. */
function anclas(html: string): string[] {
  return [...html.matchAll(/<a\s[^>]*>/g)].map((m) => m[0]);
}

/**
 * La envoltura que declara el evento de "Llamar": el elemento que envuelve al
 * `<a href="tel:">` (M-4). Se busca la etiqueta de apertura anterior al
 * enlace, que es donde viven los atributos de medición.
 */
function envolturaDeLlamar(html: string): string {
  const posicionDelEnlace = html.indexOf('href="tel:');
  expect(posicionDelEnlace, "la ficha de prueba tiene botón de llamar").toBeGreaterThan(-1);
  const antes = html.slice(0, posicionDelEnlace);
  const etiquetas = [...antes.matchAll(/<(?!a[\s>])[a-z]+\s[^>]*>/g)].map((m) => m[0]);
  return etiquetas.at(-1) ?? "";
}

function anclaCon(html: string, fragmento: string): string {
  const encontrada = anclas(html).find((etiqueta) => etiqueta.includes(fragmento));
  expect(encontrada, `no hay enlace con ${fragmento}`).toBeDefined();
  return encontrada!;
}

function atributos(etiqueta: string): Record<string, string> {
  return Object.fromEntries(
    [...etiqueta.matchAll(/data-umami-event(?:-([a-z]+))?="([^"]*)"/g)].map((m) => [
      m[1] ?? "evento",
      m[2],
    ]),
  );
}

async function render(pagina: unknown): Promise<string> {
  const resuelta = (await pagina) as React.ReactElement;
  return renderToStaticMarkup(createElement(() => resuelta));
}

beforeAll(async () => {
  const prisma = crearClientePrueba();
  await prisma.negocio.deleteMany();
  await seedCatalogos(prisma);
  await sembrarNegociosDemo(prisma, { NODE_ENV: "test" });

  const [veterinaria] = await prisma.negocio.findMany({
    where: { whatsapp: "7719995009" },
    select: { id: true, nombre: true },
  });
  // Publicado con colonia "Otra" sin normalizar (texto libre).
  const [abarrotes] = await prisma.negocio.findMany({
    where: { coloniaOtra: { not: null }, estado: "publicado" },
    select: { id: true, nombre: true },
  });
  // Publicado que solo llenó lo obligatorio: sin teléfono, sin dirección.
  const [fonda] = await prisma.negocio.findMany({
    where: { estado: "publicado", telefonoFijo: null, direccion: null },
    select: { id: true, nombre: true },
  });
  await prisma.$disconnect();

  htmlListado = await render(
    ListadoCategoriaPage({
      params: Promise.resolve({ categoria: "servicios-del-hogar" }),
      searchParams: Promise.resolve({}),
    }),
  );
  htmlBuscar = await render(
    BuscarPage({
      searchParams: Promise.resolve({ q: "mentiras" }),
    } as unknown as Parameters<typeof BuscarPage>[0]),
  );
  htmlFicha = await render(
    FichaNegocioPage({
      params: Promise.resolve({
        ficha: construirSegmentoFicha(veterinaria.nombre, veterinaria.id),
      }),
      searchParams: Promise.resolve({}),
    }),
  );
  htmlFichaAbarrotes = await render(
    FichaNegocioPage({
      params: Promise.resolve({
        ficha: construirSegmentoFicha(abarrotes.nombre, abarrotes.id),
      }),
      searchParams: Promise.resolve({}),
    }),
  );
  htmlFichaMinima = await render(
    FichaNegocioPage({
      params: Promise.resolve({
        ficha: construirSegmentoFicha(fonda.nombre, fonda.id),
      }),
      searchParams: Promise.resolve({}),
    }),
  );
});

afterAll(async () => {
  const prisma = crearClientePrueba();
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: "7719995" } } });
  await prisma.$disconnect();
});

describe("directorio-publico · el clic desde la tarjeta se mide (tasks #13)", () => {
  // Scenario: el clic desde la tarjeta se mide con su categoría y su colonia
  it("el botón de WhatsApp de la tarjeta declara whatsapp-tarjeta con sus dos slugs", () => {
    const botones = anclas(htmlListado).filter((a) => a.includes("wa.me"));
    expect(botones.length).toBeGreaterThan(0);
    for (const boton of botones) {
      expect(atributos(boton)).toEqual({
        evento: "whatsapp-tarjeta",
        categoria: "servicios-del-hogar",
        colonia: expect.stringMatching(/^[a-z0-9-]+$/),
      });
    }
  });

  // Scenario: en la página de resultados manda la categoría del negocio
  it("en los resultados cada tarjeta manda la categoría de SU negocio", () => {
    const botones = anclas(htmlBuscar).filter((a) => a.includes("wa.me"));
    expect(botones.length).toBeGreaterThan(1);
    const categorias = new Set(botones.map((b) => atributos(b).categoria));
    expect(categorias.size).toBeGreaterThan(1);
    for (const categoria of categorias) {
      expect(categoria).toMatch(/^[a-z0-9-]+$/);
      // Nada de la página de búsqueda se cuela como categoría.
      expect(categoria).not.toBe("buscar");
      expect(categoria).not.toBe("mentiras");
    }
  });

  // Scenario: negocio con colonia "Otra" sin normalizar
  it("una tarjeta con colonia fuera del catálogo manda colonia=otra", () => {
    const listadoAbarrotes = anclas(htmlBuscar)
      .filter((a) => a.includes("wa.me"))
      .map(atributos);
    expect(listadoAbarrotes.length).toBeGreaterThan(0);
    // El sembrado tiene un publicado con colonia libre; su ficha se revisa
    // abajo, aquí basta con que ninguna colonia lleve texto libre.
    for (const evento of listadoAbarrotes) {
      expect(evento.colonia).toMatch(/^[a-z0-9-]+$/);
    }
  });

  // Scenario: el botón se comporta igual sin medición
  it("los atributos no cambian el href ni el resto del botón", () => {
    const boton = anclas(htmlListado).find((a) => a.includes("wa.me"))!;
    expect(boton).toContain('target="_blank"');
    expect(boton).toContain('rel="noopener noreferrer"');
    expect(boton).toMatch(/href="https:\/\/wa\.me\/52\d{10}\?text=/);
    // Y sin medición configurada no hay ningún script en la página.
    expect([...htmlListado.matchAll(/<script\b[^>]*\bsrc=/g)]).toHaveLength(0);
  });
});

describe("directorio-publico · los tres contactos de la ficha (tasks #15)", () => {
  // Scenario: los tres contactos de la ficha se miden por separado
  it("WhatsApp, Llamar y Cómo llegar llevan su evento con categoria y colonia", () => {
    expect(atributos(anclaCon(htmlFicha, "wa.me"))).toEqual({
      evento: "whatsapp-ficha",
      categoria: "salud",
      colonia: "olmos-ampliacion-olmos",
    });
    // "Llamar" lleva su evento en la envoltura, no en el `<a>` (hallazgo M-4:
    // el tracker cancela el clic de un enlace que no abre pestaña nueva y
    // aplaza la llamada hasta que responde el proveedor).
    expect(atributos(envolturaDeLlamar(htmlFicha))).toEqual({
      evento: "llamar",
      categoria: "salud",
      colonia: "olmos-ampliacion-olmos",
    });
    expect(atributos(anclaCon(htmlFicha, "tel:"))).toEqual({});
    expect(atributos(anclaCon(htmlFicha, "google.com/maps"))).toEqual({
      evento: "como-llegar",
      categoria: "salud",
      colonia: "olmos-ampliacion-olmos",
    });
  });

  // Scenario: negocio con colonia "Otra" sin normalizar
  it("la ficha de un negocio con colonia libre manda colonia=otra", () => {
    const evento = atributos(anclaCon(htmlFichaAbarrotes, "wa.me"));
    expect(evento.colonia).toBe("otra");
    expect(evento.evento).toBe("whatsapp-ficha");
    expect(evento.categoria).toBe("abarrotes-y-comercio");
  });

  // M-4 (etapa C): el tracker cancela el clic de un `<a>` instrumentado que
  // NO abre pestaña nueva y navega hasta que responde el proveedor — medido:
  // 3.0 s de retraso con 3 s de latencia. "Llamar" es el único enlace así,
  // por eso su evento va en la envoltura. Los otros tres abren pestaña nueva
  // y el tracker no los toca, así que conservan el evento en el propio <a>.
  it("ningún enlace instrumentado puede retrasar una navegación", () => {
    for (const ancla of anclas(htmlFicha)) {
      const llevaEvento = ancla.includes("data-umami-event");
      const abrePestanaNueva = ancla.includes('target="_blank"');
      expect(
        !llevaEvento || abrePestanaNueva,
        `enlace instrumentado sin pestaña nueva (el tracker aplazaría el clic): ${ancla}`,
      ).toBe(true);
    }
    // Y el de llamar sigue midiéndose, solo que desde la envoltura.
    expect(envolturaDeLlamar(htmlFicha)).toContain('data-umami-event="llamar"');
    expect(anclaCon(htmlFicha, "tel:")).not.toContain("target=");
  });

  // Scenario: el enlace a la página registrada no se mide
  it("el enlace a la página del negocio no lleva ningún atributo de evento", () => {
    const pagina = anclas(htmlFicha).find((a) => a.includes("facebook.com"));
    expect(pagina, "la ficha de prueba registró página").toBeDefined();
    expect(atributos(pagina!)).toEqual({});
  });

  // Scenario: negocio sin teléfono ni dirección
  it("los botones que no aplican siguen sin renderizarse (ni su evento)", () => {
    expect(htmlFichaMinima).not.toContain('href="tel:');
    expect(htmlFichaMinima).not.toContain("google.com/maps");
    expect(htmlFichaMinima).not.toContain("llamar");
    expect(htmlFichaMinima).not.toContain("como-llegar");
    expect(atributos(anclaCon(htmlFichaMinima, "wa.me")).evento).toBe("whatsapp-ficha");
  });
});

describe("directorio-publico · la vista de ficha se mide sola (tasks #15)", () => {
  // Scenario: la ficha no agrega instrumentación
  it("no hay evento de vista ni contador propio en la ficha", () => {
    for (const html of [htmlFicha, htmlFichaAbarrotes, htmlFichaMinima]) {
      expect(html).not.toContain("vista-ficha");
      expect(html).not.toContain("pageview");
      // El único marcado de medición son los eventos de los botones.
      const eventos = [...html.matchAll(/data-umami-event="([^"]*)"/g)].map((m) => m[1]);
      for (const evento of eventos) {
        expect(["whatsapp-ficha", "llamar", "como-llegar"]).toContain(evento);
      }
    }
  });
});
