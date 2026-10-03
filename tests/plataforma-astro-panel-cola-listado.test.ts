/**
 * Spec `plataforma-astro` (change `migrar-panel-admin-base-astro`, Fase 5a;
 * tasks.md #7), requirement "La cola y 'Todos los negocios' responden desde
 * Astro el mismo HTML que Next", y los scenarios de `revision-admin` de la
 * cola y del listado, pintados por la SALIDA SERVIDA con PostgreSQL contra
 * `tests/fixtures/next-5a/` (la misma siembra determinista de
 * `tests/panel-astro.ts`).
 *
 * Solo se aceptan las dos normalizaciones de formulario de 3a en el botón
 * "Salir" y la diferencia aceptada de la cabecera de referente.
 *
 * La cola y el listado muestran TODA la base: si otro archivo dejó negocios,
 * estas comparaciones no tendrían sentido, así que antes de cada una se exige
 * la base sin negocios ajenos (hallazgo A1 de 2b) en vez de borrar lo de otros.
 * Todo ficticio: WhatsApp 77199951xx–77199956xx.
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { NORMALIZACIONES_FORMULARIO } from "../scripts/diff-html/nucleo.mjs";
import { PANTALLAS_DEL_LISTADO, compararPantallaDelPanel } from "../scripts/diff-html/panel.mjs";
import type { PrismaClient } from "../src/generated/prisma/client";
import { VARIABLE_CONTRASENA, VARIABLE_SECRETO_SESION } from "../src/lib/admin/config";
import { PORPAGINA_LISTADO } from "../src/lib/admin/listado-parametros";
import { TEXTO_FILTRO_SIN_RESULTADOS, TEXTO_LISTADO_VACIO } from "../src/lib/admin/textos";
import { crearClientePrueba } from "./db";
import { borrarIntentos, borrarLoDe5a, cookieDeSesion, cuantosDe5a, intentosDe, sembrarCola, sembrarListado } from "./panel-astro";
import { type Emulador, construirSiHaceFalta, levantarEmulador } from "./salida-astro";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FIXTURES = path.join(raiz, "tests/fixtures/next-5a");
const MEDIDO = JSON.parse(readFileSync(path.join(FIXTURES, "respuestas.json"), "utf8"));
const CONTRASENA = `clave-ficticia-${randomBytes(6).toString("hex")}`;
const SECRETO = randomBytes(32).toString("hex");
const PANEL = { [VARIABLE_CONTRASENA]: CONTRASENA, [VARIABLE_SECRETO_SESION]: SECRETO, REGISTRO_ENCABEZADO_IP: "x-forwarded-for", SITIO_URL: "https://enmirumbo.example" };
const IP = "192.0.2.250";

let prisma: PrismaClient;
let astro: Emulador;

beforeAll(async () => {
  construirSiHaceFalta();
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  await borrarLoDe5a(prisma);
  astro = await levantarEmulador(PANEL);
}, 300_000);

afterAll(async () => {
  astro?.detener();
  await borrarLoDe5a(prisma);
  await borrarIntentos(prisma, [IP], SECRETO);
  expect(await cuantosDe5a(prisma)).toBe(0);
  await prisma.$disconnect();
});

/** La base sin negocios de nadie más (si no, la cola y el listado no se pueden comparar). */
async function baseSinAjenos() {
  const ajenos = await prisma.negocio.count();
  expect(ajenos, "otro archivo dejó negocios en la base compartida").toBe(0);
}

const fixture = (nombre: string) => readFileSync(path.join(FIXTURES, nombre), "utf8").replace(/>\n</g, "><");

async function documento(ruta: string, cookie: string | undefined = cookieDeSesion("vigente", SECRETO)) {
  const r = await astro.pedir(ruta, { headers: cookie ? { cookie } : {} });
  return { status: r.status, headers: Object.fromEntries(r.headers), cuerpo: await r.text() };
}

function comparar(nombre: string, ruta: string, a: Awaited<ReturnType<typeof documento>>, aplicadas?: string[]) {
  const medido = MEDIDO.pantallas[nombre];
  const next = {
    status: medido.status,
    headers: {
      "content-type": medido["content-type"],
      "cache-control": medido["cache-control"],
      "referrer-policy": medido["referrer-policy"],
      "x-content-type-options": medido["x-content-type-options"],
      "x-frame-options": medido["x-frame-options"],
      "content-security-policy": a.headers["content-security-policy"],
    },
    cuerpo: fixture(nombre),
  };
  return compararPantallaDelPanel(ruta, next, a, {
    dinamica: true,
    ...(aplicadas ? { formulario: { urlPagina: new URL(ruta, astro.base).toString(), aplicadas } } : {}),
  });
}

const renglones = (html: string) => (html.match(/<article /g) ?? []).length;

