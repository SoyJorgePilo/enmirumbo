/**
 * Spec `plataforma-astro` (change `migrar-tareas-programadas-astro`, Fase 6a;
 * tasks.md #5): requirements "Sin el secreto correcto, las tareas programadas
 * no existen", "Un método que no es GET ni HEAD no dispara ninguna tarea" y
 * "El middleware no se interpone en el disparo de una tarea".
 *
 * Sobre la SALIDA SERVIDA, con el Resend falso y un `FOTOS_DIR` temporal:
 *
 * - las sesiones `puerta`, `sin-secreto` y `secreto-espacios` contra lo que
 *   respondió Next (`tests/fixtures/next-6a/`), con la base y el almacén
 *   intactos al final;
 * - el 404 de la puerta idéntico en todos los casos, en las dos rutas, con
 *   `GET` y `HEAD`, e igual al de la foto inventada salvo su `no-store`;
 * - los otros métodos (la ÚNICA diferencia aceptada contra Next, que da
 *   405/204) y las filas de la tabla del middleware (design.md §4);
 * - la puerta antes de la base: con una base que acepta la conexión y nunca
 *   contesta, ningún secreto malo llega a abrirla;
 * - el aviso de arranque sin `CRON_SECRET` en producción, una sola vez.
 *
 * Todo ficticio: fichas `77199966xx`, fotos `f6a…`, secreto aleatorio.
 */
import { createServer, type Server, type Socket } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  compararPaso6a,
  correrSesiones6a,
  encabezadosMalos,
  esElCuatrocientosCuatroVacio,
  FOTO_INVENTADA,
  RUTA_PURGA,
  RUTAS_DE_TAREAS,
  sesiones6a,
} from "../scripts/diff-html/tareas-6a.mjs";
import { resumenDeTareas, sembrarTareas } from "../scripts/sembrar-tareas.mjs";
import { cabecerasDeSeguridad } from "../src/lib/seguridad/csp";
import { construirSiHaceFalta } from "./salida-astro";
import {
  type ContextoDeTareas,
  fixtureDe6a,
  levantarParaTareas,
  type Paso6a,
  prepararTareas,
  type Sesion6a,
  soltarTareas,
} from "./tareas-astro";

const SESIONES = ["puerta", "sin-secreto", "secreto-espacios"];
const APLICACION = /\[(purga|fotos|aviso|borrado)\]|prisma|ECONNREFUSED|PrismaClient/i;

let ctx: ContextoDeTareas | undefined;
let astro: Record<string, Sesion6a> = {};

beforeAll(async () => {
  construirSiHaceFalta();
  ctx = await prepararTareas("tareas-puerta");
  const contexto = ctx;
  astro = (await correrSesiones6a({
    ...contexto,
    levantar: (instancia: string) => levantarParaTareas(instancia, contexto),
    sesiones: sesiones6a().filter((s) => SESIONES.includes(s.nombre)),
  })) as Record<string, Sesion6a>;
}, 300_000);

afterAll(async () => {
  await soltarTareas(ctx);
});

/** Lo que distingue a una respuesta: estado, cuerpo y cabeceras (sin la fecha ni el transporte). */
const firma = (p: Paso6a) => JSON.stringify({ status: p.status, cuerpo: p.cuerpo, headers: p.headers });
const pasosDe = (sesion: string) => astro[sesion].pasos;
const deTarea = (p: Paso6a) => RUTAS_DE_TAREAS.some((r: string) => p.ruta.split("?")[0] === r);

describe("sin el secreto correcto, las tareas no existen (contra Next)", () => {
  for (const nombre of SESIONES) {
    it(`${nombre}: igual que Next en cada paso (salvo la diferencia aceptada) y nada cambia en la base, el almacén ni el correo`, () => {
      const next = fixtureDe6a(nombre);
      expect(pasosDe(nombre)).toHaveLength(next.pasos.length);
      next.pasos.forEach((pn, i) => {
        expect(compararPaso6a(pn, pasosDe(nombre)[i]).diferencias, pn.nombre).toEqual([]);
      });
      // El estado inicial `puerta`: un rechazado de 91 días con foto, una huérfana vieja y una marca caducada.
      expect(astro[nombre].despues).toEqual(next.despues);
      expect(astro[nombre].despues.fichas).toHaveLength(1);
      expect(astro[nombre].despues.archivos).toHaveLength(4);
      expect(astro[nombre].despues.cupos).toBe(1);
      for (const p of pasosDe(nombre)) {
        expect(p.correo, p.nombre).toEqual([]);
        expect(p.log.join("\n"), p.nombre).not.toMatch(APLICACION);
      }
    });
  }
});

