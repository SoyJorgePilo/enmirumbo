import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import BuscarPage from "../src/app/(publico)/buscar/page";
import type { PrismaClient } from "../src/generated/prisma/client";
import { datosDeBusqueda } from "../src/lib/busqueda";
import { buscarNegociosPublicados } from "../src/lib/directorio";
import { crearClientePrueba } from "./db";

/**
 * Change `agregar-buscador`, tasks.md #15.
 *
 * Spec `directorio-publico` · requirement "Consulta vacía y términos hostiles
 * acotados, sin error" y requirement "La búsqueda cubre nombre, palabras
 * clave y giros, y solo lo publicado" (la mitad de la privacidad).
 *
 * Lo que el camino feliz no cubre: consultas kilométricas, comodines de
 * `LIKE`, intentos de inyección, `q` repetido o como arreglo, alfabetos
 * raros y términos que coinciden con fichas que NO están publicadas.
 *
 * TODO es ficticio (repo público + LFPDPPP): la serie `7719993xxx` es
 * exclusiva de este archivo y se borra al terminar.
 */

const PREFIJO = "7719993";
const normalizado = (html: string) => html.replace(/\s+/g, " ");

/** Datos que el público NUNCA debe ver: son de una ficha sin publicar. */
const OCULTO = {
  nombre: "Plomería Fantasma Sin Publicar (ficticia)",
  whatsapp: `${PREFIJO}901`,
  queOfreces: "Plomería, destapes y fugas (ficha en revisión).",
  telefonoFijo: "7717779901",
  direccion: "Calle Secreta Inventada 999",
  token: "token-de-gestion-ficticio-8b2c1a",
};

/** Publicados que sí pueden salir; sirven para medir "no devolvió todo". */
const PUBLICADOS = [
  {
    whatsapp: `${PREFIJO}101`,
    nombre: "Plomería Visible (ficticia)",
    queOfreces: "Plomería, destape de drenajes y fugas.",
  },
  {
    whatsapp: `${PREFIJO}102`,
    nombre: "Estética Visible (ficticia)",
    queOfreces: "Corte, tinte y peinados.",
  },
  {
    whatsapp: `${PREFIJO}103`,
    nombre: "Taller Visible (ficticio)",
    queOfreces: "Afinación y frenos.",
  },
];

let prisma: PrismaClient;
let categoriaId = 0;

async function renderBuscar(q?: string | string[]): Promise<string> {
  const elemento = await BuscarPage({
    // El tipo promete strings; un cliente hostil manda lo que quiera.
    searchParams: Promise.resolve(
      (q === undefined ? {} : { q }) as unknown as Record<string, string>,
    ),
  } as unknown as Parameters<typeof BuscarPage>[0]);
  return renderToStaticMarkup(createElement(() => elemento));
}

/** Consultas hostiles que ninguna respuesta debe convertir en un error 500. */
const CONSULTAS_HOSTILES: Array<[string, string]> = [
  ["comodín de porcentaje", "%"],
  ["comodín de guion bajo", "_"],
  ["solo comodines", "%_%%__%"],
  ["comodín pegado a un término", "%plomer%"],
  ["escape de LIKE", "\\%"],
  ["comillas simples", "plomero' OR '1'='1"],
  ["comillas dobles", 'plomero" OR "1"="1'],
  ["punto y coma con DROP", "'; DROP TABLE Negocio; --"],
  ["comentario de SQL", "plomero --"],
  ["marcado", "<script>alert(1)</script>"],
  ["entidad HTML", "&lt;script&gt;"],
  ["emojis", "🎉🎈🌮"],
  ["otro alfabeto", "Привет мир"],
  ["ideogramas", "配管工"],
  ["ancho completo", "ＰＬＯＭＥＲＯ"],
  ["byte nulo", "plomero\u0000"],
  ["controles", "\u0001\u0002\u0003"],
  ["salto de línea", "plomero\nrechazado"],
  ["ruta", "../../etc/passwd"],
  ["kilométrica", "a".repeat(100_000)],
  ["kilométrica con términos", "plomero ".repeat(20_000)],
  ["muchos términos", Array.from({ length: 500 }, (_, i) => `t${i}`).join(" ")],
];

beforeAll(async () => {
  prisma = crearClientePrueba();
  await prisma.negocio.deleteMany();
  await seedCatalogos(prisma);
  categoriaId = (
    await prisma.categoria.findUniqueOrThrow({ where: { slug: "servicios-del-hogar" } })
  ).id;

  for (const publicado of PUBLICADOS) {
    await prisma.negocio.create({
      data: {
        nombre: publicado.nombre,
        queOfreces: publicado.queOfreces,
        ...datosDeBusqueda(publicado.nombre, publicado.queOfreces),
        categoriaId,
        whatsapp: publicado.whatsapp,
        estado: "publicado",
        origen: "siembra",
        publicadoEn: new Date("2026-08-15T10:00:00.000Z"),
        consintioAvisoEn: new Date("2026-07-31T10:00:00.000Z"),
        registradoEn: new Date("2026-07-31T10:00:00.000Z"),
      },
    });
  }

  await prisma.negocio.create({
    data: {
      nombre: OCULTO.nombre,
      queOfreces: OCULTO.queOfreces,
      ...datosDeBusqueda(OCULTO.nombre, OCULTO.queOfreces),
      telefonoFijo: OCULTO.telefonoFijo,
      direccion: OCULTO.direccion,
      tokenGestionHash: OCULTO.token,
      categoriaId,
      whatsapp: OCULTO.whatsapp,
      estado: "en_revision",
      origen: "organico",
      consintioAvisoEn: new Date("2026-07-31T10:00:00.000Z"),
      registradoEn: new Date("2026-07-31T10:00:00.000Z"),
    },
  });
});

