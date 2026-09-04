import { describe, expect, it } from "vitest";

import {
  LONGITUD_MAXIMA_CONSULTA,
  MAXIMO_TERMINOS,
  datosDeBusqueda,
  normalizarTexto,
  terminosDeBusqueda,
} from "../src/lib/busqueda";
import { slugify } from "../src/lib/slug";
import { quitarAcentos } from "../src/lib/texto";

/**
 * Change `agregar-buscador`, tasks.md #1, #2 y #4.
 *
 * Spec `directorio-publico` · requirement "Coincidencia insensible a
 * mayúsculas y acentos, y parcial por raíz de la palabra" y requirement
 * "Consulta vacía y términos hostiles acotados, sin error" (la parte que se
 * decide antes de tocar la base).
 * Spec `modelo-datos` · requirement "El negocio guarda una versión
 * normalizada de su nombre y de '¿Qué ofreces?' para el buscador".
 */

describe("busqueda · helper compartido de acentos (tasks #1)", () => {
  it("quita acentos, diéresis y la virgulilla de la ñ, sin tocar lo demás", () => {
    expect(quitarAcentos("Plomería Güicho")).toBe("Plomeria Guicho");
    expect(quitarAcentos("piñatas")).toBe("pinatas");
    expect(quitarAcentos("Fútbol")).toBe("Futbol");
    expect(quitarAcentos("sin acentos")).toBe("sin acentos");
  });

  it("trata igual el acento compuesto y el descompuesto (NFC vs NFD)", () => {
    expect(quitarAcentos("Plomería".normalize("NFC"))).toBe(
      quitarAcentos("Plomería".normalize("NFD")),
    );
  });

  // El helper salió de `slugify`: su comportamiento no cambia (tasks #1).
  it("slugify sigue produciendo los mismos slugs del catálogo", () => {
    expect(slugify("Plomería")).toBe("plomeria");
    expect(slugify("Fonda / comida corrida")).toBe("fonda-comida-corrida");
    expect(slugify("Olmos / Ampliación Olmos")).toBe("olmos-ampliacion-olmos");
  });
});

describe("busqueda · normalizarTexto (tasks #2)", () => {
  // Scenario: mayúsculas y acentos dan igual
  it("baja a minúsculas y quita acentos", () => {
    expect(normalizarTexto("Plomería Güicho")).toBe("plomeria guicho");
    expect(normalizarTexto("PLOMERÍA")).toBe("plomeria");
    expect(normalizarTexto("Destape de drenajes y BOMBAS de agua")).toBe(
      "destape de drenajes y bombas de agua",
    );
  });

  // Scenario: la "ñ" no rompe la búsqueda
  it('la "ñ" queda como "n" en los dos lados de la comparación', () => {
    expect(normalizarTexto("Piñatas")).toBe("pinatas");
    expect(normalizarTexto("pinatas")).toBe("pinatas");
  });

  it("convierte en espacio todo lo que no sea letra o dígito y colapsa espacios", () => {
    expect(normalizarTexto("Fonda / comida corrida")).toBe("fonda comida corrida");
    expect(normalizarTexto("  hola   mundo  ")).toBe("hola mundo");
    expect(normalizarTexto("tacos, tortas y ¡quesadillas!")).toBe(
      "tacos tortas y quesadillas",
    );
  });

  // Scenario: caracteres que en una búsqueda serían comodines
  it("borra los comodines de LIKE (% y _) antes de que lleguen a la base", () => {
    expect(normalizarTexto("%")).toBe("");
    expect(normalizarTexto("_")).toBe("");
    expect(normalizarTexto("100%_seguro")).toBe("100 seguro");
  });

  // Scenario: alfabetos y símbolos raros
  it("descarta emojis, otros alfabetos y caracteres de control", () => {
    expect(normalizarTexto("🎉🎈")).toBe("");
    expect(normalizarTexto("Привет")).toBe("");
    expect(normalizarTexto("日本語")).toBe("");
    expect(normalizarTexto("\u0000\u001B\t\n")).toBe("");
    expect(normalizarTexto("tacos 🌮 al pastor")).toBe("tacos al pastor");
  });

  it("conserva los dígitos", () => {
    expect(normalizarTexto("Futbol de 6 a 12 años")).toBe("futbol de 6 a 12 anos");
  });

  it("una cadena vacía o de puros espacios queda vacía", () => {
    expect(normalizarTexto("")).toBe("");
    expect(normalizarTexto("     ")).toBe("");
  });
});

