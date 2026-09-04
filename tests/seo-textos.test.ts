import { describe, expect, it } from "vitest";

import { GIROS } from "../prisma/seed";
import { slugify } from "../src/lib/slug";
import { fraseDeGiro } from "../src/lib/seo/frases-giro";
import {
  descripcionCategoria,
  descripcionFicha,
  descripcionGiro,
  descripcionGiroColonia,
  encabezadoCategoria,
  encabezadoGiro,
  encabezadoGiroColonia,
  tituloFicha,
} from "../src/lib/seo/titulos";

// Spec: directorio-publico · requirements "Página indexable por giro en la
// raíz…" (frase curada), "Página indexable por giro y colonia" (la colonia
// que ya dice Tizayuca no lo repite) y "Título y descripción propios en cada
// página del directorio, con su canónica" (tasks.md #1 y #2).

describe("seo · frase curada del giro (tasks #1)", () => {
  // Requirement: "La frase DEBE salir de una tabla curada de frases por giro"
  it.each([
    ["futbol", "Futbol", "Clases de futbol"],
    ["box", "Box", "Clases de box"],
    ["natacion", "Natación", "Clases de natación"],
    ["basquetbol", "Basquetbol", "Clases de basquetbol"],
    [
      "taekwondo-artes-marciales",
      "Taekwondo / artes marciales",
      "Clases de taekwondo y artes marciales",
    ],
    ["danza-zumba", "Danza / zumba", "Clases de danza y zumba"],
    ["atletismo-corredores", "Atletismo / corredores", "Atletismo y clubes de corredores"],
    ["gimnasio", "Gimnasio", "Gimnasios"],
    ["ciclismo", "Ciclismo", "Ciclismo"],
    ["fonda-comida-corrida", "Fonda / comida corrida", "Fondas y comida corrida"],
  ])("el giro %s se presenta como %s", (slug, nombre, frase) => {
    expect(fraseDeGiro({ slug, nombre })).toBe(frase);
  });

  // Requirement: "cuando un giro no tenga entrada en esa tabla DEBE usarse su
  // nombre del catálogo tal cual, de modo que agregar un giro nuevo nunca
  // rompa la página"
  it("un giro sin entrada en la tabla usa su nombre del catálogo", () => {
    expect(fraseDeGiro({ slug: "plomeria", nombre: "Plomería" })).toBe("Plomería");
    expect(
      fraseDeGiro({ slug: "giro-inventado-de-mañana", nombre: "Giro inventado" }),
    ).toBe("Giro inventado");
  });

  it("los 49 giros sembrados tienen una frase no vacía y sin diagonales", () => {
    expect(GIROS).toHaveLength(49);
    for (const nombre of GIROS) {
      const frase = fraseDeGiro({ slug: slugify(nombre), nombre });
      expect(frase.trim(), nombre).not.toBe("");
      expect(frase, nombre).not.toContain("/");
    }
  });

  it("un nombre vacío no deja el encabezado en blanco", () => {
    expect(fraseDeGiro({ slug: "raro", nombre: "   " })).toBe("raro");
  });
});

