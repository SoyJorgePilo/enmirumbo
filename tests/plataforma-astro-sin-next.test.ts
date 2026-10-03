/**
 * Spec `plataforma-astro` (change `migrar-tareas-programadas-astro`, Fase 6a;
 * tasks.md #6): requirements "`next` ya no viaja en la función de Astro" y "La
 * mitad 6a no pierde dureza ni altera producto" (guardianes).
 *
 * Medido antes del change (b-dev): 62 archivos bajo `node_modules/next/` en
 * `_render.func`, que entraban porque el middleware importa
 * `src/lib/tareas/secreto.ts` para el aviso de arranque y ese módulo importaba
 * `next/navigation`. Este guardián lo fija en 0 venga de donde venga.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { construirSiHaceFalta } from "./salida-astro";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const funcion = path.join(raiz, ".vercel/output/functions/_render.func");
const leer = (relativa: string) => readFileSync(path.join(raiz, relativa), "utf8");

function listar(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = path.join(dir, nombre);
    return statSync(ruta).isDirectory() ? listar(ruta) : [ruta];
  });
}

/** Una IMPORTACIÓN de `next` o `next/…` (no una mención en un comentario). */
const IMPORTA_NEXT = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["']next(?:\/[^"']*)?["']/;

/** El código sin sus comentarios (`/** … *\/`, `/* … *\/` y `// …` de línea entera). */
const sinComentarios = (fuente: string) =>
  fuente
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .join("\n");

const ENDPOINTS = ["src/pages/api/tareas/purgar-rechazados.ts", "src/pages/api/tareas/barrer-fotos-huerfanas.ts"];

describe("next ya no viaja en la función de Astro", () => {
  beforeAll(() => {
    construirSiHaceFalta();
  }, 300_000);

  it("la función existe y no trae ningún archivo bajo node_modules/next/", () => {
    expect(existsSync(path.join(funcion, ".vc-config.json"))).toBe(true);
    const deNext = listar(funcion).filter((f) => f.split(path.sep).join("/").includes("/node_modules/next/"));
    expect(deNext.map((f) => path.relative(funcion, f))).toEqual([]);
  });

  it("ningún módulo de la función importa next/*", () => {
    const modulos = listar(funcion).filter((f) => /\.(m?js|cjs)$/.test(f));
    expect(modulos.length).toBeGreaterThan(10);
    const culpables = modulos.filter((f) => IMPORTA_NEXT.test(readFileSync(f, "utf8")));
    expect(culpables.map((f) => path.relative(funcion, f))).toEqual([]);
  });

  it("ningún trazado (.nft.json) de la salida nombra a next", () => {
    const trazados = listar(path.join(raiz, ".vercel/output")).filter((f) => f.endsWith(".nft.json"));
    for (const f of trazados) expect(readFileSync(f, "utf8"), f).not.toMatch(/node_modules\/next\//);
  });

  it("el patrón detecta una importación y no una mención", () => {
    expect(IMPORTA_NEXT.test('import { notFound } from "next/navigation.js";')).toBe(true);
    expect(IMPORTA_NEXT.test("const m = await import('next/dist/x.js')")).toBe(true);
    expect(IMPORTA_NEXT.test('require("next")')).toBe(true);
    expect(IMPORTA_NEXT.test("* (`node_modules/next/dist/lib/metadata/resolve-url.js`)")).toBe(false);
  });
});

describe("guardianes de las tareas programadas en Astro", () => {
  it("src/lib/tareas/secreto.ts no importa nada de next y conserva timingSafeEqual y sus cuatro exports", () => {
    const fuente = leer("src/lib/tareas/secreto.ts");
    expect(fuente).not.toMatch(IMPORTA_NEXT);
    expect(fuente).toMatch(/import \{ timingSafeEqual \} from "node:crypto";/);
    expect(fuente).toMatch(/return timingSafeEqual\(recibido, esperado\);/);
    for (const firma of [
      'export const VARIABLE_SECRETO_TAREAS = "CRON_SECRET";',
      "export function secretoDeTareaCorrecto(\n  encabezado: string | null,\n  secreto: string,\n): boolean {",
      "export function avisarSinSecretoDeTareasUnaVez(\n  env: Record<string, string | undefined> = process.env,\n): void {",
      "export function reiniciarAvisoDeSecretoDeTareas(): void {",
    ]) {
      expect(fuente).toContain(firma);
    }
    expect(fuente).not.toContain("respuestaDeTareaNoExistente");
  });

  it("el 404 de las tareas vive en un solo lugar (src/astro/tareas.ts); ni los endpoints ni secreto.ts fabrican uno", () => {
    const tareas = leer("src/astro/tareas.ts");
    expect(tareas.match(/status:\s*404/g)).toHaveLength(1);
    for (const archivo of [...ENDPOINTS, "src/lib/tareas/secreto.ts"]) {
      const fuente = leer(archivo);
      expect(fuente, archivo).not.toMatch(/status:\s*404/);
      expect(fuente, archivo).not.toMatch(/"Not Found"/);
    }
  });

  it("la puerta es la primera sentencia de cada GET, y los endpoints no leen ni comparan el secreto por su cuenta", () => {
    for (const archivo of ENDPOINTS) {
      const fuente = sinComentarios(leer(archivo));
      expect(fuente, archivo).toMatch(/export const GET: APIRoute = async \(\{ request \}\) => \{\n\s+if \(!tareaAutorizada\(request\)\) return respuestaDeTareaNoExistente\(\);\n/);
      expect(fuente, archivo).toMatch(/export const prerender = false;/);
      expect(fuente, archivo).toMatch(/export const HEAD: APIRoute = /);
      expect(fuente, archivo).toMatch(/export const ALL: APIRoute = \(\) => respuestaDeTareaNoExistente\(\);/);
      expect(fuente, archivo).not.toMatch(/authorization|CRON_SECRET|VARIABLE_SECRETO_TAREAS|secretoDeTareaCorrecto/i);
    }
  });

  it("src/astro/tareas.ts no compara el secreto con ===, startsWith ni includes: delega en secretoDeTareaCorrecto", () => {
    const fuente = sinComentarios(leer("src/astro/tareas.ts"));
    expect(fuente).toContain("secretoDeTareaCorrecto(");
    expect(fuente).not.toMatch(/===|!==|startsWith|endsWith|includes\(|localeCompare/);
    expect(fuente).not.toMatch(IMPORTA_NEXT);
  });
});
