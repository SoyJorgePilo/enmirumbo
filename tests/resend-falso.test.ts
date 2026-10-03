/**
 * El Resend falso de las pruebas sobre la build (change
 * `migrar-tareas-programadas-astro`, design.md §5.1; tasks.md #2): su guion,
 * la memoria de claves del día, el registro de llamadas (sin el valor de
 * `Authorization`), que cualquier otro host externo falla, y que nada de
 * `src/` ni de la build lo menciona. Todo ficticio: buzones `@ejemplo.invalid`
 * y una llave `re_prueba_falsa`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import { crearFetchFalso, instalarResendFalso, leerGuion } from "./fixtures/resend-falso.mjs";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const API = "https://api.resend.com/emails";
const LLAVE = "re_prueba_falsa_que_no_abre_nada";

type Llamada = {
  metodo: string;
  url: string;
  autorizacion: "sí" | "no";
  idempotencyKey: string | null;
  userAgent: string | null;
  cuerpo: { from?: string; to?: string[]; subject?: string; text?: string };
  respuesta: number | "sin-respuesta";
};

function falso(guion = "aceptado") {
  const llamadas: Llamada[] = [];
  const locales: string[] = [];
  const original = (async (entrada: RequestInfo | URL) => {
    locales.push(String(entrada));
    return new Response("local");
  }) as typeof fetch;
  const pedir = crearFetchFalso(leerGuion(guion), (l: Record<string, unknown>) => llamadas.push(l as Llamada), original) as typeof fetch;
  return { pedir, llamadas, locales };
}

const mandar = (pedir: typeof fetch, clave = "aviso-pendientes-2026-09-04", init: RequestInit = {}) =>
  pedir(API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LLAVE}`,
      "Content-Type": "application/json",
      "Idempotency-Key": clave,
      "User-Agent": "EnMiRumbo",
    },
    body: JSON.stringify({
      from: "EnMiRumbo <avisos@ejemplo.invalid>",
      to: ["admin@ejemplo.invalid"],
      subject: "3 pendientes",
      text: "Hay 3 pendientes: https://enmirumbo.example/admin",
    }),
    ...init,
  });

describe("resend falso · guion", () => {
  it("aceptado (200), rechazado (422), repetido (409 en frío) y error (503)", async () => {
    for (const [guion, status] of [["aceptado", 200], ["rechazado", 422], ["repetido", 409], ["error", 503]] as const) {
      const { pedir } = falso(guion);
      expect((await mandar(pedir)).status, guion).toBe(status);
    }
  });

  it("repetido: el 409 es el de una clave ya usada (invalid_idempotent_request)", async () => {
    const { pedir } = falso("repetido");
    expect(((await (await mandar(pedir)).json()) as { name: string }).name).toBe("invalid_idempotent_request");
  });

  it("aceptado recuerda la clave del día: la segunda petición con la misma clave es un 409, como el proveedor", async () => {
    const { pedir, llamadas } = falso("aceptado");
    expect((await mandar(pedir)).status).toBe(200);
    expect((await mandar(pedir)).status).toBe(409);
    // Otra clave (otro día) sí se acepta.
    expect((await mandar(pedir, "aviso-pendientes-2026-09-05")).status).toBe(200);
    expect(llamadas.map((l) => l.respuesta)).toEqual([200, 409, 200]);
  });

  it("tarda: no contesta hasta que la espera acotada aborta", async () => {
    const { pedir, llamadas } = falso("tarda");
    const abortador = new AbortController();
    const respuesta = mandar(pedir, undefined, { signal: abortador.signal });
    setTimeout(() => abortador.abort(), 20);
    await expect(respuesta).rejects.toBeDefined();
    expect(llamadas[0]?.respuesta).toBe("sin-respuesta");
  });

  it("un guion desconocido no arranca", () => {
    expect(() => leerGuion("inventado")).toThrow();
    expect(leerGuion(undefined)).toBe("aceptado");
  });
});

describe("resend falso · registro y red", () => {
  it("apunta cada llamada sin el valor de Authorization", async () => {
    const { pedir, llamadas } = falso();
    await mandar(pedir);
    expect(llamadas).toEqual([
      {
        metodo: "POST",
        url: API,
        autorizacion: "sí",
        idempotencyKey: "aviso-pendientes-2026-09-04",
        userAgent: "EnMiRumbo",
        cuerpo: {
          from: "EnMiRumbo <avisos@ejemplo.invalid>",
          to: ["admin@ejemplo.invalid"],
          subject: "3 pendientes",
          text: "Hay 3 pendientes: https://enmirumbo.example/admin",
        },
        respuesta: 200,
      },
    ]);
    expect(JSON.stringify(llamadas)).not.toContain(LLAVE);
  });

  it("cualquier otro host externo falla; lo local pasa al fetch de verdad", async () => {
    const { pedir, llamadas, locales } = falso();
    await expect(pedir("https://example.com/")).rejects.toThrow(/host externo/);
    await expect(pedir("https://verify.twilio.com/v2/Services/x/Verifications")).rejects.toThrow(/host externo/);
    await expect(pedir("https://proyecto.supabase.co/storage/v1/object/fotos/x")).rejects.toThrow(/host externo/);
    await expect(pedir("ftp://example.com/")).rejects.toThrow();
    expect(await (await pedir("http://localhost/404.html")).text()).toBe("local");
    expect(await (await pedir("http://127.0.0.1:4321/x")).text()).toBe("local");
    expect(locales).toHaveLength(2);
    expect(llamadas).toEqual([]);
  });

  it("otra ruta del proveedor que no es el envío responde 404 y queda apuntada", async () => {
    const { pedir, llamadas } = falso();
    expect((await pedir("https://api.resend.com/domains")).status).toBe(404);
    expect(llamadas).toHaveLength(1);
  });

  it("instalado en el proceso, un fetch a https://example.com falla, y se deshace", async () => {
    const original = globalThis.fetch;
    const deshacer = instalarResendFalso({ RESEND_FALSO_GUION: "aceptado" });
    try {
      expect(globalThis.fetch).not.toBe(original);
      await expect(fetch("https://example.com/")).rejects.toThrow(/host externo/);
    } finally {
      deshacer();
    }
    expect(globalThis.fetch).toBe(original);
  });

  it("cargado con --import en otro proceso, un fetch a https://example.com lanza", () => {
    const fixture = pathToFileURL(path.join(raiz, "tests/fixtures/resend-falso.mjs")).href;
    const salida = execFileSync(
      process.execPath,
      [
        "--import",
        fixture,
        "-e",
        "fetch('https://example.com/').then(() => console.log('salió a la red'), (e) => console.log('bloqueado: ' + e.message))",
      ],
      { env: { PATH: process.env.PATH, NODE_ENV: "test", RESEND_FALSO_GUION: "aceptado" }, encoding: "utf8" },
    );
    expect(salida).toContain("bloqueado");
    expect(salida).toMatch(/host externo/);
    expect(salida).not.toContain("salió a la red");
  });
});

describe("resend falso · guion y registro en archivos", () => {
  it("con @<archivo> lee el guion en cada llamada y escribe una línea JSON por llamada", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "resend-falso-"));
    const guion = path.join(dir, "guion.txt");
    const registro = path.join(dir, "llamadas.jsonl");
    writeFileSync(guion, "aceptado");
    const original = globalThis.fetch;
    const deshacer = instalarResendFalso({ RESEND_FALSO_GUION: `@${guion}`, RESEND_FALSO_REGISTRO: registro });
    try {
      expect((await mandar(fetch)).status).toBe(200);
      writeFileSync(guion, "error\n");
      expect((await mandar(fetch, "otra-clave")).status).toBe(503);
    } finally {
      deshacer();
    }
    const lineas = readFileSync(registro, "utf8").trim().split("\n").map((l) => JSON.parse(l) as Llamada);
    expect(lineas.map((l) => l.respuesta)).toEqual([200, 503]);
    expect(readFileSync(registro, "utf8")).not.toContain(LLAVE);
    expect(globalThis.fetch).toBe(original);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("resend falso · guardián: solo vive en las pruebas", () => {
  function archivos(dir: string): string[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir).flatMap((n) => {
      const ruta = path.join(dir, n);
      return statSync(ruta).isDirectory() ? archivos(ruta) : [ruta];
    });
  }
  const mencionaAlFalso = (f: string) => /resend-falso|RESEND_FALSO_/.test(readFileSync(f, "utf8"));

  it("ningún archivo de src/ menciona resend-falso ni RESEND_FALSO_", () => {
    expect(archivos(path.join(raiz, "src")).filter(mencionaAlFalso)).toEqual([]);
  });

  it("ningún archivo de la build lo menciona (si hay build)", () => {
    const salida = path.join(raiz, ".vercel/output");
    const deTexto = archivos(salida).filter((f) => /\.(m?js|json|html|css|txt|xml)$/.test(f));
    expect(deTexto.filter(mencionaAlFalso)).toEqual([]);
  });
});