describe("seo · encabezados y títulos (tasks #2)", () => {
  it("la categoría y el giro se encabezan con 'en Tizayuca'", () => {
    expect(encabezadoCategoria("Servicios del hogar")).toBe(
      "Servicios del hogar en Tizayuca",
    );
    expect(encabezadoGiro("Plomería")).toBe("Plomería en Tizayuca");
    expect(encabezadoGiro("Clases de futbol")).toBe("Clases de futbol en Tizayuca");
  });

  // Scenario: página de giro y colonia con negocios
  it("giro + colonia lleva la colonia y luego Tizayuca separado por coma", () => {
    expect(encabezadoGiroColonia("Plomería", "Huicalco")).toBe(
      "Plomería en Huicalco, Tizayuca",
    );
  });

  // Scenario: la colonia que ya dice Tizayuca no lo repite
  it.each([
    ["Haciendas de Tizayuca", "Plomería en Haciendas de Tizayuca"],
    ["Nuevo Tizayuca", "Plomería en Nuevo Tizayuca"],
    ["Tizayuca Centro", "Plomería en Tizayuca Centro"],
    ["Fuentes de Tizayuca", "Plomería en Fuentes de Tizayuca"],
    ["Los Héroes Tizayuca", "Plomería en Los Héroes Tizayuca"],
  ])("la colonia %s no repite Tizayuca", (colonia, esperado) => {
    expect(encabezadoGiroColonia("Plomería", colonia)).toBe(esperado);
  });

  it("el giro deportivo con colonia usa su frase curada", () => {
    expect(encabezadoGiroColonia("Clases de futbol", "Nuevo Tizayuca")).toBe(
      "Clases de futbol en Nuevo Tizayuca",
    );
  });

  it("la ficha lleva su colonia, y solo Tizayuca cuando no tiene", () => {
    expect(tituloFicha("Plomería Hermanos Rosales (ficticio)", "Huicalco")).toBe(
      "Plomería Hermanos Rosales (ficticio) en Huicalco, Tizayuca",
    );
    expect(tituloFicha("Estética Glamour de Mentiras", "Haciendas de Tizayuca")).toBe(
      "Estética Glamour de Mentiras en Haciendas de Tizayuca",
    );
    expect(tituloFicha("Abarrotes La Esperanza Inventada", null)).toBe(
      "Abarrotes La Esperanza Inventada en Tizayuca",
    );
  });
});

describe("seo · descripciones de cada página (tasks #2)", () => {
  // Requirement: "Título y descripción propios en cada página del directorio"
  it("cada tipo de página tiene el literal de la spec", () => {
    expect(descripcionCategoria("Servicios del hogar")).toBe(
      "Servicios del hogar en Tizayuca: negocios de aquí, verificados uno por uno, que contactas directo por WhatsApp.",
    );
    expect(descripcionGiro("Clases de futbol")).toBe(
      "Clases de futbol en Tizayuca: negocios verificados que contactas directo por WhatsApp, sin intermediarios.",
    );
    expect(descripcionGiroColonia("Plomería", "Huicalco")).toBe(
      "Plomería en Huicalco: negocios verificados de Tizayuca que contactas directo por WhatsApp.",
    );
  });

  // Scenario: descripción de la ficha con lo que escribió el negocio
  it("la ficha describe con el '¿Qué ofreces?' del negocio", () => {
    expect(
      descripcionFicha({
        nombre: "Plomería Hermanos Rosales (ficticio)",
        coloniaNombre: "Huicalco",
        queOfreces: "Plomería, destape de drenajes y bombas de agua.",
      }),
    ).toBe("Plomería, destape de drenajes y bombas de agua.");
  });

  // Scenario: ficha sin "¿Qué ofreces?"
  it("sin '¿Qué ofreces?' usa la frase de respaldo con nombre y colonia", () => {
    expect(
      descripcionFicha({
        nombre: "Fonda Doña Cuquita (ficticia)",
        coloniaNombre: "Tizayuca Centro",
        queOfreces: null,
      }),
    ).toBe(
      "Fonda Doña Cuquita (ficticia) en Tizayuca Centro. Negocio verificado que contactas directo por WhatsApp.",
    );
    expect(
      descripcionFicha({
        nombre: "Abarrotes La Esperanza Inventada",
        coloniaNombre: null,
        queOfreces: "   ",
      }),
    ).toBe(
      "Abarrotes La Esperanza Inventada en Tizayuca. Negocio verificado que contactas directo por WhatsApp.",
    );
  });

  it("un '¿Qué ofreces?' larguísimo se recorta sin cortar la palabra a la mitad", () => {
    const largo = `${"palabra ".repeat(40)}final`;
    const descripcion = descripcionFicha({
      nombre: "Negocio Larguísimo Ficticio",
      coloniaNombre: "Huicalco",
      queOfreces: largo,
    });
    expect(descripcion.length).toBeLessThanOrEqual(161);
    expect(descripcion.endsWith("…")).toBe(true);
    expect(descripcion).not.toContain("  ");
  });
});
