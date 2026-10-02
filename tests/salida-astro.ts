/**
 * La salida REAL de `astro build`, servida por el emulador del Build Output API
 * (`scripts/servir-salida-vercel.mjs`), para las pruebas de la Fase 2b (change
 * `migrar-directorio-publico-astro`): 404 dinámica, fotos, despublicación,
 * sitemap y cabeceras.
 *
 * Construir tarda: si la salida la dejó ESTE helper (marca
 * `.vercel/output/.salida-de-pruebas`) y es más nueva que todo lo que la
 * produce (`src/`, `public/`, `astro.config.mjs`, `package.json`), se
 * reutiliza. Si no —p. ej. la construyó alguien a mano con otro `SITIO_URL`—,
 * se construye igual que el CI: sin base alcanzable y sin `SITIO_URL`.
 */
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const marca = path.join(raiz, ".vercel/output/.salida-de-pruebas");

/** Entorno del build y del emulador: el de la terminal, sin las marcas de Vitest. */
export function entornoDeLaSalida(): NodeJS.ProcessEnv {
  const heredado = Object.entries(process.env).filter(([clave]) => !clave.startsWith("VITEST"));
  return {
    ...Object.fromEntries(heredado),
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://nadie:nadie@127.0.0.1:1/ninguna",
  };
}

/** El entorno del BUILD: además, sin URL pública ni medición (lo prerenderizado no depende de la terminal). */
function entornoDelBuild(): NodeJS.ProcessEnv {
  const env = entornoDeLaSalida();
  for (const clave of ["SITIO_URL", "NEXT_PUBLIC_UMAMI_SRC", "NEXT_PUBLIC_UMAMI_WEBSITE_ID"]) delete env[clave];
  return env;
}

function masReciente(ruta: string): number {
  if (!existsSync(ruta)) return 0;
  const info = statSync(ruta);
  if (!info.isDirectory()) return info.mtimeMs;
  return Math.max(info.mtimeMs, ...readdirSync(ruta).map((nombre) => masReciente(path.join(ruta, nombre))));
}

/** Construye la salida si no existe o si algo de lo que la produce cambió después. */
export function construirSiHaceFalta(): void {
  const fuentes = ["src", "public", "astro.config.mjs", "package.json"].map((f) => masReciente(path.join(raiz, f)));
  if (existsSync(marca) && statSync(marca).mtimeMs > Math.max(...fuentes)) return;
  try {
    execFileSync(process.execPath, [path.join(raiz, "node_modules/astro/bin/astro.mjs"), "build"], {
      cwd: raiz,
      env: entornoDelBuild(),
      stdio: "pipe",
    });
    writeFileSync(marca, "construida por tests/salida-astro.ts\n");
  } catch (error) {
    const e = error as { stderr?: Buffer; stdout?: Buffer };
    throw new Error(`\`astro build\` falló:\n${e.stdout?.toString() ?? ""}\n${e.stderr?.toString() ?? ""}`);
  }
}

export type Emulador = {
  base: string;
  pedir: (ruta: string, init?: RequestInit) => Promise<Response>;
  /** Todo lo que el proceso escribió en su consola hasta ahora (stdout y stderr). */
  registro: () => string;
  detener: () => void;
};

/**
 * Levanta el emulador sobre la salida construida, con la base de la suite y el
 * entorno que se pida encima (p. ej. `SITIO_URL`, la medición o `FOTOS_DIR`).
 */
export async function levantarEmulador(entorno: Record<string, string | undefined> = {}): Promise<Emulador> {
  const puerto = 48_000 + Math.floor(Math.random() * 1500);
  // Una variable en `undefined` se QUITA (p. ej. `SITIO_URL` en producción sin URL pública).
  const env: NodeJS.ProcessEnv = { ...entornoDeLaSalida(), DATABASE_URL: process.env.DATABASE_URL ?? "", PORT: String(puerto) };
  for (const [clave, valor] of Object.entries(entorno)) {
    if (valor === undefined) delete env[clave];
    else env[clave] = valor;
  }
  const proceso: ChildProcess = spawn(process.execPath, [path.join(raiz, "scripts/servir-salida-vercel.mjs")], {
    cwd: raiz,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let registro = "";
  proceso.stdout!.on("data", (d: Buffer) => (registro += d.toString()));
  proceso.stderr!.on("data", (d: Buffer) => (registro += d.toString()));
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
  const base = `http://127.0.0.1:${puerto}`;
  return {
    base,
    pedir: (ruta, init = {}) => fetch(`${base}${ruta}`, { redirect: "manual", ...init }),
    registro: () => registro,
    detener: () => proceso.kill(),
  };
}
