import { describe, expect, it } from "vitest";

import {
  FILTROS_ESTADO_LISTADO,
  FILTRO_TODOS,
  PAGINA_MAXIMA,
  PORPAGINA_LISTADO,
  hrefListadoDeNegocios,
  normalizarFiltroEstado,
  normalizarPagina,
} from "../src/lib/admin/listado-parametros";

// Spec: revision-admin (change `agregar-listado-gestion-panel`) · Requirements
// "El listado se filtra por estado sin salir de la vista" y "El listado se
// corta en páginas..." (tasks.md #2).
//
// Lo que se prueba aquí es el BORDE: `estado` y `pagina` llegan del
// querystring, así que llegan como cualquiera quiera mandarlos —incluidos
// arreglos, porque `searchParams` entrega un arreglo cuando el parámetro
// viene repetido—. Ninguna entrada puede lanzar: un parámetro manoseado cae
// al valor por defecto, nunca a un error del servidor.

/** Todo lo raro que puede llegar en `estado`, con su porqué. */
const ESTADOS_RAROS: Array<[string, string | string[] | undefined]> = [
  ["ausente", undefined],
  ["vacío", ""],
  ["palabra inventada", "xyz"],
  ["estado que no es del modelo", "despublicado"],
  ["con espacios alrededor", " publicado "],
  ["con otra caja", "PUBLICADO"],
  ["repetido (arreglo)", ["publicado", "rechazado"]],
  ["arreglo con un solo valor válido", ["publicado"]],
  ["arreglo vacío", []],
  ["inyección en el querystring", "publicado' OR 1=1 --"],
  ["con etiqueta HTML", "<script>alert(1)</script>"],
  ["larguísimo", "p".repeat(5000)],
];

describe("revision-admin · normalización del filtro de estado", () => {
  // Scenario: filtro inventado en la URL
  it.each(ESTADOS_RAROS)("un estado %s cae en 'Todos'", (_caso, valor) => {
    expect(normalizarFiltroEstado(valor)).toBe(FILTRO_TODOS);
  });

  it("los cuatro valores conocidos pasan tal cual", () => {
    for (const filtro of FILTROS_ESTADO_LISTADO) {
      expect(normalizarFiltroEstado(filtro)).toBe(filtro);
    }
    expect([...FILTROS_ESTADO_LISTADO]).toEqual([
      "todos",
      "en_revision",
      "publicado",
      "rechazado",
    ]);
  });

  it("ninguna entrada rara lanza", () => {
    for (const [, valor] of ESTADOS_RAROS) {
      expect(() => normalizarFiltroEstado(valor)).not.toThrow();
    }
  });
});

/** Todo lo raro que puede llegar en `pagina`, con su porqué. */
const PAGINAS_RARAS: Array<[string, string | string[] | undefined]> = [
  ["ausente", undefined],
  ["vacía", ""],
  ["con letras", "dos"],
  ["cero", "0"],
  ["negativa", "-3"],
  ["decimal", "1.5"],
  ["con coma", "1,5"],
  ["con signo", "+2"],
  ["con espacios", " 2 "],
  ["con ceros a la izquierda", "007"],
  ["hexadecimal", "0x10"],
  ["notación científica", "1e3"],
  ["infinito", "Infinity"],
  ["NaN", "NaN"],
  ["repetida (arreglo)", ["2", "3"]],
  ["arreglo con un solo número", ["2"]],
  ["arreglo vacío", []],
  ["inyección en el querystring", "1; DROP TABLE negocio"],
  ["con etiqueta HTML", "<script>1</script>"],
];

describe("revision-admin · normalización del número de página", () => {
  // Scenario: página inventada en la URL
  it.each(PAGINAS_RARAS)("una página %s cae en la primera", (_caso, valor) => {
    expect(normalizarPagina(valor)).toBe(1);
  });

  it("un entero positivo pasa tal cual", () => {
    expect(normalizarPagina("1")).toBe(1);
    expect(normalizarPagina("2")).toBe(2);
    expect(normalizarPagina("99")).toBe(99);
  });

  it("ninguna entrada rara lanza", () => {
    for (const [, valor] of PAGINAS_RARAS) {
      expect(() => normalizarPagina(valor)).not.toThrow();
    }
  });

  // Un número enorme SÍ se puede interpretar (no es basura), así que no cae en
  // la primera: cae en la cota. Sin cota, `skip = (pagina - 1) * 25` se sale
  // del entero de 32 bits que la base acepta como OFFSET y el listado
  // respondería con un error del servidor — justo lo que el requirement
  // prohíbe para una página más allá de la última.
  it("una página enorme se recorta a la cota, sin desbordar el entero de la base", () => {
    expect(normalizarPagina("999999999999999999999")).toBe(PAGINA_MAXIMA);
    expect(normalizarPagina(String(Number.MAX_SAFE_INTEGER))).toBe(PAGINA_MAXIMA);
    expect(normalizarPagina(String(PAGINA_MAXIMA))).toBe(PAGINA_MAXIMA);
    expect((PAGINA_MAXIMA - 1) * PORPAGINA_LISTADO).toBeLessThan(2 ** 31 - 1);
  });
});

describe("revision-admin · la URL del listado solo lleva filtro y página", () => {
  // Scenario: la URL del listado no lleva datos personales
  it("los valores por defecto no ensucian la URL", () => {
    expect(hrefListadoDeNegocios(FILTRO_TODOS, 1)).toBe("/admin/negocios");
  });

  it("cada filtro y cada página viajan como querystring, y nada más", () => {
    expect(hrefListadoDeNegocios("publicado", 1)).toBe(
      "/admin/negocios?estado=publicado",
    );
    expect(hrefListadoDeNegocios(FILTRO_TODOS, 3)).toBe("/admin/negocios?pagina=3");
    expect(hrefListadoDeNegocios("rechazado", 2)).toBe(
      "/admin/negocios?estado=rechazado&pagina=2",
    );
  });

  it("ninguna URL del listado admite otro parámetro que estado y pagina", () => {
    for (const filtro of FILTROS_ESTADO_LISTADO) {
      for (const pagina of [1, 2, 7, PAGINA_MAXIMA]) {
        const url = new URL(hrefListadoDeNegocios(filtro, pagina), "https://ejemplo.mx");
        expect(url.pathname).toBe("/admin/negocios");
        expect([...url.searchParams.keys()].sort()).toEqual(
          [...new Set([...url.searchParams.keys()])].sort(),
        );
        for (const clave of url.searchParams.keys()) {
          expect(["estado", "pagina"]).toContain(clave);
        }
      }
    }
  });

  // Ida y vuelta: lo que arma el enlace es exactamente lo que lee la pantalla.
  it("lo que arma el enlace es lo que la pantalla vuelve a leer", () => {
    for (const filtro of FILTROS_ESTADO_LISTADO) {
      for (const pagina of [1, 2, 40]) {
        const url = new URL(hrefListadoDeNegocios(filtro, pagina), "https://ejemplo.mx");
        expect(normalizarFiltroEstado(url.searchParams.get("estado") ?? undefined)).toBe(
          filtro,
        );
        expect(normalizarPagina(url.searchParams.get("pagina") ?? undefined)).toBe(pagina);
      }
    }
  });

  it("la página del listado trae 25 renglones (design.md §3)", () => {
    expect(PORPAGINA_LISTADO).toBe(25);
  });
});
