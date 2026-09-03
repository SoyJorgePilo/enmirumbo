import { describe, expect, it } from "vitest";

import { slugify } from "../src/lib/slug";

// Spec modelo-datos · Requirement "Catálogos ... con slug estable"
// Scenario: slug apto para URL
describe("slugify", () => {
  it('convierte "Plomería" en "plomeria"', () => {
    expect(slugify("Plomería")).toBe("plomeria");
  });

  it('convierte "Haciendas de Tizayuca" en "haciendas-de-tizayuca"', () => {
    expect(slugify("Haciendas de Tizayuca")).toBe("haciendas-de-tizayuca");
  });

  it("elimina diagonales sin dejar guiones dobles", () => {
    expect(slugify("Fonda / comida corrida")).toBe("fonda-comida-corrida");
  });

  it("no produce mayúsculas, acentos, espacios ni guiones en los extremos", () => {
    const casos = [
      "El Pedregal / Pedregal Centro",
      "Olmos / Ampliación Olmos",
      "Andalucía Residencial",
      "taekwondo / artes marciales",
      "reparación de lavadoras y refrigeradores",
      " Los Héroes Tizayuca ",
    ];
    for (const caso of casos) {
      const slug = slugify(caso);
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("conserva los dígitos", () => {
    expect(slugify("Sección 3")).toBe("seccion-3");
  });
});
