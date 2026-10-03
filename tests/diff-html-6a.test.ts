/**
 * El comparador de las tareas programadas (`scripts/diff-html/tareas-6a.mjs`,
 * change `migrar-tareas-programadas-astro`, design.md §6): la ÚNICA
 * diferencia aceptada es la de otro método (Next 405/204), la `Vary` del
 * enrutador de Next solo se descuenta si es exactamente esa, y cualquier otra
 * cosa (un byte del cuerpo, una cabecera, una línea del log, un correo) sale
 * como diferencia. Sin build ni base.
 */
import { describe, expect, it } from "vitest";

import { cabecerasUtiles, compararPaso6a, encabezadosMalos, sesiones6a, VARY_DE_NEXT } from "../scripts/diff-html/tareas-6a.mjs";

const SEGURIDAD = { "content-security-policy": "default-src 'self'", "referrer-policy": "strict-origin-when-cross-origin", "x-content-type-options": "nosniff", "x-frame-options": "DENY" };
const b64 = (texto: string) => Buffer.from(texto).toString("base64");

function paso(extra: Record<string, unknown> = {}) {
  return {
    nombre: "la purga del día",
    metodo: "GET",
    ruta: "/api/tareas/purgar-rechazados",
    comparar: "exacto",
    status: 200,
    headers: { ...SEGURIDAD, "content-type": "application/json; charset=utf-8", "x-robots-tag": "noindex, nofollow" },
    cuerpo: b64('{"eliminados":2,"fallidos":0,"cuposLimpiados":1,"aviso":"mandado"}'),
    log: ["[purga] eliminados 2 registros rechazados con 90 días o más"],
    correo: [],
    ...extra,
  };
}

describe("compararPaso6a", () => {
  it("dos pasos iguales no tienen diferencias", () => {
    expect(compararPaso6a(paso(), paso())).toEqual({ diferencias: [], aceptada: false, vary: false });
  });

  it("la Vary del enrutador de Next se descuenta y se cuenta; otra Vary es una diferencia", () => {
    const next = paso({ headers: { ...paso().headers, vary: VARY_DE_NEXT } });
    expect(compararPaso6a(next, paso())).toEqual({ diferencias: [], aceptada: false, vary: true });
    const otra = paso({ headers: { ...paso().headers, vary: "accept-encoding" } });
    expect(compararPaso6a(otra, paso()).diferencias).toHaveLength(1);
  });

  it("un byte del cuerpo, una cabecera de más, una línea del log o un correo salen como diferencia", () => {
    expect(compararPaso6a(paso(), paso({ cuerpo: b64('{"eliminados":2,"fallidos":0,"cuposLimpiados":1,"aviso":"mandado" }') })).diferencias).toHaveLength(1);
    expect(compararPaso6a(paso(), paso({ headers: { ...paso().headers, "cache-control": "no-store" } })).diferencias).toHaveLength(1);
    expect(compararPaso6a(paso(), paso({ log: [] })).diferencias).toHaveLength(1);
    expect(compararPaso6a(paso(), paso({ correo: [{ respuesta: 200 }] })).diferencias).toHaveLength(1);
    expect(compararPaso6a(paso(), paso({ status: 500 })).diferencias).toHaveLength(1);
  });

  it("otro método: solo se acepta si Next dio 405 o 204", () => {
    const next = paso({ comparar: "otro-metodo", metodo: "POST", status: 405, cuerpo: "" });
    const astro = paso({ comparar: "otro-metodo", metodo: "POST", status: 404, cuerpo: "", headers: SEGURIDAD });
    expect(compararPaso6a(next, astro).aceptada).toBe(true);
    const nextQueCorrio = paso({ comparar: "otro-metodo", metodo: "POST", status: 200 });
    const r = compararPaso6a(nextQueCorrio, astro);
    expect(r.aceptada).toBe(false);
    expect(r.diferencias).toHaveLength(1);
  });

  it("la excepción no se aplica a GET ni a HEAD", () => {
    for (const s of sesiones6a()) {
      for (const p of s.pasos) {
        if (p.comparar === "otro-metodo") expect(["GET", "HEAD"], p.nombre).not.toContain(p.metodo);
      }
    }
  });
});

describe("casos y cabeceras", () => {
  it("las nueve formas de secreto malo son distintas del secreto y entre sí", () => {
    const secreto = "0123456789abcdef";
    const malos = encabezadosMalos(secreto).map(([, h]) => JSON.stringify(h));
    expect(malos).toHaveLength(9);
    expect(new Set(malos).size).toBe(9);
    expect(malos).not.toContain(JSON.stringify({ authorization: `Bearer ${secreto}` }));
  });

  it("cabecerasUtiles quita el transporte y las del emulador, y nada más", () => {
    expect(
      cabecerasUtiles({ Date: "x", Connection: "keep-alive", "Keep-Alive": "timeout=5", "Transfer-Encoding": "chunked", "Content-Length": "0", "x-vercel-id": "y", "X-Robots-Tag": "noindex", Vary: "a" }),
    ).toEqual({ vary: "a", "x-robots-tag": "noindex" });
  });

  it("ningún secreto ni ruta de la máquina quedó en los fixtures de Next", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const dir = new URL("./fixtures/next-6a/", import.meta.url);
    const archivos = readdirSync(dir);
    expect(archivos.length).toBe(sesiones6a().length);
    for (const archivo of archivos) {
      const texto = readFileSync(new URL(archivo, dir), "utf8");
      expect(texto, archivo).not.toMatch(/\/Users\/|\/private\/|\/tmp\/|Bearer [0-9a-f]{16}|re_prueba_falsa/);
    }
  });
});