afterAll(async () => {
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
  await prisma.$disconnect();
});

describe("adversarial · ninguna consulta hostil tumba la página", () => {
  it.each(CONSULTAS_HOSTILES)("%s responde una página normal", async (_caso, q) => {
    const html = await renderBuscar(q);
    expect(html).toContain("<section");
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
  });

  it.each(CONSULTAS_HOSTILES)(
    "%s nunca devuelve el directorio completo",
    async (_caso, q) => {
      const resultados = await buscarNegociosPublicados(q);
      expect(resultados.length).toBeLessThan(PUBLICADOS.length);
    },
  );

  it("la tabla de negocios sigue entera después de todas las consultas", async () => {
    for (const [, q] of CONSULTAS_HOSTILES) await buscarNegociosPublicados(q);
    expect(await prisma.negocio.count({ where: { whatsapp: { startsWith: PREFIJO } } })).toBe(
      PUBLICADOS.length + 1,
    );
  });
});

describe("adversarial · los comodines de LIKE no son comodines", () => {
  // Scenario: caracteres que en una búsqueda serían comodines
  it("una consulta de puros comodines se trata como vacía", async () => {
    for (const q of ["%", "_", "%%", "%_%", "___"]) {
      expect(await buscarNegociosPublicados(q), q).toEqual([]);
      expect(normalizado(await renderBuscar(q)), q).toContain("¿Qué estás buscando?");
    }
  });

  it("un comodín pegado a un término no amplía el resultado", async () => {
    const limpia = await buscarNegociosPublicados("plomeria");
    expect(await buscarNegociosPublicados("%plomeria%")).toEqual(limpia);
    expect(await buscarNegociosPublicados("_plomeria_")).toEqual(limpia);
    expect(limpia.map((n) => n.nombre)).toEqual(["Plomería Visible (ficticia)"]);
  });
});

describe("adversarial · el buscador no filtra fichas sin publicar", () => {
  // Scenario: los negocios no publicados nunca aparecen
  it.each([
    "plomeria",
    "plomero",
    "fantasma",
    "revision",
    "Plomería Fantasma Sin Publicar",
    "%plomer%",
    "' OR 1=1 --",
  ])("la consulta %j no revela nada del negocio en revisión", async (q) => {
    const resultados = await buscarNegociosPublicados(q);
    expect(resultados.map((n) => n.nombre)).not.toContain(OCULTO.nombre);
    expect(resultados.map((n) => n.whatsapp)).not.toContain(OCULTO.whatsapp);

    const html = await renderBuscar(q);
    for (const secreto of [
      OCULTO.nombre,
      OCULTO.whatsapp,
      OCULTO.telefonoFijo,
      OCULTO.direccion,
      OCULTO.token,
    ]) {
      expect(html, secreto).not.toContain(secreto);
    }
  });
});

describe("adversarial · el parámetro de la URL puede venir como sea", () => {
  // Scenario: consulta repetida en la URL
  it("con q repetido se usa el primer valor", async () => {
    const html = await renderBuscar(["plomeria", "estetica"]);
    expect(normalizado(html)).toContain("Plomería Visible (ficticia)");
    expect(normalizado(html)).not.toContain("Estética Visible (ficticia)");
  });

  it("un arreglo vacío o de valores raros no truena", async () => {
    expect(normalizado(await renderBuscar([]))).toContain("¿Qué estás buscando?");
    expect(normalizado(await renderBuscar(["", "plomeria"]))).toContain(
      "¿Qué estás buscando?",
    );
    expect(normalizado(await renderBuscar(["%", "plomeria"]))).toContain(
      "¿Qué estás buscando?",
    );
  });

  it("sin parámetro alguno se muestra el estado de consulta vacía", async () => {
    expect(normalizado(await renderBuscar())).toContain("¿Qué estás buscando?");
  });
});

describe("adversarial · la consulta se devuelve como texto y acotada", () => {
  // Scenario: la consulta se muestra como texto
  it("el marcado y las comillas salen escapados, no interpretados", async () => {
    const html = await renderBuscar('<img src=x onerror=alert(1)> "plomero"');
    // Ninguna etiqueta nueva: lo que mandó el cliente quedó como texto.
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");

    // Y tampoco se sale del atributo del campo: sus comillas van escapadas,
    // así que el `value="…"` se puede leer entero de comilla a comilla.
    const valor = html.match(/<input[^>]*\bvalue="([^"]*)"/)?.[1] ?? "";
    expect(valor).toContain("&lt;img");
    expect(valor).toContain("&quot;plomero&quot;");
    expect(valor).not.toContain("<");
  });

  // Scenario: consulta larguísima
  it("una cadena de 100 000 caracteres no vuelve entera al HTML", async () => {
    const larga = "plomero".repeat(20_000);
    const html = await renderBuscar(larga);
    expect(html).not.toContain(larga);
    expect(html.length).toBeLessThan(50_000);
  });
});