describe("el 404 de la puerta es uno solo", () => {
  it("un escáner prueba secretos: todas las respuestas son el 404 vacío, idénticas entre sí, en las dos rutas, con GET y HEAD", () => {
    const malos = SESIONES.flatMap((s) => pasosDe(s)).filter((p) => deTarea(p) && p.comparar === "exacto");
    // 9 formas × 2 rutas × 2 métodos, + GET ?_action sin secreto, + 6 + 6 sin secreto configurado / de espacios.
    expect(malos).toHaveLength(36 + 1 + 12);
    for (const p of malos) expect(esElCuatrocientosCuatroVacio(p), p.nombre).toBe(true);
    expect(new Set(malos.map(firma)).size).toBe(1);
    const [uno] = malos;
    for (const { key, value } of cabecerasDeSeguridad()) expect(uno.headers[key.toLowerCase()], key).toBe(value);
    expect(Object.keys(uno.headers).sort()).toEqual(cabecerasDeSeguridad().map(({ key }) => key.toLowerCase()).sort());
  });

  it("igual que el 404 de /api/foto/<32 ceros>/ficha, salvo el Cache-Control: no-store de la foto", () => {
    const foto = pasosDe("puerta").find((p) => p.ruta === FOTO_INVENTADA)!;
    const tarea = pasosDe("puerta").find((p) => deTarea(p) && p.comparar === "exacto")!;
    expect(foto.status).toBe(404);
    expect(foto.cuerpo).toBe("");
    expect(foto.headers["cache-control"]).toBe("no-store");
    const sinCache = { ...foto.headers };
    delete sinCache["cache-control"];
    expect(sinCache).toEqual(tarea.headers);
  });

  it("frente a una dirección inexistente, la diferencia es la de Next: la página 404 en HTML", () => {
    const inventada = pasosDe("puerta").find((p) => p.ruta === "/api/tareas/inventada")!;
    expect(inventada.status).toBe(404);
    expect(inventada.headers["content-type"]).toMatch(/^text\/html/);
    expect(Buffer.from(inventada.cuerpo, "base64").toString()).toContain("No encontramos esta página");
  });
});

describe("un método que no es GET ni HEAD no dispara ninguna tarea", () => {
  it("POST, PUT, PATCH, DELETE y OPTIONS con el secreto y Origin propio: el 404 vacío de la puerta (Next: 405/204, la diferencia aceptada)", () => {
    const otros = pasosDe("puerta").filter((p) => p.comparar === "otro-metodo" && !p.ruta.includes("?") && !p.nombre.startsWith("POST de otro origen"));
    expect(otros).toHaveLength(10);
    const malo = pasosDe("puerta").find((p) => deTarea(p) && p.comparar === "exacto")!;
    for (const p of otros) expect(firma(p), p.nombre).toBe(firma(malo));
    const next = fixtureDe6a("puerta").pasos.filter((p) => otros.some((o) => o.nombre === p.nombre));
    expect(next.map((p) => p.status).sort()).toEqual([204, 204, 405, 405, 405, 405, 405, 405, 405, 405]);
  });

  it("un POST de otro origen: la página 403 del sitio; con ?_action=: la 404 de la tabla de Actions; ninguno corre la tarea", async () => {
    await sembrarTareas(ctx!.consultar, ctx!.fotosDir, "puerta");
    const antes = await resumenDeTareas(ctx!.consultar, ctx!.fotosDir);
    const e = await levantarParaTareas("principal", ctx!);
    try {
      const secreto = { authorization: `Bearer ${ctx!.secreto}` };
      const ajeno = { ...secreto, origin: "https://evil.example" };
      const propio = { ...secreto, origin: e.base };
      const pedir = async (ruta: string, headers: Record<string, string>) => {
        const r = await e.pedir(ruta, { method: "POST", headers });
        return { status: r.status, cuerpo: await r.text() };
      };
      const tareaAjena = await pedir(RUTA_PURGA, ajeno);
      const raizAjena = await pedir("/", ajeno);
      expect(tareaAjena.status).toBe(403);
      expect(tareaAjena).toEqual(raizAjena);

      const tareaConAccion = await pedir(`${RUTA_PURGA}?_action=reportar`, propio);
      const raizConAccion = await pedir("/?_action=inventada", propio);
      expect(tareaConAccion.status).toBe(404);
      expect(tareaConAccion.cuerpo).toContain("No encontramos esta página");
      expect(tareaConAccion).toEqual(raizConAccion);

      expect(e.registro()).not.toMatch(APLICACION);
      expect(await resumenDeTareas(ctx!.consultar, ctx!.fotosDir)).toEqual(antes);
    } finally {
      e.detener();
    }
  }, 60_000);
});

