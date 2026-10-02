/**
 * Etapa C (seguridad) del change `migrar-formularios-publicos-astro` (T-024,
 * Fase 3a): pruebas adversariales que el camino feliz no cubre, contra la
 * SALIDA SERVIDA (build real + emulador del Build Output API).
 *
 * - la regla de origen ante orígenes raros (puerto, userinfo, subdominio,
 *   vacío, varios valores) y métodos de escritura distintos de POST;
 * - el candado de Actions ante nombres inyectados y cuerpos que no son
 *   formulario;
 * - la vía RPC cuando SÍ llega a la función (si la tabla de Vercel cambiara):
 *   la defensa en profundidad del middleware;
 * - cuerpos hostiles (multipart roto, `__proto__`, bomba de campos, archivo
 *   en vez de texto) sin 500 ni escritura indebida;
 * - la llave del cupo ante `x-real-ip`, `x-vercel-forwarded-for` y varias
 *   líneas de `x-forwarded-for`;
 * - el guardián de `clientAddress` en TODO `src/`, también por la vía
 *   indirecta (`getClientIpAddress`).
 *
 * Todo ficticio: WhatsApp 77199979xx, IPs de documentación (RFC 5737),
 * dominios `.example`.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import type { PrismaClient } from "../src/generated/prisma/client";
import { construirSegmentoFicha } from "../src/lib/ficha-url";
import { cabecerasDeSeguridad } from "../src/lib/seguridad/csp";
import { crearClientePrueba } from "./db";
import { borrarNegociosSembrados } from "./limpieza";
import { type Emulador, construirSiHaceFalta, levantarEmulador } from "./salida-astro";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const URL_PUBLICA = "https://enmirumbo.example";
const WHATSAPP = { a: "7719997901", b: "7719997902", c: "7719997903" };
const NOMBRES = { a: "Tlapalería Ficticia Adversaria", b: "Papelería Ficticia Del Cupo", c: "Recaudería Ficticia Del Cuerpo" };

let prisma: PrismaClient;
let e: Emulador;
/** El mismo build con `/_actions/*` de vuelta en la tabla: la petición SÍ llega a la función. */
let conRpc: Emulador;
let salidaConRpc = "";
const ids = { a: "", b: "", c: "" };

const ruta = (k: keyof typeof ids) => `/negocio/${construirSegmentoFicha(NOMBRES[k], ids[k])}/reportar`;
const accion = (k: keyof typeof ids) => `${ruta(k)}?_action=reportar`;
const cuantos = () => prisma.reporte.count({ where: { negocioId: { in: Object.values(ids) } } });
const limpiar = () => prisma.reporte.deleteMany({ where: { negocioId: { in: Object.values(ids) } } });

function post(em: Emulador, destino: string, cuerpo: BodyInit | null, cabeceras: Record<string, string> = {}, metodo = "POST") {
  return em.pedir(destino, {
    method: metodo,
    body: cuerpo,
    headers: { "content-type": "application/x-www-form-urlencoded", origin: em.base, ...cabeceras },
  });
}

function lasCuatro(r: Response, etiqueta: string) {
  for (const { key, value } of cabecerasDeSeguridad()) expect(r.headers.get(key), `${etiqueta} · ${key}`).toBe(value);
}

/** Copia "ligera" de la salida (enlaces simbólicos) con `/_actions/*` hacia la función. */
function salidaConRpcEnLaTabla(): string {
  const original = path.join(raiz, ".vercel/output");
  const destino = mkdtempSync(path.join(tmpdir(), "c-seguridad-3a-"));
  for (const nombre of readdirSync(original)) {
    if (nombre === "config.json") continue;
    symlinkSync(path.join(original, nombre), path.join(destino, nombre));
  }
  const config = JSON.parse(readFileSync(path.join(original, "config.json"), "utf8")) as { routes: Array<Record<string, unknown>> };
  const filesystem = config.routes.findIndex((r) => r.handle === "filesystem");
  config.routes.splice(filesystem + 1, 0, { src: "^/_actions/(.*)$", dest: "_render" });
  writeFileSync(path.join(destino, "config.json"), JSON.stringify(config));
  return destino;
}

