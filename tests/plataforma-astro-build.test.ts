/**
 * Spec `plataforma-astro` (change `agregar-andamio-astro`, T-022): los
 * scenarios que se verificaban a mano sobre la salida del build, y el cierre
 * de `/_image` (hallazgo Medio 1 de `reports/c-seguridad.md`).
 *
 * - "el build no es el de Next": no se genera `.next/` y ninguna ruta de la
 *   salida proviene de `src/app/`.
 * - "el certificado viaja con la función".
 * - "ningún componente importa Next" (no necesita build).
 * - `/_image` no existe: ni en la tabla de rutas de Vercel ni como relevo
 *   dentro de la función (antes reenviaba rutas del mismo sitio con la cookie
 *   de quien pedía y las marcaba como caché pública de un año).
 *
 * El build de Astro tarda un par de segundos, así que la prueba lo corre ella
 * misma (sin base alcanzable, como el CI) en vez de fiarse de una salida vieja.
 *
 * Desde el change `migrar-lectura-publica-astro` (T-023, tasks.md #9, #10 y
 * #14), además, sobre la salida servida por `scripts/servir-salida-vercel.mjs`
 * (el emulador del Build Output API):
 *
 * - "cero JS propio": el HTML de `/`, legales y 404, sin `<script>` (salvo
 *   datos), `modulepreload` ni `astro-island`;
 * - "las cuatro en todas partes": las cuatro cabeceras de seguridad en cada
 *   ruta del alcance, y ninguna que anuncie el marco;
 * - "nada se renderiza por petición": `/opengraph-image` es un estático y la
 *   función no lleva el generador de imágenes;
 * - las cabeceras de la CDN están en el `config.json` construido.
 */
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { sembrarNegociosDemo } from "../prisma/seed-demo";
import { medidasPng } from "../scripts/diff-html/nucleo.mjs";
import { construirSegmentoFicha } from "../src/lib/ficha-url";
import { cabecerasDeSeguridad } from "../src/lib/seguridad/csp";
import { crearClientePrueba } from "./db";
import { borrarNegociosSembrados, WHATSAPP_DEMO } from "./limpieza";
import { levantarEmulador as levantarEmuladorDeSalida } from "./salida-astro";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const salida = path.join(raiz, ".vercel/output");
const funcion = path.join(salida, "functions/_render.func");
const CERTIFICADO = "certs/supabase-root-2021-ca.crt";

/** Todos los archivos bajo `dir` (rutas relativas); vacío si no existe. */
function listar(dir: string, base = dir): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = path.join(dir, nombre);
    return statSync(ruta).isDirectory() ? listar(ruta, base) : [path.relative(base, ruta)];
  });
}

/** Entorno del build: el de la terminal, sin las marcas de Vitest. */
function entornoDeBuild(): NodeJS.ProcessEnv {
  const heredado = Object.entries(process.env).filter(([clave]) => !clave.startsWith("VITEST"));
  return {
    ...Object.fromEntries(heredado),
    // Vitest pone `test`; `astro build` construye en modo producción.
    NODE_ENV: "production",
    // Igual que el CI: si algo consulta la base al construir, revienta.
    DATABASE_URL: "postgresql://nadie:nadie@127.0.0.1:1/ninguna",
  };
}

let nextAntes: string[] = [];
let nextDespues: string[] = [];

beforeAll(() => {
  nextAntes = listar(path.join(raiz, ".next"));
  try {
    execFileSync(process.execPath, [path.join(raiz, "node_modules/astro/bin/astro.mjs"), "build"], {
      cwd: raiz,
      env: entornoDeBuild(),
      stdio: "pipe",
    });
  } catch (error) {
    const salidaError = (error as { stderr?: Buffer; stdout?: Buffer });
    throw new Error(
      "`astro build` falló dentro de la prueba:\n" +
        `${salidaError.stdout?.toString() ?? ""}\n${salidaError.stderr?.toString() ?? ""}`,
    );
  }
  nextDespues = listar(path.join(raiz, ".next"));
}, 120_000);

