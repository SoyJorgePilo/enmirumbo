/**
 * Hallazgos M1 y M2 de c-seguridad (change `migrar-registro-astro`, 3b-1),
 * contra la SALIDA SERVIDA (emulador) con una sonda de lecturas
 * (`tests/fixtures/contar-lecturas.mjs`).
 *
 * Spec `plataforma-astro`: el registro se re-pinta en la respuesta al POST, el
 * tope de 6 MiB vale y "cualquier otra falla de Astro antes del manejador"
 * responde 200 con el formulario. Antes del arreglo, el renderizador de React
 * de Astro (`getFormState`) volvía a leer el cuerpo COMPLETO, sin tope, en
 * cada componente React de la página: 1 lectura de la Action + 8 al pintar, y
 * con 200 MB por trozos la memoria pasaba de ~336 a ~2286 MB.
 *
 * Todo ficticio: WhatsApp de la serie 77199917xx, IPs de documentación.
 */
import { readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { erroresDelFormulario } from "../scripts/enviar-formulario.mjs";
import type { PrismaClient } from "../src/generated/prisma/client";
import { VERSION_AVISO } from "../src/lib/legales/version";
import { MENSAJES_ERROR_FOTO, MENSAJES_ERROR_REGISTRO } from "../src/lib/registro/textos";
import { crearClientePrueba } from "./db";
import { postearPorTrozos } from "./postear-por-trozos";
import { type Emulador, construirSiHaceFalta, levantarEmulador } from "./salida-astro";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FOTOS_DIR = path.resolve(raiz, process.env.FOTOS_DIR ?? ".fotos-test");
const SONDA = path.join(os.tmpdir(), `contar-lecturas-${process.pid}.json`);
const ACCION = "/registro?_action=registrar";
const LIMITE = "limite-una-vez";
const MIB = 1024 * 1024;

let prisma: PrismaClient;
let emulador: Emulador;
let categoriaId = "";
let coloniaId = "";
let ip = 0;
const otraIp = () => `198.51.100.${10 + (ip++ % 200)}`;

type Sonda = { lecturas: number; picoRssMb: number };
const sonda = (): Sonda => JSON.parse(readFileSync(SONDA, "utf8")) as Sonda;

/** Un registro con un WhatsApp inválido: la Action corre y la página se vuelve a pintar con el error. */
function camposConError(): Array<[string, string]> {
  return [
    ["sitio_web", ""],
    ["nombre", "Taller Ficticio Una Vez"],
    ["categoriaId", categoriaId],
    ["whatsapp", "12345"],
    ["coloniaId", coloniaId],
    ["consentimiento", "on"],
    ["avisoVersion", VERSION_AVISO],
  ];
}

function multipart(campos: Array<[string, string]>): string {
  return campos.map(([k, v]) => `--${LIMITE}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`).join("") + `--${LIMITE}--\r\n`;
}

/**
 * POST por trozos (`Transfer-Encoding: chunked`, sin `Content-Length`): el
 * principio, `relleno` MiB de foto y el final. Respeta la contrapresión y deja
 * de escribir en cuanto llega la respuesta (`tests/postear-por-trozos.ts`).
 */
async function enviarPorTrozos(inicio: string, rellenoMib: number, fin: string): Promise<{ status: number; html: string }> {
  const trozo = Buffer.alloc(MIB, 0x41);
  const r = await postearPorTrozos(
    new URL(ACCION, emulador.base),
    { origin: emulador.base, "content-type": `multipart/form-data; boundary=${LIMITE}`, "transfer-encoding": "chunked", "x-forwarded-for": otraIp() },
    {
      *trozos() {
        yield inicio;
        for (let i = 0; i < rellenoMib; i++) yield trozo;
        yield fin;
      },
    },
  );
  return { status: r.status, html: r.cuerpo };
}

beforeAll(async () => {
  construirSiHaceFalta();
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = String((await prisma.categoria.findFirstOrThrow({ orderBy: { id: "asc" } })).id);
  coloniaId = String((await prisma.colonia.findFirstOrThrow({ orderBy: { id: "asc" } })).id);
  emulador = await levantarEmulador(
    { NODE_ENV: "development", SITIO_URL: "https://enmirumbo.example", FOTOS_DIR, REGISTRO_ENCABEZADO_IP: "x-forwarded-for", CONTAR_LECTURAS_ARCHIVO: SONDA },
    { precargas: ["tests/fixtures/contar-lecturas.mjs"] },
  );
}, 300_000);

afterAll(async () => {
  emulador?.detener();
  rmSync(SONDA, { force: true });
  await prisma.$disconnect();
});

describe("M2 · el cuerpo del envío se lee UNA sola vez", () => {
  it("con Content-Length: un error de validación re-pinta el formulario con una sola lectura del multipart", async () => {
    const antes = sonda().lecturas;
    const r = await emulador.pedir(ACCION, {
      method: "POST",
      body: multipart(camposConError()),
      headers: { origin: emulador.base, "content-type": `multipart/form-data; boundary=${LIMITE}`, "x-forwarded-for": otraIp() },
    });
    expect(r.status).toBe(200);
    expect(erroresDelFormulario(await r.text())).toMatchObject({ whatsapp: MENSAJES_ERROR_REGISTRO.whatsapp });
    expect(sonda().lecturas - antes).toBe(1);
  });

  it("por trozos (sin Content-Length): lo mismo, una sola lectura", async () => {
    const antes = sonda().lecturas;
    const r = await enviarPorTrozos(multipart(camposConError()), 0, "");
    expect(r.status).toBe(200);
    expect(erroresDelFormulario(r.html)).toMatchObject({ whatsapp: MENSAJES_ERROR_REGISTRO.whatsapp });
    expect(sonda().lecturas - antes).toBe(1);
  });

  it("200 MB por trozos: corta en el tope, 200 con 'Esa foto pesa más de 5 MB', sin interpretar el cuerpo y sin que la memoria se dispare", async () => {
    const antes = sonda();
    const inicio = `--${LIMITE}\r\nContent-Disposition: form-data; name="foto"; filename="x.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`;
    const fin = `\r\n${multipart(camposConError())}`;
    const r = await enviarPorTrozos(inicio, 200, fin);
    expect(r.status).toBe(200);
    expect(erroresDelFormulario(r.html)).toEqual({ foto: MENSAJES_ERROR_FOTO.demasiadoGrande });
    const despues = sonda();
    // El tope corta al leer: nadie llega a interpretar el cuerpo como formulario.
    expect(despues.lecturas - antes.lecturas).toBe(0);
    // Antes del arreglo el pico subía ~1950 MB; con el tope, unos cuantos MiB.
    expect(despues.picoRssMb - antes.picoRssMb).toBeLessThan(150);
    expect(emulador.registro()).not.toMatch(/TypeError|\bat\s+\S+\s+\(/);
  }, 120_000);
});

describe("M1 · un multipart malformado no rompe la respuesta", () => {
  it("una parte sin `name`: 200 con el formulario y el error general, y el emulador sigue vivo", async () => {
    const cuerpo = `--${LIMITE}\r\nContent-Disposition: form-data\r\n\r\nsin nombre\r\n--${LIMITE}\r\nContent-Disposition: form-data; name="nombre"\r\n\r\nX\r\n--${LIMITE}--\r\n`;
    const r = await emulador.pedir(ACCION, {
      method: "POST",
      body: cuerpo,
      headers: { origin: emulador.base, "content-type": `multipart/form-data; boundary=${LIMITE}`, "x-forwarded-for": otraIp() },
    });
    expect(r.status).toBe(200);
    expect(erroresDelFormulario(await r.text())).toEqual({ general: MENSAJES_ERROR_REGISTRO.servidor });
    expect((await emulador.pedir("/registro")).status).toBe(200);
  });

  it("truncado (sin el cierre): lo mismo", async () => {
    const cuerpo = `--${LIMITE}\r\nContent-Disposition: form-data; name="nombre"\r\n\r\nX`;
    const r = await emulador.pedir(ACCION, {
      method: "POST",
      body: cuerpo,
      headers: { origin: emulador.base, "content-type": `multipart/form-data; boundary=${LIMITE}`, "x-forwarded-for": otraIp() },
    });
    expect(r.status).toBe(200);
    expect(erroresDelFormulario(await r.text())).toEqual({ general: MENSAJES_ERROR_REGISTRO.servidor });
  });

  it("a /500?_action=registrar: la respuesta llega completa, sin ejecutar nada", async () => {
    const cuerpo = `--${LIMITE}\r\nContent-Disposition: form-data\r\n\r\nsin nombre\r\n--${LIMITE}--\r\n`;
    const r = await emulador.pedir("/500?_action=registrar", {
      method: "POST",
      body: cuerpo,
      headers: { origin: emulador.base, "content-type": `multipart/form-data; boundary=${LIMITE}`, "x-forwarded-for": otraIp() },
    });
    expect(r.headers.get("location")).toBeNull();
    const html = await r.text();
    expect(html).toMatch(/<\/html>\s*$/);
    expect((await emulador.pedir("/registro")).status).toBe(200);
  });
});
