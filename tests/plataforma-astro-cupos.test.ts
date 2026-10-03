/**
 * Spec `plataforma-astro` (change `migrar-formularios-publicos-astro`, T-024,
 * Fase 3a), requirement "Los cupos por IP se leen del encabezado declarado,
 * nunca de la IP que deduce el marco". tasks.md #6.
 *
 * Contra la SALIDA SERVIDA, con PostgreSQL: la llave del cupo es el ÚLTIMO
 * valor del encabezado declarado (`ipDeEncabezados`), nunca `clientAddress`
 * de Astro, que en el adaptador de Vercel toma el PRIMERO de
 * `x-forwarded-for` (design.md §5). Y las dos cotas del reporte siguen sin
 * ventana de carrera sobre la build.
 *
 * Todo ficticio: WhatsApp 77199975xx, IPs de documentación (RFC 5737).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import type { PrismaClient } from "../src/generated/prisma/client";
import { construirSegmentoFicha } from "../src/lib/ficha-url";
import { crearClientePrueba } from "./db";
import { urlDeLaBaseDePrueba } from "./esquemas";
import { borrarNegociosSembrados } from "./limpieza";
import { type Emulador, construirSiHaceFalta, levantarEmulador } from "./salida-astro";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const WHATSAPP = { a: "7719997501", b: "7719997502", c: "7719997503" };

/**
 * ¿Este servidor da conexiones con backends independientes? El de
 * `npx prisma dev` (PGlite) multiplexa todas las conexiones sobre UNA sesión:
 * con el pool de la función (5 conexiones) y envíos simultáneos, el protocolo
 * se mezcla ("bind message supplies 2 parameters…") y la prueba mediría eso,
 * no el código. Mismo criterio que `tests/concurrencia-real.test.ts`: aquí
 * se salta con el motivo escrito y en el CI (`postgres:17`) corre de verdad.
 */
async function hayBackendsIndependientes(): Promise<boolean> {
  const a = new pg.Client({ connectionString: urlDeLaBaseDePrueba() });
  const b = new pg.Client({ connectionString: urlDeLaBaseDePrueba() });
  try {
    await a.connect();
    await b.connect();
    const pidA = (await a.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    const pidB = (await b.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    return pidA !== pidB;
  } catch {
    return false;
  } finally {
    await a.end().catch(() => {});
    await b.end().catch(() => {});
  }
}

const backendsIndependientes = await hayBackendsIndependientes();
if (!backendsIndependientes) {
  console.warn(
    "[cupos] la base de esta corrida multiplexa todas las conexiones sobre un solo backend " +
      "(`npx prisma dev`): la prueba de concurrencia sobre la build se salta aquí y corre en el CI, " +
      "contra el servicio postgres:17.",
  );
}

let prisma: PrismaClient;
let conCupo: Emulador;
let sinVariable: Emulador;
const ids = { a: "", b: "", c: "" };

const accion = (clave: keyof typeof ids) =>
  `/negocio/${construirSegmentoFicha(`Fonda Ficticia Cupo ${clave}`, ids[clave])}/reportar?_action=reportar`;

function reportar(e: Emulador, clave: keyof typeof ids, xff?: string) {
  return e.pedir(accion(clave), {
    method: "POST",
    body: "motivo=cerrado",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: e.base, ...(xff ? { "x-forwarded-for": xff } : {}) },
  });
}

const pendientes = (clave: keyof typeof ids) => prisma.reporte.count({ where: { negocioId: ids[clave], estado: "pendiente" } });
const limpiar = () => prisma.reporte.deleteMany({ where: { negocioId: { in: Object.values(ids) } } });

beforeAll(async () => {
  construirSiHaceFalta();
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  await borrarNegociosSembrados(prisma, Object.values(WHATSAPP));
  const categoriaId = (await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })).id;
  for (const clave of Object.keys(ids) as Array<keyof typeof ids>) {
    ids[clave] = (
      await prisma.negocio.create({
        data: {
          nombre: `Fonda Ficticia Cupo ${clave}`,
          categoriaId,
          whatsapp: WHATSAPP[clave],
          estado: "publicado",
          publicadoEn: new Date(),
          consintioAvisoEn: new Date(),
        },
      })
    ).id;
  }
  [conCupo, sinVariable] = await Promise.all([
    levantarEmulador({ REGISTRO_ENCABEZADO_IP: "x-forwarded-for" }),
    levantarEmulador({ REGISTRO_ENCABEZADO_IP: undefined }),
  ]);
}, 300_000);

afterAll(async () => {
  conCupo?.detener();
  sinVariable?.detener();
  await borrarNegociosSembrados(prisma, Object.values(WHATSAPP));
  await prisma.$disconnect();
});

describe("cupos · la llave es el último valor del encabezado declarado", () => {
  it("cuatro reportes con un primer valor distinto cada vez y el mismo último: el cuarto vuelve con cupo agotado", async () => {
    await limpiar();
    const destinos: string[] = [];
    for (let i = 1; i <= 4; i++) {
      const r = await reportar(conCupo, "a", `192.0.2.${i}, 203.0.113.7`);
      expect(r.status).toBe(303);
      destinos.push(r.headers.get("location") ?? "");
    }
    expect(destinos.slice(0, 3).every((d) => d.endsWith("/reportar/gracias"))).toBe(true);
    expect(destinos[3]).toMatch(/\/reportar\?error=cupo$/);
    expect(await pendientes("a")).toBe(3);
  });

  it("un último valor sin forma de IP deja la petición sin cupo, como hoy", async () => {
    await limpiar();
    for (let i = 1; i <= 5; i++) {
      const r = await reportar(conCupo, "b", `203.0.113.8, no-soy-una-ip`);
      expect(r.headers.get("location"), `envío ${i}`).toMatch(/\/reportar\/gracias$/);
    }
    expect(await pendientes("b")).toBe(5);
  });

  it("sin REGISTRO_ENCABEZADO_IP no hay cupo", async () => {
    await limpiar();
    for (let i = 1; i <= 5; i++) {
      const r = await reportar(sinVariable, "b", "203.0.113.9");
      expect(r.headers.get("location"), `envío ${i}`).toMatch(/\/reportar\/gracias$/);
    }
    expect(await pendientes("b")).toBe(5);
  });
});

