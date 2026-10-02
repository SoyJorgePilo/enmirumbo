/**
 * Spec `plataforma-astro` (change `migrar-registro-astro`, Fase 3b-1),
 * requirement "Una falla del servidor durante un envío responde la página de
 * error, no la de no encontrado" (hallazgo O1 de d-validacion de 3a; tasks.md
 * #7), y el scenario "base caída al abrir el formulario".
 *
 * Contra la SALIDA SERVIDA con la base INALCANZABLE (`127.0.0.1:1`): cuando
 * una Action o la página que la atiende lanzan, Astro pinta `/500` pasando
 * otra vez por el middleware con la misma petición `POST …?_action=…`; antes
 * la tabla de Actions la respondía como "Action desde otra ruta" (404).
 *
 * Todo ficticio: WhatsApp 77199986xx, IPs de documentación.
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import type { PrismaClient } from "../src/generated/prisma/client";
import { VERSION_AVISO } from "../src/lib/legales/version";
import { MENSAJE_GRACIAS } from "../src/lib/registro/textos";
import { cabecerasDeSeguridad } from "../src/lib/seguridad/csp";
import { crearClientePrueba } from "./db";
import { jpegDePrueba } from "./fotos-fixtures";
import { borrarNegociosSembrados } from "./limpieza";
import { type Emulador, construirSiHaceFalta, levantarEmulador } from "./salida-astro";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FOTOS_DIR = path.resolve(raiz, process.env.FOTOS_DIR ?? ".fotos-test");
const CACHE_DINAMICO = "private, no-cache, no-store, max-age=0, must-revalidate";
const BASE_CAIDA = "postgresql://usuario:claveFicticiaO1@127.0.0.1:1/ninguna";
const WHATSAPP = Array.from({ length: 10 }, (_, i) => `77199986${String(i).padStart(2, "0")}`);
const ALGO_FALLO = "Algo falló de nuestro lado";

let prisma: PrismaClient;
/** Con la base inalcanzable. */
let caida: Emulador;
/** Con la base sana (para la `/500` pedida a mano). */
let sana: Emulador;
let categoriaId = 0;
let coloniaId = 0;

function lasCuatro(r: Response, etiqueta: string) {
  for (const { key, value } of cabecerasDeSeguridad()) expect(r.headers.get(key), `${etiqueta} · ${key}`).toBe(value);
  expect(r.headers.get("x-powered-by"), etiqueta).toBeNull();
}

const archivosDelAlmacen = () => (existsSync(FOTOS_DIR) ? readdirSync(FOTOS_DIR).length : 0);

function registro(whatsapp: string) {
  const cuerpo = new FormData();
  for (const [k, v] of Object.entries({
    nombre: "Fonda Ficticia De La Falla",
    categoriaId: String(categoriaId || 1),
    whatsapp,
    coloniaId: String(coloniaId || 1),
    consentimiento: "on",
    avisoVersion: VERSION_AVISO,
  })) {
    cuerpo.append(k, v);
  }
  return cuerpo;
}

/** Sin el detalle técnico de la falla: ni la dirección, ni el motor, ni la pila. */
function sinDetalleTecnico(html: string, etiqueta: string) {
  for (const prohibido of [/127\.0\.0\.1/, /ECONNREFUSED/, /prisma/i, /postgres/i, /claveFicticiaO1/, /\bat\s+\S+\s+\(/, /stack/i]) {
    expect(html, `${etiqueta} · ${prohibido}`).not.toMatch(prohibido);
  }
}

beforeAll(async () => {
  construirSiHaceFalta();
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  await borrarNegociosSembrados(prisma, WHATSAPP);
  categoriaId = (await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })).id;
  coloniaId = (await prisma.colonia.findFirstOrThrow({ orderBy: { id: "asc" } })).id;
  [caida, sana] = await Promise.all([
    levantarEmulador({ SITIO_URL: "https://enmirumbo.example", DATABASE_URL: BASE_CAIDA, REGISTRO_ENCABEZADO_IP: "x-forwarded-for" }),
    levantarEmulador({ NODE_ENV: "development", SITIO_URL: "https://enmirumbo.example", FOTOS_DIR }),
  ]);
}, 300_000);

afterAll(async () => {
  for (const e of [caida, sana]) e?.detener();
  await borrarNegociosSembrados(prisma, WHATSAPP);
  await prisma.$disconnect();
});