beforeAll(async () => {
  construirSiHaceFalta();
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  await borrarNegociosSembrados(prisma, Object.values(WHATSAPP));
  const categoriaId = (await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })).id;
  for (const k of Object.keys(ids) as Array<keyof typeof ids>) {
    ids[k] = (
      await prisma.negocio.create({
        data: { nombre: NOMBRES[k], categoriaId, whatsapp: WHATSAPP[k], estado: "publicado", publicadoEn: new Date(), consintioAvisoEn: new Date() },
      })
    ).id;
  }
  salidaConRpc = salidaConRpcEnLaTabla();
  [e, conRpc] = await Promise.all([
    levantarEmulador({ SITIO_URL: URL_PUBLICA, REGISTRO_ENCABEZADO_IP: "x-forwarded-for" }),
    levantarEmulador({ SITIO_URL: undefined, REGISTRO_ENCABEZADO_IP: undefined, SALIDA_VERCEL: salidaConRpc }),
  ]);
}, 300_000);

afterAll(async () => {
  e?.detener();
  conRpc?.detener();
  if (salidaConRpc) rmSync(salidaConRpc, { recursive: true, force: true });
  await borrarNegociosSembrados(prisma, Object.values(WHATSAPP));
  await prisma.$disconnect();
});

describe("c-seguridad 3a · regla de origen ante orígenes raros", () => {
  it("puerto distinto, subdominio, userinfo hacia otro host, vacío, file:// y dos valores: 403 con las cuatro y sin fila", async () => {
    await limpiar();
    const host = new URL(e.base).host;
    const casos = [
      `http://127.0.0.1:${Number(new URL(e.base).port) + 1}`,
      `http://sub.${host}`,
      `http://${host}@evil.example`,
      "",
      "file://",
      `${e.base}, https://evil.example`,
      `https://evil.example, ${e.base}`,
      "null",
      "javascript:alert(1)",
    ];
    for (const origin of casos) {
      const r = await post(e, accion("a"), "motivo=cerrado", { origin });
      expect(r.status, `Origin ${JSON.stringify(origin)}`).toBe(403);
      lasCuatro(r, `Origin ${JSON.stringify(origin)}`);
      const html = await r.text();
      expect(html).toContain("No pudimos recibir tu envío");
      expect(html).not.toContain("evil.example");
    }
    expect(await cuantos()).toBe(0);
  });

  it("PUT, PATCH y DELETE de otro origen también reciben el 403 en español (alcance de Astro, no de Next)", async () => {
    for (const metodo of ["PUT", "PATCH", "DELETE"]) {
      const r = await post(e, accion("a"), metodo === "DELETE" ? null : "motivo=cerrado", { origin: "https://evil.example" }, metodo);
      expect(r.status, metodo).toBe(403);
      lasCuatro(r, metodo);
    }
    expect(await cuantos()).toBe(0);
  });

  it("un X-Forwarded-Host con el primer valor vacío cae a Host (como parseHostHeader de Next): el origen ajeno sigue siendo 403", async () => {
    const r = await post(e, accion("a"), "motivo=cerrado", { origin: "https://evil.example", "x-forwarded-host": " , evil.example" });
    expect(r.status).toBe(403);
    expect(await cuantos()).toBe(0);
  });

  it("el 403 a /envio-rechazado?_action=reportar no entra en bucle de rewrite ni escribe; el mismo con Origin propio es la 404", async () => {
    const ajeno = await post(e, "/envio-rechazado?_action=reportar", "motivo=cerrado", { origin: "https://evil.example" });
    expect(ajeno.status).toBe(403);
    const propio = await post(e, "/envio-rechazado?_action=reportar", "motivo=cerrado");
    expect(propio.status).toBe(404);
    lasCuatro(propio, "propio");
    expect(await cuantos()).toBe(0);
  });
});

