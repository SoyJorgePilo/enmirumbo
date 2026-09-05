import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  DIRECTORIO_FOTOS_DEFAULT,
  crearAlmacenLocal,
  directorioDeFotos,
  type AlmacenFotos,
} from "../src/lib/fotos/almacen";
import {
  esClaveFotoValida,
  esVarianteFoto,
  generarClaveFoto,
  VARIANTES_FOTO,
} from "../src/lib/fotos/clave";
import { urlDeFoto } from "../src/lib/fotos/url";

// Spec: registro-negocio ("La foto se guarda comprimida, sin metadatos y con
// una referencia que genera el servidor"), modelo-datos ("El modelo Negocio
// cubre los campos del registro", scenario "la referencia de la foto no es una
// URL") y directorio-publico ("Solo se pinta la foto que generó el servidor").
// tasks.md #3, #4 y #9.

const BYTES = Buffer.from("bytes de una foto de mentiras");

let directorio: string;
let almacen: AlmacenFotos;

beforeAll(async () => {
  directorio = await mkdtemp(join(tmpdir(), "enmirumbo-fotos-"));
  almacen = crearAlmacenLocal(directorio);
});

afterAll(async () => {
  await rm(directorio, { recursive: true, force: true });
});

describe("almacén local de fotos (puerto + adaptador, design.md §1)", () => {
  it("guarda, lee y borra por clave y variante", async () => {
    const clave = generarClaveFoto();
    await almacen.guardar(clave, "tarjeta", BYTES);
    await almacen.guardar(clave, "ficha", BYTES);

    expect(await almacen.leer(clave, "tarjeta")).toEqual(BYTES);
    expect(await almacen.leer(clave, "ficha")).toEqual(BYTES);

    await almacen.borrar(clave);

    expect(await almacen.leer(clave, "tarjeta")).toBeNull();
    expect(await almacen.leer(clave, "ficha")).toBeNull();
  });

  it("leer una clave que no existe devuelve null, no un error", async () => {
    expect(await almacen.leer(generarClaveFoto(), "tarjeta")).toBeNull();
  });

  // Scenario "borrado con el archivo ya ausente" (spec modelo-datos)
  it("borrar una clave inexistente no truena", async () => {
    await expect(almacen.borrar(generarClaveFoto())).resolves.toBeUndefined();
  });

  it("borrar se lleva TODAS las variantes de esa clave y ninguna otra", async () => {
    const unaClave = generarClaveFoto();
    const otraClave = generarClaveFoto();
    for (const variante of VARIANTES_FOTO) {
      await almacen.guardar(unaClave, variante, BYTES);
      await almacen.guardar(otraClave, variante, BYTES);
    }

    await almacen.borrar(unaClave);

    const archivos = await readdir(directorio);
    expect(archivos.filter((nombre) => nombre.includes(unaClave))).toHaveLength(0);
    expect(archivos.filter((nombre) => nombre.includes(otraClave))).toHaveLength(
      VARIANTES_FOTO.length,
    );
    await almacen.borrar(otraClave);
  });

  // Ninguna ruta escrita puede salirse del directorio configurado.
  it.each([
    ["ruta relativa hacia arriba", "../fuera-del-almacen"],
    ["ruta relativa doble", "../../etc/passwd"],
    ["ruta absoluta", "/etc/passwd"],
    ["separador de directorio", "sub/clave"],
    ["cadena vacía", ""],
    ["byte nulo", "clave\u0000.png"],
  ])("guardar con %s se rechaza y no escribe nada", async (_caso, clave) => {
    const antes = await readdir(directorio);
    await expect(almacen.guardar(clave, "tarjeta", BYTES)).rejects.toThrow();
    expect(await readdir(directorio)).toEqual(antes);
  });

  it("leer y borrar con una clave hostil no salen del directorio", async () => {
    expect(await almacen.leer("../../etc/passwd", "tarjeta")).toBeNull();
    await expect(almacen.borrar("../../etc/passwd")).resolves.toBeUndefined();
  });

  it("una variante inventada no se puede guardar ni leer", async () => {
    const clave = generarClaveFoto();
    await expect(
      // @ts-expect-error: probamos justo lo que el tipo prohíbe
      almacen.guardar(clave, "original", BYTES),
    ).rejects.toThrow();
    // @ts-expect-error: probamos justo lo que el tipo prohíbe
    expect(await almacen.leer(clave, "original")).toBeNull();
  });

  it("el directorio sale de FOTOS_DIR y por defecto es .fotos (fuera de git)", () => {
    expect(directorioDeFotos({ FOTOS_DIR: "/tmp/fotos-de-prueba" })).toBe(
      "/tmp/fotos-de-prueba",
    );
    expect(directorioDeFotos({})).toContain(DIRECTORIO_FOTOS_DEFAULT);
    expect(DIRECTORIO_FOTOS_DEFAULT).toBe(".fotos");
  });
});