describe("cola · igual a la de hoy", () => {
  it("con la base vacía", async () => {
    await baseSinAjenos();
    const aplicadas: string[] = [];
    const a = await documento("/admin/cola");
    expect(comparar("cola-vacia.html", "/admin/cola", a, aplicadas)).toEqual([]);
    expect(new Set(aplicadas)).toEqual(new Set(NORMALIZACIONES_FORMULARIO.map((x) => x.id)));
    expect(a.cuerpo).not.toMatch(/<script|astro-island|modulepreload/);
  });

  it("con altas, edición, despublicada, atrasada, al día, verificada por SMS y dos negocios reportados", async () => {
    await baseSinAjenos();
    await sembrarCola(prisma);
    try {
      const aplicadas: string[] = [];
      const a = await documento("/admin/cola");
      expect(comparar("cola.html", "/admin/cola", a, aplicadas)).toEqual([]);
      expect(new Set(aplicadas)).toEqual(new Set(NORMALIZACIONES_FORMULARIO.map((x) => x.id)));
      // "Salir" es un formulario nativo hacia su Action en la cola.
      expect(a.cuerpo).toMatch(/<form action="\?_action=salir" method="post">/);
    } finally {
      await borrarLoDe5a(prisma);
    }
  });
});

describe("listado · igual al de hoy", () => {
  it("vacío", async () => {
    await baseSinAjenos();
    const a = await documento("/admin/negocios");
    expect(comparar("negocios-vacio.html", "/admin/negocios", a)).toEqual([]);
    expect(a.cuerpo).toContain(TEXTO_LISTADO_VACIO);
  });

  it("con 60 registros y cada ?estado= y ?pagina= manoseado", async () => {
    await baseSinAjenos();
    await sembrarListado(prisma, 60);
    try {
      for (const [nombre, ruta] of PANTALLAS_DEL_LISTADO) {
        const a = await documento(ruta);
        expect(comparar(nombre, ruta, a), ruta).toEqual([]);
        expect(a.cuerpo, ruta).not.toMatch(/<script|astro-island|modulepreload|<form/);
        // Ningún renglón trae WhatsApp, teléfono, dirección, foto ni motivo.
        expect(a.cuerpo, ruta).not.toMatch(/7719995[2-6]\d\d|wa\.me|<img|Motivo ficticio|tel:/);
      }
      const p99 = await documento("/admin/negocios?pagina=99");
      expect(p99.cuerpo).not.toContain(TEXTO_LISTADO_VACIO);
      expect(p99.cuerpo).not.toContain(TEXTO_FILTRO_SIN_RESULTADOS);
      expect(renglones(p99.cuerpo)).toBe(0);
    } finally {
      await borrarLoDe5a(prisma);
    }
  });

  it("el HTML no crece con la base: 30 contra 500 registros dan 25 renglones y un tamaño equivalente", async () => {
    await baseSinAjenos();
    try {
      await sembrarListado(prisma, 30);
      const treinta = await documento("/admin/negocios");
      await borrarLoDe5a(prisma);
      await sembrarListado(prisma, 500);
      const quinientos = await documento("/admin/negocios");
      expect(renglones(treinta.cuerpo)).toBe(PORPAGINA_LISTADO);
      expect(renglones(quinientos.cuerpo)).toBe(PORPAGINA_LISTADO);
      expect(Math.abs(quinientos.cuerpo.length - treinta.cuerpo.length) / treinta.cuerpo.length).toBeLessThan(0.02);
    } finally {
      await borrarLoDe5a(prisma);
    }
  }, 120_000);
});

describe("listado · nada se escribe desde el listado", () => {
  it("POST, PUT y DELETE, con sesión y sin ella, con ?_action=entrar|salir|aprobar: ningún registro cambia, ningún intento", async () => {
    await baseSinAjenos();
    await sembrarListado(prisma, 6);
    try {
      const antes = JSON.stringify(await prisma.negocio.findMany({ orderBy: { id: "asc" } }));
      const nombres = Array.from({ length: 6 }, (_, i) => `Negocio Ficticio Del Listado ${String(i).padStart(3, "0")}`);
      for (const metodo of ["POST", "PUT", "DELETE"]) {
        for (const accion of ["", "?_action=entrar", "?_action=salir", "?_action=aprobar"]) {
          for (const conSesion of [false, true]) {
            const r = await astro.pedir(`/admin/negocios${accion}`, {
              method: metodo,
              body: `contrasena=${CONTRASENA}&estado=publicado`,
              headers: {
                origin: astro.base,
                "content-type": "application/x-www-form-urlencoded",
                "x-forwarded-for": IP,
                ...(conSesion ? { cookie: cookieDeSesion("vigente", SECRETO) } : {}),
              },
            });
            const cuerpo = await r.text();
            const etiqueta = `${metodo} ${accion || "(sin Action)"} ${conSesion ? "con" : "sin"} sesión`;
            expect(r.status, etiqueta).not.toBe(500);
            expect(r.headers.getSetCookie(), etiqueta).toEqual([]);
            // Sin sesión, o con un envío de Action (solo un POST con `?_action=` lo
            // es, en Astro como en Next), ningún dato: la redirección o la 404.
            // Con sesión, cualquier otra forma pinta el listado, como Next con
            // cualquier método (medido en la tarea 2; ver b-dev.md).
            const esEnvioDeAccion = metodo === "POST" && accion !== "";
            if (!conSesion || esEnvioDeAccion) for (const nombre of nombres) expect(cuerpo, etiqueta).not.toContain(nombre);
            else expect(cuerpo, etiqueta).toContain(nombres[0]);
          }
        }
      }
      expect(JSON.stringify(await prisma.negocio.findMany({ orderBy: { id: "asc" } }))).toBe(antes);
      expect(await intentosDe(prisma, IP, SECRETO)).toBe(0);
    } finally {
      await borrarLoDe5a(prisma);
    }
  });
});
