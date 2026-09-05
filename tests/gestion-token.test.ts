import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BYTES_TOKEN_GESTION,
  construirEnlaceDeGestion,
  generarEnlaceDeGestion,
  generarTokenGestion,
  huellaDeToken,
  huellasIguales,
  negocioDelToken,
  pareceToken,
} from "../src/lib/gestion/token";
import { VARIABLE_URL_SITIO } from "../src/lib/sitio";

/**
 * Spec `registro-negocio` (delta de `agregar-enlace-de-gestion`) · Requirement
 * "Un token que no es exactamente el vigente no abre nada ni delata nada";
 * spec `revision-admin` · Requirement "Aprobar un registro genera su enlace de
 * gestión, único e irrepetible" (tasks.md #5). Módulo puro: sin base.
 */

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

/** Cliente de mentiras: responde la fila que se le dé, sea cual sea el where. */
function clienteConFila(fila: unknown, espia = vi.fn()) {
  return {
    negocio: {
      findUnique: async (args: unknown) => {
        espia(args);
        return fila;
      },
    },
  };
}

describe("gestion · el token del enlace", () => {
  // Scenario: el token no se puede adivinar
  it("son 256 bits de una fuente aleatoria criptográfica, distintos cada vez", () => {
    expect(BYTES_TOKEN_GESTION * 8).toBeGreaterThanOrEqual(256);
    const generados = new Set(Array.from({ length: 500 }, () => generarTokenGestion()));
    expect(generados.size).toBe(500);
    for (const token of generados) {
      // base64url de 32 bytes sin relleno: 43 caracteres del alfabeto seguro.
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(token, "base64url")).toHaveLength(BYTES_TOKEN_GESTION);
    }
  });

  it("no se deriva del nombre, del identificador, del número ni de la fecha", () => {
    // La generación no recibe NINGÚN dato del negocio: su firma no admite
    // parámetros. Es la garantía estructural de que no se puede derivar.
    expect(generarTokenGestion.length).toBe(0);
    const fuente = readFileSync(
      path.join(raiz, "src/lib/gestion/token.ts"),
      "utf8",
    );
    expect(fuente).toContain("randomBytes");
  });

  it("la huella no permite recuperar el token", () => {
    const token = generarTokenGestion();
    const huella = huellaDeToken(token);
    expect(huella).toMatch(/^[0-9a-f]{64}$/);
    expect(huella).not.toContain(token);
    expect(token).not.toContain(huella);
    // Determinista, pero solo hacia adelante.
    expect(huellaDeToken(token)).toBe(huella);
    expect(huellaDeToken(`${token}x`)).not.toBe(huella);
  });

  it("un token alterado en un carácter da otra huella", () => {
    const token = generarTokenGestion();
    const alterado = `${token.slice(0, -1)}${token.at(-1) === "A" ? "B" : "A"}`;
    expect(alterado).not.toBe(token);
    expect(huellaDeToken(alterado)).not.toBe(huellaDeToken(token));
  });

  it("la comparación de huellas no usa === (tiempo constante)", () => {
    const fuente = readFileSync(path.join(raiz, "src/lib/gestion/token.ts"), "utf8");
    expect(fuente).toContain("timingSafeEqual");
    expect(huellasIguales("a".repeat(64), "a".repeat(64))).toBe(true);
    expect(huellasIguales("a".repeat(64), "b".repeat(64))).toBe(false);
    // Longitudes distintas: falso, sin lanzar (timingSafeEqual sí lanzaría).
    expect(huellasIguales("a".repeat(64), "a")).toBe(false);
  });

  it("generarEnlaceDeGestion devuelve el token y sus dos columnas", () => {
    const ahora = new Date("2026-09-04T12:00:00.000Z");
    const { token, columnas } = generarEnlaceDeGestion(ahora);
    expect(columnas.tokenGestionHash).toBe(huellaDeToken(token));
    expect(columnas.tokenGestionCreadoEn).toEqual(ahora);
    // El token en claro NO viaja dentro de lo que se escribe en la base.
    expect(JSON.stringify(columnas)).not.toContain(token);
  });

  describe("resolución del enlace", () => {
    const PUBLICADO = "publicado";

    it("busca por la huella, nunca por el token en claro", async () => {
      const token = generarTokenGestion();
      const espia = vi.fn();
      const cliente = clienteConFila(
        { id: "n1", tokenGestionHash: huellaDeToken(token), estado: PUBLICADO },
        espia,
      );

      expect(await negocioDelToken(cliente, token, PUBLICADO)).toEqual({ id: "n1" });

      const argumentos = JSON.stringify(espia.mock.calls[0][0]);
      expect(argumentos).toContain(huellaDeToken(token));
      expect(argumentos).not.toContain(token);
    });

    it.each([
      ["inventado con forma válida", "z".repeat(43)],
      ["vacío", ""],
      ["con barras", "abc/def"],
      ["gigantesco", "a".repeat(100_000)],
      ["con caracteres fuera del alfabeto", `${"a".repeat(42)}+`],
    ])("un token %s no resuelve nada", async (_caso, token) => {
      const cliente = clienteConFila(null);
      expect(await negocioDelToken(cliente, token, PUBLICADO)).toBeNull();
    });

    it("un token de un negocio que no está publicado no resuelve", async () => {
      const token = generarTokenGestion();
      const cliente = clienteConFila({
        id: "n2",
        tokenGestionHash: huellaDeToken(token),
        estado: "en_revision",
      });
      expect(await negocioDelToken(cliente, token, PUBLICADO)).toBeNull();
    });

    it("una fila sin huella (enlace nunca generado) no resuelve", async () => {
      const cliente = clienteConFila({
        id: "n3",
        tokenGestionHash: null,
        estado: PUBLICADO,
      });
      expect(await negocioDelToken(cliente, "z".repeat(43), PUBLICADO)).toBeNull();
    });

    it("un token con forma inválida ni siquiera consulta la base", async () => {
      const espia = vi.fn();
      const cliente = clienteConFila(null, espia);
      await negocioDelToken(cliente, "no-es-un-token", PUBLICADO);
      expect(espia).not.toHaveBeenCalled();
    });

    it("pareceToken solo acepta la forma exacta", () => {
      expect(pareceToken(generarTokenGestion())).toBe(true);
      expect(pareceToken("a".repeat(42))).toBe(false);
      expect(pareceToken("a".repeat(44))).toBe(false);
      expect(pareceToken("")).toBe(false);
    });
  });

  describe("la URL absoluta del enlace", () => {
    const original = process.env[VARIABLE_URL_SITIO];
    afterEach(() => {
      if (original === undefined) delete process.env[VARIABLE_URL_SITIO];
      else process.env[VARIABLE_URL_SITIO] = original;
    });

    it("sale de SITIO_URL y apunta a /editar/<token>", () => {
      process.env[VARIABLE_URL_SITIO] = "https://necesitouno.example";
      const token = generarTokenGestion();
      expect(construirEnlaceDeGestion(token)).toBe(
        `https://necesitouno.example/editar/${token}`,
      );
    });
  });
});

describe("gestion · el token nunca se escribe en el log", () => {
  it("el módulo del token no llama a console en ninguna rama", () => {
    const fuente = readFileSync(path.join(raiz, "src/lib/gestion/token.ts"), "utf8");
    expect(fuente).not.toMatch(/console\./);
  });
});