describe("cupos · concurrencia sobre la build", () => {
  it("la corrida sabe si puede probar concurrencia de verdad (y lo dice si no)", () => {
    expect(typeof backendsIndependientes).toBe("boolean");
  });

  it.runIf(backendsIndependientes)("14 simultáneos sobre una ficha (IPs distintas) dejan 10; 8 simultáneos desde una IP sobre otra dejan 3; nadie recibe un 500", async () => {
    await limpiar();
    const sobreA = Array.from({ length: 14 }, (_, i) => reportar(conCupo, "a", `198.51.100.${i + 10}`));
    const desdeUnaIp = Array.from({ length: 8 }, () => reportar(conCupo, "c", "198.51.100.200"));
    const respuestas = await Promise.all([...sobreA, ...desdeUnaIp]);
    for (const r of respuestas) {
      expect(r.status).toBe(303);
      expect(r.headers.get("location")).toMatch(/\/reportar(\/gracias|\?error=cupo)$/);
    }
    expect(await pendientes("a")).toBe(10);
    expect(await pendientes("c")).toBe(3);
    // Los de la ficha A ven la confirmación aunque el tope los descarte; los
    // de la IP repetida, cupo agotado a partir del cuarto.
    expect(respuestas.slice(0, 14).every((r) => r.headers.get("location")!.endsWith("/gracias"))).toBe(true);
    expect(respuestas.slice(14).filter((r) => r.headers.get("location")!.endsWith("?error=cupo"))).toHaveLength(5);
  });
});

// ── Nadie usa `clientAddress` ────────────────────────────────────────────────

/** Archivos de código bajo `rutas` (archivo o carpeta) que mencionan `clientAddress`. */
export function archivosConClientAddress(base: string, rutas: string[]): string[] {
  const encontrados: string[] = [];
  const revisar = (ruta: string) => {
    if (!existsSync(ruta)) return;
    if (statSync(ruta).isDirectory()) {
      for (const nombre of readdirSync(ruta)) revisar(path.join(ruta, nombre));
      return;
    }
    if (/\.(ts|tsx|mts|js|mjs|astro)$/.test(ruta) && readFileSync(ruta, "utf8").includes("clientAddress")) {
      encontrados.push(path.relative(base, ruta));
    }
  };
  for (const ruta of rutas) revisar(path.join(base, ruta));
  return encontrados.sort();
}

describe("cupos · nadie usa clientAddress", () => {
  it("ni src/actions, ni src/middleware.ts, ni src/pages, ni src/astro lo mencionan", () => {
    expect(archivosConClientAddress(raiz, ["src/actions", "src/middleware.ts", "src/pages", "src/astro"])).toEqual([]);
  });

  it("si alguien lo agrega, la verificación falla nombrando el archivo", () => {
    expect(archivosConClientAddress(raiz, ["tests/fixtures/con-client-address"])).toEqual([
      path.join("tests", "fixtures", "con-client-address", "pagina.astro"),
    ]);
  });

  it("las Actions leen la IP con ipDeEncabezados", () => {
    const pegamento = readFileSync(path.join(raiz, "src/astro/reportar.ts"), "utf8");
    expect(pegamento).toMatch(/ipDeEncabezados\(\s*contexto\.request\.headers\s*\)/);
    // 3b-1 (change `migrar-registro-astro`): el registro, con las cabeceras de la petición.
    const registro = readFileSync(path.join(raiz, "src/astro/registro.ts"), "utf8");
    expect(registro).toMatch(/const encabezados = contexto\.request\.headers;[\s\S]*ipDeEncabezados\(encabezados\)/);
    expect(archivosConClientAddress(raiz, ["src/astro/registro.ts", "src/astro/registro-cliente.ts", "src/pages/registro.astro", "src/pages/registro", "src/components/registro"])).toEqual([]);
    // Fase 4 (change `migrar-enlace-gestion-astro`): la edición, con las cabeceras de la petición.
    const edicion = readFileSync(path.join(raiz, "src/astro/editar.ts"), "utf8");
    expect(edicion).toMatch(/ipDeEncabezados\(\s*contexto\.request\.headers\s*\)/);
    expect(archivosConClientAddress(raiz, ["src/astro/editar.ts", "src/astro/gestion-cliente.ts", "src/pages/editar", "src/layouts/TroncoGestion.astro"])).toEqual([]);
    // 5a (change `migrar-panel-admin-base-astro`): el acceso al panel, con las cabeceras de la petición.
    const acceso = readFileSync(path.join(raiz, "src/astro/panel/acceso.ts"), "utf8");
    expect(acceso).toMatch(/ejecutarAcceso\(\s*formData,\s*contexto\.request\.headers/);
    expect(readFileSync(path.join(raiz, "src/lib/admin/entrar.ts"), "utf8")).toMatch(/ipDeEncabezados\(encabezados\)/);
    expect(archivosConClientAddress(raiz, ["src/astro/panel", "src/pages/admin", "src/lib/admin"])).toEqual([]);
  });
});
