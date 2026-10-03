/**
 * Etapa C (seguridad) del change `migrar-tareas-programadas-astro` (Fase 6a):
 * pruebas adversariales sobre la SALIDA CONSTRUIDA que el camino feliz y el
 * diff contra Next no cubren.
 *
 * - métodos raros (`TRACE`, `PURGE`, `PROPFIND`) con el secreto correcto;
 * - `Authorization` duplicado (el bueno detrás de uno malo);
 * - variantes de la ruta (mayúsculas, `%2e`, `%2F`, doble barra, punto y coma,
 *   doble codificación) con y sin secreto: ninguna ejecuta sin él;
 * - el límite de los 90 días sobre la build (90 d ± 5 min, fecha nula);
 * - dos purgas a la vez más un barrido (PostgreSQL real si la suite corre
 *   contra él): nada se cuenta dos veces ni se reporta como fallido;
 * - nombres hostiles en `FOTOS_DIR` y un enlace simbólico hacia fuera: el
 *   barrido no los sigue ni toca lo que no es una foto.
 *
 * Todo ficticio: fichas `77199966xx` (las limpia `limpiarTareas`), secreto
 * aleatorio, Resend falso, `FOTOS_DIR` temporal.
 */
import { request } from "node:http";
import { existsSync, lstatSync, mkdirSync, readdirSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { RUTA_BARRIDO, RUTA_PURGA } from "../scripts/diff-html/tareas-6a.mjs";
import { claveDeFoto, PREFIJO_WHATSAPP, resumenDeTareas } from "../scripts/sembrar-tareas.mjs";
import { construirSiHaceFalta } from "./salida-astro";
import { type ContextoDeTareas, levantarParaTareas, prepararTareas, soltarTareas } from "./tareas-astro";

const DIA_MS = 24 * 60 * 60 * 1000;
const APLICACION = /\[(purga|fotos|aviso|borrado)\]/;

let ctx: ContextoDeTareas;

beforeAll(async () => {
  construirSiHaceFalta();
  ctx = await prepararTareas("tareas-adversarial");
  mkdirSync(ctx.fotosDir, { recursive: true });
}, 300_000);

afterAll(async () => {
  await soltarTareas(ctx);
});

/** Una petición HTTP cruda: la ruta va tal cual (sin normalizar) y las cabeceras pueden repetirse. */
function crudo(base: string, metodo: string, ruta: string, cabeceras: [string, string][] = []) {
  const { hostname, port } = new URL(base);
  return new Promise<{ status: number; cuerpo: string; headers: Record<string, string | string[] | undefined> }>((listo, falla) => {
    const crudas = [["host", `${hostname}:${port}`], ...cabeceras].flat() as unknown as Record<string, string>;
    const pet = request({ host: hostname, port, method: metodo, path: ruta, headers: crudas }, (r) => {
      let cuerpo = "";
      r.on("data", (d) => (cuerpo += d));
      r.on("end", () => listo({ status: r.statusCode ?? 0, cuerpo, headers: r.headers }));
    });
    pet.on("error", falla);
    pet.end();
  });
}

async function sembrar(fichas: { n: number; estado: string; rechazadoHaceMs: number | null; foto?: number }[]) {
  const [categoria] = await ctx.consultar(`SELECT id FROM "Categoria" ORDER BY id LIMIT 1`);
  const ahora = Date.now();
  for (const { n, estado, rechazadoHaceMs, foto } of fichas) {
    await ctx.consultar(
      `INSERT INTO "Negocio" (id, nombre, "categoriaId", whatsapp, "consintioAvisoEn", estado, "rechazadoEn", "motivoRechazo", "fotoClave")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        `cc6aadv${String(n).padStart(18, "0")}`,
        `Negocio Ficticio Adversarial ${n}`,
        categoria.id,
        `${PREFIJO_WHATSAPP}${String(n).padStart(2, "0")}`,
        new Date(ahora - 200 * DIA_MS).toISOString(),
        estado,
        // En ISO/UTC: la columna es `timestamp` sin zona y `pg` mandaría la hora LOCAL de la máquina.
        rechazadoHaceMs === null ? null : new Date(ahora - rechazadoHaceMs).toISOString(),
        estado === "rechazado" ? "Motivo ficticio" : null,
        foto === undefined ? null : claveDeFoto(foto),
      ],
    );
    if (foto !== undefined) {
      for (const v of ["tarjeta", "ficha"]) {
        const f = path.join(ctx.fotosDir, `${claveDeFoto(foto)}.${v}.webp`);
        writeFileSync(f, "bytes ficticios");
        const viejo = new Date(ahora - 2 * 60 * 60 * 1000);
        utimesSync(f, viejo, viejo);
      }
    }
  }
}

/** Rechazados de 90 días o más que NO sembró este archivo (otro archivo de la suite pudo dejarlos). */
async function ajenosCondenados(): Promise<number> {
  const [{ total }] = await ctx.consultar(
    `SELECT count(*)::int AS total FROM "Negocio" WHERE estado = 'rechazado' AND "rechazadoEn" <= (now() AT TIME ZONE 'utc') - interval '90 days' AND whatsapp NOT LIKE $1`,
    [`${PREFIJO_WHATSAPP}%`],
  );
  return total as number;
}

const fichas = async () => (await resumenDeTareas(ctx.consultar, ctx.fotosDir)).fichas;

describe("la puerta frente a peticiones raras", () => {
  it("PURGE, PROPFIND y TRACE con el secreto correcto: el 404 vacío (TRACE ni llega) y nada se ejecuta", async () => {
    await sembrar([{ n: 50, estado: "rechazado", rechazadoHaceMs: 91 * DIA_MS }]);
    const e = await levantarParaTareas("principal", ctx);
    try {
      for (const ruta of [RUTA_PURGA, RUTA_BARRIDO]) {
        for (const metodo of ["PURGE", "PROPFIND"]) {
          const r = await crudo(e.base, metodo, ruta, [["authorization", `Bearer ${ctx.secreto}`]]);
          expect(r.status, `${metodo} ${ruta}`).toBe(404);
          expect(r.cuerpo, `${metodo} ${ruta}`).toBe("");
        }
      }
      // TRACE al final: `new Request` lo veda (Fetch) y el EMULADOR se cae (no el producto). Basta con que no corra.
      const trace = await crudo(e.base, "TRACE", RUTA_PURGA, [["authorization", `Bearer ${ctx.secreto}`]]).catch(() => null);
      expect(trace === null || trace.status >= 400).toBe(true);
      expect(e.registro()).not.toMatch(APLICACION);
      expect(await fichas()).toEqual([`${PREFIJO_WHATSAPP}50:rechazado`]);
    } finally {
      e.detener();
    }
  }, 60_000);

  it("Authorization duplicado con el bueno DETRÁS de uno malo: no ejecuta", async () => {
    const e = await levantarParaTareas("principal", ctx);
    try {
      const r = await crudo(e.base, "GET", RUTA_PURGA, [
        ["authorization", "Bearer malo"],
        ["authorization", `Bearer ${ctx.secreto}`],
      ]);
      expect(r.status).toBe(404);
      expect(r.cuerpo).toBe("");
      expect(e.registro()).not.toMatch(APLICACION);
      expect(await fichas()).toEqual([`${PREFIJO_WHATSAPP}50:rechazado`]);
    } finally {
      e.detener();
    }
  }, 60_000);

  const VARIANTES = [
    "/API/TAREAS/PURGAR-RECHAZADOS",
    "/api/tareas/Purgar-Rechazados",
    "/api/tareas/%70urgar-rechazados",
    "/api/tareas/purgar-rechazados%2F",
    "/api/tareas/purgar-rechazados%252F",
    "/api/tareas/%2e/purgar-rechazados",
    "/api/tareas/x/%2e%2e/purgar-rechazados",
    "/api//tareas/purgar-rechazados",
    "/api/tareas/purgar-rechazados;x",
    "/api/tareas/purgar-rechazados.json",
    "/api/tareas/purgar-rechazados/x",
    "/api/tareas/",
    "/api/tareas",
    "/api/tareas/purgar-rechazados/",
    "/api/tareas/purgar-rechazados//",
  ];

  it("ninguna variante de la ruta ejecuta SIN el secreto", async () => {
    const e = await levantarParaTareas("principal", ctx);
    try {
      for (const ruta of VARIANTES) {
        for (const metodo of ["GET", "HEAD"]) {
          const r = await crudo(e.base, metodo, ruta);
          expect([404, 308], `${metodo} ${ruta}: ${r.status}`).toContain(r.status);
        }
      }
      expect(e.registro()).not.toMatch(APLICACION);
      expect(await fichas()).toEqual([`${PREFIJO_WHATSAPP}50:rechazado`]);
    } finally {
      e.detener();
    }
  }, 120_000);

  it("con el secreto, solo ejecutan la ruta exacta, sus segmentos `%2e` (Fetch los normaliza a la misma ruta) y la barra final (6b)", async () => {
    const e = await levantarParaTareas("principal", ctx);
    try {
      const ejecutan: string[] = [];
      for (const ruta of VARIANTES.filter((r) => !r.endsWith("purgar-rechazados/"))) {
        const r = await crudo(e.base, "GET", ruta, [["authorization", `Bearer ${ctx.secreto}`]]);
        if (r.status !== 404 && r.status !== 308) ejecutan.push(`${ruta} → ${r.status}`);
        else expect(r.headers["content-type"] ?? "", ruta).not.toMatch(/json/);
      }
      // `%2e` = `.`: el emulador construye un `Request` (WHATWG) que colapsa los puntos. Es la MISMA ruta y
      // pasa por la misma puerta; en Vercel la tabla de rutas (`^/api/tareas/purgar-rechazados/?$`) ni la casa.
      expect(ejecutan).toEqual(["/api/tareas/%2e/purgar-rechazados → 200", "/api/tareas/x/%2e%2e/purgar-rechazados → 200"]);
      expect(await fichas()).toEqual([]);

      // La barra final SÍ ejecuta en Astro (Next da 308). Requiere el mismo secreto: no abre nada nuevo.
      const conBarra = await crudo(e.base, "GET", `${RUTA_PURGA}/`, [["authorization", `Bearer ${ctx.secreto}`]]);
      expect(conBarra.status).toBe(200);
      expect(JSON.parse(conBarra.cuerpo)).toMatchObject({ eliminados: 0, fallidos: 0 });
    } finally {
      e.detener();
    }
  }, 120_000);
});

describe("el plazo de 90 días sobre la build", () => {
  it("90 d + 5 min se purga; 90 d − 5 min, sin fecha de rechazo o no rechazado, no", async () => {
    await ctx.consultar(`DELETE FROM "Negocio" WHERE whatsapp LIKE $1`, [`${PREFIJO_WHATSAPP}%`]);
    await sembrar([
      { n: 60, estado: "rechazado", rechazadoHaceMs: 90 * DIA_MS + 5 * 60_000, foto: 60 },
      { n: 61, estado: "rechazado", rechazadoHaceMs: 90 * DIA_MS - 5 * 60_000, foto: 61 },
      { n: 62, estado: "rechazado", rechazadoHaceMs: null },
      { n: 63, estado: "publicado", rechazadoHaceMs: 400 * DIA_MS, foto: 63 },
      { n: 64, estado: "en_revision", rechazadoHaceMs: 400 * DIA_MS },
    ]);
    const ajenos = await ajenosCondenados();
    const e = await levantarParaTareas("sin-correo", ctx);
    try {
      const r = await e.pedir(RUTA_PURGA, { headers: { authorization: `Bearer ${ctx.secreto}` } });
      expect(r.status).toBe(200);
      const json = await r.json();
      const { fichas: quedan, archivos } = await resumenDeTareas(ctx.consultar, ctx.fotosDir);
      expect(quedan).toEqual([61, 62, 63, 64].map((n, i) => `${PREFIJO_WHATSAPP}${n}:${["rechazado", "rechazado", "publicado", "en_revision"][i]}`));
      expect(json).toMatchObject({ eliminados: 1 + ajenos, fallidos: 0 });
      expect(archivos.some((a) => a.startsWith(claveDeFoto(60)))).toBe(false);
      expect(archivos.filter((a) => a.startsWith(claveDeFoto(61)) || a.startsWith(claveDeFoto(63)))).toHaveLength(4);
    } finally {
      e.detener();
      await ctx.consultar(`DELETE FROM "Negocio" WHERE whatsapp LIKE $1`, [`${PREFIJO_WHATSAPP}%`]);
    }
  }, 60_000);
});

describe("concurrencia", () => {
  it("dos purgas y un barrido a la vez: cada ficha se cuenta una sola vez, sin fallidos ni 500", async () => {
    const condenadas = Array.from({ length: 8 }, (_, i) => ({ n: 70 + i, estado: "rechazado", rechazadoHaceMs: 120 * DIA_MS, foto: 70 + i }));
    await sembrar([...condenadas, { n: 80, estado: "publicado", rechazadoHaceMs: null, foto: 80 }]);
    const ajenos = await ajenosCondenados();
    const e = await levantarParaTareas("sin-correo", ctx);
    try {
      const auth = { authorization: `Bearer ${ctx.secreto}` };
      const [a, b, c] = await Promise.all([
        e.pedir(RUTA_PURGA, { headers: auth }),
        e.pedir(RUTA_PURGA, { headers: auth }),
        e.pedir(RUTA_BARRIDO, { headers: auth }),
      ]);
      const [ja, jb] = [await a.json(), await b.json()];
      await c.arrayBuffer();
      expect([a.status, b.status]).toEqual([200, 200]);
      expect(ja.fallidos + jb.fallidos).toBe(0);
      expect(ja.eliminados + jb.eliminados).toBe(8 + ajenos);
      const { fichas: quedan, archivos } = await resumenDeTareas(ctx.consultar, ctx.fotosDir);
      expect(quedan).toEqual([`${PREFIJO_WHATSAPP}80:publicado`]);
      // La foto del publicado sigue entera; las de las purgadas, ninguna.
      expect(archivos.filter((n) => n.startsWith(claveDeFoto(80)))).toHaveLength(2);
      expect(archivos.filter((n) => !n.startsWith(claveDeFoto(80)))).toEqual([]);
    } finally {
      e.detener();
      await ctx.consultar(`DELETE FROM "Negocio" WHERE whatsapp LIKE $1`, [`${PREFIJO_WHATSAPP}%`]);
    }
  }, 120_000);
});

describe("nombres hostiles en el almacén", () => {
  it("el barrido no toca lo que no es una foto ni sigue un enlace simbólico hacia fuera", async () => {
    await sembrar([{ n: 90, estado: "publicado", rechazadoHaceMs: null, foto: 90 }]);
    const fuera = path.join(ctx.dir, "fuera-del-almacen.txt");
    writeFileSync(fuera, "no se borra");
    const viejo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const hostiles = [
      "notas.txt",
      `${claveDeFoto(91)}.ficha.webp.bak`,
      `${claveDeFoto(91)}.otra.webp`,
      `${claveDeFoto(91).toUpperCase()}.ficha.webp`,
      `..${claveDeFoto(91)}.ficha.webp`,
      `${claveDeFoto(91)}.ficha.webp\n`,
    ];
    for (const h of hostiles) {
      const f = path.join(ctx.fotosDir, h);
      writeFileSync(f, "x");
      utimesSync(f, viejo, viejo);
    }
    // Un "huérfano" con forma de foto que es un enlace al archivo de fuera.
    const enlace = path.join(ctx.fotosDir, `${claveDeFoto(92)}.ficha.webp`);
    symlinkSync(fuera, enlace);
    const e = await levantarParaTareas("principal", ctx);
    try {
      const r = await e.pedir(RUTA_BARRIDO, { headers: { authorization: `Bearer ${ctx.secreto}` } });
      const cuerpo = await r.text();
      expect([200, 500], cuerpo).toContain(r.status);
      expect(cuerpo).not.toMatch(/[0-9a-f]{32}/);
      for (const h of hostiles) expect(existsSync(path.join(ctx.fotosDir, h)), h).toBe(true);
      expect(readdirSync(ctx.fotosDir).filter((n) => n.startsWith(claveDeFoto(90)))).toHaveLength(2);
      // Lo de fuera del almacén sigue ahí, pase lo que pase con el enlace.
      expect(existsSync(fuera)).toBe(true);
      expect(lstatSync(fuera).isFile()).toBe(true);
    } finally {
      e.detener();
      await ctx.consultar(`DELETE FROM "Negocio" WHERE whatsapp LIKE $1`, [`${PREFIJO_WHATSAPP}%`]);
    }
  }, 60_000);
});
