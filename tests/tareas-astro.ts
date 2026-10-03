/**
 * Las tareas programadas sobre la salida construida (change
 * `migrar-tareas-programadas-astro`, design.md §5; tasks.md #3): el emulador
 * de `tests/salida-astro.ts` con las condiciones que exigen estas pruebas, y
 * nada que pueda salir a un servicio real.
 *
 * - **El Resend falso, obligatorio** (`tests/fixtures/resend-falso.mjs`, por
 *   `--import`). Si el proceso no dice que lo cargó, el helper falla: sin él,
 *   el adaptador real hablaría con el proveedor de verdad.
 * - **`FOTOS_DIR` temporal**, propio de cada archivo de pruebas.
 * - **Sin las variables del bucket**, aunque la terminal las tenga.
 * - El `CRON_SECRET` de prueba (aleatorio) y los buzones `@ejemplo.invalid`.
 *
 * Lo que se siembra es de `scripts/sembrar-tareas.mjs` (fichas `77199966xx`,
 * fotos `f6a…`, marcas `f6a-tareas:`), y `soltarTareas` lo borra todo aunque
 * la prueba se haya caído a medias.
 */
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { seedCatalogos } from "../prisma/seed";
import { entornoDeInstancia, VARIABLES_DEL_BUCKET } from "../scripts/diff-html/tareas-6a.mjs";
import { conectar, limpiarTareas } from "../scripts/sembrar-tareas.mjs";
import { crearClientePrueba } from "./db";
import { urlDeLaBaseDePrueba } from "./esquemas";
import { LINEA_DE_INSTALADO } from "./fixtures/resend-falso.mjs";
import { type Emulador, levantarEmulador } from "./salida-astro";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

export type Consultar = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

export type ContextoDeTareas = {
  dir: string;
  fotosDir: string;
  archivoGuion: string;
  archivoCorreo: string;
  secreto: string;
  consultar: Consultar;
  cerrar: () => Promise<void>;
};

/** Un paso tal como lo guardan los fixtures de `tests/fixtures/next-6a/` (y lo devuelve `correrSesiones6a`). */
export type Paso6a = {
  nombre: string;
  metodo: string;
  ruta: string;
  comparar: "exacto" | "otro-metodo" | "pagina-404" | "registrar";
  status: number;
  headers: Record<string, string>;
  cuerpo: string;
  log: string[];
  correo: { respuesta: number | string; url: string; autorizacion: string; idempotencyKey: string | null; userAgent: string | null; cuerpo: { from?: string; to?: string[]; subject?: string; text?: string } }[];
};
export type Sesion6a = { instancia: string; estado: string; guion: string; pasos: Paso6a[]; despues: { fichas: string[]; archivos: string[]; cupos: number } };

/** Directorio temporal, secreto aleatorio y una conexión a la base de la suite. */
export async function prepararTareas(prefijo: string): Promise<ContextoDeTareas> {
  // La suite deja la base desde cero: los catálogos los siembra cada archivo.
  const prisma = crearClientePrueba();
  try {
    await seedCatalogos(prisma);
  } finally {
    await prisma.$disconnect();
  }
  const dir = mkdtempSync(path.join(tmpdir(), `${prefijo}-`));
  const { consultar, cerrar } = await conectar(urlDeLaBaseDePrueba());
  return {
    dir,
    fotosDir: path.join(dir, "fotos"),
    archivoGuion: path.join(dir, "guion.txt"),
    archivoCorreo: path.join(dir, "correo.jsonl"),
    secreto: randomBytes(32).toString("hex"),
    consultar,
    cerrar,
  };
}

/** Borra lo sembrado (fichas, marcas y fotos), cierra la conexión y tira el directorio. */
export async function soltarTareas(ctx: ContextoDeTareas | undefined): Promise<void> {
  if (!ctx) return;
  try {
    await limpiarTareas(ctx.consultar, ctx.fotosDir);
  } finally {
    await ctx.cerrar();
    rmSync(ctx.dir, { recursive: true, force: true });
  }
}

/** Falla si el proceso no cargó el Resend falso. */
export function exigirResendFalso(registro: string): void {
  if (!registro.includes(LINEA_DE_INSTALADO)) {
    throw new Error("el emulador arrancó SIN el Resend falso: el correo saldría al proveedor real. Las pruebas de tareas no corren así.");
  }
}

/**
 * El entorno que se le pone encima al del emulador: la base de la suite (salvo
 * en `base-caida`), el de la instancia y `extra`. Las variables del bucket van
 * siempre en `undefined` (se QUITAN), y aquí se comprueba.
 */
export function entornoParaTareas(
  instancia: string,
  ctx: Pick<ContextoDeTareas, "secreto" | "fotosDir" | "archivoGuion" | "archivoCorreo">,
  extra: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  const entorno: Record<string, string | undefined> = { DATABASE_URL: urlDeLaBaseDePrueba(), ...entornoDeInstancia(instancia, ctx), ...extra };
  for (const variable of VARIABLES_DEL_BUCKET) {
    if (entorno[variable] !== undefined) throw new Error(`el entorno del emulador no puede traer ${variable}`);
    entorno[variable] = undefined;
  }
  return entorno;
}

/**
 * El emulador de una instancia, con el Resend falso precargado. `registro()`
 * empieza después del arranque.
 */
export async function levantarParaTareas(
  instancia: string,
  ctx: ContextoDeTareas,
  extra: Record<string, string | undefined> = {},
): Promise<Emulador & { registroCompleto: () => string }> {
  const e = await levantarEmulador(entornoParaTareas(instancia, ctx, extra), { precargas: ["tests/fixtures/resend-falso.mjs"] });
  try {
    exigirResendFalso(e.registro());
  } catch (error) {
    e.detener();
    throw error;
  }
  // Astro carga el middleware (y sus avisos de arranque) con la PRIMERA
  // petición a la función: se la hace una que la puerta rechaza, sin base ni
  // archivos, para que eso no caiga en el log del primer paso (Next hace lo
  // mismo en `scripts/diff-html.mjs`).
  await (await e.pedir("/api/tareas/purgar-rechazados")).arrayBuffer();
  await new Promise((r) => setTimeout(r, 200));
  const inicio = e.registro().length;
  return { ...e, registro: () => e.registro().slice(inicio), registroCompleto: e.registro };
}

/** La sesión que capturó `scripts/diff-html.mjs --capturar-6a` sobre Next de `main`. */
export function fixtureDe6a(nombre: string): Sesion6a {
  return JSON.parse(readFileSync(path.join(raiz, "tests/fixtures/next-6a", `${nombre}.json`), "utf8")) as Sesion6a;
}

export const textoDe = (p: Paso6a): string => Buffer.from(p.cuerpo, "base64").toString("utf8");