type Ruta = { src?: string; dest?: string; handle?: string };
const rutasDeVercel = (): Ruta[] =>
  (JSON.parse(readFileSync(path.join(salida, "config.json"), "utf8")) as { routes: Ruta[] }).routes;

/**
 * Los `component` de las rutas que la función lleva en su manifiesto. Desde
 * 3a (el middleware importa la tabla de Actions) el empaquetador puede dejar
 * el manifiesto en un trozo compartido en vez de en `entry.mjs`: se lee de
 * los dos sitios.
 */
function componentesDeLaFuncion(): string[] {
  const servidor = path.join(funcion, "dist/server");
  const archivos = ["entry.mjs", ...listar(path.join(servidor, "chunks")).map((f) => path.join("chunks", f))];
  return archivos.flatMap((archivo) =>
    [...readFileSync(path.join(servidor, archivo), "utf8").matchAll(/"component":"([^"]*)"/g)].map((m) => m[1]),
  );
}

/**
 * Pide `ruta` al handler YA CONSTRUIDO de la función, en un proceso aparte,
 * con la cookie de sesión del admin (ficticia) y con `fetch` interceptado: si
 * el servidor intenta pedirse algo a sí mismo, queda registrado y responde con
 * HTML "del panel".
 */
function pedirAlHandler(ruta: string): { status: number; cacheControl: string | null; relevos: string[] } {
  const script = `
    import { pathToFileURL } from "node:url";
    const relevos = [];
    globalThis.fetch = async (url) => {
      relevos.push(String(url));
      return new Response("<html>panel ficticio</html>", { headers: { "content-type": "text/html" } });
    };
    const { default: handler } = await import(pathToFileURL(process.argv[1]).href);
    const respuesta = await handler.fetch(new Request("https://sitio.example" + process.argv[2], {
      headers: { cookie: "sesion_admin=ficticia" },
    }));
    console.log(JSON.stringify({
      status: respuesta.status,
      cacheControl: respuesta.headers.get("cache-control"),
      relevos,
    }));
  `;
  const salidaProceso = execFileSync(
    process.execPath,
    ["--input-type=module", "-e", script, path.join(funcion, "dist/server/entry.mjs"), ruta],
    { cwd: funcion, env: entornoDeBuild(), stdio: ["ignore", "pipe", "pipe"] },
  ).toString();
  const ultima = salidaProceso.trim().split("\n").at(-1) ?? "";
  return JSON.parse(ultima) as { status: number; cacheControl: string | null; relevos: string[] };
}

describe("plataforma-astro · el build no es el de Next", () => {
  it("el build no crea ni toca nada en .next/", () => {
    // `.next/types/` puede existir: lo deja `next typegen` (npm run typecheck),
    // no el build. Lo que importa es que el build no agregue nada.
    expect(nextDespues).toEqual(nextAntes);
    expect(nextDespues.some((f) => f === "BUILD_ID" || f.startsWith("server/"))).toBe(false);
  });

  it("deja la salida para Vercel", () => {
    expect(existsSync(path.join(salida, "config.json"))).toBe(true);
    expect(existsSync(path.join(funcion, "dist/server/entry.mjs"))).toBe(true);
  });

  it("ninguna ruta de la función proviene de src/app/", () => {
    const componentes = componentesDeLaFuncion();
    expect(componentes.length).toBeGreaterThan(0);
    expect(componentes.filter((c) => c.startsWith("src/app/"))).toEqual([]);
  });
});

describe("plataforma-astro · el certificado viaja con la función", () => {
  it("certs/supabase-root-2021-ca.crt está en la raíz del paquete, igual al del repo", () => {
    const enFuncion = path.join(funcion, CERTIFICADO);
    expect(existsSync(enFuncion), `falta ${CERTIFICADO} en la función: revisa includeFiles`).toBe(true);
    expect(readFileSync(enFuncion)).toEqual(readFileSync(path.join(raiz, CERTIFICADO)));
  });

  it("el handler se resuelve desde la raíz del paquete (donde `sslrootcert` busca)", () => {
    const vc = JSON.parse(readFileSync(path.join(funcion, ".vc-config.json"), "utf8")) as {
      handler: string;
    };
    expect(vc.handler).toBe("dist/server/entry.mjs");
  });
});

