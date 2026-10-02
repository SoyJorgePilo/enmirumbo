/**
 * El Twilio falso de las pruebas sobre la build (change
 * `migrar-registro-astro`, design.md §7; tasks.md #3): su guion, el registro
 * de llamadas, que cualquier otro host externo falla, y que nada de `src/` lo
 * menciona. Todo ficticio: credenciales `ACtest…` y números `771999xxxx`.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { crearFetchFalso, instalarTwilioFalso, leerGuion } from "./fixtures/twilio-falso.mjs";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SERVICIO = "https://verify.twilio.com/v2/Services/VAtest000000000000000000000000000000";

type Llamada = { ruta: string; parametros: Record<string, string> };

function falso(guion = "enviado") {
  const llamadas: Llamada[] = [];
  const locales: string[] = [];
  const original = (async (entrada: RequestInfo | URL) => {
    locales.push(String(entrada));
    return new Response("local");
  }) as typeof fetch;
  const pedir = crearFetchFalso(leerGuion(guion), (l: Llamada) => llamadas.push(l), original) as typeof fetch;
  return { pedir, llamadas, locales };
}

const pedirCodigo = (pedir: typeof fetch, init: RequestInit = {}) =>
  pedir(`${SERVICIO}/Verifications`, { method: "POST", body: "To=%2B527719990001&Channel=sms", ...init });

describe("twilio falso · guion", () => {
  it("enviado (201), rechazado (400) y error (503) al pedir el código", async () => {
    for (const [guion, status] of [["enviado", 201], ["rechazado", 400], ["error", 503]] as const) {
      const { pedir } = falso(guion);
      expect((await pedirCodigo(pedir)).status, guion).toBe(status);
    }
  });

  it("tarda: no contesta hasta que la espera acotada aborta", async () => {
    const { pedir } = falso("tarda");
    const abortador = new AbortController();
    const respuesta = pedirCodigo(pedir, { signal: abortador.signal });
    setTimeout(() => abortador.abort(), 20);
    await expect(respuesta).rejects.toBeDefined();
  });

  it("al comprobar: approved, pending y 404", async () => {
    for (const [guion, status, estado] of [["enviado,approved", 200, "approved"], ["enviado,pending", 200, "pending"], ["enviado,404", 404, undefined]] as const) {
      const { pedir } = falso(guion);
      const r = await pedir(`${SERVICIO}/VerificationCheck`, { method: "POST", body: "To=%2B527719990001&Code=123456" });
      expect(r.status, guion).toBe(status);
      expect(((await r.json()) as { status?: string }).status, guion).toBe(estado);
    }
  });

  it("un guion desconocido no arranca", () => {
    expect(() => leerGuion("inventado")).toThrow();
    expect(() => leerGuion("enviado,inventado")).toThrow();
    expect(leerGuion(undefined)).toEqual({ alPedir: "enviado", alComprobar: "approved" });
  });
});

describe("twilio falso · registro y red", () => {
  it("apunta cada llamada al proveedor con su ruta y sus parámetros", async () => {
    const { pedir, llamadas } = falso();
    await pedirCodigo(pedir);
    expect(llamadas).toEqual([{ ruta: "/Verifications", parametros: { To: "+527719990001", Channel: "sms" } }]);
  });

  it("cualquier otro host externo falla; lo local pasa al fetch de verdad", async () => {
    const { pedir, llamadas, locales } = falso();
    await expect(pedir("https://example.com/")).rejects.toThrow(/host externo/);
    await expect(pedir("https://api.twilio.com/2010-04-01/Accounts")).rejects.toThrow(/host externo/);
    await expect(pedir("ftp://example.com/")).rejects.toThrow();
    expect(await (await pedir("http://localhost/404.html")).text()).toBe("local");
    expect(await (await pedir("http://127.0.0.1:4321/x")).text()).toBe("local");
    expect(locales).toHaveLength(2);
    expect(llamadas).toEqual([]);
  });

  it("instalado en el proceso, un fetch a https://example.com falla, y se deshace", async () => {
    const original = globalThis.fetch;
    const deshacer = instalarTwilioFalso({ TWILIO_FALSO_GUION: "enviado" });
    try {
      expect(globalThis.fetch).not.toBe(original);
      await expect(fetch("https://example.com/")).rejects.toThrow(/host externo/);
    } finally {
      deshacer();
    }
    expect(globalThis.fetch).toBe(original);
  });
});

describe("twilio falso · guion en un archivo", () => {
  it("con @<archivo> lee el guion en cada llamada", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "twilio-falso-"));
    const archivo = path.join(dir, "guion.txt");
    writeFileSync(archivo, "enviado");
    const original = globalThis.fetch;
    const deshacer = instalarTwilioFalso({ TWILIO_FALSO_GUION: `@${archivo}` });
    try {
      expect((await pedirCodigo(fetch)).status).toBe(201);
      writeFileSync(archivo, "error\n");
      expect((await pedirCodigo(fetch)).status).toBe(503);
    } finally {
      deshacer();
      rmSync(dir, { recursive: true, force: true });
    }
    expect(globalThis.fetch).toBe(original);
  });
});

describe("twilio falso · guardián: solo vive en las pruebas", () => {
  function archivos(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const ruta = path.join(dir, n);
      return statSync(ruta).isDirectory() ? archivos(ruta) : [ruta];
    });
  }

  it("ningún archivo de src/ menciona twilio-falso ni TWILIO_FALSO_", () => {
    const culpables = archivos(path.join(raiz, "src")).filter((f) => /twilio-falso|TWILIO_FALSO_/.test(readFileSync(f, "utf8")));
    expect(culpables).toEqual([]);
  });
});
