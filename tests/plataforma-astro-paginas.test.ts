/**
 * Spec `plataforma-astro` (change `migrar-lectura-publica-astro`, T-023), las
 * páginas de la Fase 2a pintadas con la Container API:
 *
 * - "Las páginas públicas se arman con un documento base y un tronco
 *   medido…": "una página pública queda medida", "la 404 de una URL
 *   desconocida no se mide".
 * - "Los metadatos de cada página son los mismos que emitía Next": el `<head>`
 *   de cada página contra el capturado de la build de Next de `main`.
 * - "La 404 responde igual que en Next": "URL desconocida", "nada de la 404
 *   por defecto del marco".
 * - "Las páginas migradas no llevan JavaScript propio…": "cero JS propio".
 *
 * Lo que solo se ve en la salida construida (estado 404 servido, cabeceras,
 * estáticos) vive en `tests/plataforma-astro-build.test.ts`.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { extraerPagina } from "../scripts/diff-html/nucleo.mjs";
import NoExiste from "../src/pages/404.astro";
import ErrorDelServidor from "../src/pages/500.astro";
import AvisoDePrivacidad from "../src/pages/aviso-de-privacidad.astro";
import Home from "../src/pages/index.astro";
import Terminos from "../src/pages/terminos.astro";
import { VARIABLE_SRC, VARIABLE_WEBSITE_ID } from "../src/lib/analitica/config";
import { cabezaDe, contenidoDelMain, pintarPagina } from "./astro-paginas";
import { crearClientePrueba } from "./db";

const raiz = join(__dirname, "..");
const SRC = "https://cloud.umami.is/script.js";
const ID_SITIO = "00000000-0000-4000-8000-000000000000";

const PAGINAS = [
  ["home", Home, "/"],
  ["aviso-de-privacidad", AvisoDePrivacidad, "/aviso-de-privacidad"],
  ["terminos", Terminos, "/terminos"],
  ["404", NoExiste, "/a/b/c"],
] as const;

function conMedicion() {
  vi.stubEnv(VARIABLE_SRC, SRC);
  vi.stubEnv(VARIABLE_WEBSITE_ID, ID_SITIO);
}

beforeAll(async () => {
  const prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  await prisma.$disconnect();
});

afterEach(() => vi.unstubAllEnvs());
afterAll(() => vi.unstubAllEnvs());

const scripts = (html: string) => [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);

describe("plataforma-astro · una página pública queda medida", () => {
  for (const [nombre, Pagina, ruta] of PAGINAS.slice(0, 2)) {
    it(`${nombre}: documento es-MX con header, main y footer, y un solo script diferido del proveedor`, async () => {
      conMedicion();
      const html = await pintarPagina(Pagina, { ruta });
      expect(html).toMatch(/<html lang="es-MX" class="h-full antialiased">/);
      for (const etiqueta of ["<header", "<main", "<footer"]) expect(html, etiqueta).toContain(etiqueta);
      expect(scripts(html)).toEqual([
        `<script defer="" src="${SRC}" data-website-id="${ID_SITIO}" data-exclude-search="true">`,
      ]);
      // En la misma posición que en Next: dentro de <main>, después de la página.
      expect(contenidoDelMain(html).trimEnd()).toMatch(/<\/script>$/);
    });
  }

  it("la 404 de una URL desconocida no se mide aunque la medición esté configurada", async () => {
    conMedicion();
    const html = await pintarPagina(NoExiste, { ruta: "/a/b/c" });
    expect(html).toContain("<header");
    expect(html).toContain("<footer");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("umami");
  });
});

describe("plataforma-astro · metadatos iguales a los de Next, pintados por la página", () => {
  for (const [nombre, Pagina, ruta] of PAGINAS) {
    it(`${nombre}: mismo título, <meta> y <link> que la build de Next`, async () => {
      vi.stubEnv("SITIO_URL", "https://enmirumbo.example");
      const html = await pintarPagina(Pagina, { ruta });
      const fixture = readFileSync(join(raiz, "tests/fixtures/next-head/con-sitio-url", `${nombre}.html`), "utf8");
      const conjunto = (head: string) => {
        const { titulo, metas, enlacesDelHead } = extraerPagina(`<html><head>${head}</head><body></body></html>`);
        return { titulo, metas, enlaces: enlacesDelHead.filter((e: string) => !e.includes("stylesheet")) };
      };
      expect(conjunto(cabezaDe(html))).toEqual(conjunto(fixture));
    });
  }
});

describe("plataforma-astro · la 404 responde igual que en Next", () => {
  it("encabezado, frase y un único enlace 'Ir al inicio' hacia /, dentro del header y el footer", async () => {
    const html = await pintarPagina(NoExiste, { ruta: "/no-existe" });
    const main = contenidoDelMain(html);
    expect(main).toMatch(/<h1[^>]*>No encontramos esta página<\/h1>/);
    expect(main).toContain("A lo mejor el negocio ya no está publicado o la dirección quedó mal escrita.");
    expect([...main.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g)].map((m) => [m[1], m[2]])).toEqual([
      ["/", "Ir al inicio"],
    ]);
    expect(html.indexOf("<header")).toBeLessThan(html.indexOf("<main"));
    expect(html.indexOf("</main>")).toBeLessThan(html.indexOf("<footer"));
  });

  it("pide no indexarse", async () => {
    const html = await pintarPagina(NoExiste, { ruta: "/no-existe" });
    expect(cabezaDe(html)).toContain('<meta name="robots" content="noindex">');
  });

  it("nada de la 404 por defecto del marco: ni inglés, ni el nombre del marco, ni trazas", async () => {
    const html = await pintarPagina(NoExiste, { ruta: "/no-existe" });
    const texto = html.replace(/<[^>]+>/g, " ");
    for (const prohibido of [/not found/i, /astro/i, /next\.?js/i, /error/i, /stack/i, /\bat\s+\S+\s+\(/, /\bpage\b/i]) {
      expect(texto, String(prohibido)).not.toMatch(prohibido);
    }
  });
});

// Hallazgo M1 (c-seguridad.md): sin esta página, Astro mandaba un 500 vacío
// FUERA del middleware y sin las cuatro cabeceras. Lo servido (estado y
// cabeceras) lo prueba `tests/astro-seguridad-adversarial.test.ts`.
describe("plataforma-astro · el 500 es una página en español", () => {
  it("encabezado, frase y un único enlace 'Ir al inicio' hacia /, dentro del header y el footer", async () => {
    const html = await pintarPagina(ErrorDelServidor, { ruta: "/" });
    const main = contenidoDelMain(html);
    expect(html).toMatch(/<html lang="es-MX" class="h-full antialiased">/);
    expect(main).toMatch(/<h1[^>]*>Algo falló de nuestro lado<\/h1>/);
    expect(main).toContain("No es tu culpa. Espera un ratito y vuelve a intentarlo.");
    expect([...main.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g)].map((m) => [m[1], m[2]])).toEqual([
      ["/", "Ir al inicio"],
    ]);
    expect(html.indexOf("<header")).toBeLessThan(html.indexOf("<main"));
    expect(html.indexOf("</main>")).toBeLessThan(html.indexOf("<footer"));
  });

  it("pide no indexarse y no se mide aunque la medición esté configurada", async () => {
    conMedicion();
    const html = await pintarPagina(ErrorDelServidor, { ruta: "/" });
    expect(cabezaDe(html)).toContain('<meta name="robots" content="noindex">');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("umami");
  });

  it("no pinta el error que recibe: ni mensaje, ni traza, ni la dirección de la base", async () => {
    const error = new Error("postgresql://usuario:claveFicticia@127.0.0.1:1/ninguna");
    const html = await pintarPagina(ErrorDelServidor, { ruta: "/", props: { error } });
    const texto = html.replace(/<[^>]+>/g, " ");
    for (const prohibido of [/claveFicticia/, /postgres/i, /127\.0\.0\.1/, /astro/i, /error/i, /stack/i, /\bat\s+\S+\s+\(/, /internal server/i]) {
      expect(html.includes("claveFicticia"), "html crudo").toBe(false);
      expect(texto, String(prohibido)).not.toMatch(prohibido);
    }
  });
});

describe("plataforma-astro · cero JS propio", () => {
  for (const [nombre, Pagina, ruta] of PAGINAS) {
    it(`${nombre}: sin <script>, sin modulepreload ni islas, sin la medición configurada`, async () => {
      const html = await pintarPagina(Pagina, { ruta });
      expect(scripts(html).filter((s) => !s.includes('type="application/ld+json"'))).toEqual([]);
      expect(html).not.toContain("modulepreload");
      expect(html).not.toContain("astro-island");
    });
  }
});

// Scenario "ninguna directiva de cliente": nada de `src/pages/`, `src/layouts/`
// ni de los componentes `.astro` de `src/astro/` se hidrata en el navegador.
const DIRECTIVA_DE_CLIENTE = /\sclient:[a-zA-Z]+/;

function archivosAstro(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return archivosAstro(ruta);
    return /\.(astro|tsx?|jsx?)$/.test(e.name) ? [ruta] : [];
  });
}

/** Archivos con una directiva `client:` (fuera de comentarios). */
export function conDirectivaDeCliente(archivos: string[]): string[] {
  return archivos.filter((ruta) => {
    const codigo = readFileSync(ruta, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/<!--[\s\S]*?-->/g, "");
    return DIRECTIVA_DE_CLIENTE.test(codigo);
  });
}

describe("plataforma-astro · ninguna directiva de cliente", () => {
  it("no aparece client: en src/pages, src/layouts ni src/astro", () => {
    const archivos = ["src/pages", "src/layouts", "src/astro"].flatMap((d) => archivosAstro(join(raiz, d)));
    expect(archivos.filter((a) => a.endsWith(".astro")).length).toBeGreaterThanOrEqual(7);
    expect(conDirectivaDeCliente(archivos).map((a) => a.slice(raiz.length + 1))).toEqual([]);
  });

  it("el guardián sí ve una directiva puesta a propósito", () => {
    const fixture = join(raiz, "tests/fixtures/humo-client.astro");
    expect(conDirectivaDeCliente([fixture])).toEqual([fixture]);
  });
});