describe("falla del servidor · base caída al abrir el formulario", () => {
  it("GET /registro responde 500 con 'Algo falló de nuestro lado', las cuatro cabeceras y sin detalle técnico", async () => {
    const r = await caida.pedir("/registro");
    expect(r.status).toBe(500);
    lasCuatro(r, "GET /registro");
    expect(r.headers.get("cache-control")).toBe(CACHE_DINAMICO);
    const html = await r.text();
    expect(html).toContain(ALGO_FALLO);
    expect(html).not.toMatch(/<form[\s>]/);
    sinDetalleTecnico(html, "GET /registro");
  });

  it("gracias no consulta la base: responde 200 igual", async () => {
    const r = await caida.pedir("/registro/gracias?verificado=1");
    expect(r.status).toBe(200);
    expect(await r.text()).toContain(MENSAJE_GRACIAS);
  });
});

describe("falla del servidor · base caída al enviar (O1)", () => {
  it("un reporte válido a la ruta de reportar: 500 'Algo falló de nuestro lado', no la 404", async () => {
    const r = await caida.pedir("/negocio/x-cficticio000000000000000001/reportar?_action=reportar", {
      method: "POST",
      body: "motivo=cerrado&comentario=texto%20ficticio",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: caida.base, "x-forwarded-for": "203.0.113.31" },
    });
    expect(r.status).toBe(500);
    lasCuatro(r, "POST reportar");
    expect(r.headers.get("cache-control")).toBe(CACHE_DINAMICO);
    expect(r.headers.getSetCookie()).toEqual([]);
    const html = await r.text();
    expect(html).toContain(ALGO_FALLO);
    expect(html).not.toContain("No encontramos esta página");
    sinDetalleTecnico(html, "POST reportar");
  });

  it("un registro válido a /registro?_action=registrar: 500 'Algo falló de nuestro lado', no la 404, sin escribir", async () => {
    const antes = archivosDelAlmacen();
    const cuerpo = registro(WHATSAPP[0]);
    cuerpo.append("foto", new File([new Uint8Array(await jpegDePrueba(320, 240))], "local.jpg", { type: "image/jpeg" }));
    const r = await caida.pedir("/registro?_action=registrar", { method: "POST", body: cuerpo, headers: { origin: caida.base, "x-forwarded-for": "203.0.113.32" } });
    expect(r.status).toBe(500);
    lasCuatro(r, "POST registrar");
    expect(r.headers.get("cache-control")).toBe(CACHE_DINAMICO);
    expect(r.headers.get("location")).toBeNull();
    expect(r.headers.getSetCookie()).toEqual([]);
    const html = await r.text();
    expect(html).toContain(ALGO_FALLO);
    expect(html).not.toContain("No encontramos esta página");
    expect(html).not.toContain("Fonda Ficticia De La Falla");
    sinDetalleTecnico(html, "POST registrar");
    expect(await prisma.negocio.count({ where: { whatsapp: WHATSAPP[0] } })).toBe(0);
    expect(archivosDelAlmacen()).toBe(antes);
  });
});

describe("falla del servidor · la página de error no ejecuta Actions", () => {
  it("POST /500?_action=registrar con un registro válido no crea ficha ni archivo", async () => {
    const antes = archivosDelAlmacen();
    const cuerpo = registro(WHATSAPP[1]);
    cuerpo.append("foto", new File([new Uint8Array(await jpegDePrueba(320, 240))], "local.jpg", { type: "image/jpeg" }));
    const r = await sana.pedir("/500?_action=registrar", { method: "POST", body: cuerpo, headers: { origin: sana.base } });
    expect(r.status).not.toBe(303);
    expect(r.headers.get("location")).toBeNull();
    expect(r.headers.getSetCookie()).toEqual([]);
    expect(await prisma.negocio.count({ where: { whatsapp: WHATSAPP[1] } })).toBe(0);
    expect(archivosDelAlmacen()).toBe(antes);
  });

  it("y tampoco un reporte por /500?_action=reportar", async () => {
    const antes = await prisma.reporte.count();
    const r = await sana.pedir("/500?_action=reportar", {
      method: "POST",
      body: "motivo=cerrado",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: sana.base },
    });
    expect(r.status).not.toBe(303);
    expect(await prisma.reporte.count()).toBe(antes);
  });
});
