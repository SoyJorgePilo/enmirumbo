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
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

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

/** Los `component` de las rutas que la función lleva en su manifiesto. */
function componentesDeLaFuncion(): string[] {
  const entrada = readFileSync(path.join(funcion, "dist/server/entry.mjs"), "utf8");
  return [...entrada.matchAll(/"component":"([^"]*)"/g)].map((m) => m[1]);
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
    const inexistente = pedirAlHandler("/ruta-que-no-existe");
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
