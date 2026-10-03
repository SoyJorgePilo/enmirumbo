/**
 * Spec `plataforma-astro` (change `migrar-panel-admin-base-astro`, Fase 5a;
 * tasks.md #5), requirement "El límite de intentos de acceso conserva su
 * atomicidad compartida entre instancias", sobre la SALIDA SERVIDA:
 *
 * - la ráfaga de 20 con el primer valor de `x-forwarded-for` rotado (la llave
 *   es el ÚLTIMO, `ipDeEncabezados`; nunca `clientAddress`);
 * - dos procesos de la misma build contra la misma base (el hallazgo A4 de
 *   T-013: el límite en memoria por instancia daba tantos intentos como
 *   instancias);
 * - sin `REGISTRO_ENCABEZADO_IP`, la ventana que vence (envejeciendo las
 *   filas, sin tocar el reloj de `src/lib/`) y la base caída al contar.
 *
 * Las dos primeras piden backends independientes (PostgreSQL real, como el
 * CI); en PGlite (`prisma dev`) se saltan con aviso. Cada prueba borra SOLO
 * las filas de sus IPs (las claves se derivan con el secreto de esta prueba).
 * Todo ficticio: IPs de documentación (RFC 5737), contraseña y secreto de aquí.
 */
import { randomBytes } from "node:crypto";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Frasco, enviarFormulario } from "../scripts/enviar-formulario.mjs";
import type { PrismaClient } from "../src/generated/prisma/client";
import { INTENTOS_ACCESO_POR_VENTANA, VENTANA_INTENTOS_ACCESO_MS } from "../src/lib/admin/acceso";
import { VARIABLE_CONTRASENA, VARIABLE_SECRETO_SESION } from "../src/lib/admin/config";
import { NOMBRE_COOKIE_SESION } from "../src/lib/admin/sesion";
import { ERROR_DEMASIADOS_INTENTOS } from "../src/lib/admin/textos";
import { crearClientePrueba } from "./db";
import { urlDeLaBaseDePrueba } from "./esquemas";
import { borrarIntentos, envejecerIntentos, intentosDe } from "./panel-astro";
import { type Emulador, construirSiHaceFalta, levantarEmulador } from "./salida-astro";