describe("busqueda · terminosDeBusqueda (tasks #2)", () => {
  // Scenario: "plomero" encuentra a "plomería" → las dos comparten raíz
  it("recorta cada término de 5 o más a su raíz de 5 letras", () => {
    expect(terminosDeBusqueda("plomero")).toEqual(["plome"]);
    expect(terminosDeBusqueda("plomería")).toEqual(["plome"]);
    expect(terminosDeBusqueda("PLOMERIA")).toEqual(["plome"]);
    expect(terminosDeBusqueda("futbol")).toEqual(["futbo"]);
    expect(terminosDeBusqueda("fútbol")).toEqual(["futbo"]);
  });

  it("los términos de menos de 5 caracteres se usan completos", () => {
    expect(terminosDeBusqueda("taco")).toEqual(["taco"]);
    expect(terminosDeBusqueda("box")).toEqual(["box"]);
  });

  // Scenario: varias palabras se exigen todas (aquí, que se troceen bien)
  it("trocea la consulta en varios términos", () => {
    expect(terminosDeBusqueda("futbol infantil")).toEqual(["futbo", "infan"]);
    expect(terminosDeBusqueda("veterinario espacial")).toEqual(["veter", "espac"]);
  });

  it("descarta los términos de un solo carácter", () => {
    expect(terminosDeBusqueda("a")).toEqual([]);
    expect(terminosDeBusqueda("a plomero")).toEqual(["plome"]);
    expect(terminosDeBusqueda("comida a domicilio")).toEqual(["comid", "domic"]);
  });

  it(`toma como máximo ${MAXIMO_TERMINOS} términos`, () => {
    expect(terminosDeBusqueda("uno dos tres cuatro cinco seis")).toEqual([
      "uno",
      "dos",
      "tres",
      "cuatr",
    ]);
  });

  // Scenario: consulta vacía o de puros espacios
  it("devuelve lista vacía si no queda nada buscable", () => {
    expect(terminosDeBusqueda("")).toEqual([]);
    expect(terminosDeBusqueda("   ")).toEqual([]);
    expect(terminosDeBusqueda("%")).toEqual([]);
    expect(terminosDeBusqueda("_")).toEqual([]);
    expect(terminosDeBusqueda("%_%")).toEqual([]);
    expect(terminosDeBusqueda("🎉🎈")).toEqual([]);
    expect(terminosDeBusqueda("Привет")).toEqual([]);
    expect(terminosDeBusqueda("!!!???")).toEqual([]);
  });

  // Scenario: consulta larguísima
  it("acota una cadena de miles de caracteres sin tronar", () => {
    const larga = "plomero ".repeat(5_000);
    const terminos = terminosDeBusqueda(larga);
    expect(terminos).toHaveLength(MAXIMO_TERMINOS);
    for (const termino of terminos) expect(termino).toBe("plome");

    const unaSolaPalabra = "x".repeat(100_000);
    expect(terminosDeBusqueda(unaSolaPalabra)).toEqual(["xxxxx"]);

    const emojis = "🌮".repeat(50_000);
    expect(terminosDeBusqueda(emojis)).toEqual([]);
  });

  it(`solo mira los primeros ${LONGITUD_MAXIMA_CONSULTA} caracteres ya normalizados`, () => {
    const relleno = "ab ".repeat(30); // 90 caracteres de términos cortos
    expect(terminosDeBusqueda(`${relleno}plomero`)).toEqual(["ab", "ab", "ab", "ab"]);
  });

  // Iteración 2 · hallazgo M-2: el tope se aplica DESPUÉS de normalizar, así
  // que el relleno (que la normalización borra) ya no gasta la cuota y la
  // palabra que el vecino sí escribió sobrevive.
  it("el relleno no alfanumérico del principio no se come la consulta", () => {
    for (const relleno of [
      " ".repeat(80),
      ".".repeat(80),
      "🎉".repeat(40),
      "Привет ".repeat(20),
      "%_".repeat(60),
      "-".repeat(200),
    ]) {
      expect(terminosDeBusqueda(`${relleno}plomero`), relleno.slice(0, 3)).toEqual([
        "plome",
      ]);
    }
  });

  // Iteración 2 · hallazgo M-3: las muletillas con las que se enuncia la
  // pregunta no gastan la cuota de términos ni se exigen con AND.
  it("descarta las muletillas de la pregunta y deja las palabras con contenido", () => {
    expect(terminosDeBusqueda("quien me arregla la cerrajeria")).toEqual(["cerra"]);
    expect(terminosDeBusqueda("de la el en plomero")).toEqual(["plome"]);
    expect(terminosDeBusqueda("necesito un plomero cerca")).toEqual(["plome"]);
    expect(terminosDeBusqueda("donde venden pinatas")).toEqual(["pinat"]);
    expect(terminosDeBusqueda("quien repara lavadoras y refrigeradores")).toEqual([
      "lavad",
      "refri",
    ]);
  });

  it("las palabras con contenido se siguen exigiendo todas", () => {
    expect(terminosDeBusqueda("futbol infantil")).toEqual(["futbo", "infan"]);
    expect(terminosDeBusqueda("tacos de canasta")).toEqual(["tacos", "canas"]);
  });

  // Residuo de M-3: el sitio ENTERO es de Tizayuca, así que la palabra no
  // discrimina nada; exigirla solo servía para matar consultas legítimas.
  it('"tizayuca" no discrimina: es una muletilla más', () => {
    expect(terminosDeBusqueda("cerrajeria en Tizayuca")).toEqual(["cerra"]);
    expect(terminosDeBusqueda("plomero tizayuca")).toEqual(["plome"]);
    expect(terminosDeBusqueda("TIZAYUCA plomero")).toEqual(["plome"]);
    // Y da igual cómo la escriban: la comparación es contra el texto normalizado.
    expect(terminosDeBusqueda("cerrajeria en tizayuca centro")).toEqual([
      "cerra",
      "centr",
    ]);
  });

  it('una consulta que es solo "tizayuca" no truena ni se vacía', () => {
    expect(terminosDeBusqueda("tizayuca")).toEqual(["tizay"]);
    expect(terminosDeBusqueda("  Tizayuca  ")).toEqual(["tizay"]);
  });

  it("una consulta de puras muletillas se busca tal cual en vez de vaciarse", () => {
    // Si se vaciara, el vecino vería "¿Qué estás buscando?" habiendo escrito
    // algo; así ve "no encontramos", que es la verdad.
    expect(terminosDeBusqueda("quien me la hace")).toEqual([
      "quien",
      "me",
      "la",
      "hace",
    ]);
    expect(terminosDeBusqueda("de la el en")).toEqual(["de", "la", "el", "en"]);
  });

  it("nunca devuelve términos con comodines ni caracteres raros", () => {
    for (const consulta of ["%plom%", "_taco_", "ta%co", "a'b\"c", "<b>plomero</b>"]) {
      for (const termino of terminosDeBusqueda(consulta)) {
        expect(termino, consulta).toMatch(/^[a-z0-9]+$/);
      }
    }
  });
});