describe("plataforma-astro · /_image no existe (Medio 1 de seguridad)", () => {
  it("la tabla de rutas de Vercel no tiene /_image", () => {
    const fuentes = rutasDeVercel().map((r) => r.src ?? "");
    expect(fuentes.filter((src) => src.includes("_image"))).toEqual([]);
  });

  it("la función no lleva el endpoint genérico de imágenes de Astro", () => {
    expect(componentesDeLaFuncion()).not.toContain("node_modules/astro/dist/assets/endpoint/generic.js");
  });

  it("/_image?href=/admin/negocios con la cookie del admin: 404, sin relevo y sin caché pública", () => {
    const respuesta = pedirAlHandler("/_image?href=/admin/negocios");
    expect(respuesta.status).toBe(404);
    expect(respuesta.relevos).toEqual([]);
    expect(respuesta.cacheControl ?? "").not.toContain("public");
  });

  it("responde igual que una ruta que no existe", () => {
    // Desde la Fase 2b un solo segmento (`/ruta-que-no-existe`) ya no es "una
    // ruta que no existe": lo resuelve `[destino]` contra la base, y este
    // handler corre sin base (500). La ruta que no existe se pide con varios
    // segmentos, que ninguna página casa (change `migrar-directorio-publico-astro`).
    const inexistente = pedirAlHandler("/ruta/que/no-existe");
    expect(inexistente.status).toBe(404);
    const imagen = pedirAlHandler("/_image?href=/admin/negocios&w=10&f=webp");
    expect(imagen.status).toBe(inexistente.status);
    expect(imagen.relevos).toEqual([]);
  });
});