describe("la puerta va antes de la base y de los archivos", () => {
  let tarpit: Server;
  let conexiones = 0;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    // Una "base" que acepta la conexión y nunca contesta: si alguien la abre, se nota aquí.
    tarpit = createServer((s) => {
      conexiones += 1;
      sockets.push(s);
      s.on("error", () => undefined);
    });
    await new Promise<void>((listo) => tarpit.listen(0, "127.0.0.1", listo));
  });

  afterAll(() => {
    for (const s of sockets) s.destroy();
    tarpit?.close();
  });

  it("con una base que nunca contesta, ningún secreto malo la abre ni tarda; con el secreto correcto sí se intenta", async () => {
    const puerto = (tarpit.address() as { port: number }).port;
    const e = await levantarParaTareas("principal", ctx!, { DATABASE_URL: `postgresql://nadie:nadie@127.0.0.1:${puerto}/ninguna` });
    try {
      for (const ruta of RUTAS_DE_TAREAS) {
        for (const [caso, headers] of encabezadosMalos(ctx!.secreto)) {
          const inicio = Date.now();
          const r = await e.pedir(ruta, { headers });
          expect(r.status, `${ruta} · ${caso}`).toBe(404);
          expect(await r.text(), caso).toBe("");
          expect(Date.now() - inicio, `${ruta} · ${caso}: tardó como si esperara a la base`).toBeLessThan(2_000);
        }
      }
      expect(conexiones, "un secreto malo abrió la base").toBe(0);
      expect(e.registro()).not.toMatch(APLICACION);

      // Con el secreto correcto la purga sí va a la base (y se queda esperando).
      await e
        .pedir(RUTA_PURGA, { headers: { authorization: `Bearer ${ctx!.secreto}` }, signal: AbortSignal.timeout(3_000) })
        .then((r) => r.arrayBuffer())
        .catch(() => undefined);
      expect(conexiones).toBeGreaterThan(0);
    } finally {
      e.detener();
    }
  }, 60_000);
});

describe("falta el secreto en producción: se dice una sola vez", () => {
  const RUTAS = ["/", "/a/b/c", "/aviso-de-privacidad", "/terminos", "/robots.txt", "/sitemap.xml", "/loquesea", FOTO_INVENTADA, ...RUTAS_DE_TAREAS];
  const AVISO = /\[tareas\] falta CRON_SECRET/g;

  async function contarAvisos(extra: Record<string, string | undefined>): Promise<number> {
    const e = await levantarParaTareas("principal", ctx!, extra);
    try {
      expect(RUTAS).toHaveLength(10);
      for (const ruta of RUTAS) await (await e.pedir(ruta)).arrayBuffer();
      return (e.registroCompleto().match(AVISO) ?? []).length;
    } finally {
      e.detener();
    }
  }

  it("NODE_ENV=production sin CRON_SECRET: una vez en diez peticiones", async () => {
    expect(await contarAvisos({ NODE_ENV: "production", CRON_SECRET: undefined })).toBe(1);
  }, 60_000);

  it("con CRON_SECRET, o fuera de producción, no aparece", async () => {
    expect(await contarAvisos({ NODE_ENV: "production" })).toBe(0);
    expect(await contarAvisos({ NODE_ENV: "development", VERCEL_ENV: undefined, CRON_SECRET: undefined })).toBe(0);
  }, 60_000);
});