describe("c-seguridad 3a · candado de Actions ante nombres y cuerpos inyectados", () => {
  it("nombres que no están en la tabla (prototipo, mayúsculas, sufijos, espacios, el segundo valor) no ejecutan nada", async () => {
    await limpiar();
    for (const consulta of [
      "__proto__",
      "constructor",
      "toString",
      "hasOwnProperty",
      "REPORTAR",
      "reportar%2F",
      "reportar.x",
      "%20reportar",
      "inventada&_action=reportar",
    ]) {
      const r = await post(e, `${ruta("a")}?_action=${consulta}`, "motivo=cerrado");
      expect(r.status, consulta).toBe(404);
      expect(r.headers.getSetCookie(), consulta).toEqual([]);
      lasCuatro(r, consulta);
    }
    expect(await cuantos()).toBe(0);
  });

  it("la Action correcta con JSON, text/plain o sin Content-Type: 303 a ?error=servidor, sin fila ni cookie", async () => {
    await limpiar();
    for (const [tipo, cuerpo] of [
      ["application/json", JSON.stringify({ motivo: "cerrado" })],
      ["text/plain", "motivo=cerrado"],
      ["", "motivo=cerrado"],
    ] as const) {
      const r = await post(e, accion("a"), cuerpo, { "content-type": tipo });
      expect(r.status, tipo || "sin tipo").toBe(303);
      expect(r.headers.get("location"), tipo).toBe(`${ruta("a")}?error=servidor`);
      expect(r.headers.getSetCookie(), tipo).toEqual([]);
    }
    expect(await cuantos()).toBe(0);
  });

  it("PUT con ?_action=reportar y Origin propio no ejecuta la Action", async () => {
    await limpiar();
    const r = await post(e, accion("a"), "motivo=cerrado", {}, "PUT");
    expect(r.status).toBeLessThan(500);
    expect(await cuantos()).toBe(0);
  });

  it("un POST a la página sin ?_action (con _astroAction en el cuerpo) solo pinta el formulario", async () => {
    await limpiar();
    const r = await post(e, ruta("a"), "_astroAction=reportar&motivo=cerrado");
    expect(r.status).toBe(200);
    expect(await cuantos()).toBe(0);
  });
});

describe("c-seguridad 3a · la vía RPC cuando SÍ llega a la función (defensa en profundidad)", () => {
  it("/_actions/reportar (formulario y JSON) y /_actions/inventada: la 404 de la función, sin fila, sin cookie y nunca 500", async () => {
    await limpiar();
    const referencia = await conRpc.pedir("/loquesea");
    const cuerpoReferencia = await referencia.text();
    for (const [destino, tipo, cuerpo] of [
      ["/_actions/reportar", "application/x-www-form-urlencoded", "motivo=cerrado"],
      ["/_actions/reportar", "application/json", JSON.stringify({ motivo: "cerrado" })],
      ["/_actions/inventada", "application/x-www-form-urlencoded", "motivo=cerrado"],
      [`/_actions/reportar?_action=reportar`, "application/x-www-form-urlencoded", "motivo=cerrado"],
    ] as const) {
      const r = await post(conRpc, destino, cuerpo, { "content-type": tipo });
      expect(r.status, destino).toBe(404);
      expect(await r.text(), destino).toBe(cuerpoReferencia);
      expect(r.headers.getSetCookie(), destino).toEqual([]);
      lasCuatro(r, destino);
    }
    expect(await cuantos()).toBe(0);
  });
});