describe("plataforma-astro · ningún componente importa Next", () => {
  const archivos = listar(path.join(raiz, "src/components"))
    .filter((f) => /\.(tsx?|jsx?|mjs|astro)$/.test(f))
    .map((f) => path.join(raiz, "src/components", f));

  it("hay componentes que revisar", () => {
    expect(archivos.length).toBeGreaterThan(0);
  });

  it("no aparece next/link ni next/image en src/components/", () => {
    const culpables = archivos.filter((f) => /["']next\/(link|image)["']/.test(readFileSync(f, "utf8")));
    expect(culpables.map((f) => path.relative(raiz, f))).toEqual([]);
  });
});

// ── Fase 2a (change `migrar-lectura-publica-astro`) ─────────────────────────

const URL_PUBLICA = "https://enmirumbo.example";
const PUERTO = 46_000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PUERTO}`;
let emulador: ChildProcess | undefined;

// Los negocios demo (y sus fotos) que siembra el `beforeAll` de abajo viven en
// la base compartida: se borran al terminar el ARCHIVO, no el `describe`,
// porque el de 2b también los usa (hallazgo A1 de d-validacion.md).
afterAll(async () => {
  const prisma = crearClientePrueba();
  try {
    await borrarNegociosSembrados(prisma, WHATSAPP_DEMO);
  } finally {
    await prisma.$disconnect();
  }
});

describe("plataforma-astro · la salida construida, servida como en Vercel", () => {
  beforeAll(async () => {
    const prisma = crearClientePrueba();
    await seedCatalogos(prisma);
    // Fase 2b: el directorio necesita negocios (ficticios) para el sitemap y
    // para las cabeceras de un listado, una ficha y una foto.
    await sembrarNegociosDemo(prisma, { NODE_ENV: "test" });
    await prisma.$disconnect();

    emulador = spawn(process.execPath, [path.join(raiz, "scripts/servir-salida-vercel.mjs")], {
      cwd: raiz,
      env: {
        ...entornoDeBuild(),
        // La base de la suite (la home la lee por petición) y la URL pública.
        DATABASE_URL: process.env.DATABASE_URL ?? "",
        SITIO_URL: URL_PUBLICA,
        PORT: String(PUERTO),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    await new Promise<void>((listo, falla) => {
      const tiempo = setTimeout(() => falla(new Error("el emulador no arrancó")), 30_000);
      emulador!.stdout!.on("data", (d: Buffer) => {
        if (d.toString().includes("[emulador]")) {
          clearTimeout(tiempo);
          listo();
        }
      });
      emulador!.on("exit", (codigo) => falla(new Error(`el emulador terminó (${codigo})`)));
    });
  }, 60_000);

  afterAll(() => {
    emulador?.kill();
  });

  const pedir = (ruta: string) => fetch(`${BASE}${ruta}`, { redirect: "manual" });

  function hojaDeEstilos(): string {
    const archivo = listar(path.join(salida, "static/_astro")).find((f) => f.endsWith(".css"));
    expect(archivo, "la build no dejó hoja de estilos en /_astro/").toBeDefined();
    return `/_astro/${archivo}`;
  }

  // Scenario "las cuatro en todas partes" (emulado; el preview de Vercel es
  // la palabra final, tasks.md #19).
  it("las cuatro cabeceras, con sus valores, en cada ruta del alcance, y ninguna del marco", async () => {
    const rutas = ["/", "/aviso-de-privacidad", "/terminos", "/no-existe", "/a/b/c", "/robots.txt", "/sitemap.xml", "/opengraph-image", hojaDeEstilos()];
    for (const ruta of rutas) {
      const respuesta = await pedir(ruta);
      for (const { key, value } of cabecerasDeSeguridad()) {
        expect(respuesta.headers.get(key), `${ruta} · ${key}`).toBe(value);
      }
      for (const nombre of respuesta.headers.keys()) {
        expect(nombre, ruta).not.toMatch(/^x-(powered-by|astro|nextjs)/);
      }
    }
  });

  it("las URLs desconocidas responden 404 con la página en español", async () => {
    for (const ruta of ["/no-existe", "/a/b/c"]) {
      const respuesta = await pedir(ruta);
      expect(respuesta.status, ruta).toBe(404);
      expect(await respuesta.text(), ruta).toContain("No encontramos esta página");
    }
  });

  it("la home dinámica manda el Cache-Control de Next y su juego de caracteres", async () => {
    const respuesta = await pedir("/");
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("cache-control")).toBe("private, no-cache, no-store, max-age=0, must-revalidate");
    expect(respuesta.headers.get("content-type")).toBe("text/html; charset=utf-8");
  });

  // Scenario "cero JS propio" sobre el HTML servido.
  it("/, legales y 404: sin <script> (salvo datos), sin modulepreload ni islas", async () => {
    for (const ruta of ["/", "/aviso-de-privacidad", "/terminos", "/no-existe"]) {
      const html = await (await pedir(ruta)).text();
      const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
      expect(scripts.filter((s) => !s.includes('type="application/ld+json"')), ruta).toEqual([]);
      expect(html, ruta).not.toContain("modulepreload");
      expect(html, ruta).not.toContain("astro-island");
    }
  });

  // Scenario "la imagen responde en su dirección de siempre".
  it("/opengraph-image: 200, image/png y 1200×630", async () => {
    const respuesta = await pedir("/opengraph-image");
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("content-type")).toBe("image/png");
    expect(medidasPng(new Uint8Array(await respuesta.arrayBuffer()))).toEqual({ ancho: 1200, alto: 630 });
  });
});

describe("plataforma-astro · nada se renderiza por petición", () => {
  it("/opengraph-image es un archivo estático y no una ruta de la función", () => {
    expect(existsSync(path.join(salida, "static/opengraph-image"))).toBe(true);
    const fuentes = rutasDeVercel().filter((r) => r.dest === "_render").map((r) => r.src ?? "");
    expect(fuentes.filter((src) => src.includes("opengraph"))).toEqual([]);
  });

  it("la función no incluye el generador de imágenes", () => {
    const archivos = listar(funcion);
    expect(archivos.filter((f) => /satori|resvg|yoga|harfbuzz/i.test(f))).toEqual([]);
    const codigo = archivos
      .filter((f) => /\.(m?js|cjs)$/.test(f) && f.startsWith("dist"))
      .map((f) => readFileSync(path.join(funcion, f), "utf8"))
      .join("\n");
    expect(codigo).not.toMatch(/satori|resvg/i);
  });
});

describe("plataforma-astro · cabeceras de la CDN en el config.json construido", () => {
  type RutaConCabeceras = { src?: string; dest?: string; status?: number; headers?: Record<string, string>; handle?: string };
  const tabla = () =>
    (JSON.parse(readFileSync(path.join(salida, "config.json"), "utf8")) as { routes: RutaConCabeceras[] }).routes;

  it("cada estático y la 404 llevan las cuatro; la imagen, además, su tipo", () => {
    const rutas = tabla();
    const filesystem = rutas.findIndex((r) => r.handle === "filesystem");
    const antes = rutas.slice(0, filesystem);
    const seguridad = Object.fromEntries(cabecerasDeSeguridad().map(({ key, value }) => [key, value]));
    for (const ruta of ["/aviso-de-privacidad", "/terminos", "/opengraph-image", "/404.html", "/favicon.ico", hojaDeLaBuild()]) {
      const cabeceras = Object.assign({}, ...antes.filter((r) => r.headers && new RegExp(r.src!).test(ruta)).map((r) => r.headers));
      expect(cabeceras, ruta).toMatchObject(seguridad);
    }
    const imagen = antes.find((r) => r.src && new RegExp(r.src).test("/opengraph-image") && r.headers?.["Content-Type"]);
    expect(imagen?.headers?.["Content-Type"]).toBe("image/png");
    const comodin = rutas.find((r) => r.dest === "/404.html" && r.status === 404);
    expect(comodin?.headers).toMatchObject(seguridad);
  });

  it("ninguna ruta de la función recibe cabeceras de la CDN", () => {
    for (const r of tabla().filter((r) => r.dest === "_render")) expect(r.headers, r.src).toBeUndefined();
  });

  function hojaDeLaBuild(): string {
    const archivo = listar(path.join(salida, "static/_astro")).find((f) => f.endsWith(".css"));
    return `/_astro/${archivo}`;
  }
});


// ── Fase 2b (change `migrar-directorio-publico-astro`, tasks.md #13 y #14) ──

describe("plataforma-astro · 2b sobre la salida construida", () => {
  // Las fotos de la suite viven en disco; en modo producción el sitio exige
  // Supabase y no cae al disco, así que este emulador corre en desarrollo
  // (ver `tests/fotos-ruta-salida.test.ts`).
  let conFotos: Awaited<ReturnType<typeof levantarEmuladorDeSalida>>;
  let produccion: Awaited<ReturnType<typeof levantarEmuladorDeSalida>>;
  let fichaConFoto = "";
  let fichaNoPublicada = "";
  let fotoPublicada = "";

  beforeAll(async () => {
    const prisma = crearClientePrueba();
    const academia = await prisma.negocio.findFirstOrThrow({ where: { nombre: { startsWith: "Academia de Futbol Halcones" } } });
    const barberia = await prisma.negocio.findFirstOrThrow({ where: { estado: "en_revision", nombre: { startsWith: "Barbería" } } });
    await prisma.$disconnect();
    fichaConFoto = `/negocio/${construirSegmentoFicha(academia.nombre, academia.id)}`;
    fichaNoPublicada = `/negocio/${construirSegmentoFicha(barberia.nombre, barberia.id)}`;
    fotoPublicada = `/api/foto/${academia.fotoClave}/ficha`;
    conFotos = await levantarEmuladorDeSalida({
      NODE_ENV: "development",
      SITIO_URL: URL_PUBLICA,
      FOTOS_DIR: path.resolve(raiz, process.env.FOTOS_DIR ?? ".fotos-test"),
    });
    produccion = await levantarEmuladorDeSalida({ SITIO_URL: URL_PUBLICA });
  }, 60_000);

  afterAll(() => {
    conFotos?.detener();
    produccion?.detener();
  });

  const pedir = (ruta: string) => produccion.pedir(ruta);

  // Scenario "el sitemap no lleva a un 404" (spec `plataforma-astro`, 2b).
  it("toda URL del sitemap.xml responde 200, salvo /registro (Fase 3)", async () => {
    const sitemap = await (await pedir("/sitemap.xml")).text();
    const rutas = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
    expect(rutas.filter((r) => r.startsWith("/negocio/")).length).toBeGreaterThanOrEqual(10);
    expect(rutas).toContain("/registro");
    for (const ruta of rutas) {
      const r = await pedir(ruta);
      expect(r.status, ruta).toBe(ruta === "/registro" ? 404 : 200);
    }
  });

  // Scenario "las cuatro en todas partes" (2b).
  it("listado, giro, ficha, /buscar, /loquesea, ficha no publicada, foto y foto inexistente: las cuatro, sin marco", async () => {
    const casos: Array<[string, number, string, string]> = [
      ["/servicios-del-hogar", 200, "text/html; charset=utf-8", "private, no-cache, no-store, max-age=0, must-revalidate"],
      ["/plomeria", 200, "text/html; charset=utf-8", "private, no-cache, no-store, max-age=0, must-revalidate"],
      [fichaConFoto, 200, "text/html; charset=utf-8", "private, no-cache, no-store, max-age=0, must-revalidate"],
      ["/buscar?q=plomero", 200, "text/html; charset=utf-8", "private, no-cache, no-store, max-age=0, must-revalidate"],
      ["/loquesea", 404, "text/html; charset=utf-8", "private, no-cache, no-store, max-age=0, must-revalidate"],
      [fichaNoPublicada, 404, "text/html; charset=utf-8", "private, no-cache, no-store, max-age=0, must-revalidate"],
      [fotoPublicada, 200, "image/webp", "private, max-age=3600"],
      ["/api/foto/0123456789abcdef0123456789abcdef/ficha", 404, "", "no-store"],
    ];
    for (const [ruta, status, tipo, cache] of casos) {
      const r = await conFotos.pedir(ruta);
      expect(r.status, ruta).toBe(status);
      expect(r.headers.get("content-type") ?? "", ruta).toBe(tipo);
      expect(r.headers.get("cache-control"), ruta).toBe(cache);
      for (const { key, value } of cabecerasDeSeguridad()) expect(r.headers.get(key), `${ruta} · ${key}`).toBe(value);
      for (const nombre of r.headers.keys()) expect(nombre, ruta).not.toMatch(/^x-(powered-by|astro|nextjs)/);
    }
  });

  // Scenario "cero JS propio" (2b), sobre el HTML servido sin la medición.
  it("listado, ficha y /buscar: sin <script> salvo el JSON-LD, sin modulepreload ni islas", async () => {
    for (const ruta of ["/servicios-del-hogar", fichaConFoto, "/buscar?q=plomero"]) {
      const html = await (await pedir(ruta)).text();
      const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
      expect(scripts.filter((s) => !s.includes('type="application/ld+json"')), ruta).toEqual([]);
      expect(html, ruta).not.toContain("modulepreload");
      expect(html, ruta).not.toContain("astro-island");
    }
  });

  // ── 3a (change `migrar-formularios-publicos-astro`, tasks.md #16) ─────────
  // Scenario "cabeceras en todo el recorrido": el formulario, el 303 con
  // borrador, el 303 a la confirmación, la confirmación, el 403 de origen y
  // la 404 de una ficha no publicada por GET y por POST. El `Cache-Control`
  // es el que manda Next a esa misma respuesta (fixtures
  // `tests/fixtures/next-3a/*\/respuestas.json`); el 403 no existía en Next
  // (respondía 500) y lleva el del HTML dinámico.
  it("[3a] cabeceras en todo el recorrido del reporte, con el Cache-Control de Next y el Set-Cookie del borrador", async () => {
    const dinamico = "private, no-cache, no-store, max-age=0, must-revalidate";
    const deAccion = "no-cache, no-store, max-age=0, must-revalidate";
    const formulario = `${fichaConFoto}/reportar`;
    const noPublicada = `${fichaNoPublicada}/reportar`;
    const enviar = (ruta: string, cuerpo: string, origin = produccion.base) =>
      produccion.pedir(`${ruta}?_action=reportar`, {
        method: "POST",
        body: cuerpo,
        headers: { "content-type": "application/x-www-form-urlencoded", origin },
      });
    const casos: Array<[string, Response, number, string | null]> = [
      ["formulario", await pedir(formulario), 200, dinamico],
      ["303 con borrador", await enviar(formulario, "comentario=hola"), 303, deAccion],
      ["303 a la confirmación", await enviar(formulario, "motivo=cerrado"), 303, deAccion],
      ["confirmación", await pedir(`${formulario}/gracias`), 200, dinamico],
      ["403 de origen", await enviar(formulario, "motivo=cerrado", "https://ajeno.example"), 403, dinamico],
      ["404 GET de una ficha no publicada", await pedir(noPublicada), 404, dinamico],
      ["404 POST de una ficha no publicada", await enviar(noPublicada, "motivo=cerrado"), 404, deAccion],
    ];
    for (const [nombre, r, status, cache] of casos) {
      expect(r.status, nombre).toBe(status);
      expect(r.headers.get("cache-control"), nombre).toBe(cache);
      for (const { key, value } of cabecerasDeSeguridad()) expect(r.headers.get(key), `${nombre} · ${key}`).toBe(value);
      expect(r.headers.get("referrer-policy"), nombre).toBe("strict-origin-when-cross-origin");
      for (const cabecera of r.headers.keys()) expect(cabecera, nombre).not.toMatch(/^x-(powered-by|astro|nextjs)/);
    }
    const [, conBorrador] = casos[1];
    expect(conBorrador.headers.get("location")).toBe(`${formulario}?error=motivo`);
    expect(conBorrador.headers.getSetCookie()).toHaveLength(1);
    expect(conBorrador.headers.getSetCookie()[0]).toMatch(/^nu_reporte_borrador=[A-Za-z0-9_-]+;/);
    const [, aLaConfirmacion] = casos[2];
    expect(aLaConfirmacion.headers.get("location")).toBe(`${formulario}/gracias`);
    expect(aLaConfirmacion.headers.getSetCookie()[0]).toMatch(/^nu_reporte_borrador=;.*Max-Age=0/i);
    for (const [nombre, r] of casos.slice(4)) expect(r.headers.getSetCookie(), nombre).toEqual([]);
  });

  // Scenario "cero JS propio" (3a): el formulario y la confirmación.
  it("[3a] el formulario de reporte y su confirmación: sin <script>, modulepreload ni islas", async () => {
    for (const ruta of [`${fichaConFoto}/reportar`, `${fichaConFoto}/reportar/gracias`, `${fichaConFoto}/reportar?error=motivo`]) {
      const html = await (await pedir(ruta)).text();
      expect(html, ruta).not.toMatch(/<script\b/);
      expect(html, ruta).not.toContain("modulepreload");
      expect(html, ruta).not.toContain("astro-island");
    }
  });

  it("[3a] la vía RPC de las Actions no está en la tabla de rutas de Vercel", () => {
    const { routes } = JSON.parse(readFileSync(path.join(salida, "config.json"), "utf8")) as { routes: Array<{ src?: string }> };
    expect(routes.filter((r) => r.src?.includes("_actions"))).toEqual([]);
  });

  it("la 404 dinámica sale de la función (Cache-Control dinámico), no de la 404 prerenderizada", async () => {
    const r = await pedir("/loquesea");
    expect(r.status).toBe(404);
    expect(r.headers.get("cache-control")).toBe("private, no-cache, no-store, max-age=0, must-revalidate");
    expect(await r.text()).toContain("No encontramos esta página");
  });
});
