/**
 * Pruebas adversariales de seguridad del change `migrar-lectura-publica-astro`
 * (T-023, Fase 2a; etapa C, ver `reports/c-seguridad.md`). Cubren lo que el
 * camino feliz del dev no mira:
 *
 * - la exclusión de la medición, mirada desde el otro lado: una pantalla del
 *   panel o del enlace de gestión en `src/pages/` NUNCA lleva el tronco medido
 *   ni el script, aunque declare un motivo (el guardián del dev solo exige que
 *   las exclusiones estén escritas, no que lo privado quede fuera);
 * - el escape de los metadatos en el render REAL de `DocumentoBase.astro`
 *   (la prueba del dev escapa con `etiquetasAHtml`, que es solo de pruebas);
 * - el middleware ante estados, tipos y cabeceras que no son el caso típico;
 * - la tabla de la CDN: ninguna ruta de cabeceras alcanza una ruta de la
 *   función (no puede pisar una política de referente más estricta) y los
 *   nombres de archivo con metacaracteres no abren patrones;
 * - la salida construida, servida por el emulador: métodos y codificaciones
 *   raras conservan las cuatro cabeceras, y las brechas que se documentaron
 *   con `it.fails` (500 con la base caída; 403 de `checkOrigin`, cerrada en
 *   T-024) ya son pruebas normales.
 *
 * Todos los datos son ficticios.
 */
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { parse } from "node-html-parser";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { rutasConCabecerasEnLaCdn } from "../src/astro/integraciones/cabeceras-en-la-cdn";
import DocumentoBase from "../src/layouts/DocumentoBase.astro";
import { cabecerasDeSeguridad } from "../src/lib/seguridad/csp";
import { cabezaDe, pintarPagina } from "./astro-paginas";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SEGURIDAD = cabecerasDeSeguridad();

// ── 1. Lo privado nunca se mide ─────────────────────────────────────────────

/** Segmentos de `src/pages/` que son del panel o del enlace de gestión. */
const SEGMENTOS_PRIVADOS = ["admin", "editar"];

function archivosAstro(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".astro"))
    .map((e) => path.join(e.parentPath, e.name));
}