describe("c-seguridad 3a · cuerpos hostiles", () => {
  it("multipart roto o sin boundary: ?error=servidor, sin fila y sin 500", async () => {
    await limpiar();
    for (const [tipo, cuerpo] of [
      ["multipart/form-data; boundary=XYZ", '--XYZ\r\nContent-Disposition: form-data; name="motivo"\r\n\r\ncerr'],
      ["multipart/form-data", "motivo=cerrado"],
    ] as const) {
      const r = await post(e, accion("c"), cuerpo, { "content-type": tipo });
      expect(r.status, tipo).toBe(303);
      expect(r.headers.get("location"), tipo).toBe(`${ruta("c")}?error=servidor`);
    }
    expect(await cuantos()).toBe(0);
  });

  it("nombres de campo hostiles (__proto__, constructor) no rompen nada: el reporte válido se guarda una vez", async () => {
    await limpiar();
    const r = await post(e, accion("c"), "__proto__=x&constructor=y&__proto__%5Bpolluted%5D=1&motivo=cerrado");
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe(`${ruta("c")}/gracias`);
    expect(await cuantos()).toBe(1);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("un archivo en lugar del motivo o del comentario se trata como vacío: ?error=motivo y sin fila", async () => {
    await limpiar();
    const fd = new FormData();
    fd.append("motivo", new Blob(["cerrado"]), "motivo.txt");
    fd.append("comentario", new Blob(["texto ficticio"]), "c.txt");
    const r = await e.pedir(accion("c"), { method: "POST", body: fd, headers: { origin: e.base } });
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe(`${ruta("c")}?error=motivo`);
    expect(await cuantos()).toBe(0);
  });

  it("una bomba de 200 000 campos bajo el tope no tumba la función (303, nunca 500)", async () => {
    await limpiar();
    const cuerpo = `${Array.from({ length: 200_000 }, (_, i) => `f${i}=x`).join("&")}&motivo=cerrado`;
    const r = await post(e, accion("c"), cuerpo);
    expect(r.status).toBe(303);
    const siguiente = await e.pedir(ruta("c"));
    expect(siguiente.status).toBe(200);
  });
});

describe("c-seguridad 3a · la llave del cupo no la elige quien envía", () => {
  it("rotar x-real-ip, x-vercel-forwarded-for y el primer valor (en dos líneas de x-forwarded-for) no evade el cupo", async () => {
    await limpiar();
    const destinos: string[] = [];
    for (let i = 1; i <= 4; i++) {
      const cabeceras = new Headers({ "content-type": "application/x-www-form-urlencoded", origin: e.base });
      cabeceras.append("x-forwarded-for", `192.0.2.${i}`);
      cabeceras.append("x-forwarded-for", "203.0.113.79");
      cabeceras.set("x-real-ip", `198.51.100.${i}`);
      cabeceras.set("x-vercel-forwarded-for", `198.51.100.${i + 10}`);
      const r = await e.pedir(accion("b"), { method: "POST", body: "motivo=cerrado", headers: cabeceras });
      destinos.push(r.headers.get("location") ?? "");
    }
    expect(destinos.slice(0, 3).every((d) => d.endsWith("/reportar/gracias"))).toBe(true);
    expect(destinos[3]).toBe(`${ruta("b")}?error=cupo`);
  });
});

// ── Guardián ampliado: nadie en src/ deduce la IP como el marco ─────────────

function archivosDeCodigo(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const completo = path.join(dir, nombre);
    if (statSync(completo).isDirectory()) return nombre === "generated" ? [] : archivosDeCodigo(completo);
    return /\.(ts|tsx|mts|js|mjs|astro)$/.test(nombre) ? [completo] : [];
  });
}

describe("c-seguridad 3a · clientAddress en todo src/", () => {
  it("ningún archivo de src/ usa clientAddress ni getClientIpAddress del adaptador", () => {
    const culpables = archivosDeCodigo(path.join(raiz, "src")).filter((archivo) =>
      /clientAddress|getClientIpAddress|@astrojs\/internal-helpers\/request/.test(readFileSync(archivo, "utf8")),
    );
    expect(culpables.map((a) => path.relative(raiz, a))).toEqual([]);
  });
});

// ── Hallazgo M1 de c-seguridad (preexistente desde la Fase 1) ───────────────

describe("c-seguridad 3a · respuestas que salen antes del middleware", () => {
  // `@astrojs/vercel/dist/serverless/entrypoint.js:46-51`: cualquier petición
  // con `x-astro-locals` y sin el secreto recibe "Forbidden" en texto plano,
  // en inglés y sin las cuatro cabeceras, antes del middleware. Contradice
  // "Ninguna respuesta del sitio DEBE volver a salir así". Al cerrarlo, esta
  // prueba se pone roja: pásese a `it`.
  it.fails("[c-seguridad M1] una petición con x-astro-locals recibe las cuatro cabeceras", async () => {
    const r = await e.pedir("/", { headers: { "x-astro-locals": "{}" } });
    lasCuatro(r, "x-astro-locals");
  });
});