describe("clave opaca de la foto (design.md §4)", () => {
  // Scenario "la referencia de la foto no es una URL"
  it("dos claves seguidas nunca son iguales", () => {
    const claves = new Set(Array.from({ length: 200 }, () => generarClaveFoto()));
    expect(claves.size).toBe(200);
  });

  it("no lleva esquema de URL, ni dominio, ni ruta, ni el nombre del negocio", () => {
    const clave = generarClaveFoto();
    expect(clave).toMatch(/^[0-9a-f]{32}$/);
    expect(clave).not.toContain(":");
    expect(clave).not.toContain("/");
    expect(clave).not.toContain(".");
    expect(clave.toLowerCase()).not.toContain("tortilleria");
  });

  it.each([
    ["ruta relativa", "../secreto"],
    ["data:", "data:image/svg+xml,<svg onload=alert(1)>"],
    ["https", "https://evil.example/pixel.png"],
    ["javascript:", "javascript:alert(1)"],
    ["ruta absoluta", "/etc/passwd"],
    ["cadena vacía", ""],
    ["mayúsculas fuera del alfabeto", "ABCDEF0123456789ABCDEF0123456789"],
    ["muy corta", "abc123"],
  ])("%s no es una clave válida", (_caso, valor) => {
    expect(esClaveFotoValida(valor)).toBe(false);
  });

  it("una clave recién generada sí es válida", () => {
    expect(esClaveFotoValida(generarClaveFoto())).toBe(true);
  });

  it("solo 'tarjeta' y 'ficha' son variantes", () => {
    expect(VARIANTES_FOTO).toEqual(["tarjeta", "ficha"]);
    expect(esVarianteFoto("tarjeta")).toBe(true);
    expect(esVarianteFoto("ficha")).toBe(true);
    expect(esVarianteFoto("original")).toBe(false);
    expect(esVarianteFoto("../ficha")).toBe(false);
    expect(esVarianteFoto(null)).toBe(false);
  });
});

describe("validador de render: solo se pinta lo que generó el servidor (M1)", () => {
  it.each([
    ["URL externa", "https://evil.example/pixel.png"],
    ["data: con SVG", "data:image/svg+xml,<svg onload=alert(1)>"],
    ["javascript:", "javascript:alert(1)"],
    ["ruta con ..", "../../etc/passwd"],
    ["ruta absoluta", "/etc/passwd"],
    ["cadena vacía", ""],
    ["nulo", null],
    ["indefinido", undefined],
    ["número", 42],
  ])("%s se comporta como si no hubiera foto", (_caso, guardado) => {
    expect(urlDeFoto(guardado, "tarjeta")).toBeNull();
    expect(urlDeFoto(guardado, "ficha")).toBeNull();
    expect(urlDeFoto(guardado, "tarjeta", "panel")).toBeNull();
  });

  it("una clave válida devuelve la ruta interna que construye el servidor", () => {
    const clave = generarClaveFoto();
    expect(urlDeFoto(clave, "tarjeta")).toBe(`/api/foto/${clave}/tarjeta`);
    expect(urlDeFoto(clave, "ficha")).toBe(`/api/foto/${clave}/ficha`);
    expect(urlDeFoto(clave, "ficha", "panel")).toBe(`/admin/foto/${clave}/ficha`);
  });
});