function sinComentarios(fuente: string): string {
  return fuente
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/** Páginas privadas (panel, gestión) que traen el tronco medido o el script. */
export function paginasPrivadasMedidas(dirPages: string): string[] {
  return archivosAstro(dirPages)
    .filter((ruta) => SEGMENTOS_PRIVADOS.includes(path.relative(dirPages, ruta).split(path.sep)[0]))
    .filter((ruta) => /<TroncoPublico\b|ScriptAnalitica/.test(sinComentarios(readFileSync(ruta, "utf8"))))
    .map((ruta) => path.relative(dirPages, ruta))
    .sort();
}

describe("adversarial · el panel y el enlace de gestión nunca llevan la medición", () => {
  it("ninguna página de src/pages/admin ni src/pages/editar usa el tronco medido ni el script", () => {
    expect(paginasPrivadasMedidas(path.join(raiz, "src/pages"))).toEqual([]);
  });

  it("el guardián nombra la que usa el tronco y la que mete el script a mano aunque declare motivo", () => {
    expect(paginasPrivadasMedidas(path.join(raiz, "tests/fixtures/paginas-privadas-medidas"))).toEqual(
      [path.join("admin", "cola.astro"), path.join("editar", "[token].astro")].sort(),
    );
  });
});

// ── 2. Escape de los metadatos en el render real ────────────────────────────

describe("adversarial · DocumentoBase escapa los metadatos al pintarlos", () => {
  it("un título, una descripción y una canónica hostiles no abren etiquetas en el <head>", async () => {
    const documento = await pintarPagina(DocumentoBase, {
      props: {
        metadatos: {
          title: '</title><script>alert("t")</script>',
          description: '"><script>alert("d")</script><meta x="',
          alternates: { canonical: 'https://enmirumbo.example/x"><script>alert("c")</script>' },
          openGraph: { title: "<img src=x onerror=alert(1)>", images: [] },
        },
      },
      slots: { default: "<p>contenido ficticio</p>" },
    });
    // Astro deja `<` y `>` sin escapar DENTRO de un atributo entre comillas
    // (es HTML válido e inerte) y escapa la comilla: lo que importa es que el
    // árbol parseado no tenga elementos nuevos y que el texto llegue intacto.
    const cabeza = parse(`<head>${cabezaDe(documento)}</head>`);
    expect(cabeza.querySelectorAll("script, img")).toHaveLength(0);
    expect(cabeza.querySelectorAll("meta[x]")).toHaveLength(0);
    expect(cabeza.querySelectorAll("title")).toHaveLength(1);
    expect(cabeza.querySelector("title")!.textContent).toBe('</title><script>alert("t")</script> — EnMiRumbo');
    expect(cabeza.querySelector('meta[name="description"]')!.getAttribute("content")).toBe(
      '"><script>alert("d")</script><meta x="',
    );
    expect(cabeza.querySelector('link[rel="canonical"]')!.getAttribute("href")).toBe(
      'https://enmirumbo.example/x"><script>alert("c")</script>',
    );
    expect(cabeza.querySelector('meta[property="og:title"]')!.getAttribute("content")).toBe(
      "<img src=x onerror=alert(1)>",
    );
  });
});

// ── 3. Middleware ante lo atípico ───────────────────────────────────────────

type Middleware = (contexto: unknown, siguiente: () => Promise<Response>) => Promise<Response>;
const middleware = async () => (await import("../src/middleware")).onRequest as unknown as Middleware;
// Con la petición, `locals` y el patrón de ruta que trae Astro (el middleware
// los lee desde 3a, change `migrar-formularios-publicos-astro`): un GET.
const contexto = {
  isPrerendered: false,
  url: new URL("https://enmirumbo.example/"),
  request: new Request("https://enmirumbo.example/"),
  locals: {},
  routePattern: "/",
};

describe("adversarial · el middleware con respuestas atípicas", () => {
  it("un 500 que DEVUELVE la página (no que lanza) lleva las cuatro y no se cachea", async () => {
    const onRequest = await middleware();
    const r = await onRequest(contexto, async () =>
      new Response("<p>error</p>", { status: 500, headers: { "content-type": "text/html" } }),
    );
    expect(r.status).toBe(500);
    for (const { key, value } of SEGURIDAD) expect(r.headers.get(key), key).toBe(value);
    expect(r.headers.get("cache-control")).toContain("no-store");
  });

  it("un tipo HTML en mayúsculas o con parámetros sigue recibiendo el Cache-Control privado", async () => {
    const onRequest = await middleware();
    for (const tipo of ["TEXT/HTML", "text/html;charset=UTF-8"]) {
      const r = await onRequest(contexto, async () => new Response("<p>x</p>", { headers: { "content-type": tipo } }));
      expect(r.headers.get("cache-control"), tipo).toBe("private, no-cache, no-store, max-age=0, must-revalidate");
    }
  });

  it("una respuesta con cookie y sin Cache-Control propio no queda cacheable", async () => {
    const onRequest = await middleware();
    const r = await onRequest(contexto, async () =>
      new Response("<p>x</p>", { headers: { "content-type": "text/html", "set-cookie": "ficticia=1; HttpOnly" } }),
    );
    expect(r.headers.get("cache-control")).toMatch(/private/);
    expect(r.headers.get("cache-control")).toMatch(/no-store/);
  });

  it("un X-Powered-By que ponga una página se quita", async () => {
    const onRequest = await middleware();
    const r = await onRequest(contexto, async () =>
      new Response("x", { headers: { "content-type": "text/plain", "x-powered-by": "Astro" } }),
    );
    expect(r.headers.has("x-powered-by")).toBe(false);
  });

  it("una política de referente aún más estricta (no-referrer) tampoco se pisa", async () => {
    const onRequest = await middleware();
    const r = await onRequest(contexto, async () =>
      new Response("x", { headers: { "content-type": "text/html", "referrer-policy": "no-referrer" } }),
    );
    expect(r.headers.get("referrer-policy")).toBe("no-referrer");
  });
});

// ── 4. La tabla de la CDN ───────────────────────────────────────────────────

type Ruta = { src?: string; dest?: string; status?: number; headers?: Record<string, string>; handle?: string };

const TABLA: Ruta[] = [
  { handle: "filesystem" },
  { src: "^/robots\\.txt$", dest: "_render" },
  { src: "^/$", dest: "_render" },
  { src: "^/.*$", dest: "/404.html", status: 404 },
];

describe("adversarial · cabeceras de la CDN", () => {
  it("nombres de archivo con metacaracteres de regex solo casan consigo mismos", () => {
    const archivos = ["a+b(1).css", "x$.html", "[slug]/index.html", "punto.ico", "q?.txt"];
    const rutas = (rutasConCabecerasEnLaCdn(TABLA, archivos) as Ruta[]).filter((r) => r.headers && !r.dest);
    const casa = (url: string) => rutas.some((r) => new RegExp(r.src!).test(url));
    for (const exacto of ["/a+b(1).css", "/x$.html", "/[slug]/", "/punto.ico", "/q?.txt"]) {
      expect(casa(exacto), exacto).toBe(true);
    }
    for (const ajeno of ["/aab1.css", "/aaab(1).css", "/x.html", "/s/", "/puntoXico", "/q.txt", "/", "/robots.txt"]) {
      expect(casa(ajeno), ajeno).toBe(false);
    }
  });

  it("ningún patrón de un estático alcanza las rutas de la función (no pisa su Referrer-Policy)", () => {
    const archivos = ["index.html", "404.html", "robots.txt.html", "aviso-de-privacidad/index.html"];
    const rutas = (rutasConCabecerasEnLaCdn(TABLA, archivos) as Ruta[]).filter((r) => r.headers && !r.dest);
    for (const ruta of ["/robots.txt", "/sitemap.xml", "/admin", "/editar/token-ficticio"]) {
      expect(rutas.filter((r) => new RegExp(r.src!).test(ruta)).map((r) => r.src), ruta).toEqual([]);
    }
  });
});

// ── 5. La salida construida, servida como en Vercel ─────────────────────────

const salida = path.join(raiz, ".vercel/output");

function entornoDeBuild(): NodeJS.ProcessEnv {
  const heredado = Object.entries(process.env).filter(([clave]) => !clave.startsWith("VITEST"));
  return {
    ...Object.fromEntries(heredado),
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://nadie:nadie@127.0.0.1:1/ninguna",
  };
}

/** Base inalcanzable con una clave ficticia reconocible: no debe salir en ninguna respuesta. */
const CLAVE_FICTICIA = "claveFicticiaQueNoDebeSalir";
const BASE_CAIDA = `postgresql://usuario:${CLAVE_FICTICIA}@127.0.0.1:1/ninguna`;

async function levantarEmulador(puerto: number, databaseUrl: string): Promise<ChildProcess> {
  const proceso = spawn(process.execPath, [path.join(raiz, "scripts/servir-salida-vercel.mjs")], {
    cwd: raiz,
    env: { ...entornoDeBuild(), DATABASE_URL: databaseUrl, SITIO_URL: "https://enmirumbo.example", PORT: String(puerto) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise<void>((listo, falla) => {
    const tiempo = setTimeout(() => falla(new Error("el emulador no arrancó")), 30_000);
    proceso.stdout!.on("data", (d: Buffer) => {
      if (d.toString().includes("[emulador]")) {
        clearTimeout(tiempo);
        listo();
      }
    });
    proceso.on("exit", (codigo) => falla(new Error(`el emulador terminó (${codigo})`)));
  });
  return proceso;
}

const PUERTO_SANO = 47_000 + Math.floor(Math.random() * 500);
const PUERTO_CAIDO = 47_500 + Math.floor(Math.random() * 500);
const procesos: ChildProcess[] = [];

function lasCuatro(r: Response, etiqueta: string) {
  for (const { key, value } of SEGURIDAD) expect(r.headers.get(key), `${etiqueta} · ${key}`).toBe(value);
}

describe("adversarial · la salida construida ante métodos, codificaciones y fallas", () => {
  beforeAll(async () => {
    execFileSync(process.execPath, [path.join(raiz, "node_modules/astro/bin/astro.mjs"), "build"], {
      cwd: raiz,
      env: entornoDeBuild(),
      stdio: "pipe",
    });
    expect(existsSync(path.join(salida, "config.json"))).toBe(true);
    procesos.push(await levantarEmulador(PUERTO_SANO, process.env.DATABASE_URL ?? ""));
    procesos.push(await levantarEmulador(PUERTO_CAIDO, BASE_CAIDA));
  }, 180_000);

  afterAll(() => {
    for (const p of procesos) p.kill();
  });

  const sano = (ruta: string, init: RequestInit = {}) =>
    fetch(`http://127.0.0.1:${PUERTO_SANO}${ruta}`, { redirect: "manual", ...init });
  const caido = (ruta: string) => fetch(`http://127.0.0.1:${PUERTO_CAIDO}${ruta}`, { redirect: "manual" });

  it("métodos que no son GET conservan las cuatro (salvo el 403 de checkOrigin, abajo)", async () => {
    const casos: Array<[string, string, RequestInit]> = [
      ["HEAD /", "/", { method: "HEAD" }],
      ["OPTIONS /", "/", { method: "OPTIONS" }],
      ["POST /sitemap.xml json", "/sitemap.xml", { method: "POST", body: "{}", headers: { "content-type": "application/json" } }],
      ["DELETE /aviso-de-privacidad", "/aviso-de-privacidad", { method: "DELETE" }],
      ["POST /opengraph-image json", "/opengraph-image", { method: "POST", body: "{}", headers: { "content-type": "application/json" } }],
    ];
    for (const [etiqueta, ruta, init] of casos) lasCuatro(await sano(ruta, init), etiqueta);
  });

  it("codificaciones rotas, recorridos de ruta y rutas internas del marco conservan las cuatro", async () => {
    for (const ruta of ["/_server-islands/%ZZ", "/_server-islands/%E0%A4%A", "/%2e%2e/%2e%2e/etc/passwd", "/_image?href=https://ajeno.example/x.png", "/opengraph-image/", "/index.html"]) {
      const r = await sano(ruta);
      lasCuatro(r, ruta);
      expect(r.status, ruta).toBeGreaterThanOrEqual(400);
    }
  });

  it("la consulta de la URL no se refleja en la home", async () => {
    const html = await (await sano("/?q=%22%3E%3Cscript%3Eficticio()%3C/script%3E")).text();
    expect(html).not.toContain("ficticio()");
  });

  it("con la base caída, / y /sitemap.xml responden 500 sin traza ni la dirección de la base", async () => {
    for (const ruta of ["/", "/sitemap.xml"]) {
      const r = await caido(ruta);
      expect(r.status, ruta).toBe(500);
      const cuerpo = await r.text();
      expect(cuerpo, ruta).not.toContain(CLAVE_FICTICIA);
      expect(cuerpo, ruta).not.toMatch(/prisma|at\s+\S+\s+\(|127\.0\.0\.1/i);
    }
  });

  // Hallazgo M1 (c-seguridad.md), cerrado: el 500 de una página que LANZA lo
  // pinta `src/pages/500.astro`, que es dinámica y sí pasa por el middleware.
  it("[M1] con la base caída, el 500 lleva las cuatro cabeceras y no se cachea", async () => {
    for (const ruta of ["/", "/sitemap.xml"]) {
      const r = await caido(ruta);
      expect(r.status, ruta).toBe(500);
      lasCuatro(r, `500 ${ruta}`);
      expect(r.headers.get("cache-control"), ruta).toBe("private, no-cache, no-store, max-age=0, must-revalidate");
      expect(r.headers.get("x-powered-by"), ruta).toBeNull();
    }
  });

  it("[M1] el 500 es la página en español, sin medir y con noindex", async () => {
    const r = await caido("/");
    expect(r.headers.get("content-type")).toBe("text/html; charset=utf-8");
    const html = await r.text();
    expect(html).toContain('<html lang="es-MX"');
    expect(html).toContain("Algo falló de nuestro lado");
    expect(html).toContain('<meta name="robots" content="noindex"');
    expect(html).not.toMatch(/umami|data-website-id/i);
    expect(html).not.toContain(CLAVE_FICTICIA);
    expect(html).not.toMatch(/prisma|DATABASE_URL|stack|at\s+\S+\s+\(|127\.0\.0\.1|Error:/i);
  });

  // Brecha cerrada en T-024 (change `migrar-formularios-publicos-astro`):
  // `checkOrigin` de Astro está apagado y el 403 lo arma el middleware con la
  // regla de Next. Antes aquí se exigía que el 403 en inglés midiera menos de
  // 80 caracteres; ahora se exige algo más estricto: la página en español sin
  // NADA de la petición (ni el Origin, ni el host, ni la ruta, ni el cuerpo).
  it("[T-024] el 403 de origen es la página en español y no repite nada de la petición", async () => {
    const r = await sano("/", {
      method: "POST",
      body: "a=1&marcadoreco=Zq9ficticio",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://ajeno.example" },
    });
    expect(r.status).toBe(403);
    const html = await r.text();
    expect(html).toContain("No pudimos recibir tu envío");
    for (const eco of ["ajeno.example", "Zq9ficticio", "marcadoreco", "127.0.0.1", "Cross-site", "forbidden"]) {
      expect(html, eco).not.toContain(eco);
    }
  });

  it("[T-024] el 403 de origen lleva las cuatro cabeceras", async () => {
    const r = await sano("/", {
      method: "POST",
      body: "a=1",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://ajeno.example" },
    });
    lasCuatro(r, "403 /");
  });
});