/** ¿Este servidor da conexiones con backends independientes? (como `concurrencia-real.test.ts`) */
async function hayBackendsIndependientes(): Promise<boolean> {
  const a = new pg.Client({ connectionString: urlDeLaBaseDePrueba() });
  const b = new pg.Client({ connectionString: urlDeLaBaseDePrueba() });
  try {
    await a.connect();
    await b.connect();
    const pid = async (c: pg.Client) => (await c.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    return (await pid(a)) !== (await pid(b));
  } catch {
    return false;
  } finally {
    await a.end().catch(() => {});
    await b.end().catch(() => {});
  }
}
const backendsIndependientes = await hayBackendsIndependientes();
if (!backendsIndependientes) {
  console.warn("[panel-intentos] la base multiplexa todas las conexiones (PGlite): la ráfaga y los dos procesos se saltan aquí y corren con PostgreSQL real (CI).");
}

const CONTRASENA = `clave-ficticia-${randomBytes(6).toString("hex")}`;
const SECRETO = randomBytes(32).toString("hex");
const PANEL = { [VARIABLE_CONTRASENA]: CONTRASENA, [VARIABLE_SECRETO_SESION]: SECRETO, REGISTRO_ENCABEZADO_IP: "x-forwarded-for" };

let prisma: PrismaClient;
let a: Emulador;
let b: Emulador;
let sinVariable: Emulador;
let sinBase: Emulador;
const ipsUsadas = new Set<string>();
const usar = (ip: string) => (ipsUsadas.add(ip), ip);

beforeAll(async () => {
  construirSiHaceFalta();
  prisma = crearClientePrueba();
  [a, b, sinVariable, sinBase] = await Promise.all([
    levantarEmulador(PANEL),
    levantarEmulador(PANEL),
    levantarEmulador({ ...PANEL, REGISTRO_ENCABEZADO_IP: undefined }),
    levantarEmulador({ ...PANEL, DATABASE_URL: "postgresql://nadie:nadie@127.0.0.1:1/ninguna" }),
  ]);
}, 300_000);

afterAll(async () => {
  for (const e of [a, b, sinVariable, sinBase]) e?.detener();
  await borrarIntentos(prisma, ipsUsadas, SECRETO);
  await prisma.$disconnect();
});

/** Un `entrar` sin JS: GET de `/admin`, POST del formulario y el GET del 303 (sin efectos). */
async function entrar(e: Emulador, contrasena: string, xff: string) {
  const r = await enviarFormulario({
    urlPagina: new URL("/admin", e.base).toString(),
    elecciones: { contrasena },
    cabecerasExtra: { "x-forwarded-for": xff },
    frasco: new Frasco(),
  });
  const post = r.cadena[1];
  return { status: post.status, location: post.location ?? "", cookies: post.setCookie };
}

describe("intentos · la ráfaga contra el acceso", () => {
  it.runIf(backendsIndependientes)(
    "20 simultáneos desde la misma IP declarada, con el primer valor rotado: 5 filas, a lo sumo 5 comparan, el resto «Demasiados intentos» y sin cookie",
    async () => {
      const ip = usar("203.0.113.201");
      await borrarIntentos(prisma, [ip], SECRETO);
      const respuestas = await Promise.all(
        Array.from({ length: 20 }, (_, i) => entrar(a, i % 4 === 0 ? CONTRASENA : `equivocada-${i}`, `198.51.100.${i + 1}, ${ip}`)),
      );
      for (const r of respuestas) expect(r.status).toBe(303);
      const bloqueadas = respuestas.filter((r) => r.location === "/admin?error=intentos");
      const compararon = respuestas.filter((r) => r.location === "/admin/cola" || r.location === "/admin?error=incorrecta");
      expect(compararon.length).toBeLessThanOrEqual(INTENTOS_ACCESO_POR_VENTANA);
      expect(compararon.length + bloqueadas.length).toBe(20);
      expect(bloqueadas.length).toBe(20 - INTENTOS_ACCESO_POR_VENTANA);
      for (const r of bloqueadas) expect(r.cookies).toEqual([]);
      for (const r of respuestas.filter((x) => x.location !== "/admin/cola")) expect(r.cookies).toEqual([]);
      expect(await intentosDe(prisma, ip, SECRETO)).toBe(INTENTOS_ACCESO_POR_VENTANA);
      // Ninguna fila por los primeros valores (la llave no es el primero).
      for (let i = 1; i <= 20; i++) expect(await intentosDe(prisma, `198.51.100.${i}`, SECRETO)).toBe(0);
    },
    60_000,
  );

  it.runIf(backendsIndependientes)("dos procesos contra la misma base: tres equivocados en cada uno y el sexto ya es «Demasiados intentos»", async () => {
    const ip = usar("203.0.113.202");
    await borrarIntentos(prisma, [ip], SECRETO);
    const destinos: string[] = [];
    for (let i = 0; i < 6; i++) destinos.push((await entrar(i % 2 === 0 ? a : b, "equivocada", ip)).location);
    expect(destinos.slice(0, 5)).toEqual(Array(5).fill("/admin?error=incorrecta"));
    expect(destinos[5]).toBe("/admin?error=intentos");
    // Y en el otro proceso, con la contraseña correcta, también.
    const correcta = await entrar(a, CONTRASENA, ip);
    expect(correcta.location).toBe("/admin?error=intentos");
    expect(correcta.cookies).toEqual([]);
    expect(await intentosDe(prisma, ip, SECRETO)).toBe(INTENTOS_ACCESO_POR_VENTANA);
  });

  it("la corrida sabe si puede probar concurrencia de verdad (y lo dice si no)", () => {
    expect(typeof backendsIndependientes).toBe("boolean");
  });
});

describe("intentos · la ventana y el encabezado de IP", () => {
  it("tras agotar el margen, pasados 10 minutos la contraseña correcta entra a la cola", async () => {
    const ip = usar("203.0.113.203");
    await borrarIntentos(prisma, [ip], SECRETO);
    for (let i = 0; i < INTENTOS_ACCESO_POR_VENTANA; i++) await entrar(a, "equivocada", ip);
    const bloqueada = await entrar(a, CONTRASENA, ip);
    expect(bloqueada.location).toBe("/admin?error=intentos");
    await envejecerIntentos(prisma, ip, SECRETO, VENTANA_INTENTOS_ACCESO_MS + 1000);
    const pasa = await entrar(a, CONTRASENA, ip);
    expect(pasa.location).toBe("/admin/cola");
    expect(pasa.cookies.some((l) => l.startsWith(`${NOMBRE_COOKIE_SESION}=`))).toBe(true);
  });

  it("sin REGISTRO_ENCABEZADO_IP: 8 equivocados no se bloquean y el log avisa una sola vez, sin IP", async () => {
    const ip = "203.0.113.204";
    for (let i = 0; i < 8; i++) expect((await entrar(sinVariable, "equivocada", ip)).location).toBe("/admin?error=incorrecta");
    const avisos = sinVariable.registro().split("\n").filter((l) => l.includes("[panel] sin IP atribuible"));
    expect(avisos).toHaveLength(1);
    expect(sinVariable.registro()).not.toContain(ip);
  });

  it("con la base caída al contar, el respaldo en memoria sigue limitando (5 por proceso) y el log lo dice sin la IP", async () => {
    const ip = "203.0.113.205";
    for (let i = 0; i < INTENTOS_ACCESO_POR_VENTANA; i++) expect((await entrar(sinBase, "equivocada", ip)).location).toBe("/admin?error=incorrecta");
    const sexta = await entrar(sinBase, CONTRASENA, ip);
    expect(sexta.location).toBe("/admin?error=intentos");
    expect(sexta.cookies).toEqual([]);
    const registro = sinBase.registro();
    expect(registro).toContain('[cupos] la base no respondió al contar el cupo "acceso-panel"');
    expect(registro).not.toContain(ip);
    expect(registro).not.toContain(ERROR_DEMASIADOS_INTENTOS);
  });
});
