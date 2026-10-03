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
import { createServer } from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";

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
 * Un puerto libre que da el sistema (en vez de uno al azar): con varios
 * emuladores a la vez, el azar llegó a repetir puerto (change
 * `migrar-registro-astro`).
 */
function puertoLibre(): Promise<number> {
  return new Promise((listo, falla) => {
    const servidor = createServer();
    servidor.unref();
    servidor.on("error", falla);
    servidor.listen(0, "127.0.0.1", () => {
      const direccion = servidor.address();
      const puerto = typeof direccion === "object" && direccion ? direccion.port : 0;
      servidor.close(() => listo(puerto));
    });
  });
}

/**
 * Levanta el emulador sobre la salida construida, con la base de la suite y el
 * entorno que se pida encima (p. ej. `SITIO_URL`, la medición o `FOTOS_DIR`).
 * `precargas`: módulos que Node carga antes en el mismo proceso
 * (`node --import`), p. ej. el Twilio falso de `tests/fixtures/twilio-falso.mjs`
 * (change `migrar-registro-astro`, design.md §7).
 *
 * El puerto libre se pide y se suelta antes de que el emulador lo tome: en
 * una corrida completa, otro proceso (o un socket de salida con puerto
 * efímero) llegó a ganárselo en medio (EADDRINUSE). Solo ese caso se reintenta
 * con otro puerto (obs. 6 de c-seguridad.md de `migrar-verificacion-sms-astro`).
 */
export async function levantarEmulador(
  entorno: Record<string, string | undefined> = {},
  opciones: { precargas?: string[] } = {},
): Promise<Emulador> {
  for (let intento = 1; ; intento++) {
    try {
      return await levantarEnUnPuerto(entorno, opciones);
    } catch (error) {
      if (intento >= 3 || !(error instanceof Error && error.message.includes("EADDRINUSE"))) throw error;
    }
  }
}

async function levantarEnUnPuerto(
  entorno: Record<string, string | undefined>,
  { precargas = [] }: { precargas?: string[] },
): Promise<Emulador> {
  const puerto = await puertoLibre();
  // Una variable en `undefined` se QUITA (p. ej. `SITIO_URL` en producción sin URL pública).
  const env: NodeJS.ProcessEnv = { ...entornoDeLaSalida(), DATABASE_URL: process.env.DATABASE_URL ?? "", PORT: String(puerto) };
  for (const [clave, valor] of Object.entries(entorno)) {
    if (valor === undefined) delete env[clave];
    else env[clave] = valor;
  }
  const importes = precargas.flatMap((archivo) => ["--import", pathToFileURL(path.resolve(raiz, archivo)).href]);
  const proceso: ChildProcess = spawn(process.execPath, [...importes, path.join(raiz, "scripts/servir-salida-vercel.mjs")], {
    cwd: raiz,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let registro = "";
  proceso.stdout!.on("data", (d: Buffer) => (registro += d.toString()));
  proceso.stderr!.on("data", (d: Buffer) => (registro += d.toString()));
  await new Promise<void>((listo, falla) => {
    const tiempo = setTimeout(() => {
      proceso.kill();
      falla(new Error(`el emulador no arrancó en 30 s:\n${registro.slice(-2000)}`));
    }, 30_000);
    proceso.stdout!.on("data", (d: Buffer) => {
      if (d.toString().includes("[emulador]")) {
        clearTimeout(tiempo);
        listo();
      }
    });
    proceso.on("exit", (codigo) => {
      clearTimeout(tiempo);
      falla(new Error(`el emulador terminó (${codigo}):\n${registro.slice(-2000)}`));
    });
  });
  const base = `http://127.0.0.1:${puerto}`;
  return {
    base,
    pedir: (ruta, init = {}) => fetch(`${base}${ruta}`, { redirect: "manual", ...init }),
    registro: () => registro,
    detener: () => proceso.kill(),
  };
}
