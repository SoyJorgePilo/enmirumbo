import { describe, expect, it } from "vitest";

import {
  type CatalogosDeLaRaiz,
  cortesDeCompuesto,
  resolverSlugDeLaRaiz,
} from "../src/lib/seo/rutas";

// Spec: directorio-publico · requirement "Listado por categoría en URL limpia
// con el slug del catálogo" (MODIFIED: la raíz resuelve contra los tres
// catálogos en orden fijo) y "Página indexable por giro y colonia" (la
// resolución del par DEBE ser inequívoca). design.md §1 y §2, tasks.md #3.

const catalogos: CatalogosDeLaRaiz = {
  categorias: [
    { nombre: "Servicios del hogar", slug: "servicios-del-hogar" },
    { nombre: "Clubes y escuelas deportivas", slug: "clubes-y-escuelas-deportivas" },
  ],
  giros: [
    { nombre: "Plomería", slug: "plomeria" },
    { nombre: "Futbol", slug: "futbol" },
    { nombre: "Taekwondo / artes marciales", slug: "taekwondo-artes-marciales" },
  ],
  colonias: [
    { nombre: "Huicalco", slug: "huicalco" },
    { nombre: "Haciendas de Tizayuca", slug: "haciendas-de-tizayuca" },
    { nombre: "El Refugio Tepojaco", slug: "el-refugio-tepojaco" },
  ],
};

describe("seo · resolución de la raíz (tasks #3)", () => {
  // Scenario: listado de una categoría con negocios / las URLs publicadas
  // siguen siendo las mismas
  it("un slug de categoría resuelve a su listado", () => {
    expect(resolverSlugDeLaRaiz("servicios-del-hogar", catalogos)).toEqual({
      tipo: "categoria",
      categoria: { nombre: "Servicios del hogar", slug: "servicios-del-hogar" },
    });
  });

  it("un slug de giro resuelve a su página de giro", () => {
    expect(resolverSlugDeLaRaiz("plomeria", catalogos)).toEqual({
      tipo: "giro",
      giro: { nombre: "Plomería", slug: "plomeria" },
    });
  });

  it("un compuesto giro+colonia resuelve al par, aunque las dos partes traigan guiones", () => {
    expect(resolverSlugDeLaRaiz("plomeria-huicalco", catalogos)).toEqual({
      tipo: "giro-colonia",
      giro: { nombre: "Plomería", slug: "plomeria" },
      colonia: { nombre: "Huicalco", slug: "huicalco" },
    });
    expect(
      resolverSlugDeLaRaiz("taekwondo-artes-marciales-el-refugio-tepojaco", catalogos),
    ).toMatchObject({
      tipo: "giro-colonia",
      giro: { slug: "taekwondo-artes-marciales" },
      colonia: { slug: "el-refugio-tepojaco" },
    });
  });

  // Scenario: la categoría le gana al giro con el mismo slug
  it("la categoría gana siempre, aunque un giro se llamara igual", () => {
    const conChoque: CatalogosDeLaRaiz = {
      ...catalogos,
      giros: [...catalogos.giros, { nombre: "Talleres", slug: "servicios-del-hogar" }],
    };
    expect(resolverSlugDeLaRaiz("servicios-del-hogar", conChoque)).toMatchObject({
      tipo: "categoria",
    });
  });

  // Scenario: slug que no está en ningún catálogo / compuesto que no existe
  it.each([
    "plomeros-baratos",
    "plomeria-colonia-inventada",
    "loquesea-huicalco",
    "loquesea",
    "",
    "-",
    "---",
    "plomeria--huicalco",
    "plomeria-",
    "-huicalco",
    "Plomeria",
    "PLOMERIA-HUICALCO",
    "plomeria_huicalco",
    "plomeria%2dhuicalco",
    "plomeria/huicalco",
    "../plomeria",
    "пломерия",
    "plomeria huicalco",
  ])("el slug %o no resuelve a nada (404) y no lanza excepción", (slug) => {
    expect(resolverSlugDeLaRaiz(slug, catalogos)).toEqual({ tipo: "desconocido" });
  });

  it("un slug larguísimo se descarta sin recorrer mil cortes", () => {
    const largo = `plomeria-${"a-".repeat(500)}huicalco`;
    expect(resolverSlugDeLaRaiz(largo, catalogos)).toEqual({ tipo: "desconocido" });
  });

  // design.md §2: dos lecturas posibles no pueden pasar; si pasaran, la URL es
  // ambigua y se responde 404 en vez de elegir una al azar.
  it("un compuesto con dos lecturas válidas no resuelve a ninguna", () => {
    const ambiguo: CatalogosDeLaRaiz = {
      categorias: [],
      giros: [
        { nombre: "Uno", slug: "a" },
        { nombre: "Dos", slug: "a-b" },
      ],
      colonias: [
        { nombre: "Tres", slug: "b-c" },
        { nombre: "Cuatro", slug: "c" },
      ],
    };
    expect(resolverSlugDeLaRaiz("a-b-c", ambiguo)).toEqual({ tipo: "desconocido" });
  });
});

describe("seo · cortes posibles de un compuesto (design.md §2)", () => {
  it("enumera un corte por cada guion, sin inventar partes vacías", () => {
    expect(cortesDeCompuesto("a-b-c")).toEqual([
      { giro: "a", colonia: "b-c" },
      { giro: "a-b", colonia: "c" },
    ]);
    expect(cortesDeCompuesto("singuiones")).toEqual([]);
    expect(cortesDeCompuesto("")).toEqual([]);
  });
});