describe("busqueda · datosDeBusqueda (tasks #4)", () => {
  // Scenario (modelo-datos): alta con acentos y mayúsculas
  it("devuelve el par listo para guardar, sin acentos ni mayúsculas", () => {
    expect(
      datosDeBusqueda("Plomería Güicho", "Destape de drenajes y BOMBAS de agua"),
    ).toEqual({
      nombreNormalizado: "plomeria guicho",
      queOfrecesNormalizado: "destape de drenajes y bombas de agua",
    });
  });

  // Scenario (modelo-datos): negocio sin "¿Qué ofreces?"
  it('sin "¿Qué ofreces?" el valor es cadena vacía, nunca nulo', () => {
    expect(datosDeBusqueda("Fonda Doña Cuquita", null)).toEqual({
      nombreNormalizado: "fonda dona cuquita",
      queOfrecesNormalizado: "",
    });
    expect(datosDeBusqueda("Fonda Doña Cuquita", undefined).queOfrecesNormalizado).toBe(
      "",
    );
    expect(datosDeBusqueda("Fonda Doña Cuquita", "   ").queOfrecesNormalizado).toBe("");
  });

  it("es determinista: el mismo texto da siempre el mismo valor", () => {
    const a = datosDeBusqueda("Piñatería Fiesta", "Piñatas y dulceros");
    const b = datosDeBusqueda("Piñatería Fiesta", "Piñatas y dulceros");
    expect(a).toEqual(b);
    expect(a.nombreNormalizado).toBe("pinateria fiesta");
  });
});
